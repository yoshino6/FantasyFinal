import { randomInt } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { financeFaction, financeFactions } from './finance-content';
import { financeBusinessDate, financePeriodKey, nextFinancePeriod, previousFinancePeriod, stableFinancePrices, tryConstrainedFinancePrices } from './finance-math';
import { npcTargetShares } from './finance-npc';
import { financeNewsPriceNote, financePriceDirectionMatched, financeRedironEncounterEligible, financeRumorPairIndex, financeRumorPairs, publicFinanceNews } from './finance-policy';
import { recordCharacterOperation } from './character-operation.service';

export { financeBusinessDate, financePeriodKey, nextFinancePeriod, previousFinancePeriod, stableFinancePrices } from './finance-math';
const numeric = (value: unknown) => Number(value ?? 0);
const factorNames: Record<string, string> = {
  market_trade: '万叶市场实际成交', market_forge: '锻材实际成交', market_alchemy: '炼材与药剂实际成交', market_particle: '粒子材料实际成交',
  bounty_claim: '正式悬赏领取', world_commission: '动态站点委托交接', worldtree_commission: '世界树站点委托',
  mistalgae_commission: '雾藻湿地站点委托', rediron_encounter: '赤铁山道事件解决',
  'pvp.defeated': '域民战败', 'pvp.robbed': '域民被劫', 'pvp.escaped': '域民撤逃',
  smith_forge: '锻造师实际打造', alchemy_craft: '炼金师实际炼制', deconstruct_craft: '解构师实际制作',
  'combat.victory': '正式野外战斗获胜', 'combat.defeat': '正式野外战斗失利', 'combat.escaped': '正式野外战斗撤逃'
};

export const assertFinanceShareSupply = async (connection: PoolConnection, code: string) => {
  const [rows] = await connection.execute<(RowDataPacket & { total_shares: number; treasury_shares: number; npc_shares: number; player_shares: number })[]>(`SELECT i.total_shares,i.treasury_shares,n.shares npc_shares,
    (SELECT COALESCE(SUM(h.shares),0) FROM finance_holdings h WHERE h.instrument_code=i.code) player_shares
    FROM finance_instruments i JOIN finance_npc_portfolio n ON n.instrument_code=i.code WHERE i.code=?`, [code]);
  const row = rows[0];
  if (!row || numeric(row.total_shares) !== numeric(row.treasury_shares) + numeric(row.npc_shares) + numeric(row.player_shares)) throw new Error(`${code}的发行份额与持仓账不平，交易已回滚。`);
};

export const refreshFinanceMissions = async () => {
  const pool = await getPool(); const date = financeBusinessDate();
  for (const faction of financeFactions) await pool.execute(`INSERT IGNORE INTO finance_missions
    (business_date,instrument_code,title,source_type,status) VALUES (?,?,?,?,?)`, [date, faction.code, faction.mission, faction.source ?? 'none', faction.source && faction.status === 'open' ? 'available' : 'unavailable']);
};

