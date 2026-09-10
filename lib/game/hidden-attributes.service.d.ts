import type { PoolConnection } from 'mysql2/promise';
export declare const hiddenAttributesFor: (connection: PoolConnection, characterId: number) => Promise<{
    luck: number;
    charm: number;
}>;
