import { getPool, withTransaction } from '../database/pool.js';
import { automatonFor, recordAutomatonEvent } from './automaton.service.js';
import { recordWebOperation } from './operation-journal.service.js';
import { readPortrait } from './automaton-portrait-image.js';
import { uploadPortraitToHost } from './automaton-portrait-host.js';
import { cleanupPortrait } from './automaton-portrait-upload.js';

const statuses = ['pending', 'approved', 'rejected', 'cancelled'];
const adminPortraitReviews = async (query) => {
    const status = String(query.status ?? 'pending'), keyword = String(query.keyword ?? '').trim().slice(0, 80);
    if (status && !statuses.includes(status))
        throw new Error('审核状态无效。');
    const conditions = [], values = [];
    if (status) {
        conditions.push('r.status=?');
        values.push(status);
    }
    if (keyword) {
        conditions.push('(c.name LIKE ? OR p.qq_user_id LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(a.state_json,\'$.name\')) LIKE ?)');
        values.push(...Array(3).fill('%' + keyword + '%'));
    }
    const from = 'FROM automaton_portrait_reviews r JOIN characters c ON c.id=r.character_id JOIN players p ON p.id=c.player_id JOIN player_automatons a ON a.id=r.automaton_id';
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '', pool = await getPool();
    const [count] = await pool.execute('SELECT COUNT(*) total ' + from + where, values);
    const total = Number(count[0]?.total), pages = Math.max(1, Math.ceil(total / 20)), page = Math.min(pages, Math.max(1, Math.floor(Number(query.page) || 1)));
    const [rows] = await pool.execute("SELECT r.id,r.automaton_id,r.status,r.reason,r.reviewer,r.created_at,r.reviewed_at,c.name player_name,p.qq_user_id,JSON_UNQUOTE(JSON_EXTRACT(a.state_json,'$.name')) automaton_name " + from + where + ' ORDER BY r.id DESC LIMIT 20 OFFSET ?', [...values, (page - 1) * 20]);
    return { page, pages, total, entries: rows.map(r => ({ id: Number(r.id), automatonId: Number(r.automaton_id), playerName: r.player_name, userId: r.qq_user_id, name: r.automaton_name, status: r.status, reason: r.reason, reviewer: r.reviewer, createdAt: r.created_at, reviewedAt: r.reviewed_at })) };
};
const adminPortraitPreview = async (id) => {
    const [rows] = await (await getPool()).execute("SELECT file_key FROM automaton_portrait_reviews WHERE id=? AND status='pending'", [id]);
    if (!rows[0])
        throw new Error('待审图片不存在或已处理。');
    return readPortrait(String(rows[0].file_key));
};
const decidePortraitReview = async (actor, id, decision, reasonValue) => {
    if (!['owner', 'admin'].includes(actor.role))
        throw new Error('只读账号不能审核形象。');
    if (!Number.isSafeInteger(id) || id < 1 || !['approve', 'reject'].includes(String(decision)))
        throw new Error('审核操作无效。');
    const approve = decision === 'approve', reason = String(reasonValue ?? '').trim().slice(0, 500);
    if (!reason)
        throw new Error('请填写审核说明；驳回原因会显示给玩家。');
    const result = await withTransaction(async (c) => {
        const [found] = await c.execute('SELECT character_id,automaton_id FROM automaton_portrait_reviews WHERE id=?', [id]);
        if (!found[0])
            throw new Error('审核记录不存在。');
        const characterId = Number(found[0].character_id), automatonId = Number(found[0].automaton_id);
        await c.execute('SELECT id FROM characters WHERE id=? FOR UPDATE', [characterId]);
        const { state } = await automatonFor(c, characterId, automatonId);
        const [rows] = await c.execute('SELECT * FROM automaton_portrait_reviews WHERE id=? FOR UPDATE', [id]);
        const row = rows[0];
        if (row.status !== 'pending')
            throw new Error('此图片已处理，请刷新审核列表。');
        const key = String(row.file_key);
        if (approve) {
            const url = await uploadPortraitToHost(await readPortrait(key), key);
            const portrait = { key, width: Number(row.width), height: Number(row.height), url };
            await c.execute("UPDATE player_automatons SET state_json=JSON_SET(state_json,'$.portrait',CAST(? AS JSON)) WHERE id=?", [JSON.stringify(portrait), automatonId]);
            await recordAutomatonEvent(c, automatonId, characterId, 'portrait:' + row.token, 'portrait_changed', { name: state.name, key });
        }
        const status = approve ? 'approved' : 'rejected';
        await c.execute('UPDATE automaton_portrait_reviews SET status=?,reason=?,reviewer=?,reviewed_at=NOW() WHERE id=?', [status, reason, actor.username, id]);
        const operation = await recordWebOperation({ actorRef: actor.username, actionType: 'portrait.' + status, reason, target: { kind: 'automaton', id: automatonId, characterId }, request: { reviewId: id }, result: { status } }, c);
        return { status, operationId: operation.id, cleanupKey: approve ? state.portrait?.key : key };
    });
    await cleanupPortrait(result.cleanupKey);
    return { status: result.status, operationId: result.operationId };
};

export { adminPortraitPreview, adminPortraitReviews, decidePortraitReview };
