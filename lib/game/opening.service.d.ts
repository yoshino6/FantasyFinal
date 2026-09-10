import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { type OpeningConnection } from './opening-state';
import type { OpeningEntry, OpeningView } from './opening.types';
export declare const openingCharacter: (connection: OpeningConnection, user: string, lock?: boolean) => Promise<RowDataPacket>;
export declare const grantOpeningItem: (connection: PoolConnection, id: number, code: string, quantity?: number) => Promise<void>;
export declare const openingStatus: (user: string) => Promise<OpeningView | null>;
export declare const beginOpening: (user: string, entry?: OpeningEntry) => Promise<OpeningView | null>;
export declare const advanceOpening: (user: string, revision: number, action: string) => Promise<OpeningView>;
export declare const openingMainQuest: (user: string) => Promise<{
    title: string;
    description: string;
    action: {
        label: string;
        command: string;
    };
} | null>;
