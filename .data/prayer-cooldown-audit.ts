import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createConnection} from 'mysql2/promise';
const config=createRequire(import.meta.url)('yaml').parse(readFileSync('alemon.config.yaml','utf8')),db=config.FantasyFinal?.database??config.mysql;
const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database});
try{
 await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 for(const [label,sql] of Object.entries({skills:"SELECT id,code,name,tier,mana_cost,cooldown_turns,chant_turns,description FROM skill_definitions WHERE name LIKE '%祷言%'",specializations:"SELECT c.name,s.code,ss.specialization,ss.level FROM player_skill_specializations ss JOIN characters c ON c.id=ss.character_id JOIN skill_definitions s ON s.id=ss.skill_id WHERE s.code='saint_healer_mending_prayer'",active:"SELECT cs.id,cs.turn_no,c.name,cm.cooldowns FROM combat_members cm JOIN characters c ON c.id=cm.character_id JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cs.state='active'"})){
 const [rows]=await c.query(sql);console.log(JSON.stringify({label,rows}));
 }
 await c.rollback();
}finally{await c.end();}
