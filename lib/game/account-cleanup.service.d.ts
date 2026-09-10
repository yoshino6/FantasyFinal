import type { PoolConnection } from 'mysql2/promise';
export declare const removePlayerAccountData: (connection: PoolConnection, qqUserId: string) => Promise<{
    characterName: string;
    endedCombats: number;
    transferredParties: number;
    disbandedParties: number;
}>;
