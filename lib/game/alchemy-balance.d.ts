export declare const alchemyTierIndex: (level: number) => 0 | 2 | 1 | 3 | 4;
export declare const alchemySuccessRate: (makerLevel: number, stability: number) => number;
export declare const alchemyTierValues: {
    life: number[];
    mana: number[];
    harmonyHp: number[];
    harmonyMp: number[];
    regeneration: number[];
    attack: number[];
    defense: number[];
    reduction: number[];
    speed: number[];
};
export declare const alchemyMaterialValue: (code: string, level: number, category: string, makerLevel?: number) => number | null;
export declare const expectedAlchemyUnitCost: (input: number, success: number, great: number, doubleGreat: boolean, quantityBonus?: number) => number;
export declare const alchemyCostQualityBudget: (unitCost: number | undefined, level: number) => number;
export declare const alchemyQualityBudget: (craftsmanship: number, costBudget?: number, supportsQuality?: boolean) => {
    potency: number;
    quantity: number;
};
export declare const alchemyQualityRoll: (craftsmanship: number, great: boolean, highTier: boolean, random?: () => number, costBudget?: number, supportsQuality?: boolean) => {
    quality: number;
    quantity: number;
};
export declare const alchemySupportsQuality: (effect: {
    tactic?: string;
    healPct?: number;
    restoreMpPct?: number;
    throwable?: unknown;
    status?: {
        code: string;
    };
}) => boolean;
