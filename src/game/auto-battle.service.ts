import type { RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { readRuleState, visibleResidentBuff } from './combat-rule-registry';

type CharacterRow = RowDataPacket & { id: number };
type ActionRow = RowDataPacket & { sequence_no: number; skill_id: number | null; name: string | null };
type SettingRow = RowDataPacket & { enabled: number; default_encounter_action?: 'battle' | 'persuade'; auto_potion_enabled: number; hp_threshold: number; hp_item_id: number | null; hp_item_name: string | null; mp_threshold: number; mp_item_id: number | null; mp_item_name: string | null };
type AutoCombatStateRow = RowDataPacket & { character_id: number; qq_user_id?: string; enabled: number; auto_potion_enabled: number; hp_threshold: number; hp_item_id: number | null; mp_threshold: number; mp_item_id: number | null; turn_no: number; current_hp: number; current_mp: number; hp_max: number; mp_max: number; selected_target_id?: number | null; cooldowns?: unknown };
type AutoCombatAction = { type: 'attack' } | { type: 'skill'; skillId: number } | { type: 'item'; itemId: number };
export type AutoBattleMode = 'pve' | 'pvp';
const autoTables = (mode: AutoBattleMode) => mode === 'pvp'
  ? { settings: 'player_pvp_auto_battle_settings', actions: 'player_pvp_auto_battle_actions', quick: 'player_pvp_auto_battle_quick_setup' }
  : { settings: 'player_auto_battle_settings', actions: 'player_auto_battle_actions', quick: 'player_auto_battle_quick_setup' };

const characterIdFor = async (qqUserId: string) => {
  const pool = await getPool();
  const [rows] = await pool.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1', [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  return Number(rows[0].id);
};

const ensureSettings = async (characterId: number, mode: AutoBattleMode = 'pve') => {
  const pool = await getPool();
  await pool.execute(`INSERT IGNORE INTO ${autoTables(mode).settings} (character_id) VALUES (?)`, [characterId]);
};

export const autoBattleConfig = async (qqUserId: string, mode: AutoBattleMode = 'pve') => {
  const characterId = await characterIdFor(qqUserId); await ensureSettings(characterId, mode); const pool = await getPool(); const tables = autoTables(mode);
  const [settings] = await pool.execute<SettingRow[]>(`SELECT s.*,hp.name AS hp_item_name,mp.name AS mp_item_name FROM ${tables.settings} s
    LEFT JOIN item_definitions hp ON hp.id=s.hp_item_id LEFT JOIN item_definitions mp ON mp.id=s.mp_item_id WHERE s.character_id=?`, [characterId]);
  const [actions] = await pool.execute<ActionRow[]>(`SELECT a.sequence_no,a.skill_id,sd.name FROM ${tables.actions} a LEFT JOIN skill_definitions sd ON sd.id=a.skill_id WHERE a.character_id=? ORDER BY a.sequence_no`, [characterId]);
  return { characterId, mode, settings: settings[0], actions: actions.map(action => ({ sequence: Number(action.sequence_no), skillId: action.skill_id === null ? null : Number(action.skill_id), name: action.name ?? '普通攻击' })) };
};

export const setAutoBattleEnabled = async (qqUserId: string, enabled: boolean, mode: AutoBattleMode = 'pve') => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  await connection.execute(`INSERT INTO ${autoTables(mode).settings} (character_id,enabled) VALUES (?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled)`, [rows[0].id, enabled ? 1 : 0]);
  return enabled;
});

/** PVE 自动寻怪遇敌时的默认决策；PVP 不使用该配置。 */
export const toggleAutoBattleEncounterAction = async (qqUserId: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  const characterId = Number(rows[0].id);
  await connection.execute('INSERT IGNORE INTO player_auto_battle_settings (character_id) VALUES (?)', [characterId]);
  await connection.execute("UPDATE player_auto_battle_settings SET default_encounter_action=IF(default_encounter_action='battle','persuade','battle') WHERE character_id=?", [characterId]);
  const [settings] = await connection.execute<(RowDataPacket & { default_encounter_action: 'battle' | 'persuade' })[]>('SELECT default_encounter_action FROM player_auto_battle_settings WHERE character_id=?', [characterId]);
  return settings[0]?.default_encounter_action ?? 'battle';
});

