import { Format } from 'alemonjs';
export declare const secondaryShopFormat: (user: string, shop: string, page?: number, keyword?: string, category?: string) => Promise<Format>;
export declare const finishedShopHandler: () => Promise<void>;
export declare const finishedPurchaseHandler: () => Promise<void>;
export declare const legacyFinishedShopHandler: (shop: string) => () => Promise<void>;
