import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { worldTreeAdvancedProfessions, advancedProfessionByCode } from '../src/game/advanced-profession.config';
import { worldSurfaceMonsters } from '../src/config/world-surface';
import { progressionMapRegions } from '../src/game/progression-map.service';
import { hasMappedTravelRoute, type MappedTravelArea } from '../src/game/mapped-travel-route';

const bootstrap = readFileSync(new URL('../src/database/bootstrap.ts', import.meta.url), 'utf8');
const areaSection = bootstrap.split('const worldRegionAreas:')[1].split('];')[0];
const codes: string[] = [];
const areas: MappedTravelArea[] = [...areaSection.matchAll(/\['([^']+)',\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\]/g)].map(m => {
  if (!codes.includes(m[1])) codes.push(m[1]);
  return { region_id: codes.indexOf(m[1]), min_x: +m[2], max_x: +m[3], min_y: +m[4], max_y: +m[5], min_z: +m[6], max_z: +m[7], danger_level: ['world_tree','baina_town'].includes(m[1]) ? 99 : 1, is_enabled: 1, is_owner_only: 0 };
});

test('十二导师分布四个区域，各阶段目标组合不同，目标与凭证实际存在', () => {
  const counts = new Map<string, number>();
  const combinations = new Set<string>();
  for (const p of worldTreeAdvancedProfessions) {
    counts.set(p.route.regionCode, (counts.get(p.route.regionCode) ?? 0) + 1);
    for (const phase of [p.first, p.second]) {
      const combination = [...phase.targetCodes].sort().join(',');
      assert.ok(!combinations.has(combination), `${p.name}目标重复`); combinations.add(combination);
      for (const code of phase.targetCodes) {
        const monster = worldSurfaceMonsters.find(m => m.code === code);
        if (monster) {
          assert.equal(monster.regionCode, p.route.regionCode);
          assert.equal(monster.materialCode, p.route.materialCode);
          assert.ok(monster.level <= 25); assert.notEqual(monster.monsterClass, 'boss');
          assert.ok(phase.targetText.includes(monster.name));
        } else {
          assert.equal(p.route.regionCode, 'dark_forest_deep');
          const seed = bootstrap.split('\n').find(line => line.includes(`('${code}','`) && line.includes("'chance'"));
          assert.ok(seed, code); assert.ok(seed.includes(`'code','${p.route.materialCode}'`));
          const pool = bootstrap.slice(bootstrap.indexOf("WHEN 'goblin_daredevil' THEN 9"));
          assert.ok(pool.split('ON DUPLICATE KEY')[0].includes(`'${code}'`));
        }
      }
    }
  }
  assert.equal(counts.size, 4); assert.deepEqual([...counts.values()], [3,3,3,3]);
});

for (const p of worldTreeAdvancedProfessions) {
  test(`${p.name}：任务补图支持世界树往返，缺目标地图则拒绝`, () => {
    const regions = progressionMapRegions({ adventurer_registered: 1, opening_state: 'completed', region_code: 'world_tree', realm_stage: 1, goblin_stage: 0, advanced_trial: 1, advanced_profession_code: p.code });
    const owned = new Set(regions.map(c => codes.indexOf(c)));
    const start = { x: p.mentor.x, y: p.mentor.y, z: 0 }, target = { x: p.route.x, y: p.route.y, z: 0 };
    assert.ok(hasMappedTravelRoute(areas, owned, start, target, codes.indexOf(p.route.regionCode)));
    assert.ok(hasMappedTravelRoute(areas, owned, target, start, codes.indexOf('world_tree')));
    owned.delete(codes.indexOf(p.route.regionCode));
    assert.equal(hasMappedTravelRoute(areas, owned, start, target, codes.indexOf(p.route.regionCode)), false);
    for (const other of ['rediron_pass','mistalgae_marsh','ridge_foothills']) {
      if (other !== p.route.regionCode) assert.ok(!regions.includes(other), '不发无关任务区地图');
    }
  });
}

const source = ts.createSourceFile('service.ts', readFileSync(new URL('../src/game/advanced-profession.service.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const load = (name: string, dependencies: Record<string, unknown>) => {
  const statement = source.statements.find(s => ts.isVariableStatement(s) && s.declarationList.declarations.some(d => d.name.getText(source) === name));
  assert.ok(statement);
  const compiled = ts.transpileModule(statement.getText(source).replace(/^export\s+/, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}; return ${name};`)(...Object.values(dependencies));
};

test('十二导师第二段实际按各自凭证扣除，缺材料不推进', async () => {
  for (const p of worldTreeAdvancedProfessions) {
    for (const enough of [false, true]) {
      const writes: Array<{sql: string; args: any[]}> = [];
      const connection = { execute: async (sql: string, args: any[]) => {
        if (sql.startsWith('SELECT profession_code')) return [[{ stage: 2, proof_kills: 5 }]];
        if (sql.startsWith('SELECT pi.item_id')) {
          assert.deepEqual(args, [1, p.route.materialCode]);
          assert.ok(sql.endsWith('FOR UPDATE'));
          return [[{ item_id: 321, quantity: enough ? p.second.materialCount : 0 }]];
        }
        writes.push({sql, args}); return [{affectedRows: 1}];
      } };
      const submit = load('submitAdvancedProfessionProof', { advancedProfessionByCode, characterFor: async () => ({id: 1}), assertAtMentor: () => {}, withTransaction: async (fn: any) => fn(connection), recordCharacterOperation: async () => {}, randomUUID: () => 'test' });
      if (enough) {
        await submit('player', p.code);
        assert.deepEqual(writes[0].args, [p.second.materialCount, 1, 321]);
        assert.ok(writes.some(w => w.sql.includes('SET stage=3')));
      } else {
        await assert.rejects(submit('player', p.code), new RegExp(p.route.materialName));
        assert.equal(writes.length, 0);
      }
    }
  }
});

test('各导师的两段击杀只统计当前目标，沿用已累计进度并限制上限', async () => {
  for (const p of worldTreeAdvancedProfessions) for (const stage of [1,2]) {
    const phase = stage === 1 ? p.first : p.second;
    const writes: any[] = [];
    const connection = { execute: async (sql: string, args: any[]) => {
      if (sql.startsWith('SELECT')) return [[{profession_code: p.code, stage}]];
      writes.push({sql,args}); return [{affectedRows: 1}];
    } };
    const record = load('recordAdvancedProfessionKills', {advancedProfessionByCode});
    await record(connection, 1, ['unrelated_monster']); assert.equal(writes.length, 0);
    await record(connection, 1, [phase.targetCodes[0], 'unrelated_monster']);
    assert.deepEqual(writes[0].args, [phase.requiredKills, 1, 1, p.code]);
    assert.match(writes[0].sql, /LEAST\(\?,\w+\+\?\)/);
  }
});
