import type { PoolConnection } from 'mysql2/promise';
export declare const recordPveCombatSettlement: (connection: PoolConnection, sessionId: string, outcome: "victory" | "defeat" | "escaped", sourceRole?: "player" | "system" | "admin") => Promise<void>;
