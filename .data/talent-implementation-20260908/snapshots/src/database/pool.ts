import { createPool, type Pool, type PoolConnection } from 'mysql2/promise';
import { initializeSchema } from './bootstrap';
import { getDatabaseConfig } from './config';

let pool: Pool | undefined;
let initialization: Promise<Pool> | undefined;

export const getPool = async (): Promise<Pool> => {
  if (!initialization) initialization = (async () => {
    const config = getDatabaseConfig();
    const adminPool = createPool({
      host: config.host, port: config.port, user: config.user, password: config.password,
      waitForConnections: true, connectionLimit: 1, charset: 'utf8mb4'
    });
    try {
      await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } finally {
      await adminPool.end();
    }
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
      await connection.commit();
      return result;
    } catch (error: any) {
      try { await connection.rollback(); } catch { /* 连接已断开时无需二次处理 */ }
      const deadlock = error?.code === 'ER_LOCK_DEADLOCK' || Number(error?.errno) === 1213;
      if (!deadlock || attempt === maxAttempts - 1) throw error;
      // 很短的退避可让竞争事务先提交，避免立即重试时再次撞上同一把锁。
      await new Promise<void>(resolve => setTimeout(resolve, 25 * (attempt + 1)));
    } finally {
      connection.release();
    }
  }
  throw new Error('事务重试次数已耗尽。');
};
