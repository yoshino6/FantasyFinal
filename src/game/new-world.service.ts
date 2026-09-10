import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { grantInventory } from './inventory-binding';
import { newWorldEquipmentCodes, newWorldItems, newWorldLevels, newWorldWeaponProfile, type NewWorldLevel } from './new-world.config';

const journeyCharacter = async (connection: Pool | PoolConnection, user: string, lock = false) => {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT c.id,c.name,c.level,c.profession_code
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=?${lock ? ' FOR UPDATE' : ''}`, [user]);
  if (!rows[0]) throw new Error('请先创建角色，再开启新世界旅途。');
  return rows[0];
};
const advancedProfession = async (connection: Pool | PoolConnection, id: number) => {
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT profession_code FROM player_advanced_professions WHERE character_id=? LIMIT 1', [id]);
  return rows[0]?.profession_code as string | undefined;
};
export const newWorldPanel = async (user: string) => {
  const pool = await getPool();
  const character = await journeyCharacter(pool, user);
  const [claims] = await pool.execute<RowDataPacket[]>('SELECT reward_level FROM player_new_world_claims WHERE character_id=?', [character.id]);
  const claimed = new Set(claims.map(row => Number(row.reward_level)));
  const professionReady = Boolean(newWorldWeaponProfile(character.profession_code, await advancedProfession(pool, Number(character.id))));
  return {
    name: String(character.name), level: Number(character.level),
    rewards: newWorldLevels.map(level => ({ level, state: claimed.has(level) ? '已领取' : Number(character.level) < level ? '未解锁'
      : [10, 20].includes(level) && !professionReady ? '待选择职业' : '可领取' }))
  };
};

/** 调用方必须开启事务；此处锁定角色，整档物品与领取标记一起提交。 */
export const claimNewWorldOnConnection = async (connection: PoolConnection, user: string, requestedLevel: number) => {
  if (!newWorldLevels.includes(requestedLevel as NewWorldLevel)) throw new Error('请选择1、10、20或30级奖励。');
  const level = requestedLevel as NewWorldLevel;
  const character = await journeyCharacter(connection, user, true);
  const id = Number(character.id);
  if (Number(character.level) < level) throw new Error(`达到${level}级后才能领取这份奖励。`);
  const [claims] = await connection.execute<RowDataPacket[]>('SELECT reward_level FROM player_new_world_claims WHERE character_id=? AND reward_level=? FOR UPDATE', [id, level]);
  if (claims.length) throw new Error(`你已经领取过${level}级奖励。`);
  const equipment = level === 10 || level === 20;
  const rewards: readonly (readonly [string, number])[] = equipment
    ? newWorldEquipmentCodes(level, character.profession_code, await advancedProfession(connection, id)).map(code => [code, 1] as const)
    : newWorldItems[level]!;
  await connection.execute('INSERT INTO player_new_world_claims (character_id,reward_level) VALUES (?,?)', [id, level]);
  const received: string[] = [];
  for (const [code, quantity] of rewards) {
    const [items] = await connection.execute<RowDataPacket[]>('SELECT id,name,item_type,required_level,rarity FROM item_definitions WHERE code=?', [code]);
    const item = items[0];
    if (!item || (equipment && (item.item_type !== 'equipment' || Number(item.required_level) !== level || item.rarity !== (level === 10 ? '普通' : '优秀')))) {
      throw new Error('奖励配置尚未备齐，本次未领取，请稍后重试。');
    }
    if (equipment) {
      await connection.execute(`INSERT INTO player_item_instances
        (character_id,item_id,quality,durability,durability_max,bound_kind,bound_at)
        VALUES (?,?,100,100,100,'personal',NOW())`, [id, item.id]);
    } else {
      await grantInventory(connection, id, Number(item.id), { personal: quantity, trade: 0, unbound: 0 });
    }
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [id, item.id]);
    received.push(`${item.name} ×${quantity}`);
  }
  return { level, received };
};
export const claimNewWorld = (user: string, level: number) => withTransaction(connection => claimNewWorldOnConnection(connection, user, level));
