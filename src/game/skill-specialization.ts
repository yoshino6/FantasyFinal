/** 同投入点数同收益：每级乘算；收益每点衰减10%、最低25%，惩罚倍率固定。 */
export type Specialization = 'overcharge' | 'instant' | 'efficient' | 'potent';
export type SkillSpecializations = Partial<Record<Specialization, number>>;
export type SpecializationBase = { code: string; category: string; tier?: string; power: number; mana_cost: number; cooldown_turns: number; chant_turns?: number };
const finite = (n: unknown, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
export const manaTransferCost = (currentMp: number) => 500 + Math.floor(Math.max(0, finite(currentMp)) * .08);
export const specializationMaximum = (tier?: string) => tier === '基础' ? 10 : tier === '下位' ? 20 : 40;
export const specializationInvestedPoints = (level: unknown, tier?: string) => clamp(Math.floor(finite(level, 1)) - 1, 0, specializationMaximum(tier) - 1);
/** 第n次加点：第1点吃满，第15点起稳定为初始收益的25%。 */
export const specializationBenefitWeight = (point: number) => Math.max(.25, .9 ** Math.max(0, Math.floor(finite(point, 1)) - 1));
export const specializationGrowthFactor = (level: unknown, tier: string | undefined, initialChange: number) => {
  const points = specializationInvestedPoints(level, tier); let factor = 1;
  for (let point = 1; point <= points; point++) factor *= 1 + initialChange * specializationBenefitWeight(point);
  return factor;
};
export const specializationDescriptions = {
  overcharge: '提高技能伤害；增加蓝耗，延长冷却与吟唱。',
  potent: '增强技能效果、延长持续时间；增加蓝耗，延长冷却与吟唱。',
  instant: '缩短冷却与吟唱；降低技能威力与效果。',
  efficient: '逐级乘算降低技能蓝耗。'
} as const;
/** (原值+1)×(1+变化率)-1；变化量凑够整回合才生效，双向向零取整。 */
export const specializeTime = (base: number, change: number) => {
  const original = Math.max(0, finite(base)); const delta = (original + 1) * finite(change);
  const whole = Math.sign(delta) * Math.floor(Math.abs(delta) + 1e-9);
  return Math.max(0, original + whole);
};
export const skillSpecialization = (base: SpecializationBase, levels: SkillSpecializations = {}) => {
  const overPoints = specializationInvestedPoints(levels.overcharge, base.tier);
  const potentPoints = specializationInvestedPoints(levels.potent, base.tier);
  const instantPoints = specializationInvestedPoints(levels.instant, base.tier);
  const instantFactor = .96 ** instantPoints;
  const powerFactor = specializationGrowthFactor(levels.overcharge, base.tier, .08) * instantFactor;
  const potentFactor = specializationGrowthFactor(levels.potent, base.tier, .08);
  const effectFactor = potentFactor * instantFactor;
  const timeFactor = 1.08 ** (overPoints + potentPoints) * specializationGrowthFactor(levels.instant, base.tier, -.08);
  const timeChange = timeFactor - 1;
  const resourceTransfer = base.code === 'resident_d01';
  const manaPenaltyFactor = resourceTransfer ? 1 : 1.16 ** (overPoints + potentPoints);
  const efficientFactor = resourceTransfer ? 1 : specializationGrowthFactor(levels.efficient, base.tier, -.32);
  const manaFactor = manaPenaltyFactor * efficientFactor;
  const rawMana = Math.max(0, finite(base.mana_cost));
  return {
    power: finite(base.power) * powerFactor,
    // 原本有消耗的技能至少1MP；只在组合完所有专精后取整。
    mana: resourceTransfer ? 500 : rawMana > 0 ? Math.max(1, Math.ceil(rawMana * manaFactor - 1e-9)) : 0,
    cooldown: specializeTime(base.cooldown_turns, timeChange),
    chant: specializeTime(Number(base.chant_turns ?? 0), timeChange),
    powerFactor, effectFactor, supportFactor: effectFactor, damageFactor: 1,
    timeChange, timeFactor, manaFactor, manaPenaltyFactor, efficientFactor,
    durationChange: potentFactor - 1,
    controlChanceFactor: specializationGrowthFactor(levels.potent, base.tier, .015) * instantFactor
  };
};
export type SkillSpecializationResult = ReturnType<typeof skillSpecialization>;
const supportGrowth = new Set(['healing_light', 'healing_prayer', 'frost_barrier', 'saint_healer_mending_prayer', 'saint_healer_absolution_hand', 'saint_healer_revival_sanctuary', 'saint_healer_resonant_mass', 'warlord_triumph_banner', 'resident_e05', 'resident_f03', 'resident_i04', 'resident_k02']);
const ordinaryGrowth = new Set('A06 C02 C03 C05 C06 D04 E04 F02 F04 G05 H04 H05 H06 J01 J03 J05 K06 L05'.split(' ').map(id => `resident_${id.toLowerCase()}`));
const controlGrowth = new Set('B01 B02 B03 B04 B05 B06 L04'.split(' ').map(id => `resident_${id.toLowerCase()}`));
export const specializationOptions = (base: SpecializationBase, hasOrdinaryEffect = false): Specialization[] => {
  if (base.code === 'resident_d01') return ['instant'];
  if (['passive', 'bound'].includes(base.category) || base.code === 'appraisal' || base.code === 'machine_echo') return [];
  const options: Specialization[] = [];
  if (base.power > 0) options.push('overcharge');
  if (supportGrowth.has(base.code) || ordinaryGrowth.has(base.code) || controlGrowth.has(base.code) || hasOrdinaryEffect) options.push('potent');
  // 原本为0也可抵消过充/强效产生的延时。
  if (base.cooldown_turns > 0 || Number(base.chant_turns) > 0 || options.length > 0) options.push('instant');
  if (base.mana_cost > 0) options.push('efficient');
  return options;
};
const effectCaps: Record<string, number> = { beat: 30, refraction: 50, blind_resist: 60, accuracy_down: 50, evasion: 50, evasion_down: 50, alchemy_evasion: 50, alchemy_guard: 50, shield_guard: 60, imbalance: 50, next_damage: 50, damage: 50, life_shield: 40, attack: 50, magic: 50, defense: 50, magic_defense: 50, speed: 50, accuracy: 50, attack_down: 50, magic_down: 50, slow: 50, armor_shatter: 50, magic_shatter: 50, reduction: 60, physical_reduction: 60, magic_reduction: 60, barrier: 60, exposed: 50, vulnerability: 50, battle_cry: 50, sprint: 50, precision: 50, poison: 15, burn: 15, bleeding: 15, bleed: 15, regeneration: 20 };
/** 普通效果既吃强效增幅，也吃瞬息削弱；机制、次数与资源返还不变。 */
export const specializeEffectValue = (code: string, value: number, factor = 1) => {
  const cap = effectCaps[code];
  return cap === undefined ? value : Math.min(Math.max(value, cap), value * Math.max(0, finite(factor, 1)));
};
/** 普通控制成功率不超过75%；原有高概率机制不被反向削弱，瞬息仍降低概率。 */
export const specializeControlChance = (chance: number, factor = 1) => Math.min(Math.max(chance, 75), chance * Math.max(0, finite(factor, 1)));
/** 原始时长乘完整强效倍率、最后取整；硬控、行动/资源标记不延长。 */
export const specializeEffectDuration = (code: string, turns: number, change = 0) => {
  if (!(code in effectCaps || code === 'shield') || turns <= 0 || turns >= 4) return turns;
  return Math.min(4, turns + Math.max(0, Math.floor(turns * finite(change) + 1e-9)));
};
