import type { PoolConnection } from 'mysql2/promise';
export declare const omniscientQuest: (qqUserId: string) => Promise<{
    readonly status: string;
    readonly slimeObserved: boolean;
    readonly wolfKingObserved: boolean;
}>;
export declare const acceptOmniscientQuest: (qqUserId: string) => Promise<void>;
export declare const recordOmniscientObservation: (connection: PoolConnection, characterId: number, targetCodes: string[]) => Promise<void>;
export declare const claimOmniscientQuest: (qqUserId: string) => Promise<{
    name: string;
    characterName: string;
    giftName: string;
}>;
export declare const omniscientProgress: (qqUserId: string) => Promise<{
    level: number;
    proficiency: number;
    required: number;
    rangeBonus: number;
    informationBonus: number;
    dropBonusPct: number;
}>;
export declare const awardOmniscientProficiency: (connection: PoolConnection, characterId: number, targetLevels: readonly number[]) => Promise<{
    level: number;
    proficiency: number;
    required: number;
    gain: number;
} | null>;
export declare const omniscientTraces: (qqUserId: string) => Promise<string | null>;
