import type { PoolConnection } from 'mysql2/promise';
export declare const contractSpiritBaseMana: (count: number) => number;
export declare const advancedDynamicMana: (c: PoolConnection, session: string, id: number, code: string, pricedMana: number) => Promise<number>;
