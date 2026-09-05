import { specializationProgress } from './skill-specialization';
/** 有具体数值落点的被动开放强效；布尔规则、免死次数、资源循环与探测权限保持固定。 */
export const residentScalablePassives = new Set('A08 B07 C07 C08 D08 E07 E08 F07 F08 G07 G08 H07 H08 I01 I08 K07 L07 M07'.split(' ').map(id => `resident_${id.toLowerCase()}`));
const numericKeys = new Set(['damageBonusPct', 'damageReductionPct', 'healingBonusPct', 'regenerationBonusPct', 'magicDamagePct', 'lightSkillBonusPct', 'lifestealPct', 'venomDamagePct', 'criticalDamageBonusPct']);
export const canSpecializePassive = (code: string, effect: Record<string, unknown> = {}) => residentScalablePassives.has(code) || Object.entries(effect).some(([key, value]) => numericKeys.has(key) && typeof value === 'number' && value > 0);
export const passiveSpecializationFactor = (level: unknown, tier?: string) => 1 + .15 * specializationProgress(level, tier);
export const specializedPassiveValue = (key: string, value: number, level: unknown, tier?: string) => numericKeys.has(key) ? value * passiveSpecializationFactor(level, tier) : value;
