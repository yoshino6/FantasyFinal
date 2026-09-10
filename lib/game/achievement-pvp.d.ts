import type { PoolConnection } from 'mysql2/promise';
export declare const recordPvpAchievements: (c: PoolConnection, battleId: string, winnerId: number) => Promise<void>;
