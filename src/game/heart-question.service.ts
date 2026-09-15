import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { withTransaction } from '../database/pool';
import { playerGrowthShares } from './growth-rules';
import { attributes, type Allocation, type AttributeKey } from './types';
import { heartCards, greatHeartCopy, normalHeartCopy, type HeartCard } from './heart-question-content';
import { calculateHeartGrowthChange, heartOffsetAfterChoice } from './heart-question-rules';
import { recordCharacterOperation } from './character-operation.service';

type Db = Pool | PoolConnection;
type HeartGrowthRow = RowDataPacket & { birth_json: unknown; delta_json: unknown; offset_json: unknown };
type HeartTicketRow = RowDataPacket & { id: number; character_id: number; to_level: number; event_code: string; event_snapshot: unknown; status: 'active' | 'queued' | 'deferred' | 'answered'; choice_code: string | null; result_json: unknown };
export type HeartTicket = { id: number; toLevel: number; card: HeartCard; status: 'active' | 'queued' | 'deferred' | 'answered' };
const codeFor = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const heartAttributeNames: Record<AttributeKey, string> = { constitution: '体质', spirit: '精神', strength: '力量', intelligence: '智力', agility: '敏捷', perception: '感知' };
const parse = (value: unknown): Record<string, number> => typeof value === 'string' ? JSON.parse(value) : (value ?? {}) as Record<string, number>;
const empty = (): Allocation => Object.fromEntries(attributes.map(key => [key, 0])) as Allocation;
const units = (value: number) => Math.round(value * 10);
const vector = (value: unknown) => Object.fromEntries(attributes.map(key => [key, Number(parse(value)[key] ?? 0)])) as Allocation;
const ticketView = (row: HeartTicketRow): HeartTicket => ({ id: Number(row.id), toLevel: Number(row.to_level), card: typeof row.event_snapshot === 'string' ? JSON.parse(row.event_snapshot) : row.event_snapshot as HeartCard, status: row.status });

/** 出生成长与职业外源成长分开；旧角色仅在首次获得问心票时按已知职业配置回建。 */
export const ensureHeartGrowth = async (connection: PoolConnection, characterId: number, birth?: Allocation) => {
  const [existing] = await connection.execute<HeartGrowthRow[]>('SELECT * FROM character_heart_growth WHERE character_id=? FOR UPDATE', [characterId]);
  if (existing[0]) return existing[0];
  let initial = birth;
  if (!initial) {
    const [rows] = await connection.execute<(RowDataPacket & { profession_growth: unknown })[]>(`SELECT c.*,pd.growth_json AS profession_growth FROM characters c LEFT JOIN profession_definitions pd ON pd.code=c.profession_code WHERE c.id=? FOR UPDATE`, [characterId]);
    const row = rows[0]; if (!row) throw new Error('角色不存在。');
    const profession = parse(row.profession_growth);
    initial = Object.fromEntries(attributes.map(key => [key, Math.round((Number(row[`${key}_growth`]) - Number(profession[key] ?? 0)) * 10) / 10])) as Allocation;
  }
  const total = attributes.reduce((sum, key) => sum + units(initial![key]), 0);
  if (total < 0 || total > 120 || attributes.some(key => initial![key] < 0)) throw new Error('历史角色的出生成长无法安全回建，请先核对成长来源。');
  await connection.execute('INSERT INTO character_heart_growth (character_id,birth_json,delta_json,offset_json) VALUES (?,?,?,?)', [characterId, JSON.stringify(initial), JSON.stringify(empty()), JSON.stringify(empty())]);
  const [created] = await connection.execute<HeartGrowthRow[]>('SELECT * FROM character_heart_growth WHERE character_id=? FOR UPDATE', [characterId]);
  return created[0];
};

export const heartGrowthAdjustment = async (connection: Db, characterId: number) => {
  const [rows] = await connection.execute<HeartGrowthRow[]>('SELECT delta_json,offset_json,birth_json FROM character_heart_growth WHERE character_id=?', [characterId]);
  return rows[0] ? { delta: vector(rows[0].delta_json), offset: vector(rows[0].offset_json), birth: vector(rows[0].birth_json) } : null;
};

