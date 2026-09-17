import type { Pool, PoolConnection } from 'mysql2/promise';
import { type EquippedEnchantment } from './equipment-enchantment-effects';
export type MonsterTrackingTier = 'normal' | 'large' | 'elite' | 'boss';
export type TrackedMonster = {
    spawnId: number;
    name: string;
    monsterClass: MonsterTrackingTier;
    regionId: number;
    x: number;
    y: number;
    z: number;
    remainingMoves: number;
    sourceSignature: string;
    markedAt: string;
};
export type ExplorationCardProfile = {
    tracking?: {
        sourceSignature: string;
        maxTargets: number;
        maxTier: MonsterTrackingTier;
        moveDuration: number;
    };
    movementCharge?: {
        sourceSignature: string;
        requiredMoves: number;
        bonus: number;
    };
};
export declare const explorationCardProfileFromEnchantments: (enchantments: EquippedEnchantment[]) => ExplorationCardProfile;
export declare const explorationCardProfile: (connection: Pool | PoolConnection, characterId: number) => Promise<ExplorationCardProfile>;
export declare const refreshExplorationEquipmentState: (connection: PoolConnection, characterId: number) => Promise<void>;
export declare const chargedMapMoveBonus: (connection: Pool | PoolConnection, characterId: number) => Promise<number>;
export declare const recordCardMovement: (connection: PoolConnection, characterId: number, location: {
    regionId: number;
    z: number;
}, options?: {
    legalMove?: boolean;
    forcedEvent?: boolean;
    teleport?: boolean;
}) => Promise<{
    tracked: {
        remainingMoves: number;
        spawnId: number;
        name: string;
        monsterClass: MonsterTrackingTier;
        regionId: number;
        x: number;
        y: number;
        z: number;
        sourceSignature: string;
        markedAt: string;
    }[];
    charge: number;
    ready: boolean;
    chargedBonus: number;
}>;
export declare const resetCardMovementCharge: (connection: PoolConnection, characterIds: readonly number[]) => Promise<void>;
export declare const canTrackMonsterClass: (monsterClass: string, maxTier: MonsterTrackingTier) => boolean;
export declare const trackingTargetForbiddenReason: (target: {
    templateCode?: string;
    traitsJson?: unknown;
}) => "转职试炼与域民目标不能追迹。" | "临时召唤物不能独立追迹。" | "首领虚拟部位不能独立追迹，请标记本体。" | "追迹不会暴露正在追捕你的执法者位置。" | undefined;
export declare const markTrackedMonster: (connection: PoolConnection, characterId: number, target: {
    spawnId: number;
    name: string;
    monsterClass: string;
    templateCode?: string;
    traitsJson?: unknown;
    regionId: number;
    x: number;
    y: number;
    z: number;
}) => Promise<{
    marked: TrackedMonster;
    tracked: TrackedMonster[];
    maxTargets: number;
}>;
export declare const trackedMonsterList: (connection: Pool | PoolConnection, characterId: number, location: {
    regionId: number;
    z: number;
}) => Promise<{
    tracked: TrackedMonster[];
    maxTargets: number;
    active: boolean;
}>;
export declare const cancelTrackedMonster: (connection: PoolConnection, characterId: number, spawnId: number) => Promise<TrackedMonster[]>;
export declare const highestElementResistance: (raw: unknown) => {
    element: "水" | "火" | "土" | "木" | "风" | "冰" | "雷" | "光" | "暗" | "金";
    value: number;
};
export declare const revealHighestElementResistance: (connection: Pool | PoolConnection, characterId: number, spawnId: number, raw: unknown) => Promise<{
    element: string;
    value: number;
} | undefined>;
