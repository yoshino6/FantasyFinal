export type NegotiationItem = {
    id?: number;
    code: string;
    name: string;
    item_type: string;
    item_category: string;
    stackable: number;
    trade_price: number;
    effect_json?: unknown;
    source?: 'instance' | 'stacked';
};
export declare const particleTypes: Record<string, string>;
export declare const negotiationItemObject: (raw: unknown) => Record<string, any>;
export declare const negotiationReferenceValue: (item: Pick<NegotiationItem, "code" | "item_category" | "trade_price" | "effect_json">) => number;
export type NegotiationItemPolicy = {
    usable: boolean;
    category: string;
    subtype: string;
    reason: string;
    value: number;
};
export declare const classifyNegotiationItem: (item: NegotiationItem) => NegotiationItemPolicy;
export declare const negotiationInventoryPage: <T extends NegotiationItem & {
    quantity: number;
    trade_bound_quantity?: number;
    personal_bound_quantity?: number;
}>(items: T[], requestedPage?: number, keyword?: string) => {
    page: number;
    totalPages: number;
    total: number;
    keyword: string;
    items: (T & {
        policy: NegotiationItemPolicy;
        available: number;
    })[];
};
