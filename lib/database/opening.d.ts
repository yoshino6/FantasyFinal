import type { Pool, PoolConnection } from 'mysql2/promise';
export declare const openingSchema: string[];
export declare const releaseOpeningRouteMaps: (pool: Pool | PoolConnection) => Promise<void>;
export declare const initializeOpening: (pool: Pool) => Promise<void>;
