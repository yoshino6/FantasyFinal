export declare const quickItemConfig: (qqUserId: string) => Promise<{
    slots: {
        slot: number;
        itemId: number;
        name: string;
        category: string;
        codexId: string;
        quantity: number;
    }[];
    items: {
        id: number;
        name: string;
        category: string;
        codexId: string;
        quantity: number;
    }[];
}>;
export declare const setQuickItem: (qqUserId: string, slot: number, itemId: number) => Promise<{
    name: string;
    category: string;
}>;
export declare const clearQuickItem: (qqUserId: string, slot: number) => Promise<void>;
export declare const toggleQuickItem: (qqUserId: string, itemId: number) => Promise<{
    enabled: boolean;
    slot?: undefined;
} | {
    enabled: boolean;
    slot: number;
}>;
