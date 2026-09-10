import type { Pool, PoolConnection } from 'mysql2/promise';
import type { DerivedStats } from './types';
type MasteryKey = 'physicalAttackPct' | 'magicAttackPct' | 'physicalDefensePct' | 'magicDefensePct' | 'accuracyPct' | 'critRatePct' | 'critDamagePct' | 'critResistPct' | 'critDamageReductionPct' | 'mpPct' | 'chantSpeedPct';
type MasteryBonuses = Record<MasteryKey, number> & {
    details: string[];
    offhandAttributeMultiplier: number;
};
export declare const offhandAttributeMultiplier: (focus?: unknown) => number;
export declare const weaponMasteryBonusesFor: (connection: Pool | PoolConnection, characterId: number) => Promise<MasteryBonuses>;
export declare const applyWeaponMasteryStats: (stats: DerivedStats, bonuses: MasteryBonuses) => DerivedStats;
export {};
