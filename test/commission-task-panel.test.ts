import assert from 'node:assert/strict';
import test from 'node:test';
import { taskPanelObjectiveForSiteCommission } from '../src/game/world-dynamics.content';

test('站点委托任务栏只保留可执行目标', () => {
  const legacy = '缘由：收到三份矛盾传闻。\n当地情形：雨棚下人声嘈杂。\n目标：前往归途驿舍核对最早的口述记录，标明可信来源。\n完成后：登记公共进展。';
  assert.equal(taskPanelObjectiveForSiteCommission(legacy, '归途驿舍'), '前往归途驿舍核对最早的口述记录，标明可信来源。');
  assert.equal(taskPanelObjectiveForSiteCommission('前往根冠驿亭，将封签交给值守人。', '根冠驿亭'), '前往根冠驿亭，将封签交给值守人。');
  assert.equal(taskPanelObjectiveForSiteCommission('缘由：旧档案损坏。', '旧钟档案室'), '前往旧钟档案室完成交接。');
});
