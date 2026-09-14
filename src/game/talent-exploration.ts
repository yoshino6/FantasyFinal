import { recordAchievement } from './achievement-events';
import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { ownedTalent, readTalentData, saveTalentData, talentDay, talentWhole, type TalentData } from './talent-data';
import { ordinaryTalentItem } from './talent-rewards';

export const talentBeginGather = async(connection:PoolConnection,character:Record<string,any>,resourceId:number)=>{
  const id=Number(character.id),talent=await ownedTalent(connection,id);if(!talent)return;
  const data=await readTalentData(connection,id);
  const risk=talent.number==='H06'&&data.settings.riskGather===true,seal=talent.number==='I08'&&data.settings.sealGather===true;
  if(risk){
    const cost=Math.max(1,Math.ceil(Number(character.hp_max)*.15));
    if(Number(character.current_hp)<=cost)throw new Error('险采需要支付15%最大HP，并保留至少1HP。');
    character.current_hp=Number(character.current_hp)-cost;
    await connection.execute('UPDATE characters SET current_hp=? WHERE id=?',[character.current_hp,id]);
  }
  data.flags.mining={resourceId,risk,seal};await saveTalentData(connection,id,data);
};
export const talentGatherReward=async(connection:PoolConnection,character:Record<string,any>,itemId:number,base:number,kind:string)=>{
  const id=Number(character.id),talent=await ownedTalent(connection,id);if(!talent)return base;
  const [items]=await connection.execute<RowDataPacket[]>('SELECT * FROM item_definitions WHERE id=?',[itemId]);
  if(!items[0]||!ordinaryTalentItem(items[0]))return base;
  const data=await readTalentData(connection,id);let f=1;
  if(talent.number==='E01')f=3;
  if(talent.number==='B07'&&/矿|石|金属/.test(kind))f=3.5;
  if(talent.number==='H06'&&data.flags.mining?.risk)f=Math.random()<.8?4.5:0;
  let amount=talentWhole(data,`gather:${itemId}`,base,f);
  if(talent.number==='I08'&&data.flags.mining?.seal){
    data.jobs.push({id:randomUUID(),kind:'sealed',created:Date.now(),ready:Date.now()+86400000,payload:{itemId,base,amount:talentWhole(data,`sealed:${itemId}`,base,3.5)}});
    amount=0;
  }
  if(talent.number==='H06'&&data.flags.mining?.risk&&amount>0)recordAchievement(connection,id,['ACH_H07']);
  delete data.flags.mining;await saveTalentData(connection,id,data);return amount;
};
type Point={x:number;y:number;z:number;regionId:number};
const pointKey=(p:Point)=>`${p.regionId}:${p.x}:${p.y}:${p.z}`;
export type ScavengeDrop={code:'beast_bone'|'beast_hide'|'beast_tendon'|'magic_wool'|'blood_residue';name:string;quantity:number};
type ScavengeSource='move'|'combat';
const scavengeNames:Record<ScavengeDrop['code'],string>={beast_bone:'兽骨',beast_hide:'兽皮',beast_tendon:'兽筋',magic_wool:'魔绒',blood_residue:'血肉残渣'};
const resetScavengeLedger=(data:TalentData)=>{
  const day=talentDay(),ledger=data.flags.scavenge;
  if(ledger?.day===day)return ledger;
  data.flags.scavenge={day,units:0,triggers:0,moveTriggers:0,combatTriggers:0,visited:[]};
  return data.flags.scavenge;
};

