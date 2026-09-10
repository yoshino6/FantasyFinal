import type { PoolConnection } from 'mysql2/promise';
export declare const openingReplay: <T>(c: Pick<PoolConnection, "execute">, id: number, scope: string, revision: number) => Promise<{
    action: string;
    result: T;
} | null>;
export declare const saveOpeningReplay: (c: Pick<PoolConnection, "execute">, id: number, scope: string, revision: number, action: string, result: unknown) => Promise<void>;
