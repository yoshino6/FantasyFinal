import type { Pool, PoolConnection } from 'mysql2/promise';
import { type AchievementBoxKey } from './achievement-rewards.config';
import { type AchievementEvent } from './achievement-events';
export declare const achievementStatBonus: (db: Pool | PoolConnection, characterId: number) => Promise<Record<string, number>>;
export declare const flushAchievements: (connection: PoolConnection, events: AchievementEvent[]) => Promise<number[]>;
export type AchievementEntry = {
    id: string;
    name: string;
    category: string;
    description: string;
    rarity: string;
    attribute: string;
    rank: number;
    percentage: string;
    completedAt: string;
};
export declare const achievementListInDatabase: (db: Pool | PoolConnection, identity: string, category?: string, requestedPage?: number) => Promise<{
    category: string;
    page: number;
    totalPages: number;
    total: number;
    visibleCategories: ("战斗" | "探索" | "剧情" | "秘闻" | "同行" | "采炼" | "锻造" | "PVP" | "全部" | "初行" | "技战" | "收藏" | "交涉" | "机巧" | "日常" | "首领")[];
    entries: AchievementEntry[];
}>;
export declare const achievementList: (identity: string, category?: string, requestedPage?: number) => Promise<{
    category: string;
    page: number;
    totalPages: number;
    total: number;
    visibleCategories: ("战斗" | "探索" | "剧情" | "秘闻" | "同行" | "采炼" | "锻造" | "PVP" | "全部" | "初行" | "技战" | "收藏" | "交涉" | "机巧" | "日常" | "首领")[];
    entries: AchievementEntry[];
}>;
export declare const achievementDetail: (identity: string, id: string) => Promise<AchievementEntry>;
export declare const achievementRewardsInDatabase: (db: Pool | PoolConnection, identity: string) => Promise<{
    boxes: Record<AchievementBoxKey, number>;
    items: {
        quantity: number;
        key: string;
        name: string;
        description: string;
        rarity: "\u7A00\u6709" | "\u4F20\u8BF4" | "\u53F2\u8BD7";
        itemType: "consumable" | "material";
        category: string;
        effect: Record<string, unknown>;
    }[];
    oddBoxes: number;
    rareBoxes: number;
    collectorBoxes: number;
}>;
export declare const achievementRewards: (identity: string) => Promise<{
    boxes: Record<AchievementBoxKey, number>;
    items: {
        quantity: number;
        key: string;
        name: string;
        description: string;
        rarity: "\u7A00\u6709" | "\u4F20\u8BF4" | "\u53F2\u8BD7";
        itemType: "consumable" | "material";
        category: string;
        effect: Record<string, unknown>;
    }[];
    oddBoxes: number;
    rareBoxes: number;
    collectorBoxes: number;
}>;
export declare const consumeAchievementRewardItem: (connection: PoolConnection, characterId: number, itemCode: string, quantity?: number) => Promise<void>;
export declare const openAchievementBoxInDatabase: (connection: PoolConnection, identity: string, boxKey: AchievementBoxKey, token: string, quantity?: number) => Promise<{
    boxKey: AchievementBoxKey;
    boxName: string;
    quantity: number;
    items: {
        key: string;
        name: string;
        description: string;
        quantity: number;
    }[];
}>;
export declare const openAchievementBox: (identity: string, boxKey: AchievementBoxKey, token: string, quantity?: number) => Promise<{
    boxKey: AchievementBoxKey;
    boxName: string;
    quantity: number;
    items: {
        key: string;
        name: string;
        description: string;
        quantity: number;
    }[];
}>;
export declare const backfillAchievementBoxRewards: (pool: Pool) => Promise<void>;
