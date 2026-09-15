export type FinanceScenario = {
    prophecy: string;
    fulfilled: string;
    reversal: string;
};
export type FinanceFaction = {
    code: string;
    name: string;
    share: string;
    status: 'open' | 'watch';
    building: string | null;
    mission: string;
    source: string | null;
    rise: FinanceScenario[];
    fall: FinanceScenario[];
};
export declare const financeFactions: FinanceFaction[];
export declare const financeFaction: (code: string) => FinanceFaction | undefined;
