import { createHash } from 'node:crypto';
import { logger } from 'alemonjs';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/pool';
import { allocateOperationPoints, characterOperationKinds } from './character-operation-kinds';
import { attributes, type Allocation } from './types';

const zero = (): Allocation => Object.fromEntries(attributes.map(key => [key, 0])) as Allocation;
const parse = (value: unknown): Allocation => {
  const object = typeof value === 'string' ? JSON.parse(value) : (value ?? {});
  return Object.fromEntries(attributes.map(key => [key, Number(object[key] ?? 0)])) as Allocation;
};
const businessDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
type FactRow = RowDataPacket & { id: number; character_id: number; root_event_id: number | null; event_type: string; kind_version: number; source_system: string; source_id: string; source_step: string; source_hash: string | null; actor_role: 'player' | 'system' | 'admin' | null; outcome: string; title: string; summary: string; payload: unknown; weight_json: unknown; raw_points_units: number; effective_points_units: number; point_delta_json: unknown; score_reason: string; mapping_status: string; occurred_at: Date };
type BalanceRow = RowDataPacket & { earned_json: unknown; spent_json: unknown; mutation_json: unknown; version: number };
type RecordInput = {
  characterId: number; kind: string; source: { system: string; id: string | number; step: string };
  outcome: string; summary: string; detail: Record<string, unknown>;
  rootOperationId?: number; existingEventId?: number; correlationId?: string; actorRole?: 'player' | 'system' | 'admin';
  /** 反刷维度由结算服务根据业务对象构造，不直接采用玩家指令文本。 */
  scoreKey?: string;
};

