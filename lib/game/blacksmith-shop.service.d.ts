export declare const blacksmithShopCatalog: (qqUserId: string, page?: number, category?: string, keyword?: string) => Promise<{
    category: string;
    keyword: string;
    copper: number;
    page: number;
    totalPages: number;
    items: {
        id: number;
        codexId: string;
        name: string;
        category: string;
        weaponType: string | null;
        level: number;
        description: string;
        price: number;
        stockQuantity: number;
        ownedQuantity: number;
    }[];
}>;
export declare const blacksmithSellCatalog: (qqUserId: string, page?: number, keyword?: string) => Promise<{
    keyword: string;
    copper: number;
    page: number;
    totalPages: number;
    items: {
        kind: "equipment" | "material";
        id: number;
        name: string;
        category: string;
        level: number;
        quality: number | null;
        quantity: number;
        price: number;
    }[];
}>;
export declare const buyBlacksmithEquipment: (qqUserId: string, itemId: number, quantity?: number) => Promise<{
    name: string;
    quantity: number;
    price: number;
}>;
export declare const sellBlacksmithEquipment: (qqUserId: string, instanceId: number) => Promise<{
    name: string;
    price: number;
}>;
export declare const sellBlacksmithMaterial: (qqUserId: string, itemId: number, quantity?: number) => Promise<{
    name: string;
    quantity: number;
    price: number;
}>;
