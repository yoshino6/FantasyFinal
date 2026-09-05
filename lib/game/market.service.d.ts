export declare const MARKET_PAGE_SIZE = 5;
export declare const MARKET_TYPES: readonly ["全部", "怪材", "锻材", "炼材", "粒子", "药剂", "食物", "其他"];
export declare const marketCatalog: (qqUserId: string, page?: number, type?: string, keyword?: string) => Promise<{
    type: string;
    keyword: string;
    copper: number;
    items: {
        id: number;
        name: string;
        category: string;
        reference: number;
        lowestSell: number | null;
        highestBuy: number | null;
    }[];
    page: number;
    totalPages: number;
}>;
export declare const marketSellable: (qqUserId: string, page?: number, keyword?: string) => Promise<{
    keyword: string;
    items: {
        id: number;
        name: string;
        category: string;
        quantity: number;
        reference: number;
    }[];
    page: number;
    totalPages: number;
}>;
export declare const marketItemDetail: (qqUserId: string, itemId: number) => Promise<{
    id: number;
    name: string;
    category: string;
    description: string;
    reference: number;
    band: {
        min: number;
        max: number;
    };
    lowestSell: number | null;
    highestBuy: number | null;
    volume: number;
}>;
export declare const createMarketSellOrder: (qqUserId: string, itemId: number, price: number, quantity: number) => Promise<{
    name: string;
    side: "buy" | "sell";
    price: number;
    quantity: number;
    remaining: number;
    status: string;
}>;
export declare const createMarketBuyOrder: (qqUserId: string, itemId: number, price: number, quantity: number) => Promise<{
    name: string;
    side: "buy" | "sell";
    price: number;
    quantity: number;
    remaining: number;
    status: string;
}>;
export declare const marketOrders: (qqUserId: string) => Promise<{
    copper: number;
    volume: {
        key: string;
        gross: number;
        fees: number;
        cancellations: number;
    };
    orders: {
        id: number;
        name: string;
        category: string;
        side: "buy" | "sell";
        price: number;
        remaining: number;
        total: number;
        status: string;
        expiresAt: Date;
    }[];
}>;
export declare const cancelMarketOrder: (qqUserId: string, orderId: number) => Promise<{
    side: "buy" | "sell";
    quantity: number;
    fee: number;
}>;
export declare const marketFeeProfile: (qqUserId: string) => Promise<{
    gross: number;
    fees: number;
    cancellations: number;
    nextRate: number;
}>;
