export declare const newWorldLevels: readonly [1, 10, 20, 30];
export type NewWorldLevel = (typeof newWorldLevels)[number];
export declare const newWorldItems: Partial<Record<NewWorldLevel, readonly (readonly [string, number])[]>>;
export declare const journeyElixirs: ({
    code: string;
    name: string;
    effect: {
        experienceBonusPct: number;
        battleCount: number;
        partyDropBonusPct?: undefined;
    };
} | {
    code: string;
    name: string;
    effect: {
        partyDropBonusPct: number;
        battleCount: number;
        experienceBonusPct?: undefined;
    };
})[];
export declare const newWorldWeaponProfile: (base: string | null, advanced?: string | null) => readonly string[];
export declare const newWorldEquipment: {
    code: string;
    name: string;
    level: number;
    rarity: string;
    category: string;
    subtype: string;
    effect: {
        balanceVersion: number;
    };
}[];
export declare const newWorldEquipmentCodes: (level: number, base: string | null, advanced?: string | null) => string[];
export declare const newWorldRewardText: Record<NewWorldLevel, string>;
