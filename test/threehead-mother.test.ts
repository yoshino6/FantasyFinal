import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatRules, emptyRuleState, type RuleUnit } from '../src/game/combat-rule-registry';
import { addThreeheadDot, executeThreeheadMotherTurn, installThreeheadMotherDamage, settleThreeheadDots, threeheadMotherStats, threeheadMotherStoredStats } from '../src/game/threehead-mother';

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

test('三首存活时单体按60/20/20分摊，双首按70/30分摊', async () => {
  const { heads, rules } = fixture(); await rules.takeHit(heads[0], 1000);
  assert.deepEqual(heads.map(head => head.hp), [9400, 9800, 9800]);
  heads[2].hp = 0; await rules.takeHit(heads[0], 1000);
  assert.deepEqual(heads.slice(0, 2).map(head => head.hp), [8700, 9500]);
});

test('群攻按存活数量缩放且使用批次快照，独立伤害不参与血肉分摊', async () => {
  const { player, heads, rules } = fixture(); heads[0].hp = 100;
  await rules.areaDamage(heads, async head => { await rules.takeHit(head, 1000, 1, true, player); });
  assert.deepEqual(heads.map(head => head.hp), [0, 9500, 9500]);
  await rules.secondary(player, heads[1], 1000, '测试持续伤害');
  assert.equal(heads[1].hp, 8500); assert.equal(heads[2].hp, 9500);
});

test('风之障壁与独首狂暴乘算，合计51.25%减伤', async () => {
  const { heads, rules } = fixture(); heads[1].hp = heads[2].hp = 0; rules.add(heads[0], 'mother_wind_barrier', 25, 3, heads[0]);
  await rules.takeHit(heads[0], 1000); assert.equal(heads[0].hp, 9513);
});

test('庞大身躯修正实际命中+50%且实际闪避-50%', async () => {
  const { player, heads, rules } = fixture();
  const outgoing = await rules.attackSetup(heads[0], player, false, true);
  const incoming = await rules.attackSetup(player, heads[0], false, true);
  assert.equal(outgoing.hitBonus, .5); assert.equal(incoming.hitBonus, .5);
});

test('灼烧与中毒使用同一批次生命快照，风蚀每层增加25%倍率', async () => {
  const { player, heads, rules } = fixture(2); player.hp = 5000;
  addThreeheadDot(rules, heads[0], player, 'mother_burn', 2); addThreeheadDot(rules, heads[0], player, 'mother_poison', 2); addThreeheadDot(rules, heads[2], player, 'mother_wind_erosion', 2);
  for (const effect of player.state.statuses) effect.data = JSON.stringify({ appliedTurn: 1 });
  await settleThreeheadDots(rules, [player]);
  // (10000*3%*2 + 已损5000*6%*2) * (1+2*.25) = 1800。
  assert.equal(player.hp, 3200);
});

test('新施加DOT不会在同一敌方大回合自然跳伤，但立即结算可以旁路', async () => {
  const { player, heads, rules } = fixture(3); player.hp = 5000; addThreeheadDot(rules, heads[0], player, 'mother_poison', 1);
  await settleThreeheadDots(rules, [player]); assert.equal(player.hp, 5000);
  await settleThreeheadDots(rules, [player], true); assert.equal(player.hp, 4700);
});

test('引爆消耗每种灾蚀一层，后续自然跳伤使用剩余层数', async () => {
  const { player, heads, rules } = fixture(2); player.hp = 5000;
  for (const code of ['mother_poison', 'mother_burn', 'mother_wind_erosion'] as const) {
    addThreeheadDot(rules, heads[0], player, code, 2);
    rules.status(player, code)!.data = JSON.stringify({ appliedTurn: 1 });
  }
  await settleThreeheadDots(rules, [player], true);
  assert.equal(player.hp, 3200);
  assert.deepEqual(player.state.statuses.map(effect => effect.stacks), [1, 1, 1]);
  await settleThreeheadDots(rules, [player]);
  assert.equal(player.hp, 2315); // (300 + 6800*.06)*1.25 = 885
});

test('击杀风首先清风蚀和全队障壁，不清中毒；清灾只执行一次', async () => {
  const { player, heads, rules } = fixture();
  addThreeheadDot(rules, heads[0], player, 'mother_poison', 2);
  addThreeheadDot(rules, heads[2], player, 'mother_wind_erosion', 2);
  for (const head of heads) rules.add(head, 'mother_wind_barrier', 25, 3, heads[2]);
  heads[2].hp = 1;
  await rules.takeHit(heads[2], 100, 1, false, player);
  assert.equal(heads[2].hp, 0);
  assert.equal(rules.status(player, 'mother_wind_erosion'), undefined);
  assert.equal(rules.status(player, 'mother_poison')?.stacks, 2);
  assert.ok(heads.every(head => !rules.status(head, 'mother_wind_barrier')));
  await rules.takeHit(heads[0], 100, 1, false, player);
  assert.equal(rules.log.filter(line => line.includes('&断首解灾&')).length, 1);
});

test('独首反击状态与攻击附加只使用剩余蛇首的灾蚀，多段受击不重复反噬', async () => {
  const { player, heads, rules } = fixture(); heads[0].hp = heads[1].hp = 0;
  for (const head of heads.slice(0, 2)) head.state.memory.motherDeathRelief = 1;
  await rules.takeHit(heads[2], 100, 1, false, player);
  await rules.takeHit(heads[2], 100, 1, false, player);
  assert.equal(rules.status(player, 'mother_wind_erosion')?.stacks, 1);
  assert.equal(rules.status(player, 'mother_poison'), undefined);
  assert.equal(rules.status(player, 'mother_burn'), undefined);
  heads[2].cooldowns.mother_solo_active = 1;
  heads[2].cooldowns.mother_slot = 3;
  heads[2].hp = 4000;
  await executeThreeheadMotherTurn(rules, heads[2], player);
  assert.equal(rules.status(player, 'mother_wind_erosion')?.stacks, 4);
  assert.equal(rules.status(player, 'mother_poison'), undefined);
  assert.equal(rules.status(player, 'mother_burn'), undefined);
});

test('一至四人队击杀毒首均清除所有成员中毒，重载战斗不会重复清灾', async () => {
  for (const size of [1, 2, 3, 4]) {
    const { player, heads, rules } = fixture();
    const members = [player, ...Array.from({ length: size - 1 }, (_, index) => unit(`member:${index + 2}`))];
    rules.units.push(...members.slice(1));
    for (const member of members) addThreeheadDot(rules, heads[0], member, 'mother_poison', 3);
    heads[0].hp = 1;
    await rules.takeHit(heads[0], 100, 1, false, player);
    assert.ok(members.every(member => !rules.status(member, 'mother_poison')));
    heads[0].state = JSON.parse(JSON.stringify(heads[0].state));
    const reloaded = new CombatRules(rules.units, 2, [], rules.hooks, '', undefined, () => 0);
    // 与服务每轮重新安装钩子的行为一致，不复用上一轮的安装闭包。
    reloaded.hooks = { absorb: async () => 0, legacyEffects: () => [], removeLegacy: async () => {}, extraAction: () => {}, swapThreat: async () => {} };
    installThreeheadMotherDamage(reloaded);
    addThreeheadDot(reloaded, heads[1], player, 'mother_poison', 1);
    await reloaded.takeHit(heads[1], 100, 1, false, player);
    assert.equal(reloaded.status(player, 'mother_poison')?.stacks, 1);
    assert.equal(reloaded.log.filter(line => line.includes('&断首解灾&')).length, 0);
  }
});
