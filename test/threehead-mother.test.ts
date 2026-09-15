import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatRules, emptyRuleState, type RuleUnit } from '../src/game/combat-rule-registry';
import { addThreeheadDot, installThreeheadMotherDamage, settleThreeheadDots, threeheadMotherStats, threeheadMotherStoredStats } from '../src/game/threehead-mother';

const unit = (key: string, role?: 'venom' | 'flame' | 'gale'): RuleUnit => ({
  key, name: role ?? key, side: key.startsWith('member') ? 'member' : 'target', boss: key.startsWith('target'), level: 32,
  hp: 10000, hpMax: 10000, mp: 1000, mpMax: 1000, attack: 1000, magic: 1000, defense: 100, magicDefense: 100,
  accuracy: 1000, evasion: 1, speed: 100, crit: 0, critResist: 100, critDamage: 100, critReduction: 100, pierce: 100, tenacity: 100,
  state: emptyRuleState(), cooldowns: role ? { mother_head_role: role } : {}, passives: [], mastery: {}, resistance: {}
});

const fixture = (turn = 1) => {
  const player = unit('member:1'); const heads = [unit('target:1', 'venom'), unit('target:2', 'flame'), unit('target:3', 'gale')];
  const rules = new CombatRules([player, ...heads], turn, [], { absorb: async () => 0, legacyEffects: () => [], removeLegacy: async () => {}, extraAction: () => {}, swapThreat: async () => {} }, '', undefined, () => 0);
  installThreeheadMotherDamage(rules); return { player, heads, rules };
};

test('三首属性倍率保持各自60%-80%生命与90%-110%战斗属性', () => {
  const base = { hpMax: 10000, physicalAttack: 1000, magicAttack: 1000, physicalDefense: 1000, magicDefense: 1000, accuracy: 1000, evasion: 1000, speed: 1000, crit: 1000, critResist: 1000, critDamage: 1000, critReduction: 1000, tenacity: 1000, tenacityPierce: 1000 };
  assert.deepEqual(['venom', 'flame', 'gale'].map(role => threeheadMotherStats(base, role as any).hpMax), [7000, 8000, 6000]);
  for (const role of ['venom', 'flame', 'gale'] as const) for (const [key, value] of Object.entries(threeheadMotherStats(base, role))) if (key !== 'hpMax') assert.ok(value >= 900 && value <= 1100, `${role}.${key}`);
});

test('临时蛇首读取入场属性快照，不按无词条模板重复派生生命', () => {
  const snapshot = { hpMax: 8000, mpMax: 500, physicalAttack: 1100, magicAttack: 1100, physicalDefense: 1050, magicDefense: 950, accuracy: 1050, evasion: 950, crit: 1100, critResist: 950, critDamage: 1050, critReduction: 950, tenacity: 1000, tenacityPierce: 1050, speed: 950, perception: 1000 };
  assert.deepEqual(threeheadMotherStoredStats({ cooldowns: JSON.stringify({ mother_head_role: 'flame', mother_head_stats: snapshot }) }), snapshot);
});

test('三首存活时单体按50/25/25分摊，双首按70/30分摊', async () => {
  const { heads, rules } = fixture(); await rules.takeHit(heads[0], 1000);
  assert.deepEqual(heads.map(head => head.hp), [9500, 9750, 9750]);
  heads[2].hp = 0; await rules.takeHit(heads[0], 1000);
  assert.deepEqual(heads.slice(0, 2).map(head => head.hp), [8800, 9450]);
});

test('群攻按存活数量缩放且使用批次快照，独立伤害不参与血肉分摊', async () => {
  const { player, heads, rules } = fixture(); heads[0].hp = 100;
  await rules.areaDamage(heads, async head => { await rules.takeHit(head, 1000, 1, true, player); });
  assert.deepEqual(heads.map(head => head.hp), [0, 9500, 9500]);
  await rules.secondary(player, heads[1], 1000, '测试持续伤害');
  assert.equal(heads[1].hp, 8500); assert.equal(heads[2].hp, 9500);
});

test('风之障壁与独首狂暴按最终减伤加算并受80%上限约束', async () => {
  const { heads, rules } = fixture(); heads[1].hp = heads[2].hp = 0; rules.add(heads[0], 'mother_wind_barrier', 25, 3, heads[0]);
  await rules.takeHit(heads[0], 1000); assert.equal(heads[0].hp, 9600);
});

test('庞大身躯修正实际命中+50%且实际闪避-50%', async () => {
  const { player, heads, rules } = fixture();
  const outgoing = await rules.attackSetup(heads[0], player, false, true);
  const incoming = await rules.attackSetup(player, heads[0], false, true);
  assert.equal(outgoing.hitBonus, .5); assert.equal(incoming.hitBonus, .5);
});

test('灼烧与中毒使用同一批次生命快照，风蚀每层令DOT总伤害翻倍', async () => {
  const { player, heads, rules } = fixture(2); player.hp = 5000;
  addThreeheadDot(rules, heads[0], player, 'mother_burn', 2); addThreeheadDot(rules, heads[0], player, 'mother_poison', 2); addThreeheadDot(rules, heads[2], player, 'mother_wind_erosion', 2);
  for (const effect of player.state.statuses) effect.data = JSON.stringify({ appliedTurn: 1 });
  await settleThreeheadDots(rules, [player]);
  // (10000*3%*2 + 已损5000*6%*2) * (1+2) = 3600，毒伤不读取本批灼烧后的生命。
  assert.equal(player.hp, 1400);
});

test('新施加DOT不会在同一敌方大回合自然跳伤，但立即结算可以旁路', async () => {
  const { player, heads, rules } = fixture(3); player.hp = 5000; addThreeheadDot(rules, heads[0], player, 'mother_poison', 1);
  await settleThreeheadDots(rules, [player]); assert.equal(player.hp, 5000);
  await settleThreeheadDots(rules, [player], true); assert.equal(player.hp, 4700);
});
