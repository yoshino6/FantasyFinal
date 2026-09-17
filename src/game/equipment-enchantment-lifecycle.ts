import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { equipmentSlotsFromCategory, type EquipmentSlot } from '../config/monster-cards';

type EnchantmentRow = RowDataPacket & {
  card_code: string;
  revision: number;
  allowed_slots_json: unknown;
};

const allowedSlots = (value: unknown): EquipmentSlot[] => {
  let parsed = value;
  if (Buffer.isBuffer(parsed)) parsed = parsed.toString('utf8');
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); }
    catch { return []; }
  }
  return Array.isArray(parsed) ? parsed.filter((slot): slot is EquipmentSlot => typeof slot === 'string') : [];
};

export const equipmentCategoryAcceptsEnchantment = (category: string, value: unknown) => {
  const targetSlots = new Set(equipmentSlotsFromCategory(category));
  return allowedSlots(value).some(slot => targetSlots.has(slot));
};

const lockedEnchantment = async (connection: PoolConnection, sourceInstanceId: number) => {
  const [rows] = await connection.execute<EnchantmentRow[]>(
    'SELECT card_code,revision,allowed_slots_json FROM equipment_enchantments WHERE instance_id=? FOR UPDATE',
    [sourceInstanceId]
  );
  return rows[0] ?? null;
};

export const assertEquipmentEnchantmentTransferCompatible = async (connection: PoolConnection, sourceInstanceId: number, targetCategory: string) => {
  const enchantment = await lockedEnchantment(connection, sourceInstanceId);
  if (enchantment && !equipmentCategoryAcceptsEnchantment(targetCategory, enchantment.allowed_slots_json))
    throw new Error(`原装备的怪物卡片附魔不能用于${targetCategory}，本次重铸未执行。`);
  return enchantment;
};

/**
 * 跨实例加工只能迁移附魔快照，不能返还卡片或按当前配置重建效果。
 * 调用方须先创建目标实例；本函数会读取目标真实部位并再次校验，再只改附魔主键。
 */
export const transferEquipmentEnchantment = async (connection: PoolConnection, sourceInstanceId: number, targetInstanceId: number) => {
  if (sourceInstanceId === targetInstanceId) throw new Error('附魔迁移的来源与目标实例不能相同。');
  const [targets] = await connection.execute<(RowDataPacket & { item_category: string })[]>(
    `SELECT i.item_category FROM player_item_instances ii
      JOIN item_definitions i ON i.id=ii.item_id
      WHERE ii.id=? FOR UPDATE`,
    [targetInstanceId]
  );
  const target = targets[0];
  if (!target) throw new Error('附魔迁移目标装备不存在。');
  const enchantment = await assertEquipmentEnchantmentTransferCompatible(connection, sourceInstanceId, String(target.item_category));
  if (!enchantment) return { transferred: false as const };
  const [moved] = await connection.execute<ResultSetHeader>(
    'UPDATE equipment_enchantments SET instance_id=? WHERE instance_id=?',
    [targetInstanceId, sourceInstanceId]
  );
  if (Number(moved.affectedRows) !== 1) throw new Error('装备附魔迁移失败，本次加工已回滚。');
  return { transferred: true as const, cardCode: String(enchantment.card_code), revision: Number(enchantment.revision) };
};
