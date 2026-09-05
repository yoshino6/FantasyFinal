import { specializationProgress } from './skill-specialization.js';

const residentScalablePassives = new Set('A08 B07 C07 C08 D08 E07 E08 F07 F08 G07 G08 H07 H08 I01 I08 K07 L07 M07'.split(' ').map(id => `resident_${id.toLowerCase()}`));
const numericKeys = new Set(['damageBonusPct', 'damageReductionPct', 'healingBonusPct', 'regenerationBonusPct', 'magicDamagePct', 'lightSkillBonusPct', 'lifestealPct', 'venomDamagePct', 'criticalDamageBonusPct']);
const canSpecializePassive = (code, effect = {}) => residentScalablePassives.has(code) || Object.entries(effect).some(([key, value]) => numericKeys.has(key) && typeof value === 'number' && value > 0);
const passiveSpecializationFactor = (level, tier) => 1 + .15 * specializationProgress(level, tier);
const specializedPassiveValue = (key, value, level, tier) => numericKeys.has(key) ? value * passiveSpecializationFactor(level, tier) : value;

export { canSpecializePassive, passiveSpecializationFactor, residentScalablePassives, specializedPassiveValue };
