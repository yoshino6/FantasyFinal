import { withTransaction } from '../database/pool.js';
import { assertAutomatonSafe, automatonFor, recordAutomatonEvent, saveAutomaton, automatonCharacter, automatonIntimacy } from './automaton.service.js';
import { craftJson } from './alchemy-journal.service.js';
import { chooseAutomatonQuote } from './automaton-dialogue.js';

const prepareAutomatonQuote = async (connection, id, state, event, key, facts = new Set(), allowCustom = false) => {
    const [existing] = await connection.execute('SELECT id,text_value,quote_id FROM automaton_dialogues WHERE automaton_id=? AND event_key=? FOR UPDATE', [id, key]);
    if (existing[0])
        return { id: Number(existing[0].id), text: String(existing[0].text_value), quoteId: String(existing[0].quote_id) };
    const [history] = await connection.execute('SELECT text_hash FROM automaton_dialogues WHERE automaton_id=? AND sent_at>=DATE_SUB(NOW(),INTERVAL 180 DAY)', [id]);
    const [owners] = await connection.execute('SELECT c.name FROM player_automatons a JOIN characters c ON c.id=COALESCE(a.owner_id,a.holder_id) WHERE a.id=?', [id]);
    const selected = chooseAutomatonQuote(state, event, key, new Set(history.map(h => String(h.text_hash))), facts, allowCustom, String(owners[0]?.name ?? '旅伴'));
    if (!selected)
        return null;
    const [insert] = await connection.execute('INSERT INTO automaton_dialogues (automaton_id,event_key,event_type,quote_id,text_hash,text_value) VALUES (?,?,?,?,?,?)', [id, key, event, selected.id, selected.hash, selected.text]);
    return { id: Number(insert.insertId), text: selected.text, quoteId: selected.id };
};
const greetAutomaton = (user, id, key, _privateOutput) => withTransaction(async (connection) => {
    const character = await automatonCharacter(connection, user), { row, state } = await automatonFor(connection, character.id, id);
    const previousInteraction = state.lastInteractionAt, reunion = Boolean(previousInteraction && Date.now() - Date.parse(previousInteraction) >= 3 * 86400000);
    if (reunion)
        await recordAutomatonEvent(connection, id, character.id, `reunion:${previousInteraction}`, 'reunion', { name: state.name, absenceDays: Math.floor((Date.now() - Date.parse(previousInteraction)) / 86400000) });
    state.lastInteractionAt = new Date().toISOString();
    await automatonIntimacy(connection, character.id, state, 'interaction', id);
    await saveAutomaton(connection, row, state, false);
    const quote = await prepareAutomatonQuote(connection, id, state, reunion ? 'reunion' : 'greeting', key, new Set(reunion ? ['absence_days_at_least_3'] : []), false);
    return { quote, name: state.name, note: quote ? '' : '近期可用语句已用完，它安静地陪在你身旁。' };
});
const reserveDailyAutomaton = (user, _privateOutput) => withTransaction(async (connection) => {
    const [characters] = await connection.execute('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? FOR UPDATE', [user]);
    if (!characters[0])
        return null;
    const characterId = Number(characters[0].id);
    const [pets] = await connection.execute('SELECT id FROM player_automatons WHERE owner_id=? AND following=1 AND combat_id IS NULL', [characterId]);
    if (!pets[0])
        return null;
    try {
        await assertAutomatonSafe(connection, characterId);
    }
    catch {
        return null;
    }
    const { row, state } = await automatonFor(connection, characterId, Number(pets[0].id));
    if (!state.hp)
        return null;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    await connection.execute('INSERT IGNORE INTO automaton_daily(character_id,day_key) VALUES(?,?)', [characterId, day]);
    const [daily] = await connection.execute('SELECT greeting FROM automaton_daily WHERE character_id=? AND day_key=? FOR UPDATE', [characterId, day]);
    if (Number(daily[0]?.greeting))
        return null;
    const previousInteraction = state.lastInteractionAt, reunion = Boolean(previousInteraction && Date.now() - Date.parse(previousInteraction) >= 3 * 86400000);
    if (reunion)
        await recordAutomatonEvent(connection, Number(row.id), characterId, `reunion:${previousInteraction}`, 'reunion', { name: state.name, absenceDays: Math.floor((Date.now() - Date.parse(previousInteraction)) / 86400000) });
    state.lastInteractionAt = new Date().toISOString();
    const quote = await prepareAutomatonQuote(connection, Number(row.id), state, reunion ? 'reunion' : 'daily', `daily:${characterId}:${day}`, new Set(reunion ? ['absence_days_at_least_3'] : []), false);
    await connection.execute('UPDATE automaton_daily SET greeting=? WHERE character_id=? AND day_key=?', [quote ? 1 : 2, characterId, day]);
    await saveAutomaton(connection, row, state, false);
    return quote ? { ...quote, characterId, day, name: state.name } : null;
});
const finishDailyAutomaton = (quote, success) => withTransaction(async (connection) => {
    if (success)
        await connection.execute('UPDATE automaton_dialogues SET sent_at=COALESCE(sent_at,NOW()) WHERE id=?', [quote.id]);
    await connection.execute('UPDATE automaton_daily SET greeting=? WHERE character_id=? AND day_key=?', [success ? 2 : 0, quote.characterId, quote.day]);
});
const acknowledgeAutomatonQuote = (id) => withTransaction(async (connection) => { await connection.execute('UPDATE automaton_dialogues SET sent_at=COALESCE(sent_at,NOW()) WHERE id=?', [id]); });
const rateAutomatonQuote = (user, id, quoteId, like) => withTransaction(async (connection) => {
    const character = await automatonCharacter(connection, user), { row, state } = await automatonFor(connection, character.id, id);
    const [quotes] = await connection.execute('SELECT quote_id FROM automaton_dialogues WHERE id=? AND automaton_id=? AND sent_at IS NOT NULL', [quoteId, id]);
    if (!quotes[0])
        throw new Error('只能反馈已收到的本人机巧语录。');
    const [old] = await connection.execute('SELECT vote FROM automaton_quote_feedback WHERE dialogue_id=? FOR UPDATE', [quoteId]);
    const vote = like ? 1 : -1;
    if (Number(old[0]?.vote) === vote)
        return;
    await connection.execute('INSERT INTO automaton_quote_feedback(dialogue_id,character_id,vote) VALUES(?,?,?) ON DUPLICATE KEY UPDATE vote=VALUES(vote)', [quoteId, character.id, vote]);
    const key = String(quotes[0].quote_id);
    state.preferences[key] = Math.max(-9, Math.min(40, (state.preferences[key] ?? 0) + vote - Number(old[0]?.vote ?? 0)));
    await saveAutomaton(connection, row, state, false);
});
const rememberAutomatonQuote = (user, id, quoteId) => withTransaction(async (connection) => {
    const character = await automatonCharacter(connection, user);
    await automatonFor(connection, character.id, id);
    const [quotes] = await connection.execute('SELECT text_value FROM automaton_dialogues WHERE id=? AND automaton_id=? AND sent_at IS NOT NULL', [quoteId, id]);
    if (!quotes[0])
        throw new Error('只能收藏实际收到的本人机巧语录。');
    const [old] = await connection.execute('SELECT id FROM automaton_memories WHERE automaton_id=? AND dialogue_id=?', [id, quoteId]);
    if (old.length)
        return;
    const [count] = await connection.execute('SELECT COUNT(*) total FROM automaton_memories WHERE automaton_id=?', [id]);
    if (Number(count[0]?.total) >= 20)
        throw new Error('最多收藏二十条，请先取消旧收藏。');
    await connection.execute('INSERT INTO automaton_memories(automaton_id,character_id,dialogue_id,text_value) VALUES(?,?,?,?)', [id, character.id, quoteId, quotes[0].text_value]);
});
const automatonMemories = (user, id) => withTransaction(async (connection) => { const character = await automatonCharacter(connection, user); await automatonFor(connection, character.id, id); const [rows] = await connection.execute('SELECT * FROM automaton_memories WHERE automaton_id=? AND character_id=? ORDER BY id DESC', [id, character.id]); return rows; });
const forgetAutomatonMemory = (user, id, memoryId) => withTransaction(async (connection) => { const character = await automatonCharacter(connection, user); await automatonFor(connection, character.id, id); await connection.execute('DELETE FROM automaton_memories WHERE id=? AND automaton_id=? AND character_id=?', [memoryId, id, character.id]); });
const acknowledgeAutomatonBattleText = (user, text) => withTransaction(async (connection) => {
    const character = await automatonCharacter(connection, user);
    const [rows] = await connection.execute("SELECT d.id,d.text_value FROM automaton_dialogues d WHERE d.sent_at IS NULL AND d.created_at>=DATE_SUB(NOW(),INTERVAL 1 DAY) AND d.event_key LIKE 'battle:%' AND EXISTS(SELECT 1 FROM combat_members cm WHERE cm.character_id=? AND SUBSTRING_INDEX(SUBSTRING(d.event_key,8),':',1)=cm.session_id)", [character.id]);
    for (const row of rows)
        if (text.includes('「' + row.text_value + '」'))
            await connection.execute('UPDATE automaton_dialogues SET sent_at=COALESCE(sent_at,NOW()) WHERE id=?', [row.id]);
});
const quoteForAutomatonMutation = (user, token, _privateOutput) => withTransaction(async (connection) => {
    const character = await automatonCharacter(connection, user);
    const [requests] = await connection.execute("SELECT snapshot_json,result_json FROM player_craft_requests WHERE token=? AND character_id=? AND kind='automaton_mutate' AND state='complete' FOR UPDATE", [token, character.id]);
    if (!requests[0])
        return null;
    const result = craftJson(requests[0].result_json);
    if (result.dialogueDelivery && result.dialogueDelivery.status !== 'failed')
        return null;
    const snapshot = craftJson(requests[0].snapshot_json);
    const [events] = await connection.execute('SELECT data_json FROM automaton_events WHERE automaton_id=? AND character_id=? AND event_key=?', [snapshot.id, character.id, token]);
    if (!events[0])
        return null;
    const data = craftJson(events[0].data_json), event = snapshot.action === '认主' ? 'greeting' : snapshot.action === '培养' && data.level > data.previousLevel ? 'level_up' : ['收起', '休眠归档'].includes(snapshot.action) ? 'rest' : null;
    if (!event)
        return null;
    const { state } = await automatonFor(connection, character.id, snapshot.id);
    const quote = await prepareAutomatonQuote(connection, snapshot.id, state, event, 'mutation:' + token, new Set(event === 'level_up' ? ['material_level_increased'] : []), false);
    if (!quote)
        return null;
    await connection.execute("UPDATE player_craft_requests SET result_json=JSON_SET(result_json,'$.dialogueDelivery',CAST(? AS JSON)) WHERE token=? AND character_id=?", [JSON.stringify({ status: 'pending', id: quote.id }), token, character.id]);
    return { ...quote, name: state.name, petId: snapshot.id, token, characterId: character.id };
});
const finishAutomatonMutationQuote = (quote, success) => withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT result_json FROM player_craft_requests WHERE token=? AND character_id=? AND kind='automaton_mutate' AND state='complete' FOR UPDATE", [quote.token, quote.characterId]);
    const delivery = rows[0] && craftJson(rows[0].result_json).dialogueDelivery;
    if (delivery?.id !== quote.id || delivery.status !== 'pending')
        return;
    if (success)
        await connection.execute('UPDATE automaton_dialogues SET sent_at=COALESCE(sent_at,NOW()) WHERE id=?', [quote.id]);
    await connection.execute("UPDATE player_craft_requests SET result_json=JSON_SET(result_json,'$.dialogueDelivery.status',?) WHERE token=? AND character_id=?", [success ? 'sent' : 'failed', quote.token, quote.characterId]);
});

export { acknowledgeAutomatonBattleText, acknowledgeAutomatonQuote, automatonMemories, finishAutomatonMutationQuote, finishDailyAutomaton, forgetAutomatonMemory, greetAutomaton, prepareAutomatonQuote, quoteForAutomatonMutation, rateAutomatonQuote, rememberAutomatonQuote, reserveDailyAutomaton };
