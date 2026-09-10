import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hiddenParticles, hiddenMix, hiddenBranchDamage, hiddenBranchHealing, hiddenMixProbability } from '../src/game/hidden-particles';
import { hiddenProfessions } from '../src/game/hidden-profession.config';
import { hiddenQuests } from '../src/game/hidden-quest.config';
import { hiddenQuestStory, hiddenQuestRetry } from '../src/game/hidden-quest.story';
import { newHiddenLesson, hiddenLessonSteps, advanceHiddenLesson } from '../src/game/hidden-quest.lesson';

const close = (actual: number, expected: number, tolerance = 0.001) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
test('粒子费用与经复核的单体、扩散和治疗锚点一致', () => {
  const fire = hiddenMix(['fire_element_dust', 'magic_unit']);
  assert.equal(fire.mana, 90); assert.equal(fire.cooldown, 1);
  close(hiddenBranchDamage(fire, fire.branches[0], 400, 400), 276.571);
  const great = hiddenMix(['fire_element_dust', 'magic_unit'], 'great');
  assert.equal(great.targets, 1); close(hiddenBranchDamage(great, great.branches[0], 400, 400), 553.143);
  const wind = hiddenMix(['fire_element_dust', 'wind_element_dust', 'magic_unit']);
  assert.equal(wind.mana, 175); assert.equal(wind.cooldown, 3);
  assert.equal(wind.targets, 2); close(hiddenBranchDamage(wind, wind.branches[0], 400, 400), 197.404);
  const water = hiddenMix(['water_element_dust', 'blood_residue']);
  assert.equal(water.mana, 90); close(hiddenBranchHealing(water, water.branches[0], 1000), 150);
});

test('同类辅料收益递减，改变防御不会把增幅再次平方放大', () => {
  const damage = [1, 2, 3].map(arc => {
    const mix = hiddenMix(['fire_element_dust', ...Array(arc).fill('magic_unit')]);
    return hiddenBranchDamage(mix, mix.branches[0], 400, 400);
  });
  assert.ok(damage[2] - damage[1] < damage[1] - damage[0]);
  const two = hiddenMix(['fire_element_dust', 'magic_unit']), three = hiddenMix(['fire_element_dust', 'magic_unit', 'magic_unit']);
  for (const defense of [0, 100, 400, 4000]) close(hiddenBranchDamage(three, three.branches[0], 400, defense) / hiddenBranchDamage(two, two.branches[0], 400, defense), damage[1] / damage[0]);
});

test('枚举1807份清单：主材与辅材顺序、权重、概率、费用及范围边界', () => {
  let bags = 0, cases = 0, maxMana = 0;
  const codes = hiddenParticles.map(particle => particle.code);
  const visit = (bag: string[], start: number) => {
    if (bag.length >= 2) {
      bags++;
      for (const primary of new Set(bag)) for (const kettle of [false, true]) {
        cases++;
        const rest = [...bag]; rest.splice(rest.indexOf(primary), 1);
        const input = [primary, ...rest], normal = hiddenMix(input, 'success', kettle), great = hiddenMix(input, 'great', kettle), failure = hiddenMix(input, 'failure', kettle);
        assert.deepEqual(normal.branches, hiddenMix([primary, ...rest.reverse()], 'success', kettle).branches);
        close(normal.branches.reduce((sum, branch) => sum + branch.weight, 0), 1);
        assert.ok(normal.targets <= 3 && great.targets <= 4 && great.duration <= 4);
        assert.equal(failure.mana, normal.mana); assert.equal(great.mana, normal.mana);
        assert.equal(failure.targets, normal.targets);
        maxMana = Math.max(maxMana, normal.mana);
        for (const branch of normal.branches) assert.ok(branch.damageScale <= 1.9 && branch.healScale <= 1.9 && branch.stateScale <= 1.6);
        for (const catalyst of [undefined, 'stable', 'excite'] as const) {
          const probability = hiddenMixProbability(bag.length, catalyst, kettle);
          assert.equal(Object.values(probability).reduce((sum, value) => sum + value, 0), 100);
          assert.ok(Object.values(probability).every(value => value >= 0));
        }
      }
    }
    if (bag.length < 4) for (let i = start; i < codes.length; i++) visit([...bag, codes[i]], i);
  };
  visit([], 0);
  assert.equal(bags, 1807); assert.equal(cases, 10896); assert.equal(maxMana, 475);
  assert.throws(() => hiddenMix(['wind_element_dust']));
  assert.throws(() => hiddenMix(Array(5).fill('magic_unit')));
  assert.throws(() => hiddenMix(['gold_element_dust', 'magic_unit']));
});

test('40环叙事、目标与教学步骤齐全；观察任务不伪造成按钮答案', () => {
  assert.equal(hiddenQuests.length, 40);
  const document = readFileSync(new URL('../docs/隐藏二转·四店任务剧情文案.md', import.meta.url), 'utf8');
  for (const profession of hiddenProfessions) {
    const quests = hiddenQuests.filter(quest => quest.profession === profession.code);
    assert.deepEqual(quests.map(quest => quest.stage), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.ok(hiddenQuestRetry(profession.code).includes(profession.mentor.split('·')[0]));
    for (const quest of quests) {
      const story = hiddenQuestStory(profession.code, quest.stage);
      for (const field of ['scene', 'speech', 'completed'] as const) {
        assert.ok(story[field]); assert.ok(document.includes(story[field]), `${profession.code} ${quest.stage} 文稿与剧情源不同步`);
      }
      const steps = hiddenLessonSteps(profession.code, quest.stage);
      if (profession.code === 'tactician' && quest.stage === 2) { assert.equal(steps.length, 0); continue; }
      assert.ok(steps.length, `${profession.code} ${quest.stage} 缺操作`);
      let state = newHiddenLesson();
      for (const step of steps) {
        const before = { ...state };
        const wrong = (step.correct + 1) % step.choices.length;
        const retry = advanceHiddenLesson(profession.code, quest.stage, state, wrong);
        assert.equal(retry.cursor, state.cursor); assert.equal(retry.complete, false);
        assert.deepEqual(state, before, '失败不得原地篡改已持久化记录');
        state = advanceHiddenLesson(profession.code, quest.stage, retry, step.correct);
      }
      assert.equal(state.complete, true);
      assert.throws(() => advanceHiddenLesson(profession.code, quest.stage, state, 0));
    }
  }
});
