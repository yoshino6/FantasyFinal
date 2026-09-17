import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  equipmentCategoryAcceptsEnchantment,
  transferEquipmentEnchantment
} from '../src/game/equipment-enchantment-lifecycle';

test('附魔迁移按目标装备真实部位校验', () => {
  assert.equal(equipmentCategoryAcceptsEnchantment('武器', ['weapon']), true);
  assert.equal(equipmentCategoryAcceptsEnchantment('武器', '["offhand"]'), true);
  assert.equal(equipmentCategoryAcceptsEnchantment('副手', ['weapon']), false);
  assert.equal(equipmentCategoryAcceptsEnchantment('头部', ['shoulder']), true);
  assert.equal(equipmentCategoryAcceptsEnchantment('上装', ['upper', 'lower']), true);
  assert.equal(equipmentCategoryAcceptsEnchantment('戒指', ['necklace', 'bracelet']), false);
  assert.equal(equipmentCategoryAcceptsEnchantment('武器', '{broken'), false);
});

const connection = (category: string, enchantment: unknown, affectedRows = 1) => {
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    value: {
      execute: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.startsWith('SELECT i.item_category')) return [[{ item_category: category }]];
        if (sql.startsWith('SELECT card_code')) return [[enchantment].filter(Boolean)];
        if (sql.startsWith('UPDATE equipment_enchantments')) return [{ affectedRows }];
        throw new Error(`Unhandled SQL: ${sql}`);
      }
    } as any
  };
};

test('跨实例加工只迁移原附魔行，完整快照不会被重建', async () => {
  const fake = connection('武器', { card_code: 'monster_card_test', revision: 4, allowed_slots_json: ['weapon'] });
  const result = await transferEquipmentEnchantment(fake.value, 11, 22);
  assert.deepEqual(result, { transferred: true, cardCode: 'monster_card_test', revision: 4 });
  assert.deepEqual(fake.calls.map(call => call.params), [[22], [11], [22, 11]]);
  assert.equal(fake.calls[2].sql, 'UPDATE equipment_enchantments SET instance_id=? WHERE instance_id=?');
});

test('没有附魔时不创建记录；目标部位不兼容时不迁移', async () => {
  const empty = connection('武器', null);
  assert.deepEqual(await transferEquipmentEnchantment(empty.value, 11, 22), { transferred: false });
  assert.equal(empty.calls.some(call => call.sql.startsWith('UPDATE equipment_enchantments')), false);

  const incompatible = connection('上装', { card_code: 'monster_card_weapon', revision: 1, allowed_slots_json: '["weapon"]' });
  await assert.rejects(transferEquipmentEnchantment(incompatible.value, 11, 22), /不能用于上装/);
  assert.equal(incompatible.calls.some(call => call.sql.startsWith('UPDATE equipment_enchantments')), false);
});

test('旧重铸严格先建新实例、迁移附魔、再删旧实例；销毁依赖外键级联', () => {
  const source = readFileSync('src/game/blacksmith.service.ts', 'utf8');
  const start = source.indexOf('export const reforgeEquipment =');
  const end = source.indexOf('type EpicRecipeMaterialView', start);
  const reforge = source.slice(start, end);
  const create = reforge.indexOf("INSERT INTO player_item_instances");
  const transfer = reforge.indexOf('transferEquipmentEnchantment(connection');
  const remove = reforge.indexOf("DELETE FROM player_item_instances");
  assert.ok(create >= 0 && create < transfer && transfer < remove);
  assert.match(reforge, /assertEquipmentEnchantmentTransferCompatible\(connection,instanceId,category\)/);

  const schema = readFileSync('src/database/monster-cards.ts', 'utf8');
  assert.match(schema, /fk_equipment_enchantment_instance[\s\S]*?REFERENCES player_item_instances\(id\) ON DELETE CASCADE/);
  const workshop = readFileSync('src/game/equipment-workshop.service.ts', 'utf8');
  assert.doesNotMatch(workshop, /DELETE FROM player_item_instances/);
});

test('实例寄售保留同一装备实例，并在寄售快照与购买页公开附魔', () => {
  const service = readFileSync('src/game/instance-market.service.ts', 'utf8');
  const response = readFileSync('src/response/instance-market.ts', 'utf8');
  const adventure = readFileSync('src/game/adventure.service.ts', 'utf8');
  const equipmentDetail = readFileSync('src/response/equipment-detail.ts', 'utf8');
  assert.match(service, /LEFT JOIN equipment_enchantments ee ON ee\.instance_id=ii\.id/);
  assert.match(service, /enchantment:row\.enchant_card_code/);
  assert.match(service, /allowedSlots:stringArray\(row\.enchant_allowed_slots_json\)/);
  assert.match(service, /可附魔部位/);
  assert.match(service, /SET \$\{ownerColumn\}=\?,bound_kind='trade',market_listing_id=NULL/);
  assert.match(response, /snapshot\.enchantment/);
  assert.match(response, /附魔：/);
  assert.match(response, /可附魔部位/);
  assert.doesNotMatch(response, /autoEnter\s*:\s*true/);
  assert.match(adventure, /ee\.allowed_slots_json AS enchant_allowed_slots_json/g);
  assert.match(adventure, /allowedSlots: jsonArray\(item\.enchant_allowed_slots_json\)\.map\(String\)/g);
  assert.match(equipmentDetail, /可附魔部位：\$\{enchantmentSlotText\(item\.enchantment\)\}/);
});
