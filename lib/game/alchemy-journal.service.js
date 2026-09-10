import { currentSecondaryShop } from './secondary-shop-context.js';
import { randomUUID } from 'node:crypto';
import { withTransaction, getPool } from '../database/pool.js';
import { alchemyGroupKey, updateAlchemyStatistics, emptyAlchemyStatistics, alchemyStability, alchemyFingerprint, alchemyCombinationKey } from './alchemy-journal.js';

const craftJson = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
const craftCharacterId = async (connection, userId, lock = false) => {
    const [rows] = await connection.execute(`SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [userId]);
    if (!rows[0])
        throw new Error('请先注册角色。');
    return Number(rows[0].id);
};
const invalidateCraftRequests = async (connection, characterId, kind = 'alchemy') => {
    await connection.execute("UPDATE player_craft_requests SET state='cancelled' WHERE character_id=? AND kind=? AND state='pending'", [characterId, kind]);
};
const createCraftRequest = async (connection, characterId, kind, snapshot, minutes = 2) => {
    await invalidateCraftRequests(connection, characterId, kind);
    const token = randomUUID();
    await connection.execute('INSERT INTO player_craft_requests (token,character_id,kind,snapshot_json,expires_at) VALUES (?,?,?,?,DATE_ADD(NOW(),INTERVAL ? MINUTE))', [token, characterId, kind, JSON.stringify(currentSecondaryShop() ? { ...snapshot, _shopSource: currentSecondaryShop().shop } : snapshot), minutes]);
    return token;
};
const craftRequestFor = async (connection, characterId, kind, token) => {
    const [rows] = await connection.execute('SELECT * FROM player_craft_requests WHERE token=? AND character_id=? AND kind=? FOR UPDATE', [token, characterId, kind]);
    const row = rows[0];
    if (!row)
        throw new Error('该确认不属于你或已经失效，请重新打开面板。');
    if (row.state !== 'complete' && (row.state !== 'pending' || new Date(row.expires_at).getTime() <= Date.now()))
        throw new Error('本次确认已取消或过期，请重新打开面板。');
    const snapshot = craftJson(row.snapshot_json);
    if ((snapshot?._shopSource ?? null) !== (currentSecondaryShop()?.shop ?? null))
        throw new Error('确认来源不一致，请从当前店铺或个人副职业面板重新确认。');
    return { snapshot, result: row.state === 'complete' ? craftJson(row.result_json) : null };
};
const completeCraftRequest = async (connection, characterId, token, result) => {
    await connection.execute("UPDATE player_craft_requests SET state='complete',result_json=? WHERE token=? AND character_id=? AND state='pending'", [JSON.stringify(result), token, characterId]);
};
const recordAlchemyJournal = async (connection, characterId, token, snapshot, batches, result) => {
    const group = alchemyGroupKey(snapshot);
    const [old] = await connection.execute('SELECT stats_json,ever_stable FROM player_alchemy_stability WHERE character_id=? AND group_key=? FOR UPDATE', [characterId, group]);
    const stats = updateAlchemyStatistics(old[0] ? craftJson(old[0].stats_json) : emptyAlchemyStatistics(), batches);
    const stability = alchemyStability(stats);
    if (snapshot.kind === 'purification')
        stability.stable = false;
    const journalResult = { ...result, statistics: { ...stats, ...stability, everStable: Boolean(old[0]?.ever_stable) || stability.stable } };
    const [insert] = await connection.execute('INSERT INTO player_alchemy_journal (character_id,request_token,kind,combination_key,group_key,snapshot_json,batches_json,result_json) VALUES (?,?,?,?,?,?,?,?)', [characterId, token, snapshot.kind, snapshot.kind === 'purification' ? alchemyFingerprint(snapshot.ingredients.map(item => item.id)) : alchemyCombinationKey(snapshot.ingredients), group, JSON.stringify(snapshot), JSON.stringify(batches), JSON.stringify(journalResult)]);
    const journalId = Number(insert.insertId);
    const all = [...batches.flatMap(batch => batch.consumed ?? snapshot.ingredients), ...batches.flatMap(batch => batch.outputs)];
    for (const item of all)
        await connection.execute('INSERT INTO player_alchemy_journal_items (journal_id,role,item_id,code,name,quantity) VALUES (?,?,?,?,?,?)', [journalId, item.role, item.id, item.code, item.name, item.quantity]);
    await connection.execute('INSERT INTO player_alchemy_stability (character_id,group_key,journal_id,stats_json,stable,ever_stable) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE journal_id=VALUES(journal_id),stats_json=VALUES(stats_json),stable=VALUES(stable),ever_stable=GREATEST(ever_stable,VALUES(ever_stable))', [characterId, group, journalId, JSON.stringify(stats), Number(stability.stable), Number(stability.stable)]);
    return journalId;
};
const alchemyJournalDetail = async (userId, id) => {
    const pool = await getPool();
    const characterId = await craftCharacterId(pool, userId);
    await requireJournalAlchemist(pool, characterId);
    const [rows] = await pool.execute('SELECT * FROM player_alchemy_journal WHERE character_id=? AND id=?', [characterId, id]);
    if (!rows[0])
        throw new Error('未找到你的这条炼金手记。');
    return parseJournal(rows[0]);
};
const requireJournalAlchemist = async (pool, characterId) => {
    const [rows] = await pool.execute("SELECT id FROM characters WHERE id=? AND secondary_profession_code='alchemist'", [characterId]);
    if (!rows.length)
        throw new Error('炼金手记仅对当前炼金师开放。');
};
const parseJournal = (row) => ({ id: Number(row.id), time: new Date(row.created_at), token: String(row.request_token), snapshot: craftJson(row.snapshot_json), batches: craftJson(row.batches_json), result: craftJson(row.result_json) });
const alchemyJournalPage = async (userId, page = 1, scope = '全部记录', field = '全部', keyword = '', anchor = 0) => {
    if (scope === '造物')
        scope = '点灵';
    if (!['全部记录', '稳定组合', '点灵', '育成', '成功', '失败'].includes(scope) || !['全部', '耗材', '成果'].includes(field))
        throw new Error('未知手记筛选条件。');
    const pool = await getPool();
    const characterId = await craftCharacterId(pool, userId);
    await requireJournalAlchemist(pool, characterId);
    if (!anchor) {
        const [rows] = await pool.execute('SELECT COALESCE(MAX(id),0) AS anchor FROM player_alchemy_journal WHERE character_id=?', [characterId]);
        anchor = Number(rows[0]?.anchor ?? 0);
    }
    const values = [characterId, anchor];
    let where = 'j.character_id=? AND j.id<=?';
    if (scope === '点灵' || scope === '育成') {
        where += ' AND j.kind=?';
        values.push(scope === '点灵' ? '造物' : scope);
    }
    if (scope === '成功' || scope === '失败') {
        where += " AND JSON_CONTAINS(j.batches_json,?)";
        values.push(JSON.stringify({ success: scope === '成功' }));
    }
    if (scope === '稳定组合')
        where += " AND JSON_EXTRACT(j.result_json,'$.statistics.stable')=true AND NOT EXISTS (SELECT 1 FROM player_alchemy_journal newer WHERE newer.character_id=j.character_id AND newer.group_key=j.group_key AND newer.id>j.id AND newer.id<=?)";
    if (scope === '稳定组合')
        values.push(anchor);
    keyword = keyword.trim().slice(0, 80);
    if (keyword) {
        const role = field === '耗材' ? "AND ji.role<>'output'" : field === '成果' ? "AND ji.role='output'" : '';
        where += ` AND EXISTS (SELECT 1 FROM player_alchemy_journal_items ji LEFT JOIN item_definitions i ON i.id=ji.item_id WHERE ji.journal_id=j.id ${role} AND (LOCATE(LOWER(?),LOWER(ji.name))>0 OR LOCATE(LOWER(?),LOWER(ji.code))>0 OR LOCATE(LOWER(?),LOWER(COALESCE(i.name,'')))>0))`;
        values.push(keyword, keyword, keyword);
    }
    const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM player_alchemy_journal j WHERE ${where}`, values);
    const count = Number(counts[0]?.total ?? 0);
    const pages = Math.max(1, Math.ceil(count / 5));
    page = Math.min(pages, Math.max(1, Math.floor(page) || 1));
    const [rows] = await pool.execute(`SELECT j.* FROM player_alchemy_journal j WHERE ${where} ORDER BY j.id DESC LIMIT 5 OFFSET ${(page - 1) * 5}`, values);
    return { entries: rows.map(parseJournal), page, pages, count, anchor, scope, field, keyword };
};
const cancelCraftPreview = async (userId, token, kind = 'alchemy') => withTransaction(async (connection) => {
    const id = await craftCharacterId(connection, userId, true);
    const request = await craftRequestFor(connection, id, kind, token);
    if (request.result)
        throw new Error('这次操作已完成，可查看原结果。');
    await connection.execute("UPDATE player_craft_requests SET state='cancelled' WHERE token=? AND character_id=?", [token, id]);
});

export { alchemyJournalDetail, alchemyJournalPage, cancelCraftPreview, completeCraftRequest, craftCharacterId, craftJson, craftRequestFor, createCraftRequest, invalidateCraftRequests, recordAlchemyJournal };
