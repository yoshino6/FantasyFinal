import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createConnection, type RowDataPacket } from 'mysql2/promise';
import ts from 'typescript';

test('隔离MySQL：真实穿戴绑定触发器下发放初始装备，失败整批回滚', { skip: process.env.FF_OPENING_DB_TEST !== '1' }, async t => {
  const { parse } = createRequire(import.meta.url)('yaml');
  const config = parse(readFileSync('alemon.config.yaml', 'utf8'));
  const db = config.FantasyFinal?.database ?? config.mysql;
  const name = `ff_opening_test_${randomUUID().replaceAll('-', '')}`;
  const c = await createConnection({ host: db.host, port: Number(db.port ?? 3306), user: db.user, password: db.password, charset: 'utf8mb4', connectTimeout: 8000 });
  let created = false;
  try {
    await c.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); created = true;
    await c.query(`USE \`${name}\``);
    await c.query('CREATE TABLE item_definitions (id BIGINT UNSIGNED PRIMARY KEY,code VARCHAR(64) UNIQUE) ENGINE=InnoDB');
    await c.query("CREATE TABLE player_item_instances (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,character_id BIGINT UNSIGNED,item_id BIGINT UNSIGNED,quality INT,durability INT,durability_max INT,bound_kind VARCHAR(16) DEFAULT 'none',bound_at DATETIME NULL,bound_reason VARCHAR(32) NULL) ENGINE=InnoDB");
    await c.query('CREATE TABLE player_equipment (character_id BIGINT UNSIGNED,slot VARCHAR(20),item_id BIGINT UNSIGNED,instance_id BIGINT UNSIGNED,PRIMARY KEY(character_id,slot),FOREIGN KEY(instance_id) REFERENCES player_item_instances(id)) ENGINE=InnoDB');
    await c.query('CREATE TABLE player_active_devices (character_id BIGINT UNSIGNED,instance_id BIGINT UNSIGNED) ENGINE=InnoDB');
    await c.query('CREATE TABLE player_item_codex (character_id BIGINT UNSIGNED,item_id BIGINT UNSIGNED,PRIMARY KEY(character_id,item_id)) ENGINE=InnoDB');
    await c.query("INSERT INTO item_definitions VALUES (10,'opening_staff'),(11,'opening_clothes')");

    const bindingSource = ts.createSourceFile('binding.ts', readFileSync('src/database/inventory-binding.ts', 'utf8'), ts.ScriptTarget.Latest, true);
    let bindingLoop = '';
    const findBinding = (node: ts.Node) => {
      if (ts.isForOfStatement(node) && node.initializer.getText(bindingSource).includes('[name,table,field]')) bindingLoop = node.getText(bindingSource);
      ts.forEachChild(node, findBinding);
    };
    findBinding(bindingSource); assert.match(bindingLoop, /equipment_bind_insert_v2/);
    const bindingCode = ts.transpileModule(`async function install(pool, names) { ${bindingLoop} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    await new Function(`${bindingCode}; return install;`)()(c, new Set());

    const source = ts.createSourceFile('character.ts', readFileSync('src/game/character.service.ts', 'utf8'), ts.ScriptTarget.Latest, true);
    let equipmentLoop = '';
    const findEquipment = (node: ts.Node) => {
      if (ts.isForOfStatement(node) && node.initializer.getText(source).includes('[itemCode, slot]')) equipmentLoop = node.getText(source);
      ts.forEachChild(node, findEquipment);
    };
    findEquipment(source); assert.match(equipmentLoop, /opening_staff/);
    const code = ts.transpileModule(`async function grant(connection, characterId) { ${equipmentLoop} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    const grant = new Function(`${code}; return grant;`)();
    const tx = async (id: number) => {
      await c.beginTransaction();
      try { await grant(c, id); await c.commit(); } catch (error) { await c.rollback(); throw error; }
    };

    await t.test('复现原SQL的1442错误，确认与实际绑定触发器有关', async () => {
      await c.beginTransaction();
      try {
        const [insert] = await c.execute<any>('INSERT INTO player_item_instances (character_id,item_id) VALUES (99,10)');
        await assert.rejects(c.execute('INSERT INTO player_equipment (character_id,slot,item_id,instance_id) SELECT ?,?,item_id,id FROM player_item_instances WHERE id=?', [99, 'weapon', insert.insertId]), (error: any) => error.errno === 1442);
      } finally { await c.rollback(); }
    });
    await t.test('当前源码为短杖、旅衣各生成一个实例并正确穿戴及绑定', async () => {
      await tx(7);
      const [rows] = await c.execute<RowDataPacket[]>('SELECT e.slot,e.item_id,e.instance_id,i.character_id,i.bound_kind,i.bound_reason FROM player_equipment e JOIN player_item_instances i ON i.id=e.instance_id WHERE e.character_id=7 ORDER BY e.item_id');
      assert.deepEqual(rows.map(r => [r.slot, Number(r.item_id), Number(r.character_id), r.bound_kind, r.bound_reason]), [['weapon', 10, 7, 'personal', 'used'], ['upper', 11, 7, 'personal', 'used']]);
      assert.notEqual(rows[0].instance_id, rows[1].instance_id);
      const [codex] = await c.execute<RowDataPacket[]>('SELECT item_id FROM player_item_codex WHERE character_id=7 ORDER BY item_id');
      assert.deepEqual(codex.map(r => Number(r.item_id)), [10, 11]);
    });
    await t.test('第二件装备缺失时首件实例、穿戴和图鉴全部回滚', async () => {
      await c.execute("DELETE FROM item_definitions WHERE code='opening_clothes'");
      await assert.rejects(tx(8), /初行装备尚未备齐/);
      for (const table of ['player_item_instances', 'player_equipment', 'player_item_codex']) {
        const [rows] = await c.execute<RowDataPacket[]>(`SELECT 1 FROM ${table} WHERE character_id=8`);
        assert.equal(rows.length, 0, table);
      }
    });
  } finally {
    if (created) {
      assert.match(name, /^ff_opening_test_[a-f0-9]{32}$/);
      await c.query(`DROP DATABASE \`${name}\``);
    }
    await c.end();
  }
});
