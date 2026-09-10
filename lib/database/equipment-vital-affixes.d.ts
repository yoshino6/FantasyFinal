import type { Pool, PoolConnection } from 'mysql2/promise';
export declare const halveEquipmentVitalAffixes: (value: unknown, primary?: unknown) => Record<string, unknown> | null;
export declare const migrateEquipmentVitalAffixes: (pool: Pool, refresh: (connection: PoolConnection, characterId: number) => Promise<unknown>) => Promise<boolean>;
