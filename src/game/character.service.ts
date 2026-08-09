import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { SESSION_TTL_MINUTES, calculateDerivedStats, gifts, isGiftCode } from './constants';
import { attributes, type Allocation, type DerivedStats, type Growth } from './types';

type RegistrationStage = 'story' | 'audience' | 'question' | 'destination' | 'danger' | 'choice';
type SessionRow = RowDataPacket & { id: string; player_id: number; stage: RegistrationStage; expires_at: Date };
type PlayerRow = RowDataPacket & { id: number; status: string };
type RegionRow = RowDataPacket & { id: number; name: string; min_x: number; max_x: number; min_y: number; max_y: number; min_z: number; max_z: number };
export type CharacterView = Allocation & DerivedStats & { name: string; gender: string; regionName: string; x: number; y: number; z: number; level: number; experience: number; adventurerRegistered: boolean; giftName: string | null; growth: Growth };

const randomInRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const distribute = (total: number, precision = 1) => {
  const units = Math.round(total / precision); const values = attributes.map(() => 1);
  for (let remaining = units - attributes.length; remaining > 0; remaining--) values[randomInRange(0, values.length - 1)]++;
  return Object.fromEntries(attributes.map((key, index) => [key, values[index] * precision])) as Allocation;
};

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
    `SELECT id, player_id, stage, expires_at FROM registration_sessions WHERE player_id = ?${lock ? ' FOR UPDATE' : ''}`,
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
  if (characters.length) return { alreadyRegistered: true as const, stage: null };
  let session = await getSession(connection, player.id, true);
  if (!session || session.expires_at <= new Date()) {
    const id = randomUUID();
    await connection.execute(
      'INSERT INTO registration_sessions (id, player_id, stage, expires_at) VALUES (?, ?, \'story\', DATE_ADD(NOW(), INTERVAL ? MINUTE)) ON DUPLICATE KEY UPDATE id = VALUES(id), stage = VALUES(stage), expires_at = VALUES(expires_at)',
      [id, player.id, SESSION_TTL_MINUTES]
    );
    session = await getSession(connection, player.id, true);
  }
  return { alreadyRegistered: false as const, stage: session.stage };
});

export const continueRegistration = async (qqUserId: string) => withTransaction(async connection => {
  const player = await getPlayer(connection, qqUserId);
  const session = await getSession(connection, player.id, true);
  if (!session || session.expires_at <= new Date()) throw new Error('注册会话已过期，请重新发送“注册”。');
  const next = session.stage === 'story' ? 'audience' : session.stage === 'question' ? 'destination' : session.stage === 'danger' ? 'choice' : session.stage;
  if (next === session.stage) throw new Error(session.stage === 'audience' ? '请先向女神询问这里是哪里。' : session.stage === 'destination' ? '请选择前往天堂或转生异世界。' : '恩赐已经在等待你的选择。');
  await connection.execute('UPDATE registration_sessions SET stage = ? WHERE id = ?', [next, session.id]);
  return next;
});

export const askWhereAmI = async (qqUserId: string) => withTransaction(async connection => {
  const player = await getPlayer(connection, qqUserId);
  const session = await getSession(connection, player.id, true);
  if (!session || session.expires_at <= new Date() || session.stage !== 'audience') throw new Error('现在还不能提出这个问题。');
  await connection.execute('UPDATE registration_sessions SET stage=\'question\' WHERE id=?', [session.id]);
});

export const chooseDestination = async (qqUserId: string, destination: '天堂' | '异世界') => withTransaction(async connection => {
  const player = await getPlayer(connection, qqUserId);
  const session = await getSession(connection, player.id, true);
  if (!session || session.expires_at <= new Date() || session.stage !== 'destination') throw new Error('请先完成前面的转生剧情。');
  if (destination === '天堂') return 'heaven' as const;
  await connection.execute('UPDATE registration_sessions SET stage=\'danger\' WHERE id=?', [session.id]);
  return 'danger' as const;
});

const requireChoiceSession = async (connection: PoolConnection, qqUserId: string) => {
  const player = await getPlayer(connection, qqUserId);
  const session = await getSession(connection, player.id, true);
  if (!session || session.stage !== 'choice' || session.expires_at <= new Date()) throw new Error('请先完成转生剧情，再选择恩赐。');
  return { player, session };
};

