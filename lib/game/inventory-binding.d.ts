import type { PoolConnection } from 'mysql2/promise';
export type Binding = {
    unbound: number;
    trade: number;
    personal: number;
};
export declare const consumeBinding: (stock: Binding, quantity: number, unboundOnly?: boolean) => Binding;
export declare const consumeInventory: (connection: PoolConnection, characterId: number, itemId: number, quantity: number, unboundOnly?: boolean) => Promise<Binding>;
export declare const grantInventory: (connection: PoolConnection, characterId: number, itemId: number, binding: Binding) => Promise<void>;
export declare const productionBinding: (used: Binding, quantity: number, irreversible: boolean) => Binding;
