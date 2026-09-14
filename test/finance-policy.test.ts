import test from 'node:test';
import assert from 'node:assert/strict';
import { financeNewsPriceNote, financePriceDirectionMatched, financePveVictoryEligible, financeRedironEncounterEligible, financeRumorPairIndex, financeRumorPairs, publicFinanceNews } from '../src/game/finance-policy';
import { nextFinancePeriod, stableFinancePrices } from '../src/game/finance-math';
import { financeFactions } from '../src/game/finance-content';

test('赤铁事件只有真正推进的选择才可完成势力委托和产生利好', () => {
  assert.equal(financeRedironEncounterEligible({ choice: 'withdraw', stage: 0, copper: 0 }), false);
  assert.equal(financeRedironEncounterEligible({ choice: 'leave', stage: 0 }), false);
  assert.equal(financeRedironEncounterEligible({ choice: 'seal', stage: 1 }), true);
  assert.equal(financeRedironEncounterEligible({ choice: 'follow', stage: 2 }), true);
  assert.equal(financeRedironEncounterEligible({ choice: 'seal' }), false);
});

test('正式野外胜利可记分，击退城镇执法者和试炼目标不可记正向行情', () => {
  assert.equal(financePveVictoryEligible([{ cityPursuit: false, bossTest: false, professionTrial: false }]), true);
  assert.equal(financePveVictoryEligible([{ cityPursuit: true, bossTest: false, professionTrial: false }]), false);
  assert.equal(financePveVictoryEligible([{ cityPursuit: false, bossTest: true, professionTrial: false }]), false);
  assert.equal(financePveVictoryEligible([{ cityPursuit: false, bossTest: false, professionTrial: true }]), false);
  assert.equal(financePveVictoryEligible([]), false);
});

test('新闻应验与最终报价分开公示，不把利好遇跌写成涨价兑现', () => {
  const market = stableFinancePrices(Array.from({ length: 10 }, (_, index) => ({ code: String(index), priceMilli: 100_000, shares: 10_000, score: index === 0 ? 3 : 10 })));
  assert.equal(Math.round(market[0]!.nextMilli / 1000), 97);
  assert.match(financeNewsPriceNote(1, 'fulfilled', 100_000, market[0]!.nextMilli), /利好.*100→97.*反向/);
  assert.match(financeNewsPriceNote(-1, 'fulfilled', 100_000, 103_000), /利空.*100→103.*反向/);
  assert.match(financeNewsPriceNote(1, 'reversed', 100_000, 97_000), /利空.*100→97.*同向/);
  assert.match(financeNewsPriceNote(1, 'fulfilled', 100_000, 100_100), /利好.*100→100.*未变/);
});

test('交谈区每段只公示同一条历史摘录，不泄漏整段传闻', () => {
  const news = [{ id: 7, direction: 1 }, { id: 9, direction: -1 }];
  const first = publicFinanceNews('2026091408', news);
  assert.equal(first.length, 1);
  assert.deepEqual(publicFinanceNews('2026091408', [...news].reverse()), first);
  assert.deepEqual(publicFinanceNews('2026091408', [{ id: 7, direction: 1 }]), []);
});

test('五组题材传闻覆盖全部开放势力，连续五段各轮到一次', () => {
  const codes = financeRumorPairs.flatMap(pair => [...pair]);
  assert.equal(new Set(codes).size, codes.length);
  assert.deepEqual(new Set(codes), new Set(financeFactions.filter(faction => faction.status === 'open').map(faction => faction.code)));
  let period = '2026091400';
  const seen = new Set<number>();
  for (let i = 0; i < financeRumorPairs.length; i++) {
    seen.add(financeRumorPairIndex(period, financeRumorPairs.length));
    period = nextFinancePeriod(period);
  }
  assert.equal(seen.size, financeRumorPairs.length);
});

test('方向兑现按整铜币成交报价判定，参考价微动不算命中', () => {
  assert.equal(financePriceDirectionMatched(100_000, 100_499, 1), false);
  assert.equal(financePriceDirectionMatched(100_000, 100_500, 1), true);
  assert.equal(financePriceDirectionMatched(100_000, 99_499, -1), true);
  assert.equal(financePriceDirectionMatched(100_000, 99_500, -1), false);
});
