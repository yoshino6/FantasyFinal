import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { openingRouteByCode } from './opening-content';
import { openingHubs, openingSpawnRegions, openingTierWeights } from './opening-world.config';
import { pointBelongsToRegion, validWorldSitePoint, type WorldArea } from './world-site-geometry';

export type OpeningConnection = Pick<PoolConnection, 'execute'>;
export const assertOpeningFree = async (connection: OpeningConnection, characterId: number) => {
  const [rows] = await connection.execute<RowDataPacket[]>("SELECT state FROM player_opening_stories WHERE character_id=? AND state<>'completed' LIMIT 1", [characterId]);
  if (rows.length) throw new Error('眼前的初行剧情尚未结束。请使用 /继续剧情 作出选择并完成安全交接。');
};
export const openingWorldFor = async (connection: OpeningConnection, lock = false) => {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT * FROM opening_world WHERE id=1${lock ? ' FOR UPDATE' : ''}`);
  if (!rows[0]) throw new Error('接引记录尚未初始化。');
  return rows[0];
};
export const chooseWeighted = <T>(entries: readonly { value: T; weight: number }[], random = Math.random): T => {
  if (!entries.length || entries.some(e => !Number.isFinite(e.weight) || e.weight <= 0)) throw new Error('没有可用的随机候选。');
  let point = random() * entries.reduce((sum,e) => sum + e.weight,0);
  for (const entry of entries) { point -= entry.weight; if (point < 0) return entry.value; }
  return entries[entries.length-1].value;
};

/** 接引点必须有开放的安全地图、真实公会、合法坐标和可发放的当地地图。 */
export const openingSafeHubs = async (connection: OpeningConnection, lock = false) => {
  const codes = Object.keys(openingHubs);
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT r.id,r.code,n.code AS guild_code,n.pos_x,n.pos_y,n.pos_z
    FROM map_regions r JOIN map_npcs n ON n.region_id=r.id JOIN item_definitions i ON i.code=CONCAT('map_',r.code)
    WHERE r.is_enabled=1 AND r.is_owner_only=0 AND r.is_spawn_enabled=0 AND n.interaction_kind='building'
    AND r.code IN (${codes.map(() => '?').join(',')}) ORDER BY r.id${lock ? ' FOR UPDATE' : ''}`, codes);
  const [areas] = await connection.execute<(RowDataPacket & WorldArea)[]>('SELECT a.*,r.danger_level FROM map_region_areas a JOIN map_regions r ON r.id=a.region_id');
  return rows.filter(row => openingHubs[String(row.code) as keyof typeof openingHubs]?.guild === row.guild_code
    && pointBelongsToRegion(areas, Number(row.id), { x: Number(row.pos_x), y: Number(row.pos_y), z: Number(row.pos_z) }));
};
export const chooseOpeningSpawn = async (connection: PoolConnection, random = Math.random) => {
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT * FROM map_regions WHERE newbie_spawn_enabled=1 AND is_enabled=1 AND is_owner_only=0 ORDER BY id');
  const [areas] = await connection.execute<(RowDataPacket & WorldArea)[]>('SELECT a.*,r.danger_level FROM map_region_areas a JOIN map_regions r ON r.id=a.region_id');
  const hubs = await openingSafeHubs(connection);
  const enabled = new Set(hubs.map(h => String(h.code)));
  if (!enabled.size) throw new Error('安全接引点暂未备齐，请稍后重新选择恩赐；你的选择尚未扣除或提交。');
  const candidates = rows.flatMap(region => {
    const configuration = openingSpawnRegions[String(region.code) as keyof typeof openingSpawnRegions];
    if (!configuration) return [];
    const routes = [1,2,3].map(i => openingRouteByCode(`${configuration.prefix}0${i}`));
    if (routes.some(route => !route) || !enabled.size) return [];
    try { return [{region,configuration,point:validWorldSitePoint(areas,Number(region.id),{x:Number(region.min_x),y:Number(region.min_y),z:Number(region.min_z)})}]; } catch { return []; }
  });
  if (!candidates.length) throw new Error('暂时没有已开放且可安全降临的地图，请稍后重新选择恩赐。');
  const tiers = [...new Set(candidates.map(c => c.configuration.tier))];
  const tier = chooseWeighted(tiers.map(t => ({value:t,weight:openingTierWeights[t]})),random);
  const group = candidates.filter(c => c.configuration.tier === tier);
  const candidate = group[Math.min(group.length-1,Math.floor(random()*group.length))];
  const ownAreas = areas.filter(a => Number(a.region_id) === Number(candidate.region.id));
  for (let attempt=0;attempt<64;attempt++) {
    const area=chooseWeighted(ownAreas.map(a=>({value:a,weight:(a.max_x-a.min_x+1)*(a.max_y-a.min_y+1)})),random);
    const point={x:Number(area.min_x)+Math.floor(random()*(area.max_x-area.min_x+1)),y:Number(area.min_y)+Math.floor(random()*(area.max_y-area.min_y+1)),z:Number(area.min_z)};
    if (pointBelongsToRegion(areas,Number(candidate.region.id),point)) {candidate.point=point;break;}
  }
  const route=openingRouteByCode(`${candidate.configuration.prefix}0${1+Math.min(2,Math.floor(random()*3))}`)!;
  const destination=enabled.has(route.destination)?route.destination:enabled.has('world_tree')?'world_tree':enabled.has('baina_town')?'baina_town':[...enabled][0];
  return {region:candidate.region,route:{...route,destination},...candidate.point};
};
