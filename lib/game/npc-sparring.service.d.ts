import type { PoolConnection } from 'mysql2/promise';
export declare const sparBusinessDate: (date?: Date) => string;
export declare const npcSparringView: (userId: string, code: string) => Promise<{
    profile: {
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
        birthAttributes: import("./types").Allocation;
        fixedGrowth: import("./types").Allocation;
        trainedAttributes: import("./types").Allocation;
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
    used: boolean;
}>;
export declare const startNpcSparring: (userId: string, code: string) => Promise<{
    sessionId: `${string}-${string}-${string}-${string}-${string}`;
    profile: {
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
        birthAttributes: import("./types").Allocation;
        fixedGrowth: import("./types").Allocation;
        trainedAttributes: import("./types").Allocation;
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
}>;
export declare const finishNpcSparring: (connection: PoolConnection, sessionId: string, result: "victory" | "defeat" | "escaped" | "timeout") => Promise<string>;
