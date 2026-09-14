import test from 'node:test';
import assert from 'node:assert/strict';
import { financeFactions } from '../src/game/finance-content';
import { financeBusinessDate, financePeriodKey, nextFinancePeriod, previousFinancePeriod, stableFinancePrices, tryConstrainedFinancePrices } from '../src/game/finance-math';

test('开放势力均有独立的 12 涨、12 跌，且每条预言对应应验与专属反转', () => {
  const open = financeFactions.filter(faction => faction.status === 'open');
  assert.equal(open.length, 10);
  assert.equal(financeFactions.filter(faction => faction.status === 'watch').length, 5);
  for (const faction of open) {
    assert.ok(faction.building && faction.source, faction.name);
    assert.equal(faction.rise.length, 12, faction.name);
    assert.equal(faction.fall.length, 12, faction.name);
    const texts = [...faction.rise, ...faction.fall].flatMap(scene => [scene.prophecy, scene.fulfilled, scene.reversal]);
    assert.equal(texts.length, 72, faction.name);
    assert.equal(new Set(texts).size, 72, faction.name);
  }
});

test('集中利好时强势份额上涨、闲置份额被动回落，发行份额加权总值守恒', () => {
  const before = [
    { code: 'a', priceMilli: 100_000, shares: 10_000, score: 10 },
    { code: 'b', priceMilli: 100_000, shares: 10_000, score: 8 },
    { code: 'c', priceMilli: 100_000, shares: 10_000, score: 0 },
    { code: 'd', priceMilli: 100_000, shares: 10_000, score: 0 }
  ];
  const after = stableFinancePrices(before);
  assert.ok(after[0]!.nextMilli > before[0]!.priceMilli);
  assert.ok(after[1]!.nextMilli > before[1]!.priceMilli);
  assert.ok(after[2]!.nextMilli < before[2]!.priceMilli);
  assert.ok(after[3]!.nextMilli < before[3]!.priceMilli);
  assert.equal(after.reduce((sum, item) => sum + item.nextMilli * item.shares, 0), before.reduce((sum, item) => sum + item.priceMilli * item.shares, 0));
  for (const item of after) assert.ok(Math.abs(item.nextMilli / item.priceMilli - 1) <= .05001);
});

test('全体同向贡献不会推动整个市场齐涨', () => {
  const stocks = Array.from({ length: 10 }, (_, index) => ({ code: String(index), priceMilli: 120_000, shares: 10_000, score: 10 }));
  assert.ok(stableFinancePrices(stocks).every(item => item.nextMilli === item.priceMilli));
});

test('传闻方向与真实经营相反时，仍可在限幅和总值内匹配整铜币涨跌', () => {
  const before = Array.from({ length: 10 }, (_, index) => ({ code: String(index), priceMilli: 100_000, shares: 10_000, score: index === 0 ? 3 : index === 1 ? -3 : 10 }));
  const after = tryConstrainedFinancePrices(before, new Map([['0', 1], ['1', -1]]));
  assert.ok(after);
  assert.ok(Math.round(after[0]!.nextMilli / 1000) > 100);
  assert.ok(Math.round(after[1]!.nextMilli / 1000) < 100);
  assert.equal(after.reduce((sum, item) => sum + item.nextMilli * item.shares, 0), before.reduce((sum, item) => sum + item.priceMilli * item.shares, 0));
  for (const item of after) assert.ok(Math.abs(item.nextMilli / item.priceMilli - 1) <= .05001);
});

test('涨跌停或总值无解的方向约束不可硬凑，求解器返回不可行', () => {
  const atDailyLimit = [
    { code: 'rise', priceMilli: 120_000, dayAnchorMilli: 100_000, shares: 10_000, score: 3 },
    { code: 'fall', priceMilli: 100_000, dayAnchorMilli: 100_000, shares: 10_000, score: -3 }
  ];
  assert.equal(tryConstrainedFinancePrices(atDailyLimit, new Map([['rise', 1], ['fall', -1]])), null);
  const onlyRise = [
    { code: 'a', priceMilli: 100_000, shares: 10_000, score: 3 },
    { code: 'b', priceMilli: 100_000, shares: 10_000, score: 3 }
  ];
  assert.equal(tryConstrainedFinancePrices(onlyRise, new Map([['a', 1], ['b', 1]])), null);
});

