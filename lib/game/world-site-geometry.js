const contains = (area, point) => point.x >= area.min_x && point.x <= area.max_x && point.y >= area.min_y && point.y <= area.max_y && point.z >= area.min_z && point.z <= area.max_z;
const pointBelongsToRegion = (areas, regionId, point) => {
    const candidates = areas.filter(area => contains(area, point));
    const own = candidates.find(area => Number(area.region_id) === regionId);
    return Boolean(own && !candidates.some(area => Number(area.region_id) !== regionId && Number(area.danger_level) >= Number(own.danger_level)));
};
const validWorldSitePoint = (areas, regionId, preferred) => {
    if (pointBelongsToRegion(areas, regionId, preferred))
        return preferred;
    let nearest;
    let distance = Infinity;
    for (const area of areas.filter(area => Number(area.region_id) === regionId)) {
        const z = Math.max(Number(area.min_z), Math.min(Number(area.max_z), preferred.z));
        for (let x = Number(area.min_x); x <= Number(area.max_x); x++)
            for (let y = Number(area.min_y); y <= Number(area.max_y); y++) {
                const d = Math.abs(x - preferred.x) + Math.abs(y - preferred.y) + Math.abs(z - preferred.z);
                if (d < distance && pointBelongsToRegion(areas, regionId, { x, y, z })) {
                    nearest = { x, y, z };
                    distance = d;
                }
            }
    }
    if (!nearest)
        throw new Error('该区域尚未登记可抵达的落点，请联系管理员核对地图边界。');
    return { ...preferred, ...nearest };
};

export { pointBelongsToRegion, validWorldSitePoint };
