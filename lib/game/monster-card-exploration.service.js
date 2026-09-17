import { aggregateEnchantmentEffects, equippedEnchantments } from './equipment-enchantment-effects.js';

const tierOrder = { normal: 0, large: 1, elite: 2, boss: 3 };
const elementOrder = ['水', '火', '木', '土', '风', '冰', '雷', '光', '暗', '金'];
const jsonObject = (value) => {
    if (!value)
        return {};
    if (typeof value === 'object' && !Array.isArray(value))
        return value;
    try {
        const parsed = JSON.parse(String(value));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
};
const jsonArray = (value) => {
    if (Array.isArray(value))
        return value;
    try {
        const parsed = JSON.parse(String(value ?? '[]'));
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
const readPayload = (value) => {
    if (Array.isArray(value))
        return { trackedSpawns: value };
    if (typeof value === 'string') {
        try {
            return readPayload(JSON.parse(value));
        }
        catch {
            return { trackedSpawns: [] };
        }
    }
    const object = jsonObject(value);
    return { ...object, trackedSpawns: jsonArray(object.trackedSpawns).map(normalizeTrackedMonster).filter(Boolean) };
};
const normalizeTrackedMonster = (value) => {
    const row = jsonObject(value);
    const monsterClass = String(row.monsterClass);
    if (!Number.isInteger(Number(row.spawnId)) || !(monsterClass in tierOrder))
        return null;
    return {
        spawnId: Number(row.spawnId), name: String(row.name ?? '未知怪物'), monsterClass,
        regionId: Number(row.regionId), x: Number(row.x), y: Number(row.y), z: Number(row.z),
        remainingMoves: Math.max(0, Math.floor(Number(row.remainingMoves))),
        sourceSignature: String(row.sourceSignature ?? ''), markedAt: String(row.markedAt ?? '')
    };
};
const sourceSignature = (enchantments) => enchantments
    .map(enchantment => `${enchantment.slot}:${enchantment.instanceId}:${enchantment.revision}:${enchantment.cardCode}`)
    .sort()
    .join('|');
const explorationCardProfileFromEnchantments = (enchantments) => {
    const trackingEnchantments = enchantments.filter(enchantment => Number(enchantment.effects.trackingMaxTargets ?? 0) > 0);
    const chargeEnchantments = enchantments.filter(enchantment => Number(enchantment.effects.moveChargeRequired ?? 0) > 0 && Number(enchantment.effects.moveChargeBonus ?? 0) > 0);
    const result = {};
    if (trackingEnchantments.length) {
        const effects = aggregateEnchantmentEffects(trackingEnchantments);
        const rawTier = String(effects.trackingMaxTier ?? 'normal');
        result.tracking = {
            sourceSignature: sourceSignature(trackingEnchantments),
            maxTargets: Math.max(1, Math.floor(Number(effects.trackingMaxTargets ?? 1))),
            maxTier: rawTier in tierOrder ? rawTier : 'normal',
            moveDuration: Math.max(1, Math.floor(Number(effects.trackingMoveDuration ?? 1)))
        };
    }
    if (chargeEnchantments.length) {
        const effects = aggregateEnchantmentEffects(chargeEnchantments);
        result.movementCharge = {
            sourceSignature: sourceSignature(chargeEnchantments),
            requiredMoves: Math.max(1, Math.floor(Number(effects.moveChargeRequired ?? 3))),
            bonus: Math.max(0, Math.floor(Number(effects.moveChargeBonus ?? 0)))
        };
    }
    return result;
};
const explorationCardProfile = async (connection, characterId) => explorationCardProfileFromEnchantments(await equippedEnchantments(connection, characterId));
const ensureState = async (connection, characterId) => {
    await connection.execute(`INSERT IGNORE INTO player_card_exploration_states
    (character_id,legal_move_charge,charged_move_ready,tracked_spawns_json)
    VALUES (?,0,0,JSON_OBJECT('trackedSpawns',JSON_ARRAY()))`, [characterId]);
};
const readState = async (connection, characterId, lock = false) => {
    await ensureState(connection, characterId);
    const [rows] = await connection.execute(`SELECT legal_move_charge,charged_move_ready,tracked_spawns_json,revision
    FROM player_card_exploration_states WHERE character_id=?${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    const row = rows[0];
    if (!row)
        throw new Error('怪物卡片探索状态不存在。');
    return { row, payload: readPayload(row.tracked_spawns_json) };
};
const writeState = async (connection, characterId, row, payload, charge = Number(row.legal_move_charge), ready = Boolean(row.charged_move_ready)) => {
    await connection.execute(`UPDATE player_card_exploration_states
    SET legal_move_charge=?,charged_move_ready=?,tracked_spawns_json=?,revision=revision+1
    WHERE character_id=?`, [Math.max(0, Math.floor(charge)), ready ? 1 : 0, JSON.stringify(payload), characterId]);
};
const sanitizeTracked = async (connection, payload, profile, location) => {
    const tracking = profile.tracking;
    const original = payload.trackedSpawns ?? [];
    if (!tracking || !location)
        return { tracked: [], changed: original.length > 0 };
    const signatureValid = (entry) => entry.sourceSignature === tracking.sourceSignature;
    const located = original.filter(entry => signatureValid(entry) && entry.remainingMoves > 0 && entry.regionId === location.regionId && entry.z === location.z);
    if (!located.length)
        return { tracked: [], changed: original.length > 0 };
    const [aliveRows] = await connection.execute(`SELECT id FROM monster_spawns
    WHERE defeated_at IS NULL AND id IN (${located.map(() => '?').join(',')})`, located.map(entry => entry.spawnId));
    const alive = new Set(aliveRows.map(row => Number(row.id)));
    const tracked = located.filter(entry => alive.has(entry.spawnId)).slice(0, tracking.maxTargets);
    return { tracked, changed: tracked.length !== original.length || tracked.some((entry, index) => entry !== original[index]) };
};
const refreshExplorationEquipmentState = async (connection, characterId) => {
    const profile = await explorationCardProfile(connection, characterId);
    const { row, payload } = await readState(connection, characterId, true);
    const [locations] = await connection.execute('SELECT current_region_id,pos_z FROM characters WHERE id=? LIMIT 1', [characterId]);
    const location = locations[0] ? { regionId: Number(locations[0].current_region_id), z: Number(locations[0].pos_z) } : undefined;
    const sanitized = await sanitizeTracked(connection, payload, profile, location);
    const chargeSignature = profile.movementCharge?.sourceSignature;
    const chargeValid = Boolean(chargeSignature) && payload.chargeSourceSignature === chargeSignature;
    const nextPayload = { ...payload, trackedSpawns: sanitized.tracked, chargeSourceSignature: chargeSignature };
    await writeState(connection, characterId, row, nextPayload, chargeValid ? Number(row.legal_move_charge) : 0, chargeValid && Boolean(row.charged_move_ready));
};
const chargedMapMoveBonus = async (connection, characterId) => {
    const profile = await explorationCardProfile(connection, characterId);
    if (!profile.movementCharge)
        return 0;
    const { row, payload } = await readState(connection, characterId);
    return payload.chargeSourceSignature === profile.movementCharge.sourceSignature && Boolean(row.charged_move_ready)
        ? profile.movementCharge.bonus
        : 0;
};
const recordCardMovement = async (connection, characterId, location, options = {}) => {
    const profile = await explorationCardProfile(connection, characterId);
    const { row, payload } = await readState(connection, characterId, true);
    const sanitized = await sanitizeTracked(connection, payload, profile, location);
    const tracked = options.legalMove && !options.teleport
        ? sanitized.tracked.map(entry => ({ ...entry, remainingMoves: entry.remainingMoves - 1 })).filter(entry => entry.remainingMoves > 0)
        : [];
    const chargeProfile = profile.movementCharge;
    let charge = Number(row.legal_move_charge);
    let ready = Boolean(row.charged_move_ready);
    const sameChargeSource = Boolean(chargeProfile) && payload.chargeSourceSignature === chargeProfile.sourceSignature;
    if (!chargeProfile || !sameChargeSource || options.teleport || options.forcedEvent || !options.legalMove) {
        charge = 0;
        ready = false;
    }
    else if (ready) {
        charge = 0;
        ready = false;
    }
    else {
        charge = Math.min(chargeProfile.requiredMoves, charge + 1);
        ready = charge >= chargeProfile.requiredMoves;
    }
    const nextPayload = { ...payload, trackedSpawns: tracked, chargeSourceSignature: chargeProfile?.sourceSignature };
    await writeState(connection, characterId, row, nextPayload, charge, ready);
    return { tracked, charge, ready, chargedBonus: ready ? Number(chargeProfile?.bonus ?? 0) : 0 };
};
const resetCardMovementCharge = async (connection, characterIds) => {
    if (!characterIds.length)
        return;
    await connection.execute(`UPDATE player_card_exploration_states SET legal_move_charge=0,charged_move_ready=0,revision=revision+1
    WHERE character_id IN (${characterIds.map(() => '?').join(',')})`, [...characterIds]);
};
const canTrackMonsterClass = (monsterClass, maxTier) => monsterClass in tierOrder && tierOrder[monsterClass] <= tierOrder[maxTier];
const trackingTargetForbiddenReason = (target) => {
    const traits = jsonArray(target.traitsJson).map(jsonObject);
    if (target.templateCode === 'scholar_ga' || traits.some(trait => trait.code === 'advanced_profession_trial' || trait.code === 'domain_resident'))
        return '转职试炼与域民目标不能追迹。';
    if (traits.some(trait => trait.code === 'summoned'))
        return '临时召唤物不能独立追迹。';
    if (traits.some(trait => trait.code === 'boss_component'))
        return '首领虚拟部位不能独立追迹，请标记本体。';
    if (traits.some(trait => trait.code === 'city_pursuit'))
        return '追迹不会暴露正在追捕你的执法者位置。';
    return undefined;
};
const markTrackedMonster = async (connection, characterId, target) => {
    const forbidden = trackingTargetForbiddenReason(target);
    if (forbidden)
        throw new Error(forbidden);
    const profile = await explorationCardProfile(connection, characterId);
    const tracking = profile.tracking;
    if (!tracking)
        throw new Error('当前没有装备可用的追迹卡片。');
    if (!canTrackMonsterClass(target.monsterClass, tracking.maxTier))
        throw new Error(`当前追迹卡片不能标记${target.monsterClass === 'boss' ? '首领' : '该品阶'}怪物。`);
    const { row, payload } = await readState(connection, characterId, true);
    const sanitized = await sanitizeTracked(connection, payload, profile, { regionId: target.regionId, z: target.z });
    const existing = sanitized.tracked.find(entry => entry.spawnId === target.spawnId);
    if (!existing && sanitized.tracked.length >= tracking.maxTargets)
        throw new Error(`当前最多可同时追迹 ${tracking.maxTargets} 只怪物，请先取消一个标记。`);
    const marked = {
        spawnId: target.spawnId, name: target.name, monsterClass: target.monsterClass,
        regionId: target.regionId, x: target.x, y: target.y, z: target.z,
        remainingMoves: tracking.moveDuration, sourceSignature: tracking.sourceSignature, markedAt: new Date().toISOString()
    };
    const tracked = existing ? sanitized.tracked.map(entry => entry.spawnId === target.spawnId ? marked : entry) : [...sanitized.tracked, marked];
    await writeState(connection, characterId, row, { ...payload, trackedSpawns: tracked });
    return { marked, tracked, maxTargets: tracking.maxTargets };
};
const trackedMonsterList = async (connection, characterId, location) => {
    const profile = await explorationCardProfile(connection, characterId);
    const { row, payload } = await readState(connection, characterId);
    const sanitized = await sanitizeTracked(connection, payload, profile, location);
    if (sanitized.changed)
        await writeState(connection, characterId, row, { ...payload, trackedSpawns: sanitized.tracked });
    return { tracked: sanitized.tracked, maxTargets: profile.tracking?.maxTargets ?? 0, active: Boolean(profile.tracking) };
};
const cancelTrackedMonster = async (connection, characterId, spawnId) => {
    const { row, payload } = await readState(connection, characterId, true);
    const original = payload.trackedSpawns ?? [];
    const tracked = original.filter(entry => entry.spawnId !== spawnId);
    if (tracked.length === original.length)
        throw new Error('没有这个追迹标记，或标记已经失效。');
    await writeState(connection, characterId, row, { ...payload, trackedSpawns: tracked });
    return tracked;
};
const highestElementResistance = (raw) => {
    const values = jsonObject(raw);
    const highest = elementOrder
        .map((element, index) => ({ element, value: Number(values[element] ?? 0), index }))
        .sort((left, right) => right.value - left.value || left.index - right.index)[0];
    return { element: highest.element, value: highest.value };
};
const revealHighestElementResistance = async (connection, characterId, spawnId, raw) => {
    const [existingRows] = await connection.execute(`SELECT revealed_json FROM player_monster_card_reveals
    WHERE character_id=? AND spawn_id=? AND reveal_kind='highest_element_resistance' LIMIT 1`, [characterId, spawnId]);
    if (existingRows[0])
        return jsonObject(existingRows[0].revealed_json);
    const effects = aggregateEnchantmentEffects(await equippedEnchantments(connection, characterId));
    if (!effects.revealHighestElementResistance)
        return undefined;
    const revealed = highestElementResistance(raw);
    await connection.execute(`INSERT IGNORE INTO player_monster_card_reveals (character_id,spawn_id,reveal_kind,revealed_json)
    VALUES (?,?,'highest_element_resistance',?)`, [characterId, spawnId, JSON.stringify(revealed)]);
    const [storedRows] = await connection.execute(`SELECT revealed_json FROM player_monster_card_reveals
    WHERE character_id=? AND spawn_id=? AND reveal_kind='highest_element_resistance' LIMIT 1`, [characterId, spawnId]);
    return storedRows[0] ? jsonObject(storedRows[0].revealed_json) : revealed;
};

export { canTrackMonsterClass, cancelTrackedMonster, chargedMapMoveBonus, explorationCardProfile, explorationCardProfileFromEnchantments, highestElementResistance, markTrackedMonster, recordCardMovement, refreshExplorationEquipmentState, resetCardMovementCharge, revealHighestElementResistance, trackedMonsterList, trackingTargetForbiddenReason };
