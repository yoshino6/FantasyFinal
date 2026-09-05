const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const manaTransferCost = (currentMp) => 500 + Math.floor(Math.max(0, finite(currentMp)) * .08);
const specializationMaximum = (tier) => tier === '基础' ? 10 : tier === '下位' ? 20 : 40;
const specializationProgress = (level, tier) => Math.max(0, Math.min(1, (finite(level, 1) - 1) / (specializationMaximum(tier) - 1)));
const specializationDescriptions = {
    overcharge: '线性成长至威力/直接治疗/护盾 +25%，蓝耗 +50%，冷却至多增加2回合；不增加行动或控制次数。',
    instant: '线性成长至冷却按进度缩短（满级1–2回合），威力/直接治疗/护盾 -10%；冷却不越出本阶档位、吟唱至少1回合。',
    efficient: '线性成长至基础蓝耗 -25%；不减免生命、当前魔力百分比和职业资源消耗。',
    potent: '线性成长至最终直接伤害 +10%，直接治疗/护盾及普通增减益数值 +25%，蓝耗 +20%；不增加控制概率、时长、次数或返还资源。'
};
const skillSpecialization = (base, levels = {}) => {
    const o = specializationProgress(levels.overcharge, base.tier);
    const i = specializationProgress(levels.instant, base.tier);
    const e = specializationProgress(levels.efficient, base.tier);
    const p = specializationProgress(levels.potent, base.tier);
    const resourceTransfer = base.code === 'resident_d01';
    const powerFactor = (1 + .25 * o) * (1 - .1 * i);
    const effectFactor = 1 + .25 * p;
    const cd = Math.max(0, finite(base.cooldown_turns));
    const chant = Math.max(0, finite(base.chant_turns));
    return {
        power: finite(base.power) * powerFactor,
        mana: resourceTransfer ? 500 : Math.max(0, Math.ceil(finite(base.mana_cost) * (1 + .5 * o + .2 * p) * (1 - .25 * e) - 1e-9)),
        cooldown: cd ? Math.min(base.tier === '基础' ? 1 : base.tier === '下位' ? 3 : 6, Math.max(base.tier === '中位' ? 3 : 1, cd + Math.min(2, Math.floor(cd * .25 * o)) - Math.min(2, Math.floor((cd - 1) * .4 * i + .6)))) : 0,
        chant: chant ? Math.max(1, chant - Math.floor((chant - 1) * .3 * i)) : 0,
        powerFactor, effectFactor, supportFactor: powerFactor * effectFactor, damageFactor: 1 + .1 * p
    };
};
const supportGrowth = new Set(['healing_light', 'healing_prayer', 'frost_barrier', 'saint_healer_mending_prayer', 'saint_healer_absolution_hand', 'saint_healer_revival_sanctuary', 'saint_healer_resonant_mass', 'warlord_triumph_banner', 'resident_e05', 'resident_f03', 'resident_i04', 'resident_k02']);
const ordinaryGrowth = new Set('A06 C02 C03 F02 F04 G05 H04 H05 H06 J01 J05 K06 L05'.split(' ').map(id => `resident_${id.toLowerCase()}`));
const specializationOptions = (base, hasOrdinaryEffect = false) => {
    if (base.code === 'resident_d01')
        return ['instant'];
    if (['passive', 'bound'].includes(base.category) || base.code === 'appraisal' || base.code === 'machine_echo')
        return [];
    const options = [];
    if (base.power > 0 || supportGrowth.has(base.code))
        options.push('overcharge');
    if (skillSpecialization(base, { instant: specializationMaximum(base.tier) }).cooldown < base.cooldown_turns || Number(base.chant_turns) > 1)
        options.push('instant');
    if (base.mana_cost > 0)
        options.push('efficient');
    if (base.power > 0 || supportGrowth.has(base.code) || ordinaryGrowth.has(base.code) || hasOrdinaryEffect)
        options.push('potent');
    return options;
};
const specializeEffectValue = (code, value, factor = 1) => {
    const caps = { beat: 30, refraction: 50, blind_resist: 60, accuracy_down: 50, evasion: 50, evasion_down: 50, alchemy_evasion: 50, alchemy_guard: 50, shield_guard: 60, imbalance: 50, next_damage: 50, damage: 50, life_shield: 40, attack: 50, magic: 50, defense: 50, magic_defense: 50, speed: 50, accuracy: 50, attack_down: 50, magic_down: 50, slow: 50, armor_shatter: 50, magic_shatter: 50, reduction: 60, physical_reduction: 60, magic_reduction: 60, barrier: 60, exposed: 50, vulnerability: 50, battle_cry: 50, sprint: 50, precision: 50, poison: 15, burn: 15, bleeding: 15, bleed: 15, regeneration: 20 };
    const cap = caps[code];
    return cap === undefined || factor <= 1 ? value : Math.min(Math.max(value, cap), value * Math.min(1.25, factor));
};

export { manaTransferCost, skillSpecialization, specializationDescriptions, specializationMaximum, specializationOptions, specializationProgress, specializeEffectValue };
