import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { recalculateCharacterStats } from './character.service';
import { ensureSkillPointLedger, skillPointLedgerSummary } from './skill-point-ledger.service';
import { forgeEquipmentCapsFor, forgePrimaryKeys } from './blacksmith.service';

const jsonRecord = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  try { return JSON.parse(String(value)) as Record<string, unknown>; } catch { return {}; }
};
const jsonStringArray = (value: unknown): string[] => {
  const raw = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return []; } })() : value;
  return Array.isArray(raw) ? raw.filter(item => typeof item === 'string') : [];
};
/** 锻造装备仅允许独立的 0～5% 伤害增加或受伤降低稀有词条。 */
const hasLegacyPercentAffix = (value: unknown, crafted = false, category = '', subtype: string | null = null) => Object.entries(jsonRecord(value)).some(([key, amount]) => {
  if (!key.endsWith('Pct') || Number(amount) === 0) return false;
  const validDamageBonus = crafted && key === 'damageBonusPct' && category === '武器' && subtype !== '盾牌' && Number(amount) > 0 && Number(amount) <= 5;
  const validDamageReduction = crafted && key === 'damageReductionPct' && (category !== '武器' || subtype === '盾牌') && Number(amount) > 0 && Number(amount) <= 5;
  return !validDamageBonus && !validDamageReduction;
});
const invalidForgedEquipment = (category: string, subtype: string | null, level: number, rarity: string, effectJson: unknown, primaryJson: unknown) => {
  const effect = jsonRecord(effectJson);
  const expectedMain = forgePrimaryKeys(category, subtype);
  const markedMain = jsonStringArray(primaryJson);
  const main = markedMain.length ? markedMain : expectedMain;
  const damageBonus = Number(effect.damageBonusPct ?? 0);
  if (damageBonus && (category !== '武器' || subtype === '盾牌' || damageBonus < 0 || damageBonus > 5)) return true;
  const damageReduction = Number(effect.damageReductionPct ?? 0);
  if (damageReduction && ((category === '武器' && subtype !== '盾牌') || damageReduction < 0 || damageReduction > 5)) return true;
  if (subtype === '盾牌' && (Number(effect.physicalAttack ?? 0) !== 0 || Number(effect.magicAttack ?? 0) !== 0)) return true;
  if (markedMain.length && (markedMain.length !== expectedMain.length || markedMain.some(key => !expectedMain.includes(key)))) return true;
  if (!main.every(key => Number(effect[key] ?? 0) > 0)) return true;
  const secondary = Object.entries(effect).filter(([key, value]) => key !== 'damageBonusPct' && key !== 'damageReductionPct' && !main.includes(key) && typeof value === 'number' && Number(value) !== 0);
  const allowedSecondary = ({ '普通': 0, '优秀': 1, '精良': 2, '稀有': 3, '传说': 4, '史诗': 4 }[rarity] ?? 0);
  if (secondary.length > allowedSecondary) return true;
  const caps = forgeEquipmentCapsFor(category, subtype, level, rarity, main);
  return Object.entries(effect).some(([key, value]) => caps[key] !== undefined && Math.abs(Number(value)) > caps[key] + .1);
};

const characterIdFor = async (connection: PoolConnection, qqUserId: string) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string; level: number; skill_points: number })[]>('SELECT c.id,c.name,c.level,c.skill_points FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  if (!rows[0]) throw new Error('该用户尚未注册角色。'); return rows[0];
};

export const auditCharacter = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterIdFor(connection, qqUserId);
  const columns = ['hp_max', 'mp_max', 'current_hp', 'current_mp', 'physical_attack', 'magic_attack', 'physical_defense', 'magic_defense', 'accuracy', 'evasion', 'crit_rate_bp', 'crit_damage_bp', 'crit_resist_bp', 'crit_damage_reduction_bp', 'tenacity', 'tenacity_pierce', 'speed'];
  const [beforeRows] = await connection.execute<RowDataPacket[]>(`SELECT ${columns.join(',')} FROM characters WHERE id=? FOR UPDATE`, [character.id]);
  await recalculateCharacterStats(connection, Number(character.id));
  await connection.execute('UPDATE characters SET current_hp=LEAST(GREATEST(0,current_hp),hp_max),current_mp=LEAST(GREATEST(0,current_mp),mp_max) WHERE id=?', [character.id]);
  const [afterRows] = await connection.execute<RowDataPacket[]>(`SELECT ${columns.join(',')} FROM characters WHERE id=?`, [character.id]);
  const changed = columns.some(column => Number(beforeRows[0]?.[column]) !== Number(afterRows[0]?.[column]));
  return { name: character.name, changed, fixed: changed ? '发现角色属性或生命/魔力数值异常，已重新计算并校正。' : '角色属性正常，未发现需要修正的数据。' };
});

