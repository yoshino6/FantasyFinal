import { randomInt } from 'node:crypto';
import { withTransaction } from '../database/pool.js';
import { archiveDeletedAccount } from './account-deletion-record.service.js';
import { removePlayerAccountData } from './account-cleanup.service.js';

const requestAccountDeletion = async (qqUserId) => withTransaction(async (connection) => {
    const [players] = await connection.execute('SELECT id FROM players WHERE qq_user_id=? FOR UPDATE', [qqUserId]);
    const player = players[0];
    if (!player)
        throw new Error('当前账号尚未创建游戏数据。');
    const [characters] = await connection.execute('SELECT id,name,delete_confirmation_code,delete_confirmation_expires_at FROM characters WHERE player_id=? FOR UPDATE', [player.id]);
    const character = characters[0];
    if (!character)
        throw new Error('当前账号尚未创建角色。');
    const code = String(randomInt(100000, 1_000_000));
    await connection.execute('UPDATE characters SET delete_confirmation_code=?,delete_confirmation_expires_at=DATE_ADD(NOW(),INTERVAL 10 MINUTE) WHERE id=?', [code, character.id]);
    return { characterName: character.name, code, expiresMinutes: 10 };
});
const deletePlayerAccount = async (qqUserId, confirmationCode) => withTransaction(async (connection) => {
    const [players] = await connection.execute('SELECT id FROM players WHERE qq_user_id=? FOR UPDATE', [qqUserId]);
    const player = players[0];
    if (!player)
        throw new Error('当前账号尚未创建游戏数据。');
    const [characters] = await connection.execute('SELECT id,name,delete_confirmation_code,delete_confirmation_expires_at FROM characters WHERE player_id=? FOR UPDATE', [player.id]);
    const character = characters[0];
    if (!character?.delete_confirmation_code || !character.delete_confirmation_expires_at)
        throw new Error('请先发送“注销账户”获取验证码。');
    if (new Date(character.delete_confirmation_expires_at).getTime() <= Date.now())
        throw new Error('注销验证码已过期，请重新发送“注销账户”。');
    if (!/^\d{6}$/.test(confirmationCode) || confirmationCode !== character.delete_confirmation_code)
        throw new Error('注销验证码错误，请核对后重试。');
    await archiveDeletedAccount(connection, qqUserId);
    return removePlayerAccountData(connection, qqUserId);
});

export { deletePlayerAccount, requestAccountDeletion };
