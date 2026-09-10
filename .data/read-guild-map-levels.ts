import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createConnection} from 'mysql2/promise';
import {guildMapCatalog} from '../src/game/guild-map.service';
import assert from 'node:assert/strict';
const {parse}=createRequire(import.meta.url)('yaml');
const config=parse(readFileSync('alemon.config.yaml','utf8')),db=config.FantasyFinal?.database??config.mysql;
const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database,connectTimeout:8000});
try{
 await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 const[rows]=await c.query(`SELECT r.code,r.name,r.is_enabled,r.is_owner_only,r.danger_level,MIN(t.level) AS min_level,MAX(t.level) AS max_level,
 GROUP_CONCAT(DISTINCT CASE WHEN t.monster_class='boss' THEN CONCAT(t.name,':',t.level) END) AS bosses
 FROM map_regions r LEFT JOIN map_monster_pools p ON p.region_id=r.id LEFT JOIN monster_templates t ON t.id=p.monster_template_id
 WHERE r.code IN ('worldtree_meadow','morningdew_riverbank','dark_forest','dark_forest_deep','ridge_foothills','rediron_pass','mistalgae_marsh','frostcrown_plateau','thundercliff') GROUP BY r.id`);
 console.log(JSON.stringify(rows));
 const[items]=await c.query(`SELECT code,name,codex_id,JSON_UNQUOTE(JSON_EXTRACT(effect_json,'$.map')) AS region_code FROM item_definitions WHERE item_category='地图'`);
 console.log(JSON.stringify(items));
 const tree=await guildMapCatalog(c,'world_tree'),town=await guildMapCatalog(c,'baina_town');
 assert.deepEqual(tree.map(m=>m.regionCode),['worldtree_meadow','morningdew_riverbank','dark_forest','ridge_foothills','rediron_pass','mistalgae_marsh','baina_town']);
 assert.deepEqual(town.map(m=>m.regionCode),['dark_forest','dark_forest_deep','world_tree']);
 assert.deepEqual(tree.map(m=>m.canExchange),[true,true,true,false,false,false,true]);
 assert.deepEqual(town.map(m=>m.canExchange),[true,false,true]);
 assert.equal(tree.at(-1)?.risk,'安全区');assert.equal(town.at(-1)?.risk,'安全区');
 console.log(JSON.stringify({verified:true,tree:tree.map(m=>[m.regionName,m.minLevel,m.maxLevel,m.risk,m.canExchange]),town:town.map(m=>[m.regionName,m.minLevel,m.maxLevel,m.risk,m.canExchange])}));
 await c.rollback();
}finally{await c.end();}
