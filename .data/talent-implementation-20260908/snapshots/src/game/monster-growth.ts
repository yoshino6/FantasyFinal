import { monsterGrowthAnchors } from '../config/monster-growth-anchors';
import { playerGrowthShares } from './growth-rules';
import { attributes, type Allocation } from './types';

export const monsterIdentityCode = (row: {code?:unknown;template_code?:unknown;growth_template_code?:unknown}) => String(row.growth_template_code ?? row.template_code ?? row.code ?? '');
export const isResidentMonsterCode = (code: string) => code.startsWith('city_') || code.startsWith('mentor_trial_') || code === 'scholar_ga';
/** g有效=g原始×(校准等级-1)/G(校准等级)。g有效在同一种类内固定，升级仍按1/2/3/4…倍累加。 */
export const monsterGrowthCoefficient = (code: string, _referenceLevel?: number) => {
  if(isResidentMonsterCode(code))return 1;
  // 未配置的新种类直接使用新标准成长；不能根据当前等级改变同一种类的固定成长。
  const anchor=Math.max(10,monsterGrowthAnchors[code] ?? 10);
  return (anchor-1)/playerGrowthShares(anchor);
};
export const monsterGrowthAllocation = (row: Allocation & Record<`${keyof Allocation}_growth`,number> & {level:number;code?:unknown;template_code?:unknown;growth_template_code?:unknown}, multiplier=1): Allocation => {
  const shares=playerGrowthShares(Number(row.level))*monsterGrowthCoefficient(monsterIdentityCode(row),Number(row.level));
  return Object.fromEntries(attributes.map(key=>[key,Math.floor((Number(row[key])+Number(row[`${key}_growth`])*shares)*multiplier+1e-9)])) as Allocation;
};
