import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { floatingRescueTexts, floatingThanksScenes, floatingTourScenes } from '../src/game/floating-leaf-content';

const source = ts.createSourceFile('floating-leaf.service.ts', readFileSync(new URL('../src/game/floating-leaf.service.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const declaration = source.statements.find(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(item => item.name.getText(source) === 'floatingStoryMainQuest'));
assert.ok(declaration);
const compiled = ts.transpileModule(declaration.getText(source).replace(/^export\s+/, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

test('浮叶镇从游镇、当地十级突破、十一救援、公馆复命到二十级进化不跳梨子喵主线', async () => {
  const state = { id: 1, route_code: 'M01', destination_code: 'floating_leaf_town', opening_state: 'completed', adventurer_registered: 1, profession_code: 'mage',
    tour_stage: 0, realm_stage: 1, level: 4, experience: 0, region_code: 'floating_leaf_town', pos_x: 12, pos_y: 0, barrier_stage: 0, goblin_stage: 0, thanks_stage: 0 };
  const pool = { execute: async () => [[{ pos_x: -30, pos_y: -240 }]] };
  const current = new Function('getPool', 'characterFor', 'isLeafOrigin', 'floatingTourScenes', 'floatingThanksScenes', 'experienceRequiredForLevel', `${compiled}\nreturn floatingStoryMainQuest;`)(
    async () => pool, async () => state, (character: typeof state) => character.route_code === 'M01' && character.destination_code === 'floating_leaf_town' && character.opening_state === 'completed',
    floatingTourScenes, floatingThanksScenes, (level: number) => level * 100) as (user: string) => Promise<any>;
  assert.match((await current('player')).description, /首次移动/);
  state.tour_stage = 2;
  assert.equal((await current('player')).action.command, '/浮叶游览');
  state.tour_stage = 6;
  assert.equal((await current('player')).action.command, '/初行公会 接驳');
  state.region_code = 'worldtree_meadow'; state.level = 10; state.experience = 1000;
  assert.equal((await current('player')).action.command, '/前往地图 map_world_tree');
  state.region_code = 'floating_leaf_town'; state.barrier_stage = 1;
  assert.equal((await current('player')).action.command, '/前往 13 2');
  state.barrier_stage = 4;
  assert.equal((await current('player')).action.command, '/背包 材料');
  state.realm_stage = 2; state.level = 11; state.experience = 0; state.barrier_stage = 4;
  assert.equal((await current('player')).title, '【主线·失踪的孩子】');
  state.goblin_stage = 3; state.region_code = 'world_tree';
  assert.equal((await current('player')).action.command, '/前往地图 map_dark_forest_deep');
  state.goblin_stage = 11;
  assert.equal((await current('player')).action.command, '/浮叶返程');
  state.goblin_stage = 12; state.region_code = 'floating_leaf_town'; state.pos_x = 15;
  assert.equal((await current('player')).action.command, '/建筑进入 leaf_manor');
  state.region_code = 'world_tree';
  assert.equal((await current('player')).action.command, '/初行公会 接驳');
  state.region_code = 'floating_leaf_town';
  state.thanks_stage = 2;
  assert.equal((await current('player')).action.command, '/浮叶致谢 继续');
  state.thanks_stage = 6; state.level = 19;
  assert.equal((await current('player')).title, '【主线·前往二十级】');
  state.level = 20; state.experience = 2000;
  assert.equal(await current('player'), null);
});

test('浮叶镇游历与救援正文有明确角色对白，景点坐标和剧情段落齐全', () => {
  assert.deepEqual(floatingTourScenes.map(scene => [scene.x, scene.y]), [[12,0],[10,-2],[14,-1],[11,2],[13,2],[12,0]]);
  for (const scene of [...floatingTourScenes, ...floatingThanksScenes]) {
    assert.ok(scene.text.length >= 95, `${scene.title} 太短`);
    assert.match(scene.text, /“[^”]+”/, scene.title);
  }
  assert.match(floatingTourScenes[3]!.text, /冒险者公会|杀害/);
  for (const name of ['梨子喵', '莱昂', '伊芙', '希娅']) assert.ok(floatingRescueTexts.victory.includes(name), `获救场景缺少${name}`);
});
