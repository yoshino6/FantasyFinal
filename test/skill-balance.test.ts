import assert from 'node:assert/strict';
import test from 'node:test';
import { skillSpecialization, specializationMaximum, specializationOptions, specializeEffectValue, specializeEffectDuration, specializeControlChance, specializeTime, manaTransferCost } from '../src/game/skill-specialization';
import { canDispelCombatEffect } from '../src/game/combat-dispel-policy';
import { residentSkills, residentSkillByCode } from '../src/game/resident-skill.config';
import { nativeSkillBalance } from '../src/game/combat-skill-balance.config';
import { passiveSpecializationFactor, residentScalablePassives } from '../src/game/passive-specialization';
import { CombatRules, emptyRuleState, type RuleUnit } from '../src/game/combat-rule-registry';
import { initializeCombatSkillBalance } from '../src/database/combat-skill-balance';

const unit = (key: string, side = 'member'): RuleUnit => ({ key, name: key, side, level: 30, boss: false, hp: 6000, hpMax: 10000, mp: 2000, mpMax: 3000, attack: 700, magic: 800, defense: 400, magicDefense: 450, accuracy: 100, evasion: 30, speed: 100, crit: 100, critResist: 100, critDamage: 100, critReduction: 100, pierce: 100, tenacity: 100, state: emptyRuleState(), cooldowns: {}, passives: [], resistance: {}, mastery: {} });
const fixture = (random = () => .01) => {
  const source = unit('member:1'); const friend = unit('member:2'); const target = unit('target:3', 'target');
  const rules = new CombatRules([source, friend, target], 1, [], { absorb: async () => 0, legacyEffects: () => [], removeLegacy: async () => {}, extraAction: () => {}, swapThreat: async () => {} }, '', undefined, random);
  return { source, friend, target, rules };
};
const cast = (f: ReturnType<typeof fixture>, id: string, target = f.target) => f.rules.cast(f.source, target, residentSkillByCode(id)!, residentSkillByCode(id)!.mana);
const base = { code: 'test', tier: '中位', category: 'magic', power: 150, mana_cost: 300, cooldown_turns: 5, chant_turns: 1 };

test('零值时间以1为基数，累计整回合才生效，无等阶上限', () => {
  assert.equal(specializeTime(0, .99), 0); assert.equal(specializeTime(0, 1), 1);
  assert.equal(specializeTime(3, .5), 5); assert.equal(specializeTime(3, 1), 7);
  assert.equal(specializeTime(1, -.49), 1); assert.equal(specializeTime(1, -.5), 0);
  assert.equal(specializeTime(0, -.5), 0); assert.equal(specializeTime(5, NaN), 5);
  const zero = { ...base, tier: '基础', cooldown_turns: 0, chant_turns: 0 };
  const both = skillSpecialization(zero, { overcharge: 10, potent: 10 });
  assert.equal(both.cooldown, 2); assert.equal(both.chant, 2);
  const lower = skillSpecialization({ ...base, tier: '下位', cooldown_turns: 3, chant_turns: 0 }, { overcharge: 20, potent: 20 });
  assert.equal(lower.cooldown, 73); assert.equal(lower.chant, 17);
});

test('四项专精首点乘算与合算数值', () => {
  const over = skillSpecialization(base, { overcharge: 2 });
  assert.equal(over.power, 162); assert.equal(over.effectFactor, 1); assert.equal(over.mana, 348);
  assert.equal(over.cooldown, 5); assert.equal(over.chant, 1);
  const potent = skillSpecialization(base, { potent: 2 });
  assert.equal(potent.power, 150); assert.equal(potent.effectFactor, 1.08); assert.ok(Math.abs(potent.durationChange - .08) < 1e-10);
  const instant = skillSpecialization(base, { instant: 2 });
  assert.equal(instant.power, 144); assert.equal(instant.effectFactor, .96); assert.equal(instant.timeFactor, .92);
  assert.equal(skillSpecialization(base, { efficient: 2 }).mana, 204);
  const all = skillSpecialization(base, { overcharge: 2, potent: 2, instant: 2, efficient: 2 });
  assert.equal(all.powerFactor, 1.0368); assert.equal(all.effectFactor, 1.0368); assert.equal(all.mana, 275);
  assert.equal(all.cooldown, 5); assert.equal(all.chant, 1);
});

