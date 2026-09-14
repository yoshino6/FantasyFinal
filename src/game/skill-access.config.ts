import { residentSkillByCode, residentSkills } from './resident-skill.config';

/** 本次开放的是 104 项域民技能中的三个互不重叠的稳定渠道。 */
const codes = (ids: string[]) => ids.map(id => {
  const skill = residentSkillByCode(id);
  if (!skill) throw new Error(`未知域民技能：${id}`);
  return skill.code;
});

export const guildSkillCodes = codes([
  'A03','A04','A06','A07','B04','B05','B08','C02','C06','C08','D03','D07','E04','E05','E08',
  'F02','F07','G03','G04','G08','H04','H08','I02','I03','J02','J05'
]);
export const bookshopSkillCodes = codes(['A05','B06','C04','D04','E03','F05','G05','H02','I05','K05']);
export const libraryFreeSkillCodes = codes(['C05','C07','F06','F08','G02','H07','J03','J07','K04','K07']);

const distributed = [...guildSkillCodes, ...bookshopSkillCodes, ...libraryFreeSkillCodes];
if (new Set(distributed).size !== distributed.length || distributed.some(code => !residentSkills.some(skill => skill.code === code))) throw new Error('域民技能开放渠道重复或无效。');
if (libraryFreeSkillCodes.some(code => residentSkillByCode(code)?.tier !== '基础')) throw new Error('世界图书馆只能免费教授基础技能。');

export const tierLearningCost = (tier: string, fallback: number) => ({ 基础: 1, 下位: 2, 中位: 3 } as Record<string, number>)[tier] ?? fallback;
/** 旧铜币标价仅作贡献度定价基准，实际支付只扣贡献度。 */
export const guildContributionPrice = (copperBasis: number) => Math.max(1, Math.ceil(Math.max(0, copperBasis) / 10));
export const guildContributionReward = (copperReward: number) => Math.max(1, Math.ceil(Math.max(0, copperReward) / 10));
/** 公会回售向下取整，低价值物品不能靠 1 铜币换出 1 贡献度。 */
export const guildContributionSalePrice = (copperBasis: number) => Math.floor(Math.max(0, copperBasis) / 10);

/** 公会技能书以位阶定基价；下列已上架技能按效果覆盖面、触发条件与收益评定相对强度。 */
const guildSkillBookStrength: Record<string, number> = {
  resident_a03: 1, resident_a04: 1.05, resident_a06: 1.1, resident_a07: 1,
  resident_b04: 1, resident_b05: 1.4, resident_b08: .95,
  resident_c02: 1.2, resident_c06: .75, resident_c08: 1.05,
  resident_d03: .9, resident_d07: 1.5,
  resident_e04: 1.15, resident_e05: .9, resident_e08: .85,
  resident_f02: 1.15, resident_f07: .85,
  resident_g03: 1.15, resident_g04: 1.05, resident_g08: 1.25,
  resident_h04: .9, resident_h08: .5,
  resident_i02: 1.1, resident_i03: .8,
  resident_j02: .9, resident_j05: 1
};
if (guildSkillCodes.some(code => guildSkillBookStrength[code] === undefined)) throw new Error('公会技能书缺少强度定价。');

export const guildSkillBookContributionPrice = (tier: string, code: string) => {
  const base = ({ 基础: 100, 下位: 500, 中位: 2000 } as Record<string, number>)[tier];
  if (!base) return null;
  const strength = guildSkillBookStrength[code] ?? 1;
  return Math.round(base * Math.max(.5, Math.min(1.5, strength)));
};
