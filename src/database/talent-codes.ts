import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { retiredTalentCodes } from './talent-code-map';

const identifier = (value: string) => `\`${value.replaceAll('`', '``')}\``;

/** Include soft references (auto battle and sparring) as well as declared foreign keys. */
const skillReferences = async (connection: PoolConnection) => {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT TABLE_NAME,COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='skill_definitions' AND REFERENCED_COLUMN_NAME='id'
    UNION SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME IN ('skill_id','discovered_skill_id')`);
  return rows;
};

/** Rename the definition in place so inventory, skill ownership and SP history keep their real IDs. */
export const migrateTalentCodesWithConnection = async (connection: PoolConnection) => {
  let migrated = 0;
  let references: RowDataPacket[] | undefined;
  for (const [oldCode, code] of Object.entries(retiredTalentCodes)) {
    const [definitions] = await connection.execute<RowDataPacket[]>('SELECT * FROM skill_definitions WHERE code IN (?,?) ORDER BY id FOR UPDATE', [oldCode, code]);
    const old = definitions.find(row => row.code === oldCode), current = definitions.find(row => row.code === code);
    if (old && current && Number(old.id) !== Number(current.id)) {
      if ([old, current].some(row => row.category !== 'bound' || row.skill_kind !== '绑定')) {
        throw new Error(`天赋编号迁移冲突：${oldCode}与${code}包含非绑定技能，请核查定义。`);
      }
      references ??= await skillReferences(connection);
      for (const reference of references) {
        const [used] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM ${identifier(reference.TABLE_NAME)} WHERE ${identifier(reference.COLUMN_NAME)}=? LIMIT 1 FOR UPDATE`, [current.id]);
        if (used.length) throw new Error(`天赋编号迁移冲突：${code}在${reference.TABLE_NAME}已有引用，未合并或删除，请核查。`);
      }
      // Only discard an unused seeded duplicate. The old ID and every reference stay intact.
      await connection.execute('DELETE FROM skill_definitions WHERE id=?', [current.id]);
    }
    if (old) await connection.execute('UPDATE skill_definitions SET code=? WHERE id=?', [code, old.id]);
    const [holders] = await connection.execute<RowDataPacket[]>('SELECT character_id FROM player_blessings WHERE code=? FOR UPDATE', [oldCode]);
    for (const holder of holders) {
      await connection.execute('UPDATE player_blessings SET code=? WHERE character_id=? AND code=?', [code, holder.character_id, oldCode]);
      await connection.execute('UPDATE player_talent_state SET revision=revision+1 WHERE character_id=?', [holder.character_id]);
      await connection.execute('DELETE FROM player_talent_events WHERE character_id=?', [holder.character_id]);
      migrated++;
    }
  }
  return migrated;
};

export const migrateTalentCodes = async (pool: Pool) => {
  const connection = await pool.getConnection();
  try { await connection.beginTransaction(); const migrated=await migrateTalentCodesWithConnection(connection); await connection.commit(); return migrated; }
  catch(error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
};
