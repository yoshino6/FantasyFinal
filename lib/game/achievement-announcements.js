import { retiredAchievementIds } from './achievement-retired.config.js';
import { logger, MessageDirect } from 'alemonjs';
import { getPool } from '../database/pool.js';
import { achievementAnnouncementFormat } from './achievement-message.js';
import { achievementById } from './achievement-rules.js';
import { loadBossAchievementDefinitions } from './achievement-boss.js';
import { achievementDeliveryOutcome } from './achievement-delivery-rules.js';

let running = false;
const deliverAchievementAnnouncements = async () => {
    if (running)
        return;
    running = true;
    try {
        const db = await getPool();
        await db.query("UPDATE achievement_deliveries SET status='cancelled',updated_at=NOW() WHERE achievement_id IN (?) AND status IN ('pending','blocked','uncertain')", [[...retiredAchievementIds]]);
        await db.query("UPDATE achievement_deliveries SET status='uncertain' WHERE status='sending' AND updated_at<DATE_SUB(NOW(),INTERVAL 5 MINUTE)");
        const [rows] = await db.query(`SELECT d.*,a.name_snapshot,a.rarity FROM achievement_deliveries d JOIN achievement_announcements a ON a.achievement_id=d.achievement_id WHERE d.status='pending' AND d.attempts<5 AND a.created_at<=DATE_SUB(NOW(),INTERVAL 15 SECOND) ORDER BY a.created_at,d.bot_id,d.group_id LIMIT 20`);
        if (rows.some(row => !achievementById.has(row.achievement_id)))
            await loadBossAchievementDefinitions(db);
        for (const row of rows) {
            const definition = achievementById.get(row.achievement_id);
            if (!definition) {
                logger.warn({ achievementId: row.achievement_id }, '成就首位公告缺少定义，保留待发送');
                continue;
            }
            const [claimed] = await db.execute("UPDATE achievement_deliveries SET status='sending',attempts=attempts+1,updated_at=NOW() WHERE achievement_id=? AND bot_id=? AND group_id=? AND status='pending'", [row.achievement_id, row.bot_id, row.group_id]);
            if (!claimed.affectedRows)
                continue;
            let outcome = achievementDeliveryOutcome([]);
            try {
                const [members] = await db.execute('SELECT name_snapshot FROM achievement_first_members WHERE achievement_id=? ORDER BY identity_key', [row.achievement_id]);
                const format = achievementAnnouncementFormat({ winner: row.name_snapshot, winners: members.length ? members.map(m => String(m.name_snapshot)) : undefined, name: definition.name, description: definition.description });
                const results = await MessageDirect.create().sendToTarget({ target: { scope: 'group', targetId: String(row.group_id), BotId: String(row.bot_id) }, format });
                outcome = achievementDeliveryOutcome(results);
            }
            catch (error) {
                logger.warn({ err: error }, '成就首位公告发送结果待核查');
            }
            await db.execute('UPDATE achievement_deliveries SET status=?,updated_at=NOW() WHERE achievement_id=? AND bot_id=? AND group_id=?', [outcome.status, row.achievement_id, row.bot_id, row.group_id]);
            await db.execute('INSERT IGNORE INTO achievement_delivery_receipts(achievement_id,bot_id,group_id,attempt,status,result_codes,platform_codes,message_ids) VALUES (?,?,?,?,?,?,?,?)', [row.achievement_id, row.bot_id, row.group_id, Number(row.attempts) + 1, outcome.status, JSON.stringify(outcome.resultCodes), JSON.stringify(outcome.platformCodes), JSON.stringify(outcome.messageIds)]);
        }
    }
    finally {
        running = false;
    }
};

export { deliverAchievementAnnouncements };
