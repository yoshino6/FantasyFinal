import type { RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { adminOperationLogs } from './admin-log.service';
import { auditCharacter, auditInventory, auditPlayerState, auditSkills } from './admin-audit.service';
import { setGlobalMultiplier, type GlobalMultiplierKey } from './global-management.service';
import { recordWebOperation, webOperationJournal, type WebRole } from './operation-journal.service';
import { systemStatusSnapshot } from './system-status.service';

export type PlayerFilters = { page?: unknown; keyword?: unknown; region?: unknown; activity?: unknown; status?: unknown };
const pageOf = (value: unknown) => Math.max(1, Math.min(10_000, Math.floor(Number(value) || 1)));
const asText = (value: unknown, max = 80) => String(value ?? '').trim().slice(0, max);
const jsonObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  try { const parsed = JSON.parse(String(value ?? '{}')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; }
};

export const adminDashboard = async () => {
  const pool = await getPool(); const status = await systemStatusSnapshot();
  const [rows] = await pool.execute<(RowDataPacket & { players: number; operations: number; alerts: number })[]>(`SELECT
    (SELECT COUNT(*) FROM characters WHERE npc_code IS NULL) AS players,
    (SELECT COUNT(*) FROM operation_journals WHERE created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)) AS operations,
    (SELECT COUNT(*) FROM monitor_alerts WHERE status<>'resolved') AS alerts`);
  return { system: status, players: Number(rows[0]?.players ?? 0), operationsToday: Number(rows[0]?.operations ?? 0), openAlerts: Number(rows[0]?.alerts ?? 0) };
};

export const adminPlayers = async (filters: PlayerFilters = {}) => {
  const page = pageOf(filters.page); const keyword = asText(filters.keyword); const region = asText(filters.region, 64); const activity = asText(filters.activity, 32); const status = asText(filters.status, 32);
  const where = ['c.npc_code IS NULL']; const values: Array<string | number> = [];
  if (keyword) { where.push('(c.name LIKE ? OR p.qq_user_id LIKE ? OR p.qq_nickname LIKE ?)'); values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (region) { where.push('r.code=?'); values.push(region); }
  if (activity) { where.push('c.activity_status=?'); values.push(activity); }
  if (status) { where.push('p.status=?'); values.push(status); }
  const clause = `WHERE ${where.join(' AND ')}`; const pool = await getPool();
  const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id ${clause}`, values);
  const total = Number(countRows[0]?.total ?? 0); const totalPages = Math.max(1, Math.ceil(total / 30)); const safePage = Math.min(page, totalPages);
  const [rows] = await pool.execute<(RowDataPacket & { character_id: number; player_id: number; qq_user_id: string; qq_nickname: string | null; player_status: string; name: string; level: number; realm_stage: number; copper_coins: number; activity_status: string; region_code: string; region_name: string; updated_at: Date })[]>(`SELECT c.id AS character_id,p.id AS player_id,p.qq_user_id,p.qq_nickname,p.status AS player_status,c.name,c.level,c.realm_stage,c.copper_coins,c.activity_status,r.code AS region_code,r.name AS region_name,c.updated_at
    FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id ${clause}
    ORDER BY c.updated_at DESC,c.id DESC LIMIT 30 OFFSET ?`, [...values, (safePage - 1) * 30]);
  return { page: safePage, total, totalPages, entries: rows.map(row => ({ characterId: Number(row.character_id), playerId: Number(row.player_id), qqUserId: row.qq_user_id, nickname: row.qq_nickname, status: row.player_status, name: row.name, level: Number(row.level), realmStage: Number(row.realm_stage), copper: Number(row.copper_coins), activity: row.activity_status, region: { code: row.region_code, name: row.region_name }, updatedAt: row.updated_at })) };
};

export const adminPlayerDetail = async (characterId: number) => {
  const pool = await getPool();
  const [characters] = await pool.execute<(RowDataPacket & { id: number; player_id: number; qq_user_id: string; qq_nickname: string | null; player_status: string; name: string; gender: string; level: number; experience: number; realm_stage: number; skill_points: number; copper_coins: number; current_hp: number; hp_max: number; current_mp: number; mp_max: number; activity_status: string; profession_code: string | null; secondary_profession_code: string | null; region_code: string; region_name: string; pos_x: number; pos_y: number; pos_z: number; updated_at: Date })[]>(`SELECT c.id,c.player_id,p.qq_user_id,p.qq_nickname,p.status AS player_status,c.name,c.gender,c.level,c.experience,c.realm_stage,c.skill_points,c.copper_coins,c.current_hp,c.hp_max,c.current_mp,c.mp_max,c.activity_status,c.profession_code,c.secondary_profession_code,r.code AS region_code,r.name AS region_name,c.pos_x,c.pos_y,c.pos_z,c.updated_at
    FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id WHERE c.id=? AND c.npc_code IS NULL LIMIT 1`, [characterId]);
  const character = characters[0]; if (!character) throw new Error('未找到玩家角色。');
  const [inventory, equipment, skills, events, travel, combats] = await Promise.all([
    pool.execute<(RowDataPacket & { code: string; name: string; quantity: number })[]>('SELECT i.code,i.name,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? ORDER BY i.name LIMIT 120', [characterId]),
    pool.execute<(RowDataPacket & { slot: string; name: string; quality: number | null })[]>('SELECT pe.slot,i.name,ii.quality FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id WHERE pe.character_id=? ORDER BY pe.slot', [characterId]),
    pool.execute<(RowDataPacket & { name: string; level: number; quick_slot: number | null })[]>('SELECT s.name,ps.level,ps.quick_slot FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? ORDER BY ps.quick_slot, s.name LIMIT 80', [characterId]),
    pool.execute<(RowDataPacket & { id: number; event_type: string; payload: unknown; created_at: Date })[]>('SELECT id,event_type,payload,created_at FROM player_events WHERE player_id=? ORDER BY id DESC LIMIT 30', [character.player_id]),
    pool.execute<(RowDataPacket & { activity_type: string; arrival_at: Date })[]>('SELECT activity_type,arrival_at FROM player_travels WHERE character_id=? LIMIT 1', [characterId]),
    pool.execute<(RowDataPacket & { id: string; state: string; last_action_at: Date })[]>('SELECT id,state,last_action_at FROM combat_sessions WHERE character_id=? AND state=\'active\' ORDER BY last_action_at DESC LIMIT 5', [characterId])
  ]);
  return { character: { id: Number(character.id), playerId: Number(character.player_id), qqUserId: character.qq_user_id, nickname: character.qq_nickname, status: character.player_status, name: character.name, gender: character.gender, level: Number(character.level), experience: Number(character.experience), realmStage: Number(character.realm_stage), skillPoints: Number(character.skill_points), copper: Number(character.copper_coins), hp: { current: Number(character.current_hp), max: Number(character.hp_max) }, mp: { current: Number(character.current_mp), max: Number(character.mp_max) }, activity: character.activity_status, profession: character.profession_code, secondaryProfession: character.secondary_profession_code, region: { code: character.region_code, name: character.region_name }, position: { x: Number(character.pos_x), y: Number(character.pos_y), z: Number(character.pos_z) }, updatedAt: character.updated_at }, inventory: inventory[0].map(row => ({ code: row.code, name: row.name, quantity: Number(row.quantity) })), equipment: equipment[0].map(row => ({ slot: row.slot, name: row.name, quality: row.quality === null ? null : Number(row.quality) })), skills: skills[0].map(row => ({ name: row.name, level: Number(row.level), slot: row.quick_slot === null ? null : Number(row.quick_slot) })), events: events[0].map(row => ({ id: Number(row.id), type: row.event_type, payload: row.payload, createdAt: row.created_at })), travel: travel[0][0] ? { type: travel[0][0].activity_type, arrivalAt: travel[0][0].arrival_at } : null, combats: combats[0].map(row => ({ id: row.id, state: row.state, lastActionAt: row.last_action_at })) };
};

export const adminWorldOverview = async () => {
  const pool = await getPool();
  const [regions, settings, counts] = await Promise.all([
    pool.execute<(RowDataPacket & { code: string; name: string; danger_level: number; is_enabled: number; active_monsters: number; active_resources: number })[]>(`SELECT r.code,r.name,r.danger_level,r.is_enabled,
      (SELECT COUNT(*) FROM monster_spawns s WHERE s.region_id=r.id AND s.defeated_at IS NULL) AS active_monsters,
      (SELECT COUNT(*) FROM resource_spawns rs WHERE rs.region_id=r.id AND rs.mined_at IS NULL) AS active_resources
      FROM map_regions r ORDER BY r.danger_level,r.id`),
    pool.execute<(RowDataPacket & { setting_key: string; numeric_value: number })[]>('SELECT setting_key,numeric_value FROM game_global_settings ORDER BY setting_key'),
    pool.execute<(RowDataPacket & { battles: number; travels: number; scenes: number })[]>(`SELECT (SELECT COUNT(*) FROM combat_sessions WHERE state='active') AS battles,
      (SELECT COUNT(*) FROM player_travels) AS travels,
      (SELECT COUNT(*) FROM world_scene_instances WHERE status='active' AND expires_at>NOW()) AS scenes`)
  ]);
  return { regions: regions[0].map(row => ({ code: row.code, name: row.name, dangerLevel: Number(row.danger_level), enabled: Boolean(row.is_enabled), monsters: Number(row.active_monsters), resources: Number(row.active_resources) })), settings: settings[0].map(row => ({ key: row.setting_key, value: Number(row.numeric_value) })), active: { battles: Number(counts[0][0]?.battles ?? 0), travels: Number(counts[0][0]?.travels ?? 0), scenes: Number(counts[0][0]?.scenes ?? 0) } };
};

export const changeGlobalMultiplierFromWeb = async (actor: { username: string; role: WebRole }, key: unknown, value: unknown, reason: unknown) => {
  if (actor.role === 'viewer') throw new Error('只读账号不能修改世界设置。');
  const allowed: GlobalMultiplierKey[] = ['experience_multiplier', 'drop_multiplier', 'copper_multiplier']; const multiplierKey = String(key) as GlobalMultiplierKey;
  if (!allowed.includes(multiplierKey)) throw new Error('不支持的全局倍率。');
  const next = await setGlobalMultiplier(multiplierKey, Number(value));
  await recordWebOperation({ actorRef: actor.username, actionType: 'world.multiplier.update', risk: 'medium', reason: asText(reason, 500), target: { kind: 'global_setting', id: multiplierKey }, request: { value: Number(value) }, result: { value: next } });
  return next;
};

export const runWebPlayerAudit = async (actor: { username: string; role: WebRole }, characterId: number, kind: unknown, reason: unknown) => {
  if (actor.role === 'viewer') throw new Error('只读账号不能执行数据核查。');
  const detail = await adminPlayerDetail(characterId); const target = detail.character.qqUserId; const auditKind = String(kind);
  const result = auditKind === '角色' ? await auditCharacter(target) : auditKind === '背包' || auditKind === '装备' ? await auditInventory(target) : auditKind === '技能' ? await auditSkills(target) : auditKind === '状态' ? await auditPlayerState(target) : null;
  if (!result) throw new Error('仅支持角色、背包、装备、技能或状态核查。');
  const operation = await recordWebOperation({ actorRef: actor.username, actionType: 'player.audit', risk: 'medium', reason: asText(reason, 500), target: { kind: 'character', id: characterId, playerId: detail.character.playerId, characterId }, request: { kind: auditKind }, result: { changed: result.changed, fixed: result.fixed } });
  return { ...result, operationId: operation.id };
};

export const adminWebJournals = (page: unknown, keyword: unknown) => webOperationJournal(pageOf(page), asText(keyword));

/** 游戏内 QQ 管理面板写入的操作记录，与网页后台的审计总账分开保存。 */
export const adminGameOperations = (page: unknown, keyword: unknown) => adminOperationLogs({ page: pageOf(page), keyword: asText(keyword) });

export const adminMails = async (keyword: unknown) => {
  const term = asText(keyword); const pool = await getPool();
  const where = term ? 'WHERE m.title LIKE ? OR m.content LIKE ? OR c.name LIKE ? OR p.qq_user_id LIKE ?' : '';
  const values = term ? [`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`] : [];
  const [rows] = await pool.execute<(RowDataPacket & { id: number; character_id: number; character_name: string; qq_user_id: string; title: string; content: string; received_at: Date; claimed_at: Date | null; deleted_at: Date | null; attachments: string | null })[]>(`
    SELECT m.id,m.character_id,c.name AS character_name,p.qq_user_id,m.title,m.content,m.received_at,m.claimed_at,m.deleted_at,
      GROUP_CONCAT(CONCAT(i.name,' × ',a.quantity) ORDER BY a.id SEPARATOR '、') AS attachments
    FROM player_mails m JOIN characters c ON c.id=m.character_id JOIN players p ON p.id=c.player_id
    LEFT JOIN player_mail_attachments a ON a.mail_id=m.id LEFT JOIN item_definitions i ON i.id=a.item_id
    ${where} GROUP BY m.id,m.character_id,c.name,p.qq_user_id,m.title,m.content,m.received_at,m.claimed_at,m.deleted_at
    ORDER BY m.received_at DESC,m.id DESC LIMIT 100`, values);
  return rows.map(row => ({ id: Number(row.id), characterId: Number(row.character_id), characterName: row.character_name, qqUserId: row.qq_user_id, title: row.title, content: row.content, receivedAt: row.received_at, claimedAt: row.claimed_at, deletedAt: row.deleted_at, attachments: row.attachments ?? '' }));
};

export const sendWebMail = async (actor: { username: string; role: WebRole }, body: Record<string, unknown>) => {
  if (actor.role === 'viewer') throw new Error('只读账号不能发放邮件。');
  const characterIdText = asText(body.characterId, 24); const title = asText(body.title, 96); const content = asText(body.content, 4_000); const reason = asText(body.reason, 500); const item = asText(body.item, 64);
  if (!title || !content) throw new Error('邮件标题和正文均不能为空。');
  if (!reason) throw new Error('发放邮件必须填写操作原因。');
  if (characterIdText && (!/^\d+$/.test(characterIdText) || Number(characterIdText) < 1)) throw new Error('角色编号必须是正整数，留空才会发送给全服。');
  const quantity = Math.floor(Number(body.quantity ?? 1));
  if (item && (!Number.isFinite(quantity) || quantity < 1 || quantity > 999_999)) throw new Error('附件数量必须是 1 到 999999 的整数。');
  return withTransaction(async connection => {
    const [recipients] = await connection.execute<(RowDataPacket & { id: number })[]>(characterIdText
      ? 'SELECT id FROM characters WHERE id=? AND npc_code IS NULL'
      : 'SELECT id FROM characters WHERE npc_code IS NULL', characterIdText ? [Number(characterIdText)] : []);
    if (!recipients.length) throw new Error(characterIdText ? '未找到该玩家角色。' : '当前没有可接收邮件的玩家角色。');
    let itemId: number | null = null; let itemName: string | null = null;
    if (item) {
      const [items] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM item_definitions WHERE id=? OR code=? OR codex_id=? OR name=? LIMIT 1', [item, item, item, item]);
      if (!items[0]) throw new Error('未找到邮件附件物品；请填写物品编号、代号、图鉴编号或名称。');
      itemId = Number(items[0].id); itemName = items[0].name;
    }
    for (const recipient of recipients) {
      const [result] = await connection.execute<any>('INSERT INTO player_mails (character_id,title,content) VALUES (?,?,?)', [recipient.id, title, content]);
      if (itemId) await connection.execute('INSERT INTO player_mail_attachments (mail_id,item_id,quantity) VALUES (?,?,?)', [result.insertId, itemId, quantity]);
    }
    const scope = characterIdText ? '单个玩家' : '全服';
    const operation = await recordWebOperation({ actorRef: actor.username, actionType: 'mail.send', risk: 'high', reason, target: { kind: 'mail_delivery', id: characterIdText || 'all_players', characterId: characterIdText ? Number(characterIdText) : null }, request: { scope, title, attachment: itemName ? { name: itemName, quantity } : null }, result: { recipients: recipients.length } }, connection);
    return { recipients: recipients.length, operationId: operation.id, scope, attachment: itemName ? { name: itemName, quantity } : null };
  });
};

export const adminWorldEvents = async (keyword: unknown) => {
  const term = asText(keyword); const pool = await getPool(); const like = `%${term}%`;
  const sceneWhere = term ? 'WHERE t.title LIKE ? OR r.name LIKE ? OR c.name LIKE ? OR s.template_code LIKE ?' : '';
  const encounterWhere = term ? 'WHERE t.title LIKE ? OR r.name LIKE ? OR c.name LIKE ? OR e.template_code LIKE ?' : '';
  const ledgerWhere = term ? 'WHERE l.event_type LIKE ? OR l.source_key LIKE ? OR r.name LIKE ? OR c.name LIKE ?' : '';
  const [scenes, encounters, ledger] = await Promise.all([
    pool.execute<(RowDataPacket & { id: string; title: string | null; region_name: string; cell_x: number; cell_y: number; cell_z: number; discoverer: string; status: string; opened_at: Date; expires_at: Date; resolved_at: Date | null; participant_count: number; payload_json: unknown })[]>(`SELECT s.id,t.title,r.name AS region_name,s.cell_x,s.cell_y,s.cell_z,c.name AS discoverer,s.status,s.opened_at,s.expires_at,s.resolved_at,COUNT(p.character_id) AS participant_count,s.payload_json FROM world_scene_instances s LEFT JOIN dynamic_encounter_templates t ON t.code=s.template_code JOIN map_regions r ON r.id=s.region_id JOIN characters c ON c.id=s.discoverer_character_id LEFT JOIN world_scene_participants p ON p.scene_id=s.id ${sceneWhere} GROUP BY s.id,t.title,r.name,s.cell_x,s.cell_y,s.cell_z,c.name,s.status,s.opened_at,s.expires_at,s.resolved_at,s.payload_json ORDER BY s.opened_at DESC LIMIT 80`, term ? [like, like, like, like] : []),
    pool.execute<(RowDataPacket & { id: string; title: string | null; region_name: string; character_name: string; status: string; node_code: string; opened_at: Date; expires_at: Date; resolved_at: Date | null; context_json: unknown })[]>(`SELECT e.id,t.title,r.name AS region_name,c.name AS character_name,e.status,e.node_code,e.opened_at,e.expires_at,e.resolved_at,e.context_json FROM player_encounter_instances e LEFT JOIN dynamic_encounter_templates t ON t.code=e.template_code JOIN map_regions r ON r.id=e.region_id JOIN characters c ON c.id=e.character_id ${encounterWhere} ORDER BY e.opened_at DESC LIMIT 80`, term ? [like, like, like, like] : []),
    pool.execute<(RowDataPacket & { event_type: string; outcome: string; actor_name: string | null; region_name: string | null; payload_json: unknown; created_at: Date })[]>(`SELECT l.event_type,l.outcome,c.name AS actor_name,r.name AS region_name,l.payload_json,l.created_at FROM game_event_ledger l LEFT JOIN characters c ON c.id=l.actor_character_id LEFT JOIN map_regions r ON r.id=l.region_id ${ledgerWhere} ORDER BY l.id DESC LIMIT 100`, term ? [like, like, like, like] : [])
  ]);
  const weatherName = (payload: Record<string, unknown>) => String(payload.weatherName ?? payload.weather_name ?? '');
  return {
    scenes: scenes[0].map(row => { const payload = jsonObject(row.payload_json); return { id: row.id, title: row.title ?? '未命名公共奇遇', regionName: row.region_name, position: { x: Number(row.cell_x) * 8 + 4, y: Number(row.cell_y) * 8 + 4, z: Number(row.cell_z) }, discoverer: row.discoverer, status: row.status, openedAt: row.opened_at, expiresAt: row.expires_at, resolvedAt: row.resolved_at, participants: Number(row.participant_count), weather: weatherName(payload) }; }),
    encounters: encounters[0].map(row => { const context = jsonObject(row.context_json); return { id: row.id, title: row.title ?? String(context.titleSnapshot ?? '未命名个人奇遇'), regionName: row.region_name, characterName: row.character_name, status: row.status, openedAt: row.opened_at, expiresAt: row.expires_at, resolvedAt: row.resolved_at, weather: weatherName(context) }; }),
    ledger: ledger[0].map(row => { const payload = jsonObject(row.payload_json); const position = jsonObject(payload.position); return { type: row.event_type, outcome: row.outcome, actorName: row.actor_name, regionName: row.region_name, createdAt: row.created_at, subject: String(payload.name ?? ''), position: Number.isFinite(Number(position.x)) ? { x: Number(position.x), y: Number(position.y), z: Number(position.z) } : null }; })
  };
};

export const adminPatrolEntities = async (keyword: unknown) => {
  const term = asText(keyword); const pool = await getPool(); const values = term ? [`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`] : [];
  const where = term ? 'WHERE d.code LIKE ? OR d.name LIKE ? OR r.name LIKE ? OR d.status LIKE ?' : '';
  const [rows] = await pool.execute<(RowDataPacket & { code: string; name: string; region_name: string; status: string; pos_x: number | null; pos_y: number | null; pos_z: number | null; state_json: unknown; action_revision: number; last_action_at: Date; next_action_at: Date })[]>(`SELECT d.code,d.name,r.name AS region_name,d.status,n.pos_x,n.pos_y,n.pos_z,d.state_json,d.action_revision,d.last_action_at,d.next_action_at FROM world_dynamic_npc_states d JOIN map_regions r ON r.id=d.region_id LEFT JOIN map_npcs n ON n.code=d.code AND n.region_id=d.region_id AND n.interaction_kind='npc' ${where} ORDER BY r.name,d.name`, values);
  return rows.map(row => { const state = jsonObject(row.state_json); return { name: row.name, regionName: row.region_name, status: row.status, position: row.pos_x === null ? null : { x: Number(row.pos_x), y: Number(row.pos_y), z: Number(row.pos_z) }, currentPoint: String(state.currentPoint ?? '巡游中'), homeSite: String(state.homeSite ?? ''), sceneId: state.specialSceneId ? String(state.specialSceneId) : null, revision: Number(row.action_revision), lastActionAt: row.last_action_at, nextActionAt: row.next_action_at }; });
};
