import { specializationInvestedPoints, skillSpecialization, specializationMaximum } from './skill-specialization.js';
import { passiveSpecializationFactor } from './passive-specialization.js';

const specializationNumberText = (value) => String(Number(Number(value).toFixed(2)));
const percentage = (value) => `${Math.abs(value) < .005 ? '' : value > 0 ? '+' : '−'}${specializationNumberText(Math.abs(value))}%`;
const specializationPerLevelLines = (tier, levels = {}, code = '') => {
    const maximum = specializationMaximum(tier);
    const base = { code, tier, power: 100, mana_cost: 100, cooldown_turns: 0, chant_turns: 0 };
    return Object.fromEntries(['overcharge', 'potent', 'instant', 'efficient'].map(key => {
        const level = specializationInvestedPoints(levels[key], tier) + 1;
        if (level >= maximum)
            return [key, ['已满级，不能继续加点。']];
        const before = skillSpecialization(base, { [key]: level });
        const after = skillSpecialization(base, { [key]: level + 1 });
        const change = (field) => percentage((after[field] / before[field] - 1) * 100);
        const heading = `升至Lv.${level + 1}：`;
        if (key === 'overcharge')
            return [key, [`${heading}威力${change('powerFactor')}；蓝耗${change('manaFactor')}。`]];
        if (key === 'potent')
            return [key, [
                    `${heading}效果、可成长时长、控制概率系数${change('effectFactor')}；蓝耗${change('manaFactor')}。`
                ]];
        if (key === 'instant')
            return [key, [`${heading}冷却/吟唱基数${change('timeFactor')}；蓝耗${change('manaFactor')}。`]];
        return [key, [`${heading}蓝耗${change('manaFactor')}。`]];
    }));
};
const specializationTotalLines = (base, current) => {
    const number = specializationNumberText;
    const manaChange = Number(base.mana_cost) > 0 ? (current.mana / Number(base.mana_cost) - 1) * 100 : 0;
    return [
        `威力：${number(base.power)} → ${number(current.power)}（${percentage((current.powerFactor - 1) * 100)}）`,
        `普通效果：${percentage((current.effectFactor - 1) * 100)}｜控制概率系数：${percentage((current.controlChanceFactor - 1) * 100)}`,
        base.code === 'resident_d01' ? '蓝耗：固定500＋施法前当前MP的8%（不受专精影响）' : `蓝耗：${number(base.mana_cost)} → ${number(current.mana)}（${percentage(manaChange)}）`,
        `冷却：${number(base.cooldown_turns)} → ${number(current.cooldown)}回合｜吟唱：${number(Number(base.chant_turns ?? 0))} → ${number(current.chant)}回合`,
        `时间基数：${percentage(current.timeChange * 100)}｜可成长时长：${percentage(current.durationChange * 100)}（整回合生效，普通状态最多4回合）`,
        `蓝耗增幅：×${number(current.manaPenaltyFactor)}｜节能倍率：×${Number(current.efficientFactor.toPrecision(4))}`,
        '仅计算专精；具体效果仍受适用范围、上限和抗性限制。'
    ];
};
const passiveSpecializationPerLevelLine = (tier, currentLevel = 1) => {
    const level = specializationInvestedPoints(currentLevel, tier) + 1;
    if (level >= specializationMaximum(tier))
        return '已满级，不能继续加点。';
    return `升至Lv.${level + 1}：可成长数值${percentage((passiveSpecializationFactor(level + 1, tier) / passiveSpecializationFactor(level, tier) - 1) * 100)}；次数、时长与机制不变。`;
};
const passiveSpecializationTotalLine = (factor) => `可成长数值：${percentage((factor - 1) * 100)}`;

export { passiveSpecializationPerLevelLine, passiveSpecializationTotalLine, specializationNumberText, specializationPerLevelLines, specializationTotalLines };
