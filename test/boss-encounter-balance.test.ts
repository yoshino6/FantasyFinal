import assert from 'node:assert/strict';
import test from 'node:test';
import { monsterCombatStats } from '../src/game/adventure.service';
import { applyEncounterSummonBalance, encounterSummonProfiles } from '../src/game/boss-encounter-balance';
import { kingbeastCoreDamageMultiplier, kingbeastPanelSummary } from '../src/game/kingbeast.config';

const row = (code: string, traits: unknown[] = []) => ({ code, template_code: code, level: 30, monster_class: 'normal',
  constitution: 20, spirit: 20, strength: 20, intelligence: 20, agility: 20, perception: 20,
  constitution_growth: 1, spirit_growth: 1, strength_growth: 1, intelligence_growth: 1, agility_growth: 1, perception_growth: 1, traits_json: traits });

test('生成模板、数据库别名和重复读取均应用一次召唤物修正', () => {
  for (const code of Object.keys(encounterSummonProfiles)) {
    const input = row(code); const stats = monsterCombatStats(input);
    const alias = { ...input, code: undefined, template_code: undefined, growth_template_code: code };
    assert.deepEqual(monsterCombatStats(alias), stats);
    assert.deepEqual(monsterCombatStats({ ...input, current_hp: Math.floor(stats.hpMax / 2) }), stats);
    const before = monsterCombatStats({ ...input, traits_json: [{ code: 'main_quest_goblin_king', name: '' }] });
    // 该标记只隔离新增倍率；不改变无王庭角色的测试模板原有面板。
    assert.deepEqual(stats, applyEncounterSummonBalance(before, code));
  }
});

test('普通模板与Boss本体不额外增强，主线侍卫不使用新增倍率', () => {
  const stats = monsterCombatStats(row('goblin'));
  for (const code of ['goblin', 'goblin_king', 'habadragon', 'necromancer_uz', 'threehead_mother']) assert.equal(applyEncounterSummonBalance(stats, code), stats);
  assert.equal(applyEncounterSummonBalance(stats, 'goblin_royal_guard', true), stats);
});

test('普通、强大、梦幻的召唤生命一致，非生命属性仍随来源难度增长', () => {
  for (const code of Object.keys(encounterSummonProfiles)) {
    const samples = ['ordinary', 'powerful', 'dreamlike'].map(inheritedBossTraitCode => monsterCombatStats(row(code, [
      { code: 'summoned', name: '召唤的' },
      { code: 'boss_summon_inheritance', inheritedBossTraitCode }
    ])));
    assert.equal(samples[0].hpMax, samples[1].hpMax, code);
    assert.equal(samples[0].hpMax, samples[2].hpMax, code);
    assert.ok(samples[2].physicalAttack > samples[1].physicalAttack && samples[1].physicalAttack > samples[0].physicalAttack, code);
    assert.ok(samples[2].magicAttack > samples[1].magicAttack && samples[1].magicAttack > samples[0].magicAttack, code);
  }
});

test('王庭共生地图减伤25%，主线33%，两者面板与伤害一致', () => {
  const king = { current_hp: 100, hp_max: 100, traits_json: [{ code: 'kingbeast_encounter', role: 'king' }] };
  const guards = ['guard', 'spearman'].map(role => ({ current_hp: 100, traits_json: [{ code: 'kingbeast_encounter', role }] }));
  assert.equal(kingbeastCoreDamageMultiplier(king, true), .75);
  assert.match(kingbeastPanelSummary([king, ...guards], 1, 0), /承伤-25%/);
  const story = { ...king, traits_json: [...king.traits_json, { code: 'main_quest_goblin_king', role: '' }] };
  assert.equal(kingbeastCoreDamageMultiplier(story, true), .67);
  assert.match(kingbeastPanelSummary([story, ...guards], 1, 0), /承伤-33%/);
});