export const setAutoPotionEnabled = async (qqUserId: string, enabled: boolean, mode: AutoBattleMode = 'pve') => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  await connection.execute(`INSERT INTO ${autoTables(mode).settings} (character_id,auto_potion_enabled) VALUES (?,?) ON DUPLICATE KEY UPDATE auto_potion_enabled=VALUES(auto_potion_enabled)`, [rows[0].id, enabled ? 1 : 0]);
  return enabled;
});

export const autoBattleSkills = async (qqUserId: string, page = 1, keyword = '') => {
  const characterId = await characterIdFor(qqUserId); const pool = await getPool(); const like = `%${keyword}%`;
  const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT s.id,s.name FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.category IN (\'physical\',\'magic\',\'utility\') AND s.name LIKE ? ORDER BY ps.learned_at,s.id', [characterId, like]);
  const total = Math.max(1, Math.ceil((rows.length + 1) / 10)); const safePage = Math.max(1, Math.min(total, page));
  const choices = [{ id: null as number | null, name: '普通攻击' }, ...rows.map(row => ({ id: Number(row.id), name: row.name }))].slice((safePage - 1) * 10, safePage * 10);
  return { choices, page: safePage, total };
};

const assertSkill = async (connection: any, characterId: number, skillId: number | null) => {
  if (skillId === null) return;
  const [rows] = await connection.execute('SELECT 1 FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=? AND s.category IN (\'physical\',\'magic\',\'utility\')', [characterId, skillId]) as [RowDataPacket[]];
  if (!rows[0]) throw new Error('只能配置已经学习的主动技能。');
};

export const saveAutoBattleAction = async (qqUserId: string, sequence: number, skillId: number | null, mode: AutoBattleMode = 'pve') => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。'); const characterId = Number(rows[0].id);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 30) throw new Error('出招位置需在 1 至 30 之间。');
  await assertSkill(connection, characterId, skillId);
  await connection.execute(`INSERT INTO ${autoTables(mode).actions} (character_id,sequence_no,skill_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE skill_id=VALUES(skill_id)`, [characterId, sequence, skillId]);
});

export const deleteAutoBattleAction = async (qqUserId: string, sequence: number, mode: AutoBattleMode = 'pve') => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]); if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  await connection.execute(`DELETE FROM ${autoTables(mode).actions} WHERE character_id=? AND sequence_no=?`, [rows[0].id, sequence]);
});

export const beginAutoBattleQuickSetup = async (qqUserId: string, mode: AutoBattleMode = 'pve') => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]); if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  const tables = autoTables(mode); await connection.execute(`DELETE FROM ${tables.actions} WHERE character_id=?`, [rows[0].id]);
  await connection.execute(`INSERT INTO ${tables.quick} (character_id,next_sequence) VALUES (?,1) ON DUPLICATE KEY UPDATE next_sequence=1`, [rows[0].id]);
  return 1;
});

export const saveQuickAutoBattleAction = async (qqUserId: string, skillId: number | null, mode: AutoBattleMode = 'pve') => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]); if (!rows[0]) throw new Error('请先发送“注册”创建角色。'); const characterId = Number(rows[0].id);
  const tables = autoTables(mode); const [setup] = await connection.execute<(RowDataPacket & { next_sequence: number })[]>(`SELECT next_sequence FROM ${tables.quick} WHERE character_id=? FOR UPDATE`, [characterId]); if (!setup[0]) throw new Error('请先点击“快速配置”。');
  const sequence = Number(setup[0].next_sequence); await assertSkill(connection, characterId, skillId);
  await connection.execute(`INSERT INTO ${tables.actions} (character_id,sequence_no,skill_id) VALUES (?,?,?)`, [characterId, sequence, skillId]);
  await connection.execute(`UPDATE ${tables.quick} SET next_sequence=next_sequence+1 WHERE character_id=?`, [characterId]); return sequence + 1;
});

export const finishAutoBattleQuickSetup = async (qqUserId: string, mode: AutoBattleMode = 'pve') => { const characterId = await characterIdFor(qqUserId); const pool = await getPool(); await pool.execute(`DELETE FROM ${autoTables(mode).quick} WHERE character_id=?`, [characterId]); };

