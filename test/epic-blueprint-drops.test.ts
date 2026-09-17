import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { epicBlueprintDropChance, epicForgeRecipes } from '../src/config/epic-forging';

test('四大Boss每张史诗图纸分别采用2%/4%/6%基础掉率', () => {
  assert.deepEqual(epicBlueprintDropChance, { 武器: .02, 上装: .04, 下装: .04, 头肩: .06, 腰部: .06, 脚部: .06 });
  const bosses = [...new Set(epicForgeRecipes.map(recipe => recipe.bossCode))].sort();
  assert.deepEqual(bosses, ['goblin_king', 'gruen_mountainheart', 'threehead_mother', 'valk_forge_overseer']);
  for (const boss of bosses) {
    const recipes = epicForgeRecipes.filter(recipe => recipe.bossCode === boss);
    assert.equal(recipes.length, 8);
    assert.equal(recipes.filter(recipe => epicBlueprintDropChance[recipe.category] === .02).length, 3);
    assert.equal(recipes.filter(recipe => epicBlueprintDropChance[recipe.category] === .04).length, 2);
    assert.equal(recipes.filter(recipe => epicBlueprintDropChance[recipe.category] === .06).length, 3);
  }
});

test('初始化逐张写入掉率，不改为互斥抽取或改变每张数量', () => {
  const source = readFileSync(new URL('../src/database/bootstrap.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('for (const recipe of recipes) filtered.push({ code: recipe.blueprintCode, chance: epicBlueprintDropChance[recipe.category], min_quantity: 1, max_quantity: 1 });'));
  assert.ok(source.includes('await seedEpicForgeContent(pool)'));
});
