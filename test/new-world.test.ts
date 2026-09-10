import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';
import { newWorldEquipment, newWorldEquipmentCodes, journeyElixirs, newWorldItems, newWorldWeaponProfile } from '../src/game/new-world.config';
import { initializeNewWorld } from '../src/database/new-world';
import { claimNewWorldOnConnection } from '../src/game/new-world.service';
import { applyBattleElixir } from '../src/game/battle-elixir.service';
import { newWorldFormat } from '../src/game/new-world-message';

test('奖励范围、满品质基础属性与主副手职业匹配', () => {
  assert.deepEqual(newWorldItems[1], [['novice_hp_potion_large', 100], ['novice_mp_potion_large', 100], ['major_experience_elixir', 10], ['major_luck_elixir', 10]]);
  assert.deepEqual(newWorldItems[30], [['sun_gold', 3], ['moon_silver', 10], ['star_copper', 20], ['meteor_iron', 50]]);
  assert.deepEqual(newWorldWeaponProfile('warrior'), ['longsword', 'shield']);
  assert.deepEqual(newWorldWeaponProfile('rogue'), ['dagger', 'fistblade']);
  assert.deepEqual(newWorldWeaponProfile('priest'), ['spellbook', 'orb']);
  assert.deepEqual(newWorldWeaponProfile('warrior', 'elementalist'), ['staff', 'spellbook']);
  assert.throws(() => newWorldEquipmentCodes(10, null), /选择职业/);
  for (const level of [10, 20]) {
    const gear = newWorldEquipmentCodes(level, 'mage').map(code => newWorldEquipment.find(item => item.code === code)!);
    assert.equal(gear.length, 7);
    assert.equal(gear.filter(item => item.subtype === '轻甲').length, 5);
    assert.ok(gear.every(item => item.level === level && item.rarity === (level === 10 ? '普通' : '优秀')));
    const shoulder = gear.find(item => item.category === '头肩')!, upper = gear.find(item => item.category === '上装')!;
    assert.ok(upper.effect.physicalDefense > shoulder.effect.physicalDefense);
  }
  assert.deepEqual(journeyElixirs.map(item => [item.effect.experienceBonusPct ?? item.effect.partyDropBonusPct, item.effect.battleCount]), [[50, 10], [50, 10], [100, 10], [100, 10]]);
});

