import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { recordPvpLootSale } from './pvp.service';

const PAGE_SIZE = 5;
type CharacterRow = RowDataPacket & { id: number; copper_coins: number };
type StockRow = RowDataPacket & { id: number; codex_id: string; name: string; item_category: string; required_level: number; description: string; buy_price: number; stock_quantity: number; owned_quantity: number };
type SellRow = RowDataPacket & { instance_id: number; name: string; item_category: string; required_level: number; quality: number; sell_price: number };
type SaleRow = RowDataPacket & { sale_kind: 'equipment' | 'material'; sale_id: number; name: string; item_category: string; required_level: number; quality: number | null; quantity: number; sell_price: number };

const characterFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<CharacterRow[]>(`SELECT c.id,c.copper_coins FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return rows[0];
};
const pageInfo = (page: number, total: number) => ({ page: Math.max(1, Math.min(Math.max(1, Math.ceil(total / PAGE_SIZE)), page)), totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
const validQuantity = (quantity: number) => {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('数量必须是 1 至 99 之间的整数。');
  return quantity;
};
const validMaterialQuantity = (quantity: number) => {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error('数量必须是 1 至 999 之间的整数。');
  return quantity;
};

export const blacksmithShopCatalog = async (qqUserId: string, page = 1, category = '全部', keyword = '') => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); const term = `%${keyword.trim()}%`; const selected = ['头肩', '上装', '腰部', '下装', '脚部'].includes(category) ? category : '全部'; const filter = selected === '全部' ? '' : ' AND i.item_category=?'; const values = selected === '全部' ? [term] : [term, selected];
  const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM blacksmith_shop_items si JOIN item_definitions i ON i.id=si.item_id WHERE si.is_active=1 AND i.name LIKE ?${filter}`, values);
  const paging = pageInfo(page, Number(countRows[0]?.total ?? 0));
  const [rows] = await pool.execute<StockRow[]>(`SELECT i.id,i.codex_id,i.name,i.item_category,i.required_level,i.description,si.buy_price,si.stock_quantity,COUNT(ii.id) AS owned_quantity
    FROM blacksmith_shop_items si JOIN item_definitions i ON i.id=si.item_id
    LEFT JOIN player_item_instances ii ON ii.item_id=i.id AND ii.character_id=?
    WHERE si.is_active=1 AND i.name LIKE ?${filter}
    GROUP BY i.id,i.codex_id,i.name,i.item_category,i.required_level,i.description,si.buy_price,si.stock_quantity
    ORDER BY i.required_level,i.item_category,i.id LIMIT ? OFFSET ?`, [character.id, ...values, PAGE_SIZE, (paging.page - 1) * PAGE_SIZE]);
  return { items: rows.map(row => ({ id: Number(row.id), codexId: row.codex_id, name: row.name, category: row.item_category, level: Number(row.required_level), description: row.description, price: Number(row.buy_price), stockQuantity: Number(row.stock_quantity), ownedQuantity: Number(row.owned_quantity) })), ...paging, category: selected, keyword: keyword.trim(), copper: Number(character.copper_coins) };
};

