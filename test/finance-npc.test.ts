import test from 'node:test';
import assert from 'node:assert/strict';
import { npcBuyAllocation, npcSellSupport, npcTargetShares } from '../src/game/finance-npc';

test('域民投资团先出售自己持有的份额，剩余才从发行库存出售', () => {
  assert.deepEqual(npcBuyAllocation(4, 2, 3), { fromNpc: 2, fromTreasury: 2 });
  assert.throws(() => npcBuyAllocation(4, 2, 1), /没有可出售的份额/);
});

test('报价上涨后可由已入账的域民资本承接回购，资金不足时不得透支', () => {
  assert.equal(npcSellSupport(101, 12_000_000, 100), 0);
  assert.equal(npcSellSupport(101, 80, 21), 21);
  assert.throws(() => npcSellSupport(101, 80, 20), /准备金不足/);
});

test('域民自动调仓随真实经营分变化且限制目标仓位', () => {
  assert.equal(npcTargetShares(0), 1000);
  assert.equal(npcTargetShares(3), 1120);
  assert.equal(npcTargetShares(-3), 880);
  assert.equal(npcTargetShares(100), 1600);
  assert.equal(npcTargetShares(-100), 300);
});
