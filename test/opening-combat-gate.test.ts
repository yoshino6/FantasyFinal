import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.createSourceFile('opening-state.ts', readFileSync('src/game/opening-state.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const declaration = source.statements.find(s => ts.isVariableStatement(s) && s.declarationList.declarations.some(d => d.name.getText(source) === 'assertOpeningFree'))!;
const code = ts.transpileModule(declaration.getText(source).replace(/^export\s+/, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const guard = new Function(`${code}; return assertOpeningFree;`)();

test('初行已结束及 NPC 无初行记录时保持放行', async () => {
  await guard({ execute: async () => [[]] }, 7);
});

test('未结束初行的普通操作仍被拦截，不尝试剧情战斗例外', async () => {
  let calls = 0;
  await assert.rejects(guard({ execute: async () => { calls++; return [[{ state: 'branch' }]]; } }, 7), /继续剧情/);
  assert.equal(calls, 1);
});

test('仅通过路线、选择、进度和本地存活史莱姆校验后才放行开战', async () => {
  for (const allowed of [true, false]) {
    let calls = 0;
    const connection = { execute: async (sql: string, params: unknown[]) => {
      if (++calls === 1) return [[{ state: 'branch' }]];
      assert.deepEqual(params, [99, 7]);
      for (const condition of ["o.route_code='F03'", "o.state='branch'", "p.stage=5", "p.status='joined'", "p.status='declined'", 'forestBattlePending', "t.code='forest_slime'", 's.region_id=c.current_region_id', 's.pos_x=c.pos_x', 's.pos_y=c.pos_y', 's.pos_z=c.pos_z', 's.defeated_at IS NULL']) assert.ok(sql.includes(condition), condition);
      return [allowed ? [{ character_id: 7 }] : []];
    } };
    if (allowed) await guard(connection, 7, 99);
    else await assert.rejects(guard(connection, 7, 99), /继续剧情/);
    assert.equal(calls, 2);
  }
});
