import { randomInt } from 'node:crypto';
import { withTransaction } from '../database/pool.js';
import { recalculateCharacterStats } from './character.service.js';

const businessDate = () => {
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};
const characterAtChurch = async (connection, qqUserId) => {
    const [characters] = await connection.execute(`SELECT c.id,c.player_id,c.name,c.current_region_id,c.pos_x,c.pos_y,c.pos_z,c.activity_status FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE`, [qqUserId]);
    const character = characters[0];
    if (!character)
        throw new Error('请先完成角色注册。');
    if (character.activity_status !== 'active')
        throw new Error('当前状态无法进行祈福。');
    const [churchRows] = await connection.execute(`SELECT region_id,pos_x,pos_y,pos_z FROM map_npcs WHERE code='saint_church' LIMIT 1`);
    const church = churchRows[0];
    if (!church || Number(character.current_region_id) !== Number(church.region_id) || Number(character.pos_x) !== Number(church.pos_x) || Number(character.pos_y) !== Number(church.pos_y) || Number(character.pos_z) !== Number(church.pos_z))
        throw new Error('请先来到圣恩教堂的祈福台前。');
    return character;
};
const addItem = async (connection, characterId, code, quantity) => {
    await connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity) SELECT ?,id,? FROM item_definitions WHERE code=? ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()`, [characterId, quantity, code]);
    await connection.execute(`INSERT IGNORE INTO player_item_codex (character_id,item_id) SELECT ?,id FROM item_definitions WHERE code=?`, [characterId, code]);
};
const claimChurchBlessing = (qqUserId) => withTransaction(async (connection) => {
    const character = await characterAtChurch(connection, qqUserId);
    const date = businessDate();
    const [insertResult] = await connection.execute(`INSERT IGNORE INTO player_daily_blessings (character_id,business_date) VALUES (?,?)`, [character.id, date]);
    if (!Number(insertResult.affectedRows))
        throw new Error('今天的祈福已经完成，请明日再来。');
    await connection.execute(`INSERT INTO player_timed_buffs (character_id,buff_code,expires_at,experience_multiplier,all_core_attributes_multiplier,source) VALUES (?,'church_blessing',DATE_ADD(NOW(),INTERVAL 1 HOUR),1.25,1.05,'church_blessing') ON DUPLICATE KEY UPDATE expires_at=DATE_ADD(NOW(),INTERVAL 1 HOUR),experience_multiplier=1.25,all_core_attributes_multiplier=1.05,source='church_blessing'`, [character.id]);
    const [oaths] = await connection.execute(`SELECT id FROM player_oaths WHERE (character_low_id=? OR character_high_id=?) AND status='active' LIMIT 1`, [character.id, character.id]);
    const bouquet = oaths[0] ? 1 : 0;
    const fruit = oaths[0] && randomInt(100) < 10 ? 1 : 0;
    if (bouquet)
        await addItem(connection, Number(character.id), 'heart_bouquet', bouquet);
    if (fruit)
        await addItem(connection, Number(character.id), 'resonance_fruit', fruit);
    await connection.execute(`UPDATE player_daily_blessings SET reward_bouquet_quantity=?,reward_fruit_quantity=? WHERE character_id=? AND business_date=?`, [bouquet, fruit, character.id, date]);
    await connection.execute(`INSERT INTO player_events (player_id,event_type,payload) VALUES (?,?,?)`, [character.player_id, 'social.blessing.claimed', JSON.stringify({ date, bouquet, fruit, expiresInMinutes: 60 })]);
    await recalculateCharacterStats(connection, Number(character.id));
    return { bouquet, fruit, expiresInMinutes: 60, isOath: Boolean(oaths[0]) };
});

export { claimChurchBlessing };
