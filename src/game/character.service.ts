import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../database/pool';
import { ATTRIBUTE_CAP, INITIAL_ATTRIBUTE_POINTS, SESSION_TTL_MINUTES, calculateDerivedStats } from './constants';
import { attributes, emptyAllocation, type Allocation, type AttributeKey, type DerivedStats } from './types';

type SessionRow = RowDataPacket & Allocation & { id: string; player_id: number; stage: 'story' | 'allocate'; expires_at: Date };
type PlayerRow = RowDataPacket & { id: number; status: string };
type RegionRow = RowDataPacket & { id: number; name: string; min_x: number; max_x: number; min_y: number; max_y: number; min_z: number; max_z: number };
export type CharacterView = Allocation & DerivedStats & { name: string; regionName: string; x: number; y: number; z: number };

const allocationFrom = (row: Allocation): Allocation => Object.fromEntries(attributes.map(key => [key, Number(row[key])])) as Allocation;
const total = (allocation: Allocation) => attributes.reduce((sum, key) => sum + allocation[key], 0);
const randomInRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const getPlayer = async (connection: PoolConnection, qqUserId: string, nickname?: string): Promise<PlayerRow> => {
  await connection.execute(
    'INSERT INTO players (qq_user_id, qq_nickname) VALUES (?, ?) ON DUPLICATE KEY UPDATE qq_nickname = COALESCE(VALUES(qq_nickname), qq_nickname)',
    [qqUserId, nickname ?? null]
  );
  const [rows] = await connection.execute<PlayerRow[]>('SELECT id, status FROM players WHERE qq_user_id = ? FOR UPDATE', [qqUserId]);
  return rows[0];
};

