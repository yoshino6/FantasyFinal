import { randomUUID } from 'node:crypto';
import { achievementItem, achievementActivity, achievementSecondaryLevel } from './achievement-hooks.js';
import { recordAchievement } from './achievement-events.js';
import { takeMaterialCosts, recoveryMaterialBudget, addMaterialCosts, scaleMaterialCost } from './talent-material-recovery.js';
import { fixedTalentMaterials, consumeTalentMaterial, recordTalentProduct } from './talent-production.js';
import { ownedTalent, readTalentData } from './talent-data.js';
import { talentProductionRecord, talentProficiency } from './talent-rewards.js';
import { currentSecondaryShop, shopProficiency, awardSecondaryShopCraftAffinity, shopProgressFor } from './secondary-shop-context.js';
import { consumeInventory, grantInventory, productionBinding } from './inventory-binding.js';
import { withTransaction, getPool } from '../database/pool.js';
import { recordCharacterOperation } from './character-operation.service.js';
import { secondaryProfessionMaxLevel, secondaryProfessionBonus, secondaryProfessionProficiencyRequired } from './secondary-profession.js';
import { deconstructionBlockReason, deconstructionProfileFor, deconstructionPreviewFor, isRareParticle, rollDeconstructionProfile, deconstructionProficiencyFor, deconstructionPreviewText } from './deconstruction-profiles.js';
import { constructionRecipes as constructionRecipes$1, courseDeviceBlueprints, constructionRecipeByCode as constructionRecipeByCode$1, affinityBlueprints, requiresConstructionBlueprint, constructionGapFor, constructionRefundRate, constructionSuccessRate, blueprintRecipeCode } from './deconstructor-catalog.js';