/** 将问心变化分配到未来等级，抵消作答时已取得的等级份数。 */
export const applyHeartGrowthToRow = async <T extends Record<string, unknown>>(connection: Db, characterId: number, row: T): Promise<T> => {
  const profile = await heartGrowthAdjustment(connection, characterId);
  if (!profile) return row;
  const adjusted = { ...row };
  for (const key of attributes) {
    adjusted[key as keyof T] = (Number(row[key] ?? 0) + profile.offset[key]) as T[keyof T];
    const camel = `${key}Growth`;
    const growth = Number(row[`${key}_growth`] ?? row[camel] ?? 0) + profile.delta[key];
    adjusted[`${key}_growth` as keyof T] = growth as T[keyof T];
    if (camel in row) adjusted[camel as keyof T] = growth as T[keyof T];
  }
  return adjusted;
};

export const heartAttributeCorrection = async (connection: Db, characterId: number, key: AttributeKey, level: number) => {
  const profile = await heartGrowthAdjustment(connection, characterId);
  return profile ? profile.delta[key] * playerGrowthShares(level) + profile.offset[key] : 0;
};

export const createHeartQuestionsForLevels = async (connection: PoolConnection, characterId: number, fromLevel: number, toLevel: number, realmStage: number) => {
  const firstLevel = Math.max(11, fromLevel + 1);
  const lastLevel = Math.min(20, toLevel);
  if (realmStage < 2 || lastLevel < firstLevel) return;
  await ensureHeartGrowth(connection, characterId);
  const [recent] = await connection.execute<(RowDataPacket & { event_code: string })[]>('SELECT event_code FROM character_heart_questions WHERE character_id=? ORDER BY id DESC LIMIT 20', [characterId]);
  const excluded = new Set(recent.map(row => row.event_code));
  const [active] = await connection.execute<RowDataPacket[]>("SELECT id FROM character_heart_questions WHERE character_id=? AND status='active' LIMIT 1", [characterId]);
  let activate = !active.length;
  for (let level = firstLevel; level <= lastLevel; level++) {
    const [sameLevel] = await connection.execute<RowDataPacket[]>('SELECT id FROM character_heart_questions WHERE character_id=? AND to_level=?', [characterId, level]);
    if (sameLevel.length) continue;
    const candidates = heartCards.filter(card => !excluded.has(card.code));
    const card = candidates[Math.floor(Math.random() * candidates.length)] ?? heartCards[0];
    await connection.execute('INSERT INTO character_heart_questions (character_id,to_level,event_code,event_snapshot,status) VALUES (?,?,?,?,?)', [characterId, level, card.code, JSON.stringify(card), activate ? 'active' : 'queued']);
    activate = false;
    excluded.add(card.code);
  }
};

/** 题库换版时只刷新尚未作答的快照；已回答票保留玩家当时实际看到的内容。 */
const refreshPendingHeartQuestionSnapshots = async (connection: PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; event_code: string; event_snapshot: string })[]>("SELECT id,event_code,event_snapshot FROM character_heart_questions WHERE character_id=? AND status IN ('active','queued','deferred') FOR UPDATE", [characterId]);
  const currentCards = new Map(heartCards.map(card => [card.code, card]));
  for (const row of rows) {
    const card = currentCards.get(row.event_code);
    if (!card) continue;
    let version = 0;
    try {
      const snapshot = typeof row.event_snapshot === 'string' ? JSON.parse(row.event_snapshot) : row.event_snapshot;
      version = Number((snapshot as { version?: number } | null)?.version ?? 0);
    } catch { version = 0; }
    if (version === card.version) continue;
    await connection.execute('UPDATE character_heart_questions SET event_snapshot=? WHERE id=?', [JSON.stringify(card), Number(row.id)]);
  }
};

/** 为问心功能上线前已达到 Lv.11 的角色补齐 Lv.11～Lv.20 升级票；每级唯一，重复调用不会重复出题。 */
export const ensureHeartQuestionsForCurrentLevel = async (connection: PoolConnection, userId: string) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; level: number; realm_stage: number })[]>('SELECT c.id,c.level,c.realm_stage FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [userId]);
  const character = rows[0];
  if (!character) return null;
  if (Number(character.realm_stage) >= 2 && Number(character.level) > 10) {
    await createHeartQuestionsForLevels(connection, Number(character.id), 10, Number(character.level), Number(character.realm_stage));
    await refreshPendingHeartQuestionSnapshots(connection, Number(character.id));
  }
  return character;
};

export const activeHeartQuestion = async (userId: string): Promise<HeartTicket | null> => withTransaction(async connection => {
  await ensureHeartQuestionsForCurrentLevel(connection, userId);
  const [rows] = await connection.execute<HeartTicketRow[]>(`SELECT q.* FROM character_heart_questions q JOIN characters c ON c.id=q.character_id JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND q.status='active' ORDER BY q.to_level,q.id LIMIT 1`, [userId]);
  return rows[0] ? ticketView(rows[0]) : null;
});

