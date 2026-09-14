/** 只有真正推进赤铁隘口事件的选择，才算驿路同盟的经营成果。 */
export const financeRedironEncounterEligible = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return false;
  const detail = payload as Record<string, unknown>;
  return typeof detail.choice === 'string' && detail.choice !== 'withdraw' && detail.choice !== 'leave'
    && Number.isInteger(detail.stage) && Number(detail.stage) > 0;
};

/** 击退城镇执法者不等同于完成受公会认可的冒险战绩。 */
export const financePveVictoryEligible = (targets: Array<{ cityPursuit: boolean; bossTest: boolean; professionTrial: boolean }>) =>
  targets.length > 0 && targets.every(target => !target.cityPursuit && !target.bossTest && !target.professionTrial);

/** 题材配对表示同一轮域民关注与投资资金的竞争，不暗示两家真实业务必然此消彼长。 */
export const financeRumorPairs = [
  ['silverbell', 'wanleaf_trade_union'],
  ['adventurer_guild', 'rediron_caravan'],
  ['smiths_association', 'deconstructors_association'],
  ['alchemists_association', 'omniscients_association'],
  ['worldtree_covenant', 'mistalgae_ferrymen']
] as const;

/** 固定轮转使五组势力在连续五个四小时时段各获一次传闻机会。 */
export const financeRumorPairIndex = (period: string, pairCount: number) => {
  if (!/^\d{10}$/.test(period) || pairCount < 1) throw new Error('无效的证券传闻时段或配对数量。');
  const start = Date.UTC(Number(period.slice(0, 4)), Number(period.slice(4, 6)) - 1, Number(period.slice(6, 8)), Number(period.slice(8, 10)));
  return Math.floor(start / (4 * 60 * 60 * 1000)) % pairCount;
};

/** 每段两条相反方向的传闻只公开一条；同一时段所有玩家看到相同的公开摘录。 */
export const publicFinanceNews = <T extends { id: number }>(period: string, news: T[]) => {
  if (news.length < 2) return [] as T[];
  const sorted = [...news].sort((a, b) => a.id - b.id);
  const seed = [...period].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
  return [sorted[seed % sorted.length]!];
};

/** 传闻价格命中按玩家实际交易的整铜币报价判断，不按隐藏的千分铜币参考价判断。 */
export const financePriceDirectionMatched = (beforeMilli: number, afterMilli: number, direction: 1 | -1) =>
  Math.sign(Math.round(afterMilli / 1000) - Math.round(beforeMilli / 1000)) === direction;

/** 新闻是否兑现是事件事实；整铜币报价仍由全市场相对强弱共同决定。 */
export const financeNewsPriceNote = (direction: number, outcome: 'fulfilled' | 'reversed', beforeMilli: number | null, afterMilli: number | null) => {
  if (beforeMilli === null || afterMilli === null || beforeMilli <= 0 || afterMilli <= 0) return '本轮报价暂无可比记录。';
  const before = Math.max(1, Math.round(beforeMilli / 1000));
  const after = Math.max(1, Math.round(afterMilli / 1000));
  const factorDirection = Math.sign(direction) * (outcome === 'fulfilled' ? 1 : -1);
  const factor = factorDirection > 0 ? '利好' : '利空';
  const change = Math.sign(after - before);
  if (change === factorDirection) return `本条消息计为${factor}；本轮报价 ${before}→${after} 铜币，同向变动。`;
  if (!change) return `本条消息计为${factor}；本轮报价 ${before}→${after} 铜币，整铜币价未变。`;
  return `本条消息计为${factor}；本轮报价 ${before}→${after} 铜币，最终反向变动；本轮由多方经营信号共同定价。`;
};
