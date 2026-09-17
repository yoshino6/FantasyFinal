import assert from 'node:assert/strict';
import test from 'node:test';
import {
  correctedCritBonus,
  correctedCritChance,
  strikeCorrections,
  tenacityContest
} from '../src/game/combat-math';
import {
  advancedElementMasteryBonusFor,
  cachedAdvancedPassiveEffectFor,
  isCachedAdvancedPassiveKey,
  registeredAdvancedProfessionByCode
} from '../src/game/advanced-profession.config';
import { CombatRules, emptyRuleState, type RuleHooks, type RuleUnit } from '../src/game/combat-rule-registry';

const close = (actual: number, expected: number, epsilon = 1e-12) => assert.ok(
  Math.abs(actual - expected) <= epsilon,
  `expected ${actual} to be within ${epsilon} of ${expected}`
);

test('二转概率修正遵循补足未满足概率与削减当前概率', () => {
  close(correctedCritChance(.6, { critRateCorrectionPct: 25 }), .7);
  close(correctedCritChance(.6, { critAvoidanceCorrectionPct: 25 }), .45);
  close(correctedCritChance(.6, { critRateCorrectionPct: 25, critAvoidanceCorrectionPct: 25 }), .525);

  // 暴伤抗性只削减额外暴伤：额外 100% 经 25% 修正后为 75%，总倍率为 175%。
  close(correctedCritBonus(1, { critDamageCorrectionPct: 25 }), .75);
  close(1 + correctedCritBonus(1, { critDamageCorrectionPct: 25 }), 1.75);
});

test('同类独立概率修正按剩余概率合并而非简单相加', () => {
  const corrections = strikeCorrections(
    { critRateCorrectionPct: 25, cardEffects: { critRateCorrectionPct: 20 } },
    { critAvoidanceCorrectionPct: 20, cardEffects: { critAvoidanceCorrectionPct: 25 } }
  );
  close(corrections.critRateCorrectionPct!, 40);
  close(corrections.critAvoidanceCorrectionPct!, 40);
  close(correctedCritChance(.5, corrections), .42);
});

test('破韧命中修正在韧性对抗后补足未满足系数', () => {
  const base = tenacityContest(100, 300, 0, 100);
  const corrected = tenacityContest(100, 300, 0, 100, 20);
  close(base.coefficient, .5);
  close(corrected.coefficient, .6);
  close(corrected.controlChance, .6);
  close(corrected.harmfulMultiplier, .8);
  close(corrected.damageOverTimeMultiplier, .6);
});

const ruleUnit = (key: string, side: string, modifiers: Record<string, number> = {}): RuleUnit => ({
  key, name: key, side, level: 30, boss: false,
  hp: 1000, hpMax: 1000, mp: 100, mpMax: 100,
  attack: 100, magic: 100, defense: 100, magicDefense: 100,
  accuracy: 100, evasion: 100, speed: 100,
  crit: 100, critResist: 100, critDamage: 100, critReduction: 100,
  pierce: key === 'source' ? 100 : 0, tenacity: key === 'target' ? 300 : 0,
  state: emptyRuleState(), cooldowns: {}, passives: [],
  resistance: {}, mastery: {}, modifiers
});
const ruleHooks: RuleHooks = {
  absorb: async () => 0,
  legacyEffects: () => [],
  removeLegacy: async () => {},
  extraAction: () => {},
  swapThreat: async () => {}
};

test('规则层同时读取施法方破韧命中修正与受击方控制抗性', async () => {
  const source = ruleUnit('source', 'ally', { statusHitCorrectionPct: 20 });
  const resistedTarget = ruleUnit('target', 'enemy', { controlResistancePct: 25 });
  const resisted = new CombatRules([source, resistedTarget], 1, [], ruleHooks, '', undefined, () => .5);
  // 韧性对抗系数 .5，经 +20% 补足为 .6，再受 25% 控制抗性压到 .45，因此 0.5 骰点失败。
  assert.equal(await resisted.control(source, resistedTarget, 'silence', 100, 2), false);

  const plainSource = ruleUnit('source', 'ally', { statusHitCorrectionPct: 20 });
  const plainTarget = ruleUnit('target', 'enemy');
  const applied = new CombatRules([plainSource, plainTarget], 1, [], ruleHooks, '', undefined, () => .5);
  assert.equal(await applied.control(plainSource, plainTarget, 'silence', 100, 2), true);
  assert.equal(applied.status(plainTarget, 'silence')?.code, 'silence');
});

test('固有缓存只收面板字段，概率乘区留在战斗层', () => {
  const ironbreaker = registeredAdvancedProfessionByCode('ironbreaker')!;
  assert.equal(ironbreaker.passive.effect.critRateCorrectionPct, 33);
  assert.equal(cachedAdvancedPassiveEffectFor('ironbreaker').critRateCorrectionPct, undefined);
  assert.equal(cachedAdvancedPassiveEffectFor('ironbreaker').critDamagePct, 12);
  assert.equal(isCachedAdvancedPassiveKey('critRateCorrectionPct'), false);

  const weaponMaster = registeredAdvancedProfessionByCode('weapon_master')!;
  assert.equal(weaponMaster.passive.effect.critAvoidanceCorrectionPct, 10);
  assert.equal(cachedAdvancedPassiveEffectFor('weapon_master').critAvoidanceCorrectionPct, undefined);
  assert.equal(cachedAdvancedPassiveEffectFor('weapon_master').physicalAttackPct, 12);
});

test('元素使四系精通以固定值进入角色元素缓存', () => {
  assert.deepEqual(advancedElementMasteryBonusFor('elementalist'), { 火: 50, 冰: 50, 风: 50, 雷: 50 });
  assert.deepEqual(advancedElementMasteryBonusFor('ironbreaker'), { 火: 0, 冰: 0, 风: 0, 雷: 0 });
  assert.deepEqual(advancedElementMasteryBonusFor(undefined), { 火: 0, 冰: 0, 风: 0, 雷: 0 });
});
