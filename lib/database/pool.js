import { createPool } from 'mysql2/promise';
import { initializeSchema } from './bootstrap.js';
import { getDatabaseConfig } from './config.js';
import { takeAchievementEvents } from '../game/achievement-events.js';

let pool;
let initialization;
const getPool = async () => {
    if (!initialization)
        initialization = (async () => {
            const config = getDatabaseConfig();
            const adminPool = createPool({
                host: config.host, port: config.port, user: config.user, password: config.password,
                waitForConnections: true, connectionLimit: 1, charset: 'utf8mb4'
            });
            try {
                await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
            }
            finally {
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
