import { equipmentSlotsFromCategory } from '../config/monster-cards.js';

const allowedSlots = (value) => {
    let parsed = value;
    if (Buffer.isBuffer(parsed))
        parsed = parsed.toString('utf8');
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        }
        catch {
            return [];
        }
    }
    return Array.isArray(parsed) ? parsed.filter((slot) => typeof slot === 'string') : [];
};
const equipmentCategoryAcceptsEnchantment = (category, value) => {
    const targetSlots = new Set(equipmentSlotsFromCategory(category));
    return allowedSlots(value).some(slot => targetSlots.has(slot));
};
const lockedEnchantment = async (connection, sourceInstanceId) => {
    const [rows] = await connection.execute('SELECT card_code,revision,allowed_slots_json FROM equipment_enchantments WHERE instance_id=? FOR UPDATE', [sourceInstanceId]);
    return rows[0] ?? null;
};
const assertEquipmentEnchantmentTransferCompatible = async (connection, sourceInstanceId, targetCategory) => {
    const enchantment = await lockedEnchantment(connection, sourceInstanceId);
    if (enchantment && !equipmentCategoryAcceptsEnchantment(targetCategory, enchantment.allowed_slots_json))
        throw new Error(`原装备的怪物卡片附魔不能用于${targetCategory}，本次重铸未执行。`);
    return enchantment;
};
const transferEquipmentEnchantment = async (connection, sourceInstanceId, targetInstanceId) => {
    if (sourceInstanceId === targetInstanceId)
        throw new Error('附魔迁移的来源与目标实例不能相同。');
    const [targets] = await connection.execute(`SELECT i.item_category FROM player_item_instances ii
      JOIN item_definitions i ON i.id=ii.item_id
      WHERE ii.id=? FOR UPDATE`, [targetInstanceId]);
    const target = targets[0];
    if (!target)
        throw new Error('附魔迁移目标装备不存在。');
    const enchantment = await assertEquipmentEnchantmentTransferCompatible(connection, sourceInstanceId, String(target.item_category));
    if (!enchantment)
        return { transferred: false };
    const [moved] = await connection.execute('UPDATE equipment_enchantments SET instance_id=? WHERE instance_id=?', [targetInstanceId, sourceInstanceId]);
    if (Number(moved.affectedRows) !== 1)
        throw new Error('装备附魔迁移失败，本次加工已回滚。');
    return { transferred: true, cardCode: String(enchantment.card_code), revision: Number(enchantment.revision) };
};

export { assertEquipmentEnchantmentTransferCompatible, equipmentCategoryAcceptsEnchantment, transferEquipmentEnchantment };