export const recordCharacterOperation = async (connection: PoolConnection, input: RecordInput): Promise<{ factId: number; duplicate: boolean; effectiveUnits: number }> => {
  const kind = characterOperationKinds[input.kind];
  const actorRole = input.actorRole ?? 'player';
  const sourceSystem = String(input.source.system), sourceId = String(input.source.id), sourceStep = String(input.source.step);
  if (!input.characterId || !input.kind || input.kind.length > 64 || !sourceSystem || !sourceId || !sourceStep || !input.outcome || sourceSystem.length > 64 || sourceId.length > 255 || sourceStep.length > 64) throw new Error('行迹业务来源不完整。');
  if (input.rootOperationId) {
    const [roots] = await connection.execute<RowDataPacket[]>('SELECT id FROM player_events WHERE id=? AND character_id=?', [input.rootOperationId, input.characterId]);
    if (!roots[0]) throw new Error('行迹父事件不属于该角色。');
  }
  const [characters] = await connection.execute<(RowDataPacket & { player_id: number | null })[]>('SELECT player_id FROM characters WHERE id=?', [input.characterId]);
  if (!characters[0]?.player_id) throw new Error('行迹角色不存在或不是玩家角色。');
  const mapped = Boolean(kind);
  if (!mapped) logger.warn({ kind: input.kind, sourceSystem }, '人物行迹类型尚未映射，事实仍记录但不发积分');
  const rawUnits = actorRole === 'player' && kind ? kind.rawUnits : 0;
  const scoreKey = input.scoreKey?.slice(0, 128) ?? null;
  const hash = createHash('sha256').update(JSON.stringify([input.characterId, sourceSystem, sourceId, sourceStep, input.kind])).digest('hex');
  const fields = [
    input.characterId, input.rootOperationId ?? null, 1, sourceSystem, sourceId, sourceStep, hash,
    input.correlationId ?? null, actorRole, input.outcome, kind?.title ?? '未映射的有效操作', input.summary.slice(0, 500),
    JSON.stringify(kind?.weights ?? zero()), rawUnits, JSON.stringify(zero()), scoreKey,
    !mapped ? 'unmapped' : actorRole !== 'player' ? 'system_source' : rawUnits ? 'pending' : 'zero_tier', mapped ? 'mapped' : 'unmapped', businessDate()
  ];
  let factId: number;
  if (input.existingEventId) {
    const [eventRows] = await connection.execute<FactRow[]>('SELECT id,character_id,event_type,payload,source_hash,effective_points_units FROM player_events WHERE id=? AND player_id=? FOR UPDATE', [input.existingEventId, characters[0].player_id]);
    const event = eventRows[0];
    if (!event || event.event_type !== input.kind) throw new Error('原有玩家事件不属于本次行迹。');
    if (event.character_id && Number(event.character_id) !== input.characterId) throw new Error('原有玩家事件已属于其他角色。');
    if (event.source_hash === hash) return { factId: Number(event.id), duplicate: true, effectiveUnits: Number(event.effective_points_units) };
    if (event.source_hash) throw new Error('原有玩家事件已绑定其他行迹来源。');
    const original = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
    const payload = JSON.stringify({ ...(original && typeof original === 'object' && !Array.isArray(original) ? original : {}), ...input.detail });
    const [updated] = await connection.execute<ResultSetHeader>(`UPDATE player_events SET
      payload=?,character_id=?,root_event_id=?,kind_version=?,source_system=?,source_id=?,source_step=?,source_hash=?,
      correlation_id=?,actor_role=?,outcome=?,title=?,summary=?,weight_json=?,raw_points_units=?,point_delta_json=?,
      score_key=?,score_reason=?,mapping_status=?,business_date=? WHERE id=? AND player_id=? AND event_type=? AND source_hash IS NULL`,
    [payload, ...fields, input.existingEventId, characters[0].player_id, input.kind]);
    if (!updated.affectedRows) throw new Error('原有玩家事件未能补齐行迹字段。');
    factId = input.existingEventId;
  } else {
    const [insert] = await connection.execute<ResultSetHeader>(`INSERT IGNORE INTO player_events
      (player_id,event_type,payload,character_id,root_event_id,kind_version,source_system,source_id,source_step,source_hash,
       correlation_id,actor_role,outcome,title,summary,weight_json,raw_points_units,effective_points_units,point_delta_json,
       score_key,score_reason,mapping_status,business_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`,
    [characters[0].player_id, input.kind, JSON.stringify(input.detail), ...fields]);
    if (!insert.affectedRows) {
      const [existing] = await connection.execute<FactRow[]>('SELECT id,effective_points_units FROM player_events WHERE character_id=? AND source_hash=?', [input.characterId, hash]);
      if (!existing[0]) throw new Error('行迹来源发生唯一键冲突，无法确认已有事实。');
      return { factId: Number(existing[0].id), duplicate: true, effectiveUnits: Number(existing[0].effective_points_units) };
    }
    factId = Number(insert.insertId);
  }
  if (!rawUnits || !kind) return { factId, duplicate: false, effectiveUnits: 0 };
  await connection.execute('INSERT IGNORE INTO character_tendency_balances (character_id,earned_json,spent_json,mutation_json) VALUES (?,?,?,?)', [input.characterId, JSON.stringify(zero()), JSON.stringify(zero()), JSON.stringify(zero())]);
  const [balances] = await connection.execute<BalanceRow[]>('SELECT * FROM character_tendency_balances WHERE character_id=? FOR UPDATE', [input.characterId]);
  const before = parse(balances[0].earned_json);
  let effective = rawUnits;
  let reason = 'awarded';
  if (scoreKey && kind.repeatHours) {
    const [recent] = await connection.execute<RowDataPacket[]>(`SELECT id FROM player_events WHERE character_id=? AND event_type=? AND score_key=? AND mapping_status='mapped' AND effective_points_units>0 AND occurred_at>=DATE_SUB(NOW(),INTERVAL ? HOUR) LIMIT 1`, [input.characterId, input.kind, scoreKey, kind.repeatHours]);
    if (recent[0]) { effective = 0; reason = 'repeat_source'; }
  }
  if (effective && kind.dailyCapUnits) {
    const [daily] = await connection.execute<(RowDataPacket & { total: number })[]>('SELECT COALESCE(SUM(effective_points_units),0) AS total FROM player_events WHERE character_id=? AND event_type=? AND mapping_status=\'mapped\' AND business_date=?', [input.characterId, input.kind, businessDate()]);
    effective = Math.max(0, Math.min(effective, kind.dailyCapUnits - Number(daily[0]?.total ?? 0)));
    if (!effective) reason = 'daily_cap';
    else if (effective < rawUnits) reason = 'daily_cap_partial';
  }
  const delta = allocateOperationPoints(effective, kind.weights);
  const after = Object.fromEntries(attributes.map(key => [key, before[key] + delta[key]])) as Allocation;
  await connection.execute('UPDATE player_events SET effective_points_units=?,point_delta_json=?,score_reason=? WHERE id=?', [effective, JSON.stringify(delta), reason, factId]);
  if (effective) {
    await connection.execute('UPDATE character_tendency_balances SET earned_json=?,version=version+1 WHERE character_id=?', [JSON.stringify(after), input.characterId]);
    await connection.execute("INSERT INTO character_tendency_changes (character_id,fact_id,change_kind,delta_json,before_json,after_json) VALUES (?,?,'earn',?,?,?)", [input.characterId, factId, JSON.stringify(delta), JSON.stringify(before), JSON.stringify(after)]);
  }
  return { factId, duplicate: false, effectiveUnits: effective };
};

