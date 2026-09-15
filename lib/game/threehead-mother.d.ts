import type { CombatRules, RuleStatus, RuleUnit } from './combat-rule-registry';
export type ThreeheadRole = 'venom' | 'flame' | 'gale';
export declare const threeheadMotherTemplateCode = "threehead_mother";
export declare const threeheadMotherRoles: ThreeheadRole[];
export declare const threeheadMotherNames: Record<ThreeheadRole, string>;
export declare const threeheadMotherElements: Record<ThreeheadRole, Record<string, number>>;
export declare const threeheadMotherRole: (value: {
    cooldowns?: unknown;
}) => ThreeheadRole | undefined;
export declare const threeheadMotherStats: <T extends Record<string, number>>(stats: T, role: ThreeheadRole) => T;
export declare const threeheadMotherBaseStats: <T extends Record<string, number>>(stats: T, role: ThreeheadRole) => T;
export declare const threeheadMotherStoredStats: (value: {
    cooldowns?: unknown;
}) => Record<string, number> | undefined;
export declare const threeheadMotherHeadName: (value: {
    cooldowns?: unknown;
    name?: string;
}) => string;
export declare const threeheadMotherPanelSummary: (target: {
    cooldowns?: unknown;
    current_hp?: number;
    hp_max?: number;
}, all: Array<{
    cooldowns?: unknown;
    is_defeated?: number;
}>) => string;
declare const dotCodes: readonly ["mother_poison", "mother_burn", "mother_wind_erosion"];
type MotherDot = typeof dotCodes[number];
export declare const addThreeheadDot: (rules: CombatRules, source: RuleUnit, target: RuleUnit, code: MotherDot, stacks: number) => RuleStatus;
export declare const tryAddThreeheadDot: (rules: CombatRules, source: RuleUnit, target: RuleUnit, code: MotherDot, stacks: number, baseChance?: number) => boolean;
export declare const increaseThreeheadDots: (rules: CombatRules, target: RuleUnit, amount?: number) => void;
export declare const settleThreeheadDots: (rules: CombatRules, targets: RuleUnit[], immediate?: boolean) => Promise<void>;
export declare const installThreeheadMotherDamage: (rules: CombatRules) => void;
export declare const prepareThreeheadMotherTurn: (rules: CombatRules, head: RuleUnit) => Promise<void>;
export declare const executeThreeheadMotherTurn: (rules: CombatRules, head: RuleUnit, defaultVictim: RuleUnit) => Promise<boolean>;
export declare const reorderThreeheadMotherTurns: <T extends {
    kind: string;
    id: number;
}>(turns: T[], units: RuleUnit[]) => void;
export {};
