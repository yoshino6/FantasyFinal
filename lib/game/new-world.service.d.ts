import type { PoolConnection } from 'mysql2/promise';
export declare const newWorldPanel: (user: string) => Promise<{
    name: string;
    level: number;
    rewards: {
        level: 1 | 10 | 20 | 30;
        state: string;
    }[];
}>;
export declare const claimNewWorldOnConnection: (connection: PoolConnection, user: string, requestedLevel: number) => Promise<{
    level: 1 | 10 | 20 | 30;
    received: string[];
}>;
export declare const claimNewWorld: (user: string, level: number) => Promise<{
    level: 1 | 10 | 20 | 30;
    received: string[];
}>;
