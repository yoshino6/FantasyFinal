import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { CombatRules, emptyRuleState, type RuleUnit } from '../src/game/combat-rule-registry';
import { RegionalBossBattle, installRegionalV2Damage, newRegionalState, readRegionalState, nextFurnaceOrder, pressureChange, obeysFurnaceOrder, settleFurnaceOrders, regionalIncomingFactor, regionalOutgoingFactor, regionalStateSummary, type RegionalAction, type RegionalV2Code } from '../src/game/regional-boss-v2';
import { planRegionalAuto, regionalActionKind, type RegionalAutoMember } from '../src/game/regional-boss-auto';
import { regionalV2Passives, regionalV2Resistance, regionalV2SkillProfiles, regionalV2Rotation } from '../src/game/regional-boss-v2.config';
import { worldSurfaceMonsters } from '../src/config/world-surface';
import type { BossPhaseTransition } from '../src/game/kingbeast.config';

const unit = (key: string): RuleUnit => ({
  key, name: key, side: key.startsWith('member') ? 'member' : 'target', boss: key.startsWith('target'), level: 32,
  hp: 10000, hpMax: 10000, mp: 1000, mpMax: 1000, attack: 1000, magic: 1000, defense: 500, magicDefense: 500,
  accuracy: 1000, evasion: 1, speed: 100, crit: 0, critResist: 100, critDamage: 100, critReduction: 100, pierce: 100, tenacity: 100,
  state: emptyRuleState(), cooldowns: {}, passives: [], mastery: {}, resistance: {}
});
const fixture = (code: RegionalV2Code = 'gruen_mountainheart', count = 4) => {
  const boss = unit('target:10'); const players = Array.from({ length: count }, (_, i) => unit(`member:${i + 1}`));
  const events: BossPhaseTransition[] = [];
  const rules = new CombatRules([...players, boss], 1, [], { absorb: async () => 0, legacyEffects: () => [], removeLegacy: async () => {}, extraAction: () => {}, swapThreat: async () => {} }, '', undefined, () => .5);
  const battle = new RegionalBossBattle(rules, boss, code, event => events.push(event));
  installRegionalV2Damage(rules, [battle]);
  return { boss, players, rules, battle, events, s: battle.state };
};
const profile = (key: string): RegionalAutoMember => ({ key, hp: 10000, hpMax: 10000, shield: 0, automatic: true, controlled: false, preferred: { type: 'attack' }, skill: { id: 1, damaging: true } });