export const auditInventory = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterIdFor(connection, qqUserId);
  const [removed] = await connection.execute<any>('DELETE pi FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND (pi.quantity<=0 OR (i.stackable=0 AND pi.quantity>1))', [character.id]);
  const [quickRemoved] = await connection.execute<any>('DELETE qi FROM player_quick_items qi LEFT JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id WHERE qi.character_id=? AND pi.item_id IS NULL', [character.id]);
  const [artifacts] = await connection.execute<(RowDataPacket & { slot: string; item_id: number; instance_id: number | null })[]>(`SELECT pe.slot,pe.item_id,pe.instance_id FROM player_equipment pe
    JOIN item_definitions i ON i.id=pe.item_id
    WHERE pe.character_id=? AND i.rarity='神器'
    ORDER BY FIELD(pe.slot,'weapon','offhand','shoulder','upper','waist','lower','feet','necklace','bracelet','ring') FOR UPDATE`, [character.id]);
  const excessArtifacts = artifacts.slice(1);
  for (const artifact of excessArtifacts) {
    if (artifact.instance_id === null) {
      await connection.execute('INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max) VALUES (?,?,100,100,100)', [character.id, artifact.item_id]);
    }
  }
  if (excessArtifacts.length) {
    const slots = excessArtifacts.map(() => '?').join(',');
    await connection.execute(`DELETE FROM player_equipment WHERE character_id=? AND slot IN (${slots})`, [character.id, ...excessArtifacts.map(artifact => artifact.slot)]);
    await recalculateCharacterStats(connection, Number(character.id));
  }
  const [forgedRows] = await connection.execute<(RowDataPacket & { id: number; item_category: string; weapon_type: string | null; required_level: number; rarity: string; effect_json: unknown; forge_primary_json: unknown })[]>(`SELECT ii.id,i.item_category,i.weapon_type,i.required_level,i.rarity,COALESCE(ii.effect_json,i.effect_json) AS effect_json,ii.forge_primary_json
    FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    WHERE ii.character_id=? AND i.code LIKE 'crafted\\_%' FOR UPDATE`, [character.id]);
  const invalidInstances = forgedRows.filter(item => invalidForgedEquipment(item.item_category, item.weapon_type, Number(item.required_level), item.rarity, item.effect_json, item.forge_primary_json)).map(item => Number(item.id));
  const [equipmentRows] = await connection.execute<(RowDataPacket & { id: number; code: string; item_category: string; weapon_type: string | null; effect_json: unknown })[]>(`SELECT ii.id,i.code,i.item_category,i.weapon_type,COALESCE(ii.effect_json,i.effect_json) AS effect_json FROM player_item_instances ii
    JOIN item_definitions i ON i.id=ii.item_id WHERE ii.character_id=? AND i.item_type='equipment' AND i.rarity<>'神器' FOR UPDATE`, [character.id]);
  const percentInstances = equipmentRows.filter(item => hasLegacyPercentAffix(item.effect_json, item.code.startsWith('crafted_'), item.item_category, item.weapon_type)).map(item => Number(item.id));
  const invalidShieldInstances = equipmentRows.filter(item => item.weapon_type === '盾牌' && (Number(jsonRecord(item.effect_json).physicalAttack ?? 0) !== 0 || Number(jsonRecord(item.effect_json).magicAttack ?? 0) !== 0)).map(item => Number(item.id));
  const recycledInstances = [...new Set([...invalidInstances, ...percentInstances, ...invalidShieldInstances])];
  if (recycledInstances.length) {
    const marks = recycledInstances.map(() => '?').join(',');
    await connection.execute(`DELETE FROM player_equipment WHERE character_id=? AND instance_id IN (${marks})`, [character.id, ...recycledInstances]);
    await connection.execute(`DELETE FROM player_item_instances WHERE character_id=? AND id IN (${marks})`, [character.id, ...recycledInstances]);
  }
  if (invalidInstances.length || recycledInstances.length) await recalculateCharacterStats(connection, Number(character.id));
  const removedCount = Number(removed.affectedRows); const quickRemovedCount = Number(quickRemoved.affectedRows); const artifactCount = excessArtifacts.length; const forgedCount = invalidInstances.length; const percentCount = percentInstances.filter(id => !invalidInstances.includes(id)).length; const shieldCount = invalidShieldInstances.filter(id => !invalidInstances.includes(id) && !percentInstances.includes(id)).length; const recycledCount = recycledInstances.length;
  const changed = Boolean(removedCount || quickRemovedCount || artifactCount || forgedCount || recycledCount);
  return { name: character.name, changed, fixed: changed ? `已清除 ${removedCount} 条异常背包记录、${quickRemovedCount} 条失效快捷道具${artifactCount ? `，并卸下 ${artifactCount} 件超额神器至背包` : ''}${forgedCount ? `，并回收 ${forgedCount} 件超出现阶段打造或熔铸规则的装备` : ''}${percentCount ? `，并回收 ${percentCount} 件含百分比属性词条的非神器装备` : ''}${shieldCount ? `，并回收 ${shieldCount} 件含攻击属性的违规盾牌` : ''}。` : '背包与装备记录正常，未发现需要修正的数据。' };
});

