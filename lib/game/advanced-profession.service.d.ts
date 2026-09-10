import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { type AdvancedProfession } from './advanced-profession.config';
type Character = RowDataPacket & {
    id: number;
    level: number;
    profession: string;
    current_region_id: number;
    region_code: string;
    pos_x: number;
    pos_y: number;
};
type Quest = RowDataPacket & {
    profession_code: string;
    stage: number;
    story_kills: number;
    proof_kills: number;
    completed_at: Date | null;
};
export declare const revokeAdvancedProfessionSkills: (connection: PoolConnection, characterId: number) => Promise<void>;
export declare const isWorldTreeAdvancedMentor: (code: string) => boolean;
export type AdvancedProfessionView = {
    profession: AdvancedProfession;
    character: Character;
    active: Quest | null;
    activeQuest: Quest | null;
    completedCode: string | null;
    retrainRemainingSeconds: number;
    ridgeCore: number;
};
export declare const advancedProfessionView: (qqUserId: string, mentorCode?: string) => Promise<AdvancedProfessionView>;
export declare const beginAdvancedProfession: (qqUserId: string, code: string, replaceActiveQuest?: boolean) => Promise<AdvancedProfession>;
export declare const advanceAdvancedProfessionStage: (qqUserId: string, code: string) => Promise<AdvancedProfession>;
export declare const submitAdvancedProfessionProof: (qqUserId: string, code: string) => Promise<AdvancedProfession>;
export declare const beginAdvancedProfessionTrial: (qqUserId: string, code: string) => Promise<{
    profession: AdvancedProfession;
    spawnId: number;
}>;
export declare const recordAdvancedProfessionKills: (connection: PoolConnection, characterId: number, targetCodes: string[]) => Promise<void>;
export declare const completeAdvancedProfessionTrial: (connection: PoolConnection, characterId: number, trialCode: string) => Promise<{
    reset: {
        restoredPoints: number;
        availablePoints: number;
        removedSkills: number;
        mode: "level" | "ledger";
    };
    code: string;
    name: string;
    baseProfession: "\u6218\u58EB" | "\u6CD5\u5E08" | "\u76D7\u8D3C" | "\u7267\u5E08";
    mentor: {
        code: string;
        name: string;
        title: string;
        x: number;
        y: number;
    };
    role: string;
    passive: {
        code: string;
        name: string;
        description: string;
        effect: Record<string, number>;
    };
    first: {
        title: string;
        story: string;
        targetCodes: string[];
        targetText: string;
        requiredKills: number;
    };
    second: {
        title: string;
        story: string;
        targetCodes: string[];
        targetText: string;
        requiredKills: number;
        materialCount: number;
    };
    trial: {
        code: string;
        name: string;
        description: string;
        skillCodes: string[];
        stats: [number, number, number, number, number, number];
    };
} | null>;
export {};
