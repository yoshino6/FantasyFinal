import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { panelPercentKeys } from './panel-stat-formula';

export const armorSlot = (slot: string) => ({ shoulder:'shoulder', '头肩':'shoulder', upper:'upper', '上装':'upper', waist:'waist', '腰部':'waist', lower:'lower', '下装':'lower', feet:'feet', '脚部':'feet' } as Record<string,string>)[slot];
export type ArmorSet = { name: string; count: number; tier: 3 | 5; hitCorrectionPct: number; evasionCorrectionPct: number; critAvoidanceCorrectionPct: number; critDamageCorrectionPct: number; panelPercent: Record<string,number> };

/** 仅五个实际防具槽计件；品质、稀有度不影响甲类套装，5件覆盖3件。 */
export const armorSetFromRows = (rows: readonly { slot: string; weapon_type?: string | null }[]): ArmorSet | null => {
  const counts = new Map<string,number>(), seen = new Set<string>();
  for (const row of rows) {
    const slot = armorSlot(row.slot), name = String(row.weapon_type ?? '');
    if (!slot || seen.has(slot)) continue; seen.add(slot);
    if (['布甲','皮甲','轻甲','重甲','板甲'].includes(name)) counts.set(name,(counts.get(name) ?? 0)+1);
  }
  const active = [...counts].find(([,count])=>count>=3); if (!active) return null;
  const [name,count] = active, tier = count>=5 ? 5 : 3, correction = tier===5 ? 33 : 16;
  return { name,count,tier, hitCorrectionPct:['布甲','皮甲'].includes(name)?correction:0, evasionCorrectionPct:name==='布甲'?correction:0,
    critAvoidanceCorrectionPct:name==='板甲'?correction:0, critDamageCorrectionPct:name==='板甲'?correction:0,
    panelPercent:name==='轻甲'?Object.fromEntries(Object.values(panelPercentKeys).map(key=>[key,tier===5?5:3])):['重甲','板甲'].includes(name)?{hpPct:tier===5?20:10}:{} };
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
  if (set.name==='轻甲') text.push(`全部战斗面板属性+${set.panelPercent.hpPct}%`);
  else if (set.panelPercent.hpPct) text.push(`生命上限+${set.panelPercent.hpPct}%`);
  return text.join('；');
};
