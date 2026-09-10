import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDerivedStats, forgedAffixCap, legacyForgedEquipmentBase as forgedEquipmentBase } from '../src/game/constants';
import { halveEquipmentVitalAffixes, migrateEquipmentVitalAffixes } from '../src/database/equipment-vital-affixes';

test('各等级稀有度生命魔力系数减半；其他词条与人物六维公式不变', () => {
  for (const level of [5, 15, 20, 25, 30, 50]) for (const [rarity, scale] of [['优秀', 1.15], ['传说', 1.7], ['史诗', 2]] as const) {
    const armor = forgedEquipmentBase(level, '防具') * scale;
    const weapon = forgedEquipmentBase(level, '武器') * scale;
    assert.equal(forgedAffixCap('防具', 'hpMax', level, rarity), armor * 2);
    assert.equal(forgedAffixCap('武器', 'mpMax', level, rarity), weapon * 2);
    assert.equal(forgedAffixCap('防具', 'evasion', level, rarity), armor);
    assert.equal(forgedAffixCap('武器', 'tenacityPierce', level, rarity), weapon * .5);
    assert.equal(forgedAffixCap('防具', 'mpMax', level, rarity), 0);
    assert.equal(forgedAffixCap('武器', 'hpMax', level, rarity), 0);
  }
  assert.equal(Number(forgedAffixCap('防具', 'hpMax', 30, '史诗').toFixed(2)), 993.6);
  assert.equal(Number(forgedAffixCap('武器', 'mpMax', 30, '史诗').toFixed(2)), 1987.2);
  const naked = calculateDerivedStats({ constitution: 65, spirit: 65, strength: 65, intelligence: 65, agility: 65, perception: 65 });
  assert.equal(Math.round(naked.hpMax), 2356);
  assert.equal(Math.round(naked.mpMax), 2296);
});

test('旧装备按原值减半，不是只截断上限；不改变其他字段或原对象', () => {
  const effect = { hpMax: 1459.23, mpMax: 100, hpPct: 50, physicalDefense: 496.8, epicSetCode: 'mistmother_cocoon' };
  assert.deepEqual(halveEquipmentVitalAffixes(effect), { ...effect, hpMax: 729.62, mpMax: 50 });
  assert.equal(effect.hpMax, 1459.23);
  assert.equal(halveEquipmentVitalAffixes(null), null);
  assert.deepEqual(halveEquipmentVitalAffixes(JSON.stringify(effect), '["hpMax"]'), { ...effect, mpMax: 50 });
  assert.deepEqual(halveEquipmentVitalAffixes({ hpPct: 50 }), { hpPct: 50 });
});

const fixture = (failRefresh = false) => {
  let state = { applied: false, template: { hpMax: 100, physicalDefense: 30 }, instance: { hpMax: 160, physicalDefense: 40 } };
  let backup = structuredClone(state);
  let released = 0;
  const refreshed: number[] = [];
  const connection = {
    beginTransaction: async () => { backup = structuredClone(state); },
    commit: async () => {}, rollback: async () => { state = structuredClone(backup); }, release: () => { released++; },
    execute: async (sql: string, args: any[]) => {
      if (sql.startsWith('INSERT IGNORE')) { const affectedRows = state.applied ? 0 : 1; state.applied = true; return [{ affectedRows }]; }
      if (sql.startsWith('UPDATE player_item_instances')) { state.instance = JSON.parse(args[0]); return [{}]; }
      if (sql.startsWith('UPDATE item_definitions')) { state.template = JSON.parse(args[0]); return [{}]; }
      throw new Error(`unexpected execute: ${sql}`);
    },
    query: async (sql: string) => {
      assert.ok(sql.includes("i.item_type='equipment' AND i.rarity<>'神器'"));
      assert.ok(sql.includes("LEFT(i.code,8)='crafted_'"));
      if (sql.includes('FROM player_item_instances')) return [[
        { id: 1, character_id: 10, effect_json: structuredClone(state.instance), forge_primary_json: ['physicalDefense'] },
        { id: 2, character_id: 10, effect_json: null, forge_primary_json: null }
      ]];
      if (sql.includes('FROM player_equipment')) return [[{ character_id: 11 }]];
      if (sql.includes('FROM item_definitions')) return [[{ id: 5, effect_json: structuredClone(state.template) }]];
      throw new Error(`unexpected query: ${sql}`);
    }
  };
  const pool = { getConnection: async () => connection } as unknown as Parameters<typeof migrateEquipmentVitalAffixes>[0];
  const run = () => migrateEquipmentVitalAffixes(pool, async (_connection, id) => {
    refreshed.push(id);
    if (failRefresh) throw new Error('刷新失败');
  });
  return { run, refreshed, state: () => state, released: () => released };
};

test('迁移同步模板及实例各减一次，并刷新实例持有人与旧版穿戴角色', async () => {
  const f = fixture();
  assert.equal(await f.run(), true);
  assert.deepEqual(f.state(), { applied: true, template: { hpMax: 50, physicalDefense: 30 }, instance: { hpMax: 80, physicalDefense: 40 } });
  assert.deepEqual(f.refreshed, [10, 11]);
  assert.equal(await f.run(), false);
  assert.equal(f.state().instance.hpMax, 80);
  assert.deepEqual(f.refreshed, [10, 11]);
  assert.equal(f.released(), 2);
});

test('刷新失败时回滚装备和标记，不能留下半迁移或重复减半状态', async () => {
  const f = fixture(true);
  await assert.rejects(f.run(), /刷新失败/);
  assert.deepEqual(f.state(), { applied: false, template: { hpMax: 100, physicalDefense: 30 }, instance: { hpMax: 160, physicalDefense: 40 } });
  assert.equal(f.released(), 1);
});
