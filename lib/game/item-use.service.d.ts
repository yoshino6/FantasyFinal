export declare const useInventoryItem: (user: string, itemId: number, token: string) => Promise<{
    consumed: boolean;
    message: string;
    name: string;
}>;