const characterIdFor = async (userId: string) => {
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { id: number })[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1', [userId]);
  return Number(rows[0]?.id ?? 0);
};
const displayFact = (row: FactRow) => ({ id: Number(row.id), kind: row.event_type, category: characterOperationKinds[row.event_type]?.category ?? '未映射', title: row.title, summary: row.summary, outcome: row.outcome, actorRole: row.actor_role, occurredAt: row.occurred_at, weights: parse(row.weight_json), points: Number(row.effective_points_units) / 10, pointDelta: parse(row.point_delta_json), scoreReason: row.score_reason, mappingStatus: row.mapping_status });

export const listCharacterOperations = async (userId: string, options: { kind?: string; outcome?: string; cursor?: number; limit?: number } = {}) => {
  const pool = await getPool(), characterId = await characterIdFor(userId);
  if (!characterId) return { rows: [], nextCursor: null as number | null };
  const limit = Math.max(1, Math.min(30, Math.floor(options.limit ?? 10)));
  const filters = ['character_id=?', "mapping_status IN ('mapped','unmapped')"]; const params: Array<string | number | Date> = [characterId];
  if (options.kind) { filters.push('event_type=?'); params.push(options.kind); }
  if (options.outcome) { filters.push('outcome=?'); params.push(options.outcome); }
  if (options.cursor) {
    const [cursors] = await pool.execute<(RowDataPacket & { occurred_at: Date })[]>('SELECT occurred_at FROM player_events WHERE id=? AND character_id=? AND mapping_status IN (\'mapped\',\'unmapped\')', [options.cursor, characterId]);
    if (!cursors[0]) return { rows: [], nextCursor: null as number | null };
    filters.push('(occurred_at<? OR (occurred_at=? AND id<?))'); params.push(cursors[0].occurred_at, cursors[0].occurred_at, options.cursor);
  }
  const [rows] = await pool.execute<FactRow[]>(`SELECT * FROM player_events WHERE ${filters.join(' AND ')} ORDER BY occurred_at DESC,id DESC LIMIT ?`, [...params, limit + 1]);
  const page = rows.slice(0, limit);
  return { rows: page.map(displayFact), nextCursor: rows.length > limit ? Number(page.at(-1)!.id) : null };
};

export const getCharacterOperationDetail = async (userId: string, factId: number) => {
  const pool = await getPool(), characterId = await characterIdFor(userId);
  if (!characterId) return null;
  const [rows] = await pool.execute<FactRow[]>('SELECT * FROM player_events WHERE id=? AND character_id=? AND mapping_status IN (\'mapped\',\'unmapped\') LIMIT 1', [factId, characterId]);
  const row = rows[0]; if (!row) return null;
  return { ...displayFact(row), source: { system: row.source_system, id: row.source_id, step: row.source_step }, rootOperationId: row.root_event_id, detail: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload, rawPoints: Number(row.raw_points_units) / 10 };
};

export const characterTendencyBalance = async (userId: string) => {
  const pool = await getPool(), characterId = await characterIdFor(userId);
  if (!characterId) return null;
  const [rows] = await pool.execute<BalanceRow[]>('SELECT * FROM character_tendency_balances WHERE character_id=?', [characterId]);
  const row = rows[0];
  return { earned: row ? parse(row.earned_json) : zero(), spent: row ? parse(row.spent_json) : zero(), mutation: row ? parse(row.mutation_json) : zero(), version: Number(row?.version ?? 0) };
};
