export declare const particleCodes: readonly ["blood_residue", "energy_ember", "magic_unit", "wood_element_dust", "metal_element_dust", "water_element_dust", "ice_element_dust", "fire_element_dust", "thunder_element_dust", "wind_element_dust", "light_element_dust", "dark_element_dust"];
export type ParticleCode = (typeof particleCodes)[number];
export type DeconstructionItem = {
    code: string;
    name: string;
    description?: string | null;
    item_category: string;
    item_type: string;
    trade_price?: number | string | null;
    rarity?: string | null;
    effect_json?: unknown;
};
type WeightedProfile = {
    kind: 'weighted';
    weights: Partial<Record<ParticleCode, number>>;
    budget: number;
    proficiency: number;
};
type OrdinaryProfile = {
    kind: 'ordinary';
    blood: number;
    ember: number;
    proficiency: number;
};
type MagicalBeastProfile = {
    kind: 'magical_beast';
    proficiency: number;
};
type ForgeOutput = {
    code: ParticleCode;
    decay: number;
    limit: number;
};
type ForgeProfile = {
    kind: 'forge';
    outputs: ForgeOutput[];
    proficiency: number;
};
type SlimeProfile = {
    kind: 'slime';
    element: ParticleCode;
    proficiency: number;
};
type MonsterProfile = {
    kind: 'monster';
    weights: Partial<Record<ParticleCode, number>>;
    particleValue: number;
    magicChance: number;
    proficiency: number;
};
type FixedChanceProfile = {
    kind: 'fixed_chance';
    outputs: Array<{
        code: ParticleCode;
        chance: number;
    }>;
    proficiency: number;
};
export type DeconstructionProfile = WeightedProfile | OrdinaryProfile | MagicalBeastProfile | ForgeProfile | SlimeProfile | MonsterProfile | FixedChanceProfile;
export type DeconstructionPreview = {
    code: ParticleCode;
    name: string;
    expected: number;
    min: number;
    max: number;
    rare: boolean;
};
export declare const particleNames: Record<ParticleCode, string>;
export declare const particleValues: Record<ParticleCode, number>;
export declare const isRareParticle: (code: string) => code is ParticleCode;
export declare const deconstructionBudget: (value: number) => number;
export declare const deconstructionProfileFor: (item: DeconstructionItem) => DeconstructionProfile | null;
export declare const deconstructionBlockReason: (item: DeconstructionItem) => string | null;
export declare const chainedExpectation: (firstChance: number, decay: number, limit: number) => number;
export declare const rareParticleChance: (candidateExpected: number, ordinaryChance: number) => number;
export declare const deconstructionPreviewFor: (profile: DeconstructionProfile, bonusMultiplier?: number) => DeconstructionPreview[];
export declare const rollDeconstructionProfile: (profile: DeconstructionProfile, bonusMultiplier?: number, random?: () => number) => Map<"metal_element_dust" | "magic_unit" | "thunder_element_dust" | "energy_ember" | "water_element_dust" | "blood_residue" | "wood_element_dust" | "fire_element_dust" | "ice_element_dust" | "dark_element_dust" | "light_element_dust" | "wind_element_dust", number>;
export declare const deconstructionProficiencyFor: (profile: DeconstructionProfile) => number;
export declare const deconstructionPreviewText: (profile: DeconstructionProfile, bonusMultiplier?: number) => string;
export {};
