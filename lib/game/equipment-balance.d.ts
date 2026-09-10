export type BalanceEquipment = {
    code: string;
    item_category: string;
    weapon_type: string | null;
    required_level: number;
    rarity: string;
    effect_json: unknown;
};
export declare const balanceRecord: (value: unknown) => Record<string, unknown>;
export declare const resetLegacyEquipmentPrimary: (item: BalanceEquipment, instanceEffect?: unknown, fusionEffects?: unknown[]) => {
    effect: Record<string, unknown>;
    changed: boolean;
    blocked: boolean;
    reason: string;
};
export declare const equipmentBalancePreview: (item: BalanceEquipment, instanceEffect?: unknown) => {
    effect: Record<string, unknown>;
    changed: boolean;
    blocked: boolean;
    reason: string;
};
