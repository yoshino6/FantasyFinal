import type { Pool, PoolConnection } from 'mysql2/promise';
export type EquippedEnchantment = {
    instanceId: number;
    revision: number;
    slot: string;
    cardCode: string;
    cardName: string;
    effectText: string;
    effects: Record<string, any>;
};
export declare const equippedEnchantments: (connection: Pool | PoolConnection, characterId: number) => Promise<EquippedEnchantment[]>;
export declare const cardIncomingDamageMultiplier: (effects: Record<string, any> | undefined, magic: boolean, element?: string) => number;
export declare const applyCardIncomingDamageReduction: (damage: number, effects: Record<string, any> | undefined, magic: boolean, element?: string) => number;
export declare const cardElementDamageMultiplier: (effects: Record<string, any> | undefined, element: string) => number;
export declare const activeHealingMultiplier: (healingBonusPct: number, cardActiveHealingBonusPct: number) => number;
export declare const aggregateEnchantmentEffects: (enchantments: readonly Pick<EquippedEnchantment, "effects">[]) => Record<string, any>;
export declare const equippedEnchantmentEffects: (connection: Pool | PoolConnection, characterId: number) => Promise<Record<string, any>>;
export declare const cardIndependentPanelPercent: (effects: Record<string, any>) => {
    hpPct: number;
};
