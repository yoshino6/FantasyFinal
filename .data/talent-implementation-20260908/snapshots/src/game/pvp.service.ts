import { playerGrowthShares } from './growth-rules';
import { armorSetsFor } from './armor-set';
import { recalculateCharacterStats } from './character.service';
import { assertNoNegotiation } from './negotiation.service';
import { executeHiddenCombat, HiddenBattleError, hiddenEndTurn, hiddenReorder, hiddenDeviceSnapshot, hiddenNativeDevice } from './hidden-combat';
import { hiddenBattleContext, submitHiddenDraft, initializeHiddenBattleUnits, type HiddenTicket } from './hidden-battle.service';
import { isHiddenSkill } from './hidden-profession.config';
import { hiddenResourceView, gainHiddenResource } from './hidden-combat-state';
import { consumeInventory, grantInventory } from './inventory-binding';
import { useAlchemyCombat, alchemyEndTurn, consumeAlchemyChant } from './alchemy-combat';
import { randomUUID } from 'node:crypto';
import { skillSpecialization, type SkillSpecializationResult } from './skill-specialization';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import {combatItemEffect} from './item-use-policy';
import { getPool, withTransaction } from '../database/pool';
import { detentionMessage } from './time-format';
import { isInHome } from './home.service';
import { isFriendRelation } from './social.service';
import { directDamageVariance, resolveStrike, strikeCorrections } from './combat-math';
import { createPvpCombatRules } from './pvp-combat-rule-adapter';
import { ruleStatusSummary, maskRuleBattleLog, readRuleState } from './combat-rule-registry';
import { residentSkillByCode } from './resident-skill.config';
import { activeDeviceSkillByCode, combatDeviceSlotsFor, initializeCombatDeviceEnergy, restoreCombatDeviceEnergy, type ActiveDeviceSkill } from './device.service';
import { isAdvancedProfessionSkillCode } from './advanced-profession.config';

type PvpCharacter = RowDataPacket & {
  id: number; game_id: number; name: string; current_region_id: number; pos_x: number; pos_y: number; pos_z: number;
  level: number; perception: number; perception_growth: number;
  hp_max: number; mp_max: number; current_hp: number; current_mp: number; physical_attack: number; magic_attack: number;
  physical_defense: number; magic_defense: number; accuracy: number; evasion: number; crit_rate_bp: number; crit_damage_bp: number;
  crit_resist_bp: number; crit_damage_reduction_bp: number; speed: number; secondary_profession_code: string | null; activity_status: string; detained_until: Date | null;
};
type PvpAction = { type: 'attack' }
  | { type: 'skill'; id: number; code: string; name: string; category: 'physical' | 'magic' | 'utility'; requiredWeaponType: string | null; manaCost: number; power: number; cooldown: number; chant?: number; specialized?: SkillSpecializationResult }
  | { type: 'item'; id: number; name: string; effect: Record<string, number> }
  | { type: 'device'; instanceId: number; deviceCode: string; deviceName: string; skill: ActiveDeviceSkill; target: 'self' | 'enemy' }
  | { type: 'device_charge'; instanceId: number; deviceName: string };
type PvpBattleRow = RowDataPacket & { id: string; attacker_character_id: number; defender_character_id: number; turn_no: number; state: string; attacker_hp: number; attacker_mp: number; defender_hp: number; defender_mp: number; attacker_cooldowns: unknown; defender_cooldowns: unknown; ambush_spawn_id: number | null; ambush_delivery_scope: 'group' | 'c2c' | null; ambush_delivery_target_id: string | null; ambush_delivery_bot_id: string | null };
export type PvpAmbushDelivery = { scope: 'group' | 'c2c'; targetId: string; botId?: string };

const random = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const perceptionRange = (character: PvpCharacter) => {
  const perception = Number(character.perception) + Number(character.perception_growth) * playerGrowthShares(Number(character.level));
  const statValue = 1 + Math.floor(Math.pow(Math.max(1, perception) / 7, .9));
  const levelCap = Math.min(10, 2 + Math.floor(Math.max(1, Number(character.level)) / 5));
  return Math.max(1, Math.min(10, levelCap, statValue));
};
const record = (value: unknown): Record<string, any> => {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, number>;
  try { return JSON.parse(String(value)) as Record<string, number>; } catch { return {}; }
};
type PvpDeviceState = Record<string, any>;
const activeDeviceCodesFor = async (connection: PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { code: string })[]>(`SELECT i.code FROM player_active_devices ad
    JOIN player_item_instances ii ON ii.id=ad.instance_id JOIN item_definitions i ON i.id=ii.item_id
    WHERE ad.character_id=? AND i.item_type='device'`, [characterId]);
  return new Set(rows.map(row => row.code));
};
const characterFor = async (connection: PoolConnection, qqUserId: string) => {
  const [rows] = await connection.execute<PvpCharacter[]>('SELECT c.* FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  return rows[0];
};
const townRegion = async (connection: PoolConnection) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM map_regions WHERE code=\'baina_town\' LIMIT 1');
  if (!rows[0]) throw new Error('百纳镇区域尚未初始化。');
  return rows[0];
};
const wanted = async (connection: PoolConnection, characterId: number, regionId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM player_warrants WHERE wanted_character_id=? AND city_region_id=? AND status=\'active\' LIMIT 1 FOR UPDATE', [characterId, regionId]);
  return Number(rows[0]?.id ?? 0);
};
const activeWarrants = async (connection: PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM player_warrants WHERE wanted_character_id=? AND status=\'active\' FOR UPDATE', [characterId]);
  return rows.map(row => Number(row.id));
};

/** 战败者在自己下一条游戏指令前不会再次成为 PvP 目标。 */
export const assertPvpDefeatUnprotected = async (connection: PoolConnection, characterId: number) => {
  await connection.execute('DELETE FROM player_pvp_defeat_protections WHERE character_id=? AND expires_at<=NOW()', [characterId]);
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_pvp_defeat_protections WHERE character_id=? AND expires_at>NOW() FOR UPDATE', [characterId]);
  if (rows[0]) throw new Error('目标正处于战败保护中，需等待对方下一次游戏指令后才能再次攻击。');
};

/** 任意消息首次触发时，领取并标记战败结算通知；保护本身不受此影响。 */
export const takePvpDefeatNotice = async (qqUserId: string) => withTransaction(async connection => {
  const [characters] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT c.id FROM characters c
    JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE`, [qqUserId]);
  const character = characters[0];
  if (!character) return null;
  await connection.execute('DELETE FROM player_pvp_defeat_protections WHERE character_id=? AND expires_at<=NOW()', [character.id]);
  const [protections] = await connection.execute<(RowDataPacket & { attacker_name: string; notice_text: string; defeated_at: Date })[]>(`SELECT attacker_name,notice_text,defeated_at
    FROM player_pvp_defeat_protections WHERE character_id=? AND expires_at>NOW() AND notice_delivered_at IS NULL FOR UPDATE`, [character.id]);
  const protection = protections[0];
  if (!protection) return null;
  await connection.execute('UPDATE player_pvp_defeat_protections SET notice_delivered_at=NOW() WHERE character_id=?', [character.id]);
  return { attackerName: protection.attacker_name, notice: protection.notice_text, defeatedAt: protection.defeated_at };
});

/** 下一次游戏指令结束后解除对应的战败保护。 */
export const completePvpDefeatProtection = async (qqUserId: string) => withTransaction(async connection => {
  const [characters] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT c.id FROM characters c
    JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE`, [qqUserId]);
  const character = characters[0];
  if (!character) return;
  await connection.execute('DELETE FROM player_pvp_defeat_protections WHERE character_id=?', [character.id]);
});

type PvpAttackLogOutcome = 'hit' | 'miss' | 'defeat' | 'utility';
type PvpBattleLog = RowDataPacket & { id: string; attacker_character_id: number; defender_character_id: number; attacker_name: string; defender_name: string; battle_type: string; outcome: string; winner_character_id: number | null; winner_name: string | null; loot_text: string | null; started_at: Date; ended_at: Date | null };

/** 所有 PvP 攻击统一写入双方可见的战报。 */
export const recordPvpAttack = async (connection: PoolConnection, attacker: Pick<PvpCharacter, 'id' | 'name'>, defender: Pick<PvpCharacter, 'id' | 'name'>, actionName: string, damage: number, outcome: PvpAttackLogOutcome, lootText: string | null = null) => {
  await connection.execute(`INSERT INTO player_pvp_attack_logs
    (attacker_character_id,defender_character_id,attacker_name,defender_name,action_name,damage,outcome,loot_text)
    VALUES (?,?,?,?,?,?,?,?)`, [attacker.id, defender.id, attacker.name, defender.name, actionName, Math.max(0, Math.floor(damage)), outcome, lootText]);
};

export const createPvpBattleLog = async (connection: PoolConnection, attacker: Pick<PvpCharacter, 'id' | 'name'>, defender: Pick<PvpCharacter, 'id' | 'name'>, battleType: string, id = randomUUID()) => {
  await connection.execute(`INSERT INTO player_pvp_battle_logs
    (id,attacker_character_id,defender_character_id,attacker_name,defender_name,battle_type)
    VALUES (?,?,?,?,?,?)`, [id, attacker.id, defender.id, attacker.name, defender.name, battleType]);
  return id;
};

export const finishPvpBattleLog = async (connection: PoolConnection, id: string, outcome: 'attacker_win' | 'defender_win' | 'draw' | 'escaped', winner: Pick<PvpCharacter, 'id' | 'name'> | null = null, lootText: string | null = null) => {
  await connection.execute(`UPDATE player_pvp_battle_logs SET outcome=?,winner_character_id=?,winner_name=?,loot_text=?,ended_at=NOW() WHERE id=?`, [outcome, winner?.id ?? null, winner?.name ?? null, lootText, id]);
};

