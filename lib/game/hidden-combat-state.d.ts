import type { RuleUnit } from './combat-rule-registry';
import { type HiddenProfessionCode } from './hidden-profession.config';
import type { ActiveDeviceSkill } from './device.service';
import type { MixCatalyst } from './hidden-particles';
export type HiddenChoice = {
    particles?: string[];
    weapons?: number[];
    devices?: {
        id: number;
        skill: string;
    }[];
    donor?: number;
    mode?: string;
    target?: string;
};
export type HiddenWeapon = {
    id: number;
    name: string;
    type: string;
    attack: number;
    magic: number;
    element: string;
};
export type HiddenDevice = {
    id: number;
    code: string;
    name: string;
    energy: number;
    max: number;
    skills: ActiveDeviceSkill[];
};
export type HiddenTick = {
    turn: number;
    source: string;
    target: string;
    kind: 'damage' | 'heal' | 'shield';
    amount: number;
    power?: number;
    magic?: boolean;
    element?: string;
    attack?: number;
    label: string;
    growthShield?: number;
    healLimit?: number;
    noHit?: boolean;
    failure?: boolean;
};
export type HiddenState = {
    profession?: HiddenProfessionCode;
    resource: number;
    incomeTurn: number;
    income: number;
    action: number;
    active?: string;
    consumes?: boolean;
    lastPrimary?: string;
    lastType?: string;
    lastCapability?: string;
    driverTurn?: number;
    inheritance?: boolean;
    catalyst?: {
        mode: MixCatalyst;
        until: number;
    };
    ticks: HiddenTick[];
    order?: {
        target: string;
        delta: number;
        turn: number;
        side: string;
    };
};
export declare const hiddenState: (unit: Pick<RuleUnit, "cooldowns">) => HiddenState;
export declare const hiddenResourceView: (cooldowns: Record<string, unknown>) => {
    professionCode: "magical_scholar" | "weapon_master" | "inventor" | "tactician";
    code: "magical_scholar" | "weapon_master" | "inventor" | "tactician";
    name: "实验值" | "器鸣" | "灵感" | "筹策";
    current: number;
    max: number;
} | null;
export declare const hiddenResourceShortage: (code: string, cooldowns: Record<string, unknown>) => string | null;
export declare const gainHiddenResource: (unit: RuleUnit, turn: number, amount: number, refund?: boolean) => number;
export declare const hiddenActionKey: (unit: RuleUnit, turn: number) => string;
