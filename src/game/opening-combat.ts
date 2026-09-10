import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { RuleUnit, CombatRules } from './combat-rule-registry';
import { epicLoadoutFor } from './epic-equipment.service';
import { talentManaFactor, talentSpellHealing, hasTalent } from './talent-combat';
import { readTalentData } from './talent-data';

export type OpeningCombatEffects = { divines: string[]; weapons: string[]; crimson: number; pve: boolean; accessories?: number; settings?: Record<string, unknown> };
export const openingCombatEffectsFor = async (c: PoolConnection, ids: number[], pve=true) => {
  const result=new Map<number,OpeningCombatEffects>();if(!ids.length)return result;
  const [rows]=await c.execute<RowDataPacket[]>(`SELECT character_id,code FROM player_blessings WHERE character_id IN (${ids.map(()=>'?').join(',')}) AND code LIKE 'talent_%'`,ids);
  for(const id of ids){const epic=pve?await epicLoadoutFor(c,id):null;
    const [accessories]=await c.execute<RowDataPacket[]>("SELECT COUNT(*) AS n FROM player_equipment WHERE character_id=? AND slot IN ('necklace','bracelet','ring')",[id]);
    const data=await readTalentData(c,id);
    if(pve&&rows.some(r=>Number(r.character_id)===id&&r.code==='talent_gambit_08')){
      const [food]=await c.execute<RowDataPacket[]>('SELECT buff_json FROM player_food_buffs WHERE character_id=? AND expires_at>NOW()',[id]);
      data.settings={...data.settings,outsideFood:food.some(row=>{const buff=typeof row.buff_json==='string'?JSON.parse(row.buff_json):row.buff_json;return Number(buff?.__talentFoodSource??id)!==id;})};
    }
    result.set(id,{divines:rows.filter(r=>Number(r.character_id)===id).map(r=>String(r.code)),weapons:epic?.weaponEffects??[],crimson:epic?.crimsonCount??(epic?.setCode==='crimson_crown'?epic.setCount:0),pve,accessories:Number(accessories[0]?.n??0),settings:data.settings});}
  return result;
};
export const hasOpeningDivine=(unit:RuleUnit,code:string)=>!unit.companion&&Boolean(unit.opening?.pve&&unit.opening.divines.includes(code));
export const hasOpeningWeapon=(unit:RuleUnit,code:string)=>!unit.companion&&Boolean(unit.opening?.pve&&unit.opening.weapons.includes(code));
export const openingSpellHealingFactor=(unit:RuleUnit,target=unit)=>talentSpellHealing(unit,target);
export const openingManaCost=(unit:Pick<RuleUnit,'companion'|'opening'>,amount:number)=>amount<=0?0:Math.max(1,Math.ceil(amount*talentManaFactor(unit)));

export const openingPaid=(rules:CombatRules,unit:RuleUnit,amount:number)=>{
  if(amount>0&&hasOpeningWeapon(unit,'dawn_staff')&&rules.once(unit,'opening_dawn_staff',true)){
    const refund=Math.min(unit.mpMax-unit.mp,Math.floor(amount*.2));unit.mp+=refund;
    if(refund)rules.log.push(`　➥初晓·晨枝法杖返还 ${refund} MP。`);
  }
};

/** Called only for an effective spell heal, never from the bonus heal itself. */
export const openingEffectiveHeal=(rules:CombatRules,source:RuleUnit,target:RuleUnit,healed:number)=>{
  if(healed>0&&hasTalent(source,'F05')&&source.key!==target.key)target.state.memory.talentRestMark=Date.now()+1800000;
  if(healed<=0||!hasOpeningWeapon(source,'dawn_orb')||!rules.once(source,'opening_dawn_orb',true))return;
  const amount=Math.min(target.hpMax-target.hp,Math.floor(target.hpMax*.03));target.hp+=amount;
  if(amount)rules.log.push(`　➥初晓·掌心微日为${target.name}额外恢复 ${amount} HP。`);
};

export const openingAfterHit=async(rules:CombatRules,source:RuleUnit,target:RuleUnit,damage:number,skill:boolean,absorbed:number,extra:boolean)=>{
  if(source.side===target.side||damage+absorbed<=0||extra)return;
  if(!skill&&hasOpeningWeapon(source,'dawn_sword')&&rules.once(source,'opening_dawn_sword',true))rules.add(source,'shield',Math.floor(source.hpMax*.05),1,source);
  if(!skill&&damage>0&&hasOpeningWeapon(source,'dawn_dagger')&&rules.once(source,'opening_dawn_dagger',true))await rules.secondary(source,target,Math.floor(damage*.08),'初晓·露痕短刃');
  if(hasOpeningWeapon(target,'dawn_knuckle')&&rules.once(target,'opening_dawn_knuckle_charge',true))target.state.memory.opening_dawn_knuckle_ready=1;
  if(target.hp>0&&target.hp<target.hpMax*.4&&target.opening?.pve&&target.opening.crimson>0&&rules.once(target,'opening_crimson',true)){
    rules.add(target,'shield',Math.floor(target.hpMax*(target.opening.crimson>=2?.08:.05)),1,target);
    rules.log.push(`　➥猩红王冠的残光护住了${target.name}。`);
  }
};
