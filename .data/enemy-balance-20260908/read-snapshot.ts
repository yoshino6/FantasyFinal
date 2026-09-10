import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createConnection} from 'mysql2/promise';
import {monsterCombatStats,monsterAttributes} from '../../src/game/adventure.service';
import {buildNpcSparProfile,canSparNpc} from '../../src/game/npc-sparring.config';
const cfg=createRequire(import.meta.url)('yaml').parse(readFileSync('alemon.config.yaml','utf8')),db=cfg.FantasyFinal?.database??cfg.mysql;
const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database});
try{
 await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 const queries={templates:'SELECT * FROM monster_templates',spawns:'SELECT s.*,t.code,t.name,t.monster_class,t.constitution_growth,t.spirit_growth,t.strength_growth,t.intelligence_growth,t.agility_growth,t.perception_growth FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id',npcs:'SELECT n.*,r.code AS region_code FROM map_npcs n JOIN map_regions r ON r.id=n.region_id',npcCharacters:'SELECT * FROM characters WHERE npc_code IS NOT NULL',profiles:'SELECT * FROM npc_spar_profiles',dynamicNpcs:'SELECT * FROM world_dynamic_npc_states',worldline:'SELECT * FROM worldline_states',activeCombat:"SELECT id,mode FROM combat_sessions WHERE state='active'",targets:'SELECT ct.* FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE cs.state=\'active\'',schema:'SHOW COLUMNS FROM npc_spar_profiles'};
 const out:any={at:new Date().toISOString()};for(const[key,query]of Object.entries(queries)){const[rows]=await c.query(query);out[key]=rows;}
 for(const row of [...out.templates,...out.spawns]){row.calculated=monsterCombatStats(row);row.finalSix=monsterAttributes(row);}
 out.npcAudit=out.npcs.filter((row:any)=>canSparNpc(row.code,row.interaction_kind)).flatMap((row:any)=>[1,10,20,30,40,50].map(level=>({input:row,playerLevel:level,worldStage:0,profile:buildNpcSparProfile(row,level,0)})));
 writeFileSync('.data/enemy-balance-20260908/before.json',JSON.stringify(out,null,2));
 console.log(JSON.stringify({at:out.at,counts:Object.fromEntries(Object.keys(queries).map(key=>[key,out[key].length])),alive:out.spawns.filter((r:any)=>!r.defeated_at).length,schema:out.schema.map((r:any)=>r.Field),traitCodes:[...new Set(out.spawns.filter((r:any)=>!r.defeated_at).flatMap((r:any)=>(typeof r.traits_json==='string'?JSON.parse(r.traits_json):r.traits_json??[]).map((t:any)=>t.code)))]}));
 await c.rollback();
}finally{await c.end();}
process.exit(0);
