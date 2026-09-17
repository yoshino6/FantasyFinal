const hasMappedTravelRoute = (areas, owned, start, target, targetRegionId) => {
    if (start.z !== target.z)
        return false;
    const surface = areas.filter(area => start.z >= Number(area.min_z) && start.z <= Number(area.max_z))
        .sort((a, b) => Number(b.danger_level) - Number(a.danger_level));
    const boundaries = (axis) => [...new Set(surface.flatMap(area => [Number(area[`min_${axis}`]), Number(area[`max_${axis}`]) + 1]).concat([start[axis], start[axis] + 1, target[axis], target[axis] + 1]))].sort((a, b) => a - b);
    const xs = boundaries('x'), ys = boundaries('y'), width = xs.length - 1, height = ys.length - 1;
    const cellRegion = (x, y) => surface.find(area => x >= Number(area.min_x) && x <= Number(area.max_x) && y >= Number(area.min_y) && y <= Number(area.max_y));
    const startRegionId = Number(cellRegion(start.x, start.y)?.region_id);
    const passable = Array.from({ length: width * height }, (_, cell) => {
        const area = cellRegion(xs[cell % width], ys[Math.floor(cell / width)]);
        return Boolean(area && area.is_enabled && !area.is_owner_only && (owned.has(Number(area.region_id)) || Number(area.region_id) === startRegionId));
    });
    const source = ys.indexOf(start.y) * width + xs.indexOf(start.x);
    const destination = ys.indexOf(target.y) * width + xs.indexOf(target.x);
    if (!passable[source] || !passable[destination] || Number(cellRegion(target.x, target.y)?.region_id) !== targetRegionId)
        return false;
    const visited = new Uint8Array(passable.length), queue = [source];
    visited[source] = 1;
    for (let head = 0; head < queue.length; head++) {
        const cell = queue[head];
        if (cell === destination)
            return true;
        const x = cell % width, y = Math.floor(cell / width);
        for (const next of [x > 0 ? cell - 1 : -1, x + 1 < width ? cell + 1 : -1, y > 0 ? cell - width : -1, y + 1 < height ? cell + width : -1]) {
            if (next >= 0 && passable[next] && !visited[next]) {
                visited[next] = 1;
                queue.push(next);
            }
        }
    }
    return false;
};
const assertMappedTravelRoute = async (connection, characterId, partyId, start, target, targetRegionId) => {
    await (await import('./leaf-route.service.js')).assertLeafDestination(connection, characterId, targetRegionId, partyId);
    const [members] = partyId
        ? await connection.execute('SELECT character_id FROM party_members WHERE party_id=?', [partyId])
        : [[{ character_id: characterId }]];
    const memberIds = members.map(member => Number(member.character_id));
    if (!memberIds.length)
        throw new Error('队伍成员记录不存在。');
    const [maps] = await connection.execute(`SELECT DISTINCT pi.character_id,r.id AS region_id FROM player_inventory pi
    JOIN item_definitions i ON i.id=pi.item_id AND i.item_category='地图'
    JOIN map_regions r ON r.code=JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.map'))
    WHERE pi.character_id IN (${memberIds.map(() => '?').join(',')}) AND pi.quantity>0`, memberIds);
    const held = new Map();
    for (const map of maps) {
        const regionId = Number(map.region_id);
        if (!held.has(regionId))
            held.set(regionId, new Set());
        held.get(regionId).add(Number(map.character_id));
    }
    const owned = new Set([...held].filter(([, holders]) => holders.size === memberIds.length).map(([regionId]) => regionId));
    const [trial] = await connection.execute(`SELECT q.character_id FROM player_leaf_route_progress q JOIN characters c ON c.id=q.character_id JOIN map_regions r ON r.id=c.current_region_id WHERE q.stage IN (11,12) AND r.code='floating_leaf_town' AND r.id=? AND c.id IN (${memberIds.map(() => '?').join(',')})`, [targetRegionId, ...memberIds]);
    if (trial.length === memberIds.length)
        owned.add(targetRegionId);
    if (!owned.has(targetRegionId))
        throw new Error('尚未持有目标坐标所在区域的地图，无法前往。请打开主线任务补领本阶段通行地图；地图在家园仓库时需先取回背包，其他地图可到公会商店购买。');
    const [areas] = await connection.execute(`SELECT a.*,r.danger_level,r.is_enabled,r.is_owner_only FROM map_region_areas a
    JOIN map_regions r ON r.id=a.region_id WHERE ? BETWEEN a.min_z AND a.max_z ORDER BY r.danger_level DESC`, [start.z]);
    if (!hasMappedTravelRoute(areas, owned, start, target, targetRegionId))
        throw new Error('起点与目标之间缺少连续有效的地图，无法使用前往；请打开主线任务补领本阶段地图，其他沿途地图可到公会商店购买，也可以从界门传送。');
};

export { assertMappedTravelRoute, hasMappedTravelRoute };
