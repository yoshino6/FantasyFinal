import { withTransaction, getPool } from '../database/pool.js';

const MARKET_PAGE_SIZE = 5;
const MARKET_TYPES = ['全部', '怪材', '锻材', '炼材', '粒子', '药剂', '食物', '其他'];
const eligible = `i.is_tradeable=1 AND i.stackable=1 AND i.trade_price>0
  AND i.item_type IN ('material','consumable')
  AND i.item_category NOT IN ('特殊','地图','货币','任务','剧情','图纸','礼物','家具')`;
const number = (value) => Number(value ?? 0);
const integer = (value, label, min = 1, max = 999) => {
    if (!Number.isInteger(value) || value < min || value > max)
        throw new Error(`${label}必须是 ${min} 至 ${max} 之间的整数。`);
    return value;
};
const pageInfo = (page, total) => ({ page: Math.max(1, Math.min(Math.max(1, Math.ceil(total / MARKET_PAGE_SIZE)), page)), totalPages: Math.max(1, Math.ceil(total / MARKET_PAGE_SIZE)) });
const weekKey = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const date = new Date(`${values.year}-${values.month}-${values.day}T00:00:00Z`);
    const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const day = Math.floor((date.getTime() - start.getTime()) / 86400000) + 1;
    return `${values.year}${String(Math.ceil(day / 7)).padStart(2, '0')}`;
};
const characterFor = async (connection, qqUserId, lock = false) => {
    const [rows] = await connection.execute(`SELECT c.id,c.copper_coins,c.level,c.adventurer_registered,c.created_at
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
    if (!rows[0])
        throw new Error('请先注册角色。');
    if (number(rows[0].level) < 10 || !number(rows[0].adventurer_registered))
        throw new Error('万叶联市仅向 10 级及以上、已登记的冒险者开放。');
    if (Date.now() - new Date(rows[0].created_at).getTime() < 72 * 3600000)
        throw new Error('角色注册满 72 小时后，才能使用万叶联市。');
    return rows[0];
};
const typeCondition = (type) => {
    if (!MARKET_TYPES.includes(type) || type === '全部')
        return { sql: '', params: [] };
    if (type === '其他')
        return { sql: ` AND i.item_category NOT IN ('怪材','锻材','炼材','粒子','药剂','食物')`, params: [] };
    return { sql: ' AND i.item_category=?', params: [type] };
};
const ensureState = async (connection, itemId, anchor) => {
    const initial = Math.max(1, Math.round(anchor * 2));
    await connection.execute(`INSERT IGNORE INTO market_item_state (item_id,reference_price,npc_anchor_price) VALUES (?,?,?)`, [itemId, initial, Math.max(1, anchor)]);
    const [rows] = await connection.execute('SELECT reference_price,npc_anchor_price FROM market_item_state WHERE item_id=? LIMIT 1 FOR UPDATE', [itemId]);
    return { reference: number(rows[0]?.reference_price) || initial, anchor: number(rows[0]?.npc_anchor_price) || Math.max(1, anchor) };
};
const priceBand = (reference) => ({ min: Math.max(1, Math.ceil(reference * 0.7)), max: Math.max(1, Math.floor(reference * 1.5)) });
const updateReference = async (connection, itemId, oldReference, price, quantity) => {
    const target = Math.round(oldReference * 0.8 + price * 0.2);
    const next = Math.max(Math.floor(oldReference * 0.92), Math.min(Math.ceil(oldReference * 1.08), target));
    await connection.execute(`UPDATE market_item_state SET reference_price=?,daily_buy_volume=daily_buy_volume+?,daily_sell_volume=daily_sell_volume+?,last_trade_at=NOW() WHERE item_id=?`, [Math.max(1, next), quantity, quantity, itemId]);
};
const rebalanceReference = async (connection, itemId, reference) => {
    const [rows] = await connection.execute(`SELECT
    COALESCE(SUM(CASE WHEN side='buy' THEN quantity_remaining ELSE 0 END),0) AS buy_quantity,
    COALESCE(SUM(CASE WHEN side='sell' THEN quantity_remaining ELSE 0 END),0) AS sell_quantity
    FROM market_orders WHERE item_id=? AND status IN ('open','partial') AND expires_at>NOW()`, [itemId]);
    const buy = number(rows[0]?.buy_quantity);
    const sell = number(rows[0]?.sell_quantity);
    if (!buy && !sell)
        return;
    const adjustment = Math.max(0.9, Math.min(1.1, 1 + Math.log((buy || 1) / Math.max(1, sell)) * 0.05));
    const target = Math.round(reference * adjustment);
    const next = Math.max(Math.floor(reference * 0.92), Math.min(Math.ceil(reference * 1.08), target));
    await connection.execute('UPDATE market_item_state SET reference_price=? WHERE item_id=?', [Math.max(1, next), itemId]);
};
const feeForSale = (previous, gross) => {
    const tiers = [[10000, 0.03], [50000, 0.05], [150000, 0.08], [500000, 0.12], [Number.MAX_SAFE_INTEGER, 0.16]];
    let cursor = previous;
    let remaining = gross;
    let fee = 0;
    for (const [limit, rate] of tiers) {
        if (!remaining)
            break;
        const chunk = Math.min(remaining, Math.max(0, limit - cursor));
        if (chunk) {
            fee += Math.ceil(chunk * rate);
            remaining -= chunk;
            cursor += chunk;
        }
    }
    return Math.min(gross, fee);
};
const weeklySales = async (connection, characterId) => {
    const key = weekKey();
    await connection.execute('INSERT IGNORE INTO market_weekly_volume (character_id,week_key) VALUES (?,?)', [characterId, key]);
    const [rows] = await connection.execute('SELECT gross_sales,fee_paid,cancellation_count FROM market_weekly_volume WHERE character_id=? AND week_key=? FOR UPDATE', [characterId, key]);
    return { key, gross: number(rows[0]?.gross_sales), fees: number(rows[0]?.fee_paid), cancellations: number(rows[0]?.cancellation_count) };
};
const addInventory = (connection, characterId, itemId, quantity) => connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?)
  ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()`, [characterId, itemId, quantity]);
const settleMatch = async (connection, sell, buy, quantity, price, reference) => {
    const gross = price * quantity;
    const sellerWeek = await weeklySales(connection, number(sell.character_id));
    const fee = feeForSale(sellerWeek.gross, gross);
    const refund = Math.max(0, number(buy.unit_price) - price) * quantity;
    await addInventory(connection, number(buy.character_id), number(buy.item_id), quantity);
    await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [gross - fee, sell.character_id]);
    if (refund)
        await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [refund, buy.character_id]);
    await connection.execute('UPDATE market_weekly_volume SET gross_sales=gross_sales+?,fee_paid=fee_paid+? WHERE character_id=? AND week_key=?', [gross, fee, sell.character_id, sellerWeek.key]);
    await connection.execute(`INSERT INTO market_trades (buy_order_id,sell_order_id,item_id,quantity,unit_price,gross_copper,fee_copper,seller_net_copper)
    VALUES (?,?,?,?,?,?,?,?)`, [buy.id, sell.id, sell.item_id, quantity, price, gross, fee, gross - fee]);
    for (const order of [sell, buy]) {
        const remain = number(order.quantity_remaining) - quantity;
        const reserved = order.side === 'buy' ? Math.max(0, number(order.reserved_copper) - number(order.unit_price) * quantity) : 0;
        await connection.execute(`UPDATE market_orders SET quantity_remaining=?,reserved_copper=?,status=? WHERE id=?`, [remain, reserved, remain ? 'partial' : 'filled', order.id]);
    }
    await connection.execute('UPDATE market_escrow_items SET quantity=GREATEST(0,quantity-?) WHERE order_id=?', [quantity, sell.id]);
    await updateReference(connection, sell.item_id, reference, price, quantity);
};
const matchOrder = async (connection, order, reference) => {
    const oppositeSide = order.side === 'sell' ? 'buy' : 'sell';
    const operator = order.side === 'sell' ? '>=' : '<=';
    const ordering = order.side === 'sell' ? 'unit_price DESC,created_at ASC,id ASC' : 'unit_price ASC,created_at ASC,id ASC';
    const [opposites] = await connection.execute(`SELECT * FROM market_orders WHERE item_id=? AND side=? AND status IN ('open','partial')
    AND quantity_remaining>0 AND expires_at>NOW() AND unit_price ${operator} ? AND character_id<>? ORDER BY ${ordering} FOR UPDATE`, [order.item_id, oppositeSide, order.unit_price, order.character_id]);
    let remaining = number(order.quantity_remaining);
    for (const opponent of opposites) {
        if (!remaining)
            break;
        const quantity = Math.min(remaining, number(opponent.quantity_remaining));
        const sell = order.side === 'sell' ? order : opponent;
        const buy = order.side === 'buy' ? order : opponent;
        const older = new Date(order.created_at).getTime() <= new Date(opponent.created_at).getTime() ? order : opponent;
        await settleMatch(connection, sell, buy, quantity, number(older.unit_price), reference);
        remaining -= quantity;
        order.quantity_remaining = remaining;
        order.reserved_copper = order.side === 'buy' ? Math.max(0, number(order.reserved_copper) - number(order.unit_price) * quantity) : 0;
    }
};
const releaseExpiredOwned = async (connection, characterId) => {
    const [orders] = await connection.execute(`SELECT * FROM market_orders WHERE character_id=? AND status IN ('open','partial') AND expires_at<=NOW() FOR UPDATE`, [characterId]);
    for (const order of orders) {
        if (order.side === 'sell')
            await addInventory(connection, characterId, number(order.item_id), number(order.quantity_remaining));
        else if (number(order.reserved_copper))
            await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [order.reserved_copper, characterId]);
        await connection.execute(`UPDATE market_orders SET status='expired',reserved_copper=0 WHERE id=?`, [order.id]);
        await connection.execute('DELETE FROM market_escrow_items WHERE order_id=?', [order.id]);
    }
    return orders.length;
};
const marketCatalog = async (qqUserId, page = 1, type = '全部', keyword = '') => {
    const pool = await getPool();
    const character = await characterFor(pool, qqUserId);
    const filter = typeCondition(type);
    const term = `%${keyword.trim()}%`;
    const from = `FROM item_definitions i LEFT JOIN market_item_state ms ON ms.item_id=i.id
    LEFT JOIN (SELECT item_id,MIN(unit_price) AS lowest_sell FROM market_orders WHERE side='sell' AND status IN ('open','partial') AND quantity_remaining>0 AND expires_at>NOW() GROUP BY item_id) sell ON sell.item_id=i.id
    LEFT JOIN (SELECT item_id,MAX(unit_price) AS highest_buy FROM market_orders WHERE side='buy' AND status IN ('open','partial') AND quantity_remaining>0 AND expires_at>NOW() GROUP BY item_id) buy ON buy.item_id=i.id
    WHERE ${eligible}${filter.sql} AND i.name LIKE ? AND (sell.lowest_sell IS NOT NULL OR buy.highest_buy IS NOT NULL)`;
    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total ${from}`, [...filter.params, term]);
    const paging = pageInfo(page, number(countRows[0]?.total));
    const [rows] = await pool.execute(`SELECT i.id,i.name,i.item_category,i.description,i.trade_price,i.stack_limit,
    COALESCE(ms.reference_price,GREATEST(1,ROUND(i.trade_price*2))) AS reference_price,sell.lowest_sell,buy.highest_buy ${from}
    ORDER BY COALESCE(sell.lowest_sell,999999999),i.name LIMIT ? OFFSET ?`, [...filter.params, term, MARKET_PAGE_SIZE, (paging.page - 1) * MARKET_PAGE_SIZE]);
    return { ...paging, type: MARKET_TYPES.includes(type) ? type : '全部', keyword: keyword.trim(), copper: number(character.copper_coins), items: rows.map(row => ({ id: number(row.id), name: row.name, category: row.item_category, reference: number(row.reference_price), lowestSell: row.lowest_sell === null ? null : number(row.lowest_sell), highestBuy: row.highest_buy === null ? null : number(row.highest_buy) })) };
};
const marketSellable = async (qqUserId, page = 1, keyword = '') => {
    const pool = await getPool();
    const character = await characterFor(pool, qqUserId);
    const term = `%${keyword.trim()}%`;
    const where = `pi.character_id=? AND pi.quantity>0 AND ${eligible} AND i.name LIKE ?`;
    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE ${where}`, [character.id, term]);
    const paging = pageInfo(page, number(countRows[0]?.total));
    const [rows] = await pool.execute(`SELECT i.id,i.name,i.item_category,i.description,i.trade_price,i.stack_limit,pi.quantity,ms.reference_price
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id LEFT JOIN market_item_state ms ON ms.item_id=i.id WHERE ${where} ORDER BY i.item_category,i.name LIMIT ? OFFSET ?`, [character.id, term, MARKET_PAGE_SIZE, (paging.page - 1) * MARKET_PAGE_SIZE]);
    return { ...paging, keyword: keyword.trim(), items: rows.map(row => ({ id: number(row.id), name: row.name, category: row.item_category, quantity: number(row.quantity), reference: number(row.reference_price) || Math.max(1, Math.round(number(row.trade_price) * 2)) })) };
};
const marketItemDetail = async (qqUserId, itemId) => {
    const pool = await getPool();
    await characterFor(pool, qqUserId);
    const [rows] = await pool.execute(`SELECT i.id,i.name,i.item_category,i.description,i.trade_price,i.stack_limit,ms.reference_price,sell.lowest_sell,buy.highest_buy,
    (SELECT COALESCE(SUM(mt.quantity),0) FROM market_trades mt WHERE mt.item_id=i.id AND mt.created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)) AS volume
    FROM item_definitions i LEFT JOIN market_item_state ms ON ms.item_id=i.id
    LEFT JOIN (SELECT item_id,MIN(unit_price) AS lowest_sell FROM market_orders WHERE side='sell' AND status IN ('open','partial') AND quantity_remaining>0 AND expires_at>NOW() GROUP BY item_id) sell ON sell.item_id=i.id
    LEFT JOIN (SELECT item_id,MAX(unit_price) AS highest_buy FROM market_orders WHERE side='buy' AND status IN ('open','partial') AND quantity_remaining>0 AND expires_at>NOW() GROUP BY item_id) buy ON buy.item_id=i.id WHERE i.id=? AND ${eligible} LIMIT 1`, [itemId]);
    const item = rows[0];
    if (!item)
        throw new Error('该物品暂不支持在万叶联市交易。');
    const reference = number(item.reference_price) || Math.max(1, Math.round(number(item.trade_price) * 2));
    return { id: number(item.id), name: item.name, category: item.item_category, description: item.description, reference, band: priceBand(reference), lowestSell: item.lowest_sell === null ? null : number(item.lowest_sell), highestBuy: item.highest_buy === null ? null : number(item.highest_buy), volume: number(item.volume) };
};
const createOrder = async (qqUserId, itemId, unitPrice, quantity, side) => withTransaction(async (connection) => {
    const price = integer(unitPrice, '单价', 1, 99999999);
    const amount = integer(quantity, '数量');
    const character = await characterFor(connection, qqUserId, true);
    await releaseExpiredOwned(connection, character.id);
    const [items] = await connection.execute(`SELECT i.id,i.name,i.item_category,i.description,i.trade_price,i.stack_limit FROM item_definitions i WHERE i.id=? AND ${eligible} LIMIT 1 FOR UPDATE`, [itemId]);
    const item = items[0];
    if (!item)
        throw new Error('该物品不可在万叶联市交易。');
    if (amount > number(item.stack_limit))
        throw new Error(`单笔数量不能超过该物品的堆叠上限 ${item.stack_limit}。`);
    const state = await ensureState(connection, number(item.id), number(item.trade_price));
    const band = priceBand(state.reference);
    if (price < band.min || price > band.max)
        throw new Error(`当前参考价为 ${state.reference} 铜币，挂单单价需在 ${band.min} 至 ${band.max} 铜币之间。`);
    const [openRows] = await connection.execute(`SELECT COUNT(*) AS total FROM market_orders WHERE character_id=? AND status IN ('open','partial') FOR UPDATE`, [character.id]);
    if (number(openRows[0]?.total) >= 60)
        throw new Error('同时进行中的市场订单最多为 60 笔。');
    const [dailyRows] = await connection.execute(`SELECT COUNT(*) AS total FROM market_orders WHERE character_id=? AND item_id=? AND created_at>=CURDATE() FOR UPDATE`, [character.id, itemId]);
    if (number(dailyRows[0]?.total) >= 20)
        throw new Error('同一物品每天最多发布 20 笔订单。');
    const week = await weeklySales(connection, character.id);
    const accountAgeDays = Math.floor((Date.now() - new Date(character.created_at).getTime()) / 86400000);
    const weeklyCap = accountAgeDays < 14 ? 20000 : 300000;
    if (side === 'sell' && week.gross + price * amount > weeklyCap)
        throw new Error(`本周寄售额将超过 ${weeklyCap} 铜币的交易额度。`);
    let reserved = 0;
    if (side === 'sell') {
        const [inventory] = await connection.execute('SELECT quantity FROM player_inventory WHERE character_id=? AND item_id=? FOR UPDATE', [character.id, itemId]);
        if (number(inventory[0]?.quantity) < amount)
            throw new Error('背包中的物品数量不足。');
        await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [amount, character.id, itemId]);
        await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [character.id, itemId]);
    }
    else {
        reserved = price * amount;
        if (reserved > 100000)
            throw new Error('单笔求购的托管金额不能超过 100000 铜币。');
        if (number(character.copper_coins) < reserved)
            throw new Error(`铜币不足，需要托管 ${reserved} 铜币。`);
        await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [reserved, character.id]);
    }
    const [insert] = await connection.execute(`INSERT INTO market_orders (character_id,item_id,side,unit_price,quantity_total,quantity_remaining,reserved_copper,expires_at)
    VALUES (?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 72 HOUR))`, [character.id, itemId, side, price, amount, amount, reserved]);
    const order = { id: number(insert.insertId), character_id: character.id, item_id: itemId, side, unit_price: price, quantity_total: amount, quantity_remaining: amount, reserved_copper: reserved, status: 'open', created_at: new Date(), expires_at: new Date(Date.now() + 72 * 3600000) };
    if (side === 'sell')
        await connection.execute('INSERT INTO market_escrow_items (order_id,character_id,item_id,quantity) VALUES (?,?,?,?)', [order.id, character.id, itemId, amount]);
    await matchOrder(connection, order, state.reference);
    await rebalanceReference(connection, itemId, state.reference);
    const [current] = await connection.execute('SELECT * FROM market_orders WHERE id=? LIMIT 1', [order.id]);
    return { name: item.name, side, price, quantity: amount, remaining: number(current[0]?.quantity_remaining), status: current[0]?.status ?? 'open' };
});
const createMarketSellOrder = (qqUserId, itemId, price, quantity) => createOrder(qqUserId, itemId, price, quantity, 'sell');
const createMarketBuyOrder = (qqUserId, itemId, price, quantity) => createOrder(qqUserId, itemId, price, quantity, 'buy');
const marketOrders = (qqUserId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    await releaseExpiredOwned(connection, character.id);
    const [orders] = await connection.execute(`SELECT o.*,i.name,i.item_category FROM market_orders o JOIN item_definitions i ON i.id=o.item_id
    WHERE o.character_id=? ORDER BY o.created_at DESC LIMIT 20`, [character.id]);
    const volume = await weeklySales(connection, character.id);
    return { copper: number(character.copper_coins), volume, orders: orders.map(order => ({ id: number(order.id), name: order.name, category: order.item_category, side: order.side, price: number(order.unit_price), remaining: number(order.quantity_remaining), total: number(order.quantity_total), status: order.status, expiresAt: order.expires_at })) };
});
const cancelMarketOrder = (qqUserId, orderId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    await releaseExpiredOwned(connection, character.id);
    const [orders] = await connection.execute('SELECT * FROM market_orders WHERE id=? AND character_id=? AND status IN (\'open\',\'partial\') LIMIT 1 FOR UPDATE', [orderId, character.id]);
    const order = orders[0];
    if (!order)
        throw new Error('该订单已完成、已结束或不属于你。');
    const volume = await weeklySales(connection, character.id);
    const rapidCancel = Date.now() - new Date(order.created_at).getTime() < 2 * 60 * 1000;
    const rate = rapidCancel ? (volume.cancellations >= 5 ? 0.02 : 0.005) : 0;
    const fee = rate ? Math.max(1, Math.ceil(number(order.quantity_remaining) * number(order.unit_price) * rate)) : 0;
    if (order.side === 'sell')
        await addInventory(connection, character.id, number(order.item_id), number(order.quantity_remaining));
    if (order.side === 'buy' && number(order.reserved_copper)) {
        const refund = number(order.reserved_copper) - fee;
        if (refund < 0)
            throw new Error('该订单的托管余额不足以支付快速撤单费用。');
        await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [refund, character.id]);
    }
    if (order.side === 'sell' && fee) {
        const [wallets] = await connection.execute('SELECT copper_coins FROM characters WHERE id=? FOR UPDATE', [character.id]);
        if (number(wallets[0]?.copper_coins) < fee)
            throw new Error(`快速撤单需支付 ${fee} 铜币手续费，当前铜币不足。`);
        await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [fee, character.id]);
    }
    await connection.execute(`UPDATE market_orders SET status='cancelled',reserved_copper=0 WHERE id=?`, [order.id]);
    await connection.execute('DELETE FROM market_escrow_items WHERE order_id=?', [order.id]);
    await connection.execute('UPDATE market_weekly_volume SET cancellation_count=cancellation_count+1 WHERE character_id=? AND week_key=?', [character.id, volume.key]);
    return { side: order.side, quantity: number(order.quantity_remaining), fee };
});
const marketFeeProfile = async (qqUserId) => {
    const pool = await getPool();
    const character = await characterFor(pool, qqUserId);
    const [rows] = await pool.execute('SELECT gross_sales,fee_paid,cancellation_count FROM market_weekly_volume WHERE character_id=? AND week_key=? LIMIT 1', [character.id, weekKey()]);
    const gross = number(rows[0]?.gross_sales);
    const nextRate = gross < 10000 ? 3 : gross < 50000 ? 5 : gross < 150000 ? 8 : gross < 500000 ? 12 : 16;
    return { gross, fees: number(rows[0]?.fee_paid), cancellations: number(rows[0]?.cancellation_count), nextRate };
};

export { MARKET_PAGE_SIZE, MARKET_TYPES, cancelMarketOrder, createMarketBuyOrder, createMarketSellOrder, marketCatalog, marketFeeProfile, marketItemDetail, marketOrders, marketSellable };
