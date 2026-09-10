import type {PoolConnection} from 'mysql2/promise';
import {recordAchievement,type AchievementFact} from './achievement-events';
import {updateAchievementState} from './achievement-state';
const parse=(v:any)=>typeof v==='string'?JSON.parse(v):v??{};
const evidence=(m:any)=>parse(m.cooldowns).__rules?.memory?.achievement??{};
const contributed=(m:any)=>!m.npc_code&&m.stamina_eligible&&(Number(evidence(m).damage)>0||Number(evidence(m).healed)>0||Number(evidence(m).playerSupport)>0);
const colors=(e:any)=>new Set((e.elements??[]).filter((v:string)=>v!=='无')).size;
export const surpriseVictoryFacts=(m:any,members:any[],bosses:any[]):AchievementFact[]=>{
 const eligible=bosses.filter(b=>Number(b.level)>=Number(m.level));if(!eligible.length||!contributed(m))return [];
 const e=evidence(m),hp=Number(m.current_hp),max=Number(m.hp_max),mp=Number(m.current_mp),solo=members.length===1,ids:string[]=[];
 if(solo&&hp>0&&max>0){
  if(hp===max&&mp===0)ids.push('ACH_EGG17');
  if(Number(e.actualHpLost)>=max*10)ids.push('ACH_EGG18');
  if(colors(e)>=6&&Number(e.receivedHits)>=30)ids.push('ACH_EGG22');
  if(hp===1&&mp===0)ids.push('ACH_EGG23');
  if(Number(e.receivedHits)>=100&&Number(m.mp_max)>0&&mp===Number(m.mp_max))ids.push('ACH_EGG24');
 }
 if(members.filter(p=>!p.npc_code).length>=2&&max>0){
  if(Number(e.damage)===0&&Number(e.healed)>=max*20)ids.push('ACH_EGG19');
  if(Number(e.damage)===0&&Number(e.healed)>=max*5&&e.lowHeal)ids.push('ACH_EGG25');
  if(hp<=0&&eligible.some(b=>Number(b.hp_max)>0&&Number(e.damage)>=Number(b.hp_max)*.5))ids.push('ACH_EGG26');
  if(colors(e)>=6&&Number(e.healed)>=max*5)ids.push('ACH_EGG28');
 }
 if(members.length>=3&&members.every(contributed)&&eligible.some(b=>Number(b.level)>=Math.max(...members.map(p=>Number(p.level))))){
  const living=members.filter(p=>Number(p.current_hp)>0);
  if(living.length===1&&hp>0)ids.push('ACH_EGG20');
  if(living.length===members.length&&members.every(p=>Number(p.current_mp)===0))ids.push('ACH_EGG21');
  if(members.every(p=>Number(p.current_hp)===1))ids.push('ACH_EGG27');
 }
 return ids.map(metric=>({metric}));
};
export const surpriseDefeatFacts=(m:any,members:any[],bosses:any[]):string[]=>{
 if(m.npc_code||!m.stamina_eligible||Number(m.current_hp)>0)return [];
 const eligible=bosses.filter(b=>Number(b.level)>=Number(m.level));if(!eligible.length)return [];
 const e=evidence(m),max=Number(m.hp_max),ids:string[]=[];
 if(members.length===1){
  if(eligible.some(b=>Number(b.hp_max)>0&&Number(b.current_hp)===1&&Number(e.damage)>=Number(b.hp_max)*.5))ids.push('ACH_EGG29');
  if(colors(e)>=6&&Number(e.damage)>0)ids.push('ACH_EGG30');
  if(Number(e.receivedHits)>=100)ids.push('ACH_EGG31');
  if(max>0&&Number(e.actualHpLost)>=max*10)ids.push('ACH_EGG32');
  if(Number(m.mp_max)>0&&Number(m.current_mp)===Number(m.mp_max)&&Number(e.damage)===0&&eligible.some(b=>Number(b.level)<=Number(m.level)+2&&Number(b.hp_max)>0&&Number(b.current_hp)===Number(b.hp_max)&&e.bossOpeningKnockout===`target:${b.id}`))ids.push('ACH_EGG34');
 }
 if(members.filter(p=>!p.npc_code).length>=2&&max>0&&Number(e.healed)>=max*20)ids.push('ACH_EGG33');
 return ids;
};
export const achievementAlchemySurprises=async(c:PoolConnection,id:number,event:string,signature:string,successes:number,exploded:boolean,great:number)=>updateAchievementState(c,id,'alchemy_surprises',event,false,state=>{
 const recipes=state.recipes??={},recipe=recipes[signature]??={explosions:0,successes:0};const facts:AchievementFact[]=[];
 if(exploded&&successes===0){state.streak=Number(state.streak??0)+1;recipe.explosions++;facts.push({metric:'ACH_EGG37'});}else state.streak=0;
 if(state.streak>=5)facts.push({metric:'ACH_EGG35'});
 if(great>0){facts.push({metric:'ACH_EGG38',value:great});if(recipe.explosions>=50)facts.push({metric:'ACH_EGG36'});}
 if(successes>0){recipe.successes+=successes;facts.push({metric:'ACH_EGG39',distinct:signature},{metric:'ACH_EGG40',maximum:true,value:recipe.successes});}
 recordAchievement(c,id,facts,'alchemy-surprises:'+event);
});
export const achievementGatherSurprises=async(c:PoolConnection,id:number,spawn:number,item:number,region:number)=>updateAchievementState(c,id,'gather_surprises',String(spawn),false,state=>{
 const regions=state.regions??={},items=state.items??={};regions[region]=Number(regions[region]??0)+1;items[item]=Number(items[item]??0)+1;
 const facts:AchievementFact[]=[{metric:'ACH_EGG44',maximum:true,value:items[item]}];if(regions[region]>=100)facts.push({metric:'ACH_EGG43',distinct:String(region)});
 recordAchievement(c,id,facts,'gather-surprises:'+spawn);
});
