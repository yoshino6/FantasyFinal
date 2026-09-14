import { randomUUID } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { recordCharacterOperation } from './character-operation.service';
import { financeFaction } from './finance-content';
import { financeBusinessDate } from './finance-math';
import { copperText, reservedInterestCopper } from './finance-money';
import { npcBuyAllocation, npcSellSupport } from './finance-npc';

type Character = RowDataPacket & { id: number; copper_coins: number; level: number; adventurer_registered: number; created_at: Date; activity_status: string; current_region_id: number; pos_x: number; pos_y: number; pos_z: number; is_spawn_enabled: number; is_owner_only: number; is_enabled: number };
type Account = RowDataPacket & { demand_copper: number };
type Instrument = RowDataPacket & { code: string; name: string; share_name: string; total_shares: number; treasury_shares: number; price_milli: number; status: string };
type PoolRow = RowDataPacket & { copper: number };
type Deposit = RowDataPacket & { id: number; product_code: 'seven' | 'thirty' | 'hundred'; principal_copper: number; reserved_interest_copper: number; matures_ms: number; status: string };

const numeric = (value: unknown) => Number(value ?? 0);
const safeInt = (value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = numeric(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${label}无效。`);
  return n;
};
const product = {
  seven: { name: '七日定存', days: 7, basisPoints: 20, min: 100 },
  thirty: { name: '三十日定存', days: 30, basisPoints: 100, min: 500 },
  hundred: { name: '百日定存', days: 100, basisPoints: 400, min: 2000 }
} as const;
export type DepositProduct = keyof typeof product;
export const depositProducts = product;

const characterFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, qqUserId: string, lock = false): Promise<Character> => {
  const [rows] = await connection.execute<Character[]>(`SELECT c.id,c.copper_coins,c.level,c.adventurer_registered,c.created_at,c.activity_status,c.current_region_id,c.pos_x,c.pos_y,c.pos_z,
    r.is_spawn_enabled,r.is_owner_only,r.is_enabled FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id
    WHERE p.qq_user_id=? AND c.npc_code IS NULL LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先创建角色。');
  return rows[0];
};
const assertStationary = async (connection: PoolConnection, character: Character) => {
  if (character.activity_status !== 'active') throw new Error('当前状态无法办理钱庄或证券业务。');
  if (numeric(character.is_spawn_enabled) || numeric(character.is_owner_only) || !numeric(character.is_enabled)) throw new Error('请前往已开放的安全区。');
  const [travel] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_travels WHERE character_id=? LIMIT 1', [character.id]);
  if (travel.length) throw new Error('旅行途中不能办理钱庄或证券业务。');
  const [combat] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM combat_sessions WHERE character_id=? AND state=\'active\' LIMIT 1', [character.id]);
  if (combat.length) throw new Error('战斗中不能办理钱庄或证券业务。');
  const [pvp] = await connection.execute<RowDataPacket[]>("SELECT 1 FROM player_pvp_battle_sessions WHERE (attacker_character_id=? OR defender_character_id=?) AND state='active' LIMIT 1", [character.id, character.id]);
  if (pvp.length) throw new Error('玩家对战中不能办理钱庄或证券业务。');
};
const assertAtBuilding = async (connection: PoolConnection, character: Character, code: string) => {
  await assertStationary(connection, character);
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM map_npcs WHERE region_id=? AND code=? AND pos_x=? AND pos_y=? AND pos_z=? AND interaction_kind=\'building\' LIMIT 1', [character.current_region_id, code, character.pos_x, character.pos_y, character.pos_z]);
  if (!rows.length) throw new Error('请站在对应建筑入口办理。');
};
const bankAccount = async (connection: PoolConnection, characterId: number): Promise<Account> => {
  await connection.execute('INSERT IGNORE INTO finance_bank_accounts (character_id) VALUES (?)', [characterId]);
  const [rows] = await connection.execute<Account[]>('SELECT demand_copper FROM finance_bank_accounts WHERE character_id=? FOR UPDATE', [characterId]);
  return rows[0]!;
};
const poolBalance = async (connection: PoolConnection, code: string): Promise<number> => {
  const [rows] = await connection.execute<PoolRow[]>('SELECT copper FROM finance_pools WHERE code=? FOR UPDATE', [code]);
  if (!rows[0]) throw new Error(`钱庄资金池 ${code} 未初始化。`);
  return safeInt(rows[0].copper, '资金池余额');
};
const ledger = async (connection: PoolConnection, characterId: number, key: string, kind: string, source: string, target: string, copper: number) => {
  if (!copper) return;
  await connection.execute('INSERT INTO finance_ledger (character_id,event_key,kind,source_account,target_account,copper) VALUES (?,?,?,?,?,?)', [characterId, key, kind, source, target, copper]);
};
const splitFee = async (connection: PoolConnection, characterId: number, key: string, fee: number) => {
  if (!fee) return;
  const interest = Math.floor(fee * .4), risk = Math.floor(fee * .4), burned = fee - interest - risk;
  if (interest) { await connection.execute("UPDATE finance_pools SET copper=copper+? WHERE code='interest'", [interest]); await ledger(connection, characterId, `${key}:interest`, 'trade_fee', `bank:${characterId}`, 'pool:interest', interest); }
  if (risk) { await connection.execute("UPDATE finance_pools SET copper=copper+? WHERE code='clearing'", [risk]); await ledger(connection, characterId, `${key}:risk`, 'trade_fee', `bank:${characterId}`, 'pool:clearing', risk); }
  if (burned) { await connection.execute("UPDATE finance_pools SET copper=copper+? WHERE code='fees_burned'", [burned]); await ledger(connection, characterId, `${key}:burn`, 'trade_fee', `bank:${characterId}`, 'pool:fees_burned', burned); }
};

