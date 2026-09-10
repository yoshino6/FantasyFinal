import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../database/pool';
type Connection = PoolConnection | Awaited<ReturnType<typeof getPool>>;
export type WebRole = 'owner' | 'admin' | 'viewer';
export type OperationRisk = 'low' | 'medium' | 'high';
export type OperationInput = {
    actorRef: string;
    actionType: string;
    risk?: OperationRisk;
    reason?: string;
    target?: {
        kind: string;
        id: string | number;
        playerId?: number | null;
        characterId?: number | null;
        regionId?: number | null;
    };
    request?: Record<string, unknown>;
    result?: Record<string, unknown>;
    status?: 'committed' | 'failed' | 'rolled_back';
    correlationId?: string;
};
export declare const recordWebOperation: (input: OperationInput, connection?: Connection) => Promise<{
    id: `${string}-${string}-${string}-${string}-${string}`;
    correlationId: string;
}>;
export declare const webOperationJournal: (page?: number, keyword?: string) => Promise<{
    page: number;
    total: number;
    totalPages: number;
    entries: {
        id: string;
        correlationId: string;
        actor: string;
        action: string;
        status: string;
        risk: string;
        reason: string;
        createdAt: Date;
        target: {
            kind: string;
            id: string | null;
        } | null;
    }[];
}>;
export {};
