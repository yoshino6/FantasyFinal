import type { PoolConnection } from 'mysql2/promise';
export type SkillPointChangeKind = 'initial_grant' | 'level_up' | 'learn_skill' | 'upgrade_skill' | 'upgrade_specialization' | 'upgrade_appraisal' | 'legacy_opening_balance';
export declare const recordSkillPointChange: (connection: PoolConnection, characterId: number, amount: number, kind: SkillPointChangeKind, skillId?: number | null, detail?: string | null) => Promise<void>;
export declare const ensureSkillPointLedger: (connection: PoolConnection, characterId: number, currentPoints: number) => Promise<boolean>;
export declare const skillPointLedgerSummary: (connection: PoolConnection, characterId: number) => Promise<{
    earned: number;
    spent: number;
    balance: number;
}>;
export declare const resetSkillPointAllocation: (connection: PoolConnection, characterId: number) => Promise<{
    restoredPoints: number;
    availablePoints: number;
    removedSkills: number;
}>;