/** B05 只在真实胜利或当天首次抵达的新坐标结算；收益、触发次数和已到达坐标都随天赋状态保存。 */
export const talentScavenge=async(connection:PoolConnection,characterId:number,source:ScavengeSource,destination?:Point):Promise<ScavengeDrop[]>=>{
  const talent=await ownedTalent(connection,characterId);if(talent?.number!=='B05')return [];
  await connection.execute('INSERT IGNORE INTO player_talent_state(character_id,data_json) VALUES (?,?)',[characterId,JSON.stringify({settings:{},counters:{},flags:{},remainders:{},jobs:[]})]);
  await connection.execute('SELECT character_id FROM player_talent_state WHERE character_id=? FOR UPDATE',[characterId]);
  const data=await readTalentData(connection,characterId),ledger=resetScavengeLedger(data);
  if(source==='move'){
    const key=destination&&pointKey(destination),visited:string[]=Array.isArray(ledger.visited)?ledger.visited:[];
    if(!key||visited.includes(key)||Number(ledger.moveTriggers??0)>=2||Number(ledger.units??0)>=32){await saveTalentData(connection,characterId,data);return [];}
    ledger.visited=[...visited,key].slice(-128);
  }else if(Number(ledger.combatTriggers??0)>=6||Number(ledger.units??0)>=32){await saveTalentData(connection,characterId,data);return [];}
  if(Number(ledger.triggers??0)>=8||Math.random()>=(source==='combat'?.3:.2)){await saveTalentData(connection,characterId,data);return [];}
  const itemRoll=Math.random(),code:ScavengeDrop['code']=itemRoll<.3?'beast_bone':itemRoll<.55?'beast_hide':itemRoll<.75?'beast_tendon':itemRoll<.9?'magic_wool':'blood_residue',quantity=4;
  ledger.units=Number(ledger.units??0)+quantity;ledger.triggers=Number(ledger.triggers??0)+1;
  if(source==='move')ledger.moveTriggers=Number(ledger.moveTriggers??0)+1;else ledger.combatTriggers=Number(ledger.combatTriggers??0)+1;
  data.counters.scavengeTotal=Number(data.counters.scavengeTotal??0)+quantity;
  await saveTalentData(connection,characterId,data);return [{code,name:scavengeNames[code],quantity}];
};
export const talentMovementFactor=async(connection:PoolConnection,character:Record<string,any>,destination:Point)=>{
  const id=Number(character.id),talent=await ownedTalent(connection,id);if(!talent)return 1;
  const data=await readTalentData(connection,id),from:Point={x:Number(character.pos_x),y:Number(character.pos_y),z:Number(character.pos_z),regionId:Number(character.current_region_id)};
  let factor=talent.number==='B01'||talent.number==='F02'?.5:1;
  if(talent.number==='B04'&&data.flags.routes?.includes(`${pointKey(from)}>${pointKey(destination)}`))factor=.4;
  if(talent.number==='B10'){
    // A travel can be cancelled. Confirm its recorded edge only after the actor actually arrives.
    const pending=data.flags.fireflyPending;
    if(pending?.to===pointKey(from))data.flags.fireflyRoute=pending.path;
    delete data.flags.fireflyPending;
    const path: string[]=[...(data.flags.fireflyRoute??[])];
    if(data.settings.returning&&path.length>1&&path.at(-1)===pointKey(from)&&path.at(-2)===pointKey(destination)){factor=.25;path.pop();}
    else if(!data.settings.returning){
      const [safe]=await connection.execute<RowDataPacket[]>("SELECT 1 FROM map_npcs WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND interaction_kind='building' AND (code LIKE '%guild%' OR code LIKE '%inn%') LIMIT 1",[from.regionId,from.x,from.y,from.z]);
      if(path.at(-1)===pointKey(from)||safe.length){if(!path.length||path.at(-1)!==pointKey(from))path.splice(0,path.length,pointKey(from));path.push(pointKey(destination));factor=.6;}
    }
    data.flags.fireflyPending={to:pointKey(destination),path};
  }
  data.flags.lastPath={from,to:destination};await saveTalentData(connection,id,data);return factor;
};

export const talentMovementArrived=async(connection:PoolConnection,character:Record<string,any>,destination:Point,prepared:boolean):Promise<ScavengeDrop[]>=>{
  const id=Number(character.id),talent=await ownedTalent(connection,id);
  const moved=pointKey({x:Number(character.pos_x),y:Number(character.pos_y),z:Number(character.pos_z),regionId:Number(character.current_region_id)})!==pointKey(destination);
  const scavenged=moved?await talentScavenge(connection,id,'move',destination):[];
  if(talent?.number!=='B10')return scavenged;
  const from:Point={x:Number(character.pos_x),y:Number(character.pos_y),z:Number(character.pos_z),regionId:Number(character.current_region_id)};
  if(pointKey(from)===pointKey(destination))return scavenged;
  // Short steps have no travel row, but still form a real edge of the return route.
  if(!prepared)await talentMovementFactor(connection,character,destination);
  const data=await readTalentData(connection,id);
  if(data.flags.fireflyPending?.to===pointKey(destination)){
    data.flags.fireflyRoute=data.flags.fireflyPending.path;
    delete data.flags.fireflyPending;
    await saveTalentData(connection,id,data);
  }
  return scavenged;
};
