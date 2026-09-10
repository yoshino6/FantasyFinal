import type { ActiveDeviceSkill } from './device.service';
export type DeviceFragment = {
    kind: 'damage';
    power: number;
    magic?: boolean;
    element?: string;
} | {
    kind: 'heal' | 'shield';
    percent: number;
} | {
    kind: 'status';
    code: string;
    value: number;
    duration: number;
    debuff?: boolean;
    untilHit?: boolean;
} | {
    kind: 'control';
    code: string;
    chance: number;
} | {
    kind: 'cleanse' | 'dispel' | 'evade' | 'random';
    count?: number;
} | {
    kind: 'reduce_once';
    value: number;
};
export type InventorCapability = {
    primary: 'damage' | 'heal' | 'protection' | 'control' | 'support' | 'dispel';
    fragments: DeviceFragment[];
    energyType?: string;
    windup?: number;
    selfHpCost?: number;
};
export declare const inventorCapability: (skill: ActiveDeviceSkill) => InventorCapability | undefined;
export declare const inventorProjection: (capability: InventorCapability) => {
    fragments: ({
        kind: "heal" | "shield";
        percent: number;
    } | {
        kind: "cleanse" | "dispel" | "evade" | "random";
        count?: number;
    } | {
        power: number;
        kind: "damage";
        magic?: boolean;
        element?: string;
    } | {
        chance: number;
        kind: "control";
        code: string;
    } | {
        value: number;
        duration: number;
        untilHit: boolean;
        kind: "status";
        code: string;
        debuff?: boolean;
    } | {
        value: number;
        kind: "reduce_once";
    })[];
    primary: "damage" | "heal" | "protection" | "control" | "support" | "dispel";
    energyType?: string;
    windup?: number;
    selfHpCost?: number;
};