export const bankSummary = async (qqUserId: string) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId);
  const [accounts] = await pool.execute<Account[]>('SELECT demand_copper FROM finance_bank_accounts WHERE character_id=?', [character.id]);
  const [openDeposits] = await pool.execute<Deposit[]>('SELECT id,product_code,principal_copper,reserved_interest_copper,matures_ms,status FROM finance_bank_deposits WHERE character_id=? AND status=\'open\' ORDER BY id DESC', [character.id]);
  const [recentDeposits] = await pool.execute<Deposit[]>('SELECT id,product_code,principal_copper,reserved_interest_copper,matures_ms,status FROM finance_bank_deposits WHERE character_id=? AND status<>\'open\' ORDER BY id DESC LIMIT 3', [character.id]);
  return { pocket: safeInt(character.copper_coins, '随身余额'), demand: safeInt(accounts[0]?.demand_copper, '活期余额'), openCount: openDeposits.length, deposits: [...openDeposits, ...recentDeposits].map(row => ({ id: numeric(row.id), product: product[row.product_code]?.name ?? row.product_code, principal: numeric(row.principal_copper), interest: numeric(row.reserved_interest_copper), due: numeric(row.matures_ms), status: row.status })) };
};

export const bankTransfer = async (qqUserId: string, amount: number, direction: 'in' | 'out') => withTransaction(async connection => {
  const copper = safeInt(amount, '金额', 1, 99_999_999);
  const character = await characterFor(connection, qqUserId, true); await assertAtBuilding(connection, character, 'silver_bell_bank');
  const account = await bankAccount(connection, numeric(character.id));
  const eventKey = `bank:${character.id}:${randomUUID()}`;
  if (direction === 'in') {
    const [deduct] = await connection.execute<ResultSetHeader>('UPDATE characters SET copper_coins=copper_coins-? WHERE id=? AND copper_coins>=?', [copper, character.id, copper]);
    if (!deduct.affectedRows) throw new Error('随身银币不足。');
    await connection.execute('UPDATE finance_bank_accounts SET demand_copper=demand_copper+? WHERE character_id=?', [copper, character.id]);
    await ledger(connection, character.id, eventKey, 'deposit', `pocket:${character.id}`, `bank:${character.id}`, copper);
  } else {
    if (safeInt(account.demand_copper, '活期余额') < copper) throw new Error('活期余额不足。');
    await connection.execute('UPDATE finance_bank_accounts SET demand_copper=demand_copper-? WHERE character_id=? AND demand_copper>=?', [copper, character.id, copper]);
    await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [copper, character.id]);
    await ledger(connection, character.id, eventKey, 'withdraw', `bank:${character.id}`, `pocket:${character.id}`, copper);
  }
  await recordCharacterOperation(connection, { characterId: numeric(character.id), kind: direction === 'in' ? 'bank.deposited' : 'bank.withdrawn', source: { system: 'finance_ledger', id: eventKey, step: 'settled' }, outcome: '已结算', summary: `${direction === 'in' ? '存入' : '取出'}活期 ${copper} 铜币`, detail: { amountCopper: copper, direction } });
  return { copper, direction };
});

