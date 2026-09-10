import type { PoolConnection } from 'mysql2/promise';
export declare const achievementTrade: (c: PoolConnection, buyer: number, seller: number, item: number, paid: number, net: number, event: string) => Promise<void>;
