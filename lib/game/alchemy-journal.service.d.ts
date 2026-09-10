import type { PoolConnection } from 'mysql2/promise';
import { type AlchemyBatch, type AlchemySnapshot } from './alchemy-journal';
export declare const craftJson: <T>(value: unknown) => T;
export declare const craftCharacterId: (connection: Pick<PoolConnection, "execute">, userId: string, lock?: boolean) => Promise<number>;
export declare const invalidateCraftRequests: (connection: Pick<PoolConnection, "execute">, characterId: number, kind?: string) => Promise<void>;
export declare const createCraftRequest: (connection: PoolConnection, characterId: number, kind: string, snapshot: unknown, minutes?: number) => Promise<`${string}-${string}-${string}-${string}-${string}`>;
export declare const craftRequestFor: <T>(connection: PoolConnection, characterId: number, kind: string, token: string) => Promise<{
    snapshot: T & {
        _shopSource?: string;
    };
    result: Record<string, any> | null;
}>;
export declare const completeCraftRequest: (connection: PoolConnection, characterId: number, token: string, result: unknown) => Promise<void>;
export declare const recordAlchemyJournal: (connection: PoolConnection, characterId: number, token: string, snapshot: AlchemySnapshot, batches: AlchemyBatch[], result: Record<string, any>) => Promise<number>;
export declare const alchemyJournalDetail: (userId: string, id: number) => Promise<{
    id: number;
    time: Date;
    token: string;
    snapshot: AlchemySnapshot;
    batches: AlchemyBatch[];
    result: Record<string, any>;
}>;
export declare const alchemyJournalPage: (userId: string, page?: number, scope?: string, field?: string, keyword?: string, anchor?: number) => Promise<{
    entries: {
        id: number;
        time: Date;
        token: string;
        snapshot: AlchemySnapshot;
        batches: AlchemyBatch[];
        result: Record<string, any>;
    }[];
    page: number;
    pages: number;
    count: number;
    anchor: number;
    scope: string;
    field: string;
    keyword: string;
}>;
export declare const cancelCraftPreview: (userId: string, token: string, kind?: string) => Promise<void>;
