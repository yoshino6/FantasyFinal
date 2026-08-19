import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';

const questCode = 'alchemist_apprentice';

const characterIdFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return Number(rows[0].id);
};

export const alchemistQuest = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const [rows] = await pool.execute<(RowDataPacket & { status: string | null; secondary_profession_code: string | null })[]>(`SELECT q.status,c.secondary_profession_code FROM characters c LEFT JOIN player_side_quests q ON q.character_id=c.id AND q.quest_code=? WHERE c.id=?`, [questCode, characterId]);
  const [items] = await pool.execute<(RowDataPacket & { quantity: number })[]>(`SELECT pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code='healing_herb'`, [characterId]);
  const herbs = Number(items[0]?.quantity ?? 0); const row = rows[0];
  const completed = row?.status === 'accepted' && herbs >= 3;
  if (completed) await pool.execute('UPDATE player_side_quests SET status=\'completed\',completed_at=NOW() WHERE character_id=? AND quest_code=?', [characterId, questCode]);
  return { status: completed ? 'completed' : row?.secondary_profession_code === 'alchemist' ? 'claimed' : row?.status ?? 'none', herbs } as const;
};

export const acceptAlchemistQuest = async (qqUserId: string) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { secondary_profession_code: string | null })[]>('SELECT secondary_profession_code FROM characters WHERE id=? FOR UPDATE', [characterId]);
  if (rows[0]?.secondary_profession_code && rows[0].secondary_profession_code !== 'alchemist') throw new Error('你已经拥有其他副职业，无法再选择炼金师。');
  await connection.execute('INSERT INTO player_side_quests (character_id,quest_code) VALUES (?,?) ON DUPLICATE KEY UPDATE status=IF(status=\'claimed\',status,\'accepted\')', [characterId, questCode]);
});

export const claimAlchemistQuest = async (qqUserId: string) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  const [questRows] = await connection.execute<(RowDataPacket & { status: string })[]>('SELECT status FROM player_side_quests WHERE character_id=? AND quest_code=? FOR UPDATE', [characterId, questCode]);
  if (questRows[0]?.status !== 'completed') throw new Error('任务尚未完成。');
  const [herbs] = await connection.execute<(RowDataPacket & { item_id: number; quantity: number })[]>(`SELECT pi.item_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code='healing_herb' FOR UPDATE`, [characterId]);
  if (!herbs[0] || Number(herbs[0].quantity) < 3) throw new Error('微光草药不足，无法完成提纯。');
  const [potions] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM item_definitions WHERE code=\'glimmer_potion\' LIMIT 1', []);
  if (!potions[0]) throw new Error('微光药水尚未配置，请重启机器人以初始化物品数据。');
  await connection.execute('UPDATE player_inventory SET quantity=quantity-3 WHERE character_id=? AND item_id=?', [characterId, herbs[0].item_id]);
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, herbs[0].item_id]);
  await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [characterId, potions[0].id]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, potions[0].id]);
  await connection.execute('UPDATE player_side_quests SET status=\'claimed\',claimed_at=NOW() WHERE character_id=? AND quest_code=?', [characterId, questCode]);
  await connection.execute('UPDATE characters SET secondary_profession_code=\'alchemist\' WHERE id=?', [characterId]);
  await connection.execute('INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,\'alchemist\',1,0)', [characterId]);
  return { name: '炼金师', potionName: '微光药水' };
});

export const secondaryProfessionCode = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const [rows] = await pool.execute<(RowDataPacket & { secondary_profession_code: string | null })[]>('SELECT secondary_profession_code FROM characters WHERE id=?', [characterId]);
  return rows[0]?.secondary_profession_code ?? null;
};
