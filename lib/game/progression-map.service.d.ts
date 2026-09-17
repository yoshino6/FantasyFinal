import type { PoolConnection } from 'mysql2/promise';
export type MapProgress = {
    adventurer_registered: number;
    opening_state?: string | null;
    destination_code?: string | null;
    region_code: string;
    realm_stage: number;
    goblin_stage: number;
    advanced_trial: number;
    advanced_profession_code?: string | null;
};
export declare const progressionMapRegions: (character: MapProgress) => string[];
export declare const ensureMapRegions: (connection: PoolConnection, characterId: number, regions: readonly string[]) => Promise<{
    granted: string[];
    stored: string[];
    unavailable: string[];
}>;
export declare const ensureProgressionMaps: (connection: PoolConnection, characterId: number) => Promise<{
    granted: string[];
    stored: string[];
    unavailable: string[];
}>;
export declare const repairProgressionMaps: (user: string) => Promise<{
    granted: string[];
    stored: string[];
    unavailable: string[];
}>;
export declare const progressionMapReceipt: (result: Awaited<ReturnType<typeof ensureMapRegions>>) => string;