/** 只接入已经真实结算的业务路径；与源业务事务共用连接。 */
export const recordFinanceSignal = async (connection: PoolConnection, input: {
  sourceKey: string; factionCode: string; characterId: number | null; eventType: string; score: number; sourceType?: string;
}) => {
  const faction = financeFaction(input.factionCode);
  if (!faction || faction.status !== 'open') return;
  const score = Math.max(-5, Math.min(5, Math.trunc(input.score)));
  if (!score) return;
  // 与四小时结算共用行锁；跨段边界上尚未提交的正式业务不会被漏算。
  const [gate] = await connection.execute<RowDataPacket[]>("SELECT copper FROM finance_pools WHERE code='signal_gate' FOR UPDATE");
  if (!gate.length) throw new Error('证券经营信号闸门尚未初始化。');
  const date = financeBusinessDate(), period = financePeriodKey();
  const sourceKey = input.sourceKey.slice(0, 100);
  if (input.characterId !== null) {
    await connection.execute('SELECT id FROM characters WHERE id=? FOR UPDATE', [input.characterId]);
    if (score > 0 && input.sourceType === faction.source) {
      const [accepted] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM finance_mission_acceptances WHERE business_date=? AND instrument_code=? AND character_id=? LIMIT 1', [date, faction.code, input.characterId]);
      if (accepted.length) {
        const [done] = await connection.execute<ResultSetHeader>('INSERT IGNORE INTO finance_mission_completions (business_date,instrument_code,character_id,source_key) VALUES (?,?,?,?)', [date, faction.code, input.characterId, sourceKey]);
        if (done.affectedRows) {
          await connection.execute('UPDATE finance_missions SET completed_count=completed_count+1 WHERE business_date=? AND instrument_code=?', [date, faction.code]);
          await recordCharacterOperation(connection, { characterId: input.characterId, kind: 'finance.mission_completed', source: { system: 'finance_mission', id: `${date}:${faction.code}`, step: 'completed' }, actorRole: 'system', outcome: '完成', summary: `完成${faction.name}委托：${faction.mission}`, detail: { businessDate: date, factionCode: faction.code, factionName: faction.name, title: faction.mission, sourceKey, eventType: input.eventType } });
        }
      }
    }
    const [count] = await connection.execute<(RowDataPacket & { n: number })[]>(`SELECT COUNT(*) n FROM finance_signals
      WHERE character_id=? AND instrument_code=? AND business_date=? AND score ${score > 0 ? '>0' : '<0'} FOR UPDATE`, [input.characterId, faction.code, date]);
    if (numeric(count[0]?.n) >= (score > 0 ? 1 : 3)) return;
  }
  const [insert] = await connection.execute<ResultSetHeader>(`INSERT IGNORE INTO finance_signals
    (source_key,instrument_code,character_id,business_date,period_key,event_type,source_type,score) VALUES (?,?,?,?,?,?,?,?)`,
  [sourceKey, faction.code, input.characterId, date, period, input.eventType, input.sourceType ?? null, score]);
  if (!insert.affectedRows) return;
};

export const recordFinanceMarketTrade = async (connection: PoolConnection, tradeId: number, sellerId: number, itemId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { item_category: string })[]>('SELECT item_category FROM item_definitions WHERE id=?', [itemId]);
  const category = String(rows[0]?.item_category ?? '');
  const sourceKey = `market:${tradeId}`;
  await recordFinanceSignal(connection, { sourceKey, factionCode: 'silverbell', characterId: sellerId, eventType: 'market.trade', sourceType: 'market_trade', score: 1 });
  await recordFinanceSignal(connection, { sourceKey, factionCode: 'wanleaf_trade_union', characterId: sellerId, eventType: 'market.trade', sourceType: 'market_trade', score: 2 });
  const faction = ['锻材', '稀有锻材', '区域锻材'].includes(category) ? ['smiths_association', 'market_forge'] : ['炼材', '药剂'].includes(category) ? ['alchemists_association', 'market_alchemy'] : category === '粒子' ? ['deconstructors_association', 'market_particle'] : null;
  if (faction) await recordFinanceSignal(connection, { sourceKey, factionCode: faction[0]!, characterId: sellerId, eventType: 'market.trade', sourceType: faction[1]!, score: 2 });
};

export const recordFinanceWorldEvent = async (connection: PoolConnection, ledgerId: number, eventType: string, outcome: string, actorId: number | null, regionId: number | null, payload: unknown) => {
  if (actorId === null || regionId === null) return;
  const siteCommission = eventType === 'site.commission' && outcome === 'completed';
  const encounter = eventType === 'encounter.resolved' && outcome === 'resolved';
  if (!siteCommission && !encounter) return;
  const [regions] = await connection.execute<(RowDataPacket & { code: string })[]>('SELECT code FROM map_regions WHERE id=?', [regionId]);
  const region = String(regions[0]?.code ?? '');
  const sourceKey = `world:${ledgerId}`;
  if (encounter) {
    if (region === 'rediron_pass' && financeRedironEncounterEligible(payload)) await recordFinanceSignal(connection, { sourceKey, factionCode: 'rediron_caravan', characterId: actorId, eventType, sourceType: 'rediron_encounter', score: 2 });
    return;
  }
  await recordFinanceSignal(connection, { sourceKey, factionCode: 'omniscients_association', characterId: actorId, eventType, sourceType: 'world_commission', score: 1 });
  if (region === 'world_tree' || region === 'worldtree_meadow') await recordFinanceSignal(connection, { sourceKey, factionCode: 'worldtree_covenant', characterId: actorId, eventType, sourceType: 'worldtree_commission', score: 2 });
  if (region === 'mistalgae_marsh') await recordFinanceSignal(connection, { sourceKey, factionCode: 'mistalgae_ferrymen', characterId: actorId, eventType, sourceType: 'mistalgae_commission', score: 2 });
};

