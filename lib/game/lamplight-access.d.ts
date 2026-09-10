import type { PoolConnection } from 'mysql2/promise';
export declare const assertLamplightRegionAccess: (c: PoolConnection, id: number, code: string, partyId?: number) => Promise<void>;
