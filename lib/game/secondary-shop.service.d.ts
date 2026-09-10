export declare const secondaryShopNames: {
    blacksmith: string;
    alchemy_sweetshop: string;
    oddworkshop: string;
};
export type SecondaryShop = keyof typeof secondaryShopNames;
export declare const secondaryShopBasicLevel: {
    blacksmith: number;
    alchemy_sweetshop: number;
    oddworkshop: number;
};
export declare const secondaryShopCategories: {
    blacksmith: string[];
    alchemy_sweetshop: string[];
    oddworkshop: string[];
};
type ShopItem = {
    code: string;
    item_type: string;
    item_category: string;
    required_level?: number;
    rarity?: string;
    weapon_type?: string | null;
    effect_json?: unknown;
};
export declare const isSecondaryFinishedProduct: (shop: string, item: ShopItem) => boolean;
export declare const matchesSecondaryShopCategory: (item: ShopItem, category: string) => boolean;
export declare const secondaryFinishedCatalog: (user: string, shopName: string, page?: number, keyword?: string, category?: string) => Promise<{
    shop: "blacksmith" | "alchemy_sweetshop" | "oddworkshop";
    name: string;
    basicLevel: number;
    categories: string[];
    category: string;
    page: number;
    pages: number;
    keyword: string;
    items: {
        id: number;
        name: string;
        category: string;
        description: string;
        codex: string;
        price: number;
        stock: number;
    }[];
}>;
export declare const discoverSecondaryFinished: (user: string, shopName: string, codex: string) => Promise<string>;
export declare const buySecondaryFinished: (user: string, shopName: string, itemId: number, quantity?: number) => Promise<{
    name: string;
    quantity: number;
    price: number;
}>;
export {};
