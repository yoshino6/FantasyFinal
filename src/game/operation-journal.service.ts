import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/pool';

type Connection = PoolConnection | Awaited<ReturnType<typeof getPool>>;
export type WebRole = 'owner' | 'admin' | 'viewer';
export type OperationRisk = 'low' | 'medium' | 'high';

export type OperationInput = {
  actorRef: string;
  actionType: string;
  risk?: OperationRisk;
  reason?: string;
  target?: { kind: string; id: string | number; playerId?: number | null; characterId?: number | null; regionId?: number | null };
  request?: Record<string, unknown>;
  result?: Record<string, unknown>;
  status?: 'committed' | 'failed' | 'rolled_back';
  correlationId?: string;
};

const safeJson = (value: Record<string, unknown> | undefined) => JSON.stringify(value ?? {});

/** Web 管理操作的追加式总账；不保存密码、cookie、token 等秘密数据。 */
export const recordWebOperation = async (input: OperationInput, connection?: Connection) => {
  const db = connection ?? await getPool();
  const id = randomUUID(); const correlationId = input.correlationId ?? randomUUID();
  await db.execute(`INSERT INTO operation_journals
    (id,correlation_id,actor_kind,actor_ref,source,action_type,status,risk_level,reason,request_json,result_json,completed_at)
    VALUES (?,?, 'admin_web', ?, 'web', ?, ?, ?, ?, ?, ?, NOW())`, [
    id, correlationId, input.actorRef.slice(0, 64), input.actionType.slice(0, 64), input.status ?? 'committed',
    input.risk ?? 'low', String(input.reason ?? '').slice(0, 500), safeJson(input.request), safeJson(input.result)
  ]);
  if (input.target) await db.execute(`INSERT INTO operation_targets
    (operation_id,target_kind,target_id,player_id,character_id,region_id) VALUES (?,?,?,?,?,?)`, [
    id, input.target.kind.slice(0, 48), String(input.target.id).slice(0, 96), input.target.playerId ?? null,
    input.target.characterId ?? null, input.target.regionId ?? null
  ]);
  return { id, correlationId };
};

export const webOperationJournal = async (page = 1, keyword = '') => {
  const currentPage = Math.max(1, Math.min(10_000, Math.floor(Number(page) || 1)));
  const term = String(keyword ?? '').trim().slice(0, 80);
  const pool = await getPool();
  const where = term ? 'WHERE j.action_type LIKE ? OR j.actor_ref LIKE ? OR j.reason LIKE ? OR t.target_id LIKE ?' : '';
  const values: Array<string | number> = term ? [`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`] : [];
  const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM operation_journals j LEFT JOIN operation_targets t ON t.operation_id=j.id ${where}`, values);
  const total = Number(countRows[0]?.total ?? 0); const totalPages = Math.max(1, Math.ceil(total / 30)); const safePage = Math.min(currentPage, totalPages);
  const [rows] = await pool.execute<(RowDataPacket & { id: string; correlation_id: string; actor_ref: string; action_type: string; status: string; risk_level: string; reason: string; created_at: Date; target_kind: string | null; target_id: string | null })[]>(
    `SELECT j.id,j.correlation_id,j.actor_ref,j.action_type,j.status,j.risk_level,j.reason,j.created_at,t.target_kind,t.target_id
     FROM operation_journals j LEFT JOIN operation_targets t ON t.operation_id=j.id ${where}
     ORDER BY j.created_at DESC,j.id DESC LIMIT 30 OFFSET ?`, [...values, (safePage - 1) * 30]
  );
  return { page: safePage, total, totalPages, entries: rows.map(row => ({ id: row.id, correlationId: row.correlation_id, actor: row.actor_ref, action: row.action_type, status: row.status, risk: row.risk_level, reason: row.reason, createdAt: row.created_at, target: row.target_kind ? { kind: row.target_kind, id: row.target_id } : null })) };
};
