import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real settlement function against a deterministic SQL/state double.
// No player database or game initialization is loaded by this regression test.
const source = readFileSync(new URL('../src/game/adventure.service.ts', import.meta.url), 'utf8');
const rules = source.slice(source.indexOf('const miningSecondsByCode'), source.indexOf('const resourceYield'));
const settlement = source.slice(source.indexOf('const settleResourceMining'), source.indexOf('export const cancelResourceMining'));
function fixture(seconds, codes = Array(6).fill('ridge_core')) {
  const start = Date.parse('2026-09-17T00:00:00Z');
  let now = start + seconds * 1000;
  const nodes = codes.map((code, index) => ({ resource_id: index + 1, item_id: index + 100, resource_region_id: 1, pos_x: 2, pos_y: 3, pos_z: 0, code, name: code, item_category: '锻材', spawned: start - 1000, mined: false, occupied: false }));
  let session;
  const inventory = new Map();
  const operations = [];
  const begun = [];
  const context = vm.createContext({ Date: class extends Date { static now() { return now; } }, Map, Error, Math,
    resourceKindByCode: () => '矿脉', resourceYield: async (_c, id) => codes[id - 100] === 'sun_gold' ? 2 : 1,
    talentGatherReward: async (_c, _ch, _id, base) => base,
    talentBeginGather: async (_c, _ch, id) => { begun.push(id); },
    advanceEvolutionObservationMining: async () => {}, recordCharacterOperation: async (_c, entry) => operations.push(entry),
    achievementGatherSurprises: async () => {}, recordAchievement: () => {}, achievementItem: async () => {}, achievementActivity: () => {}
  });
  vm.runInContext(ts.transpileModule(rules + settlement + '\nglobalThis.run = settleResourceMining; globalThis.limits = resourceVeinLimit; globalThis.durations = miningSecondsByCode;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  session = { ...nodes[0], started_at: new Date(start), finishes_at: new Date(start + (context.durations[codes[0]] ?? 300) * 1000) };
  const connection = { async execute(sql, args) {
    if (sql.startsWith('SELECT m.resource_id')) return [session ? [{ ...session }] : []];
    if (sql.startsWith('UPDATE resource_spawns')) { const node = nodes.find(n => n.resource_id === args[0]); const count = node.mined ? 0 : 1; node.mined = true; return [{ affectedRows: count }]; }
    if (sql.startsWith('INSERT INTO player_inventory')) { inventory.set(args[1], (inventory.get(args[1]) ?? 0) + args[2]); return [{}]; }
    if (sql.startsWith('INSERT IGNORE')) return [{}];
    if (sql.startsWith('SELECT rs.id AS resource_id')) {
      const [region, x, y, z, boundary] = args;
      return [nodes.filter(n => !n.mined && !n.occupied && n.resource_region_id === region && n.pos_x === x && n.pos_y === y && n.pos_z === z && n.spawned <= boundary.getTime()).slice(0, 1)];
    }
    if (sql.startsWith('UPDATE player_resource_mining')) { session = { ...nodes.find(n => n.resource_id === args[0]), started_at: args[1], finishes_at: args[2] }; return [{}]; }
    if (sql.startsWith('DELETE FROM player_resource_mining')) { session = null; return [{}]; }
    throw new Error(sql);
  } };
  return { nodes, inventory, begun, operations, context, session: () => session, time: seconds => { now = start + seconds * 1000; }, run: (cancel = false) => context.run(connection, { id: 7 }, cancel) };
}

test('普通材料五分钟；稀有耗时和各类同坐标范围', () => {
  const { context } = fixture(0);
  assert.equal(context.durations.ridge_core, 300);
  for (const [code, limit, duration] of [['sun_gold',2,7200],['moon_silver',3,3600],['star_copper',4,1800],['meteor_iron',5,900]]) {
    assert.equal(context.limits(code), limit); assert.equal(context.durations[code], duration);
  }
  assert.equal(context.limits('ridge_core'), 6);
});
test('四分五十九秒中断无产出，满五分钟结算一轮', async () => {
  for (const [seconds, count] of [[299,0],[300,1],[599,1],[600,2],[750,2]]) {
    const f = fixture(seconds); const result = await f.run(true);
    assert.equal(result.quantity, count); assert.equal(f.inventory.size, count); assert.equal(f.session(), null);
    assert.equal(f.nodes.filter(n => n.mined).length, count);
  }
});
test('延迟刷新补结算多轮，下一轮沿用原完成时间', async () => {
  const f = fixture(750); const result = await f.run();
  assert.equal(result.state, 'mining'); assert.equal(result.remaining, 150); assert.equal(result.seconds, 300);
  assert.equal(f.inventory.size, 2); assert.equal(f.session().resource_id, 3);
  const again = await f.run(); assert.equal(again.rewardText, ''); assert.equal(f.inventory.size, 2);
  f.time(900); const stopped = await f.run(true); assert.equal(stopped.quantity, 1); assert.equal(f.inventory.size, 3);
});
test('矿脉采尽自动结束，多次结算不会重复发奖', async () => {
  const f = fixture(3600); const result = await f.run();
  assert.equal(result.quantity, 6); assert.equal(result.state, 'completed'); assert.equal(f.operations.length, 6);
  assert.equal(await f.run(), null); assert.equal(f.inventory.size, 6);
});
test('占用、异坐标和后刷新资源不追溯结算', async () => {
  const f = fixture(3600); f.nodes[1].occupied = true; f.nodes[2].pos_x = 99;
  for (const node of f.nodes.slice(3)) node.spawned += 3600000;
  const result = await f.run(true); assert.equal(result.quantity, 1); assert.equal(f.inventory.size, 1);
});
test('稀有材料保留单轮耗时和原有产量', async () => {
  const f = fixture(10800, ['sun_gold', 'sun_gold']); const result = await f.run(true);
  assert.equal(result.quantity, 2); assert.equal(f.nodes.filter(n => n.mined).length, 1);
});
test('同坐标不同材料按各自时长连续结算', async () => {
  const f = fixture(1200, ['ridge_core','meteor_iron','ridge_core']); const result = await f.run(true);
  assert.equal(result.quantity, 2); assert.match(result.rewardText, /ridge_core×1、meteor_iron×1/);
});
