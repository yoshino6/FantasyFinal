import assert from 'node:assert/strict';
import test from 'node:test';
import { aoeDamageProfiles, aoeSkillPower, aoeDescription } from '../src/game/aoe-damage.config';
import { resolveStrike } from '../src/game/combat-math';
import { skillSpecialization } from '../src/game/skill-specialization';
import { seedInventory } from '../scripts/skill-seed-inventory';
import { CombatRules, emptyRuleState, type RuleUnit } from '../src/game/combat-rule-registry';

for (const [code, profile] of Object.entries(aoeDamageProfiles)) {
  test(code + '：直接威力固定覆盖且不重复缩放', () => {
    assert.equal(aoeSkillPower(code, 50), profile.power);
    assert.equal(aoeSkillPower(code, profile.power), profile.power);
    assert.ok(Number.isInteger(profile.power) && profile.power > 0);
  });
}
test('低威力群攻相对高威力单体，在高防目标上的伤害占比进一步降低', () => {
  const ratios = [1, 1000, 10000].map(defense => {
    const single = resolveStrike(1500, defense, 100, 1, 0, 100, 100, 100, true).damage;
    const area = resolveStrike(1000, defense, 100, 1, 0, 100, 100, 100, true).damage;
    return area / single;
  });
  assert.ok(ratios[0] > ratios[1] && ratios[1] > ratios[2]);
});
test('群攻登记覆盖种子中的直接全体攻击；普通单体与未命中不折算', () => {
  for (const row of seedInventory().filter(row => (row.range_type === '全体' || row.target_scope === '全体') && ['physical', 'magic'].includes(row.category) && Number(row.power) > 0))
    assert.ok(aoeDamageProfiles[row.code], row.code);
  assert.equal(aoeSkillPower('basic_attack', 100), 100);
  assert.equal(aoeSkillPower('automaton_S031', 0, true), 273);
});
test('专精改变直接威力，旧描述可重复清理而不累计倍率', () => {
  const base = { code: 'elementalist_sky_sequence', tier: '中位', category: 'magic', power: 50, mana_cost: 420, cooldown_turns: 6, chant_turns: 0 };
  const plain = skillSpecialization(base, {});
  const upgraded = skillSpecialization(base, { overcharge: 3 });
  assert.equal(plain.power, aoeSkillPower(base.code, 0));
  assert.ok(upgraded.power > plain.power);
  const description = aoeDescription(base.code, '造成50%魔法伤害');
  assert.equal(aoeDescription(base.code, description), description);
  assert.match(description, /139%魔法伤害/);
  assert.doesNotMatch(description, /单体基准|防御后|每目标伤害/);
  const migrated = aoeDescription(base.code, '造成185%单体基准魔法伤害；群攻结算：以185%单体基准计算防御，每目标直伤乘75%。');
  assert.equal(migrated, description);
});
test('规则引擎双方都按直接威力结算，不自动添加群攻折扣', async () => {
  for (const side of ['member', 'target']) for (const defense of [100, 1000, 10000]) {
    const unit = (key: string, team: string): RuleUnit => ({ key, name: key, side: team, level: 30, boss: false, hp: 100000, hpMax: 100000, mp: 2000, mpMax: 2000, attack: 1000, magic: 1000, defense, magicDefense: defense, accuracy: 100, evasion: 10, speed: 100, crit: 0, critResist: 100, critDamage: 100, critReduction: 100, pierce: 100, tenacity: 100, state: emptyRuleState(), cooldowns: {}, passives: [], resistance: {}, mastery: {} });
    const source = unit('source', side), target = unit('target', side === 'member' ? 'target' : 'member');
    const rules = new CombatRules([source, target], 1, [], { absorb: async () => 0, legacyEffects: () => [], removeLegacy: async () => {}, extraAction: () => {}, swapThreat: async () => {} }, '', undefined, () => .5);
    await rules.strike(source, target, 150, '无', true, false, true, 1, { single: true });
    const single = 100000 - target.hp;
    target.hp = 100000;
    await rules.strike(source, target, 100, '无', true, false, true, 1, { single: false });
    const expected = Math.floor(1000 * 1000 / (1000 + defense));
    assert.equal(100000 - target.hp, expected);
    assert.ok(100000 - target.hp < single);
  }
});
