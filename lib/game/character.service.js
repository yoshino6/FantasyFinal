import { updateAchievementState } from './achievement-state.js';
import { STAT_BALANCE_VERSION, playerGrowthShares } from './growth-rules.js';
import { armorPanelPercent } from './armor-class.js';
import { armorSetFromRows } from './armor-set.js';
import { randomUUID } from 'node:crypto';
import { getPool, withTransaction } from '../database/pool.js';
import { SESSION_TTL_MINUTES, calculateDerivedStats, equipmentQualityMultiplier, staminaMaxForRealm, virtualEquipmentStats, STAMINA_RECOVERY_MS } from './constants.js';
import { homeRestRecoveryBonus } from './home.service.js';
import { weaponMasteryBonusesFor } from './weapon-mastery.service.js';
import { attributes } from './types.js';
import { recordSkillPointChange, resetSkillPointAllocation } from './skill-point-ledger.service.js';
import { repairEvolutionProgress, evolutionStatBonuses } from './evolution.service.js';
import { registeredAdvancedProfessionByCode, cachedAdvancedPassiveEffectFor } from './advanced-profession.config.js';
import { epicLoadoutFor } from './epic-equipment.service.js';
import { panelPercentKeys, calculatePanelStats } from './panel-stat-formula.js';
import './opening-content.js';
import { talentCode, talentDefinitions } from './talent.config.js';
import { applyTalentPanel } from './talent-data.js';
import { chooseOpeningSpawn, openingWorldFor } from './opening-state.js';
import { grantOpeningItem } from './opening.service.js';
import { flushAchievements, achievementStatBonus } from './achievement.service.js';
import { recordAchievement, takeAchievementEvents } from './achievement-events.js';