const getSession = async (connection: PoolConnection, playerId: number, lock = false) => {
  const [rows] = await connection.execute<SessionRow[]>(
    `SELECT id, player_id, stage, constitution, spirit, strength, intelligence, agility, perception, expires_at FROM registration_sessions WHERE player_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [playerId]
  );
  return rows[0];
};

export const hasCharacter = async (qqUserId: string) => {
  return withTransaction(async connection => {
    const player = await getPlayer(connection, qqUserId);
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT id FROM characters WHERE player_id = ? LIMIT 1', [player.id]);
    return rows.length > 0;
  });
};

export const beginRegistration = async (qqUserId: string, nickname?: string) => withTransaction(async connection => {
  const player = await getPlayer(connection, qqUserId, nickname);
  const [characters] = await connection.execute<RowDataPacket[]>('SELECT id FROM characters WHERE player_id = ? LIMIT 1', [player.id]);
  if (characters.length) return { alreadyRegistered: true as const, stage: null, allocation: null };
  let session = await getSession(connection, player.id, true);
  if (!session || session.expires_at <= new Date()) {
    const id = randomUUID();
    await connection.execute(
      'INSERT INTO registration_sessions (id, player_id, stage, expires_at) VALUES (?, ?, \'story\', DATE_ADD(NOW(), INTERVAL ? MINUTE)) ON DUPLICATE KEY UPDATE id = VALUES(id), stage = VALUES(stage), constitution = 0, spirit = 0, strength = 0, intelligence = 0, agility = 0, perception = 0, expires_at = VALUES(expires_at)',
      [id, player.id, SESSION_TTL_MINUTES]
    );
    session = await getSession(connection, player.id, true);
  }
  return { alreadyRegistered: false as const, stage: session.stage, allocation: allocationFrom(session) };
});

export const continueRegistration = async (qqUserId: string) => withTransaction(async connection => {
  const player = await getPlayer(connection, qqUserId);
  const session = await getSession(connection, player.id, true);
  if (!session || session.expires_at <= new Date()) throw new Error('注册会话已过期，请重新发送“注册”。');
  await connection.execute('UPDATE registration_sessions SET stage = \'allocate\' WHERE id = ?', [session.id]);
  return allocationFrom(session);
});

const requireAllocationSession = async (connection: PoolConnection, qqUserId: string) => {
  const player = await getPlayer(connection, qqUserId);
  const session = await getSession(connection, player.id, true);
  if (!session || session.stage !== 'allocate' || session.expires_at <= new Date()) throw new Error('属性分配会话不存在或已过期，请发送“注册”重新开始。');
  return { player, session };
};

export const addPoints = async (qqUserId: string, attribute: AttributeKey, points: number) => withTransaction(async connection => {
  const { session } = await requireAllocationSession(connection, qqUserId);
  if (!Number.isInteger(points) || points < 1 || points > INITIAL_ATTRIBUTE_POINTS) throw new Error('点数必须是 1 到 20 的整数。');
  const allocation = allocationFrom(session);
  if (allocation[attribute] + points > ATTRIBUTE_CAP) throw new Error(`单项属性不能超过 ${ATTRIBUTE_CAP} 点。`);
  if (total(allocation) + points > INITIAL_ATTRIBUTE_POINTS) throw new Error('可分配点数不足。');
  await connection.execute(`UPDATE registration_sessions SET ${attribute} = ${attribute} + ? WHERE id = ?`, [points, session.id]);
  allocation[attribute] += points;
  return allocation;
});

export const resetAllocation = async (qqUserId: string) => withTransaction(async connection => {
  const { session } = await requireAllocationSession(connection, qqUserId);
  const allocation = emptyAllocation();
  await connection.execute('UPDATE registration_sessions SET constitution = 0, spirit = 0, strength = 0, intelligence = 0, agility = 0, perception = 0 WHERE id = ?', [session.id]);
  return allocation;
});

export const confirmAllocation = async (qqUserId: string, nickname?: string): Promise<CharacterView> => withTransaction(async connection => {
  const { player, session } = await requireAllocationSession(connection, qqUserId);
  const allocation = allocationFrom(session);
  if (total(allocation) !== INITIAL_ATTRIBUTE_POINTS) throw new Error(`请先分配完全部 ${INITIAL_ATTRIBUTE_POINTS} 点属性。`);
  const [regions] = await connection.execute<RegionRow[]>('SELECT id, name, min_x, max_x, min_y, max_y, min_z, max_z FROM map_regions WHERE is_spawn_enabled = 1 ORDER BY id LIMIT 1');
  const region = regions[0];
  if (!region) throw new Error('当前没有可用出生区域，请联系管理员。');
  const x = randomInRange(region.min_x, region.max_x);
  const y = randomInRange(region.min_y, region.max_y);
  const z = randomInRange(region.min_z, region.max_z);
  const stats = calculateDerivedStats(allocation);
  const name = `冒险者${(nickname || qqUserId).slice(-6)}`;
  await connection.execute(
    'INSERT INTO characters (player_id, name, constitution, spirit, strength, intelligence, agility, perception, hp_max, mp_max, physical_attack, magic_attack, physical_defense, magic_defense, accuracy, evasion, crit_rate_bp, crit_damage_bp, crit_resist_bp, crit_damage_reduction_bp, tenacity, speed, current_region_id, pos_x, pos_y, pos_z) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [player.id, name, ...attributes.map(key => allocation[key]), stats.hpMax, stats.mpMax, stats.physicalAttack, stats.magicAttack, stats.physicalDefense, stats.magicDefense, stats.accuracy, stats.evasion, stats.critRateBp, stats.critDamageBp, stats.critResistBp, stats.critDamageReductionBp, stats.tenacity, stats.speed, region.id, x, y, z]
  );
  await connection.execute('UPDATE players SET status = \'active\' WHERE id = ?', [player.id]);
  await connection.execute('DELETE FROM registration_sessions WHERE id = ?', [session.id]);
  await connection.execute('INSERT INTO player_events (player_id, event_type, payload) VALUES (?, \'character.created\', ?)', [player.id, JSON.stringify({ region: region.name, x, y, z })]);
  return { ...allocation, ...stats, name, regionName: region.name, x, y, z };
});

export const getCharacter = async (qqUserId: string): Promise<CharacterView | null> => {
  const [rows] = await (await import('../database/pool')).getPool().execute<(RowDataPacket & CharacterView)[]>(
    'SELECT c.name, c.constitution, c.spirit, c.strength, c.intelligence, c.agility, c.perception, c.hp_max AS hpMax, c.mp_max AS mpMax, c.physical_attack AS physicalAttack, c.magic_attack AS magicAttack, c.physical_defense AS physicalDefense, c.magic_defense AS magicDefense, c.accuracy, c.evasion, c.crit_rate_bp AS critRateBp, c.crit_damage_bp AS critDamageBp, c.crit_resist_bp AS critResistBp, c.crit_damage_reduction_bp AS critDamageReductionBp, c.tenacity, c.speed, r.name AS regionName, c.pos_x AS x, c.pos_y AS y, c.pos_z AS z FROM characters c JOIN players p ON p.id = c.player_id JOIN map_regions r ON r.id = c.current_region_id WHERE p.qq_user_id = ? LIMIT 1',
    [qqUserId]
  );
  return rows[0] ?? null;
};
