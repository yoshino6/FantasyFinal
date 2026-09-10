import { talentByCode } from './talent.config.js';

const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const manaTransferCost = (currentMp) => 500 + Math.floor(Math.max(0, finite(currentMp)) * .08);
const specializationMaximum = (tier) => tier === '基础' ? 10 : tier === '下位' ? 20 : 40;
const specializationInvestedPoints = (level, tier) => clamp(Math.floor(finite(level, 1)) - 1, 0, specializationMaximum(tier) - 1);
const specializationUpgradeCost = (level) => Math.max(1, Math.floor(finite(level, 1)));
const specializationBenefitWeight = (point) => Math.max(.25, .9 ** Math.max(0, Math.floor(finite(point, 1)) - 1));
const specializationGrowthFactor = (level, tier, initialChange) => {
    const points = specializationInvestedPoints(level, tier);
    let factor = 1;
    for (let point = 1; point <= points; point++)
        factor *= 1 + initialChange * specializationBenefitWeight(point);
    return factor;
};
const specializationDescriptions = {
    overcharge: '每级威力×1.06，蓝耗×1.12。',
    potent: '每级普通效果、可成长时长与控制概率系数×1.06，蓝耗×1.12。',
    instant: '每级冷却与吟唱时间基数×0.94，蓝耗×1.12。',
    efficient: '每级蓝耗×0.88。'
};
const specializeTime = (base, change) => {
    const original = Math.max(0, finite(base));
    const delta = (original + 1) * finite(change);
    const whole = Math.sign(delta) * Math.floor(Math.abs(delta) + 1e-9);
    return Math.max(0, original + whole);
};
const skillSpecialization = (base, levels = {}) => {
    if (talentByCode.has(base.code))
        levels = {};
    const overPoints = specializationInvestedPoints(levels.overcharge, base.tier);
    const potentPoints = specializationInvestedPoints(levels.potent, base.tier);
    const instantPoints = specializationInvestedPoints(levels.instant, base.tier);
    const powerFactor = 1.06 ** overPoints;
    const potentFactor = 1.06 ** potentPoints;
    const effectFactor = potentFactor;
    const timeFactor = .94 ** instantPoints;
    const timeChange = timeFactor - 1;
    const resourceTransfer = base.code === 'resident_d01';
    const manaPenaltyFactor = resourceTransfer ? 1 : 1.12 ** (overPoints + potentPoints + instantPoints);
    const efficientFactor = resourceTransfer ? 1 : .88 ** specializationInvestedPoints(levels.efficient, base.tier);
    const manaFactor = manaPenaltyFactor * efficientFactor;
    const rawMana = Math.max(0, finite(base.mana_cost));
    return {
        power: finite(base.power) * powerFactor,
        mana: resourceTransfer ? 500 : rawMana > 0 ? Math.max(1, Math.ceil(rawMana * manaFactor - 1e-9)) : 0,
        cooldown: specializeTime(base.cooldown_turns, timeChange),
        chant: specializeTime(Number(base.chant_turns ?? 0), timeChange),
        powerFactor, effectFactor, supportFactor: effectFactor, damageFactor: 1,
        timeChange, timeFactor, manaFactor, manaPenaltyFactor, efficientFactor,
        durationChange: potentFactor - 1,
        controlChanceFactor: potentFactor
    };
};
const supportGrowth = new Set(['healing_light', 'healing_prayer', 'frost_barrier', 'saint_healer_mending_prayer', 'saint_healer_absolution_hand', 'saint_healer_revival_sanctuary', 'saint_healer_resonant_mass', 'warlord_triumph_banner', 'resident_e05', 'resident_f03', 'resident_i04', 'resident_k02']);
const ordinaryGrowth = new Set('A06 C02 C03 C05 C06 D04 E04 F02 F04 G05 H04 H05 H06 J01 J03 J05 K06 L05'.split(' ').map(id => `resident_${id.toLowerCase()}`));
const controlGrowth = new Set('B01 B02 B03 B04 B05 B06 L04'.split(' ').map(id => `resident_${id.toLowerCase()}`));
const specializationOptions = (base, hasOrdinaryEffect = false) => {
    if (talentByCode.has(base.code))
        return [];
    if (base.code === 'resident_d01')
        return ['instant'];
    if (['passive', 'bound'].includes(base.category) || base.code === 'appraisal' || base.code === 'machine_echo')
        return [];
    const options = [];
    if (base.power > 0)
        options.push('overcharge');
    if (base.code.startsWith('hidden_') && !['hidden_catalyst', 'hidden_overclock', 'hidden_transfer', 'hidden_debug', 'hidden_finale'].includes(base.code) || supportGrowth.has(base.code) || ordinaryGrowth.has(base.code) || controlGrowth.has(base.code) || hasOrdinaryEffect)
        options.push('potent');
    if (base.cooldown_turns > 0 || Number(base.chant_turns) > 0)
        options.push('instant');
    if (base.mana_cost > 0)
        options.push('efficient');
    return options;
};
const effectCaps = { beat: 30, refraction: 50, blind_resist: 60, accuracy_down: 50, evasion: 50, evasion_down: 50, alchemy_evasion: 50, alchemy_guard: 50, shield_guard: 60, imbalance: 50, next_damage: 50, damage: 50, life_shield: 40, attack: 50, magic: 50, defense: 50, magic_defense: 50, speed: 50, accuracy: 50, attack_down: 50, magic_down: 50, slow: 50, armor_shatter: 50, magic_shatter: 50, reduction: 60, physical_reduction: 60, magic_reduction: 60, barrier: 60, exposed: 50, vulnerability: 50, battle_cry: 50, sprint: 50, precision: 50, poison: 15, burn: 15, bleeding: 15, bleed: 15, regeneration: 20 };
const specializeEffectValue = (code, value, factor = 1) => {
    const cap = effectCaps[code];
    return cap === undefined ? value : Math.min(Math.max(value, cap), value * Math.max(0, finite(factor, 1)));
};
const specializeControlChance = (chance, factor = 1) => Math.min(Math.max(chance, 75), chance * Math.max(0, finite(factor, 1)));
const specializeEffectDuration = (code, turns, change = 0) => {
    if (!(code in effectCaps || code === 'shield') || turns <= 0 || turns >= 4)
        return turns;
    return Math.min(4, turns + Math.max(0, Math.floor(turns * finite(change) + 1e-9)));
};

export { manaTransferCost, skillSpecialization, specializationBenefitWeight, specializationDescriptions, specializationGrowthFactor, specializationInvestedPoints, specializationMaximum, specializationOptions, specializationUpgradeCost, specializeControlChance, specializeEffectDuration, specializeEffectValue, specializeTime };
