import { randomInt } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { withTransaction } from '../database/pool';
import { archiveDeletedAccount } from './account-deletion-record.service';
import { removePlayerAccountData } from './account-cleanup.service';

type PlayerRow = RowDataPacket & { id: number };
type CharacterRow = RowDataPacket & { id: number; name: string; delete_confirmation_code: string | null; delete_confirmation_expires_at: Date | null };

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
 * 保存快照后清理关联资料，并额外处理成交订单、战斗发起记录和队长等非级联引用。
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
  return removePlayerAccountData(connection, qqUserId);
});
