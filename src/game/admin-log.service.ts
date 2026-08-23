import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/pool';

type Connection = PoolConnection | Awaited<ReturnType<typeof getPool>>;
type LogRow = RowDataPacket & { id: number; operator_qq_user_id: string; action_type: string; action_text: string; target_qq_user_id: string | null; created_at: Date; operator_name: string | null };
export type AdminLogFilter = { page?: number; keyword?: string; filter?: '人员' | '操作' | '时间'; value?: string };

export const recordAdminOperation = async (operatorQqUserId: string, actionType: string, actionText: string, targetQqUserId?: string | null, connection?: Connection) => {
  const db = connection ?? await getPool();
  await db.execute('INSERT INTO admin_operation_logs (operator_qq_user_id,action_type,action_text,target_qq_user_id) VALUES (?,?,?,?)', [operatorQqUserId, actionType.slice(0, 32), actionText.slice(0, 255), targetQqUserId ?? null]);
};

export const adminOperationLogs = async (filter: AdminLogFilter = {}) => {
  const pool = await getPool(); const page = Math.max(1, Number(filter.page ?? 1)); const keyword = String(filter.keyword ?? '').trim(); const value = String(filter.value ?? '').trim();
  const where: string[] = []; const values: Array<string | number> = [];
  if (keyword) { where.push('(l.action_text LIKE ? OR l.action_type LIKE ? OR l.operator_qq_user_id LIKE ? OR p.qq_nickname LIKE ? OR c.name LIKE ?)'); for (let index = 0; index < 5; index++) values.push(`%${keyword}%`); }
  if (filter.filter === '人员' && value) { where.push('(l.operator_qq_user_id=? OR p.qq_nickname LIKE ? OR c.name LIKE ?)'); values.push(value, `%${value}%`, `%${value}%`); }
  if (filter.filter === '操作' && value) { where.push('(l.action_type LIKE ? OR l.action_text LIKE ?)'); values.push(`%${value}%`, `%${value}%`); }
  if (filter.filter === '时间' && value) { where.push('DATE(l.created_at)=?'); values.push(value); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM admin_operation_logs l LEFT JOIN players p ON p.qq_user_id=l.operator_qq_user_id LEFT JOIN characters c ON c.player_id=p.id ${clause}`, values);
  const total = Number(countRows[0]?.total ?? 0); const totalPages = Math.max(1, Math.ceil(total / 10)); const currentPage = Math.min(page, totalPages);
  const [rows] = await pool.execute<LogRow[]>(`SELECT l.id,l.operator_qq_user_id,l.action_type,l.action_text,l.target_qq_user_id,l.created_at,COALESCE(c.name,p.qq_nickname) AS operator_name
    FROM admin_operation_logs l LEFT JOIN players p ON p.qq_user_id=l.operator_qq_user_id LEFT JOIN characters c ON c.player_id=p.id ${clause}
    ORDER BY l.created_at DESC,l.id DESC LIMIT 10 OFFSET ?`, [...values, (currentPage - 1) * 10]);
  return { page: currentPage, totalPages, total, filter: filter.filter, value, keyword, entries: rows.map(row => ({ id: Number(row.id), operatorQqUserId: row.operator_qq_user_id, operatorName: row.operator_name ?? '未注册', actionType: row.action_type, actionText: row.action_text, targetQqUserId: row.target_qq_user_id, createdAt: row.created_at })) };
};