export const openBankDeposit = async (qqUserId: string, code: DepositProduct, amount: number) => withTransaction(async connection => {
  const terms = product[code]; if (!terms) throw new Error('未知存单期限。');
  const copper = safeInt(amount, '本金', terms.min, 99_999_999);
  const character = await characterFor(connection, qqUserId, true); await assertAtBuilding(connection, character, 'silver_bell_bank');
  const account = await bankAccount(connection, character.id);
  const [openCount] = await connection.execute<(RowDataPacket & { n: number })[]>('SELECT COUNT(*) n FROM finance_bank_deposits WHERE character_id=? AND status=\'open\'', [character.id]);
  if (numeric(openCount[0]?.n) >= 3) throw new Error('每名角色最多同时持有 3 张未结定存；其余资金可留在活期。');
  if (numeric(account.demand_copper) < copper) throw new Error('活期余额不足。');
  const interestPool = await poolBalance(connection, 'interest');
  const interest = reservedInterestCopper(copper, terms.basisPoints, interestPool);
  const now = Date.now(), due = now + terms.days * 86400000;
  const [result] = await connection.execute<ResultSetHeader>('INSERT INTO finance_bank_deposits (character_id,product_code,principal_copper,reserved_interest_copper,opened_ms,matures_ms) VALUES (?,?,?,?,?,?)', [character.id, code, copper, interest, now, due]);
  await connection.execute('UPDATE finance_bank_accounts SET demand_copper=demand_copper-? WHERE character_id=?', [copper, character.id]);
  if (interest) await connection.execute("UPDATE finance_pools SET copper=copper-? WHERE code='interest'", [interest]);
  await ledger(connection, character.id, `deposit:${result.insertId}:principal`, 'term_open', `bank:${character.id}`, `term:${result.insertId}`, copper);
  await ledger(connection, character.id, `deposit:${result.insertId}:interest`, 'interest_reserved', 'pool:interest', `term:${result.insertId}`, interest);
  await recordCharacterOperation(connection, { characterId: numeric(character.id), kind: 'bank.term_opened', source: { system: 'bank_deposit', id: numeric(result.insertId), step: 'opened' }, outcome: '已开立', summary: `开立${terms.name}：本金 ${copper} 铜币`, detail: { depositId: numeric(result.insertId), productCode: code, productName: terms.name, principalCopper: copper, reservedInterestCopper: interest, maturesMs: due } });
  return { id: numeric(result.insertId), copper, interest, due, name: terms.name };
});

export const settleBankDeposit = async (qqUserId: string, depositId: number, early = false) => withTransaction(async connection => {
  const id = safeInt(depositId, '存单编号', 1);
  const character = await characterFor(connection, qqUserId, true); await assertAtBuilding(connection, character, 'silver_bell_bank');
  await bankAccount(connection, character.id);
  const [rows] = await connection.execute<Deposit[]>('SELECT id,product_code,principal_copper,reserved_interest_copper,matures_ms,status FROM finance_bank_deposits WHERE id=? AND character_id=? FOR UPDATE', [id, character.id]);
  const deposit = rows[0]; if (!deposit || deposit.status !== 'open') throw new Error('未找到可结算的存单。');
  const matured = Date.now() >= numeric(deposit.matures_ms);
  if (!matured && !early) throw new Error('这张存单尚未到期。');
  if (!matured && deposit.product_code === 'hundred') throw new Error('百日定存不可提前支取。');
  const principal = safeInt(deposit.principal_copper, '本金'), interest = safeInt(deposit.reserved_interest_copper, '预留利息');
  const penalty = !matured && deposit.product_code === 'thirty' ? Math.ceil(principal * .005) : 0;
  const credit = principal - penalty + (matured ? interest : 0);
  await connection.execute('UPDATE finance_bank_accounts SET demand_copper=demand_copper+? WHERE character_id=?', [credit, character.id]);
  await connection.execute('UPDATE finance_bank_deposits SET status=?,settled_ms=? WHERE id=?', [matured ? 'matured' : 'early', Date.now(), id]);
  if (!matured && interest + penalty) await connection.execute("UPDATE finance_pools SET copper=copper+? WHERE code='interest'", [interest + penalty]);
  await ledger(connection, character.id, `deposit:${id}:settlement`, matured ? 'term_matured' : 'term_early', `term:${id}`, `bank:${character.id}`, credit);
  if (!matured && interest) await ledger(connection, character.id, `deposit:${id}:interest_return`, 'interest_return', `term:${id}`, 'pool:interest', interest);
  if (penalty) await ledger(connection, character.id, `deposit:${id}:penalty`, 'term_penalty', `term:${id}`, 'pool:interest', penalty);
  await recordCharacterOperation(connection, { characterId: numeric(character.id), kind: matured ? 'bank.term_matured' : 'bank.term_early', source: { system: 'bank_deposit', id, step: 'settled' }, outcome: matured ? '到期结算' : '提前支取', summary: `${matured ? '结算' : '提前支取'}存单 ${id}`, detail: { depositId: id, principalCopper: principal, interestCopper: matured ? interest : 0, penaltyCopper: penalty, creditedCopper: credit } });
  return { credit, interest: matured ? interest : 0, penalty, matured };
});

