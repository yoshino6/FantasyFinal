import type { PoolConnection } from 'mysql2/promise';
export declare const deconstructorQuest: (qqUserId: string) => Promise<{
    readonly status: string;
    readonly cores: number;
}>;
export declare const acceptDeconstructorQuest: (qqUserId: string) => Promise<void>;
export declare const claimDeconstructorQuest: (qqUserId: string) => Promise<{
    name: string;
    characterName: string;
    giftName: string;
}>;
export declare const deconstructorProgress: (qqUserId: string) => Promise<{
    level: number;
    proficiency: number;
    required: number;
    bonus: number;
}>;
type DeconstructionCategory = '装备' | '道具' | '材料';
export declare const constructionCategories: readonly ["基材", "构件", "异械"];
export type ConstructionCategory = (typeof constructionCategories)[number];
export declare const claimVivianCourseBlueprints: (qqUserId: string) => Promise<{
    level: number;
    awarded: {
        level: number;
        code: string;
        name: string;
    }[];
    highestLevel: number;
    affinityAwarded: string[];
}>;
export declare const constructionRecipesFor: (qqUserId: string) => Promise<{
    codexId: string | null;
    unlocked: boolean;
    blueprintOwned: boolean;
    blueprintName: string | null;
    blueprintCodexId: string | null;
    gap: number;
    refundRate: number;
    successRate: number;
    ingredients: {
        name: string;
        codexId: string | null;
        owned: number;
        code: string;
        quantity: number;
    }[];
    code: string;
    name: string;
    description: string;
    outputType: "material" | "equipment" | "consumable" | "device";
    itemCategory: string;
    constructionCategory: import("./deconstructor-catalog").ConstructionCategory;
    recommendedSecondaryLevel: number;
    blueprintCode: string;
    effect?: Record<string, unknown>;
}[]>;
export declare const constructItemFor: (connection: PoolConnection, qqUserId: string, recipeCode: string) => Promise<{
    success: false;
    recipe: import("./deconstructor-catalog").ConstructionRecipe;
    successRate: number;
    refundRate: number;
    refunded: {
        name: string;
        quantity: number;
    }[];
    proficiencyGain: number;
    progress: {
        level: number;
        proficiency: number;
        required: number;
        bonus: number;
    };
    outputName?: undefined;
    instanceId?: undefined;
} | {
    success: true;
    recipe: import("./deconstructor-catalog").ConstructionRecipe;
    successRate: number;
    outputName: string;
    instanceId: number;
    proficiencyGain: number;
    progress: {
        level: number;
        proficiency: number;
        required: number;
        bonus: number;
    };
    refundRate?: undefined;
    refunded?: undefined;
} | {
    success: true;
    recipe: import("./deconstructor-catalog").ConstructionRecipe;
    successRate: number;
    outputName: string;
    proficiencyGain: number;
    progress: {
        level: number;
        proficiency: number;
        required: number;
        bonus: number;
    };
    refundRate?: undefined;
    refunded?: undefined;
    instanceId?: undefined;
}>;
export declare const constructItem: (qqUserId: string, recipeCode: string) => Promise<{
    success: false;
    recipe: import("./deconstructor-catalog").ConstructionRecipe;
    successRate: number;
    refundRate: number;
    refunded: {
        name: string;
        quantity: number;
    }[];
    proficiencyGain: number;
    progress: {
        level: number;
        proficiency: number;
        required: number;
        bonus: number;
    };
    outputName?: undefined;
    instanceId?: undefined;
} | {
    success: true;
    recipe: import("./deconstructor-catalog").ConstructionRecipe;
    successRate: number;
    outputName: string;
    instanceId: number;
    proficiencyGain: number;
    progress: {
        level: number;
        proficiency: number;
        required: number;
        bonus: number;
    };
    refundRate?: undefined;
    refunded?: undefined;
} | {
    success: true;
    recipe: import("./deconstructor-catalog").ConstructionRecipe;
    successRate: number;
    outputName: string;
    proficiencyGain: number;
    progress: {
        level: number;
        proficiency: number;
        required: number;
        bonus: number;
    };
    refundRate?: undefined;
    refunded?: undefined;
    instanceId?: undefined;
}>;
export declare const deconstructionItems: (qqUserId: string, category?: DeconstructionCategory) => Promise<{
    id: number;
    code: string;
    name: string;
    category: string;
    quantity: number;
}[]>;
export declare const deconstructItems: (qqUserId: string, itemId: number, quantity?: number) => Promise<{
    inputName: string;
    inputQuantity: number;
    results: {
        name: string;
        quantity: number;
    }[];
    proficiencyGain: number;
    progress: {
        level: number;
        proficiency: number;
        required: number;
        bonus: number;
    };
}>;
export {};
