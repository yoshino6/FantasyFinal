type Category = '全部' | '回复' | '特殊';
export declare const alchemistShopCatalog: (qqUserId: string, page?: number, category?: string, keyword?: string) => Promise<{
    category: Category;
    keyword: string;
    copper: number;
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
        ownedQuantity: number;
    }[];
}>;
export declare const buyAlchemistItem: (qqUserId: string, itemId: number, quantity?: number) => Promise<{
    name: string;
    quantity: number;
    price: number;
}>;
export declare const alchemistSellCatalog: (qqUserId: string, page?: number, keyword?: string) => Promise<{
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
export declare const sellAlchemistItem: (qqUserId: string, itemId: number, quantity?: number) => Promise<{
    name: string;
    quantity: number;
    price: number;
}>;
export {};
