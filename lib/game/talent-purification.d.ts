import type { PoolConnection } from 'mysql2/promise';
import type { Binding } from './inventory-binding';
export declare const settleTalentPurification: (connection: PoolConnection, characterId: number, input: {
    id: number;
    code: string;
    outputCode?: string;
    quantity: number;
    success: number;
    valueMultiplier: number;
    proficiencyPerInput: number;
    personal: boolean;
}) => Promise<{
    binding: Binding;
    paid: number;
    refunded: number;
    successes: number;
    outputQuantity: number;
    proficiencyGain: number;
    success: number;
}>;
