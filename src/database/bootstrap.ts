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
    gender VARCHAR(8) NOT NULL DEFAULT '未设定', free_name_change_used TINYINT(1) NOT NULL DEFAULT 0, free_gender_change_used TINYINT(1) NOT NULL DEFAULT 0,
    level INT UNSIGNED NOT NULL DEFAULT 1, experience BIGINT UNSIGNED NOT NULL DEFAULT 0, skill_points INT UNSIGNED NOT NULL DEFAULT 1,
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
    description TEXT NOT NULL, obtain_source VARCHAR(128) NOT NULL DEFAULT '未知来源', item_type ENUM('consumable','material','equipment') NOT NULL DEFAULT 'material', item_category VARCHAR(32) NOT NULL DEFAULT '特殊', codex_id CHAR(7) NULL,
    weight DECIMAL(8,2) NOT NULL DEFAULT 0, stack_limit INT UNSIGNED NOT NULL DEFAULT 99, stackable TINYINT(1) NOT NULL DEFAULT 1,
    effect_json JSON NULL, PRIMARY KEY (id), UNIQUE KEY uk_item_code (code)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_item_instances (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL,
    quality DECIMAL(5,2) NOT NULL DEFAULT 100.00, durability INT UNSIGNED NOT NULL DEFAULT 100, durability_max INT UNSIGNED NOT NULL DEFAULT 100,
    effect_json JSON NULL, acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_item_instance_character_acquired (character_id, acquired_at),
    CONSTRAINT fk_item_instance_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_item_instance_definition FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_item_codex (
    character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,item_id), CONSTRAINT fk_item_codex_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_item_codex_definition FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_inventory (
    character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL, acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    character_id BIGINT UNSIGNED NOT NULL, slot ENUM('weapon','offhand','shoulder','upper','waist','lower','feet','necklace','bracelet','ring') NOT NULL, item_id BIGINT UNSIGNED NOT NULL, instance_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (character_id, slot), UNIQUE KEY uk_equipment_item (character_id, item_id), UNIQUE KEY uk_equipment_instance (character_id, instance_id),
    CONSTRAINT fk_equipment_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_equipment_item FOREIGN KEY (item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_equipment_instance FOREIGN KEY (instance_id) REFERENCES player_item_instances(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_blessings (
    character_id BIGINT UNSIGNED NOT NULL, code VARCHAR(64) NOT NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_blessing_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS skill_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    category ENUM('physical','magic','utility') NOT NULL, damage_type VARCHAR(16) NOT NULL DEFAULT '无', codex_id CHAR(7) NULL,
    mana_cost INT UNSIGNED NOT NULL DEFAULT 0, cooldown_turns TINYINT UNSIGNED NOT NULL DEFAULT 0,
    power INT UNSIGNED NOT NULL DEFAULT 100, learn_cost TINYINT UNSIGNED NOT NULL DEFAULT 1, upgrade_cost TINYINT UNSIGNED NOT NULL DEFAULT 1,
    max_level TINYINT UNSIGNED NOT NULL DEFAULT 5, power_per_level INT UNSIGNED NOT NULL DEFAULT 15, cooldown_reduction_per_level TINYINT UNSIGNED NOT NULL DEFAULT 0,
    description TEXT NOT NULL, PRIMARY KEY (id), UNIQUE KEY uk_skill_code (code), UNIQUE KEY uk_skill_codex_id (codex_id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_skills (
    character_id BIGINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NOT NULL, level TINYINT UNSIGNED NOT NULL DEFAULT 1,
    quick_slot TINYINT UNSIGNED NULL, learned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (character_id, skill_id), UNIQUE KEY uk_quick_slot (character_id, quick_slot),
    CONSTRAINT fk_player_skill_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_player_skill_definition FOREIGN KEY (skill_id) REFERENCES skill_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_skill_discoveries (
    character_id BIGINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NOT NULL, discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,skill_id), KEY idx_skill_discovery_order (character_id,discovered_at),
    CONSTRAINT fk_skill_discovery_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_skill_discovery_skill FOREIGN KEY (skill_id) REFERENCES skill_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS effect_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    effect_type ENUM('damage_over_time','stat_modifier','cleanse','control','shield','heal_over_time') NOT NULL,
    default_value DECIMAL(8,3) NOT NULL DEFAULT 0, default_duration TINYINT UNSIGNED NOT NULL DEFAULT 0,
    max_level TINYINT UNSIGNED NOT NULL DEFAULT 1, max_stacks TINYINT UNSIGNED NOT NULL DEFAULT 1, stackable TINYINT(1) NOT NULL DEFAULT 0,
    description TEXT NOT NULL, PRIMARY KEY (id), UNIQUE KEY uk_effect_code (code)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS skill_effects (
    skill_id BIGINT UNSIGNED NOT NULL, effect_id BIGINT UNSIGNED NOT NULL, effect_level TINYINT UNSIGNED NOT NULL DEFAULT 1,
    value_override DECIMAL(8,3) NULL, duration_override TINYINT UNSIGNED NULL, target_scope ENUM('enemy','ally','self') NOT NULL DEFAULT 'enemy',
    trigger_timing ENUM('on_hit','on_cast','turn_start') NOT NULL DEFAULT 'on_hit', PRIMARY KEY (skill_id,effect_id),
    CONSTRAINT fk_skill_effect_skill FOREIGN KEY (skill_id) REFERENCES skill_definitions(id) ON DELETE CASCADE,
    CONSTRAINT fk_skill_effect_definition FOREIGN KEY (effect_id) REFERENCES effect_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS monster_templates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    monster_class ENUM('normal','elite','boss') NOT NULL DEFAULT 'normal', level INT UNSIGNED NOT NULL DEFAULT 1,
    hp_max INT UNSIGNED NOT NULL, attack INT UNSIGNED NOT NULL, defense INT UNSIGNED NOT NULL, speed INT UNSIGNED NOT NULL,
    perception INT UNSIGNED NOT NULL DEFAULT 0, charisma INT UNSIGNED NOT NULL DEFAULT 0, weakness_json JSON NULL, resistance_json JSON NULL,
    skill_sequence JSON NULL, experience INT UNSIGNED NOT NULL, drops_json JSON NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_monster_code (code)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS monster_skill_learn_rules (
    monster_template_id BIGINT UNSIGNED NOT NULL, source_skill_code VARCHAR(64) NOT NULL, skill_id BIGINT UNSIGNED NOT NULL, chance DECIMAL(6,5) NOT NULL,
    PRIMARY KEY (monster_template_id,skill_id),
    CONSTRAINT fk_skill_learn_monster FOREIGN KEY (monster_template_id) REFERENCES monster_templates(id) ON DELETE CASCADE,
    CONSTRAINT fk_skill_learn_skill FOREIGN KEY (skill_id) REFERENCES skill_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS map_monster_pools (
    region_id BIGINT UNSIGNED NOT NULL, monster_template_id BIGINT UNSIGNED NOT NULL, spawn_weight INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (region_id, monster_template_id),
    CONSTRAINT fk_map_monster_pool_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE,
    CONSTRAINT fk_map_monster_pool_template FOREIGN KEY (monster_template_id) REFERENCES monster_templates(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS monster_encounter_texts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, monster_template_id BIGINT UNSIGNED NOT NULL, description TEXT NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_monster_encounter_text (monster_template_id, description(191)),
    CONSTRAINT fk_monster_encounter_template FOREIGN KEY (monster_template_id) REFERENCES monster_templates(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS map_npcs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, region_id BIGINT UNSIGNED NOT NULL, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    description TEXT NOT NULL, pos_x INT NULL, pos_y INT NULL, pos_z INT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_map_npc_code (region_id, code),
    CONSTRAINT fk_map_npc_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS map_special_objects (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, region_id BIGINT UNSIGNED NOT NULL, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    description TEXT NOT NULL, pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_map_special_object_code (region_id, code), UNIQUE KEY uk_map_special_object_position (region_id, pos_x, pos_y, pos_z),
    CONSTRAINT fk_map_special_object_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS map_move_texts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, region_id BIGINT UNSIGNED NOT NULL, description TEXT NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_map_move_text (region_id, description(128)),
    CONSTRAINT fk_map_move_text_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS monster_spawns (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, template_id BIGINT UNSIGNED NOT NULL, region_id BIGINT UNSIGNED NOT NULL,
    pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL, current_hp INT UNSIGNED NOT NULL, spawned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    defeated_at DATETIME NULL, PRIMARY KEY (id), KEY idx_spawn_location (region_id, pos_x, pos_y, pos_z, defeated_at), KEY idx_spawn_active_region (region_id, defeated_at),
    CONSTRAINT fk_spawn_template FOREIGN KEY (template_id) REFERENCES monster_templates(id),
    CONSTRAINT fk_spawn_region FOREIGN KEY (region_id) REFERENCES map_regions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS combat_sessions (
    id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, spawn_id BIGINT UNSIGNED NOT NULL,
    player_hp INT UNSIGNED NOT NULL, player_mp INT UNSIGNED NOT NULL, cooldowns JSON NOT NULL,
    turn_no INT UNSIGNED NOT NULL DEFAULT 1, state ENUM('active','victory','defeat','escaped') NOT NULL DEFAULT 'active',
    PRIMARY KEY (id), KEY idx_combat_character_state (character_id, state),
    CONSTRAINT fk_combat_character FOREIGN KEY (character_id) REFERENCES characters(id), CONSTRAINT fk_combat_spawn FOREIGN KEY (spawn_id) REFERENCES monster_spawns(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS combat_members (
    session_id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, current_hp INT UNSIGNED NOT NULL, current_mp INT UNSIGNED NOT NULL,
    selected_target_id BIGINT UNSIGNED NULL, pending_action JSON NULL, is_defeated TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, character_id), KEY idx_combat_member_character (character_id),
    CONSTRAINT fk_combat_member_session FOREIGN KEY (session_id) REFERENCES combat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_member_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_member_target FOREIGN KEY (selected_target_id) REFERENCES monster_spawns(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS combat_targets (
    session_id CHAR(36) NOT NULL, spawn_id BIGINT UNSIGNED NOT NULL, is_defeated TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, spawn_id), KEY idx_combat_target_active (session_id, is_defeated),
    CONSTRAINT fk_combat_target_session FOREIGN KEY (session_id) REFERENCES combat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_target_spawn FOREIGN KEY (spawn_id) REFERENCES monster_spawns(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS combat_threat (
    session_id CHAR(36) NOT NULL, spawn_id BIGINT UNSIGNED NOT NULL, character_id BIGINT UNSIGNED NOT NULL, threat INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, spawn_id, character_id), KEY idx_combat_threat_target (session_id, spawn_id, threat),
    CONSTRAINT fk_combat_threat_session FOREIGN KEY (session_id) REFERENCES combat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_threat_spawn FOREIGN KEY (spawn_id) REFERENCES monster_spawns(id),
    CONSTRAINT fk_combat_threat_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS combat_status_effects (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, session_id CHAR(36) NOT NULL, target_kind ENUM('member','target') NOT NULL, target_id BIGINT UNSIGNED NOT NULL,
    effect_id BIGINT UNSIGNED NOT NULL, effect_level TINYINT UNSIGNED NOT NULL, value DECIMAL(8,3) NOT NULL, stacks TINYINT UNSIGNED NOT NULL DEFAULT 1,
    remaining_turns TINYINT UNSIGNED NOT NULL, PRIMARY KEY (id), UNIQUE KEY uk_combat_effect_target (session_id,target_kind,target_id,effect_id),
    KEY idx_combat_effect_turn (session_id,remaining_turns),
    CONSTRAINT fk_combat_effect_session FOREIGN KEY (session_id) REFERENCES combat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_effect_definition FOREIGN KEY (effect_id) REFERENCES effect_definitions(id) ON DELETE CASCADE
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
  try { await pool.query('ALTER TABLE combat_sessions DROP INDEX uk_active_character'); } catch (error: any) { if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw error; }
  try { await pool.query('ALTER TABLE combat_sessions ADD KEY idx_combat_character_state (character_id, state)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  try { await pool.query('ALTER TABLE monster_spawns ADD KEY idx_spawn_active_region (region_id, defeated_at)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  await pool.query("ALTER TABLE registration_sessions MODIFY stage ENUM('story','audience','question','destination','danger','choice') NOT NULL DEFAULT 'story'");
  await pool.query("ALTER TABLE player_equipment MODIFY slot ENUM('weapon','offhand','shoulder','upper','waist','lower','feet','necklace','bracelet','ring') NOT NULL");
  try { await pool.query('ALTER TABLE player_equipment ADD COLUMN instance_id BIGINT UNSIGNED NULL'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  await pool.query(`UPDATE player_equipment pe JOIN (SELECT character_id,item_id,MIN(id) AS instance_id FROM player_item_instances GROUP BY character_id,item_id) ii ON ii.character_id=pe.character_id AND ii.item_id=pe.item_id SET pe.instance_id=ii.instance_id WHERE pe.instance_id IS NULL`);
  try { await pool.query('ALTER TABLE player_equipment ADD UNIQUE KEY uk_equipment_instance (character_id,instance_id)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  for (const column of ['constitution_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'spirit_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'strength_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'intelligence_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'agility_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'perception_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'adventurer_registered TINYINT(1) NOT NULL DEFAULT 0', "gender VARCHAR(8) NOT NULL DEFAULT '未设定'", 'free_name_change_used TINYINT(1) NOT NULL DEFAULT 0', 'free_gender_change_used TINYINT(1) NOT NULL DEFAULT 0']) {
    try { await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  for (const column of ["item_category VARCHAR(32) NOT NULL DEFAULT '特殊'", "obtain_source VARCHAR(128) NOT NULL DEFAULT '未知来源'", 'stackable TINYINT(1) NOT NULL DEFAULT 1', 'codex_id CHAR(7) NULL']) {
    try { await pool.query(`ALTER TABLE item_definitions ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  for (const column of ["damage_type VARCHAR(16) NOT NULL DEFAULT '无'", 'codex_id CHAR(7) NULL']) {
    try { await pool.query(`ALTER TABLE skill_definitions ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query('ALTER TABLE monster_skill_learn_rules ADD COLUMN source_skill_code VARCHAR(64) NULL AFTER monster_template_id'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  for (const column of ['skill_points INT UNSIGNED NOT NULL DEFAULT 1']) {
    try { await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  for (const column of ['learn_cost TINYINT UNSIGNED NOT NULL DEFAULT 1', 'upgrade_cost TINYINT UNSIGNED NOT NULL DEFAULT 1', 'max_level TINYINT UNSIGNED NOT NULL DEFAULT 5', 'power_per_level INT UNSIGNED NOT NULL DEFAULT 15', 'cooldown_reduction_per_level TINYINT UNSIGNED NOT NULL DEFAULT 0']) {
    try { await pool.query(`ALTER TABLE skill_definitions ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query('ALTER TABLE player_skills ADD COLUMN learned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE skill_definitions ADD UNIQUE KEY uk_skill_codex_id (codex_id)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  for (const column of ['weakness_json JSON NULL', 'resistance_json JSON NULL']) {
    try { await pool.query(`ALTER TABLE monster_templates ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query('ALTER TABLE player_inventory ADD COLUMN acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  await pool.query(`UPDATE item_definitions SET item_category=CASE code WHEN 'holy_sword_shirulu' THEN '武器' WHEN 'demon_sword_aphia' THEN '武器' WHEN 'healing_herb' THEN '药剂' WHEN 'wolf_fang' THEN '兽材' ELSE item_category END, stackable=CASE WHEN item_type='equipment' THEN 0 ELSE 1 END`);
  await pool.query(`UPDATE item_definitions SET codex_id=CONCAT(CASE WHEN item_type='equipment' THEN CASE item_category WHEN '武器' THEN '11' WHEN '副手' THEN '12' WHEN '头部' THEN '13' WHEN '上装' THEN '14' WHEN '腰部' THEN '15' WHEN '下装' THEN '16' WHEN '脚部' THEN '17' WHEN '项链' THEN '18' WHEN '手镯' THEN '19' WHEN '戒指' THEN '10' ELSE '19' END WHEN item_type='consumable' THEN CASE item_category WHEN '药剂' THEN '21' WHEN '食物' THEN '22' ELSE '23' END WHEN item_type='material' THEN CASE item_category WHEN '食材' THEN '31' WHEN '草药' THEN '32' ELSE '39' END ELSE '99' END, LPAD(id,5,'0')) WHERE codex_id IS NULL`);
  try { await pool.query('ALTER TABLE item_definitions ADD UNIQUE KEY uk_item_codex_id (codex_id)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  await pool.execute(
    `INSERT INTO map_regions (code, name, description, min_x, max_x, min_y, max_y, min_z, max_z, is_spawn_enabled, danger_level)
     VALUES
       ('world_tree', '世界树', '世界的中心，占据约 20×20 格。', -10, 9, -10, 9, 0, 0, 0, 0),
       ('dark_forest', '幽暗密林', '世界树正下方、常年被薄雾笼罩的约 100×100 格密林。', -50, 49, -110, -11, 0, 0, 1, 1)
     ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), min_x = VALUES(min_x), max_x = VALUES(max_x), min_y = VALUES(min_y), max_y = VALUES(max_y), min_z = VALUES(min_z), max_z = VALUES(max_z), is_spawn_enabled = VALUES(is_spawn_enabled), danger_level = VALUES(danger_level)`
  );
  await pool.query(`INSERT INTO item_definitions (code, name, description, obtain_source, item_type, item_category, weight, stackable, effect_json) VALUES
    ('healing_herb', '微光草药', '恢复 30 点生命。', '野外采集与探索发现', 'consumable', '药剂', 0.20, 1, JSON_OBJECT('heal', 30)),
    ('wolf_fang', '幽狼之牙', '可出售的普通材料。', '野外怪物掉落', 'material', '兽材', 0.15, 1, NULL),
    ('holy_sword_shirulu', '圣剑·希尔露', '物攻 +20、暴击属性 +80；普攻无视 25% 防御，并回复伤害的 10% 生命。', '初始恩赐', 'equipment', '武器', 3.50, 0, JSON_OBJECT('physicalAttack',20,'critRateBp',80,'ignoreDefensePct',25,'lifestealPct',10)),
    ('demon_sword_aphia', '魔剑·阿菲娅', '魔攻 +25；魔法技能伤害 +30%，魔力消耗 -2。', '初始恩赐', 'equipment', '武器', 3.20, 0, JSON_OBJECT('magicAttack',25,'magicDamagePct',30,'manaCostReduction',2)),
    ('rename_card', '改名卡', '用于再次修改角色昵称。首次改名免费，此后每次改名消耗一张。', '特殊途径获得', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('characterChange','name')),
    ('gender_change_card', '改性卡', '用于再次修改角色性别。首次改性免费，此后每次改性消耗一张。', '特殊途径获得', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('characterChange','gender'))
    ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), obtain_source = VALUES(obtain_source), item_category = VALUES(item_category), stackable = VALUES(stackable), effect_json = VALUES(effect_json)`);
  await pool.query(`UPDATE item_definitions SET codex_id=CONCAT(CASE WHEN item_type='equipment' THEN CASE item_category WHEN '武器' THEN '11' WHEN '副手' THEN '12' WHEN '头部' THEN '13' WHEN '上装' THEN '14' WHEN '腰部' THEN '15' WHEN '下装' THEN '16' WHEN '脚部' THEN '17' WHEN '项链' THEN '18' WHEN '手镯' THEN '19' WHEN '戒指' THEN '10' ELSE '19' END WHEN item_type='consumable' THEN CASE item_category WHEN '药剂' THEN '21' WHEN '食物' THEN '22' ELSE '23' END WHEN item_type='material' THEN CASE item_category WHEN '食材' THEN '31' WHEN '草药' THEN '32' ELSE '39' END ELSE '99' END, LPAD(id,5,'0')) WHERE codex_id IS NULL`);
  await pool.query(`INSERT INTO skill_definitions (code, name, category, mana_cost, cooldown_turns, power, description) VALUES
    ('heavy_strike', '重击', 'physical', 5, 2, 180, '凝聚力量的沉重打击。'),
    ('arcane_bolt', '奥术飞矢', 'magic', 8, 1, 150, '发射一枚奥术能量。'),
    ('armor_break', '碎甲斩', 'physical', 8, 2, 130, '斩击并施加脆弱。'),
    ('fireball', '火球术', 'magic', 12, 2, 165, '爆裂火焰，可能灼烧敌人。'),
    ('toxic_edge', '淬毒刃', 'physical', 10, 2, 120, '在武器上附毒，使中毒可以叠层。'),
    ('purifying_light', '净化之光', 'magic', 14, 3, 90, '净化己方全部异常状态。'),
    ('frost_bind', '冰缚术', 'magic', 13, 3, 115, '冰霜束缚敌人，降低速度。'),
    ('bloodletting', '割裂', 'physical', 9, 2, 145, '造成伤口，持续流血。'),
    ('hop', '跃击', 'physical', 0, 0, 100, '球兔的快速撞击。'),
    ('charge', '冲撞', 'physical', 0, 1, 135, '刺猪的蓄力冲撞。'),
    ('bite', '撕咬', 'physical', 0, 0, 125, '野兽的凶猛撕咬。'),
    ('howl', '震慑咆哮', 'magic', 0, 1, 70, '以咆哮扰乱敌人。'),
    ('jump_strike', '跃步重击', 'physical', 4, 1, 135, '将球兔的跃击改良为适合人类施展的重击。'),
    ('bite_slash', '咬合斩', 'physical', 5, 1, 145, '将猛兽撕咬的发力方式融入剑技，斩开目标。'),
    ('war_cry', '震荡战吼', 'magic', 8, 2, 95, '以经过控制的战吼震荡敌人的精神。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),description=VALUES(description)`);
  await pool.query(`UPDATE skill_definitions SET damage_type=CASE code WHEN 'arcane_bolt' THEN '奥术' WHEN 'heavy_strike' THEN '打击' WHEN 'armor_break' THEN '斩击' WHEN 'fireball' THEN '火' WHEN 'toxic_edge' THEN '刺击' WHEN 'purifying_light' THEN '光' WHEN 'frost_bind' THEN '冰' WHEN 'bloodletting' THEN '斩击' WHEN 'hop' THEN '打击' WHEN 'jump_strike' THEN '打击' WHEN 'charge' THEN '刺击' WHEN 'bite' THEN '斩击' WHEN 'bite_slash' THEN '斩击' WHEN 'howl' THEN '暗' WHEN 'war_cry' THEN '暗' ELSE damage_type END`);
  await pool.query(`UPDATE skill_definitions SET learn_cost=CASE code WHEN 'heavy_strike' THEN 1 WHEN 'armor_break' THEN 1 WHEN 'arcane_bolt' THEN 1 WHEN 'bloodletting' THEN 1 WHEN 'jump_strike' THEN 1 WHEN 'bite_slash' THEN 1 WHEN 'charge' THEN 1 WHEN 'war_cry' THEN 2 WHEN 'toxic_edge' THEN 2 WHEN 'fireball' THEN 2 WHEN 'frost_bind' THEN 2 WHEN 'purifying_light' THEN 3 ELSE 99 END, upgrade_cost=CASE code WHEN 'heavy_strike' THEN 1 WHEN 'armor_break' THEN 1 WHEN 'arcane_bolt' THEN 1 WHEN 'bloodletting' THEN 1 WHEN 'jump_strike' THEN 1 WHEN 'bite_slash' THEN 1 WHEN 'charge' THEN 1 WHEN 'war_cry' THEN 2 WHEN 'toxic_edge' THEN 2 WHEN 'fireball' THEN 2 WHEN 'frost_bind' THEN 2 WHEN 'purifying_light' THEN 3 ELSE 99 END, max_level=CASE WHEN code IN ('hop','bite','howl') THEN 1 ELSE 5 END, power_per_level=CASE WHEN code IN ('hop','bite','howl') THEN 0 ELSE 15 END, cooldown_reduction_per_level=CASE WHEN code IN ('heavy_strike','armor_break','fireball','toxic_edge','purifying_light','frost_bind','bloodletting','jump_strike','bite_slash','charge','war_cry') THEN 1 ELSE 0 END`);
  await pool.query(`UPDATE skill_definitions SET codex_id=CONCAT(CASE category WHEN 'physical' THEN '41' WHEN 'magic' THEN '42' ELSE '49' END, LPAD(id,5,'0')) WHERE codex_id IS NULL`);
  await pool.query(`INSERT INTO effect_definitions (code,name,effect_type,default_value,default_duration,max_level,max_stacks,stackable,description) VALUES
    ('vulnerability','脆弱','stat_modifier',25,3,5,1,0,'降低目标物理防御，效果值为百分比。'),
    ('burn','灼烧','damage_over_time',5,3,5,1,0,'每回合损失最大生命值一定比例。'),
    ('poison','中毒','damage_over_time',3,3,5,5,1,'每回合损失最大生命值一定比例，可叠加。'),
    ('bleeding','流血','damage_over_time',4,3,5,3,1,'每回合损失最大生命值一定比例，可叠加。'),
    ('slow','迟缓','stat_modifier',20,2,5,1,0,'降低速度，效果值为百分比。'),
    ('stun','眩晕','control',1,1,3,1,0,'无法进行一次行动。'),
    ('purify','净化','cleanse',1,0,1,1,0,'移除目标全部异常状态。'),
    ('barrier','护盾','shield',12,3,5,1,0,'获得相当于最大生命值一定比例的护盾。'),
    ('regeneration','再生','heal_over_time',4,3,5,1,0,'每回合恢复最大生命值一定比例。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),default_value=VALUES(default_value),default_duration=VALUES(default_duration),max_level=VALUES(max_level),max_stacks=VALUES(max_stacks),stackable=VALUES(stackable),description=VALUES(description)`);
  await pool.query(`INSERT INTO skill_effects (skill_id,effect_id,effect_level,target_scope,trigger_timing) VALUES
    ((SELECT id FROM skill_definitions WHERE code='armor_break'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='fireball'),(SELECT id FROM effect_definitions WHERE code='burn'),1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='toxic_edge'),(SELECT id FROM effect_definitions WHERE code='poison'),1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='purifying_light'),(SELECT id FROM effect_definitions WHERE code='purify'),1,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='frost_bind'),(SELECT id FROM effect_definitions WHERE code='slow'),1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='bloodletting'),(SELECT id FROM effect_definitions WHERE code='bleeding'),1,'enemy','on_hit')
    ON DUPLICATE KEY UPDATE effect_level=VALUES(effect_level),target_scope=VALUES(target_scope),trigger_timing=VALUES(trigger_timing)`);
  await pool.query(`INSERT INTO monster_templates (code, name, monster_class, level, hp_max, attack, defense, speed, perception, charisma, skill_sequence, experience, drops_json) VALUES
    ('ball_rabbit', '球兔', 'normal', 1, 300, 50, 35, 125, 6, 14, JSON_ARRAY('hop'), 12, JSON_ARRAY(JSON_OBJECT('code','healing_herb','chance',0.15,'quantity',1))),
    ('spike_boar', '刺猪', 'normal', 2, 480, 72, 55, 92, 9, 3, JSON_ARRAY('charge'), 28, JSON_ARRAY(JSON_OBJECT('code','wolf_fang','chance',0.45,'quantity',1))),
    ('vine_python', '藤蚺', 'normal', 2, 440, 65, 45, 108, 13, 4, JSON_ARRAY('bite'), 30, JSON_ARRAY(JSON_OBJECT('code','healing_herb','chance',0.25,'quantity',1))),
    ('black_bear', '乌熊', 'elite', 4, 1000, 120, 85, 82, 11, 2, JSON_ARRAY('howl','bite'), 95, JSON_ARRAY(JSON_OBJECT('code','wolf_fang','chance',1,'quantity',2))),
    ('mist_wolf', '雾影狼', 'normal', 1, 350, 55, 40, 95, 8, 1, JSON_ARRAY(), 20, JSON_ARRAY(JSON_OBJECT('code','wolf_fang','chance',0.7,'quantity',1)))
    ON DUPLICATE KEY UPDATE name = VALUES(name), monster_class = VALUES(monster_class), level = VALUES(level), hp_max = VALUES(hp_max), attack = VALUES(attack), defense = VALUES(defense), speed = VALUES(speed), perception = VALUES(perception), charisma = VALUES(charisma), skill_sequence = VALUES(skill_sequence), experience = VALUES(experience), drops_json = VALUES(drops_json)`);
  await pool.query(`UPDATE monster_templates SET weakness_json=CASE code WHEN 'ball_rabbit' THEN JSON_ARRAY('刺击') WHEN 'spike_boar' THEN JSON_ARRAY('水') WHEN 'vine_python' THEN JSON_ARRAY('火','斩击') WHEN 'black_bear' THEN JSON_ARRAY('冰') WHEN 'mist_wolf' THEN JSON_ARRAY('光') ELSE weakness_json END, resistance_json=CASE code WHEN 'ball_rabbit' THEN JSON_ARRAY('打击') WHEN 'spike_boar' THEN JSON_ARRAY('刺击') WHEN 'vine_python' THEN JSON_ARRAY('木') WHEN 'black_bear' THEN JSON_ARRAY('打击') WHEN 'mist_wolf' THEN JSON_ARRAY('暗') ELSE resistance_json END`);
  await pool.query(`DELETE r FROM monster_skill_learn_rules r JOIN monster_templates t ON t.id=r.monster_template_id WHERE t.code IN ('ball_rabbit','spike_boar','vine_python','black_bear','mist_wolf')`);
  await pool.query(`INSERT INTO monster_skill_learn_rules (monster_template_id,source_skill_code,skill_id,chance) VALUES
    ((SELECT id FROM monster_templates WHERE code='ball_rabbit'),'hop',(SELECT id FROM skill_definitions WHERE code='jump_strike'),0.03000),
    ((SELECT id FROM monster_templates WHERE code='spike_boar'),'charge',(SELECT id FROM skill_definitions WHERE code='charge'),0.05000),
    ((SELECT id FROM monster_templates WHERE code='vine_python'),'bite',(SELECT id FROM skill_definitions WHERE code='bite_slash'),0.08000),
    ((SELECT id FROM monster_templates WHERE code='black_bear'),'bite',(SELECT id FROM skill_definitions WHERE code='bite_slash'),0.10000),
    ((SELECT id FROM monster_templates WHERE code='black_bear'),'howl',(SELECT id FROM skill_definitions WHERE code='war_cry'),0.04000)`);
  await pool.query(`INSERT IGNORE INTO monster_encounter_texts (monster_template_id, description) VALUES
    ((SELECT id FROM monster_templates WHERE code='ball_rabbit'), '落叶轻轻颤动，一只球兔从灌木后探出圆滚滚的脑袋，红色的眼睛正盯着你。'),
    ((SELECT id FROM monster_templates WHERE code='ball_rabbit'), '草丛里传来急促的蹦跳声，球兔挡在了你的去路上。'),
    ((SELECT id FROM monster_templates WHERE code='spike_boar'), '沉重的蹄声压过枯枝，一头刺猪低下头，用尖刺对准了你。'),
    ((SELECT id FROM monster_templates WHERE code='spike_boar'), '泥土被拱开，暴躁的刺猪从阴影中冲出，发出威胁的哼叫。'),
    ((SELECT id FROM monster_templates WHERE code='vine_python'), '藤蔓忽然收紧，藏在树冠间的藤蚺吐着信子俯视着你。'),
    ((SELECT id FROM monster_templates WHERE code='vine_python'), '湿冷的鳞片擦过树干，藤蚺无声地封住了前方。'),
    ((SELECT id FROM monster_templates WHERE code='black_bear'), '浓重的腥味扑面而来，乌熊从雾里直起身躯，发出低沉咆哮。'),
    ((SELECT id FROM monster_templates WHERE code='black_bear'), '脚下的地面微微震动，乌熊拨开灌木，阴影笼罩了前路。'),
    ((SELECT id FROM monster_templates WHERE code='mist_wolf'), '雾气里亮起一双幽绿的眼睛，雾影狼压低身体缓缓逼近。'),
    ((SELECT id FROM monster_templates WHERE code='mist_wolf'), '远处传来短促狼嚎，雾影狼已悄然出现在你的侧前方。')`);
  await pool.query(`INSERT INTO map_monster_pools (region_id, monster_template_id, spawn_weight)
    SELECT r.id, t.id, CASE t.code WHEN 'ball_rabbit' THEN 40 WHEN 'spike_boar' THEN 25 WHEN 'vine_python' THEN 22 WHEN 'mist_wolf' THEN 12 WHEN 'black_bear' THEN 1 END
    FROM map_regions r JOIN monster_templates t ON t.code IN ('ball_rabbit','spike_boar','vine_python','mist_wolf','black_bear')
    WHERE r.code='dark_forest'
    ON DUPLICATE KEY UPDATE spawn_weight=VALUES(spawn_weight)`);
  await pool.query(`INSERT INTO map_npcs (region_id, code, name, description, pos_x, pos_y, pos_z) VALUES
    ((SELECT id FROM map_regions WHERE code='world_tree'), 'tree_keeper', '树守·阿鲁', '守望世界树的沉默老人。', 0, 0, 0),
    ((SELECT id FROM map_regions WHERE code='dark_forest'), 'lost_hunter', '迷途猎人', '在薄雾中寻找归路的年轻猎人。', 12, -48, 0)
    ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), pos_x=VALUES(pos_x), pos_y=VALUES(pos_y), pos_z=VALUES(pos_z)`);
  await pool.query(`INSERT INTO map_special_objects (region_id, code, name, description, pos_x, pos_y, pos_z) VALUES
    ((SELECT id FROM map_regions WHERE code='world_tree'), 'world_tree_altar', '世界树祭坛', '被古老根须环抱的石质祭坛。', 0, 0, 0),
    ((SELECT id FROM map_regions WHERE code='dark_forest'), 'mist_stone', '雾石', '不断散发着冷雾的灰白石碑。', -18, -76, 0)
    ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), pos_x=VALUES(pos_x), pos_y=VALUES(pos_y), pos_z=VALUES(pos_z)`);
  await pool.query(`INSERT IGNORE INTO map_move_texts (region_id, description) VALUES
    ((SELECT id FROM map_regions WHERE code='world_tree'), '世界树的根系在脚下轻轻起伏，空气中弥漫着清澈的生命气息。'),
    ((SELECT id FROM map_regions WHERE code='world_tree'), '抬头望去，巨大的枝叶遮住天空，零星光屑从叶隙间落下。'),
    ((SELECT id FROM map_regions WHERE code='dark_forest'), '薄雾缠绕在脚边，潮湿的树叶在靴底发出轻响。'),
    ((SELECT id FROM map_regions WHERE code='dark_forest'), '远处传来不明生物的低鸣，密林很快又归于沉寂。'),
    ((SELECT id FROM map_regions WHERE code='dark_forest'), '藤蔓垂落在前方，树影在雾里扭曲成陌生的形状。')`);
  await pool.query(`INSERT IGNORE INTO player_inventory (character_id, item_id, quantity)
    SELECT c.id, i.id, 3 FROM characters c JOIN item_definitions i ON i.code='healing_herb'`);
  await pool.query(`INSERT IGNORE INTO player_quick_items (character_id, quick_slot, item_id)
    SELECT c.id, 1, i.id FROM characters c JOIN item_definitions i ON i.code='healing_herb'`);
};
