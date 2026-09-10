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

const database=process.env.AUTOMATON_TEST_DATABASE;
test('副职业店铺真实 SQL：三级代工、扣料、熟练度与来源隔离',{skip:!database&&'设置 AUTOMATON_TEST_DATABASE 运行隔离数据库验证'},async t=>{
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
    for(let repeat=0;repeat<2;repeat++){await initializeAlchemyV2(pool);await initializeInventoryBinding(pool);await initializeAutomaton(pool);await initializeInstanceMarket(pool);}
    const transaction=async(work:any)=>{const c=await pool.getConnection();try{await c.beginTransaction();const result=await work(c);await c.commit();return result;}catch(error){await c.rollback();throw error;}finally{c.release();}};
    const cache=new Map<string,any>();let portraitHostFails=false,portraitHostCalls=0;
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
    await t.test('四家店固定三级：普通玩家可代工，实际扣料不加熟练度，离店及跨来源确认拒绝',async()=>{
      const scope=load('src/game/secondary-shop-context'),alchemy=load('src/game/alchemist.service'),forge=load('src/game/blacksmith.service'),deconstruction=load('src/game/deconstructor.service'),omni=load('src/game/omniscient.service'),repair=load('src/game/forge-repair.service');
      const run=(shop:string,work:()=>Promise<any>)=>scope.withSecondaryShop({shop,characterId:1,user:'automaton_test_1',personalProfession:null},work);
      for(const shop of ['blacksmith','oddworkshop','bookshop'])await pool.execute("INSERT INTO map_npcs(region_id,code,name,description,pos_x,pos_y,pos_z) SELECT current_region_id,?,?,'店铺测试',pos_x,pos_y,pos_z FROM characters WHERE id=1",[shop,shop]);
      for(const code of ['beast_bone','refined_beast_bone','living_wood','metal_element_dust','forge_repair_kit','blood_residue','energy_ember']){
        await pool.execute("INSERT IGNORE INTO item_definitions(code,name,item_type,item_category) VALUES (?,?,'material','材料')",[code,code]);
        await pool.execute('INSERT IGNORE INTO player_inventory(character_id,item_id,quantity) SELECT 1,id,100 FROM item_definitions WHERE code=?',[code]);
      }
      await pool.execute('UPDATE characters SET copper_coins=1000 WHERE id=1');
      await pool.execute(`UPDATE map_npcs n JOIN characters c ON c.id=1 SET n.region_id=c.current_region_id,n.pos_x=c.pos_x,n.pos_y=c.pos_y,n.pos_z=c.pos_z WHERE n.code IN ('blacksmith','alchemy_sweetshop','oddworkshop','bookshop')`);
      const [before]=await pool.query('SELECT * FROM player_secondary_professions ORDER BY character_id,profession_code');
      await pool.execute('UPDATE characters SET secondary_profession_code=NULL WHERE id=1');
      try{
        for(const [shop,service,fn] of [['blacksmith',forge,'blacksmithProgress'],['alchemy_sweetshop',alchemy,'alchemistProgress'],['oddworkshop',deconstruction,'deconstructorProgress'],['bookshop',omni,'omniscientProgress']] as const){
          assert.equal((await run(shop,()=>service[fn]('automaton_test_1'))).level,3);
        }
        const bone=await stock('beast_bone');let token='';
        await run('alchemy_sweetshop',async()=>{
          await alchemy.activatePersonalAlchemy('automaton_test_1');
          await alchemy.selectPurificationMaterial('automaton_test_1',Number(bone.item_id),2);
          const preview=await alchemy.purificationState('automaton_test_1');assert.equal(preview.success,70);token=preview.token;
        });
        await assert.rejects(alchemy.executePurification('automaton_test_1',token),/来源/);
        await pool.execute('UPDATE characters SET pos_x=pos_x+1 WHERE id=1');
        await assert.rejects(run('alchemy_sweetshop',()=>alchemy.executePurification('automaton_test_1',token)),/离开店铺/);
        assert.equal((await stock('beast_bone')).quantity,bone.quantity);
        await pool.execute('UPDATE characters SET pos_x=pos_x-1 WHERE id=1');
        const result=await run('alchemy_sweetshop',()=>alchemy.executePurification('automaton_test_1',token));
        assert.equal(result.proficiencyGain,0);assert.equal(result.progress.level,3);assert.equal((await stock('beast_bone')).quantity,Number(bone.quantity)-2);
        assert.deepEqual(await run('alchemy_sweetshop',()=>alchemy.executePurification('automaton_test_1',token)),result);
        const wood=await stock('living_wood'),kit=await stock('forge_repair_kit');
        await run('blacksmith',()=>repair.craftForgeRepairKit('automaton_test_1'));
        assert.equal((await stock('living_wood')).quantity,Number(wood.quantity)-1);assert.equal((await stock('forge_repair_kit')).quantity,Number(kit.quantity)+1);
        const dismantled=await run('oddworkshop',()=>deconstruction.deconstructItems('automaton_test_1',Number(bone.item_id),1));
        assert.equal(dismantled.proficiencyGain,0);assert.equal((await stock('beast_bone')).quantity,Number(bone.quantity)-3);
        const [after]=await pool.query('SELECT * FROM player_secondary_professions ORDER BY character_id,profession_code');assert.deepEqual(after,before);
        await assert.rejects(alchemy.alchemistProgress('automaton_test_1'),/炼金师/);
        await assert.rejects(forge.blacksmithProgress('automaton_test_1'),/锻造/);
        await assert.rejects(run('alchemy_sweetshop',()=>alchemy.alchemyFormulaList('automaton_test_1')),/仅对当前炼金师/);
        await assert.rejects(run('alchemy_sweetshop',()=>alchemy.saveAlchemyFormula('automaton_test_1')),/仅对当前炼金师/);
      }finally{
        await pool.execute("UPDATE characters SET secondary_profession_code='alchemist' WHERE id=1");
        await alchemy.activatePersonalAlchemy('automaton_test_1');
      }
      assert.equal((await alchemy.alchemistProgress('automaton_test_1')).level,4);
      assert.equal((await run('alchemy_sweetshop',()=>alchemy.alchemistProgress('automaton_test_1'))).level,3);
    });
  }finally{await pool.end();await admin.query('DROP DATABASE '+database);await admin.end();}
});
