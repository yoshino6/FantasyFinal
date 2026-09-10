import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createConnection } from 'mysql2/promise';
const { parse } = createRequire(import.meta.url)('yaml');
const cfg = parse(readFileSync('alemon.config.yaml','utf8')), db = cfg.FantasyFinal?.database ?? cfg.mysql;
const c = await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database,charset:'utf8mb4',connectTimeout:10000});
try {
 await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 const queries = {
 definitions:"SELECT id,code,item_category,weapon_type,rarity,required_level,effect_json FROM item_definitions WHERE item_type='equipment'",
 instances:"SELECT ii.id,ii.item_id,ii.character_id,ii.effect_json,ii.quality,ii.forge_primary_json FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE i.item_type='equipment'",
 fusions:'SELECT instance_id,effect_json FROM equipment_fusions',
 characters:'SELECT id,npc_code,level,hp_max,mp_max,current_hp,current_mp,stat_formula_version FROM characters',
 automatons:'SELECT id,state_json FROM player_automatons',
 activeCombat:"SELECT id,state FROM combat_sessions WHERE state='active'",
 tables:'SHOW TABLES'
 };
 const out:any={capturedAt:new Date().toISOString()};
 for(const [k,q] of Object.entries(queries)){const[r]=await c.query(q);out[k]=r;}
 writeFileSync('.data/balance-review-20260908/implementation-snapshot.json',JSON.stringify(out,null,2));
 console.log(JSON.stringify({capturedAt:out.capturedAt,counts:Object.fromEntries(Object.keys(queries).map(k=>[k,out[k].length])),prefixes:Object.entries(out.definitions.reduce((a:any,r:any)=>{const k=r.code.split('_')[0];a[k]=(a[k]??0)+1;return a;},{}))}));
 await c.rollback();
} finally {await c.end();}
