import type { Pool, PoolConnection } from 'mysql2/promise';
import { type Allocation, type DerivedStats, type Growth } from './types';
type RegistrationStage = 'story' | 'audience' | 'question' | 'destination' | 'danger' | 'choice';
export type CharacterView = Allocation & DerivedStats & {
    name: string;
    gender: string;
    professionName: string | null;
    regionName: string;
    x: number;
    y: number;
    z: number;
    level: number;
    experience: number;
    realmStage: number;
    adventurerRegistered: boolean;
    giftName: string | null;
    growth: Growth;
    currentHp: number;
    currentMp: number;
    stamina: number;
    staminaMax: number;
    staminaFullSeconds: number;
    activityStatus: 'active' | 'resting' | 'unconscious' | 'detained';
    elementMastery: Record<string, number>;
    elementResistance: Record<string, number>;
    extraAttributes: Record<string, number>;
    activeBuffs: string[];
    combatNotes: string[];
};
export declare const armorClassDefenseMultiplier: (subtype: string | null | undefined, key: "physicalDefense" | "magicDefense") => number;
export declare const armorClassMobilityModifier: (subtype: string | null | undefined, key: "accuracy" | "evasion" | "speed") => number;
export declare const recalculateCharacterStats: (connection: Pool | PoolConnection, characterId: number) => Promise<void>;
export declare const refreshCharacterStamina: (connection: PoolConnection, characterId: number) => Promise<{
    stamina: number;
    staminaMax: number;
}>;
export declare const hasCharacter: (qqUserId: string) => Promise<boolean>;
export declare const beginRegistration: (qqUserId: string, nickname?: string) => Promise<{
    alreadyRegistered: true;
    stage: null;
} | {
    alreadyRegistered: false;
    stage: RegistrationStage;
}>;
export declare const continueRegistration: (qqUserId: string) => Promise<"choice" | "audience" | "destination">;
export declare const askWhereAmI: (qqUserId: string) => Promise<void>;
export declare const chooseDestination: (qqUserId: string, destination: "\u5929\u5802" | "\u5F02\u4E16\u754C") => Promise<"danger" | "heaven">;
export declare const chooseGift: (qqUserId: string, giftCode: string, nickname?: string) => Promise<CharacterView>;
export declare const getCharacter: (qqUserId: string) => Promise<CharacterView | null>;
export declare const changeCharacterName: (qqUserId: string, input: string) => Promise<{
    name: string;
    usedCard: boolean;
}>;
export declare const changeCharacterGender: (qqUserId: string, gender: string) => Promise<{
    gender: string;
    usedCard: boolean;
}>;
export declare const registerAdventurer: (qqUserId: string) => Promise<boolean>;
export declare const adventurerProfile: (qqUserId: string) => Promise<{
    profession_name: string | null;
    constructor: {
        name: "RowDataPacket";
    };
    id: number;
    name: string;
    level: number;
    experience: number;
    adventurer_registered: number;
    adventurer_rank: string;
    profession_code: string | null;
    advanced_profession_code: string | null;
}>;
export declare const chooseProfession: (qqUserId: string, code: string) => Promise<{
    code: string;
    reset: {
        restoredPoints: number;
        availablePoints: number;
        removedSkills: number;
    };
}>;
export {};
