import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createConnection } from 'mysql2/promise';
const { parse } = createRequire(import.meta.url)('yaml');
const cfg = parse(readFileSync('alemon.config.yaml','utf8'));
const db = cfg.FantasyFinal?.database ?? cfg.mysql;
const c = await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database,charset:'utf8mb4',connectTimeout:10000});
try {
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
 await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 const [tables] = await c.query<any[]>('SHOW TABLES');
 const names=tables.map(t=>String(Object.values(t)[0]));
 const wanted=['characters','players','player_equipment','player_item_instances','item_definitions','monster_templates','monster_spawns','player_automatons','automaton_growth_records','profession_definitions','combat_sessions','combat_logs'];
 const schema:any={};
 for(const name of wanted.filter(t=>names.includes(t))) { const [r]=await c.query(`SHOW COLUMNS FROM \`${name}\``); schema[name]=r; }
 writeFileSync('.data/balance-review-20260908/schema.json',JSON.stringify({names,schema},null,2));
 const out:any={capturedAt:new Date().toISOString(),scope:'current configured database, read-only consistent snapshot; no account identifiers'};
 const queries:Record<string,string>={
 characters:'SELECT c.id,c.npc_code,c.level,c.profession_code,c.constitution,c.spirit,c.strength,c.intelligence,c.agility,c.perception,c.constitution_growth,c.spirit_growth,c.strength_growth,c.intelligence_growth,c.agility_growth,c.perception_growth,c.hp_max,c.mp_max,c.physical_attack,c.magic_attack,c.physical_defense,c.magic_defense,c.accuracy,c.evasion,c.crit_rate_bp,c.crit_damage_bp,c.crit_resist_bp,c.crit_damage_reduction_bp,c.tenacity,c.tenacity_pierce,c.speed,c.stat_formula_version,c.created_at,c.updated_at FROM characters c ORDER BY c.id',
 equipment:`SELECT pe.character_id,pe.slot,pe.instance_id,i.code,i.name,i.item_category,i.weapon_type,i.rarity,i.required_level,COALESCE(ii.quality,100) AS quality,COALESCE(ii.effect_json,i.effect_json) AS effect_json,ii.forge_primary_json FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id`,
 monsters:'SELECT * FROM monster_templates ORDER BY level,code',
 professions:'SELECT * FROM profession_definitions',
 automatons:'SELECT id,holder_id,owner_id,following,state_json FROM player_automatons',
 artifacts:"SELECT code,name,effect_json FROM item_definitions WHERE rarity='神器'",
 gearInventory:"SELECT i.rarity,i.item_category,COUNT(*) AS count,MIN(i.required_level) AS minLevel,MAX(i.required_level) AS maxLevel,AVG(ii.quality) AS avgQuality,SUM(ii.forge_primary_json IS NULL) AS missingPrimary FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE i.item_type='equipment' GROUP BY i.rarity,i.item_category",
 activeSpawns:'SELECT mt.monster_class,COUNT(*) AS count,MIN(ms.level) AS minLevel,MAX(ms.level) AS maxLevel FROM monster_spawns ms JOIN monster_templates mt ON mt.id=ms.template_id WHERE ms.defeated_at IS NULL GROUP BY mt.monster_class',
 combatSummary:'SELECT state,COUNT(*) AS count,AVG(turn_no) AS avgTurn FROM combat_sessions GROUP BY state',
 spawns:`SELECT ms.id,ms.template_id,mt.code,mt.name,mt.monster_class,ms.level,ms.constitution,ms.spirit,ms.strength,ms.intelligence,ms.agility,ms.perception,mt.constitution_growth,mt.spirit_growth,mt.strength_growth,mt.intelligence_growth,mt.agility_growth,mt.perception_growth,ms.current_hp,ms.traits_json FROM monster_spawns ms JOIN monster_templates mt ON mt.id=ms.template_id WHERE ms.defeated_at IS NULL AND ms.level<=30 ORDER BY ms.level,mt.monster_class,ms.id`,
 fusions:'SELECT ef.instance_id,ef.effect_json FROM equipment_fusions ef JOIN player_equipment pe ON pe.instance_id=ef.instance_id'
 };
 for(const [k,q] of Object.entries(queries)){const [rows]=await c.query(q);out[k]=rows;}
 writeFileSync('.data/balance-review-20260908/snapshot.json',JSON.stringify(out,null,2));
 console.log(JSON.stringify({capturedAt:out.capturedAt,counts:Object.fromEntries(Object.keys(queries).map(k=>[k,out[k].length])),professions:out.professions,inventory:out.gearInventory,combat:out.combatSummary,automatons:out.automatons.map((a:any)=>({id:a.id,stateKeys:Object.keys(typeof a.state_json==='string'?JSON.parse(a.state_json):a.state_json)}))}));
 await c.rollback();
} finally {await c.end();}

