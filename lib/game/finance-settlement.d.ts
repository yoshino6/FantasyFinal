import type { PoolConnection } from 'mysql2/promise';
export { financeBusinessDate, financePeriodKey, nextFinancePeriod, previousFinancePeriod, stableFinancePrices } from './finance-math';
export declare const assertFinanceShareSupply: (connection: PoolConnection, code: string) => Promise<void>;
export declare const refreshFinanceMissions: () => Promise<void>;
export declare const recordFinanceSignal: (connection: PoolConnection, input: {
    sourceKey: string;
    factionCode: string;
    characterId: number | null;
    eventType: string;
    score: number;
    sourceType?: string;
}) => Promise<void>;
export declare const recordFinanceMarketTrade: (connection: PoolConnection, tradeId: number, sellerId: number, itemId: number) => Promise<void>;
export declare const recordFinanceWorldEvent: (connection: PoolConnection, ledgerId: number, eventType: string, outcome: string, actorId: number | null, regionId: number | null, payload: unknown) => Promise<void>;
export declare const recordFinanceCombatOutcome: (connection: PoolConnection, sessionId: string, outcome: "victory" | "defeat" | "escaped", members: Array<{
    id: number;
    npc_code?: string | null;
    current_region_id: number;
}>) => Promise<void>;
export declare const settleFinancePeriod: () => Promise<void>;
export declare const financeNewsBoard: (qqUserId: string) => Promise<{
    period: string;
    history: {
        faction: string;
        outcome: string;
        text: string;
        priceNote: string;
    }[];
    prophecy: {
        faction: string;
        text: string;
    } | null;
    moves: {
        faction: string;
        before: number;
        after: number;
        factors: string;
    }[];
    warnings: string[];
}>;
