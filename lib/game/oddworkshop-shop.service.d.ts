export declare const oddWorkshopSellCatalog: (qqUserId: string, page?: number, keyword?: string) => Promise<{
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
export declare const sellOddWorkshopItem: (qqUserId: string, itemId: number, quantity?: number) => Promise<{
    name: string;
    quantity: number;
    price: number;
}>;
