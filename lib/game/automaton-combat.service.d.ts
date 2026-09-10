import type { PoolConnection } from 'mysql2/promise';
import { type CombatRules, type RuleUnit } from './combat-rule-registry';
import { type AutomatonCombatant } from './automaton-combat';
export declare const loadCombatAutomatons: (connection: PoolConnection, sessionId: string, ownerIds: number[]) => Promise<AutomatonCombatant[]>;
export declare const saveCombatAutomatons: (connection: PoolConnection, sessionId: string, pets: AutomatonCombatant[]) => Promise<void>;
export declare const finishCombatAutomatons: (connection: PoolConnection, sessionId: string, victory?: boolean) => Promise<void>;
export declare const appendAutomatonBattleQuotes: (connection: PoolConnection, sessionId: string, pets: AutomatonCombatant[], log: string[], victory: boolean) => Promise<void>;
export declare const applyEnemySkillToAutomaton: (connection: PoolConnection, rules: CombatRules, source: RuleUnit, target: RuleUnit, skillId: number, timing: "on_cast" | "on_hit", includeSelf?: boolean) => Promise<void>;
