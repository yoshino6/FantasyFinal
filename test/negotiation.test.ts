import test from 'node:test';
import assert from 'node:assert/strict';
import { moodBands, moodBand, negotiationProbability, moodDropMultiplier, giftAggression, initialNegotiationState, resolveNegotiationMove, synchronizeNegotiation, normalWeights, drawHiddenAttribute, teamLuckMultiplier, weightedRecipient, dropBatches, scaledDropEntries } from '../src/game/negotiation-rules';
import { classifyNegotiationItem, negotiationInventoryPage, particleTypes } from '../src/game/negotiation-item-policy';
import { creatureVoices, monsterNegotiationProfile, negotiationFamily } from '../src/config/monster-negotiation';
import { negotiationDialogue } from '../src/config/monster-negotiation-dialogues';

test('零心情为戒备，曲线通过 50%=20% 和 100%=100%，低投入产出下降', () => {
  assert.equal(moodBand(0).name, '戒备'); assert.equal(moodBand(-1).name, '敌意');
  assert.ok(Math.abs(negotiationProbability(500000) - .2) < 1e-12);
  for (const charm of [-100, 0, 100]) { assert.equal(negotiationProbability(0, charm), 0); assert.equal(negotiationProbability(-1, charm), 0); assert.equal(negotiationProbability(1000000, charm), 1); }
  assert.ok(negotiationProbability(500000, 100) > negotiationProbability(500000, -100));
  assert.deepEqual([200000, 500000, 1000000].map(moodDropMultiplier), [.4, 1, 2]);
});
test('所有心情下一般物品开战风险低于厌恶；心情越低越危险', () => {
  for (let mood = -1000000; mood < 1000000; mood += 10000) {
    assert.ok(giftAggression(mood, 'neutral') < giftAggression(mood, 'dislike'));
    assert.ok(giftAggression(mood, 'neutral') > giftAggression(mood + 10000, 'neutral'));
    assert.equal(giftAggression(mood, 'like'), 0);
  }
});
test('两次喜好、一次一般、一次喜好获得保护，首次触怒必定被拦截，可重复积累', () => {
  let state = initialNegotiationState();
  const gift = (preference: 'like' | 'neutral' | 'dislike', random = () => 1) => {
    const result = resolveNegotiationMove(state, { type: 'gift', preference, value: 1, capacity: 100 }, random); state = result.state; return result;
  };
  gift('like', () => 0); gift('like', () => 0); gift('neutral'); assert.equal(state.goodwill, 2);
  assert.equal(gift('like', () => 0).earned, true); assert.equal(state.protection, 1);
  const protectedMove = gift('dislike', () => 0); assert.equal(protectedMove.result, 'ongoing'); assert.equal(protectedMove.protected, true); assert.equal(state.goodwill, 0);
  for (let i = 0; i < 6; i++) assert.equal(gift('like', () => 0).result, 'ongoing');
  assert.equal(state.protection, 2);
  assert.equal(gift('neutral', () => 0).protected, true); assert.equal(state.protection, 1);
});
test('分数心情累计、满心情拒收、交谈失败重置未完成积累', () => {
  let state = initialNegotiationState();
  for (let i = 0; i < 10; i++) state = resolveNegotiationMove(state, { type: 'gift', preference: 'like', value: 1, capacity: 1e7 }, () => 0).state;
  assert.ok(state.mood >= 0 && state.mood <= 1); assert.ok(state.goodwill <= 1);
  assert.equal(resolveNegotiationMove(initialNegotiationState(1000000), { type: 'gift', preference: 'like', value: 1, capacity: 1 }, () => 0).refused, true);
  const failure = resolveNegotiationMove({ ...initialNegotiationState(), goodwill: 2 }, { type: 'talk', charm: 100 }, () => 1);
  assert.equal(failure.state.mood, -20000); assert.equal(failure.state.goodwill, 0); assert.equal(failure.state.failures, 1);
});
test('换队以共享与成员历史最低心情为准，新人不会把正心情归零', () => {
  const shared = { ...initialNegotiationState(800000), goodwill: 2, protection: 1 };
  assert.equal(synchronizeNegotiation(shared, []).mood, 800000);
  const joined = synchronizeNegotiation(shared, [{ ...initialNegotiationState(-100000), failures: 4 }]);
  assert.equal(joined.mood, -100000); assert.equal(joined.goodwill, 0); assert.equal(joined.protection, 1); assert.equal(joined.failures, 4);
});
test('隐藏属性离散正态对称，边界可达；队伍幸运乘算，分配独立加权', () => {
  assert.equal(normalWeights.length, 201);
  for (let i = 0; i < 201; i++) assert.equal(normalWeights[i], normalWeights[200 - i]);
  assert.equal(drawHiddenAttribute(() => 0), -100); assert.equal(drawHiddenAttribute(() => 1 - Number.EPSILON), 100); assert.equal(drawHiddenAttribute(() => .5), 0);
  assert.ok(Math.abs(teamLuckMultiplier([-100, -100, -100, -100]) - .4096) < 1e-12);
  assert.ok(Math.abs(teamLuckMultiplier([100, 100, 100, 100]) - 2.0736) < 1e-12);
  assert.equal(teamLuckMultiplier([]), 1); assert.equal(weightedRecipient([-100, 100], value => value, () => .45), 100);
  assert.equal(dropBatches(1, 2.0736, () => .05), 3); assert.equal(dropBatches(1, 2.0736, () => .1), 2); assert.equal(dropBatches(1, .4096, () => .5), 0);
});
const item = { id: 1, code: 'wood_element_dust', name: '木元素微尘', item_type: 'material', item_category: '粒子', stackable: 1, trade_price: 3, quantity: 12 };
test('互斥组单批不重复，额外批次各自独立选品种', () => {
  const entries = [{ code: '普通凝胶', chance: .8, group: 'gel' }, { code: '彩色凝胶', chance: .2, group: 'gel' }];
  const draws = [.5, .1, .9];
  assert.deepEqual(scaledDropEntries(entries, item => item.chance, 2, () => draws.shift()!).map(item => item.code), ['普通凝胶', '彩色凝胶']);
  assert.equal(scaledDropEntries(entries, item => item.chance, 1, () => .9).length, 1);
});
test('实例、装备、地图、任务凭证、育成和绑定库存不能绕过物品限制；分页每页十条', () => {
  assert.equal(classifyNegotiationItem(item).usable, true);
  assert.equal(classifyNegotiationItem({ ...item, source: 'instance' }).usable, false);
  assert.equal(classifyNegotiationItem({ ...item, item_type: 'equipment' }).usable, false);
  for (const category of ['地图', '任务', 'Boss部件', '世界印记', '育成', '图纸', '技能书']) assert.equal(classifyNegotiationItem({ ...item, item_category: category }).usable, false);
  assert.equal(classifyNegotiationItem({ ...item, effect_json: { important: true } }).usable, false);
  assert.equal(classifyNegotiationItem({ ...item, code: 'map_rabbit_bone', item_category: '怪材', trade_price: 0, effect_json: { monster_craft_material: 'bone' } }).usable, true);
  assert.equal(classifyNegotiationItem({ ...item, code: 'meat_chunk', item_category: '食材', trade_price: 0 }).usable, true);
  const items = Array.from({ length: 21 }, (_, i) => ({ ...item, id: i + 1, code: `wood${i}`, item_category: '锻材' }));
  assert.equal(negotiationInventoryPage(items, 1).items.length, 10); assert.equal(negotiationInventoryPage(items, 3).items.length, 1); assert.equal(negotiationInventoryPage([{ ...item, personal_bound_quantity: 12 }]).total, 0);
});
test('每种形态、八档心情、三种物品反应均有两条不重复文案，所有粒子明确归类', () => {
  for (const family of Object.keys(creatureVoices) as Array<keyof typeof creatureVoices>) {
    for (const band of moodBands) for (const preference of ['like', 'neutral', 'dislike'] as const) {
      const first = negotiationDialogue(family, band.min, preference, '粒子·木', '木元素微尘', '', () => 0);
      const next = negotiationDialogue(family, band.min, preference, '粒子·木', '木元素微尘', first.key, () => 0);
      assert.notEqual(first.text, next.text); assert.ok(first.text.includes('木元素微尘')); assert.ok(!first.text.includes('{物品}'));
    }
  }
  for (const code of ['ball_rabbit', 'slime_red', 'shadow_wolf', 'tree_ent', 'goblin']) {
    const profile = monsterNegotiationProfile(code, '');
    assert.equal(Object.keys(profile.particles).length, Object.keys(particleTypes).length);
    assert.ok(Object.values(profile.particles).includes('like')); assert.ok(Object.values(profile.particles).includes('dislike'));
  }
  assert.equal(negotiationFamily('reed_spirit', '湿苇芦灵'), 'tree');
});