/** 查询自己发起与受到的 PvP 攻击战报。 */
export const pvpBattleHistory = async (qqUserId: string, page = 1, filter: '全部' | '进攻方' | '防守方' = '全部', keyword = '') => {
  const pool = await getPool();
  const [characters] = await pool.execute<(RowDataPacket & { id: number })[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1', [qqUserId]);
  const character = characters[0]; if (!character) throw new Error('请先注册角色。');
  const where = filter === '进攻方' ? 'attacker_character_id=?' : filter === '防守方' ? 'defender_character_id=?' : '(attacker_character_id=? OR defender_character_id=?)';
  const values: Array<number | string> = filter === '全部' ? [character.id, character.id] : [character.id];
  const search = keyword.trim() ? ' AND (attacker_name LIKE ? OR defender_name LIKE ? OR battle_type LIKE ? OR outcome LIKE ?)' : '';
  if (keyword.trim()) values.push(`%${keyword.trim()}%`, `%${keyword.trim()}%`, `%${keyword.trim()}%`, `%${keyword.trim()}%`);
  const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM player_pvp_battle_logs WHERE ${where}${search}`, values);
  const total = Number(countRows[0]?.total ?? 0); const totalPages = Math.max(1, Math.ceil(total / 5)); const currentPage = Math.min(Math.max(1, page), totalPages);
  const [rows] = await pool.execute<PvpBattleLog[]>(`SELECT * FROM player_pvp_battle_logs WHERE ${where}${search} ORDER BY started_at DESC,id DESC LIMIT 5 OFFSET ?`, [...values, (currentPage - 1) * 5]);
  return { page: currentPage, totalPages, total, entries: rows.map(row => ({
    attacker: row.attacker_name, defender: row.defender_name, type: row.battle_type, outcome: row.outcome, winner: row.winner_name, loot: row.loot_text, startedAt: row.started_at, endedAt: row.ended_at
  })), filter, keyword: keyword.trim() };
};

/** 通缉者在对应城镇留下最后一次可追踪的行踪。 */
export const recordWarrantSighting = async (connection: PoolConnection, characterId: number, regionId: number, x: number, y: number) => {
  await connection.execute(`UPDATE player_warrants SET last_seen_at=NOW(),last_seen_x=?,last_seen_y=?
    WHERE wanted_character_id=? AND city_region_id=? AND status='active'`, [x, y, characterId, regionId]);
};

/** 同一通缉者每攻击一名新受害者，通缉星级便提升一次进度。 */
const recordWarrantVictim = async (connection: PoolConnection, warrantId: number, targetCharacterId: number) => {
  if (warrantId) await connection.execute('INSERT IGNORE INTO player_warrant_victims (warrant_id,target_character_id) VALUES (?,?)', [warrantId, targetCharacterId]);
};

const actionFor = async (connection: PoolConnection, character: PvpCharacter, manual = false): Promise<PvpAction> => {
  const [settings] = await connection.execute<(RowDataPacket & { enabled: number; auto_potion_enabled: number; hp_threshold: number; hp_item_id: number | null; mp_threshold: number; mp_item_id: number | null; action_cursor: number })[]>('SELECT * FROM player_pvp_auto_battle_settings WHERE character_id=? FOR UPDATE', [character.id]);
  const setting = settings[0];
  if (setting?.enabled) {
    const lowHp = Number(character.current_hp) * 100 <= Number(character.hp_max) * Number(setting.hp_threshold);
    const lowMp = Number(character.current_mp) * 100 <= Number(character.mp_max) * Number(setting.mp_threshold);
    const potionId = Number(setting.auto_potion_enabled) ? (lowHp ? setting.hp_item_id : lowMp ? setting.mp_item_id : null) : null;
    if (potionId) {
      const [items] = await connection.execute<(RowDataPacket & { id: number; name: string; effect_json: unknown })[]>('SELECT i.id,i.name,i.effect_json FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 AND i.item_type=\'consumable\' LIMIT 1 FOR UPDATE', [character.id, potionId]);
      if (items[0]) return { type: 'item', id: Number(items[0].id), name: items[0].name, effect: record(items[0].effect_json) };
    }
    const [actions] = await connection.execute<(RowDataPacket & { skill_id: number | null; active_skill_id: number | null; code: string | null; name: string | null; category: 'physical' | 'magic' | 'utility' | null; required_weapon_type: string | null; mana_cost: number | null; power: number | null; cooldown_turns: number | null })[]>(`SELECT a.skill_id,
      CASE WHEN ps.skill_id IS NOT NULL AND s.id IS NOT NULL THEN s.id ELSE NULL END AS active_skill_id,
      s.code,s.name,s.category,s.required_weapon_type,s.mana_cost,s.power,s.cooldown_turns
    FROM player_pvp_auto_battle_actions a
    LEFT JOIN player_skills ps ON ps.character_id=a.character_id AND ps.skill_id=a.skill_id
    LEFT JOIN skill_definitions s ON s.id=a.skill_id AND s.category IN ('physical','magic','utility')
    WHERE a.character_id=? ORDER BY a.sequence_no`, [character.id]);
    if (actions.length) {
      const picked = actions[(Math.max(1, Number(setting.action_cursor)) - 1) % actions.length];
      await connection.execute('UPDATE player_pvp_auto_battle_settings SET action_cursor=action_cursor+1 WHERE character_id=?', [character.id]);
      // 每个保存的栏位都占用一次轮转；技能失效时只让这个栏位临时普攻，不能跳过、压缩或改写配置。
      if (picked.skill_id === null || picked.active_skill_id === null || !picked.code || !picked.name || !picked.category) return { type: 'attack' };
      return { type: 'skill', id: Number(picked.active_skill_id), code: picked.code, name: picked.name, category: picked.category, requiredWeaponType: picked.required_weapon_type, manaCost: Number(picked.mana_cost), power: Number(picked.power), cooldown: Number(picked.cooldown_turns) };
    }
  }
  if (manual) return { type: 'attack' };
  const [quick] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; category: 'physical' | 'magic' | 'utility'; required_weapon_type: string | null; mana_cost: number; power: number; cooldown_turns: number })[]>('SELECT s.id,s.code,s.name,s.category,s.required_weapon_type,s.mana_cost,s.power,s.cooldown_turns FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot IS NOT NULL AND s.category IN (\'physical\',\'magic\',\'utility\') ORDER BY ps.quick_slot', [character.id]);
  if (!quick.length) return { type: 'attack' };
  const picked = random(quick);
  return { type: 'skill', id: Number(picked.id), code: picked.code, name: picked.name, category: picked.category, requiredWeaponType: picked.required_weapon_type, manaCost: Number(picked.mana_cost), power: Number(picked.power), cooldown: Number(picked.cooldown_turns) };
};

const creditItem = async (connection: PoolConnection, characterId: number, itemId: number, quantity: number) => {
  await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [characterId, itemId, quantity]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, itemId]);
};

type RestitutionDetail = { id: string; itemCount: number; copper: number; debt: number };
type StolenLootRow = RowDataPacket & {
  id: number; original_owner_character_id: number; holder_character_id: number; item_id: number | null;
  quantity: number; held_quantity: number; sold_quantity: number; copper_amount: number; sale_copper_amount: number;
};

/** 记录赃物被商店收购的去向。售出收益会在通缉者被终结时优先追回。 */
export const recordPvpLootSale = async (connection: PoolConnection, holderId: number, itemId: number, quantity: number, saleCopper: number) => {
  let remaining = Math.max(0, Math.floor(quantity));
  let unallocatedValue = Math.max(0, Math.floor(saleCopper));
  const [rows] = await connection.execute<StolenLootRow[]>(`SELECT * FROM pvp_stolen_loot
    WHERE holder_character_id=? AND item_id=? AND returned_at IS NULL AND held_quantity>0 ORDER BY acquired_at,id FOR UPDATE`, [holderId, itemId]);
  for (const row of rows) {
    if (!remaining) break;
    const moved = Math.min(remaining, Number(row.held_quantity));
    const value = moved === remaining ? unallocatedValue : Math.floor(Math.max(0, saleCopper) * moved / Math.max(1, quantity));
    await connection.execute('UPDATE pvp_stolen_loot SET held_quantity=held_quantity-?,sold_quantity=sold_quantity+?,sale_copper_amount=sale_copper_amount+? WHERE id=?', [moved, moved, value, row.id]);
    remaining -= moved; unallocatedValue -= value;
  }
};

/** 赃物再次被掠夺时保留最初失主，避免赃物链被洗白。 */
const transferStolenItem = async (connection: PoolConnection, fromId: number, toId: number, itemId: number, quantity: number) => {
  let remaining = quantity;
  const [rows] = await connection.execute<StolenLootRow[]>(`SELECT * FROM pvp_stolen_loot
    WHERE holder_character_id=? AND item_id=? AND returned_at IS NULL AND held_quantity>0 ORDER BY acquired_at,id FOR UPDATE`, [fromId, itemId]);
  for (const row of rows) {
    if (!remaining) break;
    const moved = Math.min(remaining, Number(row.held_quantity));
    if (moved === Number(row.held_quantity) && !Number(row.sold_quantity) && moved === Number(row.quantity)) {
      await connection.execute('UPDATE pvp_stolen_loot SET holder_character_id=? WHERE id=?', [toId, row.id]);
    } else {
      await connection.execute('UPDATE pvp_stolen_loot SET quantity=quantity-?,held_quantity=held_quantity-? WHERE id=?', [moved, moved, row.id]);
      await connection.execute('INSERT INTO pvp_stolen_loot (original_owner_character_id,holder_character_id,item_id,quantity,held_quantity) VALUES (?,?,?,?,?)', [row.original_owner_character_id, toId, itemId, moved, moved]);
    }
    remaining -= moved;
  }
  if (remaining) await connection.execute('INSERT INTO pvp_stolen_loot (original_owner_character_id,holder_character_id,item_id,quantity,held_quantity) VALUES (?,?,?,?,?)', [fromId, toId, itemId, remaining, remaining]);
};

const transferStolenCopper = async (connection: PoolConnection, fromId: number, toId: number, copper: number) => {
  let remaining = copper;
  const [rows] = await connection.execute<StolenLootRow[]>('SELECT * FROM pvp_stolen_loot WHERE holder_character_id=? AND item_id IS NULL AND returned_at IS NULL AND copper_amount>0 ORDER BY acquired_at,id FOR UPDATE', [fromId]);
  for (const row of rows) {
    if (!remaining) break;
    const moved = Math.min(remaining, Number(row.copper_amount));
    if (moved === Number(row.copper_amount)) await connection.execute('UPDATE pvp_stolen_loot SET holder_character_id=? WHERE id=?', [toId, row.id]);
    else {
      await connection.execute('UPDATE pvp_stolen_loot SET copper_amount=copper_amount-? WHERE id=?', [moved, row.id]);
      await connection.execute('INSERT INTO pvp_stolen_loot (original_owner_character_id,holder_character_id,copper_amount) VALUES (?,?,?)', [row.original_owner_character_id, toId, moved]);
    }
    remaining -= moved;
  }
  if (remaining) await connection.execute('INSERT INTO pvp_stolen_loot (original_owner_character_id,holder_character_id,copper_amount) VALUES (?,?,?)', [fromId, toId, remaining]);
};

/** 百纳镇会强制执行尚未缴清的赃款债务。 */
export const collectCityDebts = async (connection: PoolConnection, characterId: number, cityRegionId: number) => {
  const [characterRows] = await connection.execute<(RowDataPacket & { copper_coins: number })[]>('SELECT copper_coins FROM characters WHERE id=? FOR UPDATE', [characterId]);
  let available = Number(characterRows[0]?.copper_coins ?? 0); if (!characterRows[0]) return { collected: 0, remaining: 0 };
  const [debts] = await connection.execute<(RowDataPacket & { id: number; original_owner_character_id: number; amount_copper: number; paid_copper: number })[]>(`SELECT * FROM player_city_debts
    WHERE debtor_character_id=? AND city_region_id=? AND status='active' ORDER BY created_at,id FOR UPDATE`, [characterId, cityRegionId]);
  let collected = 0; let remaining = 0;
  for (const debt of debts) {
    const owed = Math.max(0, Number(debt.amount_copper) - Number(debt.paid_copper));
    const paid = Math.min(available, owed);
    if (paid) {
      await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [paid, characterId]);
      await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [paid, debt.original_owner_character_id]);
      await connection.execute(`UPDATE player_city_debts SET paid_copper=paid_copper+?,status=IF(paid_copper+?>=amount_copper,'settled','active'),settled_at=IF(paid_copper+?>=amount_copper,NOW(),NULL) WHERE id=?`, [paid, paid, paid, debt.id]);
      available -= paid; collected += paid;
    }
    remaining += owed - paid;
  }
  return { collected, remaining };
};

/** PvP 战败：普通战败昏迷；城镇红名战败则被逮捕、返还赃物，并发放悬赏。 */
export const settlePvpDefeat = async (connection: PoolConnection, winnerId: number, loserId: number) => {
  const [loserRows] = await connection.execute<(PvpCharacter & { region_name: string; region_code: string })[]>('SELECT c.*,r.name AS region_name,r.code AS region_code FROM characters c JOIN map_regions r ON r.id=c.current_region_id WHERE c.id=? FOR UPDATE', [loserId]);
  const loser = loserRows[0]; if (!loser) return { captured: false, restitution: undefined as RestitutionDetail | undefined, text: '' };
  const warrants = await activeWarrants(connection, loserId);
  const captured = Boolean(warrants.length && loser.region_code === 'baina_town');
  if (!captured) {
    await connection.execute('UPDATE characters SET current_hp=1,activity_status=\'unconscious\',rest_started_at=NOW() WHERE id=?', [loserId]);
  } else {
    await connection.execute('UPDATE player_warrants SET status=\'captured\',captured_by_character_id=?,captured_at=NOW() WHERE wanted_character_id=? AND status=\'active\'', [winnerId, loserId]);
    await connection.execute('UPDATE characters SET current_hp=1,activity_status=\'detained\',rest_started_at=NULL,detained_until=DATE_ADD(NOW(),INTERVAL 12 HOUR) WHERE id=?', [loserId]);
  }
  const debtTown = await townRegion(connection);

  const [stolen] = await connection.execute<StolenLootRow[]>('SELECT * FROM pvp_stolen_loot WHERE holder_character_id=? AND returned_at IS NULL FOR UPDATE', [loserId]);
  const restitutionId = stolen.length ? randomUUID() : null;
  let returnedItems = 0; let returnedCopper = 0; let debtCopper = 0;
  const [balanceRows] = await connection.execute<(RowDataPacket & { copper_coins: number })[]>('SELECT copper_coins FROM characters WHERE id=? FOR UPDATE', [loserId]);
  let availableCopper = Number(balanceRows[0]?.copper_coins ?? 0);
  for (const loot of stolen) {
    const heldQuantity = Math.min(Number(loot.quantity), Number(loot.held_quantity));
    if (loot.item_id && Number(loot.quantity) > 0) {
      await grantInventory(connection,Number(loot.original_owner_character_id),Number(loot.item_id),{trade:Number(loot.quantity),personal:0,unbound:0});
      if (heldQuantity) await connection.execute('UPDATE player_inventory SET quantity=GREATEST(0,quantity-?) WHERE character_id=? AND item_id=?', [heldQuantity, loserId, loot.item_id]);
      await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [loserId, loot.item_id]);
      returnedItems += Number(loot.quantity);
    }
    const owedCopper = Number(loot.copper_amount) + Number(loot.sale_copper_amount);
    let chargedCopper = 0; let rowDebt = 0;
    if (owedCopper > 0) {
      chargedCopper = Math.min(availableCopper, owedCopper); rowDebt = owedCopper - chargedCopper;
      if (chargedCopper) {
        await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [chargedCopper, loserId]);
        await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [chargedCopper, loot.original_owner_character_id]);
        availableCopper -= chargedCopper;
      }
      if (rowDebt && restitutionId) await connection.execute('INSERT INTO player_city_debts (debtor_character_id,original_owner_character_id,city_region_id,restitution_id,amount_copper) VALUES (?,?,?,?,?)', [loserId, loot.original_owner_character_id, debtTown.id, restitutionId, rowDebt]);
      returnedCopper += chargedCopper; debtCopper += rowDebt;
    }
    await connection.execute('UPDATE pvp_stolen_loot SET returned_at=NOW(),restitution_id=?,restitution_charged_copper=?,restitution_debt_copper=? WHERE id=?', [restitutionId, chargedCopper, rowDebt, loot.id]);
  }
  const rewards = warrants.length
    ? (await connection.execute<(RowDataPacket & { id: number; reward_item_id: number | null; quantity: number; copper_amount: number })[]>('SELECT * FROM player_warrant_rewards WHERE warrant_id IN (' + warrants.map(() => '?').join(',') + ') AND claimed_at IS NULL FOR UPDATE', warrants))[0]
    : [];
  let bountyItems = 0; let bountyCopper = 0;
  for (const reward of rewards) {
    if (reward.reward_item_id && Number(reward.quantity) > 0) { await creditItem(connection, winnerId, Number(reward.reward_item_id), Number(reward.quantity)); bountyItems += Number(reward.quantity); }
    if (Number(reward.copper_amount) > 0) { await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [reward.copper_amount, winnerId]); bountyCopper += Number(reward.copper_amount); }
    await connection.execute('UPDATE player_warrant_rewards SET claimed_at=NOW(),claimed_by_character_id=? WHERE id=?', [winnerId, reward.id]);
  }
  const restitution: RestitutionDetail | undefined = restitutionId ? { id: restitutionId, itemCount: returnedItems, copper: returnedCopper, debt: debtCopper } : undefined;
  const resultText = `${captured ? `【${loser.name}】被逮捕，关押 12 小时。` : '对方倒下并陷入昏迷。'}${restitution ? `返还失物${returnedItems ? `×${returnedItems}` : ''}${returnedCopper ? `、扣回铜币×${returnedCopper}` : ''}${debtCopper ? `；欠缴铜币×${debtCopper}` : ''}。` : ''}${bountyItems || bountyCopper ? `获得通缉赏金${bountyItems ? `与物品×${bountyItems}` : ''}${bountyCopper ? `、铜币×${bountyCopper}` : ''}。` : ''}`;
  return { captured, restitution, text: resultText };
};

/** 城镇执法 NPC 击败通缉者时，按缉捕规则关押、返还赃物并追缴赃款。 */
export const settleCityPursuitDefeat = async (connection: PoolConnection, loserId: number, cityRegionId: number) => {
  const [loserRows] = await connection.execute<(PvpCharacter & { name: string })[]>('SELECT * FROM characters WHERE id=? FOR UPDATE', [loserId]);
  const loser = loserRows[0]; if (!loser) return { text: '' };
  const warrants = await activeWarrants(connection, loserId);
  if (warrants.length) await connection.execute('UPDATE player_warrants SET status=\'captured\',captured_by_character_id=NULL,captured_at=NOW() WHERE wanted_character_id=? AND status=\'active\'', [loserId]);
  await connection.execute('UPDATE characters SET current_hp=1,activity_status=\'detained\',rest_started_at=NULL,detained_until=DATE_ADD(NOW(),INTERVAL 12 HOUR) WHERE id=?', [loserId]);

  const [stolen] = await connection.execute<StolenLootRow[]>('SELECT * FROM pvp_stolen_loot WHERE holder_character_id=? AND returned_at IS NULL FOR UPDATE', [loserId]);
  const restitutionId = stolen.length ? randomUUID() : null;
  let returnedItems = 0; let returnedCopper = 0; let debtCopper = 0;
  const [balanceRows] = await connection.execute<(RowDataPacket & { copper_coins: number })[]>('SELECT copper_coins FROM characters WHERE id=? FOR UPDATE', [loserId]);
  let availableCopper = Number(balanceRows[0]?.copper_coins ?? 0);
  for (const loot of stolen) {
    const heldQuantity = Math.min(Number(loot.quantity), Number(loot.held_quantity));
    if (loot.item_id && Number(loot.quantity) > 0) {
      await grantInventory(connection,Number(loot.original_owner_character_id),Number(loot.item_id),{trade:Number(loot.quantity),personal:0,unbound:0});
      if (heldQuantity) await connection.execute('UPDATE player_inventory SET quantity=GREATEST(0,quantity-?) WHERE character_id=? AND item_id=?', [heldQuantity, loserId, loot.item_id]);
      await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [loserId, loot.item_id]);
      returnedItems += Number(loot.quantity);
    }
    const owedCopper = Number(loot.copper_amount) + Number(loot.sale_copper_amount);
    const chargedCopper = Math.min(availableCopper, owedCopper); const rowDebt = owedCopper - chargedCopper;
    if (chargedCopper) {
      await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [chargedCopper, loserId]);
      await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [chargedCopper, loot.original_owner_character_id]);
      availableCopper -= chargedCopper;
    }
    if (rowDebt && restitutionId) await connection.execute('INSERT INTO player_city_debts (debtor_character_id,original_owner_character_id,city_region_id,restitution_id,amount_copper) VALUES (?,?,?,?,?)', [loserId, loot.original_owner_character_id, cityRegionId, restitutionId, rowDebt]);
    returnedCopper += chargedCopper; debtCopper += rowDebt;
    await connection.execute('UPDATE pvp_stolen_loot SET returned_at=NOW(),restitution_id=?,restitution_charged_copper=?,restitution_debt_copper=? WHERE id=?', [restitutionId, chargedCopper, rowDebt, loot.id]);
  }
  const recovered = returnedItems || returnedCopper || debtCopper;
  return { text: `【${loser.name}】被城镇守卫关押 12 小时。${recovered ? `返还失物${returnedItems ? `×${returnedItems}` : ''}${returnedCopper ? `、扣回铜币×${returnedCopper}` : ''}${debtCopper ? `；欠缴铜币×${debtCopper}` : ''}。` : ''}` };
};

const stealFromLoser = async (connection: PoolConnection, winner: PvpCharacter, loser: PvpCharacter, extra = false) => {
  const [items] = await connection.execute<(RowDataPacket & { item_id: number; name: string; quantity: number; trade_price: number })[]>('SELECT pi.item_id,i.name,pi.quantity-pi.trade_bound_quantity-pi.personal_bound_quantity AS quantity,i.trade_price FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>pi.trade_bound_quantity+pi.personal_bound_quantity AND i.is_tradeable=1 AND i.trade_price>0 AND i.item_category NOT IN (\'特殊\',\'地图\',\'货币\') FOR UPDATE', [loser.id]);
  let weighted = items.flatMap(item => Array.from({ length: Math.max(1, Math.min(100, Number(item.trade_price) * Number(item.quantity))) }, () => item));
  const taken: string[] = [];
  for (let count = 0; count < (extra ? 2 : 1) && weighted.length; count += 1) {
    const item = random(weighted); const quantity = Math.max(1, Math.min(Number(item.quantity), extra ? 2 : 1));
    await consumeInventory(connection,Number(loser.id),Number(item.item_id),quantity,true);
    await grantInventory(connection,Number(winner.id),Number(item.item_id),{trade:quantity,personal:0,unbound:0});
    item.quantity=Number(item.quantity)-quantity;if(!item.quantity)weighted=weighted.filter(candidate=>candidate!==item);
    await transferStolenItem(connection, Number(loser.id), Number(winner.id), Number(item.item_id), quantity);
    taken.push(`【${item.name}】×${quantity}`);
  }
  const [coins] = await connection.execute<(RowDataPacket & { copper_coins: number })[]>('SELECT copper_coins FROM characters WHERE id=? FOR UPDATE', [loser.id]);
  const copper = Math.min(Number(coins[0]?.copper_coins ?? 0), Math.max(0, Math.floor(Number(coins[0]?.copper_coins ?? 0) * (extra ? .15 : .05))));
  if (copper) {
    await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [copper, loser.id]);
    await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [copper, winner.id]);
    await transferStolenCopper(connection, Number(loser.id), Number(winner.id), copper);
    taken.push(`铜币×${copper}`);
  }
  return taken;
};

/** 所有 PvP 击倒共用的战利品结算；城镇红名会额外触发关押与失物返还。 */
export const resolvePvpVictory = async (connection: PoolConnection, winnerId: number, loserId: number) => {
  const [winners] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE id=? FOR UPDATE', [winnerId]);
  const [losers] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE id=? FOR UPDATE', [loserId]);
  const winner = winners[0]; const loser = losers[0]; if (!winner || !loser) return { text: '' };
  const settlement = await settlePvpDefeat(connection, winnerId, loserId);
  // 缉捕红名时优先没收并返还赃物，不再从被关押者身上制造新的掠夺记录。
  const loot = settlement.captured ? [] : await stealFromLoser(connection, winner, loser);
  const lossText = settlement.captured
    ? settlement.text
    : loot.length ? `掉落${loot.join('、')}。` : '没有可被掠夺的物品或铜币。';
  await connection.execute(`INSERT INTO player_pvp_defeat_protections (character_id,attacker_name,notice_text,expires_at)
    VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 1 HOUR)) ON DUPLICATE KEY UPDATE attacker_name=VALUES(attacker_name),notice_text=VALUES(notice_text),defeated_at=NOW(),expires_at=VALUES(expires_at)`, [
    loser.id,
    winner.name,
    `你被【${winner.name}】击败，生命降至 1，并已自动进入休息恢复。${lossText}`
  ]);
  return { text: `${settlement.text}${loot.length ? ` 获得${loot.join('、')}。` : ''}`, restitution: settlement.restitution, lootText: lossText };
};

const resolveAction = async (connection: PoolConnection, actor: PvpCharacter, target: PvpCharacter, action: PvpAction, sessionId?: string, targetCooldowns?: PvpDeviceState, actorCooldowns?: PvpDeviceState, actorDevices = new Set<string>(), targetDevices = new Set<string>(), context?: Awaited<ReturnType<typeof createPvpCombatRules>>) => {
  if (action.type === 'device_charge') {
    if (!sessionId) return { text: `【${actor.name}】尝试为【${action.deviceName}】充能，但当前不在可充能战斗中。`, defeated: false };
    const [rows] = await connection.execute<(RowDataPacket & { current_energy: number; max_energy: number })[]>(`SELECT current_energy,max_energy FROM combat_device_energy
      WHERE battle_kind='pvp' AND session_id=? AND character_id=? AND instance_id=? FOR UPDATE`, [sessionId, actor.id, action.instanceId]);
    const energy = rows[0]; if (!energy) return { text: `【${actor.name}】尝试为【${action.deviceName}】充能，但该异械未在本场生效。`, defeated: false };
    const next = Math.min(Number(energy.max_energy), Number(energy.current_energy) + 30);
    if (context && next-Number(energy.current_energy)>=30) gainHiddenResource(context.get(Number(actor.id)),context.rule.turn,10);
    await connection.execute("UPDATE combat_device_energy SET current_energy=? WHERE battle_kind='pvp' AND session_id=? AND character_id=? AND instance_id=?", [next, sessionId, actor.id, action.instanceId]);
    return { text: `【${actor.name}】为【${action.deviceName}】充能，${energy.current_energy}→${next}/${energy.max_energy}。`, defeated: false };
  }
  if (action.type === 'device') {
    if (!sessionId) return { text: `【${actor.name}】启动【${action.deviceName}】失败。`, defeated: false };
    const configured = activeDeviceSkillByCode.get(action.skill.code);
    if (!configured || configured.deviceCode !== action.deviceCode) return { text: `【${actor.name}】启动【${action.deviceName}】失败：回路配置无效。`, defeated: false };
    await connection.execute("UPDATE combat_device_energy SET current_energy=current_energy-? WHERE battle_kind='pvp' AND session_id=? AND character_id=? AND instance_id=? AND current_energy>=?", [action.skill.energyCost, sessionId, actor.id, action.instanceId, action.skill.energyCost]);
    const recipient = action.target === 'self' ? actor : target;
    const recipientCooldowns = action.target === 'self' ? actorCooldowns : targetCooldowns;
    const heal = (ratio: number) => {
      const before = Number(recipient.current_hp); recipient.current_hp = Math.min(Number(recipient.hp_max), before + Math.floor(Number(recipient.hp_max) * ratio));
      return `【${recipient.name}】HP ${before}→${recipient.current_hp}`;
    };
    if (action.skill.effect === 'recycling_reflux') {
      const restored = await restoreCombatDeviceEnergy(connection, sessionId, Number(actor.id), 20, action.instanceId, 'pvp');
      return { text: `【${actor.name}】启动【${action.deviceName}】·回收回流，其余 ${restored} 件主动异械各恢复至多 20 点充能。`, defeated: false };
    }
    if (action.skill.effect === 'weave_repair') { for (const code of ['device_slow', 'device_exposed', 'device_bind', 'device_stun', 'device_burn', 'device_poison']) delete recipientCooldowns?.[code]; return { text: `【${actor.name}】启动【${action.deviceName}】·缝补程序，${heal(.18)}，并净化 1 个负面状态。`, defeated: false }; }
    if (action.skill.effect === 'autonomous_repair') { const restored = Number(recipientCooldowns?.device_barrier ?? 0) > 0 ? await restoreCombatDeviceEnergy(connection, sessionId, Number(recipient.id), 20, undefined, 'pvp') : 0; return { text: `【${actor.name}】启动【${action.deviceName}】·应急重构，${heal(.30)}${restored ? `，并为 ${restored} 件异械各恢复至多 20 点充能` : ''}。`, defeated: false }; }
    if (action.skill.effect === 'reactor_thermal_share') {
      const restored = await restoreCombatDeviceEnergy(connection, sessionId, Number(recipient.id), 10, undefined, 'pvp');
      recipientCooldowns!.device_battle_cry = 2;
      return { text: `【${actor.name}】启动【${action.deviceName}】·热能转供，【${recipient.name}】伤害提高 20%，异械各恢复至多 10 点充能（${restored} 件）。`, defeated: false };
    }
    if (action.skill.effect === 'physical_evade_once') return { text: `【${actor.name}】启动【${action.deviceName}】，获得一次物理闪避。`, defeated: false };
    if (action.skill.effect === 'easter_egg') {
      const pool = ['device_precision_aim', 'device_battle_cry', 'device_rocket_boost', 'device_barrier', 'device_regeneration', 'device_mana_regeneration', 'device_slow', 'device_exposed', 'device_bind', 'device_burn', 'device_poison', 'device_evasion_down'];
      const picked = [...pool].sort(() => Math.random() - .5).slice(0, 5); for (const code of picked) recipientCooldowns![code] = code === 'device_rocket_boost' ? Math.min(100, Number(recipientCooldowns![code] ?? 0) + 30) : 3;
      return { text: `【${actor.name}】启动【${action.deviceName}】·彩蛋投掷，【${recipient.name}】随机获得 5 种效果。`, defeated: false };
    }
    if (action.skill.effect === 'precision_aim') { recipientCooldowns!.device_precision_aim = 99; return { text: `【${actor.name}】启动【${action.deviceName}】·精准瞄准，【${recipient.name}】获得命中与暴击提升，直到下次受击。`, defeated: false }; }
    if (action.skill.effect === 'gravity_tether') { recipientCooldowns!.device_slow = 2; recipientCooldowns!.device_evasion_down = 2; return { text: `【${actor.name}】启动【${action.deviceName}】·引力牵引，【${recipient.name}】速度、闪避降低 30%。`, defeated: false }; }
    if (action.skill.effect === 'fold_barrier') { recipientCooldowns!.device_barrier = actorDevices.has('fold_barrier_generator') ? 3 : 2; return { text: `【${actor.name}】启动【${action.deviceName}】·折叠壁垒，【${recipient.name}】获得 15% 减伤。`, defeated: false }; }
    if (action.skill.effect === 'phase_decoy') { recipientCooldowns!.device_phase_decoy = 99; return { text: `【${actor.name}】启动【${action.deviceName}】·相位替身，【${recipient.name}】的下次直接伤害降低 80%。`, defeated: false }; }
    if (action.skill.effect === 'counter_spider') {
      const removable = ['device_precision_aim', 'device_battle_cry', 'device_barrier', 'device_phase_decoy'].find(code => Number(recipientCooldowns?.[code] ?? 0) > 0);
      if (removable) { delete recipientCooldowns![removable]; return { text: `【${actor.name}】启动【${action.deviceName}】·拆解射线，移除了【${recipient.name}】的一项正面状态。`, defeated: false }; }
      recipientCooldowns!.device_exposed = 2; return { text: `【${actor.name}】启动【${action.deviceName}】·拆解射线，【${recipient.name}】获得易伤 15%。`, defeated: false };
    }
    if (action.skill.effect === 'reactor_overcharge') actor.current_hp = Math.max(1, Number(actor.current_hp) - Math.floor(Number(actor.current_hp) * .15));
    const magic = action.skill.effect === 'frost_pulse' || action.skill.effect === 'reactor_overcharge';
    const pseudo: PvpAction = { type: 'skill', id: 0, code: `device_${action.skill.code}`, name: `${action.deviceName}·${action.skill.name}`, category: magic ? 'magic' : 'physical', requiredWeaponType: null, manaCost: 0, power: Number(action.skill.power ?? 100), cooldown: 0 };
    const result = await resolveAction(connection, actor, target, pseudo, sessionId, targetCooldowns, actorCooldowns, actorDevices, targetDevices, context);
    if (!result.defeated && action.skill.effect === 'shock_pile' && Math.random() < .65) targetCooldowns!.device_stun = 2;
    if (!result.defeated && action.skill.effect === 'frost_pulse') targetCooldowns!.device_slow = 2;
    if (!result.defeated && (action.skill.effect === 'coil_cannon')) targetCooldowns!.device_exposed = 2;
    return result;
  }
  if(action.type==='item'&&!combatItemEffect(action.effect,true))return{text:'该道具不适用于 PVP，请在背包查看使用方式，未消耗道具。',defeated:false};
  if (action.type === 'item' && context && (action.effect.alchemyOutput || action.effect.skillReset)) {
    const [inventory] = await connection.execute<RowDataPacket[]>('SELECT quantity FROM player_inventory WHERE character_id=? AND item_id=? FOR UPDATE', [actor.id,action.id]);
    if (Number(inventory[0]?.quantity ?? 0)<=0) return { text:'背包中已没有该道具。',defeated:false };
    const result=await useAlchemyCombat(context.rule,context.get(Number(actor.id)),context.get(Number(target.id)),action.effect,action.name,'pvp');
    if(result.consumed) { await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=? AND quantity>0',[actor.id,action.id]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0',[actor.id,action.id]); }
    return { text:`【${actor.name}】使用【${action.name}】：${result.message}`,defeated:Number(target.current_hp)<=0 };
  }
  if (action.type === 'item') {
    const oldHp = Number(actor.current_hp); const oldMp = Number(actor.current_mp);
    const hp = Math.min(Number(actor.hp_max), oldHp + Number(action.effect.heal ?? 0) + Math.floor(Number(actor.hp_max) * Math.max(0, Number(action.effect.healPct ?? 0)) / 100)); const mp = Math.min(Number(actor.mp_max), oldMp + Number(action.effect.restoreMp ?? 0) + Math.floor(Number(actor.mp_max) * Math.max(0, Number(action.effect.restoreMpPct ?? 0)) / 100));
    if(hp===oldHp&&mp===oldMp)return{text:'当前无需回复，未消耗道具。',defeated:false};
    await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=? AND quantity>0', [actor.id, action.id]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [actor.id, action.id]);
    await connection.execute('UPDATE characters SET current_hp=?,current_mp=? WHERE id=?', [hp, mp, actor.id]); actor.current_hp = hp; actor.current_mp = mp;
    return { text: `【${actor.name}】使用【${action.name}】，HP ${oldHp}→${hp}｜MP ${oldMp}→${mp}。`, defeated: false };
  }
  const skill = action.type === 'skill' && Number(actor.current_mp) >= action.manaCost ? action : null;
  if (action.type === 'skill' && !skill) return resolveAction(connection, actor, target, { type: 'attack' }, sessionId, targetCooldowns, actorCooldowns, actorDevices, targetDevices, context);
  if (skill) { actor.current_mp = Number(actor.current_mp) - skill.manaCost; await connection.execute('UPDATE characters SET current_mp=? WHERE id=?', [actor.current_mp, actor.id]); }
  if (skill?.code === 'machine_echo' && sessionId) {
    const restored = await restoreCombatDeviceEnergy(connection, sessionId, Number(actor.id), 25, undefined, 'pvp');
    await recordPvpAttack(connection, actor, target, '技能「万机回响」', 0, 'utility');
    return { text: `【${actor.name}】释放技能「万机回响」，为自身 ${restored} 件已生效主动异械各恢复至多 25 点充能。`, defeated: false };
  }
  if (skill?.category === 'utility') { await recordPvpAttack(connection, actor, target, `技能「${skill.name}」`, 0, 'utility'); return { text: `【${actor.name}】释放技能「${skill.name}」，但该辅助技能尚未在 PvP 对抗中形成直接伤害。`, defeated: false }; }
  const sourceUnit = context?.get(Number(actor.id)); let targetUnit = context?.get(Number(target.id));
  if (sourceUnit && targetUnit) {
    const redirected = context!.rule.redirect(sourceUnit, targetUnit, true);
    if (redirected.key === sourceUnit.key) { target = actor; targetCooldowns = actorCooldowns; targetDevices = actorDevices; targetUnit = sourceUnit; }
  }
  const magic = skill?.category === 'magic'; let attack = magic ? Number(actor.magic_attack) : Number(actor.physical_attack); let defense = magic ? Number(target.magic_defense) : Number(target.physical_defense); const label = skill ? `释放技能「${skill.name}」` : '普通攻击';
  if (sourceUnit && targetUnit) {
    if (context!.rule.passive(sourceUnit, 'G01')) attack = Math.max(sourceUnit.attack, sourceUnit.magic);
    const swap = skill && await context!.rule.consume(sourceUnit, magic ? 'swap_magic' : 'swap_physical');
    if (swap) attack = magic ? Math.min(sourceUnit.attack, sourceUnit.magic) : Math.max(sourceUnit.attack, sourceUnit.magic);
    attack *= 1 + (context!.rule.statBonus(sourceUnit, [magic ? 'magic' : 'attack','battle_cry','power_surge']) - context!.rule.value(sourceUnit, magic ? 'magic_down' : 'attack_down')) / 100;
    defense *= (1 - Math.min(80, context!.rule.value(targetUnit, magic ? 'magic_shatter' : 'armor_shatter')) / 100) * (1 + context!.rule.value(targetUnit, magic ? 'magic_defense' : 'defense') / 100);
  }
  // 精准瞄准在“下次受到攻击”时失效；命中、暴击仅影响状态拥有者在这之前的出手。
  delete targetCooldowns?.device_precision_aim;
  if (!magic && Number(targetCooldowns?.device_physical_evasion ?? 0) > 0) {
    delete targetCooldowns!.device_physical_evasion;
    await recordPvpAttack(connection, actor, target, skill ? `技能「${skill.name}」` : '普通攻击', 0, 'miss');
    return { text: `【${actor.name}】${skill ? `释放技能「${skill.name}」` : '普通攻击'}，但【${target.name}】以异械闪避了物理攻击。`, defeated: false };
  }
  const isDeviceDamage = Boolean(skill?.code.startsWith('device_'));
  const deviceDamageBonus = isDeviceDamage ? (actorDevices.has('rail_stabilizer') ? 12 : 0) + (skill?.code === 'device_electromagnetic_coil_fire' && actorDevices.has('electromagnetic_coil_cannon') ? 12 : 0) : 0;
  const battleCryBonus = !sourceUnit && Number(actorCooldowns?.device_battle_cry ?? 0) > 0 ? 20 : 0;
  const accuracyBonus=sourceUnit?context!.rule.statBonus(sourceUnit,['accuracy','precision'])-context!.rule.value(sourceUnit,'accuracy_down'):(Number(actorCooldowns?.device_precision_aim??0)>0?100:0);
  const accuracy = Number(actor.accuracy) * (1 + accuracyBonus / 100) * (1 + (isDeviceDamage && actorDevices.has('precision_scope') ? .1 : 0));
  const evasion = Number(target.evasion) * (1 - (Number(targetCooldowns?.device_evasion_down ?? 0) > 0 ? .3 : 0));
  const critRate = Math.max(Number(actor.crit_rate_bp), Number(actorCooldowns?.device_precision_aim ?? 0) > 0 ? 10000 : 0, !magic && actorDevices.has('critical_glove') ? 10000 : 0);
  const setup = sourceUnit && targetUnit ? await context!.rule.attackSetup(sourceUnit, targetUnit, Boolean(magic), Boolean(skill)) : { forceHit: false, powerFactor: 1, hitBonus: 0, hitFactor: 1 };
  const armorSets = sourceUnit && targetUnit ? undefined : await armorSetsFor(connection,[Number(actor.id),Number(target.id)]);
  const strike = resolveStrike(attack * (skill ? skill.power / 100 : 1) * (1 + (deviceDamageBonus + battleCryBonus) / 100), defense, accuracy, evasion*(1+(targetUnit?context!.rule.value(targetUnit,'evasion')-context!.rule.value(targetUnit,'evasion_down'):0)/100), critRate*(1+(sourceUnit?context!.rule.value(sourceUnit,'crit_bonus'):0)/100), Number(target.crit_resist_bp), Number(actor.crit_damage_bp), Number(target.crit_damage_reduction_bp), setup.forceHit, false, 0, setup.hitBonus * 100, setup.hitFactor, strikeCorrections(sourceUnit ?? {armorSet:armorSets?.get(Number(actor.id))},targetUnit ?? {armorSet:armorSets?.get(Number(target.id))}));
  if (!strike.hit) { await recordPvpAttack(connection, actor, target, label, 0, 'miss'); return { text: `【${actor.name}】${label}，但【${target.name}】闪避了攻击。`, defeated: false }; }
  const exposed = Number(targetCooldowns?.device_exposed ?? 0) > 0 ? .15 : 0; const barrier = Number(targetCooldowns?.device_barrier ?? 0) > 0 ? .15 : 0; const phase = Number(targetCooldowns?.device_phase_decoy ?? 0) > 0 ? .8 : 0;
  if (phase) delete targetCooldowns!.device_phase_decoy;
  const[elementRows]=skill&&skill.id>0?await connection.execute<RowDataPacket[]>('SELECT element FROM skill_definitions WHERE id=?',[skill.id]):[[] as RowDataPacket[]];const element=String(elementRows[0]?.element??'无');
  let damage = directDamageVariance(Math.max(1, Math.floor(strike.damage * (skill?.specialized?.damageFactor ?? 1) * (1 + exposed) * (1 - barrier) * (1 - phase) * setup.powerFactor * (sourceUnit&&targetUnit?context!.rule.elementFactor(sourceUnit,targetUnit,element):1))));
  if (sourceUnit && targetUnit) { damage = await context!.rule.incoming(sourceUnit, targetUnit, damage, element, Boolean(magic), Boolean(skill), true, true); const absorbed = await context!.rule.take(targetUnit, damage); await context!.rule.afterHit(sourceUnit, targetUnit, damage - absorbed, element, Boolean(skill), absorbed, Boolean(actorCooldowns?.__extraTurn)); }
  const hp = targetUnit ? targetUnit.hp : Math.max(0, Number(target.current_hp) - damage); const defeated = hp <= 0; const critText = strike.crit ? '暴击' : '';
  if (context && (defeated || Number(actor.current_hp) <= 0)) { target.current_hp = hp; await recordPvpAttack(connection, actor, target, label, damage, 'defeat'); return { text: `【${actor.name}】${label}，造成 ${damage} 点伤害。`, defeated: true }; }
  if (!defeated && targetDevices.has('inverse_buffer') && Number(targetCooldowns?.device_inverse_triggered ?? 0) <= 0 && hp * 100 <= Number(target.hp_max) * 30) { targetCooldowns!.device_inverse_triggered = 1; targetCooldowns!.device_barrier = Math.max(Number(targetCooldowns!.device_barrier ?? 0), 2); }
  if (!defeated) { await connection.execute('UPDATE characters SET current_hp=? WHERE id=?', [hp, target.id]); target.current_hp = hp; await recordPvpAttack(connection, actor, target, label, damage, 'hit'); return { text: `【${actor.name}】${label}，对【${target.name}】造成 ${damage} 点${critText}${magic ? '魔法' : '物理'}伤害（HP ${hp}）。`, defeated: false }; }
  const settlement = await resolvePvpVictory(connection, actor.id, target.id);
  await recordPvpAttack(connection, actor, target, label, damage, 'defeat', settlement.lootText);
  // 战斗过程只记录本次攻击；掠夺、逮捕等结果由独立结算消息展示。
  return { text: `【${actor.name}】${label}，对【${target.name}】造成 ${damage} 点${critText}${magic ? '魔法' : '物理'}伤害。`, defeated: true, settlement: settlement.text, restitution: settlement.restitution, lootText: settlement.lootText };
};

export const cityPvp = async (qqUserId: string, targetGameId: number, confirmed = false) => withTransaction(async connection => {
  const attacker = await characterFor(connection, qqUserId); const town = await townRegion(connection);
  if (Number(attacker.current_region_id) !== Number(town.id)) throw new Error('只有在百纳镇内才能发起城镇 PvP。');
  if (await isInHome(connection, Number(attacker.id))) throw new Error('你正在自己的家园中，无法主动发起 PvP。');
  if (attacker.activity_status === 'detained') throw new Error(detentionMessage(attacker.detained_until));
  const [targets] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE game_id=? AND npc_code IS NULL FOR UPDATE', [targetGameId]); const target = targets[0];
  if (!target || Number(target.id) === Number(attacker.id) || Number(target.current_region_id) !== Number(town.id) || Number(target.pos_z) !== Number(attacker.pos_z) || Math.abs(Number(target.pos_x) - Number(attacker.pos_x)) + Math.abs(Number(target.pos_y) - Number(attacker.pos_y)) > 1) throw new Error('目标不在你相邻的城镇格子中。');
  await assertNoNegotiation(connection, Number(attacker.id)); await assertNoNegotiation(connection, Number(target.id));
  await assertPvpDefeatUnprotected(connection, Number(target.id));
  if (target.activity_status === 'detained') throw new Error('目标已被守卫关押。');
  const attackerWarrant = await wanted(connection, attacker.id, Number(town.id)); const targetWarrant = await wanted(connection, target.id, Number(town.id));
  if (await isInHome(connection, Number(target.id)) && !targetWarrant) throw new Error('目标正在自己的家园中，无法攻击或打劫。');
  // 已被本城通缉的目标可被任何玩家合法缉捕；缉捕者不会因此获得红名。
  const unlawfulAttack = !attackerWarrant && !targetWarrant;
  if (unlawfulAttack && !confirmed) {
    await connection.execute('INSERT INTO player_pvp_attack_confirmations (attacker_character_id,target_character_id,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 1 MINUTE)) ON DUPLICATE KEY UPDATE target_character_id=VALUES(target_character_id),expires_at=VALUES(expires_at)', [attacker.id, target.id]);
    return { needsConfirmation: true, target: target.name, text: '小镇内贸然攻击玩家会被通缉。' };
  }
  if (unlawfulAttack && confirmed) {
    const [confirmations] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_pvp_attack_confirmations WHERE attacker_character_id=? AND target_character_id=? AND expires_at>NOW() FOR UPDATE', [attacker.id, target.id]);
    if (!confirmations[0]) throw new Error('攻击确认已失效，请重新选择攻击目标。');
    await connection.execute('DELETE FROM player_pvp_attack_confirmations WHERE attacker_character_id=?', [attacker.id]);
  }
  if (unlawfulAttack) { await connection.execute('INSERT INTO player_warrants (wanted_character_id,city_region_id,status) VALUES (?,?,\'active\')', [attacker.id, town.id]); await recordWarrantSighting(connection, Number(attacker.id), Number(town.id), Number(attacker.pos_x), Number(attacker.pos_y)); }
  if (!targetWarrant) await recordWarrantVictim(connection, await wanted(connection, Number(attacker.id), Number(town.id)), Number(target.id));
  await refreshPvpPanel(connection,[attacker,target]);
  const battleLogId = await createPvpBattleLog(connection, attacker, target, '城镇');
  const opening = await resolveAction(connection, attacker, target, await actionFor(connection, attacker, true));
  const response = !opening.defeated && Number(target.current_hp) > 1 ? await resolveAction(connection, target, attacker, await actionFor(connection, target)) : null;
  const winner = opening.defeated ? attacker : response?.defeated ? target : null;
  await finishPvpBattleLog(connection, battleLogId, winner === attacker ? 'attacker_win' : winner === target ? 'defender_win' : 'draw', winner, opening.lootText ?? response?.lootText ?? null);
  return { needsConfirmation: false, target: target.name, text: [opening.text, response?.text].filter(Boolean).join('\n') };
});

/** 城镇外的同地图 PvP；野外没有通缉确认，仍要求目标处于感知范围内。 */
export const fieldPvp = async (qqUserId: string, targetGameId: number) => withTransaction(async connection => {
  const attacker = await characterFor(connection, qqUserId);
  if (await isInHome(connection, Number(attacker.id))) throw new Error('你正在自己的家园中，无法主动发起 PvP。');
  if (attacker.activity_status === 'detained') throw new Error(detentionMessage(attacker.detained_until));
  const [targets] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE game_id=? AND npc_code IS NULL FOR UPDATE', [targetGameId]);
  const target = targets[0];
  const distance = target ? Math.abs(Number(target.pos_x) - Number(attacker.pos_x)) + Math.abs(Number(target.pos_y) - Number(attacker.pos_y)) : Infinity;
  if (!target || Number(target.id) === Number(attacker.id) || Number(target.current_region_id) !== Number(attacker.current_region_id) || Number(target.pos_z) !== Number(attacker.pos_z) || distance > perceptionRange(attacker)) throw new Error('目标已经离开你的感知范围。');
  await assertNoNegotiation(connection, Number(attacker.id)); await assertNoNegotiation(connection, Number(target.id));
  await assertPvpDefeatUnprotected(connection, Number(target.id));
  if (target.activity_status === 'detained') throw new Error('目标已被守卫关押。');
  if (await isInHome(connection, Number(target.id))) throw new Error('目标正在自己的家园中，无法攻击或打劫。');
  await refreshPvpPanel(connection,[attacker,target]);
  const battleLogId = await createPvpBattleLog(connection, attacker, target, '野外');
  const opening = await resolveAction(connection, attacker, target, await actionFor(connection, attacker, true));
  const response = !opening.defeated && Number(target.current_hp) > 1 ? await resolveAction(connection, target, attacker, await actionFor(connection, target)) : null;
  const winner = opening.defeated ? attacker : response?.defeated ? target : null;
  await finishPvpBattleLog(connection, battleLogId, winner === attacker ? 'attacker_win' : winner === target ? 'defender_win' : 'draw', winner, opening.lootText ?? response?.lootText ?? null);
  return { text: [opening.text, response?.text].filter(Boolean).join('\n') };
});

const activePvpBattle = async (connection: PoolConnection, characterId: number, lock = false) => {
  const [rows] = await connection.execute<PvpBattleRow[]>(`SELECT * FROM player_pvp_battle_sessions
    WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?) LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [characterId, characterId]);
  return rows[0];
};
const battleActionFromSlot = async (connection: PoolConnection, character: PvpCharacter, type: 'attack' | 'skill' | 'item' | 'escape' | 'auto', slot?: number, skillId?: number): Promise<PvpAction | null> => {
  if (type === 'attack') return { type: 'attack' };
  if (type === 'escape') return null;
  if (type === 'auto') return actionFor(connection, character);
  if (type === 'skill') {
    const [rows] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; category: 'physical' | 'magic' | 'utility'; required_weapon_type: string | null; mana_cost: number; power: number; cooldown_turns: number })[]>(skillId
      ? `SELECT s.id,s.code,s.name,s.category,s.required_weapon_type,s.mana_cost,s.power,s.cooldown_turns
          FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id
          WHERE ps.character_id=? AND ps.skill_id=? AND s.category IN ('physical','magic','utility') LIMIT 1`
      : `SELECT s.id,s.code,s.name,s.category,s.required_weapon_type,s.mana_cost,s.power,s.cooldown_turns
          FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot=? LIMIT 1`, skillId ? [character.id, skillId] : [character.id, slot ?? 0]);
    if (!rows[0]) throw new Error(skillId ? '二转技能尚未学习。' : `技能${'①②③④'.charAt(Math.max(0, (slot ?? 1) - 1)) || slot}未配置。`);
    const skill = rows[0]; return { type: 'skill', id: Number(skill.id), code: skill.code, name: skill.name, category: skill.category, requiredWeaponType: skill.required_weapon_type, manaCost: Number(skill.mana_cost), power: Number(skill.power), cooldown: Number(skill.cooldown_turns) };
  }
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string; effect_json: unknown })[]>(`SELECT i.id,i.name,i.effect_json FROM player_quick_items qi
    JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id AND pi.quantity>0
    JOIN item_definitions i ON i.id=qi.item_id WHERE qi.character_id=? AND qi.quick_slot=? LIMIT 1`, [character.id, slot ?? 0]);
  if (!rows[0]) throw new Error(`道具${'①②③④'.charAt(Math.max(0, (slot ?? 1) - 1)) || slot}未配置。`);
  return { type: 'item', id: Number(rows[0].id), name: rows[0].name, effect: record(rows[0].effect_json) };
};
const deviceActionFromSlot = async (connection: PoolConnection, sessionId: string, character: PvpCharacter, cooldowns: PvpDeviceState, slot: number, skillCode?: string, targetKind?: 'member' | 'target'): Promise<PvpAction> => {
  const devices = await combatDeviceSlotsFor(connection, sessionId, Number(character.id), true, 'pvp');
  const device = devices.find(candidate => candidate.slot === slot);
  if (!device) throw new Error(`异械${'①②③④'.charAt(slot - 1) || slot}未配置或尚未生效。`);
  const skill = skillCode ? device.skills.find(candidate => candidate.code === skillCode) : device.skills[0];
  if (!skill) throw new Error('请选择该异械的可用技能。');
  const cooldownKey = `device_${device.instanceId}_${skill.code}`;
  if (Number(cooldowns[cooldownKey] ?? 0) > 0) throw new Error(`【${skill.name}】冷却中，还需${cooldowns[cooldownKey]}回合。`);
  if (device.currentEnergy < skill.energyCost) return { type: 'device_charge', instanceId: device.instanceId, deviceName: device.deviceName };
  const target = skill.targetScope === 'self' || skill.targetScope === 'ally' || skill.targetScope === 'all_allies'
    ? 'self'
    : skill.targetScope === 'any' && targetKind === 'member' ? 'self' : 'enemy';
  return { type: 'device', instanceId: device.instanceId, deviceCode: device.deviceCode, deviceName: device.deviceName, skill, target };
};
const tickCooldowns = (value: unknown) => Object.fromEntries(Object.entries(record(value)).map(([code, turns]) => {
  if (code.startsWith('__')) return [code, turns];
  if (code === 'device_rocket_boost' || code === 'device_inverse_triggered') return [code, Number(turns)];
  return [code, Math.max(0, Number(turns) - 1)];
}));
const readyBattleAction = async (_connection: PoolConnection, character: PvpCharacter, action: PvpAction | null, cooldowns: Record<string, number>, automatic: boolean): Promise<PvpAction> => {
  if (!action || action.type !== 'skill') return action ?? { type: 'attack' };
  const usable = Number(character.current_mp) >= action.manaCost
    && Number(cooldowns[action.code] ?? 0) <= 0;
  if (usable) return action;
  if (automatic) return { type: 'attack' };
  if (Number(character.current_mp) < action.manaCost) throw new Error('魔力不足，无法释放该技能。');
  throw new Error(`「${action.name}」冷却中。`);
};
const actionLog = (text: string) => {
  const separator = text.indexOf('，');
  return separator < 0 ? `➤${text}` : `➤${text.slice(0, separator)}\n　➥${text.slice(separator + 1)}`;
};
const sessionView = async (connection: PoolConnection, battle: PvpBattleRow, character: PvpCharacter) => {
  const attackerId = Number(battle.attacker_character_id); const ownAttacker = Number(character.id) === attackerId;
  const ownHp = ownAttacker ? Number(battle.attacker_hp) : Number(battle.defender_hp); const ownMp = ownAttacker ? Number(battle.attacker_mp) : Number(battle.defender_mp);
  const enemyId = ownAttacker ? Number(battle.defender_character_id) : attackerId;
  const [others] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE id=? LIMIT 1', [enemyId]); const enemy = others[0];
  const enemyHp = ownAttacker ? Number(battle.defender_hp) : Number(battle.attacker_hp); const enemyMp = ownAttacker ? Number(battle.defender_mp) : Number(battle.attacker_mp);
  const enemyState = readRuleState(record(ownAttacker ? battle.defender_cooldowns : battle.attacker_cooldowns).__rules); const hidden = enemyState.statuses.some(e => e.code === 'nightmare' && e.until >= Number(battle.turn_no));
  const cooldowns = ownAttacker ? record(battle.attacker_cooldowns) : record(battle.defender_cooldowns);
  const [skills] = await connection.execute<(RowDataPacket & { quick_slot: number; code: string })[]>('SELECT ps.quick_slot,s.code FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot IS NOT NULL', [character.id]);
  const [advancedSkillRows] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string })[]>(`SELECT ps.skill_id AS id,s.code,s.name
    FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id
    WHERE ps.character_id=? AND s.category IN ('physical','magic','utility')
    ORDER BY ps.learned_at,s.id`, [character.id]);
  const [items] = await connection.execute<(RowDataPacket & { quick_slot: number })[]>('SELECT qi.quick_slot FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id AND pi.quantity>0 WHERE qi.character_id=?', [character.id]);
  const deviceSlots = await combatDeviceSlotsFor(connection, battle.id, Number(character.id), false, 'pvp');
  await initializeHiddenBattleUnits(connection,[{key:`pvp:${character.id}`,cooldowns}]);
  return { sessionId: battle.id, mode: 'pvp', selectedAllyId: Number(cooldowns.__selectedAlly) || null, canEnchant: skills.some(s => s.code === 'resident_a02'), enchantElement: String(cooldowns.__enchantElement ?? '风'), characterId: Number(character.id), turn: Number(battle.turn_no), playerHp: ownHp, playerHpMax: Number(character.hp_max), playerMp: ownMp, playerMpMax: Number(character.mp_max), selectedTargetId: enemyId,
    canAct: ownAttacker && ownHp > 0 && !readRuleState(cooldowns.__rules).cast, resource: hiddenResourceView(cooldowns), skillSlots: skills.map(row => Number(row.quick_slot)), readySkillSlots: skills.filter(row => Number(cooldowns[row.code] ?? 0) <= 0).map(row => Number(row.quick_slot)), advancedSkills: advancedSkillRows.filter(skill => isAdvancedProfessionSkillCode(skill.code)).map(skill => ({ id: Number(skill.id), code: skill.code, name: skill.name, ready: Number(cooldowns[skill.code] ?? 0) <= 0 })), itemSlots: items.map(row => Number(row.quick_slot)), appraisal: { learned: false, rangeLevel: 0, informationLevel: 0 },
    members: [{ statusText: ruleStatusSummary(readRuleState(cooldowns.__rules), Number(battle.turn_no)), id: Number(character.id), name: character.name, hp: ownHp, hpMax: Number(character.hp_max), mp: ownMp, mpMax: Number(character.mp_max), resource: hiddenResourceView(cooldowns), defeated: ownHp <= 0, pending: false, chanting: residentSkillByCode(readRuleState(cooldowns.__rules).cast?.code ?? '')?.name ?? null, extraAction: Boolean(cooldowns.__bonusAction) }], spirits: [], deviceSlots: deviceSlots.map(device => ({ ...device, skills: device.skills.map(skill => ({ ...skill, ready: Number(cooldowns[`device_${device.instanceId}_${skill.code}`] ?? 0) <= 0 })) })), environment: null,
    targets: enemy ? [{ statusText: hidden ? '信息被雾遮蔽' : ruleStatusSummary(enemyState, Number(battle.turn_no), false), id: enemyId, name: hidden ? '信息被雾遮蔽' : enemy.name, level: Number(enemy.level), hp: hidden ? '???' : enemyHp, hpMax: hidden ? '???' : Number(enemy.hp_max), mp: hidden ? '???' : enemyMp, mpMax: hidden ? '???' : Number(enemy.mp_max), defeated: enemyHp <= 0, identified: !hidden }] : []
  };
};

