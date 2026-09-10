import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { armorSlot } from './armor-class';
export { armorSlot } from './armor-class';

export type ArmorSet = { name: string; count: number; tier: 3 | 5; hitCorrectionPct: number; evasionCorrectionPct: number; critAvoidanceCorrectionPct: number; critDamageCorrectionPct: number; damageReductionPct: number; panelPercent: Record<string,number> };

/** 仅五个实际防具槽计件；品质、稀有度不影响甲类套装，5件覆盖3件。 */
export const armorSetFromRows = (rows: readonly { slot: string; weapon_type?: string | null }[]): ArmorSet | null => {
  const counts = new Map<string,number>(), seen = new Set<string>();
  for (const row of rows) {
    const slot = armorSlot(row.slot), name = String(row.weapon_type ?? '');
    if (!slot || seen.has(slot)) continue; seen.add(slot);
    if (['布甲','皮甲','轻甲','重甲','板甲'].includes(name)) counts.set(name,(counts.get(name) ?? 0)+1);
  }
  const active = [...counts].find(([,count])=>count>=3); if (!active) return null;
  const [name,count] = active, tier = count>=5 ? 5 : 3, full = tier === 5;
  const anti = name === '重甲' ? (full ? 16 : 8) : name === '板甲' ? 12 : 0;
  return { name,count,tier, hitCorrectionPct:name==='布甲'?(full?33:16):name==='皮甲'?(full?25:12):0,
    evasionCorrectionPct:name==='布甲'?(full?33:16):0, critAvoidanceCorrectionPct:anti, critDamageCorrectionPct:anti,
    damageReductionPct:name==='板甲'?(full?4:2):0,
    panelPercent:name==='轻甲'?{hpPct:full?15:8,mpPct:full?15:8}:name==='皮甲'?{mpPct:full?20:10}:['重甲','板甲'].includes(name)?{hpPct:full?25:12}:{} };
};

export const armorSetsFor = async (connection: Pool | PoolConnection, ids: number[]) => {
  const result = new Map<number,ArmorSet | null>(); if (!ids.length) return result;
  const [rows] = await connection.execute<(RowDataPacket & {character_id:number;slot:string;weapon_type:string|null})[]>(`SELECT pe.character_id,pe.slot,i.weapon_type FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id WHERE pe.character_id IN (${ids.map(()=>'?').join(',')}) ORDER BY pe.slot`,ids);
  for (const id of ids) result.set(id,armorSetFromRows(rows.filter(row=>Number(row.character_id)===id)));
  return result;
};

export const armorSetDescription = (set: ArmorSet) => {
  const text: string[] = [];
  if (set.hitCorrectionPct) text.push(`命中修正+${set.hitCorrectionPct}%（补足未命中部分）`);
  if (set.evasionCorrectionPct) text.push(`闪避修正+${set.evasionCorrectionPct}%（降低敌方最终命中率）`);
  if (set.critAvoidanceCorrectionPct) text.push(`暴免、暴抗修正+${set.critAvoidanceCorrectionPct}%（降低被暴击率及额外暴伤）`);
  if (set.panelPercent.hpPct) text.push(`生命上限+${set.panelPercent.hpPct}%`);
  if (set.panelPercent.mpPct) text.push(`魔力上限+${set.panelPercent.mpPct}%`);
  if (set.damageReductionPct) text.push(`减伤+${set.damageReductionPct}%（计入减伤上限）`);
  return text.join('；');
};
