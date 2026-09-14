/** 域民投资团只分配已经持有的份额与实际资本，不创建交易收入。 */
export const npcBuyAllocation = (shares: number, npcShares: number, treasuryShares: number) => {
  const fromNpc = Math.min(npcShares, shares), fromTreasury = shares - fromNpc;
  if (fromTreasury > treasuryShares) throw new Error('该势力目前没有可出售的份额。');
  return { fromNpc, fromTreasury };
};

export const npcSellSupport = (gross: number, npcCapital: number, clearing: number) => {
  if (npcCapital + clearing < gross) throw new Error('域民投资资本与交易所回购准备金不足，暂时无法兑付。');
  return Math.max(0, gross - npcCapital);
};

export const npcTargetShares = (score: number) => Math.max(300, Math.min(1600, 1000 + score * 40));
