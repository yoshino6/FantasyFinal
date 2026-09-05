import { getPool, withTransaction } from '../database/pool.js';

const defaults = { experience_multiplier: 1, drop_multiplier: 1, copper_multiplier: 1 };
const settingKeys = Object.keys(defaults);
const normalizedMultiplier = (value) => {
    if (!Number.isFinite(value) || value < 0 || value > 20)
        throw new Error('倍率只能设置为 0 至 20 之间的数字。');
    return Math.round(value * 100) / 100;
};
const globalSettings = async (connection) => {
    const executor = connection ?? await getPool();
    const [rows] = await executor.execute(`SELECT setting_key,numeric_value FROM game_global_settings WHERE setting_key IN (${settingKeys.map(() => '?').join(',')})`, settingKeys);
    const values = { ...defaults };
    for (const row of rows)
        values[row.setting_key] = Number(row.numeric_value);
    return values;
};
const setGlobalMultiplier = async (key, value) => {
    const multiplier = normalizedMultiplier(value);
    const pool = await getPool();
    await pool.execute('INSERT INTO game_global_settings (setting_key,numeric_value) VALUES (?,?) ON DUPLICATE KEY UPDATE numeric_value=VALUES(numeric_value),updated_at=NOW()', [key, multiplier]);
    return multiplier;
};
const globalExperienceMultiplier = async (connection) => (await globalSettings(connection)).experience_multiplier;
const globalDropMultiplier = async (connection) => (await globalSettings(connection)).drop_multiplier;
const globalCopperMultiplier = async (connection) => (await globalSettings(connection)).copper_multiplier;
const managedMaps = async () => {
    const pool = await getPool();
    const [rows] = await pool.execute('SELECT code,name,description,is_enabled FROM map_regions WHERE is_release_managed=1 ORDER BY danger_level,code');
    return rows.map(row => ({ code: row.code, name: row.name, description: row.description, enabled: Boolean(row.is_enabled) }));
};
const setManagedMapEnabled = async (code, enabled) => withTransaction(async (connection) => {
    const [regions] = await connection.execute('SELECT id,name,is_enabled,is_owner_only FROM map_regions WHERE code=? AND is_release_managed=1 LIMIT 1 FOR UPDATE', [code]);
    const region = regions[0];
    if (!region)
        throw new Error('该地图不支持发布开关。');
    const alreadyInRequestedState = enabled
        ? Boolean(region.is_enabled) && !Boolean(region.is_owner_only)
        : !Boolean(region.is_enabled);
    if (alreadyInRequestedState)
        return { name: region.name, enabled, moved: 0, removed: 0 };
    await connection.execute('UPDATE map_regions SET is_enabled=?,is_owner_only=IF(?,0,is_owner_only) WHERE id=?', [enabled ? 1 : 0, enabled ? 1 : 0, region.id]);
    if (enabled)
        return { name: region.name, enabled, moved: 0, removed: 0 };
    await connection.execute(`UPDATE combat_sessions cs JOIN combat_targets ct ON ct.session_id=cs.id JOIN monster_spawns s ON s.id=ct.spawn_id
    SET cs.state='escaped',cs.last_action_at=NOW() WHERE cs.state='active' AND s.region_id=?`, [region.id]);
    const [monsterResult] = await connection.execute('UPDATE monster_spawns SET current_hp=0,defeated_at=NOW() WHERE region_id=? AND defeated_at IS NULL', [region.id]);
    await connection.execute('UPDATE resource_spawns SET mined_at=NOW() WHERE region_id=? AND mined_at IS NULL', [region.id]);
    await connection.execute('DELETE t FROM player_travels t JOIN characters c ON c.id=t.character_id WHERE t.region_id=? OR c.current_region_id=?', [region.id, region.id]);
    await connection.execute(`UPDATE bounty_notices b JOIN monster_spawns s ON s.id=b.source_spawn_id
    SET b.is_active=0 WHERE s.region_id=? AND b.is_active=1`, [region.id]);
    await connection.execute(`DELETE bs FROM bounty_board_slots bs JOIN bounty_notices b ON b.id=bs.bounty_id
    JOIN monster_spawns s ON s.id=b.source_spawn_id WHERE s.region_id=?`, [region.id]);
    const [towns] = await connection.execute('SELECT id FROM map_regions WHERE code=\'baina_town\' LIMIT 1 FOR UPDATE');
    if (!towns[0])
        throw new Error('百纳镇区域尚未初始化。');
    const [moveResult] = await connection.execute('UPDATE characters SET current_region_id=?,pos_x=-2,pos_y=-161,pos_z=0 WHERE current_region_id=? AND npc_code IS NULL', [towns[0].id, region.id]);
    return { name: region.name, enabled, moved: Number(moveResult.affectedRows), removed: Number(monsterResult.affectedRows) };
});

export { globalCopperMultiplier, globalDropMultiplier, globalExperienceMultiplier, globalSettings, managedMaps, setGlobalMultiplier, setManagedMapEnabled };
