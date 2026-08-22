import type { RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';

type CharacterRow = RowDataPacket & { id: number };
type ActionRow = RowDataPacket & { sequence_no: number; skill_id: number | null; name: string | null };
type SettingRow = RowDataPacket & { enabled: number; auto_potion_enabled: number; hp_threshold: number; hp_item_id: number | null; hp_item_name: string | null; mp_threshold: number; mp_item_id: number | null; mp_item_name: string | null };

const characterIdFor = async (qqUserId: string) => {
  const pool = await getPool();
  const [rows] = await pool.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1', [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  return Number(rows[0].id);
};

const ensureSettings = async (characterId: number) => {
  const pool = await getPool();
  await pool.execute('INSERT IGNORE INTO player_auto_battle_settings (character_id) VALUES (?)', [characterId]);
};

export const autoBattleConfig = async (qqUserId: string) => {
  const characterId = await characterIdFor(qqUserId); await ensureSettings(characterId); const pool = await getPool();
  const [settings] = await pool.execute<SettingRow[]>(`SELECT s.*,hp.name AS hp_item_name,mp.name AS mp_item_name FROM player_auto_battle_settings s
    LEFT JOIN item_definitions hp ON hp.id=s.hp_item_id LEFT JOIN item_definitions mp ON mp.id=s.mp_item_id WHERE s.character_id=?`, [characterId]);
  const [actions] = await pool.execute<ActionRow[]>('SELECT a.sequence_no,a.skill_id,sd.name FROM player_auto_battle_actions a LEFT JOIN skill_definitions sd ON sd.id=a.skill_id WHERE a.character_id=? ORDER BY a.sequence_no', [characterId]);
  return { characterId, settings: settings[0], actions: actions.map(action => ({ sequence: Number(action.sequence_no), skillId: action.skill_id === null ? null : Number(action.skill_id), name: action.name ?? '普通攻击' })) };
};

export const setAutoBattleEnabled = async (qqUserId: string, enabled: boolean) => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  await connection.execute('INSERT INTO player_auto_battle_settings (character_id,enabled) VALUES (?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled)', [rows[0].id, enabled ? 1 : 0]);
  return enabled;
});

export const setAutoPotionEnabled = async (qqUserId: string, enabled: boolean) => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  await connection.execute('INSERT INTO player_auto_battle_settings (character_id,auto_potion_enabled) VALUES (?,?) ON DUPLICATE KEY UPDATE auto_potion_enabled=VALUES(auto_potion_enabled)', [rows[0].id, enabled ? 1 : 0]);
  return enabled;
});

export const autoBattleSkills = async (qqUserId: string, page = 1, keyword = '') => {
  const characterId = await characterIdFor(qqUserId); const pool = await getPool(); const like = `%${keyword}%`;
  const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT s.id,s.name FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.category NOT IN (\'passive\') AND s.name LIKE ? ORDER BY ps.learned_at,s.id', [characterId, like]);
  const total = Math.max(1, Math.ceil((rows.length + 1) / 10)); const safePage = Math.max(1, Math.min(total, page));
  const choices = [{ id: null as number | null, name: '普通攻击' }, ...rows.map(row => ({ id: Number(row.id), name: row.name }))].slice((safePage - 1) * 10, safePage * 10);
  return { choices, page: safePage, total };
};

const assertSkill = async (connection: any, characterId: number, skillId: number | null) => {
  if (skillId === null) return;
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=? AND s.category NOT IN (\'passive\')', [characterId, skillId]);
  if (!rows[0]) throw new Error('只能配置已经学习的主动技能。');
};

export const saveAutoBattleAction = async (qqUserId: string, sequence: number, skillId: number | null) => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。'); const characterId = Number(rows[0].id);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 30) throw new Error('出招位置需在 1 至 30 之间。');
  await assertSkill(connection, characterId, skillId);
  await connection.execute('INSERT INTO player_auto_battle_actions (character_id,sequence_no,skill_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE skill_id=VALUES(skill_id)', [characterId, sequence, skillId]);
});

export const deleteAutoBattleAction = async (qqUserId: string, sequence: number) => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]); if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  await connection.execute('DELETE FROM player_auto_battle_actions WHERE character_id=? AND sequence_no=?', [rows[0].id, sequence]);
});

export const beginAutoBattleQuickSetup = async (qqUserId: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]); if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  await connection.execute('DELETE FROM player_auto_battle_actions WHERE character_id=?', [rows[0].id]);
  await connection.execute('INSERT INTO player_auto_battle_quick_setup (character_id,next_sequence) VALUES (?,1) ON DUPLICATE KEY UPDATE next_sequence=1', [rows[0].id]);
  return 1;
});

export const saveQuickAutoBattleAction = async (qqUserId: string, skillId: number | null) => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]); if (!rows[0]) throw new Error('请先发送“注册”创建角色。'); const characterId = Number(rows[0].id);
  const [setup] = await connection.execute<(RowDataPacket & { next_sequence: number })[]>('SELECT next_sequence FROM player_auto_battle_quick_setup WHERE character_id=? FOR UPDATE', [characterId]); if (!setup[0]) throw new Error('请先点击“快速配置”。');
  const sequence = Number(setup[0].next_sequence); await assertSkill(connection, characterId, skillId);
  await connection.execute('INSERT INTO player_auto_battle_actions (character_id,sequence_no,skill_id) VALUES (?,?,?)', [characterId, sequence, skillId]);
  await connection.execute('UPDATE player_auto_battle_quick_setup SET next_sequence=next_sequence+1 WHERE character_id=?', [characterId]); return sequence + 1;
});

export const finishAutoBattleQuickSetup = async (qqUserId: string) => { const characterId = await characterIdFor(qqUserId); const pool = await getPool(); await pool.execute('DELETE FROM player_auto_battle_quick_setup WHERE character_id=?', [characterId]); };

