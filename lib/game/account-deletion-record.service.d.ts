import type { PoolConnection } from 'mysql2/promise';
export type AccountDeletionFilter = {
    page?: number;
    keyword?: string;
    filter?: '玩家' | '状态' | '时间';
    value?: string;
};
export declare class AccountRestoreConflictError extends Error {
    constructor();
}
export declare const archiveDeletedAccount: (connection: PoolConnection, qqUserId: string) => Promise<void>;
export declare const accountDeletionRecords: (filter?: AccountDeletionFilter) => Promise<{
    page: number;
    totalPages: number;
    total: number;
    filter: "玩家" | "状态" | "时间" | undefined;
    value: string;
    keyword: string;
    entries: {
        id: number;
        qqUserId: string;
        qqNickname: string | null;
        characterName: string | null;
        deletedAt: Date;
        restoredAt: Date | null;
        restoredByQqUserId: string | null;
    }[];
}>;
export declare const restoreDeletedAccount: (recordId: number, operatorQqUserId: string, overwrite?: boolean) => Promise<{
    qqUserId: string;
    characterName: string;
}>;
