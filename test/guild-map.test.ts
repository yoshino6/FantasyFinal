import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { guildMapCatalog, guildMapContributionPrice, guildMapRisk } from '../src/game/guild-map.service';

test('地图贡献兑换按危险等级定价，待勘测地图不出售', () => {
  assert.deepEqual(['安全区', '低危', '中危', '高危', '待勘测'].map(guildMapContributionPrice), [200, 200, 1000, 10000, null]);
});

test('Lv.20～30 冒险带可兑换地图，Lv.32 区域 Boss 单独展示', async () => {
  assert.deepEqual([null, 0, 1, 19, 20, 30, 31, 50, 51].map(guildMapRisk), ['待勘测', '待勘测', '低危', '低危', '低危', '低危', '中危', '中危', '高危']);
  const rows = [
    { id: 1, code: 'map_baina_town', name: '地图·百纳镇', region_code: 'baina_town', region_name: '百纳镇', description: '', codex_id: null, min_level: null, max_level: null, boss_level: null },
    ...[
      ['dark_forest_deep', '幽暗密林深处'],
      ['mistalgae_marsh', '雾藻湿地'],
      ['ridge_foothills', '岩脊山麓'],
      ['rediron_pass', '赤铁山道']
    ].map(([code, name], index) => ({ id: index + 2, code: `map_${code}`, name: `地图·${name}`, region_code: code, region_name: name, description: '', codex_id: null, min_level: 20, max_level: 30, boss_level: 32 })),
    { id: 6, code: 'map_fallenstar_swamp', name: '地图·沉星沼泽', region_code: 'fallenstar_swamp', region_name: '沉星沼泽', description: '', codex_id: null, min_level: 36, max_level: 40, boss_level: 40 },
    { id: 7, code: 'map_unknown', name: '地图·丙', region_code: 'unknown', region_name: '丙', description: '', codex_id: null, min_level: null, max_level: null, boss_level: null }
  ];
  const connection = { execute: async (sql: string) => {
    assert.match(sql, /r\.is_enabled=1 AND r\.is_owner_only=0/);
    assert.match(sql, /MAX\(CASE WHEN t\.monster_class<>'boss' THEN t\.level END\) AS max_level/);
    return [rows];
  } } as any;
  const catalog = await guildMapCatalog(connection);
  assert.deepEqual(Object.fromEntries(catalog.map(map => [map.regionCode, map.canExchange])), {
    dark_forest_deep: true, mistalgae_marsh: true, ridge_foothills: true, rediron_pass: true,
    fallenstar_swamp: false, unknown: false, baina_town: true
  });
  assert.equal(catalog.find(map => map.regionCode === 'dark_forest_deep')?.bossLevel, 32);
});

test('集结区只使用免费登记额度，旧贡献兑换指令无法购买地图', async () => {
  const file = ts.createSourceFile('guild.ts', readFileSync('src/game/opening-guild.service.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const source = file.statements.filter(statement => ts.isImportDeclaration(statement) || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => ['openingGuildAction', 'useService'].includes(declaration.name.getText(file)))).map(statement => statement.getText(file)).join('\n');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const queries: Array<{ sql: string; params: unknown[] }> = [], grants: string[] = [];
  let owned = false;
  const connection = { execute: async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.startsWith('SELECT 1 FROM player_inventory')) return [owned ? [{ found: 1 }] : []];
    if (sql.includes('SELECT code,uses FROM player_opening_services')) return [[{ code: 'registration_map_exchange', uses: 1 }]];
    if (sql.startsWith('UPDATE player_opening_services')) return [{ affectedRows: 1 }];
    return [[]];
  } };
  const mocks: Record<string, any> = {
    'node:crypto': { randomUUID: () => 'test-service-use' },
    './character-operation.service': { recordCharacterOperation: async () => {} },
    '../database/pool': { withTransaction: (work: any) => work(connection) },
    './opening.service': { openingCharacter: async () => ({ id: 1, adventurer_registered: 1 }), grantOpeningItem: async (_connection: any, _id: number, item: string) => grants.push(item) },
    './guild-context': { requireGuildService: async () => ({ code: 'baina_town' }) },
    './opening-pack.service': { repairClaimedOpeningPack: async () => {} },
    './guild-map.service': { ensureRegistrationMapExchange: async () => {}, guildMapCatalog: async () => [{ id: 1, code: 'map_allowed', name: '地图·甲', canExchange: true }, { id: 2, code: 'map_over_30', name: '地图·乙', canExchange: false }] }
  };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', code)((name: string) => mocks[name] ?? {}, module, module.exports);
  await assert.rejects(module.exports.openingGuildAction('u', 'map_exchange', 'map_over_30'), /登记额度只能兑换/);
  assert.deepEqual(queries, []);
  await module.exports.openingGuildAction('u', 'map_exchange', 'map_allowed');
  assert.equal(queries.filter(call => call.sql.startsWith('UPDATE player_opening_services')).length, 1);
  assert.deepEqual(grants, ['map_allowed']);

  queries.length = 0;
  owned = true;
  await assert.rejects(module.exports.openingGuildAction('u', 'map_exchange', 'map_allowed'), /已经持有/);
  queries.length = 0;
  await assert.rejects(module.exports.openingGuildAction('u', 'map_contribution', 'map_over_30'), /请选择当前分会提供的服务/);
  assert.deepEqual(queries, []);
  assert.deepEqual(grants, ['map_allowed']);
});