export const financeCatalog = async (qqUserId: string) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId);
  const [account] = await pool.execute<Account[]>('SELECT demand_copper FROM finance_bank_accounts WHERE character_id=?', [character.id]);
  const [rows] = await pool.execute<Instrument[]>('SELECT code,name,share_name,total_shares,treasury_shares,price_milli,status FROM finance_instruments ORDER BY status,code');
  const [holdings] = await pool.execute<(RowDataPacket & { instrument_code: string; shares: number })[]>('SELECT instrument_code,shares FROM finance_holdings WHERE character_id=?', [character.id]);
  const [npcHoldings] = await pool.execute<(RowDataPacket & { instrument_code: string; shares: number })[]>('SELECT instrument_code,shares FROM finance_npc_portfolio');
  const [liquidity] = await pool.execute<(RowDataPacket & { code: string; copper: number })[]>("SELECT code,copper FROM finance_pools WHERE code IN ('clearing','npc_capital')");
  const [obligations] = await pool.execute<(RowDataPacket & { copper: number })[]>(`SELECT COALESCE(SUM(h.shares * GREATEST(1,ROUND(i.price_milli/1000))),0) copper
    FROM finance_holdings h JOIN finance_instruments i ON i.code=h.instrument_code WHERE h.shares>0`);
  const owned = new Map(holdings.map(row => [row.instrument_code, numeric(row.shares)]));
  const npcOwned = new Map(npcHoldings.map(row => [row.instrument_code, numeric(row.shares)]));
  return { demand: numeric(account[0]?.demand_copper), liquidity: liquidity.reduce((sum, row) => sum + numeric(row.copper), 0), obligations: numeric(obligations[0]?.copper), instruments: rows.map(row => ({ code: row.code, name: row.name, share: row.share_name, price: Math.max(1, Math.round(numeric(row.price_milli) / 1000)), priceMilli: numeric(row.price_milli), treasury: numeric(row.treasury_shares), npcShares: npcOwned.get(row.code) ?? 0, total: numeric(row.total_shares), owned: owned.get(row.code) ?? 0, status: row.status })) };
};

