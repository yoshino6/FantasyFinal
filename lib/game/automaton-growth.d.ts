export type AutomatonVector = [number, number, number, number, number];
export declare const mixVectors: (...parts: [number, AutomatonVector][]) => AutomatonVector;
export declare const automatonThemes: Record<string, AutomatonVector>;
export declare const automatonRandom: (seed: string, domain: string, index?: number) => number;
export declare const cultivationRequired: (level: number) => number;
export declare const keys: readonly ["hpMax", "mpMax", "physicalAttack", "magicAttack", "physicalDefense", "magicDefense", "accuracy", "evasion", "critRateBp", "critDamageBp", "critResistBp", "critDamageReductionBp", "tenacity", "tenacityPierce", "speed"];
export declare const labels: string[];
export declare const directions: readonly ["均衡", "战锋", "灵术", "守御", "灵巧"];
type Direction = typeof directions[number];
export declare const weights: Record<Direction, number[]>;
export declare const birth: number[];
export declare const increment: (level: number, direction: Direction) => number[];
export declare const automatonBirthStats: (personality: AutomatonVector) => number[];
export declare const automatonGrowthPreview: (level: number, personality: AutomatonVector, material: AutomatonVector) => {
    expected: number[];
    unit: number[];
    budget: number;
    probabilities: number[];
    draws: number;
};
export declare const allocateAutomatonGrowth: (level: number, personality: AutomatonVector, material: AutomatonVector, seed: string) => {
    counts: number[];
    values: number[];
};
export {};
