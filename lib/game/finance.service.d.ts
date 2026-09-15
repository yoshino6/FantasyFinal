declare const product: {
    readonly seven: {
        readonly name: "七日定存";
        readonly days: 7;
        readonly basisPoints: 20;
        readonly min: 100;
    };
    readonly thirty: {
        readonly name: "三十日定存";
        readonly days: 30;
        readonly basisPoints: 100;
        readonly min: 500;
    };
    readonly hundred: {
        readonly name: "百日定存";
        readonly days: 100;
        readonly basisPoints: 400;
        readonly min: 2000;
    };
};
export type DepositProduct = keyof typeof product;
export declare const depositProducts: {
    readonly seven: {
        readonly name: "七日定存";
        readonly days: 7;
        readonly basisPoints: 20;
        readonly min: 100;
    };
    readonly thirty: {
        readonly name: "三十日定存";
        readonly days: 30;
        readonly basisPoints: 100;
        readonly min: 500;
    };
    readonly hundred: {
        readonly name: "百日定存";
        readonly days: 100;
        readonly basisPoints: 400;
        readonly min: 2000;
    };
};
export declare const bankSummary: (qqUserId: string) => Promise<{
    pocket: number;
    demand: number;
    openCount: number;
    deposits: {
        id: number;
        product: "七日定存" | "三十日定存" | "百日定存";
        principal: number;
        interest: number;
        due: number;
        status: string;
    }[];
}>;
export declare const bankTransfer: (qqUserId: string, amount: number, direction: "in" | "out") => Promise<{
    copper: number;
    direction: "out" | "in";
}>;
export declare const openBankDeposit: (qqUserId: string, code: DepositProduct, amount: number) => Promise<{
    id: number;
    copper: number;
    interest: number;
    due: number;
    name: "七日定存" | "三十日定存" | "百日定存";
}>;
export declare const settleBankDeposit: (qqUserId: string, depositId: number, early?: boolean) => Promise<{
    credit: number;
    interest: number;
    penalty: number;
    matured: boolean;
}>;
export declare const financeCatalog: (qqUserId: string) => Promise<{
    demand: number;
    liquidity: number;
    obligations: number;
    instruments: {
        code: string;
        name: string;
        share: string;
        price: number;
        priceMilli: number;
        treasury: number;
        npcShares: number;
        total: number;
        owned: number;
        status: string;
    }[];
}>;
export declare const financeTrade: (qqUserId: string, code: string, sharesInput: number, side: "buy" | "sell", expectedPrice: number) => Promise<{
    name: string;
    side: "buy" | "sell";
    shares: number;
    price: number;
    gross: number;
    fee: number;
    net: number;
}>;
export declare const financeMissionList: (qqUserId: string, code: string) => Promise<{
    faction: import("./finance-content").FinanceFaction;
    title: string;
    status: string;
    accepted: boolean;
    completed: boolean;
    count: number;
}>;
export declare const acceptFinanceMission: (qqUserId: string, code: string) => Promise<{
    faction: import("./finance-content").FinanceFaction;
    acceptedNow: boolean;
}>;
export {};