test('多组真实业务分分布下，方向约束不破坏整铜币限幅与发行总值', () => {
  for (let sample = 0; sample < 100; sample++) {
    const before = Array.from({ length: 10 }, (_, index) => ({ code: String(index), priceMilli: 100_000, dayAnchorMilli: 100_000, shares: 10_000, score: ((sample * 7 + index * 13) % 21) - 10 }));
    const after = tryConstrainedFinancePrices(before, new Map([['0', 1], ['1', -1]]));
    assert.ok(after, String(sample));
    assert.ok(Math.round(after[0]!.nextMilli / 1000) >= 101, String(sample));
    assert.ok(Math.round(after[1]!.nextMilli / 1000) <= 99, String(sample));
    assert.equal(after.reduce((sum, item) => sum + item.nextMilli * item.shares, 0), 10_000_000_000, String(sample));
    for (const item of after) assert.ok(item.nextMilli >= 95_000 && item.nextMilli <= 105_000, `${sample}:${item.code}`);
  }
});

test('临界小数不会使整铜币成交价越过单轮或当日限幅', () => {
  const singleRound = stableFinancePrices([
    { code: 'strong', priceMilli: 95_499, shares: 10_000, score: 20 },
    { code: 'weak', priceMilli: 95_499, shares: 10_000, score: -20 }
  ]);
  assert.ok(Math.round(singleRound[0]!.nextMilli / 1000) <= 99);
  const sameDay = stableFinancePrices([
    { code: 'strong', priceMilli: 114_000, dayAnchorMilli: 95_499, shares: 10_000, score: 20 },
    { code: 'weak', priceMilli: 114_000, dayAnchorMilli: 95_499, shares: 10_000, score: -20 }
  ]);
  assert.ok(Math.round(sameDay[0]!.nextMilli / 1000) <= 114);
});

test('多组不均衡行情仍守住总参考值与单段涨跌幅', () => {
  for (let sample = 0; sample < 100; sample++) {
    const stocks = Array.from({ length: 10 }, (_, index) => ({ code: String(index), priceMilli: 70_000 + ((sample * 7919 + index * 104729) % 90_000), shares: 10_000, score: ((sample * 17 + index * 13) % 31) - 15 }));
    const after = stableFinancePrices(stocks);
    assert.equal(after.reduce((sum, item) => sum + item.nextMilli * item.shares, 0), stocks.reduce((sum, item) => sum + item.priceMilli * item.shares, 0), String(sample));
    for (const item of after) {
      assert.ok(Math.abs(item.nextMilli / item.priceMilli - 1) <= .05001, `${sample}:${item.code}`);
      const beforeQuote = Math.max(1, Math.round(item.priceMilli / 1000));
      const afterQuote = Math.max(1, Math.round(item.nextMilli / 1000));
      assert.ok(afterQuote >= Math.ceil(beforeQuote * .95) && afterQuote <= Math.floor(beforeQuote * 1.05), `${sample}:${item.code}:trade quote`);
    }
  }
});

test('同一上海营业日反复集中利好，也不突破开盘锚点的 20% 上限', () => {
  let stocks = Array.from({ length: 10 }, (_, index) => ({ code: String(index), priceMilli: 100_000, dayAnchorMilli: 100_000, shares: 10_000, score: index === 0 ? 20 : 0 }));
  for (let period = 0; period < 6; period++) {
    const next = stableFinancePrices(stocks);
    for (const item of next) {
      assert.ok(item.nextMilli >= 80_000 && item.nextMilli <= 120_000, `${period}:${item.code}`);
      assert.ok(Math.abs(item.nextMilli / item.priceMilli - 1) <= .05001, `${period}:${item.code}`);
      const quote = Math.round(item.nextMilli / 1000), beforeQuote = Math.round(item.priceMilli / 1000);
      assert.ok(quote >= Math.ceil(beforeQuote * .95) && quote <= Math.floor(beforeQuote * 1.05), `${period}:${item.code}:trade quote`);
      assert.ok(quote >= 80 && quote <= 120, `${period}:${item.code}:daily trade quote`);
    }
    assert.equal(next.reduce((sum, item) => sum + item.nextMilli * item.shares, 0), stocks.reduce((sum, item) => sum + item.priceMilli * item.shares, 0));
    stocks = next.map(item => ({ code: item.code, priceMilli: item.nextMilli, dayAnchorMilli: 100_000, shares: item.shares, score: item.score }));
  }
  assert.equal(stocks[0]!.priceMilli, 120_000);
});

test('营业日与四小时时段按上海时间跨日', () => {
  assert.equal(financeBusinessDate(new Date('2026-09-12T15:59:59Z')), '20260912');
  assert.equal(financeBusinessDate(new Date('2026-09-12T16:00:00Z')), '20260913');
  assert.equal(financePeriodKey(new Date('2026-09-12T16:00:00Z')), '2026091300');
  assert.equal(previousFinancePeriod('2026091300'), '2026091220');
  assert.equal(nextFinancePeriod('2026091220'), '2026091300');
});
