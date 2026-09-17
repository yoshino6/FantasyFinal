import { type Level32BossDifficultyCode } from './level32-boss-difficulty.config';
export type BossTraitCardData = {
    bossName: string;
    difficultyCode: Level32BossDifficultyCode;
    effects: string[];
};
export declare const bossTraitStrengthLabel: (value: number) => "很低" | "较低" | "低" | "略低" | "中" | "略高" | "较高" | "高" | "很高" | "极高";
export declare const bossRewardStrengthLabel: (value: number) => "很低" | "较低" | "低" | "略低" | "中" | "略高" | "较高" | "高" | "很高" | "极高";
export declare const bossTraitCardSvg: ({ bossName, difficultyCode, effects }: BossTraitCardData) => string;
export declare const bossTraitCardImage: (data: BossTraitCardData) => Promise<Buffer<ArrayBuffer>>;
