export declare const opposedChance: (offense: number, defense: number) => number;
export type StrikeCorrections = {
    hitCorrectionPct?: number;
    evasionCorrectionPct?: number;
    critAvoidanceCorrectionPct?: number;
    critDamageCorrectionPct?: number;
};
export declare const correctedHitChance: (chance: number, correction?: StrikeCorrections) => number;
export declare const correctedCritChance: (chance: number, correction?: StrikeCorrections) => number;
export declare const correctedCritBonus: (bonus: number, correction?: StrikeCorrections) => number;
export declare const strikeCorrections: (source?: {
    armorSet?: StrikeCorrections | null;
}, target?: {
    armorSet?: StrikeCorrections | null;
}) => StrikeCorrections;
export declare const bossControlChanceMultiplier = 0.4;
export declare const tenacityContest: (tenacityPierce: number, targetTenacity: number, levelDifference: number, baseChancePct: number) => {
    coefficient: number;
    harmfulMultiplier: number;
    damageOverTimeMultiplier: number;
    controlChance: number;
};
export declare const directDamageVariance: (damage: number) => number;
export declare const resolveStrike: (attack: number, defense: number, accuracy: number, evasion: number, crit: number, critResist: number, critDamage: number, critReduction: number, forceHit?: boolean, forceCrit?: boolean, minimumHitRatePct?: number, actualHitRatePct?: number, hitMultiplier?: number, correction?: StrikeCorrections) => {
    hit: boolean;
    crit: boolean;
    damage: number;
};