/** 仅消费正式 PvE 战斗的最终结果；每个会话/玩家对同一势力只记一次。 */
export const recordFinanceCombatOutcome = async (connection: PoolConnection, sessionId: string, outcome: 'victory' | 'defeat' | 'escaped', members: Array<{ id: number; npc_code?: string | null; current_region_id: number }>) => {
  for (const member of members) {
    if (member.npc_code) continue;
    const sourceKey = `combat:${sessionId}:${member.id}`;
    const score = outcome === 'victory' ? 1 : -1;
    await recordFinanceSignal(connection, { sourceKey, factionCode: 'adventurer_guild', characterId: Number(member.id), eventType: `combat.${outcome}`, score });
    const [regions] = await connection.execute<(RowDataPacket & { code: string })[]>('SELECT code FROM map_regions WHERE id=?', [member.current_region_id]);
    const region = String(regions[0]?.code ?? '');
    const regional = region === 'rediron_pass' ? 'rediron_caravan' : region === 'mistalgae_marsh' ? 'mistalgae_ferrymen' : region === 'world_tree' || region === 'worldtree_meadow' ? 'worldtree_covenant' : null;
    if (regional) await recordFinanceSignal(connection, { sourceKey, factionCode: regional, characterId: Number(member.id), eventType: `combat.${outcome}`, score });
  }
};

const planNews = async (connection: PoolConnection, period: string) => {
  const [existing] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM finance_news WHERE period_key=? LIMIT 1', [period]);
  if (existing.length) return;
  const available = new Map(financeFactions.filter(faction => faction.status === 'open' && faction.rise.length === 12 && faction.fall.length === 12).map(faction => [faction.code, faction]));
  const pairs = financeRumorPairs.filter(pair => pair.every(code => available.has(code)));
  if (!pairs.length) return;
  const nextPeriod = nextFinancePeriod(period);
  const [prices] = await connection.execute<(RowDataPacket & { code: string; total_shares: number; price_milli: number })[]>("SELECT code,total_shares,price_milli FROM finance_instruments WHERE status='open' ORDER BY code");
  const [anchors] = await connection.execute<(RowDataPacket & { instrument_code: string; price_milli: number })[]>('SELECT instrument_code,price_milli FROM finance_daily_anchors WHERE business_date=?', [nextPeriod.slice(0, 8)]);
  const anchorByCode = new Map(anchors.map(row => [row.instrument_code, numeric(row.price_milli)]));
  const [capitalRows] = await connection.execute<(RowDataPacket & { copper: number })[]>("SELECT copper FROM finance_pools WHERE code IN ('clearing','npc_capital')");
  const capital = capitalRows.reduce((sum, row) => sum + numeric(row.copper), 0);
  const [holdings] = await connection.execute<(RowDataPacket & { instrument_code: string; shares: number })[]>('SELECT instrument_code,SUM(shares) shares FROM finance_holdings WHERE shares>0 GROUP BY instrument_code');
  const directions = randomInt(2) ? [1, -1] : [-1, 1];
  const outcome = randomInt(100) < 82 ? 'fulfilled' : 'reversed';
  const start = financeRumorPairIndex(period, pairs.length);
  const chosenPair = Array.from({ length: pairs.length }, (_, offset) => pairs[(start + offset) % pairs.length]!).find(pair => {
    const effects = pair.map((code, index) => [code, (directions[index]! * (outcome === 'fulfilled' ? 1 : -1)) as 1 | -1] as const);
    const scores = new Map(effects.map(([code, direction]) => [code, direction * (outcome === 'fulfilled' ? 3 : 2)]));
    const inputs = prices.map(row => ({ code: row.code, priceMilli: numeric(row.price_milli), shares: numeric(row.total_shares), score: scores.get(row.code) ?? 0, dayAnchorMilli: anchorByCode.get(row.code) ?? numeric(row.price_milli) }));
    const projected = tryConstrainedFinancePrices(inputs, new Map(effects));
    if (!projected) return false;
    const quotes = new Map(projected.map(row => [row.code, Math.max(1, Math.round(row.nextMilli / 1000))]));
    return capital >= holdings.reduce((sum, row) => sum + numeric(row.shares) * (quotes.get(row.instrument_code) ?? 0), 0);
  });
  if (!chosenPair) return;
  for (let i = 0; i < directions.length; i++) {
    const chosen = available.get(chosenPair[i]!)!;
    const direction = directions[i]!;
    await connection.execute('INSERT INTO finance_news (period_key,instrument_code,direction,scenario_no,outcome) VALUES (?,?,?,?,?)', [period, chosen.code, direction, randomInt(12), outcome]);
  }
};

