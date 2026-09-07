import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { calculateDerivedStats, equipmentQualityMultiplier } from '../src/game/constants';
import { calculatePanelStats, panelPercentKeys } from '../src/game/panel-stat-formula';

const base = calculateDerivedStats({ constitution: 65, spirit: 65, strength: 65, intelligence: 65, agility: 65, perception: 65 });
// 隔离数据库初始化，执行真实装备属性装配函数。
const source = ts.createSourceFile('character.ts', readFileSync(new URL('../src/game/character.service.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['jsonRecord', 'armorClassModifier', 'withEquipmentStats'];
const declarations = source.statements.filter(s => ts.isVariableStatement(s) && s.declarationList.declarations.some(d => names.includes(d.name.getText(source))));
assert.equal(declarations.length, names.length);
const compiled = ts.transpileModule(declarations.map(s => s.getText(source)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const withEquipmentStats = new Function('equipmentQualityMultiplier', 'calculatePanelStats', 'panelPercentKeys', `${compiled}; return withEquipmentStats;`)(equipmentQualityMultiplier, calculatePanelStats, panelPercentKeys);
const connection = (equipment: unknown[], food: unknown[] = []) => ({ execute: async (sql: string) => {
  assert.match(sql, /^SELECT/);
  return [sql.includes('player_food_buffs') ? food : equipment];
} });

test('全部派生属性先加装备固定值，再乘同项百分比之和，仅最终取整', () => {
  const percent = Object.fromEntries(Object.values(panelPercentKeys).map(k => [k, 78]));
  const flat = Object.fromEntries(Object.keys(panelPercentKeys).map(k => [k, 123.45]));
  const result = calculatePanelStats(base, flat, percent);
  for (const key of Object.keys(base) as Array<keyof typeof base>) assert.equal(result[key], Math.floor((base[key] + 123.45) * 1.78));
  assert.deepEqual(calculatePanelStats(base, {}, {}), Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.floor(v)])));
});

test('进化和多件装备同项百分比相加；固定数值先折算一次品质，再参与百分比计算', async () => {
  const result = await withEquipmentStats(connection([
    { effect_json: { hpPct: 50 }, quality: 100 },
    { effect_json: JSON.stringify({ hpPct: 10, hpMax: 1000 }), quality: 50 }
  ]), 1, { ...base, hpMax: 1000 }, { hpPct: 28 });
  assert.equal(result.hpMax, 3348); // (1000 + 1000 × .8) × (1 + .28 + .50 + .08)
});

test('呐呐已减半生命副词条的构筑，按固定值在前的新顺序为6811', async () => {
  const result = await withEquipmentStats(connection([
    { effect_json: { hpPct: 50 }, quality: 100 },
    { effect_json: { hpMax: 729.62 }, quality: 75.5 }
  ]), 1, { ...base, hpMax: 3168.5 }, { hpPct: 28 });
  assert.equal(result.hpMax, 6811);
});

test('固定数值加入后应用精通及餐食独立倍率；二转固有最后计算', async () => {
  const result = await withEquipmentStats(connection([
    { effect_json: { mpPct: 66, mpMax: 2000 }, quality: 100 }
  ], [{ buff_json: { mpPct: 10 } }]), 1, { ...base, mpMax: 1000 }, { mpPct: 7 }, [{ mpPct: 50 }]);
  const beforeAdvanced = Math.floor((1000 + 2000) * 1.73 * 1.1 * 1.5);
  assert.equal(result.mpMax, beforeAdvanced);
  assert.equal(calculatePanelStats(result, {}, { mpPct: 5 }).mpMax, Math.floor(beforeAdvanced * 1.05));
});

test('甲类对装备双防和最终机动性的修正仍然有效', async () => {
  const result = await withEquipmentStats(connection([
    { effect_json: { physicalDefense: 100, magicDefense: 100, speed: 100 }, quality: 100, weapon_type: '板甲' }
  ]), 1, { ...base, physicalDefense: 100, magicDefense: 100, speed: 100 }, { physicalDefensePct: 50 });
  assert.equal(result.physicalDefense, 420);
  assert.equal(result.magicDefense, 260);
  assert.equal(result.speed, 168);
});

test('负向百分比作用于基础与固定值之和，最终属性不低于零', () => {
  assert.equal(calculatePanelStats(base, { hpMax: 100 }, { hpPct: -150 }).hpMax, 0);
});
