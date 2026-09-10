import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createConnection, type PoolConnection, type RowDataPacket } from 'mysql2/promise';
import { negotiationSchema, closeLegacyCombatNegotiations } from '../src/database/negotiation';
import { runNegotiation, readNegotiationReplay, closeNegotiationSession, type NegotiationContext, type NegotiationHooks, type NegotiationCommand, type NegotiationView } from '../src/game/negotiation.service';
import { initialNegotiationState } from '../src/game/negotiation-rules';
import { initializeCompanions } from '../src/database/companions';
const { parse } = createRequire(import.meta.url)('yaml');

test('独立临时 MySQL 库：库存、心情继承、保护、黑名单、幂等和事务回滚', { skip: process.env.FF_NEGOTIATION_DB_TEST !== '1' }, async t => {
  const config = parse(readFileSync('alemon.config.yaml', 'utf8')); const db = config.FantasyFinal?.database ?? config.mysql;
  const name = `ff_neg_test_${randomUUID().replaceAll('-', '')}`;
  const c = await createConnection({ host: db.host, port: Number(db.port ?? 3306), user: db.user, password: db.password, charset: 'utf8mb4', connectTimeout: 8000 }) as PoolConnection;
  try {
    await c.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await c.query(`USE \`${name}\``);
    await c.query('CREATE TABLE characters (id BIGINT UNSIGNED PRIMARY KEY,npc_code VARCHAR(100) NULL,level INT DEFAULT 30) ENGINE=InnoDB');
    await c.query('CREATE TABLE monster_spawns (id BIGINT UNSIGNED PRIMARY KEY) ENGINE=InnoDB');
    await c.query('CREATE TABLE item_definitions (id BIGINT UNSIGNED PRIMARY KEY,code VARCHAR(100),name VARCHAR(100),item_type VARCHAR(30),item_category VARCHAR(30),stackable TINYINT,trade_price INT,effect_json JSON) ENGINE=InnoDB');
    await c.query('CREATE TABLE player_inventory (character_id BIGINT UNSIGNED,item_id BIGINT UNSIGNED,quantity INT,trade_bound_quantity INT DEFAULT 0,personal_bound_quantity INT DEFAULT 0,binding_revision INT DEFAULT 0,PRIMARY KEY(character_id,item_id)) ENGINE=InnoDB');
    for (const sql of negotiationSchema) await c.query(sql);
    await c.query('INSERT INTO characters (id) VALUES (1),(2),(3),(4)'); await c.query('INSERT INTO monster_spawns VALUES (1),(2),(3),(4)');
    await c.query('CREATE TABLE player_blessings (character_id BIGINT UNSIGNED,code VARCHAR(64),PRIMARY KEY(character_id,code)) ENGINE=InnoDB');
    await initializeCompanions(c as any);
    await c.query('CREATE TABLE player_opening_stories (character_id BIGINT UNSIGNED PRIMARY KEY,state VARCHAR(20)) ENGINE=InnoDB');
    await c.query('CREATE TABLE monster_templates (id BIGINT UNSIGNED PRIMARY KEY,monster_class VARCHAR(16),code VARCHAR(64),name VARCHAR(64),level INT DEFAULT 1) ENGINE=InnoDB');
    await c.query("INSERT INTO monster_templates VALUES (1,'normal','ball_rabbit','球兔',1)");
    await c.query('ALTER TABLE monster_spawns ADD COLUMN template_id BIGINT UNSIGNED DEFAULT 1,ADD COLUMN level INT DEFAULT 1,ADD COLUMN traits_json JSON NULL');
    await c.query("INSERT INTO item_definitions VALUES (1,'healing_herb','草药','consumable','药剂',1,10,NULL),(2,'beast_bone','兽骨','material','怪材',1,10,NULL),(3,'gear','齿轮','material','基材',1,10,NULL),(4,'forbidden','地图','material','地图',1,10,NULL)");
    await c.query('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (1,1,100),(1,2,100),(1,3,100),(1,4,100),(2,1,100),(3,1,100)');
    const ctx: NegotiationContext = { actorId: 1, leaderId: 1, memberIds: [1], target: { id: 1, code: 'ball_rabbit', name: '球兔' }, drops: [], capacity: 1000 };
    let fights = 0; let rewards = 0; let activations = 0;
    const hooks: NegotiationHooks = { activate: async () => { activations++; return { 1: true }; }, fight: async () => { fights++; return '已开战'; }, settle: async () => { rewards++; return '已结算'; } };
    const tx = async (context: NegotiationContext, command: NegotiationCommand, callbacks = hooks) => {
      await c.beginTransaction(); try { const result = await runNegotiation(c, context, command, callbacks); await c.commit(); return result; } catch (e) { await c.rollback(); throw e; }
    };
    const state = async (id = 1) => { const [rows] = await c.execute<RowDataPacket[]>('SELECT state_json FROM monster_negotiation_lives WHERE spawn_id=?', [id]); return typeof rows[0].state_json === 'string' ? JSON.parse(rows[0].state_json) : rows[0].state_json; };
    let view: NegotiationView;
    await t.test('预览和分页不占用、不扣物品、不增加次数；非法物品回滚首次激活', async () => {
      view = await tx(ctx, { type: 'view' }) as NegotiationView;
      const next = await tx(ctx, { type: 'view', sessionId: view.sessionId, page: 3 }) as NegotiationView;
      assert.equal(next.revision, view.revision); assert.equal(next.text, view.text); assert.equal(activations, 0);
      assert.equal(view.inventory.items.some(item => item.id === 4), false);
      await assert.rejects(tx(ctx, { type: 'gift', sessionId: view.sessionId, revision: view.revision, itemId: 4, quantity: 1 }), /重要物品/);
      const [rows] = await c.query<RowDataPacket[]>('SELECT * FROM negotiation_participants'); assert.equal(rows.length, 0);
    });
    await t.test('连续送喜好只扣一次，旧页重放不会重复扣物品', async () => {
      const command: NegotiationCommand = { type: 'gift', sessionId: view.sessionId, revision: view.revision, itemId: 1, quantity: 1 };
      const first = await tx(ctx, command) as NegotiationView; const replay = await tx(ctx, command);
      assert.deepEqual(first, replay); assert.equal(first.revision, view.revision + 1);
      const [rows] = await c.query<RowDataPacket[]>('SELECT quantity FROM player_inventory WHERE character_id=1 AND item_id=1'); assert.equal(rows[0].quantity, 99);
      view = first;
      for (let i = 0; i < 2; i++) view = await tx(ctx, { ...command, revision: view.revision }) as NegotiationView;
      assert.equal(view.protection, 1); assert.equal((await state()).mood, 30000); assert.equal(fights, 0);
    });
    await t.test('事务中的开战失败会回滚库存、记忆与会话', async () => {
      await c.execute('UPDATE monster_negotiation_memories SET combat_failed=1 WHERE spawn_id=1 AND character_id=1');
      const before = await state();
      await assert.rejects(tx(ctx, { type: 'gift', sessionId: view.sessionId, revision: view.revision, itemId: 1, quantity: 1 }, { ...hooks, fight: async () => { throw new Error('模拟开战回滚'); } }), /模拟开战回滚/);
      assert.deepEqual(await state(), before);
      const [participants] = await c.query<RowDataPacket[]>('SELECT * FROM negotiation_participants'); assert.equal(participants.length, 1);
      await c.execute('UPDATE monster_negotiation_memories SET combat_failed=0 WHERE spawn_id=1 AND character_id=1');
    });
    await t.test('离开后其他玩家继承心情，换回旧成员取最低，不能刷回保护进度', async () => {
      await tx(ctx, { type: 'leave', sessionId: view.sessionId, revision: view.revision });
      const nextCtx = { ...ctx, actorId: 2, leaderId: 2, memberIds: [2] };
      const next = await tx(nextCtx, { type: 'view' }) as NegotiationView;
      assert.equal(next.protection, 1);
      await tx(nextCtx, { type: 'gift', sessionId: next.sessionId, revision: next.revision, itemId: 1, quantity: 1 });
      assert.equal((await state()).mood, 40000);
      await closeNegotiationSession(c, next.sessionId);
      const old = await tx(ctx, { type: 'view' }) as NegotiationView;
      await tx(ctx, { type: 'gift', sessionId: old.sessionId, revision: old.revision, itemId: 1, quantity: 1 });
      assert.equal((await state()).mood, 40000); // 旧成员记忆 3% + 本次 1%。
      await closeNegotiationSession(c, old.sessionId);
    });
    await t.test('失败者加入队伍后先于扣物品与保护直接开战，并记录同队新人', async () => {
      await c.execute('UPDATE monster_negotiation_memories SET combat_failed=1 WHERE spawn_id=1 AND character_id=1');
      const blockedCtx = { ...ctx, actorId: 3, leaderId: 3, memberIds: [1, 3] };
      const result = await tx(blockedCtx, { type: 'view' }); assert.equal(result.kind, 'combat_started');
      const [memory] = await c.query<RowDataPacket[]>('SELECT combat_failed FROM monster_negotiation_memories WHERE spawn_id=1 AND character_id=3'); assert.equal(memory[0].combat_failed, 1);
      const [items] = await c.query<RowDataPacket[]>('SELECT quantity FROM player_inventory WHERE character_id=3 AND item_id=1'); assert.equal(items[0].quantity, 100);
      const stranger = await tx({ ...ctx, actorId: 4, leaderId: 4, memberIds: [4] }, { type: 'view' }); assert.equal(stranger.kind, 'ongoing');
    });
    await t.test('满心情交谈必定成功；结束后的相同请求仍可回放且只结算一次', async () => {
      const fresh = { ...ctx, target: { ...ctx.target, id: 2 } };
      const started = await tx(fresh, { type: 'view' }) as NegotiationView;
      await c.execute('UPDATE monster_negotiation_lives SET state_json=? WHERE spawn_id=2', [JSON.stringify(initialNegotiationState(1000000))]);
      const command: NegotiationCommand = { type: 'talk', sessionId: started.sessionId, revision: started.revision };
      assert.equal((await tx(fresh, command)).kind, 'success'); assert.equal(rewards, 1);
      assert.equal((await readNegotiationReplay(c, 1, command))?.kind, 'success'); assert.equal(rewards, 1);
      await assert.rejects(readNegotiationReplay(c, 2, command), /状态已改变/);
    });
    await t.test('一般拒收不扣库存；厌恶触发保护仍退回、降心情，实际开战也不扣物', async () => {
      const fresh = { ...ctx, target: { ...ctx.target, id: 3 } };
      let current = await tx(fresh, { type: 'view' }) as NegotiationView;
      await c.execute('UPDATE monster_negotiation_lives SET state_json=? WHERE spawn_id=3', [JSON.stringify({ ...initialNegotiationState(100000), protection: 1 })]);
      const stock = async () => { const [rows] = await c.query<RowDataPacket[]>('SELECT * FROM player_inventory WHERE character_id=1 AND item_id IN (2,3) ORDER BY item_id'); return rows; };
      const before = await stock();
      const gift = (itemId: number, quantity = 1): NegotiationCommand => ({ type: 'gift', sessionId: current.sessionId, revision: current.revision, itemId, quantity });
      current = await tx(fresh, gift(3), { ...hooks, random: () => .99 }) as NegotiationView;
      assert.equal(current.kind, 'ongoing'); assert.equal((await state(3)).mood, 100000);
      assert.match(current.text, /对方未收下：齿轮 ×1（仍在背包）/);
      assert.equal(current.protection, 1); assert.deepEqual(await stock(), before);
      const protectedCommand = gift(2);
      current = await tx(fresh, protectedCommand, { ...hooks, random: () => 0 }) as NegotiationView;
      assert.equal(current.kind, 'ongoing'); assert.equal(current.protection, 0); assert.equal((await state(3)).mood, 85000);
      assert.match(current.text, /开战保护生效/); assert.match(current.text, /对方未收下：兽骨/);
      assert.deepEqual(await tx(fresh, protectedCommand), current); assert.deepEqual(await stock(), before);
      await assert.rejects(tx(fresh, gift(3, 101)), /未绑定数量不足/);
      await c.execute('UPDATE player_inventory SET trade_bound_quantity=100 WHERE character_id=1 AND item_id=3');
      await assert.rejects(tx(fresh, gift(3)), /未绑定数量不足/);
      await c.execute('UPDATE player_inventory SET trade_bound_quantity=0 WHERE character_id=1 AND item_id=3');
      const result = await tx(fresh, gift(3), { ...hooks, random: () => 0 });
      assert.equal(result.kind, 'combat_started'); assert.match(result.text, /对方未收下：齿轮/);
      assert.deepEqual(await stock(), before);
      const [memory] = await c.query<RowDataPacket[]>('SELECT combat_failed FROM monster_negotiation_memories WHERE spawn_id=3 AND character_id=1');
      assert.equal(memory[0].combat_failed, 1);
    });
    await t.test('厌恶拒收且无保护时直接开战，保留库存并持久化负心情和失败记录', async () => {
      const fresh = { ...ctx, target: { ...ctx.target, id: 4 } };
      const current = await tx(fresh, { type: 'view' }) as NegotiationView;
      const [before] = await c.query<RowDataPacket[]>('SELECT * FROM player_inventory WHERE character_id=1 AND item_id=2');
      const command: NegotiationCommand = { type: 'gift', sessionId: current.sessionId, revision: current.revision, itemId: 2, quantity: 2 };
      const result = await tx(fresh, command, { ...hooks, random: () => 0 });
      assert.equal(result.kind, 'combat_started'); assert.match(result.text, /对方未收下：兽骨 ×2（仍在背包）/);
      assert.equal((await state(4)).mood, -30000);
      assert.deepEqual(await tx(fresh, command), result);
      const [after] = await c.query<RowDataPacket[]>('SELECT * FROM player_inventory WHERE character_id=1 AND item_id=2');
      assert.deepEqual(after, before);
      const [memory] = await c.query<RowDataPacket[]>('SELECT combat_failed FROM monster_negotiation_memories WHERE spawn_id=4 AND character_id=1');
      assert.equal(memory[0].combat_failed, 1);
    });
    await t.test('禁用旧版实战交涉并释放占用，保留心情记忆和战前会话', async () => {
      const sessionId = randomUUID(); const before = await state();
      await c.execute("INSERT INTO negotiation_sessions (id,spawn_id,owner_id,battle_id,state,members_json,stamina_json,last_text,expires_at) VALUES (?,1,4,?,'active','[4]','{}','旧版停战',DATE_ADD(NOW(),INTERVAL 120 SECOND))", [sessionId, randomUUID()]);
      await c.execute('INSERT INTO negotiation_participants (character_id,session_id) VALUES (4,?)', [sessionId]);
      await closeLegacyCombatNegotiations(c); await closeLegacyCombatNegotiations(c);
      const [sessions] = await c.execute<RowDataPacket[]>('SELECT state FROM negotiation_sessions WHERE id=?', [sessionId]); assert.equal(sessions[0].state, 'closed');
      const [participants] = await c.execute<RowDataPacket[]>('SELECT * FROM negotiation_participants WHERE character_id=4'); assert.equal(participants.length, 0);
      assert.deepEqual(await state(), before);
      const [previews] = await c.query<RowDataPacket[]>("SELECT id FROM negotiation_sessions WHERE owner_id=4 AND battle_id IS NULL AND state='preview'"); assert.ok(previews.length);
      await assert.rejects(tx({ ...ctx, battleId: randomUUID() }, { type: 'view' }), /战斗已经开始/);
    });
    await t.test('G08与随从首次正确赠礼相加后再封顶，重放不重复增益或扣物',async()=>{
      await c.query('INSERT INTO characters (id) VALUES (5)');await c.query('INSERT INTO monster_spawns (id) VALUES (5)');
      await c.query("INSERT INTO player_blessings VALUES (5,'talent_social_01')");
      await c.query("INSERT INTO player_companions (character_id,template_code,name,intimacy,specialty,is_out) VALUES (5,'goblin_vanguard','哥布林伙伴',50,'negotiate',1)");
      await c.query('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (5,1,100)');
      const context={...ctx,actorId:5,leaderId:5,memberIds:[5],target:{...ctx.target,id:5}};
      let page=await tx(context,{type:'view'}) as NegotiationView;assert.match(page.text,/倾听万物/);
      const command:NegotiationCommand={type:'gift',sessionId:page.sessionId,revision:page.revision,itemId:1,quantity:1};
      page=await tx(context,command) as NegotiationView;assert.equal((await state(5)).mood,12500);assert.deepEqual(await tx(context,command),page);
      page=await tx(context,{...command,revision:page.revision}) as NegotiationView;assert.equal((await state(5)).mood,24500);
      page=await tx(context,{...command,revision:page.revision,quantity:30}) as NegotiationView;assert.equal((await state(5)).mood,274500);
      const[inventory]=await c.query<RowDataPacket[]>('SELECT quantity FROM player_inventory WHERE character_id=5 AND item_id=1');assert.equal(inventory[0].quantity,68);
      await tx(context,{type:'leave',sessionId:page.sessionId,revision:page.revision});
    });
  } finally {
    if (/^ff_neg_test_[a-f0-9]{32}$/.test(name) && name !== db.database) await c.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await c.end();
  }
});
