import type { PoolConnection } from 'mysql2/promise';
import { CombatRules, type RuleUnit } from './combat-rule-registry';
type CombatRow = Record<string, any>;
type LegacyEffect = {
    source_key?: string | null;
    id: number;
    target_kind: string;
    target_id: number;
    code: string;
    effect_type: string;
    value: number;
    stacks: number;
    remaining_turns: number;
};
export declare const ruleAppraisalLevels: (connection: PoolConnection, ids: number[]) => Promise<Map<number, number>>;
export declare const createCombatRules: (connection: PoolConnection, sessionId: string, turn: number, members: CombatRow[], targets: CombatRow[], statsForTarget: (target: any) => Record<string, number>, effects: () => LegacyEffect[], log: string[], weather: string, absorb: (kind: "member" | "target", id: number, hpMax: number, amount: number) => Promise<{
    absorbed: number;
    remaining: number;
    broken: boolean;
}>, onExtra: (kind: "member" | "target", id: number) => void, openingPve?: boolean) => Promise<{
    rule: CombatRules;
    get: (kind: "member" | "target", id: number) => RuleUnit;
    takeDamage: (kind: "member" | "target", id: number, incoming: number, areaHit?: boolean, source?: RuleUnit) => Promise<{
        incoming: number;
        absorbed: number;
        remaining: number;
        broken: boolean;
    }>;
}>;
export {};
