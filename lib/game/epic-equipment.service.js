import { armorSlot } from './armor-class.js';

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
const epicLoadoutFor = async (connection, characterId) => {
    const [rows] = await connection.execute(`SELECT pe.slot,COALESCE(ii.effect_json,i.effect_json) AS effect_json
    FROM player_equipment pe
    JOIN item_definitions i ON i.id=pe.item_id
    LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id
    WHERE pe.character_id=?
    ORDER BY FIELD(pe.slot,'shoulder','头肩','upper','上装','waist','腰部','lower','下装','feet','脚部','weapon','offhand'),pe.slot`, [characterId]);
    return epicLoadoutFromRows(rows);
};
const epicLoadoutFromRows = (rows) => {
    const seen = new Set();
    const counts = new Map();
    const weaponEffects = [];
    for (const [index, row] of rows.entries()) {
        const effect = jsonRecord(row.effect_json);
        const setCode = String(effect.epicSetCode ?? '');
        if (['mountainheart_regalia', 'valk_forge_regalia', 'mistmother_cocoon', 'goblin_court_hunt', 'crimson_crown'].includes(setCode)
            && armorSlot(row.slot) && !seen.has(armorSlot(row.slot))) {
            seen.add(armorSlot(row.slot));
            const current = counts.get(setCode) ?? { count: 0, first: index };
            current.count += 1;
            counts.set(setCode, current);
        }
        if (['weapon', 'offhand'].includes(row.slot) && typeof effect.epicWeaponEffect === 'string')
            weaponEffects.push(effect.epicWeaponEffect);
    }
    const winner = [...counts.entries()].sort((left, right) => right[1].count - left[1].count || left[1].first - right[1].first)[0];
    const crimsonCount = counts.get('crimson_crown')?.count ?? 0;
    return { setCode: winner?.[0] ?? null, setCount: winner?.[1].count ?? 0, weaponEffects, ...(crimsonCount ? { crimsonCount } : {}) };
};
const hasEpicWeaponEffect = (loadout, code) => loadout.weaponEffects.includes(code);
const applyEpicSetPanelStats = (stats, loadout) => loadout.setCode === 'valk_forge_regalia' && loadout.setCount >= 3
    ? { ...stats, hpMax: Math.max(1, Math.floor(stats.hpMax * 1.06)) }
    : stats;

export { applyEpicSetPanelStats, epicLoadoutFor, epicLoadoutFromRows, hasEpicWeaponEffect };
