import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';

const characterIdFor = async (connection: Pool | PoolConnection, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return Number(rows[0].id);
};

export const activeDeviceList = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string; quality: number; durability: number; durability_max: number; active: number })[]>(`
    SELECT ii.id,i.name,ii.quality,ii.durability,ii.durability_max,IF(ad.instance_id IS NULL,0,1) AS active
    FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    LEFT JOIN player_active_devices ad ON ad.character_id=ii.character_id AND ad.instance_id=ii.id
    WHERE ii.character_id=? AND i.item_type='equipment' AND i.item_category='异械'
    ORDER BY ii.acquired_at DESC,ii.id DESC
  `, [characterId]);
  return rows.map(row => ({ id: Number(row.id), name: row.name, quality: Number(row.quality), durability: Number(row.durability), durabilityMax: Number(row.durability_max), active: Boolean(row.active) }));
};

export const activateDevice = async (qqUserId: string, instanceId: number) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>(`
    SELECT ii.id,i.name FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    WHERE ii.id=? AND ii.character_id=? AND i.item_type='equipment' AND i.item_category='异械' FOR UPDATE
  `, [instanceId, characterId]);
  const device = rows[0]; if (!device) throw new Error('未找到该异械。');
  await connection.execute(`DELETE pe FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id WHERE pe.character_id=? AND pe.instance_id=? AND i.item_category='异械'`, [characterId, instanceId]);
  await connection.execute('INSERT IGNORE INTO player_active_devices (character_id,instance_id) VALUES (?,?)', [characterId, instanceId]);
  return device.name;
});

export const deactivateDevice = async (qqUserId: string, instanceId: number) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { name: string })[]>(`
    SELECT i.name FROM player_active_devices ad JOIN player_item_instances ii ON ii.id=ad.instance_id
    JOIN item_definitions i ON i.id=ii.item_id WHERE ad.character_id=? AND ad.instance_id=? AND i.item_category='异械' FOR UPDATE
  `, [characterId, instanceId]);
  if (!rows[0]) throw new Error('该异械尚未生效。');
  await connection.execute('DELETE FROM player_active_devices WHERE character_id=? AND instance_id=?', [characterId, instanceId]);
  return rows[0].name;
});