/** 入战前刷新已穿戴装备的面板；保留当前生命/魔力，不因上限提高而补满。 */
const refreshPvpPanel = async (connection: PoolConnection, fighters: PvpCharacter[]) => {
  for (const fighter of [...fighters].sort((a,b)=>Number(a.id)-Number(b.id))) {
    await recalculateCharacterStats(connection,Number(fighter.id));
    const [rows] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE id=?',[fighter.id]);
    if (rows[0]) Object.assign(fighter,rows[0]);
  }
};

/** 开始玩家回合制战斗；城镇内的首次攻击仍需确认并会产生通缉。 */
export const startPvpBattle = async (qqUserId: string, targetGameId: number, confirmed = false) => withTransaction(async connection => {
  const attacker = await characterFor(connection, qqUserId); const [regions] = await connection.execute<(RowDataPacket & { code: string })[]>('SELECT code FROM map_regions WHERE id=? LIMIT 1', [attacker.current_region_id]); const regionCode = regions[0]?.code ?? '';
  const [targets] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE game_id=? AND npc_code IS NULL FOR UPDATE', [targetGameId]); const defender = targets[0];
  const distance = defender ? Math.abs(Number(defender.pos_x) - Number(attacker.pos_x)) + Math.abs(Number(defender.pos_y) - Number(attacker.pos_y)) : Infinity;
  const range = regionCode === 'dark_forest_dungeon' ? 1 : perceptionRange(attacker);
  if (!defender || Number(defender.id) === Number(attacker.id) || Number(defender.current_region_id) !== Number(attacker.current_region_id) || Number(defender.pos_z) !== Number(attacker.pos_z) || distance > range) throw new Error('目标已经离开你的感知范围。');
  await assertNoNegotiation(connection, Number(attacker.id)); await assertNoNegotiation(connection, Number(defender.id));
  await assertPvpDefeatUnprotected(connection, Number(defender.id));
  if (await isFriendRelation(connection, Number(attacker.id), Number(defender.id))) throw new Error('游戏内好友之间无法互相攻击。');
  if (await isInHome(connection, Number(attacker.id))) throw new Error('你正在自己的家园中，无法主动发起 PvP。');
  if (attacker.activity_status === 'detained') throw new Error(detentionMessage(attacker.detained_until));
  if (defender.activity_status === 'detained') throw new Error('目标已被守卫关押。');
  if (regionCode === 'baina_town') {
    const attackerWarrant = await wanted(connection, Number(attacker.id), Number(attacker.current_region_id)); const defenderWarrant = await wanted(connection, Number(defender.id), Number(attacker.current_region_id));
    if (await isInHome(connection, Number(defender.id)) && !defenderWarrant) throw new Error('目标正在自己的家园中，无法攻击或打劫。');
    // 仅攻击普通市民才会触发红名；攻击当前城市的通缉者属于合法缉捕。
    const unlawfulAttack = !attackerWarrant && !defenderWarrant;
    if (unlawfulAttack && !confirmed) { await connection.execute('INSERT INTO player_pvp_attack_confirmations (attacker_character_id,target_character_id,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 1 MINUTE)) ON DUPLICATE KEY UPDATE target_character_id=VALUES(target_character_id),expires_at=VALUES(expires_at)', [attacker.id, defender.id]); return { needsConfirmation: true, target: defender.name }; }
    if (unlawfulAttack) {
      const [confirmedRows] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_pvp_attack_confirmations WHERE attacker_character_id=? AND target_character_id=? AND expires_at>NOW() FOR UPDATE', [attacker.id, defender.id]);
      if (!confirmedRows[0]) throw new Error('攻击确认已失效，请重新选择攻击目标。');
      await connection.execute('DELETE FROM player_pvp_attack_confirmations WHERE attacker_character_id=?', [attacker.id]);
      await connection.execute('INSERT INTO player_warrants (wanted_character_id,city_region_id,status) VALUES (?,?,\'active\')', [attacker.id, attacker.current_region_id]);
      await recordWarrantSighting(connection, Number(attacker.id), Number(attacker.current_region_id), Number(attacker.pos_x), Number(attacker.pos_y));
    }
    if (!defenderWarrant) await recordWarrantVictim(connection, await wanted(connection, Number(attacker.id), Number(attacker.current_region_id)), Number(defender.id));
  } else if (await isInHome(connection, Number(defender.id))) throw new Error('目标正在自己的家园中，无法攻击或打劫。');
  const [occupied] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id IN (?,?) OR defender_character_id IN (?,?)) LIMIT 1 FOR UPDATE`, [attacker.id, defender.id, attacker.id, defender.id]);
  if (occupied[0]) throw new Error('其中一方正在进行玩家对战。');
  await refreshPvpPanel(connection,[attacker,defender]);
  const id = randomUUID(); await connection.execute('INSERT INTO player_pvp_battle_sessions (id,attacker_character_id,defender_character_id,attacker_hp,attacker_mp,defender_hp,defender_mp,attacker_cooldowns,defender_cooldowns) VALUES (?,?,?,?,?,?,?,JSON_OBJECT(),JSON_OBJECT())', [id, attacker.id, defender.id, attacker.current_hp, attacker.current_mp, defender.current_hp, defender.current_mp]);
  await initializeCombatDeviceEnergy(connection, id, Number(attacker.id), 'pvp'); await initializeCombatDeviceEnergy(connection, id, Number(defender.id), 'pvp');
  await createPvpBattleLog(connection, attacker, defender, regionCode === 'baina_town' ? '城镇' : '野外', id);
  return { needsConfirmation: false, target: defender.name };
});

/** BOSS 伏击的战后接管：不走城镇红名确认，也不受通常感知距离限制。 */
export const startAmbushPvpBattle = async (attackerCharacterId: number, defenderCharacterId: number, spawnId: number, delivery: PvpAmbushDelivery) => withTransaction(async connection => {
  const [fighters] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE id IN (?,?) AND npc_code IS NULL FOR UPDATE', [attackerCharacterId, defenderCharacterId]);
  const attacker = fighters.find(row => Number(row.id) === Number(attackerCharacterId));
  const defender = fighters.find(row => Number(row.id) === Number(defenderCharacterId));
  if (!attacker || !defender || Number(attacker.id) === Number(defender.id)) throw new Error('伏击目标已经离开战场。');
  await assertNoNegotiation(connection, Number(attacker.id)); await assertNoNegotiation(connection, Number(defender.id));
  await assertPvpDefeatUnprotected(connection, Number(defender.id));
  if (attacker.activity_status !== 'active' || defender.activity_status !== 'active') throw new Error('伏击条件已失效，战场中的一方无法继续战斗。');
  const [occupied] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_pvp_battle_sessions
    WHERE state='active' AND (attacker_character_id IN (?,?) OR defender_character_id IN (?,?)) LIMIT 1 FOR UPDATE`, [attacker.id, defender.id, attacker.id, defender.id]);
  if (occupied[0]) throw new Error('伏击目标已进入另一场玩家对战。');
  const id = randomUUID();
  await refreshPvpPanel(connection,[attacker,defender]);
  await connection.execute(`INSERT INTO player_pvp_battle_sessions
    (id,attacker_character_id,defender_character_id,attacker_hp,attacker_mp,defender_hp,defender_mp,attacker_cooldowns,defender_cooldowns,ambush_spawn_id,ambush_delivery_scope,ambush_delivery_target_id,ambush_delivery_bot_id)
    VALUES (?,?,?,?,?,?,?,JSON_OBJECT(),JSON_OBJECT(),?,?,?,?)`, [id, attacker.id, defender.id, attacker.current_hp, attacker.current_mp, defender.current_hp, defender.current_mp, spawnId, delivery.scope, delivery.targetId, delivery.botId ?? null]);
  await initializeCombatDeviceEnergy(connection, id, Number(attacker.id), 'pvp'); await initializeCombatDeviceEnergy(connection, id, Number(defender.id), 'pvp');
  await createPvpBattleLog(connection, attacker, defender, '伏击', id);
  return { target: defender.name };
});

