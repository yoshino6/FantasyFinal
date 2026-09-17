import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
type EnchantmentRow = RowDataPacket & {
    card_code: string;
    revision: number;
    allowed_slots_json: unknown;
};
export declare const equipmentCategoryAcceptsEnchantment: (category: string, value: unknown) => boolean;
export declare const assertEquipmentEnchantmentTransferCompatible: (connection: PoolConnection, sourceInstanceId: number, targetCategory: string) => Promise<EnchantmentRow>;
export declare const transferEquipmentEnchantment: (connection: PoolConnection, sourceInstanceId: number, targetInstanceId: number) => Promise<{
    transferred: false;
    cardCode?: undefined;
    revision?: undefined;
} | {
    transferred: true;
    cardCode: string;
    revision: number;
}>;
export {};
