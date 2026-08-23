import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { recordPvpLootSale } from './pvp.service';

const PAGE_SIZE = 5;
type Category = '全部' | '回复' | '特殊';
type CharacterRow = RowDataPacket & { id: number; copper_coins: number };
type ShopRow = RowDataPacket & { id: number; codex_id: string; name: string; item_category: string; description: string; buy_price: number; stock_quantity: number; owned_quantity: number };
type SellRow = RowDataPacket & { id: number; name: string; item_category: string; quantity: number; sell_price: number };
const characterFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<CharacterRow[]>(`SELECT c.id,c.copper_coins FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return rows[0];
};
const categoryOf = (value: string): Category => value === '回复' || value === '特殊' ? value : '全部';
const pageInfo = (page: number, total: number) => ({ page: Math.max(1, Math.min(Math.max(1, Math.ceil(total / PAGE_SIZE)), page)), totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
const validQuantity = (quantity: number) => { if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error('数量必须是 1 至 999 之间的整数。'); return quantity; };

export const alchemistShopCatalog = async (qqUserId: string, page = 1, category = '全部', keyword = '') => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); const selected = categoryOf(category); const term = `%${keyword.trim()}%`; const filter = selected === '全部' ? '' : ' AND si.shop_category=?'; const values = selected === '全部' ? [term] : [term, selected];
  const [counts] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM alchemist_shop_items si JOIN item_definitions i ON i.id=si.item_id WHERE si.is_active=1 AND i.name LIKE ?${filter}`, values);
  const paging = pageInfo(page, Number(counts[0]?.total ?? 0));
  const [rows] = await pool.execute<ShopRow[]>(`SELECT i.id,i.codex_id,i.name,i.item_category,i.description,si.buy_price,si.stock_quantity,COALESCE(pi.quantity,0) AS owned_quantity FROM alchemist_shop_items si JOIN item_definitions i ON i.id=si.item_id LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=? WHERE si.is_active=1 AND i.name LIKE ?${filter} ORDER BY si.shop_category,i.id LIMIT ? OFFSET ?`, [character.id, ...values, PAGE_SIZE, (paging.page - 1) * PAGE_SIZE]);
  return { items: rows.map(row => ({ id: Number(row.id), codexId: row.codex_id, name: row.name, category: row.item_category, description: row.description, price: Number(row.buy_price), stockQuantity: Number(row.stock_quantity), ownedQuantity: Number(row.owned_quantity) })), ...paging, category: selected, keyword: keyword.trim(), copper: Number(character.copper_coins) };
};

export const buyAlchemistItem = async (qqUserId: string, itemId: number, quantity = 1) => withTransaction(async connection => {
  const amount = validQuantity(quantity); const character = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(ShopRow & { item_id: number })[]>('SELECT i.id AS item_id,i.name,si.buy_price,si.stock_quantity FROM alchemist_shop_items si JOIN item_definitions i ON i.id=si.item_id WHERE si.item_id=? AND si.is_active=1 FOR UPDATE', [itemId]);
  const item = rows[0]; if (!item) throw new Error('该商品已下架。'); const total = Number(item.buy_price) * amount;
  if (Number(item.stock_quantity) < amount) throw new Error(`库存不足，剩余 ${item.stock_quantity} 件。`);
  if (Number(character.copper_coins) < total) throw new Error(`铜币不足，需要 ${total} 铜币。`);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [total, character.id]);
  await connection.execute('UPDATE alchemist_shop_items SET stock_quantity=stock_quantity-? WHERE item_id=?', [amount, item.item_id]);
  await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [character.id, item.item_id, amount]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [character.id, item.item_id]);
  return { name: item.name, quantity: amount, price: total };
});

const alchemistSellable = "pi.character_id=? AND pi.quantity>0 AND i.is_tradeable=1 AND i.trade_price>0 AND (i.item_category IN ('药剂','食物','粒子','炼材','精兽材','元素尘') OR i.code='healing_herb') AND i.name LIKE ?";

export const alchemistSellCatalog = async (qqUserId: string, page = 1, keyword = '') => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); const term = `%${keyword.trim()}%`;
  const [counts] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE ${alchemistSellable}`, [character.id, term]);
  const paging = pageInfo(page, Number(counts[0]?.total ?? 0));
  const [rows] = await pool.execute<SellRow[]>(`SELECT i.id,i.name,i.item_category,pi.quantity,CEIL(i.trade_price*1.15) AS sell_price
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE ${alchemistSellable}
    ORDER BY i.item_category,i.name LIMIT ? OFFSET ?`, [character.id, term, PAGE_SIZE, (paging.page - 1) * PAGE_SIZE]);
  return { items: rows.map(row => ({ id: Number(row.id), name: row.name, category: row.item_category, quantity: Number(row.quantity), price: Number(row.sell_price) })), ...paging, keyword: keyword.trim(), copper: Number(character.copper_coins) };
};

export const sellAlchemistItem = async (qqUserId: string, itemId: number, quantity = 1) => withTransaction(async connection => {
  const amount = validQuantity(quantity); const character = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<SellRow[]>(`SELECT i.id,i.name,i.item_category,pi.quantity,CEIL(i.trade_price*1.15) AS sell_price
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 AND i.is_tradeable=1 AND i.trade_price>0
      AND (i.item_category IN ('药剂','食物','粒子','炼材','精兽材','元素尘') OR i.code='healing_herb') FOR UPDATE`, [character.id, itemId]);
  const item = rows[0]; if (!item) throw new Error('晴儿只收购药剂、食物、草药与炼金相关素材。');
  if (Number(item.quantity) < amount) throw new Error(`背包数量不足，当前仅有 ${item.quantity} 个。`);
  const price = Number(item.sell_price) * amount;
  await recordPvpLootSale(connection, Number(character.id), Number(item.id), amount, price);
  await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [amount, character.id, item.id]);
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [character.id, item.id]);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [price, character.id]);
  return { name: item.name, quantity: amount, price };
});
