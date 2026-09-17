import { randomUUID } from 'node:crypto';
import { getPool } from '../database/pool.js';
import { connectedTravelPath, samePoint } from './travel-path.js';
import { openingHubs } from './opening-world.config.js';
import { assertLeafDestination, hasLeafPermit } from './leaf-route.service.js';
import { assertLamplightIdle } from './lamplight.service.js';
import { assertFloatingTourFreeAction } from './floating-leaf.service.js';
import { assertWorldtreeTourFreeAction } from './worldtree-witness.service.js';
import { recordCardMovement } from './monster-card-exploration.service.js';

const point = (row) => ({ regionId: Number(row.region_id), x: Number(row.pos_x), y: Number(row.pos_y), z: Number(row.pos_z) });
const parseTravelPlan = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
const travelPlanSignature = (plan) => {
    const pointKey = (p) => [p.regionId, p.x, p.y, p.z];
    return JSON.stringify([plan.leaderId, pointKey(plan.start), pointKey(plan.target), plan.members.map(m => [m.id, m.user]), plan.destinationKind,
        plan.legs.map(l => [l.kind, pointKey(l.from), pointKey(l.to), l.distance, l.fromCode ?? '', l.toCode ?? ''])]);
};
const planConnectedTravel = async (c, id, start, target, partyId) => {
    const [members] = await c.execute(`SELECT c.id,p.qq_user_id AS user,c.current_region_id AS region_id,c.pos_x,c.pos_y,c.pos_z,c.activity_status,c.current_hp
    FROM characters c LEFT JOIN players p ON p.id=c.player_id ${partyId ? 'JOIN party_members pm ON pm.character_id=c.id WHERE pm.party_id=?' : 'WHERE c.id=?'} ORDER BY c.id FOR UPDATE`, [partyId ?? id]);
    if (!members.length)
        throw Error('队伍成员记录不存在。');
    if (partyId) {
        const [parties] = await c.execute('SELECT leader_character_id FROM parties WHERE id=? FOR UPDATE', [partyId]);
        if (Number(parties[0]?.leader_character_id) !== id)
            throw Error('组队状态下仅队长可以移动。');
    }
    await assertLeafDestination(c, id, target.regionId, partyId);
    const ids = members.map(m => Number(m.id));
    const [maps] = await c.execute(`SELECT DISTINCT pi.character_id,r.id AS region_id FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id AND i.item_category='地图'
    JOIN map_regions r ON r.code=JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.map')) WHERE pi.character_id IN (${ids.map(() => '?').join(',')}) AND pi.quantity>0`, ids);
    const owned = new Set();
    for (const row of maps)
        if (ids.every(member => maps.some(m => Number(m.character_id) === member && Number(m.region_id) === Number(row.region_id))))
            owned.add(Number(row.region_id));
    const [trial] = await c.execute(`SELECT q.character_id FROM player_leaf_route_progress q JOIN characters c ON c.id=q.character_id JOIN map_regions r ON r.id=c.current_region_id WHERE q.stage IN (11,12) AND r.code='floating_leaf_town' AND r.id=? AND c.id IN (${ids.map(() => '?').join(',')})`, [target.regionId, ...ids]);
    if (trial.length === ids.length)
        owned.add(target.regionId);
    if (!owned.has(target.regionId))
        throw Error('尚未持有目标坐标所在区域的地图，无法前往。请先领取或购买目的地地图；队伍成员均需持有。');
    const [areas] = await c.execute('SELECT a.*,r.danger_level,r.is_enabled,r.is_owner_only FROM map_region_areas a JOIN map_regions r ON r.id=a.region_id ORDER BY r.danger_level DESC');
    const base = { leaderId: id, start, target, members: members.map(m => ({ id: Number(m.id), user: String(m.user ?? '') })), seconds: 0, destinationKind: 'normal' };
    const direct = connectedTravelPath(areas, owned, start, target, []);
    if (direct)
        return { ...base, legs: direct };
    for (const member of members) {
        if (!member.user || !samePoint(point(member), start))
            throw Error('换乘前请等全体玩家队友到达同一坐标。剧情队伍请继续当前剧情。');
        if (member.activity_status !== 'active' || Number(member.current_hp) <= 0)
            throw Error('请等全体队员恢复行动状态后再换乘。');
        await assertLamplightIdle(c, Number(member.id));
        await (await import('./adventure.service.js')).ensureForestGuideFreeAction(c, Number(member.id));
    }
    const stationCodes = ['world_gate', 'world_tree_gate', ...Object.values(openingHubs).map(h => h.guild)];
    const [stations] = await c.execute(`SELECT n.code,n.name,n.region_id,n.pos_x,n.pos_y,n.pos_z,r.code AS region_code FROM map_npcs n JOIN map_regions r ON r.id=n.region_id
    WHERE r.is_enabled=1 AND r.is_owner_only=0 AND n.code IN (${stationCodes.map(() => '?').join(',')})`, stationCodes);
    const links = [];
    const connect = (a, b, kind) => { if (!a || !b)
        return; const from = point(a), to = point(b); links.push({ kind, from, to, fromCode: a.code, toCode: b.code, name: `${a.name} → ${b.name}`, distance: kind === 'portal' ? 1 : Math.max(1, Math.abs(from.x - to.x) + Math.abs(from.y - to.y) + Math.abs(from.z - to.z)) }); };
    const gate = stations.find(n => n.code === 'world_gate' && n.region_code === 'baina_town'), treeGate = stations.find(n => n.code === 'world_tree_gate' && n.region_code === 'world_tree');
    connect(gate, treeGate, 'portal');
    connect(treeGate, gate, 'portal');
    const tree = stations.find(n => n.code === openingHubs.world_tree.guild && n.region_code === 'world_tree');
    const [world] = await c.execute('SELECT leaf_route_open FROM opening_world WHERE id=1');
    const permits = await Promise.all(ids.map(member => hasLeafPermit(c, member)));
    for (const code of ['floating_leaf_town', 'frost_dragon_inn']) {
        const station = stations.find(n => n.code === openingHubs[code].guild && n.region_code === code);
        connect(station, tree, 'guild');
        if (code !== 'floating_leaf_town' || world[0]?.leaf_route_open && permits.every(Boolean))
            connect(tree, station, 'guild');
    }
    const legs = connectedTravelPath(areas, owned, start, target, links);
    if (!legs)
        throw Error('当前地图未连通，也没有可用的界门或公会接驳路线。请补齐沿途地图或办理目的地的航路许可。');
    for (const leg of legs.filter(l => l.kind === 'guild'))
        for (const member of members) {
            if (leg.fromCode === openingHubs.floating_leaf_town.guild)
                await assertFloatingTourFreeAction(c, Number(member.id));
            if (leg.fromCode === openingHubs.world_tree.guild)
                await assertWorldtreeTourFreeAction(c, Number(member.id));
        }
    return { ...base, legs };
};
const saveTravelConfirmation = async (c, id, plan) => {
    const token = randomUUID();
    await c.execute("INSERT INTO player_travel_routes(character_id,token,state,plan_json,expires_at) VALUES (?,?,'pending',?,DATE_ADD(NOW(),INTERVAL 10 MINUTE)) ON DUPLICATE KEY UPDATE token=VALUES(token),state='pending',plan_json=VALUES(plan_json),expires_at=VALUES(expires_at)", [id, token, JSON.stringify(plan)]);
    return { kind: 'travel_confirmation', token, plan };
};
const confirmTravelTarget = async (user, token) => {
    const [rows] = await (await getPool()).execute(`SELECT t.plan_json FROM player_travel_routes t JOIN characters c ON c.id=t.character_id JOIN players p ON p.id=c.player_id
    WHERE p.qq_user_id=? AND t.token=? AND t.state='pending' AND t.expires_at>NOW()`, [user, token]);
    if (!rows[0])
        throw Error('这条行动确认已失效，请重新发送前往。');
    return parseTravelPlan(rows[0].plan_json);
};
const executeTravelTransfers = async (c, plan) => {
    const ids = plan.members.map(m => m.id);
    const notices = [];
    let currentLocation = plan.start, teleported = false;
    for (const leg of plan.legs) {
        if (leg.kind === 'walk') {
            if (leg === plan.legs.at(-1))
                break;
            await c.execute(`UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE id IN (${ids.map(() => '?').join(',')})`, [leg.to.regionId, leg.to.x, leg.to.y, leg.to.z, ...ids]);
            currentLocation = leg.to;
            continue;
        }
        teleported = true;
        for (const member of plan.members) {
            if (leg.kind === 'portal') {
                const gates = await import('./girl-gratitude.service.js');
                const text = leg.toCode === 'world_tree_gate' ? await gates.teleportToWorldTreeIn(c, member.user) : await gates.returnToBainaTownIn(c, member.user);
                if (member.id === plan.leaderId && text.includes('梨子喵'))
                    notices.push(text);
            }
            else {
                if (!leg.fromCode)
                    throw Error('接驳起点已变更，请重新前往。');
                await c.execute("INSERT INTO player_opening_visits(character_id,building_code,area) VALUES (?,?,'后勤区') ON DUPLICATE KEY UPDATE building_code=VALUES(building_code),area='后勤区'", [member.id, leg.fromCode]);
                const hub = Object.entries(openingHubs).find(([, h]) => h.guild === leg.toCode);
                if (!hub)
                    throw Error('接驳终点已变更，请重新前往。');
                await (await import('./opening-guild.service.js')).openingTransportIn(c, member.user, hub[0]);
            }
        }
        currentLocation = leg.to;
    }
    if (teleported)
        for (const member of plan.members)
            await recordCardMovement(c, member.id, { regionId: currentLocation.regionId, z: currentLocation.z }, { teleport: true });
    return notices;
};

export { confirmTravelTarget, executeTravelTransfers, parseTravelPlan, planConnectedTravel, saveTravelConfirmation, travelPlanSignature };