export const financeTrade = async (qqUserId: string, code: string, sharesInput: number, side: 'buy' | 'sell', expectedPrice: number) => {
  await (await import('./finance-settlement')).settleFinancePeriod();
  return withTransaction(async connection => {
  const shares = safeInt(sharesInput, '份额数量', 1, 100);
  const faction = financeFaction(code);
  if (!faction || faction.status !== 'open') throw new Error('该份额尚未开放。');
  const character = await characterFor(connection, qqUserId, true); await assertAtBuilding(connection, character, 'canopy_exchange');
  if (numeric(character.level) < 10 || !numeric(character.adventurer_registered)) throw new Error('请先完成冒险者登记并达到 Lv.10。');
  if (Date.now() - new Date(character.created_at).getTime() < 72 * 3600000) throw new Error('角色注册满 72 小时后，才能交易势力份额。');
  const account = await bankAccount(connection, character.id);
  const [rows] = await connection.execute<Instrument[]>('SELECT * FROM finance_instruments WHERE code=? FOR UPDATE', [code]);
  const instrument = rows[0]; if (!instrument || instrument.status !== 'open') throw new Error('该份额当前不能交易。');
  await connection.execute('INSERT IGNORE INTO finance_holdings (character_id,instrument_code,shares) VALUES (?,?,0)', [character.id, code]);
  const [positions] = await connection.execute<(RowDataPacket & { shares: number })[]>('SELECT shares FROM finance_holdings WHERE character_id=? AND instrument_code=? FOR UPDATE', [character.id, code]);
  const position = numeric(positions[0]?.shares);
  await connection.execute('INSERT IGNORE INTO finance_npc_portfolio (instrument_code,shares) VALUES (?,0)', [code]);
  const price = Math.max(1, Math.round(numeric(instrument.price_milli) / 1000));
  if (safeInt(expectedPrice, '报价', 1) !== price) throw new Error(`报价已变化，当前每份 ${copperText(price)}，请刷新行情后重新确认。`);
  const gross = safeInt(price * shares, '成交额', 1, 99_999_999);
  const fee = Math.ceil(gross * (side === 'buy' ? .01 : .015));
  if (side === 'sell' && gross <= fee) throw new Error('成交额不足以支付手续费，请增加份额后再卖出。');
  const clearing = await poolBalance(connection, 'clearing');
  const npcCapital = await poolBalance(connection, 'npc_capital');
  const [npcPositions] = await connection.execute<(RowDataPacket & { shares: number })[]>('SELECT shares FROM finance_npc_portfolio WHERE instrument_code=? FOR UPDATE', [code]);
  const npcShares = numeric(npcPositions[0]?.shares);
  let fromNpc = 0, fromTreasury = 0, support = 0;
  if (side === 'buy') {
    if (position + shares > Math.floor(numeric(instrument.total_shares) * .05)) throw new Error('单势力持仓上限为总份额的 5%。');
    ({ fromNpc, fromTreasury } = npcBuyAllocation(shares, npcShares, numeric(instrument.treasury_shares)));
    if (numeric(account.demand_copper) < gross + fee) throw new Error('钱庄活期余额不足。');
    await connection.execute('UPDATE finance_bank_accounts SET demand_copper=demand_copper-? WHERE character_id=?', [gross + fee, character.id]);
    if (fromNpc) {
      await connection.execute('UPDATE finance_npc_portfolio SET shares=shares-? WHERE instrument_code=?', [fromNpc, code]);
      await connection.execute("UPDATE finance_pools SET copper=copper+? WHERE code='npc_capital'", [fromNpc * price]);
    }
    if (fromTreasury) {
      await connection.execute('UPDATE finance_instruments SET treasury_shares=treasury_shares-? WHERE code=?', [fromTreasury, code]);
      await connection.execute("UPDATE finance_pools SET copper=copper+? WHERE code='clearing'", [fromTreasury * price]);
    }
    await connection.execute('UPDATE finance_holdings SET shares=shares+? WHERE character_id=? AND instrument_code=?', [shares, character.id, code]);
  } else {
    if (position < shares) throw new Error('可出售份额不足。');
    support = npcSellSupport(gross, npcCapital, clearing);
    if (support) {
      await connection.execute("UPDATE finance_pools SET copper=copper-? WHERE code='clearing'", [support]);
      await connection.execute("UPDATE finance_pools SET copper=copper+? WHERE code='npc_capital'", [support]);
    }
    await connection.execute('UPDATE finance_holdings SET shares=shares-? WHERE character_id=? AND instrument_code=?', [shares, character.id, code]);
    await connection.execute('UPDATE finance_npc_portfolio SET shares=shares+? WHERE instrument_code=?', [shares, code]);
    await connection.execute("UPDATE finance_pools SET copper=copper-? WHERE code='npc_capital'", [gross]);
    await connection.execute('UPDATE finance_bank_accounts SET demand_copper=demand_copper+? WHERE character_id=?', [gross - fee, character.id]);
  }
  const [trade] = await connection.execute<ResultSetHeader>('INSERT INTO finance_trades (character_id,instrument_code,side,shares,unit_copper,gross_copper,fee_copper) VALUES (?,?,?,?,?,?,?)', [character.id, code, side, shares, price, gross, fee]);
  const key = `finance-trade:${trade.insertId}`;
  if (side === 'buy') {
    await ledger(connection, character.id, `${key}:npc`, 'share_trade', `bank:${character.id}`, 'pool:npc_capital', fromNpc * price);
    await ledger(connection, character.id, `${key}:treasury`, 'share_trade', `bank:${character.id}`, 'pool:clearing', fromTreasury * price);
  } else {
    await ledger(connection, character.id, `${key}:support`, 'npc_liquidity', 'pool:clearing', 'pool:npc_capital', support);
    await ledger(connection, character.id, `${key}:npc`, 'share_trade', 'pool:npc_capital', `bank:${character.id}`, gross);
  }
  await splitFee(connection, character.id, key, fee);
  await (await import('./finance-settlement')).assertFinanceShareSupply(connection, code);
  await recordCharacterOperation(connection, { characterId: numeric(character.id), kind: side === 'buy' ? 'finance.share_bought' : 'finance.share_sold', source: { system: 'finance_trade', id: numeric(trade.insertId), step: 'settled' }, outcome: '成交', summary: `${side === 'buy' ? '买入' : '卖出'}${instrument.share_name} ×${shares}`, detail: { tradeId: numeric(trade.insertId), instrumentCode: code, shareName: instrument.share_name, shares, unitCopper: price, grossCopper: gross, feeCopper: fee, netCopper: side === 'sell' ? gross - fee : gross + fee } });
  return { name: instrument.share_name, side, shares, price, gross, fee, net: side === 'sell' ? gross - fee : gross + fee };
  });
};

