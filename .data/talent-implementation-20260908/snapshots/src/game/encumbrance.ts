import type { Allocation } from './types';

/** 超出承载上限的比例，等比例转为速度减益；保留最低速度。 */
export const encumbrance = (attributes: Allocation, weight: number, ignorePenalty = false) => {
  const capacity = Math.max(1, attributes.constitution + attributes.strength
    + .5 * (attributes.spirit + attributes.intelligence + attributes.agility + attributes.perception));
  const overloadRatio = Math.max(0, (weight - capacity) / capacity);
  const penaltyRatio = ignorePenalty ? 0 : Math.min(1, overloadRatio);
  return { capacity, overloadPct: overloadRatio * 100, speedPenaltyPct: penaltyRatio * 100,
    applySpeed: (speed: number) => Math.max(1, speed * (1 - penaltyRatio)) };
};
