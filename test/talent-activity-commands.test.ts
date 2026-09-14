import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseTalentActivity, talentActivityCommands } from '../src/game/talent-activities';

test('生活操作只显示给会实际触发效果的天赋', () => {
  assert.deepEqual(talentActivityCommands('B05'), []);
  assert.deepEqual(talentActivityCommands('B09'), ['调查机关']);
  assert.deepEqual(talentActivityCommands('E10'), ['购买种子', '种植']);
  assert.deepEqual(talentActivityCommands('D03'), ['赠礼']);
  assert.deepEqual(talentActivityCommands('D05'), ['共餐']);
  assert.deepEqual(talentActivityCommands('D04'), ['委托', '立约委托']);
  assert.equal(canUseTalentActivity('A05', '赠礼'), false);
  assert.equal(canUseTalentActivity('B05', '调查', '废墟'), false);
  assert.equal(canUseTalentActivity('B09', '调查', '机关'), true);
  assert.equal(canUseTalentActivity('B09', '调查', '废墟'), false);
});
