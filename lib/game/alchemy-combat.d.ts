import type { CombatRules, RuleUnit } from './combat-rule-registry';
import type { AlchemyConsumableEffect } from './alchemy-catalog';
export declare const alchemyStatusNames: Record<string, string>;
export declare const alchemyHealingFactor: (rules: CombatRules, target: RuleUnit) => number;
export declare const useAlchemyCombat: (rules: CombatRules, actor: RuleUnit, enemy: RuleUnit | undefined, effect: Omit<AlchemyConsumableEffect, "status"> & {
    heal?: number;
    restoreMp?: number;
    status?: {
        code: string;
        value: number;
        turns: number;
        chance?: number;
        applicableLevel?: number;
    };
}, name: string, mode: "pve" | "pvp", ally?: RuleUnit) => Promise<{
    consumed: boolean;
    message: string;
}>;
export declare const alchemyIncoming: (rules: CombatRules, source: RuleUnit, target: RuleUnit, amount: number, magic: boolean, skill: boolean) => Promise<number>;
export declare const alchemyAfterHit: (rules: CombatRules, source: RuleUnit, target: RuleUnit, damage: number, element: string) => Promise<void>;
export declare const alchemySaveLife: (rules: CombatRules, target: RuleUnit) => Promise<void>;
export declare const alchemyEndTurn: (rules: CombatRules) => Promise<void>;
export declare const consumeAlchemyChant: (rules: CombatRules, unit: RuleUnit, turns: number) => Promise<number>;
