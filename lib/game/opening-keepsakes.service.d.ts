import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
export declare const keepsakeView: (user: string, code: string) => Promise<{
    away: boolean;
    definition: import("./opening-keepsakes.config").KeepsakeDefinition;
    row: RowDataPacket;
    record: Record<string, any>;
}>;
export declare const serveBasicOpeningMeal: (c: PoolConnection, id: number) => Promise<string>;
export declare const keepsakeAction: (user: string, code: string, action: string, value?: string) => Promise<string>;
