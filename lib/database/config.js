import { getConfigValue } from 'alemonjs';

const getDatabaseConfig = () => {
    const value = getConfigValue();
    const database = value.FantasyFinal?.database ?? value.mysql;
    if (!database?.host || !database.database || !database.user || !database.password) {
        throw new Error('缺少数据库配置：请填写 FantasyFinal.database（或兼容的 mysql）');
    }
    if (!/^[A-Za-z0-9_]+$/.test(database.database)) {
        throw new Error('数据库名称只能包含字母、数字和下划线。');
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

export { getDatabaseConfig };
