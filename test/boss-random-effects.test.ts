import assert from 'node:assert/strict';
import test from 'node:test';
import { bossCommonEffects, bossExclusiveEffects, bossRandomEffectDefinitions, bossRandomEffectTrait, readBossRandomEffect, rerollBossRandomEffectTrait } from '../src/game/boss-random-effects.config';

test('高难度按档位抽取固定数量且不重复', () => {
  assert.equal(bossRandomEffectTrait('goblin_king', 'ordinary'), undefined);
  const infernal = bossRandomEffectTrait('goblin_king', 'infernal', () => .25)!;
  assert.equal(infernal.common.length, 1); assert.equal(infernal.exclusive.length, 0);
  const crimson = bossRandomEffectTrait('goblin_king', 'crimson', () => .25)!;
  assert.equal(crimson.common.length, 1); assert.equal(crimson.exclusive.length, 1);
  const golden = bossRandomEffectTrait('goblin_king', 'golden', () => .25)!;
  assert.equal(golden.common.length, 1); assert.equal(golden.exclusive.length, 2);
  assert.equal(new Set([...golden.common, ...golden.exclusive]).size, 3);
});

test('效果库包含10普通、每个首领2专属，名称均为四字', () => {
  assert.equal(bossCommonEffects.length, 10);
  for (const effect of [...bossCommonEffects, ...Object.values(bossExclusiveEffects).flat()]) assert.equal([...effect.name].length, 4, effect.name);
  for (const effects of Object.values(bossExclusiveEffects)) assert.equal(effects.length, 2);
});

test('持久化词条可从JSON读取并生成展示说明', () => {
  const trait = bossRandomEffectTrait('goblin_king', 'dreamlike', () => .75)!;
  const restored = readBossRandomEffect(JSON.stringify([{ code: 'dreamlike', name: '梦幻的' }, trait]));
  assert.deepEqual(restored, trait);
  assert.equal(bossRandomEffectDefinitions(restored).length, 3);
});

test('Boss降档时移除旧效果并按新档位完整重抽', () => {
  const oldEffect = bossRandomEffectTrait('goblin_king', 'golden', () => .75)!;
  const traits = [{ code: 'golden', name: '黄金的' }, oldEffect, { code: 'kingbeast_encounter', groupId: 'court', role: 'king' }];
  const infernal = rerollBossRandomEffectTrait(traits, 'goblin_king', 'infernal', () => .25);
  const infernalEffect = readBossRandomEffect(infernal)!;
  assert.equal(infernalEffect.common.length, 1);
  assert.equal(infernalEffect.exclusive.length, 0);
  assert.notDeepEqual(infernalEffect, oldEffect);
  assert.equal(infernal.filter(trait => trait.code === 'boss_random_effect').length, 1);
  assert.equal(infernal.some(trait => trait.code === 'kingbeast_encounter'), true);

  const heroic = rerollBossRandomEffectTrait(infernal, 'goblin_king', 'heroic', () => .5);
  assert.equal(readBossRandomEffect(heroic), undefined);
  assert.equal(heroic.some(trait => trait.code === 'kingbeast_encounter'), true);
});
