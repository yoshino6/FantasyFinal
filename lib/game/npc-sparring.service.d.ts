import type { PoolConnection } from 'mysql2/promise';
export declare const sparBusinessDate: (date?: Date) => string;
export declare const npcSparringView: (userId: string, code: string) => Promise<{
    profile: {
        code: string;
        name: string;
        level: number;
        band: [number, number];
        worldStage: number;
        profession: string;
        advancedCode: string | undefined;
        advancedName: string;
        advancedEffect: Record<string, number>;
        trainedAttributes: import("./types").Allocation;
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
    used: boolean;
}>;
export declare const startNpcSparring: (userId: string, code: string) => Promise<{
    sessionId: `${string}-${string}-${string}-${string}-${string}`;
    profile: {
        code: string;
        name: string;
        level: number;
        band: [number, number];
        worldStage: number;
        profession: string;
        advancedCode: string | undefined;
        advancedName: string;
        advancedEffect: Record<string, number>;
        trainedAttributes: import("./types").Allocation;
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
}>;
export declare const finishNpcSparring: (connection: PoolConnection, sessionId: string, result: "victory" | "defeat" | "escaped" | "timeout") => Promise<string>;