export const financeMissionList = async (qqUserId: string, code: string) => {
  const faction = financeFaction(code); if (!faction) throw new Error('未知势力。');
  const pool = await getPool(); const character = await characterFor(pool, qqUserId);
  if (faction.building) {
    const [buildings] = await pool.execute<RowDataPacket[]>('SELECT 1 FROM map_npcs WHERE code=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1', [faction.building, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
    if (!buildings.length) throw new Error(`请前往${faction.name}的分所或对应建筑。`);
  }
  const date = financeBusinessDate();
  const [rows] = await pool.execute<(RowDataPacket & { title: string; status: string; completed_count: number })[]>('SELECT title,status,completed_count FROM finance_missions WHERE business_date=? AND instrument_code=?', [date, code]);
  const [completions] = await pool.execute<RowDataPacket[]>('SELECT 1 FROM finance_mission_completions WHERE business_date=? AND instrument_code=? AND character_id=? LIMIT 1', [date, code, character.id]);
  const [acceptances] = await pool.execute<RowDataPacket[]>('SELECT 1 FROM finance_mission_acceptances WHERE business_date=? AND instrument_code=? AND character_id=? LIMIT 1', [date, code, character.id]);
  return { faction, title: rows[0]?.title ?? faction.mission, status: rows[0]?.status ?? (faction.source && faction.status === 'open' ? 'available' : 'unavailable'), accepted: !!acceptances.length, completed: !!completions.length, count: numeric(rows[0]?.completed_count) };
};

export const acceptFinanceMission = async (qqUserId: string, code: string) => withTransaction(async connection => {
  const faction = financeFaction(code);
  if (!faction?.building || !faction.source || faction.status !== 'open') throw new Error('该势力今日没有开放的委托。');
  const character = await characterFor(connection, qqUserId, true);
  await assertAtBuilding(connection, character, faction.building);
  const date = financeBusinessDate();
  await connection.execute(`INSERT IGNORE INTO finance_missions (business_date,instrument_code,title,source_type,status)
    VALUES (?,?,?,?,'available')`, [date, code, faction.mission, faction.source]);
  const [result] = await connection.execute<ResultSetHeader>('INSERT IGNORE INTO finance_mission_acceptances (business_date,instrument_code,character_id) VALUES (?,?,?)', [date, code, character.id]);
  if (result.affectedRows) await recordCharacterOperation(connection, { characterId: numeric(character.id), kind: 'finance.mission_accepted', source: { system: 'finance_mission', id: `${date}:${code}`, step: 'accepted' }, outcome: '接取', summary: `接取${faction.name}委托：${faction.mission}`, detail: { businessDate: date, instrumentCode: code, factionName: faction.name, title: faction.mission } });
  return { faction, acceptedNow: !!result.affectedRows };
});
