import type { Pool, PoolConnection } from 'mysql2/promise';
export declare const shopProfessions: {
    readonly blacksmith: "blacksmith";
    readonly alchemy_sweetshop: "alchemist";
    readonly oddworkshop: "deconstructor";
    readonly bookshop: "omniscient";
};
export type ServiceShop = keyof typeof shopProfessions;
export type ShopContext = {
    shop: ServiceShop;
    characterId: number;
    user: string;
    personalProfession: string | null;
};
export declare const currentSecondaryShop: () => ShopContext | undefined;
export declare const withSecondaryShop: <T>(context: ShopContext, work: () => T) => T;
export declare const shopProficiency: (amount: number) => number;
export declare const awardSecondaryShopCraftAffinity: (connection: PoolConnection, characterId: number) => Promise<{
    affinity: number;
    dailyInteractions: number;
    rank: {
        level: number;
        title: string;
    };
} | undefined>;
export declare const shopProgressFor: (connection: Pick<Pool | PoolConnection, "execute">, characterId: number, profession: string) => Promise<{
    level: number;
    proficiency: number;
    required: number;
    bonus: number;
} | null>;
