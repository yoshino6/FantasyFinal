export declare const achievementCategories: readonly ["全部", "初行", "战斗", "技战", "探索", "收藏", "交涉", "同行", "采炼", "锻造", "机巧", "日常", "剧情", "PVP", "首领", "秘闻"];
export declare const achievementDefinitions: {
    id: string;
    name: string;
    description: string;
    rarity: string;
    attribute: string;
    condition: string;
    scope: string;
    dependency: string;
    category: string;
}[];
export type AchievementDefinition = typeof achievementDefinitions[number];
