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
    for (const row of tables.filter(row => /definition|^monster_templates$|^map_regions$|^map_npcs$|^skill_effects$/.test(row.name))) await c.query(`INSERT INTO \`${name}\`.\`${row.name}\` SELECT * FROM \`${db.database}\`.\`${row.name}\``);
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
    const cache = new Map<string, any>(); let rollbackNextTransaction = false;
    const load = (relative: string): any => {
      const path = resolve(relative.endsWith('.ts') ? relative : relative + '.ts'); if (cache.has(path)) return cache.get(path).exports;
      const module = { exports: {} as any }; cache.set(path, module);
      const local = (key: string): any => key === 'alemonjs' ? alemon : key.endsWith('/pool') ? { getPool: async () => c, withTransaction: async (work: any) => { await c.beginTransaction(); try { const result = await work(c); const events = load('src/game/achievement-events.ts').takeAchievementEvents(c); const dirty = await load('src/game/achievement.service.ts').flushAchievements(c, events); for (const characterId of dirty) await load('src/game/character.service.ts').recalculateCharacterStats(c, characterId); if (rollbackNextTransaction) { rollbackNextTransaction = false; throw new Error('验收回滚'); } await c.commit(); return result; } catch (e) { await c.rollback(); throw e; } finally { load('src/game/achievement-events.ts').takeAchievementEvents(c); } } }
        : key.startsWith('.') ? load(resolve(dirname(path), key)) : require(key);
      const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
      new Function('require', 'module', 'exports', compiled)(local, module, module.exports); return module.exports;
    };
    const game = load('src/game/adventure.service.ts');
    const spawn = async (templateId = Number(template[0].id)) => { const [row] = await c.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,current_hp) VALUES (?,?,0,0,0,1,999)', [templateId, chars[0].current_region_id]); return Number(row.insertId); };
    const stamina = async () => Number((await c.execute<RowDataPacket[]>('SELECT stamina FROM characters WHERE id=?', [id]))[0][0].stamina);
    await t.test('F03/F04/F06：拒礼不扣库存，20个真实生命结算的回滚与重试不重复记账', async () => {
      const [refusedGift] = await c.query<RowDataPacket[]>("SELECT id FROM item_definitions WHERE code='beast_tendon'"); assert.ok(refusedGift[0]);
      const [templates] = await c.query<RowDataPacket[]>("SELECT id,code FROM monster_templates WHERE monster_class='normal' AND code<>'ball_rabbit' ORDER BY id LIMIT 4"); assert.equal(templates.length, 4);
      await c.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1000)', [id, refusedGift[0].id]);
      await c.execute('UPDATE characters SET stamina=120,current_hp=hp_max,current_mp=mp_max WHERE id=?', [id]);
      const completed = async (achievement: string) => Number((await c.execute<RowDataPacket[]>('SELECT COUNT(*) AS n FROM achievement_completions WHERE identity_key=? AND achievement_id=?', [user, achievement]))[0][0].n);
      const progress = async (metric: string) => {
        const [rows] = await c.execute<RowDataPacket[]>('SELECT value_json FROM achievement_progress WHERE identity_key=? AND life_key=? AND metric=?', [user, '', metric]);
        const value = typeof rows[0]?.value_json === 'string' ? JSON.parse(rows[0].value_json) : rows[0]?.value_json;
        return Number(value?.count ?? 0);
      };
      const peaceful = async (templateId: number) => {
        const monster = await spawn(templateId); const view = await game.negotiateEncounter(user, monster, { type: 'view' }); assert.equal(view.kind, 'ongoing');
        await c.execute('UPDATE monster_negotiation_lives SET state_json=? WHERE spawn_id=?', [JSON.stringify(initialNegotiationState(1000000)), monster]);
        const command = { type: 'talk', sessionId: view.sessionId, revision: view.revision };
        return { monster, command, result: await game.negotiateEncounter(user, monster, command) };
      };

      const refusedMonster = await spawn(); const refusalView = await game.negotiateEncounter(user, refusedMonster, { type: 'view' }); assert.equal(refusalView.kind, 'ongoing');
      await c.execute('UPDATE monster_negotiation_lives SET state_json=? WHERE spawn_id=?', [JSON.stringify(initialNegotiationState(1000000)), refusedMonster]);
      const stockBefore = Number((await c.execute<RowDataPacket[]>('SELECT quantity FROM player_inventory WHERE character_id=? AND item_id=?', [id, refusedGift[0].id]))[0][0].quantity);
      const refusal = await game.negotiateEncounter(user, refusedMonster, { type: 'gift', sessionId: refusalView.sessionId, revision: refusalView.revision, itemId: Number(refusedGift[0].id), quantity: 1 });
      assert.equal(refusal.kind, 'ongoing'); assert.equal(Number((await c.execute<RowDataPacket[]>('SELECT quantity FROM player_inventory WHERE character_id=? AND item_id=?', [id, refusedGift[0].id]))[0][0].quantity), stockBefore);
      const refusalCommand = { type: 'talk', sessionId: refusal.sessionId, revision: refusal.revision };
      const refusalSuccess = await game.negotiateEncounter(user, refusedMonster, refusalCommand); assert.equal(refusalSuccess.kind, 'success');
      assert.equal(await completed('ACH_F06'), 1); assert.equal(await progress('ACH_F03'), 1); assert.equal(await progress('ACH_F04'), 1);
      assert.deepEqual(await game.negotiateEncounter(user, refusedMonster, refusalCommand), refusalSuccess);
      assert.equal(await completed('ACH_F06'), 1);

      for (const current of templates.slice(0, 3)) assert.equal((await peaceful(Number(current.id))).result.kind, 'success');
      assert.equal(await completed('ACH_F03'), 0); assert.equal(await progress('ACH_F03'), 4);
      assert.equal((await peaceful(Number(templates[3].id))).result.kind, 'success');
      assert.equal(await completed('ACH_F03'), 1); assert.equal(await progress('ACH_F03'), 5); assert.equal(await completed('ACH_F04'), 0); assert.equal(await progress('ACH_F04'), 5);
      for (let index = 0; index < 14; index++) assert.equal((await peaceful(Number(templates[0].id))).result.kind, 'success');
      assert.equal(await completed('ACH_F04'), 0); assert.equal(await progress('ACH_F04'), 19);
      const final = await peaceful(Number(templates[0].id));
      // 上一步已提交；撤销最后一次结算时，必须连同怪物奖励与成就事件一起回滚。
      const rollbackMonster = await spawn(Number(templates[0].id)); const rollbackView = await game.negotiateEncounter(user, rollbackMonster, { type: 'view' });
      await c.execute('UPDATE monster_negotiation_lives SET state_json=? WHERE spawn_id=?', [JSON.stringify(initialNegotiationState(1000000)), rollbackMonster]);
      const rollbackCommand = { type: 'talk', sessionId: rollbackView.sessionId, revision: rollbackView.revision }; rollbackNextTransaction = true;
      await assert.rejects(game.negotiateEncounter(user, rollbackMonster, rollbackCommand), /验收回滚/);
      assert.equal(await completed('ACH_F04'), 1); assert.equal(await progress('ACH_F04'), 20);
      const [rolledBackReward] = await c.execute<RowDataPacket[]>('SELECT * FROM monster_reward_settlements WHERE spawn_id=?', [rollbackMonster]); assert.equal(rolledBackReward.length, 0);
      const replayed = await game.negotiateEncounter(user, rollbackMonster, rollbackCommand); assert.equal(replayed.kind, 'success');
      assert.equal(await completed('ACH_F04'), 1); assert.equal(await progress('ACH_F04'), 21);
      assert.deepEqual(await game.negotiateEncounter(user, rollbackMonster, rollbackCommand), replayed);
      assert.equal(await completed('ACH_F04'), 1); assert.equal(await completed('ACH_F06'), 1); assert.equal(final.result.kind, 'success');
    });
    await t.test('F07/F08/F09：在场有效闲聊的级别、人数、每日上限、回滚与重试', async () => {
      const [allNpcs] = await c.query<RowDataPacket[]>('SELECT code,region_id,pos_x,pos_y,pos_z FROM map_npcs ORDER BY code');
      const npcs = allNpcs.filter((npc, index) => allNpcs.findIndex(candidate => String(candidate.code) === String(npc.code)) === index).slice(0, 11);
      assert.equal(npcs.length, 11);
      const completed = async (achievement: string) => Number((await c.execute<RowDataPacket[]>('SELECT COUNT(*) AS n FROM achievement_completions WHERE identity_key=? AND achievement_id=?', [user, achievement]))[0][0].n);
      const progress = async (metric: string, lifeKey = '') => {
        const [rows] = await c.execute<RowDataPacket[]>('SELECT value_json FROM achievement_progress WHERE identity_key=? AND life_key=? AND metric=?', [user, lifeKey, metric]);
        const value = typeof rows[0]?.value_json === 'string' ? JSON.parse(rows[0].value_json) : rows[0]?.value_json;
        return Number(value?.count ?? 0);
      };
      const atNpc = async (npc: RowDataPacket) => {
        await c.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=?,activity_status=\'active\' WHERE id=?', [npc.region_id, npc.pos_x, npc.pos_y, npc.pos_z, id]);
        return game.addNpcAffinity(user, String(npc.code), 'chat');
      };
      const seedNearSecondRank = async (npc: RowDataPacket, dailyChatCount = 0) => c.execute(`INSERT INTO player_npc_affinity(character_id,npc_code,affinity,daily_date,daily_interactions,daily_chat_count)
        VALUES (?,?,195,CURDATE(),0,?) ON DUPLICATE KEY UPDATE affinity=VALUES(affinity),daily_date=VALUES(daily_date),daily_interactions=0,daily_chat_count=VALUES(daily_chat_count)`, [id, npc.code, dailyChatCount]);

      await seedNearSecondRank(npcs[0], 3);
      assert.equal((await atNpc(npcs[0])).affinity, 195);
      assert.equal(await completed('ACH_F07'), 0); assert.equal(await completed('ACH_F09'), 0);
      await c.execute('UPDATE player_npc_affinity SET daily_date=DATE_SUB(CURDATE(),INTERVAL 1 DAY),daily_chat_count=0 WHERE character_id=? AND npc_code=?', [id, npcs[0].code]);
      for (const npc of npcs.slice(0, 3)) {
        if (npc !== npcs[0]) await seedNearSecondRank(npc);
        assert.equal((await atNpc(npc)).affinity, 200);
      }
      assert.equal(await completed('ACH_F07'), 1); assert.equal(await completed('ACH_F08'), 1);
      assert.equal(await progress('ACH_F07', String(id)), 3); assert.equal(await progress('ACH_F08', String(id)), 3); assert.equal(await progress('ACH_F09'), 3);
      for (const npc of npcs.slice(3, 10)) await atNpc(npc);
      assert.equal(await progress('ACH_F09'), 10); assert.equal(await completed('ACH_F09'), 1);
      await atNpc(npcs[0]); assert.equal(await progress('ACH_F09'), 10);
      rollbackNextTransaction = true; await assert.rejects(atNpc(npcs[10]), /验收回滚/);
      assert.equal(await progress('ACH_F09'), 10); assert.equal(await completed('ACH_F09'), 1);
      await atNpc(npcs[10]); assert.equal(await progress('ACH_F09'), 11); assert.equal(await completed('ACH_F09'), 1);
      await c.execute("UPDATE characters SET current_region_id=?,pos_x=0,pos_y=0,pos_z=0 WHERE id=?", [chars[0].current_region_id, id]);
    });
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
    await t.test('四人战斗的材料堆叠和实例装备逐件分配，生成包不重复且实际库存与结算一致', async () => {
      const rules = load('src/game/negotiation-rules.ts'); const talent = load('src/game/talent-drops.ts');
      const originalRecipient = rules.weightedRecipient; const originalPack = talent.talentDropPack;
      let draws = 0; const generated: Array<{ code: string; quantity: number }> = []; let packs = 0;
      // 控制归属抽签遍历四个权重区间，仍运行实际权重算法和实际掉落生成，避免概率性测试。
      rules.weightedRecipient = (members: any[], luck: (member: any) => number) => originalRecipient(members, luck, () => [0.05, .3, .55, .8][draws++ % 4]);
      talent.talentDropPack = async (...args: any[]) => { packs++; const result = await originalPack(...args); generated.push(...result); return result; };
      try {
        const [equipment] = await c.query<RowDataPacket[]>("SELECT id,code FROM item_definitions WHERE item_type='equipment' ORDER BY id LIMIT 1"); assert.ok(equipment[0]);
        const codes = ['magic_unit', 'healing_herb', String(equipment[0].code)];
        const [items] = await c.execute<RowDataPacket[]>(`SELECT id,code FROM item_definitions WHERE code IN (${codes.map(() => '?').join(',')})`, codes);
        const itemByCode = new Map(items.map(item => [String(item.code), Number(item.id)]));
        const [peers] = await c.execute<RowDataPacket[]>('SELECT character_id FROM party_members WHERE party_id=(SELECT party_id FROM party_members WHERE character_id=?) ORDER BY character_id', [id]);
        const ids = peers.map(peer => Number(peer.character_id)); assert.equal(ids.length, 4);
        const inventory = async () => (await c.query<RowDataPacket[]>('SELECT character_id,item_id,quantity FROM player_inventory'))[0];
        const instances = async () => (await c.query<RowDataPacket[]>('SELECT character_id,item_id,COUNT(*) AS quantity FROM player_item_instances GROUP BY character_id,item_id'))[0];
        const before = [...await inventory(), ...await instances()];
        await c.execute('UPDATE monster_templates SET drops_json=? WHERE id=?', [JSON.stringify(codes.map(code => ({ code, chance: 1, quantity: 8 }))), template[0].id]);
        await c.query('UPDATE characters SET stamina=120,current_hp=hp_max');
        const monster = await spawn(); await game.chooseTarget(user, monster);
        await c.execute('UPDATE monster_spawns SET current_hp=1 WHERE id=?', [monster]);
        // 让唯一一次玩家行动直接结束战斗，避免其他队员等待影响分配测试。
        await c.execute("UPDATE combat_members SET pending_action=? WHERE session_id IN (SELECT id FROM combat_sessions WHERE state='active') AND character_id<>?", [JSON.stringify({ type: 'attack' }), id]);
        let end: any;
        for (let i = 0; i < 5; i++) {
          end = await game.combatAction(user, 'attack'); if (end.ended) break;
          await c.execute("UPDATE combat_members SET pending_action=? WHERE session_id IN (SELECT id FROM combat_sessions WHERE state='active') AND character_id<>?", [JSON.stringify({ type: 'attack' }), id]);
        }
        assert.ok(end.ended); assert.equal(end.settlement.kind, 'victory'); assert.equal(packs, 1);
        const after = [...await inventory(), ...await instances()];
        const amount = (rows: RowDataPacket[], owner: number, item: number) => rows.filter(row => Number(row.character_id) === owner && Number(row.item_id) === item).reduce((sum, row) => sum + Number(row.quantity), 0);
        for (const code of codes) {
          const itemId = itemByCode.get(code)!;
          const total = generated.filter(drop => drop.code === code).reduce((sum, drop) => sum + drop.quantity, 0); assert.ok(total >= 8);
          const assigned = ids.map(owner => amount(after, owner, itemId) - amount(before, owner, itemId));
          assert.equal(assigned.reduce((sum, value) => sum + value, 0), total);
          assert.ok(assigned.every(value => value > 0), `${code} 应按受控抽签分给四人，而非固定整包接收者`);
        }
        const [names] = await c.query<RowDataPacket[]>('SELECT id,name FROM characters');
        for (const owner of ids) {
          const summary = end.settlement.members.find((member: any) => member.name === names.find(row => Number(row.id) === owner)?.name);
          const delta = codes.reduce((sum, code) => sum + amount(after, owner, itemByCode.get(code)!) - amount(before, owner, itemByCode.get(code)!), 0);
          assert.equal(summary.drops.reduce((sum: number, drop: any) => sum + drop.quantity, 0), delta);
        }
      } finally { rules.weightedRecipient = originalRecipient; talent.talentDropPack = originalPack; }
    });
  } finally {
    if (/^ff_neg_game_[a-f0-9]{32}$/.test(name) && name !== db.database) await c.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await c.end();
  }
});
