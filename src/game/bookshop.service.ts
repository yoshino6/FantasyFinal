import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';

const PAGE_SIZE = 5;
type CharacterRow = RowDataPacket & { id: number; copper_coins: number };
type ShopRow = RowDataPacket & { id: number; codex_id: string; name: string; item_category: string; description: string; buy_price: number; stock_quantity: number; owned_quantity: number };
type SellRow = RowDataPacket & { id: number; name: string; item_category: string; quantity: number; price: number };

const characterFor = async (connection: Pool | PoolConnection, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<CharacterRow[]>(`SELECT c.id,c.copper_coins FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return rows[0];
};
const paging = (page: number, total: number) => ({ page: Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / PAGE_SIZE))), totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
const amountOf = (value: number) => { if (!Number.isInteger(value) || value < 1 || value > 999) throw new Error('数量必须是 1 至 999 之间的整数。'); return value; };

export const bookshopCatalog = async (qqUserId: string, page = 1, keyword = '') => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); const term = `%${keyword.trim()}%`;
  const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM bookshop_items bs JOIN item_definitions i ON i.id=bs.item_id WHERE bs.is_active=1 AND i.name LIKE ?', [term]);
  const info = paging(page, Number(countRows[0]?.total ?? 0));
  const [rows] = await pool.execute<ShopRow[]>(`SELECT i.id,i.codex_id,i.name,i.item_category,i.description,bs.buy_price,bs.stock_quantity,COALESCE(pi.quantity,0) AS owned_quantity
    FROM bookshop_items bs JOIN item_definitions i ON i.id=bs.item_id LEFT JOIN player_inventory pi ON pi.character_id=? AND pi.item_id=i.id
    WHERE bs.is_active=1 AND i.name LIKE ? ORDER BY i.id LIMIT ? OFFSET ?`, [character.id, term, PAGE_SIZE, (info.page - 1) * PAGE_SIZE]);
  return { ...info, keyword: keyword.trim(), copper: Number(character.copper_coins), items: rows.map(row => ({ id: Number(row.id), codexId: row.codex_id, name: row.name, category: row.item_category, description: row.description, price: Number(row.buy_price), stockQuantity: Number(row.stock_quantity), ownedQuantity: Number(row.owned_quantity) })) };
};

export const bookshopSellCatalog = async (qqUserId: string, page = 1, keyword = '') => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); const term = `%${keyword.trim()}%`;
  const where = "pi.character_id=? AND pi.quantity>0 AND i.is_tradeable=1 AND i.trade_price>0 AND i.item_category IN ('书籍','卷宗','技能书') AND i.name LIKE ?";
  const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE ${where}`, [character.id, term]);
  const info = paging(page, Number(countRows[0]?.total ?? 0));
  const [rows] = await pool.execute<SellRow[]>(`SELECT i.id,i.name,i.item_category,pi.quantity,CEIL(i.trade_price*1.20) AS price FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE ${where} ORDER BY i.item_category,i.name LIMIT ? OFFSET ?`, [character.id, term, PAGE_SIZE, (info.page - 1) * PAGE_SIZE]);
  return { ...info, keyword: keyword.trim(), copper: Number(character.copper_coins), items: rows.map(row => ({ id: Number(row.id), name: row.name, category: row.item_category, quantity: Number(row.quantity), price: Number(row.price) })) };
};

export const buyBookshopItem = async (qqUserId: string, itemId: number, quantity = 1) => withTransaction(async connection => {
  const amount = amountOf(quantity); const character = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { name: string; buy_price: number; stock_quantity: number })[]>('SELECT i.name,bs.buy_price,bs.stock_quantity FROM bookshop_items bs JOIN item_definitions i ON i.id=bs.item_id WHERE bs.item_id=? AND bs.is_active=1 FOR UPDATE', [itemId]);
  const item = rows[0]; if (!item) throw new Error('这本书已下架。'); if (Number(item.stock_quantity) < amount) throw new Error(`库存不足，剩余 ${item.stock_quantity} 本。`);
  const price = Number(item.buy_price) * amount; if (Number(character.copper_coins) < price) throw new Error(`铜币不足，需要 ${price} 铜币。`);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [price, character.id]);
  await connection.execute('UPDATE bookshop_items SET stock_quantity=stock_quantity-? WHERE item_id=?', [amount, itemId]);
  await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [character.id, itemId, amount]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [character.id, itemId]);
  return { name: item.name, quantity: amount, price };
});

export const sellBookshopItem = async (qqUserId: string, itemId: number, quantity = 1) => withTransaction(async connection => {
  const amount = amountOf(quantity); const character = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(SellRow & { is_tradeable: number; trade_price: number })[]>(`SELECT i.name,i.item_category,i.is_tradeable,i.trade_price,pi.quantity,CEIL(i.trade_price*1.20) AS price FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.item_id=? FOR UPDATE`, [character.id, itemId]);
  const item = rows[0]; if (!item || !item.is_tradeable || !Number(item.trade_price) || !['书籍', '卷宗', '技能书'].includes(item.item_category)) throw new Error('店主只收购可交易的书籍、卷宗与技能书。'); if (Number(item.quantity) < amount) throw new Error(`背包数量不足，当前仅有 ${item.quantity} 本。`);
  const price = Number(item.price) * amount; await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [amount, character.id, itemId]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [character.id, itemId]); await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [price, character.id]);
  return { name: item.name, quantity: amount, price };
});

export const readSkillBook = async (qqUserId: string, itemId: number) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true);
  const [items] = await connection.execute<(RowDataPacket & { name: string; quantity: number; effect_json: unknown })[]>('SELECT i.name,pi.quantity,i.effect_json FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.item_id=? FOR UPDATE', [character.id, itemId]);
  const item = items[0]; if (!item?.quantity) throw new Error('背包中没有这本技能书。'); const effect = typeof item.effect_json === 'string' ? JSON.parse(item.effect_json) : item.effect_json ?? {}; const skillCode = String((effect as Record<string, unknown>).skillBook ?? ''); if (!skillCode) throw new Error('这不是可研读的技能书。');
  const [skills] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM skill_definitions WHERE code=? LIMIT 1', [skillCode]); const skill = skills[0]; if (!skill) throw new Error('书中的术式残缺，暂时无法研读。');
  const [discovered] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_skill_discoveries WHERE character_id=? AND skill_id=? FOR UPDATE', [character.id, skill.id]); const [learned] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_skills WHERE character_id=? AND skill_id=? FOR UPDATE', [character.id, skill.id]); if (discovered[0] || learned[0]) throw new Error(`你已经领悟技能「${skill.name}」。`);
  await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [character.id, itemId]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [character.id, itemId]); await connection.execute('INSERT INTO player_skill_discoveries (character_id,skill_id) VALUES (?,?)', [character.id, skill.id]);
  return { book: item.name, skill: skill.name };
});
