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
};

export const getDatabaseConfig = (): DatabaseConfig => {
  const value = getConfigValue<AppConfig>();
  const database = value.FantasyFinal?.database;
  if (!database?.host || !database.database || !database.user || !database.password) {
    throw new Error('缺少 FantasyFinal.database 数据库配置');
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
