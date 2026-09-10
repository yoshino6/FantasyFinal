import type { Pool, PoolConnection } from 'mysql2/promise';
import type { InventorCapability } from './hidden-device-protocol';
export type DeviceTargetScope = 'self' | 'ally' | 'enemy' | 'all_allies' | 'all_enemies' | 'any';
export type ActiveDeviceSkill = {
    code: string;
    name: string;
    description: string;
    energyCost: number;
    cooldownTurns: number;
    targetScope: DeviceTargetScope;
    power?: number;
    effect?: string;
    inventor?: InventorCapability;
};
export type ActiveDeviceDefinition = {
    code: string;
    maxEnergy: number;
    skills: ActiveDeviceSkill[];
};
export declare const activeDeviceDefinitions: ActiveDeviceDefinition[];
export declare const activeDeviceDefinitionByCode: Map<string, ActiveDeviceDefinition>;
export declare const activeDeviceSkillByCode: Map<string, {
    readonly deviceCode: string;
    readonly code: string;
    readonly name: string;
    readonly description: string;
    readonly energyCost: number;
    readonly cooldownTurns: number;
    readonly targetScope: DeviceTargetScope;
    readonly power?: number;
    readonly effect?: string;
    readonly inventor?: InventorCapability;
}>;
export declare const activeDeviceList: (qqUserId: string) => Promise<{
    id: number;
    code: string;
    name: string;
    description: string;
    actualEffects: string[];
    active: boolean;
    quickSlot: number | null;
    activeDefinition: ActiveDeviceDefinition | null;
}[]>;
export declare const deviceDetail: (qqUserId: string, instanceId: number) => Promise<{
    id: number;
    code: string;
    name: string;
    description: string;
    actualEffects: string[];
    active: boolean;
    quickSlot: number | null;
    activeDefinition: ActiveDeviceDefinition | null;
}>;
export declare const deviceSkillDetail: (qqUserId: string, instanceId: number, skillCode: string) => Promise<{
    device: {
        id: number;
        code: string;
        name: string;
        description: string;
        actualEffects: string[];
        active: boolean;
        quickSlot: number | null;
        activeDefinition: ActiveDeviceDefinition | null;
    };
    skill: ActiveDeviceSkill;
    maxEnergy: number;
}>;
export declare const activateDevice: (qqUserId: string, instanceId: number) => Promise<string>;
export declare const deactivateDevice: (qqUserId: string, instanceId: number) => Promise<string>;
export declare const deviceQuickConfig: (qqUserId: string) => Promise<{
    slots: {
        id: number;
        code: string;
        name: string;
        description: string;
        actualEffects: string[];
        active: boolean;
        quickSlot: number | null;
        activeDefinition: ActiveDeviceDefinition | null;
    }[];
    candidates: {
        id: number;
        code: string;
        name: string;
        description: string;
        actualEffects: string[];
        active: boolean;
        quickSlot: number | null;
        activeDefinition: ActiveDeviceDefinition | null;
    }[];
}>;
export declare const setDeviceQuickSlot: (qqUserId: string, slot: number, instanceId: number) => Promise<string>;
export declare const clearDeviceQuickSlot: (qqUserId: string, slot: number) => Promise<void>;
type DeviceDb = Pool | PoolConnection;
export type DeviceBattleKind = 'pve' | 'pvp';
export declare const initializeCombatDeviceEnergy: (connection: PoolConnection, sessionId: string, characterId: number, battleKind?: DeviceBattleKind) => Promise<void>;
export declare const combatDeviceSlotsFor: (connection: DeviceDb, sessionId: string, characterId: number, lock?: boolean, battleKind?: DeviceBattleKind) => Promise<{
    slot: number;
    instanceId: number;
    deviceCode: string;
    deviceName: string;
    currentEnergy: number;
    maxEnergy: number;
    skills: ActiveDeviceSkill[];
}[]>;
export declare const restoreCombatDeviceEnergy: (connection: PoolConnection, sessionId: string, characterId: number, amount: number, exceptInstanceId?: number, battleKind?: DeviceBattleKind) => Promise<number>;
export {};
