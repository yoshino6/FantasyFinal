import assert from 'node:assert/strict';
import test from 'node:test';
import { skillSpecialization, specializationBenefitWeight, specializeEffectDuration, specializeEffectValue } from '../src/game/skill-specialization';
import { specializationPerLevelLines } from '../src/game/skill-specialization-presentation';
const base = { code: 'test', category: 'magic', tier: '中位', power: 100, mana_cost: 300, cooldown_turns: 3, chant_turns: 0 };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('39次加点逐次核对收益乘算、25%地板、固定惩罚和节能', () => {
  let over = 1, speed = 1, mana = 1, control = 1;
  for (let point = 1; point <= 39; point++) {
    const weight = Math.max(.25, .9 ** (point - 1));
    close(specializationBenefitWeight(point), weight);
    over *= 1 + .08 * weight; speed *= 1 - .08 * weight; mana *= 1 - .32 * weight; control *= 1 + .015 * weight;
    const result = skillSpecialization(base, { overcharge: point + 1, potent: point + 1, instant: point + 1, efficient: point + 1 });
    close(result.powerFactor, over * .96 ** point); close(result.effectFactor, over * .96 ** point);
    close(result.controlChanceFactor, control * .96 ** point);
    close(result.supportFactor, over * .96 ** point);
    const instantOnly = skillSpecialization(base, { instant: point + 1 });
    close(instantOnly.powerFactor, .96 ** point); close(instantOnly.effectFactor, .96 ** point); close(instantOnly.controlChanceFactor, .96 ** point);
    assert.match(specializationPerLevelLines('中位', { instant: point }).instant[0], /威力、效果、控制概率系数−4%/);
    close(result.durationChange, over - 1);
    close(result.timeFactor, 1.08 ** (point * 2) * speed);
    close(result.manaFactor, 1.16 ** (point * 2) * mana);
    assert.equal(result.mana, Math.ceil(300 * result.manaFactor - 1e-9));
    for (const tier of ['基础', '下位', '中位']) if (point < (tier === '基础' ? 10 : tier === '下位' ? 20 : 40)) {
      assert.deepEqual(skillSpecialization({ ...base, tier }, { overcharge: point + 1 }), skillSpecialization(base, { overcharge: point + 1 }));
    }
  }
  close(specializationBenefitWeight(14), .9 ** 13); close(specializationBenefitWeight(15), .25);
});

test('第15点起收益稳定25%，面板展示乘算当前值而非累计倍率之差', () => {
  const lines = specializationPerLevelLines('中位', { overcharge: 15, potent: 15, instant: 15, efficient: 15 });
  assert.equal(lines.overcharge[0], '升至Lv.16：威力+2%；蓝耗+16%；冷却/吟唱基数+8%。');
  assert.match(lines.instant[0], /冷却\/吟唱基数−2%；威力、效果、控制概率系数−4%/);
  assert.match(lines.efficient[0], /蓝耗−8%/);
});

test('节能不先按整数MP递推、不设原始蓝耗下限、正蓝耗至少1', () => {
  assert.equal(skillSpecialization(base, { efficient: 40 }).mana, 3);
  assert.equal(skillSpecialization({ ...base, mana_cost: 1 }, { efficient: 40 }).mana, 1);
  assert.equal(skillSpecialization({ ...base, mana_cost: 0 }, { efficient: 40 }).mana, 0);
  assert.equal(skillSpecialization({ ...base, mana_cost: 10 }, { efficient: 3 }).mana, 5);
  assert.equal(skillSpecialization({ ...base, code: 'resident_d01', mana_cost: 500 }, { efficient: 40, overcharge: 40 }).mana, 500);
});

test('强效时长从原始小数倍率结算，既有状态上限与机制保护仍生效', () => {
  const level7 = skillSpecialization(base, { potent: 7 });
  assert.equal(specializeEffectDuration('slow', 3, level7.durationChange), 4);
  assert.equal(specializeEffectDuration('shield', 1, skillSpecialization(base, { potent: 19 }).durationChange), 1);
  assert.equal(specializeEffectDuration('shield', 1, skillSpecialization(base, { potent: 20 }).durationChange), 2);
  assert.equal(specializeEffectDuration('petrify', 3, 10), 3);
  assert.equal(specializeEffectDuration('nightmare', 0, 10), 0);
  assert.equal(specializeEffectDuration('slow', 3, 10), 4);
  assert.equal(specializeEffectValue('attack', 10, 2.5), 25);
  assert.equal(specializeEffectValue('attack', 30, 2.5), 50);
});
