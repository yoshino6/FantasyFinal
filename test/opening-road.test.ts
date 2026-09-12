import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { openingRouteByCode } from '../src/game/opening-content';
import { openingHubs, openingStartRouteCodes } from '../src/game/opening-world.config';
import { releaseOpeningRouteMaps } from '../src/database/opening';

const load = (mocks: Record<string, unknown>) => {
  const source = readFileSync(new URL('../src/game/opening-road.service.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', compiled)((name: string) => mocks[name] ?? {}, module, module.exports);
  return module.exports as { openingRoadPanel: (user: string) => Promise<any>; selectOpeningRoad: (user: string, revision: number, code: string) => Promise<any> };
};

test('首次开放两张开局地图和两个安全终点，后续启动尊重管理员关闭状态', async () => {
  let migrated = false;
  let releases = 0;
  const maps = new Map([['dark_forest', false], ['worldtree_meadow', false], ['baina_town', false], ['floating_leaf_town', false]]);
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => { releases++; },
    execute: async (sql: string, codes: string[] = []) => {
      if (sql.startsWith('INSERT IGNORE INTO game_data_migrations')) {
        const first = !migrated; migrated = true; return [{ affectedRows: Number(first) }];
      }
      if (sql.startsWith('UPDATE map_regions SET is_enabled=1')) {
        assert.deepEqual(new Set(codes), new Set(['dark_forest', 'worldtree_meadow', 'baina_town', 'floating_leaf_town']));
        for (const code of codes) maps.set(code, true);
        return [{ affectedRows: codes.length }];
      }
      throw new Error(`意外 SQL：${sql}`);
    }
  };
  const pool = { getConnection: async () => connection };
  await releaseOpeningRouteMaps(pool as any);
  assert.deepEqual([...maps.values()], [true, true, true, true]);
  maps.set('floating_leaf_town', false);
  await releaseOpeningRouteMaps(pool as any);
  assert.equal(maps.get('floating_leaf_town'), false);
  assert.equal(releases, 2);
});

test('隐藏选路只在初行未触发时改动个人路线和出生地图，不再次消耗随机抽取池', async () => {
  const character = { id: 7, current_region_id: 1, pos_x: -10, pos_y: -10, pos_z: 0 };
  const story = { route_code: 'F01', state: 'armed', revision: 0, reward_claimed: 0, story_version: 3, destination_code: 'baina_town' };
  const writes: string[] = [];
  const connection = { execute: async (sql: string, args: any[] = []) => {
    if (sql.startsWith('SELECT c.id,c.current_region_id')) return [[{ ...character }]];
    if (sql.startsWith('SELECT route_code,state,revision')) return [[{ ...story }]];
    if (sql.startsWith('UPDATE player_opening_stories')) {
      writes.push('story');
      if (story.state !== 'armed' || story.revision !== args[5]) return [{ affectedRows: 0 }];
      Object.assign(story, { route_code: args[0], story_version: args[1], destination_code: args[2], revision: story.revision + 1 });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE characters')) { writes.push('character'); Object.assign(character, { current_region_id: args[0], pos_x: args[1], pos_y: args[2], pos_z: args[3] }); return [{ affectedRows: 1 }]; }
    throw new Error(`意外 SQL：${sql}`);
  } };
  const routes = [
    { region: { id: 2, name: '世界树草原环带' }, routes: [openingRouteByCode('M01')], point: { x: 12, y: 8, z: 0 } },
    { region: { id: 1, name: '幽暗密林' }, routes: [openingRouteByCode('F01')], point: { x: -10, y: -10, z: 0 } }
  ];
  const service = load({
    '../database/pool': { getPool: async () => connection, withTransaction: async (run: (c: typeof connection) => Promise<any>) => run(connection) },
    './opening-state': { availableOpeningSpawns: async () => ({ candidates: routes, areas: [] }), openingSpawnPoint: () => ({ x: 12, y: 8, z: 0 }) },
    './opening-content': { openingRouteByCode }, './opening-world.config': { openingHubs, openingStartRouteCodes }
  });
  const panel = await service.openingRoadPanel('player');
  assert.equal(panel.current, 'F01');
  assert.deepEqual(panel.roads.map((road: {code: string}) => road.code), ['F01', 'M01']);
  await assert.rejects(service.selectOpeningRoad('player', 0, 'C02'), /不可选择/);
  assert.deepEqual(writes, []);
  const selected = await service.selectOpeningRoad('player', 0, 'M01');
  assert.deepEqual([selected.code, selected.region, selected.destination], ['M01', '世界树草原环带', '浮叶镇']);
  assert.deepEqual([character.current_region_id, character.pos_x, character.pos_y, character.pos_z], [2, 12, 8, 0]);
  assert.deepEqual(writes, ['story', 'character']);
  await assert.rejects(service.selectOpeningRoad('player', 0, 'F01'), /已过期/);
  await service.selectOpeningRoad('player', 1, 'M01');
  assert.deepEqual(writes, ['story', 'character', 'story'], '重复确认当前道路不应再次挪动角色');
  story.state = 'reading';
  await assert.rejects(service.selectOpeningRoad('player', 2, 'F01'), /不能再选择/);
  assert.deepEqual(writes, ['story', 'character', 'story']);
});
