import type { PoolConnection } from 'mysql2/promise';
import type { RuleUnit, CombatRules } from './combat-rule-registry';
export type OpeningCombatEffects = {
    divines: string[];
    weapons: string[];
    crimson: number;
    pve: boolean;
    accessories?: number;
    settings?: Record<string, unknown>;
};
export declare const openingCombatEffectsFor: (c: PoolConnection, ids: number[], pve?: boolean) => Promise<Map<number, OpeningCombatEffects>>;
export declare const hasOpeningDivine: (unit: RuleUnit, code: string) => boolean;
export declare const hasOpeningWeapon: (unit: RuleUnit, code: string) => boolean;
export declare const openingSpellHealingFactor: (unit: RuleUnit, target?: RuleUnit) => number;
export declare const openingManaCost: (unit: Pick<RuleUnit, "companion" | "opening">, amount: number) => number;
export declare const openingPaid: (rules: CombatRules, unit: RuleUnit, amount: number) => void;
export declare const openingEffectiveHeal: (rules: CombatRules, source: RuleUnit, target: RuleUnit, healed: number) => void;
export declare const openingAfterHit: (rules: CombatRules, source: RuleUnit, target: RuleUnit, damage: number, skill: boolean, absorbed: number, extra: boolean) => Promise<void>;
