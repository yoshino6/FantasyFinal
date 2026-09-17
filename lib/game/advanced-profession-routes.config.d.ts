export declare const advancedProfessionRoutes: {
    readonly ridge_foothills: {
        readonly regionCode: "ridge_foothills";
        readonly name: "岩脊山麓";
        readonly x: -221;
        readonly y: 0;
        readonly maps: readonly ["gravelwind_shore", "ridge_foothills"];
        readonly materialCode: "ridge_core";
        readonly materialName: "岩脊核心";
    };
    readonly rediron_pass: {
        readonly regionCode: "rediron_pass";
        readonly name: "赤铁山道";
        readonly x: 0;
        readonly y: 161;
        readonly maps: readonly ["morningdew_riverbank", "rediron_pass"];
        readonly materialCode: "fire_crystal";
        readonly materialName: "炉心赤晶";
    };
    readonly mistalgae_marsh: {
        readonly regionCode: "mistalgae_marsh";
        readonly name: "雾藻湿地";
        readonly x: 161;
        readonly y: 0;
        readonly maps: readonly ["morningdew_riverbank", "mistalgae_marsh"];
        readonly materialCode: "marsh_heart";
        readonly materialName: "雾沼心";
    };
    readonly dark_forest_deep: {
        readonly regionCode: "dark_forest_deep";
        readonly name: "幽暗密林深处";
        readonly x: 0;
        readonly y: -220;
        readonly maps: readonly ["dark_forest", "dark_forest_deep"];
        readonly materialCode: "goblin_ear";
        readonly materialName: "哥布林耳";
    };
};
export type AdvancedProfessionRoute = typeof advancedProfessionRoutes[keyof typeof advancedProfessionRoutes];
