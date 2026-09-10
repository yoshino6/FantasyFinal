import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { recordPvpLootSale } from './pvp.service';

const PAGE_SIZE = 5;
type CharacterRow = RowDataPacket & { id: number; copper_coins: number };
type StockRow = RowDataPacket & { id: number; codex_id: string; name: string; item_category: string; description: string; buy_price: number; stock_quantity: number; special_price: number | null; owned_quantity: number };
type SellRow = RowDataPacket & { id: number; name: string; item_category: string; quantity: number; sell_price: number };

const characterFor = async (connection: Pool | PoolConnection, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<CharacterRow[]>(`SELECT c.id,c.copper_coins FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return rows[0];
};

const pageInfo = (page: number, total: number) => ({ page: Math.max(1, Math.min(Math.max(1, Math.ceil(total / PAGE_SIZE)), page)), totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
const quantityOf = (value: number) => {
  if (!Number.isInteger(value) || value < 1 || value > 999) throw new Error('数量必须是 1 至 999 之间的整数。');
  return value;
};

/** 每日首次访问时决定是否出现猎获特价，之后全天保持一致。 */
export const hunterDailySpecial = async (pool: Pool | PoolConnection) => {
  const [existing] = await pool.execute<(RowDataPacket & { item_id: number | null; discount_pct: number; name: string | null })[]>(`
    SELECT ds.item_id,ds.discount_pct,i.name FROM hunter_lodge_daily_specials ds LEFT JOIN item_definitions i ON i.id=ds.item_id
    WHERE ds.special_date=CURDATE() LIMIT 1
  `);
  if (existing[0]) return { itemId: existing[0].item_id === null ? null : Number(existing[0].item_id), name: existing[0].name, discountPct: Number(existing[0].discount_pct) };
  const [choices] = await pool.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT i.id,i.name FROM hunter_lodge_items hs JOIN item_definitions i ON i.id=hs.item_id WHERE hs.is_active=1 ORDER BY i.id');
  const selected = Math.random() < 0.35 && choices.length ? choices[Math.floor(Math.random() * choices.length)] : undefined;
  await pool.execute('INSERT IGNORE INTO hunter_lodge_daily_specials (special_date,item_id,discount_pct) VALUES (CURDATE(),?,?)', [selected?.id ?? null, selected ? 25 : 0]);
  const [resolved] = await pool.execute<(RowDataPacket & { item_id: number | null; discount_pct: number; name: string | null })[]>(`
    SELECT ds.item_id,ds.discount_pct,i.name FROM hunter_lodge_daily_specials ds LEFT JOIN item_definitions i ON i.id=ds.item_id
    WHERE ds.special_date=CURDATE() LIMIT 1
  `);
  return { itemId: resolved[0]?.item_id === null || resolved[0]?.item_id === undefined ? null : Number(resolved[0].item_id), name: resolved[0]?.name ?? null, discountPct: Number(resolved[0]?.discount_pct ?? 0) };
};

export const hunterCatalog = async (qqUserId: string, page = 1, keyword = '') => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); const special = await hunterDailySpecial(pool); const term = `%${keyword.trim()}%`;
  const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM hunter_lodge_items hs JOIN item_definitions i ON i.id=hs.item_id WHERE hs.is_active=1 AND i.name LIKE ?', [term]);
  const paging = pageInfo(page, Number(countRows[0]?.total ?? 0));
  const [rows] = await pool.execute<StockRow[]>(`SELECT i.id,i.codex_id,i.name,i.item_category,i.description,hs.buy_price,hs.stock_quantity,
      CASE WHEN ds.item_id=i.id THEN GREATEST(1,COALESCE(gs.sell_price,0),FLOOR(hs.buy_price*(100-ds.discount_pct)/100)) ELSE NULL END AS special_price,
      COALESCE(pi.quantity,0) AS owned_quantity
    FROM hunter_lodge_items hs JOIN item_definitions i ON i.id=hs.item_id
    LEFT JOIN hunter_lodge_daily_specials ds ON ds.special_date=CURDATE() AND ds.item_id=i.id
    LEFT JOIN guild_shop_items gs ON gs.item_id=i.id
    LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=?
    WHERE hs.is_active=1 AND i.name LIKE ? ORDER BY (ds.item_id IS NOT NULL) DESC,i.id LIMIT ? OFFSET ?`, [character.id, term, PAGE_SIZE, (paging.page - 1) * PAGE_SIZE]);
  return { items: rows.map(row => ({ id: Number(row.id), codexId: row.codex_id, name: row.name, category: row.item_category, description: row.description, price: Number(row.buy_price), stockQuantity: Number(row.stock_quantity), specialPrice: row.special_price === null ? null : Number(row.special_price), ownedQuantity: Number(row.owned_quantity) })), ...paging, keyword: keyword.trim(), copper: Number(character.copper_coins), special };
};

export const hunterSellCatalog = async (qqUserId: string, page = 1, keyword = '') => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); const term = `%${keyword.trim()}%`;
  const where = "pi.character_id=? AND pi.quantity>0 AND i.is_tradeable=1 AND i.trade_price>0 AND i.item_type='consumable' AND i.name LIKE ?";
  const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE ${where}`, [character.id, term]);
  const paging = pageInfo(page, Number(countRows[0]?.total ?? 0));
  const [rows] = await pool.execute<SellRow[]>(`SELECT i.id,i.name,i.item_category,pi.quantity,CEIL(i.trade_price*1.20) AS sell_price
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE ${where} ORDER BY i.item_category,i.name LIMIT ? OFFSET ?`, [character.id, term, PAGE_SIZE, (paging.page - 1) * PAGE_SIZE]);
  return { items: rows.map(row => ({ id: Number(row.id), name: row.name, category: row.item_category, quantity: Number(row.quantity), price: Number(row.sell_price) })), ...paging, keyword: keyword.trim(), copper: Number(character.copper_coins) };
};

