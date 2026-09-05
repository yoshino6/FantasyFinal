import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { skillSpecialization, specializeEffectValue } from '../src/game/skill-specialization';
import { nativeCleanseLimit } from '../src/game/combat-dispel-policy';
import { balancedSkillDescription } from '../src/game/combat-skill-balance.config';
import { CombatRules, emptyRuleState, type RuleUnit } from '../src/game/combat-rule-registry';
import { initializeResidentSkills } from '../src/database/resident-skills';

// 抽取并执行源码函数，隔离数据库和机器人初始化，不复制结算算法。
const loadFunction = (name: string, dependencies: Record<string, unknown>) => {
  const file = ts.createSourceFile('adventure.ts', readFileSync(new URL('../src/game/adventure.service.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  let declaration: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) declaration = node; ts.forEachChild(node, visit); };
  visit(file); assert.ok(declaration);
  const source = ts.transpileModule(`const ${declaration.getText(file)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(dependencies), `${source}\nreturn ${name};`)(...Object.values(dependencies));
};
const makeUnit = (id: number): RuleUnit => ({ key: `member:${id}`, name: `友方${id}`, side: 'member', level: 30, boss: false, hp: 5000, hpMax: 10000, mp: 2000, mpMax: 3000, attack: 700, magic: 800, defense: 400, magicDefense: 450, accuracy: 100, evasion: 30, speed: 100, crit: 100, critResist: 100, critDamage: 100, critReduction: 100, pierce: 100, tenacity: 100, state: emptyRuleState(), cooldowns: {}, passives: [], resistance: {}, mastery: {} });
const fixture = () => {
  const source = makeUnit(1); const ally = makeUnit(2);
  const rules = new CombatRules([source, ally], 1, [], { absorb: async () => 0, legacyEffects: () => [], removeLegacy: async () => {}, extraAction: () => {}, swapThreat: async () => {} }, '', undefined, () => .01);
  const calls: Array<{ sql: string; args?: any[] }> = [];
  let effect: any = { id: 1, skill_code: 'frost_barrier', code: 'life_shield', name: '护盾', effect_type: 'shield', target_scope: 'self', value: 20, duration: 3, effect_level: 1, max_stacks: 1, stackable: 0 };
  const connection = { execute: async (sql: string, args?: any[]) => { calls.push({ sql, args }); return [sql.includes('FROM skill_effects se') ? [effect] : sql.includes('SELECT sd.tier') ? [{ tier: '中位', specialization: 'potent', level: 40 }, { tier: '中位', specialization: 'overcharge', level: 40 }] : []]; } };
  const shields: any[][] = [];
  const apply = loadFunction('applySkillEffects', { skillSpecialization, specializeEffectValue, nativeCleanseLimit, effectMessage: () => '', effectMarkerForTarget: () => '#', grantLifeShield: async (...args: any[]) => { shields.push(args); return { added: args[5] }; } });
  const invoke = () => apply(connection, 'test', 1, { id: 1, hp_max: 20000 }, 'member', { id: 2, hp_max: 10000 }, 'member', 'on_cast', [], 0, 1, rules);
  return { source, ally, rules, calls, shields, invoke, setEffect: (value: any) => { effect = { ...effect, ...value }; } };
};

test('冰霜护盾选中队友，按队友生命计算且过充/强效只乘一次', async () => {
  const f = fixture(); await f.invoke();
  assert.equal(f.shields[0][3], 2); assert.equal(f.shields[0][4], 10000);
  assert.equal(f.shields[0][5], 3125);
});
test('原生生命护盾消耗共鸣节拍并实际增加护盾', async () => {
  const f = fixture(); f.rules.add(f.source, 'beat', 20, 3, f.source); await f.invoke();
  assert.equal(f.shields[0][5], 3750); assert.equal(f.rules.status(f.source, 'beat'), undefined);
});
test('净化之光对选定友方生效，最多2层且不移除石化', async () => {
  const f = fixture(); f.setEffect({ skill_code: 'purifying_light', code: 'cleanse', effect_type: 'cleanse' });
  for (const code of ['petrify', 'slow', 'blind', 'silence']) f.rules.add(f.ally, code, 20, 3, f.source, true);
  f.rules.add(f.source, 'slow', 20, 3, f.source, true); await f.invoke();
  assert.ok(f.rules.status(f.ally, 'petrify')); assert.equal(f.rules.effects(f.ally).length, 2);
  assert.ok(f.rules.status(f.source, 'slow'));
});
test('原生强效普通增益落入实际状态写入，不只改详情', async () => {
  const f = fixture(); f.setEffect({ skill_code: 'war_cry', code: 'attack', target_scope: 'ally', effect_type: 'stat_modifier', value: 20 });
  await f.invoke();
  const row = f.calls.find(call => call.sql.startsWith('INSERT INTO combat_status_effects'))!;
  assert.equal(row.args![2], 2); assert.equal(row.args![5], 25);
});
test('治疗专精在封顶前结算且只影响本次原生治疗量', async () => {
  const f = fixture(); f.ally.hp = 9900;
  const heal = loadFunction('specializedNativeHealing', { ruleUnit: (_kind: string, id: number) => id === 1 ? f.source : f.ally, rules: f.rules, activeSpecialization: { supportFactor: 1.25 } });
  assert.equal(await heal({ id: 1 }, { id: 2 }, 1000), 1250);
  assert.equal(f.ally.hp, 9900); // 函数只返回原始治疗量，由调用者封顶并触发装备。
});
test('威力描述与最终配置一致', () => {
  assert.equal(balancedSkillDescription('ironbreaker_steel_flash', '造成245%物理伤害。'), '造成195%物理伤害。');
  assert.equal(balancedSkillDescription('spellblade_starfire_duel', '造成225%魔法伤害。'), '造成185%魔法伤害。');
});
test('梦魇被动兼容仅清理自己的旧主动快捷栏，不重置学习和自动设置', async () => {
  const calls: string[] = [];
  const pool = { query: async (sql: string) => { calls.push(sql); return [sql.includes('information_schema') ? [{ COLUMN_NAME: 'mode' }] : []]; }, execute: async (sql: string) => { calls.push(sql); return [{}]; } };
  await initializeResidentSkills(pool as any);
  const writes = calls.filter(sql => /UPDATE player_|DELETE.*player_|INSERT.*player_/i.test(sql));
  assert.equal(writes.length, 1); assert.ok(writes[0].includes("s.code='resident_l01'"));
  assert.ok(writes[0].includes('SET ps.quick_slot=NULL')); assert.ok(!writes[0].includes('passive_linked'));
});
