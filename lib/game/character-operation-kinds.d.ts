import { type Allocation } from './types';
export type OperationCategory = '成长' | '战斗' | '委托' | '交互' | '探索' | '交易' | '生活';
export type OperationKindRule = {
    title: string;
    category: OperationCategory;
    weights: Allocation;
    rawUnits: number;
    dailyCapUnits: number;
    repeatHours: number;
};
export declare const characterOperationKinds: Record<string, OperationKindRule>;
export declare const allocateOperationPoints: (totalUnits: number, weight: Allocation) => Allocation;
