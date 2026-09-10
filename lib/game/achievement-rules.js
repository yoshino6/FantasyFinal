import { achievementDefinitions } from './achievement.config.js';
import { pvpAchievementThresholds } from './achievement-pvp.config.js';

const achievementThresholds = {
    ...pvpAchievementThresholds,
    EGG37: 100, EGG38: 1000, EGG39: 100, EGG40: 1000, EGG41: 1000, EGG42: 1000, EGG43: 3, EGG44: 1000, EGG45: 1000, EGG46: 20,
    END01: 10000, END02: 50000, END03: 1000, END04: 1000, END05: 10000, END06: 10000, END07: 10000,
    EGG07: 10, EGG08: 50, EGG09: 30, EGG10: 12, EGG11: 30, EGG12: 1000,
    A24: 7, A25: 30, B03: 10, B04: 100, B05: 1000, B07: 20, B09: 5, B10: 10, B11: 100,
    D19: 4, D20: 10, D25: 5, E02: 10, E03: 100, E04: 100, E05: 20, E06: 50, E07: 5, E08: 5, E14: 5, E15: 5, E16: 5, E17: 3, E18: 9, E19: 3, E20: 10, E21: 5, E22: 5, E23: 10, E24: 10,
    F03: 5, F04: 20, F08: 3, F09: 10, F24: 20, F25: 5, G03: 10, G04: 100, G05: 10, G14: 3, G15: 5, G19: 10, G22: 3, G23: 20,
    H02: 20, H03: 100, H04: 5, H05: 5, H06: 3, H11: 3, H13: 20, H14: 100, H22: 10,
    I02: 10, I03: 100, I15: 100, J07: 5, J08: 12, J11: 20, J18: 3, J21: 3, J22: 5, J24: 3, K05: 10, K08: 10000, K09: 10000, K14: 5, K16: 3, K19: 3, L16: 20, L19: 3
};
const achievementThreshold = (id) => achievementThresholds[id.replace('ACH_', '')] ?? 1;
const achievementAttributeKeys = { 体质: 'constitution', 精神: 'spirit', 力量: 'strength', 智力: 'intelligence', 敏捷: 'agility', 感知: 'perception' };
const completionPercent = (completed, population) => {
    if (!population || !completed)
        return '0.00%';
    const percentage = Math.min(100, completed / population * 100);
    return percentage < .01 ? '<0.01%' : `${percentage.toFixed(2)}%`;
};
const achievementById = new Map(achievementDefinitions.map(d => [d.id, d]));

export { achievementAttributeKeys, achievementById, achievementThreshold, achievementThresholds, completionPercent };
