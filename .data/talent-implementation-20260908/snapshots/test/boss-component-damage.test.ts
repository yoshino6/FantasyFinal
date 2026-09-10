import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatRules, emptyRuleState, type RuleUnit } from '../src/game/combat-rule-registry';
import { installBossComponentDamage } from '../src/game/boss-component-damage';
import { residentSkillByCode } from '../src/game/resident-skill.config';
import { useAlchemyCombat } from '../src/game/alchemy-combat';
import { createCombatRules } from '../src/game/combat-rule-adapter';
import { createAutomaton } from '../src/game/automaton';
import { actAutomaton, automatonRuleUnit, installAutomatonRules, type AutomatonBattleState } from '../src/game/automaton-combat';

const unit = (key: string): RuleUnit => ({
  key, name: key, side: key.startsWith('member') ? 'member' : 'target', boss: key.startsWith('target'), level: 32,
  hp: 10000, hpMax: 10000, mp: 1000, mpMax: 1000, attack: 1000, magic: 1000, defense: 100, magicDefense: 100,
  accuracy: 1000, evasion: 1, speed: 100, crit: 0, critResist: 100, critDamage: 100, critReduction: 100, pierce: 100, tenacity: 100,
  state: emptyRuleState(), cooldowns: {}, passives: [], mastery: {}, resistance: {}
});
const fixture = () => {
  const source = unit('member:1'); const body = unit('target:1');
  const parts = [2, 3, 4].map(id => unit(`target:${id}`));
  const shieldCalls: string[] = []; const losses: [string, number][] = [];
  const rules = new CombatRules([source, body, ...parts], 1, [], {
    absorb: async target => { shieldCalls.push(target.key); return 0; }, legacyEffects: () => [],
    removeLegacy: async () => {}, extraAction: () => {}, swapThreat: async () => {},
    afterDamage: async (target, damage) => { losses.push([target.key, damage]); }
  }, '', undefined, () => .5);
  installBossComponentDamage(rules, new Map(parts.map(part => [part.key, body.key])));
  rules.hooks.directMultiplier = (_source, target, _element, _magic, single) => parts.includes(target) ? single ? 1 : .5 : rules.hooks.bodyMultiplier!(target);
  return { source, body, parts, rules, shieldCalls, losses };
};

test('部位单体伤害等量传递，再乘本体当前部位减伤', async () => {
  const { body, parts, rules } = fixture();
  await rules.take(parts[0], 1000);
  assert.equal(parts[0].hp, 9000); assert.equal(body.hp, 9657);
});

test('只传实际扣血：部位护盾与溢出不传递，击破这一击采用旧减伤', async () => {
  const { body, parts, rules } = fixture();
  parts[0].hp = 100;
  rules.add(parts[0], 'shield', 200, 3, parts[0]);
  await rules.take(parts[0], 2000);
  assert.equal(parts[0].hp, 0); assert.equal(body.hp, 9966);
  await rules.take(parts[1], 1000);
  assert.equal(body.hp, 9476); // 剩余两部位：49%。
});

test('本体当前壁垒及通用减伤也作用于传伤，护盾随后抵消', async () => {
  const { body, parts, rules, shieldCalls } = fixture();
  rules.add(body, 'barrier', 20, 3, body); rules.add(body, 'reduction', 25, 3, body);
  rules.add(body, 'shield', 100, 3, body);
  await rules.take(parts[0], 1000);
  assert.equal(body.hp, 9895); // floor(1000 * .343 * .8 * .75) - 100 = 105。
  assert.equal(shieldCalls.filter(key => key === body.key).length, 1);
});

for (const direct of [100, 900]) test(`AOE 本体只取最高候选一次（直击 ${direct}）`, async () => {
  const { body, parts, rules, shieldCalls, losses } = fixture();
  rules.add(body, 'shield', 100, 3, body);
  const damages = new Map([[body.key, direct], [parts[0].key, 1000], [parts[1].key, 2000], [parts[2].key, 300]]);
  await rules.areaDamage([body, ...parts], async target => { await rules.takeHit(target, damages.get(target.key)!, 1, true); });
  const maximum = Math.max(direct, 686);
  assert.equal(body.hp, 10000 - maximum + 100);
  assert.equal(shieldCalls.filter(key => key === body.key).length, 1);
  assert.deepEqual(losses.filter(([key]) => key === body.key), [[body.key, maximum - 100]]);
});

