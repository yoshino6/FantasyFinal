/** 所有副职业共用锻造师的等级上限与熟练度曲线。 */
export const secondaryProfessionMaxLevel = 11;

export const secondaryProfessionProficiencyRequired = (level: number) => ({
  1: 100,
  2: 500,
  3: 2000,
  4: 10000,
  5: 30000,
  6: 100000,
  7: 300000,
  8: 1000000,
  9: 10000000,
  10: 100000000
}[level] ?? 0);

export const secondaryProfessionBonus = (level: number) => Math.max(0, (Math.min(secondaryProfessionMaxLevel, level) - 1) * 5);
