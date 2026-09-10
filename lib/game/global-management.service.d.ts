import type { PoolConnection } from 'mysql2/promise';
export type GlobalMultiplierKey = 'experience_multiplier' | 'drop_multiplier' | 'copper_multiplier';
export type GlobalSettings = Record<GlobalMultiplierKey, number>;
export declare const globalSettings: (connection?: PoolConnection) => Promise<{
    experience_multiplier: number;
    drop_multiplier: number;
    copper_multiplier: number;
}>;
export declare const setGlobalMultiplier: (key: GlobalMultiplierKey, value: number) => Promise<number>;
export declare const globalExperienceMultiplier: (connection: PoolConnection) => Promise<number>;
export declare const globalDropMultiplier: (connection: PoolConnection) => Promise<number>;
export declare const globalCopperMultiplier: (connection: PoolConnection) => Promise<number>;
export declare const managedMaps: () => Promise<{
    code: string;
    name: string;
    description: string;
    enabled: boolean;
}[]>;
export declare const setManagedMapEnabled: (code: string, enabled: boolean) => Promise<{
    name: string;
    enabled: boolean;
    moved: number;
    removed: number;
}>;
