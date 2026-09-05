const secondaryProfessionMaxLevel = 11;
const secondaryProfessionProficiencyRequired = (level) => ({
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
const secondaryProfessionBonus = (level) => Math.max(0, (Math.min(secondaryProfessionMaxLevel, level) - 1) * 5);

export { secondaryProfessionBonus, secondaryProfessionMaxLevel, secondaryProfessionProficiencyRequired };
