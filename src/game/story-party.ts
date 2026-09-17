import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

// p 是 parties 的别名。兼容旧剧情队伍与队长已错误退队后留下的 NPC 队伍，无需迁移玩家存档。
export const forestStoryPartyCondition = `EXISTS (
  SELECT 1 FROM party_members story_pm JOIN characters story_member ON story_member.id=story_pm.character_id
  LEFT JOIN player_story_progress story_progress ON story_progress.character_id=story_member.id AND story_progress.story_code='forest_guide'
  WHERE story_pm.party_id=p.id AND (story_member.npc_code REGEXP '^npc_forest_(warrior|mage|priest)(_[0-9]+)?$'
    OR story_progress.status IN ('joined','declined','awaiting_arrival','arrival_story','guild_story'))
)`;

export const isForestStoryParty = async (connection: Pool | PoolConnection, partyId: string) => {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT p.id FROM parties p WHERE p.id=? AND ${forestStoryPartyCondition} LIMIT 1`, [partyId]);
  return rows.length > 0;
};

export const assertPartyNotStory = async (connection: Pool | PoolConnection, partyId: string) => {
  if (await isForestStoryParty(connection, partyId)) throw new Error('这是主线剧情队伍，暂不能加入、退出或更换队长。请继续剧情，抵达百纳镇后会自动解散。');
};
