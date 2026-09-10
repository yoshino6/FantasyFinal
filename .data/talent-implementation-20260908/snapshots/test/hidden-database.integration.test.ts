import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import * as alemon from 'alemonjs';
import { createConnection, type RowDataPacket, type PoolConnection } from 'mysql2/promise';
import { createRequire } from 'node:module';
const { parse } = createRequire(import.meta.url)('yaml');
import { hiddenBattleContext, submitHiddenDraft } from '../src/game/hidden-battle.service';
import { executeHiddenCombat } from '../src/game/hidden-combat';
import { createCombatRules } from '../src/game/combat-rule-adapter';
import { createPvpCombatRules } from '../src/game/pvp-combat-rule-adapter';
import { hiddenState } from '../src/game/hidden-combat-state';
import { grantInventory } from '../src/game/inventory-binding';

const characterId=Number(process.env.FF_HIDDEN_TEST_CHARACTER_ID??0);
test('配置数据库：PVE/PVP适配器、材料扣除、主脑能源与票据并发保护（全部回滚）',{skip:!characterId},async()=>{
  const config=parse(readFileSync('alemon.config.yaml','utf8')),db=config.FantasyFinal?.database??config.mysql;
  const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database,connectTimeout:8000}) as PoolConnection;
  try {
    await c.beginTransaction();
    const [characters]=await c.execute<RowDataPacket[]>('SELECT * FROM characters WHERE id=? FOR UPDATE',[characterId]);assert.ok(characters[0]);
    const [active]=await c.execute<RowDataPacket[]>("SELECT 1 FROM combat_members m JOIN combat_sessions s ON s.id=m.session_id WHERE m.character_id=? AND s.state='active' UNION ALL SELECT 1 FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?)",[characterId,characterId,characterId]);assert.equal(active.length,0,'验收角色正在战斗，取消本次数据库测试');
    const session=randomUUID();
    const [particles]=await c.query<RowDataPacket[]>("SELECT id,code FROM item_definitions WHERE code IN ('fire_element_dust','magic_unit')");assert.equal(particles.length,2);
    for(const item of particles)await grantInventory(c,characterId,Number(item.id),{personal:10,trade:0,unbound:0});
    const [weapon]=await c.query<RowDataPacket[]>("SELECT id FROM item_definitions WHERE item_category='武器' AND weapon_type='长剑' AND required_level<=1 LIMIT 1");
    if(!weapon.length){const [fallback]=await c.query<RowDataPacket[]>("SELECT id FROM item_definitions WHERE item_category='武器' AND required_level<=25 LIMIT 1");weapon.push(fallback[0]);}assert.ok(weapon[0]);
    const [wi]=await c.execute<any>('INSERT INTO player_item_instances (character_id,item_id,quality) VALUES (?,?,0)',[characterId,weapon[0].id]);const weaponId=Number(wi.insertId);
    const [device]=await c.query<RowDataPacket[]>("SELECT id FROM item_definitions WHERE code='simple_launcher'");assert.ok(device[0]);
    const [di]=await c.execute<any>('INSERT INTO player_item_instances (character_id,item_id,quality) VALUES (?,?,0)',[characterId,device[0].id]);const deviceId=Number(di.insertId);
    await c.execute('INSERT INTO player_active_devices (character_id,instance_id) VALUES (?,?)',[characterId,deviceId]);
    for(const [profession,config] of [['weapon_master',{weapons:[weaponId]}],['inventor',{devices:[deviceId]}]] as const) await c.execute('INSERT INTO player_hidden_profession_loadouts (character_id,profession_code,config_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE config_json=VALUES(config_json)',[characterId,profession,JSON.stringify(config)]);
    const cases=[['magical_scholar','hidden_mix',{particles:['fire_element_dust','magic_unit']}],['weapon_master','hidden_weapon_strike',{weapons:[weaponId]}],['inventor','hidden_overclock',{devices:[{id:deviceId,skill:'simple_launcher_fire'}]}],['tactician','hidden_mark',{}]] as const;
    for(const kind of ['pve','pvp'] as const) {
      await c.execute('INSERT INTO combat_device_energy (battle_kind,session_id,character_id,instance_id,current_energy,max_energy) VALUES (?,?,?,?,100,100)',[kind,session,characterId,deviceId]);
      for(const [profession,code,choice] of cases) {
        const member={...characters[0],id:characterId,current_hp:10000,hp_max:10000,current_mp:10000,mp_max:10000,cooldowns:{},selected_target_id:-1};
        const foe={...member,id:-1,name:'事务验收靶',current_hp:100000,hp_max:100000,cooldowns:{},monster_class:'normal'};
        const log:string[]=[];
        const pve=kind==='pve'?await createCombatRules(c,session,1,[member],[foe],()=>({physicalAttack:100,magicAttack:100,physicalDefense:100,magicDefense:100,accuracy:100,evasion:0,speed:10,crit:0,critResist:1000,critDamage:0,critReduction:1000,tenacityPierce:100,tenacity:100,mpMax:10000}),()=>[],log,'',async()=>({absorbed:0,remaining:0,broken:false}),()=>{}):undefined;
        const pvp=kind==='pvp'?await createPvpCombatRules(c,[member,foe],[{},{}],1,log,()=>{}):undefined;
        const rules=pve?.rule??pvp!.rule,u=pve?pve.get('member',characterId):pvp!.get(characterId);rules.random=()=>.5;hiddenState(u).profession=profession;hiddenState(u).resource=100;
        await rules.beforeAction(u);const ctx=await hiddenBattleContext(c,characterId,session,kind);await executeHiddenCombat(rules,u,code,choice as any,ctx);assert.ok(u.mp<10000,`${kind}/${profession}`);
      }
      const [energy]=await c.execute<RowDataPacket[]>('SELECT current_energy FROM combat_device_energy WHERE battle_kind=? AND session_id=? AND character_id=? AND instance_id=?',[kind,session,characterId,deviceId]);assert.equal(Number(energy[0].current_energy),40);
    }
    const ticket={battleKey:`pve:${session}`,turn:1,revision:1};
    await c.execute('INSERT INTO player_hidden_action_drafts (character_id,battle_key,turn_no,skill_code,draft_json,revision) VALUES (?,?,1,\'hidden_mix\',?,1)',[characterId,ticket.battleKey,JSON.stringify({particles:['fire_element_dust','magic_unit']})]);
    await assert.rejects(submitHiddenDraft(c,characterId,session,1,'pve','hidden_mix',{...ticket,revision:0}));
    await assert.rejects(submitHiddenDraft(c,characterId,session,2,'pve','hidden_mix',ticket));
    assert.equal((await submitHiddenDraft(c,characterId,session,1,'pve','hidden_mix',ticket)).particles?.length,2);
    await assert.rejects(submitHiddenDraft(c,characterId,session,1,'pve','hidden_mix',ticket));

    // 公共服务仍使用真实 SQL；只把连接池替换成本测试事务，杜绝启动全量初始化或提交测试数据。
    const require=createRequire(import.meta.url),cache=new Map<string,any>();
    const load=(relative:string):any=>{
      const path=resolve(relative.endsWith('.ts')?relative:relative+'.ts');if(cache.has(path))return cache.get(path).exports;
      const module={exports:{} as any};cache.set(path,module);
      const local=(id:string):any=>id==='alemonjs'?alemon:id.endsWith('/pool')?{getPool:async()=>c,withTransaction:async(work:any)=>work(c)}:id.startsWith('.')?load(resolve(dirname(path),id)):require(id);
      const compiled=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
      new Function('require','module','exports',compiled)(local,module,module.exports);
      return module.exports;
    };
    const [users]=await c.execute<RowDataPacket[]>('SELECT p.qq_user_id FROM characters c JOIN players p ON p.id=c.player_id WHERE c.id=?',[characterId]);const user=String(users[0].qq_user_id);
    const [templates]=await c.query<RowDataPacket[]>("SELECT id FROM monster_templates WHERE code='forest_slime' LIMIT 1");assert.ok(templates[0]);
    const character=characters[0];const [spawn]=await c.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,current_hp) VALUES (?,?,?,?,?,30,999999)',[templates[0].id,character.current_region_id,character.pos_x,character.pos_y,character.pos_z]);
    const liveSession=randomUUID(),spawnId=Number(spawn.insertId);
    await c.execute('INSERT INTO combat_sessions (id,character_id,spawn_id,player_hp,player_mp,cooldowns) VALUES (?,?,?,10000,10000,?)',[liveSession,characterId,spawnId,'{}']);
    await c.execute('INSERT INTO combat_members (session_id,character_id,current_hp,current_mp,selected_target_id,cooldowns) VALUES (?,?,10000,10000,?,?)',[liveSession,characterId,spawnId,'{}']);
    await c.execute('INSERT INTO combat_targets (session_id,spawn_id,cooldowns) VALUES (?,?,?)',[liveSession,spawnId,'{}']);
    await c.execute("INSERT INTO player_advanced_professions (character_id,profession_code,mentor_code,completed_at) VALUES (?,'magical_scholar','alchemy_sweetshop',NOW()) ON DUPLICATE KEY UPDATE profession_code=VALUES(profession_code)",[characterId]);
    await c.execute("INSERT IGNORE INTO player_skills (character_id,skill_id,level) SELECT ?,id,1 FROM skill_definitions WHERE code='hidden_mix'",[characterId]);
    const service=load('src/game/hidden-battle.service'),adventure=load('src/game/adventure.service');
    let draft=await service.hiddenDraft(user,'hidden_mix');draft=await service.hiddenDraft(user,'hidden_mix',draft.revision,'particle','fire_element_dust');draft=await service.hiddenDraft(user,'hidden_mix',draft.revision,'particle','magic_unit');
    const result=await adventure.combatAction(user,'skill',undefined,draft.skillId,undefined,undefined,undefined,undefined,false,{battleKey:draft.battleKey,turn:draft.turn,revision:draft.revision});assert.equal(result.waiting,false);assert.equal(result.ended,false);
    const [persisted]=await c.execute<RowDataPacket[]>('SELECT current_mp,cooldowns,pending_action FROM combat_members WHERE session_id=? AND character_id=?',[liveSession,characterId]);
    assert.ok(Number(persisted[0].current_mp)<10000);const state=typeof persisted[0].cooldowns==='string'?JSON.parse(persisted[0].cooldowns):persisted[0].cooldowns;assert.equal(state.__hidden.profession,'magical_scholar');assert.equal(state.__hidden.resource,25);assert.equal(persisted[0].pending_action,null);
    await assert.rejects(adventure.combatAction(user,'skill',undefined,draft.skillId,undefined,undefined,undefined,undefined,false,{battleKey:draft.battleKey,turn:draft.turn,revision:draft.revision}));

    await c.execute("UPDATE combat_sessions SET state='escaped' WHERE id=?",[liveSession]);
    const [player]=await c.execute<any>('INSERT INTO players (qq_user_id) VALUES (?)',[`test_${randomUUID().replaceAll('-','').slice(0,20)}`]);
    const [columns]=await c.query<RowDataPacket[]>('SHOW COLUMNS FROM characters');const names=columns.filter(col=>col.Field!=='id'&&!String(col.Extra).includes('GENERATED')).map(col=>String(col.Field));
    const [clone]=await c.execute<any>(`INSERT INTO characters (${names.map(n=>'`'+n+'`').join(',')}) SELECT ${names.map(n=>n==='player_id'?'?':n==='name'?"'隐藏验收影像'":n==='game_id'?'NULL':'`'+n+'`').join(',')} FROM characters WHERE id=?`,[player.insertId,characterId]);
    const opponent=Number(clone.insertId),pvpSession=randomUUID();
    await c.execute('INSERT INTO player_pvp_battle_sessions (id,attacker_character_id,defender_character_id,attacker_hp,attacker_mp,defender_hp,defender_mp,attacker_cooldowns,defender_cooldowns) VALUES (?,?,?,10000,10000,10000,10000,?,?)',[pvpSession,characterId,opponent,'{}','{}']);
    const pvpService=load('src/game/pvp.service');draft=await service.hiddenDraft(user,'hidden_mix');draft=await service.hiddenDraft(user,'hidden_mix',draft.revision,'particle','fire_element_dust');draft=await service.hiddenDraft(user,'hidden_mix',draft.revision,'particle','magic_unit');
    const pvpResult=await pvpService.pvpCombatAction(user,'skill',undefined,undefined,undefined,false,draft.skillId,{battleKey:draft.battleKey,turn:draft.turn,revision:draft.revision});assert.equal(pvpResult.ended,false);
    const [pvpSaved]=await c.execute<RowDataPacket[]>('SELECT attacker_mp,attacker_cooldowns,turn_no FROM player_pvp_battle_sessions WHERE id=?',[pvpSession]);assert.equal(Number(pvpSaved[0].turn_no),2);assert.ok(Number(pvpSaved[0].attacker_mp)<10000);
    const pvpState=typeof pvpSaved[0].attacker_cooldowns==='string'?JSON.parse(pvpSaved[0].attacker_cooldowns):pvpSaved[0].attacker_cooldowns;assert.equal(pvpState.__hidden.resource,25);
    const response=load('src/response/hidden-combat');const format=await response.hiddenCombatFormat(user,'hidden_mix');const serialized=JSON.stringify(format.value);assert.ok(serialized.includes('调配·主材'));
    const values:string[]=[];const visit=(value:any)=>{if(typeof value==='string')values.push(value);else if(value&&typeof value==='object')for(const child of Object.values(value))visit(child);};visit(JSON.parse(serialized));
    assert.equal(values.filter(value=>value.startsWith('/隐藏战技 ')&&value.includes(' particle ')).length,12);
    const keyboard=format.value.find((v:any)=>v.type==='BT.group');assert.equal(keyboard.value.length,5);assert.deepEqual(keyboard.value.slice(0,3).map((row:any)=>row.value.length),[4,4,4]);

    await c.execute("UPDATE player_pvp_battle_sessions SET state='escaped' WHERE id=?",[pvpSession]);
    const quests=load('src/game/hidden-quest.service'),lessons=load('src/game/hidden-quest.lesson'),professions=load('src/game/hidden-profession.config');
    for(const profession of professions.hiddenProfessions) {
      const [npcs]=await c.execute<RowDataPacket[]>('SELECT region_id,pos_x,pos_y,pos_z FROM map_npcs WHERE code=? LIMIT 1',[profession.npc]);assert.ok(npcs[0]);
      await c.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=?,secondary_profession_code=? WHERE id=?',[npcs[0].region_id,npcs[0].pos_x,npcs[0].pos_y,npcs[0].pos_z,profession.secondary,characterId]);
      await c.execute('INSERT INTO player_npc_affinity (character_id,npc_code,affinity,daily_date) VALUES (?,?,500,CURDATE()) ON DUPLICATE KEY UPDATE affinity=GREATEST(affinity,500)',[characterId,profession.npc]);
      await c.execute('DELETE FROM player_hidden_profession_quests WHERE character_id=? AND profession_code=?',[characterId,profession.code]);
      await c.execute('UPDATE player_npc_affinity SET affinity=499 WHERE character_id=? AND npc_code=?',[characterId,profession.npc]);
      assert.equal(await quests.hiddenQuestTopic(user,profession.npc),null);
      await assert.rejects(quests.hiddenQuestView(user,profession.code),/暂时没有/);
      await assert.rejects(quests.hiddenQuestAction(user,profession.code,0,'accept'),/暂时没有/);
      await c.execute('UPDATE player_npc_affinity SET affinity=500 WHERE character_id=? AND npc_code=?',[characterId,profession.npc]);
      assert.ok(await quests.hiddenQuestTopic(user,profession.npc));
      const first=await quests.hiddenQuestAction(user,profession.code,0,'accept');assert.equal(first.accepted,true);
      await c.execute('UPDATE player_npc_affinity SET affinity=499 WHERE character_id=? AND npc_code=?',[characterId,profession.npc]);
      assert.ok(await quests.hiddenQuestTopic(user,profession.npc),'已接取进度不因新门槛被收回');
      await c.execute('INSERT INTO player_hidden_profession_quests (character_id,profession_code,stage,accepted_at,materials_paid,evidence_json,revision) VALUES (?,?,10,NOW(),1,?,0) ON DUPLICATE KEY UPDATE stage=10,accepted_at=NOW(),materials_paid=1,evidence_json=VALUES(evidence_json),qualified_at=NULL,revision=0',[characterId,profession.code,JSON.stringify({lesson:lessons.newHiddenLesson()})]);
      const tracked=await quests.hiddenTrackedQuests(user);assert.ok(tracked.some((task:any)=>task.title.includes(profession.name+' 10/10')));
      let revision=0;for(const step of lessons.hiddenLessonSteps(profession.code,10)) {const result=await quests.hiddenQuestAction(user,profession.code,revision,'lesson',step.correct);revision=result.revision;}
      const finished=await quests.hiddenQuestAction(user,profession.code,revision,'finish');assert.equal(finished.qualified,true);assert.equal(finished.stage,11);
      assert.ok(!(await quests.hiddenTrackedQuests(user)).some((task:any)=>task.title.includes(profession.name+' 10/10')));
      await c.execute("UPDATE player_advanced_professions SET profession_code='warlord',completed_at=DATE_SUB(NOW(),INTERVAL 2 DAY) WHERE character_id=?",[characterId]);
      const advanced=await quests.becomeHiddenProfession(user,profession.code);assert.equal(advanced.profession.name,profession.name);
      const [skills]=await c.execute<RowDataPacket[]>("SELECT s.code FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.code LIKE 'hidden_%'",[characterId]);assert.equal(skills.length,5);
    }

    let automatic=await service.hiddenDraft(user,'hidden_plan');assert.equal(automatic.kind,'setup');automatic=await service.hiddenDraft(user,'hidden_plan',automatic.revision,'mode','guard');automatic=await service.hiddenDraft(user,'hidden_plan',automatic.revision,'target','self');await service.saveHiddenAuto(user,'hidden_plan',automatic.revision);
    await c.execute('INSERT INTO player_pvp_auto_battle_settings (character_id,enabled) VALUES (?,1) ON DUPLICATE KEY UPDATE enabled=1,auto_potion_enabled=0,action_cursor=1',[characterId]);
    await c.execute('DELETE FROM player_pvp_auto_battle_actions WHERE character_id=?',[characterId]);await c.execute("INSERT INTO player_pvp_auto_battle_actions (character_id,sequence_no,skill_id) SELECT ?,1,id FROM skill_definitions WHERE code='hidden_plan'",[characterId]);
    const autoSession=randomUUID();await c.execute('INSERT INTO player_pvp_battle_sessions (id,attacker_character_id,defender_character_id,attacker_hp,attacker_mp,defender_hp,defender_mp,attacker_cooldowns,defender_cooldowns) VALUES (?,?,?,10000,10000,10000,10000,?,?)',[autoSession,characterId,opponent,'{}','{}']);
    const automated=await pvpService.pvpCombatAction(user,'auto');assert.equal(automated.ended,false);const [autoSaved]=await c.execute<RowDataPacket[]>('SELECT attacker_mp,attacker_cooldowns FROM player_pvp_battle_sessions WHERE id=?',[autoSession]);assert.ok(Number(autoSaved[0].attacker_mp)<10000);
    const autoState=typeof autoSaved[0].attacker_cooldowns==='string'?JSON.parse(autoSaved[0].attacker_cooldowns):autoSaved[0].attacker_cooldowns;assert.equal(autoState.__hidden.profession,'tactician');assert.ok(autoState.hidden_plan>0);
    await c.execute("UPDATE player_pvp_battle_sessions SET state='escaped' WHERE id=?",[autoSession]);
  } finally { await c.rollback();await c.end(); }
});
