import { lamplightWorldPlaces } from '../game/lamplight.config.js';

const lamplightSchema = [
    `CREATE TABLE IF NOT EXISTS player_lamplight_progress (character_id BIGINT UNSIGNED PRIMARY KEY,origin_route VARCHAR(8) NOT NULL,origin_branch VARCHAR(1) NOT NULL,story_version INT NOT NULL,local_hub VARCHAR(64) NOT NULL,phase VARCHAR(16) NOT NULL,node_index INT NOT NULL DEFAULT 0,revision INT NOT NULL DEFAULT 0,flags_json JSON NOT NULL,version INT NOT NULL DEFAULT 1,CONSTRAINT fk_lamplight_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_lamplight_actions (character_id BIGINT UNSIGNED NOT NULL,revision INT NOT NULL,action_key VARCHAR(64) NOT NULL,result_json JSON NOT NULL,PRIMARY KEY(character_id,revision),CONSTRAINT fk_lamplight_action FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_lamplight_rewards (character_id BIGINT UNSIGNED NOT NULL,node_code VARCHAR(32) NOT NULL,copper BIGINT NOT NULL,experience BIGINT NOT NULL,choice_code VARCHAR(8) NOT NULL,record_json JSON NOT NULL,PRIMARY KEY(character_id,node_code),CONSTRAINT fk_lamplight_reward FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_lamplight_battles (session_id CHAR(36) PRIMARY KEY,character_id BIGINT UNSIGNED NOT NULL,node_code VARCHAR(32) NOT NULL,stage INT NOT NULL,state VARCHAR(16) NOT NULL DEFAULT 'active',snapshot_json JSON NOT NULL,CONSTRAINT fk_lamplight_battle FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`
];
const initializeLamplight = async (pool) => {
    for (const sql of lamplightSchema)
        await pool.query(sql);
    for (const [index, [code, name, description]] of lamplightWorldPlaces.entries()) {
        const x = 2000 + index * 20, y = 2000;
        await pool.execute(`INSERT INTO map_regions (code,name,description,min_x,max_x,min_y,max_y,min_z,max_z,is_spawn_enabled,danger_level) VALUES (?,?,?,?,?,?,?,?,?,0,0) ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description)`, [code, name, description, x, x + 4, y, y + 4, 0, 0]);
        await pool.execute(`INSERT IGNORE INTO map_region_areas (region_id,min_x,max_x,min_y,max_y,min_z,max_z) SELECT id,?,?,?,?,0,0 FROM map_regions WHERE code=?`, [x, x + 4, y, y + 4, code]);
        await pool.execute(`INSERT INTO map_npcs (region_id,code,name,description,interaction_kind,pos_x,pos_y,pos_z) SELECT id,?,?,?,'building',?,?,0 FROM map_regions WHERE code=? ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description)`, [`${code}_station`, name, description, x, y, code]);
        await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,trade_price,is_tradeable,effect_json) VALUES (?,?,?,'灯火所至主线','consumable','地图',0,0,0,?) ON DUPLICATE KEY UPDATE description=VALUES(description),effect_json=VALUES(effect_json)`, [`map_${code}`, `${name}地图`, description, JSON.stringify({ map: code })]);
    }
};

export { initializeLamplight, lamplightSchema };
