import { negotiationSchema } from '../src/database/negotiation';
import { openingSchema } from '../src/database/opening';
import { initializeInventoryBinding } from '../src/database/inventory-binding';
import { talentSchema } from '../src/game/talent-data';
import { achievementSchema } from '../src/database/achievements';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {createPool} from 'mysql2/promise';
import {initializeAlchemyV2} from '../src/database/alchemy-v2';
import {alchemyOutputDefinitions} from '../src/game/alchemy-catalog';

// 仅建立全新隔离库；拒绝已有库及正式库，结束时删除本测试刚创建的库。
const database=process.env.ALCHEMY_TEST_DATABASE;
test('炼金V2真实SQL与事务回归',{skip:!database&&'设置 ALCHEMY_TEST_DATABASE 后运行全新隔离库测试'},async t=>{
  assert.match(database!,/^fantasyfinal_alchemy_test_[a-z0-9_]+$/);
  const require=createRequire(import.meta.url);const yaml=require('yaml');
  const config=yaml.parse(readFileSync('alemon.config.yaml','utf8'));const original=config.FantasyFinal?.database??config.mysql;
  assert.notEqual(database,original.database);
  const admin=createPool({host:original.host,port:original.port,user:original.user,password:original.password,connectTimeout:5000});
  const[existing]=await admin.query<any[]>('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[database]);assert.equal(existing.length,0,'测试库已存在，拒绝覆盖');
  await admin.query('CREATE DATABASE '+database+' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  const pool=createPool({...original,database,connectionLimit:4,charset:'utf8mb4'});
  try{
    for(const sql of achievementSchema)await pool.query(sql);
    const parsed=ts.createSourceFile('bootstrap.ts',readFileSync('src/database/bootstrap.ts','utf8'),ts.ScriptTarget.Latest,true);
    const declaration=parsed.statements.filter(ts.isVariableStatement).flatMap(s=>[...s.declarationList.declarations]).find(d=>d.name.getText(parsed)==='schemaStatements')!;
    const schema=new Function(`return ${declaration.initializer!.getText(parsed)}`)() as string[];
    for(const sql of schema) await pool.query(sql);
    for(const sql of talentSchema)await pool.query(sql);
    for(const sql of openingSchema)await pool.query(sql);
    for(const sql of negotiationSchema)await pool.query(sql);
    await initializeInventoryBinding(pool);
    await initializeAlchemyV2(pool);await initializeAlchemyV2(pool);
    const transaction=async(work:any)=>{const c=await pool.getConnection();try{await c.beginTransaction();const result=await work(c);await load('src/game/achievement.service').flushAchievements(c,load('src/game/achievement-events').takeAchievementEvents(c));await c.commit();return result;}catch(error){await c.rollback();throw error;}finally{load('src/game/achievement-events').takeAchievementEvents(c);c.release();}};
    const cache=new Map<string,any>();let failJournal=false;
    const load=(relative:string):any=>{
      const path=resolve(relative.endsWith('.ts')?relative:relative+'.ts');if(cache.has(path))return cache.get(path).exports;
      const module={exports:{} as any};cache.set(path,module);
      const local=(id:string):any=>{
        if(id.endsWith('/pool'))return {getPool:async()=>pool,withTransaction:transaction};
        if(id.endsWith('/adventure.service'))return{requireNpcAtCurrentPosition:async()=>{}};
        if(id.endsWith('/character.service'))return{recalculateCharacterStats:async()=>{}};
        if(id.startsWith('.'))return load(resolve(dirname(path),id));return require(id);
      };
      const compiled=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
      new Function('require','module','exports',compiled)(local,module,module.exports);
      if(path.endsWith('alchemy-journal.service.ts')){const real=module.exports.recordAlchemyJournal;module.exports.recordAlchemyJournal=async(...args:any[])=>{if(failJournal)throw new Error('injected journal failure');return real(...args);};}
      return module.exports;
    };
    const service=load('src/game/alchemist.service');const journal=load('src/game/alchemy-journal.service');const reset=load('src/game/skill-reset.service');const ledger=load('src/game/skill-point-ledger.service');
    // 按真实角色表的必填列生成最小存档，不读取或复制线上玩家。
    const seed=await pool.getConnection();try{
      await seed.query('SET FOREIGN_KEY_CHECKS=0');await seed.execute("INSERT INTO players (id,qq_user_id) VALUES (1,'alchemy_test_1'),(2,'alchemy_test_2')");
      const[columns]=await seed.query<any[]>('SHOW COLUMNS FROM characters');
      const names=columns.filter(c=>c.Null==='NO'&&c.Default===null&&!String(c.Extra).includes('auto_increment')).map(c=>c.Field);
      for(const id of [1,2]){const values=names.map(name=>name==='name'?`炼金测试${id}`:100);await seed.execute(`INSERT INTO characters (id,player_id,${names.map(name=>'`'+name+'`').join(',')}) VALUES (?,?,${names.map(()=>'?').join(',')})`,[id,id,...values]);}
      await seed.execute("UPDATE characters SET secondary_profession_code='alchemist',skill_points=100,copper_coins=100000 WHERE id IN (1,2)");
      await seed.query('SET FOREIGN_KEY_CHECKS=1');
    }finally{seed.release();}
    const addItem=async(code:string,name=code,type='material',category='粒子',effect:any={})=>{await pool.execute('INSERT INTO item_definitions (code,name,description,item_type,item_category,effect_json) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE effect_json=VALUES(effect_json)',[code,name,'测试定义',type,category,JSON.stringify(effect)]);const[rows]=await pool.query<any[]>('SELECT id FROM item_definitions WHERE code=?',[code]);return Number(rows[0].id);};
    const ids=new Map<string,number>();
    for(const[code,name,category]of [['blood_residue','血肉残渣','粒子'],['energy_ember','能量余烬','粒子'],['magic_unit','魔力微弧','粒子'],['beast_core','兽核','怪材'],['living_wood','活木','锻材'],['mana_dust','魔力粉尘','炼材'],['herbal_extract','草木萃取液','炼材'],['refined_beast_core','精炼兽核','炼材']])ids.set(code,await addItem(code,name,'material',category));
    for(const output of alchemyOutputDefinitions)ids.set(output.code,await addItem(output.code,output.name,'consumable',output.category,{...output.effect,alchemyOutput:true}));
    for(const id of ids.values())await pool.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (1,?,100)',[id]);
    const quantity=async(code:string)=>{const[rows]=await pool.query<any[]>('SELECT quantity FROM player_inventory WHERE character_id=1 AND item_id=?',[ids.get(code)]);return Number(rows[0]?.quantity??0);};
    await service.activatePersonalAlchemy('alchemy_test_1');await pool.execute("UPDATE player_secondary_professions SET level=5 WHERE character_id=1");
    const select=async()=>{for(const[role,code]of [['main','beast_core'],['auxiliary','blood_residue'],['reagent','energy_ember']])await service.selectAlchemyMaterial('alchemy_test_1',role,String(ids.get(code)),1);};
    await t.test('取消不写历史，错人和旧按钮不扣料',async()=>{
      await select();const preview=await service.executeAlchemy('alchemy_test_1');assert.equal(preview.needsConfirmation,true);
      await assert.rejects(service.executeAlchemy('alchemy_test_2',preview.token),/不属于/);await journal.cancelCraftPreview('alchemy_test_1',preview.token);await assert.rejects(service.executeAlchemy('alchemy_test_1',preview.token),/取消/);assert.equal(await quantity('beast_core'),100);
      assert.equal((await journal.alchemyJournalPage('alchemy_test_1')).count,0);
    });
    await t.test('并发确认只结算一次，全部失败也入手记',async()=>{
      await select();const preview=await service.executeAlchemy('alchemy_test_1');const old=Math.random;Math.random=()=>.999;
      let results:any[];try{results=await Promise.all([service.executeAlchemy('alchemy_test_1',preview.token),service.executeAlchemy('alchemy_test_1',preview.token)]);}finally{Math.random=old;}
      assert.equal(results![0].journalId,results![1].journalId);assert.equal(await quantity('beast_core'),99);assert.equal(results![0].failures,1);
      const page=await journal.alchemyJournalPage('alchemy_test_1',1,'全部记录','耗材','兽核');assert.equal(page.count,1);assert.equal(page.entries[0].batches[0].success,false);await assert.rejects(journal.alchemyJournalDetail('alchemy_test_2',results![0].journalId));
    });
    await t.test('写手记异常整体回滚，不丢材料也不发奖',async()=>{
      await select();const preview=await service.executeAlchemy('alchemy_test_1');const before=await quantity('beast_core');failJournal=true;try{await assert.rejects(service.executeAlchemy('alchemy_test_1',preview.token),/injected/);}finally{failJournal=false;}assert.equal(await quantity('beast_core'),before);assert.equal((await journal.alchemyJournalPage('alchemy_test_1')).count,1);
    });
    await t.test('配方保留数量，成功记录可按成果搜索与再投料',async()=>{
      await select();const preview=await service.executeAlchemy('alchemy_test_1');const old=Math.random;Math.random=()=>0;let result:any;try{result=await service.executeAlchemy('alchemy_test_1',preview.token);}finally{Math.random=old;}
      assert.ok(result.outputs.length);const saved=await service.saveAlchemyFormula('alchemy_test_1',result.journalId);assert.ok(saved);
      assert.ok((await journal.alchemyJournalPage('alchemy_test_1',1,'全部记录','成果','魔力粉尘')).count);
      const replay=await service.alchemyJournalReload('alchemy_test_1',result.journalId);assert.equal(replay.needsConfirmation,true);
    });
    await t.test('提纯与批量提纯留真实材料记录，旧批量确认不能重复消费',async()=>{
      await service.selectPurificationMaterial('alchemy_test_1',ids.get('beast_core'),2);const state=await service.purificationState('alchemy_test_1');const result=await service.executePurification('alchemy_test_1',state.token);assert.equal((await service.executePurification('alchemy_test_1',state.token)).journalId,result.journalId);assert.ok(result.journalId);
      const record=await journal.alchemyJournalDetail('alchemy_test_1',result.journalId);assert.equal(record.snapshot.ingredients[0].quantity,2);assert.equal(record.snapshot.kind,'purification');
      const raw=await addItem('monster_test_hair','测试兽毛','material','怪材',{monster_craft_material:true,material_monster_class:'normal',material_monster_level:10});await addItem('spellcloth_bolt','灵纺布匹');
      await pool.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (1,?,5)',[raw]);const bulk=await service.bulkPurificationPreview('alchemy_test_1');assert.equal(bulk.materials.length,1);
      const first=await service.executeBulkPurification('alchemy_test_1',bulk.token);const second=await service.executeBulkPurification('alchemy_test_1',bulk.token);assert.equal(first.journalId,second.journalId);assert.equal(first.inputQuantity,5);

    });
    await t.test('稳定视图聚合可比条件，锚点翻页不被新记录扰动',async()=>{
      const snapshot={kind:'alchemy',source:'personal',version:'test-stability',level:5,craftsmanship:0,ingredients:[{id:ids.get('beast_core'),code:'beast_core',name:'兽核',role:'主材',quantity:1},{id:ids.get('blood_residue'),code:'blood_residue',name:'血肉残渣',role:'辅材',quantity:1},{id:ids.get('energy_ember'),code:'energy_ember',name:'能量余烬',role:'催化剂',quantity:1}]};
      const output={id:ids.get('mana_dust'),code:'mana_dust',name:'魔力粉尘',role:'output',quantity:1};
      const record=async(failed=false)=>transaction(async(c:any)=>{await journal.craftCharacterId(c,'alchemy_test_1',true);const token=await journal.createCraftRequest(c,1,'alchemy',{});return journal.recordAlchemyJournal(c,1,token,snapshot,Array.from({length:failed?20:2},()=>({success:!failed,outputs:failed?[]:[output]})),{});});
      for(let n=0;n<5;n++)await record();const stable=await journal.alchemyJournalPage('alchemy_test_1',1,'稳定组合','成果','魔力粉尘');assert.equal(stable.count,1);
      await record(true);assert.equal((await journal.alchemyJournalPage('alchemy_test_1',1,'稳定组合','成果','魔力粉尘')).count,0);assert.equal((await journal.alchemyJournalPage('alchemy_test_1',1,'稳定组合','成果','魔力粉尘',stable.anchor)).count,1);
    });
    await t.test('三店白名单与限量购买、非职业购买洗练露、维修包的事务',async()=>{
      const shops=load('src/game/secondary-shop.service');await pool.execute('UPDATE characters SET secondary_profession_code=NULL WHERE id=2');
      const [moneyBefore]=await pool.query<any[]>('SELECT copper_coins FROM characters WHERE id=2');
      const listing=await shops.secondaryFinishedCatalog('alchemy_test_2','alchemy_sweetshop',1,'归悟洗练露');assert.equal(listing.items[0].price,838);
      const purchase=await shops.buySecondaryFinished('alchemy_test_2','alchemy_sweetshop',ids.get('alchemy_skill_reset_elixir'),1);assert.equal(purchase.quantity,1);assert.equal(purchase.price,listing.items[0].price);
      const [moneyAfter]=await pool.query<any[]>('SELECT copper_coins FROM characters WHERE id=2');assert.equal(Number(moneyBefore[0].copper_coins)-Number(moneyAfter[0].copper_coins),838);
      await assert.rejects(shops.buySecondaryFinished('alchemy_test_2','alchemy_sweetshop',ids.get('beast_core'),1),/不在/);await assert.rejects(shops.buySecondaryFinished('alchemy_test_2','alchemy_sweetshop',ids.get('alchemy_skill_reset_elixir'),30),/库存/);
      const[kit]=await pool.query<any[]>("SELECT id FROM item_definitions WHERE code='forge_repair_kit'");await shops.buySecondaryFinished('alchemy_test_2','blacksmith',Number(kit[0].id),1);
      const equipment=await addItem('shop_repair_test','测试装备','equipment','武器');const[created]=await pool.execute<any>('INSERT INTO player_item_instances (character_id,item_id,durability,durability_max) VALUES (2,?,1,100)',[equipment]);
      const repair=load('src/game/forge-repair.service');assert.equal(await repair.useForgeRepairKit('alchemy_test_2',created.insertId),'测试装备');await assert.rejects(repair.useForgeRepairKit('alchemy_test_2',created.insertId),/耐久已满/);
    });
    await t.test('基础货架限制、分类分页、查看详情记图鉴及旧购买链接拦截',async()=>{
      const shops=load('src/game/secondary-shop.service');
      const high=ids.get('alchemy_life_l50')??await addItem('alchemy_life_l50','高阶药','consumable','药剂');
      await assert.rejects(shops.buySecondaryFinished('alchemy_test_2','alchemy_sweetshop',high,1),/不在/);
      const page=await shops.secondaryFinishedCatalog('alchemy_test_2','alchemy_sweetshop',1,'','符咒');assert.ok(page.items.length);assert.ok(page.items.every((item:any)=>item.category==='符咒'));assert.equal(page.category,'符咒');
      const id=page.items[0].id;const codex=String(2200000+id);await pool.execute('UPDATE item_definitions SET codex_id=? WHERE id=?',[codex,id]);
      const[countBefore]=await pool.query<any[]>('SELECT COUNT(*) AS total FROM player_item_codex WHERE character_id=2 AND item_id=?',[id]);assert.equal(Number(countBefore[0].total),0);
      await shops.discoverSecondaryFinished('alchemy_test_2','alchemy_sweetshop',codex);await shops.discoverSecondaryFinished('alchemy_test_2','alchemy_sweetshop',codex);
      const[countAfter]=await pool.query<any[]>('SELECT COUNT(*) AS total FROM player_item_codex WHERE character_id=2 AND item_id=?',[id]);assert.equal(Number(countAfter[0].total),1);
      await assert.rejects(shops.discoverSecondaryFinished('alchemy_test_2','blacksmith',codex),/不在/);
      const highCodex=String(2300000+high);await pool.execute('UPDATE item_definitions SET codex_id=? WHERE id=?',[highCodex,high]);await assert.rejects(shops.discoverSecondaryFinished('alchemy_test_2','alchemy_sweetshop',highCodex),/不在/);
      const recipeLow=await addItem('simple_launcher','简易发射器','equipment','异械');const recipeHigh=await addItem('rocket_propeller','火箭推进器','equipment','异械');
      assert.equal(shops.isSecondaryFinishedProduct('oddworkshop',{code:'simple_launcher',item_type:'equipment',item_category:'异械'}),false);
      await assert.rejects(shops.buySecondaryFinished('alchemy_test_2','oddworkshop',recipeHigh,1),/不在/);
      const devicePage=await shops.secondaryFinishedCatalog('alchemy_test_2','oddworkshop',1,'','主动异械');assert.ok(!devicePage.items.some((item:any)=>item.id===recipeLow));await assert.rejects(shops.buySecondaryFinished('alchemy_test_2','oddworkshop',recipeLow,1),/不在/);
      const smith=await addItem('shop_basic_test','基础铁剑','equipment','武器');await pool.execute("UPDATE item_definitions SET required_level=15,rarity='普通' WHERE id=?",[smith]);
      await shops.buySecondaryFinished('alchemy_test_2','blacksmith',smith,1);await pool.execute("UPDATE item_definitions SET required_level=20 WHERE id=?",[smith]);await assert.rejects(shops.buySecondaryFinished('alchemy_test_2','blacksmith',smith,1),/不在/);
      await pool.execute("UPDATE item_definitions SET required_level=15,rarity='稀有' WHERE id=?",[smith]);await assert.rejects(shops.buySecondaryFinished('alchemy_test_2','blacksmith',smith,1),/不在/);
    });
    await t.test('洗练按原账退款，重复请求与转职共用重置不会二次返还',async()=>{
      await pool.execute('UPDATE characters SET level=30,skill_points=20 WHERE id=1');
      await pool.execute("INSERT INTO skill_definitions (code,name,category,description) VALUES ('reset_test','退款测试','physical','test')");const[skills]=await pool.query<any[]>("SELECT id FROM skill_definitions WHERE code='reset_test'");const skill=Number(skills[0].id);
      await pool.execute('INSERT INTO player_skills (character_id,skill_id,level) VALUES (1,?,2)',[skill]);await transaction(async(c:any)=>{await ledger.recordSkillPointChange(c,1,-7,'learn_skill',skill,'学技能');await ledger.recordSkillPointChange(c,1,-3,'upgrade_skill',skill,'升级');});
      const preview=await reset.previewSkillReset('alchemy_test_1');assert.equal(preview.refund,10);const before=await quantity('alchemy_skill_reset_elixir');
      const a=await reset.executeSkillReset('alchemy_test_1',preview.token);const b=await reset.executeSkillReset('alchemy_test_1',preview.token);assert.equal(a.restoredPoints,10);assert.deepEqual(a,b);assert.equal(await quantity('alchemy_skill_reset_elixir'),before-1);
      assert.equal(a.availablePoints,30);assert.equal((await transaction((c:any)=>ledger.skillPointLedgerSummary(c,1))).balance,30);
      const again=await transaction((c:any)=>ledger.resetSkillPointAllocation(c,1));assert.equal(again.restoredPoints,0);await assert.rejects(reset.previewSkillReset('alchemy_test_1'),/没有可核实/);
    });
    await t.test('付费鉴识即使缺少旧升级账本也遗忘，只按实际记录退款',async()=>{
      await pool.execute("INSERT INTO skill_definitions (code,name,category,description) VALUES ('appraisal','鉴识','utility','test')");
      const[rows]=await pool.query<any[]>("SELECT id FROM skill_definitions WHERE code='appraisal'");const skill=Number(rows[0].id);
      await pool.execute('INSERT INTO player_skills (character_id,skill_id,level) VALUES (1,?,1)',[skill]);
      await pool.execute('INSERT INTO player_appraisal_progress (character_id,range_level,information_level) VALUES (1,3,1) ON DUPLICATE KEY UPDATE range_level=3');
      await pool.execute('UPDATE characters SET skill_points=28 WHERE id=1');
      await transaction(async(c:any)=>{await ledger.recordSkillPointChange(c,1,-2,'learn_skill',skill,'学习鉴识');const plan=await ledger.skillAllocationPlan(c,1);assert.equal(plan.refund,2);assert.equal(plan.changes.find((change:any)=>change.skillId===skill)?.remove,true);});
      const preview=await reset.previewSkillReset('alchemy_test_1');const result=await reset.executeSkillReset('alchemy_test_1',preview.token);assert.equal(result.removedSkills,1);assert.equal(result.availablePoints,30);
      const[learned]=await pool.query<any[]>('SELECT * FROM player_skills WHERE character_id=1 AND skill_id=?',[skill]);assert.equal(learned.length,0);
      const[discoveries]=await pool.query<any[]>('SELECT * FROM player_skill_discoveries WHERE character_id=1 AND skill_id=?',[skill]);assert.equal(discoveries.length,1);
      const[progress]=await pool.query<any[]>('SELECT range_level,information_level FROM player_appraisal_progress WHERE character_id=1');assert.equal(Number(progress[0].range_level),1);assert.equal(Number(progress[0].information_level),1);
    });
    const resetFixture=async(level:number,points:number)=>{
      for(const table of ['player_skill_point_ledger','player_skills','player_skill_specializations','player_appraisal_progress','player_auto_battle_actions','player_pvp_auto_battle_actions'])await pool.execute(`DELETE FROM ${table} WHERE character_id=2`);
      await pool.execute('UPDATE characters SET level=?,skill_points=?,profession_code=NULL,current_hp=100 WHERE id=2',[level,points]);
      await pool.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (2,?,10) ON DUPLICATE KEY UPDATE quantity=10',[ids.get('alchemy_skill_reset_elixir')]);
    };
    const resetSkill=async(code:string,level=4,cost=2,category='physical',quickSlot:number|null=1)=>{
      await pool.execute('INSERT INTO skill_definitions (code,name,category,learn_cost,description) VALUES (?,?,?,?,?)',[code,code,category,cost,'reset fixture']);
      const[rows]=await pool.query<any[]>('SELECT id FROM skill_definitions WHERE code=?',[code]);const id=Number(rows[0].id);
      await pool.execute('INSERT INTO player_skills (character_id,skill_id,level,quick_slot) VALUES (2,?,?,?)',[id,level,quickSlot]);return id;
    };
    await t.test('无账本按等级设定余额并撤销旧加点，双击只扣一瓶，后续不能再按等级补点',async()=>{
      await resetFixture(30,4);const skill=await resetSkill('legacy_no_ledger');
      await pool.execute("INSERT INTO player_skill_specializations (character_id,skill_id,specialization,level) VALUES (2,?,'potent',3)",[skill]);
      await pool.execute('INSERT INTO player_appraisal_progress (character_id,range_level,information_level) VALUES (2,4,3)');
      const preview=await reset.previewSkillReset('alchemy_test_2');assert.equal(preview.mode,'level');assert.equal(preview.targetPoints,30);assert.equal(preview.refund,26);
      const[a,b]=await Promise.all([reset.executeSkillReset('alchemy_test_2',preview.token),reset.executeSkillReset('alchemy_test_2',preview.token)]);assert.deepEqual(a,b);assert.equal(a.availablePoints,30);
      const[remaining]=await pool.query<any[]>('SELECT quantity FROM player_inventory WHERE character_id=2 AND item_id=?',[ids.get('alchemy_skill_reset_elixir')]);assert.equal(Number(remaining[0].quantity),9);
      const[skills]=await pool.query<any[]>('SELECT * FROM player_skills WHERE character_id=2 AND skill_id=?',[skill]);assert.equal(skills.length,0);
      const[discovery]=await pool.query<any[]>('SELECT * FROM player_skill_discoveries WHERE character_id=2 AND skill_id=?',[skill]);assert.equal(discovery.length,1);
      const[appraisal]=await pool.query<any[]>('SELECT range_level,information_level FROM player_appraisal_progress WHERE character_id=2');assert.equal(Number(appraisal[0].range_level),1);assert.equal(Number(appraisal[0].information_level),1);
      assert.equal((await transaction((c:any)=>ledger.skillPointLedgerSummary(c,2))).balance,30);await assert.rejects(reset.previewSkillReset('alchemy_test_2'),/没有可核实/);
      assert.equal((await transaction((c:any)=>ledger.resetSkillPointAllocation(c,2))).restoredPoints,0);
    });
    await t.test('仅旧余额仍按等级回溯，职业赠送技能保留基础等级；预览后升级必须重新确认',async()=>{
      await resetFixture(30,7);const skill=await resetSkill('legacy_profession_gift');
      await pool.execute("INSERT INTO profession_definitions (code,name,description,growth_json,skill_codes_json) VALUES ('reset_fixture','测试职业','test',JSON_OBJECT(),JSON_ARRAY('legacy_profession_gift'))");
      await pool.execute("UPDATE characters SET profession_code='reset_fixture' WHERE id=2");
      await transaction((c:any)=>ledger.ensureSkillPointLedger(c,2,7));const preview=await reset.previewSkillReset('alchemy_test_2');assert.equal(preview.mode,'level');
      await pool.execute('UPDATE characters SET level=31 WHERE id=2');await assert.rejects(reset.executeSkillReset('alchemy_test_2',preview.token),/等级/);
      const next=await reset.previewSkillReset('alchemy_test_2');const result=await reset.executeSkillReset('alchemy_test_2',next.token);assert.equal(result.availablePoints,31);
      const[rows]=await pool.query<any[]>('SELECT level FROM player_skills WHERE character_id=2 AND skill_id=?',[skill]);assert.equal(Number(rows[0].level),1);
    });
    await t.test('部分真实账本只按已知投入，超额记录与异常余额均不突破等级',async()=>{
      await resetFixture(30,20);const skill=await resetSkill('ledger_cap',1);
      await transaction((c:any)=>ledger.recordSkillPointChange(c,2,-20,'learn_skill',skill,'旧价学习'));
      const preview=await reset.previewSkillReset('alchemy_test_2');assert.equal(preview.mode,'ledger');assert.equal(preview.recordedRefund,20);assert.equal(preview.refund,10);
      assert.equal((await reset.executeSkillReset('alchemy_test_2',preview.token)).availablePoints,30);assert.equal((await transaction((c:any)=>ledger.skillPointLedgerSummary(c,2))).balance,30);
      await resetFixture(30,40);await transaction((c:any)=>ledger.recordSkillPointChange(c,2,40,'initial_grant'));
      const excess=await reset.previewSkillReset('alchemy_test_2');assert.equal(excess.refund,0);assert.equal(excess.targetPoints,30);
      await reset.executeSkillReset('alchemy_test_2',excess.token);assert.equal((await transaction((c:any)=>ledger.skillPointLedgerSummary(c,2))).balance,30);
      await resetFixture(30,5);await transaction((c:any)=>ledger.recordSkillPointChange(c,2,1,'level_up'));
      const partial=await transaction((c:any)=>ledger.skillAllocationPlan(c,2));assert.equal(partial.mode,'ledger');assert.equal(partial.targetPoints,5);assert.equal(partial.canReset,false);
    });
    await t.test('部分账本下遗忘付费技能，回到可领悟并能重新学习；赠送技能保留',async()=>{
      await resetFixture(30,20);
      const skill=await resetSkill('partial_paid_skill',5);
      const gift=await resetSkill('partial_gift_skill',1,2,'physical',null);
      const free=await resetSkill('partial_free_skill',1,0,'physical',null);
      const bound=await resetSkill('partial_bound_skill',1,99,'bound',null);
      await pool.execute("INSERT INTO profession_definitions (code,name,description,growth_json,skill_codes_json) VALUES ('partial_gift','测试赠送职业','test',JSON_OBJECT(),JSON_ARRAY('partial_gift_skill'))");
      await pool.execute("UPDATE characters SET profession_code='partial_gift' WHERE id=2");
      await pool.execute("INSERT INTO player_skill_specializations (character_id,skill_id,specialization,level) VALUES (2,?,'potent',4)",[skill]);
      for(const table of ['player_auto_battle_actions','player_pvp_auto_battle_actions'])await pool.execute(`INSERT INTO ${table} (character_id,sequence_no,skill_id) VALUES (2,1,?)`,[skill]);
      await transaction(async(c:any)=>{await ledger.recordSkillPointChange(c,2,1,'level_up');await ledger.recordSkillPointChange(c,2,-3,'upgrade_skill',skill,'只有一次升级记录');});
      const preview=await reset.previewSkillReset('alchemy_test_2');assert.equal(preview.mode,'ledger');assert.equal(preview.recordedRefund,3);assert.equal(preview.targetPoints,23);
      const result=await reset.executeSkillReset('alchemy_test_2',preview.token);assert.equal(result.removedSkills,1);
      const[remaining]=await pool.query<any[]>('SELECT skill_id FROM player_skills WHERE character_id=2');assert.deepEqual(remaining.map(row=>Number(row.skill_id)).sort((a,b)=>a-b),[gift,free,bound].sort((a,b)=>a-b));
      const[specializations]=await pool.query<any[]>('SELECT * FROM player_skill_specializations WHERE character_id=2 AND skill_id=?',[skill]);assert.equal(specializations.length,0);
      for(const table of ['player_auto_battle_actions','player_pvp_auto_battle_actions']){const[rows]=await pool.query<any[]>(`SELECT skill_id FROM ${table} WHERE character_id=2`);assert.equal(rows[0].skill_id,null);}
      // 执行真实技能列表与学习函数，确认发现记录能接回玩家学习流程。
      const source=ts.createSourceFile('adventure.ts',readFileSync('src/game/adventure.service.ts','utf8'),ts.ScriptTarget.Latest,true);
      const names=['skillList','learnSkill'];const statements=source.statements.filter(ts.isVariableStatement).filter(node=>node.declarationList.declarations.some(d=>names.includes(d.name.getText(source))));assert.equal(statements.length,2);
      const compiled=ts.transpileModule(statements.map(node=>node.getText(source).replace(/^export\s+/,'')).join('\n'),{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText;
      const characterFor=async()=>{const[rows]=await pool.query<any[]>('SELECT * FROM characters WHERE id=2');return rows[0];};
      const api=new Function('characterFor','getPool','withTransaction','recordSkillPointChange','talentByCode','achievementBookLearned',`${compiled};return {skillList,learnSkill}`)(characterFor,async()=>pool,transaction,ledger.recordSkillPointChange,load('src/game/talent.config').talentByCode,load('src/game/achievement-state').achievementBookLearned);
      assert.ok((await api.skillList('alchemy_test_2')).discoveries.some((item:any)=>Number(item.id)===skill));
      const learned=await api.learnSkill('alchemy_test_2',skill);assert.equal(learned.cost,2);
      const listed=await api.skillList('alchemy_test_2');assert.equal(listed.skillPoints,21);assert.ok(listed.skills.some((item:any)=>Number(item.id)===skill&&Number(item.level)===1));assert.ok(!listed.discoveries.some((item:any)=>Number(item.id)===skill));
      const again=await reset.previewSkillReset('alchemy_test_2');assert.equal(again.recordedRefund,2);assert.equal(again.targetPoints,23);
      await reset.executeSkillReset('alchemy_test_2',again.token);await assert.rejects(reset.previewSkillReset('alchemy_test_2'),/没有可核实/);
    });
    const field=load('src/game/item-use.service');
    const fieldItem=async(code:string,effect:any)=>{const item=await addItem(code,code,'consumable','药剂',effect);await pool.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (2,?,5) ON DUPLICATE KEY UPDATE quantity=5',[item]);return item;};
    const fieldQty=async(item:number)=>{const[rows]=await pool.query<any[]>('SELECT quantity FROM player_inventory WHERE character_id=2 AND item_id=?',[item]);return Number(rows[0]?.quantity??0);};
    await t.test('背包回复事务：首次生效、重复按钮不二次扣药、满血不消耗、等级与死亡拦截',async()=>{
      await pool.execute('UPDATE characters SET level=30,hp_max=1000,mp_max=500,current_hp=400,current_mp=100 WHERE id=2');
      const potion=await fieldItem('field_heal',{heal:100,restoreMpPct:20});const token=randomUUID();
      const[a,b]=await Promise.all([field.useInventoryItem('alchemy_test_2',potion,token),field.useInventoryItem('alchemy_test_2',potion,token)]);assert.deepEqual(a,b);assert.equal(a.consumed,true);assert.equal(await fieldQty(potion),4);
      const[chars]=await pool.query<any[]>('SELECT current_hp,current_mp FROM characters WHERE id=2');assert.equal(Number(chars[0].current_hp),500);assert.equal(Number(chars[0].current_mp),200);
      await assert.rejects(field.useInventoryItem('alchemy_test_1',potion,token),/不属于/);
      await pool.execute('UPDATE characters SET current_hp=1000,current_mp=500 WHERE id=2');assert.equal((await field.useInventoryItem('alchemy_test_2',potion,randomUUID())).consumed,false);assert.equal(await fieldQty(potion),4);
      await pool.execute('UPDATE item_definitions SET required_level=50 WHERE id=?',[potion]);await assert.rejects(field.useInventoryItem('alchemy_test_2',potion,randomUUID()),/等级不足/);
      await pool.execute('UPDATE characters SET current_hp=0 WHERE id=2');await assert.rejects(field.useInventoryItem('alchemy_test_2',potion,randomUUID()),/复活/);assert.equal(await fieldQty(potion),4);await pool.execute('UPDATE characters SET current_hp=1000 WHERE id=2');
    });
    await t.test('秘药战斗外使用保留场次，旧代码不叠加，弱药和满时长不消耗',async()=>{
      const low=await fieldItem('field_luck_low',{partyDropBonusPct:10,battleCount:5});const high=await fieldItem('field_luck_high',{partyDropBonusPct:30,battleCount:10});
      await pool.execute("INSERT INTO player_battle_buffs (character_id,buff_code,remaining_battles) VALUES (2,'minor_luck_elixir',3)");
      assert.equal((await field.useInventoryItem('alchemy_test_2',low,randomUUID())).consumed,false);assert.equal(await fieldQty(low),5);
      assert.equal((await field.useInventoryItem('alchemy_test_2',high,randomUUID())).consumed,true);
      const[buffs]=await pool.query<any[]>('SELECT buff_code,remaining_battles FROM player_battle_buffs WHERE character_id=2');assert.equal(buffs.length,1);assert.equal(buffs[0].buff_code,'alchemy_drop_30');assert.equal(Number(buffs[0].remaining_battles),10);
      assert.equal((await field.useInventoryItem('alchemy_test_2',high,randomUUID())).consumed,false);assert.equal(await fieldQty(high),4);
      const combat=await fieldItem('field_bomb',{target:'enemy',throwable:{damageScale:2,element:'火'}});await assert.rejects(field.useInventoryItem('alchemy_test_2',combat,randomUUID()),/战斗/);assert.equal(await fieldQty(combat),5);
    });
    await t.test('背包盲盒只给未持有图纸，全部持有不消耗；缺少食物配置回滚',async()=>{
      const blueprint=await addItem('field_part_blueprint','测试图纸','consumable','图纸',{constructionBlueprint:'field_part'});
      const box=await fieldItem('field_box',{deviceBlueprintBox:true,outputs:['field_part']});assert.equal((await field.useInventoryItem('alchemy_test_2',box,randomUUID())).consumed,true);assert.equal(await fieldQty(blueprint),1);
      assert.equal((await field.useInventoryItem('alchemy_test_2',box,randomUUID())).consumed,false);assert.equal(await fieldQty(box),4);
      const food=await fieldItem('field_food',{foodBuff:'field_food'});const token=randomUUID();await assert.rejects(field.useInventoryItem('alchemy_test_2',food,token),/配置/);assert.equal(await fieldQty(food),5);
      const[requests]=await pool.query<any[]>('SELECT token FROM player_craft_requests WHERE token=?',[token]);assert.equal(requests.length,0);
    });
    await t.test('背包食物消耗成品获得实际餐食状态，已有餐食不浪费第二份',async()=>{
      const food=await fieldItem('field_meal',{foodBuff:'field_meal'});
      await pool.execute('INSERT INTO guild_restaurant_menu (item_id,ingredients_json,buff_json,duration_minutes) VALUES (?,JSON_ARRAY(),JSON_OBJECT(\'physicalAttackPct\',10),30)',[food]);
      assert.equal((await field.useInventoryItem('alchemy_test_2',food,randomUUID())).consumed,true);assert.equal(await fieldQty(food),4);
      const[active]=await pool.query<any[]>('SELECT item_id,TIMESTAMPDIFF(SECOND,NOW(),expires_at) AS seconds FROM player_food_buffs WHERE character_id=2');assert.equal(Number(active[0].item_id),food);assert.ok(Number(active[0].seconds)>1700);
      assert.equal((await field.useInventoryItem('alchemy_test_2',food,randomUUID())).consumed,false);assert.equal(await fieldQty(food),4);
    });
    await t.test('PVP进行中不能从背包回血或获取场外秘药效果',async()=>{
      const potion=await fieldItem('field_blocked',{heal:100});const session=randomUUID();
      await pool.execute('INSERT INTO player_pvp_battle_sessions (id,attacker_character_id,defender_character_id,attacker_hp,attacker_mp,defender_hp,defender_mp,attacker_cooldowns,defender_cooldowns) VALUES (?,1,2,100,100,100,100,JSON_OBJECT(),JSON_OBJECT())',[session]);
      await assert.rejects(field.useInventoryItem('alchemy_test_2',potion,randomUUID()),/绕过回合/);assert.equal(await fieldQty(potion),5);await pool.execute('DELETE FROM player_pvp_battle_sessions WHERE id=?',[session]);
    });
    await t.test('三店恢复原有出售列表、扣物发钱及库存不足校验',async()=>{
      const alchemyShop=load('src/game/alchemist-shop.service');
      const smithShop=load('src/game/blacksmith-shop.service');
      const workshopShop=load('src/game/oddworkshop-shop.service');
      const money=async()=>{const[rows]=await pool.query<any[]>('SELECT copper_coins FROM characters WHERE id=2');return Number(rows[0].copper_coins);};
      for(const[code,category,catalog,sell,multiplier]of [
        ['sale_herb','药剂',alchemyShop.alchemistSellCatalog,alchemyShop.sellAlchemistItem,1.15],
        ['sale_wood','锻材',smithShop.blacksmithSellCatalog,smithShop.sellBlacksmithMaterial,1.15],
        ['sale_part','构件',workshopShop.oddWorkshopSellCatalog,workshopShop.sellOddWorkshopItem,1.25]
      ]as const){
        const id=await addItem(code,code,'material',category);await pool.execute('UPDATE item_definitions SET is_tradeable=1,trade_price=100 WHERE id=?',[id]);
        await pool.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (2,?,3)',[id]);
        assert.ok((await catalog('alchemy_test_2',1,code)).items.some((item:any)=>item.id===id));
        const before=await money();const sold=await sell('alchemy_test_2',id,2);assert.equal(sold.price,Math.ceil(100*multiplier)*2);assert.equal(await money(),before+sold.price);assert.equal(await fieldQty(id),1);
        await assert.rejects(sell('alchemy_test_2',id,2),/数量不足/);assert.equal(await fieldQty(id),1);assert.equal(await money(),before+sold.price);
        await sell('alchemy_test_2',id,1);assert.equal(await fieldQty(id),0);
      }
      const id=await addItem('sale_sword','回收测试剑','equipment','武器');await pool.execute('UPDATE item_definitions SET is_tradeable=1,required_level=10 WHERE id=?',[id]);
      const[insert]=await pool.execute<any>('INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max) VALUES (2,?,0,100,100)',[id]);
      assert.ok((await smithShop.blacksmithSellCatalog('alchemy_test_2',1,'回收测试剑')).items.some((item:any)=>item.id===insert.insertId));
      const before=await money();const sold=await smithShop.sellBlacksmithEquipment('alchemy_test_2',insert.insertId);assert.equal(await money(),before+sold.price);
      await assert.rejects(smithShop.sellBlacksmithEquipment('alchemy_test_2',insert.insertId),/未找到/);assert.equal(await money(),before+sold.price);
    });
    await t.test('真实业务产生的成就与永久奖励已经落库',async()=>{const [rows]=await pool.query<any[]>("SELECT achievement_id FROM achievement_completions WHERE identity_key=?",['alchemy_test_1']);for(const id of ["ACH_H15","ACH_H19","ACH_H20"])assert.ok(rows.some(r=>r.achievement_id===id),id);});
  }finally{await pool.end();await admin.query('DROP DATABASE '+database);await admin.end();}
});
