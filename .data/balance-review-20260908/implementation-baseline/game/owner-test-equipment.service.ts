import type { RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../database/pool';
import { legendaryTestForgeDraft } from './blacksmith.service';
import { recalculateCharacterStats } from './character.service';
import { requireOwner } from './permission.service';

const slots = ['weapon', 'offhand', 'shoulder', 'upper', 'waist', 'lower', 'feet', 'necklace', 'bracelet', 'ring'] as const;
const testSlots = ['weapon', 'offhand', 'shoulder', 'upper', 'waist', 'lower', 'feet'] as const;
const slotNames: Record<(typeof slots)[number], string> = { weapon: '主手', offhand: '副手', shoulder: '头肩', upper: '上装', waist: '腰部', lower: '下装', feet: '脚部', necklace: '项链', bracelet: '手镯', ring: '戒指' };
type SnapshotEquipment = { slot: string; itemId: number; instanceId: number | null };
type TestCharacter = RowDataPacket & { id: number; level: number; profession_code: string | null };

const readJsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};

const testProfile = (professionCode: string | null) => {
  switch (professionCode) {
    case 'mage': return { weapons: ['法杖', '法书'] };
    case 'rogue': return { weapons: ['匕首', '拳刃'] };
    case 'priest': return { weapons: ['法书', '法球'] };
    default: return { weapons: ['长剑', '长剑'] };
  }
};

const testLoadout = (professionCode: string | null) => {
  const profile = testProfile(professionCode);
  return [
    { slot: 'weapon' as const, itemCategory: '武器', forgeCategory: '武器' as const, subtype: profile.weapons[0]! },
    { slot: 'offhand' as const, itemCategory: '武器', forgeCategory: '武器' as const, subtype: profile.weapons[1]! },
    ...(['shoulder', 'upper', 'waist', 'lower', 'feet'] as const).map(slot => ({ slot, itemCategory: slotNames[slot], forgeCategory: '防具' as const, subtype: '轻甲' }))
  ];
};

/** 主人专用：暂存当前常规装备并换上同等级的传说 100% 测试套装。 */
export const grantOwnerLegendaryTestEquipment = async (qqUserId: string) => withTransaction(async connection => {
  await requireOwner(qqUserId, connection);
  const [characters] = await connection.execute<TestCharacter[]>(`SELECT c.id,c.level,c.profession_code
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE`, [qqUserId]);
  const character = characters[0]; if (!character) throw new Error('请先创建角色。');
  const [existingSnapshots] = await connection.execute<RowDataPacket[]>('SELECT character_id FROM owner_test_equipment_snapshots WHERE character_id=? FOR UPDATE', [character.id]);
  if (existingSnapshots[0]) throw new Error('当前已装备测试神装，请先使用“测试 解体”恢复原装备。');
  const placeholders = testSlots.map(() => '?').join(',');
  const [originalRows] = await connection.execute<(RowDataPacket & { slot: string; item_id: number; instance_id: number | null })[]>(`SELECT slot,item_id,instance_id FROM player_equipment
    WHERE character_id=? AND slot IN (${placeholders}) FOR UPDATE`, [character.id, ...testSlots]);
  const original = originalRows.map(row => ({ slot: String(row.slot), itemId: Number(row.item_id), instanceId: row.instance_id === null ? null : Number(row.instance_id) }));
  const level = Math.max(1, Number(character.level)); const testInstances: number[] = []; const names: string[] = [];
  await connection.execute(`INSERT INTO owner_test_equipment_snapshots (character_id,original_equipment_json,test_instance_ids_json) VALUES (?,?,?)`, [character.id, JSON.stringify(original), JSON.stringify(testInstances)]);
  await connection.execute(`DELETE FROM player_equipment WHERE character_id=? AND slot IN (${placeholders})`, [character.id, ...testSlots]);
  for (const entry of testLoadout(character.profession_code)) {
    const draft = legendaryTestForgeDraft(entry.forgeCategory, entry.subtype, level);
    const code = `owner_test_${character.id}_${Date.now().toString(36)}_${entry.slot}_${Math.floor(Math.random() * 1e6)}`;
    const name = `测试·${draft.name}·${slotNames[entry.slot]}`;
    const description = `主人测试专用的 Lv.${level} 传说品质装备；品质固定为 100%，副词条按正式打造规则随机生成。使用“测试 解体”会将其移除并恢复原装备。`;
    const [definition] = await connection.execute<any>('INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weapon_type,rarity,required_level,weight,stackable,is_tradeable,effect_json) VALUES (?,?,?,?,?,?,?,?,?,?,0,0,?)', [code, name, description, '主人测试', 'equipment', entry.itemCategory, entry.subtype, draft.rarity, level, 0, JSON.stringify(draft.effect)]);
    const [instance] = await connection.execute<any>('INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max,effect_json,forge_primary_json) VALUES (?,?,100,100,100,?,?)', [character.id, definition.insertId, JSON.stringify(draft.effect), JSON.stringify(draft.primaryKeys)]);
    await connection.execute('INSERT INTO player_equipment (character_id,slot,item_id,instance_id) VALUES (?,?,?,?)', [character.id, entry.slot, definition.insertId, instance.insertId]);
    testInstances.push(Number(instance.insertId)); names.push(name);
  }
  await connection.execute('UPDATE owner_test_equipment_snapshots SET test_instance_ids_json=? WHERE character_id=?', [JSON.stringify(testInstances), character.id]);
  await recalculateCharacterStats(connection, Number(character.id));
  return { level, count: testInstances.length, names };
});

