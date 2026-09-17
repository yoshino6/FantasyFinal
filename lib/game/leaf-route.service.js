import { withTransaction, getPool } from '../database/pool.js';
import { openingCharacter, grantOpeningItem } from './opening.service.js';
import { assertLamplightIdle } from './lamplight.service.js';
import { openingWorldFor } from './opening-state.js';
import { leafRouteLevel, leafRouteScenes, leafSurveyPoints } from './leaf-route.config.js';
import { experienceRequiredForLevel } from './constants.js';

const hasLeafPermit = async (c, id) => {
    const [rows] = await c.execute("SELECT 1 FROM player_leaf_permits WHERE character_id=? UNION ALL SELECT 1 FROM player_opening_stories WHERE character_id=? AND route_code='M01' AND destination_code='floating_leaf_town' AND state='completed' LIMIT 1", [id, id]);
    return Boolean(rows.length);
};
const assertLeafPermit = async (c, id) => {
    if (!await hasLeafPermit(c, id))
        throw Error('尚未获得个人浮叶航路许可。请到世界树根冠分会完成《风从未寄达的地方》。');
};
const assertLeafDestination = async (c, id, regionId, partyId) => {
    const [regions] = await c.execute('SELECT code FROM map_regions WHERE id=?', [regionId]);
    if (regions[0]?.code !== 'floating_leaf_town')
        return;
    const [members] = partyId ? await c.execute('SELECT character_id FROM party_members WHERE party_id=?', [partyId]) : [[{ character_id: id }]];
    for (const member of members) {
        if (await hasLeafPermit(c, Number(member.character_id)))
            continue;
        const [trial] = await c.execute("SELECT 1 FROM player_leaf_route_progress q JOIN characters c ON c.id=q.character_id JOIN map_regions r ON r.id=c.current_region_id WHERE q.character_id=? AND q.stage IN (11,12) AND r.code='floating_leaf_town'", [member.character_id]);
        if (!trial.length)
            await assertLeafPermit(c, Number(member.character_id));
    }
};
const leafRoutePoint = (stage, work) => {
    if (stage === 3) {
        const p = leafSurveyPoints[Math.min(work, 2)];
        return { region: 'worldtree_meadow', x: p[0], y: p[1], z: 0 };
    }
    if (stage === 4)
        return { region: 'worldtree_meadow', x: 8, y: -16, z: 0 };
    if (stage === 11)
        return { region: 'floating_leaf_town', x: 12, y: 0, z: 30 };
    if (stage === 12)
        return { region: 'floating_leaf_town', x: 15, y: 0, z: 30 };
    return { region: 'world_tree', x: stage >= 7 ? 0 : -5, y: stage >= 7 ? 0 : -3, z: 0 };
};
const state = async (c, id, lock = false) => { const [rows] = await c.execute('SELECT * FROM player_leaf_route_progress WHERE character_id=?' + (lock ? ' FOR UPDATE' : ''), [id]); return rows[0]; };
const leafRouteView = async (user) => {
    const c = await getPool(), character = await openingCharacter(c, user), row = await state(c, Number(character.id));
    const stage = Number(row?.stage ?? 1), work = Number(row?.work ?? 0);
    const scene = { ...leafRouteScenes[Math.min(stage, 12) - 1] };
    if (stage === 2) {
        const [world] = await c.execute('SELECT leaf_route_open FROM opening_world WHERE id=1');
        scene.text = scene.text.replace('如果已经有公共航班，这解释的是为何你的访客登记仍需要补齐资料；若尚未开通，则说明眼下还没有可靠的公共往返班次。', world[0]?.leaf_route_open ? '公共航班已经开通，但你的访客登记仍缺地面复核资料。' : '眼下还没有可靠的公共往返班次，澄叶请你协助补齐复核。');
    }
    if (stage === 6)
        scene.text = scene.text.replace('你们此前若未见过，她会认真介绍自己，不把你当作那位被误认的长老。', '“我是菲萝缇，负责这次航务复核。”她认真介绍自己，又请你报上名字。');
    return { stage, work, revision: Number(row?.revision ?? 0), started: Boolean(row), claimed: Boolean(row?.claimed), scene, point: leafRoutePoint(stage, work), atLeaf: character.region_code === 'floating_leaf_town', permit: await hasLeafPermit(c, Number(character.id)) };
};
const leafRouteTransport = async (c, id, destination) => {
    const [places] = await c.execute("SELECT r.id,n.pos_x,n.pos_y,n.pos_z FROM map_regions r JOIN map_npcs n ON n.region_id=r.id WHERE r.code=? AND n.code=? AND r.is_enabled=1 AND r.is_owner_only=0", [destination, destination === 'world_tree' ? 'world_tree_adventurer_guild' : 'windbranch_guild']);
    const point = places[0];
    if (!point)
        throw Error('安全接驳站暂时关闭，任务进度已保留。');
    await c.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE id=?', [point.id, point.pos_x, point.pos_y, point.pos_z, id]);
    await c.execute('DELETE FROM player_opening_visits WHERE character_id=?', [id]);
};
const leafRouteAction = async (user, action, revision) => withTransaction(async (c) => {
    const character = await openingCharacter(c, user, true), id = Number(character.id);
    await assertLamplightIdle(c, id);
    if (character.activity_status !== 'active')
        throw Error('请先结束当前行动。');
    const [party] = await c.execute('SELECT 1 FROM party_members WHERE character_id=?', [id]);
    if (party.length)
        throw Error('这是一人一份的航务任务，请先自行离队；不会解散其他队友。');
    let row = await state(c, id, true);
    if (action === 'return') {
        if (character.region_code !== 'floating_leaf_town')
            throw Error('当前不在浮叶镇。');
        await leafRouteTransport(c, id, 'world_tree');
        return '已安全返回世界树，任务进度保留。';
    }
    if (!row) {
        if (action !== 'continue' || revision !== 0)
            throw Error('请刷新航路任务。');
        if (Number(character.level) < 6 || !character.adventurer_registered || !character.profession_code)
            throw Error('需达到Lv.6、完成公会登记并选择职业。');
        const [origin] = await c.execute("SELECT 1 FROM player_opening_stories WHERE character_id=? AND route_code='M01' AND destination_code='floating_leaf_town'", [id]);
        if (origin.length)
            throw Error('浮叶开局沿用原有初行航务，不重复接取访客任务。');
        if (character.region_code !== 'world_tree' || Number(character.pos_x) !== -5 || Number(character.pos_y) !== -3 || Number(character.pos_z) !== 0)
            throw Error('请到世界树根冠分会（-5,-3,0）正式接取。');
        const level = leafRouteLevel(Number(character.level));
        await c.execute('INSERT INTO player_leaf_route_progress(character_id,level_snapshot,experience_snapshot) VALUES (?,?,?)', [id, level, Math.floor(experienceRequiredForLevel(level) * .25)]);
        row = (await state(c, id, true));
    }
    if (row.claimed)
        return '航务已经结案，奖励不会重复发放。';
    if (Number(row.revision) !== revision)
        throw Error('这张按钮对应旧进度，请刷新航路任务后继续。');
    const stage = Number(row.stage), work = Number(row.work);
    if (action === 'board' && stage >= 11 && character.region_code === 'world_tree') {
        if (Number(character.pos_x) !== -5 || Number(character.pos_y) !== -3)
            throw Error('请到根冠分会安全接驳柜台。');
        await leafRouteTransport(c, id, 'floating_leaf_town');
        return '凭临时船票重返风枝会馆。';
    }
    const point = leafRoutePoint(stage, work);
    const [open] = await c.execute('SELECT 1 FROM map_regions WHERE id=? AND is_enabled=1 AND is_owner_only=0', [character.current_region_id]);
    if (!open.length)
        throw Error('当前任务地点已暂停开放，进度保留。');
    if (character.region_code !== point.region || Number(character.pos_x) !== point.x || Number(character.pos_y) !== point.y || Number(character.pos_z) !== point.z)
        throw Error('请先到' + point.region + '（' + [point.x, point.y, point.z].join(',') + '）。');
    if ([4, 8].includes(stage) && !work) {
        await (await import('./leaf-route-battle.service.js')).startLeafRouteBattle(c, character, row);
        return '进入私有航务遭遇。请打开战斗面板，本场无经验和掉落。' + (stage === 4 ? '薄刃风卷惧斩击，震荡气团惧打击；没有对应技能也可用普攻击散。' : '风结被击破后，引航风核会蓄势，请留意重新锚定提示。');
    }
    if (!['continue', 'confirm'].includes(action))
        throw Error('请选择当前幕的交互。');
    const steps = stage === 3 || stage === 5 || stage === 7 || stage === 10 ? 3 : 1;
    let nextStage = stage, nextWork = work + 1;
    if (nextWork >= steps) {
        nextStage++;
        nextWork = 0;
    }
    if (stage === 10 && nextStage === 11)
        await leafRouteTransport(c, id, 'floating_leaf_town');
    if (stage === 12) {
        const world = await openingWorldFor(c, true);
        await c.execute("INSERT IGNORE INTO player_leaf_permits(character_id,source) VALUES (?,'quest')", [id]);
        if (!world.leaf_route_open) {
            await c.execute('UPDATE opening_world SET leaf_route_open=1,leaf_discoverer_id=?,revision=revision+1 WHERE id=1', [id]);
            await c.execute("INSERT INTO opening_world_events(code,character_id,text) VALUES ('floating_leaf_route',?,'地面引灯与云上航印完成复核，世界树至浮叶镇公共航路正式复航。')", [id]);
        }
        const [owned] = await c.execute("SELECT 1 FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND p.quantity>0 AND i.code='map_floating_leaf_town' UNION ALL SELECT 1 FROM player_home_storage_items s JOIN player_homes h ON h.id=s.home_id JOIN item_definitions i ON i.id=s.item_id WHERE h.character_id=? AND s.quantity>0 AND i.code='map_floating_leaf_town'", [id, id]);
        if (!owned.length)
            await grantOpeningItem(c, id, 'map_floating_leaf_town');
        await c.execute('UPDATE characters SET copper_coins=copper_coins+600,guild_contribution=guild_contribution+60 WHERE id=?', [id]);
        await c.execute('INSERT INTO player_folio_vouchers(character_id,granted,used) VALUES (?,1,0) ON DUPLICATE KEY UPDATE granted=1', [id]);
        await (await import('./adventure.service.js')).awardRealmExperience(c, character, Number(row.experience_snapshot), { talent: { kind: 'quest', key: 'leaf_route_reopening' } });
        await c.execute('UPDATE player_leaf_route_progress SET claimed=1 WHERE character_id=?', [id]);
    }
    const [updated] = await c.execute('UPDATE player_leaf_route_progress SET stage=?,work=?,revision=revision+1 WHERE character_id=? AND revision=?', [Math.min(nextStage, 12), nextWork, id, revision]);
    if (!updated.affectedRows)
        throw Error('进度已变化，本次操作没有重复提交。');
    return stage === 12 ? '已结案：600铜币、60贡献度、150战技抵用券、航路许可和地图；任务经验已按境界规则结算。' : nextStage !== stage ? '本幕完成，调查记录已保存。' : '完成第' + nextWork + '项，继续下一项校准。';
});

export { assertLeafDestination, assertLeafPermit, hasLeafPermit, leafRouteAction, leafRoutePoint, leafRouteTransport, leafRouteView };