/** 管理员定向清空背包：已装备实例保留，其余堆叠物品、装备和异械一并移除。 */
export const clearPlayerBackpack = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterIdFor(connection, qqUserId);
  const [stacked] = await connection.execute<any>('DELETE FROM player_inventory WHERE character_id=?', [character.id]);
  await connection.execute('DELETE FROM player_quick_items WHERE character_id=?', [character.id]);
  await connection.execute('DELETE FROM player_forge_materials WHERE character_id=?', [character.id]);
  await connection.execute('DELETE FROM player_alchemy_sessions WHERE character_id=?', [character.id]);
  const [instances] = await connection.execute<any>(`DELETE ii FROM player_item_instances ii
    LEFT JOIN player_equipment pe ON pe.character_id=ii.character_id AND (pe.instance_id=ii.id OR (pe.instance_id IS NULL AND pe.item_id=ii.item_id))
    WHERE ii.character_id=? AND pe.character_id IS NULL`, [character.id]);
  return { name: character.name, stacked: Number(stacked.affectedRows), instances: Number(instances.affectedRows) };
});

export const auditPlayerState = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterIdFor(connection, qqUserId);
  const [storyRows] = await connection.execute<(RowDataPacket & { status: string })[]>('SELECT status FROM player_story_progress WHERE character_id=? AND story_code=\'forest_guide\' FOR UPDATE', [character.id]);
  const storyStatus = storyRows[0]?.status;
  const [sessions] = await connection.execute<(RowDataPacket & { id: string; forest_slime: number; live_targets: number; live_members: number })[]>(`SELECT cs.id,
    EXISTS(SELECT 1 FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=cs.id AND t.code='forest_slime') AS forest_slime,
    EXISTS(SELECT 1 FROM combat_targets ct WHERE ct.session_id=cs.id AND ct.is_defeated=0) AS live_targets,
    EXISTS(SELECT 1 FROM combat_members cm WHERE cm.session_id=cs.id AND cm.is_defeated=0) AS live_members
    FROM combat_members own JOIN combat_sessions cs ON cs.id=own.session_id
    WHERE own.character_id=? AND cs.state='active' FOR UPDATE`, [character.id]);
  let repairedCombat = 0;
  let repairedStory = false;
  for (const session of sessions) {
    const invalidForestStoryCombat = ['joined', 'declined'].includes(String(storyStatus)) && !Number(session.forest_slime);
    const staleCombat = !Number(session.live_targets) || !Number(session.live_members);
    if (!invalidForestStoryCombat && !staleCombat) continue;
    const state = !Number(session.live_members) ? 'defeat' : !Number(session.live_targets) ? 'victory' : 'escaped';
    await connection.execute('UPDATE combat_sessions SET state=? WHERE id=?', [state, session.id]);
    await connection.execute('UPDATE combat_members SET pending_action=NULL WHERE session_id=?', [session.id]);
    await connection.execute('DELETE FROM combat_status_effects WHERE session_id=?', [session.id]);
    repairedCombat += 1;
    if (invalidForestStoryCombat) repairedStory = true;
  }
  if (repairedStory) {
    await connection.execute('UPDATE player_story_progress SET status=\'awaiting_arrival\',stage=5 WHERE character_id=? AND story_code=\'forest_guide\'', [character.id]);
    await connection.execute('UPDATE characters SET current_hp=GREATEST(1,current_hp),activity_status=\'active\',rest_started_at=NULL WHERE id=?', [character.id]);
  } else if (sessions.some(session => !Number(session.live_members))) {
    await connection.execute('UPDATE characters SET current_hp=1,activity_status=\'resting\',rest_started_at=NOW() WHERE id=?', [character.id]);
  }
  // 到期移动必须交给移动结算逻辑执行：直接删除会让角色永远停在原地。
  const [travel] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_travels WHERE character_id=? AND arrival_at<=NOW(6) LIMIT 1 FOR UPDATE', [character.id]);
  const [activity] = await connection.execute<any>('UPDATE characters SET activity_status=\'active\',rest_started_at=NULL WHERE id=? AND activity_status IN (\'resting\',\'unconscious\') AND current_hp>=hp_max AND current_mp>=mp_max', [character.id]);
  const fixes = [repairedCombat ? `已结束 ${repairedCombat} 场失效战斗` : '', repairedStory ? '已修正异常剧情战斗，下一步可发送“继续剧情”前往百纳镇' : '', travel[0] ? '发现到期移动，已保留并等待自动结算' : '', Number(activity.affectedRows) ? '已解除满生命/魔力的异常休息状态' : ''].filter(Boolean);
  return { name: character.name, changed: fixes.length > 0, fixed: fixes.length ? `${fixes.join('；')}。` : '玩家状态正常，未发现卡死的战斗、移动或休息状态。' };
});

