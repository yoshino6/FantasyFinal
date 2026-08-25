import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { SESSION_TTL_MINUTES, STAMINA_RECOVERY_MS, artifactGiftSlots, calculateDerivedStats, gifts, isGiftCode, staminaMaxForRealm } from './constants';
import { homeRestRecoveryBonus } from './home.service';
import { attributes, type Allocation, type DerivedStats, type Growth } from './types';
import { recordSkillPointChange } from './skill-point-ledger.service';

type RegistrationStage = 'story' | 'audience' | 'question' | 'destination' | 'danger' | 'choice';
type SessionRow = RowDataPacket & { id: string; player_id: number; stage: RegistrationStage; expires_at: Date };
type PlayerRow = RowDataPacket & { id: number; status: string };
type RegionRow = RowDataPacket & { id: number; name: string; min_x: number; max_x: number; min_y: number; max_y: number; min_z: number; max_z: number };
export type CharacterView = Allocation & DerivedStats & { name: string; gender: string; regionName: string; x: number; y: number; z: number; level: number; experience: number; realmStage: number; adventurerRegistered: boolean; giftName: string | null; growth: Growth; currentHp: number; currentMp: number; stamina: number; staminaMax: number; activityStatus: 'active' | 'resting' | 'unconscious' | 'detained'; elementMastery: Record<string, number>; elementResistance: Record<string, number>; extraAttributes: { damageBonusPct: number } };

const elements = ['水', '火', '土', '木', '风', '冰', '雷', '光', '暗'] as const;
const randomBalancedElements = () => {
  const values = elements.map(() => randomInRange(-10, 10));
  let remainder = values.reduce((sum, value) => sum + value, 0);
  while (remainder) {
    const index = randomInRange(0, values.length - 1);
    if (remainder > 0 && values[index] > -10) { values[index]--; remainder--; }
    if (remainder < 0 && values[index] < 10) { values[index]++; remainder++; }
  }
  return Object.fromEntries(elements.map((element, index) => [element, values[index]]));
};

const randomInRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const distribute = (total: number, precision = 1) => {
  const units = Math.round(total / precision); const values = attributes.map(() => 1);
  for (let remaining = units - attributes.length; remaining > 0; remaining--) values[randomInRange(0, values.length - 1)]++;
  return Object.fromEntries(attributes.map((key, index) => [key, values[index] * precision])) as Allocation;
};
const finalAttributes = (row: Record<string, unknown>) => Object.fromEntries(attributes.map(key => [key, Number(row[key] ?? 0) + Number(row[`${key}_growth`] ?? row[`${key}Growth`] ?? 0) * Math.max(0, Number(row.level ?? 1) - 1)])) as Allocation;

const jsonRecord = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value !== 'string') return value as Record<string, unknown>;
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
};

const withEquipmentStats = async (connection: Pool | PoolConnection, characterId: number, base: DerivedStats): Promise<DerivedStats> => {
  const [rows] = await connection.execute<(RowDataPacket & { effect_json: unknown; quality: number })[]>(`SELECT COALESCE(ii.effect_json,i.effect_json) AS effect_json,COALESCE(ii.quality,100) AS quality
    FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id
    LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id
    WHERE pe.character_id=?`, [characterId]);
  const [foodRows] = await connection.execute<(RowDataPacket & { buff_json: unknown })[]>('SELECT buff_json FROM player_food_buffs WHERE character_id=? AND expires_at>NOW()', [characterId]);
  const effects = [...rows.map(row => ({ effect: jsonRecord(row.effect_json), scale: .6 + Math.max(0, Math.min(100, Number(row.quality))) * .004 })), ...foodRows.map(row => ({ effect: jsonRecord(row.buff_json), scale: 1 }))];
  const flat = (key: string) => effects.reduce((total, entry) => total + Number(entry.effect[key] ?? 0) * entry.scale, 0);
  const multiplier = (key: string) => effects.reduce((total, entry) => total * (1 + Number(entry.effect[key] ?? 0) * entry.scale / 100), 1);
  const stat = (value: number, rawKey: string, percentKey: string) => Math.max(0, Math.floor((value + flat(rawKey)) * multiplier(percentKey)));
  return {
    hpMax: stat(base.hpMax, 'hpMax', 'hpPct'), mpMax: stat(base.mpMax, 'mpMax', 'mpPct'),
    physicalAttack: stat(base.physicalAttack, 'physicalAttack', 'physicalAttackPct'), magicAttack: stat(base.magicAttack, 'magicAttack', 'magicAttackPct'),
    physicalDefense: stat(base.physicalDefense, 'physicalDefense', 'physicalDefensePct'), magicDefense: stat(base.magicDefense, 'magicDefense', 'magicDefensePct'),
    accuracy: stat(base.accuracy, 'accuracy', 'accuracyPct'), evasion: stat(base.evasion, 'evasion', 'evasionPct'),
    critRateBp: stat(base.critRateBp, 'critRateBp', 'critRatePct'), critDamageBp: stat(base.critDamageBp, 'critDamageBp', 'critDamagePct'),
    critResistBp: stat(base.critResistBp, 'critResistBp', 'critResistPct'), critDamageReductionBp: stat(base.critDamageReductionBp, 'critDamageReductionBp', 'critDamageReductionPct'),
    tenacity: stat(base.tenacity, 'tenacity', 'tenacityPct'), speed: stat(base.speed, 'speed', 'speedPct')
  };
};

