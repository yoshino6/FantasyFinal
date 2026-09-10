import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createPool } from 'mysql2/promise';
import { initializeAutomaton } from '../src/database/automaton';
import { initializeInventoryBinding } from '../src/database/inventory-binding';
import { initializeInstanceMarket } from '../src/database/instance-market';

const database = process.env.ACCOUNT_DELETE_TEST_DATABASE;
test('注销交易账号：真实外键、快照恢复与事务回滚', { skip: !database && '设置 ACCOUNT_DELETE_TEST_DATABASE 运行隔离数据库验证' }, async t => {
  assert.match(database!, /^fantasyfinal_account_delete_test_[a-z0-9_]+$/);
  const require = createRequire(import.meta.url);
  const config = require('yaml').parse(readFileSync('alemon.config.yaml', 'utf8'));
  const original = config.FantasyFinal?.database ?? config.mysql;
  assert.notEqual(database, original.database);
  const admin = createPool({ host: original.host, port: original.port, user: original.user, password: original.password, connectTimeout: 5000 });
  const [exists] = await admin.query<any[]>('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [database]);
  assert.equal(exists.length, 0, '拒绝覆盖已有数据库');
  await admin.query('CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  const pool = createPool({ ...original, database, connectionLimit: 4, charset: 'utf8mb4' });
  try {
    const parsed = ts.createSourceFile('bootstrap.ts', readFileSync('src/database/bootstrap.ts', 'utf8'), ts.ScriptTarget.Latest, true);
    const declaration = parsed.statements.filter(ts.isVariableStatement).flatMap(s => [...s.declarationList.declarations]).find(d => d.name.getText(parsed) === 'schemaStatements')!;
    for (const sql of new Function(`return ${declaration.initializer!.getText(parsed)}`)() as string[]) await pool.query(sql);
    const transaction = async (work: any) => {
      const connection = await pool.getConnection();
      try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; }
      catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    };
    const cache = new Map<string, any>();
    const load = (relative: string): any => {
      const path = resolve(relative.endsWith('.ts') ? relative : relative + '.ts');
      if (cache.has(path)) return cache.get(path).exports;
      const module = { exports: {} as any }; cache.set(path, module);
      const local = (id: string): any => id.endsWith('/pool') ? { getPool: async () => pool, withTransaction: transaction } : id.startsWith('.') ? load(resolve(dirname(path), id)) : require(id);
      const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
      new Function('require', 'module', 'exports', compiled)(local, module, module.exports);
      return module.exports;
    };
    const account = load('src/game/account.service'), records = load('src/game/account-deletion-record.service');
    const rows = async (sql: string) => (await pool.query<any[]>(sql))[0];
    await pool.execute("INSERT INTO map_regions(id,code,name,description,min_x,max_x,min_y,max_y,min_z,max_z) VALUES(1,'deletion_test','测试','测试',0,100,0,100,0,100)");
    await pool.execute("INSERT INTO players(id,qq_user_id) VALUES(1,'deletion_test_1'),(2,'deletion_test_2'),(3,'deletion_test_3')");
    await pool.execute("UPDATE players SET qq_nickname='2026-09-08T01:23:45.000Z',created_at='2026-01-02 03:04:05' WHERE id=1");
    const columns = await rows('SHOW COLUMNS FROM characters');
    const names = columns.filter(c => c.Null === 'NO' && c.Default === null && !String(c.Extra).includes('auto_increment')).map(c => c.Field);
    for (const id of [1, 2, 3]) await pool.execute(`INSERT INTO characters(id,player_id,${names.map(name => '`' + name + '`').join(',')}) VALUES(?,?,${names.map(() => '?').join(',')})`, [id, id, ...names.map(name => name === 'name' ? `注销测试${id}` : name === 'current_region_id' ? 1 : 10)]);
    await pool.execute('UPDATE characters SET copper_coins=1000');
    await pool.execute("INSERT INTO item_definitions(id,code,name,description) VALUES(1,'deletion_item','测试材料','测试')");
    await pool.execute('INSERT INTO player_inventory(character_id,item_id,quantity) VALUES(1,1,7),(2,1,8),(3,1,9)');
    for (const [id, owner, side] of [[1, 1, 'sell'], [2, 2, 'buy'], [3, 1, 'buy'], [4, 2, 'sell'], [5, 2, 'buy'], [6, 3, 'sell']] as const) {
      await pool.execute("INSERT INTO market_orders(id,character_id,item_id,side,unit_price,quantity_total,quantity_remaining,status,expires_at) VALUES(?,?,1,?,10,5,4,'partial',DATE_ADD(NOW(),INTERVAL 1 DAY))", [id, owner, side]);
    }
    await pool.execute('INSERT INTO market_escrow_items(order_id,character_id,item_id,quantity) VALUES(1,1,1,4),(4,2,1,4),(6,3,1,4)');
    for (const [id, buy, sell] of [[1, 2, 1], [2, 3, 4], [3, 5, 6], [4, 3, 1]]) {
      await pool.execute('INSERT INTO market_trades(id,buy_order_id,sell_order_id,item_id,quantity,unit_price,gross_copper,fee_copper,seller_net_copper) VALUES(?,?,?,1,1,10,10,1,9)', [id, buy, sell]);
    }
    const others = async () => ({
      characters: await rows('SELECT * FROM characters WHERE id<>1 ORDER BY id'),
      inventory: await rows('SELECT * FROM player_inventory WHERE character_id<>1 ORDER BY character_id'),
      orders: await rows('SELECT * FROM market_orders WHERE character_id<>1 ORDER BY id'),
      escrow: await rows('SELECT * FROM market_escrow_items WHERE character_id<>1 ORDER BY order_id'),
      trades: await rows('SELECT * FROM market_trades WHERE id=3')
    });
    await t.test('原始删除复现买卖订单外键阻断', async () => {
      await assert.rejects(transaction((connection: any) => connection.execute('DELETE FROM characters WHERE id=1')), (error: any) => error.code === 'ER_ROW_IS_REFERENCED_2' && /fk_market_trade_(buy|sell)/.test(error.message));
    });
    await initializeInventoryBinding(pool);
    await initializeAutomaton(pool);
    await initializeInstanceMarket(pool);
    await pool.execute(`INSERT INTO player_automatons(id,holder_id,creator_id,owner_id,state_json,combat_id) VALUES
      (1,1,2,1,'{"name":"认主人偶","level":30,"portrait":{"key":"11111111111111111111111111111111.webp","url":"https://example.com/pet.webp"}}','ended-battle'),
      (2,1,1,NULL,'{"name":"未认主人偶","level":1}',NULL),
      (3,2,1,2,'{"name":"已售人偶","level":20}',NULL)`);
    await t.test('仅保留人偶外键时复现 holder_id 阻断', async () => {
      await assert.rejects(transaction(async (c: any) => {
        await c.execute('DELETE FROM market_trades');
        await c.execute('DELETE FROM characters WHERE id=1');
      }), (error: any) => error.code === 'ER_ROW_IS_REFERENCED_2' && /player_automatons/.test(error.message));
    });
    await pool.execute('INSERT INTO player_item_instances(id,character_id,item_id) VALUES(1,1,1),(2,2,1)');
    await pool.execute(`INSERT INTO market_instance_listings(id,seller_id,buyer_id,kind,resource_id,active_instance_id,active_automaton_id,name,price,snapshot_json,status,expires_at) VALUES
      (1,1,NULL,'automaton',2,NULL,2,'人偶寄售',100,'{}','open',DATE_ADD(NOW(),INTERVAL 1 DAY)),
      (2,1,NULL,'equipment',1,1,NULL,'装备寄售',100,'{}','open',DATE_ADD(NOW(),INTERVAL 1 DAY)),
      (3,1,2,'automaton',3,NULL,NULL,'已售人偶',100,'{}','sold',DATE_ADD(NOW(),INTERVAL 1 DAY)),
      (4,2,NULL,'equipment',2,2,NULL,'他人装备',100,'{}','open',DATE_ADD(NOW(),INTERVAL 1 DAY))`);
    await pool.execute('UPDATE player_automatons SET market_listing_id=1 WHERE id=2');
    await pool.execute('UPDATE player_item_instances SET market_listing_id=IF(id=1,2,4)');
    await pool.execute(`INSERT INTO automaton_events(automaton_id,character_id,event_key,kind,data_json) VALUES
      (1,1,'first','first_met','{}'),(2,1,'birth','birth','{}'),(3,1,'birth','birth','{}')`);
    await pool.execute(`INSERT INTO automaton_dialogues(id,automaton_id,event_key,event_type,quote_id,text_hash,text_value) VALUES
      (1,1,'hello','greeting','test','hash','你好'),(2,3,'hello','greeting','test','hash','他人的你好')`);
    await pool.execute(`INSERT INTO automaton_memories(automaton_id,character_id,dialogue_id,text_value) VALUES(1,1,1,'初识'),(3,2,2,'他人初识')`);
    await pool.execute('INSERT INTO automaton_quote_feedback(dialogue_id,character_id,vote) VALUES(1,1,1),(2,2,1)');
    await pool.execute("INSERT INTO automaton_daily(character_id,day_key,greeting) VALUES(1,'2026-09-01',1),(2,'2026-09-01',1)");
    await pool.execute("INSERT INTO automaton_proficiency_remainders(character_id,profession_code,budget_units) VALUES(1,'alchemist',20),(2,'alchemist',30)");
    await pool.execute("INSERT INTO combat_automatons(session_id,automaton_id,owner_id,state_json) VALUES('ended-battle',1,1,'{}')");
    await pool.execute(`INSERT INTO automaton_portrait_uploads(character_id,scope_key,token,automaton_id,expires_at) VALUES(1,REPEAT('1',64),REPEAT('1',32),1,DATE_ADD(NOW(),INTERVAL 2 MINUTE))`);
    await pool.execute(`INSERT INTO automaton_portrait_reviews(character_id,automaton_id,token,file_key,width,height,status) VALUES
      (1,1,REPEAT('2',32),CONCAT(REPEAT('1',32),'.webp'),64,64,'approved'),
      (1,1,REPEAT('3',32),CONCAT(REPEAT('2',32),'.webp'),64,64,'pending')`);
    const petData = async () => {
      const result: Record<string, any[]> = {};
      for (const table of ['player_automatons', 'player_item_instances', 'market_instance_listings', 'automaton_events', 'automaton_dialogues', 'automaton_memories', 'automaton_quote_feedback', 'automaton_daily', 'automaton_proficiency_remainders', 'automaton_portrait_reviews']) {
        result[table] = await rows(`SELECT * FROM ${table} ORDER BY 1,2`);
      }
      return result;
    };
    const originalPetData = await petData();
    // 绑定迁移会新增库存列，此处重新记录其他玩家的完整数据。
    const migratedOthers = await others();
    const { code } = await account.requestAccountDeletion('deletion_test_1');
    const originalPlayer = await rows('SELECT * FROM players WHERE id=1');
    const originalCharacter = await rows('SELECT * FROM characters WHERE id=1');
    const originalTrades = await rows('SELECT * FROM market_trades ORDER BY id');
    await t.test('验证码错误不删除数据', async () => {
      await assert.rejects(account.deletePlayerAccount('deletion_test_1', 'invalid'), /验证码错误/);
      assert.equal((await rows('SELECT * FROM market_trades')).length, 4);
      assert.equal((await rows('SELECT * FROM account_deletion_records')).length, 0);
    });
    await t.test('注销清理买卖及双向关联成交，保留其他玩家资产和订单', async () => {
      await account.deletePlayerAccount('deletion_test_1', code);
      for (const sql of ['SELECT * FROM players WHERE id=1', 'SELECT * FROM characters WHERE id=1', 'SELECT * FROM market_orders WHERE character_id=1', 'SELECT * FROM market_escrow_items WHERE character_id=1', 'SELECT * FROM player_inventory WHERE character_id=1', 'SELECT * FROM market_trades WHERE id<>3']) assert.equal((await rows(sql)).length, 0, sql);
      assert.deepEqual(await others(), migratedOthers);
      const [record] = await rows('SELECT * FROM account_deletion_records');
      const snapshot = typeof record.snapshot_json === 'string' ? JSON.parse(record.snapshot_json) : record.snapshot_json;
      assert.deepEqual(snapshot.tables.market_trades.map((row: any) => Number(row.id)).sort(), [1, 2, 4]);
      assert.equal(snapshot.tables.market_orders.length, 2);
    });
    await t.test('删除人偶、寄售及无外键记录，快照保留形象审核和成长资料；已售人偶不受影响', async () => {
      const remaining = await petData();
      assert.deepEqual(remaining.player_automatons, originalPetData.player_automatons.filter(row => row.id === 3));
      assert.deepEqual(remaining.player_item_instances, originalPetData.player_item_instances.filter(row => row.id === 2));
      assert.deepEqual(remaining.market_instance_listings, originalPetData.market_instance_listings.filter(row => row.id >= 3));
      assert.deepEqual(remaining.automaton_events, originalPetData.automaton_events.filter(row => row.automaton_id === 3));
      assert.deepEqual(remaining.automaton_dialogues, originalPetData.automaton_dialogues.filter(row => row.automaton_id === 3));
      for (const table of ['automaton_memories','automaton_quote_feedback','automaton_daily','automaton_proficiency_remainders']) {
        assert.deepEqual(remaining[table], originalPetData[table].filter(row => row.character_id === 2));
      }
      assert.equal(remaining.automaton_portrait_reviews.length, 0);
      assert.equal((await rows('SELECT * FROM automaton_portrait_uploads')).length, 0);
      assert.equal((await rows('SELECT * FROM combat_automatons')).length, 0);
      const [record] = await rows('SELECT * FROM account_deletion_records');
      const snapshot = typeof record.snapshot_json === 'string' ? JSON.parse(record.snapshot_json) : record.snapshot_json;
      assert.deepEqual(snapshot.tables.player_automatons.map((row: any) => row.id).sort(), [1,2]);
      assert.equal(snapshot.tables.automaton_portrait_reviews.length, 2);
      assert.equal(snapshot.tables.automaton_dialogues.length, 1);
      assert.equal(snapshot.tables.automaton_daily.length, 1);
      assert.equal(snapshot.tables.combat_automatons, undefined);
      assert.equal(snapshot.tables.automaton_portrait_uploads, undefined);
    });
    await t.test('快照恢复订单与成交，不重复改变交易对方资产', async () => {
      const [record] = await rows('SELECT * FROM account_deletion_records');
      await records.restoreDeletedAccount(Number(record.id), 'test_admin');
      assert.equal((await rows('SELECT * FROM players')).length, 3);
      assert.equal((await rows('SELECT * FROM market_orders')).length, 6);
      assert.equal((await rows('SELECT * FROM market_trades')).length, 4);
      assert.equal((await rows('SELECT quantity FROM player_inventory WHERE character_id=1'))[0].quantity, 7);
      assert.deepEqual(await rows('SELECT * FROM players WHERE id=1'), originalPlayer);
      assert.deepEqual(await rows('SELECT * FROM characters WHERE id=1'), originalCharacter);
      assert.deepEqual(await rows('SELECT * FROM market_trades ORDER BY id'), originalTrades);
      assert.deepEqual(await others(), migratedOthers);
      const expected = structuredClone(originalPetData);
      expected.player_automatons.forEach(row => { row.combat_id = null; });
      assert.deepEqual(await petData(), expected, '人偶属性、技能 JSON、形象、历史和寄售完整恢复，但不恢复过期战斗引用');
      assert.equal((await rows('SELECT * FROM combat_automatons')).length, 0);
      assert.equal((await rows('SELECT * FROM automaton_portrait_uploads')).length, 0);
    });
    await t.test('后续删除失败，成交清理与快照一并回滚', async () => {
      await pool.query("CREATE TRIGGER deletion_test_failure BEFORE DELETE ON players FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='injected deletion failure'");
      try {
        const beforePets = await petData();
        const { code: retry } = await account.requestAccountDeletion('deletion_test_1');
        await assert.rejects(account.deletePlayerAccount('deletion_test_1', retry), /injected deletion failure/);
        assert.equal((await rows('SELECT * FROM market_trades')).length, 4);
        assert.equal((await rows('SELECT * FROM market_orders')).length, 6);
        assert.equal((await rows('SELECT * FROM players')).length, 3);
        assert.equal((await rows('SELECT * FROM account_deletion_records')).length, 1);
        assert.deepEqual(await others(), migratedOthers);
        assert.deepEqual(await petData(), beforePets);
      } finally { await pool.query('DROP TRIGGER deletion_test_failure'); }
    });
    await t.test('注销结束共同战斗，队友人偶解除战斗锁且不丢失资产', async () => {
      const rollback = new Error('rollback shared battle fixture');
      const cleanup = load('src/game/account-cleanup.service');
      await assert.rejects(transaction(async (c: any) => {
        await c.execute("INSERT INTO monster_templates(id,code,name,constitution,spirit,strength,intelligence,agility,perception,experience) VALUES(1,'cleanup_test','测试怪物',1,1,1,1,1,1,1)");
        await c.execute('INSERT INTO monster_spawns(id,template_id,region_id,pos_x,pos_y,pos_z,current_hp) VALUES(1,1,1,1,1,1,10)');
        await c.execute("INSERT INTO combat_sessions(id,character_id,spawn_id,player_hp,player_mp,cooldowns) VALUES('shared-battle',2,1,10,10,'{}')");
        await c.execute("INSERT INTO combat_members(session_id,character_id,current_hp,current_mp,cooldowns) VALUES('shared-battle',1,10,10,'{}'),('shared-battle',2,10,10,'{}')");
        await c.execute("UPDATE player_automatons SET combat_id='shared-battle' WHERE id IN (1,3)");
        await c.execute("INSERT INTO combat_automatons(session_id,automaton_id,owner_id,state_json) VALUES('shared-battle',1,1,'{}'),('shared-battle',3,2,'{}')");
        const result = await cleanup.removePlayerAccountData(c, 'deletion_test_1');
        assert.equal(result.endedCombats, 1);
        const [sessions] = await c.query('SELECT * FROM combat_sessions');
        const [battles] = await c.query('SELECT * FROM combat_automatons');
        const [pets] = await c.query('SELECT * FROM player_automatons WHERE id=3');
        assert.equal(sessions.length, 0);
        assert.equal(battles.length, 0);
        assert.equal(pets.length, 1);
        assert.equal(pets[0].holder_id, 2);
        assert.equal(pets[0].combat_id, null);
        throw rollback;
      }), error => error === rollback);
      assert.deepEqual(await others(), migratedOthers);
    });
  } finally { await pool.end(); await admin.query('DROP DATABASE ' + database); await admin.end(); }
});
