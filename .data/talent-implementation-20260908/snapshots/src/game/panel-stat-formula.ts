import type { DerivedStats } from './types';

export const panelPercentKeys: Record<keyof DerivedStats, string> = {
  hpMax: 'hpPct', mpMax: 'mpPct', physicalAttack: 'physicalAttackPct', magicAttack: 'magicAttackPct',
  physicalDefense: 'physicalDefensePct', magicDefense: 'magicDefensePct', accuracy: 'accuracyPct', evasion: 'evasionPct',
  critRateBp: 'critRatePct', critDamageBp: 'critDamagePct', critResistBp: 'critResistPct', critDamageReductionBp: 'critDamageReductionPct',
  tenacity: 'tenacityPct', tenacityPierce: 'tenacityPiercePct', speed: 'speedPct'
};

/** （六维派生 + 装备固定值）×（1 + 进化与装备同项百分比之和）× 独立加成；二转由调用方最后应用。 */
export const calculatePanelStats = (
  base: DerivedStats, flat: Partial<DerivedStats>, additivePercent: Record<string, number>, independentPercent: readonly Record<string, number>[] = []
): DerivedStats => Object.fromEntries((Object.keys(panelPercentKeys) as Array<keyof DerivedStats>).map(key => {
  const percentKey = panelPercentKeys[key];
  const independent = independentPercent.reduce((value, effect) => value * Math.max(0, 1 + Number(effect[percentKey] ?? 0) / 100), 1);
  return [key, Math.max(0, Math.floor((base[key] + Number(flat[key] ?? 0)) * Math.max(0, 1 + Number(additivePercent[percentKey] ?? 0) / 100) * independent))];
})) as DerivedStats;