export const pvpBattleStatus = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId); const battle = await activePvpBattle(connection, Number(character.id), true); if (!battle) throw new Error('当前不在玩家对战中。'); return sessionView(connection, battle, character);
});

export const selectPvpBattleOption = async (qqUserId: string, option: { element?: string; targetId?: number; side?: 'member' | 'target' }) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId); const battle = await activePvpBattle(connection, Number(character.id), true);
  if (!battle) throw new Error('当前不在玩家对战中。');
  const ownAttacker = Number(character.id) === Number(battle.attacker_character_id);
  const column = ownAttacker ? 'attacker_cooldowns' : 'defender_cooldowns';
  const cooldowns = record(battle[column]);
  if (option.element) {
    if (!['风', '雷', '火'].includes(option.element)) throw new Error('附锋元素只能选择风、雷或火。');
    cooldowns.__enchantElement = option.element;
  }
  if (option.targetId !== undefined) {
    const expected = option.side === 'member' ? Number(character.id) : Number(ownAttacker ? battle.defender_character_id : battle.attacker_character_id);
    if (option.targetId !== expected) throw new Error('该目标不在本场对战中。');
    if (option.side === 'member') cooldowns.__selectedAlly = expected; else delete cooldowns.__selectedAlly;
  }
  await connection.execute(`UPDATE player_pvp_battle_sessions SET ${column}=? WHERE id=?`, [JSON.stringify(cooldowns), battle.id]);
  battle[column] = cooldowns; return sessionView(connection, battle, character);
});