test('瞬息实际削弱普通效果，强效延时不改机制和硬控', async () => {
  assert.equal(specializeEffectValue('slow', 20, .8), 16);
  assert.equal(specializeEffectDuration('slow', 3, 1), 4);
  assert.equal(specializeEffectDuration('shield', 1, 1), 2);
  for (const code of ['petrify', 'charm', 'sleep', 'nightmare', 'extra_lock', 'mana_regeneration']) assert.equal(specializeEffectDuration(code, 3, 1), 3);
  const f = fixture(); f.source.castSpecialization = skillSpecialization(base, { instant: 40 });
  await cast(f, 'F02', f.friend); assert.ok(Math.abs(f.rules.value(f.friend, 'physical_reduction') - 24 * .96 ** 39) < 1e-8);
  const g = fixture(); g.source.castSpecialization = skillSpecialization(base, { potent: 40 });
  await cast(g, 'F02', g.friend); assert.equal(g.rules.value(g.friend, 'physical_reduction'), 60);
  assert.equal(g.rules.status(g.friend, 'physical_reduction')!.until, g.rules.turn + 3);
});

test('控制强效概率有界，瞬息有代价，强效不额外增伤', async () => {
  assert.equal(specializeControlChance(70, 1.15), 75); assert.equal(specializeControlChance(100, 1.15), 100);
  assert.equal(specializeControlChance(50, .8), 40);
  const a = fixture(); const b = fixture(); b.source.castSpecialization = skillSpecialization(base, { potent: 40 });
  await cast(a, 'A03'); await cast(b, 'A03'); assert.equal(a.target.hp, b.target.hp);
});

test('石化强效概率实际生效，但不延长硬控时长', async () => {
  const normal = fixture(() => .6); const enhanced = fixture(() => .6);
  enhanced.source.castSpecialization = skillSpecialization(base, { potent: 40 });
  await cast(normal, 'B02'); await cast(enhanced, 'B02');
  assert.equal(normal.rules.status(normal.target, 'petrify'), undefined);
  assert.equal(enhanced.rules.status(enhanced.target, 'petrify')!.until, enhanced.rules.turn + 2);
  const reduced = fixture(() => .5); reduced.source.castSpecialization = skillSpecialization(base, { instant: 40 });
  await cast(reduced, 'B02'); assert.equal(reduced.rules.status(reduced.target, 'petrify'), undefined);
});

test('专精10/20/40限制点数，非法等级钳制，不限制合法点数的乘算惩罚', () => {
  assert.deepEqual(['基础', '下位', '中位'].map(specializationMaximum), [10, 20, 40]);
  for (const tier of ['基础', '下位', '中位']) {
    const limit = specializationMaximum(tier);
    const maximum = skillSpecialization({ ...base, tier }, { overcharge: limit, instant: limit, efficient: limit, potent: limit });
    assert.deepEqual(maximum, skillSpecialization({ ...base, tier }, { overcharge: 10000, instant: 10000, efficient: 10000, potent: 10000 }));
    assert.ok(maximum.powerFactor <= 3 && maximum.supportFactor <= 3 && maximum.damageFactor === 1);
    assert.ok(Number.isInteger(maximum.chant) && maximum.chant >= 0);
    assert.ok(Number.isFinite(skillSpecialization({ ...base, tier }, { potent: NaN, efficient: Infinity }).mana));
  }
});

for (const skill of [...nativeSkillBalance, ...residentSkills]) test(`分阶与满专精边界 ${skill.code}`, () => {
  const passive = 'category' in skill && skill.category === 'passive';
  const bounds = skill.tier === '基础' ? [0, 1] : skill.tier === '下位' ? [1, 3] : [3, 6];
  if (!passive) assert.ok(skill.cooldown >= bounds[0] && skill.cooldown <= bounds[1]);
  const definition = { code: skill.code, category: skill.category ?? 'magic', tier: skill.tier, power: skill.power, mana_cost: skill.mana, cooldown_turns: skill.cooldown, chant_turns: skill.chant };
  for (const levels of Array.from({ length: 16 }, (_, mask) => Object.fromEntries(['overcharge', 'potent', 'instant', 'efficient'].map((key, index) => [key, mask & (1 << index) ? 100 : 1])))) {
    const result = skillSpecialization(definition, levels);
    for (const [key, n] of Object.entries(result)) assert.ok(Number.isFinite(n) && (key === 'timeChange' || n >= 0));
    const largestTimeChange = 1.08 ** (2 * (specializationMaximum(skill.tier) - 1)) - 1;
    assert.ok(result.cooldown <= specializeTime(skill.cooldown, largestTimeChange));
    assert.ok(result.chant <= specializeTime(skill.chant, largestTimeChange));
    if (skill.mana > 0) assert.ok(result.mana >= 1);
  }
});

