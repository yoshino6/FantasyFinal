import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
export type SkillPointChangeKind = 'initial_grant' | 'level_up' | 'learn_skill' | 'upgrade_skill' | 'upgrade_specialization' | 'upgrade_appraisal' | 'legacy_opening_balance' | 'legacy_level_reset' | 'allocation_reconcile' | 'allocation_refund';
export declare const recordSkillPointChange: (connection: PoolConnection, characterId: number, amount: number, kind: SkillPointChangeKind, skillId?: number | null, detail?: string | null) => Promise<void>;
export declare const ensureSkillPointLedger: (connection: PoolConnection, characterId: number, currentPoints: number) => Promise<boolean>;
export declare const skillPointLedgerSummary: (connection: PoolConnection, characterId: number) => Promise<{
    earned: number;
    spent: number;
    balance: number;
}>;
export declare const skillAllocationPlan: (connection: PoolConnection, characterId: number) => Promise<{
    configuration: {
        skills: RowDataPacket[];
        specializations: RowDataPacket[];
        appraisal: RowDataPacket[];
        automatic: RowDataPacket[];
        pvpAutomatic: RowDataPacket[];
        history: RowDataPacket[];
    };
    mode: "level" | "ledger";
    level: number;
    available: number;
    targetPoints: number;
    recordedRefund: number;
    refund: number;
    canReset: boolean;
    changes: {
        skillId: number;
        name: string;
        remove: boolean;
        nextLevel: number;
        rows: number[];
        amount: number;
        specialization: Record<string, number>;
        range: number;
        information: number;
    }[];
    preserved: string[];
}>;
export declare const resetSkillPointAllocation: (connection: PoolConnection, characterId: number, token?: string) => Promise<{
    restoredPoints: number;
    availablePoints: number;
    removedSkills: number;
    mode: "level" | "ledger";
}>;
