import { getPool, withTransaction } from '../database/pool.js';
import { requireAdministrator } from './permission.service.js';

const PAGE_SIZE = 5;
const pageInfo = (page, total) => ({ page: Math.max(1, Math.min(Math.max(1, Math.ceil(total / PAGE_SIZE)), page)), totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
const validQuantity = (quantity) => {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999999)
        throw new Error('数量必须是 1 至 999999 之间的整数。');
    return quantity;
};
const currencyCopperValue = {
    copper_coin: 1,
    silver_coin: 100,
    gold_coin: 10000
};
const characterFor = async (connection, qqUserId, lock = false) => {
    const [rows] = await connection.execute(`SELECT c.id,c.name FROM characters c JOIN players p ON p.id=c.player_id
    WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
    if (!rows[0])
        throw new Error('请先注册角色。');
    return rows[0];
};
const registeredMailRecipient = async (qqUserId) => {
    const pool = await getPool();
    return characterFor(pool, qqUserId);
};
const itemFor = async (connection, itemKey) => {
    const numericId = /^\d+$/.test(itemKey) ? Number(itemKey) : 0;
    const [items] = await connection.execute('SELECT id,code,name,item_type,stackable FROM item_definitions WHERE code=? OR codex_id=? OR name=? OR id=? LIMIT 1', [itemKey, itemKey, itemKey, numericId]);
    const item = items[0];
    if (!item)
        throw new Error('未找到该物品，可使用物品代码、图鉴 ID、名称或数据库物品 ID。');
    return item;
};
const createItemMail = async (connection, characterId, item, quantity, title) => {
    const mailTitle = title?.trim().slice(0, 96) || `管理员发放·${item.name}`;
    const [result] = await connection.execute('INSERT INTO player_mails (character_id,title,content) VALUES (?,?,?)', [characterId, mailTitle, '管理员通过邮件向你发放了物品，请查收。']);
    await connection.execute('INSERT INTO player_mail_attachments (mail_id,item_id,quantity) VALUES (?,?,?)', [result.insertId, item.id, quantity]);
    return Number(result.insertId);
};
const mailRows = async (connection, characterId, keyword, limit, offset) => {
    const term = `%${keyword.trim()}%`;
    const paging = ' LIMIT ? OFFSET ?';
    const values = [characterId, term, term];
    if (offset !== undefined)
        values.push(limit, offset);
    const [rows] = await connection.execute(`SELECT m.id,m.title,m.content,m.received_at,m.claimed_at,
    GROUP_CONCAT(CONCAT('【',i.name,'】×',a.quantity) ORDER BY a.id SEPARATOR '、') AS attachment_summary,
    COUNT(a.id) AS attachment_count
    FROM player_mails m LEFT JOIN player_mail_attachments a ON a.mail_id=m.id LEFT JOIN item_definitions i ON i.id=a.item_id
    WHERE m.character_id=? AND m.deleted_at IS NULL AND (m.title LIKE ? OR m.content LIKE ?)
    GROUP BY m.id,m.title,m.content,m.received_at,m.claimed_at ORDER BY m.received_at DESC,m.id DESC${paging}`, values);
    return rows;
};
const playerMails = async (qqUserId, page = 1, keyword = '') => {
    const pool = await getPool();
    const character = await characterFor(pool, qqUserId);
    const term = `%${keyword.trim()}%`;
    const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM player_mails WHERE character_id=? AND deleted_at IS NULL AND (title LIKE ? OR content LIKE ?)', [character.id, term, term]);
    const paging = pageInfo(page, Number(countRows[0]?.total ?? 0));
    const rows = await mailRows(pool, character.id, keyword, PAGE_SIZE, (paging.page - 1) * PAGE_SIZE);
    return { mails: rows.map(row => ({ id: Number(row.id), title: row.title, content: row.content, receivedAt: row.received_at, claimed: Boolean(row.claimed_at), attachmentCount: Number(row.attachment_count), attachments: row.attachment_summary ?? '无' })), ...paging, keyword: keyword.trim() };
};
const mailDetail = async (qqUserId, mailId) => {
    const pool = await getPool();
    const character = await characterFor(pool, qqUserId);
    const [rows] = await pool.execute(`SELECT m.id,m.title,m.content,m.received_at,m.claimed_at,
    GROUP_CONCAT(CONCAT('【',i.name,'】×',a.quantity) ORDER BY a.id SEPARATOR '、') AS attachment_summary,
    COUNT(a.id) AS attachment_count
    FROM player_mails m LEFT JOIN player_mail_attachments a ON a.mail_id=m.id LEFT JOIN item_definitions i ON i.id=a.item_id
    WHERE m.id=? AND m.character_id=? AND m.deleted_at IS NULL
    GROUP BY m.id,m.title,m.content,m.received_at,m.claimed_at`, [mailId, character.id]);
    const mail = rows[0];
    if (!mail)
        throw new Error('邮件不存在或已被删除。');
    return { id: Number(mail.id), title: mail.title, content: mail.content, receivedAt: mail.received_at, claimed: Boolean(mail.claimed_at), attachmentCount: Number(mail.attachment_count), attachments: mail.attachment_summary ?? '无' };
};
const claimMailForCharacter = async (connection, characterId, mailId) => {
    const [mails] = await connection.execute('SELECT id,claimed_at FROM player_mails WHERE id=? AND character_id=? AND deleted_at IS NULL FOR UPDATE', [mailId, characterId]);
    const mail = mails[0];
    if (!mail)
        throw new Error('邮件不存在或已被删除。');
    if (mail.claimed_at)
        throw new Error('这封邮件的附件已经领取。');
    const [attachments] = await connection.execute(`SELECT a.item_id,a.quantity,i.id,i.code,i.name,i.item_type,i.stackable
    FROM player_mail_attachments a JOIN item_definitions i ON i.id=a.item_id WHERE a.mail_id=? FOR UPDATE`, [mail.id]);
    if (!attachments.length)
        throw new Error('这封邮件没有可领取的附件。');
    for (const attachment of attachments) {
        const quantity = Number(attachment.quantity);
        const copperValue = currencyCopperValue[attachment.code];
        if (copperValue) {
            await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [copperValue * quantity, characterId]);
        }
        else if (attachment.item_type === 'equipment') {
            for (let index = 0; index < quantity; index += 1)
                await connection.execute('INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max) VALUES (?,?,100,100,100)', [characterId, attachment.id]);
        }
        else {
            await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [characterId, attachment.id, quantity]);
        }
        await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, attachment.id]);
    }
    await connection.execute('UPDATE player_mails SET claimed_at=NOW() WHERE id=?', [mail.id]);
    return { items: attachments.map(item => ({ name: item.name, quantity: Number(item.quantity) })) };
};
const claimMail = async (qqUserId, mailId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    return claimMailForCharacter(connection, character.id, mailId);
});
const claimAllMails = async (qqUserId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    const [mails] = await connection.execute(`SELECT m.id FROM player_mails m
    WHERE m.character_id=? AND m.deleted_at IS NULL AND m.claimed_at IS NULL
    AND EXISTS (SELECT 1 FROM player_mail_attachments a WHERE a.mail_id=m.id)
    ORDER BY m.id FOR UPDATE`, [character.id]);
    if (!mails.length)
        throw new Error('没有可一键领取的邮件附件。');
    const received = new Map();
    for (const mail of mails) {
        const result = await claimMailForCharacter(connection, character.id, Number(mail.id));
        for (const item of result.items)
            received.set(item.name, (received.get(item.name) ?? 0) + item.quantity);
    }
    return { mailCount: mails.length, items: [...received].map(([name, quantity]) => ({ name, quantity })) };
});
const deleteMail = async (qqUserId, mailId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    const [rows] = await connection.execute('SELECT id,claimed_at FROM player_mails WHERE id=? AND character_id=? AND deleted_at IS NULL FOR UPDATE', [mailId, character.id]);
    const mail = rows[0];
    if (!mail)
        throw new Error('邮件不存在或已被删除。');
    const [attachmentRows] = await connection.execute('SELECT COUNT(*) AS total FROM player_mail_attachments WHERE mail_id=?', [mail.id]);
    if (!mail.claimed_at && Number(attachmentRows[0]?.total ?? 0) > 0)
        throw new Error('请先领取附件，再删除邮件。');
    await connection.execute('UPDATE player_mails SET deleted_at=NOW() WHERE id=?', [mail.id]);
});
const sendAdminItemMail = async (adminQqUserId, targetQqUserId, itemKey, quantity, title) => withTransaction(async (connection) => {
    await requireAdministrator(adminQqUserId, connection);
    const amount = validQuantity(quantity);
    const target = await characterFor(connection, targetQqUserId, true);
    const item = await itemFor(connection, itemKey);
    const mailId = await createItemMail(connection, target.id, item, amount, title);
    return { mailId, targetName: target.name, itemName: item.name, quantity: amount };
});
const sendAdminItemMailToAll = async (adminQqUserId, itemKey, quantity, title) => withTransaction(async (connection) => {
    await requireAdministrator(adminQqUserId, connection);
    const amount = validQuantity(quantity);
    const item = await itemFor(connection, itemKey);
    const [targets] = await connection.execute('SELECT c.id,c.name FROM characters c JOIN players p ON p.id=c.player_id FOR UPDATE');
    if (!targets.length)
        throw new Error('当前没有已注册角色，无法全服发放。');
    for (const target of targets)
        await createItemMail(connection, target.id, item, amount, title);
    return { targetCount: targets.length, itemName: item.name, quantity: amount };
});

export { claimAllMails, claimMail, deleteMail, mailDetail, playerMails, registeredMailRecipient, sendAdminItemMail, sendAdminItemMailToAll };
