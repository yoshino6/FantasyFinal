import type { Pool } from 'mysql2/promise';

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS players (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, qq_user_id VARCHAR(32) NOT NULL, qq_nickname VARCHAR(128) NULL,
    status ENUM('registering','active','banned') NOT NULL DEFAULT 'registering',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_players_qq_user_id (qq_user_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS registration_sessions (
    id CHAR(36) NOT NULL, player_id BIGINT UNSIGNED NOT NULL, stage ENUM('story','allocate') NOT NULL DEFAULT 'story',
    constitution SMALLINT UNSIGNED NOT NULL DEFAULT 0, spirit SMALLINT UNSIGNED NOT NULL DEFAULT 0, strength SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    intelligence SMALLINT UNSIGNED NOT NULL DEFAULT 0, agility SMALLINT UNSIGNED NOT NULL DEFAULT 0, perception SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_registration_player (player_id),
    CONSTRAINT fk_registration_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS map_regions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL, description TEXT NOT NULL,
    min_x INT NOT NULL, max_x INT NOT NULL, min_y INT NOT NULL, max_y INT NOT NULL, min_z INT NOT NULL, max_z INT NOT NULL,
    is_spawn_enabled TINYINT(1) NOT NULL DEFAULT 0, danger_level SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (id), UNIQUE KEY uk_regions_code (code)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS characters (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, player_id BIGINT UNSIGNED NOT NULL, name VARCHAR(24) NOT NULL,
    level INT UNSIGNED NOT NULL DEFAULT 1, experience BIGINT UNSIGNED NOT NULL DEFAULT 0,
    constitution SMALLINT UNSIGNED NOT NULL, spirit SMALLINT UNSIGNED NOT NULL, strength SMALLINT UNSIGNED NOT NULL,
    intelligence SMALLINT UNSIGNED NOT NULL, agility SMALLINT UNSIGNED NOT NULL, perception SMALLINT UNSIGNED NOT NULL,
    hp_max INT UNSIGNED NOT NULL, mp_max INT UNSIGNED NOT NULL, physical_attack INT UNSIGNED NOT NULL, magic_attack INT UNSIGNED NOT NULL,
    physical_defense INT UNSIGNED NOT NULL, magic_defense INT UNSIGNED NOT NULL, accuracy INT UNSIGNED NOT NULL, evasion INT UNSIGNED NOT NULL,
    crit_rate_bp INT UNSIGNED NOT NULL, crit_damage_bp INT UNSIGNED NOT NULL, crit_resist_bp INT UNSIGNED NOT NULL,
    crit_damage_reduction_bp INT UNSIGNED NOT NULL, tenacity INT UNSIGNED NOT NULL, speed INT UNSIGNED NOT NULL,
    stat_formula_version SMALLINT UNSIGNED NOT NULL DEFAULT 1, current_region_id BIGINT UNSIGNED NOT NULL,
    pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_characters_player (player_id), KEY idx_character_position (current_region_id, pos_x, pos_y, pos_z),
    CONSTRAINT fk_character_player FOREIGN KEY (player_id) REFERENCES players(id),
    CONSTRAINT fk_character_region FOREIGN KEY (current_region_id) REFERENCES map_regions(id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, player_id BIGINT UNSIGNED NOT NULL, event_type VARCHAR(64) NOT NULL, payload JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_player_events_player_created (player_id, created_at),
    CONSTRAINT fk_event_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
];

export const initializeSchema = async (pool: Pool) => {
  for (const statement of schemaStatements) await pool.query(statement);
  await pool.execute(
    `INSERT INTO map_regions (code, name, description, min_x, max_x, min_y, max_y, min_z, max_z, is_spawn_enabled, danger_level)
     VALUES
       ('world_tree', '世界树', '世界的中心，坐标原点。', -100, 100, -100, 100, -20, 120, 0, 0),
       ('dark_forest', '幽暗密林', '常年被薄雾笼罩的初始区域。', 300, 700, -500, -100, 0, 80, 1, 1)
     ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)`
  );
};
