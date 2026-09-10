export declare const discardMaterial: (qqUserId: string, itemId: number, quantity?: number) => Promise<{
    name: string;
    quantity: number;
    remaining: number;
}>;