export const blacksmithSellCatalog = async (qqUserId: string, page = 1, keyword = '') => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); const term = `%${keyword.trim()}%`;
  const equipmentSql = `SELECT 'equipment' AS sale_kind,ii.id AS sale_id,i.name,i.item_category,i.required_level,ii.quality,1 AS quantity,
      COALESCE(si.sell_price,GREATEST(1,FLOOR(i.required_level*20))) AS sell_price,ii.acquired_at
    FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    LEFT JOIN player_equipment pe ON pe.character_id=ii.character_id AND pe.instance_id=ii.id
    LEFT JOIN blacksmith_shop_items si ON si.item_id=i.id
    WHERE ii.character_id=? AND pe.instance_id IS NULL AND i.is_tradeable=1 AND i.item_type='equipment' AND i.name LIKE ?`;
  const materialSql = `SELECT 'material' AS sale_kind,i.id AS sale_id,i.name,i.item_category,0 AS required_level,NULL AS quality,pi.quantity,
      CEIL(i.trade_price*1.15) AS sell_price,pi.acquired_at
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.quantity>0 AND i.is_tradeable=1 AND i.trade_price>0
      AND i.item_category IN ('兽材','精兽材','锻材','元素尘') AND i.name LIKE ?`;
  const source = `(${equipmentSql} UNION ALL ${materialSql}) AS sale_items`;
  const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM ${source}`, [character.id, term, character.id, term]);
  const paging = pageInfo(page, Number(countRows[0]?.total ?? 0));
  const [rows] = await pool.execute<SaleRow[]>(`SELECT * FROM ${source} ORDER BY acquired_at DESC,sale_id DESC LIMIT ? OFFSET ?`, [character.id, term, character.id, term, PAGE_SIZE, (paging.page - 1) * PAGE_SIZE]);
  return { items: rows.map(row => ({ kind: row.sale_kind, id: Number(row.sale_id), name: row.name, category: row.item_category, level: Number(row.required_level), quality: row.quality === null ? null : Number(row.quality), quantity: Number(row.quantity), price: Number(row.sell_price) })), ...paging, keyword: keyword.trim(), copper: Number(character.copper_coins) };
};

export const buyBlacksmithEquipment = async (qqUserId: string, itemId: number, quantity = 1) => withTransaction(async connection => {
  const amount = validQuantity(quantity); const character = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string; buy_price: number; stock_quantity: number })[]>(`SELECT i.id,i.name,si.buy_price,si.stock_quantity FROM blacksmith_shop_items si JOIN item_definitions i ON i.id=si.item_id WHERE si.item_id=? AND si.is_active=1 AND i.item_type='equipment' FOR UPDATE`, [itemId]);
  const item = rows[0]; if (!item) throw new Error('该装备已下架。');
  if (Number(item.stock_quantity) < amount) throw new Error(`库存不足，剩余 ${item.stock_quantity} 件。`);
  const totalPrice = Number(item.buy_price) * amount;
  if (Number(character.copper_coins) < totalPrice) throw new Error(`铜币不足，需要 ${totalPrice} 铜币。`);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [totalPrice, character.id]);
  await connection.execute('UPDATE blacksmith_shop_items SET stock_quantity=stock_quantity-? WHERE item_id=?', [amount, item.id]);
  for (let index = 0; index < amount; index += 1) await connection.execute('INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max) VALUES (?,?,100,100,100)', [character.id, item.id]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [character.id, item.id]);
  return { name: item.name, quantity: amount, price: totalPrice };
});

export const sellBlacksmithEquipment = async (qqUserId: string, instanceId: number) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(SellRow & { item_id: number })[]>(`SELECT ii.id AS instance_id,ii.item_id,i.name,i.item_category,i.required_level,ii.quality,COALESCE(si.sell_price,GREATEST(1,FLOOR(i.required_level*20))) AS sell_price
    FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    LEFT JOIN player_equipment pe ON pe.character_id=ii.character_id AND pe.instance_id=ii.id
    LEFT JOIN blacksmith_shop_items si ON si.item_id=i.id
    WHERE ii.id=? AND ii.character_id=? AND pe.instance_id IS NULL AND i.is_tradeable=1 FOR UPDATE`, [instanceId, character.id]);
  const item = rows[0]; if (!item) throw new Error('未找到可出售的未装备物品。');
  await connection.execute('DELETE FROM player_item_instances WHERE id=? AND character_id=?', [instanceId, character.id]);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [item.sell_price, character.id]);
  return { name: item.name, price: Number(item.sell_price) };
});

export const sellBlacksmithMaterial = async (qqUserId: string, itemId: number, quantity = 1) => withTransaction(async connection => {
  const amount = validMaterialQuantity(quantity); const character = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string; quantity: number; sell_price: number })[]>(`SELECT i.id,i.name,pi.quantity,CEIL(i.trade_price*1.15) AS sell_price
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 AND i.is_tradeable=1 AND i.trade_price>0
      AND i.item_category IN ('兽材','精兽材','锻材','元素尘') FOR UPDATE`, [character.id, itemId]);
  const item = rows[0]; if (!item) throw new Error('小北只收购装备、兽材、锻材与元素尘。');
  if (Number(item.quantity) < amount) throw new Error(`背包数量不足，当前仅有 ${item.quantity} 个。`);
  const price = Number(item.sell_price) * amount;
  await recordPvpLootSale(connection, Number(character.id), Number(item.id), amount, price);
  await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [amount, character.id, item.id]);
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [character.id, item.id]);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [price, character.id]);
  return { name: item.name, quantity: amount, price };
});
