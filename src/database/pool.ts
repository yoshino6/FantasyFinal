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
      await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
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

export const withTransaction = async <T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> => {
  const connection = await (await getPool()).getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