/** 域民投资团只在真实资本与库存范围内调仓；它的买卖不再反向生成经营分。 */
const rebalanceNpcPortfolio = async (connection: PoolConnection, period: string, items: Array<{ code: string; nextMilli: number; score: number }>) => {
  const [pools] = await connection.execute<(RowDataPacket & { code: string; copper: number })[]>("SELECT code,copper FROM finance_pools WHERE code IN ('clearing','npc_capital') ORDER BY code FOR UPDATE");
  if (pools.length !== 2) throw new Error('域民投资资本或清算准备金尚未初始化。');
  let clearing = numeric(pools.find(row => row.code === 'clearing')?.copper);
  let capital = numeric(pools.find(row => row.code === 'npc_capital')?.copper);
  for (const item of items) {
    const [positions] = await connection.execute<(RowDataPacket & { shares: number })[]>('SELECT shares FROM finance_npc_portfolio WHERE instrument_code=? FOR UPDATE', [item.code]);
    const owned = numeric(positions[0]?.shares);
    const target = npcTargetShares(item.score);
    const delta = Math.max(-100, Math.min(100, target - owned));
    const price = Math.max(1, Math.round(item.nextMilli / 1000));
    if (delta > 0) {
      const [inventory] = await connection.execute<(RowDataPacket & { treasury_shares: number })[]>('SELECT treasury_shares FROM finance_instruments WHERE code=?', [item.code]);
      const shares = Math.min(delta, numeric(inventory[0]?.treasury_shares), Math.floor(capital / price));
      if (!shares) continue;
      const gross = shares * price;
      await connection.execute('UPDATE finance_instruments SET treasury_shares=treasury_shares-? WHERE code=?', [shares, item.code]);
      await connection.execute('UPDATE finance_npc_portfolio SET shares=shares+? WHERE instrument_code=?', [shares, item.code]);
      await connection.execute("UPDATE finance_pools SET copper=copper-? WHERE code='npc_capital'", [gross]);
      await connection.execute("UPDATE finance_pools SET copper=copper+? WHERE code='clearing'", [gross]);
      await connection.execute('INSERT INTO finance_ledger (character_id,event_key,kind,source_account,target_account,copper) VALUES (NULL,?,?,?,?,?)', [`npc:${period}:${item.code}`, 'npc_rebalance', 'pool:npc_capital', 'pool:clearing', gross]);
      await connection.execute("INSERT INTO finance_trades (character_id,actor_kind,instrument_code,side,shares,unit_copper,gross_copper,fee_copper) VALUES (NULL,'npc',?,'buy',?,?,?,0)", [item.code, shares, price, gross]);
      await assertFinanceShareSupply(connection, item.code);
      capital -= gross; clearing += gross;
    } else if (delta < 0) {
      const shares = Math.min(-delta, owned, Math.floor(clearing / price));
      if (!shares) continue;
      const gross = shares * price;
      await connection.execute('UPDATE finance_instruments SET treasury_shares=treasury_shares+? WHERE code=?', [shares, item.code]);
      await connection.execute('UPDATE finance_npc_portfolio SET shares=shares-? WHERE instrument_code=?', [shares, item.code]);
      await connection.execute("UPDATE finance_pools SET copper=copper+? WHERE code='npc_capital'", [gross]);
      await connection.execute("UPDATE finance_pools SET copper=copper-? WHERE code='clearing'", [gross]);
      await connection.execute('INSERT INTO finance_ledger (character_id,event_key,kind,source_account,target_account,copper) VALUES (NULL,?,?,?,?,?)', [`npc:${period}:${item.code}`, 'npc_rebalance', 'pool:clearing', 'pool:npc_capital', gross]);
      await connection.execute("INSERT INTO finance_trades (character_id,actor_kind,instrument_code,side,shares,unit_copper,gross_copper,fee_copper) VALUES (NULL,'npc',?,'sell',?,?,?,0)", [item.code, shares, price, gross]);
      await assertFinanceShareSupply(connection, item.code);
      capital += gross; clearing -= gross;
    }
  }
};

