import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

/** 战斗内的动作栏与自动战斗设置必须保持开战快照，不能中途修改。 */
export const assertCombatLoadoutMutable = async (connection: PoolConnection, characterId: number) => {
  await (await import('./negotiation.service')).assertNoNegotiation(connection, characterId);
  const [pve] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id
    WHERE cm.character_id=? AND cs.state='active' LIMIT 1 FOR UPDATE`, [characterId]);
  const [pvp] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_pvp_battle_sessions
    WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?) LIMIT 1 FOR UPDATE`, [characterId, characterId]);
  if (pve[0] || pvp[0]) throw new Error('战斗中不能调整快捷技能、快捷道具、异械或自动战斗配置，请在战斗结束后再试。');
};

/** 仅锁定当前隐藏职业登记的实例，普通背包物品仍沿用原有规则。调用方须先锁角色。 */
export const assertHiddenInstanceMutable = async (connection: PoolConnection, characterId: number, instanceId: number) => {
  const [professions] = await connection.execute<RowDataPacket[]>('SELECT profession_code FROM player_advanced_professions WHERE character_id=?', [characterId]);
  const profession = String(professions[0]?.profession_code ?? '');
  if (!['weapon_master', 'inventor'].includes(profession)) return;
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT config_json FROM player_hidden_profession_loadouts WHERE character_id=? AND profession_code=?', [characterId, profession]);
  const raw = rows[0]?.config_json;
  const config = typeof raw === 'string' ? JSON.parse(raw) : raw ?? {};
  const instances = config[profession === 'weapon_master' ? 'weapons' : 'devices'];
  if (!Array.isArray(instances) || !instances.map(Number).includes(instanceId)) return;
  try { await assertCombatLoadoutMutable(connection, characterId); }
  catch (error) {
    if (error instanceof Error && error.message.startsWith('战斗中不能调整')) throw new Error('战斗中不能出售、寄售或改造已登记在器阵、主脑中的物品，请在战斗结束后再试。');
    throw error;
  }
};
