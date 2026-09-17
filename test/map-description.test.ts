import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapRegionDescriptions, mapItemDescription } from '../src/game/map-description.config';
import { worldSurfaceRegions } from '../src/config/world-surface';
import { openingHubs } from '../src/game/opening-world.config';
import { initializeMapDescriptions } from '../src/database/map-descriptions';

test('所有地表和初始城镇有独立环境介绍，不混用公会对白', () => {
  for (const code of [...worldSurfaceRegions.map(r => r.code), ...Object.keys(openingHubs), 'dark_forest', 'dark_forest_deep', 'dark_forest_dungeon']) {
    assert.ok(mapRegionDescriptions[code], code);
    assert.doesNotMatch(mapRegionDescriptions[code], /登记|柜台|贡献点|兑换/);
  }
  for (const [code, hub] of Object.entries(openingHubs)) assert.notEqual(mapRegionDescriptions[code], hub.description);
});

test('地图页即使读取到旧库公会对白也优先使用地区介绍', () => {
  const source = readFileSync('src/response/map.ts', 'utf8');
  const expression = source.match(/const overviewFor = \(map: OwnedMap\) => ([^;]+);/)?.[1];
  assert.ok(expression);
  const overview = new Function('mapRegionDescriptions','map',`return ${expression};`);
  for (const code of ['floating_leaf_town','frost_dragon_inn']) {
    assert.equal(overview(mapRegionDescriptions,{region_code:code,region_description:'登记免费，踩坏椅子另算。'}),mapRegionDescriptions[code]);
  }
  assert.equal(overview(mapRegionDescriptions,{region_code:'custom',region_description:'自定义地区介绍'}),'自定义地区介绍');
});

test('旧库同步只改地区和地图物品描述，按区域标识匹配而不触碰公会 NPC', async () => {
  const writes: {sql:string;args:unknown[]}[]=[];
  await initializeMapDescriptions({execute:async(sql:string,args:unknown[])=>{writes.push({sql,args});return [{affectedRows:1}];}} as any);
  assert.equal(writes.length,Object.keys(mapRegionDescriptions).length*2);
  for (const [index,[code,description]] of Object.entries(mapRegionDescriptions).entries()) {
    assert.equal(writes[index*2].sql,'UPDATE map_regions SET description=? WHERE code=?');
    assert.deepEqual(writes[index*2].args,[description,code]);
    assert.deepEqual(writes[index*2+1].args,[mapItemDescription(code),code]);
    assert.match(writes[index*2+1].sql,/item_category='地图'.*JSON_UNQUOTE/s);
  }
  const opening = readFileSync('src/database/opening.ts','utf8');
  assert.ok(opening.includes('[code,hub.name,mapRegionDescriptions[code]'));
  assert.ok(opening.includes('[hub.guild,hub.guildName,hub.description'));
});
