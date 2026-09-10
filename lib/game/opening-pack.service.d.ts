import type { PoolConnection } from 'mysql2/promise';
export declare const openingPackExtras: Record<string, {
    items?: [string, number][];
    services?: [string, number][];
}>;
export declare const grantOpeningPackExtras: (c: PoolConnection, id: number, pack: string) => Promise<boolean>;
export declare const repairClaimedOpeningPack: (c: PoolConnection, id: number) => Promise<boolean>;
export declare const openingProfessionWeapons: Record<string, string>;
export declare const grantOpeningProfessionWeapon: (c: PoolConnection, id: number, profession: string) => Promise<{
    id: number;
    name: string;
} | null>;
