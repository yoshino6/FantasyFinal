import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

type PlayerRow = RowDataPacket & { id: number };
type CharacterRow = RowDataPacket & { id: number; name: string };
type SessionRow = RowDataPacket & { id: string };
type PartyRow = RowDataPacket & { id: string };
type MemberRow = RowDataPacket & { character_id: number };

/** 删除账号自身数据，并安全结束关联战斗、转移或解散队伍。调用方应先决定是否需要保存快照。 */
export const removePlayerAccountData = async (connection: PoolConnection, qqUserId: string) => {
  const [players] = await connection.execute<PlayerRow[]>('SELECT id FROM players WHERE qq_user_id=? FOR UPDATE', [qqUserId]);
  const player = players[0]; if (!player) throw new Error('当前账号尚未创建游戏数据。');
  const [characters] = await connection.execute<CharacterRow[]>('SELECT id,name FROM characters WHERE player_id=? FOR UPDATE', [player.id]);
  const character = characters[0]; let endedCombats = 0; let transferredParties = 0; let disbandedParties = 0;
  if (character) {
    const [sessions] = await connection.execute<SessionRow[]>(`SELECT DISTINCT cs.id FROM combat_sessions cs LEFT JOIN combat_members cm ON cm.session_id=cs.id WHERE cs.character_id=? OR cm.character_id=?`, [character.id, character.id]);
    for (const session of sessions) { await connection.execute('DELETE FROM combat_sessions WHERE id=?', [session.id]); endedCombats++; }
    const [ledParties] = await connection.execute<PartyRow[]>('SELECT id FROM parties WHERE leader_character_id=? FOR UPDATE', [character.id]);
    for (const party of ledParties) {
      const [successors] = await connection.execute<MemberRow[]>('SELECT character_id FROM party_members WHERE party_id=? AND character_id<>? ORDER BY joined_at,character_id LIMIT 1 FOR UPDATE', [party.id, character.id]);
      if (successors[0]) { await connection.execute('UPDATE parties SET leader_character_id=? WHERE id=?', [successors[0].character_id, party.id]); transferredParties++; }
      else { await connection.execute('DELETE FROM parties WHERE id=?', [party.id]); disbandedParties++; }
    }
    await connection.execute('DELETE FROM party_members WHERE character_id=?', [character.id]);
    await connection.execute('DELETE FROM characters WHERE id=?', [character.id]);
  }
  await connection.execute('DELETE FROM admin_mail_edits WHERE admin_qq_user_id=?', [qqUserId]);
  await connection.execute('DELETE FROM game_permissions WHERE qq_user_id=?', [qqUserId]);
  await connection.execute('DELETE FROM players WHERE id=?', [player.id]);
  return { characterName: character?.name ?? null, endedCombats, transferredParties, disbandedParties };
};