export const chooseGift = async (qqUserId: string, giftCode: string, nickname?: string): Promise<CharacterView> => withTransaction(async connection => {
  if (!isGiftCode(giftCode)) throw new Error('未知恩赐，请使用列表中的英文代号。');
  const { player, session } = await requireChoiceSession(connection, qqUserId);
  const allocation = distribute(randomInRange(80, 120));
  const growth = distribute(randomInRange(80, 120) / 10, 0.1) as Growth;
  const [regions] = await connection.execute<RegionRow[]>('SELECT id, name, min_x, max_x, min_y, max_y, min_z, max_z FROM map_regions WHERE is_spawn_enabled = 1 ORDER BY id LIMIT 1');
  const region = regions[0];
  if (!region) throw new Error('当前没有可用出生区域，请联系管理员。');
  const x = randomInRange(region.min_x, region.max_x);
  const y = randomInRange(region.min_y, region.max_y);
  const z = randomInRange(region.min_z, region.max_z);
  const stats = calculateDerivedStats(allocation);
  const name = `冒险者${(nickname || qqUserId).slice(-6)}`;
  await connection.execute(
    'INSERT INTO characters (player_id, name, constitution, spirit, strength, intelligence, agility, perception, constitution_growth, spirit_growth, strength_growth, intelligence_growth, agility_growth, perception_growth, hp_max, mp_max, physical_attack, magic_attack, physical_defense, magic_defense, accuracy, evasion, crit_rate_bp, crit_damage_bp, crit_resist_bp, crit_damage_reduction_bp, tenacity, speed, current_region_id, pos_x, pos_y, pos_z) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [player.id, name, ...attributes.map(key => allocation[key]), ...attributes.map(key => growth[key]), stats.hpMax, stats.mpMax, stats.physicalAttack, stats.magicAttack, stats.physicalDefense, stats.magicDefense, stats.accuracy, stats.evasion, stats.critRateBp, stats.critDamageBp, stats.critResistBp, stats.critDamageReductionBp, stats.tenacity, stats.speed, region.id, x, y, z]
  );
  const [newCharacters] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM characters WHERE player_id=?', [player.id]);
  const characterId = newCharacters[0].id;
  await connection.execute(`INSERT INTO player_skills (character_id,skill_id,quick_slot)
    SELECT ?, id, CASE code WHEN 'arcane_bolt' THEN 1 WHEN 'heavy_strike' THEN 2 END FROM skill_definitions WHERE code IN ('arcane_bolt','heavy_strike')`, [characterId]);
  await connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity)
    SELECT ?, id, 3 FROM item_definitions WHERE code='healing_herb'`, [characterId]);
  await connection.execute(`INSERT INTO player_quick_items (character_id,quick_slot,item_id)
    SELECT ?, 1, id FROM item_definitions WHERE code='healing_herb'`, [characterId]);
  if (giftCode === 'holy_sword_shirulu' || giftCode === 'demon_sword_aphia') {
    const itemCode = giftCode;
    await connection.execute('INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max) SELECT ?,id,100,100,100 FROM item_definitions WHERE code=?', [characterId, itemCode]);
    await connection.execute('INSERT INTO player_equipment (character_id,slot,item_id) SELECT ?,\'weapon\',id FROM item_definitions WHERE code=?', [characterId, itemCode]);
  } else await connection.execute('INSERT INTO player_blessings (character_id,code) VALUES (?,?)', [characterId, giftCode]);
  await connection.execute('UPDATE players SET status = \'active\' WHERE id = ?', [player.id]);
  await connection.execute('DELETE FROM registration_sessions WHERE id = ?', [session.id]);
  await connection.execute('INSERT INTO player_events (player_id, event_type, payload) VALUES (?, \'character.created\', ?)', [player.id, JSON.stringify({ region: region.name, x, y, z, giftCode })]);
  return { ...allocation, ...stats, growth, name, gender: '未设定', regionName: region.name, x, y, z, level: 1, experience: 0, adventurerRegistered: false, giftName: gifts[giftCode].name };
});

export const getCharacter = async (qqUserId: string): Promise<CharacterView | null> => {
  const [rows] = await (await getPool()).execute<(RowDataPacket & CharacterView)[]>(
    `SELECT c.name, c.gender, c.level, c.experience, c.adventurer_registered AS adventurerRegistered, c.constitution, c.spirit, c.strength, c.intelligence, c.agility, c.perception, c.constitution_growth AS constitutionGrowth, c.spirit_growth AS spiritGrowth, c.strength_growth AS strengthGrowth, c.intelligence_growth AS intelligenceGrowth, c.agility_growth AS agilityGrowth, c.perception_growth AS perceptionGrowth, c.hp_max AS hpMax, c.mp_max AS mpMax, c.physical_attack AS physicalAttack, c.magic_attack AS magicAttack, c.physical_defense AS physicalDefense, c.magic_defense AS magicDefense, c.accuracy, c.evasion, c.crit_rate_bp AS critRateBp, c.crit_damage_bp AS critDamageBp, c.crit_resist_bp AS critResistBp, c.crit_damage_reduction_bp AS critDamageReductionBp, c.tenacity, c.speed, r.name AS regionName, c.pos_x AS x, c.pos_y AS y, c.pos_z AS z, COALESCE(i.name, b.code) AS giftName FROM characters c JOIN players p ON p.id = c.player_id JOIN map_regions r ON r.id = c.current_region_id LEFT JOIN player_equipment pe ON pe.character_id=c.id AND pe.slot='weapon' LEFT JOIN item_definitions i ON i.id=pe.item_id LEFT JOIN player_blessings b ON b.character_id=c.id WHERE p.qq_user_id = ? LIMIT 1`,
    [qqUserId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    growth: Object.fromEntries(attributes.map(key => [key, Number(row[`${key}Growth` as keyof typeof row])])) as Growth
  };
};

const consumeIdentityChange = async (connection: PoolConnection, characterId: number, field: 'free_name_change_used' | 'free_gender_change_used', cardCode: 'rename_card' | 'gender_change_card') => {
  const [characters] = await connection.execute<(RowDataPacket & { used: number })[]>(`SELECT ${field} AS used FROM characters WHERE id=? FOR UPDATE`, [characterId]);
  if (!characters[0]) throw new Error('未找到角色。');
  if (!Number(characters[0].used)) {
    await connection.execute(`UPDATE characters SET ${field}=1 WHERE id=?`, [characterId]);
    return false;
  }
  const [cards] = await connection.execute<(RowDataPacket & { item_id: number; quantity: number })[]>(`SELECT pi.item_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=? FOR UPDATE`, [characterId, cardCode]);
  if (!cards[0] || Number(cards[0].quantity) < 1) throw new Error(cardCode === 'rename_card' ? '首次改名已用完，请使用改名卡。' : '首次改性已用完，请使用改性卡。');
  await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [characterId, cards[0].item_id]);
  return true;
};

const characterIdForChange = async (connection: PoolConnection, qqUserId: string) => {
  const player = await getPlayer(connection, qqUserId);
  const [characters] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM characters WHERE player_id=? FOR UPDATE', [player.id]);
  if (!characters[0]) throw new Error('请先完成角色注册。');
  return characters[0].id;
};

export const changeCharacterName = async (qqUserId: string, input: string) => withTransaction(async connection => {
  const name = input.trim();
  if (Array.from(name).length < 2 || Array.from(name).length > 24 || /[\r\n]/.test(name)) throw new Error('昵称长度需为 2～24 个字符，且不能包含换行。');
  const characterId = await characterIdForChange(connection, qqUserId);
  const usedCard = await consumeIdentityChange(connection, characterId, 'free_name_change_used', 'rename_card');
  await connection.execute('UPDATE characters SET name=? WHERE id=?', [name, characterId]);
  return { name, usedCard };
});

export const changeCharacterGender = async (qqUserId: string, gender: string) => withTransaction(async connection => {
  if (gender !== '男' && gender !== '女') throw new Error('性别只能选择“男”或“女”。');
  const characterId = await characterIdForChange(connection, qqUserId);
  const usedCard = await consumeIdentityChange(connection, characterId, 'free_gender_change_used', 'gender_change_card');
  await connection.execute('UPDATE characters SET gender=? WHERE id=?', [gender, characterId]);
  return { gender, usedCard };
});

export const registerAdventurer = async (qqUserId: string) => withTransaction(async connection => {
  const player = await getPlayer(connection, qqUserId);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; level: number; adventurer_registered: number })[]>('SELECT id,level,adventurer_registered FROM characters WHERE player_id=? FOR UPDATE', [player.id]);
  if (!rows[0]) throw new Error('请先完成转生。');
  if (rows[0].adventurer_registered) return false;
  if (Number(rows[0].level) < 5) throw new Error('公会只接纳 Lv.5 及以上的见习者；继续冒险后再来。');
  await connection.execute('UPDATE characters SET adventurer_registered=1 WHERE id=?', [rows[0].id]);
  return true;
});