/** 已付费的吟唱自动推进，不读取或修改发起者的自动战斗设置。 */
export const continuePvpChant = async (qqUserId: string) => {
  const pool = await getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT b.attacker_cooldowns FROM player_pvp_battle_sessions b JOIN characters c ON c.id=b.attacker_character_id JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND b.state='active' LIMIT 1`, [qqUserId]);
  if (!readRuleState(record(rows[0]?.attacker_cooldowns).__rules).cast) return null;
  return pvpCombatAction(qqUserId, 'auto', undefined, undefined, undefined, true);
};

export const pvpCombatAction = async (qqUserId: string, type: 'attack' | 'skill' | 'item' | 'escape' | 'auto' | 'device', slot?: number, deviceSkillCode?: string, targetKind?: 'member' | 'target', automaticChant = false, skillId?: number, hiddenTicket?: HiddenTicket) => withTransaction(async connection => {
  const requester = await characterFor(connection, qqUserId); const battle = await activePvpBattle(connection, Number(requester.id), true); if (!battle) throw new Error('当前不在玩家对战中。');
  if (Number(requester.id) !== Number(battle.attacker_character_id)) throw new Error('对方正在发起攻击，你会按 PVP 自动战斗配置进行反击。');
  if (type === 'escape') { await connection.execute("UPDATE player_pvp_battle_sessions SET state='escaped' WHERE id=?", [battle.id]); await finishPvpBattleLog(connection, battle.id, 'escaped'); return { ended: true, log: `战斗<${battle.turn_no}>回合\n➤【${requester.name}】撤离了战斗。`, settlement: '你脱离了玩家对战。', requesterId: Number(requester.id), winnerId: null, winnerName: null }; }
  const [fighters] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE id IN (?,?) ORDER BY id FOR UPDATE', [battle.attacker_character_id, battle.defender_character_id]);
  const attacker = fighters.find(row => Number(row.id) === Number(battle.attacker_character_id)); const defender = fighters.find(row => Number(row.id) === Number(battle.defender_character_id)); if (!attacker || !defender) throw new Error('对战对象已失效。');
  attacker.current_hp = Number(battle.attacker_hp); attacker.current_mp = Number(battle.attacker_mp); defender.current_hp = Number(battle.defender_hp); defender.current_mp = Number(battle.defender_mp);
  const attackerCooldowns = record(battle.attacker_cooldowns); const defenderCooldowns = record(battle.defender_cooldowns);
  const [attackerDevices, defenderDevices] = await Promise.all([activeDeviceCodesFor(connection, Number(attacker.id)), activeDeviceCodesFor(connection, Number(defender.id))]);
  const bonusPhase = Boolean(attackerCooldowns.__bonusPhase);
  const ownCasting = readRuleState(attackerCooldowns.__rules).cast;
  const queuedChants = new Set([attacker, defender].filter(f => readRuleState((Number(f.id) === Number(attacker.id) ? attackerCooldowns : defenderCooldowns).__rules).cast).map(f => Number(f.id)));
  if (ownCasting && !automaticChant && type !== 'auto') throw new Error('你正在吟唱，技能将自动释放。');
  if (!bonusPhase && attackerDevices.has('rocket_propeller')) attackerCooldowns.device_rocket_boost = Math.min(100, Number(attackerCooldowns.device_rocket_boost ?? 0) + 10);
  if (!bonusPhase && defenderDevices.has('rocket_propeller')) defenderCooldowns.device_rocket_boost = Math.min(100, Number(defenderCooldowns.device_rocket_boost ?? 0) + 10);
  const log: string[] = []; let ended = false; let winnerId: number | null = null; let winnerName: string | null = null; let restitutionId: string | undefined; let settlement = ''; let lootText: string | null = null;
  const context = await createPvpCombatRules(connection, [attacker, defender], [attackerCooldowns, defenderCooldowns], Number(battle.turn_no), log, unit => { if (!bonusPhase) unit.cooldowns.__bonusAction = 1; });
  const frozenAction = (id: number): PvpAction | undefined => {
    const cast = context.get(id).state.cast; const skill = cast && residentSkillByCode(cast.code);
    if (cast?.action) return { ...(cast.action as Extract<PvpAction, { type: 'skill' }>), manaCost: 0 };
    return skill && cast ? { type: 'skill', id: cast.skillId, code: skill.code, name: skill.name, category: skill.category as 'physical' | 'magic' | 'utility', requiredWeaponType: null, manaCost: 0, power: skill.power, cooldown: cast.cooldown } : undefined;
  };
  const requestedAction = frozenAction(Number(attacker.id)) ?? (type === 'device'
    ? await deviceActionFromSlot(connection, battle.id, attacker, attackerCooldowns, Number(slot), deviceSkillCode, targetKind)
    : await battleActionFromSlot(connection, attacker, type, slot, skillId));
  const effectiveSpeed = (fighter: PvpCharacter, state: PvpDeviceState) => context.rule.speed(context.get(Number(fighter.id))) * (1 + Number(state.device_rocket_boost ?? 0) / 100) * (1 - (Number(state.device_slow ?? 0) > 0 ? .3 : 0));
  const orderedTurns = [
    { actor: attacker, target: defender, cooldowns: attackerCooldowns, targetCooldowns: defenderCooldowns, devices: attackerDevices, targetDevices: defenderDevices, automatic: type === 'auto', extra: bonusPhase },
    { actor: defender, target: attacker, cooldowns: defenderCooldowns, targetCooldowns: attackerCooldowns, devices: defenderDevices, targetDevices: attackerDevices, automatic: true, extra: false }
  ].filter(turn => !bonusPhase || Number(turn.actor.id) === Number(attacker.id)).sort((a, b) => effectiveSpeed(b.actor, b.cooldowns) - effectiveSpeed(a.actor, a.cooldowns));
  hiddenReorder(context.rule, orderedTurns, entry => context.get(Number(entry.actor.id)), bonusPhase);
  for (const turn of orderedTurns) {
    if (ended || Number(turn.actor.current_hp) <= 0 || Number(turn.target.current_hp) <= 0) break;
    const unit = context.get(Number(turn.actor.id)); const target = context.get(Number(turn.target.id));
    if (turn.extra) { delete turn.cooldowns.__bonusAction; turn.cooldowns.__extraTurn = 1; } else delete turn.cooldowns.__extraTurn;
    for (const fighter of context.rule.units) fighter.castSpecialization = undefined;
    if (!await context.rule.beforeAction(unit)) continue;
    if (Number(turn.cooldowns.device_stun ?? 0) > 0) { log.push(actionLog(`【${turn.actor.name}】被眩晕，无法行动。`)); continue; }
    const casting = unit.state.cast;
    if (queuedChants.has(Number(turn.actor.id)) && !casting) { queuedChants.delete(Number(turn.actor.id)); log.push(`➤【${unit.name}】的吟唱已被打断，本次行动结束。`); continue; }
    queuedChants.delete(Number(turn.actor.id));
    let rawAction = frozenAction(Number(turn.actor.id)) ?? (Number(turn.actor.id) === Number(attacker.id) ? requestedAction : await actionFor(connection, turn.actor));
    if (rawAction?.type === 'skill' && !casting) {
      const [definitions] = await connection.execute<RowDataPacket[]>('SELECT code,category,tier,power,mana_cost,cooldown_turns,chant_turns FROM skill_definitions WHERE id=?', [rawAction.id]);
      const [levels] = await connection.execute<RowDataPacket[]>('SELECT specialization,level FROM player_skill_specializations WHERE character_id=? AND skill_id=?', [turn.actor.id, rawAction.id]);
      const row = definitions[0];
      if (row) {
        const specialized = skillSpecialization({ code: String(row.code), category: String(row.category), tier: String(row.tier), power: Number(row.power), mana_cost: Number(row.mana_cost), cooldown_turns: Number(row.cooldown_turns), chant_turns: Number(row.chant_turns) }, Object.fromEntries(levels.map(level => [level.specialization, Number(level.level)])));
        rawAction = { ...rawAction, power: specialized.power, manaCost: specialized.mana, cooldown: specialized.cooldown, chant: specialized.chant, specialized };
      }
      const blocked = context.rule.status(unit, 'silence') || residentSkillByCode(rawAction.code)?.category === 'passive';
      if (blocked) { if (!turn.automatic) throw new Error('沉默期间不能使用技能，或所选技能为被动。'); rawAction = { type: 'attack' }; }
      else rawAction = { ...rawAction, manaCost: context.rule.manaCost(unit, Math.ceil(rawAction.manaCost * (unit.state.memory.debtSkill === rawAction.code ? 1.4 : 1))) };
    }
    let hiddenExecuted = false;
    if (rawAction?.type === 'skill' && isHiddenSkill(rawAction.code)) {
      try {
        const hiddenContext = await hiddenBattleContext(connection, Number(turn.actor.id), battle.id, 'pvp');
        const automaticChoice = hiddenContext.autoChoice(rawAction.code);
        if (turn.automatic && !automaticChoice) throw new HiddenBattleError('尚未配置该隐藏技能的自动选择。');
        const selected = turn.automatic ? automaticChoice! : await submitHiddenDraft(connection, Number(turn.actor.id), battle.id, Number(battle.turn_no), 'pvp', rawAction.code, hiddenTicket);
        unit.castSpecialization = rawAction.specialized;
        hiddenExecuted = await executeHiddenCombat(context.rule, unit, rawAction.code, selected, hiddenContext);
      } catch (error) { if (!turn.automatic || !(error instanceof HiddenBattleError)) throw error; log.push('　➥隐藏技能条件不足，改用普通攻击。'); rawAction = { type: 'attack' }; }
    }
    if (!hiddenExecuted) {
    const action = await readyBattleAction(connection, turn.actor, rawAction, turn.cooldowns, turn.automatic);
    if (action.type === 'skill') {
      const resident = residentSkillByCode(action.code);
      if (resident && ['D01', 'C06', 'F04', 'I04'].includes(resident.id)) { if (turn.automatic) { log.push('➤【' + unit.name + '】缺少可支援队友，放弃本次辅助。'); continue; } throw new Error('这项技能需要另一名存活友方，不能在单挑中使用。'); }
      const paid = casting?.paid ?? action.manaCost;
      const cooldown = casting?.cooldown ?? action.cooldown + (unit.state.memory.debtSkill === action.code ? 2 : 0);
      if (!casting) { unit.mp -= paid; await context.rule.paid(unit, paid, { category: action.category, cooldown }); delete unit.state.memory.debtSkill; }
      const chant = casting ? 0 : await consumeAlchemyChant(context.rule,unit,action.chant ?? resident?.chant ?? 0);
      if (chant && !casting) { unit.state.cast = { code: action.code, skillId: action.id, paid, target: target.key, cooldown, releaseTurn: Number(battle.turn_no) + chant, action }; log.push('【' + unit.name + '】开始了' + action.name + '技能吟唱。。。'); continue; }
      if (casting && casting.releaseTurn > Number(battle.turn_no)) { log.push('【' + unit.name + '】继续吟唱。。。'); continue; }
      delete unit.state.cast; turn.cooldowns[action.code] = cooldown + 1;
      unit.castSpecialization = action.specialized;
      if (resident) {
        const hpBefore = target.hp;
        await context.rule.cast(unit, ['ally', 'self', 'allies'].includes(resident.scope) ? unit : target, resident, paid, String(turn.cooldowns.__enchantElement ?? '风'), turn.extra);
        await recordPvpAttack(connection, turn.actor, turn.target, '技能「' + resident.name + '」', Math.max(0, hpBefore - target.hp), target.hp <= 0 ? 'defeat' : 'utility');
      } else {
        const result = await resolveAction(connection, turn.actor, turn.target, { ...action, manaCost: 0 }, battle.id, turn.targetCooldowns, turn.cooldowns, turn.devices, turn.targetDevices, context);
        log.push(actionLog(result.text));
      }
    } else {
      if (action.type === 'device' && action.skill.effect === 'physical_evade_once') turn.cooldowns.device_physical_evasion = 2;
      const beforeHiddenDevice = hiddenDeviceSnapshot(context.rule);
      const result = await resolveAction(connection, turn.actor, turn.target, action, battle.id, turn.targetCooldowns, turn.cooldowns, turn.devices, turn.targetDevices, context);
      if (action.type === 'device') hiddenNativeDevice(context.rule,unit,action.skill,beforeHiddenDevice);
      if (action.type === 'device') turn.cooldowns[`device_${action.instanceId}_${action.skill.code}`] = action.skill.cooldownTurns + 1;
      log.push(actionLog(result.text));
    }
    }
    if (Number(attacker.current_hp) <= 0 || Number(defender.current_hp) <= 0) {
      const winner = Number(attacker.current_hp) <= 0 ? defender : attacker; const loser = winner === attacker ? defender : attacker;
      // 反射/混乱可能击倒出手者，因此胜者不能按当前行动者推断。
      winner.current_hp = Math.max(1, Number(winner.current_hp));
      const result = await resolvePvpVictory(connection, winner.id, loser.id);
      ended = true; winnerId = Number(winner.id); winnerName = winner.name; restitutionId = result.restitution?.id;
      settlement = `【${winner.name}】获得了胜利。\n${result.text}`; lootText = result.lootText ?? null;
    }
    if (!turn.extra && Number(turn.actor.id) === Number(defender.id) && turn.cooldowns.__bonusAction) orderedTurns.push({ ...turn, extra: true });
  }
  const awaitingBonus = !ended && Boolean(attackerCooldowns.__bonusAction);
  if (awaitingBonus) { attackerCooldowns.__bonusPhase = 1; log.push('【' + attacker.name + '】获得额外行动，请选择一次普攻或技能。'); }
  else {
    delete attackerCooldowns.__bonusPhase;
    if(!ended) { await alchemyEndTurn(context.rule); await hiddenEndTurn(context.rule); }
    context.rule.end();
    if(!ended&&(Number(attacker.current_hp)<=0||Number(defender.current_hp)<=0)){
      const winner=Number(attacker.current_hp)<=0?defender:attacker;const loser=winner===attacker?defender:attacker;winner.current_hp=Math.max(1,Number(winner.current_hp));
      const result=await resolvePvpVictory(connection,winner.id,loser.id);ended=true;winnerId=Number(winner.id);winnerName=winner.name;restitutionId=result.restitution?.id;
      settlement=`【${winner.name}】获得了胜利。\n${result.text}`;lootText=result.lootText??null;
    }
  }
  const nextAttackerCooldowns = awaitingBonus ? attackerCooldowns : tickCooldowns(attackerCooldowns); const nextDefenderCooldowns = awaitingBonus ? defenderCooldowns : tickCooldowns(defenderCooldowns);
  await connection.execute(`UPDATE player_pvp_battle_sessions SET attacker_hp=?,attacker_mp=?,defender_hp=?,defender_mp=?,attacker_cooldowns=?,defender_cooldowns=?,turn_no=turn_no+?,state=? WHERE id=?`, [Math.max(0, Number(attacker.current_hp)), Math.max(0, Number(attacker.current_mp)), Math.max(0, Number(defender.current_hp)), Math.max(0, Number(defender.current_mp)), JSON.stringify(nextAttackerCooldowns), JSON.stringify(nextDefenderCooldowns), awaitingBonus ? 0 : 1, ended ? (winnerId === Number(attacker.id) ? 'attacker_win' : 'defender_win') : 'active', battle.id]);
  if (!ended) {
    await connection.execute('UPDATE characters SET current_hp=?,current_mp=? WHERE id=?', [Math.max(0, Number(attacker.current_hp)), Math.max(0, Number(attacker.current_mp)), attacker.id]);
    await connection.execute('UPDATE characters SET current_hp=?,current_mp=? WHERE id=?', [Math.max(0, Number(defender.current_hp)), Math.max(0, Number(defender.current_mp)), defender.id]);
  }
  else if (winnerId === Number(attacker.id)) await connection.execute('UPDATE characters SET current_hp=?,current_mp=? WHERE id=?', [Math.max(1, Number(attacker.current_hp)), Math.max(0, Number(attacker.current_mp)), attacker.id]);
  else if (winnerId === Number(defender.id)) await connection.execute('UPDATE characters SET current_hp=?,current_mp=? WHERE id=?', [Math.max(1, Number(defender.current_hp)), Math.max(0, Number(defender.current_mp)), defender.id]);
  if (ended) await finishPvpBattleLog(connection, battle.id, winnerId === Number(attacker.id) ? 'attacker_win' : 'defender_win', winnerId === Number(attacker.id) ? attacker : defender, lootText);
  const ambushDelivery = battle.ambush_spawn_id ? { scope: battle.ambush_delivery_scope === 'group' ? 'group' as const : 'c2c' as const, targetId: battle.ambush_delivery_target_id || '', botId: battle.ambush_delivery_bot_id || undefined } : undefined;
  const hiddenNames = context.rule.units.filter(unit => Number(unit.key.split(':')[1]) !== Number(requester.id) && unit.state.memory.hiddenLogTurn === Number(battle.turn_no)).map(unit => unit.name);
  log.splice(0, log.length, ...maskRuleBattleLog(log, hiddenNames, [requester.name]));
  return { ended, log: `战斗<${battle.turn_no}>回合\n${log.join('\n————————\n')}`, settlement, restitutionId, requesterId: Number(requester.id), winnerId, winnerName, ambushSpawnId: battle.ambush_spawn_id ? Number(battle.ambush_spawn_id) : undefined, ambushDelivery };
});

export const restitutionDetail = async (qqUserId: string, restitutionId: string) => {
  const pool = await getPool();
  const [characterRows] = await pool.execute<(RowDataPacket & { id: number })[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1', [qqUserId]);
  const character = characterRows[0]; if (!character) throw new Error('请先注册角色。');
  const [rows] = await pool.execute<(RowDataPacket & { original_owner_character_id: number; owner_name: string; item_name: string | null; quantity: number; held_quantity: number; sold_quantity: number; copper_amount: number; sale_copper_amount: number; restitution_charged_copper: number; restitution_debt_copper: number })[]>(`SELECT sl.*,o.name AS owner_name,i.name AS item_name FROM pvp_stolen_loot sl
    JOIN characters o ON o.id=sl.original_owner_character_id LEFT JOIN item_definitions i ON i.id=sl.item_id
    WHERE sl.restitution_id=? AND (sl.holder_character_id=? OR sl.original_owner_character_id=? OR EXISTS (SELECT 1 FROM player_warrants w WHERE w.captured_by_character_id=? AND w.wanted_character_id=sl.holder_character_id))
    ORDER BY sl.id`, [restitutionId, character.id, character.id, character.id]);
  if (!rows.length) throw new Error('未找到这份失物返还记录。');
  return rows.map(row => ({ owner: row.owner_name, name: row.item_name, quantity: Number(row.quantity), held: Number(row.held_quantity), sold: Number(row.sold_quantity), coins: Number(row.copper_amount), sale: Number(row.sale_copper_amount), charged: Number(row.restitution_charged_copper), debt: Number(row.restitution_debt_copper) }));
};

export const cityWantedAlert = async (qqUserId: string) => {
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string; game_id: number; pos_x: number; pos_y: number; region_name: string })[]>(`SELECT w.id,c.name,c.game_id,c.pos_x,c.pos_y,r.name AS region_name FROM characters c
    JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id
    JOIN player_warrants w ON w.wanted_character_id=c.id AND w.city_region_id=c.current_region_id AND w.status='active'
    WHERE p.qq_user_id=? AND r.code='baina_town' LIMIT 1`, [qqUserId]);
  return rows[0] ? { warrantId: Number(rows[0].id), name: rows[0].name, gameId: Number(rows[0].game_id), x: Number(rows[0].pos_x), y: Number(rows[0].pos_y), regionName: rows[0].region_name } : null;
};

/** 百纳镇居民发言时可被动获知的、正暴露行踪的其他通缉者。 */
export const townPassiveWantedAlert = async (qqUserId: string) => {
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string; game_id: number; pos_x: number; pos_y: number; region_name: string })[]>(`SELECT w.id,c.name,c.game_id,c.pos_x,c.pos_y,r.name AS region_name
    FROM players viewer_player JOIN characters viewer ON viewer.player_id=viewer_player.id
    JOIN player_warrants w ON w.status='active' AND w.city_region_id=viewer.current_region_id
    JOIN characters c ON c.id=w.wanted_character_id AND c.current_region_id=w.city_region_id
    JOIN map_regions r ON r.id=w.city_region_id
    WHERE viewer_player.qq_user_id=? AND r.code='baina_town' AND c.id<>viewer.id
    ORDER BY w.created_at DESC LIMIT 1`, [qqUserId]);
  return rows[0] ? { warrantId: Number(rows[0].id), name: rows[0].name, gameId: Number(rows[0].game_id), x: Number(rows[0].pos_x), y: Number(rows[0].pos_y), regionName: rows[0].region_name } : null;
};

const futureCooldown = (value: unknown) => value ? new Date(String(value)).getTime() > Date.now() : false;

/** 入城主动通报：每张通缉令在每个群内独立冷却十分钟。 */
export const reserveWarrantEntryNotice = async (warrantId: number, groupOpenId: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & { available_at: Date | string; updated_at: Date | string })[]>('SELECT available_at,updated_at FROM player_warrant_notice_cooldowns WHERE notice_type=\'entry\' AND warrant_id=? AND group_openid=? AND recipient_qq_user_id=\'\' FOR UPDATE', [warrantId, groupOpenId]);
  // 早期版本曾将入城广播写成一小时冷却；以最近广播时间计算，旧记录也立即遵从十分钟规则。
  if (rows[0] && new Date(rows[0].updated_at).getTime() + 10 * 60 * 1000 > Date.now()) return false;
  await connection.execute(`INSERT INTO player_warrant_notice_cooldowns (notice_type,warrant_id,group_openid,recipient_qq_user_id,available_at)
    VALUES ('entry',?,?,'',DATE_ADD(NOW(),INTERVAL 10 MINUTE))
    ON DUPLICATE KEY UPDATE available_at=VALUES(available_at)`, [warrantId, groupOpenId]);
  return true;
});

/** 被动提示：同一玩家一小时一次，同群不同玩家合计一分钟一次。 */
export const reservePassiveWarrantNotice = async (warrantId: number, groupOpenId: string, recipientQqUserId: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & { notice_type: 'passive_player' | 'passive_group'; available_at: Date | string })[]>(`SELECT notice_type,available_at FROM player_warrant_notice_cooldowns
    WHERE warrant_id=? AND ((notice_type='passive_player' AND group_openid='' AND recipient_qq_user_id=?) OR (notice_type='passive_group' AND group_openid=? AND recipient_qq_user_id='')) FOR UPDATE`, [warrantId, recipientQqUserId, groupOpenId]);
  if (rows.some(row => futureCooldown(row.available_at))) return false;
  await connection.execute(`INSERT INTO player_warrant_notice_cooldowns (notice_type,warrant_id,group_openid,recipient_qq_user_id,available_at) VALUES
    ('passive_player',?,'',?,DATE_ADD(NOW(),INTERVAL 1 HOUR)),
    ('passive_group',?,?,'',DATE_ADD(NOW(),INTERVAL 1 MINUTE))
    ON DUPLICATE KEY UPDATE available_at=VALUES(available_at)`, [warrantId, recipientQqUserId, warrantId, groupOpenId]);
  return true;
});

export const playerPvpStatus = async (qqUserId: string) => {
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { wanted: number; detained_until: Date | null })[]>(`SELECT c.detained_until,
    EXISTS(SELECT 1 FROM player_warrants w WHERE w.wanted_character_id=c.id AND w.status='active') AS wanted
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1`, [qqUserId]);
  const row = rows[0];
  return { wanted: Boolean(row?.wanted), detainedUntil: row?.detained_until ?? null };
};

/** PvP 面板只展示当前玩家自身涉及的城镇通缉。 */
export const personalPvpPanel = async (qqUserId: string) => {
  const pool = await getPool();
  const [characters] = await pool.execute<(RowDataPacket & { id: number; name: string; game_id: number; detained_until: Date | null })[]>(`SELECT c.id,c.name,c.game_id,c.detained_until
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1`, [qqUserId]);
  const character = characters[0]; if (!character) throw new Error('请先注册角色。');
  const [warrants] = await pool.execute<(RowDataPacket & { id: number; region_name: string; created_at: Date; victim_count: number })[]>(`SELECT w.id,r.name AS region_name,w.created_at,
    (SELECT COUNT(*) FROM player_warrant_victims v WHERE v.warrant_id=w.id) AS victim_count
    FROM player_warrants w JOIN map_regions r ON r.id=w.city_region_id
    WHERE w.wanted_character_id=? AND w.status='active' ORDER BY w.created_at DESC`, [character.id]);
  const [battles] = await pool.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM player_pvp_battle_logs WHERE attacker_character_id=? OR defender_character_id=?', [character.id, character.id]);
  return { name: character.name, gameId: Number(character.game_id), detainedUntil: character.detained_until, battleCount: Number(battles[0]?.total ?? 0), warrants: warrants.map(row => ({ id: Number(row.id), regionName: row.region_name, createdAt: row.created_at, victims: Number(row.victim_count) })) };
};

/** 仅列出直接攻击过自己、且仍持有未被正义执行返还赃物的玩家。 */
export const personalPvpEnemies = async (qqUserId: string) => {
  const pool = await getPool();
  const [characters] = await pool.execute<(RowDataPacket & { id: number })[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1', [qqUserId]);
  const character = characters[0]; if (!character) throw new Error('请先注册角色。');
  const [rows] = await pool.execute<(RowDataPacket & { holder_id: number; holder_name: string; holder_game_id: number; attack_count: number; loot_text: string; warrant_id: number | null; warrant_cities: string | null })[]>(`SELECT holder.id AS holder_id,holder.name AS holder_name,holder.game_id AS holder_game_id,
    (SELECT COUNT(*) FROM player_pvp_attack_logs al WHERE al.attacker_character_id=holder.id AND al.defender_character_id=?) AS attack_count,
    GROUP_CONCAT(DISTINCT CASE WHEN sl.item_id IS NULL THEN CONCAT('铜币×',sl.copper_amount+sl.sale_copper_amount) ELSE CONCAT('【',i.name,'】×',sl.quantity) END ORDER BY sl.id SEPARATOR '、') AS loot_text,
    MAX(w.id) AS warrant_id,GROUP_CONCAT(DISTINCT region.name ORDER BY region.name SEPARATOR '、') AS warrant_cities
    FROM pvp_stolen_loot sl JOIN characters holder ON holder.id=sl.holder_character_id
    LEFT JOIN item_definitions i ON i.id=sl.item_id
    LEFT JOIN player_warrants w ON w.wanted_character_id=holder.id AND w.status='active'
    LEFT JOIN map_regions region ON region.id=w.city_region_id
    WHERE sl.original_owner_character_id=? AND sl.returned_at IS NULL
      AND EXISTS (SELECT 1 FROM player_pvp_attack_logs al WHERE al.attacker_character_id=holder.id AND al.defender_character_id=?)
    GROUP BY holder.id,holder.name,holder.game_id ORDER BY attack_count DESC,holder.id`, [character.id, character.id, character.id]);
  return rows.map(row => ({ id: Number(row.holder_id), name: row.holder_name, gameId: Number(row.holder_game_id), attacks: Number(row.attack_count), loot: row.loot_text, warrantId: row.warrant_id === null ? null : Number(row.warrant_id), warrantCities: row.warrant_cities }));
};

export const warrantsFor = async () => {
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string; game_id: number; region_name: string; pos_x: number; pos_y: number; exposed: number; reward_copper: number; reward_items: number })[]>(`SELECT w.id,c.name,c.game_id,r.name AS region_name,c.pos_x,c.pos_y,
    (c.current_region_id=w.city_region_id) AS exposed,
    COALESCE(SUM(CASE WHEN wr.claimed_at IS NULL THEN wr.copper_amount ELSE 0 END),0) AS reward_copper,
    COALESCE(SUM(CASE WHEN wr.claimed_at IS NULL THEN wr.quantity ELSE 0 END),0) AS reward_items
    FROM player_warrants w JOIN characters c ON c.id=w.wanted_character_id JOIN map_regions r ON r.id=w.city_region_id
    LEFT JOIN player_warrant_rewards wr ON wr.warrant_id=w.id
    WHERE w.status='active' GROUP BY w.id,c.id,r.id ORDER BY w.created_at DESC`);
  return rows.map(row => ({ id: Number(row.id), name: row.name, gameId: Number(row.game_id), regionName: row.region_name, x: Number(row.pos_x), y: Number(row.pos_y), exposed: Boolean(row.exposed), copper: Number(row.reward_copper), items: Number(row.reward_items) }));
};

export const townWarrantsFor = async (qqUserId: string, filter: '已暴露' | '近期露面' | '无行踪' | '全部' = '全部') => {
  const pool = await getPool();
  const [viewerRows] = await pool.execute<(RowDataPacket & { region_id: number; region_name: string; region_code: string })[]>(`SELECT c.current_region_id AS region_id,r.name AS region_name,r.code AS region_code
    FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id WHERE p.qq_user_id=? LIMIT 1`, [qqUserId]);
  const viewer = viewerRows[0]; if (!viewer) throw new Error('请先注册角色。');
  if (viewer.region_code !== 'baina_town') throw new Error('请先前往城镇，再查看当地的通缉令。');
  const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string; region_name: string; current_region_id: number; pos_x: number; pos_y: number; last_seen_at: Date | null; last_seen_x: number | null; last_seen_y: number | null; victim_count: number; pursuit_defeats: number; reward_copper: number; reward_items: string | null })[]>(`SELECT w.id,c.name,r.name AS region_name,c.current_region_id,c.pos_x,c.pos_y,w.last_seen_at,w.last_seen_x,w.last_seen_y,w.pursuit_defeats,
    COALESCE(v.victim_count,0) AS victim_count,COALESCE(rw.reward_copper,0) AS reward_copper,rw.reward_items
    FROM player_warrants w JOIN characters c ON c.id=w.wanted_character_id JOIN map_regions r ON r.id=w.city_region_id
    LEFT JOIN (SELECT warrant_id,COUNT(*) AS victim_count FROM player_warrant_victims GROUP BY warrant_id) v ON v.warrant_id=w.id
    LEFT JOIN (SELECT wr.warrant_id,SUM(CASE WHEN wr.claimed_at IS NULL THEN wr.copper_amount ELSE 0 END) AS reward_copper,
      GROUP_CONCAT(DISTINCT CASE WHEN wr.claimed_at IS NULL AND wi.name IS NOT NULL THEN CONCAT(wi.name,'×',wr.quantity) END ORDER BY wi.id SEPARATOR '｜') AS reward_items
      FROM player_warrant_rewards wr LEFT JOIN item_definitions wi ON wi.id=wr.reward_item_id GROUP BY wr.warrant_id) rw ON rw.warrant_id=w.id
    WHERE w.status='active' AND w.city_region_id=?
    ORDER BY (c.current_region_id=w.city_region_id) DESC,(w.last_seen_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)) DESC,w.last_seen_at DESC,w.created_at DESC`, [viewer.region_id]);
  const mapped = rows.map(row => {
    const exposed = Number(row.current_region_id) === Number(viewer.region_id);
    const recent = !exposed && row.last_seen_at !== null && new Date(row.last_seen_at).getTime() >= Date.now() - 24 * 60 * 60 * 1000;
    const victims = Math.max(1, Number(row.victim_count));
    const baseStars = victims >= 15 ? 5 : victims >= 10 ? 4 : victims >= 6 ? 3 : victims >= 3 ? 2 : 1;
    const pursuitTier = baseStars + Number(row.pursuit_defeats);
    const stars = Math.min(5, pursuitTier); const skulls = Math.max(0, Math.min(5, pursuitTier - 5));
    return { id: Number(row.id), name: row.name, regionName: row.region_name, x: exposed ? Number(row.pos_x) : Number(row.last_seen_x ?? 0), y: exposed ? Number(row.pos_y) : Number(row.last_seen_y ?? 0), exposed, recent, stars, skulls, copper: Number(row.reward_copper), items: row.reward_items ?? '' };
  });
  return { regionName: viewer.region_name, warrants: filter === '全部' ? mapped : mapped.filter(warrant => filter === '已暴露' ? warrant.exposed : filter === '近期露面' ? warrant.recent : !warrant.exposed && !warrant.recent) };
};

/** 仅返回正身处其被通缉城镇、可被公开追踪的目标。 */
export const exposedWarrantsFor = async () => (await warrantsFor()).filter(warrant => warrant.exposed);

export const addWarrantReward = async (qqUserId: string, warrantId: number, itemId: number | null, quantity: number, copper: number) => withTransaction(async connection => {
  const issuer = await characterFor(connection, qqUserId); const [warrants] = await connection.execute<(RowDataPacket & { wanted_character_id: number })[]>('SELECT wanted_character_id FROM player_warrants WHERE id=? AND status=\'active\' FOR UPDATE', [warrantId]); const warrant = warrants[0]; if (!warrant) throw new Error('该通缉令已失效。');
  const [eligible] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM pvp_stolen_loot WHERE original_owner_character_id=? AND holder_character_id=? AND returned_at IS NULL LIMIT 1 FOR UPDATE', [issuer.id, warrant.wanted_character_id]);
  if (!eligible[0]) throw new Error('只有被该通缉者夺走失物的玩家可以追加赏金。');
  if (copper > 0) { const [spent] = await connection.execute<any>('UPDATE characters SET copper_coins=copper_coins-? WHERE id=? AND copper_coins>=?', [copper, issuer.id, copper]); if (!Number(spent.affectedRows)) throw new Error('铜币不足。'); }
  if (itemId) { const [items] = await connection.execute<(RowDataPacket & { quantity: number; name: string })[]>('SELECT pi.quantity,i.name FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.item_id=? AND i.is_tradeable=1 FOR UPDATE', [issuer.id, itemId]); if (!items[0] || Number(items[0].quantity) < quantity) throw new Error('用于悬赏的物品数量不足或不可交易。'); await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [quantity, issuer.id, itemId]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [issuer.id, itemId]); }
  await connection.execute('INSERT INTO player_warrant_rewards (warrant_id,issuer_character_id,reward_item_id,quantity,copper_amount) VALUES (?,?,?,?,?)', [warrantId, issuer.id, itemId, quantity, copper]);
  return { copper, quantity };
});
