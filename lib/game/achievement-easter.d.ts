import type { PoolConnection } from 'mysql2/promise';
export declare const achievementBattleOutcome: (c: PoolConnection, sessionId: string, outcome: "victory" | "defeat" | "escape", members: Record<string, any>[], targets: Record<string, any>[], bosses?: Record<string, any>[]) => Promise<void>;
