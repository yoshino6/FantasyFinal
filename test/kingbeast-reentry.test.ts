import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { kingbeastEncounter, kingbeastMapTargets, kingbeastSelectableTargets, kingbeastUnitRole } from '../src/game/kingbeast.config';

const unit = (id: number, role: string, extra: object[] = []) => ({ id, name: role, current_hp: 100, traits_json: [{ code: 'kingbeast_encounter', groupId: 'court', role }, ...extra] });
const source = readFileSync(new URL('../src/game/adventure.service.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('adventure.ts', source, ts.ScriptTarget.Latest, true);
const declaration = (name: string) => {
  let result = '';
  const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) result = `const ${node.getText(file)};`; ts.forEachChild(node, visit); };
  visit(file); assert.ok(result, name); return result;
};

test('地图仅一条王龙入口，隐藏两类随从；战斗分离后仍显示双核心和随从', () => {
  const units = [unit(1, 'king'), unit(2, 'dragon'), unit(3, 'guard'), unit(4, 'spearman')];
  const map = kingbeastMapTargets(units);
  assert.equal(map.length, 1); assert.equal(map[0]!.id, 2); assert.equal(map[0]!.name, '哥布林国王＆哈巴龙');
  assert.equal(units.length, 4);
  assert.deepEqual(kingbeastSelectableTargets(units).map(u => u.id), [2, 3, 4]);
  assert.equal(kingbeastSelectableTargets(units.map(u => ({ ...u, cooldowns: { kingbeast_phase_two: 1 } }))).length, 4);
  assert.equal(kingbeastMapTargets([units[0]!])[0]!.id, 1);
});

for (const occupied of [false, true]) test(`退出后整组恢复：活动战斗=${occupied}，测试龙也恢复，随从只退场`, async () => {
  const king = unit(1, 'king'); king.current_hp = 7;
  const dragon = { ...unit(2, 'dragon', [{ code: 'boss_test' }]), current_hp: 0, defeated_at: 'yesterday' as string | null };
  const guard = { ...unit(3, 'guard'), current_hp: 8, defeated_at: null as string | null };
  const summon = unit(4, 'spearman', [{ code: 'summoned' }]);
  const rows = [king, dragon, guard, summon]; const writes: number[] = [];
  const connection = { execute: async (sql: string, params: any[]) => {
    if (sql.includes("cs.state='active'")) return [occupied ? [{ spawn_id: 1 }] : []];
    if (sql.startsWith('SELECT s.id')) return [rows];
    if (sql.includes('COALESCE(defeated_at,NOW())')) { guard.current_hp = 0; guard.defeated_at = 'now'; writes.push(params[0]); return [{}]; }
    assert.match(sql, /NOT EXISTS[\s\S]*monster_reward_settlements/);
    const row = rows.find(r => r.id === params[1])!; row.current_hp = params[0]; if ('defeated_at' in row) row.defeated_at = null;
    writes.push(row.id); return [{}];
  } };
  const deps = { kingbeastTrait: kingbeastEncounter, kingbeastRole: kingbeastUnitRole, monsterAttributeColumns: 't.constitution', isSummonedMonster: (u: typeof king) => u.traits_json.some((t: any) => t.code === 'summoned'), monsterCombatStats: () => ({ hpMax: 100 }) };
  const js = ts.transpileModule(declaration('restoreFallenKingbeastCourt'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const restore = new Function(...Object.keys(deps), `${js};return restoreFallenKingbeastCourt;`)(...Object.values(deps));
  await restore(connection, [king]);
  if (occupied) { assert.deepEqual(writes, []); assert.equal(dragon.current_hp, 0); }
  else { assert.equal(king.current_hp, 100); assert.equal(dragon.current_hp, 100); assert.equal(dragon.defeated_at, null); assert.equal(guard.current_hp, 0); assert.deepEqual(writes, [1, 2, 3]); }
});

test('新开战先修复旧残局再加载目标，三种刷新入口均不再预置王庭小怪', () => {
  const start = declaration('chooseTargetInTransaction');
  assert.ok(start.indexOf('await restoreFallenKingbeastCourt') < start.indexOf('const [spawnRows]'));
  assert.match(start, /INSERT INTO combat_targets[\s\S]*JSON_OBJECT/);
  assert.match(start, /summonKingbeastCourtPair\(connection, id, king, await combatMembers\(connection, id\), 1\)/);
  assert.doesNotMatch(source, /await create\(byCode.get\('goblin_royal_/);
  assert.doesNotMatch(source, /await createTestSpawn\(byCode.get\('goblin_royal_/);
  const quest = readFileSync(new URL('../src/game/main-quest.service.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(quest, /await create\('goblin_royal_/);
  assert.match(source, /livingCourtCount === 0[\s\S]*await summonKingbeastCourtPair/);
});