export const pendingHeartQuestionCount = async (userId: string) => withTransaction(async connection => {
  await ensureHeartQuestionsForCurrentLevel(connection, userId);
  const [rows] = await connection.execute<(RowDataPacket & { count: number })[]>(`SELECT COUNT(*) AS count FROM character_heart_questions q JOIN characters c ON c.id=q.character_id JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND q.status IN ('active','queued','deferred')`, [userId]);
  return Number(rows[0]?.count ?? 0);
});

export const openHeartQuestion = async (userId: string): Promise<HeartTicket | null> => withTransaction(async connection => {
  const character = await ensureHeartQuestionsForCurrentLevel(connection, userId); if (!character) return null;
  const [tickets] = await connection.execute<HeartTicketRow[]>("SELECT * FROM character_heart_questions WHERE character_id=? AND status IN ('active','queued','deferred') ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,to_level,id LIMIT 1 FOR UPDATE", [character.id]);
  const ticket = tickets[0]; if (!ticket) return null;
  if (ticket.status !== 'active') await connection.execute("UPDATE character_heart_questions SET status='active' WHERE id=?", [ticket.id]);
  return { ...ticketView(ticket), status: 'active' };
});

/** 连升多级时按顺序追问尚未展示的题，不重新强制弹出主动跳过的旧题。 */
export const openQueuedHeartQuestion = async (userId: string): Promise<HeartTicket | null> => withTransaction(async connection => {
  const character = await ensureHeartQuestionsForCurrentLevel(connection, userId); if (!character) return null;
  const [active] = await connection.execute<HeartTicketRow[]>("SELECT * FROM character_heart_questions WHERE character_id=? AND status='active' ORDER BY to_level,id LIMIT 1 FOR UPDATE", [character.id]);
  if (active[0]) return ticketView(active[0]);
  const [tickets] = await connection.execute<HeartTicketRow[]>("SELECT * FROM character_heart_questions WHERE character_id=? AND status='queued' ORDER BY to_level,id LIMIT 1 FOR UPDATE", [character.id]);
  const ticket = tickets[0]; if (!ticket) return null;
  await connection.execute("UPDATE character_heart_questions SET status='active' WHERE id=?", [ticket.id]);
  return { ...ticketView(ticket), status: 'active' };
});

export const skipHeartQuestion = async (userId: string, ticketId: number) => withTransaction(async connection => {
  const [rows] = await connection.execute<HeartTicketRow[]>(`SELECT q.* FROM character_heart_questions q JOIN characters c ON c.id=q.character_id JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND q.id=? FOR UPDATE`, [userId, ticketId]);
  const ticket = rows[0];
  if (!ticket || ticket.status !== 'active') throw new Error('这道问心题已失效，请重新打开当前题目。');
  await connection.execute("UPDATE character_heart_questions SET status='deferred' WHERE id=?", [ticket.id]);
  await recordCharacterOperation(connection, { characterId: Number(ticket.character_id), kind: 'heart.deferred', source: { system: 'heart_question', id: randomUUID(), step: 'deferred' }, outcome: '暂缓', summary: '暂缓回答窥尘问心', detail: { questionId: Number(ticket.id), toLevel: Number(ticket.to_level), eventCode: ticket.event_code } });
});

