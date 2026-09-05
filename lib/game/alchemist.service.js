import { getPool, withTransaction } from '../database/pool.js';
import { materialValueMultiplierForLevel, purifiedCraftOutputFor } from './monster-crafting-material.service.js';
import { alchemyOutputsAtOrBelow } from './alchemy-catalog.js';
import { requireNpcAtCurrentPosition } from './adventure.service.js';
import { secondaryProfessionMaxLevel, secondaryProfessionBonus, secondaryProfessionProficiencyRequired } from './secondary-profession.js';

const questCode = 'alchemist_apprentice';
const sweetshopCode = 'alchemy_sweetshop';
const sweetshopAlchemistLevel = 3;
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
const purificationOutputFor = (code) => purifiedCraftOutputFor(code) ?? purificationRecipes[code];
const purificationSuccess = (bonus) => Math.min(95, 60 + bonus);
const proficiencyRequired = secondaryProfessionProficiencyRequired;
const alchemistProgressFor = async (connection, characterId, lock = false) => {
    const [characters] = await connection.execute(`SELECT secondary_profession_code FROM characters WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    if (characters[0]?.secondary_profession_code !== 'alchemist')
        throw new Error('只有炼金师可以进行提纯或炼金。');
    await connection.execute('INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,\'alchemist\',1,0)', [characterId]);
    const [rows] = await connection.execute(`SELECT level,proficiency FROM player_secondary_professions WHERE character_id=?${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    const level = Math.min(secondaryProfessionMaxLevel, Math.max(1, Number(rows[0]?.level ?? 1)));
    const proficiency = level >= secondaryProfessionMaxLevel ? 0 : Number(rows[0]?.proficiency ?? 0);
    return { level, proficiency, required: proficiencyRequired(level), bonus: secondaryProfessionBonus(level), serviceMode: 'personal' };
};
const activeAlchemistProgressFor = async (connection, qqUserId, characterId, lock = false) => {
    const [sessions] = await connection.execute(`SELECT service_mode FROM player_alchemy_sessions WHERE character_id=?${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    if (sessions[0]?.service_mode === 'sweetshop') {
        await requireNpcAtCurrentPosition(qqUserId, sweetshopCode);
        return { level: sweetshopAlchemistLevel, proficiency: 0, required: proficiencyRequired(sweetshopAlchemistLevel), bonus: secondaryProfessionBonus(sweetshopAlchemistLevel), serviceMode: 'sweetshop' };
    }
    return alchemistProgressFor(connection, characterId, lock);
};
const addAlchemistProficiency = async (connection, qqUserId, characterId, amount = 1) => {
    const current = await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    if (current.serviceMode === 'sweetshop')
        return current;
    let level = current.level;
    let proficiency = level >= secondaryProfessionMaxLevel ? 0 : current.proficiency + Math.max(0, Math.round(amount));
    while (level < secondaryProfessionMaxLevel && proficiency >= proficiencyRequired(level)) {
        proficiency -= proficiencyRequired(level);
        level += 1;
    }
    if (level >= secondaryProfessionMaxLevel)
        proficiency = 0;
    await connection.execute('UPDATE player_secondary_professions SET level=?,proficiency=? WHERE character_id=?', [level, proficiency, characterId]);
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
    await alchemistProgressFor(connection, characterId, true);
    await connection.execute("INSERT INTO player_alchemy_sessions (character_id,service_mode) VALUES (?,'personal') ON DUPLICATE KEY UPDATE service_mode='personal'", [characterId]);
});
const activateSweetshopAlchemy = async (qqUserId) => {
    await requireNpcAtCurrentPosition(qqUserId, sweetshopCode);
    await withTransaction(async (connection) => {
        const characterId = await characterIdFor(connection, qqUserId, true);
        await assertAlchemyNotProcessingFor(connection, characterId, true);
        await connection.execute("INSERT INTO player_alchemy_sessions (character_id,service_mode) VALUES (?,'sweetshop') ON DUPLICATE KEY UPDATE service_mode='sweetshop'", [characterId]);
    });
};
const purificationMaterials = async (qqUserId) => {
    const pool = await getPool();
    const characterId = await characterIdFor(pool, qqUserId);
    await activeAlchemistProgressFor(pool, qqUserId, characterId);
    const [rows] = await pool.execute(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type='material' ORDER BY i.id`, [characterId]);
    return rows.map(row => ({ id: Number(row.id), code: row.code, name: row.name, category: row.item_category, quantity: Number(row.quantity), outputCode: purificationOutputFor(row.code) })).filter((row) => Boolean(row.outputCode));
};
const bulkPurificationItemsFor = async (connection, characterId, lock = false) => {
    const [rows] = await connection.execute(`SELECT i.id,i.code,i.name,i.item_category,i.effect_json,pi.quantity
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type='material'
      AND JSON_EXTRACT(i.effect_json,'$.monster_craft_material') IS NOT NULL
      AND JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.material_monster_class')) IN ('normal','large')
    ORDER BY i.item_category,i.name,i.id${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    return rows.map(row => ({ id: Number(row.id), code: row.code, name: row.name, item_category: row.item_category, quantity: Number(row.quantity), effect_json: row.effect_json, outputCode: purificationOutputFor(row.code) }))
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
const rolledPurificationQuantity = (quantity, success, valueMultiplier = 1) => {
    let output = 0;
    const baseOutput = Math.floor(valueMultiplier);
    const extraChance = valueMultiplier - baseOutput;
    for (let index = 0; index < quantity; index += 1) {
        if (Math.random() * 100 >= success)
            continue;
        output += baseOutput;
        if (Math.random() < extraChance)
            output += 1;
    }
    return output;
};
const bulkPurificationPreview = async (qqUserId) => {
    const pool = await getPool();
    const characterId = await characterIdFor(pool, qqUserId);
    const progress = await activeAlchemistProgressFor(pool, qqUserId, characterId);
    const items = await bulkPurificationItemsFor(pool, characterId);
    const outputs = await bulkPurificationOutputsFor(pool, items);
    const success = purificationSuccess(progress.bonus);
    return { success, materials: items.map(item => ({ ...item, outputName: outputs.get(item.outputCode)?.name ?? '未知产物', expectedOutput: item.quantity * success / 100 * materialValueMultiplierForLevel(materialLevelFor(item)) })) };
};
const purificationState = async (qqUserId) => {
    const pool = await getPool();
    const characterId = await characterIdFor(pool, qqUserId);
    const progress = await activeAlchemistProgressFor(pool, qqUserId, characterId);
    const [rows] = await pool.execute(`SELECT s.purification_item_id AS item_id,s.purification_quantity AS quantity,i.code,i.name,i.item_category,i.effect_json,pi.quantity AS available FROM player_alchemy_sessions s LEFT JOIN item_definitions i ON i.id=s.purification_item_id LEFT JOIN player_inventory pi ON pi.character_id=s.character_id AND pi.item_id=s.purification_item_id WHERE s.character_id=?`, [characterId]);
    const row = rows[0];
    const amount = Number(row?.quantity ?? 0);
    const outputCode = row?.code ? purificationOutputFor(row.code) : undefined;
    const [outputs] = outputCode ? await pool.execute('SELECT name FROM item_definitions WHERE code=? LIMIT 1', [outputCode]) : [[]];
    const success = purificationSuccess(progress.bonus);
    const sourceLevel = row ? materialLevelFor({ code: row.code ?? '', name: row.name ?? '', item_category: row.item_category, effect_json: row.effect_json }) : 1;
    return { progress, itemId: row?.item_id ? Number(row.item_id) : null, name: row?.name ?? null, quantity: amount, available: Number(row?.available ?? 0), outputCode, outputName: outputs[0]?.name ?? null, expectedOutput: amount * success / 100 * materialValueMultiplierForLevel(sourceLevel), success };
};
const selectPurificationMaterial = async (qqUserId, itemId, quantity = 10) => withTransaction(async (connection) => {
    if (!Number.isInteger(quantity) || quantity < 1)
        throw new Error('提纯数量至少为 1。');
    const characterId = await characterIdFor(connection, qqUserId, true);
    await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    const [items] = await connection.execute(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id=? FOR UPDATE`, [characterId, itemId]);
    const item = items[0];
    if (!item || !purificationOutputFor(item.code))
        throw new Error('该材料暂时无法提纯。');
    if (quantity > Number(item.quantity))
        throw new Error(`材料不足，最多可放入 ${item.quantity} 份。`);
    await connection.execute('INSERT INTO player_alchemy_sessions (character_id,purification_item_id,purification_quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE purification_item_id=VALUES(purification_item_id),purification_quantity=VALUES(purification_quantity)', [characterId, itemId, quantity]);
});
const clearPurificationMaterial = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    await connection.execute('UPDATE player_alchemy_sessions SET purification_item_id=NULL,purification_quantity=0 WHERE character_id=?', [characterId]);
});
const executePurification = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    const progress = await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    const [rows] = await connection.execute(`SELECT i.id,i.code,i.name,i.item_category,i.effect_json,pi.quantity,s.purification_quantity AS selected FROM player_alchemy_sessions s JOIN player_inventory pi ON pi.character_id=s.character_id AND pi.item_id=s.purification_item_id JOIN item_definitions i ON i.id=s.purification_item_id WHERE s.character_id=? FOR UPDATE`, [characterId]);
    const item = rows[0];
    const selected = Number(item?.selected ?? 0);
    const outputCode = item ? purificationOutputFor(item.code) : undefined;
    if (!item || !outputCode || selected < 1 || Number(item.quantity) < selected)
        throw new Error('请先放入足够的可提纯材料。');
    const success = purificationSuccess(progress.bonus);
    const outputQuantity = rolledPurificationQuantity(selected, success, materialValueMultiplierForLevel(materialLevelFor(item)));
    const succeeded = outputQuantity > 0;
    await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [selected, characterId, item.id]);
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, item.id]);
    const [outputs] = await connection.execute('SELECT id,name FROM item_definitions WHERE code=? LIMIT 1 FOR UPDATE', [outputCode]);
    if (!outputs[0])
        throw new Error('精材料配方尚未初始化，请重启机器人。');
    if (succeeded) {
        await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [characterId, outputs[0].id, outputQuantity]);
        await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, outputs[0].id]);
    }
    await connection.execute('UPDATE player_alchemy_sessions SET purification_item_id=NULL,purification_quantity=0 WHERE character_id=?', [characterId]);
    const proficiencyGain = Math.round(selected * mapMaterialProficiencyGain(item));
    const next = await addAlchemistProficiency(connection, qqUserId, characterId, proficiencyGain);
    return { succeeded, inputName: item.name, inputQuantity: selected, outputName: outputs[0].name, outputQuantity, success, proficiencyGain, progress: next };
});
const executeBulkPurification = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    const progress = await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    const items = await bulkPurificationItemsFor(connection, characterId, true);
    if (!items.length)
        throw new Error('背包中没有可一键提纯的普通或大型怪材。');
    const outputs = await bulkPurificationOutputsFor(connection, items);
    const success = purificationSuccess(progress.bonus);
    const results = new Map();
    let inputQuantity = 0;
    let proficiencyGain = 0;
    for (const item of items) {
        const output = outputs.get(item.outputCode);
        if (!output)
            throw new Error('精材料配方尚未初始化，请重启机器人。');
        const outputQuantity = rolledPurificationQuantity(item.quantity, success, materialValueMultiplierForLevel(materialLevelFor(item)));
        inputQuantity += item.quantity;
        proficiencyGain += item.quantity * mapMaterialProficiencyGain(item);
        await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [item.quantity, characterId, item.id]);
        if (outputQuantity > 0) {
            await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [characterId, output.id, outputQuantity]);
            await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, output.id]);
            const current = results.get(item.outputCode) ?? { name: output.name, quantity: 0 };
            current.quantity += outputQuantity;
            results.set(item.outputCode, current);
        }
    }
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND quantity<=0', [characterId]);
    await connection.execute(`UPDATE player_alchemy_sessions SET purification_item_id=NULL,purification_quantity=0 WHERE character_id=? AND purification_item_id IN (${items.map(() => '?').join(',')})`, [characterId, ...items.map(item => item.id)]);
    const earnedProficiency = Math.round(proficiencyGain);
    const next = await addAlchemistProficiency(connection, qqUserId, characterId, earnedProficiency);
    return { inputQuantity, outputQuantity: [...results.values()].reduce((total, result) => total + result.quantity, 0), outputs: [...results.values()], success, proficiencyGain: earnedProficiency, progress: next };
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
const selectDynamicOutput = (main, auxiliary, reagent) => {
    const nonParticlePrimary = [main, auxiliary].filter(item => !item.isParticle);
    const effectiveLevel = nonParticlePrimary.length ? Math.min(...nonParticlePrimary.map(item => item.sourceLevel)) : 1;
    const materialTier = nonParticlePrimary.length ? Math.min(...nonParticlePrimary.map(item => item.tier)) : 1;
    const maxTier = maxOutputTierFor(effectiveLevel);
    const tags = [...main.tags, ...auxiliary.tags, ...reagent.tags];
    const candidates = alchemyOutputsAtOrBelow(effectiveLevel).filter(output => outputTierValue(output.tier) <= maxTier);
    if (!candidates.length)
        throw new Error('当前材料尚不能稳定形成炼金成品。');
    return randomWeighted(candidates, output => {
        const tagScore = output.tags.reduce((score, tag) => score + tags.filter(value => value === tag).length * 4, 0);
        const levelScore = output.level === 1 ? 1 : 2 + Math.max(0, 3 - Math.abs(output.level - effectiveLevel) / 10);
        const rarityScore = 1 + Math.max(0, outputTierValue(output.tier) - 1) * Math.max(0, materialTier - 1) * .25;
        return (1 + tagScore + levelScore) * rarityScore;
    });
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
    await connection.execute(`INSERT INTO player_alchemy_sessions (character_id,${column},${quantityColumn},alchemy_confirmation_expires_at) VALUES (?,?,?,NULL) ON DUPLICATE KEY UPDATE ${column}=VALUES(${column}),${quantityColumn}=VALUES(${quantityColumn}),alchemy_confirmation_expires_at=NULL`, [characterId, item.id, quantity]);
    return item.name;
});
const clearAlchemyMaterial = async (qqUserId, role) => withTransaction(async (connection) => { const characterId = await characterIdFor(connection, qqUserId, true); await activeAlchemistProgressFor(connection, qqUserId, characterId, true); await assertAlchemyNotProcessingFor(connection, characterId, true); const column = role === 'main' ? 'main_item_id' : role === 'auxiliary' ? 'auxiliary_item_id' : 'reagent_item_id'; const quantityColumn = role === 'main' ? 'main_quantity' : role === 'auxiliary' ? 'auxiliary_quantity' : 'reagent_quantity'; await connection.execute(`UPDATE player_alchemy_sessions SET ${column}=NULL,${quantityColumn}=1,alchemy_confirmation_expires_at=NULL WHERE character_id=?`, [characterId]); });
const alchemyMaterials = async (qqUserId) => {
    const pool = await getPool();
    const characterId = await characterIdFor(pool, qqUserId);
    await activeAlchemistProgressFor(pool, qqUserId, characterId);
    const [rows] = await pool.execute('SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type=\'material\' ORDER BY i.item_category,i.name,i.id', [characterId]);
    return rows.map(row => ({ id: Number(row.id), code: row.code, name: row.name, category: row.item_category, quantity: Number(row.quantity) }));
};
const formulaAdjectives = ['晨露', '星辉', '月影', '琥珀', '雾语', '绯红', '晴空', '秘仪'];
const formulaName = (mainName) => `${formulaAdjectives[Math.floor(Math.random() * formulaAdjectives.length)]}·${mainName}试作配方`;
const saveAlchemyFormula = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    const progress = await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    const state = await alchemyStateFor(connection, characterId);
    if (!state.main_id || !state.main_name)
        throw new Error('请先选择主材后再保存配方。');
    const [counts] = await connection.execute('SELECT COUNT(*) AS total FROM player_alchemy_formulas WHERE character_id=? FOR UPDATE', [characterId]);
    const capacity = Math.max(1, Number(progress.level)) * 3;
    if (Number(counts[0]?.total ?? 0) >= capacity)
        throw new Error(`快捷配方已满（${counts[0]?.total ?? 0}/${capacity}）。提升炼金师等级可增加上限。`);
    const name = formulaName(state.main_name);
    const [result] = await connection.execute('INSERT INTO player_alchemy_formulas (character_id,name,main_item_id,auxiliary_item_id,reagent_item_id) VALUES (?,?,?,?,?)', [characterId, name, state.main_id, state.auxiliary_id, state.reagent_id]);
    return { id: Number(result.insertId), name, capacity };
});
const alchemyFormulaList = async (qqUserId, page = 1, keyword = '') => {
    const pool = await getPool();
    const characterId = await characterIdFor(pool, qqUserId);
    const progress = await activeAlchemistProgressFor(pool, qqUserId, characterId);
    const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM player_alchemy_formulas WHERE character_id=? AND name LIKE ?', [characterId, `%${keyword}%`]);
    const total = Number(countRows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / 5));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const [rows] = await pool.execute(`SELECT f.id,f.name,f.main_item_id,f.auxiliary_item_id,f.reagent_item_id,m.name AS main_name,a.name AS auxiliary_name,r.name AS reagent_name
    FROM player_alchemy_formulas f JOIN item_definitions m ON m.id=f.main_item_id LEFT JOIN item_definitions a ON a.id=f.auxiliary_item_id LEFT JOIN item_definitions r ON r.id=f.reagent_item_id
    WHERE f.character_id=? AND f.name LIKE ? ORDER BY f.created_at,f.id LIMIT ? OFFSET ?`, [characterId, `%${keyword}%`, 5, (currentPage - 1) * 5]);
    return { capacity: Math.max(1, Number(progress.level)) * 3, total, page: currentPage, totalPages, keyword, formulas: rows.map(row => ({ id: Number(row.id), name: row.name, mainName: row.main_name, auxiliaryName: row.auxiliary_name, reagentName: row.reagent_name })) };
};
const renameAlchemyFormula = async (qqUserId, formulaId, name) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
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
    await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    await assertAlchemyNotProcessingFor(connection, characterId, true);
    const [rows] = await connection.execute('SELECT f.id,f.name,f.main_item_id,f.auxiliary_item_id,f.reagent_item_id,m.name AS main_name,a.name AS auxiliary_name,r.name AS reagent_name FROM player_alchemy_formulas f JOIN item_definitions m ON m.id=f.main_item_id LEFT JOIN item_definitions a ON a.id=f.auxiliary_item_id LEFT JOIN item_definitions r ON r.id=f.reagent_item_id WHERE f.id=? AND f.character_id=? FOR UPDATE', [formulaId, characterId]);
    const formula = rows[0];
    if (!formula)
        throw new Error('未找到该快捷配方。');
    await connection.execute('INSERT INTO player_alchemy_sessions (character_id,main_item_id,auxiliary_item_id,reagent_item_id,main_quantity,auxiliary_quantity,reagent_quantity,alchemy_confirmation_expires_at) VALUES (?,?,?,?,1,1,1,NULL) ON DUPLICATE KEY UPDATE main_item_id=VALUES(main_item_id),auxiliary_item_id=VALUES(auxiliary_item_id),reagent_item_id=VALUES(reagent_item_id),main_quantity=1,auxiliary_quantity=1,reagent_quantity=1,alchemy_confirmation_expires_at=NULL', [characterId, formula.main_item_id, formula.auxiliary_item_id, formula.reagent_item_id]);
    return formula.name;
});
const deleteAlchemyFormula = async (qqUserId, formulaId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
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
const executeAlchemy = async (qqUserId, confirmed = false) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    const progress = await activeAlchemistProgressFor(connection, qqUserId, characterId, true);
    const state = await alchemyStateFor(connection, characterId);
    await assertAlchemyNotProcessingFor(connection, characterId, true);
    if (!state.main_id || !state.auxiliary_id || !state.reagent_id)
        throw new Error('请先分别放入主材、辅材与反应剂。');
    const roleRows = [
        { role: '主材', id: Number(state.main_id), quantity: Math.max(1, Number(state.main_quantity)) },
        { role: '辅材', id: Number(state.auxiliary_id), quantity: Math.max(1, Number(state.auxiliary_quantity)) },
        { role: '反应剂', id: Number(state.reagent_id), quantity: Math.max(1, Number(state.reagent_quantity)) }
    ];
    const ids = [...new Set(roleRows.map(row => row.id))];
    const marks = ids.map(() => '?').join(',');
    const [items] = await connection.execute(`SELECT i.id,i.code,i.name,i.item_category,i.effect_json,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id IN (${marks}) AND i.item_type='material' FOR UPDATE`, [characterId, ...ids]);
    const getMaterial = (id) => {
        const item = items.find(row => Number(row.id) === id);
        if (!item)
            throw new Error('选中的材料已不在背包中。');
        return dynamicMaterialFor(item);
    };
    const main = getMaterial(roleRows[0].id);
    const auxiliary = getMaterial(roleRows[1].id);
    const reagent = getMaterial(roleRows[2].id);
    const sourceLevels = [main, auxiliary, reagent].filter(item => !item.isParticle).map(item => item.sourceLevel);
    const levelGap = sourceLevels.length > 1 ? Math.max(...sourceLevels) - Math.min(...sourceLevels) : 0;
    if (levelGap >= 15 && !confirmed) {
        await connection.execute('INSERT INTO player_alchemy_sessions (character_id,alchemy_confirmation_expires_at) VALUES (?,DATE_ADD(NOW(),INTERVAL 2 MINUTE)) ON DUPLICATE KEY UPDATE alchemy_confirmation_expires_at=VALUES(alchemy_confirmation_expires_at)', [characterId]);
        return { needsConfirmation: true };
    }
    if (levelGap >= 15 && confirmed) {
        const expiry = state.confirmation_expires_at ? new Date(state.confirmation_expires_at).getTime() : 0;
        if (!expiry || expiry <= Date.now())
            throw new Error('炼金风险确认已失效，请重新开始炼金。');
    }
    const batches = Math.min(99, ...roleRows.map(row => row.quantity));
    const demands = new Map();
    for (const row of roleRows)
        demands.set(row.id, (demands.get(row.id) ?? 0) + batches);
    if ([...demands.entries()].some(([id, demand]) => Number(items.find(item => Number(item.id) === id)?.quantity ?? 0) < demand))
        throw new Error('放入的材料总数量不足。');
    const sharedTags = main.tags.filter(tag => auxiliary.tags.includes(tag));
    const stability = main.stability + auxiliary.stability + reagent.stability + sharedTags.length * 4 + (reagent.isParticle ? 5 : -5) - (levelGap >= 30 ? 20 : levelGap >= 15 ? 10 : levelGap >= 11 ? 4 : 0);
    const successRate = Math.max(45, Math.min(92, 64 + (progress.level - 1) * 2 + stability));
    const greatRate = Math.max(2, Math.min(18, 3 + (progress.level - 1) * .8 + (reagent.code === 'magic_unit' ? 5 : 0)));
    const converted = particleConversionChance(main, auxiliary) > 0 && (main.isParticle && auxiliary.isParticle || Math.random() * 100 < particleConversionChance(main, auxiliary));
    const produced = new Map();
    let successes = 0;
    let greatSuccesses = 0;
    let failures = 0;
    for (let batch = 0; batch < batches; batch += 1) {
        if (Math.random() * 100 >= successRate) {
            failures += 1;
            continue;
        }
        successes += 1;
        const great = Math.random() * 100 < greatRate;
        if (great)
            greatSuccesses += 1;
        const result = converted ? undefined : selectDynamicOutput(main, auxiliary, reagent);
        const code = converted ? particleOutputCodeFor(main, auxiliary, reagent) : result.code;
        const quantity = great && !converted && outputTierValue(result.tier) <= 2 ? 2 : 1;
        produced.set(code, (produced.get(code) ?? 0) + quantity);
    }
    for (const [id, quantity] of demands)
        await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [quantity, characterId, id]);
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND quantity<=0', [characterId]);
    const codes = [...produced.keys()];
    const outputRows = codes.length ? (await connection.execute(`SELECT id,code,name FROM item_definitions WHERE code IN (${codes.map(() => '?').join(',')}) FOR UPDATE`, codes))[0] : [];
    if (outputRows.length !== codes.length)
        throw new Error('炼金产物尚未初始化，请重启机器人后重试。');
    const outputEntries = [];
    for (const [code, quantity] of produced) {
        const outputRow = outputRows.find(row => row.code === code);
        if (!outputRow)
            continue;
        await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [characterId, outputRow.id, quantity]);
        await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, outputRow.id]);
        outputEntries.push({ name: outputRow.name, quantity });
    }
    await connection.execute('UPDATE player_alchemy_sessions SET alchemy_confirmation_expires_at=NULL WHERE character_id=?', [characterId]);
    const proficiencyGain = alchemyProficiencyGain([main, auxiliary, reagent], batches);
    const next = await addAlchemistProficiency(connection, qqUserId, characterId, proficiencyGain);
    const exploded = failures > 0 && successes === 0 && Math.random() * 100 < Math.max(5, 28 - stability / 2);
    const sourceText = converted ? '粒子在主反应中占据了主导，反应转入粒子转化路线。' : successes ? randomNarrative(alchemyNarrative.success) : exploded ? randomNarrative(alchemyNarrative.explosion) : randomNarrative(alchemyNarrative.failure);
    const outcome = outputEntries.length ? `获得${outputEntries.map(item => `【${item.name}】×${item.quantity}`).join('、')}。` : exploded ? '本次反应发生炸炉，没有留下可用成品。' : '本次反应没有留下可用成品。';
    return {
        succeeded: successes > 0,
        batches,
        successRate,
        greatSuccesses,
        failures,
        outputs: outputEntries,
        stages: [
            `① 主材：投入【${main.name}】×${batches}，${main.tags.join('、')}的性质开始浮现。${randomNarrative(alchemyNarrative.main)}`,
            `② 辅材：投入【${auxiliary.name}】×${batches}，${randomNarrative(alchemyNarrative.auxiliary)}`,
            `③ 反应剂：投入【${reagent.name}】×${batches}，它为坩埚提供了${reagent.isParticle ? '元素定型' : '稳定载体'}。${randomNarrative(alchemyNarrative.reagent)}`,
            `④ 反应：${sourceText} 成功 ${successes}/${batches}${greatSuccesses ? `，其中大成功 ${greatSuccesses} 次` : ''}${failures ? `，失败 ${failures} 次` : ''}。`,
            `⑤ 结果：${outcome}`,
            `⑥ 熟练度：炼金熟练度 +${proficiencyGain}`
        ],
        proficiencyGain,
        progress: next
    };
});
const finishAlchemyProcessing = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    await connection.execute('UPDATE player_alchemy_sessions SET alchemy_processing_until=NULL WHERE character_id=?', [characterId]);
});

export { acceptAlchemistQuest, activatePersonalAlchemy, activateSweetshopAlchemy, alchemistProgress, alchemistQuest, alchemyFormulaList, alchemyMaterials, alchemyState, bulkPurificationPreview, cancelAlchemyConfirmation, claimAlchemistQuest, clearAlchemyMaterial, clearPurificationMaterial, deleteAlchemyFormula, executeAlchemy, executeBulkPurification, executePurification, finishAlchemyProcessing, loadAlchemyFormula, purificationMaterials, purificationState, renameAlchemyFormula, saveAlchemyFormula, secondaryProfessionCode, selectAlchemyMaterial, selectPurificationMaterial };
