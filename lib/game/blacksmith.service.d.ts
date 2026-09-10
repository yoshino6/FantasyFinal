import type { RowDataPacket } from 'mysql2/promise';
import { type EpicForgeRecipe } from '../config/epic-forging';
type ForgeEntrySource = 'blacksmith' | 'profession';
export declare const blacksmithMaxLevel = 11;
export declare const armorClassEffectText: (subtype: string | null | undefined, slot?: string) => string;
export declare const forgeFee: (requirements: ReadonlyArray<{
    code: string;
    quantity: number;
}>) => number;
export declare const blacksmithWeapons: (qqUserId: string) => Promise<{
    id: number;
    name: string;
    category: string;
    quality: number;
    rarity: string;
    requiredLevel: number;
    fusionCount: number;
    fusionLimit: number;
}[]>;
export declare const blacksmithFusionEquipment: (qqUserId: string) => Promise<{
    id: number;
    name: string;
    category: string;
    quality: number;
    rarity: string;
    requiredLevel: number;
    fusionCount: number;
    fusionLimit: number;
}[]>;
export declare const blacksmithProgress: (qqUserId: string) => Promise<{
    isBlacksmith: boolean;
    level: number;
    proficiency: number;
    required: number;
    bonus: number;
}>;
export declare const craftsmanshipEffect: (qqUserId: string) => Promise<{
    profession: string;
    level: number;
    percent: number;
    kind: "durability";
    text: string;
} | {
    profession: string;
    level: number;
    percent: number;
    kind: "potion";
    text: string;
} | {
    profession: null;
    level: number;
    percent: number;
    kind: "inactive";
    text: string;
} | null>;
export declare const craftsmanshipPotionMultiplier: (effect: Awaited<ReturnType<typeof craftsmanshipEffect>>) => number;
export declare const craftsmanshipDurabilityLoss: (loss: number, effect: Awaited<ReturnType<typeof craftsmanshipEffect>>) => number;
export declare const xiaobeiCraftsmanshipStatus: (qqUserId: string) => Promise<{
    affinity: number;
    learned: boolean;
}>;
export declare const learnXiaobeiCraftsmanship: (qqUserId: string) => Promise<{
    name: string;
    cost: number;
}>;
export declare const refinementMaterials: (qqUserId: string, level?: number) => Promise<{
    id: number;
    name: string;
    category: string;
    quantity: number;
    minGain: number;
    maxGain: number;
}[]>;
export declare const fusionMaterials: (qqUserId: string, equipmentCategory?: string) => Promise<{
    id: number;
    name: string;
    category: string;
    quantity: number;
    tendencyKeys: string[];
    fixedTendency: boolean;
    description: string;
}[]>;
export declare const refineWeapon: (qqUserId: string, instanceId: number, materialId: number) => Promise<{
    name: string;
    material: string;
    oldQuality: number;
    newQuality: number;
    gain: number;
    failed: boolean;
    great: boolean;
    progress: {
        isBlacksmith: boolean;
        level: number;
        proficiency: number;
        required: number;
        bonus: number;
    };
}>;
export declare const fuseWeapon: (qqUserId: string, instanceId: number, materialId: number) => Promise<{
    name: string;
    material: string;
    effect: any;
    count: number;
    limit: number;
    failed: boolean;
    success: number;
    progress: {
        isBlacksmith: boolean;
        level: number;
        proficiency: number;
        required: number;
        bonus: number;
    };
}>;
export declare const forgeRarityWeights: (blacksmithLevel: number) => Array<[string, number]>;
export declare const forgePrimaryKeys: (category: string, subtype: string | null | undefined) => string[];
export declare const legendaryTestForgeDraft: (category: string, subtype: string, level: number) => {
    rarity: string;
    name: string;
    effect: Record<string, number>;
    primaryKeys: string[];
};
export declare const forgeEquipmentCapsFor: (category: string, subtype: string | null | undefined, level: number, rarity: string, primaryKeys: readonly string[]) => Record<string, number>;
export declare const forgeState: (qqUserId: string) => Promise<{
    category: string | null;
    subtype: string | null;
    level: number | null;
    source: ForgeEntrySource;
    materials: {
        id: number;
        name: string;
        code: string;
        category: string;
        quantity: number;
        selected: number;
        contribution: number;
        supported: boolean;
    }[];
    selected: {
        id: number;
        name: string;
        quantity: number;
        contribution: number;
    }[];
    requirements: {
        name: string;
        code: string;
        quantity: number;
    }[];
    minimumAuxiliary: number;
    success: number;
    progress: {
        isBlacksmith: boolean;
        level: number;
        proficiency: number;
        required: number;
        bonus: number;
    };
}>;
export declare const resetForgeSession: (qqUserId: string, source?: ForgeEntrySource) => Promise<void>;
export declare const selectForgeCategory: (qqUserId: string, category: string) => Promise<string>;
export declare const selectForgeSubtype: (qqUserId: string, subtype: string) => Promise<string>;
export declare const selectForgeLevel: (qqUserId: string, level: number) => Promise<number>;
export declare const addForgeMaterial: (qqUserId: string, itemId: number, quantity?: number) => Promise<{
    name: string;
    quantity: number;
}>;
export declare const removeForgeMaterial: (qqUserId: string, itemId: number) => Promise<void>;
export declare const setForgeMaterial: (qqUserId: string, itemId: number, quantity: number) => Promise<void>;
export declare const clearForgeMaterial: (qqUserId: string, itemId: number) => Promise<void>;
export declare const craftForgeEquipment: (qqUserId: string, _confirmed?: boolean) => Promise<{
    needsConfirm: false;
    failed: true;
    name: string;
    rarity: string;
    quality: number;
    effect: {};
    primaryKeys: string[];
    instanceId: number;
    success: number;
    proficiencyGain: number;
    progress: {
        isBlacksmith: boolean;
        level: number;
        proficiency: number;
        required: number;
        bonus: number;
    };
} | {
    needsConfirm: false;
    failed: false;
    name: string;
    rarity: string;
    quality: number;
    effect: Record<string, number>;
    primaryKeys: string[];
    instanceId: number;
    success: number;
    proficiencyGain: number;
    progress: {
        isBlacksmith: boolean;
        level: number;
        proficiency: number;
        required: number;
        bonus: number;
    };
}>;
type ReforgeRow = RowDataPacket & {
    id: number;
    item_id: number;
    name: string;
    item_category: string;
    weapon_type: string;
    required_level: number;
    equipped: number;
};
export declare const reforgeEquipmentList: (qqUserId: string) => Promise<{
    id: number;
    name: string;
    category: string;
    subtype: string;
    level: number;
}[]>;
export declare const reforgePreview: (qqUserId: string, instanceId: number) => Promise<{
    materials: {
        name: string;
        owned: number;
        quantity: number;
        code: string;
    }[];
    fee: number;
    source: ReforgeRow;
    targetLevel: number;
    discount: number;
    requirements: {
        quantity: number;
        code: string;
    }[];
    ratio: number;
}>;
export declare const reforgeEquipment: (qqUserId: string, instanceId: number) => Promise<{
    name: string;
    instanceId: number;
    rarity: string;
    level: number;
    discount: number;
    fee: number;
    effect: Record<string, number>;
    primaryKeys: string[];
}>;
type EpicRecipeMaterialView = {
    category: string;
    itemId: number;
    recipeQuantity: number;
    code: string;
    name: string;
    required: number;
    owned: number;
};
export declare const epicForgeBlueprints: (qqUserId: string) => Promise<{
    recipe: EpicForgeRecipe;
    blueprintQuantity: number;
}[]>;
export declare const epicForgePreview: (qqUserId: string, blueprintCode: string) => Promise<{
    recipe: EpicForgeRecipe;
    materials: EpicRecipeMaterialView[];
    ready: boolean;
    fee: number;
}>;
export declare const craftEpicForgeEquipment: (qqUserId: string, blueprintCode: string) => Promise<{
    name: string;
    quality: number;
    effect: Record<string, unknown>;
    primaryKeys: string[];
    instanceId: number;
    fee: number;
    progress: {
        isBlacksmith: boolean;
        level: number;
        proficiency: number;
        required: number;
        bonus: number;
    };
    setCode: import("../config/epic-forging").EpicSetCode | null;
    weaponEffect: string | null;
}>;
export declare const blacksmithQuest: (qqUserId: string) => Promise<{
    status: string;
    wood: number;
    core: number;
}>;
export declare const acceptBlacksmithQuest: (qqUserId: string) => Promise<boolean>;
export declare const claimBlacksmithQuest: (qqUserId: string) => Promise<{
    name: string;
    characterName: string;
    giftName: string;
}>;
export {};
