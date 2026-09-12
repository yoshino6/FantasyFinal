import { getPool, withTransaction } from '../database/pool.js';
import { experienceRequiredForLevel } from './constants.js';
import { grantOpeningItem } from './opening.service.js';
import { floatingRescueTexts, floatingTourScenes, floatingThanksScenes } from './floating-leaf-content.js';

const tourCode = 'floating_leaf_tour';
const thanksCode = 'girl_gratitude';
const characterFor = async (c, user, lock = false) => {
    const [rows] = await c.execute(`SELECT c.id,c.level,c.experience,c.realm_stage,c.adventurer_registered,c.profession_code,c.current_region_id,c.pos_x,c.pos_y,c.pos_z,r.code AS region_code,
    o.route_code,o.destination_code,o.state AS opening_state,
    COALESCE((SELECT stage FROM player_main_quest_progress WHERE character_id=c.id AND quest_code='floating_leaf_tour'),0) AS tour_stage,
    COALESCE((SELECT stage FROM player_main_quest_progress WHERE character_id=c.id AND quest_code='girl_gratitude'),0) AS thanks_stage,
    COALESCE((SELECT stage FROM player_main_quest_progress WHERE character_id=c.id AND quest_code='realm_barrier'),0) AS barrier_stage,
    COALESCE((SELECT stage FROM player_goblin_king_quest WHERE character_id=c.id),0) AS goblin_stage
    FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id
    LEFT JOIN player_opening_stories o ON o.character_id=c.id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [user]);
    return rows[0] ?? null;
};
const isLeafOrigin = (c) => c?.route_code === 'M01' && c.destination_code === 'floating_leaf_town' && c.opening_state === 'completed';
const writeStage = (c, id, code, stage) => c.execute('INSERT INTO player_main_quest_progress (character_id,quest_code,stage) VALUES (?,?,?) ON DUPLICATE KEY UPDATE stage=VALUES(stage),updated_at=NOW()', [id, code, stage]);
const requireAt = (c, code, x, y, z) => {
    if (c.region_code !== code || Number(c.pos_x) !== x || Number(c.pos_y) !== y || Number(c.pos_z) !== z)
        throw new Error('请先前往剧情指示的地点。');
};
const scene = (kind, stage) => {
    const pages = kind === 'tour' ? floatingTourScenes : floatingThanksScenes;
    const index = kind === 'tour' ? Math.max(0, Math.min(5, stage - 1)) : Math.max(0, Math.min(3, stage - 1));
    return { kind, stage, total: pages.length, ...pages[index] };
};
const floatingLeafOrigin = async (user) => {
    const pool = await getPool();
    const character = await characterFor(pool, user);
    return isLeafOrigin(character);
};
const floatingTourState = async (user) => {
    const pool = await getPool();
    const c = await characterFor(pool, user);
    return isLeafOrigin(c) && c ? { stage: Number(c.tour_stage), atGuild: c.region_code === 'floating_leaf_town' && Number(c.pos_x) === 12 && Number(c.pos_y) === 0 && Number(c.pos_z) === 30, ready: Boolean(c.adventurer_registered && c.profession_code) } : null;
};
const startFloatingTour = async (user) => withTransaction(async (c) => {
    const character = await characterFor(c, user, true);
    if (!isLeafOrigin(character) || !character || !character.adventurer_registered || !character.profession_code || character.tour_stage || character.region_code !== 'floating_leaf_town')
        return null;
    requireAt(character, 'floating_leaf_town', 12, 0, 30);
    await writeStage(c, character.id, tourCode, 1);
    const [owned] = await c.execute("SELECT 1 FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND i.code='map_floating_leaf_town' AND p.quantity>0", [character.id]);
    if (!owned.length)
        await grantOpeningItem(c, character.id, 'map_floating_leaf_town');
    return scene('tour', 1);
});
const continueFloatingTour = async (user) => withTransaction(async (c) => {
    const character = await characterFor(c, user, true);
    if (!isLeafOrigin(character) || !character || Number(character.tour_stage) < 1)
        throw new Error('菲萝缇还没有邀请你游览浮叶镇。');
    const next = Math.min(6, Number(character.tour_stage) + 1);
    if (next === Number(character.tour_stage))
        return scene('tour', 6);
    const page = floatingTourScenes[next - 1];
    await c.execute('UPDATE characters SET pos_x=?,pos_y=? WHERE id=? AND current_region_id=? AND pos_z=30', [page.x, page.y, character.id, character.current_region_id]);
    if (next === 6)
        for (const code of ['map_world_tree', 'map_worldtree_meadow']) {
            const [owned] = await c.execute('SELECT 1 FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND i.code=? AND p.quantity>0', [character.id, code]);
            if (!owned.length)
                await grantOpeningItem(c, character.id, code);
        }
    await writeStage(c, character.id, tourCode, next);
    return scene('tour', next);
});
const currentFloatingTour = async (user) => {
    const state = await floatingTourState(user);
    return state && state.stage >= 1 && state.stage < 6 ? scene('tour', state.stage) : null;
};
const assertFloatingTourFreeAction = async (c, characterId) => {
    const [rows] = await c.execute(`SELECT q.stage FROM player_main_quest_progress q JOIN player_opening_stories o ON o.character_id=q.character_id
    WHERE q.character_id=? AND q.quest_code=? AND o.route_code='M01' AND o.destination_code='floating_leaf_town' LIMIT 1`, [characterId, tourCode]);
    if (rows[0] && Number(rows[0].stage) < 6)
        throw new Error('菲萝缇还在带你游览浮叶镇，请先继续当前剧情。');
};
const floatingBarrierAdvice = async (user, source) => withTransaction(async (c) => {
    const character = await characterFor(c, user, true);
    if (!isLeafOrigin(character) || !character || Number(character.tour_stage) < 6 || Number(character.realm_stage) !== 1 || Number(character.level) < 10 || Number(character.experience) < experienceRequiredForLevel(10))
        throw new Error('目前还没有遇到这道境界的阻碍。');
    const stage = Number(character.barrier_stage);
    if (source === 'guild') {
        requireAt(character, 'floating_leaf_town', 12, 0, 30);
        if (stage === 0)
            await writeStage(c, character.id, 'realm_barrier', 1);
        return '菈芮听我说完十级之后的停滞，没急着翻旧档案，而是拿起一片薄木叶，让它在我掌心慢慢转动。“力量已经够了，路却没打开。去观风台吧。那里的风向刻纹会把你看不见的阻力显出来。”她在地图上圈出东侧的平台，“菲萝缇刚教过你认路。别急着把瓶颈当成失败，先看看它到底拦住了什么。”';
    }
    requireAt(character, 'floating_leaf_town', 13, 2, 30);
    if (stage !== 1 && stage !== 4)
        throw new Error('先去风枝会馆前台说明你的瓶颈。');
    if (stage === 1) {
        const [owned] = await c.execute("SELECT 1 FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND i.code='sky_dust' AND p.quantity>0", [character.id]);
        if (!owned.length)
            await grantOpeningItem(c, character.id, 'sky_dust');
        await writeStage(c, character.id, 'realm_barrier', 4);
    }
    return '我把木叶放进观风台的刻纹，风车忽然慢下来，一层近乎透明的薄尘从叶脉间浮起。那些细光并不推着我往前，只照亮了阻在眼前的无形边界。菲萝缇先前说过，风向牌不能替旅人走路，只能让人看清路。我把这份天空粉尘收好，决定亲自感悟它照出的景象。';
});
const floatingRescueStart = async (user) => withTransaction(async (c) => {
    const character = await characterFor(c, user, true);
    if (!isLeafOrigin(character) || !character || Number(character.tour_stage) < 6 || Number(character.level) < 11 || Number(character.realm_stage) < 2)
        throw new Error('先完成浮叶镇的初行与十一级突破。');
    requireAt(character, 'floating_leaf_town', 15, 0, 30);
    if (Number(character.goblin_stage) > 0)
        throw new Error('这项调查已经在进行中。');
    const [regions] = await c.execute("SELECT id,min_x,max_x,min_y,max_y FROM map_regions WHERE code='dark_forest_deep' AND is_enabled=1 LIMIT 1 FOR UPDATE");
    const deep = regions[0];
    if (!deep)
        throw new Error('幽暗密林深处暂未开放。');
    const [towns] = await c.execute("SELECT min_y FROM map_regions WHERE code='baina_town' LIMIT 1");
    const maxY = Math.min(Number(deep.max_y), Number(towns[0]?.min_y ?? Infinity) - 1);
    if (maxY < Number(deep.min_y))
        throw new Error('密林深处暂时没有可用的搜寻区域。');
    let x = 0, y = 0, free = false;
    for (let attempt = 0; attempt < 80; attempt++) {
        x = Number(deep.min_x) + Math.floor(Math.random() * (Number(deep.max_x) - Number(deep.min_x) + 1));
        y = Number(deep.min_y) + Math.floor(Math.random() * (maxY - Number(deep.min_y) + 1));
        const [occupied] = await c.execute('SELECT 1 FROM monster_spawns WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=0 AND defeated_at IS NULL LIMIT 1', [deep.id, x, y]);
        if (!occupied.length) {
            free = true;
            break;
        }
    }
    if (!free)
        throw new Error('暂时找不到合适的调查落点，请稍后再试。');
    await c.execute('INSERT INTO player_goblin_king_quest (character_id,stage,goblin_kills,region_id,pos_x,pos_y,pos_z,encounter_id) VALUES (?,3,0,?,?,?,0,?) ON DUPLICATE KEY UPDATE stage=3,goblin_kills=0,region_id=VALUES(region_id),pos_x=VALUES(pos_x),pos_y=VALUES(pos_y),pos_z=0,encounter_id=VALUES(encounter_id),boss_spawn_id=NULL,completed_at=NULL', [character.id, deep.id, x, y, `main-goblin-king-${character.id}-${Date.now()}`]);
    await grantOpeningItem(c, character.id, 'map_dark_forest_deep');
    const [treeMap] = await c.execute("SELECT 1 FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND i.code='map_world_tree' AND p.quantity>0", [character.id]);
    if (!treeMap.length)
        await grantOpeningItem(c, character.id, 'map_world_tree');
    const [tree] = await c.execute("SELECT id FROM map_regions WHERE code='world_tree' AND is_enabled=1 LIMIT 1");
    if (!tree[0])
        throw new Error('安全接驳暂时停航。');
    await c.execute('UPDATE characters SET current_region_id=?,pos_x=0,pos_y=0,pos_z=0 WHERE id=?', [tree[0].id, character.id]);
    return '我接下委托。菲萝缇先把三名孩子的画像和失踪前的货单交给我，又在密林深处的地图边沿画出商道。她送我乘有护栏的接驳舱落到世界树，确认这趟安全落点与返程联络都能用。临关舱门，她又追出来补一句：“别只顾着找人，也记得自己要回来。”我把先前的世界树地图和她新画的密林图收进包里，沿着标出的路向南出发。\n\n**【获得地图】幽暗密林深处。**';
});
const floatingRescueReturn = async (user) => withTransaction(async (c) => {
    const character = await characterFor(c, user, true);
    if (!isLeafOrigin(character) || !character || Number(character.goblin_stage) !== 11)
        throw new Error('先完成营地救援，再带获救的人返镇。');
    const [region] = await c.execute("SELECT id FROM map_regions WHERE code='floating_leaf_town' AND is_enabled=1 LIMIT 1");
    if (!region[0])
        throw new Error('浮叶镇的安全接驳暂时停航。');
    await c.execute('UPDATE characters SET current_region_id=?,pos_x=15,pos_y=0,pos_z=30 WHERE id=?', [region[0].id, character.id]);
    return floatingRescueTexts.return;
});
const floatingRescueReport = async (user) => withTransaction(async (c) => {
    const character = await characterFor(c, user, true);
    if (!isLeafOrigin(character) || !character || Number(character.goblin_stage) !== 11)
        throw new Error('这份救援委托已经结清，或尚未完成。');
    requireAt(character, 'floating_leaf_town', 15, 0, 30);
    await c.execute('UPDATE player_goblin_king_quest SET stage=12 WHERE character_id=? AND stage=11', [character.id]);
    await c.execute('UPDATE characters SET copper_coins=copper_coins+1000 WHERE id=?', [character.id]);
    return '菲萝缇把获救者的姓名与公馆的失踪登记一一对上，直到最后一个名字也被划回“平安”，才盖下结案印。她从公馆账台取出装好的一千铜币，放到我手边：“说好报酬另算，就一枚都不能少。救人的事也不能只靠一句谢谢带过。”她望向门外被家人围住的孩子，眼里还有疲惫，声音却重新轻快起来：“等我请到假，轮到我带你出门见世面了。这回航务员不出错。”\n\n**【获得报酬】1000 铜币。**';
});
const floatingThanksStart = async (user) => withTransaction(async (c) => {
    const character = await characterFor(c, user, true);
    if (!isLeafOrigin(character) || !character || Number(character.goblin_stage) < 12 || Number(character.thanks_stage) !== 0)
        throw new Error('先完成浮叶镇的救援与公馆复命。');
    requireAt(character, 'floating_leaf_town', 15, 0, 30);
    const [region] = await c.execute("SELECT id FROM map_regions WHERE code='world_tree' AND is_enabled=1 LIMIT 1");
    if (!region[0])
        throw new Error('世界树暂未开放。');
    await c.execute('UPDATE characters SET current_region_id=?,pos_x=0,pos_y=0,pos_z=0 WHERE id=?', [region[0].id, character.id]);
    const [owned] = await c.execute("SELECT 1 FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND i.code='map_world_tree' AND p.quantity>0", [character.id]);
    if (!owned.length)
        await grantOpeningItem(c, character.id, 'map_world_tree');
    await writeStage(c, character.id, thanksCode, 1);
    return scene('thanks', 1);
});
const continueFloatingThanks = async (user) => withTransaction(async (c) => {
    const character = await characterFor(c, user, true);
    if (!isLeafOrigin(character) || !character || Number(character.goblin_stage) < 12 || ![1, 2, 3].includes(Number(character.thanks_stage)))
        throw new Error('现在没有待继续的世界树同行。');
    if (character.region_code !== 'world_tree')
        throw new Error('请先回到世界树，再继续同行。');
    const next = Number(character.thanks_stage) + 1;
    const page = floatingThanksScenes[next - 1];
    await c.execute('UPDATE characters SET pos_x=?,pos_y=? WHERE id=?', [page.x, page.y, character.id]);
    await writeStage(c, character.id, thanksCode, next === 4 ? 6 : next);
    return scene('thanks', next);
});
const floatingStoryMainQuest = async (user) => {
    const pool = await getPool();
    const c = await characterFor(pool, user);
    if (!isLeafOrigin(c) || !c || !c.adventurer_registered || !c.profession_code)
        return null;
    if (Number(c.tour_stage) < 6)
        return Number(c.tour_stage) > 0
            ? { title: '【主线·浮叶初游】', description: `菲萝缇正在带我认识小镇。当前：${floatingTourScenes[Number(c.tour_stage) - 1]?.title ?? '花桥'}。`, action: { label: '[继续游览]', command: '/浮叶游览' } }
            : { title: '【主线·浮叶初游】', description: '离开风枝会馆时，菲萝缇似乎有话要说。首次移动或前往会展开她的邀请。' };
    const returnToLeaf = c.region_code === 'floating_leaf_town'
        ? { label: '[前往 公馆]', command: '/前往 15 0' }
        : c.region_code === 'world_tree'
            ? { label: '[前往 安全接驳]', command: '/初行公会 接驳' }
            : { label: '[返回 世界树]', command: '/前往地图 map_world_tree' };
    if (Number(c.realm_stage) === 1 && (Number(c.level) < 10 || Number(c.experience) < experienceRequiredForLevel(10)))
        return { title: '【主线·初入异界】', description: `菲萝缇已经把世界树草原环带的低危道路圈在地图上。从会馆后勤区乘安全接驳到世界树，再前往草原环带历练。十级经验满值后回浮叶镇请教菈芮，突破后即可升至 Lv.11。\n当前等级：Lv.${c.level}/11`, action: c.region_code === 'floating_leaf_town' ? { label: '[前往 安全接驳]', command: '/初行公会 接驳' } : c.region_code === 'worldtree_meadow' ? { label: '[继续历练]', command: '/寻怪' } : { label: '[前往 草原环带]', command: '/前往地图 map_worldtree_meadow' } };
    if (Number(c.realm_stage) === 1 && Number(c.level) >= 10 && Number(c.experience) >= experienceRequiredForLevel(10)) {
        if (!c.barrier_stage)
            return { title: '【主线·无形的禁锢】', description: '十级的经验已满，力量却停在看不见的边界。返回浮叶镇风枝会馆前台，向菈芮说明异状。', action: c.region_code !== 'floating_leaf_town' ? returnToLeaf : Number(c.pos_x) === 12 && Number(c.pos_y) === 0 ? { label: '[前往 前台]', command: '/初行公会 前台' } : { label: '[前往 风枝会馆]', command: '/前往 12 0' } };
        if (Number(c.barrier_stage) === 1)
            return { title: '【主线·观风台】', description: '菈芮让我到浮叶镇观风台查看风向刻纹，找出这道无形边界的形状。', action: c.region_code !== 'floating_leaf_town' ? returnToLeaf : Number(c.pos_x) === 13 && Number(c.pos_y) === 2 ? { label: '[观察 刻纹]', command: '/浮叶瓶颈 observatory' } : { label: '[前往 观风台]', command: '/前往 13 2' } };
        return { title: '【主线·窥探世间】', description: '观风台的天空粉尘已在背包中。打开材料背包，感悟它照出的无形边界。', action: { label: '[打开背包]', command: '/背包 材料' } };
    }
    if (Number(c.realm_stage) < 2 || Number(c.level) < 11)
        return null;
    if (!c.goblin_stage)
        return { title: '【主线·失踪的孩子】', description: '菲萝缇传来消息：去百纳镇交易材料的几个孩子失踪了。前往浮叶镇公馆，听她说明调查委托。', action: c.region_code === 'floating_leaf_town' && Number(c.pos_x) === 15 && Number(c.pos_y) === 0 ? { label: '[进入 公馆]', command: '/建筑进入 leaf_manor' } : returnToLeaf };
    if (Number(c.goblin_stage) < 11) {
        const [location] = await pool.execute('SELECT pos_x,pos_y FROM player_goblin_king_quest WHERE character_id=?', [c.id]);
        const stage = Number(c.goblin_stage);
        return { title: '【主线·密林救援】', description: stage === 3 ? '已从公馆接下调查。沿安全商道前往幽暗密林深处，辨认失踪孩子留下的货牌。' : stage === 4 ? `哥布林巡兵的足迹指向营地，搜寻坐标（${location[0]?.pos_x}，${location[0]?.pos_y}）。` : stage === 10 ? `国王虽已受伤，仍守在木笼前。返回营地（${location[0]?.pos_x}，${location[0]?.pos_y}）完成救援；战败可以重新挑战。` : '孩子们仍困在营地的木笼里。继续当前遭遇，先护住她们。', action: stage === 3 ? { label: '[前往 密林深处]', command: '/前往地图 map_dark_forest_deep' } : { label: '[前往 营地]', command: `/前往 ${location[0]?.pos_x} ${location[0]?.pos_y}` } };
    }
    if (Number(c.goblin_stage) === 11)
        return { title: '【主线·返镇复命】', description: c.region_code === 'floating_leaf_town' ? '获救的人已回到浮叶镇。到公馆向菲萝缇复命，领取约定的一千铜币。' : '梨子喵和三人冒险团帮我把获救者送到安全商道。带浮叶镇的孩子们乘接驳回公馆。', action: c.region_code !== 'floating_leaf_town' ? { label: '[护送返镇]', command: '/浮叶返程' } : Number(c.pos_x) === 15 && Number(c.pos_y) === 0 ? { label: '[公馆复命]', command: '/浮叶复命' } : { label: '[前往 公馆]', command: '/前往 15 0' } };
    if (Number(c.thanks_stage) < 6)
        return { title: '【主线·菲萝缇的假】', description: !c.thanks_stage ? '菲萝缇兑现约定，请了一天假，邀我去世界树见见世面。到浮叶镇公馆与她会合。' : `我正与菲萝缇游历世界树。当前：${floatingThanksScenes[Math.min(3, Number(c.thanks_stage) - 1)]?.title ?? '根桥'}。`, action: !c.thanks_stage ? c.region_code === 'floating_leaf_town' && Number(c.pos_x) === 15 && Number(c.pos_y) === 0 ? { label: '[进入 公馆]', command: '/建筑进入 leaf_manor' } : returnToLeaf : { label: '[继续同行]', command: '/浮叶致谢 继续' } };
    if (Number(c.realm_stage) === 2 && (Number(c.level) < 20 || Number(c.experience) < experienceRequiredForLevel(20)))
        return { title: '【主线·前往二十级】', description: Number(c.level) < 20 ? `菲萝缇的邀约已完成。继续历练，提升至 Lv.20。\n当前等级：Lv.${c.level}/20` : `已到达 Lv.20，继续历练，让经验积累至满值。\n当前经验：${c.experience}/${experienceRequiredForLevel(20)}` };
    return null;
};
const floatingManorText = floatingRescueTexts.request;

export { assertFloatingTourFreeAction, continueFloatingThanks, continueFloatingTour, currentFloatingTour, floatingBarrierAdvice, floatingLeafOrigin, floatingManorText, floatingRescueReport, floatingRescueReturn, floatingRescueStart, floatingStoryMainQuest, floatingThanksStart, floatingTourState, startFloatingTour };
