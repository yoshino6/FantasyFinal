import { takeMaterialCosts, addMaterialCosts, scaleMaterialCost } from './talent-material-recovery.js';
import { consumeInventory, grantInventory } from './inventory-binding.js';
import { ownedTalent, readTalentData, saveTalentData, talentWhole } from './talent-data.js';
import { ordinaryTalentItem } from './talent-rewards.js';
import { alchemyMaterialValue } from './alchemy-balance.js';
import { assertTalentReviewResolved } from './talent-review.js';

const fixedMaterialValue = (item) => alchemyMaterialValue(String(item.code), Number(item.required_level ?? 1), String(item.item_category)) ?? Number(item.trade_price ?? 0);
const cumulativeMaterialPayment = (quantity, factor, paidFraction) => {
    const exact = quantity * factor, credit = Math.max(0, paidFraction), paid = Math.max(0, Math.ceil(exact - credit - 1e-9));
    return { paid, credit: Math.max(0, paid + credit - exact) };
};
const talentMaterialPayment = async (connection, id, itemId, quantity, purpose, personal = true, commit = false) => {
    if (!personal)
        return quantity;
    const talent = await ownedTalent(connection, id);
    const factor = talent?.number === 'E09' && purpose === 'craft' ? .4 : talent?.number === 'E04' && purpose === 'home' ? .4 : talent?.number === 'E06' && purpose === 'automatonRepair' ? .35 : 1;
    if (factor === 1)
        return quantity;
    const [items] = await connection.execute('SELECT * FROM item_definitions WHERE id=?', [itemId]);
    const item = items[0], ordinaryRepairKit = purpose === 'automatonRepair' && item?.code === 'forge_repair_kit' && item.rarity === '普通' && !item.is_unique;
    if (!item || !ordinaryTalentItem(item) && !ordinaryRepairKit)
        return quantity;
    const data = await readTalentData(connection, id), key = `material:${purpose}:${itemId}`;
    const result = cumulativeMaterialPayment(quantity, factor, Number(data.remainders[key] ?? 0));
    if (commit) {
        data.remainders[key] = result.credit;
        await saveTalentData(connection, id, data);
    }
    return result.paid;
};
const consumeTalentMaterial = async (connection, id, itemId, quantity, purpose, personal = true) => {
    const state = await readTalentData(connection, id);
    if (state.jobs.some(j => j.payload.working))
        throw new Error('请先结束当前调查或复盘再制作。');
    assertTalentReviewResolved(state);
    const paid = await talentMaterialPayment(connection, id, itemId, quantity, purpose, personal, true);
    const recovery = paid ? await takeMaterialCosts(connection, 'stock', id, itemId, paid) : { quantity: 0, paid: {} };
    const binding = paid ? await consumeInventory(connection, id, itemId, paid) : { personal: 0, trade: 0, unbound: 0 };
    const creditKey = `material:${purpose}:${itemId}`, bindingKey = `materialBinding:${purpose}:${itemId}`;
    const prior = Number(state.remainders[creditKey] ?? 0) > 0 ? state.flags[bindingKey] : undefined;
    if (prior === 'personal')
        binding.personal = Math.max(1, binding.personal);
    else if (prior === 'trade')
        binding.trade = Math.max(1, binding.trade);
    const data = await readTalentData(connection, id);
    if (Number(data.remainders[creditKey] ?? 0) > 0)
        data.flags[bindingKey] = binding.personal ? 'personal' : binding.trade ? 'trade' : 'unbound';
    else
        delete data.flags[bindingKey];
    await saveTalentData(connection, id, data);
    return { paid, binding, recovery };
};
const refundTalentFailure = async (connection, id, consumed, personal = true) => {
    if (!personal || (await ownedTalent(connection, id))?.number !== 'E02')
        return 0;
    const data = await readTalentData(connection, id);
    let refunded = 0;
    for (const entry of consumed) {
        const [items] = await connection.execute('SELECT * FROM item_definitions WHERE id=?', [entry.itemId]);
        if (!items[0] || !ordinaryTalentItem(items[0]))
            continue;
        const refund = { personal: 0, trade: 0, unbound: 0 };
        for (const key of ['personal', 'trade', 'unbound'])
            refund[key] = talentWhole(data, `refund:${entry.itemId}:${key}`, entry.binding[key], 2 / 3);
        const quantity = refund.personal + refund.trade + refund.unbound, paid = entry.paid ?? entry.binding.personal + entry.binding.trade + entry.binding.unbound;
        if (quantity && paid && entry.recovery?.quantity)
            await addMaterialCosts(connection, 'stock', id, entry.itemId, scaleMaterialCost(entry.recovery, quantity / paid));
        await grantInventory(connection, id, entry.itemId, refund);
        refunded += refund.personal + refund.trade + refund.unbound;
    }
    await saveTalentData(connection, id, data);
    return refunded;
};
const recordTalentProduct = async (connection, id, itemId, quantity) => {
    if (quantity > 0)
        await connection.execute('INSERT INTO player_talent_products(character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [id, itemId, quantity]);
};
const isTalentProduct = async (connection, id, itemId) => {
    const [rows] = await connection.execute('SELECT quantity FROM player_talent_products WHERE character_id=? AND item_id=? FOR UPDATE', [id, itemId]);
    return Number(rows[0]?.quantity ?? 0) > 0;
};
const fixedTalentMaterials = async (connection, id, requirements, auxiliaryCodes, personal = true) => {
    const codes = requirements.map(r => r.code);
    const [items] = await connection.execute(`SELECT i.*,COALESCE(pi.quantity,0) AS quantity FROM item_definitions i LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=? WHERE i.code IN (${codes.map(() => '?').join(',')}) FOR UPDATE`, [id, ...codes]);
    if (items.length !== codes.length)
        throw new Error('配方材料定义不完整。');
    const result = [];
    const talent = personal ? await ownedTalent(connection, id) : undefined, data = await readTalentData(connection, id);
    const ordinaryValue = items.reduce((sum, item) => sum + (ordinaryTalentItem(item) ? fixedMaterialValue(item) * requirements.find(r => r.code === item.code).quantity : 0), 0);
    let substituted = false;
    for (const required of requirements) {
        const item = items.find(item => item.code === required.code);
        const paid = await talentMaterialPayment(connection, id, Number(item.id), required.quantity, 'craft', personal);
        if (Number(item.quantity) >= paid) {
            result.push({ item, quantity: required.quantity });
            continue;
        }
        const missing = required.quantity - Number(item.quantity), value = missing * fixedMaterialValue(item);
        if (talent?.number !== 'I02' || !data.settings.substitute || substituted || !auxiliaryCodes.includes(required.code) || !ordinaryTalentItem(item) || value <= 0 || value > ordinaryValue * .5)
            throw new Error(`材料不足：${item.name}需要${paid}份。`);
        const [alternatives] = await connection.execute(`SELECT i.*,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.item_type='material' AND i.rarity='普通' AND i.required_level=? ORDER BY i.id FOR UPDATE`, [id, item.required_level]);
        const replacement = alternatives.find(other => !codes.includes(String(other.code)) && ordinaryTalentItem(other) && fixedMaterialValue(other) > 0 && Number.isSafeInteger(value / fixedMaterialValue(other)) && Number(other.quantity) >= value / fixedMaterialValue(other));
        if (!replacement)
            throw new Error('没有价值恰好相等且数量足够的同阶普通替代材料。');
        if (Number(item.quantity) > 0)
            result.push({ item, quantity: Number(item.quantity) });
        result.push({ item: replacement, quantity: value / fixedMaterialValue(replacement) });
        substituted = true;
    }
    return result;
};

export { consumeTalentMaterial, cumulativeMaterialPayment, fixedTalentMaterials, isTalentProduct, recordTalentProduct, refundTalentFailure, talentMaterialPayment };
