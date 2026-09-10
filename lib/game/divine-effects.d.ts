import type { PoolConnection } from 'mysql2/promise';
import type { OpeningConnection } from './opening-state';
export declare const hasDivine: (connection: OpeningConnection, id: number, code: string) => Promise<boolean>;
export declare const divineUses: (connection: OpeningConnection, id: number, code: string) => Promise<number>;
export declare const spendDivineUse: (connection: PoolConnection, id: number, code: string, limit?: number, amount?: number) => Promise<boolean>;
export declare const divineFoodSeconds: (connection: OpeningConnection, id: number, seconds: number, sharedFactor?: number) => Promise<number>;
export type GuildPriceItem = {
    item_type: string;
    item_category: string;
    buy_price: number;
    trade_price: number;
    rarity?: string;
    personalBoundOnly?: boolean;
};
export declare const openingShopQuote: (connection: OpeningConnection, id: number, item: GuildPriceItem, quantity: number) => Promise<{
    base: number;
    price: number;
    credit: number;
    discount: number;
}>;
export declare const payOpeningShopDiscount: (connection: PoolConnection, id: number, quote: {
    credit: number;
    discount: number;
}) => Promise<void>;
export declare const divineFoodValues: (connection: OpeningConnection, id: number, buff: Record<string, unknown>, originalSeconds?: number) => Promise<{
    __talentFoodExpires?: number | undefined;
    __talentFoodBase: Record<string, unknown>;
}>;
