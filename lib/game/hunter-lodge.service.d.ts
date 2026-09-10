import type { Pool, PoolConnection } from 'mysql2/promise';
export declare const hunterDailySpecial: (pool: Pool | PoolConnection) => Promise<{
    itemId: number | null;
    name: string | null;
    discountPct: number;
}>;
export declare const hunterCatalog: (qqUserId: string, page?: number, keyword?: string) => Promise<{
    keyword: string;
    copper: number;
    special: {
        itemId: number | null;
        name: string | null;
        discountPct: number;
    };
    page: number;
    totalPages: number;
    items: {
        id: number;
        codexId: string;
        name: string;
        category: string;
        description: string;
        price: number;
        stockQuantity: number;
        specialPrice: number | null;
        ownedQuantity: number;
    }[];
}>;
export declare const hunterSellCatalog: (qqUserId: string, page?: number, keyword?: string) => Promise<{
    keyword: string;
    copper: number;
    page: number;
    totalPages: number;
    items: {
        id: number;
        name: string;
        category: string;
        quantity: number;
        price: number;
    }[];
}>;
export declare const buyHunterItem: (qqUserId: string, itemId: number, quantity?: number) => Promise<{
    name: string;
    quantity: number;
    price: number;
}>;
export declare const sellHunterItem: (qqUserId: string, itemId: number, quantity?: number) => Promise<{
    name: string;
    quantity: number;
    price: number;
}>;
