import type { RowDataPacket } from 'mysql2/promise';
export declare const previewSkillReset: (user: string) => Promise<{
    token: `${string}-${string}-${string}-${string}-${string}`;
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
export declare const executeSkillReset: (user: string, token: string) => Promise<{
    restoredPoints: number;
    availablePoints: number;
    removedSkills: number;
    mode: "level" | "ledger";
}>;
