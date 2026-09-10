import type { CombatRules, RuleStatus, RuleUnit } from './combat-rule-registry';
import type { ActiveDeviceSkill } from './device.service';
import { type HiddenChoice, type HiddenDevice, type HiddenWeapon } from './hidden-combat-state';
export declare class HiddenBattleError extends Error {
}
export declare const hiddenDamageSource: (r: CombatRules, source: RuleUnit, target: RuleUnit, direct?: boolean) => WeakMap<CombatRules, {
    source: RuleUnit;
    target: RuleUnit;
    direct: boolean;
}>;
type Context = {
    activeCodes?: string[];
    weapons: HiddenWeapon[];
    devices: HiddenDevice[];
    payParticles: (particles: string[]) => Promise<void>;
    saveDevices: () => Promise<void>;
};
export declare const hiddenNames: {
    hidden_freeze: string;
    hidden_stun: string;
    hidden_heal_down: string;
    hidden_mark: string;
    hidden_echo: string;
    hidden_plan: string;
    hidden_guard: string;
    hidden_outgoing: string;
    hidden_once: string;
    hidden_light: string;
    hidden_evade: string;
};
export declare const hiddenShield: (r: CombatRules, source: RuleUnit, target: RuleUnit, amount: number, duration?: number, data?: Record<string, unknown>) => number;
export declare const hiddenHealingFactor: (r: CombatRules, u: RuleUnit) => number;
export declare const hiddenDeviceSnapshot: (r: CombatRules) => {
    key: string;
    side: string;
    hp: number;
    effects: string;
}[];
export declare const hiddenNativeDevice: (r: CombatRules, source: RuleUnit, skill: ActiveDeviceSkill, before: ReturnType<typeof hiddenDeviceSnapshot>) => void;
export declare const hiddenBeforeAction: (r: CombatRules, u: RuleUnit) => Promise<void>;
export declare const hiddenIncoming: (r: CombatRules, source: RuleUnit, target: RuleUnit, amount: number, direct?: boolean, magic?: boolean) => Promise<number>;
export declare const hiddenBeforeDamage: (r: CombatRules, target: RuleUnit, damage: number) => Promise<number>;
export declare const hiddenAbsorbed: (r: CombatRules, target: RuleUnit, shield: RuleStatus | undefined, amount: number) => Promise<void>;
export declare const hiddenAfterHit: (r: CombatRules, source: RuleUnit, target: RuleUnit, skill: boolean, extra: boolean) => Promise<void>;
export declare const hiddenEndTurn: (r: CombatRules) => Promise<void>;
export declare const hiddenReorder: <T>(r: CombatRules, queue: T[], unit: (entry: T) => RuleUnit, bonus?: boolean) => T[];
export declare const executeHiddenCombat: (r: CombatRules, u: RuleUnit, code: string, choice: HiddenChoice, ctx: Context) => Promise<boolean>;
export {};
