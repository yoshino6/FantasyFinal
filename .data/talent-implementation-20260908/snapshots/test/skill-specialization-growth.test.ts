import assert from 'node:assert/strict';
import test from 'node:test';
import { skillSpecialization, specializeEffectDuration, specializeEffectValue } from '../src/game/skill-specialization';
import { specializationPerLevelLines } from '../src/game/skill-specialization-presentation';
const base = { code: 'test', category: 'magic', tier: '中位', power: 100, mana_cost: 300, cooldown_turns: 3, chant_turns: 0 };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('39次加点每级固定乘算，瞬息不削弱威力效果，三项增耗独立叠乘', () => {
  for (let point = 1; point <= 39; point++) {
    const result = skillSpecialization(base, { overcharge: point + 1, potent: point + 1, instant: point + 1, efficient: point + 1 });
    close(result.powerFactor, 1.06 ** point); close(result.effectFactor, 1.06 ** point);
    close(result.controlChanceFactor, 1.06 ** point); close(result.supportFactor, 1.06 ** point);
    const instantOnly = skillSpecialization(base, { instant: point + 1 });
    close(instantOnly.powerFactor, 1); close(instantOnly.effectFactor, 1); close(instantOnly.controlChanceFactor, 1);
    close(result.durationChange, 1.06 ** point - 1); close(result.timeFactor, .94 ** point);
    close(result.manaFactor, 1.12 ** (point * 3) * .88 ** point);
    assert.equal(result.mana, Math.ceil(300 * result.manaFactor - 1e-9));
    for (const tier of ['基础', '下位', '中位']) if (point < (tier === '基础' ? 10 : tier === '下位' ? 20 : 40)) {
      assert.deepEqual(skillSpecialization({ ...base, tier }, { overcharge: point + 1 }), skillSpecialization(base, { overcharge: point + 1 }));
    }
    const lines = specializationPerLevelLines('中位', { overcharge: point, potent: point, instant: point, efficient: point });
    assert.match(lines.overcharge[0], /威力\+6%；蓝耗\+12%/);
    assert.match(lines.potent[0], /控制概率系数\+6%；蓝耗\+12%/);
    assert.match(lines.instant[0], /冷却\/吟唱基数−6%；蓝耗\+12%/);
    assert.match(lines.efficient[0], /蓝耗−12%/);
  }
});

test('节能不先按整数MP递推、不设原始蓝耗下限、正蓝耗至少1', () => {
  assert.equal(skillSpecialization(base, { efficient: 40 }).mana, 3);
  assert.equal(skillSpecialization({ ...base, mana_cost: 1 }, { efficient: 40 }).mana, 1);
  assert.equal(skillSpecialization({ ...base, mana_cost: 0 }, { efficient: 40 }).mana, 0);
  assert.equal(skillSpecialization({ ...base, mana_cost: 10 }, { efficient: 3 }).mana, 8);
  assert.equal(skillSpecialization({ ...base, code: 'resident_d01', mana_cost: 500 }, { efficient: 40, overcharge: 40 }).mana, 500);
});

test('强效时长从原始小数倍率结算，既有状态上限与机制保护仍生效', () => {
  const level7 = skillSpecialization(base, { potent: 7 });
  assert.equal(specializeEffectDuration('slow', 3, level7.durationChange), 4);
  assert.equal(specializeEffectDuration('shield', 1, skillSpecialization(base, { potent: 12 }).durationChange), 1);
  assert.equal(specializeEffectDuration('shield', 1, skillSpecialization(base, { potent: 13 }).durationChange), 2);
  assert.equal(specializeEffectDuration('petrify', 3, 10), 3);
  assert.equal(specializeEffectDuration('nightmare', 0, 10), 0);
  assert.equal(specializeEffectDuration('slow', 3, 10), 4);
  assert.equal(specializeEffectValue('attack', 10, 2.5), 25);
  assert.equal(specializeEffectValue('attack', 30, 2.5), 50);
});
