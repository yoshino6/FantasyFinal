import { standardPlayerAttribute } from './growth-rules.js';
import { createHmac } from 'node:crypto';
import { calculateDerivedStats, forgedEquipmentBase, forgeRarityMultiplier, equipmentQualityMultiplier } from './constants.js';

const cap = 50;
const mixVectors = (...parts) => [0, 1, 2, 3, 4].map(i => parts.reduce((sum, [share, vector]) => sum + share * vector[i], 0));
const automatonThemes = {
    战锋: [0, 1, 0, 0, 0], 灵术: [0, 0, 1, 0, 0], 守御: [0, 0, 0, 1, 0], 灵巧: [0, 0, 0, 0, 1],
    支援: [.2, 0, .4, .4, 0], 干扰: [0, 0, .5, 0, .5], 持续: [.4, .3, .3, 0, 0], 应变: [.5, 0, 0, .25, .25]
};
const automatonRandom = (seed, domain, index = 0) => createHmac('sha256', seed).update(`${domain}:${index}`).digest().readUInt32BE(0) / 2 ** 32;
const cultivationRequired = (level) => 200 + 40 * level + 4 * level * level;
const keys = ['hpMax', 'mpMax', 'physicalAttack', 'magicAttack', 'physicalDefense', 'magicDefense', 'accuracy', 'evasion', 'critRateBp', 'critDamageBp', 'critResistBp', 'critDamageReductionBp', 'tenacity', 'tenacityPierce', 'speed'];
const labels = ['生命', '魔力', '物攻', '魔攻', '物防', '魔防', '命中', '闪避', '暴击', '暴伤', '暴免', '暴抗', '韧性', '破韧', '速度'];
const directions = ['均衡', '战锋', '灵术', '守御', '灵巧'];
const weights = {
    均衡: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    战锋: [1.3, .7, 1.6, .4, 1, .8, 1, 1, 1, 1.2, 1, .8, 1, 1.2, 1],
    灵术: [.85, 1.15, .4, 1.6, .8, 1.2, 1, .8, 1, 1, 1, 1, 1, 1.2, 1],
    守御: [1.4, .6, .6, .6, 1.4, 1.4, 1, 1, .8, .8, 1.2, 1.2, 1.3, .7, 1],
    灵巧: [1, 1, 1, 1, .7, .7, 1.3, 1.3, 1.2, 1, .8, 1, .6, 1, 1.4]
};
const weapon = {
    均衡: { physicalAttack: .9, magicAttack: .9 },
    战锋: { physicalAttack: 1 },
    灵术: { magicAttack: 1 },
    守御: { physicalDefense: 1, magicDefense: .5 },
    灵巧: { physicalAttack: .9, magicAttack: .9 }
};
const player = (level) => {
    const x = standardPlayerAttribute(level);
    return calculateDerivedStats(Object.fromEntries(['constitution', 'spirit', 'strength', 'intelligence', 'agility', 'perception'].map(key => [key, x])));
};
const floor = (value) => Math.floor(value + 1e-9);
const p1 = player(1);
const birth = keys.map(key => floor(.8 * p1[key]));
const progress = (level) => (level - 1) / (cap - 1);
const body = (level) => {
    const t = progress(level), p = player(level);
    return keys.map((key, i) => (.8 + .2 * t) * p[key] + (1 - t) * (birth[i] - .8 * p1[key]));
};
const weaponBudget = (level) => progress(level) * forgedEquipmentBase(level, '武器') * forgeRarityMultiplier['普通'] * equipmentQualityMultiplier(100);
const increment = (level, direction) => {
    const end = Math.ceil(level / 10) * 10, start = end === 10 ? 1 : end - 10;
    const stageWeight = end - start + 3;
    const rate = (level % 10 === 0 ? 4 : 1) / stageWeight;
    const now = body(end), before = body(start), dw = weaponBudget(end) - weaponBudget(start);
    return keys.map((key, i) => ((now[i] - before[i]) * weights[direction][i] + dw * (weapon[direction][key] ?? 0)) * rate);
};
const automatonBirthStats = (personality) => {
    const vector = mixVectors([.8, [1, 0, 0, 0, 0]], [.2, personality]);
    return birth.map((value, i) => floor(value * directions.reduce((sum, d, k) => sum + vector[k] * weights[d][i], 0)));
};
const automatonGrowthPreview = (level, personality, material) => {
    if (!Number.isInteger(level) || level < 2 || level > cap)
        throw new Error('机巧升级目标须为 2～50 级。');
    for (const v of [personality, material])
        if (v.length !== 5 || v.some(x => !Number.isFinite(x) || x < 0) || Math.abs(v.reduce((a, b) => a + b, 0) - 1) > 1e-8)
            throw new Error('培养贡献记录无效。');
    const vector = mixVectors([.15, [1, 0, 0, 0, 0]], [.25, personality], [.60, material]);
    const expected = keys.map((_, i) => directions.reduce((sum, d, k) => sum + vector[k] * increment(level, d)[i], 0));
    const unit = increment(Math.ceil(level / 10) * 10 - 1, '均衡');
    const score = expected.map((v, i) => v / unit[i]);
    const budget = score.reduce((a, b) => a + b, 0);
    return { expected, unit, budget, probabilities: score.map(v => v / budget), draws: level % 10 === 0 ? 120 : 30 };
};
const allocateAutomatonGrowth = (level, personality, material, seed) => {
    const preview = automatonGrowthPreview(level, personality, material);
    const counts = keys.map(() => 0);
    for (let draw = 0; draw < preview.draws; draw++) {
        const roll = automatonRandom(seed, `growth-v3:${level}`, draw);
        let sum = 0, chosen = keys.length - 1;
        for (let i = 0; i < keys.length; i++) {
            sum += preview.probabilities[i];
            if (roll < sum) {
                chosen = i;
                break;
            }
        }
        counts[chosen]++;
    }
    return { counts, values: counts.map((count, i) => count * preview.budget / preview.draws * preview.unit[i]) };
};

export { allocateAutomatonGrowth, automatonBirthStats, automatonGrowthPreview, automatonRandom, automatonThemes, birth, cultivationRequired, directions, increment, keys, labels, mixVectors, weights };
