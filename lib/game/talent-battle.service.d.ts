import type { PoolConnection } from 'mysql2/promise';
import type { CombatRules, RuleUnit } from './combat-rule-registry';
export declare const talentPreparationSkills: string[];
export declare const talentTransferLabels: Record<string, string>;
export declare const talentTransferEffects: string[];
export declare const canTalentPacify: (target: Record<string, any>, enemy: RuleUnit, memberCount: number, targetCount: number) => boolean;
export declare const loadTalentBattle: (c: PoolConnection, rules: CombatRules, members: Record<string, any>[], targets: Record<string, any>[], hasSupport: Set<number>) => Promise<void>;
export declare const persistTalentBattle: (c: PoolConnection, rules: CombatRules, members: Record<string, any>[], targets: Record<string, any>[]) => Promise<void>;
export declare const talentTransferBuff: (rules: CombatRules, unit: RuleUnit) => Promise<void>;
