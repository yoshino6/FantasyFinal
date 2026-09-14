import { attributes, type Allocation, type AttributeKey } from './types';
import { playerGrowthShares } from './growth-rules';

const units = (value: number) => Math.round(value * 10);

/** 问心仅使用 0.1 点整数单位，普通结果转移，大成功只在 12 点预算内新增。 */
export const calculateHeartGrowthChange = (before: Allocation, favor: AttributeKey, repel: AttributeKey, great: boolean) => {
  if (favor === repel) throw new Error('问心倾向与排斥不能相同。');
  const total = attributes.reduce((sum, key) => sum + units(before[key]), 0);
  if (total > 120 || attributes.some(key => before[key] < 0)) throw new Error('问心成长档案超过出生预算。');
  const target = Math.max(10, Math.ceil(units(before[favor]) / 10));
  const gain = great ? Math.min(target, 120 - total) : Math.min(target, units(before[repel]));
  const loss = great ? 0 : gain;
  const after = { ...before, [favor]: (units(before[favor]) + gain) / 10, [repel]: (units(before[repel]) - loss) / 10 } as Allocation;
  return { after, target: target / 10, gain: gain / 10, loss: loss / 10 };
};

export const heartOffsetAfterChoice = (before: Allocation, favor: AttributeKey, repel: AttributeKey, gain: number, loss: number, levelAtChoice: number) => {
  const shares = playerGrowthShares(levelAtChoice);
  return { ...before, [favor]: (units(before[favor]) - units(gain) * shares) / 10, [repel]: (units(before[repel]) + units(loss) * shares) / 10 } as Allocation;
};
