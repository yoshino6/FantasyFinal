export declare const foodBuffText: (buff: Record<string, unknown>) => string;
export declare const restaurantMenu: (qqUserId: string, page?: number, keyword?: string) => Promise<{
    keyword: string;
    copper: number;
    activeFood: {
        name: string;
        buff: Record<string, unknown>;
        remainingSeconds: number;
    } | null;
    page: number;
    totalPages: number;
    meals: {
        id: number;
        name: string;
        category: string;
        description: string;
        processingFee: number;
        ingredients: {
            code: string;
            name: string;
            category: string;
            quantity: number;
            owned: number;
        }[];
        buff: Record<string, unknown>;
        durationMinutes: number;
    }[];
}>;
export declare const enjoyRestaurantMeal: (qqUserId: string, itemId: number) => Promise<{
    name: string;
    processingFee: number;
    ingredients: {
        code: string;
        name: string;
        category: string;
        quantity: number;
        owned: number;
    }[];
    buff: Record<string, unknown>;
    durationMinutes: number;
    replaced: string | null;
}>;