export const autoPotionItems = async (qqUserId: string, page = 1, keyword = '') => {
  const characterId = await characterIdFor(qqUserId); const pool = await getPool(); const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT i.id,i.name FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type=\'consumable\' AND i.name LIKE ? ORDER BY i.id', [characterId, `%${keyword}%`]);
  const total = Math.max(1, Math.ceil(rows.length / 10)); const safePage = Math.max(1, Math.min(total, page)); return { items: rows.slice((safePage - 1) * 10, safePage * 10).map(row => ({ id: Number(row.id), name: row.name })), page: safePage, total };
};

export const setAutoPotionThreshold = async (qqUserId: string, kind: 'hp' | 'mp', threshold: number, mode: AutoBattleMode = 'pve') => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]); if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 99) throw new Error('门槛需要是 1 至 99 的整数百分比。');
  await connection.execute(`INSERT INTO ${autoTables(mode).settings} (character_id,${kind}_threshold) VALUES (?,?) ON DUPLICATE KEY UPDATE ${kind}_threshold=VALUES(${kind}_threshold)`, [rows[0].id, threshold]);
});

export const setAutoPotionItem = async (qqUserId: string, kind: 'hp' | 'mp', itemId: number | null, mode: AutoBattleMode = 'pve') => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]); if (!rows[0]) throw new Error('请先发送“注册”创建角色。'); const characterId = Number(rows[0].id);
  if (itemId !== null) { const [items] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id=? AND i.item_type=\'consumable\'', [characterId, itemId]); if (!items[0]) throw new Error('背包中没有该可使用道具。'); }
  await connection.execute(`INSERT INTO ${autoTables(mode).settings} (character_id,${kind}_item_id) VALUES (?,?) ON DUPLICATE KEY UPDATE ${kind}_item_id=VALUES(${kind}_item_id)`, [characterId, itemId]);
});

/** 自动嗑药优先于常规出招：生命危险时先保命，随后才补充魔力。 */
const availableAutoPotion = async (pool: Awaited<ReturnType<typeof getPool>>, state: AutoCombatStateRow): Promise<AutoCombatAction | null> => {
  if (!Number(state.auto_potion_enabled)) return null;
  const below = (current: number, maximum: number, threshold: number) => maximum > 0 && current * 100 <= maximum * threshold;
  const preferred = below(Number(state.current_hp), Number(state.hp_max), Number(state.hp_threshold)) ? state.hp_item_id
    : below(Number(state.current_mp), Number(state.mp_max), Number(state.mp_threshold)) ? state.mp_item_id
      : null;
  if (!preferred) return null;
  const [items] = await pool.execute<RowDataPacket[]>('SELECT 1 FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 AND i.item_type=\'consumable\' LIMIT 1', [state.character_id, preferred]);
  return items[0] ? { type: 'item', itemId: Number(preferred) } : null;
};

const configuredAutoAction = async (pool: Awaited<ReturnType<typeof getPool>>, state: AutoCombatStateRow): Promise<AutoCombatAction> => {
  const potion = await availableAutoPotion(pool, state); if (potion) return potion;
  const [actions] = await pool.execute<(RowDataPacket & { code: string; sequence_no: number; skill_id: number | null; learned_skill_id: number | null })[]>(`SELECT s.code,a.sequence_no,a.skill_id,CASE WHEN s.id IS NULL THEN NULL ELSE ps.skill_id END AS learned_skill_id
    FROM player_auto_battle_actions a LEFT JOIN player_skills ps ON ps.character_id=a.character_id AND ps.skill_id=a.skill_id
    LEFT JOIN skill_definitions s ON s.id=a.skill_id AND s.category IN ('physical','magic','utility')
    WHERE a.character_id=? ORDER BY a.sequence_no`, [state.character_id]);
  if (!actions.length) return { type: 'attack' };
  const selected = actions[(Math.max(1, Number(state.turn_no)) - 1) % actions.length];
  // 技能可能因转职、洗点、冷却、蓝量、武器或职业资源而在本回合无法使用。
  // 自动战斗只能把本回合临时降为普攻，绝不能写回玩家保存的出招配置。
  if (selected.skill_id !== null && selected.learned_skill_id === null) {
    return { type: 'attack' };
  }
  const cooldowns = typeof state.cooldowns === 'string' ? JSON.parse(state.cooldowns) : state.cooldowns;
  if (visibleResidentBuff(readRuleState(cooldowns?.__rules), selected.code, Number(state.turn_no))) return { type: 'attack' };
  return selected.skill_id === null ? { type: 'attack' } : { type: 'skill', skillId: Number(selected.skill_id) };
};

