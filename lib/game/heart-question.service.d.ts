import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { type Allocation, type AttributeKey } from './types';
import { type HeartCard } from './heart-question-content';
type Db = Pool | PoolConnection;
type HeartGrowthRow = RowDataPacket & {
    birth_json: unknown;
    delta_json: unknown;
    offset_json: unknown;
};
export type HeartTicket = {
    id: number;
    toLevel: number;
    card: HeartCard;
    status: 'active' | 'queued' | 'deferred' | 'answered';
};
export declare const heartAttributeNames: Record<AttributeKey, string>;
export declare const ensureHeartGrowth: (connection: PoolConnection, characterId: number, birth?: Allocation) => Promise<HeartGrowthRow>;
export declare const heartGrowthAdjustment: (connection: Db, characterId: number) => Promise<{
    delta: Allocation;
    birth: Allocation;
} | null>;
export declare const applyHeartGrowthToRow: <T extends Record<string, unknown>>(connection: Db, characterId: number, row: T) => Promise<T>;
export declare const heartAttributeCorrection: (connection: Db, characterId: number, key: AttributeKey, level: number) => Promise<number>;
export declare const createHeartQuestionsForLevels: (connection: PoolConnection, characterId: number, fromLevel: number, toLevel: number, realmStage: number) => Promise<void>;
export declare const ensureHeartQuestionsForCurrentLevel: (connection: PoolConnection, userId: string) => Promise<(RowDataPacket & {
    id: number;
    level: number;
    realm_stage: number;
}) | null>;
export declare const activeHeartQuestion: (userId: string) => Promise<HeartTicket | null>;
export declare const pendingHeartQuestionCount: (userId: string) => Promise<number>;
export declare const openHeartQuestion: (userId: string) => Promise<HeartTicket | null>;
export declare const openQueuedHeartQuestion: (userId: string) => Promise<HeartTicket | null>;
export declare const skipHeartQuestion: (userId: string, ticketId: number) => Promise<void>;
export declare const answerHeartQuestion: (userId: string, ticketId: number, code: string) => Promise<{
    copy: string;
    directions: string;
}>;
export declare const answerTestHeartQuestions: (connection: PoolConnection, characterId: number) => Promise<number>;
export {};
