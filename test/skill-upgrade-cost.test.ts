import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { skillSpecialization, specializationOptions, specializationMaximum, specializeEffectValue, specializeEffectDuration, specializeControlChance } from '../src/game/skill-specialization';
import { canSpecializePassive, passiveSpecializationFactor } from '../src/game/passive-specialization';

// 执行真实服务函数，以内存查询替身核对扣费、流水和详情；不连接真实数据库。
const file = ts.createSourceFile('adventure.ts', readFileSync(new URL('../src/game/adventure.service.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['activeSkillUpgradeCost', 'masteryUpgradeCost', 'weaponMasteryCodes', 'upgradeSkill', 'upgradeSkillSpecialization', 'upgradeAppraisal', 'learnSkill', 'skillDetail'];
const declarations = file.statements.filter(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(d => names.includes(d.name.getText(file))));
assert.equal(declarations.length, names.length);
const compiled = ts.transpileModule(declarations.map(d => d.getText(file).replace(/^export\s+/, '')).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

const fixture = (overrides: Record<string, unknown> = {}, points = 100, specLevel = 3) => {
  const skill = { id: 7, code: 'test', name: '测试技能', category: 'magic', tier: '中位', level: 99, max_level: 200, learned: 1, learn_cost: 8, upgrade_cost: 9, power: 100, mana_cost: 100, cooldown_turns: 3, chant_turns: 0, passive_effect_json: { damageBonusPct: 10 }, ...overrides };
  const writes: Array<{ sql: string; args: any[] }> = []; const logs: any[][] = [];
  const effects = [{ code: 'slow', effect_type: 'stat_modifier', value: 20, duration: 3 }];
  const connection = { execute: async (sql: string, args: any[] = []) => {
    if (!sql.startsWith('SELECT')) { writes.push({ sql, args }); return [[]]; }
    if (sql.startsWith('SELECT 1 FROM combat_members')) return [[]];
    if (sql.includes('FROM skill_effects')) return [effects.map(e => ({ ...e }))];
    if (sql.includes('FROM player_appraisal_progress')) return [[{ range_level: specLevel, information_level: specLevel }]];
    if (sql.includes('FROM player_skill_specializations')) return [sql.startsWith('SELECT specialization,level')
      ? [{ specialization: 'overcharge', level: specLevel }, { specialization: 'instant', level: specLevel }]
      : [{ level: specLevel }]];
    if (sql.includes('skill_definitions')) return [[{ ...skill }]];
    throw new Error(`未覆盖的查询：${sql}`);
  } };
  const deps = {
    characterFor: async () => ({ id: 1, level: 40, skill_points: points }), getPool: async () => connection,
    withTransaction: async (callback: (c: typeof connection) => unknown) => callback(connection),
    recordSkillPointChange: async (...args: any[]) => { logs.push(args); }, recalculateCharacterStats: async () => {},
    isAdvancedProfessionSkillCode: () => false, residentSkillByCode: () => undefined,
    jsonObject: (value: any) => value ?? {}, skillSpecialization, specializationOptions, specializationMaximum,
    specializeEffectValue, specializeEffectDuration, specializeControlChance, canSpecializePassive, passiveSpecializationFactor
  };
  const service = new Function(...Object.keys(deps), `${compiled}\nreturn { ${names.join(',')} };`)(...Object.values(deps));
  const charged = () => writes.filter(w => w.sql === 'UPDATE characters SET skill_points=skill_points-? WHERE id=?').map(w => w.args[0]);
  return { service, writes, logs, charged };
};

test('普通技能高低等级升级均扣1SP，流水与返回值一致', async () => {
  for (const level of [1, 9, 10, 19, 20, 39, 99, 157]) {
    const f = fixture({ level }, 1);
    const result = await f.service.upgradeSkill('test', 7);
    assert.equal(result.cost, 1); assert.equal(result.level, level + 1);
    assert.deepEqual(f.charged(), [1]); assert.equal(f.logs[0][2], -1);
  }
});

test('全部等阶和四项专精、数值被动每次扣1SP，详情同价', async () => {
  for (const tier of ['基础', '下位', '中位']) for (const specialization of ['overcharge', 'potent', 'instant', 'efficient']) {
    const f = fixture({ tier }, 1);
    const result = await f.service.upgradeSkillSpecialization('test', 7, specialization);
    assert.equal(result.cost, 1); assert.equal(result.level, 4); assert.deepEqual(f.charged(), [1]); assert.equal(f.logs[0][2], -1);
    const detail = await f.service.skillDetail('test', 7);
    assert.equal(detail.specializationUpgradeCost, 1); assert.equal(detail.nextUpgradeCost, 1);
  }
  const passive = fixture({ code: 'resident_i01', category: 'passive' }, 1);
  assert.equal((await passive.service.upgradeSkillSpecialization('test', 7, 'potent')).cost, 1);
  assert.equal((await passive.service.skillDetail('test', 7)).specializationUpgradeCost, 1);
});

test('SP不足不能扣费，满级仍拒绝升级', async () => {
  for (const call of ['upgradeSkill', 'upgradeSkillSpecialization']) {
    const f = fixture({}, 0);
    await assert.rejects(f.service[call]('test', 7, 'overcharge'), /需要 1 点/);
    assert.deepEqual(f.charged(), []); assert.equal(f.logs.length, 0);
  }
  const capped = fixture({ tier: '基础' }, 100, 10);
  await assert.rejects(capped.service.upgradeSkillSpecialization('test', 7, 'overcharge'), /最高等级/);
  assert.deepEqual(capped.charged(), []);
});

test('七种武器专精两条路线保留当前等级乘2的成本，预览一致', async () => {
  for (const code of ['longsword_mastery', 'shield_mastery', 'staff_mastery', 'spellbook_mastery', 'orb_mastery', 'dagger_mastery', 'fistblade_mastery']) for (const direction of ['overcharge', 'instant']) {
    const f = fixture({ code, category: 'bound' }, 100, 3);
    assert.equal((await f.service.upgradeSkillSpecialization('test', 7, direction)).cost, 6);
    assert.deepEqual(f.charged(), [6]); assert.equal(f.logs[0][2], -6);
    const detail = await f.service.skillDetail('test', 7);
    assert.equal(detail.masteryProficiencyCost, 6); assert.equal(detail.masteryFocusCost, 6);
  }
});

test('鉴识慧眼和识珠保留独立价格，首次学习费用不变', async () => {
  for (const [direction, cost] of [['range', 3], ['information', 4]]) {
    const f = fixture({ code: 'appraisal', category: 'bound' }, 100, 3);
    assert.equal((await f.service.upgradeAppraisal('test', direction)).cost, cost);
    assert.deepEqual(f.charged(), [cost]); assert.equal(f.logs[0][2], -Number(cost));
  }
  const learning = fixture();
  assert.equal((await learning.service.learnSkill('test', 7)).cost, 8);
  assert.deepEqual(learning.charged(), [8]); assert.equal(learning.logs[0][2], -8);
});
