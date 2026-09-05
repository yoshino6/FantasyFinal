import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

export type SkillPointChangeKind =
  | 'initial_grant'
  | 'level_up'
  | 'learn_skill'
  | 'upgrade_skill'
  | 'upgrade_specialization'
  | 'upgrade_appraisal'
  | 'legacy_opening_balance';

export const recordSkillPointChange = async (
  connection: PoolConnection,
  characterId: number,
  amount: number,
  kind: SkillPointChangeKind,
  skillId: number | null = null,
  detail: string | null = null
) => {
  if (!amount && kind !== 'legacy_opening_balance') return;
  await connection.execute(
    'INSERT INTO player_skill_point_ledger (character_id,amount,change_kind,skill_id,detail) VALUES (?,?,?,?,?)',
    [characterId, Math.trunc(amount), kind, skillId, detail]
  );
};

export const ensureSkillPointLedger = async (connection: PoolConnection, characterId: number, currentPoints: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { total: number })[]>(
    'SELECT COUNT(*) AS total FROM player_skill_point_ledger WHERE character_id=?',
    [characterId]
  );
  if (Number(rows[0]?.total ?? 0) > 0) return false;
  await recordSkillPointChange(connection, characterId, Math.max(0, Math.trunc(currentPoints)), 'legacy_opening_balance', null, '技能点账本启用时的旧存档可用余额');
  return true;
};

export const skillPointLedgerSummary = async (connection: PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { earned: number; spent: number; balance: number })[]>(
    `SELECT
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END),0) AS earned,
      COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END),0) AS spent,
      COALESCE(SUM(amount),0) AS balance
    FROM player_skill_point_ledger
    WHERE character_id=?`,
    [characterId]
  );
  const row = rows[0];
  return { earned: Number(row?.earned ?? 0), spent: Number(row?.spent ?? 0), balance: Number(row?.balance ?? 0) };
};

/** 转职洗点：只返还账本中已记录的投入，已发现技能保留为可重新学习状态。 */
export const resetSkillPointAllocation = async (connection: PoolConnection, characterId: number) => {
  const [characters] = await connection.execute<(RowDataPacket & { skill_points: number })[]>('SELECT skill_points FROM characters WHERE id=? FOR UPDATE', [characterId]);
  const character = characters[0]; if (!character) throw new Error('角色不存在。');
  await ensureSkillPointLedger(connection, characterId, Number(character.skill_points));
  const summary = await skillPointLedgerSummary(connection, characterId);
  const [learnedRows] = await connection.execute<(RowDataPacket & { skill_id: number })[]>(`SELECT DISTINCT skill_id FROM player_skill_point_ledger
    WHERE character_id=? AND change_kind='learn_skill' AND amount<0 AND skill_id IS NOT NULL`, [characterId]);
  const learnedSkillIds = learnedRows.map(row => Number(row.skill_id));
  await connection.execute('DELETE FROM player_skill_specializations WHERE character_id=?', [characterId]);
  await connection.execute('DELETE FROM player_appraisal_progress WHERE character_id=?', [characterId]);
  if (learnedSkillIds.length) {
    const placeholders = learnedSkillIds.map(() => '?').join(',');
    for (const table of ['player_auto_battle_actions', 'player_pvp_auto_battle_actions']) {
      await connection.execute(`UPDATE ${table} SET skill_id=NULL WHERE character_id=? AND skill_id IN (${placeholders})`, [characterId, ...learnedSkillIds]);
    }
    await connection.execute(`DELETE FROM player_skills WHERE character_id=? AND skill_id IN (${placeholders})`, [characterId, ...learnedSkillIds]);
  }
  await connection.execute('UPDATE player_skills SET level=1,quick_slot=NULL,passive_linked=0 WHERE character_id=?', [characterId]);
  await connection.execute('DELETE FROM player_skill_point_ledger WHERE character_id=? AND amount<0', [characterId]);
  await connection.execute('UPDATE characters SET skill_points=? WHERE id=?', [summary.earned, characterId]);
  return { restoredPoints: summary.spent, availablePoints: summary.earned, removedSkills: learnedSkillIds.length };
};
