import { randomInt } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { withTransaction } from '../database/pool';
import { archiveDeletedAccount } from './account-deletion-record.service';

type PlayerRow = RowDataPacket & { id: number };
type CharacterRow = RowDataPacket & { id: number; name: string; delete_confirmation_code: string | null; delete_confirmation_expires_at: Date | null };
type SessionRow = RowDataPacket & { id: string };
type PartyRow = RowDataPacket & { id: string };
type MemberRow = RowDataPacket & { character_id: number };

/** 生成一次性注销验证码；仅持有当前验证码的玩家可继续执行删除。 */
export const requestAccountDeletion = async (qqUserId: string) => withTransaction(async connection => {
  const [players] = await connection.execute<PlayerRow[]>('SELECT id FROM players WHERE qq_user_id=? FOR UPDATE', [qqUserId]);
  const player = players[0];
  if (!player) throw new Error('当前账号尚未创建游戏数据。');
  const [characters] = await connection.execute<CharacterRow[]>('SELECT id,name,delete_confirmation_code,delete_confirmation_expires_at FROM characters WHERE player_id=? FOR UPDATE', [player.id]);
  const character = characters[0];
  if (!character) throw new Error('当前账号尚未创建角色。');
  const code = String(randomInt(100000, 1_000_000));
  await connection.execute('UPDATE characters SET delete_confirmation_code=?,delete_confirmation_expires_at=DATE_ADD(NOW(),INTERVAL 10 MINUTE) WHERE id=?', [code, character.id]);
  return { characterName: character.name, code, expiresMinutes: 10 };
});

/**
 * 清除一个 QQ 账号在游戏中的全部持久化数据。
 * 角色关联表均由外键级联删除；这里额外处理无级联的战斗发起记录和队长引用。
 */
export const deletePlayerAccount = async (qqUserId: string, confirmationCode: string) => withTransaction(async connection => {
  const [players] = await connection.execute<PlayerRow[]>('SELECT id FROM players WHERE qq_user_id=? FOR UPDATE', [qqUserId]);
  const player = players[0];
  if (!player) throw new Error('当前账号尚未创建游戏数据。');

  const [characters] = await connection.execute<CharacterRow[]>('SELECT id,name,delete_confirmation_code,delete_confirmation_expires_at FROM characters WHERE player_id=? FOR UPDATE', [player.id]);
  const character = characters[0];
  if (!character?.delete_confirmation_code || !character.delete_confirmation_expires_at) throw new Error('请先发送“注销账户”获取验证码。');
  if (new Date(character.delete_confirmation_expires_at).getTime() <= Date.now()) throw new Error('注销验证码已过期，请重新发送“注销账户”。');
  if (!/^\d{6}$/.test(confirmationCode) || confirmationCode !== character.delete_confirmation_code) throw new Error('注销验证码错误，请核对后重试。');
  await archiveDeletedAccount(connection, qqUserId);
  let endedCombats = 0; let transferredParties = 0; let disbandedParties = 0;

  if (character) {
    const [sessions] = await connection.execute<SessionRow[]>(
      `SELECT DISTINCT cs.id FROM combat_sessions cs
       LEFT JOIN combat_members cm ON cm.session_id=cs.id
       WHERE cs.character_id=? OR cm.character_id=?`,
      [character.id, character.id]
    );
    for (const session of sessions) {
      await connection.execute('DELETE FROM combat_sessions WHERE id=?', [session.id]);
      endedCombats++;
    }

    const [ledParties] = await connection.execute<PartyRow[]>('SELECT id FROM parties WHERE leader_character_id=? FOR UPDATE', [character.id]);
    for (const party of ledParties) {
      const [successors] = await connection.execute<MemberRow[]>(
        'SELECT character_id FROM party_members WHERE party_id=? AND character_id<>? ORDER BY joined_at,character_id LIMIT 1 FOR UPDATE',
        [party.id, character.id]
      );
      if (successors[0]) {
        await connection.execute('UPDATE parties SET leader_character_id=? WHERE id=?', [successors[0].character_id, party.id]);
        transferredParties++;
      } else {
        await connection.execute('DELETE FROM parties WHERE id=?', [party.id]);
        disbandedParties++;
      }
    }
    await connection.execute('DELETE FROM party_members WHERE character_id=?', [character.id]);
    await connection.execute('DELETE FROM characters WHERE id=?', [character.id]);
  }

  await connection.execute('DELETE FROM admin_mail_edits WHERE admin_qq_user_id=?', [qqUserId]);
  await connection.execute('DELETE FROM game_permissions WHERE qq_user_id=?', [qqUserId]);
  await connection.execute('DELETE FROM players WHERE id=?', [player.id]);
  return { characterName: character?.name ?? null, endedCombats, transferredParties, disbandedParties };
});
