import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';

const PAGE_SIZE = 5;
type CharacterRow = RowDataPacket & { id: number; copper_coins: number };
type SellRow = RowDataPacket & { id: number; name: string; item_category: string; quantity: number; sell_price: number };

const characterFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<CharacterRow[]>(`SELECT c.id,c.copper_coins FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return rows[0];
};
const pageInfo = (page: number, total: number) => ({ page: Math.max(1, Math.min(Math.max(1, Math.ceil(total / PAGE_SIZE)), page)), totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
const validQuantity = (quantity: number) => {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error('数量必须是 1 至 999 之间的整数。');
  return quantity;
};
const workshopSellable = "pi.character_id=? AND pi.quantity>0 AND i.is_tradeable=1 AND i.trade_price>0 AND i.item_category IN ('粒子','元素尘','基材','构件','异械') AND i.name LIKE ?";

export const oddWorkshopSellCatalog = async (qqUserId: string, page = 1, keyword = '') => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); const term = `%${keyword.trim()}%`;
  const [counts] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE ${workshopSellable}`, [character.id, term]);
  const paging = pageInfo(page, Number(counts[0]?.total ?? 0));
  const [rows] = await pool.execute<SellRow[]>(`SELECT i.id,i.name,i.item_category,pi.quantity,CEIL(i.trade_price*1.25) AS sell_price
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE ${workshopSellable}
    ORDER BY i.item_category,i.name LIMIT ? OFFSET ?`, [character.id, term, PAGE_SIZE, (paging.page - 1) * PAGE_SIZE]);
  return { items: rows.map(row => ({ id: Number(row.id), name: row.name, category: row.item_category, quantity: Number(row.quantity), price: Number(row.sell_price) })), ...paging, keyword: keyword.trim(), copper: Number(character.copper_coins) };
};

export const sellOddWorkshopItem = async (qqUserId: string, itemId: number, quantity = 1) => withTransaction(async connection => {
  const amount = validQuantity(quantity); const character = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<SellRow[]>(`SELECT i.id,i.name,i.item_category,pi.quantity,CEIL(i.trade_price*1.25) AS sell_price
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 AND i.is_tradeable=1 AND i.trade_price>0
      AND i.item_category IN ('粒子','元素尘','基材','构件','异械') FOR UPDATE`, [character.id, itemId]);
  const item = rows[0]; if (!item) throw new Error('唯薇安只收购粒子、元素尘、基材、构件与异械。');
  if (Number(item.quantity) < amount) throw new Error(`背包数量不足，当前仅有 ${item.quantity} 个。`);
  const price = Number(item.sell_price) * amount;
  await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [amount, character.id, item.id]);
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [amount, character.id, item.id]);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [price, character.id]);
  return { name: item.name, quantity: amount, price };
});
