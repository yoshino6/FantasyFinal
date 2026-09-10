import assert from 'node:assert/strict';
import test from 'node:test';
import { skillSpecialization, specializationMaximum } from '../src/game/skill-specialization';
import { specializationPerLevelLines, specializationTotalLines, passiveSpecializationPerLevelLine } from '../src/game/skill-specialization-presentation';

for (const tier of ['基础', '下位', '中位']) test(`${tier} 首点相同，下一级按倍率比显示`, () => {
  const lines = specializationPerLevelLines(tier);
  assert.equal(lines.overcharge[0], '升至Lv.2：威力+6%；蓝耗+12%。');
  assert.equal(lines.efficient[0], '升至Lv.2：蓝耗−12%。');
  assert.ok(lines.potent[0].includes('效果、可成长时长、控制概率系数+6%'));
  assert.ok(passiveSpecializationPerLevelLine(tier).includes('+1.5%'));
  assert.ok(specializationPerLevelLines(tier, { overcharge: 2 }).overcharge[0].includes('威力+6%；蓝耗+12%'));
  const max = specializationMaximum(tier);
  assert.deepEqual(specializationPerLevelLines(tier, { overcharge: max }).overcharge, ['已满级，不能继续加点。']);
  assert.equal(passiveSpecializationPerLevelLine(tier, max), '已满级，不能继续加点。');
});

test('总体变化使用公式合算值，不相加每级展示的舍入值', () => {
  const base = { code: 'test', category: 'magic', tier: '中位', power: 150, mana_cost: 300, cooldown_turns: 3, chant_turns: 0 };
  const current = skillSpecialization(base, { overcharge: 2, potent: 2, instant: 2, efficient: 2 });
  const lines = specializationTotalLines(base, current);
  assert.ok(lines.includes('威力：150 → 159（+6%）'));
  assert.ok(lines.includes('蓝耗：300 → 371（+23.67%）'));
  assert.ok(lines.includes('冷却：3 → 3回合｜吟唱：0 → 0回合'));
  assert.ok(lines.some(line => line.includes('时间基数：−6%')));
});

test('零蓝耗和魔力转赠展示不除零、不遗漏额外成本', () => {
  const base = { code: 'test', category: 'utility', tier: '基础', power: 0, mana_cost: 0, cooldown_turns: 0, chant_turns: 0 };
  const text = specializationTotalLines(base, skillSpecialization(base)).join('\n');
  assert.match(text, /蓝耗：0 → 0（0%）/); assert.doesNotMatch(text, /NaN|Infinity|−0%/);
  const transfer = { ...base, code: 'resident_d01', mana_cost: 500 };
  assert.ok(specializationTotalLines(transfer, skillSpecialization(transfer)).includes('蓝耗：固定500＋施法前当前MP的8%（不受专精影响）'));
});
