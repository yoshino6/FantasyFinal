import type { RowDataPacket } from 'mysql2/promise';
type SettingRow = RowDataPacket & {
    enabled: number;
    default_encounter_action?: 'battle' | 'persuade';
    auto_potion_enabled: number;
    hp_threshold: number;
    hp_item_id: number | null;
    hp_item_name: string | null;
    mp_threshold: number;
    mp_item_id: number | null;
    mp_item_name: string | null;
};
type AutoCombatAction = {
    type: 'attack';
} | {
    type: 'skill';
    skillId: number;
} | {
    type: 'item';
    itemId: number;
};
export type AutoBattleMode = 'pve' | 'pvp';
export declare const autoBattleConfig: (qqUserId: string, mode?: AutoBattleMode) => Promise<{
    characterId: number;
    mode: AutoBattleMode;
    settings: SettingRow;
    actions: {
        sequence: number;
        skillId: number | null;
        name: string;
    }[];
}>;
export declare const setAutoBattleEnabled: (qqUserId: string, enabled: boolean, mode?: AutoBattleMode) => Promise<boolean>;
export declare const toggleAutoBattleEncounterAction: (qqUserId: string) => Promise<"persuade" | "battle">;
export declare const setAutoPotionEnabled: (qqUserId: string, enabled: boolean, mode?: AutoBattleMode) => Promise<boolean>;
export declare const autoBattleSkills: (qqUserId: string, page?: number, keyword?: string) => Promise<{
    choices: {
        id: number | null;
        name: string;
    }[];
    page: number;
    total: number;
}>;
export declare const saveAutoBattleAction: (qqUserId: string, sequence: number, skillId: number | null, mode?: AutoBattleMode) => Promise<void>;
export declare const deleteAutoBattleAction: (qqUserId: string, sequence: number, mode?: AutoBattleMode) => Promise<void>;
export declare const beginAutoBattleQuickSetup: (qqUserId: string, mode?: AutoBattleMode) => Promise<number>;
export declare const saveQuickAutoBattleAction: (qqUserId: string, skillId: number | null, mode?: AutoBattleMode) => Promise<number>;
export declare const finishAutoBattleQuickSetup: (qqUserId: string, mode?: AutoBattleMode) => Promise<void>;
export declare const autoPotionItems: (qqUserId: string, page?: number, keyword?: string) => Promise<{
    items: {
        id: number;
        name: string;
    }[];
    page: number;
    total: number;
}>;
export declare const setAutoPotionThreshold: (qqUserId: string, kind: "hp" | "mp", threshold: number, mode?: AutoBattleMode) => Promise<void>;
export declare const setAutoPotionItem: (qqUserId: string, kind: "hp" | "mp", itemId: number | null, mode?: AutoBattleMode) => Promise<void>;
export declare const nextAutoBattleAction: (qqUserId: string) => Promise<AutoCombatAction | null>;
export declare const pendingPartyAutoBattleActions: (qqUserId: string) => Promise<{
    qqUserId: string;
    action: AutoCombatAction;
    targetId: number | undefined;
}[]>;
export declare const isFullPartyAutoBattle: (qqUserId: string) => Promise<boolean>;
export {};
