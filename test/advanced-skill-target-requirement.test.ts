import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { advancedTargetRequirementForSkill } from '../src/game/advanced-resource.config';

test('无声终章与百发协猎都要求目标具有追猎标定', () => {
  assert.deepEqual(advancedTargetRequirementForSkill('nightblade_silent_finale'), { effectCode: 'advanced_hunt', effectName: '追猎标定' });
  assert.deepEqual(advancedTargetRequirementForSkill('ranger_hundred_hunt'), { effectCode: 'advanced_hunt', effectName: '追猎标定' });
  assert.equal(advancedTargetRequirementForSkill('nightblade_shadow_mark'), undefined);
});

test('目标前置条件在行动写入前校验，失败不会提交 pending_action', () => {
  const source = readFileSync(new URL('../src/game/adventure.service.ts', import.meta.url), 'utf8');
  const actionStart = source.indexOf('const combatActionInTransaction = async');
  const validation = source.indexOf('advancedTargetRequirementForSkill', actionStart);
  const pendingWrite = source.indexOf("UPDATE combat_members SET pending_action=?", actionStart);
  assert.ok(actionStart >= 0 && validation > actionStart, '应在战斗行动事务中执行目标前置条件校验');
  assert.ok(pendingWrite > validation, '应先校验目标前置条件，再写入 pending_action');
  assert.match(source.slice(validation, pendingWrite), /行动未提交，本回合未消耗/);
});
