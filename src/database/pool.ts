import { createPool, type Pool, type PoolConnection } from 'mysql2/promise';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initializeSchema } from './bootstrap';
import { getDatabaseConfig } from './config';
import { takeAchievementEvents } from '../game/achievement-events';

let pool: Pool | undefined;
let initialization: Promise<Pool> | undefined;
const execFileAsync = promisify(execFile);

/**
 * Linux 本机部署时，若 MySQL 服务尚未启动，尝试先启动服务。
 * 不处理远程数据库，也不在 Windows 开发环境中调用 systemctl。
 */
const ensureLocalMysqlService = async () => {
  if (process.platform !== 'linux') return;
  try {
    await execFileAsync('systemctl', ['is-active', '--quiet', 'mysql'], { timeout: 10_000 });
    return;
  } catch {
    // mysql 未运行或服务名为 mariadb，继续尝试启动。
  }

  let lastError: unknown;
  for (const service of ['mysql', 'mariadb']) {
    try {
      await execFileAsync('systemctl', ['start', service], { timeout: 20_000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? '未知错误');
  throw new Error(`无法自动启动本机 MySQL 服务。请确认运行账号有 systemd 权限，或手动执行「sudo systemctl enable --now mysql」。${detail}`);
};

const initializeAdminPool = async () => {
  const config = getDatabaseConfig();
  const createAdminPool = () => createPool({
    host: config.host, port: config.port, user: config.user, password: config.password,
    waitForConnections: true, connectionLimit: 1, charset: 'utf8mb4'
  });

  const adminPool = createAdminPool();
  try {
    await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    return config;
  } catch (error: any) {
    await adminPool.end();
    const serviceUnavailable = error?.code === 'ECONNREFUSED' || error?.code === 'PROTOCOL_CONNECTION_LOST';
    if (!serviceUnavailable || process.platform !== 'linux' || !/^127\.0\.0\.1$|^localhost$/i.test(config.host)) throw error;
    await ensureLocalMysqlService();
    const retryPool = createAdminPool();
    try {
      await retryPool.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      return config;
    } finally {
      await retryPool.end();
    }
  } finally {
    // 重试分支已关闭 retryPool；首次成功分支在这里关闭 adminPool。
    try { await adminPool.end(); } catch { /* 已关闭时忽略 */ }
  }
};

export const getPool = async (): Promise<Pool> => {
  if (!initialization) initialization = (async () => {
    const config = await initializeAdminPool();
    pool = createPool({
      ...config,
      waitForConnections: true,
      queueLimit: 0,
      charset: 'utf8mb4'
    });
    await initializeSchema(pool);
    return pool;
  })();
  return initialization;
};

/**
 * 角色移动、定时抵达、自动战斗等可能同时触及同一批行。
 * InnoDB 检测到死锁会回滚其中一方；此处只对该可安全重试的数据库错误做有限重试。
 */
export const withTransaction = async <T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> => {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const connection = await (await getPool()).getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      const achievementEvents = takeAchievementEvents(connection);
      if (achievementEvents.length) {
        const dirty = await (await import('../game/achievement.service')).flushAchievements(connection, achievementEvents);
        const { recalculateCharacterStats } = await import('../game/character.service');
        for (const id of dirty) await recalculateCharacterStats(connection, id);
      }
      await connection.commit();
      return result;
    } catch (error: any) {
      try { await connection.rollback(); } catch { /* 连接已断开时无需二次处理 */ }
      const deadlock = error?.code === 'ER_LOCK_DEADLOCK' || Number(error?.errno) === 1213;
      if (!deadlock || attempt === maxAttempts - 1) throw error;
      // 很短的退避可让竞争事务先提交，避免立即重试时再次撞上同一把锁。
      await new Promise<void>(resolve => setTimeout(resolve, 25 * (attempt + 1)));
    } finally {
      takeAchievementEvents(connection);
      connection.release();
    }
  }
  throw new Error('事务重试次数已耗尽。');
};
