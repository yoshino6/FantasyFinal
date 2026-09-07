/** 只读核对真实区域、建筑、巡游路线和未结委托；不运行启动初始化，不改玩家状态。 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createConnection } from 'mysql2/promise';
import { pointBelongsToRegion, validWorldSitePoint } from '../src/game/world-site-geometry';
const require = createRequire(import.meta.url);
const config = require('yaml').parse(readFileSync('alemon.config.yaml', 'utf8'));
const database = config.FantasyFinal?.database ?? config.mysql;
const connection = await createConnection({ ...database, connectTimeout: 5000 });
try {
  await connection.query('SET TRANSACTION READ ONLY'); await connection.beginTransaction();
  const [areas] = await connection.query<any[]>('SELECT a.*,r.danger_level,r.code,r.name FROM map_region_areas a JOIN map_regions r ON r.id=a.region_id');
  const [regions] = await connection.query<any[]>('SELECT * FROM map_regions');
  const [buildings] = await connection.query<any[]>("SELECT n.id,n.region_id,n.code,n.name,n.pos_x AS x,n.pos_y AS y,n.pos_z AS z FROM map_npcs n WHERE interaction_kind='building'");
  const [maps] = await connection.query<any[]>("SELECT code,JSON_UNQUOTE(JSON_EXTRACT(effect_json,'$.map')) AS region_code FROM item_definitions WHERE item_category='地图'");
  const [npcs] = await connection.query<any[]>('SELECT d.code,d.region_id,d.state_json,d.route_json,n.pos_x AS x,n.pos_y AS y,n.pos_z AS z FROM world_dynamic_npc_states d JOIN map_npcs n ON n.code=d.code AND n.region_id=d.region_id');
  const [commissions] = await connection.query<any[]>("SELECT c.id,c.target_site_code,s.region_id AS target_region_id,n.pos_x AS x,n.pos_y AS y,n.pos_z AS z FROM player_world_site_commissions c LEFT JOIN world_site_states s ON s.code=c.target_site_code LEFT JOIN map_npcs n ON n.code=s.code AND n.region_id=s.region_id WHERE c.status='accepted'");
  const invalidBuildings = buildings.filter(b => !pointBelongsToRegion(areas,b.region_id,b)).map(b => ({...b, corrected:validWorldSitePoint(areas,b.region_id,b)}));
  const invalidNpcs = npcs.filter(n => !pointBelongsToRegion(areas,n.region_id,n));
  const invalidRoutes = npcs.flatMap(n => {
    const state = typeof n.state_json==='string'?JSON.parse(n.state_json):n.state_json;
    const route = typeof n.route_json==='string'?JSON.parse(n.route_json):n.route_json;
    return route.filter((p:any)=>!pointBelongsToRegion(areas,Number(state.homeRegionId??n.region_id),p)).map((p:any)=>({code:n.code,...p}));
  });
  const candidates: {region:number;x:number;y:number;z:number}[]=[];
  const mapEntries = maps.map(map=>{
    const region=regions.find(r=>r.code===map.region_code);
    if (!region) return {map:map.code,error:'地图未关联区域'};
    // 从每个区域中心与建筑位置出发，覆盖跨区的旧包围盒入口错误。
    const sources=[...regions.map(r=>({x:Math.round((r.min_x+r.max_x)/2),y:Math.round((r.min_y+r.max_y)/2),z:0})),...buildings.filter(b=>b.z===0)];
    let oldFailures=0; let verified=0;
    try { for(const source of sources){
      const old=map.code==='map_dark_forest_deep'?{x:-25,y:-186,z:0}:{x:Math.min(region.max_x,Math.max(region.min_x,source.x)),y:Math.min(region.max_y,Math.max(region.min_y,source.y)),z:0};
      if(!pointBelongsToRegion(areas,region.id,old))oldFailures++;
      const entry=validWorldSitePoint(areas,region.id,source);
      if(entry.z!==0 || !pointBelongsToRegion(areas,region.id,entry))throw new Error('落点归属或楼层错误');
      candidates.push({region:region.id,x:entry.x,y:entry.y,z:entry.z});
      verified++;
    } return {map:map.code,region:region.name,oldFailures,verified}; }
    catch(error){return {map:map.code,region:region.name,error:String(error)}}
  });
  const invalidCommissions=commissions.filter(c=>c.x==null||!pointBelongsToRegion(areas,c.target_region_id,c));
  const [duplicates]=await connection.query<any[]>("SELECT code,COUNT(*) AS count FROM map_npcs GROUP BY code HAVING COUNT(*)>1");
  // 独立用数据库的实际移动优先级复核，不仅让同一个几何函数自检。
  const movementSqlMismatches=[];
  for (let i=0;i<candidates.length;i+=100) {
    const batch=candidates.slice(i,i+100);
    const [resolved]=await connection.query<any[]>(`SELECT * FROM (SELECT p.idx,p.expected,(SELECT r.id FROM map_regions r JOIN map_region_areas a ON r.id=a.region_id WHERE p.x BETWEEN a.min_x AND a.max_x AND p.y BETWEEN a.min_y AND a.max_y AND p.z BETWEEN a.min_z AND a.max_z ORDER BY r.danger_level DESC LIMIT 1) AS actual FROM (${batch.map(()=> 'SELECT ? AS idx,? AS expected,? AS x,? AS y,? AS z').join(' UNION ALL ')}) p) q WHERE actual IS NULL OR actual<>expected`,batch.flatMap((p,index)=>[i+index,p.region,p.x,p.y,p.z]));
    movementSqlMismatches.push(...resolved);
  }
  console.log(JSON.stringify({counts:{regions:regions.length,areas:areas.length,maps:maps.length,buildings:buildings.length,npcs:npcs.length,acceptedCommissions:commissions.length,sqlVerifiedEntries:candidates.length},mapEntries,invalidBuildings,invalidNpcs,invalidRoutes,invalidCommissions,duplicates,movementSqlMismatches},null,2));
  if (mapEntries.some(entry=>'error' in entry) || invalidBuildings.length || invalidNpcs.length || invalidRoutes.length || invalidCommissions.length || duplicates.length || movementSqlMismatches.length) process.exitCode=1;
  await connection.rollback();
} finally { await connection.end(); }
