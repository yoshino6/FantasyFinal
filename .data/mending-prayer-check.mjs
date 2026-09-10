import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createConnection} from 'mysql2/promise';
const cfg=createRequire(import.meta.url)('yaml').parse(fs.readFileSync('alemon.config.yaml','utf8')),db=cfg.FantasyFinal?.database??cfg.mysql;
const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database});
try{
 await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 for(const [label,sql] of [
 ['skill',"SELECT id,code,name,category,tier,mana_cost,cooldown_turns,chant_turns,power,description FROM skill_definitions WHERE name LIKE '%祷言%' OR code LIKE '%prayer%'"],
 ['specializations',"SELECT sp.character_id,sp.specialization,sp.level FROM player_skill_specializations sp JOIN skill_definitions s ON s.id=sp.skill_id WHERE s.code='saint_healer_mending_prayer'"],
 ['recentCooldowns',"SELECT cs.id,cs.turn_no,cs.state,cm.character_id,JSON_EXTRACT(cm.cooldowns,'$.saint_healer_mending_prayer') AS prayer_cooldown,JSON_EXTRACT(cm.cooldowns,'$.__bonusAction') AS bonus_action,JSON_EXTRACT(cs.cooldowns,'$.__bonusPhase') AS bonus_phase FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE JSON_EXTRACT(cm.cooldowns,'$.saint_healer_mending_prayer') IS NOT NULL ORDER BY cs.last_action_at DESC LIMIT 8"]
 ]){try{const[rows]=await c.query(sql);console.log(JSON.stringify({label,rows}));}catch(e){console.log(JSON.stringify({label,error:e.message}));}}
 await c.rollback();
}finally{await c.end();}
