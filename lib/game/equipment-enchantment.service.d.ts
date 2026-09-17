export declare const enchantableEquipment: (qqUserId: string) => Promise<{
    id: number;
    name: string;
    category: string;
    level: number;
    quality: number;
    enchantment: {
        cardCode: string;
        cardName: string;
        effectText: string;
    } | null;
}[]>;
export declare const compatibleEnchantCards: (qqUserId: string, instanceId: number) => Promise<{
    equipment: {
        id: number;
        name: string;
        category: string;
        level: number;
        slots: import("../config/monster-cards").EquipmentSlot[];
    };
    cards: {
        itemId: number;
        code: string;
        name: string;
        quantity: number;
        level: number;
        minimumEquipmentLevel: number;
        tier: import("../config/monster-cards").MonsterCardTier;
        effectText: string;
        compatibleSlots: import("../config/monster-cards").EquipmentSlot[];
        bound: string;
    }[];
}>;
export declare const previewEquipmentEnchantment: (qqUserId: string, instanceId: number, cardItemId: number) => Promise<{
    token: `${string}-${string}-${string}-${string}-${string}`;
    equipment: {
        id: number;
        name: string;
        category: string;
        level: number;
        compatibleSlots: import("../config/monster-cards").EquipmentSlot[];
    };
    current: {
        cardCode: string;
        cardName: string;
        effectText: string;
    } | null;
    card: {
        itemId: number;
        code: string;
        name: string;
        effectText: string;
        level: number;
        version: 2;
    };
    warning: string | null;
    fee: number;
    resultingBinding: string;
    expiresMinutes: number;
}>;
export declare const executeEquipmentEnchantment: (qqUserId: string, token: string) => Promise<{
    instanceId: number;
    equipmentName: string;
    cardName: string;
    effectText: string;
    fee: number;
    covered: boolean;
}>;
