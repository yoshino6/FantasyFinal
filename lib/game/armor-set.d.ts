import type { Pool, PoolConnection } from 'mysql2/promise';
export { armorSlot } from './armor-class';
export type ArmorSet = {
    name: string;
    count: number;
    tier: 3 | 5;
    hitCorrectionPct: number;
    evasionCorrectionPct: number;
    critAvoidanceCorrectionPct: number;
    critDamageCorrectionPct: number;
    damageReductionPct: number;
    panelPercent: Record<string, number>;
};
export declare const armorSetFromRows: (rows: readonly {
    slot: string;
    weapon_type?: string | null;
}[]) => ArmorSet | null;
export declare const armorSetsFor: (connection: Pool | PoolConnection, ids: number[]) => Promise<Map<number, ArmorSet | null>>;
export declare const armorSetDescription: (set: ArmorSet) => string;
