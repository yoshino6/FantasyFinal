import type { PoolConnection } from 'mysql2/promise';
export declare const grantOpeningEquipment: (connection: PoolConnection, id: number, code: string) => Promise<{
    id: number;
    name: string;
}>;
export declare const grantCrimsonArmor: (connection: PoolConnection, id: number) => Promise<{
    id: number;
    name: string;
}>;
export declare const previewOpeningChest: (user: string, code: string, quantity: number) => Promise<{
    token: string;
    code: string;
    quantity: number;
}>;
export declare const confirmOpeningChest: (user: string, token: string) => Promise<any>;
export declare const openingChestResult: (user: string, token: string) => Promise<any>;