test('无数值落点不出售强效，纯机制不虚设成长', () => {
  assert.deepEqual(specializationOptions({ ...base, code: 'resident_d01', power: 0 }), ['instant']);
  assert.ok(specializationOptions({ ...base, code: 'resident_b02', power: 0 }).includes('potent'));
  assert.ok(!specializationOptions({ ...base, code: 'resident_a03' }).includes('potent'));
  assert.ok(!specializationOptions({ ...base, code: 'healing_light', power: 0 }).includes('overcharge'));
  assert.ok(specializationOptions({ ...base, cooldown_turns: 1, tier: '基础' }).includes('instant'));
  for (const code of ['petrify', 'charm', 'nightmare', 'extra_lock', 'mana_discount', 'mirror']) assert.equal(specializeEffectValue(code, 50, 1.25), 50);
  assert.equal(specializeEffectValue('reduction', 55, 1.25), 60);
});

test('过充增加直伤，强效只增加治疗护盾，普攻不吃主动专精', async () => {
  const normal = fixture(); const enhanced = fixture();
  enhanced.source.castSpecialization = skillSpecialization(base, { overcharge: 40 });
  await cast(normal, 'A03'); await cast(enhanced, 'A03');
  assert.ok(enhanced.target.hp < normal.target.hp);
  const f = fixture(); f.source.castSpecialization = skillSpecialization(base, { potent: 40 });
  await f.rules.restore(f.source, f.friend, 1000); assert.equal(f.friend.hp, 8994);
  await f.rules.shield(f.source, f.friend, 1000, 3); assert.equal(f.rules.shieldValue(f.friend), 1000 * f.source.castSpecialization.supportFactor);
  const a = fixture(); const b = fixture(); b.source.castSpecialization = f.source.castSpecialization;
  await a.rules.strike(a.source, a.target, 100, '无', false, false, false, 1, { skill: false });
  await b.rules.strike(b.source, b.target, 100, '无', false, false, false, 1, { skill: false });
  assert.equal(a.target.hp, b.target.hp);
});

test('强效被动实际放大数值但不放大次数', async () => {
  const f = fixture(); f.source.passives = ['resident_i01'];
  f.source.passiveSpecializations = { resident_i01: passiveSpecializationFactor(20, '下位') };
  assert.equal(f.rules.passive(f.source, 'I01'), passiveSpecializationFactor(20, '下位'));
  assert.ok(!residentScalablePassives.has('resident_l01'));
  assert.equal(await f.rules.incoming(f.source, f.target, 1000, '无', true, true), Math.floor(1000 * (1 + .1 * passiveSpecializationFactor(20, '下位'))));
});

test('普通净化和低级控制不能解除石化魅惑，机制绑定拒绝神圣净化', async () => {
  const f = fixture();
  f.rules.add(f.friend, 'petrify', 1, 3, f.target, true);
  f.rules.add(f.friend, 'slow', 20, 3, f.target, true);
  await f.rules.dispel(f.source, f.friend, true);
  assert.ok(f.rules.status(f.friend, 'petrify')); assert.equal(f.rules.status(f.friend, 'slow'), undefined);
  assert.equal(await f.rules.control(f.target, f.friend, 'sleep', 100, 3), false);
  await f.rules.dispel(f.source, f.friend, true, Infinity, () => true, 'holy');
  assert.equal(f.rules.status(f.friend, 'petrify'), undefined);
  f.rules.addMechanism(f.target, f.friend, 'charm', 1, 'target:3:chain');
  await f.rules.dispel(f.source, f.friend, true, Infinity, () => true, 'holy');
  assert.ok(f.rules.status(f.friend, 'charm'));
  assert.equal(canDispelCombatEffect('charm'), false);
});

test('永久梦魇跨1000轮不失效，只有匹配部位解除且不重生', async () => {
  const f = fixture(); f.target.passives = ['resident_l01']; f.target.state.memory.nightmareMechanism = 'target:3:chain';
  f.rules.start();
  for (let i = 0; i < 1000; i++) { f.rules.end(); f.rules.turn++; f.rules.start(); }
  assert.ok(f.rules.status(f.target, 'nightmare'));
  await f.rules.dispel(f.source, f.target, false); assert.ok(f.rules.status(f.target, 'nightmare'));
  await f.rules.releaseMechanism('target:99:chain'); assert.ok(f.rules.status(f.target, 'nightmare'));
  await f.rules.releaseMechanism('target:3:chain'); f.rules.start(); assert.equal(f.rules.status(f.target, 'nightmare'), undefined);
});

test('机制石化不会被普通伤害打破，正确部位解除', async () => {
  const f = fixture(); f.rules.addMechanism(f.target, f.friend, 'petrify', 1, 'target:3:eye');
  await f.rules.incoming(f.target, f.friend, 100, '火', true, true);
  assert.ok(f.rules.status(f.friend, 'petrify'));
  await f.rules.releaseMechanism('target:3:eye'); assert.equal(f.rules.status(f.friend, 'petrify'), undefined);
});

