import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';

const PAGE_SIZE = 5;
type Category = '全部' | '回复' | '特殊';
type CharacterRow = RowDataPacket & { id: number; copper_coins: number };
type ShopRow = RowDataPacket & { id: number; codex_id: string; name: string; item_category: string; description: string; buy_price: number; owned_quantity: number };
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
  const [rows] = await pool.execute<ShopRow[]>(`SELECT i.id,i.codex_id,i.name,i.item_category,i.description,si.buy_price,COALESCE(pi.quantity,0) AS owned_quantity FROM alchemist_shop_items si JOIN item_definitions i ON i.id=si.item_id LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=? WHERE si.is_active=1 AND i.name LIKE ?${filter} ORDER BY si.shop_category,i.id LIMIT ? OFFSET ?`, [character.id, ...values, PAGE_SIZE, (paging.page - 1) * PAGE_SIZE]);
  return { items: rows.map(row => ({ id: Number(row.id), codexId: row.codex_id, name: row.name, category: row.item_category, description: row.description, price: Number(row.buy_price), ownedQuantity: Number(row.owned_quantity) })), ...paging, category: selected, keyword: keyword.trim(), copper: Number(character.copper_coins) };
};

export const buyAlchemistItem = async (qqUserId: string, itemId: number, quantity = 1) => withTransaction(async connection => {
  const amount = validQuantity(quantity); const character = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(ShopRow & { item_id: number })[]>('SELECT i.id AS item_id,i.name,si.buy_price FROM alchemist_shop_items si JOIN item_definitions i ON i.id=si.item_id WHERE si.item_id=? AND si.is_active=1 FOR UPDATE', [itemId]);
  const item = rows[0]; if (!item) throw new Error('该商品已下架。'); const total = Number(item.buy_price) * amount;
  if (Number(character.copper_coins) < total) throw new Error(`铜币不足，需要 ${total} 铜币。`);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [total, character.id]);
  await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [character.id, item.item_id, amount]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [character.id, item.item_id]);
  return { name: item.name, quantity: amount, price: total };
});
