import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// 执行响应器中的实际选页代码，隔离消息框架和正式数据库，不复制选页实现。
const source = readFileSync('src/response/map.ts', 'utf8');
const selection = source.match(/const defaultMap = [\s\S]*?const selectedMap = [^;]+;/)?.[0];
assert(selection);
const runSelection = new Function('maps', 'compareByDanger', 'route', `${selection}\nreturn selectedMap;`);
const maps = [
  { code: 'map_world_tree', region_code: 'world_tree', is_current_region: 0, order: 0 },
  { code: 'map_dark_forest', region_code: 'dark_forest', is_current_region: 0, order: 2 },
  { code: 'map_baina_town', region_code: 'baina_town', is_current_region: 1, order: 1 }
];
const select = (owned = maps, requested = '') => runSelection(owned, (a: typeof maps[number], b: typeof maps[number]) => a.order - b.order, { param: () => requested });

test('地图默认打开当前地区，区域归属按 ID 判断', () => {
  assert.equal(select().code, 'map_baina_town');
  assert(source.includes('(r.id=c.current_region_id) AS is_current_region'));
});
test('点击区域链接仍以指定地区为准，不强制跳回所在地', () => {
  assert.equal(select(maps, 'map_dark_forest').code, 'map_dark_forest');
});
test('未拥有当地地图依次回退世界树、幽暗密林、已有地图', () => {
  const unlocated = maps.map(map => ({ ...map, is_current_region: 0 }));
  assert.equal(select(unlocated).code, 'map_world_tree');
  assert.equal(select(unlocated.slice(1)).code, 'map_dark_forest');
  assert.equal(select(unlocated.slice(2)).code, 'map_baina_town');
});
test('未知或未拥有的区域参数不绕过权限，回退当前地区', () => {
  assert.equal(select(maps, 'map_unknown').code, 'map_baina_town');
});
