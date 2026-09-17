export declare const refinementCounts: Record<string, number>;
export declare const rerollRatios: Record<string, number>;
export declare const breakthroughs: Record<string, {
    next: string;
    chance: number;
    pity: number;
    count: number;
}>;
export declare const refinementGain: (random?: () => number) => number;
export declare const fusionQualityLoss: (rarity: string, quality: number) => number;
export declare const qualityDescription: (quality: number) => "炉火纯青" | "精工细作" | "火候渐佳" | "尚可打磨" | "初具雏形";
export declare const lowForgeMaterials: readonly ["living_wood", "root_heart", "river_shell", "tide_shell"];
export declare const allocateLowMaterials: (stock: Array<{
    code: string;
    quantity: number;
    selected?: number;
}>, required: number) => {
    result: {
        code: string;
        quantity: number;
    }[];
    remaining: number;
};
export declare const armorWorkshopNames: Record<string, string[]>;
export declare const verifiedLegacyLayers: (code: string, base: Record<string, any>, current: Record<string, any>, ledger: Record<string, any>[]) => {
    base: {
        [x: string]: any;
    };
    frozen: Record<string, number>;
} | null;
