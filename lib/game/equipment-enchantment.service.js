import { randomUUID, createHash } from 'node:crypto';
import { cardEnchantFee, equipmentSlotsFromCategory, monsterCardByCode } from '../config/monster-cards.js';
import { withTransaction } from '../database/pool.js';
import { assertCombatLoadoutMutable, assertHiddenInstanceMutable } from './combat-loadout-lock.service.js';
import { characterIdFor, blacksmithProgressFor } from './blacksmith.service.js';
import { recalculateCharacterStats } from './character.service.js';
import { consumeInventory } from './inventory-binding.js';
import { currentSecondaryShop } from './secondary-shop-context.js';
import { recordCharacterOperation } from './character-operation.service.js';
import { hasNativeAttackElement } from './combat-element.js';

const object = (value) => {
    if (!value)
        return {};
    if (typeof value !== 'string')
        return value;
    try {
        return JSON.parse(value);
    }
    catch {
        return {};
    }
};
const source = () => currentSecondaryShop()?.shop === 'blacksmith' ? 'blacksmith' : 'profession';
const canonical = (value) => Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonical(entry)]))
        : value;
const stableJson = (value) => JSON.stringify(canonical(value));
const fingerprint = (row) => createHash('sha256').update(stableJson({
    id: Number(row.id), itemId: Number(row.item_id), quality: Number(row.quality), durability: Number(row.durability),
    durabilityMax: Number(row.durability_max), effect: object(row.effect_json), boundKind: String(row.bound_kind ?? 'none'),
    enchantRevision: Number(row.enchant_revision ?? 0), enchantCard: row.enchant_card_code ?? null, enchantVersion: Number(row.enchant_card_version ?? 0), enchantEffects: object(row.enchant_effects_json)
})).digest('hex');
const loadEquipment = async (connection, owner, instanceId, lock = false) => {
    const [rows] = await connection.execute(`SELECT ii.*,i.name,i.item_type,i.item_category,i.weapon_type,i.required_level,COALESCE(ii.effect_json,i.effect_json) AS equipment_effect_json,
    EXISTS(SELECT 1 FROM player_equipment pe WHERE pe.instance_id=ii.id) AS equipped,
    EXISTS(SELECT 1 FROM player_home_storage_instances hs WHERE hs.instance_id=ii.id) AS stored,
    ee.card_code AS enchant_card_code,ee.card_version AS enchant_card_version,ee.effect_text AS enchant_effect_text,ee.effects_json AS enchant_effects_json,COALESCE(ee.revision,0) AS enchant_revision,
    card.name AS enchant_card_name
    FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    LEFT JOIN equipment_enchantments ee ON ee.instance_id=ii.id
    LEFT JOIN item_definitions card ON card.id=ee.card_item_id
    WHERE ii.id=? AND ii.character_id=?${lock ? ' FOR UPDATE' : ''}`, [instanceId, owner]);
    const row = rows[0];
    const slots = row ? equipmentSlotsFromCategory(String(row.item_category)) : [];
    if (!row || row.item_type !== 'equipment' || row.item_category === '异械' || !slots.length)
        throw new Error('请选择自己背包中的可附魔装备。');
    if (row.equipped)
        throw new Error('请先卸下装备再附魔。');
    if (row.market_listing_id)
        throw new Error('请先取回寄售或托管中的装备。');
    if (row.stored)
        throw new Error('请先从家园仓库取出装备。');
    await assertCombatLoadoutMutable(connection, owner);
    await assertHiddenInstanceMutable(connection, owner, instanceId);
    return { row, slots };
};
const loadCard = async (connection, owner, itemId, lock = false) => {
    const [rows] = await connection.execute(`SELECT i.id,i.code,i.name,i.effect_json,COALESCE(pi.quantity,0) AS quantity,
    COALESCE(pi.trade_bound_quantity,0) AS trade_bound_quantity,COALESCE(pi.personal_bound_quantity,0) AS personal_bound_quantity,
    COALESCE(pi.binding_revision,0) AS binding_revision
    FROM item_definitions i LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=?
    WHERE i.id=? AND i.item_category='怪物卡片'${lock ? ' FOR UPDATE' : ''}`, [owner, itemId]);
    const row = rows[0];
    const card = row ? monsterCardByCode.get(String(row.code)) : undefined;
    if (!row || !card || Number(row.quantity) < 1)
        throw new Error('背包中没有这张怪物卡片。');
    return { row, card };
};
const enchantableEquipment = async (qqUserId) => withTransaction(async (connection) => {
    const owner = await characterIdFor(connection, qqUserId, true);
    await blacksmithProgressFor(connection, owner, true);
    const [rows] = await connection.execute(`SELECT ii.id,i.name,i.item_category,i.required_level,ii.quality,
    ee.card_code,ee.effect_text,card.name AS card_name
    FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    LEFT JOIN equipment_enchantments ee ON ee.instance_id=ii.id LEFT JOIN item_definitions card ON card.id=ee.card_item_id
    WHERE ii.character_id=? AND i.item_type='equipment' AND i.item_category<>'异械' AND ii.market_listing_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM player_equipment pe WHERE pe.instance_id=ii.id)
      AND NOT EXISTS(SELECT 1 FROM player_home_storage_instances hs WHERE hs.instance_id=ii.id)
    ORDER BY ii.id DESC`, [owner]);
    return rows.filter(row => equipmentSlotsFromCategory(String(row.item_category)).length).map(row => ({
        id: Number(row.id), name: String(row.name), category: String(row.item_category), level: Number(row.required_level), quality: Number(row.quality),
        enchantment: row.card_code ? { cardCode: String(row.card_code), cardName: String(row.card_name), effectText: String(row.effect_text) } : null
    }));
});
const compatibleEnchantCards = async (qqUserId, instanceId) => withTransaction(async (connection) => {
    const owner = await characterIdFor(connection, qqUserId, true);
    await blacksmithProgressFor(connection, owner, true);
    const { row: equipment, slots } = await loadEquipment(connection, owner, instanceId, true);
    const [rows] = await connection.execute(`SELECT i.id,i.code,i.name,pi.quantity,pi.trade_bound_quantity,pi.personal_bound_quantity
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.quantity>0 AND i.item_category='怪物卡片' ORDER BY i.required_level DESC,i.id`, [owner]);
    const cards = rows.flatMap(row => {
        const card = monsterCardByCode.get(String(row.code));
        const compatibleSlots = card?.allowedSlots.filter(slot => slots.includes(slot)) ?? [];
        return card && compatibleSlots.length && Number(equipment.required_level) >= card.minimumEquipmentLevel ? [{
                itemId: Number(row.id), code: card.cardCode, name: card.name, quantity: Number(row.quantity), level: card.level,
                minimumEquipmentLevel: card.minimumEquipmentLevel, tier: card.tier, effectText: card.effectText, compatibleSlots,
                bound: Number(row.personal_bound_quantity) > 0 ? 'personal' : Number(row.trade_bound_quantity) > 0 ? 'trade' : 'none'
            }] : [];
    });
    return { equipment: { id: Number(equipment.id), name: String(equipment.name), category: String(equipment.item_category), level: Number(equipment.required_level), slots }, cards };
});
const previewEquipmentEnchantment = async (qqUserId, instanceId, cardItemId) => withTransaction(async (connection) => {
    const owner = await characterIdFor(connection, qqUserId, true);
    await blacksmithProgressFor(connection, owner, true);
    const { row: equipment, slots } = await loadEquipment(connection, owner, instanceId, true);
    const { row: inventory, card } = await loadCard(connection, owner, cardItemId, true);
    const compatibleSlots = card.allowedSlots.filter(slot => slots.includes(slot));
    if (!compatibleSlots.length)
        throw new Error(`这张卡不能附魔在${equipment.item_category}。`);
    if (Number(equipment.required_level) < card.minimumEquipmentLevel)
        throw new Error(`装备至少需要 Lv.${card.minimumEquipmentLevel} 才能使用这张卡。`);
    if (equipment.enchant_card_code === card.cardCode && Number(equipment.enchant_card_version) === card.version && Number(equipment.enchant_revision) > 0 && stableJson(object(equipment.enchant_effects_json)) === stableJson(card.effects))
        throw new Error('这件装备已经具有相同附魔。');
    const fee = cardEnchantFee(card), token = randomUUID();
    const usedBinding = Number(inventory.personal_bound_quantity) > 0 ? 'personal' : Number(inventory.trade_bound_quantity) > 0 ? 'trade' : 'none';
    const oldBinding = String(equipment.bound_kind ?? 'none');
    const resultingBinding = oldBinding === 'personal' || usedBinding === 'personal' ? 'personal' : oldBinding === 'trade' || usedBinding === 'trade' ? 'trade' : 'none';
    await connection.execute(`INSERT INTO equipment_enchantment_quotes
    (token,character_id,source,instance_id,equipment_item_id,equipment_fingerprint,card_item_id,card_code,card_version,card_inventory_revision,enchant_revision,fee,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 10 MINUTE))`, [token, owner, source(), instanceId, equipment.item_id, fingerprint(equipment), cardItemId, card.cardCode, card.version, inventory.binding_revision, equipment.enchant_revision, fee]);
    return {
        token,
        equipment: { id: instanceId, name: String(equipment.name), category: String(equipment.item_category), level: Number(equipment.required_level), compatibleSlots },
        current: equipment.enchant_card_code ? { cardCode: String(equipment.enchant_card_code), cardName: String(equipment.enchant_card_name), effectText: String(equipment.enchant_effect_text) } : null,
        card: { itemId: cardItemId, code: card.cardCode, name: card.name, effectText: card.effectText, level: card.level, version: card.version },
        warning: hasNativeAttackElement(object(equipment.equipment_effect_json).element) && card.effects.attackElement ? '当前武器已有属性，卡片的属性赋予不生效，其他附加属性仍生效。' : null,
        fee, resultingBinding, expiresMinutes: 10
    };
});
const executeEquipmentEnchantment = async (qqUserId, token) => withTransaction(async (connection) => {
    const owner = await characterIdFor(connection, qqUserId, true);
    await blacksmithProgressFor(connection, owner, true);
    const [quotes] = await connection.execute('SELECT *,expires_at<=NOW() AS expired FROM equipment_enchantment_quotes WHERE token=? AND character_id=? FOR UPDATE', [token, owner]);
    const quote = quotes[0];
    if (!quote || quote.source !== source())
        throw new Error('确认凭据与本次附魔入口不符，请重新预览。');
    if (quote.result_json)
        return object(quote.result_json);
    if (quote.expired) {
        await connection.execute("UPDATE equipment_enchantment_quotes SET state='expired' WHERE token=?", [token]);
        throw new Error('附魔预览已过期，请重新选择。');
    }
    const { row: equipment, slots } = await loadEquipment(connection, owner, Number(quote.instance_id), true);
    if (Number(equipment.item_id) !== Number(quote.equipment_item_id) || fingerprint(equipment) !== quote.equipment_fingerprint)
        throw new Error('装备或原附魔已经变化，请重新预览。');
    const { row: inventory, card } = await loadCard(connection, owner, Number(quote.card_item_id), true);
    if (card.cardCode !== quote.card_code || card.version !== Number(quote.card_version) || Number(inventory.binding_revision) !== Number(quote.card_inventory_revision))
        throw new Error('卡片库存或版本已经变化，请重新预览。');
    if (!card.allowedSlots.some(slot => slots.includes(slot)) || Number(equipment.required_level) < card.minimumEquipmentLevel)
        throw new Error('装备已不再满足这张卡的附魔条件。');
    const [paid] = await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=? AND copper_coins>=?', [quote.fee, owner, quote.fee]);
    if (Number(paid.affectedRows) !== 1)
        throw new Error('铜币不足。');
    const binding = await consumeInventory(connection, owner, Number(quote.card_item_id), 1);
    const previousBinding = String(equipment.bound_kind ?? 'none');
    const nextBinding = binding.personal ? 'personal' : binding.trade && previousBinding === 'none' ? 'trade' : previousBinding;
    if (nextBinding !== previousBinding) {
        const [bound] = await connection.execute("UPDATE player_item_instances SET bound_kind=?,bound_at=COALESCE(bound_at,NOW()),bound_reason='monster_card_enchantment' WHERE id=? AND character_id=? AND bound_kind=?", [nextBinding, equipment.id, owner, previousBinding]);
        if (Number(bound.affectedRows) !== 1)
            throw new Error('装备绑定状态已经变化，请重新预览。');
    }
    const covered = Number(equipment.enchant_revision) > 0;
    await connection.execute(`INSERT INTO equipment_enchantments
    (instance_id,card_item_id,card_code,monster_code,card_version,effect_text,effects_json,allowed_slots_json,revision)
    VALUES (?,?,?,?,?,?,?,?,1)
    ON DUPLICATE KEY UPDATE card_item_id=VALUES(card_item_id),card_code=VALUES(card_code),monster_code=VALUES(monster_code),card_version=VALUES(card_version),effect_text=VALUES(effect_text),effects_json=VALUES(effects_json),allowed_slots_json=VALUES(allowed_slots_json),revision=revision+1`, [equipment.id, quote.card_item_id, card.cardCode, card.monsterCode, card.version, card.effectText, JSON.stringify(card.effects), JSON.stringify(card.allowedSlots)]);
    await recalculateCharacterStats(connection, owner);
    const result = { instanceId: Number(equipment.id), equipmentName: String(equipment.name), cardName: card.name, effectText: card.effectText, fee: Number(quote.fee), covered };
    await recordCharacterOperation(connection, { characterId: owner, kind: 'craft.equipment_enchantment', source: { system: 'equipment_enchantment', id: token, step: 'settled' }, outcome: covered ? '覆盖' : '完成', summary: `${equipment.name}附魔${card.name}`, scoreKey: `enchantment:${equipment.id}`, detail: { instanceId: Number(equipment.id), itemId: Number(equipment.item_id), cardCode: card.cardCode, cardVersion: card.version, effects: card.effects, covered, fee: Number(quote.fee), binding } });
    await connection.execute("UPDATE equipment_enchantment_quotes SET state='completed',result_json=? WHERE token=? AND state='pending'", [JSON.stringify(result), token]);
    return result;
});

export { compatibleEnchantCards, enchantableEquipment, executeEquipmentEnchantment, previewEquipmentEnchantment };
