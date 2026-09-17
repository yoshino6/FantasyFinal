import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('BOSS词条说明只读取当前遇战或战斗目标的实际效果', () => {
  const source = readFileSync(new URL('../src/response/boss-trait.ts', import.meta.url), 'utf8');
  assert.match(source, /currentEncounter\(qqUserId\)/);
  assert.match(source, /battleStatus\(qqUserId\)/);
  assert.match(source, /bossRandomEffectSummary\(boss\.traits_json\)/);
  assert.match(source, /level32BossDifficultyCodeFromTraits/);
  assert.match(source, /bossTraitCardImage\(card\)/);
  assert.match(source, /Format\.create\(\)\.addImage/);
  assert.match(source, /if \(foundBoss && !lines\.length\) return;/);
  assert.doesNotMatch(source, /bossCommonEffects|traitDescriptions|bossExclusiveEffects/);
});
