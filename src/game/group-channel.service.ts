import { getPool } from '../database/pool';

/** 记录机器人已知的 QQ 群。私聊触发的全群公告依赖这份持久化名册。 */
export const rememberGroupChannel = async (groupOpenId: string, botId?: string) => {
  const groupId = String(groupOpenId ?? '').trim();
  const activeBotId = String(botId ?? '').trim();
  if (!groupId || !activeBotId) return;
  const pool = await getPool();
  await pool.execute(`INSERT INTO bot_group_channels (bot_id,group_openid,last_seen_at)
    VALUES (?,?,NOW()) ON DUPLICATE KEY UPDATE last_seen_at=VALUES(last_seen_at)`, [activeBotId, groupId]);
};

export const knownGroupChannels = async (botId?: string) => {
  const activeBotId = String(botId ?? '').trim();
  if (!activeBotId) return [];
  const pool = await getPool();
  const [rows] = await pool.execute<{ group_openid: string }[]>(
    'SELECT group_openid FROM bot_group_channels WHERE bot_id=? ORDER BY last_seen_at DESC',
    [activeBotId]
  );
  return rows.map(row => String(row.group_openid)).filter(Boolean);
};
