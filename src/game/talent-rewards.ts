import { recordAchievement } from './achievement-events';
import { randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { ownedTalent, readTalentData, saveTalentData, talentDay, talentWhole, type TalentData } from './talent-data';
import { queueTalentReview } from './talent-review';
export type TalentRewardContext = { notice?: {text?:string}; kind?: 'combat'|'production'|'exploration'|'social'|'quest'; key?: string; npc?: string; remaining?: number; parts?: {key:string;amount:number;eligible:boolean}[]; derived?: boolean };
const queue = (data: TalentData, kind: string, seconds: number, payload: Record<string,any>) => {
  const id=randomUUID(); data.jobs.push({id,kind,created:Date.now(),ready:Date.now()+seconds*1000,payload});return id;
};
export const talentExperience = async (connection:PoolConnection,id:number,base:number,context:TalentRewardContext={}) => {
  if(base<=0||context.derived)return base;
  const talent=await ownedTalent(connection,id);if(!talent)return base;
  const data=await readTalentData(connection,id),day=talentDay(),code=talent.number;
  let amount=base;
  if(code==='C01')amount*=1.75;
  if(code==='C02'&&context.kind==='combat'&&context.parts?.length){
    const total=context.parts.reduce((n,p)=>n+p.amount,0);let adjusted=0;
    for(const part of context.parts){const key=`enemy:${day}:${part.key}`,used=data.counters[key]??0;adjusted+=part.amount*(part.eligible&&used<3?3:1);if(part.eligible)data.counters[key]=used+1;}
    if(total>0)amount*=adjusted/total;
  }
  if(code==='C03'){
    const reserved=data.jobs.filter(j=>j.kind==='experience').reduce((n,j)=>n+Number(j.payload.amount),0);
    const accepted=Math.max(0,Math.min(base,Math.floor((Number(context.remaining??0)-reserved)/2)));
    if(accepted>0)queue(data,'experience',1800,{amount:accepted*2});
    data.flags.experienceNotice=`研习账本收存本金${accepted}，30分钟后可领取${accepted*2}经验。${accepted<base?'已达当前合法成长容量，超出部分不收存，不能跨境囤积。':''}`;
    if(context.notice)context.notice.text=data.flags.experienceNotice;
    amount=0;
  }
  if(code==='C05'&&['exploration','production','social'].includes(context.kind??''))amount*=2.5;
  if(code==='C06'&&context.kind==='combat'&&context.parts?.some(p=>p.eligible&&p.key===data.flags.defeatSpecies)){
    const key=`revenge:${day}`;
    if((data.counters[key]??0)<3){
      const total=context.parts.reduce((n,p)=>n+p.amount,0);
      const matching=context.parts.find(p=>p.eligible&&p.key===data.flags.defeatSpecies);
      if(total>0&&matching){amount*=1+3*matching.amount/total;data.counters[key]=(data.counters[key]??0)+1;delete data.flags.defeatSpecies;}
    }
  }
  if(code==='C07'){
    const countKey=`insightCount:${context.kind??'quest'}`,sumKey=`insightSum:${context.kind??'quest'}`,n=data.counters[countKey]??0,sum=data.counters[sumKey]??0;
    if(n>=4){amount+=Math.min(base*6,sum/4*6);data.counters[countKey]=0;data.counters[sumKey]=0;}
    else {data.counters[countKey]=n+1;data.counters[sumKey]=sum+base;}
  }
  if(code==='C09'&&context.npc){const key=`firstNpc:${context.npc}`;amount*=data.flags[key]?1.5:4;data.flags[key]=true;}
  if(code==='C10'&&context.kind==='combat'){
    queueTalentReview(data,{kind:'experience',amount:base*1.5,workSeconds:300});
  }
  const granted=talentWhole(data,'experience',amount,1);await saveTalentData(connection,id,data);return granted;
};

export type TalentProductionContext={profession:string;recipe?:string;successfulBase?:number;derived?:boolean};
export const talentProficiency = async(connection:PoolConnection,id:number,base:number,context:TalentProductionContext)=>{
  if(base<=0||context.derived)return base;
  const talent=await ownedTalent(connection,id);if(!talent)return base;
  const data=await readTalentData(connection,id),code=talent.number;
  if(data.jobs.some(j=>j.payload.working))throw new Error('调查或复盘中不能同时进行生产，请先结束当前活动。');
  const recipe=context.recipe??String(data.flags.productionRecipe??context.profession);
  const successful=Math.max(0,context.successfulBase??Number(data.flags.productionSuccessBase??base));
  let result=base;
  if(code==='C01')result*=2.5;
  if(code==='E02'&&['blacksmith','alchemist'].includes(context.profession))result+=successful*2;
  if(code==='E06'&&data.flags.productionAutomaton)result+=successful*2;
  if(code==='C04'&&successful>0&&(context.recipe||data.flags.productionRecipe)){
    const previous=String(data.flags.crossRecipe??'');
    result+=successful*(previous&&previous!==recipe?3:.5);
    data.flags.crossRecipe=recipe;
  }
  if(code==='C08'){
    const key=`recipe:${talentDay()}`;
    if(successful>0&&!data.flags[key])data.flags[key]=recipe;
    if(successful>0&&data.flags[key]&&data.flags[key]!==recipe)data.flags[`${key}:closed`]=true;
    if(data.flags[key]===recipe&&!data.flags[`${key}:closed`])result+=successful*2.5;
  }
  if(code==='E07'&&context.profession==='blacksmith'&&successful>0&&recipe.startsWith('forge:')){
    const key=`runes:${recipe}`;result+=data.counters[key]??0;data.counters[key]=data.flags.productionOrdinary===false?0:successful*3;
  }
  if(code==='C10'&&successful>0){
    const payload={kind:'proficiency',profession:context.profession,amount:successful*2.5,workSeconds:300};
    queueTalentReview(data,payload);
  }
  const granted=talentWhole(data,`proficiency:${context.profession}`,result,1);
  delete data.flags.productionSuccessBase;delete data.flags.productionAutomaton;delete data.flags.productionRecipe;delete data.flags.productionOrdinary;
  await saveTalentData(connection,id,data);return granted;
};

export const talentNpcAffinity = async(connection:PoolConnection,id:number,npc:string,base:number,kind:'gift'|'chat'|'meal'|'quest'|'other',crafted=false)=>{
  if(base<=0)return base;
  const achievementNpc:Record<string,string>={alchemy_sweetshop:'ACH_F10',blacksmith:'ACH_F11',oddworkshop:'ACH_F12',bookshop:'ACH_F13'};
  if(achievementNpc[npc])recordAchievement(connection,id,[achievementNpc[npc]]);
  const talent=await ownedTalent(connection,id);if(!talent)return base;
  const data=await readTalentData(connection,id);let f=1;
  if(talent.number==='D03'&&kind==='gift')f=3;
  if(talent.number==='I06'&&kind==='chat')f=3;
  if(talent.number==='F08'){const key=`contact:${npc}`;if((data.counters[key]??0)<5)f=4;data.counters[key]=(data.counters[key]??0)+1;}
  if(talent.number==='D05'&&kind==='meal'){const key=`meal:${talentDay()}:${npc}`;if(!data.flags[key])f=4;data.flags[key]=true;}
  if(talent.number==='D08'&&kind==='gift'&&crafted)f=5;
  if(talent.number==='D06'&&Number(data.counters[`introduced:${npc}`]??0)>0){f=5;data.counters[`introduced:${npc}`]--;}
  const result=talentWhole(data,`affinity:${npc}`,base,f);await saveTalentData(connection,id,data);return result;
};

export const talentIntimacy = async(connection:PoolConnection,id:number,companionId:number,base:number)=>{
  if(base<=0)return base;
  const talent=await ownedTalent(connection,id);if(!talent)return base;
  const data=await readTalentData(connection,id);
  const factor=talent.number==='D02'?3:talent.number==='D10'?Number(data.settings.companion)===companionId?4:.75:1;
  const result=talentWhole(data,`intimacy:${companionId}`,base,factor);await saveTalentData(connection,id,data);return result;
};
export const talentProductionRecord = async(connection:PoolConnection,id:number,recipe:string,successfulBase?:number,automaton=false,ordinary=true)=>{
  const data=await readTalentData(connection,id);data.flags.productionRecipe=recipe;
  if(successfulBase!==undefined)data.flags.productionSuccessBase=successfulBase;
  data.flags.productionAutomaton=automaton;data.flags.productionOrdinary=ordinary;await saveTalentData(connection,id,data);
};

export const ordinaryTalentItem = (item:Record<string,any>) => item.rarity==='普通' && !item.is_unique && !item.boss_source && !item.quest_bound && !['货币','任务','剧情','特殊','核心','粒子','Boss部件','育成','世界印记','稀有锻材'].includes(String(item.item_category));
export const talentCraftMultiplier = async(connection:PoolConnection,id:number,item:Record<string,any>)=>{
  if(!ordinaryTalentItem(item))return 1;
  const talent=await ownedTalent(connection,id),data=await readTalentData(connection,id);
  if(talent?.number==='H09'&&data.settings.riskCraft)return 4;
  const effect=typeof item.effect_json==='string'?JSON.parse(item.effect_json):item.effect_json??{};
  if(talent?.number==='E08'&&item.item_type==='consumable'&&(effect.heal||effect.healPct||effect.restoreMp||effect.restoreMpPct)&&!effect.throwable&&!effect.status)return 3.5;
  return 1;
};
