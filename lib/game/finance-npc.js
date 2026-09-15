const npcBuyAllocation = (shares, npcShares, treasuryShares) => {
    const fromNpc = Math.min(npcShares, shares), fromTreasury = shares - fromNpc;
    if (fromTreasury > treasuryShares)
        throw new Error('该势力目前没有可出售的份额。');
    return { fromNpc, fromTreasury };
};
const npcSellSupport = (gross, npcCapital, clearing) => {
    if (npcCapital + clearing < gross)
        throw new Error('域民投资资本与交易所回购准备金不足，暂时无法兑付。');
    return Math.max(0, gross - npcCapital);
};
const npcTargetShares = (score) => Math.max(300, Math.min(1600, 1000 + score * 40));

export { npcBuyAllocation, npcSellSupport, npcTargetShares };
