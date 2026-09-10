/** Lv.1 为出生面板；2—10 级每级 1 份，11—20 级 2 份，之后每十级再加 1 份。 */
export const playerGrowthShares = (level: number) => {
  const normalized = Math.max(1, Math.floor(Number(level) || 1));
  const fullStages = Math.floor((normalized - 1) / 10);
  return 5 * fullStages * (fullStages + 1) + (normalized - fullStages * 10) * (fullStages + 1) - 1;
};

export const standardPlayerAttribute = (level: number) => (100 + 10 * playerGrowthShares(level)) / 6;
export const STAT_BALANCE_VERSION = 3;
