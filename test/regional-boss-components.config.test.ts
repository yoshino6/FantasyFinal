import assert from 'node:assert/strict';
import test from 'node:test';
import { regionalBossComponentDefinitions, regionalBossComponentsFor } from '../src/game/regional-boss-components.config';

test('两只区域 Boss 均配置三个有独立耐性的战斗部位', () => {
  assert.equal(regionalBossComponentDefinitions.length, 6);
  for (const bodyCode of ['gruen_mountainheart', 'valk_forge_overseer']) assert.equal(regionalBossComponentsFor(bodyCode).length, 3);
  for (const component of regionalBossComponentDefinitions) {
    assert.ok(component.hpRatio > 0 && component.hpRatio < 1);
    assert.equal(Object.keys(component.elementResistance).length, 9);
    assert.ok(Object.values(component.elementResistance).some(value => value < 0), `${component.name} 应有元素弱点`);
    assert.ok(Object.values(component.elementResistance).some(value => value >= 200), `${component.name} 应有极高元素抗性`);
  }
});

test('每个存活部位提供乘算的 30% 本体减伤', () => {
  assert.equal(Number(Math.pow(.7, 3).toFixed(3)), .343);
  assert.equal(Number(Math.pow(.7, 2).toFixed(2)), .49);
  assert.equal(Number(Math.pow(.7, 1).toFixed(2)), .7);
  assert.equal(Math.pow(.7, 0), 1);
});
