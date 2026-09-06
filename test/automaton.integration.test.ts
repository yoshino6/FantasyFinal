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
    const parsed=ts.createSourceFile('bootstrap.ts',readFileSync('src/database/bootstrap.ts','utf8'),ts.ScriptTarget.Latest,true);
    const declaration=parsed.statements.filter(ts.isVariableStatement).flatMap(s=>[...s.declarationList.declarations]).find(d=>d.name.getText(parsed)==='schemaStatements')!;
    for(const sql of new Function(`return ${declaration.initializer!.getText(parsed)}`)() as string[])await pool.query(sql);
    for(let repeat=0;repeat<2;repeat++){await initializeAlchemyV2(pool);await initializeInventoryBinding(pool);await initializeAutomaton(pool);}
    const transaction=async(work:any)=>{const c=await pool.getConnection();try{await c.beginTransaction();const result=await work(c);await c.commit();return result;}catch(error){await c.rollback();throw error;}finally{c.release();}};
    const cache=new Map<string,any>();let failEvent=false;
    const load=(relative:string):any=>{const path=resolve(relative.endsWith('.ts')?relative:relative+'.ts');if(cache.has(path))return cache.get(path).exports;const module={exports:{} as any};cache.set(path,module);
      const local=(id:string):any=>id.endsWith('/pool')?{getPool:async()=>pool,withTransaction:transaction}:id.startsWith('.')?load(resolve(dirname(path),id)):require(id);
      const compiled=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
      new Function('require','module','exports',compiled)(local,module,module.exports);return module.exports;};
    const service=load('src/game/automaton.service'),inventory=load('src/game/inventory-binding');
    const seed=await pool.getConnection();try{
      await seed.query('SET FOREIGN_KEY_CHECKS=0');await seed.execute("INSERT INTO players(id,qq_user_id) VALUES (1,'automaton_test_1'),(2,'automaton_test_2')");
      const [columns]=await seed.query<any[]>('SHOW COLUMNS FROM characters');const names=columns.filter(c=>c.Null==='NO'&&c.Default===null&&!String(c.Extra).includes('auto_increment')).map(c=>c.Field);
      for(const id of [1,2])await seed.execute(`INSERT INTO characters (id,player_id,${names.map(name=>'`'+name+'`').join(',')}) VALUES (?,?,${names.map(()=>'?').join(',')})`,[id,id,...names.map(name=>name==='name'?`机巧测试${id}`:100)]);
      await seed.execute("UPDATE characters SET level=30,realm_stage=3,secondary_profession_code='alchemist'");await seed.execute("INSERT INTO player_secondary_professions(character_id,profession_code,level,proficiency) VALUES(1,'alchemist',4,0),(2,'alchemist',4,0)");
      for(const code of ['sky_dust','mana_dust','light_element_dust','magic_unit',...service.automatonRecipes.flatMap((r:any)=>r.ingredients.map((i:any)=>i.code))])await seed.execute("INSERT IGNORE INTO item_definitions (code,name,item_type,item_category) VALUES (?,?,'material','炼材')",[code,code]);
      await seed.execute('INSERT INTO player_inventory (character_id,item_id,quantity,trade_bound_quantity) SELECT 1,id,10000,100 FROM item_definitions');
      await seed.query('SET FOREIGN_KEY_CHECKS=1');
    }finally{seed.release();}
    const stock=async(code:string)=>{const [rows]=await pool.execute<any[]>('SELECT pi.* FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=1 AND i.code=?',[code]);return rows[0];};
    await t.test('全部旧 SQL 消耗绑定优先，新发放数量不误绑定',async()=>{const row=await stock('sky_dust');await pool.execute('UPDATE player_inventory SET quantity=quantity-10 WHERE character_id=1 AND item_id=?',[row.item_id]);const after=await stock('sky_dust');assert.equal(after.trade_bound_quantity,90);await transaction((c:any)=>inventory.consumeInventory(c,1,row.item_id,5,true));assert.equal((await stock('sky_dust')).trade_bound_quantity,90);});
    await t.test('点灵失败只消耗2粉尘，双确认只记一次',async()=>{
      const before=await stock('sky_dust'),body=await stock('automaton_body');const preview=await service.previewAutomatonCraft('automaton_test_1','automaton');
      const old=Math.random;Math.random=()=>.99;let results:any[];try{results=await Promise.all([service.confirmAutomatonCraft('automaton_test_1',preview.token),service.confirmAutomatonCraft('automaton_test_1',preview.token)]);}finally{Math.random=old;}
      assert.deepEqual(results![0],results![1]);assert.equal((await stock('sky_dust')).quantity,before.quantity-2);assert.equal((await stock('automaton_body')).quantity,body.quantity);
      const [logs]=await pool.query<any[]>('SELECT batches_json FROM player_alchemy_journal');const batches=typeof logs[0].batches_json==='string'?JSON.parse(logs[0].batches_json):logs[0].batches_json;assert.deepEqual(batches[0].consumed.map((i:any)=>[i.code,i.quantity]),[['sky_dust',2]]);
    });
    let petId=0;
    await t.test('出生固定、交易绑定材料制造得到未绑定新实例、认主幂等',async()=>{
      const preview=await service.previewAutomatonCraft('automaton_test_1','automaton');const old=Math.random;Math.random=()=>0;try{await service.confirmAutomatonCraft('automaton_test_1',preview.token);}finally{Math.random=old;}
      const list=await service.automatonList('automaton_test_1');petId=Number(list.items[0].row.id);const born=list.items[0].state;assert.equal(list.items[0].row.bound_kind,'none');
      const claim=await service.previewAutomatonMutation('automaton_test_1',petId,'认主',[]);await assert.rejects(service.confirmAutomatonMutation('automaton_test_2',claim.token),/不属于/);
      const results=await Promise.all([service.confirmAutomatonMutation('automaton_test_1',claim.token),service.confirmAutomatonMutation('automaton_test_1',claim.token)]);assert.deepEqual(results[0],results[1]);
      const after=(await service.automatonList('automaton_test_1')).items[0];assert.deepEqual(after.state,born);assert.equal(after.row.bound_kind,'personal');
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
    assert.equal(failEvent,false);
  }finally{await pool.end();await admin.query('DROP DATABASE '+database);await admin.end();}
});
