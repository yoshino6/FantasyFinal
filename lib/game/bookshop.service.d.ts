export declare const bookshopCatalog: (qqUserId: string, page?: number, keyword?: string) => Promise<{
    keyword: string;
    copper: number;
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
    page: number;
    totalPages: number;
}>;
export declare const bookshopSellCatalog: (qqUserId: string, page?: number, keyword?: string) => Promise<{
    keyword: string;
    copper: number;
    items: {
        id: number;
        name: string;
        category: string;
        quantity: number;
        price: number;
    }[];
    page: number;
    totalPages: number;
}>;
export declare const buyBookshopItem: (qqUserId: string, itemId: number, quantity?: number) => Promise<{
    name: string;
    quantity: number;
    price: number;
}>;
export declare const sellBookshopItem: (qqUserId: string, itemId: number, quantity?: number) => Promise<{
    name: string;
    quantity: number;
    price: number;
}>;
export declare const readSkillBook: (qqUserId: string, itemId: number) => Promise<{
    book: string;
    skill: string;
}>;
