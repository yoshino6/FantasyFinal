import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {createConnection,type RowDataPacket} from 'mysql2/promise';
import ts from 'typescript';
import {initializeLamplight} from '../src/database/lamplight';
import {initializeOpeningChests} from '../src/database/opening-chests';
import * as itemPolicy from '../src/game/item-use-policy';
import * as people from '../src/game/lamplight-people';
import * as config from '../src/game/lamplight.config';
import * as work from '../src/game/lamplight-work';
import * as world from '../src/game/opening-world.config';
import * as openingState from '../src/game/opening-state';
import * as geometry from '../src/game/world-site-geometry';
import * as inventory from '../src/game/inventory-binding';
import * as constants from '../src/game/constants';
import * as content from '../src/game/opening-content';
import * as endings from '../src/game/lamplight-endings';
import * as npcConfig from '../src/game/npc-sparring.config';
import * as advancedResources from '../src/game/advanced-resource.config';
import {assertLamplightRegionAccess} from '../src/game/lamplight-access';

test('隔离MySQL：灯火任务图、奖励重放、门槛与实际对抗事务', {skip:process.env.FF_OPENING_DB_TEST!=='1'},async t=>{
 const {parse}=createRequire(import.meta.url)('yaml'),settings=parse(readFileSync('alemon.config.yaml','utf8')),db=settings.FantasyFinal?.database??settings.mysql;
 const name=`ff_lamplight_${randomUUID().replaceAll('-','')}`,q=(s:string)=>'`'+s.replaceAll('`','``')+'`';
 const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,charset:'utf8mb4',connectTimeout:8000});let created=false;
 const tables=['players','characters','map_regions','map_region_areas','map_npcs','item_definitions','player_inventory','player_item_codex','player_blessings',
 'player_opening_stories','player_opening_visits','opening_world','player_main_quest_progress','player_goblin_king_quest','player_travels','player_resource_mining',
 'combat_sessions','combat_members','combat_targets','combat_threat','combat_status_effects','combat_spirits','combat_profession_resources','player_advanced_professions','monster_spawns','monster_templates',
 'player_pvp_battle_sessions','negotiation_sessions','negotiation_participants','party_members','player_home_visits','player_battle_buffs','guild_shop_items','player_craft_requests'];
 try{
  await c.query(`CREATE DATABASE ${q(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);created=true;
  for(const table of tables)await c.query(`CREATE TABLE ${q(name)}.${q(table)} LIKE ${q(db.database)}.${q(table)}`);
  await c.query(`USE ${q(name)}`);
  for(const table of ['map_regions','map_region_areas','map_npcs','item_definitions','monster_templates'])await c.query(`INSERT INTO ${q(table)} SELECT * FROM ${q(db.database)}.${q(table)}`);
  await c.query("INSERT INTO opening_world (id,current_goddess) VALUES (1,'aqua')");
  await initializeLamplight(c as any);await initializeLamplight(c as any);
  await initializeOpeningChests(c as any);
  const [regions]=await c.query<RowDataPacket[]>("SELECT r.code,COUNT(a.id) AS n FROM map_regions r JOIN map_region_areas a ON a.region_id=r.id WHERE r.code LIKE 'lamplight_wm%' GROUP BY r.id");assert.equal(regions.length,8);assert.ok(regions.every(r=>Number(r.n)===1));
  const tx=async(fn:any)=>{await c.beginTransaction();try{const result=await fn(c);await c.commit();return result;}catch(e){await c.rollback();throw e;}};
  const achievementCalls:{characterId:number;facts:any[];event:string|undefined}[]=[];
  const deps:Record<string,any>={'../database/pool':{getPool:async()=>c,withTransaction:tx},'./lamplight-people':people,'./lamplight.config':config,'./lamplight-work':work,'./opening-world.config':world,'./opening-state':openingState,'./world-site-geometry':geometry,'./inventory-binding':inventory,'./constants':constants,'./opening-content':content,'./lamplight-endings':endings,'./npc-sparring.config':npcConfig,'./advanced-resource.config':advancedResources,'node:crypto':{randomUUID},
   './automaton-combat.service':{finishCombatAutomatons:async()=>{}},'./character.service':{recalculateCharacterStats:async()=>{}},'./world-dynamics.service':{snapshotCombatEnvironment:async()=>{}},'./talent-data':{ownedTalent:async()=>({group:'战斗'})},
   './adventure.service':{awardRealmExperience:async(connection:any,char:any,amount:number)=>{await connection.execute('UPDATE characters SET experience=experience+? WHERE id=?',[amount,char.id]);return{experience:amount};}},'./achievement-events':{recordAchievement:(_connection:any,characterId:number,facts:any[],event?:string)=>achievementCalls.push({characterId,facts,event})},'./achievement-hooks':{achievementActivity:async()=>{}}};
  // Run actual service SQL; isolate numeric growth/recalculation and weather, covered by their own suites.
  const load=(file:string,names?:string[])=>{const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);const input=names?ast.statements.filter(s=>ts.isImportDeclaration(s)||ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>names.includes(d.name.getText(ast)))).map(s=>s.getText(ast)).join('\n')+'\n'+names.map(n=>`export {${n}};`).join('\n'):ast.text;
   const code=ts.transpileModule(input,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const module={exports:{} as any};new Function('require','module','exports',code)((name:string)=>new Proxy({},{get:(_,key)=>deps[name]?.[key]}),module,module.exports);return module.exports;};
  deps['./opening.service']=load('src/game/opening.service.ts',['openingCharacter','grantOpeningItem']);
  const lamp=deps['./lamplight.service']=load('src/game/lamplight.service.ts');
  const battles=deps['./lamplight-battle.service']=load('src/game/lamplight-battle.service.ts');
  deps['./npc-sparring.service']=load('src/game/npc-sparring.service.ts',['finishNpcSparring']);
  const combatLifecycle=load('src/game/adventure.service.ts',['activeCombatFor','repairInvalidCombatFor','settleForcedCombatDefeat']);
  const breakthrough=load('src/game/main-quest.service.ts',['barrierStage','contemplateSkyDust']);
  deps['./lamplight-library.service']=load('src/game/lamplight-library.service.ts');
  deps['./item-use-policy']=itemPolicy;deps['./alchemy-journal.service']=load('src/game/alchemy-journal.service.ts',['craftJson','craftCharacterId','completeCraftRequest']);
  deps['./negotiation.service']={assertNoNegotiation:async()=>{}};
  const itemUse=load('src/game/item-use.service.ts');
  let sequence=0;
  const prepare=async(route:string,hub=content.openingRouteByCode(route)!.destination,version=content.openingRouteByCode(route)!.version)=>{
   const user=`lamp_${++sequence}`;const [player]=await c.execute<any>("INSERT INTO players (qq_user_id,status) VALUES (?,'active')",[user]);
   const safe=(await openingState.openingSafeHubs(c as any)).find(h=>h.code===hub)!;assert.ok(safe,hub);
   const attrs=['constitution','spirit','strength','intelligence','agility','perception'];const panel=['hp_max','mp_max','current_hp','current_mp','physical_attack','magic_attack','physical_defense','magic_defense','accuracy','evasion','crit_rate_bp','crit_damage_bp','crit_resist_bp','crit_damage_reduction_bp','tenacity','speed'];
   const [char]=await c.execute<any>(`INSERT INTO characters (player_id,name,level,realm_stage,adventurer_registered,profession_code,current_region_id,pos_x,pos_y,pos_z,${[...attrs,...panel].join(',')}) VALUES (?,'主线复核旅人',30,3,1,'warrior',?,?,?,?,${[...attrs,...panel].map(()=>100).join(',')})`,[player.insertId,safe.id,safe.pos_x,safe.pos_y,safe.pos_z]);
   const id=Number(char.insertId);
   await c.execute("INSERT INTO player_opening_stories (character_id,route_code,story_version,state,branch_code,flags_json,destination_code) VALUES (?,?,?,'completed','A',JSON_OBJECT(),?)",[id,route,version,hub]);
   return{user,id,hub,route,version};
  };
  const progress=async(id:number)=>(await c.execute<RowDataPacket[]>('SELECT * FROM player_lamplight_progress WHERE character_id=?',[id]))[0][0];
  const action=async(run:any,key:string)=>lamp.lamplightAction(run.user,Number((await progress(run.id)).revision),key);
  const finishNode=async(run:any,plan='A')=>{
   let state=await progress(run.id);const node=config.lamplightNode(state as any);assert.ok(node);
   await action(run,'go_scene');await action(run,'scene');await action(run,'go_record');await action(run,'record');await action(run,`plan_${plan}`);
   await action(run,`work_${work.lamplightWork(node).answer}`);await action(run,'verify');state=await progress(run.id);
   const callCount=achievementCalls.length;const result=await lamp.lamplightAction(run.user,Number(state.revision),'complete');const replay=await lamp.lamplightAction(run.user,Number(state.revision),'complete');assert.deepEqual(replay,JSON.parse(JSON.stringify(result)));const income=achievementCalls.slice(callCount).filter(call=>call.characterId===run.id&&call.facts.some(fact=>fact.metric==='ACH_K09'&&fact.value===Number(node.copper)));assert.equal(income.length,1);assert.equal(income[0].event,`lamplight-income:${node.code}:${run.id}`);return result;
  };
  await t.test('42条私人线全部结清，每人只有自己的三项奖励与当地汇流入口',async()=>{
   for(const route of content.openingRoutes){const run=await prepare(route.code);await lamp.lamplightView(run.user);
    for(let i=0;i<3;i++)await finishNode(run,i%2?'B':'A');
    const s=await progress(run.id);assert.equal(s.phase,'local');assert.equal(s.node_index,0);assert.equal(s.local_hub,run.hub);
    const [sum]=await c.execute<RowDataPacket[]>('SELECT COUNT(*) AS n,SUM(copper) AS copper FROM player_lamplight_rewards WHERE character_id=?',[run.id]);assert.equal(Number(sum[0].n),3);assert.equal(Number(sum[0].copper),300);
   }
  });
  await t.test('六地48节点汇入世界树；联合调查和40世界任务到达个人结局',async()=>{
   let final:any;
   for(const hub of Object.keys(world.openingHubs)){
    const route=content.openingRoutes.find(r=>r.destination===hub)!;const run=await prepare(route.code);await lamp.lamplightView(run.user);
    await c.execute("UPDATE player_lamplight_progress SET phase='local',node_index=0 WHERE character_id=?",[run.id]);
    await c.execute('INSERT INTO player_goblin_king_quest (character_id,stage) VALUES (?,11)',[run.id]);
    await c.execute("INSERT INTO player_main_quest_progress (character_id,quest_code,stage) VALUES (?,'girl_gratitude',6),(?,'evolution_barrier',8)",[run.id,run.id]);
    for(let i=0;i<8;i++)await finishNode(run);assert.equal((await progress(run.id)).phase,'join');final=run;
   }
   for(let i=0;i<6;i++)await finishNode(final,i===1?'C':'A');assert.equal((await progress(final.id)).phase,'world');
   for(let i=0;i<40;i++){
    const s=await progress(final.id),node=config.lamplightNode(s as any);
    if(node.gate==='boss'){
      for(const result of ['defeat','victory','victory'] as const){await action(final,'challenge');assert.equal(await tx((connection:any)=>combatLifecycle.repairInvalidCombatFor(connection,final.id)),false);const [modes]=await c.execute<RowDataPacket[]>("SELECT mode FROM combat_sessions WHERE character_id=? AND state='active'",[final.id]);assert.equal(modes[0].mode,'story');const [rows]=await c.execute<RowDataPacket[]>("SELECT session_id FROM player_lamplight_battles WHERE character_id=? AND state='active'",[final.id]);assert.equal(rows.length,1);await tx((connection:any)=>battles.finishLamplightBattle(connection,rows[0].session_id,result));}
    }
    await finishNode(final,node.code==='WM08-4'?'B':i%2?'B':'A');
   }
   const s=await progress(final.id);assert.equal(s.phase,'completed');const flags=typeof s.flags_json==='string'?JSON.parse(s.flags_json):s.flags_json;assert.equal(flags.echoRead,true);assert.equal(flags.echoAssisted,true);
   const view=await lamp.lamplightView(final.user);assert.match(view.text,/有任期的联合维护组/);
   const char=await deps['./opening.service'].openingCharacter(c,final.user);assert.equal(char.region_code,final.hub);
   await assertLamplightRegionAccess(c as any,final.id,'lamplight_wm08');
   writeFileSync('.data/lamplight-journey-result.json',JSON.stringify({privateTasks:126,localTasks:48,joinTasks:6,worldTasks:40,ending:true,battleResults:['defeat','victory','victory']},null,2));
  });
  await t.test('本地10级粉尘突破真实扣门槛；图书馆共享调查但非战斗研究不发进化种',async()=>{
   const run=await prepare('H01');await lamp.lamplightView(run.user);
   await c.execute("UPDATE player_lamplight_progress SET phase='local',node_index=4 WHERE character_id=?",[run.id]);
   await c.execute('UPDATE characters SET level=10,realm_stage=1,experience=? WHERE id=?',[constants.experienceRequiredForLevel(10),run.id]);
   await assert.rejects(action(run,'barrier_report'),/晴儿/);await action(run,'barrier_consult');
   await assert.rejects(action(run,'barrier_report'),/天空粉尘/);await action(run,'barrier_challenge');
   const [first]=await c.execute<RowDataPacket[]>("SELECT session_id FROM player_lamplight_battles WHERE character_id=? AND state='active'",[run.id]);
   await assert.rejects(action(run,'return'),/战斗/);await tx((connection:any)=>combatLifecycle.settleForcedCombatDefeat(connection,first[0].session_id));
   await assert.rejects(action(run,'barrier_report'),/天空粉尘/);await action(run,'barrier_challenge');
   const [second]=await c.execute<RowDataPacket[]>("SELECT session_id FROM player_lamplight_battles WHERE character_id=? AND state='active'",[run.id]);
   await tx((connection:any)=>deps['./npc-sparring.service'].finishNpcSparring(connection,second[0].session_id,'victory'));
   await action(run,'barrier_report');await breakthrough.contemplateSkyDust(run.user);
   const [char]=await c.execute<RowDataPacket[]>('SELECT realm_stage FROM characters WHERE id=?',[run.id]);assert.equal(char[0].realm_stage,2);
   await c.execute('UPDATE characters SET level=20,experience=? WHERE id=?',[constants.experienceRequiredForLevel(20),run.id]);
   await c.execute("UPDATE player_lamplight_progress SET phase='join',node_index=3,flags_json=JSON_OBJECT() WHERE character_id=?",[run.id]);
   for(let room=0;room<5;room++){await action(run,'library_go');await action(run,'library_read');}
   const [evo]=await c.execute<RowDataPacket[]>("SELECT stage FROM player_main_quest_progress WHERE character_id=? AND quest_code='evolution_barrier'",[run.id]);assert.equal(evo[0].stage,5);
   await finishNode(run);assert.equal((await progress(run.id)).node_index,4);
   await action(run,'research_start');const before=await progress(run.id);await assert.rejects(action(run,'research_1'),/不符/);assert.equal((await progress(run.id)).revision,before.revision);
   await action(run,'research_3');await action(run,'research_2');await finishNode(run);
   const [seeds]=await c.execute<RowDataPacket[]>("SELECT 1 FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND i.code='evolution_seed'",[run.id]);assert.equal(seeds.length,0);
  });
  await t.test('黄昏露可在实际世界树使用，全满、战斗与野外不扣物品，同凭据只回复一次',async()=>{
    const run=await prepare('D02','world_tree');await deps['./opening.service'].grantOpeningItem(c,run.id,'opening_twilight_dew',2);
    const [items]=await c.query<RowDataPacket[]>("SELECT id FROM item_definitions WHERE code='opening_twilight_dew'");const itemId=Number(items[0].id);
    const full=await itemUse.useInventoryItem(run.user,itemId,randomUUID());assert.equal(full.consumed,false);
    await c.execute('UPDATE characters SET current_hp=50,current_mp=40 WHERE id=?',[run.id]);const token=randomUUID();
    const used=await itemUse.useInventoryItem(run.user,itemId,token);assert.equal(used.consumed,true);assert.deepEqual(await itemUse.useInventoryItem(run.user,itemId,token),used);
    const [char]=await c.execute<RowDataPacket[]>('SELECT current_hp,current_mp FROM characters WHERE id=?',[run.id]);assert.deepEqual([char[0].current_hp,char[0].current_mp],[75,65]);
    await lamp.lamplightView(run.user);await c.execute("UPDATE player_lamplight_progress SET phase='world',node_index=36,flags_json=JSON_OBJECT() WHERE character_id=?",[run.id]);await action(run,'challenge');
    await assert.rejects(itemUse.useInventoryItem(run.user,itemId,randomUUID()),/战斗/);
    const [fight]=await c.execute<RowDataPacket[]>("SELECT session_id FROM player_lamplight_battles WHERE character_id=? AND state='active'",[run.id]);await tx((connection:any)=>battles.finishLamplightBattle(connection,fight[0].session_id,'escaped'));
    await c.execute("UPDATE characters SET current_region_id=(SELECT id FROM map_regions WHERE code='worldtree_meadow') WHERE id=?",[run.id]);await assert.rejects(itemUse.useInventoryItem(run.user,itemId,randomUUID()),/安全区/);
    const [stock]=await c.execute<RowDataPacket[]>('SELECT quantity FROM player_inventory WHERE character_id=? AND item_id=?',[run.id,itemId]);assert.equal(stock[0].quantity,1);
  });
  await t.test('同一结算的并发请求只记一次奖励；不同按钮不能篡改已保存选择',async()=>{
   const run=await prepare('Y01');await lamp.lamplightView(run.user);
   for(const step of ['go_scene','scene','go_record','record','plan_B'])await action(run,step);
   const node=config.lamplightNode(await progress(run.id) as any);await action(run,`work_${work.lamplightWork(node).answer}`);await action(run,'verify');const revision=Number((await progress(run.id)).revision);
   const workers=await Promise.all([0,1].map(()=>createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:name,charset:'utf8mb4'})));
   const saved=deps['../database/pool'].withTransaction;let next=0;
   deps['../database/pool'].withTransaction=async(fn:any)=>{const worker=workers[next++];await worker.beginTransaction();try{const value=await fn(worker);await worker.commit();return value;}catch(error){await worker.rollback();throw error;}};
   try{const results=await Promise.all([lamp.lamplightAction(run.user,revision,'complete'),lamp.lamplightAction(run.user,revision,'complete')]);assert.deepEqual(JSON.parse(JSON.stringify(results[0])),JSON.parse(JSON.stringify(results[1])));}
   finally{deps['../database/pool'].withTransaction=saved;await Promise.all(workers.map(w=>w.end()));}
   const [rows]=await c.execute<RowDataPacket[]>('SELECT choice_code,copper FROM player_lamplight_rewards WHERE character_id=?',[run.id]);assert.equal(rows.length,1);assert.equal(rows[0].choice_code,'B');assert.equal(Number(rows[0].copper),60);
  });
  await t.test('旧版本、伪造按钮、材料核验错误和关闭接驳均保留状态',async()=>{
   const run=await prepare('S01','world_tree',2);await lamp.lamplightView(run.user);assert.equal(config.lamplightNode(await progress(run.id) as any).title,config.lamplightNode({...await progress(run.id),story_version:2} as any).title);
   await assert.rejects(action(run,'complete'),/现场|前往/);await assert.rejects(assertLamplightRegionAccess(c as any,run.id,'lamplight_wm08'),/资格/);
   await action(run,'go_scene');await action(run,'scene');await action(run,'go_record');await action(run,'record');await action(run,'plan_A');const s=await progress(run.id),node=config.lamplightNode(s as any);
   await assert.rejects(action(run,`work_${(work.lamplightWork(node).answer+1)%3}`),/不符/);assert.equal((await progress(run.id)).revision,s.revision);
   await c.execute("UPDATE player_lamplight_progress SET phase='world',node_index=0,flags_json=JSON_OBJECT() WHERE character_id=?",[run.id]);
   await c.execute("UPDATE map_regions SET is_enabled=0 WHERE code='lamplight_wm01'");await assert.rejects(action(run,'go_scene'),/暂未开放/);await initializeLamplight(c as any);
   const [closed]=await c.query<RowDataPacket[]>("SELECT is_enabled FROM map_regions WHERE code='lamplight_wm01'");assert.equal(closed[0].is_enabled,0);await action(run,'return');
  });
 }finally{if(created)await c.query(`DROP DATABASE ${q(name)}`);await c.end();}
});
