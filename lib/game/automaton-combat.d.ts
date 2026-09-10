import type { AutomatonState } from './automaton';
import { CombatRules, type RuleUnit, type RuleState } from './combat-rule-registry';
export type AutomatonBattleState = {
    pet: AutomatonState;
    rule: RuleState;
    cooldowns: Record<string, number>;
    sync: number;
    ultimateUsed: boolean;
    actionCount: number;
    channel?: string;
    exited: boolean;
    threat: Record<string, number>;
    manual?: string;
};
export type AutomatonCombatant = {
    id: number;
    ownerId: number;
    battle: AutomatonBattleState;
    unit: RuleUnit;
};
export declare const automatonRuleUnit: (id: number, battle: AutomatonBattleState) => RuleUnit;
export declare const installAutomatonRules: (rules: CombatRules, pets: AutomatonCombatant[]) => void;
export declare const chooseAutomatonAction: (_rules: CombatRules, p: AutomatonCombatant, owner: RuleUnit) => string;
export declare const actAutomaton: (rules: CombatRules, p: AutomatonCombatant) => Promise<void>;
