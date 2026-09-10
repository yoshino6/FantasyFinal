export declare const armorSlots: readonly ["shoulder", "upper", "waist", "lower", "feet"];
export declare const armorSlot: (slot: string) => string;
export declare const armorAttributeKeys: readonly ["accuracy", "evasion", "critResistBp", "critDamageReductionBp", "tenacity", "speed"];
export declare const armorPiecePercent: (subtype: string | null | undefined, slot: string, quality?: number) => {
    [k: string]: number;
};
export declare const armorPanelPercent: (rows: readonly {
    slot: string;
    weapon_type?: string | null;
    quality?: number;
}[]) => {
    [k: string]: number;
};
export declare const armorPieceDescription: (subtype: string | null | undefined, slot: string, quality?: number) => string;
