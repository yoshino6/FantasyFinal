import { type MaterialCost } from './talent-material-recovery';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { type Binding } from './inventory-binding';
export type MaterialPurpose = 'craft' | 'home' | 'automatonRepair';
export declare const cumulativeMaterialPayment: (quantity: number, factor: number, paidFraction: number) => {
    paid: number;
    credit: number;
};
export declare const talentMaterialPayment: (connection: PoolConnection, id: number, itemId: number, quantity: number, purpose: MaterialPurpose, personal?: boolean, commit?: boolean) => Promise<number>;
export declare const consumeTalentMaterial: (connection: PoolConnection, id: number, itemId: number, quantity: number, purpose: MaterialPurpose, personal?: boolean) => Promise<{
    paid: number;
    binding: Binding;
    recovery: MaterialCost;
}>;
export declare const refundTalentFailure: (connection: PoolConnection, id: number, consumed: {
    itemId: number;
    binding: Binding;
    paid?: number;
    recovery?: MaterialCost;
}[], personal?: boolean) => Promise<number>;
export declare const recordTalentProduct: (connection: PoolConnection, id: number, itemId: number, quantity: number) => Promise<void>;
export declare const isTalentProduct: (connection: PoolConnection, id: number, itemId: number) => Promise<boolean>;
export declare const fixedTalentMaterials: (connection: PoolConnection, id: number, requirements: {
    code: string;
    quantity: number;
}[], auxiliaryCodes: string[], personal?: boolean) => Promise<{
    item: RowDataPacket;
    quantity: number;
}[]>;
