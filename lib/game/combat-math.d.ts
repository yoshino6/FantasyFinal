export declare const opposedChance: (offense: number, defense: number) => number;
export declare const tenacityContest: (tenacityPierce: number, targetTenacity: number, levelDifference: number, baseChancePct: number) => {
    coefficient: number;
    harmfulMultiplier: number;
    damageOverTimeMultiplier: number;
    controlChance: number;
};
export declare const directDamageVariance: (damage: number) => number;
export declare const resolveStrike: (attack: number, defense: number, accuracy: number, evasion: number, crit: number, critResist: number, critDamage: number, critReduction: number, forceHit?: boolean, forceCrit?: boolean, minimumHitRatePct?: number, actualHitRatePct?: number, hitMultiplier?: number) => {
    hit: boolean;
    crit: boolean;
    damage: number;
};