const equipmentExtraAttributes = async (connection: Pool | PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { effect_json: unknown; quality: number })[]>(`SELECT COALESCE(ii.effect_json,i.effect_json) AS effect_json,COALESCE(ii.quality,100) AS quality
    FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id
    LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id
    WHERE pe.character_id=?`, [characterId]);
  const damageBonusPct = rows.reduce((total, row) => total + Number(jsonRecord(row.effect_json).damageBonusPct ?? 0) * (.6 + Math.max(0, Math.min(100, Number(row.quality))) * .004), 0);
  return { damageBonusPct: Math.round(damageBonusPct * 10) / 10 };
};

const withEquipmentElements = async (connection: Pool | PoolConnection, characterId: number, baseMastery: Record<string, unknown>, baseResistance: Record<string, unknown>) => {
  const [rows] = await connection.execute<(RowDataPacket & { effect_json: unknown; quality: number })[]>(`SELECT COALESCE(ii.effect_json,i.effect_json) AS effect_json,COALESCE(ii.quality,100) AS quality
    FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id
    LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id
    WHERE pe.character_id=?`, [characterId]);
  const bonus = (prefix: 'elementMastery' | 'elementResistance', element: string) => rows.reduce((total, row) => total + Number(jsonRecord(row.effect_json)[`${prefix}_${element}`] ?? 0) * (.6 + Math.max(0, Math.min(100, Number(row.quality))) * .004), 0);
  const value = (base: Record<string, unknown>, prefix: 'elementMastery' | 'elementResistance') => Object.fromEntries(elements.map(element => [element, Math.round((Number(base[element] ?? 0) + bonus(prefix, element)) * 10) / 10]));
  return { mastery: value(baseMastery, 'elementMastery'), resistance: value(baseResistance, 'elementResistance') };
};

export const recalculateCharacterStats = async (connection: Pool | PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & Record<string, unknown>)[]>('SELECT * FROM characters WHERE id=? FOR UPDATE', [characterId]);
  const character = rows[0]; if (!character) return;
  // 装备实例始终归角色所有；解除穿戴即可自动回到背包，不会销毁实例。
  await connection.execute(`DELETE pe FROM player_equipment pe
    JOIN item_definitions i ON i.id=pe.item_id
    WHERE pe.character_id=? AND COALESCE(i.required_level,1)>?`, [characterId, Number(character.level)]);
  await connection.execute('DELETE FROM player_food_buffs WHERE character_id=? AND expires_at<=NOW()', [characterId]);
  const stats = await withEquipmentStats(connection, characterId, calculateDerivedStats(finalAttributes(character)));
  const baseMastery = jsonRecord(character.element_base_mastery_json ?? character.element_mastery_json);
  const baseResistance = jsonRecord(character.element_base_resistance_json ?? character.element_resistance_json);
  const elemental = await withEquipmentElements(connection, characterId, baseMastery, baseResistance);
  await connection.execute('UPDATE characters SET hp_max=?,mp_max=?,current_hp=LEAST(current_hp,?),current_mp=LEAST(current_mp,?),physical_attack=?,magic_attack=?,physical_defense=?,magic_defense=?,accuracy=?,evasion=?,crit_rate_bp=?,crit_damage_bp=?,crit_resist_bp=?,crit_damage_reduction_bp=?,tenacity=?,speed=?,element_mastery_json=?,element_resistance_json=? WHERE id=?', [stats.hpMax, stats.mpMax, stats.hpMax, stats.mpMax, stats.physicalAttack, stats.magicAttack, stats.physicalDefense, stats.magicDefense, stats.accuracy, stats.evasion, stats.critRateBp, stats.critDamageBp, stats.critResistBp, stats.critDamageReductionBp, stats.tenacity, stats.speed, JSON.stringify(elemental.mastery), JSON.stringify(elemental.resistance), characterId]);
};