test('魔力转赠按施法前当前MP计价，不能复制回蓝', async () => {
  assert.equal(manaTransferCost(10000), 1300); assert.equal(manaTransferCost(1001), 580);
  const f = fixture(); f.friend.mp = 0; const paid = manaTransferCost(f.source.mp);
  f.source.mp -= paid; f.source.state.memory.manaTransfer = paid;
  const snapshot = f.rules.supportSnapshot(f.friend);
  await cast(f, 'D01'); assert.equal(f.friend.mp, paid); assert.equal(f.source.mp + f.friend.mp, 2000);
  f.rules.add(f.source, 'echo', 50, 3, f.source);
  const sourceMp = f.source.mp; await f.rules.echoSupport(f.source, f.friend, snapshot); assert.equal(f.source.mp, sourceMp);
});

test('以血换魔不能在1HP无代价续航，非致死伤害不触发佯死', async () => {
  const f = fixture(); f.source.hp = 1; f.source.mp = 0; await cast(f, 'D05', f.source); assert.equal(f.source.mp, 0);
  f.source.hp = 1500; f.rules.add(f.source, 'feign', 1, 3, f.source);
  await f.rules.take(f.source, 100); assert.equal(f.source.hp, 1400);
  await f.rules.take(f.source, 1500); assert.equal(f.source.hp, 1); assert.equal(f.rules.status(f.source, 'feign'), undefined);
});

test('节拍跨正常回合可触发，选中友方优先于默认目标', async () => {
  const f = fixture(); await cast(f, 'H05'); f.rules.turn++;
  const hp = f.friend.hp; await f.rules.restore(f.source, f.friend, 1000); assert.equal(f.friend.hp - hp, 1200);
  assert.equal(f.rules.status(f.source, 'beat'), undefined);
  await cast(f, 'F02', f.friend); assert.ok(f.rules.status(f.friend, 'physical_reduction')); assert.equal(f.rules.status(f.source, 'physical_reduction'), undefined);
});

for (const skill of residentSkills.filter(skill => skill.category === 'utility')) {
  const definition = { code: skill.code, category: skill.category, tier: skill.tier, power: skill.power, mana_cost: skill.mana, cooldown_turns: skill.cooldown, chant_turns: skill.chant };
  if (specializationOptions(definition).includes('potent') && !['B01', 'B02', 'B03', 'L04'].includes(skill.id)) test(`辅助强效有实际落点 ${skill.code}`, async () => {
    const a = fixture(); const b = fixture();
    b.source.castSpecialization = skillSpecialization(definition, { potent: specializationMaximum(skill.tier) });
    for (const f of [a, b]) { f.rules.add(f.friend, skill.id === 'K06' ? 'sleep' : 'poison', 5, 3, f.target, true); await cast(f, skill.id, f.friend); }
    const outcome = (f: ReturnType<typeof fixture>) => f.rules.units.map(unit => ({ hp: unit.hp, statuses: unit.state.statuses.map(e => [e.code, e.value, e.until]) }));
    assert.notDeepEqual(outcome(a), outcome(b));
  });
}

test('冷却重置和减冷却不触碰异械、职业计数器或机制锁', async () => {
  const f = fixture(); f.source.cooldowns = { fireball: 3, advanced_resource: 100, device_core: 8, __extraLock: 9 };
  await cast(f, 'M01', f.source);
  assert.equal(f.source.cooldowns.fireball, 0);
  assert.equal(f.source.cooldowns.advanced_resource, 100); assert.equal(f.source.cooldowns.device_core, 8); assert.equal(f.source.cooldowns.__extraLock, 9);
});

test('已算过充威力的混乱友伤分支不重复乘算专精', async () => {
  const a = fixture(); const b = fixture();
  a.source.castSpecialization = b.source.castSpecialization = skillSpecialization(base, { overcharge: 40, potent: 40 });
  await a.rules.strike(a.source, a.friend, 100, '火', true);
  await b.rules.strike(b.source, b.friend, 100 * b.source.castSpecialization.powerFactor, '火', true, false, false, 1, { specializedPower: true });
  assert.equal(a.friend.hp, b.friend.hp);
});

test('最终配置覆盖可重复执行，不重置玩家学习/专精/SP/自动设置', async () => {
  const calls: Array<{ sql: string; args?: unknown[] }> = [];
  const pool = { execute: async (sql: string, args?: unknown[]) => { calls.push({ sql, args }); return [{ affectedRows: 1 }]; }, query: async (sql: string) => { calls.push({ sql }); return [[]]; } };
  await initializeCombatSkillBalance(pool as any); await initializeCombatSkillBalance(pool as any);
  assert.equal(calls.filter(call => call.sql.startsWith('UPDATE skill_definitions SET\n')).length, nativeSkillBalance.length * 2);
  assert.ok(!calls.some(call => /UPDATE (characters|player_)|DELETE|INSERT INTO player_/i.test(call.sql)));
});
