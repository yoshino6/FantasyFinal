import { recordAchievement } from './achievement-events.js';
import { randomUUID } from 'node:crypto';
import { ownedTalent, readTalentData, saveTalentData, talentWhole } from './talent-data.js';
import { ordinaryTalentItem } from './talent-rewards.js';

const talentBeginGather = async (connection, character, resourceId) => {
    const id = Number(character.id), talent = await ownedTalent(connection, id);
    if (!talent)
        return;
    const data = await readTalentData(connection, id);
    const risk = talent.number === 'H06' && data.settings.riskGather === true, seal = talent.number === 'I08' && data.settings.sealGather === true;
    if (risk) {
        const cost = Math.max(1, Math.ceil(Number(character.hp_max) * .15));
        if (Number(character.current_hp) <= cost)
            throw new Error('险采需要支付15%最大HP，并保留至少1HP。');
        character.current_hp = Number(character.current_hp) - cost;
        await connection.execute('UPDATE characters SET current_hp=? WHERE id=?', [character.current_hp, id]);
    }
    data.flags.mining = { resourceId, risk, seal };
    await saveTalentData(connection, id, data);
};
const talentGatherReward = async (connection, character, itemId, base, kind) => {
    const id = Number(character.id), talent = await ownedTalent(connection, id);
    if (!talent)
        return base;
    const [items] = await connection.execute('SELECT * FROM item_definitions WHERE id=?', [itemId]);
    if (!items[0] || !ordinaryTalentItem(items[0]))
        return base;
    const data = await readTalentData(connection, id);
    let f = 1;
    if (talent.number === 'E01')
        f = 3;
    if (talent.number === 'B07' && /矿|石|金属/.test(kind))
        f = 3.5;
    if (talent.number === 'H06' && data.flags.mining?.risk)
        f = Math.random() < .8 ? 4.5 : 0;
    let amount = talentWhole(data, `gather:${itemId}`, base, f);
    if (talent.number === 'I08' && data.flags.mining?.seal) {
        data.jobs.push({ id: randomUUID(), kind: 'sealed', created: Date.now(), ready: Date.now() + 86400000, payload: { itemId, base, amount: talentWhole(data, `sealed:${itemId}`, base, 3.5) } });
        amount = 0;
    }
    if (talent.number === 'H06' && data.flags.mining?.risk && amount > 0)
        recordAchievement(connection, id, ['ACH_H07']);
    delete data.flags.mining;
    await saveTalentData(connection, id, data);
    return amount;
};
const pointKey = (p) => `${p.regionId}:${p.x}:${p.y}:${p.z}`;
const talentMovementFactor = async (connection, character, destination) => {
    const id = Number(character.id), talent = await ownedTalent(connection, id);
    if (!talent)
        return 1;
    const data = await readTalentData(connection, id), from = { x: Number(character.pos_x), y: Number(character.pos_y), z: Number(character.pos_z), regionId: Number(character.current_region_id) };
    let factor = talent.number === 'B01' || talent.number === 'F02' ? .5 : 1;
    if (talent.number === 'B04' && data.flags.routes?.includes(`${pointKey(from)}>${pointKey(destination)}`))
        factor = .4;
    if (talent.number === 'B10') {
        const pending = data.flags.fireflyPending;
        if (pending?.to === pointKey(from))
            data.flags.fireflyRoute = pending.path;
        delete data.flags.fireflyPending;
        const path = [...(data.flags.fireflyRoute ?? [])];
        if (data.settings.returning && path.length > 1 && path.at(-1) === pointKey(from) && path.at(-2) === pointKey(destination)) {
            factor = .25;
            path.pop();
        }
        else if (!data.settings.returning) {
            const [safe] = await connection.execute("SELECT 1 FROM map_npcs WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND interaction_kind='building' AND (code LIKE '%guild%' OR code LIKE '%inn%') LIMIT 1", [from.regionId, from.x, from.y, from.z]);
            if (path.at(-1) === pointKey(from) || safe.length) {
                if (!path.length || path.at(-1) !== pointKey(from))
                    path.splice(0, path.length, pointKey(from));
                path.push(pointKey(destination));
                factor = .6;
            }
        }
        data.flags.fireflyPending = { to: pointKey(destination), path };
    }
    data.flags.lastPath = { from, to: destination };
    await saveTalentData(connection, id, data);
    return factor;
};
const talentMovementArrived = async (connection, character, destination, prepared) => {
    const id = Number(character.id), talent = await ownedTalent(connection, id);
    if (talent?.number !== 'B10')
        return;
    const from = { x: Number(character.pos_x), y: Number(character.pos_y), z: Number(character.pos_z), regionId: Number(character.current_region_id) };
    if (pointKey(from) === pointKey(destination))
        return;
    if (!prepared)
        await talentMovementFactor(connection, character, destination);
    const data = await readTalentData(connection, id);
    if (data.flags.fireflyPending?.to === pointKey(destination)) {
        data.flags.fireflyRoute = data.flags.fireflyPending.path;
        delete data.flags.fireflyPending;
        await saveTalentData(connection, id, data);
    }
};

export { talentBeginGather, talentGatherReward, talentMovementArrived, talentMovementFactor };
