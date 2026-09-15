import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateHeartGrowthChange } from '../src/game/heart-question-rules';
import { playerGrowthShares } from '../src/game/growth-rules';
import type { Allocation } from '../src/game/types';

const growth = (favor = 2, repel = 1): Allocation => ({ constitution: 2, spirit: 2, strength: repel, intelligence: favor, agility: 2, perception: 2 });

test('普通问心只转移排斥维实际拥有的成长', () => {
  const full = calculateHeartGrowthChange(growth(2, 2), 'intelligence', 'strength', false);
  assert.equal(full.target, 1);
  assert.equal(full.gain, 1);
  assert.equal(full.loss, 1);
  assert.equal(full.after.intelligence, 3);
  assert.equal(full.after.strength, 1);
  const exhausted = calculateHeartGrowthChange(growth(2, .3), 'intelligence', 'strength', false);
  assert.equal(exhausted.gain, .3);
  assert.equal(exhausted.after.strength, 0);
  assert.equal(exhausted.after.intelligence, 2.3);
  assert.equal(calculateHeartGrowthChange(growth(2, 0), 'intelligence', 'strength', false).gain, 0);
});

test('大成功不扣排斥维，且不能越过 12 点预算', () => {
  const nearCap: Allocation = { constitution: 2, spirit: 2, strength: 2, intelligence: 2, agility: 2, perception: 1.6 };
  const result = calculateHeartGrowthChange(nearCap, 'intelligence', 'strength', true);
  assert.equal(result.gain, .4);
  assert.equal(result.loss, 0);
  assert.equal(result.after.intelligence, 2.4);
  assert.equal(result.after.strength, 2);
  assert.equal(calculateHeartGrowthChange({ ...nearCap, perception: 2 }, 'intelligence', 'strength', true).gain, 0);
});

test('问心作答后的成长变化按当前等级全部成长份数重算', () => {
  const level = 12;
  const change = calculateHeartGrowthChange(growth(2, 2), 'intelligence', 'strength', false);
  const beforeAtChoice = 2 * playerGrowthShares(level);
  const afterAtChoice = change.after.intelligence * playerGrowthShares(level);
  assert.equal(afterAtChoice - beforeAtChoice, change.gain * playerGrowthShares(level));
});
