export declare const npcBuyAllocation: (shares: number, npcShares: number, treasuryShares: number) => {
    fromNpc: number;
    fromTreasury: number;
};
export declare const npcSellSupport: (gross: number, npcCapital: number, clearing: number) => number;
export declare const npcTargetShares: (score: number) => number;
