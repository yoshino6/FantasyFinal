const forestStoryPartyCondition = `EXISTS (
  SELECT 1 FROM party_members story_pm JOIN characters story_member ON story_member.id=story_pm.character_id
  LEFT JOIN player_story_progress story_progress ON story_progress.character_id=story_member.id AND story_progress.story_code='forest_guide'
  WHERE story_pm.party_id=p.id AND (story_member.npc_code REGEXP '^npc_forest_(warrior|mage|priest)(_[0-9]+)?$'
    OR story_progress.status IN ('joined','declined','awaiting_arrival','arrival_story','guild_story'))
)`;
const isForestStoryParty = async (connection, partyId) => {
    const [rows] = await connection.execute(`SELECT p.id FROM parties p WHERE p.id=? AND ${forestStoryPartyCondition} LIMIT 1`, [partyId]);
    return rows.length > 0;
};
const assertPartyNotStory = async (connection, partyId) => {
    if (await isForestStoryParty(connection, partyId))
        throw new Error('这是主线剧情队伍，暂不能加入、退出或更换队长。请继续剧情，抵达百纳镇后会自动解散。');
};

export { assertPartyNotStory, forestStoryPartyCondition, isForestStoryParty };