/** 当前回合自动战斗的出招；无配置、冷却或蓝量异常由调用方回退至普攻。 */
export const nextAutoBattleAction = async (qqUserId: string) => {
  const characterId = await characterIdFor(qqUserId); const pool = await getPool();
  const [settings] = await pool.execute<AutoCombatStateRow[]>(`SELECT s.*,cs.turn_no,cm.current_hp,cm.current_mp,c.hp_max,c.mp_max
    FROM player_auto_battle_settings s JOIN combat_members cm ON cm.character_id=s.character_id JOIN combat_sessions cs ON cs.id=cm.session_id AND cs.state='active' AND cs.mode<>'spar' JOIN characters c ON c.id=cm.character_id WHERE s.character_id=? LIMIT 1`, [characterId]);
  const [storyBattle] = await pool.execute<RowDataPacket[]>(`SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id AND cs.state='active' AND cs.mode<>'spar'
    JOIN combat_targets ct ON ct.session_id=cs.id JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id
    JOIN player_story_progress sp ON sp.character_id=cm.character_id AND sp.story_code='forest_guide' AND sp.status IN ('joined','declined')
    WHERE cm.character_id=? AND t.code='forest_slime' LIMIT 1`, [characterId]);
  if (!settings[0] || !settings[0].enabled || storyBattle[0]) return null;
  return configuredAutoAction(pool, settings[0]);
};

/**
 * 读取当前战斗内所有已开启自动战斗、且尚未确认本回合行动的玩家。
 * 队伍回合由外层逐一提交这些动作；未开启自动的队员不会出现在结果中，
 * 因而仍会保留给其手动操作。
 */
