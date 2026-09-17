import type { Allocation } from './types';

/** 超出承载上限的比例，等比例转为速度减益；保留最低速度。 */
export const encumbrance = (attributes: Allocation, weight: number, ignorePenalty = false, capacityMultiplier = 1) => {
  const capacity = Math.max(1, attributes.constitution + attributes.strength
    + .5 * (attributes.spirit + attributes.intelligence + attributes.agility + attributes.perception))*Math.max(1,capacityMultiplier);
  const overloadRatio = Math.max(0, (weight - capacity) / capacity);
  const penaltyRatio = ignorePenalty ? 0 : Math.min(1, overloadRatio);
  const effectivePenaltyRatio = (relativeReductionPct = 0) => penaltyRatio * (1 - Math.max(0, Math.min(100, Number(relativeReductionPct))) / 100);
  return { capacity, overloadPct: overloadRatio * 100, speedPenaltyPct: penaltyRatio * 100,
    applySpeed: (speed: number) => Math.max(1, speed * (1 - penaltyRatio)),
    /** 卡片只相对削减地图移动惩罚，不改变承载上限、超重比例或战斗速度。 */
    applyMapSpeed: (speed: number, relativeReductionPct = 0) => Math.max(1, speed * (1 - effectivePenaltyRatio(relativeReductionPct))),
    mapSpeedPenaltyPct: (relativeReductionPct = 0) => effectivePenaltyRatio(relativeReductionPct) * 100 };
};
