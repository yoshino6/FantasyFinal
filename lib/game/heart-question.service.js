import { randomUUID } from 'node:crypto';
import { withTransaction } from '../database/pool.js';
import { playerGrowthShares } from './growth-rules.js';
import { attributes } from './types.js';
import { greatHeartCopy, normalHeartCopy, heartCards } from './heart-question-content.js';
import { calculateHeartGrowthChange } from './heart-question-rules.js';
import { recordCharacterOperation } from './character-operation.service.js';

const codeFor = ['A', 'B', 'C', 'D', 'E', 'F'];
const heartAttributeNames = { constitution: '体质', spirit: '精神', strength: '力量', intelligence: '智力', agility: '敏捷', perception: '感知' };
const parse = (value) => typeof value === 'string' ? JSON.parse(value) : (value ?? {});
const empty = () => Object.fromEntries(attributes.map(key => [key, 0]));
const units = (value) => Math.round(value * 10);
const vector = (value) => Object.fromEntries(attributes.map(key => [key, Number(parse(value)[key] ?? 0)]));
const ticketView = (row) => ({ id: Number(row.id), toLevel: Number(row.to_level), card: typeof row.event_snapshot === 'string' ? JSON.parse(row.event_snapshot) : row.event_snapshot, status: row.status });
const ensureHeartGrowth = async (connection, characterId, birth) => {
    const [existing] = await connection.execute('SELECT * FROM character_heart_growth WHERE character_id=? FOR UPDATE', [characterId]);
    if (existing[0])
        return existing[0];
    let initial = birth;
    if (!initial) {
        const [rows] = await connection.execute(`SELECT c.*,pd.growth_json AS profession_growth FROM characters c LEFT JOIN profession_definitions pd ON pd.code=c.profession_code WHERE c.id=? FOR UPDATE`, [characterId]);
        const row = rows[0];
        if (!row)
            throw new Error('角色不存在。');
        const profession = parse(row.profession_growth);
        initial = Object.fromEntries(attributes.map(key => [key, Math.round((Number(row[`${key}_growth`]) - Number(profession[key] ?? 0)) * 10) / 10]));
    }
    const total = attributes.reduce((sum, key) => sum + units(initial[key]), 0);
    if (total < 0 || total > 120 || attributes.some(key => initial[key] < 0))
        throw new Error('历史角色的出生成长无法安全回建，请先核对成长来源。');
    await connection.execute('INSERT INTO character_heart_growth (character_id,birth_json,delta_json,offset_json) VALUES (?,?,?,?)', [characterId, JSON.stringify(initial), JSON.stringify(empty()), JSON.stringify(empty())]);
    const [created] = await connection.execute('SELECT * FROM character_heart_growth WHERE character_id=? FOR UPDATE', [characterId]);
    return created[0];
};
const heartGrowthAdjustment = async (connection, characterId) => {
    const [rows] = await connection.execute('SELECT delta_json,birth_json FROM character_heart_growth WHERE character_id=?', [characterId]);
    return rows[0] ? { delta: vector(rows[0].delta_json), birth: vector(rows[0].birth_json) } : null;
};
const applyHeartGrowthToRow = async (connection, characterId, row) => {
    const profile = await heartGrowthAdjustment(connection, characterId);
    if (!profile)
        return row;
    const adjusted = { ...row };
    for (const key of attributes) {
        const camel = `${key}Growth`;
        const growth = Number(row[`${key}_growth`] ?? row[camel] ?? 0) + profile.delta[key];
        adjusted[`${key}_growth`] = growth;
        if (camel in row)
            adjusted[camel] = growth;
    }
    return adjusted;
};
const heartAttributeCorrection = async (connection, characterId, key, level) => {
    const profile = await heartGrowthAdjustment(connection, characterId);
    return profile ? profile.delta[key] * playerGrowthShares(level) : 0;
};
const createHeartQuestionsForLevels = async (connection, characterId, fromLevel, toLevel, realmStage) => {
    const firstLevel = Math.max(11, fromLevel + 1);
    const lastLevel = Math.min(20, toLevel);
    if (realmStage < 2 || lastLevel < firstLevel)
        return;
    await ensureHeartGrowth(connection, characterId);
    const [recent] = await connection.execute('SELECT event_code FROM character_heart_questions WHERE character_id=? ORDER BY id DESC LIMIT 20', [characterId]);
    const excluded = new Set(recent.map(row => row.event_code));
    const [active] = await connection.execute("SELECT id FROM character_heart_questions WHERE character_id=? AND status='active' LIMIT 1", [characterId]);
    let activate = !active.length;
    for (let level = firstLevel; level <= lastLevel; level++) {
        const [sameLevel] = await connection.execute('SELECT id FROM character_heart_questions WHERE character_id=? AND to_level=?', [characterId, level]);
        if (sameLevel.length)
            continue;
        const candidates = heartCards.filter(card => !excluded.has(card.code));
        const card = candidates[Math.floor(Math.random() * candidates.length)] ?? heartCards[0];
        await connection.execute('INSERT INTO character_heart_questions (character_id,to_level,event_code,event_snapshot,status) VALUES (?,?,?,?,?)', [characterId, level, card.code, JSON.stringify(card), activate ? 'active' : 'queued']);
        activate = false;
        excluded.add(card.code);
    }
};
const refreshPendingHeartQuestionSnapshots = async (connection, characterId) => {
    const [rows] = await connection.execute("SELECT id,event_code,event_snapshot FROM character_heart_questions WHERE character_id=? AND status IN ('active','queued','deferred') FOR UPDATE", [characterId]);
    const currentCards = new Map(heartCards.map(card => [card.code, card]));
    for (const row of rows) {
        const card = currentCards.get(row.event_code);
        if (!card)
            continue;
        let version = 0;
        try {
            const snapshot = typeof row.event_snapshot === 'string' ? JSON.parse(row.event_snapshot) : row.event_snapshot;
            version = Number(snapshot?.version ?? 0);
        }
        catch {
            version = 0;
        }
        if (version === card.version)
            continue;
        await connection.execute('UPDATE character_heart_questions SET event_snapshot=? WHERE id=?', [JSON.stringify(card), Number(row.id)]);
    }
};
const ensureHeartQuestionsForCurrentLevel = async (connection, userId) => {
    const [rows] = await connection.execute('SELECT c.id,c.level,c.realm_stage FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [userId]);
    const character = rows[0];
    if (!character)
        return null;
    if (Number(character.realm_stage) >= 2 && Number(character.level) > 10) {
        await createHeartQuestionsForLevels(connection, Number(character.id), 10, Number(character.level), Number(character.realm_stage));
        await refreshPendingHeartQuestionSnapshots(connection, Number(character.id));
    }
    return character;
};
const activeHeartQuestion = async (userId) => withTransaction(async (connection) => {
    await ensureHeartQuestionsForCurrentLevel(connection, userId);
    const [rows] = await connection.execute(`SELECT q.* FROM character_heart_questions q JOIN characters c ON c.id=q.character_id JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND q.status='active' ORDER BY q.to_level,q.id LIMIT 1`, [userId]);
    return rows[0] ? ticketView(rows[0]) : null;
});
const pendingHeartQuestionCount = async (userId) => withTransaction(async (connection) => {
    await ensureHeartQuestionsForCurrentLevel(connection, userId);
    const [rows] = await connection.execute(`SELECT COUNT(*) AS count FROM character_heart_questions q JOIN characters c ON c.id=q.character_id JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND q.status IN ('active','queued','deferred')`, [userId]);
    return Number(rows[0]?.count ?? 0);
});
const openHeartQuestion = async (userId) => withTransaction(async (connection) => {
    const character = await ensureHeartQuestionsForCurrentLevel(connection, userId);
    if (!character)
        return null;
    const [tickets] = await connection.execute("SELECT * FROM character_heart_questions WHERE character_id=? AND status IN ('active','queued','deferred') ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,to_level,id LIMIT 1 FOR UPDATE", [character.id]);
    const ticket = tickets[0];
    if (!ticket)
        return null;
    if (ticket.status !== 'active')
        await connection.execute("UPDATE character_heart_questions SET status='active' WHERE id=?", [ticket.id]);
    return { ...ticketView(ticket), status: 'active' };
});
const openQueuedHeartQuestion = async (userId) => withTransaction(async (connection) => {
    const character = await ensureHeartQuestionsForCurrentLevel(connection, userId);
    if (!character)
        return null;
    const [active] = await connection.execute("SELECT * FROM character_heart_questions WHERE character_id=? AND status='active' ORDER BY to_level,id LIMIT 1 FOR UPDATE", [character.id]);
    if (active[0])
        return ticketView(active[0]);
    const [tickets] = await connection.execute("SELECT * FROM character_heart_questions WHERE character_id=? AND status='queued' ORDER BY to_level,id LIMIT 1 FOR UPDATE", [character.id]);
    const ticket = tickets[0];
    if (!ticket)
        return null;
    await connection.execute("UPDATE character_heart_questions SET status='active' WHERE id=?", [ticket.id]);
    return { ...ticketView(ticket), status: 'active' };
});
const skipHeartQuestion = async (userId, ticketId) => withTransaction(async (connection) => {
    const [rows] = await connection.execute(`SELECT q.* FROM character_heart_questions q JOIN characters c ON c.id=q.character_id JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND q.id=? FOR UPDATE`, [userId, ticketId]);
    const ticket = rows[0];
    if (!ticket || ticket.status !== 'active')
        throw new Error('这道问心题已失效，请重新打开当前题目。');
    await connection.execute("UPDATE character_heart_questions SET status='deferred' WHERE id=?", [ticket.id]);
    await recordCharacterOperation(connection, { characterId: Number(ticket.character_id), kind: 'heart.deferred', source: { system: 'heart_question', id: randomUUID(), step: 'deferred' }, outcome: '暂缓', summary: '暂缓回答窥尘问心', detail: { questionId: Number(ticket.id), toLevel: Number(ticket.to_level), eventCode: ticket.event_code } });
});
const answerHeartQuestion = async (userId, ticketId, code) => withTransaction(async (connection) => {
    const choiceIndex = codeFor.indexOf(code.toUpperCase());
    if (choiceIndex < 0)
        throw new Error('请从 A—F 中选择一个回答。');
    const [characters] = await connection.execute('SELECT c.id,c.level FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [userId]);
    const character = characters[0];
    if (!character)
        throw new Error('请先创建角色。');
    const profile = await ensureHeartGrowth(connection, Number(character.id));
    const [tickets] = await connection.execute('SELECT * FROM character_heart_questions WHERE id=? AND character_id=? FOR UPDATE', [ticketId, character.id]);
    const ticket = tickets[0];
    if (!ticket || ticket.status !== 'active')
        throw new Error('这道问心题已失效，请重新打开当前题目。');
    const card = ticketView(ticket).card;
    const choice = card.options[choiceIndex];
    if (!choice)
        throw new Error('题目选项已失效。');
    const birth = vector(profile.birth_json), delta = vector(profile.delta_json);
    const before = { ...birth };
    const great = Math.random() < .2;
    const change = calculateHeartGrowthChange(birth, choice.favor, choice.repel, great);
    const gain = units(change.gain), loss = units(change.loss);
    Object.assign(birth, change.after);
    delta[choice.favor] = (units(delta[choice.favor]) + gain) / 10;
    delta[choice.repel] = (units(delta[choice.repel]) - loss) / 10;
    const copyPool = great ? greatHeartCopy : normalHeartCopy;
    const copyIndex = Math.floor(Math.random() * copyPool.length);
    const copy = copyPool[copyIndex];
    const directions = [gain ? `${heartAttributeNames[choice.favor]}成长↑` : '', loss ? `${heartAttributeNames[choice.repel]}成长↓` : ''].filter(Boolean).join('，') || '六维成长未发生变化';
    const result = { choiceCode: codeFor[choiceIndex], outcome: great ? 'great' : 'normal', target: change.target, gain: change.gain, loss: change.loss, before, after: birth, levelAtChoice: Number(character.level), copyCode: `${great ? 'G' : 'N'}${String(copyIndex + 1).padStart(2, '0')}`, copy, directions };
    await connection.execute('UPDATE character_heart_growth SET birth_json=?,delta_json=?,offset_json=? WHERE character_id=?', [JSON.stringify(birth), JSON.stringify(delta), JSON.stringify(empty()), character.id]);
    await connection.execute("UPDATE character_heart_questions SET status='answered',choice_code=?,result_json=?,answered_at=NOW() WHERE id=?", [codeFor[choiceIndex], JSON.stringify(result), ticket.id]);
    await recordCharacterOperation(connection, { characterId: Number(character.id), kind: 'heart.choice', source: { system: 'heart_question', id: Number(ticket.id), step: 'answered' }, outcome: '已回答', summary: `回答问心片段：${card.title}`, detail: { questionId: Number(ticket.id), eventCode: card.code, title: card.title, choiceCode: codeFor[choiceIndex], choiceText: choice.text, favor: choice.favor, repel: choice.repel } });
    const { recalculateCharacterStats } = await import('./character.service.js');
    await recalculateCharacterStats(connection, Number(character.id));
    return { copy, directions };
});
const answerTestHeartQuestions = async (connection, characterId) => {
    const [tickets] = await connection.execute("SELECT * FROM character_heart_questions WHERE character_id=? AND to_level<=30 AND status<>'answered' ORDER BY to_level,id FOR UPDATE", [characterId]);
    if (!tickets.length)
        return 0;
    const profile = await ensureHeartGrowth(connection, characterId);
    const birth = vector(profile.birth_json), delta = vector(profile.delta_json);
    for (const ticket of tickets) {
        const card = ticketView(ticket).card;
        const choiceIndex = Math.floor(Math.random() * card.options.length);
        const choice = card.options[choiceIndex];
        if (!choice)
            continue;
        const great = Math.random() < .2;
        const before = { ...birth };
        const change = calculateHeartGrowthChange(birth, choice.favor, choice.repel, great);
        const gain = units(change.gain), loss = units(change.loss);
        Object.assign(birth, change.after);
        delta[choice.favor] = (units(delta[choice.favor]) + gain) / 10;
        delta[choice.repel] = (units(delta[choice.repel]) - loss) / 10;
        await connection.execute("UPDATE character_heart_questions SET status='answered',choice_code=?,result_json=?,answered_at=NOW() WHERE id=?", [codeFor[choiceIndex], JSON.stringify({ choiceCode: codeFor[choiceIndex], outcome: great ? 'great' : 'normal', target: change.target, gain: change.gain, loss: change.loss, before, after: birth, levelAtChoice: Number(ticket.to_level), adminTest: true }), ticket.id]);
    }
    await connection.execute('UPDATE character_heart_growth SET birth_json=?,delta_json=?,offset_json=? WHERE character_id=?', [JSON.stringify(birth), JSON.stringify(delta), JSON.stringify(empty()), characterId]);
    return tickets.length;
};

export { activeHeartQuestion, answerHeartQuestion, answerTestHeartQuestions, applyHeartGrowthToRow, createHeartQuestionsForLevels, ensureHeartGrowth, ensureHeartQuestionsForCurrentLevel, heartAttributeCorrection, heartAttributeNames, heartGrowthAdjustment, openHeartQuestion, openQueuedHeartQuestion, pendingHeartQuestionCount, skipHeartQuestion };
