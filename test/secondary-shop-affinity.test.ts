import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// 直接执行生产函数，隔离数据库与天赋、成就外部依赖。
const declarations = (path: string, names: string[]) => {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  return source.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.includes(d.name.getText(source)))).map(node => node.getText(source)).join('\n');
};
const fixture = () => {
  let context: any, day = 1, atShop = true, failAudit = false;
  let rows: Record<string, { affinity: number; day: number; count: number }> = {};
  const sqlCalls: string[] = [];
  const db = { execute: async (sql: string, args: any[]) => {
    sqlCalls.push(sql);
    const key = `${args[0]}/${args[1]}`;
    if (sql.startsWith('SELECT id FROM characters')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT 1 FROM characters')) return [atShop ? [{ id: 1 }] : []];
    if (sql.includes('AS count FROM player_npc_affinity')) return [rows[key]?.day === day ? [{ count: rows[key].count }] : []];
    if (sql.startsWith('INSERT INTO player_npc_affinity')) {
      const old = rows[key] ?? { affinity: 0, count: 0, day };
      if (old.day !== day) old.count = 0;
      if (old.count < 3) old.affinity += Number(args[2]);
      old.count = Math.min(3, old.count + 1); old.day = day; rows[key] = old;
      return [{}];
    }
    if (sql.startsWith('SELECT affinity,')) return [[{ affinity: rows[key].affinity, daily_count: rows[key].count }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const api: any = {};
  const source = declarations('src/game/adventure.service.ts', ['npcAffinityReward', 'npcAffinityRank', 'addNpcAffinityFor'])
    + '\n' + declarations('src/game/secondary-shop-context.ts', ['awardSecondaryShopCraftAffinity']);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', 'achievementNpcState', 'recordCharacterOperation', 'randomUUID', 'currentSecondaryShop', compiled)(
    (name: string) => name === './adventure.service' ? api : { talentNpcAffinity: async (_db: unknown, _id: number, _npc: string, amount: number) => amount },
    api, async () => {}, async () => { if (failAudit) throw new Error('audit failed'); }, () => 'test', () => context
  );
  const run = async (shop: string | undefined, id = 1) => {
    context = shop ? { shop, characterId: 1 } : undefined;
    const before = structuredClone(rows);
    try { return await api.awardSecondaryShopCraftAffinity(db, id); }
    catch (error) { rows = before; throw error; }
  };
  return { run, rows: () => rows, sqlCalls, nextDay: () => day++, leave: () => atShop = false, failAudit: () => failAudit = true };
};

test('两家店的已结算操作共用各自每日三次额度，跨日恢复', async () => {
  const f = fixture();
  for (const shop of ['alchemy_sweetshop', 'oddworkshop']) {
    for (let i = 0; i < 5; i++) await f.run(shop);
    assert.equal(f.rows()[`1/${shop}`].affinity, 30);
    assert.equal(f.rows()[`1/${shop}`].count, 3);
  }
  f.nextDay(); await f.run('alchemy_sweetshop');
  assert.equal(f.rows()['1/alchemy_sweetshop'].affinity, 40);
  assert.equal(f.rows()['1/oddworkshop'].affinity, 30);
});

test('个人制作和其他店铺不额外发奖励，错玩家与离店操作被拒绝', async () => {
  const f = fixture();
  await f.run(undefined); await f.run('blacksmith'); await f.run('bookshop');
  assert.equal(f.sqlCalls.length, 0);
  await assert.rejects(f.run('oddworkshop', 2), /不匹配/);
  f.leave(); await assert.rejects(f.run('alchemy_sweetshop'), /离开/);
  assert.deepEqual(f.rows(), {});
});

test('好感结算失败向调用事务抛错，不留下部分奖励', async () => {
  const f = fixture(); f.failAudit();
  await assert.rejects(f.run('alchemy_sweetshop'), /audit failed/);
  assert.deepEqual(f.rows(), {});
});
