export type EpicSetCode = 'mountainheart_regalia' | 'valk_forge_regalia' | 'mistmother_cocoon' | 'goblin_court_hunt';
export type EpicArmorSlot = '头肩' | '上装' | '腰部' | '下装' | '脚部';
export type EpicForgeRecipe = {
    code: string;
    blueprintCode: string;
    name: string;
    description: string;
    bossCode: string;
    bossName: string;
    category: '武器' | EpicArmorSlot;
    subtype: string;
    setCode?: EpicSetCode;
    weaponEffect?: string;
    materials: Array<{
        code: string;
        quantity: number;
    }>;
};
type SetProfile = {
    code: EpicSetCode;
    name: string;
    armorType: '布甲' | '皮甲' | '重甲' | '板甲';
    bossCode: string;
    bossName: string;
    regionMaterial: string;
    bossPart: string;
    armorNames: Record<EpicArmorSlot, string>;
    weaponEntries: Array<[string, string, string, string]>;
};
export declare const rareForgeMaterials: readonly [{
    readonly code: "meteor_iron";
    readonly name: "陨铁锻锭";
    readonly description: "自天外坠落后反复锻净的沉重铁锭，是史诗装备的基础骨架。";
    readonly hourlyAttempts: 5;
    readonly attemptChance: 1;
    readonly perRegionActiveCap: 30;
    readonly minRegionLevel: 20;
    readonly miningSeconds: number;
    readonly yields: readonly [1, 2, 3];
    readonly weights: readonly [0.4, 0.4, 0.2];
}, {
    readonly code: "star_copper";
    readonly name: "星铜锻锭";
    readonly description: "带有微弱星辉的高导性锻锭，用于固定史诗装备的精炼结构。";
    readonly hourlyAttempts: 1;
    readonly attemptChance: 1;
    readonly perRegionActiveCap: 10;
    readonly minRegionLevel: 20;
    readonly miningSeconds: number;
    readonly yields: readonly [1, 2, 3];
    readonly weights: readonly [0.6, 0.3, 0.1];
}, {
    readonly code: "moon_silver";
    readonly name: "月银锻锭";
    readonly description: "在月光下仍保持柔韧的银白锻锭，是史诗装备的稀有结合材。";
    readonly hourlyAttempts: 1;
    readonly attemptChance: 0.5;
    readonly perRegionActiveCap: 3;
    readonly minRegionLevel: 20;
    readonly miningSeconds: number;
    readonly yields: readonly [1, 2, 3];
    readonly weights: readonly [0.8, 0.15, 0.05];
}, {
    readonly code: "sun_gold";
    readonly name: "曜金合锭";
    readonly description: "以极高温度熔合的金色核心锭，能令史诗装备承受完整的力量回路。";
    readonly hourlyAttempts: 1;
    readonly attemptChance: 0.2;
    readonly perRegionActiveCap: 1;
    readonly minRegionLevel: 20;
    readonly miningSeconds: number;
    readonly yields: readonly [1, 2, 3];
    readonly weights: readonly [0.95, 0.04, 0.01];
}];
export declare const regionalForgeMaterials: readonly [{
    readonly regionCode: "dark_forest_deep";
    readonly code: "duskvein_crystal";
    readonly name: "幽纹黑晶";
    readonly description: "深根岩层中析出的暗紫晶簇，是王庭遗迹与古木根系共同浸染出的稳定锻材。";
}, {
    readonly regionCode: "ridge_foothills";
    readonly code: "ridge_core";
    readonly name: "岩脊核心";
    readonly description: "山体岩脉中凝出的稳定土性锻材。";
}, {
    readonly regionCode: "rediron_pass";
    readonly code: "fire_crystal";
    readonly name: "炉心赤晶";
    readonly description: "沿熔岩岩脉生长的赤色晶矿，研磨后可作为高温锻造结合剂。";
}, {
    readonly regionCode: "mistalgae_marsh";
    readonly code: "marsh_heart";
    readonly name: "雾沼心";
    readonly description: "含水木活性的湿地锻材。";
}];
export declare const epicForgeRecipes: EpicForgeRecipe[];
export declare const epicSetProfile: (code: string) => SetProfile | null;
export declare const epicRecipeByBlueprint: (code: string) => EpicForgeRecipe | null;
export declare const epicRecipesByBoss: (bossCode: string) => EpicForgeRecipe[];
export {};