export const pendingPartyAutoBattleActions = async (qqUserId: string) => {
  const characterId = await characterIdFor(qqUserId); const pool = await getPool();
  const [members] = await pool.execute<AutoCombatStateRow[]>(`SELECT cm.character_id,p.qq_user_id,cs.turn_no,cm.current_hp,cm.current_mp,cm.selected_target_id,cm.cooldowns,c.hp_max,c.mp_max,
      settings.enabled,settings.auto_potion_enabled,settings.hp_threshold,settings.hp_item_id,settings.mp_threshold,settings.mp_item_id
    FROM combat_members mine
    JOIN combat_sessions cs ON cs.id=mine.session_id AND cs.state='active' AND cs.mode<>'spar'
    JOIN combat_members cm ON cm.session_id=cs.id
    JOIN characters c ON c.id=cm.character_id
    JOIN players p ON p.id=c.player_id
    JOIN player_auto_battle_settings settings ON settings.character_id=cm.character_id AND settings.enabled=1
    WHERE mine.character_id=? AND cm.is_defeated=0 AND cm.pending_action IS NULL
      AND (JSON_EXTRACT(cs.cooldowns,'$.__bonusPhase') IS NULL OR JSON_EXTRACT(cm.cooldowns,'$.__bonusAction')=1)
      AND JSON_EXTRACT(cm.cooldowns,'$.__rules.cast') IS NULL
      AND NOT EXISTS(SELECT 1 FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id
        WHERE ct.session_id=cs.id AND t.code='forest_slime'
          AND EXISTS(SELECT 1 FROM player_story_progress story WHERE story.character_id=mine.character_id AND story.story_code='forest_guide' AND story.status IN ('joined','declined')))
    ORDER BY cm.character_id`, [characterId]);
  const [targets] = await pool.execute<(RowDataPacket & { spawn_id: number; is_defeated: number; traits_json: unknown; cooldowns: unknown })[]>(`SELECT ct.spawn_id,ct.is_defeated,s.traits_json,ct.cooldowns
    FROM combat_members mine JOIN combat_sessions cs ON cs.id=mine.session_id AND cs.state='active' AND cs.mode<>'spar'
    JOIN combat_targets ct ON ct.session_id=cs.id JOIN monster_spawns s ON s.id=ct.spawn_id
    WHERE mine.character_id=?`, [characterId]);
  const jsonObject = (value: unknown) => { if (!value) return {} as Record<string, unknown>; try { return typeof value === 'string' ? JSON.parse(value) : value as Record<string, unknown>; } catch { return {} as Record<string, unknown>; } };
  const component = (target: { traits_json: unknown }) => {
    const traits = Array.isArray(target.traits_json) ? target.traits_json : (() => { try { return JSON.parse(String(target.traits_json ?? '[]')); } catch { return []; } })();
    return Array.isArray(traits) ? traits.find((trait: any) => trait?.code === 'boss_component') as { body_spawn_id?: number; part_key?: string } | undefined : undefined;
  };
  const aliveTargets = targets.filter(target => !Number(target.is_defeated));
  const automaticTargetFor = (member: AutoCombatStateRow) => {
    const componentRows = aliveTargets.map(target => ({ target, trait: component(target) })).filter((entry): entry is { target: typeof targets[number]; trait: { body_spawn_id?: number; part_key?: string } } => Boolean(entry.trait));
    const bodyFor = (entry: { trait: { body_spawn_id?: number } }) => aliveTargets.find(target => Number(target.spawn_id) === Number(entry.trait.body_spawn_id));
    const urgent = (key: string, predicate: (body: typeof targets[number] | undefined) => boolean) => componentRows.find(entry => entry.trait.part_key === key && predicate(bodyFor(entry)));
    const memberCooldowns = jsonObject(member.cooldowns);
    const horn = urgent('gruen_horn', body => Number(jsonObject(body?.cooldowns).boss_component_gruen_horn_charge ?? 0) > 0);
    const bellows = urgent('valk_bellows', body => Number(jsonObject(body?.cooldowns).regional_valk_heat ?? 0) === 2);
    const chain = urgent('valk_chain', () => Number(memberCooldowns.boss_component_valk_chain_execute_at ?? 0) > 0);
    const priority = horn ?? bellows ?? chain
      ?? componentRows.find(entry => ['gruen_armor', 'valk_armor'].includes(String(entry.trait.part_key)))
      ?? componentRows.find(entry => ['gruen_arm', 'valk_chain', 'gruen_horn', 'valk_bellows'].includes(String(entry.trait.part_key)));
    // 已击破的部位仍可能留在成员的选中记录中，不能再交给切换目标接口。
    const selected = aliveTargets.find(target => Number(target.spawn_id) === Number(member.selected_target_id));
    return Number(priority?.target.spawn_id ?? selected?.spawn_id ?? aliveTargets[0]?.spawn_id ?? 0) || undefined;
  };
  const actions = await Promise.all(members.map(async member => {
    return { qqUserId: member.qq_user_id!, action: await configuredAutoAction(pool, member), targetId: automaticTargetFor(member) };
  }));
  return actions;
};

/** 只有存活成员全部为真人且均已开启自动战斗，才允许一次性完成整场结算。 */
export const isFullPartyAutoBattle = async (qqUserId: string) => {
  const characterId = await characterIdFor(qqUserId); const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { alive_count: number; automated_count: number; story_battle: number })[]>(`SELECT
      SUM(CASE WHEN cm.is_defeated=0 THEN 1 ELSE 0 END) AS alive_count,
      SUM(CASE WHEN cm.is_defeated=0 AND c.npc_code IS NULL AND COALESCE(settings.enabled,0)=1 THEN 1 ELSE 0 END) AS automated_count,
      MAX(CASE WHEN t.code='forest_slime' AND story.story_code IS NOT NULL THEN 1 ELSE 0 END) AS story_battle
    FROM combat_members mine
    JOIN combat_sessions cs ON cs.id=mine.session_id AND cs.state='active' AND cs.mode<>'spar'
    JOIN combat_members cm ON cm.session_id=cs.id
    JOIN characters c ON c.id=cm.character_id
    LEFT JOIN player_auto_battle_settings settings ON settings.character_id=cm.character_id
    LEFT JOIN combat_targets ct ON ct.session_id=cs.id
    LEFT JOIN monster_spawns s ON s.id=ct.spawn_id
    LEFT JOIN monster_templates t ON t.id=s.template_id
    LEFT JOIN player_story_progress story ON story.character_id=mine.character_id AND story.story_code='forest_guide' AND story.status IN ('joined','declined')
    WHERE mine.character_id=?`, [characterId]);
  const row = rows[0];
  return Boolean(row) && Number(row.alive_count) > 0 && Number(row.alive_count) === Number(row.automated_count) && !Number(row.story_battle);
};
