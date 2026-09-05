import type { PoolConnection } from 'mysql2/promise';
import { CombatRules, type RuleUnit } from './combat-rule-registry';
type Fighter = Record<string, any>;
export declare const createPvpCombatRules: (connection: PoolConnection, fighters: Fighter[], states: Record<string, any>[], turn: number, log: string[], extra: (unit: RuleUnit) => void) => Promise<{
    rule: CombatRules;
    get: (id: number) => RuleUnit;
}>;
export {};
