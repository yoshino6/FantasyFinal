import { Format } from 'alemonjs';
import type { AchievementEntry } from './achievement.service';
import { type AchievementBoxKey } from './achievement-rewards.config';
export declare const achievementAnnouncementFormat: (entry: {
    winner: string;
    winners?: string[];
    name: string;
    description: string;
}) => Format;
export declare const achievementListFormat: (data: {
    category: string;
    page: number;
    totalPages: number;
    visibleCategories: readonly string[];
    entries: AchievementEntry[];
}) => Format;
export declare const achievementDetailFormat: (entry: AchievementEntry) => Format;
export declare const achievementBoxCommand: Record<AchievementBoxKey, string>;
export declare const appendAchievementBox: (md: ReturnType<typeof Format.createMarkdown>, key: AchievementBoxKey, quantity: number) => import("alemonjs").FormatMarkDown;
export declare const achievementRewardsFormat: (data: {
    boxes: Record<AchievementBoxKey, number>;
    items: Array<{
        name: string;
        description: string;
        quantity: number;
    }>;
}) => Format;
