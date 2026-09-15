export declare const financeBusinessDate: (date?: Date) => string;
export declare const financePeriodKey: (date?: Date) => string;
export declare const previousFinancePeriod: (key: string) => string;
export declare const nextFinancePeriod: (key: string) => string;
export type PriceInput = {
    code: string;
    priceMilli: number;
    shares: number;
    score: number;
    dayAnchorMilli?: number;
};
export declare const tryConstrainedFinancePrices: (stocks: PriceInput[], directions: ReadonlyMap<string, 1 | -1>) => {
    code: string;
    priceMilli: number;
    shares: number;
    score: number;
    nextMilli: number;
}[] | null;
export declare const stableFinancePrices: (stocks: PriceInput[]) => {
    code: string;
    priceMilli: number;
    shares: number;
    score: number;
    nextMilli: number;
}[];