const settleOneFinancePeriod = async (period: string) => {
  const previous = previousFinancePeriod(period);
  await withTransaction(async connection => {
    const [job] = await connection.execute<ResultSetHeader>('INSERT IGNORE INTO finance_jobs (job_key) VALUES (?)', [`price:${period}`]);
    if (!job.affectedRows) return;
    const [instruments] = await connection.execute<(RowDataPacket & { code: string; total_shares: number; price_milli: number })[]>("SELECT code,total_shares,price_milli FROM finance_instruments WHERE status='open' ORDER BY code FOR UPDATE");
    const [gate] = await connection.execute<RowDataPacket[]>("SELECT copper FROM finance_pools WHERE code='signal_gate' FOR UPDATE");
    if (!gate.length) throw new Error('证券经营信号闸门尚未初始化。');
    const [signals] = await connection.execute<(RowDataPacket & { instrument_code: string; score: number })[]>('SELECT instrument_code,COALESCE(SUM(score),0) score FROM finance_signals WHERE period_key=? GROUP BY instrument_code', [previous]);
    const [news] = await connection.execute<(RowDataPacket & { id: number; instrument_code: string; direction: number; outcome: string })[]>('SELECT id,instrument_code,direction,outcome FROM finance_news WHERE period_key=?', [previous]);
    const [signalFactors] = await connection.execute<(RowDataPacket & { instrument_code: string; event_type: string; source_type: string | null; count: number; score: number })[]>(`SELECT instrument_code,event_type,source_type,COUNT(*) count,SUM(score) score
      FROM finance_signals WHERE period_key=? GROUP BY instrument_code,event_type,source_type`, [previous]);
    const date = period.slice(0, 8);
    const openingPeriod = previousFinancePeriod(`${date}00`);
    const [opening] = await connection.execute<(RowDataPacket & { instrument_code: string; price_milli: number })[]>('SELECT instrument_code,price_milli FROM finance_price_history WHERE period_key=?', [openingPeriod]);
    const openingByCode = new Map(opening.map(row => [row.instrument_code, numeric(row.price_milli)]));
    for (const row of instruments) {
      const openingPrice = openingByCode.get(row.code) ?? numeric(row.price_milli);
      // 旧算法可能在本次限幅升级前已越过 20%；首日以现价建锚，不强迫一次跳回。
      const anchor = numeric(row.price_milli) < openingPrice * .8 || numeric(row.price_milli) > openingPrice * 1.2 ? numeric(row.price_milli) : openingPrice;
      await connection.execute('INSERT IGNORE INTO finance_daily_anchors (business_date,instrument_code,price_milli) VALUES (?,?,?)', [date, row.code, anchor]);
    }
    const [anchors] = await connection.execute<(RowDataPacket & { instrument_code: string; price_milli: number })[]>('SELECT instrument_code,price_milli FROM finance_daily_anchors WHERE business_date=?', [date]);
    const anchorByCode = new Map(anchors.map(row => [row.instrument_code, numeric(row.price_milli)]));
    const scores = new Map<string, number>();
    for (const row of signals) scores.set(row.instrument_code, Math.min(10, Math.max(-10, numeric(row.score))));
    for (const row of news) scores.set(row.instrument_code, (scores.get(row.instrument_code) ?? 0) + numeric(row.direction) * (row.outcome === 'fulfilled' ? 3 : -2));
    const priceInputs = instruments.map(row => ({ code: row.code, priceMilli: numeric(row.price_milli), shares: numeric(row.total_shares), score: scores.get(row.code) ?? 0, dayAnchorMilli: anchorByCode.get(row.code) ?? numeric(row.price_milli) }));
    const base = stableFinancePrices(priceInputs);
    const directions = new Map(news.map(row => [row.instrument_code, (numeric(row.direction) * (row.outcome === 'fulfilled' ? 1 : -1)) as 1 | -1]));
    const constrained = news.length ? tryConstrainedFinancePrices(priceInputs, directions) : base;
    const [money] = await connection.execute<(RowDataPacket & { code: string; copper: number })[]>("SELECT code,copper FROM finance_pools WHERE code IN ('clearing','npc_capital') ORDER BY code FOR UPDATE");
    if (money.length !== 2) throw new Error('域民投资资本或清算准备金尚未初始化。');
    const [holdings] = await connection.execute<(RowDataPacket & { instrument_code: string; shares: number; price_milli: number })[]>(`SELECT h.instrument_code,SUM(h.shares) shares,i.price_milli
      FROM finance_holdings h JOIN finance_instruments i ON i.code=h.instrument_code WHERE h.shares>0 GROUP BY h.instrument_code,i.price_milli`);
    const capital = money.reduce((sum, row) => sum + numeric(row.copper), 0);
    const covered = (prices: typeof base) => {
      const nextByCode = new Map(prices.map(item => [item.code, Math.max(1, Math.round(item.nextMilli / 1000))]));
      const liabilities = holdings.reduce((sum, row) => sum + numeric(row.shares) * (nextByCode.get(row.instrument_code) ?? Math.max(1, Math.round(numeric(row.price_milli) / 1000))), 0);
      return capital >= liabilities;
    };
    const constrainedCovered = constrained !== null && covered(constrained);
    const baseCovered = covered(base);
    const next = constrainedCovered ? constrained! : base;
    const solvent = constrainedCovered || baseCovered;
    const priceReason = !solvent ? '投资资本覆盖不足，本轮暂缓调价' : !constrained ? '限幅或市场总值牵制，价格方向未能兑现' : !constrainedCovered ? '投资资本不足以覆盖预言方向报价' : '';
    for (const item of next) {
      const price = solvent ? item.nextMilli : item.priceMilli;
      const factors = signalFactors.filter(row => row.instrument_code === item.code && Math.abs(numeric(row.score)) >= 3)
        .sort((a, b) => Math.abs(numeric(b.score)) - Math.abs(numeric(a.score))).slice(0, 2)
        .map(row => `${factorNames[row.source_type ?? row.event_type] ?? factorNames[row.event_type] ?? '真实经营业务'}×${numeric(row.count)}`);
      const publicNews = news.find(row => row.instrument_code === item.code);
      if (publicNews) {
        const direction = directions.get(item.code)!;
        const matched = financePriceDirectionMatched(item.priceMilli, price, direction);
        await connection.execute('UPDATE finance_news SET price_status=?,price_reason=? WHERE id=?', [matched ? 'matched' : 'blocked', matched ? '' : priceReason || '真实经营目标价与传闻方向相反', publicNews.id]);
        factors.push(`${publicNews.outcome === 'fulfilled' ? '域民传闻应验' : '域民传闻反转'}；${matched ? '整铜币方向兑现' : '行情方向受阻'}`);
      }
      if (!solvent) factors.push('投资资本覆盖不足，本轮暂缓调价');
      await connection.execute('UPDATE finance_instruments SET price_milli=? WHERE code=?', [price, item.code]);
      await connection.execute('INSERT INTO finance_price_history (instrument_code,period_key,price_milli,previous_price_milli,factors_text,score) VALUES (?,?,?,?,?,?)', [item.code, period, price, item.priceMilli, factors.join('；'), item.score]);
    }
    for (const row of news) if (!instruments.some(item => item.code === row.instrument_code))
      await connection.execute("UPDATE finance_news SET price_status='blocked',price_reason='势力未开放报价或已停牌' WHERE id=?", [row.id]);
    await rebalanceNpcPortfolio(connection, period, next.map(item => ({ ...item, nextMilli: solvent ? item.nextMilli : item.priceMilli })));
    await planNews(connection, period);
  });
};

