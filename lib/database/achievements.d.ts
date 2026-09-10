import type { Pool } from 'mysql2/promise';
export declare const achievementSchema: string[];
export declare const initializeAchievements: (pool: Pool) => Promise<void>;
export declare const seedAchievementProfiles: (pool: Pool) => Promise<void>;
