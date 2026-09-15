export type BossSummonCombatStats = {
  hpMax: number;
  mpMax: number;
  physicalAttack: number;
  magicAttack: number;
  physicalDefense: number;
  magicDefense: number;
  accuracy: number;
  evasion: number;
  crit: number;
  critResist: number;
  critDamage: number;
  critReduction: number;
  tenacity: number;
  tenacityPierce: number;
  speed: number;
  perception: number;
};

type InheritedStat = 'tenacity' | 'physicalAttack' | 'magicAttack' | 'physicalDefense' | 'magicDefense' | 'accuracy' | 'evasion' | 'speed' | 'critRate' | 'critDamage' | 'critResist' | 'critReduction';

export type BossSummonInheritedTrait = {
  statMultiplier?: number;
  statMultipliers?: Partial<Record<InheritedStat | 'hp', number>>;
  mpPct?: number;
  physicalAttackPct?: number;
  magicAttackPct?: number;
  physicalDefensePct?: number;
  magicDefensePct?: number;
  accuracyPct?: number;
  evasionPct?: number;
  speedPct?: number;
  critRatePct?: number;
  critDamagePct?: number;
  critResistPct?: number;
  critReductionPct?: number;
};

/** Boss 召唤物继承来源词条的非生命面板；hpMax 始终原样保留。 */
export const applyBossSummonTrait = <T extends BossSummonCombatStats>(stats: T, trait?: BossSummonInheritedTrait): T => {
  if (!trait) return stats;
  const multiplier = (stat?: InheritedStat) => Number((stat ? trait.statMultipliers?.[stat] : undefined) ?? trait.statMultiplier ?? 1);
  const scaled = (value: number, pctKey?: keyof BossSummonInheritedTrait, stat?: InheritedStat) => Math.floor(value * multiplier(stat) * (1 + Number(pctKey ? trait[pctKey] ?? 0 : 0) / 100));
  return {
    ...stats,
    hpMax: stats.hpMax,
    mpMax: scaled(stats.mpMax, 'mpPct'),
    physicalAttack: scaled(stats.physicalAttack, 'physicalAttackPct', 'physicalAttack'),
    magicAttack: scaled(stats.magicAttack, 'magicAttackPct', 'magicAttack'),
    physicalDefense: scaled(stats.physicalDefense, 'physicalDefensePct', 'physicalDefense'),
    magicDefense: scaled(stats.magicDefense, 'magicDefensePct', 'magicDefense'),
    accuracy: scaled(stats.accuracy, 'accuracyPct', 'accuracy'),
    evasion: scaled(stats.evasion, 'evasionPct', 'evasion'),
    crit: scaled(stats.crit, 'critRatePct', 'critRate'),
    critResist: scaled(stats.critResist, 'critResistPct', 'critResist'),
    critDamage: scaled(stats.critDamage, 'critDamagePct', 'critDamage'),
    critReduction: scaled(stats.critReduction, 'critReductionPct', 'critReduction'),
    tenacity: scaled(stats.tenacity, undefined, 'tenacity'),
    tenacityPierce: scaled(stats.tenacityPierce),
    speed: scaled(stats.speed, 'speedPct', 'speed'),
    perception: scaled(stats.perception)
  };
};
