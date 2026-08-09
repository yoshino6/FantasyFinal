import type { Pool } from 'mysql2/promise';

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS players (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, qq_user_id VARCHAR(32) NOT NULL, qq_nickname VARCHAR(128) NULL,
    status ENUM('registering','active','banned') NOT NULL DEFAULT 'registering',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_players_qq_user_id (qq_user_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS registration_sessions (
    id CHAR(36) NOT NULL, player_id BIGINT UNSIGNED NOT NULL, stage ENUM('story','audience','question','destination','danger','choice') NOT NULL DEFAULT 'story',
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
    constitution_growth DECIMAL(4,1) NOT NULL DEFAULT 0, spirit_growth DECIMAL(4,1) NOT NULL DEFAULT 0, strength_growth DECIMAL(4,1) NOT NULL DEFAULT 0,
    intelligence_growth DECIMAL(4,1) NOT NULL DEFAULT 0, agility_growth DECIMAL(4,1) NOT NULL DEFAULT 0, perception_growth DECIMAL(4,1) NOT NULL DEFAULT 0,
    adventurer_registered TINYINT(1) NOT NULL DEFAULT 0,
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
  , `CREATE TABLE IF NOT EXISTS item_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    description TEXT NOT NULL, item_type ENUM('consumable','material','equipment') NOT NULL DEFAULT 'material',
    weight DECIMAL(8,2) NOT NULL DEFAULT 0, stack_limit INT UNSIGNED NOT NULL DEFAULT 99,
    effect_json JSON NULL, PRIMARY KEY (id), UNIQUE KEY uk_item_code (code)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_inventory (
    character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL,
    PRIMARY KEY (character_id, item_id), CONSTRAINT fk_inventory_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_inventory_item FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_quick_items (
    character_id BIGINT UNSIGNED NOT NULL, quick_slot TINYINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (character_id, quick_slot), UNIQUE KEY uk_quick_item (character_id, item_id),
    CONSTRAINT fk_quick_item_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_quick_item_definition FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_equipment (
    character_id BIGINT UNSIGNED NOT NULL, slot ENUM('weapon') NOT NULL, item_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (character_id, slot), UNIQUE KEY uk_equipment_item (character_id, item_id),
    CONSTRAINT fk_equipment_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_equipment_item FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_blessings (
    character_id BIGINT UNSIGNED NOT NULL, code VARCHAR(64) NOT NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_blessing_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS skill_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    category ENUM('physical','magic','utility') NOT NULL, mana_cost INT UNSIGNED NOT NULL DEFAULT 0, cooldown_turns TINYINT UNSIGNED NOT NULL DEFAULT 0,
    power INT UNSIGNED NOT NULL DEFAULT 100, description TEXT NOT NULL, PRIMARY KEY (id), UNIQUE KEY uk_skill_code (code)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_skills (
    character_id BIGINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NOT NULL, level TINYINT UNSIGNED NOT NULL DEFAULT 1,
    quick_slot TINYINT UNSIGNED NULL, PRIMARY KEY (character_id, skill_id), UNIQUE KEY uk_quick_slot (character_id, quick_slot),
    CONSTRAINT fk_player_skill_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_player_skill_definition FOREIGN KEY (skill_id) REFERENCES skill_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS monster_templates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    monster_class ENUM('normal','elite','boss') NOT NULL DEFAULT 'normal', level INT UNSIGNED NOT NULL DEFAULT 1,
    hp_max INT UNSIGNED NOT NULL, attack INT UNSIGNED NOT NULL, defense INT UNSIGNED NOT NULL, speed INT UNSIGNED NOT NULL,
    perception INT UNSIGNED NOT NULL DEFAULT 0, charisma INT UNSIGNED NOT NULL DEFAULT 0,
    skill_sequence JSON NULL, experience INT UNSIGNED NOT NULL, drops_json JSON NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_monster_code (code)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS monster_spawns (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, template_id BIGINT UNSIGNED NOT NULL, region_id BIGINT UNSIGNED NOT NULL,
    pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL, current_hp INT UNSIGNED NOT NULL, spawned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    defeated_at DATETIME NULL, PRIMARY KEY (id), KEY idx_spawn_location (region_id, pos_x, pos_y, pos_z, defeated_at),
    CONSTRAINT fk_spawn_template FOREIGN KEY (template_id) REFERENCES monster_templates(id),
    CONSTRAINT fk_spawn_region FOREIGN KEY (region_id) REFERENCES map_regions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS combat_sessions (
    id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, spawn_id BIGINT UNSIGNED NOT NULL,
    player_hp INT UNSIGNED NOT NULL, player_mp INT UNSIGNED NOT NULL, cooldowns JSON NOT NULL,
    turn_no INT UNSIGNED NOT NULL DEFAULT 1, state ENUM('active','victory','defeat','escaped') NOT NULL DEFAULT 'active',
    PRIMARY KEY (id), UNIQUE KEY uk_active_character (character_id),
    CONSTRAINT fk_combat_character FOREIGN KEY (character_id) REFERENCES characters(id), CONSTRAINT fk_combat_spawn FOREIGN KEY (spawn_id) REFERENCES monster_spawns(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS parties (
    id CHAR(36) NOT NULL, leader_character_id BIGINT UNSIGNED NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_party_leader (leader_character_id), CONSTRAINT fk_party_leader FOREIGN KEY (leader_character_id) REFERENCES characters(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS party_members (
    party_id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (party_id, character_id), UNIQUE KEY uk_member_party (character_id),
    CONSTRAINT fk_party_member_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
    CONSTRAINT fk_party_member_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
];

export const initializeSchema = async (pool: Pool) => {
  for (const statement of schemaStatements) await pool.query(statement);
  await pool.query("ALTER TABLE registration_sessions MODIFY stage ENUM('story','audience','question','destination','danger','choice') NOT NULL DEFAULT 'story'");
  for (const column of ['constitution_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'spirit_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'strength_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'intelligence_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'agility_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'perception_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'adventurer_registered TINYINT(1) NOT NULL DEFAULT 0']) {
    try { await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  await pool.execute(
    `INSERT INTO map_regions (code, name, description, min_x, max_x, min_y, max_y, min_z, max_z, is_spawn_enabled, danger_level)
     VALUES
       ('world_tree', '世界树', '世界的中心，占据约 20×20 格。', -10, 9, -10, 9, 0, 0, 0, 0),
       ('dark_forest', '幽暗密林', '世界树正下方、常年被薄雾笼罩的约 100×100 格密林。', -50, 49, -110, -11, 0, 0, 1, 1)
     ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), min_x = VALUES(min_x), max_x = VALUES(max_x), min_y = VALUES(min_y), max_y = VALUES(max_y), min_z = VALUES(min_z), max_z = VALUES(max_z), is_spawn_enabled = VALUES(is_spawn_enabled), danger_level = VALUES(danger_level)`
  );
  await pool.query(`INSERT INTO item_definitions (code, name, description, item_type, weight, effect_json) VALUES
    ('healing_herb', '微光草药', '恢复 30 点生命。', 'consumable', 0.20, JSON_OBJECT('heal', 30)),
    ('wolf_fang', '幽狼之牙', '可出售的普通材料。', 'material', 0.15, NULL),
    ('holy_sword_shirulu', '圣剑·希尔露', '物攻 +20、暴击率 +10%；普攻无视 25% 防御，并回复伤害的 10% 生命。', 'equipment', 3.50, JSON_OBJECT('physicalAttack',20,'critRateBp',1000,'ignoreDefensePct',25,'lifestealPct',10)),
    ('demon_sword_aphia', '魔剑·阿菲娅', '魔攻 +25；魔法技能伤害 +30%，魔力消耗 -2。', 'equipment', 3.20, JSON_OBJECT('magicAttack',25,'magicDamagePct',30,'manaCostReduction',2))
    ON DUPLICATE KEY UPDATE name = VALUES(name)`);
  await pool.query(`INSERT INTO skill_definitions (code, name, category, mana_cost, cooldown_turns, power, description) VALUES
    ('arcane_bolt', '奥术飞矢', 'magic', 8, 1, 150, '发射一枚奥术能量。'),
    ('heavy_strike', '沉重一击', 'physical', 5, 2, 180, '造成更高的物理伤害。')
    ON DUPLICATE KEY UPDATE name = VALUES(name)`);
  await pool.query(`INSERT INTO monster_templates (code, name, monster_class, level, hp_max, attack, defense, speed, perception, charisma, skill_sequence, experience, drops_json) VALUES
    ('ball_rabbit', '球兔', 'normal', 1, 38, 8, 1, 125, 6, 14, JSON_ARRAY('hop'), 12, JSON_ARRAY(JSON_OBJECT('code','healing_herb','chance',0.15,'quantity',1))),
    ('spike_boar', '刺猪', 'normal', 2, 88, 17, 5, 92, 9, 3, JSON_ARRAY('charge'), 28, JSON_ARRAY(JSON_OBJECT('code','wolf_fang','chance',0.45,'quantity',1))),
    ('vine_python', '藤蚺', 'normal', 2, 76, 16, 3, 108, 13, 4, JSON_ARRAY('bite'), 30, JSON_ARRAY(JSON_OBJECT('code','healing_herb','chance',0.25,'quantity',1))),
    ('black_bear', '乌熊', 'elite', 4, 215, 29, 10, 82, 11, 2, JSON_ARRAY('howl','bite'), 95, JSON_ARRAY(JSON_OBJECT('code','wolf_fang','chance',1,'quantity',2))),
    ('mist_wolf', '雾影狼', 'normal', 1, 75, 14, 4, 95, 8, 1, JSON_ARRAY(), 20, JSON_ARRAY(JSON_OBJECT('code','wolf_fang','chance',0.7,'quantity',1)))
    ON DUPLICATE KEY UPDATE name = VALUES(name), monster_class = VALUES(monster_class), level = VALUES(level), hp_max = VALUES(hp_max), attack = VALUES(attack), defense = VALUES(defense), speed = VALUES(speed), perception = VALUES(perception), charisma = VALUES(charisma), skill_sequence = VALUES(skill_sequence), experience = VALUES(experience), drops_json = VALUES(drops_json)`);
  await pool.query(`INSERT IGNORE INTO player_skills (character_id, skill_id, quick_slot)
    SELECT c.id, s.id, CASE s.code WHEN 'arcane_bolt' THEN 1 WHEN 'heavy_strike' THEN 2 END FROM characters c JOIN skill_definitions s ON s.code IN ('arcane_bolt','heavy_strike')`);
  await pool.query(`INSERT IGNORE INTO player_inventory (character_id, item_id, quantity)
    SELECT c.id, i.id, 3 FROM characters c JOIN item_definitions i ON i.code='healing_herb'`);
  await pool.query(`INSERT IGNORE INTO player_quick_items (character_id, quick_slot, item_id)
    SELECT c.id, 1, i.id FROM characters c JOIN item_definitions i ON i.code='healing_herb'`);
};
