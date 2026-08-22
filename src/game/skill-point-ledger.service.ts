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