test('新状态完全独立，JSON重载保留阶段与一次性标记', () => {
  const state = newRegionalState('gruen_mountainheart'); state.reliefs = 2; state.pressure = 85;
  assert.deepEqual(readRegionalState(JSON.parse(JSON.stringify({ regional_encounter_v2: state }))), state);
  assert.equal(newRegionalState('gruen_mountainheart').pressure, 20);
  assert.equal(newRegionalState('valk_forge_overseer').heat, 40);
});
test('所有实际行动压力、承重点修正及固炉分类', () => {
  const actions: RegionalAction[] = ['attack', 'damage_skill', 'support_skill', 'sustain', 'defend'];
  assert.deepEqual(actions.map(action => pressureChange(action)), [6, 10, -8, -8, -18]);
  assert.deepEqual(actions.map(action => pressureChange(action, true)), [10, 14, -8, -8, -26]);
  assert.ok(obeysFurnaceOrder('heavy', 'support_skill'));
  assert.ok(obeysFurnaceOrder('hold', 'sustain'));
  assert.ok(!obeysFurnaceOrder('hold', 'support_skill'));
});
test('压力全区间倍率以及末阶段临界、剥落和失稳独立乘算', () => {
  const s = newRegionalState('gruen_mountainheart');
  assert.deepEqual([0, 29, 30, 59, 60, 84, 85, 99].map(pressure => { s.pressure = pressure; return regionalIncomingFactor(s, 1); }), [.8, .8, 1, 1, 1.25, 1.25, 1.5, 1.5]);
  s.phase = 3; s.peeledTurn = 1; s.unstableUntil = 2;
  assert.equal(regionalIncomingFactor(s, 1), 1.65 * 1.25 * 1.1);
});
test('压力在实际行动结束后改变；多段和DOT本身不加压', async () => {
  const { rules, s, boss, players, battle } = fixture();
  for (let i = 0; i < 5; i++) await rules.takeHit(boss, 100, 1, false, players[0]);
  assert.equal(s.pressure, 20); assert.equal(boss.hp, 9600);
  await battle.playerAction(players[0]!, 'damage_skill'); assert.equal(s.pressure, 30);
  await rules.takeHit(boss, 100); assert.equal(boss.hp, 9500); assert.equal(s.pressure, 30);
});
test('压力100锁定山崩并给完整响应轮；压回85以下取消', async () => {
  const { rules, players, battle, s, events } = fixture(); s.pressure = 94;
  rules.add(players[0]!, 'shield', 9999, 5, players[0]!);
  await battle.playerAction(players[0]!, 'attack');
  assert.equal(s.pressure, 100); assert.equal(s.collapseAt, 2); assert.equal(events.at(-1)?.code, 'gruen_collapse_locked');
  assert.ok(rules.status(players[0]!, 'shield')); assert.ok(players.every(p => p.hp === 10000));
  rules.turn = 2; s.pressure = 84; await battle.bossTurn(players[0]!);
  assert.equal(s.collapseAt, 0); assert.equal(s.pressure, 84); assert.ok(!rules.log.some(line => line.includes('损失 3500')));
});
test('未拆解山崩保留护盾与免死流程，结算后重置压力', async () => {
  const { rules, players, battle, s } = fixture(); const p = players[0]!; p.hp = 100;
  rules.add(p, 'feign', 1, 3, p); s.pressure = 100; s.collapseAt = 2; rules.turn = 2;
  await battle.bossTurn(p); assert.equal(p.hp, 1); assert.equal(s.pressure, 35); assert.ok(rules.status(p, 'slow')); assert.ok(rules.status(p, 'exposed'));
});
test('地脉预震给予完整下一轮；低压卸力窗口到下一轮结束', async () => {
  const { rules, battle, s, players, events } = fixture(); s.slot = 2;
  await battle.bossTurn(players[0]!); assert.equal(s.warningAt, 2); assert.equal(events[0]?.code, 'gruen_warning');
  await battle.bossTurn(players[0]!); assert.equal(s.warningAt, 2);
  rules.turn = 2; s.pressure = 29; await battle.bossTurn(players[0]!);
  assert.equal(s.unstableUntil, 3); assert.equal(s.pressure, 20);
  rules.turn = 3; battle.beginRound(); await battle.playerAction(players[0]!, 'attack'); assert.equal(s.pressure, 26);
  rules.turn = 4; battle.beginRound(); assert.equal(s.pressure, 20);
});
test('承重点按命中而非扣血施加，护盾吸收不能规避；防御清碎岩', async () => {
  const { rules, battle, s, players } = fixture(); s.phase = 2;
  rules.add(players[0]!, 'shield', 99999, 5, players[0]!);
  await battle.bossTurn(players[0]!); assert.equal(s.weight[players[0]!.key], 3); assert.equal(s.rubble[players[0]!.key], 1);
  s.pressure = 60; await battle.playerAction(players[0]!, 'defend'); assert.equal(s.pressure, 34); assert.equal(s.rubble[players[0]!.key], 0);
});
test('末阶段下限15、逆脉额外自损最多两次且不吃承伤倍率', async () => {
  const { rules, battle, s, players, boss } = fixture(); s.phase = 3;
  await battle.changePressure(-100); assert.equal(s.pressure, 15);
  for (let turn = 1; turn <= 3; turn++) { rules.turn = turn; s.warningAt = turn; s.pressure = 15; await battle.bossTurn(players[0]!); }
  assert.equal(s.reliefs, 2); assert.equal(boss.hp, 9400);
});
test('阶段在回合结束检查，一次跨过两阈值不反复转场', async () => {
  const { boss, battle, s, events } = fixture(); boss.hp = 3500;
  assert.equal(s.phase, 1); await battle.endRound(); assert.equal(s.phase, 3);
  await battle.endRound(); assert.equal(events.length, 1);
});
test('炉令不连续重复，零MP无技能时不发重锻；禁攻令是显式例外', () => {
  for (const canSkill of [true, false]) {
    let previous: ReturnType<typeof nextFurnaceOrder> | undefined;
    for (let i = 0; i < 30; i++) { const next = nextFurnaceOrder(previous, canSkill, i); assert.notEqual(next, previous); if (!canSkill) assert.notEqual(next, 'heavy'); previous = next; }
  }
});
for (let count = 1; count <= 4; count++) test(`${count}人炉令：半数违令达标，控制停工排除分母`, () => {
  const s = newRegionalState('valk_forge_overseer'); const threshold = Math.ceil(count / 2);
  for (let i = 0; i < count; i++) { s.orders[String(i)] = 'light'; s.actions[String(i)] = i < threshold ? 'defend' : 'attack'; }
  const result = settleFurnaceOrders(s); assert.equal(result.threshold, threshold); assert.ok(result.success);
  s.orders = { a: 'light', b: 'light', c: 'light' }; s.actions = { a: 'defend' };
  const controlled = settleFurnaceOrders(s); assert.equal(controlled.threshold, 1); assert.ok(controlled.success);
});
test('鞭痕用结算后层数，领班额外票与伤害，孤立惩戒不被炉温放大', () => {
  const s = newRegionalState('valk_forge_overseer'); s.heat = 90; s.foreman = 'a';
  s.orders = { a: 'light', b: 'light', c: 'light', d: 'light' }; s.actions = { a: 'defend', b: 'attack', c: 'attack', d: 'attack' };
  const result = settleFurnaceOrders(s); assert.ok(result.success); assert.deepEqual(result.wounds, [{ key: 'a', fraction: .03 }]);
  s.foreman = ''; s.orders = { a: 'light', b: 'light', c: 'light', d: 'light' }; s.actions = { a: 'defend', b: 'attack', c: 'attack', d: 'attack' };
  const isolated = settleFurnaceOrders(s); assert.ok(!isolated.success); assert.deepEqual(isolated.wounds, [{ key: 'a', fraction: .04 }, { key: 'a', fraction: .06 }]);
});
test('服从领班清两层并额外加热；鞭痕上限4', () => {
  const s = newRegionalState('valk_forge_overseer'); s.foreman = 'a'; s.scars.a = 4; s.orders.a = 'light'; s.actions.a = 'attack';
  settleFurnaceOrders(s); assert.equal(s.scars.a, 2); assert.equal(s.heat, 53);
  s.foreman = ''; s.scars.a = 4; s.orders.a = 'light'; s.actions.a = 'defend'; settleFurnaceOrders(s); assert.equal(s.scars.a, 4);
});
test('连续停炉只隔次取消工序，零有效成员不算成功', () => {
  const s = newRegionalState('valk_forge_overseer');
  for (const cancel of [true, false, true]) { s.orders.a = 'light'; s.actions.a = 'defend'; assert.ok(settleFurnaceOrders(s).success); assert.equal(s.cancelProcess, cancel); s.cancelProcess = false; }
  s.orders.a = 'light'; assert.ok(!settleFurnaceOrders(s).success);
});
test('满额开炉回血每场两次封顶', async () => {
  const { battle, s, boss, rules } = fixture('valk_forge_overseer'); boss.hp = 5000;
  for (let i = 1; i <= 4; i++) { rules.turn = i; s.orders.a = 'light'; s.actions.a = 'attack'; s.orderDue = i; await battle.settleOrders(); }
  assert.equal(boss.hp, 5600); assert.equal(s.fullFires, 2);
});
test('过载只预警并发可反制炉令，下一轮停炉成功取消清算', async () => {
  const { battle, rules, s, players, events } = fixture('valk_forge_overseer'); s.heat = 100;
  await battle.checkOverload(); assert.equal(s.overloadAt, 2); assert.ok(players.every(p => p.hp === 10000));
  assert.equal(events[0]?.code, 'valk_overload'); rules.turn = 2;
  for (const p of players) await battle.playerAction(p, s.orders[p.key] === 'hold' ? 'attack' : 'defend');
  await battle.settleOrders(); assert.equal(s.overloadAt, 0); assert.ok(!rules.log.some(line => line.includes('释放「封炉清算」')));
});
test('总罢工必须全部有效成员违令，成功清痕、限温与双防下降', async () => {
  const { battle, rules, s, players, boss } = fixture('valk_forge_overseer'); s.phase = 3;
  await battle.issueOrders(true); rules.turn = 2;
  for (const p of players) { s.scars[p.key] = 2; await battle.playerAction(p, 'attack'); }
  await battle.settleOrders(); assert.ok(s.revoltWon); assert.deepEqual(s.scars, {}); assert.equal(boss.defense, 400);
  s.heat = 100; await battle.checkOverload(); assert.equal(s.heat, 80); assert.equal(s.overloadAt, 0); assert.equal(regionalOutgoingFactor(s, true), 1);
});
test('总罢工失败后两轮重新下令，重载不丢失重试时刻', async () => {
  const { battle, rules, s, players, events } = fixture('valk_forge_overseer'); s.phase = 3;
  await battle.issueOrders(true); rules.turn = 2; await battle.playerAction(players[0]!, 'attack'); await battle.playerAction(players[1]!, 'defend');
  await battle.settleOrders(); assert.equal(s.revoltRetry, 4); assert.ok(!s.revoltWon);
  rules.turn = 3; await battle.endRound(); assert.equal(events.length, 1);
  rules.turn = 4; await battle.endRound(); assert.equal(s.orderDue, 5); assert.ok(s.revolt);
});
test('火温仅增强火直击；专属伤害不影响百分比鞭痕', async () => {
  const { battle, rules, s, players } = fixture('valk_forge_overseer'); s.heat = 90;
  assert.equal(regionalOutgoingFactor(s, true), 1.35); assert.equal(regionalOutgoingFactor(s, false), 1);
  await battle.mechanism(players[0]!, .04, '鞭痕'); assert.equal(players[0]!.hp, 9600);
});
test('高难专属改为强化反震与地脉回流，不再增加直击或护盾', async () => {
  const { boss, rules, battle, s, players } = fixture(); boss.bossEffects = ['leyline_recast', 'mountainheart_resonance'];
  s.pressure = 60; assert.equal(rules.hooks.directMultiplier!(boss, players[0]!, '土', false, true, '打击'), 1.15);
  s.rockArmorActive = true; await battle.reflectDirect(players[0]!, 1000); assert.equal(players[0]!.hp, 9700);
  boss.hp = 5000; s.pressure = 60; s.warningAt = 1; await battle.bossTurn(players[0]!); assert.equal(boss.hp, 5800); assert.equal(rules.shieldValue(boss), 0);
  assert.equal(regionalV2SkillProfiles.山心崩震!.power, 150);
});
test('两只Boss只有两项负抗，弱点不同；被动与技能均有配置', () => {
  assert.deepEqual(Object.entries(regionalV2Resistance.gruen_mountainheart).filter(([, n]) => n < 0).map(([e]) => e), ['风', '冰']);
  assert.deepEqual(Object.entries(regionalV2Resistance.valk_forge_overseer).filter(([, n]) => n < 0).map(([e]) => e), ['水', '雷']);
  for (const code of ['gruen_mountainheart', 'valk_forge_overseer'] as const) {
    assert.equal(Object.keys(regionalV2Resistance[code]).length, 9); assert.equal(regionalV2Passives[code].length, 3);
    assert.deepEqual(worldSurfaceMonsters.find(monster => monster.code === code)?.skillCodes, regionalV2Rotation[code]);
  }
});
test('常驻展示仅给状态和炉令，不出现破解门槛、倍率和推荐动作', () => {
  const s = newRegionalState('valk_forge_overseer'); s.orders.a = 'heavy'; s.scars.a = 3;
  const text = regionalStateSummary(s, { a: '玩家甲' }); assert.match(text, /玩家甲：重锻令｜鞭痕3/); assert.doesNotMatch(text, /至少|推荐|建议|%|ceil/);
});
for (let count = 1; count <= 4; count++) test(`${count}人自动分工能泄压与集体停炉，不依赖职业技能`, () => {
  const members = Array.from({ length: count }, (_, i) => profile(`member:${i + 1}`));
  const s = newRegionalState('gruen_mountainheart'); s.pressure = 20 + count * 10; s.warningAt = 2;
  const actions = planRegionalAuto(s, members, 2); let pressure = s.pressure;
  for (const member of members) pressure = Math.max(0, pressure + pressureChange(regionalActionKind(actions.get(member.key)!)));
  assert.ok(pressure <= 29);
  const v = newRegionalState('valk_forge_overseer'); v.orderDue = 2; for (const member of members) v.orders[member.key] = 'light';
  const planned = planRegionalAuto(v, members, 2); for (const member of members) v.actions[member.key] = regionalActionKind(planned.get(member.key)!);
  assert.ok(settleFurnaceOrders(v).success);
});
test('自动预测逐人限幅，避免先防御后攻击导致实际压力越界', () => {
  const s = newRegionalState('gruen_mountainheart'); s.pressure = 10; s.warningAt = 1;
  const members = [profile('member:1'), profile('member:2'), profile('member:3'), profile('member:4')]; members[0]!.automatic = false; members[0]!.committed = 'defend';
  const planned = planRegionalAuto(s, members, 1); let pressure = 10;
  for (const member of members) pressure = Math.max(0, pressure + pressureChange(member.committed ?? regionalActionKind(planned.get(member.key)!)));
  assert.ok(pressure <= 29);
});
test('自动总罢工排除硬控，重伤高鞭痕者优先服从常规炉令', () => {
  const s = newRegionalState('valk_forge_overseer'); s.orderDue = 1;
  const members = Array.from({ length: 4 }, (_, i) => profile(`member:${i + 1}`));
  for (const member of members) s.orders[member.key] = 'light';
  members[0]!.hp = 1000; s.scars[members[0]!.key] = 4;
  const actions = planRegionalAuto(s, members, 1); assert.equal(actions.get(members[0]!.key)!.type, 'attack');
  s.revolt = true; members[3]!.controlled = true; for (const member of members) s.orders[member.key] = 'hold';
  const revolt = planRegionalAuto(s, members, 1); assert.equal(revolt.size, 3); assert.ok([...revolt.values()].every(action => action.type !== 'defend'));
});
test('自动战斗在封脉时优先使用真实可用净化，否则不重复选择治疗', () => {
  const s = newRegionalState('valk_forge_overseer');
  const cleanser = profile('member:1'); cleanser.healingSuppressed = true; cleanser.preferred = { type: 'item', itemId: 1 }; cleanser.cleanse = { type: 'skill', skillId: 9 };
  const sealed = profile('member:2'); sealed.healingSuppressed = true; sealed.preferred = { type: 'item', itemId: 1 };
  const planned = planRegionalAuto(s, [cleanser, sealed], 1);
  assert.deepEqual(planned.get(cleanser.key), { type: 'skill', skillId: 9 }); assert.notEqual(planned.get(sealed.key)?.type, 'item');
});
test('服务接入发生在真实行动分支与finally，旧部位不再生成且新状态不递减', () => {
  const source = readFileSync(new URL('../src/game/adventure.service.ts', import.meta.url), 'utf8');
  assert.match(source, /if \(isRegionalV2\(bodyCode\)\) \{[\s\S]*?continue;[\s\S]*?regionalBossComponentsFor/);
  assert.match(source, /finally \{\s*if \(turn.kind === 'member'[\s\S]*?battle.playerAction/);
  assert.match(source, /if \(code.startsWith\('regional_'\)\) continue;/);
  assert.match(source, /installRegionalV2Damage\(rules, regionalBattles\)/);
});

test('高压崩震保留最近承重点追震，压力效率标记到期不导致追震永不触发', async () => {
  const { battle, s, rules, players } = fixture();
  await battle.bossTurn(players[0]!); rules.turn = 4; s.warningAt = 4; s.pressure = 60;
  await battle.bossTurn(players[0]!);
  assert.ok(rules.log.some(line => line.includes('承重点追震'))); assert.equal(s.weightTarget, '');
});
test('逆震岩甲下一轮生效、降压立即关闭，并按玩家每轮封顶', async () => {
  const { battle, s, rules, players } = fixture(); const player = players[0]!;
  s.pressure = 60; await battle.endRound(); assert.ok(s.rockArmorActive);
  await battle.reflectDirect(player, 10000); assert.equal(player.hp, 8500);
  await battle.reflectDirect(player, 10000); assert.equal(player.hp, 8500);
  await battle.changePressure(-1); assert.ok(!s.rockArmorActive);
  rules.turn = 2; await battle.endRound(); assert.ok(!s.rockArmorActive);
  await battle.changePressure(1); await battle.endRound(); assert.ok(s.rockArmorActive);
});
test('地脉回流按震前压力回血、受减疗且同轮有机制治疗上限', async () => {
  const { battle, s, rules, players, boss } = fixture(); boss.hp = 5000;
  rules.add(boss, 'advanced_healing_cut', 50, 3, players[0]!, true);
  s.warningAt = 1; s.pressure = 85; await battle.bossTurn(players[0]!);
  assert.equal(boss.hp, 5500);
  await battle.healBoss(.10, '测试回流'); assert.equal(boss.hp, 6000);
});
test('灼封伤口下一轮起叠层降疗，过载封脉完整一轮且不可连续刷新', async () => {
  const { battle, s, rules, players } = fixture('valk_forge_overseer'); const player = players[0]!;
  s.slot = 2; s.heat = 60; await battle.bossTurn(player);
  assert.ok(rules.status(player, 'valk_scorch_pending')); assert.equal(rules.healingMultiplier(player, player), 1);
  rules.turn = 2; battle.beginRound(); assert.equal(rules.healingMultiplier(player, player), .75);
  s.overloadAt = 2; await battle.bossTurn(player); assert.ok(rules.status(player, 'valk_heal_seal_pending'));
  rules.turn = 3; battle.beginRound(); assert.equal(rules.healingMultiplier(player, player), 0);
  battle.addHealSeal(player); assert.ok(!rules.status(player, 'valk_heal_seal_pending'));
  rules.turn = 4; battle.beginRound(); battle.addHealSeal(player); assert.ok(rules.status(player, 'valk_heal_seal_pending'));
});
test('集体停炉减一层灼封并清除封脉，总罢工清空且关闭炉温增伤', async () => {
  const { battle, s, rules, players } = fixture('valk_forge_overseer'); const player = players[0]!;
  player.state.statuses.push({ code: 'valk_scorch', value: 25, until: 5, source: battle.boss.key, debuff: true, stacks: 2 }, { code: 'valk_heal_seal', value: 100, until: 1, source: battle.boss.key, debuff: true, stacks: 1 });
  s.orders[player.key] = 'light'; s.actions[player.key] = 'defend'; s.orderDue = 1; await battle.settleOrders();
  assert.equal(rules.status(player, 'valk_scorch')?.stacks, 1); assert.ok(!rules.status(player, 'valk_heal_seal'));
  s.revolt = true; s.orders[player.key] = 'hold'; s.actions[player.key] = 'attack'; s.orderDue = 1; await battle.settleOrders();
  assert.ok(s.revoltWon); assert.ok(!rules.status(player, 'valk_scorch'));
});
test('孤立违令、清算和总罢工失败按最高档汲养，专属档位替换而非叠加', async () => {
  const isolated = fixture('valk_forge_overseer'); isolated.boss.hp = 5000; isolated.s.orders = { [isolated.players[0]!.key]: 'light', [isolated.players[1]!.key]: 'light', [isolated.players[2]!.key]: 'light', [isolated.players[3]!.key]: 'light' }; isolated.s.actions = { [isolated.players[0]!.key]: 'defend', [isolated.players[1]!.key]: 'attack', [isolated.players[2]!.key]: 'attack', [isolated.players[3]!.key]: 'attack' }; isolated.s.orderDue = 1;
  await isolated.battle.settleOrders(); assert.equal(isolated.boss.hp, 5600);
  const revolt = fixture('valk_forge_overseer'); revolt.boss.hp = 5000; revolt.boss.bossEffects = ['soul_chain_forging']; revolt.s.revolt = true; revolt.s.orders = { [revolt.players[0]!.key]: 'hold', [revolt.players[1]!.key]: 'hold' }; revolt.s.actions = { [revolt.players[0]!.key]: 'attack', [revolt.players[1]!.key]: 'defend' }; revolt.s.orderDue = 1;
  await revolt.battle.settleOrders(); assert.equal(revolt.boss.hp, 6500);
});
test('瓦尔克冷炉防御生效；永燃余烬只改变重置炉温与灼封时长', async () => {
  const { battle, s, rules, players, boss } = fixture('valk_forge_overseer'); s.slot = 2; s.heat = 10;
  await battle.bossTurn(players[0]!); assert.equal(rules.value(boss, 'defense'), 15); assert.equal(s.heat, 20);
  boss.bossEffects = ['everburning_embers']; s.overloadAt = 2; s.heat = 100; rules.turn = 2;
  await battle.bossTurn(players[0]!); assert.equal(s.heat, 75); assert.equal(s.overloadAt, 0);
  assert.ok(players.filter(p => p.hp > 0).every(p => rules.status(p, 'valk_heal_seal_pending'))); assert.ok(players.every(p => !rules.status(p, 'burn')));
});
test('有效服从记录不串入下一次停工，待兑现的停炉不会被新一轮覆盖', () => {
  const s = newRegionalState('valk_forge_overseer'); s.obeyed.a = true; s.orders = { a: 'light', b: 'light' }; s.actions.b = 'defend';
  settleFurnaceOrders(s); assert.equal(s.obeyed.a, undefined); assert.ok(s.cancelProcess);
  s.orders.b = 'light'; s.actions.b = 'defend'; settleFurnaceOrders(s); assert.ok(s.cancelProcess); assert.ok(!s.lastCancel);
});
test('两只Boss的低抗元素在真实规则元素函数中有高伤收益，高抗仍非绝对免疫', () => {
  for (const code of ['gruen_mountainheart', 'valk_forge_overseer'] as const) {
    const { rules, boss, players } = fixture(code); boss.resistance = regionalV2Resistance[code];
    for (const [element, resistance] of Object.entries(boss.resistance)) {
      const factor = rules.elementFactor(players[0]!, boss, element);
      assert.ok(resistance < 0 ? factor > 1 : factor <= 1); assert.ok(factor > 0);
    }
  }
});

test('真实旧管线桥接保留V2增伤与免死，复制主击的追击不重复乘算', async () => {
  const { rules, boss, battle, s } = fixture(); s.pressure = 60;
  const source = readFileSync(new URL('../src/game/adventure.service.ts', import.meta.url), 'utf8');
  const file = ts.createSourceFile('adventure.ts', source, ts.ScriptTarget.Latest, true);
  const names = ['unscaleRegionalCopiedDamage', 'absorbRuleShield']; const declarations: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(file))) declarations.push(`const ${node.getText(file)};`);
    ts.forEachChild(node, visit);
  }; visit(file); assert.equal(declarations.length, 2);
  const javascript = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const dependencies = {
    rules, regionalIncomingFactor, regionalByKey: new Map([[boss.key, battle]]), ruleUnit: () => boss,
    ruleTakeDamage: async (_kind: string, _id: number, amount: number) => { const hit = await rules.takeHit(boss, amount); return { incoming: hit.damage, absorbed: hit.absorbed, remaining: rules.shieldValue(boss), broken: false }; }
  };
  const bridge = new Function(...Object.keys(dependencies), `${javascript}\nreturn {${names.join(',')}};`)(...Object.values(dependencies));
  const first = await bridge.absorbRuleShield(null, 'test', 'target', 10, 10000, 1000);
  assert.equal(first.incoming, 1250); boss.hp = 10000 - (first.incoming - first.absorbed); assert.equal(boss.hp, 8750);
  const rawCopy = bridge.unscaleRegionalCopiedDamage({ id: 10 }, first.incoming);
  const copy = await bridge.absorbRuleShield(null, 'test', 'target', 10, 10000, rawCopy);
  assert.equal(copy.incoming, 1250); assert.equal(boss.hp, 7500);
  boss.hp = 100; rules.add(boss, 'feign', 1, 2, boss);
  const saved = await bridge.absorbRuleShield(null, 'test', 'target', 10, 10000, 1000);
  boss.hp = 100 - (saved.incoming - saved.absorbed); assert.equal(boss.hp, 1);
});
