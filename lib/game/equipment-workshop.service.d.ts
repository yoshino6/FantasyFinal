import type { PoolConnection } from 'mysql2/promise';
export type WorkshopMode = 'fusion' | 'reroll' | 'refine';
type Cost = {
    id: number;
    code: string;
    name: string;
    quantity: number;
    recipeQuantity?: number;
};
export declare const workshopCosts: (c: PoolConnection, owner: number, requirements: Array<{
    code: string;
    quantity: number;
}>, selected?: Array<{
    code: string;
    quantity: number;
}>, discounted?: boolean) => Promise<Cost[]>;
export declare const workshopList: (user: string) => Promise<{
    id: number;
    name: string;
    rarity: string;
    level: number;
    quality: string;
}[]>;
export declare const workshopPreview: (user: string, id: number, mode: WorkshopMode) => Promise<{
    token: `${string}-${string}-${string}-${string}-${string}`;
    name: string;
    rarity: string;
    quality: string;
    level: number;
    costs: Cost[];
    fee: number;
    breakthrough: boolean;
}>;
export declare const workshopExecute: (user: string, token: string, expectedMode: WorkshopMode) => Promise<{
    text: string;
    instanceId: number;
}>;
export {};
