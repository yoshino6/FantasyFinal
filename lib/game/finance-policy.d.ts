export declare const financeRedironEncounterEligible: (payload: unknown) => boolean;
export declare const financePveVictoryEligible: (targets: Array<{
    cityPursuit: boolean;
    bossTest: boolean;
    professionTrial: boolean;
}>) => boolean;
export declare const financeRumorPairs: readonly [readonly ["silverbell", "wanleaf_trade_union"], readonly ["adventurer_guild", "rediron_caravan"], readonly ["smiths_association", "deconstructors_association"], readonly ["alchemists_association", "omniscients_association"], readonly ["worldtree_covenant", "mistalgae_ferrymen"]];
export declare const financeRumorPairIndex: (period: string, pairCount: number) => number;
export declare const publicFinanceNews: <T extends {
    id: number;
}>(period: string, news: T[]) => T[];
export declare const financePriceDirectionMatched: (beforeMilli: number, afterMilli: number, direction: 1 | -1) => boolean;
export declare const financeNewsPriceNote: (direction: number, outcome: "fulfilled" | "reversed", beforeMilli: number | null, afterMilli: number | null) => string;
