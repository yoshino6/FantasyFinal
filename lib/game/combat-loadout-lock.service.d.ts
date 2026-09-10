import type { PoolConnection } from 'mysql2/promise';
export declare const assertCombatLoadoutMutable: (connection: PoolConnection, characterId: number) => Promise<void>;
export declare const assertHiddenInstanceMutable: (connection: PoolConnection, characterId: number, instanceId: number) => Promise<void>;
