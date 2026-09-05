import { type Pool, type PoolConnection } from 'mysql2/promise';
export declare const getPool: () => Promise<Pool>;
export declare const withTransaction: <T>(work: (connection: PoolConnection) => Promise<T>) => Promise<T>;
