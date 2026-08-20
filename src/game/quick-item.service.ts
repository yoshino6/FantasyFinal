import type { RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';

type CharacterRow = RowDataPacket & { id: number };
type QuickItemRow = RowDataPacket & { quick_slot: number; item_id: number; name: string; item_category: string; codex_id: string; quantity: number | null };
type UsableItemRow = RowDataPacket & { id: number; name: string; item_category: string; codex_id: string; quantity: number };

const characterIdFor = async (qqUserId: string) => {
  const pool = await getPool();
  const [rows] = await pool.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1', [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  return Number(rows[0].id);
};

export const quickItemConfig = async (qqUserId: string) => {
  const characterId = await characterIdFor(qqUserId); const pool = await getPool();
  const [slots] = await pool.execute<QuickItemRow[]>(`SELECT qi.quick_slot,qi.item_id,i.name,i.item_category,i.codex_id,pi.quantity
    FROM player_quick_items qi JOIN item_definitions i ON i.id=qi.item_id
    LEFT JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id
    WHERE qi.character_id=? ORDER BY qi.quick_slot`, [characterId]);
  const [items] = await pool.execute<UsableItemRow[]>(`SELECT i.id,i.name,i.item_category,i.codex_id,pi.quantity
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type='consumable' AND i.effect_json IS NOT NULL
    ORDER BY i.item_category,i.name,i.id`, [characterId]);
  return {
    slots: slots.map(slot => ({ slot: Number(slot.quick_slot), itemId: Number(slot.item_id), name: slot.name, category: slot.item_category, codexId: slot.codex_id, quantity: Number(slot.quantity ?? 0) })),
    items: items.map(item => ({ id: Number(item.id), name: item.name, category: item.item_category, codexId: item.codex_id, quantity: Number(item.quantity) }))
  };
};

export const setQuickItem = async (qqUserId: string, slot: number, itemId: number) => withTransaction(async connection => {
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) throw new Error('道具快捷栏位应为 1 至 4。');
  const [characters] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  if (!characters[0]) throw new Error('请先发送“注册”创建角色。'); const characterId = Number(characters[0].id);
  const [items] = await connection.execute<UsableItemRow[]>(`SELECT i.id,i.name,i.item_category,pi.quantity
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 AND i.item_type='consumable' AND i.effect_json IS NOT NULL FOR UPDATE`, [characterId, itemId]);
  const item = items[0]; if (!item) throw new Error('背包中没有该可用道具。');
  // 同一道具只能占用一个栏位；重新设置时同时腾出原栏位与该道具原来的栏位。
  await connection.execute('DELETE FROM player_quick_items WHERE character_id=? AND (quick_slot=? OR item_id=?)', [characterId, slot, itemId]);
  await connection.execute('INSERT INTO player_quick_items (character_id,quick_slot,item_id) VALUES (?,?,?)', [characterId, slot, itemId]);
  return { name: item.name, category: item.item_category };
});

export const clearQuickItem = async (qqUserId: string, slot: number) => withTransaction(async connection => {
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) throw new Error('道具快捷栏位应为 1 至 4。');
  const [characters] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  if (!characters[0]) throw new Error('请先发送“注册”创建角色。');
  await connection.execute('DELETE FROM player_quick_items WHERE character_id=? AND quick_slot=?', [characters[0].id, slot]);
});

/** 由道具列表直接加入首个空快捷栏，或取消该道具已有的快捷配置。 */
export const toggleQuickItem = async (qqUserId: string, itemId: number) => withTransaction(async connection => {
  const [characters] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  if (!characters[0]) throw new Error('请先发送“注册”创建角色。'); const characterId = Number(characters[0].id);
  const [configured] = await connection.execute<(RowDataPacket & { quick_slot: number })[]>('SELECT quick_slot FROM player_quick_items WHERE character_id=? AND item_id=? FOR UPDATE', [characterId, itemId]);
  if (configured[0]) { await connection.execute('DELETE FROM player_quick_items WHERE character_id=? AND item_id=?', [characterId, itemId]); return { enabled: false }; }
  const [items] = await connection.execute<UsableItemRow[]>(`SELECT i.id,i.name,i.item_category,i.codex_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 AND i.item_type='consumable' AND i.effect_json IS NOT NULL FOR UPDATE`, [characterId, itemId]);
  if (!items[0]) throw new Error('背包中没有该可用道具。');
  const [used] = await connection.execute<(RowDataPacket & { quick_slot: number })[]>('SELECT quick_slot FROM player_quick_items WHERE character_id=? FOR UPDATE', [characterId]);
  const slot = [1, 2, 3, 4].find(candidate => !used.some(row => Number(row.quick_slot) === candidate));
  if (!slot) throw new Error('道具快捷栏已满，请先取消一个快捷道具。');
  await connection.execute('INSERT INTO player_quick_items (character_id,quick_slot,item_id) VALUES (?,?,?)', [characterId, slot, itemId]);
  return { enabled: true, slot };
});
