import { withTransaction, getPool } from '../database/pool.js';
import { recordPvpLootSale } from './pvp.service.js';

const PAGE_SIZE = 5;
const characterFor = async (connection, qqUserId, lock = false) => {
    const [rows] = await connection.execute(`SELECT c.id,c.copper_coins FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
    if (!rows[0])
        throw new Error('请先注册角色。');
    return rows[0];
};
const pageInfo = (page, total) => ({ page: Math.max(1, Math.min(Math.max(1, Math.ceil(total / PAGE_SIZE)), page)), totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
const validQuantity = (quantity) => {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999)
        throw new Error('数量必须是 1 至 999 之间的整数。');
    return quantity;
};
const shopCatalog = async (qqUserId, page = 1, keyword = '') => {
    const pool = await getPool();
    const character = await characterFor(pool, qqUserId);
    const term = `%${keyword.trim()}%`;
    const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM guild_shop_items si JOIN item_definitions i ON i.id=si.item_id WHERE si.is_active=1 AND si.buy_price>0 AND i.name LIKE ?', [term]);
    const paging = pageInfo(page, Number(countRows[0]?.total ?? 0));
    const [rows] = await pool.execute(`SELECT i.id,i.codex_id,i.name,i.item_category,i.description,si.buy_price,si.stock_quantity,COALESCE(pi.quantity,0) AS owned_quantity
    FROM guild_shop_items si JOIN item_definitions i ON i.id=si.item_id
    LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=?
    WHERE si.is_active=1 AND si.buy_price>0 AND i.name LIKE ? ORDER BY si.item_id LIMIT ? OFFSET ?`, [character.id, term, PAGE_SIZE, (paging.page - 1) * PAGE_SIZE]);
    return { items: rows.map(row => ({ id: Number(row.id), codexId: row.codex_id, name: row.name, category: row.item_category, description: row.description, price: Number(row.buy_price), stockQuantity: Number(row.stock_quantity), ownedQuantity: Number(row.owned_quantity) })), ...paging, keyword: keyword.trim(), copper: Number(character.copper_coins) };
};
const sellCatalog = async (qqUserId, page = 1, keyword = '') => {
    const pool = await getPool();
    const character = await characterFor(pool, qqUserId);
    const term = `%${keyword.trim()}%`;
    const sellable = "pi.character_id=? AND pi.quantity>0 AND i.is_tradeable=1 AND i.trade_price>0 AND i.item_category NOT IN ('特殊','地图','货币') AND i.item_type IN ('material','consumable') AND i.name LIKE ?";
    const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE ' + sellable, [character.id, term]);
    const paging = pageInfo(page, Number(countRows[0]?.total ?? 0));
    const [rows] = await pool.execute(`SELECT i.id,i.name,i.item_category,pi.quantity,
    i.trade_price AS sell_price
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE ${sellable} ORDER BY i.item_type,i.name LIMIT ? OFFSET ?`, [character.id, term, PAGE_SIZE, (paging.page - 1) * PAGE_SIZE]);
    return { items: rows.map(row => ({ id: Number(row.id), name: row.name, category: row.item_category, quantity: Number(row.quantity), price: Number(row.sell_price) })), ...paging, keyword: keyword.trim(), copper: Number(character.copper_coins) };
};
const buyShopItem = async (qqUserId, itemId, quantity = 1) => withTransaction(async (connection) => {
    const amount = validQuantity(quantity);
    const character = await characterFor(connection, qqUserId, true);
    const [rows] = await connection.execute('SELECT i.id,i.name,i.item_type,i.item_category,i.description,si.buy_price,si.stock_quantity FROM guild_shop_items si JOIN item_definitions i ON i.id=si.item_id WHERE si.item_id=? AND si.is_active=1 AND si.buy_price>0 FOR UPDATE', [itemId]);
    const item = rows[0];
    if (!item)
        throw new Error('该商品已下架。');
    if (Number(item.stock_quantity) < amount)
        throw new Error(`库存不足，剩余 ${item.stock_quantity} 件。`);
    const totalPrice = Number(item.buy_price) * amount;
    if (Number(character.copper_coins) < totalPrice)
        throw new Error(`铜币不足，需要 ${totalPrice} 铜币。`);
    if (item.item_category === '地图') {
        if (amount !== 1)
            throw new Error('地图一次只能购买一张。');
        const [owned] = await connection.execute('SELECT 1 FROM player_inventory WHERE character_id=? AND item_id=? FOR UPDATE', [character.id, item.id]);
        if (owned[0])
            throw new Error('你已经拥有这张地图。');
    }
    await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [totalPrice, character.id]);
    await connection.execute('UPDATE guild_shop_items SET stock_quantity=stock_quantity-? WHERE item_id=?', [amount, item.id]);
    await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [character.id, item.id, amount]);
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [character.id, item.id]);
    return { name: item.name, quantity: amount, price: totalPrice };
});
const sellShopItem = async (qqUserId, itemId, quantity = 1) => withTransaction(async (connection) => {
    const amount = validQuantity(quantity);
    const character = await characterFor(connection, qqUserId, true);
    const [rows] = await connection.execute(`SELECT i.id,i.name,i.item_type,i.item_category,pi.quantity,
    i.trade_price AS sell_price
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 AND i.is_tradeable=1 AND i.trade_price>0
      AND i.item_category NOT IN ('特殊','地图','货币') AND i.item_type IN ('material','consumable') FOR UPDATE`, [character.id, itemId]);
    const item = rows[0];
    if (!item)
        throw new Error('公会商店只收购可交易的常规材料、药剂和食物。');
    if (Number(item.quantity) < amount)
        throw new Error(`背包数量不足，当前仅有 ${item.quantity} 个。`);
    const totalPrice = Number(item.sell_price) * amount;
    await recordPvpLootSale(connection, Number(character.id), Number(item.id), amount, totalPrice);
    await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [amount, character.id, item.id]);
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [character.id, item.id]);
    await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [totalPrice, character.id]);
    return { name: item.name, quantity: amount, price: totalPrice };
});

export { buyShopItem, sellCatalog, sellShopItem, shopCatalog };