export const auditSkills = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterIdFor(connection, qqUserId);
  const migrated = await ensureSkillPointLedger(connection, character.id, Number(character.skill_points));
  type SkillAuditRow = RowDataPacket & { skill_id: number; level: number; max_level: number };
  const [skills] = await connection.execute<SkillAuditRow[]>('SELECT ps.skill_id,ps.level,s.max_level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? FOR UPDATE', [character.id]);
  let changed = migrated;
  for (const skill of skills) {
    const level = Math.min(Math.max(1, Number(skill.level)), Number(skill.max_level));
    if (level !== Number(skill.level)) { await connection.execute('UPDATE player_skills SET level=? WHERE character_id=? AND skill_id=?', [level, character.id, skill.skill_id]); changed = true; }
  }
  const [specializationFix] = await connection.execute<any>('UPDATE player_skill_specializations SET level=LEAST(GREATEST(level,1),CASE WHEN specialization=\'overcharge\' AND skill_id IN (SELECT id FROM skill_definitions WHERE code IN (\'longsword_mastery\',\'shield_mastery\',\'staff_mastery\',\'spellbook_mastery\',\'orb_mastery\',\'dagger_mastery\',\'fistblade_mastery\')) THEN 5 WHEN specialization=\'instant\' AND skill_id IN (SELECT id FROM skill_definitions WHERE code IN (\'longsword_mastery\',\'shield_mastery\',\'staff_mastery\',\'spellbook_mastery\',\'orb_mastery\',\'dagger_mastery\',\'fistblade_mastery\')) THEN 6 ELSE 100 END) WHERE character_id=?', [character.id]);
  if (Number(specializationFix.affectedRows)) changed = true;
  const [appraisalFix] = await connection.execute<any>('UPDATE player_appraisal_progress SET range_level=LEAST(GREATEST(range_level,1),10),information_level=LEAST(GREATEST(information_level,1),4) WHERE character_id=?', [character.id]);
  if (Number(appraisalFix.affectedRows)) changed = true;
  const summary = await skillPointLedgerSummary(connection, character.id);
  const pointMismatch = Number(character.skill_points) !== summary.balance;
  if (pointMismatch) { await connection.execute('UPDATE characters SET skill_points=? WHERE id=?', [Math.max(0, summary.balance), character.id]); changed = true; }
  const notes = [
    migrated ? '已为旧存档建立技能点账本起始余额；此前未留存的历史消耗无法精确回溯。' : '',
    pointMismatch ? `已按技能点账本校正剩余技能点为 ${Math.max(0, summary.balance)}。` : '',
    `技能点账本：获得 ${summary.earned} 点｜实际消耗 ${summary.spent} 点｜当前 ${Math.max(0, summary.balance)} 点。`
  ].filter(Boolean);
  const fixed = notes.join('') || '技能数据正常。';
  return { name: character.name, changed, fixed };
});

/** 管理员全服核查：逐位角色沿用单人核查逻辑，单个玩家异常不会中断全服处理。 */
export const auditAllPlayers = async () => {
  const pool = await getPool();
  const [players] = await pool.execute<(RowDataPacket & { qq_user_id: string; name: string })[]>('SELECT p.qq_user_id,c.name FROM characters c JOIN players p ON p.id=c.player_id ORDER BY c.id');
  const failed: { name: string; message: string }[] = [];
  const results: { name: string; fixes: string[] }[] = [];
  let completed = 0;
  for (const player of players) {
    try {
      const character = await auditCharacter(String(player.qq_user_id));
      const inventory = await auditInventory(String(player.qq_user_id));
      const skills = await auditSkills(String(player.qq_user_id));
      const state = await auditPlayerState(String(player.qq_user_id));
      completed += 1;
      const fixes = [character, inventory, skills, state].filter(item => item.changed).map(item => item.fixed);
      if (fixes.length) results.push({ name: character.name, fixes });
    } catch (error) {
      failed.push({ name: player.name, message: error instanceof Error ? error.message : '未知错误' });
    }
  }
  return { total: players.length, completed, failed, results };
};
