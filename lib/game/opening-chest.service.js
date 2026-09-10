import { randomUUID } from 'node:crypto';
import { withTransaction, getPool } from '../database/pool.js';
import { openingCharacter } from './opening.service.js';
import { consumeInventory, grantInventory } from './inventory-binding.js';
import { effectiveCharacterAttributes } from './character.service.js';
import { encumbrance } from './encumbrance.js';
import { chestTableForVersion, crimsonArmor, chestTables, rollChest } from './opening-chest.config.js';

const grantOpeningEquipment = async (connection, id, code) => {
    const [items] = await connection.execute('SELECT id,name FROM item_definitions WHERE code=?', [code]);
    if (!items[0])
        throw new Error('装备配置尚未初始化。');
    const [result] = await connection.execute("INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max,bound_kind,bound_at) VALUES (?,?,100,100,100,'personal',NOW())", [id, items[0].id]);
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [id, items[0].id]);
    return { id: Number(result.insertId), name: String(items[0].name) };
};
const grantCrimsonArmor = (connection, id) => grantOpeningEquipment(connection, id, `crimson_${crimsonArmor[Math.floor(Math.random() * crimsonArmor.length)][0]}`);
const canOpen = async (connection, id) => {
    const [story] = await connection.execute('SELECT route_code,branch_code,state FROM player_opening_stories WHERE character_id=?', [id]);
    if (story[0] && story[0].state !== 'completed' && !(story[0].route_code === 'F01' && story[0].branch_code === 'B' && ['arrival', 'lesson'].includes(String(story[0].state))))
        throw new Error('请先完成当前初行剧情。');
    const [combat] = await connection.execute("SELECT s.id FROM combat_sessions s JOIN combat_members m ON m.session_id=s.id WHERE m.character_id=? AND s.state='active' LIMIT 1", [id]);
    const [pvp] = await connection.execute("SELECT id FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?) LIMIT 1", [id, id]);
    if (combat.length || pvp.length)
        throw new Error('请在战斗结束后打开宝箱。');
};
const previewOpeningChest = async (user, code, quantity) => withTransaction(async (connection) => {
    const table = chestTables[code];
    if (!table || !Number.isInteger(quantity) || quantity < 1 || quantity > 100)
        throw new Error('请选择有效宝箱与1～100的整数数量。');
    const character = await openingCharacter(connection, user, true);
    await canOpen(connection, Number(character.id));
    const [stock] = await connection.execute('SELECT p.quantity FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND i.code=? FOR UPDATE', [character.id, code]);
    if (Number(stock[0]?.quantity ?? 0) < quantity)
        throw new Error('背包中的宝箱数量不足。');
    const [existing] = await connection.execute("SELECT token FROM opening_chest_requests WHERE character_id=? AND chest_code=? AND table_version=? AND quantity=? AND state='preview' ORDER BY created_at DESC LIMIT 1", [character.id, code, table.version, quantity]);
    if (existing[0])
        return { token: String(existing[0].token), code, quantity };
    const token = randomUUID();
    await connection.execute('INSERT INTO opening_chest_requests (token,character_id,chest_code,table_version,quantity,result_json) VALUES (?,?,?,?,?,?)', [token, character.id, code, table.version, quantity, JSON.stringify({ sealed: rollChest(table, quantity) })]);
    return { token, code, quantity };
});
const confirmOpeningChest = async (user, token) => withTransaction(async (connection) => {
    if (!/^[a-f\d-]{36}$/i.test(token))
        throw new Error('开箱凭据无效。');
    const character = await openingCharacter(connection, user, true);
    const [requests] = await connection.execute('SELECT * FROM opening_chest_requests WHERE token=? AND character_id=? FOR UPDATE', [token, character.id]);
    const request = requests[0];
    if (!request)
        throw new Error('这份开箱凭据不属于你。');
    if (request.state === 'complete')
        return typeof request.result_json === 'string' ? JSON.parse(request.result_json) : request.result_json;
    await canOpen(connection, Number(character.id));
    const table = chestTableForVersion(String(request.chest_code), Number(request.table_version));
    if (!table)
        throw new Error('这份宝箱记录的版本暂不可读取，请联系管理员保留原开箱凭据。');
    const [stock] = await connection.execute('SELECT p.*,i.weight FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND i.code=? FOR UPDATE', [character.id, request.chest_code]);
    if (Number(stock[0]?.quantity ?? 0) < Number(request.quantity))
        throw new Error('宝箱数量不足，本次没有扣除。');
    const saved = typeof request.result_json === 'string' ? JSON.parse(request.result_json) : request.result_json;
    if (!saved?.sealed)
        throw new Error('这份开箱凭据已失效，请重新查看内容。');
    const outputs = saved.sealed;
    const codes = [...new Set(outputs.map(o => o.code))];
    const [definitions] = await connection.execute(`SELECT id,code,name,weight FROM item_definitions WHERE code IN (${codes.map(() => '?').join(',')})`, codes);
    const byCode = new Map(definitions.map(item => [String(item.code), item]));
    if (byCode.size !== codes.length)
        throw new Error('宝箱内容未初始化完整，本次没有扣除。');
    const [weights] = await connection.execute(`SELECT COALESCE((SELECT SUM(p.quantity*i.weight) FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=?),0)+COALESCE((SELECT SUM(i.weight) FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.character_id=?),0) AS weight`, [character.id, character.id]);
    const capacity = encumbrance(await effectiveCharacterAttributes(connection, character, Number(character.id)), 0).capacity;
    const added = outputs.reduce((sum, o) => sum + Number(byCode.get(o.code).weight) * o.quantity, 0) - Number(stock[0].weight) * Number(request.quantity);
    if (Number(weights[0].weight) + added > capacity)
        throw new Error('背包承载不足，整批未扣箱。请整理背包后再开。');
    await consumeInventory(connection, Number(character.id), Number(stock[0].item_id), Number(request.quantity));
    const items = [];
    for (const output of outputs) {
        const item = byCode.get(output.code);
        if (output.equipment) {
            for (let count = 0; count < output.quantity; count++) {
                const gear = await grantOpeningEquipment(connection, Number(character.id), output.code);
                items.push({ ...gear, quantity: 1 });
            }
        }
        else {
            await grantInventory(connection, Number(character.id), Number(item.id), { personal: output.quantity, trade: 0, unbound: 0 });
            await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [character.id, item.id]);
            const prior = items.find(i => !i.id && i.name === item.name);
            if (prior)
                prior.quantity += output.quantity;
            else
                items.push({ name: String(item.name), quantity: output.quantity });
        }
    }
    const result = { quantity: Number(request.quantity), items };
    await connection.execute("UPDATE opening_chest_requests SET state='complete',result_json=? WHERE token=?", [JSON.stringify(result), token]);
    return result;
});
const openingChestResult = async (user, token) => {
    const pool = await getPool();
    const character = await openingCharacter(pool, user);
    const [rows] = await pool.execute("SELECT result_json FROM opening_chest_requests WHERE token=? AND character_id=? AND state='complete'", [token, character.id]);
    if (!rows[0])
        throw new Error('没有可查看的开箱记录。');
    return typeof rows[0].result_json === 'string' ? JSON.parse(rows[0].result_json) : rows[0].result_json;
};

export { confirmOpeningChest, grantCrimsonArmor, grantOpeningEquipment, openingChestResult, previewOpeningChest };
