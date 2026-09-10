import type { PoolConnection } from 'mysql2/promise';
import { type AchievementFact } from './achievement-events';
export declare const achievementActivity: (c: PoolConnection, id: number) => void;
export declare const normalSkillSpecializationFacts: (category: string, rows: Array<{
    specialization: string;
    level: number;
}>) => AchievementFact[];
export declare const achievementLevel: (c: PoolConnection, id: number, level: number) => void;
export declare const achievementSecondaryLevel: (c: PoolConnection, id: number, level: number) => void;
export declare const achievementSecondary: (c: PoolConnection, id: number) => Promise<void>;
export declare const achievementEquipment: (c: PoolConnection, id: number, itemId?: number, battle?: boolean) => Promise<void>;
export declare const achievementItem: (c: PoolConnection, id: number, itemId: number) => Promise<void>;
export declare const achievementNpcState: (c: PoolConnection, id: number, npc: string, effective?: boolean) => Promise<void>;
