import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import * as alemon from 'alemonjs';
import { createConnection, type PoolConnection, type RowDataPacket } from 'mysql2/promise';
import { negotiationSchema } from '../src/database/negotiation';
import { initialNegotiationState } from '../src/game/negotiation-rules';
const require = createRequire(import.meta.url); const { parse } = require('yaml');

test('真实冒险适配器：独立克隆库中的交涉、开战先手、结算和战前边界', { skip: process.env.FF_NEGOTIATION_ADVENTURE_TEST !== '1' }, async t => {
  const config = parse(readFileSync('alemon.config.yaml', 'utf8')); const db = config.FantasyFinal?.database ?? config.mysql;
  assert.match(db.database, /^[A-Za-z0-9_]+$/);
  const name = `ff_neg_game_${randomUUID().replaceAll('-', '')}`;
  const c = await createConnection({ host: db.host, port: Number(db.port ?? 3306), user: db.user, password: db.password, charset: 'utf8mb4', connectTimeout: 8000 }) as PoolConnection;
  try {
    await c.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await c.query(`USE \`${name}\``);
    const [tables] = await c.execute<RowDataPacket[]>('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=\'BASE TABLE\'', [db.database]);
    for (const row of tables) { assert.match(row.name, /^[A-Za-z0-9_]+$/); await c.query(`CREATE TABLE \`${name}\`.\`${row.name}\` LIKE \`${db.database}\`.\`${row.name}\``); }
    for (const row of tables.filter(row => /definition|^monster_templates$|^map_regions$|^skill_effects$/.test(row.name))) await c.query(`INSERT INTO \`${name}\`.\`${row.name}\` SELECT * FROM \`${db.database}\`.\`${row.name}\``);
    for (const sql of negotiationSchema) await c.query(sql);
    const [source] = await c.query<RowDataPacket[]>(`SELECT id,player_id FROM \`${db.database}\`.characters WHERE npc_code IS NULL ORDER BY id LIMIT 1`); assert.ok(source[0]);
    const id = Number(source[0].id); const user = `neg_${randomUUID().slice(0, 16)}`;
    await c.execute(`INSERT INTO players SELECT * FROM \`${db.database}\`.players WHERE id=?`, [source[0].player_id]);
    await c.execute(`INSERT INTO characters SELECT * FROM \`${db.database}\`.characters WHERE id=?`, [id]);
    await c.execute('UPDATE players SET qq_user_id=? WHERE id=?', [user, source[0].player_id]);
    await c.execute("UPDATE characters SET name='交涉验收员',npc_code=NULL,activity_status='active',rest_started_at=NULL,current_hp=hp_max,current_mp=mp_max,stamina=120,pos_x=0,pos_y=0,pos_z=0 WHERE id=?", [id]);
    const [chars] = await c.execute<RowDataPacket[]>('SELECT current_region_id FROM characters WHERE id=?', [id]);
    const [template] = await c.query<RowDataPacket[]>("SELECT id FROM monster_templates WHERE code='ball_rabbit'"); assert.ok(template[0]);
    const [herb] = await c.query<RowDataPacket[]>("SELECT id FROM item_definitions WHERE code='healing_herb'");
    await c.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1000)', [id, herb[0].id]);
    const cache = new Map<string, any>();
    const load = (relative: string): any => {
      const path = resolve(relative.endsWith('.ts') ? relative : relative + '.ts'); if (cache.has(path)) return cache.get(path).exports;
      const module = { exports: {} as any }; cache.set(path, module);
      const local = (key: string): any => key === 'alemonjs' ? alemon : key.endsWith('/pool') ? { getPool: async () => c, withTransaction: async (work: any) => { await c.beginTransaction(); try { const result = await work(c); await c.commit(); return result; } catch (e) { await c.rollback(); throw e; } } }
        : key.startsWith('.') ? load(resolve(dirname(path), key)) : require(key);
      const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
      new Function('require', 'module', 'exports', compiled)(local, module, module.exports); return module.exports;
    };
    const game = load('src/game/adventure.service.ts');
    const spawn = async () => { const [row] = await c.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,current_hp) VALUES (?,?,0,0,0,1,999)', [template[0].id, chars[0].current_region_id]); return Number(row.insertId); };
    const stamina = async () => Number((await c.execute<RowDataPacket[]>('SELECT stamina FROM characters WHERE id=?', [id]))[0][0].stamina);
    await t.test('预览零消耗；送礼只扣一次体力，角色和队伍不能在交涉中变更', async () => {
      const monster = await spawn(); const before = await stamina();
      const view = await game.negotiateEncounter(user, monster, { type: 'view' }); assert.equal(view.kind, 'ongoing'); assert.equal(await stamina(), before);
      const gift = await game.negotiateEncounter(user, monster, { type: 'gift', sessionId: view.sessionId, revision: view.revision, itemId: Number(herb[0].id), quantity: 1 });
      assert.equal(gift.kind, 'ongoing'); assert.equal(await stamina(), before - 1);
      await assert.rejects(game.createParty(user), /交涉/); await assert.rejects(game.startRest(user), /交涉/);
      await game.negotiateEncounter(user, monster, { type: 'leave', sessionId: gift.sessionId, revision: gift.revision });
      await c.execute('UPDATE monster_spawns SET defeated_at=NOW() WHERE id=?', [monster]);
    });
    await t.test('已经付费的交涉转为开战，敌方完整先手，不能再次扣体力', async () => {
      const monster = await spawn(); const before = await stamina();
      const view = await game.negotiateEncounter(user, monster, { type: 'view' });
      const gift = await game.negotiateEncounter(user, monster, { type: 'gift', sessionId: view.sessionId, revision: view.revision, itemId: Number(herb[0].id), quantity: 1 });
      const result = await game.negotiateEncounter(user, monster, { type: 'fight', sessionId: gift.sessionId, revision: gift.revision });
      assert.equal(result.kind, 'combat_started');
      await assert.rejects(game.negotiateEncounter(user, monster, { type: 'gift', sessionId: view.sessionId, revision: view.revision, itemId: Number(herb[0].id), quantity: 1 }), /战斗已经开始/); assert.equal(await stamina(), before - 1);
      const [battle] = await c.query<RowDataPacket[]>("SELECT id,turn_no,state FROM combat_sessions WHERE state='active' LIMIT 1");
      assert.equal(battle[0].state, 'active'); assert.equal(Number(battle[0].turn_no), 2);
      const [memories] = await c.execute<RowDataPacket[]>('SELECT combat_failed FROM monster_negotiation_memories WHERE spawn_id=?', [monster]); assert.ok(memories.every(row => !row.combat_failed));
      await c.execute("UPDATE combat_sessions SET state='escaped' WHERE id=?", [battle[0].id]); await c.execute('UPDATE monster_spawns SET defeated_at=NOW() WHERE id=?', [monster]);
    });
    await t.test('满心情和平结算可重放一次；战前交涉超时仅释放占用', async () => {
      const monster = await spawn(); const view = await game.negotiateEncounter(user, monster, { type: 'view' });
      await c.execute('UPDATE monster_negotiation_lives SET state_json=? WHERE spawn_id=?', [JSON.stringify(initialNegotiationState(1000000)), monster]);
      const command = { type: 'talk', sessionId: view.sessionId, revision: view.revision };
      const result = await game.negotiateEncounter(user, monster, command); assert.equal(result.kind, 'success');
      assert.deepEqual(await game.negotiateEncounter(user, monster, command), result);
      const [paid] = await c.execute<RowDataPacket[]>('SELECT * FROM monster_reward_settlements WHERE spawn_id=?', [monster]); assert.equal(paid.length, 1);
      const second = await spawn();
      const parley = await game.negotiateEncounter(user, second, { type: 'view' });
      const gift = await game.negotiateEncounter(user, second, { type: 'gift', sessionId: parley.sessionId, revision: parley.revision, itemId: Number(herb[0].id), quantity: 1 });
      assert.equal(gift.kind, 'ongoing');
      await c.execute('UPDATE negotiation_sessions SET expires_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id=?', [gift.sessionId]);
      await game.settleInactiveCombatSessions(); await game.settleInactiveCombatSessions();
      const [battles] = await c.query<RowDataPacket[]>("SELECT id FROM combat_sessions WHERE state='active'"); assert.equal(battles.length, 0);
      const [active] = await c.execute<RowDataPacket[]>('SELECT * FROM negotiation_participants WHERE session_id=?', [gift.sessionId]); assert.equal(active.length, 0);
      const next = await game.negotiateEncounter(user, second, { type: 'view' }); assert.equal(next.kind, 'ongoing');
      await c.execute('UPDATE monster_spawns SET defeated_at=NOW() WHERE id=?', [second]);
    });
    await t.test('开战后预览、翻页、旧交付及交谈全部拒绝；战前和平与后续击杀不重复发奖', async () => {
      const first = await spawn(); const second = await spawn();
      const old = await game.negotiateEncounter(user, first, { type: 'view' });
      const [stock] = await c.execute<RowDataPacket[]>('SELECT quantity FROM player_inventory WHERE character_id=? AND item_id=?', [id, herb[0].id]);
      await game.chooseTarget(user, first);
      const commands = [
        { type: 'view' }, { type: 'view', sessionId: old.sessionId, page: 2 },
        { type: 'talk', sessionId: old.sessionId, revision: old.revision },
        { type: 'gift', sessionId: old.sessionId, revision: old.revision, itemId: Number(herb[0].id), quantity: 1 },
        { type: 'leave', sessionId: old.sessionId, revision: old.revision }
      ];
      for (const command of commands) await assert.rejects(game.negotiateEncounter(user, first, command), /战斗已经开始/);
      const [after] = await c.execute<RowDataPacket[]>('SELECT quantity FROM player_inventory WHERE character_id=? AND item_id=?', [id, herb[0].id]); assert.deepEqual(after, stock);
      const [turn] = await c.query<RowDataPacket[]>("SELECT turn_no FROM combat_sessions WHERE state='active'"); assert.equal(Number(turn[0].turn_no), 1);
      const [actions] = await c.execute<RowDataPacket[]>('SELECT * FROM negotiation_actions WHERE session_id=?', [old.sessionId]); assert.equal(actions.length, 0);
      await c.query("UPDATE combat_sessions SET state='escaped' WHERE state='active'");
      const active = await game.negotiateEncounter(user, first, { type: 'view' });
      await c.execute('UPDATE monster_negotiation_lives SET state_json=? WHERE spawn_id=?', [JSON.stringify(initialNegotiationState(1000000)), first]);
      const command = { type: 'talk', sessionId: active.sessionId, revision: active.revision };
      assert.equal((await game.negotiateEncounter(user, first, command)).kind, 'success');
      await game.chooseTarget(user, second);
      await c.execute('UPDATE monster_spawns SET current_hp=1 WHERE id=?', [second]);
      await c.execute('UPDATE characters SET strength=10000,physical_attack=10000,accuracy=100000 WHERE id=?', [id]);
      let end: any;
      for (let i = 0; i < 5; i++) { end = await game.combatAction(user, 'attack'); if (end.ended) break; }
      assert.ok(end.ended); assert.equal(end.settlement.kind, 'victory');
      const [ledger] = await c.execute<RowDataPacket[]>('SELECT spawn_id,channel FROM monster_reward_settlements WHERE spawn_id IN (?,?)', [first, second]);
      assert.equal(ledger.find(row => Number(row.spawn_id) === first)?.channel, 'negotiation'); assert.equal(ledger.find(row => Number(row.spawn_id) === second)?.channel, 'combat');
    });
    await t.test('四名真实队员的 +100 幸运在实际交涉掉落中乘算，可产生额外批次', async () => {
      const partyId = await game.createParty(user);
      const [playerRows] = await c.execute<RowDataPacket[]>('SELECT * FROM players WHERE id=?', [source[0].player_id]);
      const [characterRows] = await c.execute<RowDataPacket[]>('SELECT * FROM characters WHERE id=?', [id]);
      const memberIds = [id];
      for (let index = 1; index <= 3; index++) {
        const newId = 9000000 + index; const player = { ...playerRows[0], id: newId, qq_user_id: `neg_peer_${index}` };
        const character = { ...characterRows[0], id: newId, player_id: newId, game_id: 19000000 + index, name: `验收队员${index}`, stamina: 120 };
        const insert = async (table: string, row: Record<string, unknown>) => {
          const keys = Object.keys(row); const values = keys.map(key => row[key] !== null && typeof row[key] === 'object' && !(row[key] instanceof Date) ? JSON.stringify(row[key]) : row[key]);
          await c.execute(`INSERT INTO ${table} (${keys.map(key => `\`${key}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, values);
        };
        await insert('players', player); await insert('characters', character);
        await c.execute('INSERT INTO party_members (party_id,character_id) VALUES (?,?)', [partyId, newId]); memberIds.push(newId);
      }
      for (const member of memberIds) await c.execute('INSERT INTO character_hidden_attributes (character_id,luck,charm) VALUES (?,100,0) ON DUPLICATE KEY UPDATE luck=100,charm=0', [member]);
      await c.execute('UPDATE monster_templates SET drops_json=? WHERE id=?', [JSON.stringify([{ code: 'magic_unit', chance: 1, quantity: 1 }]), template[0].id]);
      const monster = await spawn(); const view = await game.negotiateEncounter(user, monster, { type: 'view' });
      await c.execute('UPDATE monster_negotiation_lives SET state_json=? WHERE spawn_id=?', [JSON.stringify(initialNegotiationState(1000000)), monster]);
      assert.equal((await game.negotiateEncounter(user, monster, { type: 'talk', sessionId: view.sessionId, revision: view.revision })).kind, 'success');
      const [loot] = await c.query<RowDataPacket[]>("SELECT SUM(p.quantity) AS total FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE i.code='magic_unit'");
      assert.ok([2, 3].includes(Number(loot[0].total)), '基础 20% × 四人原加成 2.5 × 满心情 2 × 幸运 1.2⁴ = 2.0736 批');
    });
  } finally {
    if (/^ff_neg_game_[a-f0-9]{32}$/.test(name) && name !== db.database) await c.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await c.end();
  }
});
