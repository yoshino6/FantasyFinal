import type { RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../database/pool';

/** 丢弃可堆叠材料；打造面板中已选择的同一材料会同步收缩，避免留下失效的选材记录。 */
export const discardMaterial = async (qqUserId: string, itemId: number, quantity = 1) => withTransaction(async connection => {
  if (!Number.isInteger(itemId) || itemId < 1) throw new Error('物品编号无效。');
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('丢弃数量必须是不小于 1 的整数。');
  const [characters] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  const character = characters[0]; if (!character) throw new Error('请先发送“注册”创建角色。');
  const [items] = await connection.execute<(RowDataPacket & { name: string; quantity: number; personal_only: number })[]>(`SELECT i.name,pi.quantity,COALESCE(JSON_EXTRACT(i.effect_json,'$.personalOnly'),0) AS personal_only
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.item_id=? AND i.item_type='material' AND pi.quantity>0 FOR UPDATE`, [character.id, itemId]);
  const item = items[0]; if (!item) throw new Error('背包中没有该材料。');
  if (Number(item.personal_only)) throw new Error('足迹永久道具无法丢弃。');
  if (quantity > Number(item.quantity)) throw new Error(`材料数量不足，当前仅有 ${item.quantity} 个。`);
  const remaining = Number(item.quantity) - quantity;
  await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [quantity, character.id, itemId]);
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [character.id, itemId]);
  await connection.execute('UPDATE player_forge_materials SET quantity=LEAST(quantity,?) WHERE character_id=? AND item_id=?', [remaining, character.id, itemId]);
  await connection.execute('DELETE FROM player_forge_materials WHERE character_id=? AND item_id=? AND quantity<=0', [character.id, itemId]);
  return { name: item.name, quantity, remaining };
});