/** 服务中断时回补最多七天的四小时结算；更早的空档不回放虚构行情。 */
export const settleFinancePeriod = async () => {
  const current = financePeriodKey(); const pool = await getPool();
  const [jobs] = await pool.execute<(RowDataPacket & { job_key: string })[]>("SELECT job_key FROM finance_jobs WHERE job_key LIKE 'price:%' ORDER BY job_key DESC LIMIT 1");
  let next = jobs[0] ? nextFinancePeriod(jobs[0].job_key.slice(6)) : current;
  let earliest = current;
  for (let i = 0; i < 41; i++) earliest = previousFinancePeriod(earliest);
  if (next < earliest) {
    await pool.execute('INSERT IGNORE INTO finance_jobs (job_key) VALUES (?)', [`catchup-skip:${next}:${earliest}`]);
    next = earliest;
  }
  for (; next <= current; next = nextFinancePeriod(next)) await settleOneFinancePeriod(next);
  await refreshFinanceMissions();
};

export const financeNewsBoard = async (qqUserId: string) => {
  const period = financePeriodKey(), previous = previousFinancePeriod(period), pool = await getPool();
  const [characters] = await pool.execute<(RowDataPacket & { id: number; current_region_id: number; pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT c.id,c.current_region_id,c.pos_x,c.pos_y,c.pos_z FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1`, [qqUserId]);
  const character = characters[0]; if (!character) throw new Error('请先创建角色。');
  const [atExchange] = await pool.execute<RowDataPacket[]>('SELECT 1 FROM map_npcs WHERE code=\'canopy_exchange\' AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1', [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (!atExchange.length) throw new Error('请到万叶联市的闲聊区听取消息。');
  const [oldNews] = await pool.execute<(RowDataPacket & { id: number; instrument_code: string; direction: number; scenario_no: number; outcome: string; price_status: string; price_reason: string })[]>('SELECT id,instrument_code,direction,scenario_no,outcome,price_status,price_reason FROM finance_news WHERE period_key=? ORDER BY id', [previous]);
  const [priceRows] = await pool.execute<(RowDataPacket & { instrument_code: string; price_milli: number; previous_price_milli: number; factors_text: string })[]>('SELECT instrument_code,price_milli,previous_price_milli,factors_text FROM finance_price_history WHERE period_key=?', [period]);
  const moves = priceRows.filter(row => numeric(row.previous_price_milli) > 0).map(row => ({ faction: financeFaction(row.instrument_code)?.name ?? row.instrument_code,
    before: Math.max(1, Math.round(numeric(row.previous_price_milli) / 1000)), after: Math.max(1, Math.round(numeric(row.price_milli) / 1000)),
    factors: String(row.factors_text ?? '') })).filter(row => row.before !== row.after)
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before)).slice(0, 5);
  const warnings = priceRows.filter(row => String(row.factors_text ?? '').includes('投资资本覆盖不足')).map(row => financeFaction(row.instrument_code)?.name ?? row.instrument_code);
  const history = publicFinanceNews(previous, oldNews).map(row => {
    const faction = financeFaction(row.instrument_code); const scene = row.direction > 0 ? faction?.rise[numeric(row.scenario_no)] : faction?.fall[numeric(row.scenario_no)];
    const quote = priceRows.find(price => price.instrument_code === row.instrument_code);
    const note = financeNewsPriceNote(numeric(row.direction), row.outcome === 'fulfilled' ? 'fulfilled' : 'reversed', quote ? numeric(quote.previous_price_milli) : null, quote ? numeric(quote.price_milli) : null);
    return { faction: faction?.name ?? row.instrument_code, outcome: row.outcome, text: row.outcome === 'fulfilled' ? scene?.fulfilled ?? '本段结算已公示。' : scene?.reversal ?? '先前传言出了变数。',
      priceNote: `${note}${row.price_status === 'blocked' ? ` 行情受阻：${row.price_reason || '未达到整铜币方向档位'}。` : row.price_status === 'pending' ? ' 旧时段未记录方向约束。' : ''}` };
  });
  const heard = await withTransaction(async connection => {
    const [rows] = await connection.execute<(RowDataPacket & { news_id: number | null })[]>('SELECT news_id FROM finance_news_heard WHERE character_id=? AND period_key=? FOR UPDATE', [character.id, period]);
    const [candidates] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM finance_news WHERE period_key=? ORDER BY id', [period]);
    const publicCandidates = publicFinanceNews(period, candidates);
    if (rows.length) return publicCandidates.some(row => numeric(row.id) === numeric(rows[0]!.news_id)) ? rows[0]!.news_id : null;
    const id = publicCandidates.length && randomInt(100) < 25 ? numeric(publicCandidates[0]!.id) : null;
    await connection.execute('INSERT INTO finance_news_heard (character_id,period_key,news_id) VALUES (?,?,?)', [character.id, period, id]);
    return id;
  });
  let prophecy: { faction: string; text: string } | null = null;
  if (heard) {
    const [rows] = await pool.execute<(RowDataPacket & { instrument_code: string; direction: number; scenario_no: number })[]>('SELECT instrument_code,direction,scenario_no FROM finance_news WHERE id=? AND period_key=?', [heard, period]);
    const row = rows[0]; if (row) { const faction = financeFaction(row.instrument_code); const scene = row.direction > 0 ? faction?.rise[numeric(row.scenario_no)] : faction?.fall[numeric(row.scenario_no)]; if (scene) prophecy = { faction: faction!.name, text: scene.prophecy }; }
  }
  return { period, history, prophecy, moves, warnings };
};