export const buyHunterItem = async (qqUserId: string, itemId: number, quantity = 1) => withTransaction(async connection => {
  const amount = quantityOf(quantity); const character = await characterFor(connection, qqUserId, true); const special = await hunterDailySpecial(connection);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string; buy_price: number; stock_quantity: number; sell_price: number })[]>(`SELECT i.id,i.name,hs.buy_price,hs.stock_quantity,COALESCE(gs.sell_price,0) AS sell_price FROM hunter_lodge_items hs JOIN item_definitions i ON i.id=hs.item_id LEFT JOIN guild_shop_items gs ON gs.item_id=i.id WHERE hs.item_id=? AND hs.is_active=1 FOR UPDATE`, [itemId]);
  const item = rows[0]; if (!item) throw new Error('该兽材已经售罄。');
  if (Number(item.stock_quantity) < amount) throw new Error(`库存不足，剩余 ${item.stock_quantity} 份。`);
  const unitPrice = special.itemId === Number(item.id) ? Math.max(1, Number(item.sell_price), Math.floor(Number(item.buy_price) * (100 - special.discountPct) / 100)) : Number(item.buy_price);
  const price = unitPrice * amount; if (Number(character.copper_coins) < price) throw new Error(`铜币不足，需要 ${price} 铜币。`);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [price, character.id]);
  await connection.execute('UPDATE hunter_lodge_items SET stock_quantity=stock_quantity-? WHERE item_id=?', [amount, item.id]);
  await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [character.id, item.id, amount]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [character.id, item.id]);
  return { name: item.name, quantity: amount, price };
});

export const sellHunterItem = async (qqUserId: string, itemId: number, quantity = 1) => withTransaction(async connection => {
  const amount = quantityOf(quantity); const character = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(SellRow & { item_type: string; is_tradeable: number; trade_price: number })[]>(`SELECT i.id,i.name,i.item_type,i.is_tradeable,i.trade_price,i.item_category,pi.quantity,CEIL(i.trade_price*1.20) AS sell_price
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 FOR UPDATE`, [character.id, itemId]);
  const item = rows[0]; if (!item || item.item_type !== 'consumable' || !item.is_tradeable || !Number(item.trade_price)) throw new Error('雷恩只收购可交易的药剂、食物等消耗品。');
  if (Number(item.quantity) < amount) throw new Error(`背包数量不足，当前仅有 ${item.quantity} 个。`);
  const price = Number(item.sell_price) * amount;
  await recordPvpLootSale(connection, Number(character.id), Number(item.id), amount, price);
  await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [amount, character.id, item.id]);
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [character.id, item.id]);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [price, character.id]);
  return { name: item.name, quantity: amount, price };
});
