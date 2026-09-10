export declare const synthesisLossMultiplier: (success: number, refund?: number) => number;
export declare const basicAlchemySupplySuccess: (makerLevel: number) => number;
export declare const constructionSupplyCost: (code: string, makerLevel: number) => {
    materialCost: number;
    expectedCost: number;
};
type RetailItem = {
    code: string;
    required_level?: number;
    retail_price?: number | null;
};
export declare const secondaryFinishedPrice: (shop: string, item: RetailItem, makerLevel: number) => number;
export {};
