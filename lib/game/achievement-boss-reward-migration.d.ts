import type { Pool, PoolConnection } from 'mysql2/promise';
export declare const migrateBossAchievementRewards: (c: PoolConnection) => Promise<number[]>;
export declare const initializeBossAchievementRewards: (pool: Pool) => Promise<void>;