test('面板只对可领取奖励给出链接，所有链接不直接发送', () => {
  const format = newWorldFormat({ name: '旅人', level: 10, rewards: [
    { level: 1, state: '已领取' }, { level: 10, state: '可领取' }, { level: 20, state: '未解锁' }, { level: 30, state: '未解锁' }
  ] });
  const raw = JSON.stringify(format.value);
  assert.match(raw, /新世界领取 10/);
  assert.doesNotMatch(raw, /新世界领取 (1"|20|30)/);
  assert.doesNotMatch(raw, /"autoEnter":true/);
  assert.match(raw, /"autoEnter":false/);
});

test('隔离MySQL：真实奖励发放、领取防重、失败回滚和秘药效果', { skip: process.env.FF_NEW_WORLD_DB_TEST !== '1' }, async t => {
  const { parse } = createRequire(import.meta.url)('yaml');
  const config = parse(readFileSync('alemon.config.yaml', 'utf8'));
  const db = config.FantasyFinal?.database ?? config.mysql;
  const name = `ff_new_world_${randomUUID().replaceAll('-', '')}`;
  const options = { host: db.host, port: Number(db.port ?? 3306), user: db.user, password: db.password, charset: 'utf8mb4', connectTimeout: 8000 };
  const c = await createConnection(options);
  const tx = async <T>(connection: Connection, work: () => Promise<T>) => {
    await connection.beginTransaction();
    try { const result = await work(); await connection.commit(); return result; }
    catch (error) { await connection.rollback(); throw error; }
  };
  const claim = (user: string, level: number) => tx(c, () => claimNewWorldOnConnection(c as any, user, level));
  let created = false;
  try {
    await c.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); created = true;
    await c.query(`USE \`${name}\``);
    for (const sql of [
      'CREATE TABLE players (id BIGINT UNSIGNED PRIMARY KEY,qq_user_id VARCHAR(64) UNIQUE) ENGINE=InnoDB',
      'CREATE TABLE characters (id BIGINT UNSIGNED PRIMARY KEY,player_id BIGINT UNSIGNED,name VARCHAR(24),level INT,profession_code VARCHAR(32)) ENGINE=InnoDB',
      'CREATE TABLE player_advanced_professions (character_id BIGINT UNSIGNED PRIMARY KEY,profession_code VARCHAR(32)) ENGINE=InnoDB',
      'CREATE TABLE item_definitions (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,code VARCHAR(64) UNIQUE,name VARCHAR(64),description TEXT,obtain_source TEXT,item_type VARCHAR(24),item_category VARCHAR(24),weapon_type VARCHAR(24),rarity VARCHAR(24),required_level INT,weight DECIMAL(8,2),stackable INT,effect_json JSON) ENGINE=InnoDB',
      'CREATE TABLE player_inventory (character_id BIGINT UNSIGNED,item_id BIGINT UNSIGNED,quantity INT,trade_bound_quantity INT,personal_bound_quantity INT,binding_revision INT,PRIMARY KEY(character_id,item_id)) ENGINE=InnoDB',
      'CREATE TABLE player_item_instances (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,character_id BIGINT UNSIGNED,item_id BIGINT UNSIGNED,quality DECIMAL(5,2),durability INT,durability_max INT,bound_kind VARCHAR(16),bound_at DATETIME) ENGINE=InnoDB',
      'CREATE TABLE player_item_codex (character_id BIGINT UNSIGNED,item_id BIGINT UNSIGNED,PRIMARY KEY(character_id,item_id)) ENGINE=InnoDB',
      'CREATE TABLE player_battle_buffs (character_id BIGINT UNSIGNED,buff_code VARCHAR(64),remaining_battles INT,PRIMARY KEY(character_id,buff_code)) ENGINE=InnoDB'
    ]) await c.query(sql);
    await initializeNewWorld(c as any);
    await initializeNewWorld(c as any);
    for (const code of ['novice_hp_potion_large', 'novice_mp_potion_large', 'sun_gold', 'moon_silver', 'star_copper', 'meteor_iron']) {
      await c.execute("INSERT INTO item_definitions (code,name,item_type) VALUES (?,?,'consumable')", [code, code]);
    }
    for (let id = 1; id <= 5; id++) {
      await c.execute('INSERT INTO players VALUES (?,?)', [id, `user${id}`]);
      await c.execute('INSERT INTO characters VALUES (?,?,?,?,?)', [id, id, `旅人${id}`, id === 1 ? 1 : 30, id === 5 ? null : 'warrior']);
    }
    await t.test('1级实际获得全部数量和个人绑定，不能越级、伪造等级或重复领取', async () => {
      await claim('user1', 1);
      const [rows] = await c.query<RowDataPacket[]>('SELECT i.code,p.quantity,p.personal_bound_quantity FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=1');
      assert.deepEqual(Object.fromEntries(rows.map(row => [row.code, row.quantity])), Object.fromEntries(newWorldItems[1]!));
      assert.ok(rows.every(row => row.personal_bound_quantity === row.quantity));
      await assert.rejects(claim('user1', 1), /已经领取/);
      await assert.rejects(claim('user1', 10), /达到10级/);
      await assert.rejects(claim('user1', 15), /请选择/);
      await assert.rejects(claim('unknown', 1), /创建角色/);
    });
    await t.test('高等级补领七件装备，当前跨职业二转决定武器，品质与耐久都是100', async () => {
      await c.execute("INSERT INTO player_advanced_professions VALUES (2,'elementalist')");
      await claim('user2', 10); await claim('user2', 20);
      const [rows] = await c.query<RowDataPacket[]>('SELECT i.required_level,i.rarity,i.weapon_type,p.quality,p.durability,p.bound_kind FROM player_item_instances p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=2');
      assert.equal(rows.length, 14);
      for (const level of [10, 20]) {
        const gear = rows.filter(row => row.required_level === level);
        assert.equal(gear.length, 7);
        assert.equal(gear.filter(row => row.weapon_type === '轻甲').length, 5);
        assert.deepEqual(gear.filter(row => row.weapon_type !== '轻甲').map(row => row.weapon_type).sort(), ['法书', '法杖'].sort());
        assert.ok(gear.every(row => row.rarity === (level === 10 ? '普通' : '优秀') && Number(row.quality) === 100 && row.durability === 100 && row.bound_kind === 'personal'));
      }
      await assert.rejects(claim('user5', 10), /选择职业/);
    });
    await t.test('中途缺物品配置，前面发放及领取标记全部回滚，修复后可领', async () => {
      await c.query("UPDATE item_definitions SET code='missing_meteor' WHERE code='meteor_iron'");
      await assert.rejects(claim('user3', 30), /配置尚未备齐/);
      const [inventory] = await c.query<RowDataPacket[]>('SELECT * FROM player_inventory WHERE character_id=3');
      const [claims] = await c.query<RowDataPacket[]>('SELECT * FROM player_new_world_claims WHERE character_id=3');
      const [codex] = await c.query<RowDataPacket[]>('SELECT * FROM player_item_codex WHERE character_id=3');
      assert.equal(inventory.length + claims.length + codex.length, 0);
      await c.query("UPDATE item_definitions SET code='meteor_iron' WHERE code='missing_meteor'");
      await claim('user3', 30);
      const [rows] = await c.query<RowDataPacket[]>('SELECT i.code,p.quantity FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=3');
      assert.deepEqual(Object.fromEntries(rows.map(row => [row.code, row.quantity])), Object.fromEntries(newWorldItems[30]!));
    });
    await t.test('两个同时领取请求只发一份，其他角色不受影响', async () => {
      const workers = await Promise.all([createConnection({ ...options, database: name }), createConnection({ ...options, database: name })]);
      try {
        const results = await Promise.allSettled(workers.map(worker => tx(worker, () => claimNewWorldOnConnection(worker as any, 'user4', 1))));
        assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
        assert.match(String((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason), /已经领取/);
      } finally { await Promise.all(workers.map(worker => worker.end())); }
      const [rows] = await c.query<RowDataPacket[]>('SELECT character_id,SUM(quantity) AS total FROM player_inventory WHERE character_id IN (1,4,5) GROUP BY character_id ORDER BY character_id');
      assert.deepEqual(rows.map(row => [row.character_id, Number(row.total)]), [[1, 220], [4, 220]]);
    });
    await t.test('中大经验及幸运秘药实际写入50/100加成和10场，弱药不覆盖强药', async () => {
      for (const item of journeyElixirs) assert.equal((await tx(c, () => applyBattleElixir(c as any, 1, item.effect))).consumed, true);
      assert.equal((await tx(c, () => applyBattleElixir(c as any, 1, journeyElixirs[0].effect))).consumed, false);
      const [rows] = await c.query<RowDataPacket[]>('SELECT buff_code,remaining_battles FROM player_battle_buffs WHERE character_id=1 ORDER BY buff_code');
      assert.deepEqual(rows.map(row => [row.buff_code, row.remaining_battles]), [['alchemy_drop_100', 10], ['alchemy_exp_100', 10]]);
    });
  } finally {
    if (created) await c.query(`DROP DATABASE \`${name}\``);
    await c.end();
  }
});
