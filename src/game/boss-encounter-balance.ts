import type { BossSummonCombatStats } from './boss-summon-inheritance';

/** 召唤物自身模板修正；生命不继承 Boss 难度倍率，主线沿用原强度。 */
export const encounterSummonProfiles: Record<string, Partial<Record<keyof BossSummonCombatStats, number>>> = {
  goblin_royal_guard: { hpMax: 1.25, physicalAttack: 1.10, physicalDefense: 1.25, magicDefense: 1.15 },
  goblin_royal_spearman: { hpMax: 1.25, physicalAttack: 1.20, magicAttack: 1.20, accuracy: 1.10 },
  uzz_skeleton_berserker: { hpMax: 1.80, physicalAttack: 1.25, physicalDefense: 1.15, magicDefense: 1.15, accuracy: 1.10 },
  uzz_skeleton_archer: { hpMax: 1.60, physicalAttack: 1.25, magicAttack: 1.25, accuracy: 1.15 },
  uzz_pain_wraith: { hpMax: 1.40, magicAttack: 1.15, physicalDefense: 1.10, magicDefense: 1.10 },
  uzz_skeleton_mage: { hpMax: 1.40, magicAttack: 1.20, accuracy: 1.10 },
  uzz_frost_bone_dragon: { hpMax: 1.25, physicalAttack: 1.10, magicAttack: 1.10 }
};

export const applyEncounterSummonBalance = <T extends BossSummonCombatStats>(stats: T, code: string, story = false): T => {
  const profile = story ? undefined : encounterSummonProfiles[code];
  if (!profile) return stats;
  const result = { ...stats };
  for (const [key, factor] of Object.entries(profile)) {
    const stat = key as keyof BossSummonCombatStats;
    result[stat] = Math.max(0, Math.floor(stats[stat] * factor)) as T[typeof stat];
  }
  return result;
};
