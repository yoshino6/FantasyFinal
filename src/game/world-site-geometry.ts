export type WorldArea = { region_id: number; danger_level: number; min_x: number; max_x: number; min_y: number; max_y: number; min_z: number; max_z: number };
type Point = { x: number; y: number; z: number };
const contains = (area: WorldArea, point: Point) => point.x >= area.min_x && point.x <= area.max_x && point.y >= area.min_y && point.y <= area.max_y && point.z >= area.min_z && point.z <= area.max_z;
export const pointBelongsToRegion = (areas: WorldArea[], regionId: number, point: Point) => {
  const candidates = areas.filter(area => contains(area, point));
  const own = candidates.find(area => Number(area.region_id) === regionId);
  return Boolean(own && !candidates.some(area => Number(area.region_id) !== regionId && Number(area.danger_level) >= Number(own.danger_level)));
};
/** 与移动的区域覆盖优先级一致；保留合法旧坐标，只修复 L 形缺口或被高优先级区域覆盖的点。 */
export const validWorldSitePoint = <T extends Point>(areas: WorldArea[], regionId: number, preferred: T): T => {
  if (pointBelongsToRegion(areas, regionId, preferred)) return preferred;
  let nearest: Point | undefined; let distance = Infinity;
  for (const area of areas.filter(area => Number(area.region_id) === regionId)) {
    const z = Math.max(Number(area.min_z), Math.min(Number(area.max_z), preferred.z));
    for (let x = Number(area.min_x); x <= Number(area.max_x); x++) for (let y = Number(area.min_y); y <= Number(area.max_y); y++) {
      const d = Math.abs(x - preferred.x) + Math.abs(y - preferred.y) + Math.abs(z - preferred.z);
      if (d < distance && pointBelongsToRegion(areas, regionId, { x, y, z })) { nearest = { x, y, z }; distance = d; }
    }
  }
  if (!nearest) throw new Error('该区域尚未登记可抵达的落点，请联系管理员核对地图边界。');
  return { ...preferred, ...nearest };
};
