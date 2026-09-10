import type { Pool, PoolConnection } from 'mysql2/promise';
import type { AchievementDefinition } from './achievement.config';
export declare const excludedBossAchievementCode: (code: string) => boolean;
export declare const isEligibleBossAchievementTarget: (target: Record<string, any>) => boolean;
export declare const achievementBossTargets: (c: PoolConnection, targets: Record<string, any>[]) => Promise<Record<string, any>[]>;
export declare const bossAchievementDifficulties: readonly [readonly ["ordinary", "普通", "普通", 1, "巨影倒下以后，路重新有了远方。"], readonly ["powerful", "强大", "优秀", 2, "力量压过山野，你让它停在这里。"], readonly ["heroic", "英雄", "优秀", 2, "英雄的影子，也会落在凡人的脚边。"], readonly ["infernal", "深渊", "精良", 3, "你听见深渊的回声，也让深渊听见你。"], readonly ["abyssal", "地狱", "精良", 3, "归来时，身后的火没有吞掉你的名字。"], readonly ["crimson", "猩红", "稀有", 3, "猩红退去，剑上还留着黎明。"], readonly ["corrupted", "腐化", "稀有", 5, "腐败攀满王座，你为它留下了终点。"], readonly ["holy", "神圣", "稀有", 5, "光环熄灭之后，你看见了自己的影子。"], readonly ["golden", "黄金", "传说", 8, "黄金也有裂纹，而你找到了那一道。"], readonly ["brilliant", "璀璨", "传说", 8, "万丈光芒散去，站立者仍是你。"], readonly ["dreamlike", "梦幻", "史诗", 12, "梦境承认了醒着的人。"], readonly ["fixed", "固定", "普通", 1, "故事里的巨影，终于有了落幕的一页。"]];
export declare const bossAchievementReward: (code: string, difficulty: string) => {
    rarity: "普通" | "优秀" | "精良" | "稀有" | "传说" | "史诗";
    attribute: string;
};
export declare const bossAchievementDefinition: (code: string, name: string, difficulty: string) => AchievementDefinition;
export declare const loadBossAchievementDefinitions: (db: Pool | PoolConnection) => Promise<void>;
export declare const ensureBossAchievement: (c: PoolConnection, target: Record<string, any>) => Promise<string | null>;