/** 主人专用：删除当前测试装备，并将快照中的原装备重新穿回。 */
export const dismantleOwnerLegendaryTestEquipment = async (qqUserId: string) => withTransaction(async connection => {
  await requireOwner(qqUserId, connection);
  const [characters] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE`, [qqUserId]);
  const character = characters[0]; if (!character) throw new Error('请先创建角色。');
  const [snapshots] = await connection.execute<(RowDataPacket & { original_equipment_json: unknown; test_instance_ids_json: unknown })[]>('SELECT original_equipment_json,test_instance_ids_json FROM owner_test_equipment_snapshots WHERE character_id=? FOR UPDATE', [character.id]);
  const snapshot = snapshots[0]; if (!snapshot) throw new Error('当前没有可解体的测试神装。');
  const original = readJsonArray(snapshot.original_equipment_json).flatMap((value): SnapshotEquipment[] => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>; const slot = String(row.slot ?? ''); const itemId = Number(row.itemId); const instanceId = row.instanceId === null ? null : Number(row.instanceId);
    return slots.includes(slot as (typeof slots)[number]) && Number.isInteger(itemId) && itemId > 0 && (instanceId === null || (Number.isInteger(instanceId) && instanceId > 0)) ? [{ slot, itemId, instanceId }] : [];
  });
  const testInstanceIds = readJsonArray(snapshot.test_instance_ids_json).map(Number).filter(id => Number.isInteger(id) && id > 0);
  let testItems: (RowDataPacket & { item_id: number })[] = [];
  if (testInstanceIds.length) [testItems] = await connection.execute<(RowDataPacket & { item_id: number })[]>(`SELECT item_id FROM player_item_instances WHERE character_id=? AND id IN (${testInstanceIds.map(() => '?').join(',')}) FOR UPDATE`, [character.id, ...testInstanceIds]);
  if (testInstanceIds.length) await connection.execute(`DELETE FROM player_equipment WHERE character_id=? AND instance_id IN (${testInstanceIds.map(() => '?').join(',')})`, [character.id, ...testInstanceIds]);
  if (testInstanceIds.length) await connection.execute(`DELETE FROM player_item_instances WHERE character_id=? AND id IN (${testInstanceIds.map(() => '?').join(',')})`, [character.id, ...testInstanceIds]);
  // 无论测试装备是否被异常替换，先释放所有被测试套装覆盖的槽位，再恢复快照。
  await connection.execute(`DELETE FROM player_equipment WHERE character_id=? AND slot IN (${testSlots.map(() => '?').join(',')})`, [character.id, ...testSlots]);
  const testItemIds = testItems.map(row => Number(row.item_id));
  if (testItemIds.length) {
    // 测试装备的定义是一次性的；先清理其图鉴关联，避免外键阻止回收临时定义。
    await connection.execute(`DELETE FROM player_item_codex WHERE item_id IN (${testItemIds.map(() => '?').join(',')})`, testItemIds);
    await connection.execute(`DELETE FROM item_definitions WHERE id IN (${testItemIds.map(() => '?').join(',')})`, testItemIds);
  }
  for (const item of original) await connection.execute(`INSERT INTO player_equipment (character_id,slot,item_id,instance_id) VALUES (?,?,?,?)
    ON DUPLICATE KEY UPDATE item_id=VALUES(item_id),instance_id=VALUES(instance_id)`, [character.id, item.slot, item.itemId, item.instanceId]);
  await connection.execute('DELETE FROM owner_test_equipment_snapshots WHERE character_id=?', [character.id]);
  await recalculateCharacterStats(connection, Number(character.id));
  return { restored: original.length, dismantled: testInstanceIds.length };
});
