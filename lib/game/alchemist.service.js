import { achievementAlchemySurprises } from './achievement-surprise.js';
import { alchemyUtilityOutput } from './achievement-production.js';
import { achievementAlchemyRecovery } from './achievement-state.js';
import { achievementItem, achievementActivity, achievementSecondary, achievementSecondaryLevel } from './achievement-hooks.js';
import { recordAchievement } from './achievement-events.js';
import { settleTalentPurification } from './talent-purification.js';
import { talentMaterialPayment, consumeTalentMaterial, refundTalentFailure, recordTalentProduct } from './talent-production.js';
import { ownedTalent, readTalentData, talentWhole, saveTalentData } from './talent-data.js';
import { ordinaryTalentItem, talentCraftMultiplier, talentProductionRecord, talentProficiency } from './talent-rewards.js';
import { currentSecondaryShop, shopProficiency, shopProgressFor } from './secondary-shop-context.js';
import { productionBinding, grantInventory } from './inventory-binding.js';
import { alchemyCreationQuestFor } from './alchemy-creation-quest.service.js';
import { alchemyMaterialValue, alchemySuccessRate, alchemyCostQualityBudget, alchemyQualityBudget, alchemySupportsQuality, alchemyQualityRoll } from './alchemy-balance.js';
import { withTransaction, getPool } from '../database/pool.js';
import { purificationOutputMultiplierForLevel, materialValueMultiplierForLevel, purifiedCraftOutputFor } from './monster-crafting-material.service.js';
import { alchemyOutputsAtOrBelow } from './alchemy-catalog.js';
import { requireNpcAtCurrentPosition } from './adventure.service.js';
import { secondaryProfessionMaxLevel, secondaryProfessionBonus, secondaryProfessionProficiencyRequired } from './secondary-profession.js';
import { alchemyRuleVersion, alchemyFingerprint, validAlchemyCombination, scanAlchemyCombinations } from './alchemy-journal.js';
import { alchemyJournalDetail, createCraftRequest, invalidateCraftRequests, craftRequestFor, recordAlchemyJournal, completeCraftRequest, craftJson } from './alchemy-journal.service.js';