export const answerHeartQuestion = async (userId: string, ticketId: number, code: string) => withTransaction(async connection => {
  const choiceIndex = codeFor.indexOf(code.toUpperCase() as typeof codeFor[number]);
  if (choiceIndex < 0) throw new Error('请从 A—F 中选择一个回答。');
  const [characters] = await connection.execute<(RowDataPacket & { id: number; level: number })[]>('SELECT c.id,c.level FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [userId]);
  const character = characters[0]; if (!character) throw new Error('请先创建角色。');
  const profile = await ensureHeartGrowth(connection, Number(character.id));
  const [tickets] = await connection.execute<HeartTicketRow[]>('SELECT * FROM character_heart_questions WHERE id=? AND character_id=? FOR UPDATE', [ticketId, character.id]);
  const ticket = tickets[0]; if (!ticket || ticket.status !== 'active') throw new Error('这道问心题已失效，请重新打开当前题目。');
  const card = ticketView(ticket).card;
  const choice = card.options[choiceIndex]; if (!choice) throw new Error('题目选项已失效。');
  const birth = vector(profile.birth_json), delta = vector(profile.delta_json), offset = vector(profile.offset_json);
  const before = { ...birth };
  const great = Math.random() < .2;
  const change = calculateHeartGrowthChange(birth, choice.favor, choice.repel, great);
  const gain = units(change.gain), loss = units(change.loss);
  Object.assign(birth, change.after);
  delta[choice.favor] = (units(delta[choice.favor]) + gain) / 10;
  delta[choice.repel] = (units(delta[choice.repel]) - loss) / 10;
  Object.assign(offset, heartOffsetAfterChoice(offset, choice.favor, choice.repel, change.gain, change.loss, Number(character.level)));
  const copyPool = great ? greatHeartCopy : normalHeartCopy;
  const copyIndex = Math.floor(Math.random() * copyPool.length);
  const copy = copyPool[copyIndex];
  const directions = [gain ? `${heartAttributeNames[choice.favor]}成长↑` : '', loss ? `${heartAttributeNames[choice.repel]}成长↓` : ''].filter(Boolean).join('，') || '六维成长未发生变化';
  const result = { choiceCode: codeFor[choiceIndex], outcome: great ? 'great' : 'normal', target: change.target, gain: change.gain, loss: change.loss, before, after: birth, levelAtChoice: Number(character.level), copyCode: `${great ? 'G' : 'N'}${String(copyIndex + 1).padStart(2, '0')}`, copy, directions };
  await connection.execute('UPDATE character_heart_growth SET birth_json=?,delta_json=?,offset_json=? WHERE character_id=?', [JSON.stringify(birth), JSON.stringify(delta), JSON.stringify(offset), character.id]);
  await connection.execute("UPDATE character_heart_questions SET status='answered',choice_code=?,result_json=?,answered_at=NOW() WHERE id=?", [codeFor[choiceIndex], JSON.stringify(result), ticket.id]);
  await recordCharacterOperation(connection, { characterId: Number(character.id), kind: 'heart.choice', source: { system: 'heart_question', id: Number(ticket.id), step: 'answered' }, outcome: '已回答', summary: `回答问心片段：${card.title}`, detail: { questionId: Number(ticket.id), eventCode: card.code, title: card.title, choiceCode: codeFor[choiceIndex], choiceText: choice.text, favor: choice.favor, repel: choice.repel } });
  const { recalculateCharacterStats } = await import('./character.service');
  await recalculateCharacterStats(connection, Number(character.id));
  return { copy, directions };
});

/** 管理成长模拟：逐级随机回答尚未作答的问心题，按当时等级结算成长偏移。 */
export const answerTestHeartQuestions = async (connection: PoolConnection, characterId: number) => {
  const [tickets] = await connection.execute<HeartTicketRow[]>("SELECT * FROM character_heart_questions WHERE character_id=? AND to_level<=30 AND status<>'answered' ORDER BY to_level,id FOR UPDATE", [characterId]);
  if (!tickets.length) return 0;
  const profile = await ensureHeartGrowth(connection, characterId);
  const birth = vector(profile.birth_json), delta = vector(profile.delta_json), offset = vector(profile.offset_json);
  for (const ticket of tickets) {
    const card = ticketView(ticket).card;
    const choiceIndex = Math.floor(Math.random() * card.options.length);
    const choice = card.options[choiceIndex]; if (!choice) continue;
    const great = Math.random() < .2;
    const before = { ...birth };
    const change = calculateHeartGrowthChange(birth, choice.favor, choice.repel, great);
    const gain = units(change.gain), loss = units(change.loss);
    Object.assign(birth, change.after);
    delta[choice.favor] = (units(delta[choice.favor]) + gain) / 10;
    delta[choice.repel] = (units(delta[choice.repel]) - loss) / 10;
    Object.assign(offset, heartOffsetAfterChoice(offset, choice.favor, choice.repel, change.gain, change.loss, Number(ticket.to_level)));
    await connection.execute("UPDATE character_heart_questions SET status='answered',choice_code=?,result_json=?,answered_at=NOW() WHERE id=?", [codeFor[choiceIndex], JSON.stringify({ choiceCode: codeFor[choiceIndex], outcome: great ? 'great' : 'normal', target: change.target, gain: change.gain, loss: change.loss, before, after: birth, levelAtChoice: Number(ticket.to_level), adminTest: true }), ticket.id]);
  }
  await connection.execute('UPDATE character_heart_growth SET birth_json=?,delta_json=?,offset_json=? WHERE character_id=?', [JSON.stringify(birth), JSON.stringify(delta), JSON.stringify(offset), characterId]);
  return tickets.length;
};
