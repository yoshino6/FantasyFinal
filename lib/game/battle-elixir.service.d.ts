import type { PoolConnection } from 'mysql2/promise';
export declare const applyBattleElixir: (connection: PoolConnection, id: number, effect: {
    experienceBonusPct?: number;
    partyDropBonusPct?: number;
    battleCount?: number;
}) => Promise<{
    consumed: boolean;
    message: string;
}>;