export const autoPotionItems = async (qqUserId: string, page = 1, keyword = '') => {
  const characterId = await characterIdFor(qqUserId); const pool = await getPool(); const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT i.id,i.name FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type=\'consumable\' AND i.name LIKE ? ORDER BY i.id', [characterId, `%${keyword}%`]);
  const total = Math.max(1, Math.ceil(rows.length / 10)); const safePage = Math.max(1, Math.min(total, page)); return { items: rows.slice((safePage - 1) * 10, safePage * 10).map(row => ({ id: Number(row.id), name: row.name })), page: safePage, total };
};

export const setAutoPotionThreshold = async (qqUserId: string, kind: 'hp' | 'mp', threshold: number) => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]); if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 99) throw new Error('门槛需要是 1 至 99 的整数百分比。');
  await connection.execute(`INSERT INTO player_auto_battle_settings (character_id,${kind}_threshold) VALUES (?,?) ON DUPLICATE KEY UPDATE ${kind}_threshold=VALUES(${kind}_threshold)`, [rows[0].id, threshold]);
});

export const setAutoPotionItem = async (qqUserId: string, kind: 'hp' | 'mp', itemId: number | null) => withTransaction(async connection => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]); if (!rows[0]) throw new Error('请先发送“注册”创建角色。'); const characterId = Number(rows[0].id);
  if (itemId !== null) { const [items] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id=? AND i.item_type=\'consumable\'', [characterId, itemId]); if (!items[0]) throw new Error('背包中没有该可使用道具。'); }
  await connection.execute(`INSERT INTO player_auto_battle_settings (character_id,${kind}_item_id) VALUES (?,?) ON DUPLICATE KEY UPDATE ${kind}_item_id=VALUES(${kind}_item_id)`, [characterId, itemId]);
});

/** 当前回合自动战斗的出招；无配置、冷却或蓝量异常由调用方回退至普攻。 */
export const nextAutoBattleAction = async (qqUserId: string) => {
  const characterId = await characterIdFor(qqUserId); await ensureSettings(characterId); const pool = await getPool();
  const [settings] = await pool.execute<(RowDataPacket & { enabled: number; turn_no: number })[]>(`SELECT s.enabled,cs.turn_no
    FROM player_auto_battle_settings s JOIN combat_members cm ON cm.character_id=s.character_id JOIN combat_sessions cs ON cs.id=cm.session_id AND cs.state='active' WHERE s.character_id=? LIMIT 1`, [characterId]);
  const [storyBattle] = await pool.execute<RowDataPacket[]>(`SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id AND cs.state='active'
    JOIN combat_targets ct ON ct.session_id=cs.id JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id
    JOIN player_story_progress sp ON sp.character_id=cm.character_id AND sp.story_code='forest_guide' AND sp.status IN ('joined','declined')
    WHERE cm.character_id=? AND t.code='forest_slime' LIMIT 1`, [characterId]);
  if (!settings[0] || !settings[0].enabled || storyBattle[0]) return null;
  const [actions] = await pool.execute<(RowDataPacket & { skill_id: number | null })[]>('SELECT skill_id FROM player_auto_battle_actions WHERE character_id=? ORDER BY sequence_no', [characterId]);
  if (!actions.length) return { type: 'attack' as const };
  const selected = actions[(Math.max(1, Number(settings[0].turn_no)) - 1) % actions.length];
  return selected.skill_id === null ? { type: 'attack' as const } : { type: 'skill' as const, skillId: Number(selected.skill_id) };
};

/**
 * 读取当前战斗内所有已开启自动战斗、且尚未确认本回合行动的玩家。
 * 队伍回合由外层逐一提交这些动作；未开启自动的队员不会出现在结果中，
 * 因而仍会保留给其手动操作。
 */
export const pendingPartyAutoBattleActions = async (qqUserId: string) => {
  const characterId = await characterIdFor(qqUserId); const pool = await getPool();
  const [members] = await pool.execute<(RowDataPacket & { character_id: number; qq_user_id: string; turn_no: number })[]>(`SELECT cm.character_id,p.qq_user_id,cs.turn_no
    FROM combat_members mine
    JOIN combat_sessions cs ON cs.id=mine.session_id AND cs.state='active'
    JOIN combat_members cm ON cm.session_id=cs.id
    JOIN characters c ON c.id=cm.character_id
    JOIN players p ON p.id=c.player_id
    JOIN player_auto_battle_settings settings ON settings.character_id=cm.character_id AND settings.enabled=1
    WHERE mine.character_id=? AND cm.is_defeated=0 AND cm.pending_action IS NULL
      AND NOT EXISTS(SELECT 1 FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id
        WHERE ct.session_id=cs.id AND t.code='forest_slime'
          AND EXISTS(SELECT 1 FROM player_story_progress story WHERE story.character_id=mine.character_id AND story.story_code='forest_guide' AND story.status IN ('joined','declined')))
    ORDER BY cm.character_id`, [characterId]);
  const actions = await Promise.all(members.map(async member => {
    const [configured] = await pool.execute<(RowDataPacket & { skill_id: number | null })[]>('SELECT skill_id FROM player_auto_battle_actions WHERE character_id=? ORDER BY sequence_no', [member.character_id]);
    if (!configured.length) return { qqUserId: member.qq_user_id, action: { type: 'attack' as const } };
    const selected = configured[(Math.max(1, Number(member.turn_no)) - 1) % configured.length];
    return { qqUserId: member.qq_user_id, action: selected.skill_id === null ? { type: 'attack' as const } : { type: 'skill' as const, skillId: Number(selected.skill_id) } };
  }));
  return actions;
};
