export type ConstructionCategory = '基材' | '构件' | '异械';
export type ConstructionIngredient = {
    code: string;
    quantity: number;
};
export type ConstructionRecipe = {
    code: string;
    name: string;
    description: string;
    ingredients: ConstructionIngredient[];
    outputType: 'material' | 'equipment' | 'consumable' | 'device';
    itemCategory: string;
    constructionCategory: ConstructionCategory;
    recommendedSecondaryLevel: number;
    blueprintCode: string;
    effect?: Record<string, unknown>;
};
export declare const constructionRecipes: ConstructionRecipe[];
export declare const constructionRecipeByCode: Map<string, ConstructionRecipe>;
export declare const requiresConstructionBlueprint: (recipe: ConstructionRecipe) => boolean;
export declare const activeDeviceCodes: Set<string>;
export declare const deviceCodes: Set<string>;
export declare const courseDeviceBlueprints: readonly [readonly [1, "emergency_evasion_module"], readonly [2, "simple_launcher"], readonly [3, "weave_repair_swarm"], readonly [4, "gravity_tether"], readonly [5, "shock_pile_launcher"], readonly [6, "counter_spider"], readonly [7, "electromagnetic_coil_cannon"], readonly [8, "autonomous_repair_arm"], readonly [9, "micro_reactor_pack"], readonly [10, "rocket_propeller"], readonly [11, "rail_stabilizer"]];
export declare const affinityBlueprints: readonly [{
    readonly affinity: 200;
    readonly level: 6;
    readonly code: "inverse_buffer";
}];
export declare const workshopBlueprints: readonly [{
    readonly code: "auxiliary_aiming_scope";
    readonly price: 80;
}, {
    readonly code: "precision_scope";
    readonly price: 120;
}, {
    readonly code: "recycling_hammer";
    readonly price: 160;
}];
export declare const blindBoxBlueprints: readonly [{
    readonly code: "starter_device_blueprint_box";
    readonly name: "异械盲盒·入门";
    readonly price: 80;
    readonly requiredLevel: 1;
    readonly outputs: readonly ["easter_egg_thrower", "critical_glove"];
}, {
    readonly code: "advanced_device_blueprint_box";
    readonly name: "异械盲盒·进阶";
    readonly price: 240;
    readonly requiredLevel: 5;
    readonly outputs: readonly ["frost_pulse_interferer", "mana_accumulator"];
}];
export declare const dungeonBlueprintDrops: readonly [{
    readonly code: "muscle_pacer";
    readonly floor: 1;
    readonly chance: 0.1;
    readonly chestTypes: readonly ["silver", "gold"];
}, {
    readonly code: "fold_barrier_generator";
    readonly floor: 2;
    readonly chance: 0.07;
    readonly chestTypes: readonly ["gold"];
}, {
    readonly code: "phase_decoy_pod";
    readonly floor: 3;
    readonly chance: 0.05;
    readonly chestTypes: readonly ["boss_gold"];
}];
export declare const baseMaterialTradeValues: Record<string, number>;
export declare const constructionValueByCode: Map<string, number>;
export declare const constructionBlueprintCodes: Set<string>;
export declare const blueprintRecipeCode: (blueprintCode: string) => string | null;
export declare const constructionRefundRate: (gap: number) => 0 | 0.7 | 0.6 | 0.8;
export declare const constructionSuccessRate: (recommendedLevel: number, currentLevel: number) => number;
export declare const constructionGapFor: (recipe: ConstructionRecipe, currentLevel: number) => number;