/** 体力按实际经过的完整五分钟结算；在家时会获得家具提供的恢复速度加成。 */
export const refreshCharacterStamina = async (connection: PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { stamina: number; realm_stage: number; stamina_updated_at: Date })[]>(
    'SELECT stamina,realm_stage,stamina_updated_at FROM characters WHERE id=? FOR UPDATE', [characterId]
  );
  const row = rows[0]; if (!row) throw new Error('未找到角色。');
  const maximum = staminaMaxForRealm(Number(row.realm_stage));
  const current = Math.max(0, Math.min(maximum, Number(row.stamina ?? maximum)));
  const elapsed = Math.max(0, Date.now() - new Date(row.stamina_updated_at).getTime());
  const multiplier = 1 + await homeRestRecoveryBonus(connection, characterId) / 100;
  const restored = Math.floor(elapsed * multiplier / STAMINA_RECOVERY_MS);
  const stamina = Math.min(maximum, current + restored);
  if (stamina !== current || current !== Number(row.stamina) || stamina >= maximum) {
    const consumedElapsed = Math.ceil(restored * STAMINA_RECOVERY_MS / multiplier);
    const updatedAt = stamina >= maximum ? new Date() : new Date(new Date(row.stamina_updated_at).getTime() + consumedElapsed);
    await connection.execute('UPDATE characters SET stamina=?,stamina_updated_at=? WHERE id=?', [stamina, updatedAt, characterId]);
  }
  return { stamina, staminaMax: maximum };
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
  const elementMastery = randomBalancedElements();
  const elementResistance = randomBalancedElements();
  const name = `冒险者${(nickname || qqUserId).slice(-6)}`;
  await connection.execute(
    'INSERT INTO characters (player_id, name, constitution, spirit, strength, intelligence, agility, perception, constitution_growth, spirit_growth, strength_growth, intelligence_growth, agility_growth, perception_growth, hp_max, mp_max, current_hp, current_mp, physical_attack, magic_attack, physical_defense, magic_defense, accuracy, evasion, crit_rate_bp, crit_damage_bp, crit_resist_bp, crit_damage_reduction_bp, tenacity, speed, element_mastery_json, element_resistance_json, element_base_mastery_json, element_base_resistance_json, current_region_id, pos_x, pos_y, pos_z) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [player.id, name, ...attributes.map(key => allocation[key]), ...attributes.map(key => growth[key]), stats.hpMax, stats.mpMax, stats.hpMax, stats.mpMax, stats.physicalAttack, stats.magicAttack, stats.physicalDefense, stats.magicDefense, stats.accuracy, stats.evasion, stats.critRateBp, stats.critDamageBp, stats.critResistBp, stats.critDamageReductionBp, stats.tenacity, stats.speed, JSON.stringify(elementMastery), JSON.stringify(elementResistance), JSON.stringify(elementMastery), JSON.stringify(elementResistance), region.id, x, y, z]
  );
  const [newCharacters] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM characters WHERE player_id=?', [player.id]);
  const characterId = newCharacters[0].id;
  await recordSkillPointChange(connection, Number(characterId), 1, 'initial_grant', null, '角色创建时获得的初始技能点');
  await connection.execute('UPDATE characters SET game_id=? WHERE id=?', [10000000 + Number(characterId), characterId]);
  await connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity)
    SELECT ?, id, 3 FROM item_definitions WHERE code='healing_herb'`, [characterId]);
  await connection.execute(`INSERT INTO player_quick_items (character_id,quick_slot,item_id)
    SELECT ?, 1, id FROM item_definitions WHERE code='healing_herb'`, [characterId]);
  await connection.execute(`INSERT INTO player_skill_discoveries (character_id,skill_id)
    SELECT ?,id FROM skill_definitions WHERE code='appraisal'`, [characterId]);
  if (gifts[giftCode].category === 'artifact') {
    const itemCode = giftCode;
    await connection.execute('INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max) SELECT ?,id,100,100,100 FROM item_definitions WHERE code=?', [characterId, itemCode]);
    await connection.execute(`INSERT INTO player_equipment (character_id,slot,item_id,instance_id)
      SELECT ?, ?, ii.item_id, ii.id FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
      WHERE ii.character_id=? AND i.code=? ORDER BY ii.id DESC LIMIT 1`, [characterId, artifactGiftSlots[giftCode as keyof typeof artifactGiftSlots], characterId, itemCode]);
    await recalculateCharacterStats(connection, characterId);
  } else {
    await connection.execute('INSERT INTO player_blessings (character_id,code) VALUES (?,?)', [characterId, giftCode]);
    await connection.execute(`INSERT INTO player_skills (character_id,skill_id)
      SELECT ?,id FROM skill_definitions WHERE code=? AND category='passive'`, [characterId, giftCode]);
  }
  await connection.execute('UPDATE players SET status = \'active\' WHERE id = ?', [player.id]);
  await connection.execute('DELETE FROM registration_sessions WHERE id = ?', [session.id]);
  await connection.execute('INSERT INTO player_events (player_id, event_type, payload) VALUES (?, \'character.created\', ?)', [player.id, JSON.stringify({ region: region.name, x, y, z, giftCode })]);
  return { ...allocation, ...stats, growth, name, gender: '未设定', regionName: region.name, x, y, z, level: 1, experience: 0, realmStage: 1, adventurerRegistered: false, giftName: gifts[giftCode].name, currentHp: stats.hpMax, currentMp: stats.mpMax, stamina: 120, staminaMax: 120, activityStatus: 'active', elementMastery, elementResistance, extraAttributes: { damageBonusPct: 0 } };
});

export const getCharacter = async (qqUserId: string): Promise<CharacterView | null> => {
  const pool = await getPool();
  const [characterRows] = await pool.execute<(RowDataPacket & { id: number })[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1', [qqUserId]);
  if (characterRows[0]) await withTransaction(async connection => {
    await refreshCharacterStamina(connection, Number(characterRows[0].id));
    await recalculateCharacterStats(connection, Number(characterRows[0].id));
  });
  const [rows] = await pool.execute<(RowDataPacket & CharacterView)[]>(
    `SELECT c.name, c.gender, c.level, c.experience, c.realm_stage AS realmStage, c.stamina, c.adventurer_registered AS adventurerRegistered, c.constitution, c.spirit, c.strength, c.intelligence, c.agility, c.perception, c.constitution_growth AS constitutionGrowth, c.spirit_growth AS spiritGrowth, c.strength_growth AS strengthGrowth, c.intelligence_growth AS intelligenceGrowth, c.agility_growth AS agilityGrowth, c.perception_growth AS perceptionGrowth, c.hp_max AS hpMax, c.mp_max AS mpMax, c.current_hp AS currentHp, c.current_mp AS currentMp, c.activity_status AS activityStatus, c.physical_attack AS physicalAttack, c.magic_attack AS magicAttack, c.physical_defense AS physicalDefense, c.magic_defense AS magicDefense, c.accuracy, c.evasion, c.crit_rate_bp AS critRateBp, c.crit_damage_bp AS critDamageBp, c.crit_resist_bp AS critResistBp, c.crit_damage_reduction_bp AS critDamageReductionBp, c.tenacity, c.speed, c.element_mastery_json AS elementMastery, c.element_resistance_json AS elementResistance, r.name AS regionName, c.pos_x AS x, c.pos_y AS y, c.pos_z AS z, COALESCE((SELECT ai.name FROM player_equipment ape JOIN item_definitions ai ON ai.id=ape.item_id WHERE ape.character_id=c.id AND ai.rarity='神器' LIMIT 1), b.code) AS giftName FROM characters c JOIN players p ON p.id = c.player_id JOIN map_regions r ON r.id=c.current_region_id LEFT JOIN player_blessings b ON b.character_id=c.id WHERE p.qq_user_id = ? LIMIT 1`,
    [qqUserId]
  );
  const row = rows[0];
  if (!row) return null;
  const extraAttributes = await equipmentExtraAttributes(pool, Number(characterRows[0].id));
  return {
    ...row,
    ...finalAttributes(row),
    stamina: Math.min(staminaMaxForRealm(Number(row.realmStage)), Math.max(0, Number(row.stamina))),
    staminaMax: staminaMaxForRealm(Number(row.realmStage)),
    elementMastery: typeof row.elementMastery === 'string' ? JSON.parse(row.elementMastery) : row.elementMastery ?? {},
    elementResistance: typeof row.elementResistance === 'string' ? JSON.parse(row.elementResistance) : row.elementResistance ?? {},
    extraAttributes,
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
  await connection.execute('UPDATE characters SET adventurer_registered=1 WHERE id=?', [rows[0].id]);
  const [card] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM item_definitions WHERE code=\'adventurer_card\' LIMIT 1', []);
  if (card[0]) await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1,acquired_at=NOW()', [rows[0].id, card[0].id]);
  return true;
});

export const adventurerProfile = async (qqUserId: string) => {
  const pool = await getPool(); const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string; level: number; experience: number; adventurer_registered: number; adventurer_rank: string; profession_code: string | null; profession_name: string | null })[]>(`SELECT c.id,c.name,c.level,c.experience,c.adventurer_registered,c.adventurer_rank,c.profession_code,p.name AS profession_name
    FROM characters c JOIN players pl ON pl.id=c.player_id LEFT JOIN profession_definitions p ON p.code=c.profession_code WHERE pl.qq_user_id=? LIMIT 1`, [qqUserId]);
  if (!rows[0]) throw new Error('请先创建角色。'); return rows[0];
};

export const chooseProfession = async (qqUserId: string, code: string) => withTransaction(async connection => {
  const player = await getPlayer(connection, qqUserId);
  const [characters] = await connection.execute<(RowDataPacket & { id: number; adventurer_registered: number; profession_code: string | null })[]>('SELECT id,adventurer_registered,profession_code FROM characters WHERE player_id=? FOR UPDATE', [player.id]); const character = characters[0];
  if (!character?.adventurer_registered) throw new Error('完成冒险者注册后才能选择职业。');
  if (character.profession_code) throw new Error('已选择职业，暂不可更改。');
  const [professions] = await connection.execute<(RowDataPacket & { code: string; growth_json: unknown; skill_codes_json: unknown })[]>('SELECT code,growth_json,skill_codes_json FROM profession_definitions WHERE code=? LIMIT 1 FOR UPDATE', [code]); const profession = professions[0];
  if (!profession) throw new Error('该职业暂未开放。'); const growth = typeof profession.growth_json === 'string' ? JSON.parse(profession.growth_json) : profession.growth_json as Record<string, number>; const skills = typeof profession.skill_codes_json === 'string' ? JSON.parse(profession.skill_codes_json) : profession.skill_codes_json as string[];
  await connection.execute('UPDATE characters SET profession_code=?,constitution_growth=constitution_growth+?,spirit_growth=spirit_growth+?,strength_growth=strength_growth+?,intelligence_growth=intelligence_growth+?,agility_growth=agility_growth+?,perception_growth=perception_growth+? WHERE id=?', [code, Number(growth.constitution ?? 0), Number(growth.spirit ?? 0), Number(growth.strength ?? 0), Number(growth.intelligence ?? 0), Number(growth.agility ?? 0), Number(growth.perception ?? 0), character.id]);
  for (const skillCode of skills) await connection.execute('INSERT IGNORE INTO player_skills (character_id,skill_id) SELECT ?,id FROM skill_definitions WHERE code=?', [character.id, skillCode]);
  await recalculateCharacterStats(connection, character.id);
  return code;
});
