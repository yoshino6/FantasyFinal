import type { Allocation } from './types';
export declare const encumbrance: (attributes: Allocation, weight: number, ignorePenalty?: boolean, capacityMultiplier?: number) => {
    capacity: number;
    overloadPct: number;
    speedPenaltyPct: number;
    applySpeed: (speed: number) => number;
};
