import { attributes } from './types.js';

const units = (value) => Math.round(value * 10);
const calculateHeartGrowthChange = (before, favor, repel, great) => {
    if (favor === repel)
        throw new Error('问心倾向与排斥不能相同。');
    const total = attributes.reduce((sum, key) => sum + units(before[key]), 0);
    if (total > 120 || attributes.some(key => before[key] < 0))
        throw new Error('问心成长档案超过出生预算。');
    const target = Math.max(10, Math.ceil(units(before[favor]) / 10));
    const gain = great ? Math.min(target, 120 - total) : Math.min(target, units(before[repel]));
    const loss = great ? 0 : gain;
    const after = { ...before, [favor]: (units(before[favor]) + gain) / 10, [repel]: (units(before[repel]) - loss) / 10 };
    return { after, target: target / 10, gain: gain / 10, loss: loss / 10 };
};

export { calculateHeartGrowthChange };
