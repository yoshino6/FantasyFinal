export declare const shopCatalog: (qqUserId: string, page?: number, keyword?: string) => Promise<{
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
export declare const sellCatalog: (qqUserId: string, page?: number, keyword?: string) => Promise<{
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
export declare const buyShopItem: (qqUserId: string, itemId: number, quantity?: number) => Promise<{
    name: string;
    quantity: number;
    price: number;
}>;
export declare const sellShopItem: (qqUserId: string, itemId: number, quantity?: number) => Promise<{
    name: string;
    quantity: number;
    price: number;
}>;
