import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { verifyOwnerPassword } from '../config/admin';
import { getPool, withTransaction } from '../database/pool';
import { recordAdminOperation } from './admin-log.service';

export type PermissionRole = 'owner' | 'admin';
type Connection = PoolConnection | Awaited<ReturnType<typeof getPool>>;
type PermissionRow = RowDataPacket & { qq_user_id: string; role: PermissionRole; character_id: number | null; name: string | null; qq_nickname: string | null };

const roleFor = async (connection: Connection, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<(RowDataPacket & { role: PermissionRole })[]>(`SELECT role FROM game_permissions WHERE qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  return rows[0]?.role ?? null;
};

export const permissionFor = async (qqUserId: string) => roleFor(await getPool(), qqUserId);

export const requireAdministrator = async (qqUserId: string, connection?: Connection) => {
  const role = await roleFor(connection ?? await getPool(), qqUserId);
  if (role !== 'owner' && role !== 'admin') throw new Error('需要管理员权限。');
  return role;
};

export const requireOwner = async (qqUserId: string, connection?: Connection) => {
  const role = await roleFor(connection ?? await getPool(), qqUserId);
  if (role !== 'owner') throw new Error('需要主人权限。');
};

export const loginAsOwner = async (qqUserId: string, password: string) => withTransaction(async connection => {
  if (!verifyOwnerPassword(password)) throw new Error('主人密码不正确。');
  await connection.execute(`INSERT INTO game_permissions (qq_user_id,role,granted_by) VALUES (?,'owner',?)
    ON DUPLICATE KEY UPDATE role='owner',granted_by=VALUES(granted_by),updated_at=NOW()`, [qqUserId, qqUserId]);
  await recordAdminOperation(qqUserId, '管理员登录', '登录为主人权限', qqUserId, connection);
});

export const grantAdministrator = async (ownerQqUserId: string, targetQqUserId: string) => withTransaction(async connection => {
  await requireOwner(ownerQqUserId, connection);
  const current = await roleFor(connection, targetQqUserId, true);
  if (current === 'owner') throw new Error('该用户已是主人，不能降为管理员。');
  await connection.execute(`INSERT INTO game_permissions (qq_user_id,role,granted_by) VALUES (?,'admin',?)
    ON DUPLICATE KEY UPDATE role='admin',granted_by=VALUES(granted_by),updated_at=NOW()`, [targetQqUserId, ownerQqUserId]);
  await recordAdminOperation(ownerQqUserId, '权限给予', `给予 ${targetQqUserId} 管理员权限`, targetQqUserId, connection);
});

export const revokeAdministrator = async (ownerQqUserId: string, targetQqUserId: string) => withTransaction(async connection => {
  await requireOwner(ownerQqUserId, connection);
  const current = await roleFor(connection, targetQqUserId, true);
  if (!current) throw new Error('该用户当前没有管理权限。');
  if (current === 'owner') throw new Error('不能撤销主人的权限。');
  await connection.execute("DELETE FROM game_permissions WHERE qq_user_id=? AND role='admin'", [targetQqUserId]);
  await recordAdminOperation(ownerQqUserId, '权限撤销', `撤销 ${targetQqUserId} 的管理员权限`, targetQqUserId, connection);
});

export const permissionList = async () => {
  const pool = await getPool();
  const [rows] = await pool.execute<PermissionRow[]>(`SELECT gp.qq_user_id,gp.role,c.id AS character_id,c.name,p.qq_nickname
    FROM game_permissions gp LEFT JOIN players p ON p.qq_user_id=gp.qq_user_id LEFT JOIN characters c ON c.player_id=p.id
    ORDER BY FIELD(gp.role,'owner','admin'),gp.created_at,gp.qq_user_id`);
  return rows.map(row => ({ qqUserId: row.qq_user_id, role: row.role, characterId: row.character_id === null ? null : Number(row.character_id), name: row.name ?? row.qq_nickname ?? '未注册' }));
};
