import { getConfigValue } from 'alemonjs';

export type DatabaseConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  connectionLimit: number;
};

type AppConfig = {
  FantasyFinal?: { database?: Partial<DatabaseConfig> };
  /** 兼容项目原有的数据库配置；新配置优先使用 FantasyFinal.database。 */
  mysql?: Partial<DatabaseConfig>;
};

export const getDatabaseConfig = (): DatabaseConfig => {
  const value = getConfigValue<AppConfig>();
  const database = value.FantasyFinal?.database ?? value.mysql;
  if (!database?.host || !database.database || !database.user || !database.password) {
    throw new Error('缺少数据库配置：请填写 FantasyFinal.database（或兼容的 mysql）');
  }
  return {
    host: database.host,
    port: Number(database.port ?? 3306),
    database: database.database,
    user: database.user,
    password: database.password,
    connectionLimit: Number(database.connectionLimit ?? 10)
  };
};
