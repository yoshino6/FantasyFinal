import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

test('悬赏板补位限额来自固定栏位，候选查询不使用 LIMIT 预编译参数', async () => {
  const source = ts.createSourceFile('bounty.service.ts', readFileSync('src/game/bounty.service.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const names = new Set(['boardCandidate', 'syncBountyBoard']);
  const declarations = source.statements.filter(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(declaration => names.has(declaration.name.getText(source))));
  const code = ts.transpileModule(declarations.map(statement => statement.getText(source).replace(/^export\s+/, '')).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const syncBountyBoard = new Function(`${code}\nreturn syncBountyBoard;`)() as (connection: { execute: (sql: string, args?: unknown[]) => Promise<unknown> }) => Promise<void>;
  const calls: Array<{ sql: string; args: unknown[] | undefined }> = [];
  const connection = { execute: async (sql: string, args?: unknown[]) => {
    calls.push({ sql, args });
    if (sql.startsWith('SELECT slot_no')) return [[]];
    if (sql.startsWith('SELECT b.id')) return [[{ id: 81 }]];
    return [{}];
  } };
  await syncBountyBoard(connection);
  const candidate = calls.find(call => call.sql.startsWith('SELECT b.id'))!;
  assert.match(candidate.sql, /ORDER BY RAND\(\) LIMIT 10$/);
  assert.equal(candidate.args, undefined);
  assert.ok(calls.some(call => call.sql.startsWith('INSERT IGNORE INTO bounty_board_slots') && JSON.stringify(call.args) === JSON.stringify([1, 81])));
});
