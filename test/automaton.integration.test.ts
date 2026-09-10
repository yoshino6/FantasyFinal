import { talentSchema } from '../src/game/talent-data';
import { achievementSchema } from '../src/database/achievements';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createPool } from 'mysql2/promise';
import { initializeAlchemyV2 } from '../src/database/alchemy-v2';
import { initializeInventoryBinding } from '../src/database/inventory-binding';
import { initializeAutomaton } from '../src/database/automaton';
import { initializeInstanceMarket } from '../src/database/instance-market';
import { initializeHiddenProfessions } from '../src/database/hidden-professions';
import { hiddenSkills, hiddenProfessions } from '../src/game/hidden-profession.config';

const database=process.env.AUTOMATON_TEST_DATABASE;
test('机巧真实 SQL：隔离迁移、绑定、失败净扣料、幂等认主培养与回滚',{skip:!database&&'设置 AUTOMATON_TEST_DATABASE 运行隔离数据库验证'},async t=>{
  assert.match(database!,/^fantasyfinal_automaton_test_[a-z0-9_]+$/);
  const require=createRequire(import.meta.url),yaml=require('yaml');const config=yaml.parse(readFileSync('alemon.config.yaml','utf8'));const original=config.FantasyFinal?.database??config.mysql;
  assert.notEqual(database,original.database);
  const admin=createPool({host:original.host,port:original.port,user:original.user,password:original.password,connectTimeout:5000});
  const [exists]=await admin.query<any[]>('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[database]);assert.equal(exists.length,0,'拒绝覆盖已有数据库');
  await admin.query('CREATE DATABASE '+database+' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  const pool=createPool({...original,database,connectionLimit:4,charset:'utf8mb4'});
  try{
    for(const sql of achievementSchema)await pool.query(sql);
    const parsed=ts.createSourceFile('bootstrap.ts',readFileSync('src/database/bootstrap.ts','utf8'),ts.ScriptTarget.Latest,true);
    const declaration=parsed.statements.filter(ts.isVariableStatement).flatMap(s=>[...s.declarationList.declarations]).find(d=>d.name.getText(parsed)==='schemaStatements')!;
    for(const sql of new Function(`return ${declaration.initializer!.getText(parsed)}`)() as string[])await pool.query(sql);
    for(const sql of talentSchema)await pool.query(sql);
    for(let repeat=0;repeat<2;repeat++){await initializeAlchemyV2(pool);await initializeInventoryBinding(pool);await initializeAutomaton(pool);await initializeInstanceMarket(pool);await initializeHiddenProfessions(pool);}
    await t.test('共享初始化的隐藏技能使用真实技能表字段且重复执行不新增副本',async()=>{
      const [skills]=await pool.query<any[]>("SELECT code,range_type FROM skill_definitions WHERE code LIKE 'hidden\\_%'");
      assert.equal(skills.length,hiddenSkills.length+hiddenProfessions.length);
      for(const skill of hiddenSkills)assert.equal(skills.find(row=>row.code===skill.code)?.range_type,'远程');
    });
    const transaction=async(work:any)=>{const c=await pool.getConnection();try{await c.beginTransaction();const result=await work(c);await load('src/game/achievement.service').flushAchievements(c,load('src/game/achievement-events').takeAchievementEvents(c));await c.commit();return result;}catch(error){await c.rollback();throw error;}finally{load('src/game/achievement-events').takeAchievementEvents(c);c.release();}};
    const cache=new Map<string,any>();let failEvent=false,portraitHostFails=false,portraitHostCalls=0;
    const load=(relative:string):any=>{const path=resolve(relative.endsWith('.ts')?relative:relative+'.ts');if(cache.has(path))return cache.get(path).exports;const module={exports:{} as any};cache.set(path,module);
      const local=(id:string):any=>id==='alemonjs'?{logger:{warn:()=>{}}}:id.endsWith('/automaton-portrait-host')?{uploadPortraitToHost:async()=>{portraitHostCalls++;if(portraitHostFails)throw Error('host unavailable');return 'https://example.com/approved.webp';}}:id.endsWith('/automaton-portrait-image')?{readPortrait:async()=>Buffer.from('mock image'),removePortrait:async()=>{}}:id.endsWith('/pool')?{getPool:async()=>pool,withTransaction:transaction}:id.startsWith('.')?load(resolve(dirname(path),id)):require(id);
      const compiled=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
      new Function('require','module','exports',compiled)(local,module,module.exports);return module.exports;};
    const service=load('src/game/automaton.service'),inventory=load('src/game/inventory-binding');
    const seed=await pool.getConnection();try{
      await seed.query('SET FOREIGN_KEY_CHECKS=0');await seed.execute("INSERT INTO players(id,qq_user_id) VALUES (1,'automaton_test_1'),(2,'automaton_test_2')");
      const [columns]=await seed.query<any[]>('SHOW COLUMNS FROM characters');const names=columns.filter(c=>c.Null==='NO'&&c.Default===null&&!String(c.Extra).includes('auto_increment')).map(c=>c.Field);
      for(const id of [1,2])await seed.execute(`INSERT INTO characters (id,player_id,${names.map(name=>'`'+name+'`').join(',')}) VALUES (?,?,${names.map(()=>'?').join(',')})`,[id,id,...names.map(name=>name==='name'?`机巧测试${id}`:100)]);
      await seed.execute("UPDATE characters SET level=30,realm_stage=3,secondary_profession_code='alchemist'");await seed.execute("INSERT INTO player_secondary_professions(character_id,profession_code,level,proficiency) VALUES(1,'alchemist',4,0),(2,'alchemist',4,0)");
      await seed.execute("INSERT INTO map_regions(id,code,name,description,min_x,max_x,min_y,max_y,min_z,max_z) SELECT current_region_id,'lesson_test','教学测试地图','测试',-999,999,-999,999,-999,999 FROM characters WHERE id=1");
      await seed.execute("INSERT INTO map_npcs(region_id,code,name,description,pos_x,pos_y,pos_z) SELECT current_region_id,'alchemy_sweetshop','晴儿','教学测试',pos_x,pos_y,pos_z FROM characters WHERE id=1");
      for(const code of ['sky_dust','mana_dust','light_element_dust','magic_unit',...service.automatonRecipes.flatMap((r:any)=>r.ingredients.map((i:any)=>i.code))])await seed.execute("INSERT IGNORE INTO item_definitions (code,name,item_type,item_category) VALUES (?,?,'material','炼材')",[code,code]);
      await seed.execute('INSERT INTO player_inventory (character_id,item_id,quantity,trade_bound_quantity) SELECT 1,id,10000,100 FROM item_definitions');
      await seed.query('SET FOREIGN_KEY_CHECKS=1');
    }finally{seed.release();}
    const stock=async(code:string)=>{const [rows]=await pool.execute<any[]>('SELECT pi.* FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=1 AND i.code=?',[code]);return rows[0];};
    await t.test('四级炼金支线：低级和普通玩家不触发，现场教学解锁，重复学习不改写记录',async()=>{
      const quest=load('src/game/alchemy-creation-quest.service');
      await pool.execute('UPDATE player_secondary_professions SET level=3 WHERE character_id=1');
      assert.deepEqual(await quest.alchemyCreationQuest('automaton_test_1'),{eligible:false,unlocked:false,pending:false});
      await assert.rejects(quest.learnAlchemyCreation('automaton_test_1'),/4 级/);
      await pool.execute("UPDATE characters SET secondary_profession_code=NULL WHERE id=2");
      assert.equal((await quest.alchemyCreationQuest('automaton_test_2')).pending,false);
      await pool.execute("UPDATE characters SET secondary_profession_code='alchemist' WHERE id=2");
      await pool.execute('UPDATE player_secondary_professions SET level=4 WHERE character_id=1');
      assert.deepEqual(await quest.alchemyCreationQuest('automaton_test_1'),{eligible:true,unlocked:false,pending:true});
      for(const kind of ['造物','育成'])await assert.rejects(service.automatonRecipeCatalog('automaton_test_1',kind),/晴儿/);
      for(const code of ['automaton','pure_soul_trace','automaton_feed_blade'])await assert.rejects(service.previewAutomatonCraft('automaton_test_1',code),/晴儿/);
      await pool.execute('UPDATE characters SET pos_x=pos_x+1 WHERE id=1');
      await assert.rejects(quest.learnAlchemyCreation('automaton_test_1'),/糖水屋/);
      assert.equal((await quest.alchemyCreationQuest('automaton_test_1')).unlocked,false);
      await pool.execute('UPDATE characters SET pos_x=pos_x-1 WHERE id=1');
      const lessons=await Promise.all([quest.learnAlchemyCreation('automaton_test_1'),quest.learnAlchemyCreation('automaton_test_1')]);
      assert.equal(lessons.filter((l:any)=>l.alreadyLearned).length,1);assert.match(lessons[0].story,/灵枢素体.*四级解构师/);
      const [before]=await pool.execute<any[]>('SELECT * FROM player_side_quests WHERE character_id=1 AND quest_code=?',[quest.alchemyCreationQuestCode]);
      await quest.learnAlchemyCreation('automaton_test_1');
      const [after]=await pool.execute<any[]>('SELECT * FROM player_side_quests WHERE character_id=1 AND quest_code=?',[quest.alchemyCreationQuestCode]);assert.deepEqual(after,before);
      assert.deepEqual(await quest.alchemyCreationQuest('automaton_test_1'),{eligible:true,unlocked:true,pending:false});
      assert((await service.automatonRecipeCatalog('automaton_test_1','造物')).length>0);assert.equal((await service.automatonRecipeCatalog('automaton_test_1','育成')).length,12);
      const preview=await service.previewAutomatonCraft('automaton_test_1','automaton'),dust=await stock('sky_dust');
      await pool.execute("UPDATE player_side_quests SET status='accepted' WHERE character_id=1 AND quest_code=?",[quest.alchemyCreationQuestCode]);
      await assert.rejects(service.confirmAutomatonCraft('automaton_test_1',preview.token),/晴儿/);assert.equal((await stock('sky_dust')).quantity,dust.quantity);
      await quest.learnAlchemyCreation('automaton_test_1');
    });
    await t.test('全部旧 SQL 消耗绑定优先，新发放数量不误绑定',async()=>{const row=await stock('sky_dust');await pool.execute('UPDATE player_inventory SET quantity=quantity-10 WHERE character_id=1 AND item_id=?',[row.item_id]);const after=await stock('sky_dust');assert.equal(after.trade_bound_quantity,90);await transaction((c:any)=>inventory.consumeInventory(c,1,row.item_id,5,true));assert.equal((await stock('sky_dust')).trade_bound_quantity,90);});
    await t.test('点灵失败只消耗2粉尘，双确认只记一次',async()=>{
      const before=await stock('sky_dust'),body=await stock('automaton_body');const preview=await service.previewAutomatonCraft('automaton_test_1','automaton');
      assert.equal(preview.recipe.chance,.6);assert.equal(preview.ingredients.find((i:any)=>i.code==='sky_dust').quantity,20);
      const old=Math.random;Math.random=()=>.6;let results:any[];try{results=await Promise.all([service.confirmAutomatonCraft('automaton_test_1',preview.token),service.confirmAutomatonCraft('automaton_test_1',preview.token)]);}finally{Math.random=old;}
      assert.deepEqual(results![0],results![1]);assert.equal((await stock('sky_dust')).quantity,before.quantity-2);assert.equal((await stock('automaton_body')).quantity,body.quantity);
      const [activities]=await pool.execute<any[]>("SELECT value_json FROM achievement_progress WHERE identity_key=? AND metric IN ('ACH_A24','ACH_A25')",['automaton_test_1']);assert.equal(activities.length,0);
      const [logs]=await pool.query<any[]>('SELECT batches_json FROM player_alchemy_journal');const batches=typeof logs[0].batches_json==='string'?JSON.parse(logs[0].batches_json):logs[0].batches_json;assert.deepEqual(batches[0].consumed.map((i:any)=>[i.code,i.quantity]),[['sky_dust',2]]);
      const journal=load('src/game/alchemy-journal.service');
      const current=await journal.alchemyJournalPage('automaton_test_1',1,'点灵'),legacy=await journal.alchemyJournalPage('automaton_test_1',1,'造物');
      assert.equal(current.scope,'点灵');assert.equal(legacy.scope,'点灵');assert.equal(current.count,1);assert.deepEqual(current.entries.map((e:any)=>e.id),legacy.entries.map((e:any)=>e.id));
    });
    let petId=0;
    await t.test('出生固定、交易绑定材料制造得到未绑定新实例、认主幂等',async()=>{
      const preview=await service.previewAutomatonCraft('automaton_test_1','automaton');const old=Math.random;Math.random=()=>.599;let made:any;try{made=await service.confirmAutomatonCraft('automaton_test_1',preview.token);}finally{Math.random=old;}assert.deepEqual(await service.confirmAutomatonCraft('automaton_test_1',preview.token),made);
      const [activities]=await pool.execute<any[]>("SELECT metric,value_json FROM achievement_progress WHERE identity_key=? AND metric IN ('ACH_A24','ACH_A25') ORDER BY metric",['automaton_test_1']);assert.equal(activities.length,2);for(const activity of activities){const state=typeof activity.value_json==='string'?JSON.parse(activity.value_json):activity.value_json;assert.equal(state.count,1);assert.equal(state.seen.length,1);}
      const list=await service.automatonList('automaton_test_1');petId=Number(list.items[0].row.id);const born=list.items[0].state;assert.equal(list.items[0].row.bound_kind,'none');
      const claim=await service.previewAutomatonMutation('automaton_test_1',petId,'认主',[]);await assert.rejects(service.confirmAutomatonMutation('automaton_test_2',claim.token),/不属于/);
      const results=await Promise.all([service.confirmAutomatonMutation('automaton_test_1',claim.token),service.confirmAutomatonMutation('automaton_test_1',claim.token)]);assert.deepEqual(results[0],results[1]);
      const after=(await service.automatonList('automaton_test_1')).items[0];assert.deepEqual(after.state,born);assert.equal(after.row.bound_kind,'personal');
      const dialogue=load('src/game/automaton-dialogue.service');
      assert.equal(await dialogue.quoteForAutomatonMutation('automaton_test_2',claim.token,false),null);
      const greetings=await Promise.all([dialogue.quoteForAutomatonMutation('automaton_test_1',claim.token,false),dialogue.quoteForAutomatonMutation('automaton_test_1',claim.token,false)]);
      assert.equal(greetings.filter(Boolean).length,1);const quote=greetings.find(Boolean);assert(quote.text);assert.equal(quote.petId,petId);
      await dialogue.finishAutomatonMutationQuote(quote,false);
      const retry=await dialogue.quoteForAutomatonMutation('automaton_test_1',claim.token,false);assert.equal(retry.id,quote.id);assert.equal(retry.text,quote.text);
      await dialogue.finishAutomatonMutationQuote(retry,true);await service.confirmAutomatonMutation('automaton_test_1',claim.token);
      assert.equal(await dialogue.quoteForAutomatonMutation('automaton_test_1',claim.token,false),null);
      const [delivered]=await pool.execute<any[]>('SELECT sent_at FROM automaton_dialogues WHERE id=?',[quote.id]);assert(delivered[0].sent_at);
      assert.deepEqual((await service.automatonList('automaton_test_1')).items[0].state,born);
      for(const action of ['设置','策略','挡刀','模式','战斗指令','称呼','自称','公开语录','问候','语录','外观'])await assert.rejects(service.previewAutomatonMutation('automaton_test_1',petId,action,['开启']),/已取消/);
      const journal=load('src/game/alchemy-journal.service');const oldSettings=await transaction((c:any)=>journal.createCraftRequest(c,1,'automaton_mutate',{id:petId,revision:Number(after.row.revision),action:'策略',args:['进攻']}));await assert.rejects(service.confirmAutomatonMutation('automaton_test_1',oldSettings),/旧设置确认已失效/);

    });
    await t.test('人工形象审核：会话隔离、过期、取消、驳回、并发通过与上传失败回滚',async()=>{
      const portrait=load('src/game/automaton-portrait.service'),review=load('src/game/automaton-portrait-admin.service');
      const user='automaton_test_1',scope='a'.repeat(64),other='b'.repeat(64),actor={username:'reviewer',role:'admin'};
      const image={key:'1'.repeat(32)+'.webp',width:100,height:100};
      const before=(await service.automatonList(user)).items.find((i:any)=>Number(i.row.id)===petId);
      await assert.rejects(portrait.beginPortraitUpload('automaton_test_2',scope,petId),/属于你/);
      const old=await portrait.beginPortraitUpload(user,scope,petId),newer=await portrait.beginPortraitUpload(user,scope,petId);
      await portrait.cancelPortraitUpload(user,scope,petId,old.token);
      assert.equal(await portrait.reservePortraitUpload(user,other),null);
      assert.equal(await portrait.reservePortraitUpload('automaton_test_2',scope),null);
      const reserved=await portrait.reservePortraitUpload(user,scope);assert.equal(reserved.token,newer.token);
      assert.deepEqual(await portrait.reservePortraitUpload(user,scope),{busy:true});
      await portrait.cancelPortraitUpload(user,scope,petId,newer.token);
      await assert.rejects(portrait.submitPortraitReview(user,reserved,image),/取消/);
      await portrait.beginPortraitUpload(user,scope,petId);
      await pool.execute('UPDATE automaton_portrait_uploads SET expires_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE character_id=1');
      assert.deepEqual(await portrait.reservePortraitUpload(user,scope),{expired:true});
      const submit=async()=>{await portrait.beginPortraitUpload(user,scope,petId);const r=await portrait.reservePortraitUpload(user,scope);await portrait.submitPortraitReview(user,r,image);const queue=await review.adminPortraitReviews({keyword:user});return queue.entries[0].id;};
      const first=await submit();assert.equal((await portrait.portraitReviewStatus(user,petId)).status,'pending');
      assert.equal((await service.automatonList(user)).items.find((i:any)=>Number(i.row.id)===petId).state.portrait,undefined);
      await assert.rejects(portrait.beginPortraitUpload(user,scope,petId),/待审核/);
      await assert.rejects(review.decidePortraitReview({username:'reader',role:'viewer'},first,'approve','合规'),/只读/);
      await assert.rejects(review.decidePortraitReview(actor,first,'reject',''),/说明/);
      await review.decidePortraitReview(actor,first,'reject','真人照片');assert.equal(portraitHostCalls,0);
      assert.equal((await portrait.portraitReviewStatus(user,petId)).reason,'真人照片');
      const second=await submit();portraitHostFails=true;
      await assert.rejects(review.decidePortraitReview(actor,second,'approve','合规'),/host unavailable/);portraitHostFails=false;
      assert.equal((await portrait.portraitReviewStatus(user,petId)).status,'pending');
      const outcomes=await Promise.allSettled([review.decidePortraitReview(actor,second,'approve','确认无违禁内容'),review.decidePortraitReview(actor,second,'approve','确认无违禁内容')]);
      assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal(portraitHostCalls,2);
      const after=(await service.automatonList(user)).items.find((i:any)=>Number(i.row.id)===petId);
      assert.equal(after.state.portrait.url,'https://example.com/approved.webp');assert.equal(after.row.revision,before.row.revision);assert.deepEqual(after.state.stats,before.state.stats);
      const [audit]=await pool.execute<any[]>("SELECT action_type FROM operation_journals WHERE action_type LIKE 'portrait.%'");assert.deepEqual(audit.map(r=>r.action_type).sort(),['portrait.approved','portrait.rejected']);
      const third=await submit();await portrait.resetPortrait(user,petId);
      await assert.rejects(review.decidePortraitReview(actor,third,'approve','合规'),/已处理/);
      assert.equal((await service.automatonList(user)).items.find((i:any)=>Number(i.row.id)===petId).state.portrait,undefined);
      assert.equal(await portrait.portraitReviewStatus('automaton_test_2',petId),null);
    });
    await t.test('培养扣3瓶仅一次，保留56经验，过时预览被拒绝',async()=>{
      const before=await stock('automaton_feed_blade');const preview=await service.previewAutomatonMutation('automaton_test_1',petId,'培养',['blade','3','50']);await Promise.all([service.confirmAutomatonMutation('automaton_test_1',preview.token),service.confirmAutomatonMutation('automaton_test_1',preview.token)]);
      assert.equal((await stock('automaton_feed_blade')).quantity,before.quantity-3);const state=(await service.automatonList('automaton_test_1')).items[0].state;assert.equal(state.level,2);assert.equal(state.progress[0].xp,56);
      const stale=await service.previewAutomatonMutation('automaton_test_1',petId,'命名',['测试']);await pool.execute('UPDATE player_automatons SET revision=revision+1 WHERE id=?',[petId]);await assert.rejects(service.confirmAutomatonMutation('automaton_test_1',stale.token),/状态已变化/);
    });
    await t.test('落账失败回滚成长与扣料',async()=>{
      const preview=await service.previewAutomatonMutation('automaton_test_1',petId,'培养',['blade','3','50']);const before=await stock('automaton_feed_blade');
      await pool.query("CREATE TRIGGER automaton_test_fail_event BEFORE INSERT ON automaton_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='injected event failure'");failEvent=true;
      await assert.rejects(service.confirmAutomatonMutation('automaton_test_1',preview.token),/injected event failure/);assert.equal((await stock('automaton_feed_blade')).quantity,before.quantity);
      await pool.query('DROP TRIGGER automaton_test_fail_event');failEvent=false;
    });
    await t.test('跨十级突破独立留档，回忆保留当时名字与分页',async()=>{
      for(let n=0;n<5;n++){const p=await service.previewAutomatonMutation('automaton_test_1',petId,'培养',['blade','100','30']);await service.confirmAutomatonMutation('automaton_test_1',p.token);}
      const [events]=await pool.execute<any[]>("SELECT data_json FROM automaton_events WHERE automaton_id=? AND kind='breakthrough'",[petId]);const levels=events.map(e=>(typeof e.data_json==='string'?JSON.parse(e.data_json):e.data_json).level);assert.deepEqual(levels,[10,20]);
      const rename=await service.previewAutomatonMutation('automaton_test_1',petId,'命名',['新名字']);await service.confirmAutomatonMutation('automaton_test_1',rename.token);const page=await service.automatonEventPage('automaton_test_1',petId);const history=[...page.events];for(let n=2;n<=page.pages;n++)history.push(...(await service.automatonEventPage('automaton_test_1',petId,n)).events);assert(history.some((e:any)=>e.kind==='breakthrough'&&e.data.name==='机巧人偶'));assert(history.every((e:any)=>Number.isFinite(e.time.getTime())));assert(page.events.length<=5);assert(history.some((e:any)=>e.kind==='命名'&&e.data.previousName==='机巧人偶'));await assert.rejects(service.automatonEventPage('automaton_test_2',petId),/属于你/);assert.equal(page.state.name,'新名字');
    });
    await t.test('日常问候跨并发仅一条，失败重用原句，不使培养预览过期',async()=>{
      const dialogue=load('src/game/automaton-dialogue.service');await pool.execute('UPDATE player_automatons SET following=1 WHERE id=?',[petId]);
      const p=await service.previewAutomatonMutation('automaton_test_1',petId,'培养',['shell','1','30']);const quotes=await Promise.all([dialogue.reserveDailyAutomaton('automaton_test_1',false),dialogue.reserveDailyAutomaton('automaton_test_1',false)]);assert.equal(quotes.filter(Boolean).length,1);const q=quotes.find(Boolean);await dialogue.finishDailyAutomaton(q,false);const retry=await dialogue.reserveDailyAutomaton('automaton_test_1',false);assert.equal(retry.id,q.id);assert.equal(retry.text,q.text);await dialogue.finishDailyAutomaton(retry,true);assert.equal(await dialogue.reserveDailyAutomaton('automaton_test_1',false),null);await service.confirmAutomatonMutation('automaton_test_1',p.token);
    });
    await t.test('战斗重大事件按真实结算记录且首次事件不重复',async()=>{
      const combat=load('src/game/automaton-combat.service');
      await pool.execute("UPDATE player_automatons SET state_json=JSON_SET(state_json,'$.participation','陪伴') WHERE id=?",[petId]);
      for(const session of ['memory_battle_1','memory_battle_2'])await transaction(async(c:any)=>{
        const pets=await combat.loadCombatAutomatons(c,session,[1]);assert.equal(pets.length,1);
        await combat.loadCombatAutomatons(c,session,[1]);pets[0].unit.state.memory.automaton_intercept=1;if(session==='memory_battle_2')pets[0].unit.hp=0;
        await combat.saveCombatAutomatons(c,session,pets);await combat.saveCombatAutomatons(c,session,pets);
        await combat.finishCombatAutomatons(c,session,true);await combat.finishCombatAutomatons(c,session,true);
      });
      const [rows]=await pool.execute<any[]>("SELECT kind,COUNT(*) total FROM automaton_events WHERE automaton_id=? AND kind IN ('first_battle','first_intercept','first_victory') GROUP BY kind",[petId]);assert.equal(rows.length,3);assert(rows.every(r=>Number(r.total)===1));const [shutdown]=await pool.execute<any[]>("SELECT id FROM automaton_events WHERE automaton_id=? AND kind='shutdown'",[petId]);assert.equal(shutdown.length,1);
    });
    await t.test('停机恢复保留到期时间；久别重逢只记录真实间隔',async()=>{
      const {state}= (await service.automatonList('automaton_test_1')).items[0];state.hp=0;state.intimacy=99;state.lastInteractionAt=new Date(Date.now()-4*86400000).toISOString();
      await pool.execute('UPDATE player_automatons SET state_json=?,recover_at=DATE_SUB(NOW(),INTERVAL 2 HOUR) WHERE id=?',[JSON.stringify(state),petId]);
      const [before]=await pool.execute<any[]>('SELECT recover_at FROM player_automatons WHERE id=?',[petId]);
      await service.automatonList('automaton_test_1');await service.automatonList('automaton_test_1');
      const [records]=await pool.execute<any[]>("SELECT created_at FROM automaton_events WHERE automaton_id=? AND kind='recovery'",[petId]);assert.equal(records.length,1);assert.equal(records[0].created_at.getTime(),before[0].recover_at.getTime());
      const dialogue=load('src/game/automaton-dialogue.service');await dialogue.greetAutomaton('automaton_test_1',petId,'reunion_test',true);await dialogue.greetAutomaton('automaton_test_1',petId,'reunion_test',true);
      const [reunion]=await pool.execute<any[]>("SELECT data_json FROM automaton_events WHERE automaton_id=? AND kind='reunion'",[petId]);assert.equal(reunion.length,1);const data=typeof reunion[0].data_json==='string'?JSON.parse(reunion[0].data_json):reunion[0].data_json;assert.equal(data.absenceDays,4);const [bond]=await pool.execute<any[]>("SELECT id FROM automaton_events WHERE automaton_id=? AND kind='bond_milestone'",[petId]);assert.equal(bond.length,1);
    });
    await t.test('独立人偶寄售保持原实例、卖出绑定、重复确认不重复扣款、初识留档',async()=>{
      await pool.execute("UPDATE characters SET created_at=DATE_SUB(NOW(),INTERVAL 30 DAY),adventurer_registered=1,copper_coins=100000");const p=await service.previewAutomatonCraft('automaton_test_1','automaton');const old=Math.random;Math.random=()=>0;try{await service.confirmAutomatonCraft('automaton_test_1',p.token);}finally{Math.random=old;}
      const pet=(await service.automatonList('automaton_test_1')).items.find((p:any)=>!p.row.owner_id),market=load('src/game/instance-market.service');const before=pet.state;
      const list=await market.previewInstanceMarket('automaton_test_1','list','automaton',Number(pet.row.id),5000);await market.confirmInstanceMarket('automaton_test_1',list.token);await assert.rejects(service.previewAutomatonMutation('automaton_test_1',Number(pet.row.id),'认主',[]),/寄售/);
      const [orders]=await pool.query<any[]>("SELECT id FROM market_instance_listings WHERE status='open'");const buy=await market.previewInstanceMarket('automaton_test_2','buy','automaton',Number(orders[0].id));const results=await Promise.all([market.confirmInstanceMarket('automaton_test_2',buy.token),market.confirmInstanceMarket('automaton_test_2',buy.token)]);assert.deepEqual(results[0],results[1]);
      const received=(await service.automatonList('automaton_test_2')).items[0];assert.equal(received.row.id,pet.row.id);assert.equal(received.row.bound_kind,'trade');assert.deepEqual(received.state,before);const [coins]=await pool.query<any[]>('SELECT copper_coins FROM characters WHERE id=2');assert.equal(coins[0].copper_coins,95000);
      const claim=await service.previewAutomatonMutation('automaton_test_2',Number(received.row.id),'认主',[]);await service.confirmAutomatonMutation('automaton_test_2',claim.token);assert((await service.automatonEventPage('automaton_test_2',Number(received.row.id))).events.some((e:any)=>e.kind==='first_met'));
    });
    await t.test('普通玩家不能读取炼金手记或配方',async()=>{await pool.execute("UPDATE characters SET secondary_profession_code=NULL WHERE id=2");const journal=load('src/game/alchemy-journal.service');await assert.rejects(journal.alchemyJournalPage('automaton_test_2'),/仅对当前炼金师/);await assert.rejects(service.automatonRecipeCatalog('automaton_test_2','育成'),/仅对当前炼金师/);});

    await t.test('旧重大经历只按真实日志补齐，重复初始化不改写历史',async()=>{
      await pool.execute("DELETE FROM automaton_events WHERE automaton_id=? AND kind='first_met'",[petId]);await pool.execute("UPDATE automaton_events SET created_at='2026-08-01 12:34:56' WHERE automaton_id=? AND kind='birth'",[petId]);
      await initializeAutomaton(pool);await initializeAutomaton(pool);
      const [rows]=await pool.execute<any[]>("SELECT created_at,data_json FROM automaton_events WHERE automaton_id=? AND kind='first_met'",[petId]);const [birth]=await pool.execute<any[]>("SELECT created_at FROM automaton_events WHERE automaton_id=? AND kind='birth'",[petId]);assert.equal(rows.length,1);assert.equal(rows[0].created_at.getTime(),birth[0].created_at.getTime());
    });
    await t.test('装备与异械的使用和替换均绑定；寄售实例无法被使用或改造',async()=>{
      const [item]=await pool.execute<any>("INSERT INTO item_definitions(code,name,description,obtain_source,item_type,item_category,stackable,is_tradeable) VALUES('escrow_equipment','测试装备','测试','测试','equipment','武器',0,1)");const ids:number[]=[];
      for(let i=0;i<3;i++){const [row]=await pool.execute<any>('INSERT INTO player_item_instances(character_id,item_id) VALUES(1,?)',[item.insertId]);ids.push(row.insertId);}
      await pool.execute("INSERT INTO player_equipment(character_id,slot,item_id,instance_id) VALUES(1,'weapon',?,?)",[item.insertId,ids[0]]);
      await pool.execute("UPDATE player_equipment SET instance_id=? WHERE character_id=1 AND slot='weapon'",[ids[1]]);
      const [bound]=await pool.execute<any[]>('SELECT bound_kind FROM player_item_instances WHERE id IN (?,?)',[ids[0],ids[1]]);assert(bound.every(r=>r.bound_kind==='personal'));
      await pool.execute('UPDATE player_item_instances SET market_listing_id=999 WHERE id=?',[ids[2]]);
      await assert.rejects(pool.execute('INSERT INTO player_active_devices(character_id,instance_id) VALUES(1,?)',[ids[2]]),/market escrow/);
      await assert.rejects(pool.execute('UPDATE player_item_instances SET quality=50 WHERE id=?',[ids[2]]),/market escrow/);
      await pool.execute('UPDATE player_item_instances SET market_listing_id=NULL WHERE id=?',[ids[2]]);await pool.execute('INSERT INTO player_active_devices(character_id,instance_id) VALUES(1,?)',[ids[2]]);
      const [device]=await pool.execute<any[]>('SELECT bound_kind FROM player_item_instances WHERE id=?',[ids[2]]);assert.equal(device[0].bound_kind,'personal');
    });
    await t.test('素体前置构造链优先已有构件，重复确认不重复制造',async()=>{
      const catalog=load('src/game/deconstructor-catalog'),chain=load('src/game/automaton-construction.service');
      for(const code of new Set<string>(catalog.constructionRecipes.flatMap((r:any)=>[r.code,...r.ingredients.map((i:any)=>i.code)])))await pool.execute("INSERT IGNORE INTO item_definitions(code,name,item_type,item_category) VALUES(?,?,'material','构件')",[code,code]);
      await pool.execute("UPDATE characters SET secondary_profession_code='deconstructor' WHERE id=1");await pool.execute("UPDATE player_secondary_professions SET profession_code='deconstructor',level=4,proficiency=0 WHERE character_id=1");
      for(const code of Object.keys(catalog.baseMaterialTradeValues)){const [items]=await pool.execute<any[]>('SELECT id FROM item_definitions WHERE code=?',[code]);if(items[0])await transaction((c:any)=>inventory.grantInventory(c,1,items[0].id,{unbound:10000,trade:0,personal:0}));}
      for(const part of service.automatonRecipes.find((r:any)=>r.code==='automaton_body').ingredients)await pool.execute('DELETE pi FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=1 AND i.code=?',[part.code]);
      const preview=await chain.previewAutomatonComponents('automaton_test_1',1);assert.equal(preview.missing.length,0);assert(preview.token);assert(preview.steps.length>0);
      const results=await Promise.all([chain.confirmAutomatonComponents('automaton_test_1',preview.token),chain.confirmAutomatonComponents('automaton_test_1',preview.token)]);assert.deepEqual(results[0],results[1]);
      const ready=await chain.previewAutomatonComponents('automaton_test_1',1);assert.equal(ready.token,null);assert.equal(ready.steps.length,0);await pool.execute("UPDATE characters SET secondary_profession_code='alchemist' WHERE id=1");
    });
    await t.test('实例寄售分别筛选装备、异械和机巧，兼容旧异械并在筛选后分页',async()=>{
      const market=load('src/game/instance-market.service');
      const ownIds:number[]=[],orderIds:number[]=[];
      for(const [index,itemType,itemCategory] of [[0,'equipment','武器'],[1,'device','异械'],[2,'equipment','异械']] as const){
        const name=`分类测试${index}`;
        const [item]=await pool.execute<any>('INSERT INTO item_definitions(code,name,description,obtain_source,item_type,item_category,stackable,is_tradeable) VALUES(?,?,?,?,?,?,0,1)',[`market_category_${index}`,name,'分类测试','测试',itemType,itemCategory]);
        const [own]=await pool.execute<any>('INSERT INTO player_item_instances(character_id,item_id) VALUES(1,?)',[item.insertId]);ownIds.push(own.insertId);
        for(let n=0;n<(index===0?6:1);n++){
          const [instance]=await pool.execute<any>('INSERT INTO player_item_instances(character_id,item_id) VALUES(1,?)',[item.insertId]);
          const [order]=await pool.execute<any>("INSERT INTO market_instance_listings(seller_id,kind,resource_id,active_instance_id,name,price,snapshot_json,expires_at) VALUES(1,'instance',?,?,?,100,'{}',DATE_ADD(NOW(),INTERVAL 1 DAY))",[instance.insertId,instance.insertId,name]);
          await pool.execute('UPDATE player_item_instances SET market_listing_id=? WHERE id=?',[order.insertId,instance.insertId]);orderIds.push(order.insertId);
        }
      }
      const equipment=await market.instanceMarketList('automaton_test_1',1,'装备','分类测试');
      assert.equal(equipment.items.length,5);assert.equal(equipment.pages,2);assert(equipment.items.every((i:any)=>i.name==='分类测试0'));assert.deepEqual(equipment.instances.map((i:any)=>Number(i.id)),[ownIds[0]]);assert.equal(equipment.pets.length,0);
      const last=await market.instanceMarketList('automaton_test_1',99,'equipment','分类测试');assert.equal(last.page,2);assert.equal(last.items.length,1);
      const devices=await market.instanceMarketList('automaton_test_1',1,'异械','分类测试');assert.equal(devices.items.length,2);assert.deepEqual(new Set(devices.instances.map((i:any)=>Number(i.id))),new Set(ownIds.slice(1)));assert(devices.items.every((i:any)=>i.kind==='instance'));
      const pets=await market.instanceMarketList('automaton_test_1',1,'机巧','分类测试');assert.equal(pets.items.length,0);assert.equal(pets.instances.length,0);
      const legacy=await market.instanceMarketList('automaton_test_1',1,'instance','分类测试');assert.equal(legacy.pages,2);assert.equal(legacy.instances.length,3);
      const empty=await market.instanceMarketList('automaton_test_1',99,'装备','无匹配的关键词');assert.equal(empty.page,1);assert.equal(empty.pages,1);assert.equal(empty.items.length,0);
      await assert.rejects(market.instanceMarketList('automaton_test_1',1,'不存在'),/不存在该寄售分类/);
      assert.equal(orderIds.length,8);
    });
    await t.test('造物与育成按职业等级增加成功率，预览与实际一致，等级变动和旧确认不扣料',async()=>{
      await pool.execute("UPDATE player_secondary_professions SET profession_code='alchemist' WHERE character_id=1");
      for(let level=4;level<=11;level++){
        await pool.execute('UPDATE player_secondary_professions SET level=? WHERE character_id=1',[level]);
        const recipes=await service.automatonRecipeCatalog('automaton_test_1','造物');
        assert.equal(recipes.find((r:any)=>r.code==='automaton').chance,(60+(level-4)*5)/100);
        assert.equal(recipes.find((r:any)=>r.code==='pure_soul_trace').chance,Math.min(100,80+(level-4)*5)/100);
        assert((await service.automatonRecipeCatalog('automaton_test_1','育成')).every((r:any)=>r.chance===Math.min(100,90+(level-4)*5)/100));
        const preview=await service.previewAutomatonCraft('automaton_test_1','automaton');assert.equal(preview.recipe.chance,recipes.find((r:any)=>r.code==='automaton').chance);
      }
      await pool.execute('UPDATE player_secondary_professions SET level=4 WHERE character_id=1');
      const oldPreview=await service.previewAutomatonCraft('automaton_test_1','automaton'),dust=await stock('sky_dust');
      await pool.execute('UPDATE player_secondary_professions SET level=5 WHERE character_id=1');
      await assert.rejects(service.confirmAutomatonCraft('automaton_test_1',oldPreview.token),/重新放入配方/);assert.equal((await stock('sky_dust')).quantity,dust.quantity);
      const legacy=await service.previewAutomatonCraft('automaton_test_1','automaton');
      await pool.execute("UPDATE player_craft_requests SET snapshot_json=JSON_SET(snapshot_json,'$.version','automaton-v3') WHERE token=?",[legacy.token]);
      await assert.rejects(service.confirmAutomatonCraft('automaton_test_1',legacy.token),/重新放入配方/);assert.equal((await stock('sky_dust')).quantity,dust.quantity);
      const preview=await service.previewAutomatonCraft('automaton_test_1','automaton');
      const old=Math.random;Math.random=()=>.62;let result:any;try{result=await service.confirmAutomatonCraft('automaton_test_1',preview.token);}finally{Math.random=old;}
      assert.match(result.text,/成功 1/);assert.equal((await stock('sky_dust')).quantity,dust.quantity-20);
      const [journals]=await pool.execute<any[]>('SELECT snapshot_json FROM player_alchemy_journal WHERE id=?',[result.journalId]);
      const snapshot=typeof journals[0].snapshot_json==='string'?JSON.parse(journals[0].snapshot_json):journals[0].snapshot_json;assert.equal(snapshot.level,5);assert.equal(snapshot.chance,.65);
      await pool.execute('UPDATE player_secondary_professions SET level=4 WHERE character_id=1');
    });
    await t.test('低门槛机巧成就停发，真实装配不再新增公告',async()=>{const [rows]=await pool.query<any[]>("SELECT achievement_id FROM achievement_completions WHERE identity_key=?",['automaton_test_1']);for(const id of ["ACH_J04","ACH_J15"])assert.ok(!rows.some(r=>r.achievement_id===id),id);});
    assert.equal(failEvent,false);
  }finally{await pool.end();await admin.query('DROP DATABASE '+database);await admin.end();}
});
