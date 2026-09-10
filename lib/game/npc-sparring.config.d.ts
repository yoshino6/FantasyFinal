import { type VirtualEquipmentLoadout } from './constants';
import { type Allocation } from './types';
export declare const sparBuildingPersonas: Record<string, string>;
export declare const canonicalSparNpc: (code: string) => string;
export declare const canSparNpc: (code: string, kind?: string) => boolean;
export declare const sparRegionBands: Record<string, [number, number]>;
type NpcNumericInput = {
    level: number;
    profession: string;
    advancedCode?: string;
    equipment: VirtualEquipmentLoadout & {
        level: number;
    };
    evolution: Record<string, number>;
};
export declare const recalculateNpcSparProfileStats: (profile: NpcNumericInput) => {
    balanceVersion: number;
    birthAttributes: Allocation;
    fixedGrowth: Allocation;
    trainedAttributes: Allocation;
    stats: import("./types").DerivedStats;
    armorSet: import("./armor-set").ArmorSet | null;
    armorType: string;
};
export declare const buildNpcSparProfile: (npc: {
    code: string;
    name: string;
    description: string;
    region_code: string;
}, playerLevel: number, worldStage: number) => {
    equipment: {
        level: number;
        pieces: number;
        rarity: string;
        quality: number;
        secondaryAffixes: number;
    };
    evolution: Record<string, number>;
    injections: number;
    rotation: string[];
    passives: string[];
    pool: string[];
    balanceVersion: number;
    birthAttributes: Allocation;
    fixedGrowth: Allocation;
    trainedAttributes: Allocation;
    stats: import("./types").DerivedStats;
    armorSet: import("./armor-set").ArmorSet | null;
    armorType: string;
    code: string;
    name: string;
    level: number;
    band: [number, number];
    worldStage: number;
    profession: string;
    advancedCode: string | undefined;
    advancedName: string;
    advancedEffect: Record<string, number>;
};
export type NpcSparProfile = ReturnType<typeof buildNpcSparProfile>;
export declare const carriedSparSkills: (profile: Pick<NpcSparProfile, "rotation" | "passives">) => string[];
export {};
