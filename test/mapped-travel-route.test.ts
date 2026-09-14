import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMappedTravelRoute, hasMappedTravelRoute, type MappedTravelArea } from '../src/game/mapped-travel-route';

const area = (region_id: number, min_x: number, max_x: number, min_y: number, max_y: number, danger_level = 1, is_enabled = 1): MappedTravelArea =>
  ({ region_id, min_x, max_x, min_y, max_y, min_z: 0, max_z: 0, danger_level, is_enabled, is_owner_only: 0 });

test('世界树与百纳镇仅有两张地图时不能跨越无图地带，补齐连续地图后可以前往', () => {
  const areas = [
    area(4, -5, 5, -25, -16, 99), // 百纳镇覆盖森林
    area(1, -2, 2, -2, 2, 99),   // 世界树覆盖草原
    area(2, -5, 5, -5, 5),       // 草原
    area(3, -5, 5, -25, -6)     // 密林
  ];
  const from = { x: 0, y: 0, z: 0 }, to = { x: 0, y: -20, z: 0 };
  assert.equal(hasMappedTravelRoute(areas, new Set([1, 4]), from, to, 4), false);
  assert.equal(hasMappedTravelRoute(areas, new Set([1, 2, 3, 4]), from, to, 4), true);
  assert.equal(hasMappedTravelRoute(areas, new Set([1, 2, 3, 4]), from, { ...to, z: 30 }, 4), false);
  assert.equal(hasMappedTravelRoute(areas, new Set([1, 2, 3]), from, to, 4), false);
  assert.equal(hasMappedTravelRoute(areas, new Set([1, 2, 3, 4]), from, to, 3), false);
});

test('L 形地图可绕行，关闭区域与高优先级无图覆盖会截断通路', () => {
  const start = { x: 0, y: 0, z: 0 }, target = { x: 2, y: 2, z: 0 };
  const lShape = [area(1, 0, 0, 0, 2), area(1, 0, 2, 2, 2)];
  assert.equal(hasMappedTravelRoute(lShape, new Set([1]), start, target, 1), true);
  assert.equal(hasMappedTravelRoute([...lShape, area(2, 0, 0, 1, 1, 99)], new Set([1]), start, target, 1), false);
  assert.equal(hasMappedTravelRoute([area(1, 0, 0, 0, 0), area(2, 1, 2, 0, 0, 1, 0)], new Set([1, 2]), start, { x: 2, y: 0, z: 0 }, 2), false);
});

test('前往服务校验目标地图和全队共有的沿途地图', async () => {
  const areas = [area(1, 0, 0, 0, 0, 99), area(2, 1, 1, 0, 0), area(3, 2, 2, 0, 0, 99)];
  let maps = [{ character_id: 1, region_id: 3 }, { character_id: 2, region_id: 3 }];
  const connection = { execute: async (sql: string) => {
    if (sql.includes('FROM party_members')) return [[{ character_id: 1 }, { character_id: 2 }]];
    if (sql.includes('FROM player_inventory')) return [maps];
    if (sql.includes('FROM map_region_areas')) return [areas];
    throw new Error(`未知查询：${sql}`);
  } } as any;
  const from = { x: 0, y: 0, z: 0 }, to = { x: 2, y: 0, z: 0 };
  await assert.rejects(assertMappedTravelRoute(connection, 1, 10, from, to, 3), /缺少连续有效的地图/);
  maps = [...maps, { character_id: 1, region_id: 2 }];
  await assert.rejects(assertMappedTravelRoute(connection, 1, 10, from, to, 3), /缺少连续有效的地图/);
  maps = [...maps, { character_id: 2, region_id: 2 }];
  await assert.doesNotReject(assertMappedTravelRoute(connection, 1, 10, from, to, 3));
  maps = [{ character_id: 1, region_id: 2 }, { character_id: 2, region_id: 2 }];
  await assert.rejects(assertMappedTravelRoute(connection, 1, 10, from, to, 3), /尚未持有目标坐标/);
});