const questCode = 'alchemist_apprentice';
const sweetshopCode = 'alchemy_sweetshop';
const characterIdFor = async (connection, qqUserId, lock = false) => {
    const [rows] = await connection.execute(`SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
    if (!rows[0])
        throw new Error('请先注册角色。');
    return Number(rows[0].id);
};
const alchemistQuest = async (qqUserId) => {
    const pool = await getPool();
    const characterId = await characterIdFor(pool, qqUserId);
    const [rows] = await pool.execute(`SELECT q.status,c.secondary_profession_code FROM characters c LEFT JOIN player_side_quests q ON q.character_id=c.id AND q.quest_code=? WHERE c.id=?`, [questCode, characterId]);
    const [items] = await pool.execute(`SELECT pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code='healing_herb'`, [characterId]);
    const herbs = Number(items[0]?.quantity ?? 0);
    const row = rows[0];
    const completed = row?.status === 'accepted' && herbs >= 3;
    if (completed)
        await pool.execute('UPDATE player_side_quests SET status=\'completed\',completed_at=NOW() WHERE character_id=? AND quest_code=?', [characterId, questCode]);
    return { status: completed ? 'completed' : row?.secondary_profession_code === 'alchemist' ? 'claimed' : row?.status ?? 'none', herbs };
};
const acceptAlchemistQuest = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    const [rows] = await connection.execute('SELECT secondary_profession_code,level FROM characters WHERE id=? FOR UPDATE', [characterId]);
    if (Number(rows[0]?.level ?? 0) < 10)
        throw new Error('secondary_profession_level_required');
    if (rows[0]?.secondary_profession_code && rows[0].secondary_profession_code !== 'alchemist')
        throw new Error('你已经拥有其他副职业，无法再选择炼金师。');
    await connection.execute('INSERT INTO player_side_quests (character_id,quest_code) VALUES (?,?) ON DUPLICATE KEY UPDATE status=IF(status=\'claimed\',status,\'accepted\')', [characterId, questCode]);
});
const claimAlchemistQuest = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    const [questRows] = await connection.execute('SELECT status FROM player_side_quests WHERE character_id=? AND quest_code=? FOR UPDATE', [characterId, questCode]);
    if (questRows[0]?.status !== 'completed')
        throw new Error('任务尚未完成。');
    const [herbs] = await connection.execute(`SELECT pi.item_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code='healing_herb' FOR UPDATE`, [characterId]);
    if (!herbs[0] || Number(herbs[0].quantity) < 3)
        throw new Error('微光草药不足，无法完成提纯。');
    const [gifts] = await connection.execute('SELECT id FROM item_definitions WHERE code=\'qinger_gift\' LIMIT 1', []);
    if (!gifts[0])
        throw new Error('晴儿的赠礼尚未配置，请重启机器人以初始化物品数据。');
    const [characters] = await connection.execute('SELECT name FROM characters WHERE id=?', [characterId]);
    await connection.execute('UPDATE player_inventory SET quantity=quantity-3 WHERE character_id=? AND item_id=?', [characterId, herbs[0].item_id]);
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, herbs[0].item_id]);
    await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [characterId, gifts[0].id]);
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, gifts[0].id]);
    await connection.execute('UPDATE player_side_quests SET status=\'claimed\',claimed_at=NOW() WHERE character_id=? AND quest_code=?', [characterId, questCode]);
    await connection.execute('UPDATE characters SET secondary_profession_code=\'alchemist\' WHERE id=?', [characterId]);
    await connection.execute('INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,\'alchemist\',1,0)', [characterId]);
    recordAchievement(connection, characterId, ['ACH_A05']);
    return { name: '炼金师', characterName: characters[0]?.name ?? '冒险者', giftName: '晴儿的赠礼' };
});
const secondaryProfessionCode = async (qqUserId) => {
    const pool = await getPool();
    const characterId = await characterIdFor(pool, qqUserId);
    const [rows] = await pool.execute('SELECT secondary_profession_code FROM characters WHERE id=?', [characterId]);
    return rows[0]?.secondary_profession_code ?? null;
};
const purificationRecipes = {
    beast_bone: 'refined_beast_bone', beast_hide: 'refined_beast_hide', beast_tendon: 'refined_beast_tendon', beast_core: 'refined_beast_core',
    magic_wool: 'refined_magic_wool', magic_tusk: 'refined_magic_tusk', magic_scale: 'refined_magic_scale', magic_claw: 'refined_magic_claw', magic_heartcore: 'refined_magic_heartcore'
};
const purificationOutputFor = (item) => purifiedCraftOutputFor(item.code, materialLevelFor(item)) ?? purificationRecipes[item.code];
const purificationSuccess = (bonus) => Math.min(95, 60 + bonus);
const purificationRules = async (connection, id, personal) => {
    const talent = personal ? await ownedTalent(connection, id) : undefined;
    const risk = talent?.number === 'H09' && (await readTalentData(connection, id)).settings.riskCraft === true;
    return { risk, version: `${alchemyRuleVersion}:talent:${talent?.number ?? ''}:${risk}` };
};
const proficiencyRequired = secondaryProfessionProficiencyRequired;
const alchemistProgressFor = async (connection, characterId, lock = false) => {
    const shop = await shopProgressFor(connection, characterId, 'alchemist');
    if (shop)
        return { ...shop, serviceMode: 'sweetshop' };
    const [characters] = await connection.execute(`SELECT secondary_profession_code FROM characters WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    if (characters[0]?.secondary_profession_code !== 'alchemist')
        throw new Error('只有炼金师可以进行提纯或炼金。');
    await connection.execute('INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,\'alchemist\',1,0)', [characterId]);
    const [rows] = await connection.execute(`SELECT level,proficiency FROM player_secondary_professions WHERE character_id=? AND profession_code='alchemist'${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    const level = Math.min(secondaryProfessionMaxLevel, Math.max(1, Number(rows[0]?.level ?? 1)));
    const proficiency = level >= secondaryProfessionMaxLevel ? 0 : Number(rows[0]?.proficiency ?? 0);
    return { level, proficiency, required: proficiencyRequired(level), bonus: secondaryProfessionBonus(level), serviceMode: 'personal' };
};
const activeAlchemistProgressFor = async (connection, qqUserId, characterId, lock = false) => {
    if (currentSecondaryShop())
        return alchemistProgressFor(connection, characterId, lock);
    const [sessions] = await connection.execute(`SELECT service_mode FROM player_alchemy_sessions WHERE character_id=?${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    if (sessions[0]?.service_mode === 'sweetshop') {
        throw new Error('请从糖水屋服务入口继续，或重新打开个人炼金面板。');
    }
    return alchemistProgressFor(connection, characterId, lock);
};
const addAlchemistProficiency = async (connection, qqUserId, characterId, amount = 1, settled = false) => {
    const current = await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    if (current.serviceMode === 'sweetshop')
        return current;
    let level = current.level;
    if (!settled)
        amount = await talentProficiency(connection, characterId, amount, { profession: 'alchemist' });
    let proficiency = level >= secondaryProfessionMaxLevel ? 0 : current.proficiency + Math.max(0, Math.round(amount));
    while (level < secondaryProfessionMaxLevel && proficiency >= proficiencyRequired(level)) {
        proficiency -= proficiencyRequired(level);
        level += 1;
    }
    if (level >= secondaryProfessionMaxLevel)
        proficiency = 0;
    await connection.execute("UPDATE player_secondary_professions SET level=?,proficiency=? WHERE character_id=? AND profession_code='alchemist'", [level, proficiency, characterId]);
    achievementSecondaryLevel(connection, Number(characterId), level);
    if (level >= 4)
        await alchemyCreationQuestFor(connection, characterId);
    return { level, proficiency, required: proficiencyRequired(level), bonus: secondaryProfessionBonus(level), serviceMode: 'personal' };
};
const alchemistProgress = async (qqUserId) => { const pool = await getPool(); return alchemistProgressFor(pool, await characterIdFor(pool, qqUserId)); };
const assertAlchemyNotProcessingFor = async (connection, characterId, lock = false) => {
    const [rows] = await connection.execute(`SELECT alchemy_processing_until AS processing_until FROM player_alchemy_sessions WHERE character_id=?${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    const processingUntil = rows[0]?.processing_until?.getTime() ?? 0;
    if (processingUntil > Date.now())
        throw new Error('炼金反应正在进行中，请等待本次结果。');
    if (processingUntil)
        await connection.execute('UPDATE player_alchemy_sessions SET alchemy_processing_until=NULL WHERE character_id=?', [characterId]);
};
const activatePersonalAlchemy = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    await assertAlchemyNotProcessingFor(connection, characterId, true);
    const progress = await alchemistProgressFor(connection, characterId, true);
    await connection.execute('INSERT INTO player_alchemy_sessions (character_id,service_mode) VALUES (?,?) ON DUPLICATE KEY UPDATE service_mode=VALUES(service_mode)', [characterId, progress.serviceMode]);
});
const activateSweetshopAlchemy = async (qqUserId) => {
    await requireNpcAtCurrentPosition(qqUserId, sweetshopCode);
    if (currentSecondaryShop()?.shop !== 'alchemy_sweetshop')
        throw new Error('请从糖水屋的提纯或炼金按键进入。');
    await activatePersonalAlchemy(qqUserId);
};
const purificationMaterials = async (qqUserId) => {
    const pool = await getPool();
    const characterId = await characterIdFor(pool, qqUserId);
    await activeAlchemistProgressFor(pool, qqUserId, characterId);
    const [rows] = await pool.execute(`SELECT i.id,i.code,i.name,i.item_category,i.effect_json,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type='material' ORDER BY i.id`, [characterId]);
    return rows.map(row => ({ id: Number(row.id), code: row.code, name: row.name, category: row.item_category, quantity: Number(row.quantity), outputCode: purificationOutputFor(row) })).filter((row) => Boolean(row.outputCode));
};
const bulkPurificationItemsFor = async (connection, characterId, lock = false) => {
    const [rows] = await connection.execute(`SELECT i.id,i.code,i.name,i.item_type,i.rarity,i.item_category,i.effect_json,pi.quantity
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type='material'
      AND JSON_EXTRACT(i.effect_json,'$.monster_craft_material') IS NOT NULL
      AND JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.material_monster_class')) IN ('normal','large')
    ORDER BY i.item_category,i.name,i.id${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    return rows.map(row => ({ id: Number(row.id), code: row.code, name: row.name, item_category: row.item_category, quantity: Number(row.quantity), effect_json: row.effect_json, outputCode: purificationOutputFor(row) }))
        .filter((row) => Boolean(row.outputCode));
};
const bulkPurificationOutputsFor = async (connection, items) => {
    const codes = [...new Set(items.map(item => item.outputCode))];
    if (!codes.length)
        return new Map();
    const [rows] = await connection.execute(`SELECT id,code,name FROM item_definitions WHERE code IN (${codes.map(() => '?').join(',')})`, codes);
    const outputs = new Map(rows.map(row => [row.code, { id: Number(row.id), name: row.name }]));
    if (outputs.size !== codes.length)
        throw new Error('精材料配方尚未初始化，请重启机器人。');
    return outputs;
};
const bulkPurificationPreview = async (qqUserId) => withTransaction(async (pool) => {
    const characterId = await characterIdFor(pool, qqUserId, true);
    const progress = await activeAlchemistProgressFor(pool, qqUserId, characterId);
    const items = await bulkPurificationItemsFor(pool, characterId);
    const outputs = await bulkPurificationOutputsFor(pool, items);
    const success = purificationSuccess(progress.bonus);
    const rules = await purificationRules(pool, characterId, progress.serviceMode === 'personal');
    const token = await createCraftRequest(pool, characterId, 'bulk_purification', { fingerprint: alchemyFingerprint({ items: items.map(item => [item.id, item.quantity]), level: progress.level, version: rules.version }) });
    const payments = new Map();
    for (const item of items)
        payments.set(item.id, await talentMaterialPayment(pool, characterId, item.id, item.quantity, 'craft', progress.serviceMode === 'personal'));
    return { token, success: success * (rules.risk ? .7 : 1), materials: items.map(item => ({ ...item, paid: payments.get(item.id), outputName: outputs.get(item.outputCode)?.name ?? '未知产物', expectedOutput: item.quantity * success / 100 * purificationOutputMultiplierForLevel(materialLevelFor(item)) * (rules.risk ? 2.8 : 1) })) };
});
const purificationState = async (qqUserId) => withTransaction(async (pool) => {
    const characterId = await characterIdFor(pool, qqUserId, true);
    const progress = await activeAlchemistProgressFor(pool, qqUserId, characterId);
    const [rows] = await pool.execute(`SELECT s.purification_item_id AS item_id,s.purification_quantity AS quantity,i.code,i.name,i.item_category,i.effect_json,pi.quantity AS available FROM player_alchemy_sessions s LEFT JOIN item_definitions i ON i.id=s.purification_item_id LEFT JOIN player_inventory pi ON pi.character_id=s.character_id AND pi.item_id=s.purification_item_id WHERE s.character_id=?`, [characterId]);
    const row = rows[0];
    const amount = Number(row?.quantity ?? 0);
    const outputCode = row?.code ? purificationOutputFor({ code: row.code, effect_json: row.effect_json }) : undefined;
    const [outputs] = outputCode ? await pool.execute('SELECT name FROM item_definitions WHERE code=? LIMIT 1', [outputCode]) : [[]];
    const success = purificationSuccess(progress.bonus);
    const sourceLevel = row ? materialLevelFor({ code: row.code ?? '', effect_json: row.effect_json }) : 1;
    const rules = await purificationRules(pool, characterId, progress.serviceMode === 'personal');
    const token = amount > 0 ? await createCraftRequest(pool, characterId, 'purification', { fingerprint: alchemyFingerprint({ itemId: Number(row?.item_id), quantity: amount, level: progress.level, version: rules.version }) }) : undefined;
    const paid = row?.item_id ? await talentMaterialPayment(pool, characterId, Number(row.item_id), amount, 'craft', progress.serviceMode === 'personal') : 0;
    return { token, progress, paid, itemId: row?.item_id ? Number(row.item_id) : null, name: row?.name ?? null, quantity: amount, available: Number(row?.available ?? 0), outputCode, outputName: outputs[0]?.name ?? null, expectedOutput: amount * success / 100 * purificationOutputMultiplierForLevel(sourceLevel) * (rules.risk ? 2.8 : 1), success: success * (rules.risk ? .7 : 1) };
});
const selectPurificationMaterial = async (qqUserId, itemId, quantity = 10) => withTransaction(async (connection) => {
    if (!Number.isInteger(quantity) || quantity < 1)
        throw new Error('提纯数量至少为 1。');
    const characterId = await characterIdFor(connection, qqUserId, true);
    await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    await invalidateCraftRequests(connection, characterId, 'purification');
    const [items] = await connection.execute(`SELECT i.id,i.code,i.name,i.item_category,i.effect_json,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id=? FOR UPDATE`, [characterId, itemId]);
    const item = items[0];
    if (!item || !purificationOutputFor(item))
        throw new Error('该材料暂时无法提纯。');
    if (quantity > Number(item.quantity))
        throw new Error(`材料不足，最多可放入 ${item.quantity} 份。`);
    await connection.execute('INSERT INTO player_alchemy_sessions (character_id,purification_item_id,purification_quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE purification_item_id=VALUES(purification_item_id),purification_quantity=VALUES(purification_quantity)', [characterId, itemId, quantity]);
});
const clearPurificationMaterial = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    await invalidateCraftRequests(connection, characterId, 'purification');
    await connection.execute('UPDATE player_alchemy_sessions SET purification_item_id=NULL,purification_quantity=0 WHERE character_id=?', [characterId]);
});
const executePurification = async (qqUserId, requestToken) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    if (!requestToken)
        throw new Error('请打开提纯面板确认实际耗材后再开始。');
    const request = await craftRequestFor(connection, characterId, 'purification', requestToken);
    if (request.result)
        return request.result;
    const progress = await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    const [rows] = await connection.execute(`SELECT i.id,i.code,i.name,i.item_type,i.rarity,i.item_category,i.effect_json,pi.quantity,s.purification_quantity AS selected FROM player_alchemy_sessions s JOIN player_inventory pi ON pi.character_id=s.character_id AND pi.item_id=s.purification_item_id JOIN item_definitions i ON i.id=s.purification_item_id WHERE s.character_id=? FOR UPDATE`, [characterId]);
    const item = rows[0];
    const selected = Number(item?.selected ?? 0);
    const outputCode = item ? purificationOutputFor(item) : undefined;
    if (!item || !outputCode || selected < 1 || Number(item.quantity) < selected)
        throw new Error('请先放入足够的可提纯材料。');
    const rules = await purificationRules(connection, characterId, progress.serviceMode === 'personal');
    if (request.snapshot.fingerprint !== alchemyFingerprint({ itemId: Number(item.id), quantity: selected, level: progress.level, version: rules.version }))
        throw new Error('提纯耗材或制作条件已改变，请重新预览。');
    const success = purificationSuccess(progress.bonus);
    const settled = await settleTalentPurification(connection, characterId, { id: Number(item.id), code: item.code, outputCode, quantity: selected, success, valueMultiplier: purificationOutputMultiplierForLevel(materialLevelFor(item)), proficiencyPerInput: mapMaterialProficiencyGain(item), personal: progress.serviceMode === 'personal' });
    const { outputQuantity, proficiencyGain } = settled;
    const succeeded = outputQuantity > 0;
    const usedBinding = settled.binding;
    const [outputs] = await connection.execute('SELECT id,name FROM item_definitions WHERE code=? LIMIT 1 FOR UPDATE', [outputCode]);
    if (!outputs[0])
        throw new Error('精材料配方尚未初始化，请重启机器人。');
    if (succeeded) {
        await grantInventory(connection, characterId, Number(outputs[0].id), productionBinding(usedBinding, outputQuantity, false));
        if (progress.serviceMode === 'personal')
            await recordTalentProduct(connection, characterId, Number(outputs[0].id), outputQuantity);
        await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, outputs[0].id]);
    }
    await connection.execute('UPDATE player_alchemy_sessions SET purification_item_id=NULL,purification_quantity=0 WHERE character_id=?', [characterId]);
    const next = await addAlchemistProficiency(connection, qqUserId, characterId, proficiencyGain, true);
    const token = requestToken;
    const journalId = await recordAlchemyJournal(connection, characterId, token, { kind: 'purification', source: 'single', version: alchemyRuleVersion, level: progress.level, craftsmanship: 0, ingredients: [{ id: Number(item.id), code: item.code, name: item.name, quantity: selected, role: '提纯耗材', effect: item.effect_json }] }, [{ success: succeeded, consumed: [{ id: Number(item.id), code: item.code, name: item.name, quantity: settled.paid, role: '提纯耗材' }], outputs: succeeded ? [{ id: Number(outputs[0].id), code: outputCode, name: outputs[0].name, quantity: outputQuantity, role: 'output' }] : [] }], { success });
    const result = { succeeded, inputName: item.name, inputQuantity: settled.paid, refundedQuantity: settled.refunded, outputName: outputs[0].name, outputQuantity, success: settled.success, proficiencyGain, progress: next, journalId };
    await completeCraftRequest(connection, characterId, token, result);
    return result;
});
const executeBulkPurification = async (qqUserId, requestToken) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    if (!requestToken)
        throw new Error('请重新打开一键提纯预览并确认。');
    const request = await craftRequestFor(connection, characterId, 'bulk_purification', requestToken);
    if (request.result)
        return request.result;
    const progress = await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    const items = await bulkPurificationItemsFor(connection, characterId, true);
    const rules = await purificationRules(connection, characterId, progress.serviceMode === 'personal');
    if (request.snapshot.fingerprint !== alchemyFingerprint({ items: items.map(item => [item.id, item.quantity]), level: progress.level, version: rules.version }))
        throw new Error('库存或提纯条件已改变，请重新预览。');
    if (!items.length)
        throw new Error('背包中没有可一键提纯的普通或大型怪材。');
    const outputs = await bulkPurificationOutputsFor(connection, items);
    const success = purificationSuccess(progress.bonus);
    const paidInputs = [];
    const results = new Map();
    let inputQuantity = 0;
    let refundedQuantity = 0;
    let proficiencyGain = 0;
    for (const item of items) {
        const output = outputs.get(item.outputCode);
        if (!output)
            throw new Error('精材料配方尚未初始化，请重启机器人。');
        const settled = await settleTalentPurification(connection, characterId, { id: Number(item.id), code: item.code, outputCode: item.outputCode, quantity: item.quantity, success, valueMultiplier: purificationOutputMultiplierForLevel(materialLevelFor(item)), proficiencyPerInput: mapMaterialProficiencyGain(item), personal: progress.serviceMode === 'personal' });
        const { outputQuantity, binding: usedBinding } = settled;
        paidInputs.push({ id: Number(item.id), code: item.code, name: item.name, quantity: settled.paid, role: '提纯耗材' });
        inputQuantity += settled.paid;
        refundedQuantity += settled.refunded;
        proficiencyGain += settled.proficiencyGain;
        if (outputQuantity > 0) {
            await grantInventory(connection, characterId, Number(output.id), productionBinding(usedBinding, outputQuantity, false));
            if (progress.serviceMode === 'personal')
                await recordTalentProduct(connection, characterId, Number(output.id), outputQuantity);
            await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, output.id]);
            const current = results.get(item.outputCode) ?? { name: output.name, quantity: 0 };
            current.quantity += outputQuantity;
            results.set(item.outputCode, current);
        }
    }
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND quantity<=0', [characterId]);
    await connection.execute(`UPDATE player_alchemy_sessions SET purification_item_id=NULL,purification_quantity=0 WHERE character_id=? AND purification_item_id IN (${items.map(() => '?').join(',')})`, [characterId, ...items.map(item => item.id)]);
    const earnedProficiency = shopProficiency(Math.round(proficiencyGain));
    const next = await addAlchemistProficiency(connection, qqUserId, characterId, earnedProficiency, true);
    const token = requestToken;
    const journalId = await recordAlchemyJournal(connection, characterId, token, { kind: 'purification', source: 'bulk', version: alchemyRuleVersion, level: progress.level, craftsmanship: 0, ingredients: items.map(item => ({ id: item.id, code: item.code, name: item.name, quantity: item.quantity, role: '提纯耗材', effect: item.effect_json })) }, [{ success: results.size > 0, consumed: paidInputs, outputs: [...results].map(([code, item]) => ({ id: outputs.get(code).id, code, name: item.name, quantity: item.quantity, role: 'output' })) }], { success });
    const result = { inputQuantity, refundedQuantity, outputQuantity: [...results.values()].reduce((total, result) => total + result.quantity, 0), outputs: [...results.values()], success: success * (rules.risk ? .7 : 1), proficiencyGain: earnedProficiency, progress: next, journalId };
    await completeCraftRequest(connection, characterId, token, result);
    return result;
});
const jsonRecord = (value) => {
    if (value && typeof value === 'object')
        return value;
    if (typeof value !== 'string')
        return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    }
    catch {
        return {};
    }
};
const materialLevelFor = (item) => {
    const effect = jsonRecord(item.effect_json);
    const fromEffect = Number(effect.material_monster_level ?? effect.material_level ?? effect.alchemyLevel ?? 0);
    const fromCode = Number(item.code.match(/(?:_l|lv)(\d+)$/i)?.[1] ?? 0);
    return Math.min(100, Math.max(1, fromEffect || fromCode || 1));
};
const tagSetFor = (item) => {
    const source = `${item.code} ${item.name} ${item.item_category}`.toLowerCase();
    const tags = new Set();
    const add = (...values) => values.forEach(value => tags.add(value));
    if (/肉|血|草|绒|毛|根|芽|生机|life|meat|herb/.test(source))
        add('生机');
    if (/核|魔|灵|星|魂|法|mana|magic|core/.test(source))
        add('灵能');
    if (/骨|壳|甲|鳞|石|铁|金属|shell|bone|scale/.test(source))
        add('韧护');
    if (/筋|羽|翎|爪|风|弦|迅|速|tendon|feather/.test(source))
        add('迅捷');
    if (/牙|刺|刃|爪|角|锋|tusk|fang|claw/.test(source))
        add('锋锐');
    if (/胶|皮|囊|液|沼|slime|gel/.test(source))
        add('凝胶');
    if (/河|潮|水|湖|露|冰|shell|tide/.test(source))
        add('潮汐');
    if (/火|炎|熔|烬|赤|ember|flame/.test(source))
        add('炎性');
    if (/霜|雪|寒|冰|frost|ice/.test(source))
        add('霜寒');
    if (/雷|电|鸣|thunder|spark/.test(source))
        add('雷鸣');
    if (/光|圣|日|辉|light/.test(source))
        add('光辉');
    if (/暗|影|夜|月|雾|黑|shadow|dark/.test(source))
        add('暗蚀');
    if (/wood_element|木元素/.test(source))
        add('生机');
    if (/metal_element|金元素/.test(source))
        add('韧护', '锋锐');
    if (/water_element|水元素/.test(source))
        add('潮汐');
    if (/fire_element|火元素/.test(source))
        add('炎性');
    if (/ice_element|冰元素/.test(source))
        add('霜寒');
    if (/thunder_element|雷元素/.test(source))
        add('雷鸣');
    if (/light_element|光元素/.test(source))
        add('光辉');
    if (/dark_element|暗元素/.test(source))
        add('暗蚀');
    if (!tags.size)
        add('凝胶', '潮汐');
    return [...tags];
};
const materialTierFor = (item) => {
    const effect = jsonRecord(item.effect_json);
    const monsterClass = String(effect.material_monster_class ?? 'normal');
    if (monsterClass === 'boss')
        return 4;
    if (monsterClass === 'elite')
        return 3;
    if (monsterClass === 'large')
        return 2;
    if (item.item_category === '锻材' || item.item_category === '炼材')
        return 2;
    return 1;
};
const dynamicMaterialFor = (item) => {
    const isParticle = item.item_category === '粒子';
    const tags = tagSetFor(item);
    return { ...item, sourceLevel: materialLevelFor(item), tier: materialTierFor(item), isParticle, tags, stability: 4 + (isParticle ? 1 : 0) + Math.min(8, Math.floor(materialLevelFor(item) / 10)) };
};
const mapMaterialProficiencyGain = (item) => materialValueMultiplierForLevel(materialLevelFor(item));
const alchemyProficiencyGain = (materials, batches) => Math.max(1, Math.round(Math.max(1, batches) * materials.reduce((sum, material) => sum + mapMaterialProficiencyGain(material), 0) / Math.max(1, materials.length)));
const outputTierValue = (tier) => tier === '基础' ? 1 : tier === '下位' ? 2 : tier === '中位' ? 3 : tier === '上位' ? 4 : 5;
const maxOutputTierFor = (level) => level <= 10 ? 1 : level <= 25 ? 2 : level <= 45 ? 3 : level <= 70 ? 4 : 5;
const randomWeighted = (entries, weight) => {
    const total = entries.reduce((sum, entry) => sum + Math.max(0, weight(entry)), 0);
    if (total <= 0)
        return entries[Math.floor(Math.random() * entries.length)];
    let roll = Math.random() * total;
    for (const entry of entries) {
        roll -= Math.max(0, weight(entry));
        if (roll <= 0)
            return entry;
    }
    return entries[entries.length - 1];
};
const dynamicOutputDistribution = (main, auxiliary, reagent) => {
    const nonParticlePrimary = [main, auxiliary].filter(item => !item.isParticle);
    const effectiveLevel = nonParticlePrimary.length ? Math.min(...nonParticlePrimary.map(item => item.sourceLevel)) : 1;
    const materialTier = nonParticlePrimary.length ? Math.min(...nonParticlePrimary.map(item => item.tier)) : 1;
    const maxTier = maxOutputTierFor(effectiveLevel);
    const tags = [...main.tags, ...auxiliary.tags, ...reagent.tags];
    const pool = alchemyOutputsAtOrBelow(effectiveLevel).filter(output => outputTierValue(output.tier) <= maxTier);
    const levels = [...new Set(pool.map(output => output.level))].sort((a, b) => b - a).slice(0, 2);
    const candidates = pool.filter(output => levels.includes(output.level));
    if (!candidates.length)
        throw new Error('当前材料尚不能稳定形成炼金成品。');
    const weighted = candidates.map(output => {
        const tagScore = output.tags.reduce((score, tag) => score + tags.filter(value => value === tag).length * 4, 0);
        const levelScore = output.level === 1 ? 1 : 2 + Math.max(0, 3 - Math.abs(output.level - effectiveLevel) / 10);
        const rarityScore = 1 + Math.max(0, outputTierValue(output.tier) - 1) * Math.max(0, materialTier - 1) * .25;
        return { output, weight: (1 + tagScore + levelScore) * rarityScore * (output.level === levels[0] ? 4 : 1) };
    });
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    return weighted.map(item => ({ ...item, probability: item.weight / total }));
};
const particleConversionChance = (main, auxiliary) => main.isParticle && auxiliary.isParticle ? 95 : main.isParticle ? 80 : auxiliary.isParticle ? 70 : 0;
const particleOutputCodeFor = (main, auxiliary, reagent) => {
    const sources = [main, auxiliary, reagent].filter(item => item.isParticle);
    const alternatives = ['blood_residue', 'energy_ember'];
    const source = sources[0];
    if (!source)
        return 'blood_residue';
    const index = Math.max(0, alternatives.indexOf(source.code));
    return alternatives[(index + 1) % alternatives.length] ?? 'blood_residue';
};
const alchemyNarrative = {
    main: ['纹理在坩埚底部慢慢舒展。', '主材的气息先一步占据了反应核心。', '液面浮起与主材相近的微光。', '主材被研磨后，留下清晰而执拗的残响。', '坩埚开始捕捉主材中最活跃的性质。', '一缕原始的素材气味从炉口逸出。'],
    auxiliary: ['辅材使原本粗粝的反应转向细腻。', '两种材质在边缘处形成了新的纹路。', '辅材压住了过于躁动的沉渣。', '主辅材短暂排斥后，逐渐找到了平衡。', '液体的颜色被辅材牵引，悄然发生偏移。', '辅材的碎屑在液面上勾出细小漩涡。'],
    reagent: ['反应剂点亮了最后一道定型纹。', '反应剂被吸入液面，留下短促的回鸣。', '炉火随着反应剂的律动稳定下来。', '反应剂将松散的性质收束为一线。', '元素微粒在坩埚边缘迸出细碎火花。', '反应剂为这次组合留下了难以忽略的余味。'],
    success: ['反应平稳收束，坩埚中留下了可用的结晶。', '色泽终于稳定下来，成品轮廓渐渐清晰。', '几次轻微震颤后，反应走向了预期的终点。', '坩埚中的光点彼此咬合，完成了最后的定型。', '炉火压低，混合物凝成了可以收取的成果。', '材料的性质达成暂时和解，反应成功闭合。'],
    failure: ['反应没有维持住平衡，部分素材化作了无用沉渣。', '液面短暂翻涌，未定型的部分就此散去。', '性质彼此冲突，留下的只是一层焦黑残留。', '坩埚冷却得太快，失败批次未能形成成品。', '不稳定的纹路崩解，只有少量反应痕迹被保留。', '混合物失去共鸣，失败批次在炉火中消散。'],
    explosion: ['坩埚骤然炸裂，飞散的残渣在地上刻出焦痕。', '压不住的能量冲开炉盖，整批材料化作了烟雾。', '炉火猛地窜高，失控反应最终吞没了全部残留。', '一声闷响后，坩埚只剩下被烧白的内壁。']
};
const randomNarrative = (group) => group[Math.floor(Math.random() * group.length)] ?? '';
const alchemyStateFor = async (connection, characterId) => {
    const [rows] = await connection.execute(`SELECT s.main_item_id AS main_id,s.auxiliary_item_id AS auxiliary_id,s.reagent_item_id AS reagent_id,s.main_quantity,s.auxiliary_quantity,s.reagent_quantity,s.alchemy_confirmation_expires_at AS confirmation_expires_at,s.alchemy_processing_until AS processing_until,m.name AS main_name,a.name AS auxiliary_name,r.name AS reagent_name,m.code AS main_code,a.code AS auxiliary_code,r.code AS reagent_code FROM player_alchemy_sessions s LEFT JOIN item_definitions m ON m.id=s.main_item_id LEFT JOIN item_definitions a ON a.id=s.auxiliary_item_id LEFT JOIN item_definitions r ON r.id=s.reagent_item_id WHERE s.character_id=?`, [characterId]);
    return rows[0] ?? { main_id: null, auxiliary_id: null, reagent_id: null, main_quantity: 1, auxiliary_quantity: 1, reagent_quantity: 1, confirmation_expires_at: null, processing_until: null, main_name: null, auxiliary_name: null, reagent_name: null, main_code: null, auxiliary_code: null, reagent_code: null };
};
const alchemyState = async (qqUserId) => {
    const pool = await getPool();
    const characterId = await characterIdFor(pool, qqUserId);
    const progress = await activeAlchemistProgressFor(pool, qqUserId, characterId);
    const state = await alchemyStateFor(pool, characterId);
    return { progress, mainId: state.main_id, mainName: state.main_name, mainQuantity: Number(state.main_quantity), auxiliaryId: state.auxiliary_id, auxiliaryName: state.auxiliary_name, auxiliaryQuantity: Number(state.auxiliary_quantity), reagentId: state.reagent_id, reagentName: state.reagent_name, reagentQuantity: Number(state.reagent_quantity), confirmationPending: Boolean(state.confirmation_expires_at && state.confirmation_expires_at.getTime() > Date.now()), processing: Boolean(state.processing_until && state.processing_until.getTime() > Date.now()) };
};
const selectAlchemyMaterial = async (qqUserId, role, itemKey, quantity = 1) => withTransaction(async (connection) => {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)
        throw new Error('每个材料槽位可放入 1～99 份。');
    const characterId = await characterIdFor(connection, qqUserId, true);
    await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    await assertAlchemyNotProcessingFor(connection, characterId, true);
    const itemId = Number(itemKey);
    const [items] = await connection.execute(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type='material' AND ${Number.isInteger(itemId) && itemId > 0 ? 'i.id=?' : 'i.name=?'} LIMIT 1 FOR UPDATE`, [characterId, Number.isInteger(itemId) && itemId > 0 ? itemId : itemKey]);
    const item = items[0];
    if (!item)
        throw new Error('背包中没有该材料。');
    if (Number(item.quantity) < quantity)
        throw new Error(`材料不足，最多可放入 ${item.quantity} 份。`);
    const column = role === 'main' ? 'main_item_id' : role === 'auxiliary' ? 'auxiliary_item_id' : 'reagent_item_id';
    const quantityColumn = role === 'main' ? 'main_quantity' : role === 'auxiliary' ? 'auxiliary_quantity' : 'reagent_quantity';
    await invalidateCraftRequests(connection, characterId);
    await connection.execute(`INSERT INTO player_alchemy_sessions (character_id,${column},${quantityColumn},alchemy_confirmation_expires_at) VALUES (?,?,?,NULL) ON DUPLICATE KEY UPDATE ${column}=VALUES(${column}),${quantityColumn}=VALUES(${quantityColumn}),alchemy_confirmation_expires_at=NULL`, [characterId, item.id, quantity]);
    return item.name;
});
const clearAlchemyMaterial = async (qqUserId, role) => withTransaction(async (connection) => { const characterId = await characterIdFor(connection, qqUserId, true); await activeAlchemistProgressFor(connection, qqUserId, characterId, true); await assertAlchemyNotProcessingFor(connection, characterId, true); await invalidateCraftRequests(connection, characterId); const column = role === 'main' ? 'main_item_id' : role === 'auxiliary' ? 'auxiliary_item_id' : 'reagent_item_id'; const quantityColumn = role === 'main' ? 'main_quantity' : role === 'auxiliary' ? 'auxiliary_quantity' : 'reagent_quantity'; await connection.execute(`UPDATE player_alchemy_sessions SET ${column}=NULL,${quantityColumn}=1,alchemy_confirmation_expires_at=NULL WHERE character_id=?`, [characterId]); });
const alchemyMaterials = async (qqUserId) => {
    const pool = await getPool();
    const characterId = await characterIdFor(pool, qqUserId);
    await activeAlchemistProgressFor(pool, qqUserId, characterId);
    const [rows] = await pool.execute('SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type=\'material\' ORDER BY i.item_category,i.name,i.id', [characterId]);
    return rows.map(row => ({ id: Number(row.id), code: row.code, name: row.name, category: row.item_category, quantity: Number(row.quantity) }));
};
const formulaAdjectives = ['晨露', '星辉', '月影', '琥珀', '雾语', '绯红', '晴空', '秘仪'];
const formulaName = (mainName) => `${formulaAdjectives[Math.floor(Math.random() * formulaAdjectives.length)]}·${mainName}试作配方`;
const requirePersonalFormulaAccess = async (connection, characterId) => {
    const [rows] = await connection.execute("SELECT id FROM characters WHERE id=? AND secondary_profession_code='alchemist'", [characterId]);
    if (!rows.length)
        throw new Error('炼金配方仅对当前炼金师开放。');
};
const saveAlchemyFormula = async (qqUserId, journalId = 0) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    await requirePersonalFormulaAccess(connection, characterId);
    const progress = await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    const state = await alchemyStateFor(connection, characterId);
    if (journalId) {
        const [records] = await connection.execute('SELECT snapshot_json,batches_json FROM player_alchemy_journal WHERE id=? AND character_id=?', [journalId, characterId]);
        if (!records[0])
            throw new Error('未找到你的这条炼金手记。');
        const snapshot = craftJson(records[0].snapshot_json);
        const batches = craftJson(records[0].batches_json).length;
        if (snapshot.kind === 'purification' || snapshot.ingredients.length !== 3)
            throw new Error('提纯记录不是三槽配方。');
        const [main, auxiliary, reagent] = snapshot.ingredients;
        Object.assign(state, { main_id: main.id, main_name: main.name, main_quantity: main.quantity * batches, auxiliary_id: auxiliary.id, auxiliary_quantity: auxiliary.quantity * batches, reagent_id: reagent.id, reagent_quantity: reagent.quantity * batches });
    }
    if (!state.main_id || !state.main_name)
        throw new Error('请先选择主材后再保存配方。');
    const [counts] = await connection.execute('SELECT COUNT(*) AS total FROM player_alchemy_formulas WHERE character_id=? FOR UPDATE', [characterId]);
    const capacity = Math.max(1, Number(progress.level)) * 3;
    if (Number(counts[0]?.total ?? 0) >= capacity)
        throw new Error(`快捷配方已满（${counts[0]?.total ?? 0}/${capacity}）。提升炼金师等级可增加上限。`);
    const name = formulaName(state.main_name);
    const [result] = await connection.execute('INSERT INTO player_alchemy_formulas (character_id,name,main_item_id,auxiliary_item_id,reagent_item_id,main_quantity,auxiliary_quantity,reagent_quantity) VALUES (?,?,?,?,?,?,?,?)', [characterId, name, state.main_id, state.auxiliary_id, state.reagent_id, state.main_quantity, state.auxiliary_quantity, state.reagent_quantity]);
    return { id: Number(result.insertId), name, capacity };
});
const alchemyFormulaList = async (qqUserId, page = 1, keyword = '') => {
    const pool = await getPool();
    const characterId = await characterIdFor(pool, qqUserId);
    await requirePersonalFormulaAccess(pool, characterId);
    const progress = await activeAlchemistProgressFor(pool, qqUserId, characterId);
    const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM player_alchemy_formulas WHERE character_id=? AND name LIKE ?', [characterId, `%${keyword}%`]);
    const total = Number(countRows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / 5));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const [rows] = await pool.execute(`SELECT f.id,f.name,f.main_quantity,f.auxiliary_quantity,f.reagent_quantity,f.main_item_id,f.auxiliary_item_id,f.reagent_item_id,m.name AS main_name,a.name AS auxiliary_name,r.name AS reagent_name
    FROM player_alchemy_formulas f JOIN item_definitions m ON m.id=f.main_item_id LEFT JOIN item_definitions a ON a.id=f.auxiliary_item_id LEFT JOIN item_definitions r ON r.id=f.reagent_item_id
    WHERE f.character_id=? AND f.name LIKE ? ORDER BY f.created_at,f.id LIMIT ? OFFSET ?`, [characterId, `%${keyword}%`, 5, (currentPage - 1) * 5]);
    return { capacity: Math.max(1, Number(progress.level)) * 3, total, page: currentPage, totalPages, keyword, formulas: rows.map(row => ({ id: Number(row.id), name: row.name, mainName: row.main_name, auxiliaryName: row.auxiliary_name, reagentName: row.reagent_name, mainQuantity: Number(row.main_quantity), auxiliaryQuantity: Number(row.auxiliary_quantity), reagentQuantity: Number(row.reagent_quantity) })) };
};
const renameAlchemyFormula = async (qqUserId, formulaId, name) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    await requirePersonalFormulaAccess(connection, characterId);
    await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 32)
        throw new Error('配方名称需为 1～32 个字符。');
    const [result] = await connection.execute('UPDATE player_alchemy_formulas SET name=? WHERE id=? AND character_id=?', [trimmed, formulaId, characterId]);
    if (!result.affectedRows)
        throw new Error('未找到该快捷配方。');
    return trimmed;
});
const loadAlchemyFormula = async (qqUserId, formulaId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    await requirePersonalFormulaAccess(connection, characterId);
    await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    await assertAlchemyNotProcessingFor(connection, characterId, true);
    const [rows] = await connection.execute('SELECT f.id,f.name,f.main_quantity,f.auxiliary_quantity,f.reagent_quantity,f.main_item_id,f.auxiliary_item_id,f.reagent_item_id,m.name AS main_name,a.name AS auxiliary_name,r.name AS reagent_name FROM player_alchemy_formulas f JOIN item_definitions m ON m.id=f.main_item_id LEFT JOIN item_definitions a ON a.id=f.auxiliary_item_id LEFT JOIN item_definitions r ON r.id=f.reagent_item_id WHERE f.id=? AND f.character_id=? FOR UPDATE', [formulaId, characterId]);
    const formula = rows[0];
    if (!formula)
        throw new Error('未找到该快捷配方。');
    await setAlchemySlots(connection, characterId, [{ id: Number(formula.main_item_id), quantity: Number(formula.main_quantity) }, { id: Number(formula.auxiliary_item_id), quantity: Number(formula.auxiliary_quantity) }, { id: Number(formula.reagent_item_id), quantity: Number(formula.reagent_quantity) }]);
    return formula.name;
});
const deleteAlchemyFormula = async (qqUserId, formulaId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    await requirePersonalFormulaAccess(connection, characterId);
    await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    const [result] = await connection.execute('DELETE FROM player_alchemy_formulas WHERE id=? AND character_id=?', [formulaId, characterId]);
    if (!result.affectedRows)
        throw new Error('未找到该快捷配方。');
});
const cancelAlchemyConfirmation = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    await assertAlchemyNotProcessingFor(connection, characterId, true);
    await connection.execute('UPDATE player_alchemy_sessions SET alchemy_confirmation_expires_at=NULL WHERE character_id=?', [characterId]);
});
const executeAlchemy = async (qqUserId, token, origin = 'manual', note) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    const request = token ? await craftRequestFor(connection, characterId, 'alchemy', token) : null;
    if (request?.result)
        return request.result;
    const progress = await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    const state = await alchemyStateFor(connection, characterId);
    await assertAlchemyNotProcessingFor(connection, characterId, true);
    if (!state.main_id || !state.auxiliary_id || !state.reagent_id)
        throw new Error('请先分别放入主材、辅材与反应剂。');
    const roleRows = [
        { role: '主材', id: Number(state.main_id), quantity: Math.max(1, Number(state.main_quantity)) },
        { role: '辅材', id: Number(state.auxiliary_id), quantity: Math.max(1, Number(state.auxiliary_quantity)) },
        { role: '催化剂', id: Number(state.reagent_id), quantity: Math.max(1, Number(state.reagent_quantity)) }
    ];
    const ids = [...new Set(roleRows.map(row => row.id))];
    const marks = ids.map(() => '?').join(',');
    const [items] = await connection.execute(`SELECT i.id,i.code,i.name,i.item_type,i.rarity,i.item_category,i.effect_json,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id IN (${marks}) AND i.item_type='material' FOR UPDATE`, [characterId, ...ids]);
    const getMaterial = (id) => {
        const item = items.find(row => Number(row.id) === id);
        if (!item)
            throw new Error('选中的材料已不在背包中。');
        if (jsonRecord(item.effect_json).automatonProduct || item.code === 'sky_dust')
            throw new Error('机巧专用材料与天空粉尘请使用机巧固定配方。');
        return dynamicMaterialFor(item);
    };
    const main = getMaterial(roleRows[0].id);
    const auxiliary = getMaterial(roleRows[1].id);
    const reagent = getMaterial(roleRows[2].id);
    const sourceLevels = [main, auxiliary, reagent].filter(item => !item.isParticle).map(item => item.sourceLevel);
    const levelGap = sourceLevels.length > 1 ? Math.max(...sourceLevels) - Math.min(...sourceLevels) : 0;
    const extractCode = auxiliary.code === 'blood_residue' && reagent.code === 'energy_ember' ? { beast_core: 'mana_dust', living_wood: 'herbal_extract' }[main.code] : undefined;
    const resetRecipe = main.code === 'mana_dust' && auxiliary.code === 'herbal_extract' && reagent.code === 'magic_unit';
    if (resetRecipe && (progress.level < 3 || roleRows.some(row => row.quantity !== 3)))
        throw new Error('归悟洗练露需炼金师 Lv.3，三槽各放入 3 份，本次只制作一批。');
    const batches = resetRecipe ? 1 : Math.min(99, ...roleRows.map(row => row.quantity));
    const perBatch = resetRecipe ? 3 : 1;
    const [craftRows] = await connection.execute("SELECT 1 FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.code='craftsmanship' LIMIT 1", [characterId]);
    const craftsmanship = !currentSecondaryShop() && craftRows.length ? Math.min(5, progress.level) * 10 : 0;
    const talent = await ownedTalent(connection, characterId), talentData = await readTalentData(connection, characterId);
    const riskCraft = !currentSecondaryShop() && talent?.number === 'H09' && talentData.settings.riskCraft === true;
    if (riskCraft && (!ordinaryTalentItem(items.find(item => Number(item.id) === Number(state.main_id))) || resetRecipe || main.isParticle || auxiliary.isParticle))
        throw new Error('孤注制作不能用于稀有主材、粒子转化或洗练配方，请先关闭孤注制作。');
    const fingerprint = alchemyFingerprint({ roleRows, level: progress.level, craftsmanship, version: alchemyRuleVersion + `:talent:${talent?.number ?? ''}:${riskCraft}` });
    const demands = new Map();
    for (const row of roleRows)
        demands.set(row.id, (demands.get(row.id) ?? 0) + batches * perBatch);
    for (const [itemId, demand] of demands) {
        const paid = await talentMaterialPayment(connection, characterId, itemId, demand, 'craft', !currentSecondaryShop());
        if (Number(items.find(item => Number(item.id) === itemId)?.quantity ?? 0) < paid)
            throw new Error(`放入的材料不足，实际需要${paid}份。`);
    }
    if (!token) {
        token = await createCraftRequest(connection, characterId, 'alchemy', { fingerprint, origin, note });
        return { needsConfirmation: true, token, batches, preview: { note, ingredients: roleRows.map(row => ({ ...row, name: getMaterial(row.id).name, quantity: batches * perBatch })), warning: levelGap >= 15 } };
    }
    if (request?.snapshot.fingerprint !== fingerprint)
        throw new Error('投料或制作条件已经改变，请重新预览并确认。');
    const snapshot = { kind: resetRecipe ? 'skill_reset' : 'alchemy', source: request?.snapshot.origin ?? origin, version: alchemyRuleVersion, level: progress.level, craftsmanship,
        ingredients: roleRows.map(row => { const item = getMaterial(row.id); return { ...row, code: item.code, name: item.name, quantity: perBatch, level: item.sourceLevel, effect: item.effect_json }; }) };
    const values = [main, auxiliary, reagent].map(item => alchemyMaterialValue(item.code, item.sourceLevel, item.item_category));
    if (values.some(value => value === null))
        throw new Error(`材料【${[main, auxiliary, reagent].filter((_item, index) => values[index] === null).map(item => item.name).join('、')}】缺少制作成本锚价，请更换材料；本次未消耗材料。`);
    snapshot.cost = values.every(value => value !== null) ? values.reduce((sum, value) => sum + (value ?? 0), 0) * perBatch : undefined;
    const batchRecords = [];
    const sharedTags = main.tags.filter(tag => auxiliary.tags.includes(tag));
    const stability = main.stability + auxiliary.stability + reagent.stability + sharedTags.length * 4 + (reagent.isParticle ? 5 : -5) - (levelGap >= 30 ? 20 : levelGap >= 15 ? 10 : levelGap >= 11 ? 4 : 0);
    const successRate = alchemySuccessRate(progress.level, stability);
    const greatRate = Math.max(2, Math.min(18, 3 + (progress.level - 1) * .8 + (reagent.code === 'magic_unit' ? 5 : 0)));
    const conversionRate = resetRecipe || extractCode ? 0 : main.isParticle && auxiliary.isParticle ? 1 : particleConversionChance(main, auxiliary) / 100;
    const distribution = resetRecipe || extractCode || conversionRate === 1 ? [] : dynamicOutputDistribution(main, auxiliary, reagent);
    const normalYield = conversionRate + (1 - conversionRate) * distribution.reduce((sum, item) => sum + item.probability * (1 + (outputTierValue(item.output.tier) <= 2 ? greatRate / 100 : 0)), 0);
    const baseCost = snapshot.cost === undefined ? undefined : snapshot.cost / (successRate / 100 * (resetRecipe || extractCode ? 1 + greatRate / 100 : normalYield));
    const costBudgetFor = (output) => alchemyCostQualityBudget(baseCost, output.level);
    const expectedProduced = resetRecipe || extractCode ? (1 + greatRate / 100) * (1 + craftsmanship / 100) : conversionRate + (1 - conversionRate) * distribution.reduce((sum, item) => sum + item.probability * (1 + (outputTierValue(item.output.tier) <= 2 ? greatRate / 100 : 0)) * alchemyQualityBudget(craftsmanship, costBudgetFor(item.output), alchemySupportsQuality(item.output.effect)).quantity, 0);
    const averageCost = snapshot.cost === undefined ? undefined : snapshot.cost / (successRate / 100 * expectedProduced);
    let conversions = 0;
    const producedBindings = new Map();
    const produced = new Map();
    let successes = 0;
    let greatSuccesses = 0;
    let failures = 0;
    for (let batch = 0; batch < batches; batch += 1) {
        const used = { personal: 0, trade: 0, unbound: 0 }, consumed = [];
        for (const [id, quantity] of demands) {
            const payment = await consumeTalentMaterial(connection, characterId, id, quantity / batches, 'craft', !currentSecondaryShop()), part = payment.binding;
            consumed.push({ itemId: id, binding: part, paid: payment.paid, recovery: payment.recovery });
            for (const key of ['personal', 'trade', 'unbound'])
                used[key] += part[key];
        }
        const paidIngredients = snapshot.ingredients.map(item => ({ ...item, quantity: (consumed.find(c => c.itemId === item.id)?.paid ?? 0) * item.quantity / snapshot.ingredients.filter(i => i.id === item.id).reduce((sum, i) => sum + i.quantity, 0) }));
        if (Math.random() * 100 >= successRate * (riskCraft ? .7 : 1)) {
            await refundTalentFailure(connection, characterId, consumed, !currentSecondaryShop());
            failures += 1;
            batchRecords.push({ success: false, consumed: paidIngredients, outputs: [] });
            continue;
        }
        successes += 1;
        const great = Math.random() * 100 < greatRate;
        if (great)
            greatSuccesses += 1;
        const converted = conversionRate > 0 && Math.random() < conversionRate;
        if (converted)
            conversions++;
        const result = converted || resetRecipe || extractCode ? undefined : randomWeighted(distribution, item => item.weight).output;
        const quality = alchemyQualityRoll(craftsmanship, great, Boolean(result && outputTierValue(result.tier) > 2), Math.random, result ? costBudgetFor(result) : 0, result ? alchemySupportsQuality(result.effect) : false);
        const code = extractCode ?? (resetRecipe ? 'alchemy_skill_reset_elixir' : converted ? particleOutputCodeFor(main, auxiliary, reagent) : result.code + (quality.quality ? `_q${quality.quality}` : ''));
        const quantity = (great && !converted && (resetRecipe || Boolean(extractCode) || outputTierValue(result.tier) <= 2) ? 2 : 1) * (converted ? 1 : resetRecipe || extractCode ? (Math.random() < craftsmanship / 100 ? 2 : 1) : quality.quantity);
        produced.set(code, (produced.get(code) ?? 0) + quantity);
        const bound = productionBinding(used, quantity, !converted), current = producedBindings.get(code) ?? { personal: 0, trade: 0, unbound: 0 };
        for (const key of ['personal', 'trade', 'unbound'])
            current[key] += bound[key];
        producedBindings.set(code, current);
        batchRecords.push({ success: true, great, consumed: paidIngredients, outputs: [{ id: 0, code, name: '', quantity, role: 'output' }] });
    }
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND quantity<=0', [characterId]);
    const codes = [...produced.keys()];
    const outputRows = codes.length ? (await connection.execute(`SELECT id,code,name,item_type,item_category,rarity,required_level,effect_json FROM item_definitions WHERE code IN (${codes.map(() => '?').join(',')}) FOR UPDATE`, codes))[0] : [];
    if (outputRows.length !== codes.length)
        throw new Error('炼金产物尚未初始化，请重启机器人后重试。');
    const outputEntries = [];
    for (const [code] of produced) {
        const outputRow = outputRows.find(row => row.code === code);
        if (!outputRow)
            continue;
        const binding = producedBindings.get(code), factor = currentSecondaryShop() ? 1 : await talentCraftMultiplier(connection, characterId, outputRow);
        const ledger = await readTalentData(connection, characterId);
        for (const key of ['personal', 'trade', 'unbound'])
            binding[key] = talentWhole(ledger, `output:${outputRow.id}:${key}`, binding[key], factor);
        await saveTalentData(connection, characterId, ledger);
        await grantInventory(connection, characterId, Number(outputRow.id), binding);
        if (!currentSecondaryShop())
            await recordTalentProduct(connection, characterId, Number(outputRow.id), binding.personal + binding.trade + binding.unbound);
        await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, outputRow.id]);
        outputEntries.push({ name: outputRow.name, quantity: binding.personal + binding.trade + binding.unbound });
    }
    await connection.execute('UPDATE player_alchemy_sessions SET alchemy_confirmation_expires_at=NULL WHERE character_id=?', [characterId]);
    const proficiencyGain = shopProficiency(alchemyProficiencyGain([main, auxiliary, reagent], batches));
    if (!currentSecondaryShop())
        await talentProductionRecord(connection, characterId, `alchemy:${roleRows.map(row => row.id).join(':')}`, batches ? proficiencyGain * successes / batches : 0);
    const next = await addAlchemistProficiency(connection, qqUserId, characterId, proficiencyGain);
    const exploded = failures > 0 && successes === 0 && Math.random() * 100 < Math.max(5, 28 - stability / 2);
    const sourceText = conversions ? '粒子在主反应中占据了主导，反应转入粒子转化路线。' : successes ? randomNarrative(alchemyNarrative.success) : exploded ? randomNarrative(alchemyNarrative.explosion) : randomNarrative(alchemyNarrative.failure);
    const outcome = outputEntries.length ? `获得${outputEntries.map(item => `【${item.name}】×${item.quantity}`).join('、')}。` : exploded ? '本次反应发生炸炉，没有留下可用成品。' : '本次反应没有留下可用成品。';
    for (const batch of batchRecords)
        for (const item of batch.outputs) {
            const row = outputRows.find(row => row.code === item.code);
            Object.assign(item, { id: Number(row.id), name: row.name, level: Number(row.required_level), effect: jsonRecord(row.effect_json) });
        }
    const result = {
        token,
        averageCost,
        succeeded: successes > 0,
        batches,
        successRate,
        greatSuccesses,
        failures,
        outputs: outputEntries,
        stages: [
            `① 主材：投入【${main.name}】×${batches * perBatch}，${main.tags.join('、')}的性质开始浮现。${randomNarrative(alchemyNarrative.main)}`,
            `② 辅材：投入【${auxiliary.name}】×${batches * perBatch}，${randomNarrative(alchemyNarrative.auxiliary)}`,
            `③ 催化剂：投入【${reagent.name}】×${batches * perBatch}，它为坩埚提供了${reagent.isParticle ? '元素定型' : '稳定载体'}。${randomNarrative(alchemyNarrative.reagent)}`,
            `④ 反应：${sourceText} 成功 ${successes}/${batches}${greatSuccesses ? `，其中大成功 ${greatSuccesses} 次` : ''}${failures ? `，失败 ${failures} 次` : ''}。`,
            `⑤ 结果：${outcome}`,
            `⑥ 熟练度：炼金熟练度 +${proficiencyGain}`
        ],
        proficiencyGain,
        progress: next
    };
    result.journalId = await recordAlchemyJournal(connection, characterId, token, snapshot, batchRecords, result);
    await completeCraftRequest(connection, characterId, token, result);
    if (!currentSecondaryShop())
        await achievementAlchemySurprises(connection, characterId, token, roleRows.map(row => row.id).join(':'), successes, exploded, greatSuccesses);
    if (!currentSecondaryShop())
        await achievementAlchemyRecovery(connection, characterId, token, roleRows.map(row => row.id).join(':'), successes, failures);
    if (!currentSecondaryShop())
        recordAchievement(connection, characterId, [
            ...(exploded ? [{ metric: 'ACH_EGG07' }] : []),
            ...(greatSuccesses > 0 ? [{ metric: 'ACH_EGG08', value: greatSuccesses }] : []),
            ...(successes > 0 ? [{ metric: 'ACH_EGG09', distinct: roleRows.map(row => row.id).join(':') }] : [])
        ], 'easter-alchemy:' + token);
    if (!currentSecondaryShop() && successes > 0) {
        const signature = roleRows.map(row => row.id).join(':');
        recordAchievement(connection, characterId, [{ metric: 'ACH_H12' }, { metric: 'ACH_H13', value: successes }, { metric: 'ACH_H14', value: successes }, { metric: 'ACH_END06', value: successes }, { metric: 'ACH_H15' }, { metric: 'ACH_H22', distinct: signature }, { metric: 'ACH_E24', distinct: 'alchemy:' + signature }, ...(greatSuccesses > 0 ? [{ metric: 'ACH_H19' }] : [])], 'alchemy:' + token);
        for (const row of outputRows) {
            const effect = jsonRecord(row.effect_json);
            if (alchemyUtilityOutput(effect))
                recordAchievement(connection, characterId, ['ACH_H18']);
            if (Number(effect.heal) > 0 || Number(effect.healPct) > 0)
                recordAchievement(connection, characterId, ['ACH_H16']);
            if (Number(effect.restoreMp) > 0 || Number(effect.restoreMpPct) > 0)
                recordAchievement(connection, characterId, ['ACH_H17']);
            await achievementItem(connection, characterId, Number(row.id));
        }
        if (snapshot.source === 'journal')
            recordAchievement(connection, characterId, ['ACH_H23']);
        achievementActivity(connection, characterId);
        await achievementSecondary(connection, characterId);
    }
    return result;
});
const finishAlchemyProcessing = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    await connection.execute('UPDATE player_alchemy_sessions SET alchemy_processing_until=NULL WHERE character_id=?', [characterId]);
});
const setAlchemySlots = async (connection, characterId, items) => {
    if (items.length !== 3 || items.some(item => !Number.isInteger(item.id) || item.id < 1 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99))
        throw new Error('这条记录不是三槽炼金，请从个人提纯面板操作。');
    await invalidateCraftRequests(connection, characterId);
    await connection.execute(`INSERT INTO player_alchemy_sessions (character_id,main_item_id,auxiliary_item_id,reagent_item_id,main_quantity,auxiliary_quantity,reagent_quantity,service_mode)
    VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE main_item_id=VALUES(main_item_id),auxiliary_item_id=VALUES(auxiliary_item_id),reagent_item_id=VALUES(reagent_item_id),main_quantity=VALUES(main_quantity),auxiliary_quantity=VALUES(auxiliary_quantity),reagent_quantity=VALUES(reagent_quantity),service_mode=VALUES(service_mode),alchemy_confirmation_expires_at=NULL`, [characterId, ...items.map(item => item.id), ...items.map(item => item.quantity), currentSecondaryShop() ? 'sweetshop' : 'personal']);
};
const alchemyJournalReload = async (qqUserId, journalId) => {
    const journal = await alchemyJournalDetail(qqUserId, journalId);
    await withTransaction(async (connection) => {
        const id = await characterIdFor(connection, qqUserId, true);
        await alchemistProgressFor(connection, id, true);
        await assertAlchemyNotProcessingFor(connection, id, true);
        const missing = [];
        const demand = new Map();
        for (const item of journal.snapshot.ingredients) {
            const old = demand.get(item.id);
            demand.set(item.id, { name: item.name, quantity: (old?.quantity ?? 0) + item.quantity * journal.batches.length });
        }
        for (const [itemId, item] of demand) {
            const [rows] = await connection.execute('SELECT quantity FROM player_inventory WHERE character_id=? AND item_id=? FOR UPDATE', [id, itemId]);
            const gap = item.quantity - Number(rows[0]?.quantity ?? 0);
            if (gap > 0)
                missing.push(`【${item.name}】缺少 ${gap} 份`);
        }
        if (missing.length)
            throw new Error(missing.join('；'));
        await setAlchemySlots(connection, id, journal.snapshot.ingredients.map(item => ({ id: item.id, quantity: item.quantity * journal.batches.length })));
    });
    return executeAlchemy(qqUserId, undefined, 'journal', `来自手记${journalId}：当时炼金师Lv.${journal.snapshot.level}、匠心${journal.snapshot.craftsmanship}%。请按当前条件确认，历史结果不保证重现。${journal.snapshot.version !== alchemyRuleVersion ? '此手记属于旧规则版本。' : ''}`);
};
const randomAlchemyFormula = async (qqUserId, searchToken, replaceToken) => {
    const selected = await withTransaction(async (connection) => {
        const id = await characterIdFor(connection, qqUserId, true);
        const progress = await activeAlchemistProgressFor(connection, qqUserId, id, true);
        await assertAlchemyNotProcessingFor(connection, id, true);
        if (replaceToken) {
            const old = await craftRequestFor(connection, id, 'alchemy', replaceToken);
            if (old.result)
                throw new Error('该炉已经完成，请使用结果底部的继续尝试。');
        }
        const [items] = await connection.execute("SELECT i.id,i.code,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type='material' AND i.item_category IN ('怪材','炼材','锻材','粒子','构件','基材') AND i.code NOT IN ('evolution_catalyst','evolution_stable_medium','sky_dust','automaton_body','pure_soul_trace') AND COALESCE(JSON_EXTRACT(i.effect_json,'$.automatonProduct'),0)=0 ORDER BY i.id FOR UPDATE", [id]);
        const [history] = await connection.execute("SELECT DISTINCT combination_key FROM player_alchemy_journal WHERE character_id=? AND kind<>'purification'", [id]);
        const tried = new Set(history.map(row => String(row.combination_key)));
        const ids = items.map(row => Number(row.id));
        const available = new Map(items.map(row => [Number(row.id), Number(row.quantity)]));
        const resetIds = ['mana_dust', 'herbal_extract', 'magic_unit'].map(code => Number(items.find(item => item.code === code)?.id ?? 0));
        const resetKey = resetIds.join(':');
        if (progress.level < 3 || resetIds.some(itemId => (available.get(itemId) ?? 0) < 3))
            tried.add(resetKey);
        const slotChoice = (choice) => choice.map(id => ({ id, quantity: choice.join(':') === resetKey ? 3 : 1 }));
        const current = await alchemyStateFor(connection, id);
        const currentIds = [current.main_id, current.auxiliary_id, current.reagent_id].map(Number);
        const currentKey = currentIds.join(':');
        if (replaceToken)
            tried.add(currentKey);
        const fingerprint = alchemyFingerprint({ items: items.map(row => [Number(row.id), Number(row.quantity)]), tried: [...tried].sort() });
        let state;
        if (searchToken) {
            const old = await craftRequestFor(connection, id, 'alchemy_search', searchToken);
            if (old.snapshot.fingerprint === fingerprint)
                state = old.snapshot.state;
        }
        if (!state && ids.length)
            for (let retry = 0; retry < 128; retry++) {
                const choice = Array.from({ length: 3 }, () => ids[Math.floor(Math.random() * ids.length)]);
                if (validAlchemyCombination(choice, available) && !tried.has(choice.join(':'))) {
                    await setAlchemySlots(connection, id, slotChoice(choice));
                    return { ready: true };
                }
            }
        const scan = scanAlchemyCombinations(ids, available, tried, state);
        if (!scan.done)
            return { searchToken: await createCraftRequest(connection, id, 'alchemy_search', { fingerprint, state: scan.state, replaceToken }, 10) };
        if (!scan.combination) {
            if (replaceToken && validAlchemyCombination(currentIds, available) && !history.some(row => row.combination_key === currentKey))
                return { ready: true, onlyCurrent: true };
            throw new Error('当前背包中可炼金的材料组合都已尝试过。补充新材料后可以继续探索，也可以从“我的配方”重复炼制。');
        }
        await setAlchemySlots(connection, id, slotChoice(scan.combination));
        return { ready: true };
    });
    return selected.ready ? { ...await executeAlchemy(qqUserId, undefined, 'random'), onlyCurrent: selected.onlyCurrent } : selected;
};

export { acceptAlchemistQuest, activatePersonalAlchemy, activateSweetshopAlchemy, alchemistProgress, alchemistQuest, alchemyFormulaList, alchemyJournalReload, alchemyMaterials, alchemyState, bulkPurificationPreview, cancelAlchemyConfirmation, claimAlchemistQuest, clearAlchemyMaterial, clearPurificationMaterial, deleteAlchemyFormula, executeAlchemy, executeBulkPurification, executePurification, finishAlchemyProcessing, loadAlchemyFormula, purificationMaterials, purificationState, randomAlchemyFormula, renameAlchemyFormula, saveAlchemyFormula, secondaryProfessionCode, selectAlchemyMaterial, selectPurificationMaterial };
