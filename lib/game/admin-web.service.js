import { scrypt as scrypt$1, createHash, timingSafeEqual, randomBytes, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { verifyOwnerPassword } from '../config/admin.js';
import { getAdminWebConfig } from '../config/admin-web.js';
import { getPool, withTransaction } from '../database/pool.js';
import { recordWebOperation } from './operation-journal.service.js';

const scrypt = promisify(scrypt$1);
const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
const usernamePattern = /^[a-z][a-z0-9_-]{2,31}$/;
const passwordValid = (password) => password.length >= 10 && password.length <= 200;
const passwordHash = async (password) => {
    const salt = randomBytes(16).toString('hex');
    const derived = await scrypt(password, salt, 64);
    return `scrypt$${salt}$${derived.toString('hex')}`;
};
const passwordMatches = async (password, encoded) => {
    const [algorithm, salt, expected] = encoded.split('$');
    if (algorithm !== 'scrypt' || !salt || !expected)
        return false;
    const actual = await scrypt(password, salt, 64);
    const target = Buffer.from(expected, 'hex');
    return target.length === actual.length && timingSafeEqual(target, actual);
};
const normalizedUsername = (value) => String(value ?? '').trim().toLowerCase();
const safeIp = (value) => String(value ?? '').trim().slice(0, 64);
const recordLogin = async (username, ip, outcome, reason) => {
    await (await getPool()).execute('INSERT INTO admin_web_login_attempts (username,ip_address,outcome,reason_code) VALUES (?,?,?,?)', [username.slice(0, 32), ip, outcome, reason.slice(0, 48)]);
};
const loginBlocked = async (username, ip) => {
    const [rows] = await (await getPool()).execute(`SELECT COUNT(*) AS total FROM admin_web_login_attempts
    WHERE outcome IN ('failed','blocked') AND created_at>=DATE_SUB(NOW(),INTERVAL 15 MINUTE) AND (username=? OR ip_address=?)`, [username, ip]);
    return Number(rows[0]?.total ?? 0) >= 10;
};
const createSession = async (account, ip) => {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const id = randomUUID();
    const config = getAdminWebConfig();
    await (await getPool()).execute(`INSERT INTO admin_web_sessions (id,account_id,token_hash,csrf_secret_hash,ip_address,expires_at,absolute_expires_at)
    VALUES (?,?,?,?,?,DATE_ADD(NOW(),INTERVAL ? MINUTE),DATE_ADD(NOW(),INTERVAL ? MINUTE))`, [id, account.id, tokenHash(token), tokenHash(csrfToken), ip, config.sessionIdleMinutes, config.sessionAbsoluteMinutes]);
    return { token, csrfToken, session: { accountId: Number(account.id), username: account.username, role: account.role, csrfToken } };
};
const loginAdminWeb = async (input) => {
    const username = normalizedUsername(input.username);
    const password = String(input.password ?? '');
    const ip = safeIp(input.ip);
    if (!usernamePattern.test(username) || !password) {
        await recordLogin(username, ip, 'failed', 'invalid_input');
        throw new Error('账号或密码错误。');
    }
    if (await loginBlocked(username, ip)) {
        await recordLogin(username, ip, 'blocked', 'rate_limited');
        throw new Error('登录尝试过多，请稍后重试。');
    }
    const pool = await getPool();
    const [rows] = await pool.execute('SELECT id,username,password_hash,role,is_enabled,force_password_change FROM admin_web_accounts WHERE username=? LIMIT 1', [username]);
    let account = rows[0];
    let legacyOwnerPasswordAccepted = false;
    if (!account && username === 'admin') {
        const config = getAdminWebConfig();
        if (config.ownerBootstrapPasswordHash) {
            legacyOwnerPasswordAccepted = await passwordMatches(password, config.ownerBootstrapPasswordHash);
        }
        else if (!config.publicBaseUrl) {
            try {
                legacyOwnerPasswordAccepted = verifyOwnerPassword(password);
            }
            catch {
                legacyOwnerPasswordAccepted = false;
            }
        }
    }
    if (!account && legacyOwnerPasswordAccepted) {
        const hash = await passwordHash(password);
        await pool.execute(`INSERT INTO admin_web_accounts (username,password_hash,role,is_enabled) VALUES ('admin',?,'owner',1)`, [hash]);
        const [created] = await pool.execute('SELECT id,username,password_hash,role,is_enabled,force_password_change FROM admin_web_accounts WHERE username=\'admin\' LIMIT 1');
        account = created[0];
    }
    if (!account || !Number(account.is_enabled) || !await passwordMatches(password, account.password_hash)) {
        await recordLogin(username, ip, 'failed', 'credential_rejected');
        throw new Error('账号或密码错误。');
    }
    await pool.execute('UPDATE admin_web_accounts SET last_login_at=NOW() WHERE id=?', [account.id]);
    await recordLogin(username, ip, 'success', '');
    await recordWebOperation({ actorRef: account.username, actionType: 'web.login', request: { ip }, result: { role: account.role } });
    return createSession(account, ip);
};
const sessionForAdminWeb = async (token, csrfToken) => {
    if (!token)
        return null;
    const pool = await getPool();
    const [rows] = await pool.execute(`SELECT a.id,a.username,a.password_hash,a.role,a.is_enabled,a.force_password_change,s.id AS session_id,s.csrf_secret_hash,s.expires_at,s.absolute_expires_at
    FROM admin_web_sessions s JOIN admin_web_accounts a ON a.id=s.account_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>NOW() AND s.absolute_expires_at>NOW() AND a.is_enabled=1 LIMIT 1`, [tokenHash(token)]);
    const row = rows[0];
    if (!row)
        return null;
    if (csrfToken && !timingSafeEqual(Buffer.from(tokenHash(csrfToken)), Buffer.from(row.csrf_secret_hash)))
        return null;
    await pool.execute('UPDATE admin_web_sessions SET last_seen_at=NOW(),expires_at=LEAST(DATE_ADD(NOW(),INTERVAL ? MINUTE),absolute_expires_at) WHERE id=?', [getAdminWebConfig().sessionIdleMinutes, row.session_id]);
    return { accountId: Number(row.id), username: row.username, role: row.role, csrfToken: null };
};
const logoutAdminWeb = async (token) => {
    if (!token)
        return;
    await (await getPool()).execute('UPDATE admin_web_sessions SET revoked_at=NOW() WHERE token_hash=? AND revoked_at IS NULL', [tokenHash(token)]);
};
const requireOwner = async (actor) => {
    if (actor.role !== 'owner' || actor.username !== 'admin')
        throw new Error('仅主人账号可执行此操作。');
};
const webAdminAccounts = async (actor) => {
    await requireOwner(actor);
    const [rows] = await (await getPool()).execute('SELECT id,username,role,is_enabled,force_password_change,created_at,last_login_at FROM admin_web_accounts ORDER BY FIELD(role,\'owner\',\'admin\',\'viewer\'),username');
    return rows.map(row => ({ id: Number(row.id), username: row.username, role: row.role, enabled: Boolean(row.is_enabled), forcePasswordChange: Boolean(row.force_password_change), createdAt: row.created_at, lastLoginAt: row.last_login_at }));
};
const createWebAdminAccount = async (actor, input) => {
    await requireOwner(actor);
    const username = normalizedUsername(input.username);
    const password = String(input.password ?? '');
    const role = String(input.role ?? 'admin');
    if (!usernamePattern.test(username) || username === 'admin')
        throw new Error('管理员账号必须为 3～32 位小写字母、数字、下划线或连字符，且不能使用 admin。');
    if (!passwordValid(password))
        throw new Error('管理员初始密码长度必须为 10～200 位。');
    if (!['admin', 'viewer'].includes(role))
        throw new Error('只能创建管理员或只读观察员账号。');
    const hash = await passwordHash(password);
    await withTransaction(async (connection) => {
        await connection.execute('INSERT INTO admin_web_accounts (username,password_hash,role,is_enabled) VALUES (?,?,?,1)', [username, hash, role]);
        await recordWebOperation({ actorRef: actor.username, actionType: 'web.account.create', risk: 'high', target: { kind: 'admin_account', id: username }, request: { username, role }, result: { enabled: true } }, connection);
    });
};
const setWebAdminEnabled = async (actor, usernameValue, enabled) => {
    await requireOwner(actor);
    const username = normalizedUsername(usernameValue);
    if (!username || username === 'admin')
        throw new Error('不能禁用或修改主人账号。');
    await withTransaction(async (connection) => {
        const [result] = await connection.execute('UPDATE admin_web_accounts SET is_enabled=? WHERE username=? AND role<>\'owner\'', [enabled ? 1 : 0, username]);
        if (!Number(result.affectedRows))
            throw new Error('未找到可管理的后台账号。');
        if (!enabled)
            await connection.execute('UPDATE admin_web_sessions s JOIN admin_web_accounts a ON a.id=s.account_id SET s.revoked_at=NOW() WHERE a.username=? AND s.revoked_at IS NULL', [username]);
        await recordWebOperation({ actorRef: actor.username, actionType: enabled ? 'web.account.enable' : 'web.account.disable', risk: 'high', target: { kind: 'admin_account', id: username }, result: { enabled } }, connection);
    });
};

export { createWebAdminAccount, loginAdminWeb, logoutAdminWeb, sessionForAdminWeb, setWebAdminEnabled, webAdminAccounts };
