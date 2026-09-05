import { type Allocation } from './types';
export declare const sparBuildingPersonas: Record<string, string>;
export declare const canonicalSparNpc: (code: string) => string;
export declare const canSparNpc: (code: string, kind?: string) => boolean;
export declare const sparRegionBands: Record<string, [number, number]>;
export declare const buildNpcSparProfile: (npc: {
    code: string;
    name: string;
    description: string;
    region_code: string;
}, playerLevel: number, worldStage: number) => {
    code: string;
    name: string;
    level: number;
    band: [number, number];
    worldStage: number;
    profession: string;
    advancedCode: string | undefined;
    advancedName: string;
    advancedEffect: Record<string, number>;
    trainedAttributes: Allocation;
    stats: import("./types").DerivedStats;
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
};
export type NpcSparProfile = ReturnType<typeof buildNpcSparProfile>;
export declare const carriedSparSkills: (profile: Pick<NpcSparProfile, "rotation" | "passives">) => string[];
