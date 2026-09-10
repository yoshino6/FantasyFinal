import type { RowDataPacket } from 'mysql2/promise';
export declare const instanceMarketList: (user: string, page?: number, category?: string, keyword?: string) => Promise<{
    page: number;
    pages: number;
    category: string;
    keyword: string;
    characterId: number;
    items: {
        id: number;
        seller_id: number;
        kind: string;
        name: string;
        price: number;
        snapshot: Record<string, unknown>;
    }[];
    instances: RowDataPacket[] | never[];
    pets: {
        id: number;
        name: string;
    }[];
}>;
type MarketRequest = {
    action: 'list' | 'buy' | 'cancel';
    kind: string;
    id: number;
    price: number;
};
export declare const previewInstanceMarket: (user: string, action: MarketRequest["action"], kind: string, id: number, price?: number) => Promise<{
    token: `${string}-${string}-${string}-${string}-${string}`;
    summary: string;
}>;
export declare const confirmInstanceMarket: (user: string, token: string) => Promise<{
    text: string;
}>;
export {};
