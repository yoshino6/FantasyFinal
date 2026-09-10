import type { PoolConnection } from 'mysql2/promise';
export type TalentRewardContext = {
    notice?: {
        text?: string;
    };
    kind?: 'combat' | 'production' | 'exploration' | 'social' | 'quest';
    key?: string;
    npc?: string;
    remaining?: number;
    parts?: {
        key: string;
        amount: number;
        eligible: boolean;
    }[];
    derived?: boolean;
};
export declare const talentExperience: (connection: PoolConnection, id: number, base: number, context?: TalentRewardContext) => Promise<number>;
export type TalentProductionContext = {
    profession: string;
    recipe?: string;
    successfulBase?: number;
    derived?: boolean;
};
export declare const talentProficiency: (connection: PoolConnection, id: number, base: number, context: TalentProductionContext) => Promise<number>;
export declare const talentNpcAffinity: (connection: PoolConnection, id: number, npc: string, base: number, kind: "gift" | "chat" | "meal" | "quest" | "other", crafted?: boolean) => Promise<number>;
export declare const talentIntimacy: (connection: PoolConnection, id: number, companionId: number, base: number) => Promise<number>;
export declare const talentProductionRecord: (connection: PoolConnection, id: number, recipe: string, successfulBase?: number, automaton?: boolean, ordinary?: boolean) => Promise<void>;
export declare const ordinaryTalentItem: (item: Record<string, any>) => boolean;
export declare const talentCraftMultiplier: (connection: PoolConnection, id: number, item: Record<string, any>) => Promise<1 | 4 | 3.5>;
