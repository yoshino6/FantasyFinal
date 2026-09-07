import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

/** 战斗内的动作栏与自动战斗设置必须保持开战快照，不能中途修改。 */
export const assertCombatLoadoutMutable = async (connection: PoolConnection, characterId: number) => {
  const [pve] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id
    WHERE cm.character_id=? AND cs.state='active' LIMIT 1 FOR UPDATE`, [characterId]);
  const [pvp] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_pvp_battle_sessions
    WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?) LIMIT 1 FOR UPDATE`, [characterId, characterId]);
  if (pve[0] || pvp[0]) throw new Error('战斗中不能调整快捷技能、快捷道具、异械或自动战斗配置，请在战斗结束后再试。');
};
