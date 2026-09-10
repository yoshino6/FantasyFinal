import type { MainQuest } from './main-quest.service';
export declare const guildCareerMainQuest: (qqUserId: string) => Promise<MainQuest | null>;
export declare const advancedProfessionMainQuest: (qqUserId: string) => Promise<MainQuest | null>;