test('AOE 未选中本体或本体闪避，仍传最高部位伤害', async () => {
  for (const includeBody of [false, true]) {
    const { body, parts, rules, shieldCalls } = fixture();
    await rules.areaDamage(includeBody ? [body, ...parts] : parts, async target => {
      if (target === body) return;
      await rules.takeHit(target, target === parts[1] ? 2000 : 1000, 1, true);
    });
    assert.equal(body.hp, 9314); assert.equal(shieldCalls.filter(key => key === body.key).length, 1);
  }
});

test('同次 AOE 击破部位不改变本轮减伤快照，下一次恢复实时计算', async () => {
  const { body, parts, rules } = fixture(); parts[0].hp = 20;
  await rules.areaDamage([body, ...parts], async target => {
    const damage = target === body ? Math.floor(1000 * rules.hooks.bodyMultiplier!(body)) : 1000;
    await rules.takeHit(target, damage, 1, true);
  });
  assert.equal(body.hp, 9657);
  assert.ok(Math.abs(rules.hooks.bodyMultiplier!(body) - .49) < 1e-9);
});

test('独立连续攻击和 DOT 各自传递，不按整回合错误去重', async () => {
  const { source, body, parts, rules } = fixture();
  await rules.take(parts[0], 1000); await rules.secondary(source, parts[0], 1000, '流血');
  assert.equal(body.hp, 9314);
});

test('本体死亡不再传伤，也不产生递归命中或追击', async () => {
  const { source, body, parts, rules, losses } = fixture(); body.hp = 100;
  rules.add(source, 'enchant', 50, 3, source);
  await rules.take(parts[0], 1000); await rules.take(parts[1], 1000);
  assert.equal(body.hp, 0);
  assert.equal(losses.filter(([key]) => key === body.key).length, 1);
  assert.equal(rules.log.some(line => line.includes('三相附锋')), false);
});

test('普通敌人与没有部位的 Boss 不受影响', async () => {
  const { rules } = fixture(); const other = unit('target:99'); rules.units.push(other);
  const result = await rules.takeHit(other, 321);
  assert.deepEqual(result, { damage: 321, absorbed: 0 }); assert.equal(other.hp, 9679);
});

test('多个 Boss 分别按自己的部位传伤与合算', async () => {
  const { rules, body, parts } = fixture(); const other = unit('target:10'), part = unit('target:11');
  rules.units.push(other, part);
  installBossComponentDamage(rules, new Map([...parts.map(p => [p.key, body.key] as [string, string]), [part.key, other.key]]));
  await rules.areaDamage([other, body, part, ...parts], async target => {
    await rules.takeHit(target, target === body || target === other ? 100 : 1000, 1, true);
  });
  assert.equal(body.hp, 9657); assert.equal(other.hp, 9300);
});

test('规则技能扩散走同一合算入口，本体仅扣血一次', async () => {
  const { source, body, rules, losses } = fixture();
  rules.add(source, 'expand', 1, 3, source);
  await rules.cast(source, body, residentSkillByCode('resident_a03')!, 0);
  assert.equal(losses.filter(([key]) => key === body.key).length, 1);
  assert.ok(body.hp < 10000); assert.equal(rules.status(source, 'expand'), undefined);
});

test('嘲讽不会把群攻各目标重复重定向到同一本体', async () => {
  const { source, body, parts, rules, losses } = fixture();
  rules.add(source, 'taunted', 1, 3, body, true); rules.add(source, 'expand', 1, 3, source);
  await rules.cast(source, body, residentSkillByCode('resident_a03')!, 0);
  assert.equal(losses.filter(([key]) => key === body.key).length, 1);
  assert.ok(parts.every(part => part.hp < part.hpMax));
});

