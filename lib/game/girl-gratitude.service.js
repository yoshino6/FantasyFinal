import { withTransaction } from '../database/pool.js';

const questCode = 'girl_gratitude';
const pearCode = 'pear_guide';
const gateCode = 'world_gate';
const worldTreeGateCode = 'world_tree_gate';
const exchangeCode = 'canopy_exchange';
const characterFor = async (connection, qqUserId, lock = false) => {
    const [rows] = await connection.execute('SELECT c.id,c.current_region_id,c.pos_x,c.pos_y,c.pos_z FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1' + (lock ? ' FOR UPDATE' : ''), [qqUserId]);
    if (!rows[0])
        throw new Error('请先注册角色。');
    return rows[0];
};
const stageFor = async (connection, characterId, lock = false) => {
    const [rows] = await connection.execute('SELECT stage FROM player_main_quest_progress WHERE character_id=? AND quest_code=? LIMIT 1' + (lock ? ' FOR UPDATE' : ''), [characterId, questCode]);
    return Number(rows[0]?.stage ?? 0);
};
const finishedGoblinQuest = async (connection, characterId) => {
    const [rows] = await connection.execute('SELECT stage FROM player_goblin_king_quest WHERE character_id=? LIMIT 1', [characterId]);
    return Number(rows[0]?.stage ?? 0) >= 11;
};
const requireAt = async (connection, character, code) => {
    const [rows] = await connection.execute('SELECT 1 FROM map_npcs WHERE code=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1', [code, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
    if (!rows[0])
        throw new Error('请先前往对应地点。');
};
const writeStage = (connection, characterId, stage) => connection.execute('INSERT INTO player_main_quest_progress (character_id,quest_code,stage) VALUES (?,?,?) ON DUPLICATE KEY UPDATE stage=VALUES(stage)', [characterId, questCode, stage]);
const girlGratitudeMainQuest = async (qqUserId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId);
    if (!await finishedGoblinQuest(connection, character.id))
        return null;
    const stage = await stageFor(connection, character.id);
    if (stage === 0)
        return { title: '【主线·少女的谢意】', description: '梨子喵似乎有些话想和我说。\n\n前往百纳镇，去见梨子喵。', action: { label: '[前往 梨子喵]', command: '/前往 -22 -196' } };
    if (stage === 1)
        return { title: '【主线·少女的谢意】', description: '梨子喵邀请我去世界树转转。她说有一处地方，只有亲眼见到才说得清楚。\n\n前往界门驿站，使用传送门。', action: { label: '[前往 界门驿站]', command: '/前往 14 -167' } };
    if (stage === 2 || stage === 3)
        return { title: '【主线·少女的谢意】', description: '世界树的枝叶正等待我们。梨子喵走在前面，像藏着许多没能说出口的话。\n\n继续与梨子喵同行。', action: { label: '[继续 同行]', command: '/少女谢意 继续' } };
    if (stage === 4)
        return { title: '【主线·少女的谢意】', description: '梨子喵执意要带我去世界树下的万叶联市。她说那里有一件非要亲手交给我的东西。\n\n前往万叶联市。', action: { label: '[前往 万叶联市]', command: '/前往 4 2' } };
    if (stage === 5)
        return { title: '【主线·少女的谢意】', description: '礼物已经交到我手中。梨子喵还站在万叶联市的灯影下，像在等我给出一个答案。\n\n回应梨子喵的心意。', action: { label: '[回应 梨子喵]', command: '/少女谢意 继续' } };
    return { title: '【主线·少女的谢意】', description: '世界树的叶影替我们记下了这次同行。梨子喵的谢意，已成为旅途中温暖而真实的一页。' };
});
const girlGratitudePending = async (qqUserId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId);
    return await finishedGoblinQuest(connection, character.id) && await stageFor(connection, character.id) === 0;
});
const girlGratitudeStage = async (qqUserId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId);
    return await stageFor(connection, character.id);
});
const startGirlGratitude = (qqUserId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    if (!await finishedGoblinQuest(connection, character.id))
        throw new Error('先解决密林深处的危机。');
    if (await stageFor(connection, character.id, true) !== 0)
        throw new Error('梨子喵已经在等你前往世界树。');
    await requireAt(connection, character, pearCode);
    await writeStage(connection, character.id, 1);
    return '我刚走近，梨子喵就像被踩到尾巴似的跳了一下，手里攥着的小纸包险些掉进水沟。\n\n“你、你来了喵！”她慌忙把纸包藏到背后，耳尖红得厉害，“那个……森林里的事，我想了很久，还是应该认真和你说。”\n\n她低头盯着自己的靴尖，声音越来越小。\n\n“那时候我真的以为，自己会被那些家伙一直困在那里。直到你冲过来的时候，我才放下了心喵……因为我知道，你会把我和那些女孩一起带回去。”\n\n她抬起头，努力摆出平日神气的样子，却没能藏住眼里的湿意。\n\n“所以，今天别急着赶路好不好喵？我想带你去世界树看看。那是我最喜欢的地方喵……也、也是我想第一个带你去的地方喵。”';
});
const teleportToWorldTree = (qqUserId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    if (await stageFor(connection, character.id, true) !== 1)
        throw new Error('梨子喵还没有约你前往世界树。');
    await requireAt(connection, character, gateCode);
    const [regions] = await connection.execute('SELECT id FROM map_regions WHERE code=? LIMIT 1 FOR UPDATE', ['world_tree']);
    if (!regions[0])
        throw new Error('世界树尚未开放。');
    await connection.execute('UPDATE characters SET current_region_id=?,pos_x=0,pos_y=0,pos_z=0 WHERE id=?', [regions[0].id, character.id]);
    await connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity) SELECT ?,id,1 FROM item_definitions WHERE code='map_world_tree' ON DUPLICATE KEY UPDATE quantity=GREATEST(quantity,1),acquired_at=NOW()`, [character.id]);
    await connection.execute(`INSERT IGNORE INTO player_item_codex (character_id,item_id) SELECT ?,id FROM item_definitions WHERE code='map_world_tree'`, [character.id]);
    await writeStage(connection, character.id, 2);
    return '界门驿站中央的环形门框亮起柔和的银蓝色。梨子喵本想潇洒地跨进去，尾巴却先扫到了门槛，整个人一头栽倒。我眼疾手快地一把搂住。\n\n“哎哟喵。”\n\n“你没事吧？”\n\n“这、这是第一次带人跨界门，紧张是正常的喵！”\n\n下一瞬，脚下的街道化作星点。等光芒散去，一株几乎看不见尽头的巨树已擎起天空。根须如山脉般在远处起伏，叶间垂下无数淡金色光丝。\n\n梨子喵悄悄看我一眼，终于笑了。\n\n“欢迎来到世界树喵。先收下这张地图，别一会儿被我带丢了……”\n\n获得【地图·世界树】。';
});
const returnToBainaTown = (qqUserId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    await requireAt(connection, character, worldTreeGateCode);
    const [regions] = await connection.execute('SELECT id FROM map_regions WHERE code=? LIMIT 1 FOR UPDATE', ['baina_town']);
    if (!regions[0])
        throw new Error('百纳镇尚未开放。');
    await connection.execute('UPDATE characters SET current_region_id=?,pos_x=14,pos_y=-150,pos_z=0 WHERE id=?', [regions[0].id, character.id]);
    return '叶脉光纹在环形门中层层展开。短暂的失重感掠过身体，等脚步重新落稳时，百纳镇界门驿站的石砖已在脚下。';
});
const continueGirlGratitude = (qqUserId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    const stage = await stageFor(connection, character.id, true);
    const [regions] = await connection.execute('SELECT code FROM map_regions WHERE id=? LIMIT 1', [character.current_region_id]);
    if (regions[0]?.code !== 'world_tree')
        throw new Error('请先前往世界树。');
    if (stage === 2) {
        await writeStage(connection, character.id, 3);
        return { chapter: 3, exchange: false, text: '梨子喵领着我沿巨根间的木桥前行。她一路都在背诵什么，念错了就用力摇头，猫耳也跟着耷拉下来。\n\n“不是这句……啊，也不是！”她终于恼火地把纸条揉成一团，“我明明练了好多遍的喵。”\n\n我正想问，桥下的根河忽然发出闷响。几根被风蚀空的旧木条接连断裂，梨子喵脚下一空，连惊呼都来不及发出。\n\n我一把扣住她的手腕，将她拉回坚实的根须上。她撞进我怀里，过了好半天才抬头，眼圈红红的。\n\n“又被你救了一次喵……”她把那团皱纸攥得更紧，却没有再松开我的手。' };
    }
    if (stage === 3) {
        await writeStage(connection, character.id, 4);
        return { chapter: 4, exchange: true, text: '我们坐在世界树高处的根台上，脚下是云海与遥远的群山。梨子喵沉默了很久，终于把被揉皱的纸条摊平。\n\n“我以前总觉得，勇者大人什么都会，所以只要跟着你、替你喊加油就好了喵。”她吸了口气，“可在森林里我才明白，害怕的时候有人愿意回来找你，是多么不得了的事。”\n\n她认真望着我，声音仍有些发颤。\n\n“谢谢你来找我。那时候我慌得什么都做不了，还以为自己会永远被困在那里……却没想到，会有人赶来喵。”\n\n她攥紧纸条，像是在确认那些话真的能说出口。\n\n“那个时候我才知道，原来我没有被忘掉。”\n\n“以后……以后如果你也有害怕或为难的时候，可以来找我喵。我可能不聪明，也会把事情搞砸，但我一定会跑过去。”\n\n说完这句，她忽然站起身，像是不敢再多看我一眼。\n\n“走、走吧！万叶联市今天正好开市。我想给你挑一样东西！”' };
    }
    if (stage === 5) {
        await writeStage(connection, character.id, 6);
        return { chapter: 6, exchange: false, text: '我收下礼物，梨子喵的耳尖又悄悄红了。\n\n“喜欢就好喵！我挑了好久，差点把每个摊子都问烦。”她小声嘟囔，随后又抬起脸，笑得比世界树落下的光还要明亮。\n\n我们并肩走出万叶联市。风穿过叶海，像在替谁把没说完的话轻轻重复。\n\n这一趟没有委托，没有战斗，也没有谁需要证明自己。可我知道，眼前这个会慌张、会闯祸、却拼命把谢意交到我手上的少女，已经成了旅途中值得珍惜的同行者。' };
    }
    throw new Error('现在该去万叶联市见梨子喵。');
});
const receiveGirlGratitudeGift = (qqUserId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    if (await stageFor(connection, character.id, true) !== 4)
        throw new Error('梨子喵还没有带你来到这里。');
    await requireAt(connection, character, exchangeCode);
    await connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity) SELECT ?,id,1 FROM item_definitions WHERE code='worldtree_bud_charm' ON DUPLICATE KEY UPDATE quantity=GREATEST(quantity,1),acquired_at=NOW()`, [character.id]);
    await connection.execute(`INSERT IGNORE INTO player_item_codex (character_id,item_id) SELECT ?,id FROM item_definitions WHERE code='worldtree_bud_charm'`, [character.id]);
    await writeStage(connection, character.id, 5);
    return '万叶联市坐落在一片垂落的金叶之下。传说世界树会把旅人的愿望留在叶脉里，商人们便循着这些光脉交换来自各地的奇物，因此这里也被称作“没有城墙的交易所”。\n\n梨子喵拉着我在摊位间转了好几圈，最后从一位树灵匠人的盒中取出一枚小小的护符。它像刚抽芽的枝条，被金线细细缠住。\n\n“这个叫芽辉护符喵。”她把护符塞进我掌心，紧张得几乎不敢抬头，“它不厉害，也不值多少钱……可树灵说，它会记得第一个愿意守护它的人。”\n\n她终于抬眼，尾巴轻轻晃了一下。\n\n“我想让它替我陪着你。这样你下次遇到危险时，就知道……有人在很远的地方，也希望你能平安回来喵。”\n\n获得【芽辉护符】。';
});

export { continueGirlGratitude, girlGratitudeMainQuest, girlGratitudePending, girlGratitudeStage, receiveGirlGratitudeGift, returnToBainaTown, startGirlGratitude, teleportToWorldTree };