const questCode = 'deconstructor_apprentice';
const characterIdFor = async (connection, qqUserId, lock = false) => {
    const [rows] = await connection.execute(`SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
    if (!rows[0])
        throw new Error('请先注册角色。');
    return Number(rows[0].id);
};
const deconstructorQuest = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    const [rows] = await connection.execute(`SELECT q.status,c.secondary_profession_code FROM characters c LEFT JOIN player_side_quests q ON q.character_id=c.id AND q.quest_code=? WHERE c.id=? FOR UPDATE`, [questCode, characterId]);
    const [items] = await connection.execute(`SELECT pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code='beast_core' FOR UPDATE`, [characterId]);
    const cores = Number(items[0]?.quantity ?? 0);
    const completed = rows[0]?.status === 'accepted' && cores >= 1;
    if (completed) {
        await connection.execute('UPDATE player_side_quests SET status=\'completed\',completed_at=NOW() WHERE character_id=? AND quest_code=? AND status=\'accepted\'', [characterId, questCode]);
        await recordCharacterOperation(connection, { characterId, kind: 'profession.deconstructor_quest_completed', source: { system: 'player_side_quests', id: characterId, step: 'deconstructor_apprentice_completed' }, actorRole: 'system', outcome: '完成', summary: '备齐唯薇安要求的兽核', detail: { questCode, cores } });
    }
    const status = completed ? 'completed' : rows[0]?.secondary_profession_code === 'deconstructor' ? 'claimed' : rows[0]?.status === 'claimed' ? 'none' : rows[0]?.status ?? 'none';
    return { status, cores };
});
const acceptDeconstructorQuest = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    const [rows] = await connection.execute('SELECT secondary_profession_code,level FROM characters WHERE id=? FOR UPDATE', [characterId]);
    if (Number(rows[0]?.level ?? 0) < 10)
        throw new Error('secondary_profession_level_required');
    if (rows[0]?.secondary_profession_code && rows[0].secondary_profession_code !== 'deconstructor')
        throw new Error('你已经拥有其他副职业，无法再选择解构师。');
    if (rows[0]?.secondary_profession_code === 'deconstructor')
        return;
    const [before] = await connection.execute('SELECT status FROM player_side_quests WHERE character_id=? AND quest_code=? FOR UPDATE', [characterId, questCode]);
    await connection.execute('INSERT INTO player_side_quests (character_id,quest_code) VALUES (?,?) ON DUPLICATE KEY UPDATE status=\'accepted\',completed_at=NULL,claimed_at=NULL', [characterId, questCode]);
    if (before[0]?.status !== 'accepted')
        await recordCharacterOperation(connection, { characterId, kind: 'profession.deconstructor_quest_accepted', source: { system: 'side_quest_change', id: randomUUID(), step: 'accepted' }, outcome: '接取', summary: '接取解构师转职委托', detail: { questCode } });
});
const claimDeconstructorQuest = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    const [quests] = await connection.execute('SELECT status FROM player_side_quests WHERE character_id=? AND quest_code=? FOR UPDATE', [characterId, questCode]);
    if (quests[0]?.status !== 'completed')
        throw new Error('任务尚未完成。');
    const [cores] = await connection.execute(`SELECT pi.item_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code='beast_core' FOR UPDATE`, [characterId]);
    if (!cores[0] || Number(cores[0].quantity) < 1)
        throw new Error('兽核已不在背包中。');
    const [gifts] = await connection.execute('SELECT id FROM item_definitions WHERE code=\'xiaowei_gift\' LIMIT 1', []);
    if (!gifts[0])
        throw new Error('唯薇安的赠礼尚未配置，请重启机器人以初始化物品数据。');
    const [characters] = await connection.execute('SELECT name FROM characters WHERE id=?', [characterId]);
    await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [characterId, cores[0].item_id]);
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, cores[0].item_id]);
    await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [characterId, gifts[0].id]);
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, gifts[0].id]);
    await connection.execute('UPDATE player_side_quests SET status=\'claimed\',claimed_at=NOW() WHERE character_id=? AND quest_code=?', [characterId, questCode]);
    await connection.execute('UPDATE characters SET secondary_profession_code=\'deconstructor\' WHERE id=?', [characterId]);
    await connection.execute('INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,\'deconstructor\',1,0)', [characterId]);
    recordAchievement(connection, characterId, ['ACH_A05']);
    await recordCharacterOperation(connection, { characterId, kind: 'profession.deconstructor_claimed', source: { system: 'player_side_quests', id: characterId, step: 'deconstructor_claimed' }, outcome: '转职', summary: '完成解构师转职并领取唯薇安的赠礼', detail: { questCode, consumedItemId: Number(cores[0].item_id), consumedQuantity: 1, giftItemId: Number(gifts[0].id) } });
    return { name: '解构师', characterName: characters[0]?.name ?? '冒险者', giftName: '唯薇安的赠礼' };
});
const deconstructorProgress = async (qqUserId) => {
    const pool = await getPool();
    const characterId = await characterIdFor(pool, qqUserId);
    const shop = await shopProgressFor(pool, characterId, 'deconstructor');
    if (shop)
        return shop;
    const [rows] = await pool.execute('SELECT level,proficiency FROM player_secondary_professions WHERE character_id=? AND profession_code=\'deconstructor\' LIMIT 1', [characterId]);
    const level = Math.min(secondaryProfessionMaxLevel, Math.max(1, Number(rows[0]?.level ?? 1)));
    const proficiency = level >= secondaryProfessionMaxLevel ? 0 : Number(rows[0]?.proficiency ?? 0);
    const required = secondaryProfessionProficiencyRequired(level);
    return { level, proficiency, required, bonus: secondaryProfessionBonus(level) };
};
const constructionCategories = ['基材', '构件', '异械'];
const legacyConstructionRecipes = [
    { code: 'magic_gear', name: '魔力齿轮', description: '以土元素微尘为骨架、魔力微弧为驱动的基础传动基材。', ingredients: [{ code: 'metal_element_dust', quantity: 4 }, { code: 'magic_unit', quantity: 2 }, { code: 'thunder_element_dust', quantity: 3 }], successRate: 90, outputType: 'material', itemCategory: '基材', constructionCategory: '基材' },
    { code: 'energy_core', name: '能量中枢', description: '将余烬与水元素微粒压缩为持续供能的基础中枢。', ingredients: [{ code: 'energy_ember', quantity: 5 }, { code: 'magic_unit', quantity: 2 }, { code: 'water_element_dust', quantity: 2 }], successRate: 90, outputType: 'material', itemCategory: '基材', constructionCategory: '基材' },
    { code: 'flesh_atrium', name: '血肉心房', description: '模拟生物循环结构制成的活性基材。', ingredients: [{ code: 'blood_residue', quantity: 5 }, { code: 'energy_ember', quantity: 3 }, { code: 'wood_element_dust', quantity: 1 }], successRate: 90, outputType: 'material', itemCategory: '基材', constructionCategory: '基材' },
    { code: 'flame_matrix', name: '炽焰矩阵', description: '将火元素规整成稳定热源的基础基材。', ingredients: [{ code: 'fire_element_dust', quantity: 4 }, { code: 'metal_element_dust', quantity: 2 }, { code: 'energy_ember', quantity: 3 }], successRate: 90, outputType: 'material', itemCategory: '基材', constructionCategory: '基材' },
    { code: 'frost_prism', name: '凝霜棱晶', description: '可将冰与水元素折射为稳定冷却回路的基材。', ingredients: [{ code: 'ice_element_dust', quantity: 4 }, { code: 'water_element_dust', quantity: 3 }, { code: 'magic_unit', quantity: 2 }], successRate: 90, outputType: 'material', itemCategory: '基材', constructionCategory: '基材' },
    { code: 'shadow_filament', name: '暗影导丝', description: '由暗元素编织而成、能传递细微魔力信号的基材。', ingredients: [{ code: 'dark_element_dust', quantity: 4 }, { code: 'metal_element_dust', quantity: 3 }, { code: 'magic_unit', quantity: 2 }], successRate: 90, outputType: 'material', itemCategory: '基材', constructionCategory: '基材' },
    { code: 'luminous_lens', name: '光导晶片', description: '将光元素收束为清晰视界的透明基材。', ingredients: [{ code: 'light_element_dust', quantity: 4 }, { code: 'water_element_dust', quantity: 3 }, { code: 'magic_unit', quantity: 2 }], successRate: 90, outputType: 'material', itemCategory: '基材', constructionCategory: '基材' },
    { code: 'interference_shell', name: '阻扰外壳', description: '隔离外部魔力扰动、保护内部组件的异械构件。', ingredients: [{ code: 'magic_gear', quantity: 2 }, { code: 'flesh_atrium', quantity: 1 }, { code: 'shadow_filament', quantity: 2 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
    { code: 'low_power_standard_lens', name: '低倍标准镜', description: '提供基础视距与对焦能力的标准光学构件。', ingredients: [{ code: 'luminous_lens', quantity: 2 }, { code: 'frost_prism', quantity: 2 }, { code: 'magic_gear', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
    { code: 'calibration_module', name: '校准模块', description: '负责修正视线偏差与锁定轨迹的精密构件。', ingredients: [{ code: 'magic_gear', quantity: 2 }, { code: 'energy_core', quantity: 2 }, { code: 'shadow_filament', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
    { code: 'mana_power_source', name: '魔力源能', description: '向异械稳定输送魔力的供能构件。', ingredients: [{ code: 'energy_core', quantity: 2 }, { code: 'flame_matrix', quantity: 2 }, { code: 'flesh_atrium', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
    { code: 'kinetic_frame', name: '动能骨架', description: '将力量与动作稳定传导的强化构件。', ingredients: [{ code: 'magic_gear', quantity: 2 }, { code: 'flesh_atrium', quantity: 2 }, { code: 'flame_matrix', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
    { code: 'pulse_regulator', name: '脉冲调节器', description: '以循环脉冲校准器械响应的精密构件。', ingredients: [{ code: 'energy_core', quantity: 2 }, { code: 'frost_prism', quantity: 1 }, { code: 'luminous_lens', quantity: 2 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
    { code: 'palm_weave', name: '掌心织片', description: '能贴合掌心起伏、传递细微动作的柔性构件。', ingredients: [{ code: 'flesh_atrium', quantity: 2 }, { code: 'shadow_filament', quantity: 1 }, { code: 'luminous_lens', quantity: 1 }, { code: 'frost_prism', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
    { code: 'finger_actuator', name: '指节驱动器', description: '嵌入指节位置的微型传动构件，可让动作更迅疾地传达。', ingredients: [{ code: 'magic_gear', quantity: 2 }, { code: 'energy_core', quantity: 1 }, { code: 'flesh_atrium', quantity: 1 }, { code: 'flame_matrix', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
    { code: 'force_feedback_ring', name: '力反馈环', description: '回传出力变化的环形构件，用于细微调整发力节奏。', ingredients: [{ code: 'magic_gear', quantity: 1 }, { code: 'energy_core', quantity: 2 }, { code: 'frost_prism', quantity: 1 }, { code: 'luminous_lens', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
    { code: 'pressure_buckle', name: '压感扣具', description: '能辨识握力与接触变化的扣具，适合装配在手部异械上。', ingredients: [{ code: 'shadow_filament', quantity: 2 }, { code: 'flesh_atrium', quantity: 2 }, { code: 'luminous_lens', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
    { code: 'auxiliary_aiming_scope', name: '辅助瞄准镜', description: '镜片会自行微调焦距，似乎能让视线与目标轨迹更容易重合。', ingredients: [{ code: 'interference_shell', quantity: 1 }, { code: 'low_power_standard_lens', quantity: 1 }, { code: 'calibration_module', quantity: 1 }, { code: 'mana_power_source', quantity: 1 }], successRate: 20, outputType: 'equipment', itemCategory: '异械', constructionCategory: '异械', blueprintCode: 'auxiliary_aiming_scope_blueprint', effect: { actualHitRatePct: 8 } },
    { code: 'muscle_pacer', name: '肌肉起搏器', description: '脉冲会刺激肌肉在出手时爆发更强力量，但过度校正也可能让动作失去细微的准度。', ingredients: [{ code: 'kinetic_frame', quantity: 1 }, { code: 'pulse_regulator', quantity: 1 }, { code: 'force_feedback_ring', quantity: 1 }, { code: 'mana_power_source', quantity: 1 }], successRate: 20, outputType: 'equipment', itemCategory: '异械', constructionCategory: '异械', blueprintCode: 'muscle_pacer_blueprint', effect: { actualHitRatePct: -6, physicalSkillDamagePct: 6 } },
    { code: 'critical_glove', name: '刻薄手套', description: '手套会强行锁定最锐利的攻击节奏，代价是每次爆发都难以维持完整的后续力道。', ingredients: [{ code: 'finger_actuator', quantity: 2 }, { code: 'palm_weave', quantity: 2 }, { code: 'force_feedback_ring', quantity: 1 }, { code: 'pressure_buckle', quantity: 1 }], successRate: 20, outputType: 'equipment', itemCategory: '异械', constructionCategory: '异械', blueprintCode: 'critical_glove_blueprint', effect: { forceCrit: true, criticalFinalDamagePct: -50 } },
    { code: 'mana_accumulator', name: '魔力积蓄仪', description: '它会将魔力压入更深的回路中，施术前的准备感变得明显，但成型后的术式也更加危险。', ingredients: [{ code: 'mana_power_source', quantity: 2 }, { code: 'pulse_regulator', quantity: 2 }, { code: 'interference_shell', quantity: 1 }], successRate: 20, outputType: 'equipment', itemCategory: '异械', constructionCategory: '异械', blueprintCode: 'mana_accumulator_blueprint', effect: { magicChantBonus: 1, magicSkillDamagePct: 60 } },
    { code: 'demon_breaker_teleporter', name: '破魔传送器', description: '可撕开旧式结界缝隙的便携装置。它的回路十分复杂，唯有持有图纸才能稳定完成构造。', ingredients: [{ code: 'mana_power_source', quantity: 2 }, { code: 'calibration_module', quantity: 2 }, { code: 'shadow_filament', quantity: 3 }, { code: 'luminous_lens', quantity: 2 }], successRate: 20, outputType: 'consumable', itemCategory: '特殊', constructionCategory: '异械', blueprintCode: 'demon_breaker_teleporter_blueprint' }
];
new Map(legacyConstructionRecipes.map(recipe => [recipe.code, recipe]));
const constructionRecipes = constructionRecipes$1;
const constructionRecipeByCode = constructionRecipeByCode$1;
const constructedMaterialRecipes = new Map(constructionRecipes.filter(recipe => recipe.outputType === 'material').map(recipe => [recipe.code, recipe]));
const isDeconstructable = (item) => constructedMaterialRecipes.has(item.code) || Boolean(deconstructionProfileFor(item));
const deconstructionMapMaterialGain = (item) => {
    const constructed = constructedMaterialRecipes.get(item.code);
    if (constructed)
        return constructed.constructionCategory === '构件' ? 3 : 2;
    const profile = deconstructionProfileFor(item);
    return profile ? deconstructionProficiencyFor(profile) : 0;
};
const constructionProficiencyGain = (category) => ({ '基材': 5, '构件': 10, '异械': 20 }[category]);
const categoryType = { 装备: 'equipment', 道具: 'consumable', 材料: 'material' };
const requiredFor = secondaryProfessionProficiencyRequired;
const deconstructorProgressFor = async (connection, characterId, lock = false) => {
    const shop = await shopProgressFor(connection, characterId, 'deconstructor');
    if (shop)
        return shop;
    const [characters] = await connection.execute(`SELECT secondary_profession_code FROM characters WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    if (characters[0]?.secondary_profession_code !== 'deconstructor')
        throw new Error('只有解构师可以进行分解。');
    await connection.execute("INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,'deconstructor',1,0)", [characterId]);
    const [rows] = await connection.execute(`SELECT level,proficiency FROM player_secondary_professions WHERE character_id=? AND profession_code='deconstructor'${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    const level = Math.min(secondaryProfessionMaxLevel, Math.max(1, Number(rows[0]?.level ?? 1)));
    const proficiency = level >= secondaryProfessionMaxLevel ? 0 : Number(rows[0]?.proficiency ?? 0);
    return { level, proficiency, required: requiredFor(level), bonus: secondaryProfessionBonus(level) };
};
const addDeconstructorProficiency = async (connection, characterId, gained = 1) => {
    const current = await deconstructorProgressFor(connection, characterId, true);
    if (currentSecondaryShop())
        return current;
    gained = await talentProficiency(connection, characterId, gained, { profession: 'deconstructor' });
    let level = current.level;
    let proficiency = level >= secondaryProfessionMaxLevel ? 0 : current.proficiency + Math.max(0, Math.round(gained));
    while (level < secondaryProfessionMaxLevel && proficiency >= requiredFor(level)) {
        proficiency -= requiredFor(level);
        level += 1;
    }
    if (level >= secondaryProfessionMaxLevel)
        proficiency = 0;
    await connection.execute("UPDATE player_secondary_professions SET level=?,proficiency=? WHERE character_id=? AND profession_code='deconstructor'", [level, proficiency, characterId]);
    achievementSecondaryLevel(connection, Number(characterId), level);
    return { level, proficiency, required: requiredFor(level), bonus: secondaryProfessionBonus(level) };
};
const constructionItemRows = async (connection, characterId, codes, lock = false) => {
    const placeholders = codes.map(() => '?').join(',');
    const [rows] = await connection.execute(`
    SELECT i.id,i.code,i.name,i.item_category,i.codex_id,COALESCE(pi.quantity,0) AS quantity,
      EXISTS(SELECT 1 FROM player_item_codex pic WHERE pic.character_id=? AND pic.item_id=i.id) AS unlocked
    FROM item_definitions i LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=?
    WHERE i.code IN (${placeholders})${lock ? ' FOR UPDATE' : ''}
  `, [characterId, characterId, ...codes]);
    return rows;
};
const constructionClosureFor = (recipeCode, result = new Set(), visiting = new Set()) => {
    if (visiting.has(recipeCode))
        return result;
    visiting.add(recipeCode);
    const recipe = constructionRecipeByCode.get(recipeCode);
    if (!recipe)
        return result;
    result.add(recipe.code);
    for (const part of recipe.ingredients)
        if (constructionRecipeByCode.has(part.code))
            constructionClosureFor(part.code, result, visiting);
    return result;
};
const grantBlueprintCodes = async (connection, characterId, blueprintCodes) => {
    const codes = [...new Set(blueprintCodes)];
    if (!codes.length)
        return;
    const placeholders = codes.map(() => '?').join(',');
    const [definitions] = await connection.execute(`SELECT id FROM item_definitions WHERE code IN (${placeholders})`, codes);
    for (const definition of definitions) {
        await connection.execute('INSERT IGNORE INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1)', [characterId, definition.id]);
        await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, definition.id]);
    }
};
const unlockedConstructionCodes = async (connection, characterId, lock = false) => {
    const suffix = lock ? ' FOR UPDATE' : '';
    const [ownedBlueprintRows] = await connection.execute(`SELECT i.code FROM player_inventory pi
    JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.code REGEXP '_blueprint$'${suffix}`, [characterId]);
    const unlockedCodes = new Set();
    const [autoUnlock] = await connection.execute("SELECT level FROM player_secondary_professions WHERE character_id=? AND profession_code='deconstructor'", [characterId]);
    if (!currentSecondaryShop() && Number(autoUnlock[0]?.level ?? 0) >= 4)
        for (const code of ['kinetic_frame', 'servo_bundle', 'memory_polymer', 'shadow_filament', 'pulse_regulator', 'luminous_lens', 'energy_core'])
            constructionClosureFor(code, unlockedCodes);
    for (const row of ownedBlueprintRows) {
        const recipeCode = blueprintRecipeCode(row.code);
        if (recipeCode)
            constructionClosureFor(recipeCode, unlockedCodes);
    }
    return unlockedCodes;
};
const claimVivianCourseBlueprints = async (qqUserId) => withTransaction(async (connection) => {
    const characterId = await characterIdFor(connection, qqUserId, true);
    const [characters] = await connection.execute('SELECT secondary_profession_code FROM characters WHERE id=? FOR UPDATE', [characterId]);
    if (characters[0]?.secondary_profession_code !== 'deconstructor')
        return { level: 0, awarded: [], highestLevel: 0, affinityAwarded: [] };
    const progress = await deconstructorProgressFor(connection, characterId, true);
    const course = courseDeviceBlueprints.filter(([requiredLevel]) => progress.level >= requiredLevel);
    const codes = course.map(([, code]) => constructionRecipeByCode.get(code)?.blueprintCode).filter((code) => Boolean(code));
    const rows = codes.length ? await constructionItemRows(connection, characterId, codes, true) : [];
    const owned = new Set(rows.filter(row => Number(row.quantity) > 0).map(row => row.code));
    const awarded = course.flatMap(([requiredLevel, code]) => {
        const recipe = constructionRecipeByCode.get(code);
        if (!recipe || owned.has(recipe.blueprintCode))
            return [];
        return [{ level: requiredLevel, code, name: recipe.name }];
    });
    await grantBlueprintCodes(connection, characterId, awarded.map(item => constructionRecipeByCode.get(item.code).blueprintCode));
    const [affinityRows] = await connection.execute('SELECT affinity FROM player_npc_affinity WHERE character_id=? AND npc_code=\'oddworkshop\' LIMIT 1 FOR UPDATE', [characterId]);
    const affinityAwarded = [];
    for (const unlock of affinityBlueprints) {
        const recipe = constructionRecipeByCode.get(unlock.code);
        if (recipe && progress.level >= unlock.level && Number(affinityRows[0]?.affinity ?? 0) >= unlock.affinity && !owned.has(recipe.blueprintCode)) {
            await grantBlueprintCodes(connection, characterId, [recipe.blueprintCode]);
            affinityAwarded.push(recipe.name);
        }
    }
    if (awarded.length || affinityAwarded.length)
        await recordCharacterOperation(connection, { characterId, kind: 'profession.deconstructor_blueprints_learned', source: { system: 'vivian_course', id: randomUUID(), step: 'blueprints_granted' }, outcome: '领得', summary: `从唯薇安处领得 ${awarded.length + affinityAwarded.length} 张异械图纸`, detail: { level: progress.level, course: awarded, affinity: affinityAwarded } });
    return { level: progress.level, awarded, highestLevel: awarded.length ? awarded[awarded.length - 1].level : 0, affinityAwarded };
});
const constructionRecipesFor = async (qqUserId) => {
    const pool = await getPool();
    const characterId = await characterIdFor(pool, qqUserId);
    const progress = await deconstructorProgressFor(pool, characterId);
    const codes = [...new Set(constructionRecipes.flatMap(recipe => [recipe.code, ...recipe.ingredients.map(ingredient => ingredient.code), ...(recipe.blueprintCode ? [recipe.blueprintCode] : [])]))];
    const rows = await constructionItemRows(pool, characterId, codes);
    const items = new Map(rows.map(row => [row.code, row]));
    const unlockedCodes = await unlockedConstructionCodes(pool, characterId);
    return constructionRecipes.map(recipe => ({
        ...recipe,
        codexId: items.get(recipe.code)?.codex_id ?? null,
        unlocked: unlockedCodes.has(recipe.code),
        blueprintOwned: requiresConstructionBlueprint(recipe) ? Number(items.get(recipe.blueprintCode)?.quantity ?? 0) > 0 : true,
        blueprintName: requiresConstructionBlueprint(recipe) ? items.get(recipe.blueprintCode)?.name ?? recipe.blueprintCode : null,
        blueprintCodexId: requiresConstructionBlueprint(recipe) ? items.get(recipe.blueprintCode)?.codex_id ?? null : null,
        gap: constructionGapFor(recipe, progress.level),
        refundRate: constructionRefundRate(constructionGapFor(recipe, progress.level)),
        successRate: constructionSuccessRate(recipe.recommendedSecondaryLevel, progress.level),
        ingredients: recipe.ingredients.map(ingredient => ({ ...ingredient, name: items.get(ingredient.code)?.name ?? ingredient.code, codexId: items.get(ingredient.code)?.codex_id ?? null, owned: Number(items.get(ingredient.code)?.quantity ?? 0) }))
    }));
};
const constructItemFor = async (connection, qqUserId, recipeCode) => {
    const recipe = constructionRecipeByCode.get(recipeCode);
    if (!recipe)
        throw new Error('未找到该构造配方。');
    const characterId = await characterIdFor(connection, qqUserId, true);
    const progress = await deconstructorProgressFor(connection, characterId, true);
    const unlockedCodes = await unlockedConstructionCodes(connection, characterId, true);
    if (!unlockedCodes.has(recipe.code))
        throw new Error('尚未获得能解锁该异械构造链的图纸。');
    const codes = [...recipe.ingredients.map(ingredient => ingredient.code), ...(requiresConstructionBlueprint(recipe) ? [recipe.blueprintCode] : [])];
    const rows = await constructionItemRows(connection, characterId, codes, true);
    const materials = new Map(rows.map(row => [row.code, row]));
    if (requiresConstructionBlueprint(recipe)) {
        const blueprint = materials.get(recipe.blueprintCode);
        if (!blueprint || Number(blueprint.quantity) < 1)
            throw new Error('缺少该异械的图纸。');
    }
    const paymentMaterials = await fixedTalentMaterials(connection, characterId, recipe.ingredients, recipe.ingredients.slice(1).map(i => i.code), !currentSecondaryShop());
    const talent = await ownedTalent(connection, characterId), data = await readTalentData(connection, characterId);
    const risk = !currentSecondaryShop() && talent?.number === 'H09' && data.settings.riskCraft === true;
    const [talentOutputs] = await connection.execute('SELECT rarity FROM item_definitions WHERE code=?', [recipe.code]);
    if (risk && (talentOutputs[0]?.rarity !== '普通' || paymentMaterials[0]?.item.rarity !== '普通'))
        throw new Error('孤注制作仅可用于普通主材、普通产物配方。');
    const ingredientRecovery = new Map();
    const ingredientBindings = new Map(), paidQuantities = new Map();
    const usedBinding = { unbound: 0, trade: 0, personal: 0 };
    for (const ingredient of paymentMaterials) {
        const payment = await consumeTalentMaterial(connection, characterId, Number(ingredient.item.id), ingredient.quantity, 'craft', !currentSecondaryShop()), used = payment.binding;
        ingredientRecovery.set(Number(ingredient.item.id), payment.recovery);
        ingredientBindings.set(Number(ingredient.item.id), used);
        paidQuantities.set(Number(ingredient.item.id), payment.paid);
        for (const key of ['unbound', 'trade', 'personal'])
            usedBinding[key] += used[key];
    }
    const gap = constructionGapFor(recipe, progress.level);
    const refundRate = risk ? 0 : constructionRefundRate(gap);
    const successRate = constructionSuccessRate(recipe.recommendedSecondaryLevel, progress.level) * (risk ? .7 : 1);
    const success = Math.random() * 100 < successRate;
    const proficiencyGain = shopProficiency(constructionProficiencyGain(recipe.constructionCategory));
    if (!currentSecondaryShop())
        await talentProductionRecord(connection, characterId, `construction:${recipe.code}`, success ? proficiencyGain : 0);
    const next = await addDeconstructorProficiency(connection, characterId, success ? proficiencyGain : Math.ceil(proficiencyGain * .5));
    if (!success) {
        const refunded = [];
        for (const ingredient of paymentMaterials) {
            const material = ingredient.item;
            let quantity = 0;
            for (let index = 0; index < Number(paidQuantities.get(Number(material.id)) ?? 0); index += 1)
                if (Math.random() < refundRate)
                    quantity += 1;
            if (!quantity)
                continue;
            const consumed = ingredientBindings.get(Number(material.id));
            const personal = Math.min(consumed.personal, quantity), trade = Math.min(consumed.trade, quantity - personal);
            const cost = ingredientRecovery.get(Number(material.id));
            if (cost?.quantity)
                await addMaterialCosts(connection, 'stock', characterId, Number(material.id), scaleMaterialCost(cost, quantity / Number(paidQuantities.get(Number(material.id)))));
            await grantInventory(connection, characterId, Number(material.id), { personal, trade, unbound: quantity - personal - trade });
            refunded.push({ name: material.name, quantity });
        }
        await recordCharacterOperation(connection, { characterId, kind: 'craft.construction_failed', source: { system: 'construction_attempt', id: randomUUID(), step: 'failed' }, outcome: '失败', summary: `构造${recipe.name}失败`, detail: { recipeCode: recipe.code, recipeName: recipe.name, refunded } });
        await awardSecondaryShopCraftAffinity(connection, characterId);
        return { success: false, recipe, successRate, refundRate, refunded, proficiencyGain: Math.ceil(proficiencyGain * .5), progress: next };
    }
    const [definitions] = await connection.execute('SELECT id,name FROM item_definitions WHERE code=? FOR UPDATE', [recipe.code]);
    const output = definitions[0];
    if (!output)
        throw new Error('构造产物尚未初始化，请重启机器人后重试。');
    if (recipe.outputType === 'device') {
        const [instance] = await connection.execute('INSERT INTO player_item_instances (character_id,item_id,effect_json,bound_kind) VALUES (?,?,?,?)', [characterId, output.id, JSON.stringify(recipe.effect ?? {}), usedBinding.personal ? 'personal' : 'none']);
        if (risk)
            for (let i = 0; i < 3; i++)
                await connection.execute('INSERT INTO player_item_instances(character_id,item_id,effect_json,bound_kind) VALUES (?,?,?,?)', [characterId, output.id, JSON.stringify(recipe.effect ?? {}), usedBinding.personal ? 'personal' : 'none']);
        await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, output.id]);
        if (!currentSecondaryShop())
            achievementActivity(connection, characterId);
        await (await import('./finance-settlement.js')).recordFinanceSignal(connection, { sourceKey: `construction:${instance.insertId}`, factionCode: 'deconstructors_association', characterId: Number(characterId), eventType: 'deconstruct.crafted', sourceType: 'deconstruct_craft', score: 2 });
        await recordCharacterOperation(connection, { characterId, kind: 'craft.constructed_device', source: { system: 'construction_instance', id: Number(instance.insertId), step: 'constructed' }, outcome: '制成', summary: `构造${output.name}`, detail: { recipeCode: recipe.code, recipeName: recipe.name, outputItemId: Number(output.id), outputName: output.name, instanceId: Number(instance.insertId), outputCount: risk ? 4 : 1 }, scoreKey: `construction:${recipe.code}` });
        await awardSecondaryShopCraftAffinity(connection, characterId);
        return { success: true, recipe, successRate, outputName: output.name, instanceId: Number(instance.insertId), proficiencyGain, progress: next };
    }
    await grantInventory(connection, characterId, Number(output.id), productionBinding(usedBinding, risk ? 4 : 1, true));
    if (recipe.outputType === 'material')
        await addMaterialCosts(connection, 'stock', characterId, Number(output.id), { quantity: risk ? 4 : 1, paid: Object.fromEntries(paymentMaterials.map(m => [String(m.item.code), Number(paidQuantities.get(Number(m.item.id)) ?? 0)])), children: Object.fromEntries(paymentMaterials.filter(m => ingredientRecovery.get(Number(m.item.id))?.quantity).map(m => [String(m.item.code), ingredientRecovery.get(Number(m.item.id))])) });
    if (!currentSecondaryShop())
        await recordTalentProduct(connection, characterId, Number(output.id), risk ? 4 : 1);
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, output.id]);
    if (recipe.code === 'demon_breaker_teleporter') {
        const { completeDungeonSecretPurchase } = await import('./dungeon-quest.service.js');
        await completeDungeonSecretPurchase(connection, characterId);
    }
    if (!currentSecondaryShop())
        achievementActivity(connection, characterId);
    await (await import('./finance-settlement.js')).recordFinanceSignal(connection, { sourceKey: `construction:${randomUUID()}`, factionCode: 'deconstructors_association', characterId: Number(characterId), eventType: 'deconstruct.crafted', sourceType: 'deconstruct_craft', score: 2 });
    await recordCharacterOperation(connection, { characterId, kind: 'craft.constructed_material', source: { system: 'construction_batch', id: randomUUID(), step: 'constructed' }, outcome: '制成', summary: `构造${output.name} ×${risk ? 4 : 1}`, detail: { recipeCode: recipe.code, recipeName: recipe.name, outputItemId: Number(output.id), outputName: output.name, outputCount: risk ? 4 : 1 }, scoreKey: `construction:${recipe.code}` });
    await awardSecondaryShopCraftAffinity(connection, characterId);
    return { success: true, recipe, successRate, outputName: output.name, proficiencyGain, progress: next };
};
const constructItem = async (qqUserId, recipeCode) => withTransaction(connection => constructItemFor(connection, qqUserId, recipeCode));
const deconstructionItems = async (qqUserId, category = '材料') => {
    const pool = await getPool();
    const characterId = await characterIdFor(pool, qqUserId);
    const progress = await deconstructorProgressFor(pool, characterId);
    const itemType = categoryType[category];
    if (!itemType)
        throw new Error('请选择装备、道具或材料分类。');
    const includeNaturalHerb = category === '材料' ? 1 : 0;
    const [rows] = await pool.execute(`SELECT i.id,i.code,i.name,i.description,i.item_category,i.item_type,i.trade_price,i.rarity,i.effect_json,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND (i.item_type=? OR (?=1 AND i.code='healing_herb')) ORDER BY i.item_category,i.name,i.id`, [characterId, itemType, includeNaturalHerb]);
    const bonusMultiplier = 1 + progress.bonus / 100;
    const items = rows.map(row => {
        const constructed = constructedMaterialRecipes.has(row.code);
        const profile = constructed ? null : deconstructionProfileFor(row);
        const canDeconstruct = constructed || Boolean(profile);
        const notice = row.code === 'sky_dust' ? '用途提醒：天空粉尘可用于世界感悟。'
            : row.item_category === 'Boss部件' ? '用途提醒：该材料也可用于史诗锻造。' : '';
        return {
            id: Number(row.id), code: row.code, name: row.name, category: row.item_category, quantity: Number(row.quantity), canDeconstruct,
            preview: constructed ? '按实际投入逐份回收；光、暗元素低概率保留' : profile ? deconstructionPreviewText(profile, bonusMultiplier) : '',
            notice, blockReason: canDeconstruct ? '' : deconstructionBlockReason(row) ?? '该物品暂时无法分解。'
        };
    });
    return items.sort((left, right) => Number(right.canDeconstruct) - Number(left.canDeconstruct));
};
const deconstructItems = async (qqUserId, itemId, quantity = 1) => withTransaction(async (connection) => {
    if (!Number.isInteger(itemId) || itemId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 9999)
        throw new Error('请输入 1 至 9999 的分解数量。');
    const characterId = await characterIdFor(connection, qqUserId, true);
    const progress = await deconstructorProgressFor(connection, characterId, true);
    const [rows] = await connection.execute(`SELECT i.id,i.code,i.name,i.description,i.item_category,i.item_type,i.trade_price,i.rarity,i.effect_json,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id=? FOR UPDATE`, [characterId, itemId]);
    const item = rows[0];
    if (!item)
        throw new Error('该物品不在背包中。');
    if (!isDeconstructable(item))
        throw new Error(deconstructionBlockReason(item) ?? '该物品暂时无法分解。');
    if (Number(item.quantity) < quantity)
        throw new Error(`物品不足，最多可分解 ${item.quantity} 份。`);
    const outputs = new Map();
    const add = (code, amount) => outputs.set(code, (outputs.get(code) ?? 0) + amount);
    const bonusMultiplier = 1 + progress.bonus / 100;
    const constructed = constructedMaterialRecipes.get(item.code);
    const profile = constructed ? null : deconstructionProfileFor(item);
    if (!constructed && !profile)
        throw new Error('该物品暂时无法分解。');
    const materialCost = constructed ? await takeMaterialCosts(connection, 'stock', characterId, itemId, quantity) : undefined;
    const recoveryBudget = constructed && materialCost ? recoveryMaterialBudget(materialCost, quantity, constructed.ingredients) : [];
    const potentialCodes = constructed
        ? recoveryBudget.filter(ingredient => ingredient.quantity > 0).map(ingredient => ingredient.code)
        : deconstructionPreviewFor(profile, bonusMultiplier).filter(output => output.expected > 0).map(output => output.code);
    const codes = [...new Set(potentialCodes)];
    let definitions = [];
    if (codes.length) {
        const [rows] = await connection.execute(`SELECT id,code,name FROM item_definitions WHERE code IN (${codes.map(() => '?').join(',')}) FOR UPDATE`, codes);
        if (rows.length !== codes.length)
            throw new Error('分解产物配置不完整，本次没有消耗物品。');
        definitions = rows;
    }
    if (constructed && materialCost) {
        const recovery = constructed.constructionCategory === '构件' ? .65 : .60;
        const ordinaryRecovery = Math.min(1, recovery * bonusMultiplier);
        for (const ingredient of recoveryBudget) {
            const chance = isRareParticle(ingredient.code) ? Math.min(.15, .25 * ordinaryRecovery) : ordinaryRecovery;
            for (let index = 0; index < ingredient.quantity; index += 1)
                if (Math.random() < chance)
                    add(ingredient.code, 1);
        }
    }
    else {
        for (let index = 0; index < quantity; index += 1) {
            for (const [code, amount] of rollDeconstructionProfile(profile, bonusMultiplier))
                add(code, amount);
        }
    }
    const deconstructedBinding = await consumeInventory(connection, characterId, Number(item.id), quantity);
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, item.id]);
    const results = [];
    for (const definition of definitions) {
        const amount = outputs.get(definition.code) ?? 0;
        if (amount <= 0)
            continue;
        const child = materialCost?.children?.[definition.code], paid = materialCost?.paid[definition.code];
        if (child && paid)
            await addMaterialCosts(connection, 'stock', characterId, Number(definition.id), scaleMaterialCost(child, Math.min(1, amount / paid)));
        await grantInventory(connection, characterId, Number(definition.id), productionBinding(deconstructedBinding, amount, false));
        await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, definition.id]);
        if (!currentSecondaryShop()) {
            await achievementItem(connection, characterId, Number(definition.id));
            if (!constructed && ['wood', 'metal', 'water', 'ice', 'dark', 'fire', 'thunder', 'light', 'wind'].some(e => definition.code === e + '_element_dust'))
                recordAchievement(connection, characterId, [{ metric: 'ACH_J21', distinct: definition.code }]);
        }
        results.push({ name: definition.name, quantity: amount });
    }
    const proficiencyGain = shopProficiency(Math.round(quantity * deconstructionMapMaterialGain(item)));
    const next = await addDeconstructorProficiency(connection, characterId, proficiencyGain);
    if (!constructed && results.length && !currentSecondaryShop())
        recordAchievement(connection, characterId, [{ metric: 'ACH_EGG11', distinct: String(itemId) }, { metric: 'ACH_J20' }, ...(item.item_type === 'material' ? [{ metric: 'ACH_J22', distinct: String(itemId) }] : [])]);
    if (results.length)
        await (await import('./finance-settlement.js')).recordFinanceSignal(connection, { sourceKey: `deconstruct:${randomUUID()}`, factionCode: 'deconstructors_association', characterId: Number(characterId), eventType: 'deconstruct.processed', sourceType: 'deconstruct_craft', score: 1 });
    await recordCharacterOperation(connection, { characterId, kind: results.length ? 'craft.deconstructed' : 'craft.deconstruct_empty', source: { system: 'deconstruction_batch', id: randomUUID(), step: 'settled' }, outcome: results.length ? '分解完成' : '无可用产物', summary: `分解${item.name} ×${quantity}`, detail: { inputItemId: Number(item.id), inputCode: item.code, inputName: item.name, inputQuantity: quantity, results }, scoreKey: `deconstruct:${item.code}` });
    await awardSecondaryShopCraftAffinity(connection, characterId);
    return { inputName: item.name, inputQuantity: quantity, results, proficiencyGain, progress: next };
});

export { acceptDeconstructorQuest, claimDeconstructorQuest, claimVivianCourseBlueprints, constructItem, constructItemFor, constructionCategories, constructionRecipesFor, deconstructItems, deconstructionItems, deconstructorProgress, deconstructorQuest };
