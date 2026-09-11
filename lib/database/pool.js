import { createPool } from 'mysql2/promise';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initializeSchema } from './bootstrap.js';
import { getDatabaseConfig } from './config.js';
import { takeAchievementEvents } from '../game/achievement-events.js';

let pool;
let initialization;
const execFileAsync = promisify(execFile);
const ensureLocalMysqlService = async () => {
    if (process.platform !== 'linux')
        return;
    try {
        await execFileAsync('systemctl', ['is-active', '--quiet', 'mysql'], { timeout: 10_000 });
        return;
    }
    catch {
    }
    let lastError;
    for (const service of ['mysql', 'mariadb']) {
        try {
            await execFileAsync('systemctl', ['start', service], { timeout: 20_000 });
            return;
        }
        catch (error) {
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
    }
    catch (error) {
        await adminPool.end();
        const serviceUnavailable = error?.code === 'ECONNREFUSED' || error?.code === 'PROTOCOL_CONNECTION_LOST';
        if (!serviceUnavailable || process.platform !== 'linux' || !/^127\.0\.0\.1$|^localhost$/i.test(config.host))
            throw error;
        await ensureLocalMysqlService();
        const retryPool = createAdminPool();
        try {
            await retryPool.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
            return config;
        }
        finally {
            await retryPool.end();
        }
    }
    finally {
        try {
            await adminPool.end();
        }
        catch { }
    }
};
const getPool = async () => {
    if (!initialization)
        initialization = (async () => {
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
const withTransaction = async (work) => {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const connection = await (await getPool()).getConnection();
        try {
            await connection.beginTransaction();
            const result = await work(connection);
            const achievementEvents = takeAchievementEvents(connection);
            if (achievementEvents.length) {
                const dirty = await (await import('../game/achievement.service.js')).flushAchievements(connection, achievementEvents);
                const { recalculateCharacterStats } = await import('../game/character.service.js');
                for (const id of dirty)
                    await recalculateCharacterStats(connection, id);
            }
            await connection.commit();
            return result;
        }
        catch (error) {
            try {
                await connection.rollback();
            }
            catch { }
            const deadlock = error?.code === 'ER_LOCK_DEADLOCK' || Number(error?.errno) === 1213;
            if (!deadlock || attempt === maxAttempts - 1)
                throw error;
            await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
        }
        finally {
            takeAchievementEvents(connection);
            connection.release();
        }
    }
    throw new Error('事务重试次数已耗尽。');
};

export { getPool, withTransaction };
