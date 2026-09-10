import { recordAchievement } from './achievement-events.js';
import { consumeBinding, grantInventory, productionBinding, consumeInventory } from './inventory-binding.js';
import { withTransaction } from '../database/pool.js';
import { craftCharacterId, craftJson, completeCraftRequest } from './alchemy-journal.service.js';
import { itemUsePolicy, itemEffect } from './item-use-policy.js';
import { applyBattleElixir } from './battle-elixir.service.js';
import { recalculateCharacterStats } from './character.service.js';
import { consumeAchievementRewardItem } from './achievement.service.js';

const useInventoryItem = async (user, itemId, token) => withTransaction(async (connection) => {
    if (!Number.isInteger(itemId) || itemId < 1 || !/^[-a-f0-9]{36}$/i.test(token))
        throw new Error('使用请求无效，请重新打开背包。');
    const id = await craftCharacterId(connection, user, true);
    await (await import('./negotiation.service.js')).assertNoNegotiation(connection, id);
    const [requests] = await connection.execute('SELECT * FROM player_craft_requests WHERE token=? FOR UPDATE', [token]);
    if (requests[0]) {
        const row = requests[0];
        if (Number(row.character_id) !== id || row.kind !== 'inventory_use' || Number(craftJson(row.snapshot_json).itemId) !== itemId)
            throw new Error('该使用记录不属于本次操作。');
        if (row.state === 'complete')
            return craftJson(row.result_json);
        throw new Error('该操作尚未完成，请稍后重试。');
    }
    const [characters] = await connection.execute('SELECT level,current_hp,current_mp,hp_max,mp_max,activity_status FROM characters WHERE id=? FOR UPDATE', [id]);
    const character = characters[0];
    const [pve] = await connection.execute("SELECT s.id FROM combat_sessions s LEFT JOIN combat_members m ON m.session_id=s.id WHERE s.state='active' AND (s.character_id=? OR m.character_id=?) LIMIT 1", [id, id]);
    const [pvp] = await connection.execute("SELECT id FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?) LIMIT 1", [id, id]);
    if (pve.length || pvp.length)
        throw new Error('战斗中请使用战斗面板的道具操作，不能从背包绕过回合。');
    const [items] = await connection.execute('SELECT i.*,pi.quantity,pi.trade_bound_quantity,pi.personal_bound_quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 FOR UPDATE', [id, itemId]);
    const item = items[0];
    if (!item)
        throw new Error('背包中没有该道具。');
    const policy = itemUsePolicy(item);
    if (policy.kind !== 'direct')
        throw new Error(policy.reason);
    const effect = itemEffect(item);
    if (Number(character.level) < Math.max(Number(item.required_level ?? 1), Number(effect.requiredLevel ?? 1)))
        throw new Error(`角色等级不足，无法使用【${item.name}】。`);
    if (Number(character.current_hp) <= 0 && !Number(effect.revivePct))
        throw new Error('当前已经倒下，普通药剂不能代替复活。');
    if (effect.openingSafeRecovery) {
        await (await import('./opening-state.js')).assertOpeningFree(connection, id);
        const [safe] = await connection.execute('SELECT 1 FROM characters c JOIN map_regions r ON r.id=c.current_region_id WHERE c.id=? AND r.is_enabled=1 AND r.is_owner_only=0 AND r.is_spawn_enabled=0', [id]);
        const [travel] = await connection.execute("SELECT 1 FROM player_travels WHERE character_id=? LIMIT 1", [id]);
        if (!safe.length || travel.length)
            throw new Error('黄昏露仅可在安全区停稳、脱离战斗后使用。');
    }
    await connection.execute("INSERT INTO player_craft_requests (token,character_id,kind,snapshot_json,expires_at) VALUES (?,?,'inventory_use',?,DATE_ADD(NOW(),INTERVAL 15 MINUTE))", [token, id, JSON.stringify({ itemId, code: item.code, name: item.name, quantityBefore: Number(item.quantity), hp: Number(character.current_hp), mp: Number(character.current_mp), effect })]);
    let result;
    if (Number(effect.revivePct) > 0) {
        if (Number(character.current_hp) > 0)
            result = { consumed: false, name: String(item.name), message: '当前尚未倒下，未消耗复活道具。' };
        else {
            const hp = Math.max(1, Math.ceil(Number(character.hp_max) * Math.min(100, Number(effect.revivePct)) / 100));
            const mp = Math.ceil(Number(character.mp_max) * Math.min(100, Math.max(0, Number(effect.reviveMpPct ?? 0))) / 100);
            await connection.execute("UPDATE characters SET current_hp=?,current_mp=?,activity_status='active',rest_started_at=NULL WHERE id=?", [hp, mp, id]);
            result = { consumed: true, name: String(item.name), message: `你重新站了起来，HP 0→${hp}｜MP ${character.current_mp}→${mp}` };
        }
    }
    else if (effect.experienceBonusPct || effect.partyDropBonusPct)
        result = { ...await applyBattleElixir(connection, id, effect), name: String(item.name) };
    else if (effect.deviceBlueprintBox) {
        const codes = Array.isArray(effect.outputs) ? effect.outputs.filter((code) => typeof code === 'string').map((code) => code.endsWith('_blueprint') ? code : code + '_blueprint') : [];
        if (!codes.length)
            throw new Error('盲盒缺少图纸配置，未消耗。');
        const [blueprints] = await connection.execute(`SELECT i.id,i.name FROM item_definitions i WHERE i.code IN (${codes.map(() => '?').join(',')}) AND NOT EXISTS (SELECT 1 FROM player_inventory pi WHERE pi.character_id=? AND pi.item_id=i.id AND pi.quantity>0) ORDER BY i.id`, [...codes, id]);
        if (!blueprints.length)
            result = { consumed: false, name: String(item.name), message: '已持有该盲盒的全部图纸，未消耗盲盒。' };
        else {
            const output = blueprints[Math.floor(Math.random() * blueprints.length)];
            const used = consumeBinding({ trade: Number(item.trade_bound_quantity), personal: Number(item.personal_bound_quantity), unbound: Number(item.quantity) - Number(item.trade_bound_quantity) - Number(item.personal_bound_quantity) }, 1);
            await grantInventory(connection, id, Number(output.id), productionBinding(used, 1, false));
            await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [id, output.id]);
            result = { consumed: true, name: String(item.name), message: `获得【${output.name}】×1。` };
        }
    }
    else if (effect.foodBuff) {
        const [meals] = await connection.execute('SELECT buff_json,duration_minutes FROM guild_restaurant_menu WHERE item_id=?', [itemId]);
        const meal = meals[0];
        if (!meal)
            throw new Error('该食物缺少餐食效果配置，未消耗。');
        const [old] = await connection.execute('SELECT item_id FROM player_food_buffs WHERE character_id=? AND expires_at>NOW() FOR UPDATE', [id]);
        if (old[0])
            result = { consumed: false, message: '已有餐食增益，请待结束后食用，未消耗食物。', name: String(item.name) };
        else {
            const seconds = await (await import('./divine-effects.js')).divineFoodSeconds(connection, id, Number(meal.duration_minutes) * 60);
            await connection.execute('DELETE FROM player_food_buffs WHERE character_id=?', [id]);
            await connection.execute('INSERT INTO player_food_buffs (character_id,item_id,buff_json,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL ? SECOND))', [id, itemId, JSON.stringify(await (await import('./divine-effects.js')).divineFoodValues(connection, id, craftJson(meal.buff_json), Number(meal.duration_minutes) * 60)), seconds]);
            await recalculateCharacterStats(connection, id);
            result = { consumed: true, message: `已食用，餐食增益持续 ${seconds / 60} 分钟。`, name: String(item.name) };
        }
    }
    else {
        const hp = Math.min(Number(character.hp_max), Number(character.current_hp) + Math.floor(Math.max(0, Number(effect.heal ?? 0)) + Number(character.hp_max) * Math.max(0, Number(effect.healPct ?? 0)) / 100));
        const mp = Math.min(Number(character.mp_max), Number(character.current_mp) + Math.floor(Math.max(0, Number(effect.restoreMp ?? 0)) + Number(character.mp_max) * Math.max(0, Number(effect.restoreMpPct ?? 0)) / 100));
        const consumed = hp > Number(character.current_hp) || mp > Number(character.current_mp);
        if (consumed)
            await connection.execute("UPDATE characters SET current_hp=?,current_mp=?,activity_status=IF(activity_status IN ('resting','unconscious') AND ?>=hp_max AND ?>=mp_max,'active',activity_status) WHERE id=?", [hp, mp, hp, mp, id]);
        result = { consumed, message: consumed ? `HP ${character.current_hp}→${hp}｜MP ${character.current_mp}→${mp}` : '当前无需回复，未消耗道具。', name: String(item.name) };
    }
    if (result.consumed) {
        await consumeAchievementRewardItem(connection, id, String(item.code), 1);
        await consumeInventory(connection, id, itemId, 1);
    }
    if (result.consumed && effect.foodBuff)
        recordAchievement(connection, id, [{ metric: 'ACH_E22', distinct: String(itemId) }], 'food:' + token);
    await completeCraftRequest(connection, id, token, result);
    return result;
});

export { useInventoryItem };
