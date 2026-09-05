import { getPool } from '../database/pool.js';
import { auditCharacter, auditInventory, auditSkills, auditPlayerState } from './admin-audit.service.js';
import { setGlobalMultiplier } from './global-management.service.js';
import { webOperationJournal, recordWebOperation } from './operation-journal.service.js';
import { systemStatusSnapshot } from './system-status.service.js';

const pageOf = (value) => Math.max(1, Math.min(10_000, Math.floor(Number(value) || 1)));
const asText = (value, max = 80) => String(value ?? '').trim().slice(0, max);
const adminDashboard = async () => {
    const pool = await getPool();
    const status = await systemStatusSnapshot();
    const [rows] = await pool.execute(`SELECT
    (SELECT COUNT(*) FROM characters WHERE npc_code IS NULL) AS players,
    (SELECT COUNT(*) FROM operation_journals WHERE created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)) AS operations,
    (SELECT COUNT(*) FROM monitor_alerts WHERE status<>'resolved') AS alerts`);
    return { system: status, players: Number(rows[0]?.players ?? 0), operationsToday: Number(rows[0]?.operations ?? 0), openAlerts: Number(rows[0]?.alerts ?? 0) };
};
const adminPlayers = async (filters = {}) => {
    const page = pageOf(filters.page);
    const keyword = asText(filters.keyword);
    const region = asText(filters.region, 64);
    const activity = asText(filters.activity, 32);
    const status = asText(filters.status, 32);
    const where = ['c.npc_code IS NULL'];
    const values = [];
    if (keyword) {
        where.push('(c.name LIKE ? OR p.qq_user_id LIKE ? OR p.qq_nickname LIKE ?)');
        values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (region) {
        where.push('r.code=?');
        values.push(region);
    }
    if (activity) {
        where.push('c.activity_status=?');
        values.push(activity);
    }
    if (status) {
        where.push('p.status=?');
        values.push(status);
    }
    const clause = `WHERE ${where.join(' AND ')}`;
    const pool = await getPool();
    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id ${clause}`, values);
    const total = Number(countRows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / 30));
    const safePage = Math.min(page, totalPages);
    const [rows] = await pool.execute(`SELECT c.id AS character_id,p.id AS player_id,p.qq_user_id,p.qq_nickname,p.status AS player_status,c.name,c.level,c.realm_stage,c.copper_coins,c.activity_status,r.code AS region_code,r.name AS region_name,c.updated_at
    FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id ${clause}
    ORDER BY c.updated_at DESC,c.id DESC LIMIT 30 OFFSET ?`, [...values, (safePage - 1) * 30]);
    return { page: safePage, total, totalPages, entries: rows.map(row => ({ characterId: Number(row.character_id), playerId: Number(row.player_id), qqUserId: row.qq_user_id, nickname: row.qq_nickname, status: row.player_status, name: row.name, level: Number(row.level), realmStage: Number(row.realm_stage), copper: Number(row.copper_coins), activity: row.activity_status, region: { code: row.region_code, name: row.region_name }, updatedAt: row.updated_at })) };
};
const adminPlayerDetail = async (characterId) => {
    const pool = await getPool();
    const [characters] = await pool.execute(`SELECT c.id,c.player_id,p.qq_user_id,p.qq_nickname,p.status AS player_status,c.name,c.gender,c.level,c.experience,c.realm_stage,c.skill_points,c.copper_coins,c.current_hp,c.hp_max,c.current_mp,c.mp_max,c.activity_status,c.profession_code,c.secondary_profession_code,r.code AS region_code,r.name AS region_name,c.pos_x,c.pos_y,c.pos_z,c.updated_at
    FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id WHERE c.id=? AND c.npc_code IS NULL LIMIT 1`, [characterId]);
    const character = characters[0];
    if (!character)
        throw new Error('未找到玩家角色。');
    const [inventory, equipment, skills, events, travel, combats] = await Promise.all([
        pool.execute('SELECT i.code,i.name,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? ORDER BY i.name LIMIT 120', [characterId]),
        pool.execute('SELECT pe.slot,i.name,ii.quality FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id WHERE pe.character_id=? ORDER BY pe.slot', [characterId]),
        pool.execute('SELECT s.name,ps.level,ps.quick_slot FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? ORDER BY ps.quick_slot, s.name LIMIT 80', [characterId]),
        pool.execute('SELECT id,event_type,payload,created_at FROM player_events WHERE player_id=? ORDER BY id DESC LIMIT 30', [character.player_id]),
        pool.execute('SELECT activity_type,arrival_at FROM player_travels WHERE character_id=? LIMIT 1', [characterId]),
        pool.execute('SELECT id,state,last_action_at FROM combat_sessions WHERE character_id=? AND state=\'active\' ORDER BY last_action_at DESC LIMIT 5', [characterId])
    ]);
    return { character: { id: Number(character.id), playerId: Number(character.player_id), qqUserId: character.qq_user_id, nickname: character.qq_nickname, status: character.player_status, name: character.name, gender: character.gender, level: Number(character.level), experience: Number(character.experience), realmStage: Number(character.realm_stage), skillPoints: Number(character.skill_points), copper: Number(character.copper_coins), hp: { current: Number(character.current_hp), max: Number(character.hp_max) }, mp: { current: Number(character.current_mp), max: Number(character.mp_max) }, activity: character.activity_status, profession: character.profession_code, secondaryProfession: character.secondary_profession_code, region: { code: character.region_code, name: character.region_name }, position: { x: Number(character.pos_x), y: Number(character.pos_y), z: Number(character.pos_z) }, updatedAt: character.updated_at }, inventory: inventory[0].map(row => ({ code: row.code, name: row.name, quantity: Number(row.quantity) })), equipment: equipment[0].map(row => ({ slot: row.slot, name: row.name, quality: row.quality === null ? null : Number(row.quality) })), skills: skills[0].map(row => ({ name: row.name, level: Number(row.level), slot: row.quick_slot === null ? null : Number(row.quick_slot) })), events: events[0].map(row => ({ id: Number(row.id), type: row.event_type, payload: row.payload, createdAt: row.created_at })), travel: travel[0][0] ? { type: travel[0][0].activity_type, arrivalAt: travel[0][0].arrival_at } : null, combats: combats[0].map(row => ({ id: row.id, state: row.state, lastActionAt: row.last_action_at })) };
};
const adminWorldOverview = async () => {
    const pool = await getPool();
    const [regions, settings, counts] = await Promise.all([
        pool.execute(`SELECT r.code,r.name,r.danger_level,r.is_enabled,
      (SELECT COUNT(*) FROM monster_spawns s WHERE s.region_id=r.id AND s.defeated_at IS NULL) AS active_monsters,
      (SELECT COUNT(*) FROM resource_spawns rs WHERE rs.region_id=r.id AND rs.mined_at IS NULL) AS active_resources
      FROM map_regions r ORDER BY r.danger_level,r.id`),
        pool.execute('SELECT setting_key,numeric_value FROM game_global_settings ORDER BY setting_key'),
        pool.execute(`SELECT (SELECT COUNT(*) FROM combat_sessions WHERE state='active') AS battles,
      (SELECT COUNT(*) FROM player_travels) AS travels,
      (SELECT COUNT(*) FROM world_scene_instances WHERE status='active' AND expires_at>NOW()) AS scenes`)
    ]);
    return { regions: regions[0].map(row => ({ code: row.code, name: row.name, dangerLevel: Number(row.danger_level), enabled: Boolean(row.is_enabled), monsters: Number(row.active_monsters), resources: Number(row.active_resources) })), settings: settings[0].map(row => ({ key: row.setting_key, value: Number(row.numeric_value) })), active: { battles: Number(counts[0][0]?.battles ?? 0), travels: Number(counts[0][0]?.travels ?? 0), scenes: Number(counts[0][0]?.scenes ?? 0) } };
};
const changeGlobalMultiplierFromWeb = async (actor, key, value, reason) => {
    if (actor.role === 'viewer')
        throw new Error('只读账号不能修改世界设置。');
    const allowed = ['experience_multiplier', 'drop_multiplier', 'copper_multiplier'];
    const multiplierKey = String(key);
    if (!allowed.includes(multiplierKey))
        throw new Error('不支持的全局倍率。');
    const next = await setGlobalMultiplier(multiplierKey, Number(value));
    await recordWebOperation({ actorRef: actor.username, actionType: 'world.multiplier.update', risk: 'medium', reason: asText(reason, 500), target: { kind: 'global_setting', id: multiplierKey }, request: { value: Number(value) }, result: { value: next } });
    return next;
};
const runWebPlayerAudit = async (actor, characterId, kind, reason) => {
    if (actor.role === 'viewer')
        throw new Error('只读账号不能执行数据核查。');
    const detail = await adminPlayerDetail(characterId);
    const target = detail.character.qqUserId;
    const auditKind = String(kind);
    const result = auditKind === '角色' ? await auditCharacter(target) : auditKind === '背包' || auditKind === '装备' ? await auditInventory(target) : auditKind === '技能' ? await auditSkills(target) : auditKind === '状态' ? await auditPlayerState(target) : null;
    if (!result)
        throw new Error('仅支持角色、背包、装备、技能或状态核查。');
    const operation = await recordWebOperation({ actorRef: actor.username, actionType: 'player.audit', risk: 'medium', reason: asText(reason, 500), target: { kind: 'character', id: characterId, playerId: detail.character.playerId, characterId }, request: { kind: auditKind }, result: { changed: result.changed, fixed: result.fixed } });
    return { ...result, operationId: operation.id };
};
const adminWebJournals = (page, keyword) => webOperationJournal(pageOf(page), asText(keyword));

export { adminDashboard, adminPlayerDetail, adminPlayers, adminWebJournals, adminWorldOverview, changeGlobalMultiplierFromWeb, runWebPlayerAudit };
