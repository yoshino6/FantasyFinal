import { surpriseVictoryFacts } from './achievement-surprise';
import { achievementBattlePeers, achievementCraftedWeaponUsed, achievementInstanceVictory } from './achievement-state';
import { achievementBattleOutcome } from './achievement-easter';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { RuleUnit } from './combat-rule-registry';
import { recordAchievement, isCooperativeAchievement, type AchievementFact } from './achievement-events';
import { achievementActivity } from './achievement-hooks';
import { ensureBossAchievement, achievementBossTargets } from './achievement-boss';
type Evidence={damage:number;kills:string[];elements:string[];crit:boolean;dodged:boolean;shield:boolean;received:number;receivedHits:number;healed:number;lowHeal:boolean;cleansedDot?:boolean;interrupted?:boolean;brokeShield?:boolean;friendlyDamage?:boolean;receivedActions?:string[];playerSupport?:number;actualHpLost?:number;bossOpeningKnockout?:string;componentHits?:string[];defeatSequence?:string[];actionKinds?:string[];contributionActions?:string[];dotKills?:string[];normalAttackDamage?:boolean};
export const achievementBattleEvidence=(unit:RuleUnit):Evidence=>{
  const memory=unit.state.memory as Record<string,any>;
  return memory.achievement??=( {damage:0,kills:[],elements:[],crit:false,dodged:false,shield:false,received:0,receivedHits:0,healed:0,lowHeal:false} );
};
export const achievementBattleAction=(unit:RuleUnit,kind:'attack'|'defend'|'support')=>{
 const actions=achievementBattleEvidence(unit).actionKinds??=[];
 if(!actions.includes(kind))actions.push(kind);
};
export const achievementBattleContribution=(unit:RuleUnit,kind:'defend'|'support')=>{
 const action=Number(unit.state.memory.achievementAction??0);if(action<=0)return;
 const evidence=achievementBattleEvidence(unit),seen=evidence.contributionActions??=[],key=`${kind}:${action}`;
 if(!seen.includes(key))seen.push(key);
};
export const achievementHit=(source:RuleUnit,target:RuleUnit,damage:number,element:string,absorbed:number,loss?:any)=>{
  if(source.side===target.side){if(damage>0)achievementBattleEvidence(target).friendlyDamage=true;return;}
  if(damage<=0&&absorbed<=0)return;
  const from=achievementBattleEvidence(source),to=achievementBattleEvidence(target);
  const action=Number(source.state.memory.achievementAction??0);
  if(action>0){const actions=to.receivedActions??=[];const key=source.key+':'+action;if(!actions.includes(key))actions.push(key);}
  if(typeof loss==='string')loss=JSON.parse(loss);
  const actual=loss?.source===source.key?Math.max(0,Number(loss.hpBefore)-Number(loss.hpAfter)):Math.max(0,damage-absorbed);
  if(actual>0&&Number(source.state.memory.achievementNormalAttackAction??0)===action)from.normalAttackDamage=true;
  if(source.boss&&loss?.source===source.key&&loss.turn===1&&loss.action===1&&loss.hpBefore>=target.hpMax&&loss.hpAfter<=0&&target.hp<=0&&damage>0)to.bossOpeningKnockout=source.key;
  from.damage+=actual;to.received+=actual;to.receivedHits++;
  if(source.side!==target.side)to.actualHpLost=Number(to.actualHpLost??0)+actual;
  if(absorbed>0)to.shield=true;
  if(actual>0&&!from.elements.includes(element))from.elements.push(element);
  if(actual>0&&target.hp<=0&&!from.kills.includes(target.key))from.kills.push(target.key);
  if(actual>0){
    const root=String(target.state.memory.achievementComponentRoot??'');
    const mark=root?`${target.key}|${root}`:target.key;
    if(root){const hits=from.componentHits??=[];if(!hits.includes(mark))hits.push(mark);}
    if(target.hp<=0){const sequence=from.defeatSequence??=[];if(!sequence.includes(mark))sequence.push(mark);}
  }
};
/** 只认可攻击者本人对部位造成的实际扣血，以及其后本人击杀对应本体。 */
export const componentVictoryFacts=(evidence:Evidence,bossKeys:Set<string>):AchievementFact[]=>{
 const marks=(evidence.componentHits??[]).filter(mark=>bossKeys.has(mark.split('|')[1]??''));
 const facts:AchievementFact[]=[];
 if(new Set(marks).size>=2)facts.push({metric:'ACH_B22'});
 const sequence=evidence.defeatSequence??[];
 if(sequence.some((mark,index)=>{
   const root=mark.split('|')[1];
   return Boolean(root)&&bossKeys.has(root)&&sequence.slice(index+1).includes(root);
 }))facts.push({metric:'ACH_B23'});
 return facts;
};
export const achievementCombatObserved=(c:PoolConnection,sessionId:string,members:Record<string,any>[])=>{
  for(const member of members.filter(m=>!m.npc_code)){
    const cooldowns=typeof member.cooldowns==='string'?JSON.parse(member.cooldowns):member.cooldowns;
    const e:Evidence|undefined=cooldowns?.__rules?.memory?.achievement;if(!e)continue;
    const facts:string[]=[];
    if(e.crit)facts.push('ACH_C01');if(e.dodged)facts.push('ACH_C02');if(e.shield)facts.push('ACH_C04');if(e.lowHeal)facts.push('ACH_C05');
    if(e.cleansedDot)facts.push('ACH_C07');if(e.interrupted)facts.push('ACH_C08');if(e.brokeShield)facts.push('ACH_C10');
    if(facts.length)recordAchievement(c,Number(member.id),facts,`observed:${sessionId}:${facts.join(',')}`);
  }
};
export const achievementCombatVictory=async(c:PoolConnection,sessionId:string,members:Record<string,any>[],targets:Record<string,any>[])=>{
  if(!targets.length)return;
  const bosses=await achievementBossTargets(c,targets);
  await achievementBattleOutcome(c,sessionId,'victory',members,targets,bosses);
  const isBoss=(target:Record<string,any>)=>bosses.includes(target);
  const parse=(v:any)=>typeof v==='string'?JSON.parse(v):v??{};
  const state=(m:Record<string,any>):Evidence|undefined=>parse(m.cooldowns).__rules?.memory?.achievement;
  // 伤害、实际治疗和对队友实际生效的护盾都属于贡献；空放、单纯防御与自身效果不计。
  const contributors=members.filter(m=>!m.npc_code&&m.stamina_eligible&&((state(m)?.damage??0)>0||(state(m)?.healed??0)>0||(state(m)?.playerSupport??0)>0));
  await achievementBattlePeers(c,sessionId,contributors.filter(m=>targets.some(t=>Number(t.level)>=Math.max(1,Math.ceil(Number(m.level)*.8)))).map(m=>Number(m.id)));
  const recordVictory=(memberId:number,facts:AchievementFact[])=>recordAchievement(c,memberId,facts.map(f=>isCooperativeAchievement(f.metric)?{...f,cooperationKey:`battle:${sessionId}`}:f),`battle:${sessionId}`);
  const bossFacts:AchievementFact[]=[];
  // 首领首通至少须由一名真人产生有效贡献，避免全员旁观时凭胜利结果创建定义或达成。
  if(contributors.length)for(const target of bosses){const bossId=await ensureBossAchievement(c,target);if(bossId)bossFacts.push({metric:bossId});}
  const playerMembers=members.filter(member=>!member.npc_code);
  // 单人沿用有效贡献门槛；多人队伍由任一有效贡献者成立后，同场全部真人成员共享首通。
  const bossRecipients=bossFacts.length&&playerMembers.length>=2?playerMembers:contributors;
  const bossRecipientIds=new Set(bossRecipients.map(member=>Number(member.id)));
  const [regions]=await c.execute<RowDataPacket[]>('SELECT r.name FROM combat_sessions s JOIN characters c ON c.id=s.character_id JOIN map_regions r ON r.id=c.current_region_id WHERE s.id=?',[sessionId]);
  const regionNames=['幽暗密林','幽暗密林深处','砾风石滩','岩脊山麓','赤铁山道','雾藻湿地','沉星沼泽','霜冠高原','雷鸣断崖','月蚀遗迹'];
  for(const member of contributors){
    const evidence=state(member)!;const facts:AchievementFact[]=surpriseVictoryFacts(member,members,bosses);
    facts.push(...componentVictoryFacts(evidence,new Set(bosses.map(b=>`target:${b.id}`))));
    if(members.length===1&&Number(member.current_hp)>0&&Number(evidence.actualHpLost??0)===0&&targets.some(target=>Number(parse(target.cooldowns).__rules?.memory?.achievementAction??0)>0)&&targets.some(target=>Number(target.level)>=Number(member.level)))facts.push({metric:'ACH_C17'});
    if(['attack','defend','support'].every(kind=>(evidence.actionKinds??[]).includes(kind)))facts.push({metric:'ACH_C19'});
    if(bosses.length&&Number(member.current_hp)>0&&(evidence.contributionActions??[]).length>=3)facts.push({metric:'ACH_C25'});
    const equalBoss=bosses.some(b=>Number(b.level)>=Number(member.level));
    if(equalBoss&&Number(member.current_hp)>0){
      if(members.length===1&&Number(member.current_hp)===1)facts.push({metric:'ACH_EGG03'});
      if(members.length===1&&Number(member.current_mp)===0&&Number(member.hp_max)>0&&Number(member.current_hp)<=Number(member.hp_max)*.1)facts.push({metric:'ACH_EGG15'});
      if(members.length===1&&Number(member.current_hp)===1&&Number(member.current_mp)===1)facts.push({metric:'ACH_EGG16'});
      if(new Set(evidence.elements.filter(element=>element!=='无')).size>=6)facts.push({metric:'ACH_EGG04'});
      if(members.length===1&&evidence.receivedHits>=30)facts.push({metric:'ACH_EGG06'});
    }
    if(members.length>=3&&contributors.length===members.length&&members.every(m=>!m.npc_code&&Number(m.current_hp)>0&&Number(m.hp_max)>0&&Number(m.current_hp)<=Number(m.hp_max)*.1)&&bosses.some(b=>Number(b.level)>=Math.max(...members.map(m=>Number(m.level)))))facts.push({metric:'ACH_EGG05'});

    const valid=targets.filter(t=>Number(t.level)>=Math.max(1,Math.ceil(Number(member.level)*.8)));
    if(evidence.kills.some(key=>targets.some(t=>key===`target:${t.id}`)))facts.push({metric:'ACH_B01'});
    if(bossRecipientIds.has(Number(member.id)))facts.push(...bossFacts);
    if(contributors.some(other=>Number(other.id)!==Number(member.id)&&Number(member.level)>=Number(other.level)+3&&targets.some(t=>Number(t.level)===Number(other.level))))facts.push({metric:'ACH_G11'});
    if(!valid.length){recordVictory(Number(member.id),facts);continue;}
    const [weapons]=await c.execute<RowDataPacket[]>("SELECT pe.instance_id FROM player_equipment pe JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id JOIN item_definitions i ON i.id=ii.item_id WHERE pe.character_id=? AND i.item_category='武器'",[member.id]);
    for(const weapon of weapons)await achievementInstanceVictory(c,Number(member.id),Number(weapon.instance_id),sessionId,'ACH_I15');
    if(evidence.normalAttackDamage)for(const weapon of weapons)await achievementCraftedWeaponUsed(c,Number(member.id),Number(weapon.instance_id),sessionId);
    const [companions]=await c.execute<RowDataPacket[]>('SELECT id FROM player_companions WHERE character_id=? AND is_out=1 AND released_at IS NULL FOR UPDATE',[member.id]);
    for(const companion of companions)await achievementInstanceVictory(c,Number(member.id),Number(companion.id),sessionId,'ACH_G23');
    for(const metric of ['ACH_B02','ACH_B03','ACH_B04','ACH_B05','ACH_END01','ACH_END02'])facts.push({metric});
    for(const target of valid){const key=String(target.template_id);facts.push({metric:'ACH_B10',distinct:key},{metric:'ACH_B11',distinct:key});if(target.monster_class==='elite')facts.push({metric:'ACH_B06'},{metric:'ACH_B07',distinct:String(target.id)},{metric:'ACH_END04',distinct:String(target.id)});if(isBoss(target))facts.push({metric:'ACH_B08'},{metric:'ACH_B09',distinct:key});}
    const regionIndex=regionNames.indexOf(String(regions[0]?.name));if(regionIndex>=0)facts.push({metric:`ACH_B${String(regionIndex+12).padStart(2,'0')}`});
    if(evidence.crit)facts.push({metric:'ACH_C01'});if(evidence.dodged)facts.push({metric:'ACH_C02'});if(evidence.shield)facts.push({metric:'ACH_C04'});if(evidence.lowHeal)facts.push({metric:'ACH_C05'});
    if(Number(member.current_hp)>0&&Number(member.hp_max)>0&&Number(member.current_hp)<=Number(member.hp_max)*.1&&!evidence.friendlyDamage)facts.push({metric:'ACH_C15'});
    if(valid.length>=3)facts.push({metric:'ACH_C13'});
    if(valid.some(t=>Number(t.level)>=Number(member.level)+2))facts.push({metric:'ACH_C14'});
    if(evidence.elements.length>=2)facts.push({metric:'ACH_C22'});
    if((evidence.dotKills??[]).some(key=>valid.some(target=>key===`target:${target.id}`)))facts.push({metric:'ACH_C11'});
    if(contributors.length>=2){facts.push({metric:'ACH_G02'},{metric:'ACH_G03'},{metric:'ACH_G04'},{metric:'ACH_END03'});if(valid.some(isBoss))facts.push({metric:'ACH_G07'});}
    if(contributors.length>=2&&bosses.length&&members.filter(m=>!m.npc_code).every(m=>Number(m.current_hp)>0))facts.push({metric:'ACH_G08'});
    if(contributors.length>=2&&(evidence.playerSupport??0)>=3)facts.push({metric:'ACH_G09'});

    if(contributors.length>=3)facts.push({metric:'ACH_G06'});
    if((evidence.receivedActions?.length??0)>=3&&Number(member.current_hp)>0)facts.push({metric:'ACH_G10'});
    recordVictory(Number(member.id),facts);achievementActivity(c,Number(member.id));
  }
  // 零贡献的同队真人只共享首领首通；普通战斗、活动与彩蛋成就仍须走各自的实际行为判定。
  for(const member of bossRecipients){
    if(contributors.some(contributor=>Number(contributor.id)===Number(member.id)))continue;
    recordVictory(Number(member.id),bossFacts);
  }
};
