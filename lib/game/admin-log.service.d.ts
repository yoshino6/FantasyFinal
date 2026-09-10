import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../database/pool';
type Connection = PoolConnection | Awaited<ReturnType<typeof getPool>>;
export type AdminLogFilter = {
    page?: number;
    keyword?: string;
    filter?: '人员' | '操作' | '时间';
    value?: string;
};
export declare const recordAdminOperation: (operatorQqUserId: string, actionType: string, actionText: string, targetQqUserId?: string | null, connection?: Connection) => Promise<void>;
export declare const adminOperationLogs: (filter?: AdminLogFilter) => Promise<{
    page: number;
    totalPages: number;
    total: number;
    filter: "人员" | "操作" | "时间" | undefined;
    value: string;
    keyword: string;
    entries: {
        id: number;
        operatorQqUserId: string;
        operatorName: string;
        actionType: string;
        actionText: string;
        targetQqUserId: string | null;
        createdAt: Date;
    }[];
}>;
export {};
