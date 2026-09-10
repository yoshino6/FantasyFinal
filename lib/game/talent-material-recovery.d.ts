import type { PoolConnection } from 'mysql2/promise';
export type MaterialCost = {
    quantity: number;
    paid: Record<string, number>;
    children?: Record<string, MaterialCost>;
};
type Owner = 'stock' | 'market';
export declare const scaleMaterialCost: (cost: MaterialCost, factor: number) => MaterialCost;
export declare const addMaterialCosts: (c: PoolConnection, owner: Owner, id: number, itemId: number, cost: MaterialCost) => Promise<void>;
export declare const takeMaterialCosts: (c: PoolConnection, owner: Owner, id: number, itemId: number, quantity: number) => Promise<MaterialCost>;
export declare const moveMaterialCosts: (c: PoolConnection, from: Owner, fromId: number, to: Owner, toId: number, itemId: number, quantity: number) => Promise<MaterialCost>;
export declare const recoveryMaterialBudget: (cost: MaterialCost, quantity: number, recipe: readonly {
    code: string;
    quantity: number;
}[]) => {
    code: string;
    quantity: number;
}[];
export {};
