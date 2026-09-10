import type { Pool } from 'mysql2/promise';
import { achievementRewardItems } from '../game/achievement-rewards.config';

// 身份与成就不引用 players/characters：注销角色不能级联删除永久记录。
export const achievementSchema = [
  `CREATE TABLE IF NOT EXISTS achievement_delivery_receipts (achievement_id VARCHAR(24) NOT NULL,bot_id VARCHAR(128) NOT NULL,group_id VARCHAR(128) NOT NULL,attempt INT NOT NULL,status VARCHAR(16) NOT NULL,result_codes JSON NOT NULL,platform_codes JSON NOT NULL,message_ids JSON NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),PRIMARY KEY(achievement_id,bot_id,group_id,attempt)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS achievement_first_members (achievement_id VARCHAR(24) NOT NULL,identity_key VARCHAR(128) NOT NULL,name_snapshot VARCHAR(128) NOT NULL,PRIMARY KEY(achievement_id,identity_key)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS achievement_boss_definitions (id VARCHAR(24) PRIMARY KEY,boss_code VARCHAR(128) NOT NULL,difficulty VARCHAR(24) NOT NULL,definition_json JSON NOT NULL,UNIQUE KEY boss_difficulty(boss_code,difficulty)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS achievement_profiles (identity_key VARCHAR(128) PRIMARY KEY, activated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS achievement_progress (identity_key VARCHAR(128) NOT NULL, life_key VARCHAR(40) NOT NULL, metric VARCHAR(96) NOT NULL, value_json JSON NOT NULL, PRIMARY KEY(identity_key,life_key,metric)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS achievement_events (identity_key VARCHAR(128) NOT NULL, event_key VARCHAR(160) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY(identity_key,event_key)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS achievement_counters (achievement_id VARCHAR(24) PRIMARY KEY, completed_count BIGINT UNSIGNED NOT NULL DEFAULT 0) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS achievement_completions (identity_key VARCHAR(128) NOT NULL, achievement_id VARCHAR(24) NOT NULL, ordinal BIGINT UNSIGNED NOT NULL, completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), reward_attribute VARCHAR(24) NOT NULL, reward_points INT NOT NULL, rarity VARCHAR(12) NOT NULL, name_snapshot VARCHAR(128) NOT NULL, PRIMARY KEY(identity_key,achievement_id), UNIQUE KEY achievement_rank(achievement_id,ordinal)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS achievement_rewards (identity_key VARCHAR(128) NOT NULL, reward_key VARCHAR(64) NOT NULL, quantity INT NOT NULL DEFAULT 0, PRIMARY KEY(identity_key,reward_key)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS achievement_box_rewards (identity_key VARCHAR(128) NOT NULL,achievement_id VARCHAR(24) NOT NULL,reward_key VARCHAR(64) NOT NULL,quantity INT NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),PRIMARY KEY(identity_key,achievement_id)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS achievement_announcements (achievement_id VARCHAR(24) PRIMARY KEY, name_snapshot VARCHAR(128) NOT NULL, rarity VARCHAR(12) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS achievement_deliveries (achievement_id VARCHAR(24) NOT NULL, bot_id VARCHAR(128) NOT NULL, group_id VARCHAR(128) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending', attempts INT NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(achievement_id,bot_id,group_id)) ENGINE=InnoDB`
];
export const initializeAchievements = async (pool: Pool) => {
  for (const sql of achievementSchema) await pool.query(sql);
};
export const seedAchievementProfiles = async (pool: Pool) => {
  // 一库一个正式世界；这里只建立分母身份，不追授历史达成或伪造首位。
  await pool.query(`INSERT IGNORE INTO achievement_profiles(identity_key) SELECT DISTINCT p.qq_user_id FROM players p JOIN characters c ON c.player_id=p.id WHERE c.npc_code IS NULL`);
  await (await import('../game/achievement-boss')).loadBossAchievementDefinitions(pool);
  await (await import('../game/achievement-boss-reward-migration')).initializeBossAchievementRewards(pool);
  for(const item of achievementRewardItems)await pool.execute(`INSERT INTO item_definitions
    (code,name,description,obtain_source,item_type,item_category,rarity,required_level,weight,trade_price,stack_limit,stackable,is_tradeable,effect_json)
    VALUES (?,?,?,'成就道具匣',?,?,?,1,0,0,99,1,0,?)
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),rarity=VALUES(rarity),required_level=VALUES(required_level),weight=VALUES(weight),trade_price=VALUES(trade_price),stack_limit=VALUES(stack_limit),stackable=VALUES(stackable),is_tradeable=VALUES(is_tradeable),effect_json=VALUES(effect_json)`,[item.key,item.name,item.description,item.itemType,item.category,item.rarity,JSON.stringify(item.effect)]);
  await (await import('../game/achievement.service')).backfillAchievementBoxRewards(pool);
};
