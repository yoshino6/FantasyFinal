import { monsterGrowthAnchors } from '../config/monster-growth-anchors.js';
import { playerGrowthShares } from './growth-rules.js';
import { attributes } from './types.js';

const monsterIdentityCode = (row) => String(row.growth_template_code ?? row.template_code ?? row.code ?? '');
const isResidentMonsterCode = (code) => code.startsWith('city_') || code.startsWith('mentor_trial_') || code === 'scholar_ga';
const monsterGrowthCoefficient = (code, _referenceLevel) => {
    if (isResidentMonsterCode(code))
        return 1;
    const anchor = Math.max(10, monsterGrowthAnchors[code] ?? 10);
    return (anchor - 1) / playerGrowthShares(anchor);
};
const monsterGrowthAllocation = (row, multiplier = 1) => {
    const shares = playerGrowthShares(Number(row.level)) * monsterGrowthCoefficient(monsterIdentityCode(row), Number(row.level));
    return Object.fromEntries(attributes.map(key => [key, Math.floor((Number(row[key]) + Number(row[`${key}_growth`]) * shares) * multiplier + 1e-9)]));
};

export { isResidentMonsterCode, monsterGrowthAllocation, monsterGrowthCoefficient, monsterIdentityCode };
