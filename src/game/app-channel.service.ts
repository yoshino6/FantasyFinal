import { createHash, randomBytes } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';

const APP_ID_PREFIX = 'app_';
const BINDING_CODE_TTL_MINUTES = 10;
const SESSION_TTL_DAYS = 30;

export type AppSession = {
  appUserId: string;
  displayName: string;
  qqUserId: string;
  playerId: number;
  characterId: number | null;
};

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

const appUserId = () => `${APP_ID_PREFIX}${randomBytes(10).toString('hex')}`;

const bindingCode = () => String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');

const qqUserIdForApp = async (connection: Pool | PoolConnection, appUserIdValue: string): Promise<string> => {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT p.qq_user_id FROM app_users au
     JOIN player_app_bindings b ON b.app_user_id=au.app_user_id
     JOIN players p ON p.id=b.player_id
     WHERE au.app_user_id=? LIMIT 1`,
    [appUserIdValue]
  );
  if (!rows[0]) {
    const [players] = await connection.execute<RowDataPacket[]>(
      'SELECT qq_user_id FROM players WHERE qq_user_id=? LIMIT 1',
      [appUserIdValue]
    );
    return String(players[0]?.qq_user_id ?? '');
  }
  return String(rows[0].qq_user_id);
};

export const createAppUser = async (displayName: string): Promise<{ appUserId: string; token: string; qqUserId: string }> => {
  const safeName = String(displayName ?? '').trim().slice(0, 32) || '旅人';
  const appId = appUserId();
  const token = randomBytes(32).toString('base64url');
  return withTransaction(async connection => {
    await connection.execute(
      'INSERT INTO app_users (app_user_id,display_name) VALUES (?,?)',
      [appId, safeName]
    );
    await connection.execute(
      `INSERT INTO players (qq_user_id,qq_nickname) VALUES (?,?)
       ON DUPLICATE KEY UPDATE qq_nickname=COALESCE(VALUES(qq_nickname),qq_nickname)`,
      [appId, safeName]
    );
    await connection.execute(
      `INSERT INTO app_sessions (app_user_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL ? DAY))`,
      [appId, tokenHash(token), SESSION_TTL_DAYS]
    );
    return { appUserId: appId, token, qqUserId: appId };
  });
};

export const issueBindingCode = async (qqUserId: string): Promise<string> => {
  const code = bindingCode();
  await withTransaction(async connection => {
    await connection.execute(
      `INSERT INTO app_binding_codes (qq_user_id,code,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL ? MINUTE))`,
      [qqUserId, code, BINDING_CODE_TTL_MINUTES]
    );
  });
  return code;
};

export const bindAppUser = async (appUserIdValue: string, code: string): Promise<{ qqUserId: string; characterId: number | null }> => {
  const normalized = String(code ?? '').trim();
  if (!/^\d{6}$/.test(normalized)) throw new Error('绑定码必须是 6 位数字。');
  return withTransaction(async connection => {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id,qq_user_id,expires_at,used_by_app_user FROM app_binding_codes
       WHERE code=? LIMIT 1 FOR UPDATE`,
      [normalized]
    );
    const binding = rows[0];
    if (!binding || new Date(binding.expires_at).getTime() < Date.now()) throw new Error('绑定码不存在或已过期。');
    if (binding.used_by_app_user) throw new Error('绑定码已使用。');
    const [players] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM players WHERE qq_user_id=? LIMIT 1 FOR UPDATE',
      [binding.qq_user_id]
    );
    if (!players[0]) throw new Error('绑定的玩家不存在。');
    await connection.execute(
      `UPDATE app_binding_codes SET used_by_app_user=?,used_at=NOW() WHERE id=?`,
      [appUserIdValue, binding.id]
    );
    await connection.execute(
      `INSERT INTO player_app_bindings (player_id,app_user_id) VALUES (?,?)
       ON DUPLICATE KEY UPDATE app_user_id=VALUES(app_user_id)`,
      [players[0].id, appUserIdValue]
    );
    const [characters] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM characters WHERE player_id=? LIMIT 1',
      [players[0].id]
    );
    return { qqUserId: String(binding.qq_user_id), characterId: characters[0] ? Number(characters[0].id) : null };
  });
};

export const sessionForApp = async (token: string): Promise<AppSession | null> => {
  const pool = await getPool();
  const hash = tokenHash(String(token ?? '').trim());
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT s.app_user_id,au.display_name,COALESCE(p.qq_user_id,'') AS qq_user_id,p.id AS player_id,c.id AS character_id
     FROM app_sessions s
     JOIN app_users au ON au.app_user_id=s.app_user_id
     LEFT JOIN player_app_bindings b ON b.app_user_id=s.app_user_id
     LEFT JOIN players p ON p.id=b.player_id
     LEFT JOIN characters c ON c.player_id=p.id
     WHERE s.token_hash=? AND s.expires_at>NOW() LIMIT 1`,
    [hash]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    appUserId: String(row.app_user_id),
    displayName: String(row.display_name),
    qqUserId: String(row.qq_user_id || row.app_user_id),
    playerId: Number(row.player_id ?? 0),
    characterId: row.character_id ? Number(row.character_id) : null
  };
};

export const appSessionQqUser = async (session: AppSession, pool?: Pool): Promise<string> => {
  if (session.qqUserId) return session.qqUserId;
  const connection = pool ?? await getPool();
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT p.qq_user_id FROM app_users au
     JOIN player_app_bindings b ON b.app_user_id=au.app_user_id
     JOIN players p ON p.id=b.player_id
     WHERE au.app_user_id=? LIMIT 1`,
    [session.appUserId]
  );
  if (rows[0]) return String(rows[0].qq_user_id);
  return session.appUserId;
};

export const appUserIdentity = async (appUserIdValue: string): Promise<{ qqUserId: string; playerId: number | null; characterId: number | null }> => {
  const pool = await getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COALESCE(p.qq_user_id,au.app_user_id) AS qq_user_id,p.id AS player_id,c.id AS character_id
     FROM app_users au
     LEFT JOIN player_app_bindings b ON b.app_user_id=au.app_user_id
     LEFT JOIN players p ON p.id=b.player_id
     LEFT JOIN characters c ON c.player_id=p.id
     WHERE au.app_user_id=? LIMIT 1`,
    [appUserIdValue]
  );
  const row = rows[0];
  return {
    qqUserId: String(row?.qq_user_id ?? appUserIdValue),
    playerId: row?.player_id ? Number(row.player_id) : null,
    characterId: row?.character_id ? Number(row.character_id) : null
  };
};

export const revokeAppBinding = async (appUserIdValue: string) => {
  await withTransaction(async connection => {
    await connection.execute('DELETE FROM player_app_bindings WHERE app_user_id=?', [appUserIdValue]);
    await connection.execute('DELETE FROM app_sessions WHERE app_user_id=?', [appUserIdValue]);
  });
};

export const appCommandContext = async (appUserIdValue: string): Promise<{ qqUserId: string }> => {
  const pool = await getPool();
  const qqUserId = await qqUserIdForApp(pool, appUserIdValue);
  return { qqUserId };
};
