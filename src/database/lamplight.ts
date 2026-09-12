import type {Pool} from 'mysql2/promise';
export const lamplightSchema=[
  `CREATE TABLE IF NOT EXISTS player_lamplight_progress (character_id BIGINT UNSIGNED PRIMARY KEY,origin_route VARCHAR(8) NOT NULL,origin_branch VARCHAR(1) NOT NULL,story_version INT NOT NULL,local_hub VARCHAR(64) NOT NULL,phase VARCHAR(16) NOT NULL,node_index INT NOT NULL DEFAULT 0,revision INT NOT NULL DEFAULT 0,flags_json JSON NOT NULL,version INT NOT NULL DEFAULT 1,CONSTRAINT fk_lamplight_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_lamplight_actions (character_id BIGINT UNSIGNED NOT NULL,revision INT NOT NULL,action_key VARCHAR(64) NOT NULL,result_json JSON NOT NULL,PRIMARY KEY(character_id,revision),CONSTRAINT fk_lamplight_action FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_lamplight_rewards (character_id BIGINT UNSIGNED NOT NULL,node_code VARCHAR(32) NOT NULL,copper BIGINT NOT NULL,experience BIGINT NOT NULL,choice_code VARCHAR(8) NOT NULL,record_json JSON NOT NULL,PRIMARY KEY(character_id,node_code),CONSTRAINT fk_lamplight_reward FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_lamplight_battles (session_id CHAR(36) PRIMARY KEY,character_id BIGINT UNSIGNED NOT NULL,node_code VARCHAR(32) NOT NULL,stage INT NOT NULL,state VARCHAR(16) NOT NULL DEFAULT 'active',snapshot_json JSON NOT NULL,CONSTRAINT fk_lamplight_battle FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`
];
export const initializeLamplight=async(pool:Pool)=>{
  for(const sql of lamplightSchema)await pool.query(sql);
  // “灯火所至”已退出主线，专用剧情地点不再创建或开放。旧进度表只为历史数据完整性保留。
  await pool.execute(`UPDATE characters c JOIN map_regions old_region ON old_region.id=c.current_region_id
    JOIN map_regions target_region ON target_region.code='world_tree'
    JOIN map_npcs target_guild ON target_guild.region_id=target_region.id AND target_guild.code='world_tree_adventurer_guild'
    SET c.current_region_id=target_region.id,c.pos_x=target_guild.pos_x,c.pos_y=target_guild.pos_y,c.pos_z=target_guild.pos_z,c.activity_status='active'
    WHERE old_region.code REGEXP '^lamplight_wm[0-9]{2}$'`);
  await pool.execute("UPDATE map_regions SET newbie_spawn_enabled=0,is_enabled=0 WHERE code REGEXP '^lamplight_wm[0-9]{2}$'");
};