test('炼金群体投掷及弹链使用同一合算入口', async () => {
  for (const effect of [{ alchemyOutput: true, target: 'enemy' as const, targetScope: 'all' as const, throwable: { damageScale: 1, element: '火' } }, { alchemyOutput: true, target: 'enemy' as const, tactic: 'chain' as const }]) {
    const { source, body, rules, losses } = fixture();
    await useAlchemyCombat(rules, source, body, effect, '测试投掷', 'pve');
    assert.equal(losses.filter(([key]) => key === body.key).length, 1);
    assert.ok(body.hp < 10000);
  }
});

test('异常时清理群攻上下文，不把候选伤害带入下一次行动', async () => {
  const { body, parts, rules } = fixture();
  await assert.rejects(rules.areaDamage(parts, async target => { await rules.takeHit(target, 1000, 1, true); throw Error('中断'); }));
  assert.equal(body.hp, 10000);
  await rules.take(parts[1], 1000); assert.equal(body.hp, 9657);
});

test('适配器合算结果正确回写同一个战斗目标对象、扣血和阵亡标记', async () => {
  const rows = [1, 2, 3, 4].map(id => ({ id, name: `目标${id}`, level: 32, monster_class: 'boss', current_hp: 10000, hp_max: 10000, current_mp: 1000, cooldowns: {}, is_defeated: 0 }));
  const member = { ...rows[0], id: 99 };
  const connection = { execute: async () => [[]] };
  const { rule, get, takeDamage } = await createCombatRules(connection as any, 'isolated-test', 1, [member], rows,
    () => ({ mpMax: 1000 }), () => [], [], '', async () => ({ absorbed: 0, remaining: 0, broken: false }), () => {});
  installBossComponentDamage(rule, new Map(rows.slice(1).map(row => [`target:${row.id}`, 'target:1'])));
  rows[0].current_hp = 500;
  await rule.areaDamage(rows.map(row => get('target', row.id)), async target => {
    const result = await takeDamage('target', Number(target.key.split(':')[1]), target.key === 'target:1' ? 100 : 2000, true);
    if (target.key === 'target:1') { assert.equal(result.incoming, 686); assert.equal(result.absorbed, 0); }
  });
  assert.equal(rows[0].current_hp, 0); assert.equal(rows[0].is_defeated, 1);
  assert.deepEqual(rows.slice(1).map(row => row.current_hp), [8000, 8000, 8000]);
});

test('机偶实际群攻执行器对本体只结算一次', async () => {
  const { source, body, rules, shieldCalls } = fixture();
  const state = createAutomaton('boss-parts-test'); state.level = 30;
  state.stats = [5000, 1000, 200, 160, 100, 100, 100, 100, 100, 0, 0, 15000, 0, 20, 20]; state.hp = 5000; state.mp = 1000; state.equipped = ['S019'];
  const battle: AutomatonBattleState = { pet: state, rule: emptyRuleState(), cooldowns: {}, sync: 100, ultimateUsed: false, actionCount: 0, exited: false, threat: {}, manual: 'S019' };
  const pet = { id: 7, ownerId: 1, battle, unit: automatonRuleUnit(7, battle) }; source.selected = body.key;
  installAutomatonRules(rules, [pet]);
  await actAutomaton(rules, pet);
  assert.equal(shieldCalls.filter(key => key === body.key).length, 1);
  assert.ok(body.hp < 10000); assert.ok(battle.ultimateUsed);
});

test('群攻列表重复或中途被打倒的目标不会重复转向本体', async () => {
  const { body, parts, rules, losses } = fixture();
  await rules.areaDamage([body, ...parts, body], async target => {
    if (target === parts[0]) parts[1].hp = 0;
    await rules.takeHit(target, target === body ? 100 : 1000, 1, true);
  });
  assert.equal(losses.filter(([key]) => key === body.key).length, 1);
  assert.equal(losses.filter(([key]) => key === parts[1].key).length, 0);
});
