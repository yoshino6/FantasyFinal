import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
export declare const leafEnemyScale: (stage: number, wave: number) => {
    hp: number;
    attack: number;
    defense: number;
};
export declare const startLeafRouteBattle: (c: PoolConnection, character: RowDataPacket, row: RowDataPacket) => Promise<`${string}-${string}-${string}-${string}-${string}`>;
export declare const advanceLeafWave: (c: PoolConnection, session: string) => Promise<boolean>;
export declare const finishLeafRouteBattle: (c: PoolConnection, session: string, result: "victory" | "defeat" | "escaped" | "timeout") => Promise<"本次航务遭遇已经结算。" | "航务遭遇完成，无战斗经验与掉落。请回到 /浮叶航路 完成安全确认。" | "已接回地面安全点，装备与修理进度保留，可重试本幕。" | null>;
