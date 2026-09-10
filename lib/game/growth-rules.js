const playerGrowthShares = (level) => {
    const normalized = Math.max(1, Math.floor(Number(level) || 1));
    const fullStages = Math.floor((normalized - 1) / 10);
    return 5 * fullStages * (fullStages + 1) + (normalized - fullStages * 10) * (fullStages + 1) - 1;
};
const standardPlayerAttribute = (level) => (100 + 10 * playerGrowthShares(level)) / 6;
const STAT_BALANCE_VERSION = 3;

export { STAT_BALANCE_VERSION, playerGrowthShares, standardPlayerAttribute };
