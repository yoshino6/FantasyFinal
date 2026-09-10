import type { Pool, PoolConnection } from 'mysql2/promise';
export type TalentData = {
    settings: Record<string, any>;
    counters: Record<string, number>;
    flags: Record<string, any>;
    remainders: Record<string, number>;
    jobs: TalentJob[];
};
export type TalentJob = {
    id: string;
    kind: string;
    created: number;
    ready: number;
    payload: Record<string, any>;
};
export declare const emptyTalentData: () => TalentData;
export declare const talentSchema: string[];
export declare const ownedTalent: (connection: Pool | PoolConnection, id: number) => Promise<import("./talent.config").TalentDefinition | undefined>;
export declare const readTalentData: (connection: Pool | PoolConnection, id: number) => Promise<TalentData>;
export declare const saveTalentData: (connection: Pool | PoolConnection, id: number, data: TalentData) => Promise<void>;
export declare const talentWhole: (data: TalentData, key: string, base: number, multiplier: number) => number;
export declare const talentDay: (now?: Date) => string;
export declare const talentPanel: (number: string | undefined) => {
    hp: number;
    mastery: string;
    resistance: string;
};
export declare const applyTalentPanel: (connection: Pool | PoolConnection, id: number, stats: {
    hpMax: number;
}, elements: {
    mastery: Record<string, number>;
    resistance: Record<string, number>;
}, neutralStats?: Record<string, any>) => Promise<void>;
export declare const neutralTalentSnapshot: (connection: PoolConnection, row: Record<string, any>, scaleCurrent?: boolean) => Promise<void>;
export declare const initializeTalentPersistence: (pool: Pool) => Promise<void>;
