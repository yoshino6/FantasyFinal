import { createPool, type Pool, type PoolConnection } from 'mysql2/promise';
import { getDatabaseConfig } from './config';

let pool: Pool | undefined;

export const getPool = () => {
  if (!pool) {
    pool = createPool({
      ...getDatabaseConfig(),
      waitForConnections: true,
      queueLimit: 0,
      charset: 'utf8mb4'
    });
  }
  return pool;
};

export const withTransaction = async <T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> => {
  const connection = await getPool().getConnection();
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
