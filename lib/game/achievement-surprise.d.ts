import type { PoolConnection } from 'mysql2/promise';
import { type AchievementFact } from './achievement-events';
export declare const surpriseVictoryFacts: (m: any, members: any[], bosses: any[]) => AchievementFact[];
export declare const surpriseDefeatFacts: (m: any, members: any[], bosses: any[]) => string[];
export declare const achievementAlchemySurprises: (c: PoolConnection, id: number, event: string, signature: string, successes: number, exploded: boolean, great: number) => Promise<void>;
export declare const achievementGatherSurprises: (c: PoolConnection, id: number, spawn: number, item: number, region: number) => Promise<void>;