const elements = ['水', '火', '土', '木', '风', '冰', '雷', '光', '暗'];
const randomBalancedElements = () => {
    const values = elements.map(() => randomInRange(-10, 10));
    let remainder = values.reduce((sum, value) => sum + value, 0);
    while (remainder) {
        const index = randomInRange(0, values.length - 1);
        if (remainder > 0 && values[index] > -10) {
            values[index]--;
            remainder--;
        }
        if (remainder < 0 && values[index] < 10) {
            values[index]++;
            remainder++;
        }
    }
    return Object.fromEntries(elements.map((element, index) => [element, values[index]]));
};
const randomInRange = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const distribute = (total, precision = 1) => {
    const units = Math.round(total / precision);
    const values = attributes.map(() => 1);
    for (let remaining = units - attributes.length; remaining > 0; remaining--)
        values[randomInRange(0, values.length - 1)]++;
    return Object.fromEntries(attributes.map((key, index) => [key, values[index] * precision]));
};
const finalAttributes = (row) => Object.fromEntries(attributes.map(key => [key, Number(row[key] ?? 0) + Number(row[`${key}_growth`] ?? row[`${key}Growth`] ?? 0) * playerGrowthShares(Number(row.level ?? 1))]));
const jsonRecord = (value) => {
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
const armorClassDefenseMultiplier = (_subtype, _key) => 1;
const withEquipmentStats = async (connection, characterId, base, evolutionBonus = {}, independentPercent = [], neutralFood = false, offhandMultiplier = .5) => {
    const [rows] = await connection.execute(`SELECT COALESCE(ii.effect_json,i.effect_json) AS effect_json,COALESCE(ii.quality,100) AS quality,pe.slot,i.item_category,i.weapon_type
    FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id
    LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id
    WHERE pe.character_id=?`, [characterId]);
    const [foodRows] = await connection.execute('SELECT buff_json FROM player_food_buffs WHERE character_id=? AND expires_at>NOW()', [characterId]);
    if (neutralFood)
        for (const row of foodRows) {
            const effect = jsonRecord(row.buff_json);
            if (effect.__talentFoodBase)
                row.buff_json = Number(effect.__talentFoodExpires ?? Infinity) > Date.now() ? effect.__talentFoodBase : {};
        }
    const effects = [...rows.map(row => ({ effect: jsonRecord(row.effect_json), scale: equipmentQualityMultiplier(Number(row.quality)) * (row.slot === 'offhand' ? offhandMultiplier : 1) })), ...foodRows.map(row => ({ effect: jsonRecord(row.buff_json), scale: 1 }))];
    const flat = (key) => effects.reduce((total, entry) => total + Number(entry.effect[key] ?? 0) * entry.scale, 0);
    const percent = Object.fromEntries(Object.values(panelPercentKeys).map(key => [key, Number(evolutionBonus[key] ?? 0) + rows.reduce((sum, row) => sum + Number(jsonRecord(row.effect_json)[key] ?? 0) * equipmentQualityMultiplier(Number(row.quality)) * (row.slot === 'offhand' ? offhandMultiplier : 1), 0)]));
    const flatStats = Object.fromEntries(Object.keys(panelPercentKeys).map(key => [key, flat(key)]));
    const foodPercent = foodRows.map(row => Object.fromEntries(Object.values(panelPercentKeys).map(key => [key, Number(jsonRecord(row.buff_json)[key] ?? 0)])));
    const stats = calculatePanelStats(base, flatStats, percent, [...foodPercent, ...independentPercent, armorSetFromRows(rows)?.panelPercent ?? {}, armorPanelPercent(rows)]);
    return stats;
};
const virtualNpcTier = (npcCode) => {
    if (!npcCode)
        return null;
    if (['npc_forest_warrior', 'npc_forest_mage', 'npc_forest_priest'].includes(npcCode))
        return 'elite';
    return 'large';
};
const withVirtualNpcEquipment = (stats, level, npcCode) => {
    const tier = virtualNpcTier(npcCode);
    if (!tier)
        return stats;
    const virtual = virtualEquipmentStats(level, tier, stats.physicalAttack, stats.magicAttack, undefined, 'resident');
    return Object.fromEntries(Object.keys(stats).map(key => [key, Math.floor(stats[key] + virtual[key])]));
};
const equipmentExtraAttributes = async (connection, characterId) => {
    const [rows] = await connection.execute(`SELECT COALESCE(ii.effect_json,i.effect_json) AS effect_json,COALESCE(ii.quality,100) AS quality
    FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id
    LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id
    WHERE pe.character_id=?`, [characterId]);
    const [deviceRows] = await connection.execute(`SELECT COALESCE(ii.effect_json,i.effect_json) AS effect_json,100 AS quality
    FROM player_active_devices ad JOIN player_item_instances ii ON ii.id=ad.instance_id AND ii.character_id=ad.character_id
    JOIN item_definitions i ON i.id=ii.item_id WHERE ad.character_id=? AND i.item_type='device'`, [characterId]);
    const effects = [...rows, ...deviceRows];
    const keys = ['damageBonusPct', 'damageReductionPct', 'chantReduction', 'magicChantBonus', 'manaCostReduction', 'ignoreDefensePct', 'lifestealPct', 'magicDamagePct', 'physicalDamageReductionPct', 'magicDamageReductionPct', 'hpRegenPct', 'mpRegenPct', 'minimumHitRatePct', 'actualHitRatePct', 'physicalActualHitRatePct', 'physicalSkillDamagePct', 'magicSkillDamagePct', 'lightSkillBonusPct', 'criticalDamageBonusPct', 'physicalCriticalFinalDamagePct'];
    return Object.fromEntries(keys.map(key => [key, Math.round(effects.reduce((total, row) => total + Number(jsonRecord(row.effect_json)[key] ?? 0) * (key === 'damageBonusPct' || key === 'damageReductionPct' ? 1 : equipmentQualityMultiplier(Number(row.quality))), 0) * 10) / 10]));
};
const effectiveCharacterAttributes = async (connection, character, characterId) => {
    const mastery = await weaponMasteryBonusesFor(connection, characterId);
    const [[timedRows], [equipmentRows]] = await Promise.all([
        connection.execute(`SELECT all_core_attributes_multiplier FROM player_timed_buffs WHERE character_id=? AND buff_code='church_blessing' AND expires_at>NOW() LIMIT 1`, [characterId]),
        connection.execute(`SELECT pe.slot,COALESCE(ii.effect_json,i.effect_json) AS effect_json,COALESCE(ii.quality,100) AS quality
      FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id
      LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id
      WHERE pe.character_id=?`, [characterId])
    ]);
    const multiplier = Number(timedRows[0]?.all_core_attributes_multiplier ?? 1);
    const base = finalAttributes(character);
    const achievementBonus = await achievementStatBonus(connection, characterId);
    for (const key of attributes)
        base[key] += achievementBonus[key] ?? 0;
    const bonus = (key) => equipmentRows.reduce((total, row) => total + Number(jsonRecord(row.effect_json)[key] ?? 0) * equipmentQualityMultiplier(Number(row.quality)) * (row.slot === 'offhand' ? mastery.offhandAttributeMultiplier : 1), 0);
    const percent = (key) => equipmentRows.reduce((total, row) => total + Number(jsonRecord(row.effect_json)[`${key}Pct`] ?? 0) * equipmentQualityMultiplier(Number(row.quality)) * (row.slot === 'offhand' ? mastery.offhandAttributeMultiplier : 1), 0);
    return Object.fromEntries(attributes.map(key => [key, base[key] * multiplier * (1 + percent(key) / 100) + bonus(key)]));
};
const foodBuffText = (effect) => {
    const labels = [['hpPct', '生命上限'], ['mpPct', '魔力上限'], ['physicalAttackPct', '物攻'], ['magicAttackPct', '魔攻'], ['physicalDefensePct', '物防'], ['magicDefensePct', '魔防'], ['accuracyPct', '命中'], ['evasionPct', '闪避'], ['speedPct', '速度']];
    return labels.filter(([key]) => Number(effect[key] ?? 0)).map(([key, label]) => `${label}+${Number(effect[key])}%`).join('｜') || '获得餐食增益';
};
const equipmentCombatNotes = (name, effect) => {
    const notes = [];
    const percent = (key, text) => { const value = Number(effect[key] ?? 0); if (value)
        notes.push(`${name}：${text}${value > 0 ? '+' : ''}${value}%`); };
    percent('damageBonusPct', '最终伤害');
    percent('damageReductionPct', '受到伤害降低');
    percent('physicalDamageReductionPct', '受到物理伤害减免');
    percent('magicDamageReductionPct', '受到魔法伤害减免');
    percent('hpRegenPct', '每回合生命回复');
    percent('mpRegenPct', '每回合魔力回复');
    percent('minimumHitRatePct', '最低实际命中率');
    percent('actualHitRatePct', '实际命中率');
    const chantReduction = Number(effect.chantReduction ?? 0);
    if (chantReduction)
        notes.push(`${name}：所有技能吟唱-${chantReduction}`);
    if (effect.unifyAttack)
        notes.push(`${name}：双攻恒取较高一方`);
    return notes;
};
const activeCharacterEffects = async (connection, characterId) => {
    const [foodRows, battleRows, equipmentRows, timedRows] = await Promise.all([
        connection.execute(`SELECT i.name,b.buff_json,GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),b.expires_at)) AS remaining_seconds FROM player_food_buffs b JOIN item_definitions i ON i.id=b.item_id WHERE b.character_id=? AND b.expires_at>NOW() ORDER BY b.expires_at`, [characterId]),
        connection.execute('SELECT buff_code,remaining_battles FROM player_battle_buffs WHERE character_id=? AND remaining_battles>0 ORDER BY buff_code', [characterId]),
        connection.execute(`SELECT i.name,COALESCE(ii.effect_json,i.effect_json) AS effect_json FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id WHERE pe.character_id=?`, [characterId]),
        connection.execute(`SELECT buff_code,GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),expires_at)) AS remaining_seconds,experience_multiplier,all_core_attributes_multiplier FROM player_timed_buffs WHERE character_id=? AND expires_at>NOW() ORDER BY expires_at`, [characterId])
    ]);
    const activeBuffs = foodRows[0].map(row => `${row.name}：${foodBuffText(jsonRecord(row.buff_json))}｜剩余${Math.max(0, Number(row.remaining_seconds))}秒`);
    for (const row of battleRows[0]) {
        if (row.buff_code === 'minor_experience_elixir')
            activeBuffs.push(`经验秘药（小）：经验获取+25%｜剩余${row.remaining_battles}场战斗`);
        if (row.buff_code === 'minor_luck_elixir')
            activeBuffs.push(`幸运秘药（小）：队伍掉率+25%｜剩余${row.remaining_battles}场战斗`);
        const elixir = /^alchemy_(exp|drop)_(\d+(?:\.\d+)?)$/.exec(row.buff_code);
        if (elixir)
            activeBuffs.push(`${elixir[1] === 'exp' ? '经验秘药：经验获取' : '幸运秘药：队伍材料掉率'}+${elixir[2]}%｜剩余${row.remaining_battles}场战斗`);
    }
    for (const row of timedRows[0]) {
        if (row.buff_code === 'church_blessing')
            activeBuffs.push(`教堂祈福：经验获取+${Math.round((Number(row.experience_multiplier) - 1) * 100)}%｜全六项核心属性+${Math.round((Number(row.all_core_attributes_multiplier) - 1) * 100)}%｜剩余${Math.max(0, Number(row.remaining_seconds))}秒`);
    }
    const combatNotes = equipmentRows[0].flatMap(row => equipmentCombatNotes(row.name, jsonRecord(row.effect_json)));
    return { activeBuffs, combatNotes };
};
const withEquipmentElements = async (connection, characterId, baseMastery, baseResistance, offhandMultiplier = .5) => {
    const [rows] = await connection.execute(`SELECT pe.slot,COALESCE(ii.effect_json,i.effect_json) AS effect_json,COALESCE(ii.quality,100) AS quality
    FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id
    LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id
    WHERE pe.character_id=?`, [characterId]);
    const bonus = (prefix, element) => rows.reduce((total, row) => total + Number(jsonRecord(row.effect_json)[`${prefix}_${element}`] ?? 0) * equipmentQualityMultiplier(Number(row.quality)) * (row.slot === 'offhand' ? offhandMultiplier : 1), 0);
    const value = (base, prefix) => Object.fromEntries(elements.map(element => [element, Math.round((Number(base[element] ?? 0) + bonus(prefix, element)) * 10) / 10]));
    return { mastery: value(baseMastery, 'elementMastery'), resistance: value(baseResistance, 'elementResistance') };
};
const recalculateCharacterStats = async (connection, characterId) => {
    await repairEvolutionProgress(connection, characterId);
    const [rows] = await connection.execute('SELECT * FROM characters WHERE id=? FOR UPDATE', [characterId]);
    const character = rows[0];
    if (!character)
        return;
    await connection.execute(`DELETE pe FROM player_equipment pe
    JOIN item_definitions i ON i.id=pe.item_id
    WHERE pe.character_id=? AND COALESCE(i.required_level,1)>?`, [characterId, Number(character.level)]);
    await connection.execute('DELETE FROM player_food_buffs WHERE character_id=? AND expires_at<=NOW()', [characterId]);
    const [timedRows] = await connection.execute(`SELECT all_core_attributes_multiplier FROM player_timed_buffs WHERE character_id=? AND buff_code='church_blessing' AND expires_at>NOW() LIMIT 1`, [characterId]);
    const attributeMultiplier = Number(timedRows[0]?.all_core_attributes_multiplier ?? 1);
    const baseAttributes = finalAttributes(character);
    const achievementBonus = await achievementStatBonus(connection, characterId);
    for (const key of attributes)
        baseAttributes[key] += achievementBonus[key] ?? 0;
    const masteryBonuses = await weaponMasteryBonusesFor(connection, characterId);
    const [equipmentAttributeRows] = await connection.execute(`SELECT pe.slot,COALESCE(ii.effect_json,i.effect_json) AS effect_json,COALESCE(ii.quality,100) AS quality
    FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id
    LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id
    WHERE pe.character_id=?`, [characterId]);
    const equipmentAttributeBonus = (key) => equipmentAttributeRows.reduce((total, row) => total + Number(jsonRecord(row.effect_json)[key] ?? 0) * equipmentQualityMultiplier(Number(row.quality)) * (row.slot === 'offhand' ? masteryBonuses.offhandAttributeMultiplier : 1), 0);
    const equipmentAttributePercent = (key) => equipmentAttributeRows.reduce((total, row) => total + Number(jsonRecord(row.effect_json)[`${key}Pct`] ?? 0) * equipmentQualityMultiplier(Number(row.quality)) * (row.slot === 'offhand' ? masteryBonuses.offhandAttributeMultiplier : 1), 0);
    const effectiveAttributes = Object.fromEntries(attributes.map(key => [key, baseAttributes[key] * attributeMultiplier * (1 + equipmentAttributePercent(key) / 100) + equipmentAttributeBonus(key)]));
    const evolutionBonus = await evolutionStatBonuses(connection, characterId);
    const [advancedProfessionRows] = await connection.execute('SELECT profession_code FROM player_advanced_professions WHERE character_id=? LIMIT 1', [characterId]);
    const epic = await epicLoadoutFor(connection, characterId);
    const masteryPercent = Object.fromEntries(Object.values(panelPercentKeys).map(key => [key, Number(masteryBonuses[key] ?? 0)]));
    const equippedStats = await withEquipmentStats(connection, characterId, calculateDerivedStats(effectiveAttributes), evolutionBonus, [
        masteryPercent,
        epic.setCode === 'valk_forge_regalia' && epic.setCount >= 3 ? { hpPct: 6 } : {}
    ], false, masteryBonuses.offhandAttributeMultiplier);
    const stats = calculatePanelStats(withVirtualNpcEquipment(equippedStats, Number(character.level), character.npc_code === null ? null : String(character.npc_code)), {}, cachedAdvancedPassiveEffectFor(advancedProfessionRows[0]?.profession_code));
    const baseMastery = jsonRecord(character.element_base_mastery_json ?? character.element_mastery_json);
    const baseResistance = jsonRecord(character.element_base_resistance_json ?? character.element_resistance_json);
    const elemental = await withEquipmentElements(connection, characterId, baseMastery, baseResistance, masteryBonuses.offhandAttributeMultiplier);
    const [talentFood] = await connection.execute("SELECT 1 FROM player_food_buffs WHERE character_id=? AND expires_at>NOW() AND JSON_EXTRACT(buff_json,'$.__talentFoodBase') IS NOT NULL LIMIT 1", [characterId]);
    const neutralStats = talentFood.length ? calculatePanelStats(withVirtualNpcEquipment(await withEquipmentStats(connection, characterId, calculateDerivedStats(effectiveAttributes), evolutionBonus, [masteryPercent, epic.setCode === 'valk_forge_regalia' && epic.setCount >= 3 ? { hpPct: 6 } : {}], true, masteryBonuses.offhandAttributeMultiplier), Number(character.level), character.npc_code === null ? null : String(character.npc_code)), {}, cachedAdvancedPassiveEffectFor(advancedProfessionRows[0]?.profession_code)) : stats;
    await applyTalentPanel(connection, characterId, stats, elemental, neutralStats);
    const targetVersion = character.npc_code ? 4 : STAT_BALANCE_VERSION;
    const migrating = Number(character.stat_formula_version ?? 2) < targetVersion;
    const vital = (current, previousMax, maximum) => migrating
        ? Number(current) <= 0 ? 0 : Math.min(maximum, Math.max(1, Math.floor(Number(current) / Math.max(1, Number(previousMax)) * maximum)))
        : Math.min(Number(current), maximum);
    const hp = vital(character.current_hp, character.hp_max, stats.hpMax), mp = vital(character.current_mp, character.mp_max, stats.mpMax);
    await connection.execute('UPDATE characters SET stat_formula_version=?,hp_max=?,mp_max=?,current_hp=?,current_mp=?,physical_attack=?,magic_attack=?,physical_defense=?,magic_defense=?,accuracy=?,evasion=?,crit_rate_bp=?,crit_damage_bp=?,crit_resist_bp=?,crit_damage_reduction_bp=?,tenacity=?,tenacity_pierce=?,speed=?,element_mastery_json=?,element_resistance_json=? WHERE id=?', [targetVersion, stats.hpMax, stats.mpMax, hp, mp, stats.physicalAttack, stats.magicAttack, stats.physicalDefense, stats.magicDefense, stats.accuracy, stats.evasion, stats.critRateBp, stats.critDamageBp, stats.critResistBp, stats.critDamageReductionBp, stats.tenacity, stats.tenacityPierce, stats.speed, JSON.stringify(elemental.mastery), JSON.stringify(elemental.resistance), characterId]);
};
const refreshCharacterStamina = async (connection, characterId) => {
    const [rows] = await connection.execute('SELECT stamina,realm_stage,stamina_updated_at FROM characters WHERE id=? FOR UPDATE', [characterId]);
    const row = rows[0];
    if (!row)
        throw new Error('未找到角色。');
    const maximum = staminaMaxForRealm(Number(row.realm_stage));
    const current = Math.max(0, Math.min(maximum, Number(row.stamina ?? maximum)));
    const elapsed = Math.max(0, Date.now() - new Date(row.stamina_updated_at).getTime());
    const multiplier = 1 + await homeRestRecoveryBonus(connection, characterId) / 100;
    const restored = Math.floor(elapsed * multiplier / STAMINA_RECOVERY_MS);
    const stamina = Math.min(maximum, current + restored);
    if (stamina !== current || current !== Number(row.stamina) || stamina >= maximum) {
        const consumedElapsed = Math.ceil(restored * STAMINA_RECOVERY_MS / multiplier);
        const updatedAt = stamina >= maximum ? new Date() : new Date(new Date(row.stamina_updated_at).getTime() + consumedElapsed);
        await connection.execute('UPDATE characters SET stamina=?,stamina_updated_at=? WHERE id=?', [stamina, updatedAt, characterId]);
    }
    return { stamina, staminaMax: maximum };
};
const getPlayer = async (connection, qqUserId, nickname) => {
    await connection.execute('INSERT INTO players (qq_user_id, qq_nickname) VALUES (?, ?) ON DUPLICATE KEY UPDATE qq_nickname = COALESCE(VALUES(qq_nickname), qq_nickname)', [qqUserId, nickname ?? null]);
    const [rows] = await connection.execute('SELECT id, status FROM players WHERE qq_user_id = ? FOR UPDATE', [qqUserId]);
    return rows[0];
};
const getSession = async (connection, playerId, lock = false) => {
    const [rows] = await connection.execute(`SELECT id, player_id, stage, expires_at FROM registration_sessions WHERE player_id = ?${lock ? ' FOR UPDATE' : ''}`, [playerId]);
    return rows[0];
};
const completedRegistration = async (connection, playerId) => {
    const [rows] = await connection.execute('SELECT id FROM characters WHERE player_id=? LIMIT 1', [playerId]);
    return rows.length > 0;
};
const hasCharacter = async (qqUserId) => {
    return withTransaction(async (connection) => {
        const player = await getPlayer(connection, qqUserId);
        const [rows] = await connection.execute('SELECT id FROM characters WHERE player_id = ? LIMIT 1', [player.id]);
        return rows.length > 0;
    });
};
const beginRegistration = async (qqUserId, nickname) => withTransaction(async (connection) => {
    const player = await getPlayer(connection, qqUserId, nickname);
    const [characters] = await connection.execute('SELECT id FROM characters WHERE player_id = ? LIMIT 1', [player.id]);
    if (characters.length)
        return { alreadyRegistered: true, stage: null };
    let session = await getSession(connection, player.id, true);
    if (!session || session.expires_at <= new Date()) {
        const id = randomUUID();
        if (session)
            await connection.execute('DELETE FROM registration_scene_records WHERE session_id=?', [session.id]);
        await connection.execute('INSERT INTO registration_sessions (id, player_id, stage, expires_at) VALUES (?, ?, \'story\', DATE_ADD(NOW(), INTERVAL ? MINUTE)) ON DUPLICATE KEY UPDATE id = VALUES(id), stage = VALUES(stage), expires_at = VALUES(expires_at)', [id, player.id, SESSION_TTL_MINUTES]);
        session = await getSession(connection, player.id, true);
    }
    return { alreadyRegistered: false, stage: session.stage };
});
const continueRegistration = async (qqUserId, expectedStage) => withTransaction(async (connection) => {
    const player = await getPlayer(connection, qqUserId);
    const session = await getSession(connection, player.id, true);
    if (!session || session.expires_at <= new Date()) {
        if (await completedRegistration(connection, player.id))
            return 'completed';
        throw new Error('注册会话已过期，请重新发送“注册”。');
    }
    if (expectedStage && expectedStage !== session.stage)
        return session.stage;
    const next = session.stage === 'story' ? 'audience' : session.stage === 'question' ? 'destination' : session.stage === 'danger' ? 'choice' : session.stage;
    if (next === session.stage)
        return session.stage;
    await connection.execute('UPDATE registration_sessions SET stage = ? WHERE id = ?', [next, session.id]);
    return next;
});
const askWhereAmI = async (qqUserId) => withTransaction(async (connection) => {
    const player = await getPlayer(connection, qqUserId);
    const session = await getSession(connection, player.id, true);
    if (!session || session.expires_at <= new Date()) {
        if (await completedRegistration(connection, player.id))
            return 'completed';
        throw new Error('注册会话已过期，请重新发送“注册”。');
    }
    if (session.stage !== 'audience')
        return session.stage;
    await connection.execute('UPDATE registration_sessions SET stage=\'question\' WHERE id=?', [session.id]);
    return 'question';
});
const chooseDestination = async (qqUserId, destination) => withTransaction(async (connection) => {
    const player = await getPlayer(connection, qqUserId);
    const session = await getSession(connection, player.id, true);
    if (!session || session.expires_at <= new Date()) {
        if (await completedRegistration(connection, player.id))
            return 'completed';
        throw new Error('注册会话已过期，请重新发送“注册”。');
    }
    if (session.stage !== 'destination' && session.stage !== 'heaven')
        return session.stage;
    const next = destination === '天堂' ? 'heaven' : 'danger';
    if (next !== session.stage)
        await connection.execute('UPDATE registration_sessions SET stage=? WHERE id=?', [next, session.id]);
    return next;
});
const requireChoiceSession = async (connection, qqUserId) => {
    const player = await getPlayer(connection, qqUserId);
    if (await completedRegistration(connection, player.id))
        return { player, session: null };
    const session = await getSession(connection, player.id, true);
    if (!session || session.stage !== 'choice' || session.expires_at <= new Date())
        throw new Error('请先完成转生剧情，再选择恩赐。');
    return { player, session };
};
const chooseGift = async (qqUserId, giftCode, nickname) => withTransaction(async (connection) => {
    giftCode = talentCode(giftCode) ?? giftCode;
    const gift = talentDefinitions.find(skill => skill.code === giftCode);
    if (!gift)
        throw new Error('神器已经散布世界各地。请从当前天赋目录选择一项恩赐。');
    if (gift.group === '？？？')
        throw new Error('请从当前天赋目录选择一项恩赐。');
    if (!gift.implemented)
        throw new Error('这条特殊成长道路尚未开放，请先选择其余九类天赋。');
    const { player, session } = await requireChoiceSession(connection, qqUserId);
    if (!session)
        return null;
    const allocation = distribute(randomInRange(80, 120));
    const growth = distribute(randomInRange(80, 120) / 10, 0.1);
    const { region, route: openingRoute, x, y, z } = await chooseOpeningSpawn(connection);
    const stats = calculateDerivedStats(allocation);
    const elementMastery = randomBalancedElements();
    const elementResistance = randomBalancedElements();
    const name = `冒险者${(nickname || qqUserId).slice(-6)}`;
    await connection.execute('INSERT INTO characters (stat_formula_version, player_id, name, constitution, spirit, strength, intelligence, agility, perception, constitution_growth, spirit_growth, strength_growth, intelligence_growth, agility_growth, perception_growth, hp_max, mp_max, current_hp, current_mp, physical_attack, magic_attack, physical_defense, magic_defense, accuracy, evasion, crit_rate_bp, crit_damage_bp, crit_resist_bp, crit_damage_reduction_bp, tenacity, speed, element_mastery_json, element_resistance_json, element_base_mastery_json, element_base_resistance_json, current_region_id, pos_x, pos_y, pos_z) VALUES (3, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [player.id, name, ...attributes.map(key => allocation[key]), ...attributes.map(key => growth[key]), stats.hpMax, stats.mpMax, stats.hpMax, stats.mpMax, stats.physicalAttack, stats.magicAttack, stats.physicalDefense, stats.magicDefense, stats.accuracy, stats.evasion, stats.critRateBp, stats.critDamageBp, stats.critResistBp, stats.critDamageReductionBp, stats.tenacity, stats.speed, JSON.stringify(elementMastery), JSON.stringify(elementResistance), JSON.stringify(elementMastery), JSON.stringify(elementResistance), region.id, x, y, z]);
    const [newCharacters] = await connection.execute('SELECT id FROM characters WHERE player_id=?', [player.id]);
    const characterId = newCharacters[0].id;
    await (await import('./hidden-attributes.service.js')).hiddenAttributesFor(connection, Number(characterId));
    await recordSkillPointChange(connection, Number(characterId), 1, 'initial_grant', null, '角色创建时获得的初始技能点');
    await connection.execute('UPDATE characters SET game_id=? WHERE id=?', [10000000 + Number(characterId), characterId]);
    await connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity)
    SELECT ?, id, 3 FROM item_definitions WHERE code='healing_herb'`, [characterId]);
    await connection.execute(`INSERT INTO player_quick_items (character_id,quick_slot,item_id)
    SELECT ?, 1, id FROM item_definitions WHERE code='healing_herb'`, [characterId]);
    await connection.execute(`INSERT INTO player_skills (character_id,skill_id,level,passive_linked)
    SELECT ?,id,1,0 FROM skill_definitions WHERE code='appraisal'`, [characterId]);
    await connection.execute('INSERT INTO player_appraisal_progress (character_id,range_level,information_level) VALUES (?,1,1)', [characterId]);
    await connection.execute('INSERT INTO player_blessings (character_id,code) VALUES (?,?)', [characterId, giftCode]);
    await connection.execute(`INSERT INTO player_skills (character_id,skill_id) SELECT ?,id FROM skill_definitions WHERE code=? AND category='bound'`, [characterId, giftCode]);
    await grantOpeningItem(connection, Number(characterId), 'opening_last_ration', 3);
    await grantOpeningItem(connection, Number(characterId), 'opening_mineral_water', 3);
    for (const [itemCode, slot] of [['opening_staff', 'weapon'], ['opening_clothes', 'upper']]) {
        const [definitions] = await connection.execute('SELECT id FROM item_definitions WHERE code=?', [itemCode]);
        if (!definitions[0])
            throw new Error('初行装备尚未备齐，请稍后重新选择恩赐。');
        const itemId = Number(definitions[0].id);
        const [created] = await connection.execute("INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max,bound_kind,bound_at) VALUES (?,?,100,100,100,'personal',NOW())", [characterId, itemId]);
        await connection.execute('INSERT INTO player_equipment (character_id,slot,item_id,instance_id) VALUES (?,?,?,?)', [characterId, slot, itemId, created.insertId]);
        await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, itemId]);
    }
    const world = await openingWorldFor(connection);
    await connection.execute("INSERT INTO player_opening_stories (character_id,route_code,story_version,destination_code,started_epoch,flags_json) VALUES (?,?,?,?,?,'{}')", [characterId, openingRoute.code, openingRoute.version, openingRoute.destination, world.reception_epoch]);
    await updateAchievementState(connection, Number(characterId), 'pve_life_history', 'birth', true, state => { state.fromBirth = true; });
    recordAchievement(connection, Number(characterId), ['ACH_A01'], `registration:${characterId}`);
    await flushAchievements(connection, takeAchievementEvents(connection));
    await recalculateCharacterStats(connection, Number(characterId));
    await connection.execute('UPDATE characters SET current_hp=hp_max,current_mp=mp_max WHERE id=?', [characterId]);
    const [createdPanels] = await connection.execute('SELECT hp_max AS hpMax,mp_max AS mpMax,physical_attack AS physicalAttack,magic_attack AS magicAttack,physical_defense AS physicalDefense,magic_defense AS magicDefense,accuracy,evasion,speed,element_mastery_json,element_resistance_json FROM characters WHERE id=?', [characterId]);
    const createdPanel = createdPanels[0];
    const inheritedAchievementAttributes = await achievementStatBonus(connection, Number(characterId));
    for (const key of attributes)
        allocation[key] += inheritedAchievementAttributes[key] ?? 0;
    Object.assign(stats, Object.fromEntries(Object.keys(stats).filter(key => createdPanel[key] !== undefined).map(key => [key, Number(createdPanel[key])])));
    Object.assign(elementMastery, jsonRecord(createdPanel.element_mastery_json));
    Object.assign(elementResistance, jsonRecord(createdPanel.element_resistance_json));
    await connection.execute('INSERT IGNORE INTO achievement_profiles(identity_key) VALUES (?)', [qqUserId]);
    await connection.execute('UPDATE players SET status = \'active\' WHERE id = ?', [player.id]);
    await connection.execute('DELETE FROM registration_sessions WHERE id = ?', [session.id]);
    await connection.execute('INSERT INTO player_events (player_id, event_type, payload) VALUES (?, \'character.created\', ?)', [player.id, JSON.stringify({ characterId, region: region.name, x, y, z, giftCode, giftName: gift.name })]);
    return { ...allocation, ...stats, growth, name, gender: '未设定', professionName: null, regionName: String(region.name), x, y, z, level: 1, experience: 0, realmStage: 1, adventurerRegistered: false, giftName: gift.name, currentHp: stats.hpMax, currentMp: stats.mpMax, stamina: 120, staminaMax: 120, staminaFullSeconds: 0, activityStatus: 'active', elementMastery, elementResistance, extraAttributes: {}, activeBuffs: [], combatNotes: [] };
});
const getCharacter = async (qqUserId) => {
    const pool = await getPool();
    const [characterRows] = await pool.execute('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1', [qqUserId]);
    if (characterRows[0])
        await withTransaction(async (connection) => {
            await refreshCharacterStamina(connection, Number(characterRows[0].id));
            await recalculateCharacterStats(connection, Number(characterRows[0].id));
        });
    const [rows] = await pool.execute(`SELECT c.name, c.gender, c.level, c.experience, c.realm_stage AS realmStage, c.stamina, c.stamina_updated_at AS staminaUpdatedAt, c.adventurer_registered AS adventurerRegistered, c.constitution, c.spirit, c.strength, c.intelligence, c.agility, c.perception, c.constitution_growth AS constitutionGrowth, c.spirit_growth AS spiritGrowth, c.strength_growth AS strengthGrowth, c.intelligence_growth AS intelligenceGrowth, c.agility_growth AS agilityGrowth, c.perception_growth AS perceptionGrowth, c.hp_max AS hpMax, c.mp_max AS mpMax, c.current_hp AS currentHp, c.current_mp AS currentMp, c.activity_status AS activityStatus, c.physical_attack AS physicalAttack, c.magic_attack AS magicAttack, c.physical_defense AS physicalDefense, c.magic_defense AS magicDefense, c.accuracy, c.evasion, c.crit_rate_bp AS critRateBp, c.crit_damage_bp AS critDamageBp, c.crit_resist_bp AS critResistBp, c.crit_damage_reduction_bp AS critDamageReductionBp, c.tenacity, c.tenacity_pierce AS tenacityPierce, c.speed, c.element_mastery_json AS elementMastery, c.element_resistance_json AS elementResistance, c.profession_code,ap.profession_code AS advanced_profession_code,pd.name AS base_profession_name, r.name AS regionName, c.pos_x AS x, c.pos_y AS y, c.pos_z AS z, COALESCE((SELECT ai.name FROM player_equipment ape JOIN item_definitions ai ON ai.id=ape.item_id WHERE ape.character_id=c.id AND ai.rarity='神器' LIMIT 1), b.code) AS giftName FROM characters c JOIN players p ON p.id = c.player_id JOIN map_regions r ON r.id=c.current_region_id LEFT JOIN player_blessings b ON b.character_id=c.id LEFT JOIN profession_definitions pd ON pd.code=c.profession_code LEFT JOIN player_advanced_professions ap ON ap.character_id=c.id WHERE p.qq_user_id = ? LIMIT 1`, [qqUserId]);
    const row = rows[0];
    if (!row)
        return null;
    const [extraAttributes, activeEffects, effectiveAttributes, homeRecoveryBonus] = await Promise.all([
        equipmentExtraAttributes(pool, Number(characterRows[0].id)),
        activeCharacterEffects(pool, Number(characterRows[0].id)),
        effectiveCharacterAttributes(pool, row, Number(characterRows[0].id)),
        homeRestRecoveryBonus(pool, Number(characterRows[0].id))
    ]);
    const staminaMax = staminaMaxForRealm(Number(row.realmStage));
    const stamina = Math.min(staminaMax, Math.max(0, Number(row.stamina)));
    const staminaIntervalMs = STAMINA_RECOVERY_MS / (1 + homeRecoveryBonus / 100);
    const elapsed = Math.max(0, Date.now() - new Date(row.staminaUpdatedAt).getTime());
    const staminaFullSeconds = stamina >= staminaMax ? 0 : Math.ceil((staminaIntervalMs - elapsed % staminaIntervalMs + Math.max(0, staminaMax - stamina - 1) * staminaIntervalMs) / 1000);
    return {
        ...row,
        giftName: talentDefinitions.find(skill => skill.code === row.giftName)?.name ?? row.giftName,
        professionName: registeredAdvancedProfessionByCode(row.advanced_profession_code ?? '')?.name ?? row.base_profession_name,
        ...effectiveAttributes,
        stamina,
        staminaMax,
        staminaFullSeconds,
        elementMastery: typeof row.elementMastery === 'string' ? JSON.parse(row.elementMastery) : row.elementMastery ?? {},
        elementResistance: typeof row.elementResistance === 'string' ? JSON.parse(row.elementResistance) : row.elementResistance ?? {},
        extraAttributes,
        ...activeEffects,
        growth: Object.fromEntries(attributes.map(key => [key, Number(row[`${key}Growth`])]))
    };
};
const consumeIdentityChange = async (connection, characterId, field, cardCode) => {
    const [characters] = await connection.execute(`SELECT ${field} AS used FROM characters WHERE id=? FOR UPDATE`, [characterId]);
    if (!characters[0])
        throw new Error('未找到角色。');
    if (!Number(characters[0].used)) {
        await connection.execute(`UPDATE characters SET ${field}=1 WHERE id=?`, [characterId]);
        return false;
    }
    const [cards] = await connection.execute(`SELECT pi.item_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=? FOR UPDATE`, [characterId, cardCode]);
    if (!cards[0] || Number(cards[0].quantity) < 1)
        throw new Error(cardCode === 'rename_card' ? '首次改名已用完，请使用改名卡。' : '首次改性已用完，请使用改性卡。');
    await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [characterId, cards[0].item_id]);
    return true;
};
const characterIdForChange = async (connection, qqUserId) => {
    const player = await getPlayer(connection, qqUserId);
    const [characters] = await connection.execute('SELECT id FROM characters WHERE player_id=? FOR UPDATE', [player.id]);
    if (!characters[0])
        throw new Error('请先完成角色注册。');
    return characters[0].id;
};
const changeCharacterName = async (qqUserId, input) => withTransaction(async (connection) => {
    const name = input.trim();
    if (Array.from(name).length < 2 || Array.from(name).length > 24 || /[\r\n]/.test(name))
        throw new Error('昵称长度需为 2～24 个字符，且不能包含换行。');
    const characterId = await characterIdForChange(connection, qqUserId);
    const usedCard = await consumeIdentityChange(connection, characterId, 'free_name_change_used', 'rename_card');
    await connection.execute('UPDATE characters SET name=? WHERE id=?', [name, characterId]);
    return { name, usedCard };
});
const changeCharacterGender = async (qqUserId, gender) => withTransaction(async (connection) => {
    if (gender !== '男' && gender !== '女')
        throw new Error('性别只能选择“男”或“女”。');
    const characterId = await characterIdForChange(connection, qqUserId);
    const usedCard = await consumeIdentityChange(connection, characterId, 'free_gender_change_used', 'gender_change_card');
    await connection.execute('UPDATE characters SET gender=? WHERE id=?', [gender, characterId]);
    return { gender, usedCard };
});
const registerAdventurer = async (qqUserId) => withTransaction(async (connection) => {
    const player = await getPlayer(connection, qqUserId);
    const [rows] = await connection.execute('SELECT id,level,adventurer_registered FROM characters WHERE player_id=? FOR UPDATE', [player.id]);
    if (!rows[0])
        throw new Error('请先完成转生。');
    if (rows[0].adventurer_registered)
        return false;
    await (await import('./guild-context.js')).requireGuildService(connection, Number(rows[0].id));
    await connection.execute('UPDATE characters SET adventurer_registered=1 WHERE id=?', [rows[0].id]);
    recordAchievement(connection, Number(rows[0].id), ['ACH_A02']);
    const [card] = await connection.execute('SELECT id FROM item_definitions WHERE code=\'adventurer_card\' LIMIT 1', []);
    if (card[0])
        await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1,acquired_at=NOW()', [rows[0].id, card[0].id]);
    return true;
});
const adventurerProfile = async (qqUserId) => {
    const pool = await getPool();
    const [rows] = await pool.execute(`SELECT c.id,c.name,c.level,c.experience,c.adventurer_registered,c.adventurer_rank,c.profession_code,p.name AS profession_name,ap.profession_code AS advanced_profession_code
    FROM characters c JOIN players pl ON pl.id=c.player_id LEFT JOIN profession_definitions p ON p.code=c.profession_code LEFT JOIN player_advanced_professions ap ON ap.character_id=c.id WHERE pl.qq_user_id=? LIMIT 1`, [qqUserId]);
    const profile = rows[0];
    if (!profile)
        throw new Error('请先创建角色。');
    return { ...profile, profession_name: registeredAdvancedProfessionByCode(profile.advanced_profession_code ?? '')?.name ?? profile.profession_name };
};
const chooseProfession = async (qqUserId, code) => withTransaction(async (connection) => {
    const player = await getPlayer(connection, qqUserId);
    const [characters] = await connection.execute('SELECT id,adventurer_registered,profession_code FROM characters WHERE player_id=? FOR UPDATE', [player.id]);
    const character = characters[0];
    if (!character?.adventurer_registered)
        throw new Error('完成冒险者注册后才能选择职业。');
    await (await import('./guild-context.js')).requireGuildService(connection, Number(character.id));
    if (character.profession_code)
        throw new Error('已选择职业，暂不可更改。');
    const [professions] = await connection.execute('SELECT code,growth_json,skill_codes_json FROM profession_definitions WHERE code=? LIMIT 1 FOR UPDATE', [code]);
    const profession = professions[0];
    if (!profession)
        throw new Error('该职业暂未开放。');
    const growth = typeof profession.growth_json === 'string' ? JSON.parse(profession.growth_json) : profession.growth_json;
    const skills = typeof profession.skill_codes_json === 'string' ? JSON.parse(profession.skill_codes_json) : profession.skill_codes_json;
    const reset = await resetSkillPointAllocation(connection, Number(character.id));
    await connection.execute('UPDATE characters SET profession_code=?,constitution_growth=constitution_growth+?,spirit_growth=spirit_growth+?,strength_growth=strength_growth+?,intelligence_growth=intelligence_growth+?,agility_growth=agility_growth+?,perception_growth=perception_growth+? WHERE id=?', [code, Number(growth.constitution ?? 0), Number(growth.spirit ?? 0), Number(growth.strength ?? 0), Number(growth.intelligence ?? 0), Number(growth.agility ?? 0), Number(growth.perception ?? 0), character.id]);
    for (const skillCode of skills)
        await connection.execute('INSERT IGNORE INTO player_skills (character_id,skill_id) SELECT ?,id FROM skill_definitions WHERE code=?', [character.id, skillCode]);
    const weapon = await (await import('./opening-pack.service.js')).grantOpeningProfessionWeapon(connection, Number(character.id), code);
    recordAchievement(connection, Number(character.id), ['ACH_A16']);
    await recalculateCharacterStats(connection, character.id);
    return { code, reset, weapon };
});

export { adventurerProfile, armorClassDefenseMultiplier, askWhereAmI, beginRegistration, changeCharacterGender, changeCharacterName, chooseDestination, chooseGift, chooseProfession, continueRegistration, effectiveCharacterAttributes, equipmentExtraAttributes, getCharacter, hasCharacter, recalculateCharacterStats, refreshCharacterStamina, registerAdventurer, withVirtualNpcEquipment };
