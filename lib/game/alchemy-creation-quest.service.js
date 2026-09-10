import { withTransaction } from '../database/pool.js';
import { craftCharacterId } from './alchemy-journal.service.js';

const alchemyCreationQuestCode = 'alchemy_world_beyond_bottles';
const alchemyCreationQuestTitle = '瓶中之外的世界';
const alchemyCreationLesson = '晴儿从柜台下翻出一本卷角手记，纸页间滚出一枚小齿轮。“药瓶可装不下炼金的全部秘密。”她笑着画下灵魂与躯壳相连的阵纹：“这叫点灵；再以不同原液滋养，便是育成。它会慢慢长出自己的本领和脾气。”你正要伸手，她却合上手记：“先别急！灵枢素体得找四级解构师想办法构造。我教你点亮它，可不替你拧螺丝哟。”';
const alchemyCreationQuestFor = async (connection, characterId) => {
    const [rows] = await connection.execute(`SELECT c.secondary_profession_code,COALESCE(s.level,0) level,q.status
    FROM characters c LEFT JOIN player_secondary_professions s ON s.character_id=c.id AND s.profession_code='alchemist'
    LEFT JOIN player_side_quests q ON q.character_id=c.id AND q.quest_code=? WHERE c.id=?`, [alchemyCreationQuestCode, characterId]);
    const eligible = rows[0]?.secondary_profession_code === 'alchemist' && Number(rows[0]?.level ?? 0) >= 4;
    if (eligible && !rows[0]?.status)
        await connection.execute('INSERT IGNORE INTO player_side_quests(character_id,quest_code) VALUES(?,?)', [characterId, alchemyCreationQuestCode]);
    const learned = rows[0]?.status === 'claimed';
    return { eligible, unlocked: eligible && learned, pending: eligible && !learned };
};
const alchemyCreationQuest = (user) => withTransaction(async (connection) => {
    const id = await craftCharacterId(connection, user, true);
    return alchemyCreationQuestFor(connection, id);
});
const assertAlchemyCreationUnlocked = async (connection, characterId) => {
    const quest = await alchemyCreationQuestFor(connection, characterId);
    if (!quest.eligible)
        throw new Error('需要当前副职业为炼金师，且炼金达到 4 级。');
    if (!quest.unlocked)
        throw new Error('请先前往糖水屋，向晴儿请教「瓶中之外的世界」，学习点灵与育成。');
};
const learnAlchemyCreation = (user) => withTransaction(async (connection) => {
    const id = await craftCharacterId(connection, user, true);
    const quest = await alchemyCreationQuestFor(connection, id);
    if (!quest.eligible)
        throw new Error('炼金达到 4 级后，再来向晴儿请教吧。');
    const [nearby] = await connection.execute(`SELECT n.id FROM map_npcs n JOIN characters c
    ON n.region_id=c.current_region_id AND n.pos_x=c.pos_x AND n.pos_y=c.pos_y AND n.pos_z=c.pos_z
    WHERE c.id=? AND n.code='alchemy_sweetshop' LIMIT 1`, [id]);
    if (!nearby.length)
        throw new Error('请先到糖水屋晴儿所在的坐标，再与她交谈。');
    await connection.execute("UPDATE player_side_quests SET status='claimed',completed_at=NOW(),claimed_at=NOW() WHERE character_id=? AND quest_code=? AND status<>'claimed'", [id, alchemyCreationQuestCode]);
    return { alreadyLearned: quest.unlocked, story: alchemyCreationLesson };
});

export { alchemyCreationLesson, alchemyCreationQuest, alchemyCreationQuestCode, alchemyCreationQuestFor, alchemyCreationQuestTitle, assertAlchemyCreationUnlocked, learnAlchemyCreation };
