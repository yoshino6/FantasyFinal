const financeRedironEncounterEligible = (payload) => {
    if (!payload || typeof payload !== 'object')
        return false;
    const detail = payload;
    return typeof detail.choice === 'string' && detail.choice !== 'withdraw' && detail.choice !== 'leave'
        && Number.isInteger(detail.stage) && Number(detail.stage) > 0;
};
const financePveVictoryEligible = (targets) => targets.length > 0 && targets.every(target => !target.cityPursuit && !target.bossTest && !target.professionTrial);
const financeRumorPairs = [
    ['silverbell', 'wanleaf_trade_union'],
    ['adventurer_guild', 'rediron_caravan'],
    ['smiths_association', 'deconstructors_association'],
    ['alchemists_association', 'omniscients_association'],
    ['worldtree_covenant', 'mistalgae_ferrymen']
];
const financeRumorPairIndex = (period, pairCount) => {
    if (!/^\d{10}$/.test(period) || pairCount < 1)
        throw new Error('无效的证券传闻时段或配对数量。');
    const start = Date.UTC(Number(period.slice(0, 4)), Number(period.slice(4, 6)) - 1, Number(period.slice(6, 8)), Number(period.slice(8, 10)));
    return Math.floor(start / (4 * 60 * 60 * 1000)) % pairCount;
};
const publicFinanceNews = (period, news) => {
    if (news.length < 2)
        return [];
    const sorted = [...news].sort((a, b) => a.id - b.id);
    const seed = [...period].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
    return [sorted[seed % sorted.length]];
};
const financePriceDirectionMatched = (beforeMilli, afterMilli, direction) => Math.sign(Math.round(afterMilli / 1000) - Math.round(beforeMilli / 1000)) === direction;
const financeNewsPriceNote = (direction, outcome, beforeMilli, afterMilli) => {
    if (beforeMilli === null || afterMilli === null || beforeMilli <= 0 || afterMilli <= 0)
        return '本轮报价暂无可比记录。';
    const before = Math.max(1, Math.round(beforeMilli / 1000));
    const after = Math.max(1, Math.round(afterMilli / 1000));
    const factorDirection = Math.sign(direction) * (outcome === 'fulfilled' ? 1 : -1);
    const factor = factorDirection > 0 ? '利好' : '利空';
    const change = Math.sign(after - before);
    if (change === factorDirection)
        return `本条消息计为${factor}；本轮报价 ${before}→${after} 铜币，同向变动。`;
    if (!change)
        return `本条消息计为${factor}；本轮报价 ${before}→${after} 铜币，整铜币价未变。`;
    return `本条消息计为${factor}；本轮报价 ${before}→${after} 铜币，最终反向变动；本轮由多方经营信号共同定价。`;
};

export { financeNewsPriceNote, financePriceDirectionMatched, financePveVictoryEligible, financeRedironEncounterEligible, financeRumorPairIndex, financeRumorPairs, publicFinanceNews };
