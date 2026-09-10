export declare const hiddenParticles: readonly [{
    readonly code: "water_element_dust";
    readonly name: "水微尘";
    readonly element: "水";
    readonly role: "即时恢复";
}, {
    readonly code: "fire_element_dust";
    readonly name: "火微尘";
    readonly element: "火";
    readonly role: "爆发与灼烧";
}, {
    readonly code: "metal_element_dust";
    readonly name: "土相微尘";
    readonly element: "土";
    readonly role: "护盾与承伤";
}, {
    readonly code: "wood_element_dust";
    readonly name: "木微尘";
    readonly element: "木";
    readonly role: "持续再生";
}, {
    readonly code: "wind_element_dust";
    readonly name: "风微尘";
    readonly element: "风";
    readonly role: "扩散至多目标";
}, {
    readonly code: "ice_element_dust";
    readonly name: "冰微尘";
    readonly element: "冰";
    readonly role: "减速与冻结";
}, {
    readonly code: "thunder_element_dust";
    readonly name: "雷微尘";
    readonly element: "雷";
    readonly role: "冲击与眩晕";
}, {
    readonly code: "light_element_dust";
    readonly name: "光微尘";
    readonly element: "光";
    readonly role: "净化与护盾";
}, {
    readonly code: "dark_element_dust";
    readonly name: "暗微尘";
    readonly element: "暗";
    readonly role: "侵蚀双防";
}, {
    readonly code: "energy_ember";
    readonly name: "能量余烬";
    readonly element: "奥术";
    readonly role: "延续与分段释放";
}, {
    readonly code: "magic_unit";
    readonly name: "魔力微弧";
    readonly element: "奥术";
    readonly role: "提高伤害";
}, {
    readonly code: "blood_residue";
    readonly name: "血肉残渣";
    readonly element: "无";
    readonly role: "提高回复";
}];
export type HiddenParticleCode = typeof hiddenParticles[number]['code'];
export type MixOutcome = 'failure' | 'success' | 'great';
export type MixCatalyst = 'stable' | 'excite' | undefined;
export type MixBranch = {
    code: HiddenParticleCode;
    element: string;
    weight: number;
    damage: number;
    heal: number;
    regeneration: number;
    shield: number;
    slow: number;
    defenseDown: number;
    burn: number;
    damageScale: number;
    healScale: number;
    stateScale: number;
    control?: {
        code: 'freeze' | 'stun';
        chance: number;
    };
};
export declare const diminishingParticle: (count: number) => number;
export declare const validateHiddenParticles: (particles: readonly string[]) => HiddenParticleCode[];
export declare const hiddenMixProbability: (count: number, catalyst?: MixCatalyst, kettle?: boolean) => {
    failure: number;
    success: number;
    great: number;
};
export declare const rollHiddenMix: (count: number, catalyst?: MixCatalyst, kettle?: boolean, random?: () => number) => MixOutcome;
export declare const hiddenMix: (input: readonly string[], outcome?: MixOutcome, kettle?: boolean) => {
    primary: "metal_element_dust" | "magic_unit" | "thunder_element_dust" | "energy_ember" | "water_element_dust" | "blood_residue" | "wood_element_dust" | "fire_element_dust" | "ice_element_dust" | "dark_element_dust" | "light_element_dust" | "wind_element_dust";
    particles: ("metal_element_dust" | "magic_unit" | "thunder_element_dust" | "energy_ember" | "water_element_dust" | "blood_residue" | "wood_element_dust" | "fire_element_dust" | "ice_element_dust" | "dark_element_dust" | "light_element_dust" | "wind_element_dust")[];
    counts: Record<"metal_element_dust" | "magic_unit" | "thunder_element_dust" | "energy_ember" | "water_element_dust" | "blood_residue" | "wood_element_dust" | "fire_element_dust" | "ice_element_dust" | "dark_element_dust" | "light_element_dust" | "wind_element_dust", number>;
    branches: MixBranch[];
    targets: number;
    normalTargets: number;
    duration: number;
    normalDuration: number;
    mana: number;
    cooldown: number;
    radiusScale: number;
    outcome: MixOutcome;
    numericScale: number;
    stateScale: number;
    failureDamageScale: number;
    healCap: number;
    shieldCap: number;
    slowCap: number;
    defenseCap: number;
};
export declare const hiddenBranchDamage: (mix: ReturnType<typeof hiddenMix>, branch: MixBranch, magic: number, defense: number) => number;
export declare const hiddenBranchHealing: (mix: ReturnType<typeof hiddenMix>, branch: MixBranch, hpMax: number) => number;
