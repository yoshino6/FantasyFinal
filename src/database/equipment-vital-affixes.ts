import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const migrationCode = 'equipment_vital_affixes_half_v1';
const forgedDefinition = "i.item_type='equipment' AND i.rarity<>'神器' AND (LEFT(i.code,8)='crafted_' OR LEFT(i.code,5)='epic_' OR LEFT(i.code,11)='owner_test_')";

/** 只换算固定生命/魔力；不改百分比、品质、主属性与史诗效果。 */
export const halveEquipmentVitalAffixes = (value: unknown, primary: unknown = []): Record<string, unknown> | null => {
  if (value === null || value === undefined) return null;
  const effect = typeof value === 'string' ? JSON.parse(value) : value;
  const primaryKeys = typeof primary === 'string' ? JSON.parse(primary) : primary;
  const result = { ...effect };
  for (const key of ['hpMax', 'mpMax']) {
    if (Array.isArray(primaryKeys) && primaryKeys.includes(key)) continue;
    if (typeof result[key] === 'number' && Number.isFinite(result[key])) result[key] = Math.round(result[key] * 50) / 100;
  }
  return result;
};

/** 装备模板、实例和迁移标记同事务提交；失败回滚，重启/并发初始化不会再砍一次。 */
export const migrateEquipmentVitalAffixes = async (pool: Pool, refresh: (connection: PoolConnection, characterId: number) => Promise<unknown>) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [claim] = await connection.execute<ResultSetHeader>('INSERT IGNORE INTO game_data_migrations (code) VALUES (?)', [migrationCode]);
    if (!claim.affectedRows) { await connection.commit(); return false; }
    const [instances] = await connection.query<(RowDataPacket & { id: number; character_id: number; effect_json: unknown; forge_primary_json: unknown })[]>(`SELECT ii.id,ii.character_id,ii.effect_json,ii.forge_primary_json
      FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
      WHERE ${forgedDefinition} AND (JSON_EXTRACT(COALESCE(ii.effect_json,i.effect_json),'$.hpMax') IS NOT NULL OR JSON_EXTRACT(COALESCE(ii.effect_json,i.effect_json),'$.mpMax') IS NOT NULL) FOR UPDATE`);
    // 旧版只有模板、没有实例的穿戴记录也需要刷新人物缓存。
    const [equipped] = await connection.query<(RowDataPacket & { character_id: number })[]>(`SELECT DISTINCT pe.character_id FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id
      WHERE ${forgedDefinition} AND (JSON_EXTRACT(i.effect_json,'$.hpMax') IS NOT NULL OR JSON_EXTRACT(i.effect_json,'$.mpMax') IS NOT NULL)`);
    for (const row of instances) {
      const effect = halveEquipmentVitalAffixes(row.effect_json, row.forge_primary_json);
      if (effect !== null) await connection.execute('UPDATE player_item_instances SET effect_json=? WHERE id=?', [JSON.stringify(effect), row.id]);
    }
    const [definitions] = await connection.query<(RowDataPacket & { id: number; effect_json: unknown })[]>(`SELECT i.id,i.effect_json FROM item_definitions i
      WHERE ${forgedDefinition} AND (JSON_EXTRACT(i.effect_json,'$.hpMax') IS NOT NULL OR JSON_EXTRACT(i.effect_json,'$.mpMax') IS NOT NULL) FOR UPDATE`);
    for (const row of definitions) await connection.execute('UPDATE item_definitions SET effect_json=? WHERE id=?', [JSON.stringify(halveEquipmentVitalAffixes(row.effect_json)), row.id]);
    for (const id of new Set([...instances, ...equipped].map(row => Number(row.character_id)))) await refresh(connection, id);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
};
