import type { Pool, PoolConnection } from 'mysql2/promise';
export declare const migrateTalentCodesWithConnection: (connection: PoolConnection) => Promise<number>;
export declare const migrateTalentCodes: (pool: Pool) => Promise<number>;
