import type { PoolConnection } from 'mysql2/promise';
export type AchievementFact = {
    metric: string;
    value?: number;
    distinct?: string;
    life?: boolean;
    maximum?: boolean;
    cooperationKey?: string;
};
export type AchievementEvent = {
    characterId: number;
    key: string;
    facts: AchievementFact[];
};
export declare const isCooperativeAchievement: (id: string) => boolean;
export declare const recordAchievement: (connection: PoolConnection, characterId: number, facts: AchievementFact[] | string[], key?: string) => void;
export declare const takeAchievementEvents: (connection: PoolConnection) => AchievementEvent[];
