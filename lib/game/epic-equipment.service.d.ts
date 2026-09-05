import type { Pool, PoolConnection } from 'mysql2/promise';
import type { EpicSetCode } from '../config/epic-forging';
export type EpicLoadout = {
    setCode: EpicSetCode | null;
    setCount: number;
    weaponEffects: string[];
};
export declare const epicLoadoutFor: (connection: Pool | PoolConnection, characterId: number) => Promise<EpicLoadout>;
export declare const hasEpicWeaponEffect: (loadout: EpicLoadout, code: string) => boolean;
export declare const applyEpicSetPanelStats: <T extends {
    hpMax: number;
}>(stats: T, loadout: EpicLoadout) => T;
