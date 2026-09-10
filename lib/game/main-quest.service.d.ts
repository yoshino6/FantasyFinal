import type { PoolConnection } from 'mysql2/promise';
export type MainQuest = {
    title: string;
    description: string;
    action?: {
        label: string;
        command: string;
    };
    actions?: {
        label: string;
        command: string;
    }[];
};
type BarrierStage = 0 | 1 | 2 | 3 | 4;
export declare const currentMainQuest: (qqUserId: string, skipLamplight?: boolean) => Promise<MainQuest>;
export declare const startGoblinKingQuest: (qqUserId: string) => Promise<string>;
export declare const consultVivianForJudicator: (qqUserId: string) => Promise<string>;
export declare const buyCelestialJudicator: (qqUserId: string) => Promise<{
    x: number;
    y: number;
    text: string;
}>;
export declare const goblinKingArrival: (connection: PoolConnection, characterId: number, regionId: number, regionCode: string, x: number, y: number, z: number) => Promise<{
    clue: boolean;
    chapter: number;
    text: string;
} | null>;
export declare const continueGoblinKingArrival: (qqUserId: string) => Promise<{
    ready: boolean;
    chapter: number;
    text: string;
    bossSpawnId?: undefined;
} | {
    ready: boolean;
    chapter: number;
    bossSpawnId: number;
    text: string;
}>;
export declare const completeGoblinKingQuest: (connection: PoolConnection, targets: Array<{
    traits_json?: unknown;
}>) => Promise<boolean>;
type EvolutionSource = 'guild' | 'hall' | 'reading' | 'archive' | 'rest';
export declare const evolutionQuestStage: (qqUserId: string) => Promise<number>;
export declare const advanceEvolutionQuest: (qqUserId: string, source: EvolutionSource) => Promise<{
    stage: number;
    changed: boolean;
}>;
export declare const openGaStudy: (qqUserId: string) => Promise<{
    spawnId: number;
    created: boolean;
}>;
export declare const completeEvolutionQuest: (connection: PoolConnection, targets: Array<{
    traits_json?: unknown;
}>) => Promise<boolean>;
export declare const contemplateEvolutionSeed: (qqUserId: string) => Promise<{
    name: string;
}>;
export declare const contemplateSkyDust: (qqUserId: string) => Promise<{
    name: string;
}>;
export declare const advanceRealmBarrier: (qqUserId: string, source: "guild" | "alchemist") => Promise<{
    previous: BarrierStage;
    stage: BarrierStage;
}>;
export {};
