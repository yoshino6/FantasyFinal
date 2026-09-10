import { equipmentQualityMultiplier } from './constants';
import { panelPercentKeys } from './panel-stat-formula';

export const armorSlots = ['shoulder', 'upper', 'waist', 'lower', 'feet'] as const;
export const armorSlot = (slot: string) => ({ shoulder:'shoulder', '头肩':'shoulder', upper:'upper', '上装':'upper', waist:'waist', '腰部':'waist', lower:'lower', '下装':'lower', feet:'feet', '脚部':'feet' } as Record<string,string>)[slot];
export const armorAttributeKeys = ['accuracy', 'evasion', 'critResistBp', 'critDamageReductionBp', 'tenacity', 'speed'] as const;
const largePercent: Record<string, readonly number[]> = {
  '布甲': [16,16,0,0,0,16], '皮甲': [12,8,4,4,4,8], '轻甲': [4,4,8,8,8,4],
  '重甲': [-4,-8,12,12,12,-8], '板甲': [-16,-16,16,16,16,-16]
};
export const armorPiecePercent = (subtype: string | null | undefined, slot: string, quality = 100) => {
  const normalized = armorSlot(slot), values = largePercent[subtype ?? ''];
  const scale = (normalized === 'upper' || normalized === 'lower' ? 1 : .75) * equipmentQualityMultiplier(quality);
  return Object.fromEntries(armorAttributeKeys.map((key, index) => [panelPercentKeys[key], normalized && values ? values[index]! * scale : 0]));
};

/** 每个有效槽只计一次，逐件乘算；不在每次相乘后取整。 */
export const armorPanelPercent = (rows: readonly {slot: string; weapon_type?: string | null; quality?: number}[]) => {
  const factors: Record<string,number> = {}, seen = new Set<string>();
  for (const row of rows) {
    const slot = armorSlot(row.slot); if (!slot || seen.has(slot)) continue;
    seen.add(slot);
    for (const [key, value] of Object.entries(armorPiecePercent(row.weapon_type, slot, Number(row.quality ?? 100)))) factors[key] = (factors[key] ?? 1) * (1 + value / 100);
  }
  return Object.fromEntries(Object.entries(factors).map(([key, value]) => [key, (value - 1) * 100]));
};

export const armorPieceDescription = (subtype: string | null | undefined, slot: string, quality = 100) => {
  const labels = ['命中', '闪避', '暴免', '暴抗', '韧性', '速度'];
  const effect = armorPiecePercent(subtype, slot, quality);
  return armorAttributeKeys.flatMap((key, i) => {
    const value = effect[panelPercentKeys[key]]!;
    return value ? [`${labels[i]}${value > 0 ? '+' : ''}${Number(value.toFixed(2))}%`] : [];
  }).join('、');
};
