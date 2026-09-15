import type { PoolConnection } from 'mysql2/promise';
import { type Allocation } from './types';
type RecordInput = {
    characterId: number;
    kind: string;
    source: {
        system: string;
        id: string | number;
        step: string;
    };
    outcome: string;
    summary: string;
    detail: Record<string, unknown>;
    rootOperationId?: number;
    existingEventId?: number;
    correlationId?: string;
    actorRole?: 'player' | 'system' | 'admin';
    scoreKey?: string;
};
export declare const recordCharacterOperation: (connection: PoolConnection, input: RecordInput) => Promise<{
    factId: number;
    duplicate: boolean;
    effectiveUnits: number;
}>;
export declare const listCharacterOperations: (userId: string, options?: {
    kind?: string;
    outcome?: string;
    cursor?: number;
    limit?: number;
}) => Promise<{
    rows: {
        id: number;
        kind: string;
        category: import("./character-operation-kinds").OperationCategory;
        title: string;
        summary: string;
        outcome: string;
        actorRole: "player" | "system" | "admin" | null;
        occurredAt: Date;
        weights: Allocation;
        points: number;
        pointDelta: Allocation;
        scoreReason: string;
        mappingStatus: string;
    }[];
    nextCursor: number | null;
}>;
export declare const getCharacterOperationDetail: (userId: string, factId: number) => Promise<{
    source: {
        system: string;
        id: string;
        step: string;
    };
    rootOperationId: number | null;
    detail: any;
    rawPoints: number;
    id: number;
    kind: string;
    category: import("./character-operation-kinds").OperationCategory;
    title: string;
    summary: string;
    outcome: string;
    actorRole: "player" | "system" | "admin" | null;
    occurredAt: Date;
    weights: Allocation;
    points: number;
    pointDelta: Allocation;
    scoreReason: string;
    mappingStatus: string;
} | null>;
export declare const characterTendencyBalance: (userId: string) => Promise<{
    earned: Allocation;
    spent: Allocation;
    mutation: Allocation;
    version: number;
} | null>;
export {};
