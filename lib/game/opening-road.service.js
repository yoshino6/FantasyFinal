import { getPool, withTransaction } from '../database/pool.js';
import { availableOpeningSpawns, openingSpawnPoint } from './opening-state.js';
import { openingRouteByCode } from './opening-content.js';
import { openingStartRouteCodes, openingHubs } from './opening-world.config.js';

const roadCharacter = async (connection, user, lock = false) => {
    const [characters] = await connection.execute(`SELECT c.id,c.current_region_id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [user]);
    if (!characters[0])
        throw new Error('请先选择天赋，完成降临。');
    return characters[0];
};
const roadStory = async (connection, characterId, lock = false) => {
    const [stories] = await connection.execute(`SELECT route_code,state,revision,reward_claimed FROM player_opening_stories WHERE character_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    if (!stories[0] || stories[0].state !== 'armed' || Number(stories[0].reward_claimed) !== 0)
        throw new Error('初行故事已经展开，不能再选择道路。');
    return stories[0];
};
const openingRoadPanel = async (user) => {
    const pool = await getPool();
    const character = await roadCharacter(pool, user);
    const story = await roadStory(pool, Number(character.id));
    const { candidates } = await availableOpeningSpawns(pool);
    const order = [...openingStartRouteCodes];
    const roads = candidates.flatMap(candidate => candidate.routes.map(route => ({
        code: route.code, title: route.title, region: String(candidate.region.name), destination: openingHubs[route.destination].name
    }))).sort((left, right) => order.indexOf(left.code) - order.indexOf(right.code));
    return { revision: Number(story.revision), current: story.route_code, roads };
};
const selectOpeningRoad = async (user, revision, code) => withTransaction(async (connection) => {
    if (!Number.isSafeInteger(revision) || revision < 0)
        throw new Error('道路选择已过期，请重新打开选路面板。');
    const character = await roadCharacter(connection, user, true);
    const story = await roadStory(connection, Number(character.id), true);
    if (revision !== Number(story.revision))
        throw new Error('道路选择已过期，请重新打开选路面板。');
    const { candidates, areas } = await availableOpeningSpawns(connection);
    const candidate = candidates.find(item => item.routes.some(route => route.code === code));
    const route = candidate?.routes.find(item => item.code === code);
    if (!candidate || !route || !openingRouteByCode(code, route.version))
        throw new Error('这条道路当前不可选择，请重新打开选路面板。');
    const [updated] = await connection.execute(`UPDATE player_opening_stories SET route_code=?,story_version=?,destination_code=?,flags_json=JSON_SET(flags_json,'$.manualRouteCode',?),revision=revision+1
    WHERE character_id=? AND state='armed' AND reward_claimed=0 AND revision=?`, [route.code, route.version, route.destination, route.code, character.id, revision]);
    if (Number(updated.affectedRows) !== 1)
        throw new Error('初行状态已变化，请重新打开选路面板。');
    if (route.code !== story.route_code || Number(character.current_region_id) !== Number(candidate.region.id)) {
        const point = openingSpawnPoint(candidate, areas);
        await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE id=?', [candidate.region.id, point.x, point.y, point.z, character.id]);
    }
    return { code: route.code, title: route.title, region: String(candidate.region.name), destination: openingHubs[route.destination].name };
});

export { openingRoadPanel, selectOpeningRoad };
