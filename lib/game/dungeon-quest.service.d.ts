import type { PoolConnection } from 'mysql2/promise';
export declare const discoverDungeonEntrance: (connection: PoolConnection, characterId: number, dungeonId: number, regionId: number, posX: number, posY: number) => Promise<{
    stage: number;
    newMark: boolean;
    started: boolean;
    rebound?: undefined;
} | {
    stage: number;
    newMark: boolean;
    started: boolean;
    rebound: boolean;
}>;
export declare const dungeonSecretProgress: (qqUserId: string) => Promise<{
    stage: number;
    dungeonId: number | null;
    status: string;
    hasPass: boolean;
    level: number;
    hasSecondaryProfession: boolean;
}>;
export declare const secondaryProfessionGuide: (qqUserId: string) => Promise<boolean>;
export declare const consultDungeonAtGuild: (qqUserId: string) => Promise<string>;
export declare const consultDungeonAtWorkshop: (qqUserId: string) => Promise<string>;
export declare const completeDungeonSecretPurchase: (connection: PoolConnection, characterId: number) => Promise<void>;
export declare const buyOddWorkshopItem: (qqUserId: string, code: string) => Promise<{
    name: string;
    price: number;
    rewardName: string | undefined;
}>;
export declare const oddWorkshopDungeonCatalog: (qqUserId: string) => Promise<{
    code: string;
    name: string;
    description: string;
    category: string;
    price: number;
    stock: number;
    owned: number;
}[]>;
export declare const entranceStory: (qqUserId: string, dungeonId: number) => Promise<{
    stage: number;
    text: string;
}>;
export declare const authorizeDungeonEntry: (connection: PoolConnection, characterId: number, dungeonId: number) => Promise<void>;
export declare const completeDungeonSecretForLeader: (connection: PoolConnection, characterIds: number[], spawnIds: number[]) => Promise<boolean>;
export declare const markedDungeonEntrances: (qqUserId: string, regionCode: string) => Promise<{
    id: number;
    x: number;
    y: number;
    name: string;
}[]>;
