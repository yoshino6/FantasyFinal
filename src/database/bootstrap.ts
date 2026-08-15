import type { Pool } from 'mysql2/promise';

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS players (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, qq_user_id VARCHAR(32) NOT NULL, qq_nickname VARCHAR(128) NULL,
    status ENUM('registering','active','banned') NOT NULL DEFAULT 'registering',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_players_qq_user_id (qq_user_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS game_permissions (
    qq_user_id VARCHAR(32) NOT NULL, role ENUM('owner','admin') NOT NULL, granted_by VARCHAR(32) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (qq_user_id), KEY idx_game_permissions_role (role)
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
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, player_id BIGINT UNSIGNED NULL, npc_id BIGINT UNSIGNED NULL, npc_code VARCHAR(64) NULL, name VARCHAR(24) NOT NULL,
    gender VARCHAR(8) NOT NULL DEFAULT '未设定', free_name_change_used TINYINT(1) NOT NULL DEFAULT 0, free_gender_change_used TINYINT(1) NOT NULL DEFAULT 0,
    level INT UNSIGNED NOT NULL DEFAULT 1, experience BIGINT UNSIGNED NOT NULL DEFAULT 0, skill_points INT UNSIGNED NOT NULL DEFAULT 1, copper_coins BIGINT UNSIGNED NOT NULL DEFAULT 0,
    constitution SMALLINT UNSIGNED NOT NULL, spirit SMALLINT UNSIGNED NOT NULL, strength SMALLINT UNSIGNED NOT NULL,
    intelligence SMALLINT UNSIGNED NOT NULL, agility SMALLINT UNSIGNED NOT NULL, perception SMALLINT UNSIGNED NOT NULL,
    constitution_growth DECIMAL(4,1) NOT NULL DEFAULT 0, spirit_growth DECIMAL(4,1) NOT NULL DEFAULT 0, strength_growth DECIMAL(4,1) NOT NULL DEFAULT 0,
    intelligence_growth DECIMAL(4,1) NOT NULL DEFAULT 0, agility_growth DECIMAL(4,1) NOT NULL DEFAULT 0, perception_growth DECIMAL(4,1) NOT NULL DEFAULT 0,
    adventurer_registered TINYINT(1) NOT NULL DEFAULT 0,
    adventurer_rank ENUM('F','E','D','C','B','A','S','SS','SSS') NOT NULL DEFAULT 'F', profession_code VARCHAR(32) NULL,
    hp_max INT UNSIGNED NOT NULL, mp_max INT UNSIGNED NOT NULL, current_hp INT UNSIGNED NOT NULL, current_mp INT UNSIGNED NOT NULL,
    activity_status ENUM('active','resting','unconscious') NOT NULL DEFAULT 'active', rest_started_at DATETIME NULL, physical_attack INT UNSIGNED NOT NULL, magic_attack INT UNSIGNED NOT NULL,
    physical_defense INT UNSIGNED NOT NULL, magic_defense INT UNSIGNED NOT NULL, accuracy INT UNSIGNED NOT NULL, evasion INT UNSIGNED NOT NULL,
    crit_rate_bp INT UNSIGNED NOT NULL, crit_damage_bp INT UNSIGNED NOT NULL, crit_resist_bp INT UNSIGNED NOT NULL,
    crit_damage_reduction_bp INT UNSIGNED NOT NULL, tenacity INT UNSIGNED NOT NULL, speed INT UNSIGNED NOT NULL,
    element_mastery_json JSON NULL, element_resistance_json JSON NULL,
    stat_formula_version SMALLINT UNSIGNED NOT NULL DEFAULT 2, current_region_id BIGINT UNSIGNED NOT NULL,
    pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_characters_player (player_id), UNIQUE KEY uk_characters_npc_id (npc_id), UNIQUE KEY uk_characters_npc_code (npc_code), KEY idx_character_position (current_region_id, pos_x, pos_y, pos_z),
    CONSTRAINT fk_character_player FOREIGN KEY (player_id) REFERENCES players(id),
    CONSTRAINT fk_character_region FOREIGN KEY (current_region_id) REFERENCES map_regions(id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, player_id BIGINT UNSIGNED NOT NULL, event_type VARCHAR(64) NOT NULL, payload JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_player_events_player_created (player_id, created_at),
    CONSTRAINT fk_event_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_story_progress (
    character_id BIGINT UNSIGNED NOT NULL, story_code VARCHAR(64) NOT NULL, status ENUM('met','joined','declined','completed') NOT NULL DEFAULT 'met', stage TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id,story_code),
    CONSTRAINT fk_story_progress_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS item_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    description TEXT NOT NULL, obtain_source VARCHAR(128) NOT NULL DEFAULT '未知来源', item_type ENUM('consumable','material','equipment') NOT NULL DEFAULT 'material', item_category VARCHAR(32) NOT NULL DEFAULT '特殊', weapon_type VARCHAR(32) NULL, codex_id CHAR(7) NULL,
    weight DECIMAL(8,2) NOT NULL DEFAULT 0, stack_limit INT UNSIGNED NOT NULL DEFAULT 99, stackable TINYINT(1) NOT NULL DEFAULT 1, is_tradeable TINYINT(1) NOT NULL DEFAULT 1,
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
  , `CREATE TABLE IF NOT EXISTS player_mails (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, title VARCHAR(96) NOT NULL, content TEXT NOT NULL,
    received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, claimed_at DATETIME NULL, deleted_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_mail_character_received (character_id,deleted_at,received_at),
    CONSTRAINT fk_mail_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_mail_attachments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, mail_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL,
    PRIMARY KEY (id), KEY idx_mail_attachment_mail (mail_id),
    CONSTRAINT fk_mail_attachment_mail FOREIGN KEY (mail_id) REFERENCES player_mails(id) ON DELETE CASCADE,
    CONSTRAINT fk_mail_attachment_item FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS admin_mail_edits (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, admin_qq_user_id VARCHAR(32) NOT NULL, recipient_scope ENUM('personal','global') NOT NULL,
    content TEXT NOT NULL, status ENUM('editing','draft') NOT NULL DEFAULT 'editing',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_admin_mail_edit_user (admin_qq_user_id), KEY idx_admin_mail_edit_status (status)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS admin_mail_edit_recipients (
    edit_id BIGINT UNSIGNED NOT NULL, qq_user_id VARCHAR(32) NOT NULL, nickname VARCHAR(64) NOT NULL,
    PRIMARY KEY (edit_id,qq_user_id),
    CONSTRAINT fk_admin_mail_edit_recipient_edit FOREIGN KEY (edit_id) REFERENCES admin_mail_edits(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS admin_mail_edit_attachments (
    edit_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL,
    PRIMARY KEY (edit_id,item_id),
    CONSTRAINT fk_admin_mail_edit_attachment_edit FOREIGN KEY (edit_id) REFERENCES admin_mail_edits(id) ON DELETE CASCADE,
    CONSTRAINT fk_admin_mail_edit_attachment_item FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS profession_definitions (
    code VARCHAR(32) NOT NULL, name VARCHAR(32) NOT NULL, description TEXT NOT NULL, growth_json JSON NOT NULL, skill_codes_json JSON NOT NULL,
    PRIMARY KEY (code)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_guild_chats (
    character_id BIGINT UNSIGNED NOT NULL, chat_count INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id), CONSTRAINT fk_guild_chat_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS guild_shop_items (
    item_id BIGINT UNSIGNED NOT NULL, buy_price INT UNSIGNED NOT NULL, sell_price INT UNSIGNED NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_guild_shop_active (is_active,item_id),
    CONSTRAINT fk_guild_shop_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS bounty_notices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, refresh_key VARCHAR(32) NOT NULL, title VARCHAR(96) NOT NULL, target_template_id BIGINT UNSIGNED NOT NULL, source_spawn_id BIGINT UNSIGNED NULL,
    required_count SMALLINT UNSIGNED NOT NULL, copper_reward INT UNSIGNED NOT NULL, is_active TINYINT(1) NOT NULL DEFAULT 1,
    expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_bounty_refresh_target (refresh_key,target_template_id), KEY idx_bounty_active (is_active,expires_at)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_bounties (
    character_id BIGINT UNSIGNED NOT NULL, bounty_id BIGINT UNSIGNED NOT NULL, progress SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('accepted','completed','claimed') NOT NULL DEFAULT 'accepted', accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL, claimed_at DATETIME NULL,
    PRIMARY KEY (character_id,bounty_id), KEY idx_player_bounty_status (character_id,status),
    CONSTRAINT fk_player_bounty_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_player_bounty_notice FOREIGN KEY (bounty_id) REFERENCES bounty_notices(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS combat_ambushes (
    spawn_id BIGINT UNSIGNED NOT NULL, character_id BIGINT UNSIGNED NOT NULL, ready_spawn_id BIGINT UNSIGNED NULL, status ENUM('waiting','ready','resolved') NOT NULL DEFAULT 'waiting',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (spawn_id,character_id), KEY idx_ambush_character_status (character_id,status),
    CONSTRAINT fk_ambush_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_travels (
    character_id BIGINT UNSIGNED NOT NULL, region_id BIGINT UNSIGNED NOT NULL, target_x INT NOT NULL, target_y INT NOT NULL, target_z INT NOT NULL,
    activity_type ENUM('move','hunt') NOT NULL DEFAULT 'move',
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, arrival_at DATETIME NOT NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_travel_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_travel_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS skill_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    category ENUM('physical','magic','utility','passive','special') NOT NULL, damage_type VARCHAR(16) NOT NULL DEFAULT '无', skill_kind VARCHAR(16) NOT NULL DEFAULT '无', element VARCHAR(16) NOT NULL DEFAULT '无', range_type VARCHAR(16) NOT NULL DEFAULT '近战', codex_id CHAR(7) NULL,
    mana_cost INT UNSIGNED NOT NULL DEFAULT 0, cooldown_turns TINYINT UNSIGNED NOT NULL DEFAULT 0, chant_turns TINYINT UNSIGNED NOT NULL DEFAULT 0,
    power INT UNSIGNED NOT NULL DEFAULT 100, learn_cost TINYINT UNSIGNED NOT NULL DEFAULT 1, upgrade_cost TINYINT UNSIGNED NOT NULL DEFAULT 1,
    max_level TINYINT UNSIGNED NOT NULL DEFAULT 5, power_per_level INT UNSIGNED NOT NULL DEFAULT 15, cooldown_reduction_per_level TINYINT UNSIGNED NOT NULL DEFAULT 0,
    passive_effect_json JSON NULL, description TEXT NOT NULL, PRIMARY KEY (id), UNIQUE KEY uk_skill_code (code), UNIQUE KEY uk_skill_codex_id (codex_id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_skills (
    character_id BIGINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NOT NULL, level TINYINT UNSIGNED NOT NULL DEFAULT 1,
    quick_slot TINYINT UNSIGNED NULL, learned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (character_id, skill_id), UNIQUE KEY uk_quick_slot (character_id, quick_slot),
    CONSTRAINT fk_player_skill_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_player_skill_definition FOREIGN KEY (skill_id) REFERENCES skill_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_appraisal_progress (
    character_id BIGINT UNSIGNED NOT NULL, range_level TINYINT UNSIGNED NOT NULL DEFAULT 1, information_level TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id), CONSTRAINT fk_appraisal_progress_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_skill_discoveries (
    character_id BIGINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NOT NULL, discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,skill_id), KEY idx_skill_discovery_order (character_id,discovered_at),
    CONSTRAINT fk_skill_discovery_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_skill_discovery_skill FOREIGN KEY (skill_id) REFERENCES skill_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS effect_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    effect_type ENUM('damage_over_time','stat_modifier','cleanse','control','shield','heal_over_time','mana_regen') NOT NULL,
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
    monster_class ENUM('normal','large','elite','boss') NOT NULL DEFAULT 'normal', level INT UNSIGNED NOT NULL DEFAULT 1,
    constitution SMALLINT UNSIGNED NOT NULL, spirit SMALLINT UNSIGNED NOT NULL, strength SMALLINT UNSIGNED NOT NULL,
    intelligence SMALLINT UNSIGNED NOT NULL, agility SMALLINT UNSIGNED NOT NULL, perception SMALLINT UNSIGNED NOT NULL,
    constitution_growth DECIMAL(4,1) NOT NULL DEFAULT 0, spirit_growth DECIMAL(4,1) NOT NULL DEFAULT 0, strength_growth DECIMAL(4,1) NOT NULL DEFAULT 0,
    intelligence_growth DECIMAL(4,1) NOT NULL DEFAULT 0, agility_growth DECIMAL(4,1) NOT NULL DEFAULT 0, perception_growth DECIMAL(4,1) NOT NULL DEFAULT 0,
    hp_max INT UNSIGNED NOT NULL DEFAULT 0, attack INT UNSIGNED NOT NULL DEFAULT 0, defense INT UNSIGNED NOT NULL DEFAULT 0, speed INT UNSIGNED NOT NULL DEFAULT 0,
    charisma INT UNSIGNED NOT NULL DEFAULT 0,
    weakness_json JSON NULL, resistance_json JSON NULL, element_mastery_json JSON NULL, element_resistance_json JSON NULL,
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
    pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL, level INT UNSIGNED NULL,
    constitution SMALLINT UNSIGNED NULL, spirit SMALLINT UNSIGNED NULL, strength SMALLINT UNSIGNED NULL,
    intelligence SMALLINT UNSIGNED NULL, agility SMALLINT UNSIGNED NULL, perception SMALLINT UNSIGNED NULL,
    current_hp INT UNSIGNED NOT NULL, skill_sequence JSON NULL, traits_json JSON NULL, spawned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    defeated_at DATETIME NULL, PRIMARY KEY (id), KEY idx_spawn_location (region_id, pos_x, pos_y, pos_z, defeated_at), KEY idx_spawn_active_region (region_id, defeated_at),
    CONSTRAINT fk_spawn_template FOREIGN KEY (template_id) REFERENCES monster_templates(id),
    CONSTRAINT fk_spawn_region FOREIGN KEY (region_id) REFERENCES map_regions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS combat_sessions (
    id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, spawn_id BIGINT UNSIGNED NOT NULL,
    player_hp INT UNSIGNED NOT NULL, player_mp INT UNSIGNED NOT NULL, cooldowns JSON NOT NULL, opening_damage_bonus DECIMAL(4,2) NOT NULL DEFAULT 0,
    turn_no INT UNSIGNED NOT NULL DEFAULT 1, state ENUM('active','victory','defeat','escaped') NOT NULL DEFAULT 'active',
    PRIMARY KEY (id), KEY idx_combat_character_state (character_id, state),
    CONSTRAINT fk_combat_character FOREIGN KEY (character_id) REFERENCES characters(id), CONSTRAINT fk_combat_spawn FOREIGN KEY (spawn_id) REFERENCES monster_spawns(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS combat_members (
    session_id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, current_hp INT UNSIGNED NOT NULL, current_mp INT UNSIGNED NOT NULL,
    selected_target_id BIGINT UNSIGNED NULL, pending_action JSON NULL, cooldowns JSON NOT NULL, is_defeated TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, character_id), KEY idx_combat_member_character (character_id),
    CONSTRAINT fk_combat_member_session FOREIGN KEY (session_id) REFERENCES combat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_member_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_member_target FOREIGN KEY (selected_target_id) REFERENCES monster_spawns(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS combat_targets (
    session_id CHAR(36) NOT NULL, spawn_id BIGINT UNSIGNED NOT NULL, current_mp INT UNSIGNED NOT NULL DEFAULT 0, cooldowns JSON NOT NULL, is_defeated TINYINT(1) NOT NULL DEFAULT 0,
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
  , `CREATE TABLE IF NOT EXISTS player_skill_specializations (
    character_id BIGINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NOT NULL, specialization ENUM('overcharge','instant','efficient','potent') NOT NULL,
    level TINYINT UNSIGNED NOT NULL DEFAULT 1, PRIMARY KEY (character_id,skill_id,specialization),
    CONSTRAINT fk_specialization_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_specialization_skill FOREIGN KEY (skill_id) REFERENCES skill_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS encounter_escape_tokens (
    character_id BIGINT UNSIGNED NOT NULL, region_id BIGINT UNSIGNED NOT NULL, pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_escape_token_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS combat_status_effects (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, session_id CHAR(36) NOT NULL, target_kind ENUM('member','target') NOT NULL, target_id BIGINT UNSIGNED NOT NULL,
    effect_id BIGINT UNSIGNED NOT NULL, effect_level TINYINT UNSIGNED NOT NULL, value DECIMAL(8,3) NOT NULL, stacks TINYINT UNSIGNED NOT NULL DEFAULT 1,
    remaining_turns TINYINT UNSIGNED NOT NULL, PRIMARY KEY (id), KEY idx_combat_effect_target (session_id,target_kind,target_id,effect_id),
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
  try { await pool.query('ALTER TABLE combat_sessions ADD COLUMN opening_damage_bonus DECIMAL(4,2) NOT NULL DEFAULT 0'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query("ALTER TABLE player_travels ADD COLUMN activity_type ENUM('move','hunt') NOT NULL DEFAULT 'move'"); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE monster_spawns ADD KEY idx_spawn_active_region (region_id, defeated_at)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  for (const column of ['skill_sequence JSON NULL', 'traits_json JSON NULL', 'level INT UNSIGNED NULL', 'constitution SMALLINT UNSIGNED NULL', 'spirit SMALLINT UNSIGNED NULL', 'strength SMALLINT UNSIGNED NULL', 'intelligence SMALLINT UNSIGNED NULL', 'agility SMALLINT UNSIGNED NULL', 'perception SMALLINT UNSIGNED NULL']) {
    try { await pool.query(`ALTER TABLE monster_spawns ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  await pool.query("ALTER TABLE monster_templates MODIFY COLUMN monster_class ENUM('normal','large','elite','boss') NOT NULL DEFAULT 'normal'");
  for (const column of ['current_mp INT UNSIGNED NOT NULL DEFAULT 0', 'cooldowns JSON NULL']) {
    try { await pool.query(`ALTER TABLE combat_targets ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  await pool.query("ALTER TABLE effect_definitions MODIFY COLUMN effect_type ENUM('damage_over_time','stat_modifier','cleanse','control','shield','heal_over_time','mana_regen') NOT NULL");
  await pool.query('UPDATE combat_targets SET cooldowns=JSON_OBJECT() WHERE cooldowns IS NULL');
  await pool.query('ALTER TABLE combat_targets MODIFY COLUMN cooldowns JSON NOT NULL');
  try { await pool.query('ALTER TABLE combat_members ADD COLUMN cooldowns JSON NULL'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  await pool.query('UPDATE combat_members SET cooldowns=JSON_OBJECT() WHERE cooldowns IS NULL');
  await pool.query('ALTER TABLE combat_members MODIFY COLUMN cooldowns JSON NOT NULL');
  for (const column of ['constitution SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'spirit SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'strength SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'intelligence SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'agility SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'perception SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'constitution_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'spirit_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'strength_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'intelligence_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'agility_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'perception_growth DECIMAL(4,1) NOT NULL DEFAULT 0']) {
    try { await pool.query(`ALTER TABLE monster_templates ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  for (const column of ['hp_max INT UNSIGNED NOT NULL DEFAULT 0', 'attack INT UNSIGNED NOT NULL DEFAULT 0', 'defense INT UNSIGNED NOT NULL DEFAULT 0', 'speed INT UNSIGNED NOT NULL DEFAULT 0', 'charisma INT UNSIGNED NOT NULL DEFAULT 0']) {
    await pool.query(`ALTER TABLE monster_templates MODIFY COLUMN ${column}`);
  }
  await pool.query("ALTER TABLE registration_sessions MODIFY stage ENUM('story','audience','question','destination','danger','choice') NOT NULL DEFAULT 'story'");
  await pool.query("ALTER TABLE player_story_progress MODIFY COLUMN status ENUM('met','joined','declined','awaiting_arrival','arrival_story','guild_story','completed') NOT NULL DEFAULT 'met'");
  for (const column of ["adventurer_rank ENUM('F','E','D','C','B','A','S','SS','SSS') NOT NULL DEFAULT 'F'", 'profession_code VARCHAR(32) NULL', 'copper_coins BIGINT UNSIGNED NOT NULL DEFAULT 0']) {
    try { await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query('ALTER TABLE bounty_notices ADD COLUMN source_spawn_id BIGINT UNSIGNED NULL'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE bounty_notices MODIFY COLUMN refresh_key VARCHAR(32) NOT NULL'); } catch (error: any) { if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error; }
  try { await pool.query('ALTER TABLE combat_ambushes ADD COLUMN ready_spawn_id BIGINT UNSIGNED NULL'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  for (const column of ['element_mastery_json JSON NULL', 'element_resistance_json JSON NULL']) {
    try { await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
    try { await pool.query(`ALTER TABLE monster_templates ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  await pool.query("ALTER TABLE player_equipment MODIFY slot ENUM('weapon','offhand','shoulder','upper','waist','lower','feet','necklace','bracelet','ring') NOT NULL");
  try { await pool.query('ALTER TABLE player_equipment ADD COLUMN instance_id BIGINT UNSIGNED NULL'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  await pool.query(`UPDATE player_equipment pe JOIN (SELECT character_id,item_id,MIN(id) AS instance_id FROM player_item_instances GROUP BY character_id,item_id) ii ON ii.character_id=pe.character_id AND ii.item_id=pe.item_id SET pe.instance_id=ii.instance_id WHERE pe.instance_id IS NULL`);
  try { await pool.query('ALTER TABLE player_equipment ADD UNIQUE KEY uk_equipment_instance (character_id,instance_id)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  try { await pool.query('ALTER TABLE combat_status_effects DROP INDEX uk_combat_effect_target'); } catch (error: any) { if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw error; }
  try { await pool.query('ALTER TABLE combat_status_effects ADD KEY idx_combat_effect_target (session_id,target_kind,target_id,effect_id)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  for (const column of ['constitution_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'spirit_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'strength_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'intelligence_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'agility_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'perception_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'adventurer_registered TINYINT(1) NOT NULL DEFAULT 0', "gender VARCHAR(8) NOT NULL DEFAULT '未设定'", 'free_name_change_used TINYINT(1) NOT NULL DEFAULT 0', 'free_gender_change_used TINYINT(1) NOT NULL DEFAULT 0']) {
    try { await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  for (const column of ["item_category VARCHAR(32) NOT NULL DEFAULT '特殊'", "obtain_source VARCHAR(128) NOT NULL DEFAULT '未知来源'", 'stackable TINYINT(1) NOT NULL DEFAULT 1', 'is_tradeable TINYINT(1) NOT NULL DEFAULT 1', 'codex_id CHAR(7) NULL']) {
    try { await pool.query(`ALTER TABLE item_definitions ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query('ALTER TABLE item_definitions ADD COLUMN weapon_type VARCHAR(32) NULL'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  for (const column of ["damage_type VARCHAR(16) NOT NULL DEFAULT '无'", "skill_kind VARCHAR(16) NOT NULL DEFAULT '无'", "element VARCHAR(16) NOT NULL DEFAULT '无'", "range_type VARCHAR(16) NOT NULL DEFAULT '近战'", 'codex_id CHAR(7) NULL']) {
    try { await pool.query(`ALTER TABLE skill_definitions ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query('ALTER TABLE monster_skill_learn_rules ADD COLUMN source_skill_code VARCHAR(64) NULL AFTER monster_template_id'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  for (const column of ['skill_points INT UNSIGNED NOT NULL DEFAULT 1']) {
    try { await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  for (const column of ['learn_cost TINYINT UNSIGNED NOT NULL DEFAULT 1', 'upgrade_cost TINYINT UNSIGNED NOT NULL DEFAULT 1', 'max_level TINYINT UNSIGNED NOT NULL DEFAULT 5', 'power_per_level INT UNSIGNED NOT NULL DEFAULT 15', 'cooldown_reduction_per_level TINYINT UNSIGNED NOT NULL DEFAULT 0']) {
    try { await pool.query(`ALTER TABLE skill_definitions ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query('ALTER TABLE skill_definitions ADD COLUMN passive_effect_json JSON NULL'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  await pool.query("ALTER TABLE skill_definitions MODIFY COLUMN category ENUM('physical','magic','utility','passive','special') NOT NULL");
  try { await pool.query('ALTER TABLE player_skills ADD COLUMN learned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE skill_definitions ADD UNIQUE KEY uk_skill_codex_id (codex_id)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  for (const column of ['weakness_json JSON NULL', 'resistance_json JSON NULL']) {
    try { await pool.query(`ALTER TABLE monster_templates ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query('ALTER TABLE player_inventory ADD COLUMN acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE player_story_progress ADD COLUMN stage TINYINT UNSIGNED NOT NULL DEFAULT 1'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE characters MODIFY COLUMN player_id BIGINT UNSIGNED NULL'); } catch (error: any) { if (error?.code !== 'ER_FK_INCOMPATIBLE_COLUMNS') throw error; }
  try { await pool.query('ALTER TABLE characters ADD COLUMN npc_id BIGINT UNSIGNED NULL'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE characters ADD COLUMN npc_code VARCHAR(64) NULL'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE characters ADD UNIQUE KEY uk_characters_npc_id (npc_id)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  try { await pool.query('ALTER TABLE characters ADD UNIQUE KEY uk_characters_npc_code (npc_code)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  await pool.query(`UPDATE characters c JOIN players p ON p.id=c.player_id SET c.player_id=NULL,c.npc_id=CASE p.qq_user_id WHEN 'npc_forest_warrior' THEN 900000001 WHEN 'npc_forest_mage' THEN 900000002 WHEN 'npc_forest_priest' THEN 900000003 END,c.npc_code=p.qq_user_id WHERE p.qq_user_id IN ('npc_forest_warrior','npc_forest_mage','npc_forest_priest')`);
  await pool.query(`DELETE FROM players WHERE qq_user_id IN ('npc_forest_warrior','npc_forest_mage','npc_forest_priest')`);
  await pool.query(`UPDATE item_definitions SET item_category=CASE code WHEN 'holy_sword_shirulu' THEN '武器' WHEN 'demon_sword_aphia' THEN '武器' WHEN 'healing_herb' THEN '药剂' WHEN 'wolf_fang' THEN '兽材' ELSE item_category END, stackable=CASE WHEN item_type='equipment' THEN 0 ELSE 1 END`);
  await pool.query(`UPDATE item_definitions SET is_tradeable=0 WHERE item_category IN ('地图','特殊','任务','剧情') OR code='adventurer_card'`);
  await pool.query(`UPDATE item_definitions SET weapon_type=CASE code WHEN 'holy_sword_shirulu' THEN '长剑' WHEN 'demon_sword_aphia' THEN '长剑' ELSE weapon_type END`);
  await pool.query(`UPDATE item_definitions SET codex_id=CONCAT(CASE WHEN item_type='equipment' THEN CASE item_category WHEN '武器' THEN '11' WHEN '副手' THEN '12' WHEN '头部' THEN '13' WHEN '上装' THEN '14' WHEN '腰部' THEN '15' WHEN '下装' THEN '16' WHEN '脚部' THEN '17' WHEN '项链' THEN '18' WHEN '手镯' THEN '19' WHEN '戒指' THEN '10' ELSE '19' END WHEN item_type='consumable' THEN CASE item_category WHEN '药剂' THEN '21' WHEN '食物' THEN '22' ELSE '23' END WHEN item_type='material' THEN CASE item_category WHEN '食材' THEN '31' WHEN '草药' THEN '32' ELSE '39' END ELSE '99' END, LPAD(id,5,'0')) WHERE codex_id IS NULL`);
  await pool.query(`INSERT INTO profession_definitions (code,name,description,growth_json,skill_codes_json) VALUES
    ('warrior','战士','以长剑与盾牌守住前线的职业。',JSON_OBJECT('constitution',2,'strength',2),JSON_ARRAY('longsword_mastery','shield_mastery')),
    ('mage','法师','以法杖与法书编织术式的职业。',JSON_OBJECT('spirit',2,'intelligence',2),JSON_ARRAY('staff_mastery','spellbook_mastery')),
    ('rogue','盗贼','以匕首与拳刃撕开破绽的职业。',JSON_OBJECT('agility',2,'perception',2),JSON_ARRAY('dagger_mastery','fistblade_mastery')),
    ('priest','牧师','以法书与法球守望同伴的职业。',JSON_OBJECT('constitution',2,'spirit',2),JSON_ARRAY('spellbook_mastery','orb_mastery'))
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),growth_json=VALUES(growth_json),skill_codes_json=VALUES(skill_codes_json)`);
  try { await pool.query('ALTER TABLE item_definitions ADD UNIQUE KEY uk_item_codex_id (codex_id)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  await pool.execute(
    `INSERT INTO map_regions (code, name, description, min_x, max_x, min_y, max_y, min_z, max_z, is_spawn_enabled, danger_level)
     VALUES
       ('world_tree', '世界树', '世界的中心，占据约 20×20 格。', -10, 9, -10, 9, 0, 0, 0, 0),
       ('dark_forest', '幽暗密林', '世界树正下方、常年被薄雾笼罩的约 100×100 格密林。', -50, 49, -110, -11, 0, 0, 1, 1),
       ('baina_town', '百纳镇', '百族汇纳、诸族共居的边境小镇。它紧邻幽暗密林南缘，离世界树仍有很长一段路。', -50, -1, -160, -111, 0, 0, 0, 1)
     ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), min_x = VALUES(min_x), max_x = VALUES(max_x), min_y = VALUES(min_y), max_y = VALUES(max_y), min_z = VALUES(min_z), max_z = VALUES(max_z), is_spawn_enabled = VALUES(is_spawn_enabled), danger_level = VALUES(danger_level)`
  );
  await pool.query(`INSERT INTO item_definitions (code, name, description, obtain_source, item_type, item_category, weight, stackable, effect_json) VALUES
    ('healing_herb', '微光草药', '恢复 30 点生命。', '野外采集与探索发现', 'consumable', '药剂', 0.20, 1, JSON_OBJECT('heal', 30)),
    ('wolf_fang', '幽狼之牙', '可出售的普通材料。', '野外怪物掉落', 'material', '兽材', 0.15, 1, NULL),
    ('beast_meat', '兽肉', '新鲜的野兽肉，可作为烹饪食材。', '幽暗密林怪物掉落', 'material', '兽材', 0.30, 1, NULL),
    ('beast_bone', '兽骨', '坚硬完整的兽骨，常用于制作与加工。', '幽暗密林怪物掉落', 'material', '兽材', 0.25, 1, NULL),
    ('beast_hide', '兽皮', '处理后可制成皮革的普通兽皮。', '幽暗密林怪物掉落', 'material', '兽材', 0.20, 1, NULL),
    ('beast_tendon', '兽筋', '韧性十足的兽筋，是常见的强化素材。', '幽暗密林怪物掉落', 'material', '兽材', 0.10, 1, NULL),
    ('beast_core', '兽核', '凝聚着微弱魔力的兽类核心。', '幽暗密林怪物掉落', 'material', '兽材', 0.08, 1, NULL),
    ('magic_wool', '魔力绒毛', '带有柔和魔力的兔类绒毛。', '兔类怪物掉落', 'material', '兽材', 0.05, 1, NULL),
    ('magic_tusk', '魔力獠牙', '蕴藏野性魔力的锋利獠牙。', '猪类怪物掉落', 'material', '兽材', 0.08, 1, NULL),
    ('magic_scale', '魔力鳞片', '带有自然魔力的蛇类鳞片。', '蛇类怪物掉落', 'material', '兽材', 0.05, 1, NULL),
    ('magic_claw', '魔力利爪', '由熊类巨爪凝成的锋利素材。', '熊类怪物掉落', 'material', '兽材', 0.10, 1, NULL),
    ('magic_heartcore', '魔力心核', '狼类魔力在心脏处凝聚而成的核心。', '狼类怪物掉落', 'material', '兽材', 0.08, 1, NULL),
    ('goblin_ear', '哥布林耳', '哥布林身上留下的辨识素材。', '哥布林掉落', 'material', '兽材', 0.03, 1, NULL),
    ('riot_aura', '暴动的气息', '从暴动怪物身上剥离的躁动气息，隐约散发着危险的魔力。', '暴动怪物额外掉落', 'material', '兽材', 0.05, 1, NULL),
    ('holy_sword_shirulu', '圣剑·希尔露', '由星辉铸成的圣洁长剑。', '初始恩赐', 'equipment', '武器', 3.50, 0, JSON_OBJECT('artifact','holy_sword','physicalAttackPct',16,'critRatePct',33,'critDamagePct',33)),
    ('demon_sword_aphia', '魔剑·阿菲娅', '寄宿深渊意志的漆黑魔剑。', '初始恩赐', 'equipment', '武器', 3.20, 0, JSON_OBJECT('artifact','demon_sword','magicAttackPct',16,'mpPct',33,'accuracyPct',33)),
    ('rename_card', '改名卡', '用于再次修改角色昵称。首次改名免费，此后每次改名消耗一张。', '特殊途径获得', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('characterChange','name')),
    ('gender_change_card', '改性卡', '用于再次修改角色性别。首次改性免费，此后每次改性消耗一张。', '特殊途径获得', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('characterChange','gender'))
    ,('adventurer_card', '冒险者卡片', '记录冒险者身份、等级与职业的银白色卡片。', '百纳镇冒险者公会', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('adventurerCard',true))
    ,('map_baina_town', '地图·百纳镇', '标注百纳镇街巷、建筑与重要地点的城镇地图。', '梨子喵的新手引导', 'consumable', '地图', 0.01, 1, JSON_OBJECT('map','baina_town'))
    ,('map_dark_forest', '地图·幽暗密林', '记录幽暗密林外围道路与危险地带的探索地图。', '百纳镇冒险者公会商店', 'consumable', '地图', 0.01, 1, JSON_OBJECT('map','dark_forest'))
    ,('map_dark_forest_deep', '地图·幽暗密林深处', '标有幽暗密林深处的险路与古老遗迹的详尽地图。', '百纳镇冒险者公会商店', 'consumable', '地图', 0.01, 1, JSON_OBJECT('map','dark_forest_deep'))
    ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), obtain_source = VALUES(obtain_source), item_category = VALUES(item_category), stackable = VALUES(stackable), effect_json = VALUES(effect_json)`);
  await pool.query(`INSERT INTO guild_shop_items (item_id,buy_price,sell_price)
    SELECT id,CASE code WHEN 'map_dark_forest' THEN 100 WHEN 'map_dark_forest_deep' THEN 1000 END,0
    FROM item_definitions WHERE code IN ('map_dark_forest','map_dark_forest_deep')
    ON DUPLICATE KEY UPDATE buy_price=VALUES(buy_price),sell_price=VALUES(sell_price),is_active=1`);
  await pool.query(`UPDATE item_definitions SET codex_id=CONCAT(CASE WHEN item_type='equipment' THEN CASE item_category WHEN '武器' THEN '11' WHEN '副手' THEN '12' WHEN '头部' THEN '13' WHEN '上装' THEN '14' WHEN '腰部' THEN '15' WHEN '下装' THEN '16' WHEN '脚部' THEN '17' WHEN '项链' THEN '18' WHEN '手镯' THEN '19' WHEN '戒指' THEN '10' ELSE '19' END WHEN item_type='consumable' THEN CASE item_category WHEN '药剂' THEN '21' WHEN '食物' THEN '22' ELSE '23' END WHEN item_type='material' THEN CASE item_category WHEN '食材' THEN '31' WHEN '草药' THEN '32' ELSE '39' END ELSE '99' END, LPAD(id,5,'0')) WHERE codex_id IS NULL`);
  await pool.query(`INSERT INTO skill_definitions (code, name, category, mana_cost, cooldown_turns, power, description) VALUES
    ('heavy_strike', '重击', 'physical', 55, 2, 180, '凝聚力量的沉重打击。'),
    ('arcane_bolt', '奥术飞矢', 'magic', 60, 1, 150, '发射一枚奥术能量。'),
    ('armor_break', '碎甲斩', 'physical', 55, 2, 130, '斩击并施加脆弱。'),
    ('fireball', '火球术', 'magic', 75, 2, 165, '爆裂火焰，可能灼烧敌人。'),
    ('toxic_edge', '淬毒刃', 'physical', 65, 2, 120, '在武器上附毒，使中毒可以叠层。'),
    ('purifying_light', '净化之光', 'magic', 90, 3, 90, '净化己方全部异常状态。'),
    ('frost_bind', '冰缚术', 'magic', 80, 3, 115, '冰霜束缚敌人，降低速度。'),
    ('bloodletting', '割裂', 'physical', 70, 2, 145, '造成伤口，持续流血。'),
    ('hop', '跃击', 'physical', 0, 0, 100, '球兔的快速撞击。'),
    ('charge', '冲撞', 'physical', 55, 1, 135, '刺猪的蓄力冲撞。'),
    ('bite', '撕咬', 'physical', 0, 0, 125, '野兽的凶猛撕咬。'),
    ('howl', '震慑咆哮', 'magic', 0, 1, 70, '以咆哮扰乱敌人。'),
    ('jump_strike', '跃步重击', 'physical', 50, 1, 135, '将球兔的跃击改良为适合人类施展的重击。'),
    ('bite_slash', '咬合斩', 'physical', 55, 1, 145, '将猛兽撕咬的发力方式融入剑技，斩开目标。'),
    ('war_cry', '震荡战吼', 'magic', 60, 2, 95, '以经过控制的战吼震荡敌人的精神。'),
    ('scratch', '爪击', 'physical', 0, 0, 90, '野兽以利爪快速挥击。'),
    ('shell_bash', '壳撞', 'physical', 0, 1, 110, '以坚硬外壳发起沉重撞击。'),
    ('spore_dart', '孢子弹', 'magic', 0, 1, 90, '射出会附着在目标身上的微弱孢子。'),
    ('sonic_screech', '尖啸', 'magic', 0, 1, 75, '刺耳的声浪让目标短暂迟缓。'),
    ('thorn_shot', '棘刺射击', 'physical', 0, 1, 105, '射出带有倒刺的硬棘。'),
    ('mist_pounce', '雾袭', 'physical', 0, 1, 115, '借助薄雾发动扑杀。'),
    ('shell_breaker', '碎壳击', 'physical', 60, 2, 125, '借鉴壳撞发力的沉重打击。'),
    ('spore_bolt', '孢子飞矢', 'magic', 65, 2, 120, '将孢子压缩为可控的木属性飞矢。'),
    ('echo_shock', '回音震击', 'magic', 65, 2, 110, '以回荡的声波扰乱目标行动。'),
    ('thorn_stab', '棘刺突击', 'physical', 60, 2, 130, '模仿棘刺射击的贯穿发力。'),
    ('mist_step_slash', '雾步斩', 'physical', 65, 2, 135, '借助身法在薄雾中突进斩击。'),
    ('constrict', '缠束', 'physical', 6, 2, 110, '以身躯束缚并挤压目标。'),
    ('maul', '重爪', 'physical', 8, 2, 135, '以沉重利爪撕开目标。'),
    ('goblin_slash', '哥布林斩', 'physical', 5, 1, 115, '粗陋却迅速的短刃斩击。'),
    ('goblin_fire', '火种术', 'magic', 8, 2, 105, '投出一团不稳定的小火种。'),
    ('vine_hex', '藤咒', 'magic', 8, 1, 92, '藤蛇将微弱的自然魔力缠向目标，使其短暂迟缓。'),
    ('moonbolt', '雾月弹', 'magic', 9, 1, 96, '幽狼凝聚雾中的暗色魔力，射出一枚微弱的月影弹。'),
    ('vine_bolt', '藤蔓弹', 'magic', 50, 2, 122, '将藤蛇的藤咒改良为适合人类施展的木属性魔法。'),
    ('moonlight_bolt', '月影弹', 'magic', 55, 2, 126, '将幽狼的雾月弹改良为可控的暗属性魔法。'),
    ('slime_bash', '胶质重压', 'physical', 35, 1, 145, '将厚重胶质收束后猛然砸下。'),
    ('acid_spray', '酸液喷吐', 'magic', 45, 2, 125, '喷出腐蚀性的酸液，削弱目标防御。'),
    ('regenerate_slime', '胶质再生', 'magic', 55, 3, 80, '汲取林间水汽，缓慢修复自身。'),
    ('guard_break', '盾击破甲', 'physical', 45, 2, 165, '以盾牌撞开敌人的防御架势。'),
    ('warrior_taunt', '守护嘲讽', 'physical', 30, 2, 90, '以盾击与怒喝迫使敌人优先锁定自己。'),
    ('shield_counter', '盾反', 'physical', 45, 2, 185, '格开攻势后立刻以盾缘反击，并强化自身防护。'),
    ('arcane_shackle', '奥术枷锁', 'magic', 55, 2, 125, '以奥术锁链束缚敌人，降低其防御与速度。'),
    ('ember_burst', '爆炎术', 'magic', 60, 2, 155, '将凝聚的火焰瞬间引爆。'),
    ('healing_prayer', '治愈祷言', 'magic', 65, 1, 0, '为生命最低的同伴恢复生命，并赋予短暂再生。'),
    ('blessing_aegis', '守护祝福', 'magic', 75, 3, 0, '为全体同伴施加护盾与再生祝福。'),
    ('mana_benediction', '灵泉祝祷', 'magic', 80, 5, 0, '为全体同伴施加回流祝福，每回合恢复最大魔力的 5%。'),
    ('sanctified_bolt', '圣辉弹', 'magic', 50, 1, 115, '以圣光轰击敌人，并为自身覆上一层守护。'),
    ('appraisal', '鉴识', 'passive', 0, 0, 0, '学会后可识别怪物词条，并解锁怪物属性查看。'),
    ('growth_blessing', '成长祝福', 'passive', 0, 0, 0, '所有获得的经验值翻倍。'),
    ('mana_affinity', '魔力亲和', 'passive', 0, 0, 0, '技能魔力消耗降低 30%。'),
    ('lucky_favor', '幸运眷顾', 'passive', 0, 0, 0, '战利品掉落概率提高 20%。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),description=VALUES(description)`);
  await pool.query(`INSERT INTO skill_definitions (code,name,category,damage_type,skill_kind,element,range_type,mana_cost,cooldown_turns,power,learn_cost,max_level,description) VALUES
    ('sword_shield_mastery','剑盾精通','passive','无','精通','无','自身',0,0,0,99,1,'装备长剑时攻击提高8%，装备盾牌时防御提高8%。'),
    ('warrior_counter','盾反','passive','无','反击','无','近战',0,0,0,99,1,'受到近战伤害时，有25%几率对伤害来源造成一次普通攻击。'),
    ('warrior_taunt_player','嘲讽','utility','无','仇恨','无','全体',25,2,0,99,5,'令全体队友仇恨减半，并将减少的仇恨转移给自身。'),
    ('shield_bash_player','盾击','physical','打击','打击','无','近战',45,2,130,99,5,'攻击敌人，并令自身下次出手前受到的伤害降低50%。'),
    ('arcane_mastery','奥术精通','passive','无','精通','无','自身',0,0,0,99,1,'魔法攻击提高8%，最大魔力提高8%。'),
    ('fire_lance','炎枪术','magic','火','元素','火','远程',55,2,150,99,5,'凝聚炽热火枪贯穿目标。'),
    ('frost_barrier','冰霜护壁','magic','冰','元素','冰','自身',60,3,0,99,5,'为自身施加护盾，并降低近身敌人的速度。'),
    ('shadow_step','影步','passive','无','身法','无','自身',0,0,0,99,1,'闪避提高8%，移动速度提高1。'),
    ('backstab','背刺','physical','刺击','刺击','无','近战',45,2,155,99,5,'从敌人破绽处发动致命刺击。'),
    ('smoke_screen','烟幕','utility','无','控场','无','全体',35,3,0,99,5,'降低全体敌人的命中，提升队伍闪避。'),
    ('holy_prayer','圣祷','passive','无','祷告','无','自身',0,0,0,99,1,'治疗效果提高10%，最大魔力提高5%。'),
    ('healing_light','治愈之光','magic','光','元素','光','远程',50,1,0,99,5,'恢复一名生命最低队友的生命。'),
    ('blessing_hymn','祝福圣歌','magic','光','元素','光','全体',65,3,0,99,5,'为全队施加短暂的攻击与防御祝福。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),damage_type=VALUES(damage_type),skill_kind=VALUES(skill_kind),element=VALUES(element),range_type=VALUES(range_type),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),description=VALUES(description)`);
  await pool.query(`UPDATE skill_definitions SET skill_kind=CASE category WHEN 'physical' THEN CASE damage_type WHEN '斩击' THEN '斩击' WHEN '刺击' THEN '刺击' ELSE '打击' END WHEN 'magic' THEN CASE WHEN damage_type IN ('水','火','土','木','风','冰','雷','光','暗') THEN '元素' WHEN damage_type='奥术' THEN '能量' ELSE '灵异' END WHEN 'utility' THEN '辅助' WHEN 'passive' THEN '被动' ELSE skill_kind END, element=CASE WHEN category='magic' AND damage_type IN ('水','火','土','木','风','冰','雷','光','暗') THEN damage_type ELSE '无' END, range_type=CASE WHEN category='physical' THEN '近战' WHEN category='magic' THEN '远程' WHEN category='utility' THEN '全体' WHEN category='passive' THEN '自身' ELSE range_type END`);
  await pool.query(`UPDATE skill_definitions SET category='magic',damage_type=CASE code WHEN 'vine_hex' THEN '木' WHEN 'vine_bolt' THEN '木' WHEN 'moonbolt' THEN '暗' WHEN 'moonlight_bolt' THEN '暗' END,skill_kind='元素',element=CASE code WHEN 'vine_hex' THEN '木' WHEN 'vine_bolt' THEN '木' WHEN 'moonbolt' THEN '暗' WHEN 'moonlight_bolt' THEN '暗' END,range_type='远程',learn_cost=CASE WHEN code IN ('vine_bolt','moonlight_bolt') THEN 1 ELSE 99 END,upgrade_cost=CASE WHEN code IN ('vine_bolt','moonlight_bolt') THEN 1 ELSE 99 END,max_level=CASE WHEN code IN ('vine_hex','moonbolt') THEN 1 ELSE 5 END,power_per_level=CASE WHEN code IN ('vine_hex','moonbolt') THEN 0 ELSE 15 END WHERE code IN ('vine_hex','vine_bolt','moonbolt','moonlight_bolt')`);
  await pool.query(`INSERT INTO skill_definitions (code,name,category,damage_type,skill_kind,element,range_type,mana_cost,cooldown_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,description,passive_effect_json) VALUES
    ('longsword_mastery','长剑精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备长剑类武器时物攻提高5%至25%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','长剑','physicalAttackPct',5)),
    ('shield_mastery','盾牌精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备盾牌类武器时双防提高5%至25%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','盾牌','physicalDefensePct',5,'magicDefensePct',5)),
    ('staff_mastery','法杖精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备法杖类武器时魔攻提高5%至25%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','法杖','magicAttackPct',5)),
    ('spellbook_mastery','法书精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备法书类武器时吟唱速度提高14%至70%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','法书','chantSpeedPct',14)),
    ('orb_mastery','法球精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备法球类武器时魔力上限提高14%至70%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','法球','mpPct',14)),
    ('dagger_mastery','匕首精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备匕首类武器时双攻提高4%至20%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','匕首','physicalAttackPct',4,'magicAttackPct',4)),
    ('fistblade_mastery','拳刃精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备拳刃类武器时暴击、暴伤提高5%至25%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','拳刃','critRatePct',5,'critDamagePct',5))
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),max_level=VALUES(max_level),passive_effect_json=VALUES(passive_effect_json)`);
  await pool.query(`DELETE ps FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE s.code IN ('sword_shield_mastery','warrior_counter','warrior_taunt_player','shield_bash_player','arcane_mastery','fire_lance','frost_barrier','shadow_step','backstab','smoke_screen','holy_prayer','healing_light','blessing_hymn')`);
  await pool.query(`INSERT IGNORE INTO player_skills (character_id,skill_id)
    SELECT c.id,s.id FROM characters c JOIN profession_definitions p ON p.code=c.profession_code JOIN skill_definitions s ON JSON_CONTAINS(p.skill_codes_json,JSON_QUOTE(s.code))`);
  await pool.query(`INSERT IGNORE INTO player_skill_specializations (character_id,skill_id,specialization)
    SELECT ps.character_id,ps.skill_id,'overcharge' FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE s.code IN ('longsword_mastery','shield_mastery','staff_mastery','spellbook_mastery','orb_mastery','dagger_mastery','fistblade_mastery')`);
  await pool.query(`INSERT IGNORE INTO player_skill_specializations (character_id,skill_id,specialization)
    SELECT ps.character_id,ps.skill_id,'instant' FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE s.code IN ('longsword_mastery','shield_mastery','staff_mastery','spellbook_mastery','orb_mastery','dagger_mastery','fistblade_mastery')`);
  await pool.query(`UPDATE skill_definitions SET damage_type=CASE code WHEN 'arcane_bolt' THEN '奥术' WHEN 'heavy_strike' THEN '打击' WHEN 'armor_break' THEN '斩击' WHEN 'fireball' THEN '火' WHEN 'toxic_edge' THEN '刺击' WHEN 'purifying_light' THEN '光' WHEN 'frost_bind' THEN '冰' WHEN 'bloodletting' THEN '斩击' WHEN 'hop' THEN '打击' WHEN 'jump_strike' THEN '打击' WHEN 'charge' THEN '刺击' WHEN 'bite' THEN '斩击' WHEN 'bite_slash' THEN '斩击' WHEN 'howl' THEN '暗' WHEN 'war_cry' THEN '暗' WHEN 'scratch' THEN '斩击' WHEN 'shell_bash' THEN '打击' WHEN 'shell_breaker' THEN '打击' WHEN 'spore_dart' THEN '木' WHEN 'spore_bolt' THEN '木' WHEN 'sonic_screech' THEN '暗' WHEN 'echo_shock' THEN '暗' WHEN 'thorn_shot' THEN '刺击' WHEN 'thorn_stab' THEN '刺击' WHEN 'mist_pounce' THEN '斩击' WHEN 'mist_step_slash' THEN '斩击' WHEN 'constrict' THEN '打击' WHEN 'maul' THEN '斩击' WHEN 'goblin_slash' THEN '斩击' WHEN 'goblin_fire' THEN '火' WHEN 'slime_bash' THEN '打击' WHEN 'acid_spray' THEN '水' WHEN 'regenerate_slime' THEN '木' WHEN 'guard_break' THEN '打击' WHEN 'warrior_taunt' THEN '打击' WHEN 'shield_counter' THEN '打击' WHEN 'arcane_shackle' THEN '奥术' WHEN 'ember_burst' THEN '火' WHEN 'healing_prayer' THEN '光' WHEN 'blessing_aegis' THEN '光' WHEN 'sanctified_bolt' THEN '光' ELSE damage_type END`);
  await pool.query(`UPDATE skill_definitions SET skill_kind=CASE category WHEN 'physical' THEN CASE damage_type WHEN '斩击' THEN '斩击' WHEN '刺击' THEN '刺击' ELSE '打击' END WHEN 'magic' THEN CASE WHEN damage_type IN ('水','火','土','木','风','冰','雷','光','暗') THEN '元素' WHEN damage_type='奥术' THEN '能量' ELSE '灵异' END WHEN 'utility' THEN '辅助' WHEN 'passive' THEN '被动' ELSE skill_kind END, element=CASE WHEN category='magic' AND damage_type IN ('水','火','土','木','风','冰','雷','光','暗') THEN damage_type ELSE '无' END, range_type=CASE WHEN category='physical' THEN '近战' WHEN category='magic' THEN '远程' WHEN category='utility' THEN '全体' WHEN category='passive' THEN '自身' ELSE range_type END`);
  await pool.query(`UPDATE characters SET element_mastery_json=COALESCE(element_mastery_json,JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0)),element_resistance_json=COALESCE(element_resistance_json,JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0))`);
  await pool.query(`UPDATE monster_templates SET element_mastery_json=COALESCE(element_mastery_json,JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0)),element_resistance_json=COALESCE(element_resistance_json,JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0))`);
  await pool.query(`UPDATE skill_definitions SET learn_cost=CASE code WHEN 'heavy_strike' THEN 1 WHEN 'armor_break' THEN 1 WHEN 'arcane_bolt' THEN 1 WHEN 'bloodletting' THEN 1 WHEN 'jump_strike' THEN 1 WHEN 'bite_slash' THEN 1 WHEN 'charge' THEN 1 WHEN 'shell_breaker' THEN 1 WHEN 'thorn_stab' THEN 1 WHEN 'mist_step_slash' THEN 1 WHEN 'spore_bolt' THEN 2 WHEN 'echo_shock' THEN 2 WHEN 'war_cry' THEN 2 WHEN 'toxic_edge' THEN 2 WHEN 'fireball' THEN 2 WHEN 'frost_bind' THEN 2 WHEN 'purifying_light' THEN 3 ELSE 99 END, upgrade_cost=CASE code WHEN 'heavy_strike' THEN 1 WHEN 'armor_break' THEN 1 WHEN 'arcane_bolt' THEN 1 WHEN 'bloodletting' THEN 1 WHEN 'jump_strike' THEN 1 WHEN 'bite_slash' THEN 1 WHEN 'charge' THEN 1 WHEN 'shell_breaker' THEN 1 WHEN 'thorn_stab' THEN 1 WHEN 'mist_step_slash' THEN 1 WHEN 'spore_bolt' THEN 2 WHEN 'echo_shock' THEN 2 WHEN 'war_cry' THEN 2 WHEN 'toxic_edge' THEN 2 WHEN 'fireball' THEN 2 WHEN 'frost_bind' THEN 2 WHEN 'purifying_light' THEN 3 ELSE 99 END, max_level=CASE WHEN code IN ('hop','bite','howl','scratch','shell_bash','spore_dart','sonic_screech','thorn_shot','mist_pounce','constrict','maul','goblin_slash','goblin_fire') THEN 1 ELSE 5 END, power_per_level=CASE WHEN code IN ('hop','bite','howl','scratch','shell_bash','spore_dart','sonic_screech','thorn_shot','mist_pounce','constrict','maul','goblin_slash','goblin_fire') THEN 0 ELSE 15 END, cooldown_reduction_per_level=CASE WHEN code IN ('heavy_strike','armor_break','fireball','toxic_edge','purifying_light','frost_bind','bloodletting','jump_strike','bite_slash','charge','war_cry','shell_breaker','spore_bolt','echo_shock','thorn_stab','mist_step_slash') THEN 1 ELSE 0 END`);
  await pool.query(`UPDATE skill_definitions SET category='passive',learn_cost=CASE WHEN code='appraisal' THEN 1 ELSE 99 END,upgrade_cost=99,max_level=1,power_per_level=0,passive_effect_json=CASE code
    WHEN 'appraisal' THEN JSON_OBJECT('revealMonsterTraits',true,'unlockMonsterDetail',true)
    WHEN 'growth_blessing' THEN JSON_OBJECT('experienceMultiplier',2)
    WHEN 'mana_affinity' THEN JSON_OBJECT('manaCostReductionPct',30)
    WHEN 'lucky_favor' THEN JSON_OBJECT('dropBonusPct',20)
    ELSE passive_effect_json END
    WHERE code IN ('appraisal','growth_blessing','mana_affinity','lucky_favor')`);
  await pool.query(`UPDATE skill_definitions SET upgrade_cost=1,max_level=13,description='鉴识未知的敌对生物。慧眼每升一级可额外鉴识高于自身 3 级的目标；识珠可逐步解锁更多情报。' WHERE code='appraisal'`);
  await pool.query(`UPDATE skill_definitions SET codex_id=CONCAT(CASE category WHEN 'physical' THEN '41' WHEN 'magic' THEN '42' ELSE '49' END, LPAD(id,5,'0')) WHERE codex_id IS NULL`);
  await pool.query(`INSERT IGNORE INTO player_skills (character_id,skill_id)
    SELECT b.character_id,s.id FROM player_blessings b JOIN skill_definitions s ON s.code=b.code AND s.category='passive'`);
  await pool.query(`INSERT IGNORE INTO player_skill_discoveries (character_id,skill_id)
    SELECT c.id,s.id FROM characters c JOIN skill_definitions s ON s.code='appraisal'
    LEFT JOIN player_skills ps ON ps.character_id=c.id AND ps.skill_id=s.id WHERE ps.skill_id IS NULL`);
  await pool.query(`INSERT IGNORE INTO player_appraisal_progress (character_id)
    SELECT ps.character_id FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE s.code='appraisal'`);
  await pool.query(`INSERT INTO effect_definitions (code,name,effect_type,default_value,default_duration,max_level,max_stacks,stackable,description) VALUES
    ('vulnerability','脆弱','stat_modifier',25,3,5,1,0,'降低目标物理防御，效果值为百分比。'),
    ('burn','灼烧','damage_over_time',5,3,5,1,0,'每回合损失最大生命值一定比例。'),
    ('poison','中毒','damage_over_time',3,3,5,5,1,'每回合损失最大生命值一定比例，可叠加。'),
    ('bleeding','流血','damage_over_time',4,3,5,3,1,'每回合损失最大生命值一定比例，可叠加。'),
    ('slow','迟缓','stat_modifier',20,2,5,1,0,'降低速度，效果值为百分比。'),
    ('stun','眩晕','control',1,1,3,1,0,'无法进行一次行动。'),
    ('purify','净化','cleanse',1,0,1,1,0,'移除目标全部异常状态。'),
    ('barrier','护盾','shield',12,3,5,1,0,'获得相当于最大生命值一定比例的护盾。'),
    ('regeneration','再生','heal_over_time',4,3,5,1,0,'每回合恢复最大生命值一定比例。'),
    ('mana_regeneration','回流','mana_regen',5,3,1,1,0,'每回合恢复最大魔力一定比例。'),
    ('sword_break','破甲剑痕','stat_modifier',16,3,1,5,1,'物理防御降低，可叠加。'),
    ('demon_surge','魔剑激涌','stat_modifier',16,3,1,5,1,'造成伤害提高，可叠加。')
    ,('shield_guard','盾击守势','stat_modifier',50,1,1,1,0,'下次出手前受到的伤害降低50%。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),default_value=VALUES(default_value),default_duration=VALUES(default_duration),max_level=VALUES(max_level),max_stacks=VALUES(max_stacks),stackable=VALUES(stackable),description=VALUES(description)`);
  await pool.query(`INSERT INTO skill_effects (skill_id,effect_id,effect_level,value_override,duration_override,target_scope,trigger_timing) VALUES
    ((SELECT id FROM skill_definitions WHERE code='armor_break'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,NULL,NULL,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='fireball'),(SELECT id FROM effect_definitions WHERE code='burn'),1,NULL,NULL,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='toxic_edge'),(SELECT id FROM effect_definitions WHERE code='poison'),1,NULL,NULL,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='purifying_light'),(SELECT id FROM effect_definitions WHERE code='purify'),1,NULL,NULL,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='frost_bind'),(SELECT id FROM effect_definitions WHERE code='slow'),1,NULL,NULL,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='bloodletting'),(SELECT id FROM effect_definitions WHERE code='bleeding'),1,NULL,NULL,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='hop'),(SELECT id FROM effect_definitions WHERE code='slow'),1,4,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='jump_strike'),(SELECT id FROM effect_definitions WHERE code='slow'),1,4,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='charge'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,5,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='bite'),(SELECT id FROM effect_definitions WHERE code='bleeding'),1,1,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='bite_slash'),(SELECT id FROM effect_definitions WHERE code='bleeding'),1,1,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='howl'),(SELECT id FROM effect_definitions WHERE code='slow'),1,5,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='war_cry'),(SELECT id FROM effect_definitions WHERE code='slow'),1,5,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='scratch'),(SELECT id FROM effect_definitions WHERE code='bleeding'),1,1,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='mist_pounce'),(SELECT id FROM effect_definitions WHERE code='bleeding'),1,1,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='mist_step_slash'),(SELECT id FROM effect_definitions WHERE code='slow'),1,4,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='maul'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,5,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='vine_hex'),(SELECT id FROM effect_definitions WHERE code='slow'),1,5,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='vine_bolt'),(SELECT id FROM effect_definitions WHERE code='slow'),1,6,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='moonbolt'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,5,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='moonlight_bolt'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,6,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='spore_dart'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,8,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='sonic_screech'),(SELECT id FROM effect_definitions WHERE code='slow'),1,8,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='thorn_shot'),(SELECT id FROM effect_definitions WHERE code='bleeding'),1,1,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='constrict'),(SELECT id FROM effect_definitions WHERE code='slow'),1,6,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_fire'),(SELECT id FROM effect_definitions WHERE code='burn'),1,1,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='acid_spray'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,12,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='regenerate_slime'),(SELECT id FROM effect_definitions WHERE code='regeneration'),1,8,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='guard_break'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,18,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='shield_counter'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,25,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='arcane_shackle'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='arcane_shackle'),(SELECT id FROM effect_definitions WHERE code='slow'),1,18,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='ember_burst'),(SELECT id FROM effect_definitions WHERE code='burn'),1,6,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='healing_prayer'),(SELECT id FROM effect_definitions WHERE code='regeneration'),1,6,2,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='blessing_aegis'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,18,3,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='blessing_aegis'),(SELECT id FROM effect_definitions WHERE code='regeneration'),1,4,3,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='mana_benediction'),(SELECT id FROM effect_definitions WHERE code='mana_regeneration'),1,5,3,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='sanctified_bolt'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,12,2,'self','on_cast')
    ,((SELECT id FROM skill_definitions WHERE code='shield_bash_player'),(SELECT id FROM effect_definitions WHERE code='shield_guard'),1,50,1,'self','on_cast')
    ON DUPLICATE KEY UPDATE effect_level=VALUES(effect_level),value_override=VALUES(value_override),duration_override=VALUES(duration_override),target_scope=VALUES(target_scope),trigger_timing=VALUES(trigger_timing)`);
  await pool.query(`INSERT INTO monster_templates (code, name, monster_class, level, constitution, spirit, strength, intelligence, agility, perception, constitution_growth, spirit_growth, strength_growth, intelligence_growth, agility_growth, perception_growth, skill_sequence, experience, drops_json) VALUES
    ('ball_rabbit', '球兔', 'normal', 1, 4,3,3,2,17,15, 0.3,0.2,0.3,0.2,1.0,0.8, JSON_ARRAY('hop','scratch'), 36, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',0.80,'quantity',1),JSON_OBJECT('code','beast_bone','chance',0.60,'quantity',1),JSON_OBJECT('code','beast_hide','chance',0.40,'quantity',1),JSON_OBJECT('code','beast_tendon','chance',0.20,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.05,'quantity',1),JSON_OBJECT('code','magic_wool','chance',0.10,'quantity',1))),
    ('spike_boar', '刺猪', 'normal', 1, 17,2,18,2,4,3, 0.8,0.1,0.9,0.1,0.2,0.2, JSON_ARRAY('charge','scratch'), 54, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',0.80,'quantity',1),JSON_OBJECT('code','beast_bone','chance',0.60,'quantity',1),JSON_OBJECT('code','beast_hide','chance',0.40,'quantity',1),JSON_OBJECT('code','beast_tendon','chance',0.20,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.05,'quantity',1),JSON_OBJECT('code','magic_tusk','chance',0.10,'quantity',1))),
    ('vine_snake', '藤蛇', 'normal', 1, 4,14,3,16,5,12, 0.2,0.9,0.2,1.0,0.3,0.8, JSON_ARRAY('bite','vine_hex','constrict'), 51, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',0.80,'quantity',1),JSON_OBJECT('code','beast_bone','chance',0.60,'quantity',1),JSON_OBJECT('code','beast_hide','chance',0.40,'quantity',1),JSON_OBJECT('code','beast_tendon','chance',0.20,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.05,'quantity',1),JSON_OBJECT('code','magic_scale','chance',0.10,'quantity',1))),
    ('black_bear', '乌熊', 'normal', 2, 17,3,18,2,3,3, 0.9,0.2,1.0,0.1,0.2,0.2, JSON_ARRAY('maul','howl'), 78, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',0.80,'quantity',1),JSON_OBJECT('code','beast_bone','chance',0.60,'quantity',1),JSON_OBJECT('code','beast_hide','chance',0.40,'quantity',1),JSON_OBJECT('code','beast_tendon','chance',0.20,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.05,'quantity',1),JSON_OBJECT('code','magic_claw','chance',0.10,'quantity',1))),
    ('mist_wolf', '幽狼', 'normal', 2, 4,14,5,15,8,11, 0.2,0.9,0.3,1.0,0.5,0.7, JSON_ARRAY('mist_pounce','moonbolt','bite'), 75, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',0.80,'quantity',1),JSON_OBJECT('code','beast_bone','chance',0.60,'quantity',1),JSON_OBJECT('code','beast_hide','chance',0.40,'quantity',1),JSON_OBJECT('code','beast_tendon','chance',0.20,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.05,'quantity',1),JSON_OBJECT('code','magic_heartcore','chance',0.10,'quantity',1))),
    ('roll_rabbit', '滚兔', 'large', 3, 6,7,6,5,22,18, 0.4,0.4,0.4,0.3,1.4,1.1, JSON_ARRAY('hop','charge','scratch'), 54, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',1,'quantity',2),JSON_OBJECT('code','beast_bone','chance',0.90,'quantity',2),JSON_OBJECT('code','beast_hide','chance',0.70,'quantity',2),JSON_OBJECT('code','beast_tendon','chance',0.45,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.25,'quantity',1),JSON_OBJECT('code','magic_wool','chance',0.50,'quantity',1))),
    ('tusk_boar', '獠猪', 'large', 4, 21,4,23,3,6,5, 1.2,0.2,1.3,0.2,0.4,0.3, JSON_ARRAY('charge','maul','scratch'), 74, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',1,'quantity',2),JSON_OBJECT('code','beast_bone','chance',0.90,'quantity',2),JSON_OBJECT('code','beast_hide','chance',0.70,'quantity',2),JSON_OBJECT('code','beast_tendon','chance',0.45,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.25,'quantity',1),JSON_OBJECT('code','magic_tusk','chance',0.50,'quantity',1))),
    ('vine_python', '藤蚺', 'large', 4, 6,18,5,20,7,18, 0.4,1.2,0.3,1.3,0.5,1.2, JSON_ARRAY('bite','vine_hex','constrict'), 78, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',1,'quantity',2),JSON_OBJECT('code','beast_bone','chance',0.90,'quantity',2),JSON_OBJECT('code','beast_hide','chance',0.70,'quantity',2),JSON_OBJECT('code','beast_tendon','chance',0.45,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.25,'quantity',1),JSON_OBJECT('code','magic_scale','chance',0.50,'quantity',1))),
    ('pitch_bear', '漆熊', 'large', 5, 23,6,25,4,4,7, 1.4,0.3,1.5,0.2,0.3,0.4, JSON_ARRAY('maul','howl','bite'), 108, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',1,'quantity',2),JSON_OBJECT('code','beast_bone','chance',0.90,'quantity',2),JSON_OBJECT('code','beast_hide','chance',0.70,'quantity',2),JSON_OBJECT('code','beast_tendon','chance',0.45,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.25,'quantity',1),JSON_OBJECT('code','magic_claw','chance',0.50,'quantity',1))),
    ('shadow_wolf', '影狼', 'large', 5, 7,19,8,21,14,16, 0.5,1.2,0.5,1.4,0.9,1.0, JSON_ARRAY('mist_pounce','moonbolt','howl','bite'), 96, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',1,'quantity',2),JSON_OBJECT('code','beast_bone','chance',0.90,'quantity',2),JSON_OBJECT('code','beast_hide','chance',0.70,'quantity',2),JSON_OBJECT('code','beast_tendon','chance',0.45,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.25,'quantity',1),JSON_OBJECT('code','magic_heartcore','chance',0.50,'quantity',1))),
    ('goblin', '哥布林', 'elite', 4, 10,13,13,16,16,15, 0.8,1.0,0.9,1.2,1.1,1.0, JSON_ARRAY('goblin_slash','goblin_fire','scratch'), 82, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',0.35,'quantity',1),JSON_OBJECT('code','beast_bone','chance',0.70,'quantity',1),JSON_OBJECT('code','beast_hide','chance',0.35,'quantity',1),JSON_OBJECT('code','beast_tendon','chance',0.20,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.25,'quantity',1),JSON_OBJECT('code','goblin_ear','chance',0.50,'quantity',1))),
    ('forest_slime', '森林史莱姆', 'boss', 8, 37,28,25,31,10,15, 1.6,1.4,1.1,1.3,0.5,0.8, JSON_ARRAY('slime_bash','acid_spray','regenerate_slime'), 260, JSON_ARRAY(JSON_OBJECT('code','healing_herb','chance',1,'min_quantity',6,'max_quantity',10)))
    ON DUPLICATE KEY UPDATE name=VALUES(name),monster_class=VALUES(monster_class),level=VALUES(level),constitution=VALUES(constitution),spirit=VALUES(spirit),strength=VALUES(strength),intelligence=VALUES(intelligence),agility=VALUES(agility),perception=VALUES(perception),constitution_growth=VALUES(constitution_growth),spirit_growth=VALUES(spirit_growth),strength_growth=VALUES(strength_growth),intelligence_growth=VALUES(intelligence_growth),agility_growth=VALUES(agility_growth),perception_growth=VALUES(perception_growth),skill_sequence=VALUES(skill_sequence),experience=VALUES(experience),drops_json=VALUES(drops_json)`);
  await pool.query(`UPDATE monster_templates SET weakness_json=CASE code WHEN 'ball_rabbit' THEN JSON_ARRAY('刺击') WHEN 'spike_boar' THEN JSON_ARRAY('斩击') WHEN 'vine_snake' THEN JSON_ARRAY('斩击') WHEN 'black_bear' THEN JSON_ARRAY('刺击') WHEN 'mist_wolf' THEN JSON_ARRAY('打击') WHEN 'roll_rabbit' THEN JSON_ARRAY('刺击') WHEN 'tusk_boar' THEN JSON_ARRAY('斩击') WHEN 'vine_python' THEN JSON_ARRAY('斩击') WHEN 'pitch_bear' THEN JSON_ARRAY('刺击') WHEN 'shadow_wolf' THEN JSON_ARRAY('打击') WHEN 'goblin' THEN JSON_ARRAY('打击') WHEN 'forest_slime' THEN JSON_ARRAY('刺击') ELSE weakness_json END, resistance_json=CASE code WHEN 'ball_rabbit' THEN JSON_ARRAY('打击') WHEN 'spike_boar' THEN JSON_ARRAY('刺击') WHEN 'vine_snake' THEN JSON_ARRAY('刺击') WHEN 'black_bear' THEN JSON_ARRAY('打击') WHEN 'mist_wolf' THEN JSON_ARRAY('斩击') WHEN 'roll_rabbit' THEN JSON_ARRAY('打击') WHEN 'tusk_boar' THEN JSON_ARRAY('刺击') WHEN 'vine_python' THEN JSON_ARRAY('刺击') WHEN 'pitch_bear' THEN JSON_ARRAY('打击') WHEN 'shadow_wolf' THEN JSON_ARRAY('斩击') WHEN 'goblin' THEN JSON_ARRAY('刺击') WHEN 'forest_slime' THEN JSON_ARRAY('打击') ELSE resistance_json END`);
  await pool.query(`UPDATE monster_templates SET element_mastery_json=CASE code
    WHEN 'vine_snake' THEN JSON_OBJECT('水',0,'火',0,'土',0,'木',12,'风',0,'冰',0,'雷',0,'光',0,'暗',0)
    WHEN 'vine_python' THEN JSON_OBJECT('水',0,'火',0,'土',0,'木',20,'风',0,'冰',0,'雷',0,'光',0,'暗',0)
    WHEN 'mist_wolf' THEN JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',12)
    WHEN 'shadow_wolf' THEN JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',20)
    WHEN 'goblin' THEN JSON_OBJECT('水',0,'火',10,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0)
    WHEN 'forest_slime' THEN JSON_OBJECT('水',12,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0)
    ELSE element_mastery_json END,
    element_resistance_json=CASE code
    WHEN 'spike_boar' THEN JSON_OBJECT('水',-10,'火',0,'土',8,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0)
    WHEN 'vine_snake' THEN JSON_OBJECT('水',0,'火',-12,'土',0,'木',10,'风',0,'冰',0,'雷',0,'光',0,'暗',0)
    WHEN 'black_bear' THEN JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',-10,'雷',0,'光',0,'暗',0)
    WHEN 'mist_wolf' THEN JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',-12,'暗',10)
    WHEN 'tusk_boar' THEN JSON_OBJECT('水',-12,'火',0,'土',10,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0)
    WHEN 'vine_python' THEN JSON_OBJECT('水',0,'火',-15,'土',0,'木',15,'风',0,'冰',0,'雷',0,'光',0,'暗',0)
    WHEN 'pitch_bear' THEN JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',-15,'雷',0,'光',0,'暗',0)
    WHEN 'shadow_wolf' THEN JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',-15,'暗',15)
    WHEN 'goblin' THEN JSON_OBJECT('水',0,'火',10,'土',0,'木',0,'风',0,'冰',0,'雷',-10,'光',0,'暗',0)
    ELSE element_resistance_json END`);
  await pool.query(`DELETE r FROM monster_skill_learn_rules r JOIN monster_templates t ON t.id=r.monster_template_id WHERE t.code IN ('ball_rabbit','spike_boar','vine_snake','black_bear','mist_wolf','roll_rabbit','tusk_boar','vine_python','pitch_bear','shadow_wolf','goblin')`);
  await pool.query(`INSERT INTO monster_skill_learn_rules (monster_template_id,source_skill_code,skill_id,chance) VALUES
    ((SELECT id FROM monster_templates WHERE code='ball_rabbit'),'hop',(SELECT id FROM skill_definitions WHERE code='jump_strike'),0.50000),
    ((SELECT id FROM monster_templates WHERE code='spike_boar'),'charge',(SELECT id FROM skill_definitions WHERE code='charge'),0.50000),
    ((SELECT id FROM monster_templates WHERE code='vine_snake'),'bite',(SELECT id FROM skill_definitions WHERE code='bite_slash'),0.50000),
    ((SELECT id FROM monster_templates WHERE code='vine_snake'),'vine_hex',(SELECT id FROM skill_definitions WHERE code='vine_bolt'),0.50000),
    ((SELECT id FROM monster_templates WHERE code='vine_python'),'bite',(SELECT id FROM skill_definitions WHERE code='bite_slash'),0.50000),
    ((SELECT id FROM monster_templates WHERE code='vine_python'),'vine_hex',(SELECT id FROM skill_definitions WHERE code='vine_bolt'),0.50000),
    ((SELECT id FROM monster_templates WHERE code='mist_wolf'),'mist_pounce',(SELECT id FROM skill_definitions WHERE code='mist_step_slash'),0.50000),
    ((SELECT id FROM monster_templates WHERE code='mist_wolf'),'moonbolt',(SELECT id FROM skill_definitions WHERE code='moonlight_bolt'),0.50000),
    ((SELECT id FROM monster_templates WHERE code='roll_rabbit'),'hop',(SELECT id FROM skill_definitions WHERE code='jump_strike'),0.50000),
    ((SELECT id FROM monster_templates WHERE code='tusk_boar'),'charge',(SELECT id FROM skill_definitions WHERE code='charge'),0.50000),
    ((SELECT id FROM monster_templates WHERE code='shadow_wolf'),'mist_pounce',(SELECT id FROM skill_definitions WHERE code='mist_step_slash'),0.50000),
    ((SELECT id FROM monster_templates WHERE code='shadow_wolf'),'moonbolt',(SELECT id FROM skill_definitions WHERE code='moonlight_bolt'),0.50000),
    ((SELECT id FROM monster_templates WHERE code='pitch_bear'),'howl',(SELECT id FROM skill_definitions WHERE code='war_cry'),0.50000)`);
  await pool.query(`INSERT IGNORE INTO monster_encounter_texts (monster_template_id, description) VALUES
    ((SELECT id FROM monster_templates WHERE code='ball_rabbit'), '落叶轻轻颤动，一只球兔从灌木后探出圆滚滚的脑袋，红色的眼睛正盯着你。'),
    ((SELECT id FROM monster_templates WHERE code='ball_rabbit'), '草丛里传来急促的蹦跳声，球兔挡在了你的去路上。'),
    ((SELECT id FROM monster_templates WHERE code='thorn_rat'), '腐叶下窜出一只棘鼠，背上的硬刺在雾中微微竖起。'),
    ((SELECT id FROM monster_templates WHERE code='thorn_rat'), '细碎的啮咬声戛然而止，棘鼠拖着长尾从树根旁露出身形。'),
    ((SELECT id FROM monster_templates WHERE code='spike_boar'), '沉重的蹄声压过枯枝，一头刺猪低下头，用尖刺对准了你。'),
    ((SELECT id FROM monster_templates WHERE code='spike_boar'), '泥土被拱开，暴躁的刺猪从阴影中冲出，发出威胁的哼叫。'),
    ((SELECT id FROM monster_templates WHERE code='vine_python'), '藤蔓忽然收紧，藏在树冠间的藤蚺吐着信子俯视着你。'),
    ((SELECT id FROM monster_templates WHERE code='vine_python'), '湿冷的鳞片擦过树干，藤蚺无声地封住了前方。'),
    ((SELECT id FROM monster_templates WHERE code='moss_turtle'), '一块覆满青苔的巨石动了起来，原来是苔甲龟缓缓拦在路中。'),
    ((SELECT id FROM monster_templates WHERE code='moss_turtle'), '泥水里传出沉闷摩擦声，苔甲龟将厚重的甲壳转向了你。'),
    ((SELECT id FROM monster_templates WHERE code='stone_crab'), '石缝中伸出数只钳足，石壳蟹举着沉重外壳横移而来。'),
    ((SELECT id FROM monster_templates WHERE code='stone_crab'), '脚边碎石突然滚落，伪装成岩块的石壳蟹张开了钳子。'),
    ((SELECT id FROM monster_templates WHERE code='spore_dryad'), '树皮间裂开一张苍白的面孔，孢子妖将发亮的菌伞对准了你。'),
    ((SELECT id FROM monster_templates WHERE code='spore_dryad'), '空气中漂来甜腻的菌香，孢子妖从腐木后轻轻探出身子。'),
    ((SELECT id FROM monster_templates WHERE code='night_bat'), '头顶传来刺耳尖啸，夜啼蝠倒挂在枝头，猩红双眼锁定了你。'),
    ((SELECT id FROM monster_templates WHERE code='night_bat'), '雾里掠过一道黑影，夜啼蝠拍动薄翼在你前方盘旋。'),
    ((SELECT id FROM monster_templates WHERE code='black_bear'), '浓重的腥味扑面而来，乌熊从雾里直起身躯，发出低沉咆哮。'),
    ((SELECT id FROM monster_templates WHERE code='black_bear'), '脚下的地面微微震动，乌熊拨开灌木，阴影笼罩了前路。'),
    ((SELECT id FROM monster_templates WHERE code='mist_wolf'), '雾气里亮起一双幽绿的眼睛，幽狼压低身体缓缓逼近。'),
    ((SELECT id FROM monster_templates WHERE code='mist_wolf'), '远处传来短促狼嚎，幽狼已悄然出现在你的侧前方。')`);
  await pool.query(`INSERT IGNORE INTO monster_encounter_texts (monster_template_id, description) VALUES
    ((SELECT id FROM monster_templates WHERE code='vine_snake'), '藤蔓间滑出一条藤蛇，斑驳鳞片贴着湿润树根无声游动。'),
    ((SELECT id FROM monster_templates WHERE code='vine_snake'), '细长的蛇信在雾中一闪，藤蛇盘踞在前方的垂藤上。'),
    ((SELECT id FROM monster_templates WHERE code='roll_rabbit'), '灌木被撞得东倒西歪，滚兔蜷成圆球高速冲向你。'),
    ((SELECT id FROM monster_templates WHERE code='roll_rabbit'), '沉闷的滚动声逼近，体型异常硕大的滚兔从坡上弹落。'),
    ((SELECT id FROM monster_templates WHERE code='tusk_boar'), '粗大的獠牙撕开薄雾，獠猪踩碎枯枝，低头蓄势。'),
    ((SELECT id FROM monster_templates WHERE code='tusk_boar'), '泥土翻卷，一头肩背隆起的獠猪从林间冲出。'),
    ((SELECT id FROM monster_templates WHERE code='vine_python'), '树冠传来枝叶摩擦声，藤蚺垂下粗壮身躯堵住退路。'),
    ((SELECT id FROM monster_templates WHERE code='vine_python'), '巨大的鳞影沿树干缓慢盘绕，藤蚺冷眼俯视着你。'),
    ((SELECT id FROM monster_templates WHERE code='pitch_bear'), '漆黑毛皮几乎融入阴影，漆熊踏着沉重脚步从雾后现身。'),
    ((SELECT id FROM monster_templates WHERE code='pitch_bear'), '腥风压低枝叶，漆熊张开巨爪发出低沉咆哮。'),
    ((SELECT id FROM monster_templates WHERE code='shadow_wolf'), '影狼从两棵树的阴影间跃出，身形仿佛随薄雾忽明忽暗。'),
    ((SELECT id FROM monster_templates WHERE code='shadow_wolf'), '幽蓝瞳孔在黑暗中一闪，影狼已绕到了你的侧后方。'),
    ((SELECT id FROM monster_templates WHERE code='goblin'), '尖细的笑声从灌木后传来，哥布林握着短刃探出头。'),
    ((SELECT id FROM monster_templates WHERE code='goblin'), '一团微弱火光在雾中跳动，哥布林正咧嘴念着听不懂的咒语。')`);
  await pool.query(`DELETE p FROM map_monster_pools p JOIN map_regions r ON r.id=p.region_id JOIN monster_templates t ON t.id=p.monster_template_id WHERE r.code='dark_forest' AND t.code NOT IN ('ball_rabbit','spike_boar','vine_snake','black_bear','mist_wolf','roll_rabbit','tusk_boar','vine_python','pitch_bear','shadow_wolf','goblin')`);
  await pool.query(`DELETE s FROM monster_spawns s JOIN map_regions r ON r.id=s.region_id JOIN monster_templates t ON t.id=s.template_id WHERE r.code='dark_forest' AND s.defeated_at IS NULL AND t.code NOT IN ('ball_rabbit','spike_boar','vine_snake','black_bear','mist_wolf','roll_rabbit','tusk_boar','vine_python','pitch_bear','shadow_wolf','goblin','forest_slime')`);
  await pool.query(`INSERT INTO map_monster_pools (region_id, monster_template_id, spawn_weight)
    SELECT r.id, t.id, CASE t.code WHEN 'ball_rabbit' THEN 24 WHEN 'spike_boar' THEN 18 WHEN 'vine_snake' THEN 16 WHEN 'black_bear' THEN 12 WHEN 'mist_wolf' THEN 18 WHEN 'roll_rabbit' THEN 4 WHEN 'tusk_boar' THEN 3 WHEN 'vine_python' THEN 4 WHEN 'pitch_bear' THEN 1 WHEN 'shadow_wolf' THEN 3 WHEN 'goblin' THEN 4 END
    FROM map_regions r JOIN monster_templates t ON t.code IN ('ball_rabbit','spike_boar','vine_snake','black_bear','mist_wolf','roll_rabbit','tusk_boar','vine_python','pitch_bear','shadow_wolf','goblin')
    WHERE r.code='dark_forest'
    ON DUPLICATE KEY UPDATE spawn_weight=VALUES(spawn_weight)`);
  await pool.query(`DELETE n FROM map_npcs n JOIN map_regions r ON r.id=n.region_id WHERE r.code='baina_town' AND n.code NOT IN ('pear_guide','guild_counter')`);
  await pool.query(`INSERT INTO map_npcs (region_id, code, name, description, pos_x, pos_y, pos_z) VALUES
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'pear_guide', '梨子喵（新人引导）', '笑容明快的猫族新手引导员，像是正专程在等你。', -26, -135, 0),
    ((SELECT id FROM map_regions WHERE code='world_tree'), 'tree_keeper', '树守·阿鲁', '守望世界树的沉默老人。', 0, 0, 0),
    ((SELECT id FROM map_regions WHERE code='dark_forest'), 'lost_hunter', '迷途猎人', '在薄雾中寻找归路的年轻猎人。', 12, -48, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'guild_counter', '冒险者公会', '承接委托、登记冒险者与交换情报的大厅。', -8, -116, 0)
    ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), pos_x=VALUES(pos_x), pos_y=VALUES(pos_y), pos_z=VALUES(pos_z)`);
  await pool.query(`INSERT INTO map_special_objects (region_id, code, name, description, pos_x, pos_y, pos_z) VALUES
    ((SELECT id FROM map_regions WHERE code='world_tree'), 'world_tree_altar', '世界树祭坛', '被古老根须环抱的石质祭坛。', 0, 0, 0),
    ((SELECT id FROM map_regions WHERE code='dark_forest'), 'mist_stone', '雾石', '不断散发着冷雾的灰白石碑。', -18, -76, 0)
    ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), pos_x=VALUES(pos_x), pos_y=VALUES(pos_y), pos_z=VALUES(pos_z)`);
  await pool.query(`INSERT IGNORE INTO map_move_texts (region_id, description) VALUES
    ((SELECT id FROM map_regions WHERE code='world_tree'), '世界树的根系在脚下轻轻起伏，空气中弥漫着清澈的生命气息。'),
    ((SELECT id FROM map_regions WHERE code='world_tree'), '抬头望去，巨大的枝叶遮住天空，零星光屑从叶隙间落下。'),
    ((SELECT id FROM map_regions WHERE code='dark_forest'), '薄雾缠绕在脚边，潮湿的树叶在靴底发出轻响。'),
    ((SELECT id FROM map_regions WHERE code='baina_town'), '不同口音的招呼声在石板街上交错，披着斗篷的旅人和各族居民擦肩而过。'),
    ((SELECT id FROM map_regions WHERE code='baina_town'), '林风吹过百纳镇的木制招牌，远处能听见铁匠铺与市场的喧闹。'),
    ((SELECT id FROM map_regions WHERE code='dark_forest'), '远处传来不明生物的低鸣，密林很快又归于沉寂。'),
    ((SELECT id FROM map_regions WHERE code='dark_forest'), '藤蔓垂落在前方，树影在雾里扭曲成陌生的形状。')`);
  await pool.query(`INSERT IGNORE INTO player_inventory (character_id, item_id, quantity)
    SELECT c.id, i.id, 3 FROM characters c JOIN item_definitions i ON i.code='healing_herb'`);
  await pool.query(`INSERT INTO characters (player_id,npc_id,npc_code,name,gender,level,experience,skill_points,constitution,spirit,strength,intelligence,agility,perception,constitution_growth,spirit_growth,strength_growth,intelligence_growth,agility_growth,perception_growth,adventurer_registered,hp_max,mp_max,current_hp,current_mp,physical_attack,magic_attack,physical_defense,magic_defense,accuracy,evasion,crit_rate_bp,crit_damage_bp,crit_resist_bp,crit_damage_reduction_bp,tenacity,speed,current_region_id,pos_x,pos_y,pos_z)
    SELECT NULL, v.npc_id, v.code, v.name, '未设定', 10, 900, 0, v.constitution,v.spirit,v.strength,v.intelligence,v.agility,v.perception, 0,0,0,0,0,0, 1, v.hp,v.mp,v.hp,v.mp,v.patk,v.matk,v.pdef,v.mdef,v.accuracy,v.evasion,100,3000,60,100,0,v.speed,(SELECT id FROM map_regions WHERE code='dark_forest'),0,-60,0
    FROM (SELECT 900000001 AS npc_id,'npc_forest_warrior' AS code,'莱昂' AS name,50 AS constitution,20 AS spirit,52 AS strength,12 AS intelligence,28 AS agility,24 AS perception,1150 AS hp,520 AS mp,170 AS patk,55 AS matk,145 AS pdef,85 AS mdef,22 AS accuracy,14 AS evasion,86 AS speed
      UNION ALL SELECT 900000002,'npc_forest_mage','伊芙',24,52,12,55,30,34,820,1150,55,185,78,120,23,16,94
      UNION ALL SELECT 900000003,'npc_forest_priest','希娅',38,55,18,38,25,32,1040,1100,72,145,115,145,21,16,82) v
    ON DUPLICATE KEY UPDATE name=VALUES(name),npc_id=VALUES(npc_id),level=VALUES(level),hp_max=VALUES(hp_max),mp_max=VALUES(mp_max),current_hp=VALUES(current_hp),current_mp=VALUES(current_mp),physical_attack=VALUES(physical_attack),magic_attack=VALUES(magic_attack),physical_defense=VALUES(physical_defense),magic_defense=VALUES(magic_defense),accuracy=VALUES(accuracy),evasion=VALUES(evasion),crit_rate_bp=VALUES(crit_rate_bp),crit_damage_bp=VALUES(crit_damage_bp),crit_resist_bp=VALUES(crit_resist_bp),crit_damage_reduction_bp=VALUES(crit_damage_reduction_bp),speed=VALUES(speed),stat_formula_version=2`);
  await pool.query('ALTER TABLE characters ALTER stat_formula_version SET DEFAULT 2');
  await pool.query('UPDATE characters SET accuracy=GREATEST(1,ROUND(accuracy/5)),evasion=GREATEST(1,ROUND(evasion/5)),crit_rate_bp=GREATEST(1,ROUND(crit_rate_bp/5)),crit_damage_bp=GREATEST(1,ROUND(crit_damage_bp/5)),crit_resist_bp=GREATEST(1,ROUND(crit_resist_bp/5)),crit_damage_reduction_bp=GREATEST(1,ROUND(crit_damage_reduction_bp/5)),stat_formula_version=2 WHERE stat_formula_version<2');
  await pool.query(`INSERT IGNORE INTO player_skills (character_id,skill_id,quick_slot)
    SELECT c.id,s.id,v.slot FROM characters c JOIN (
      SELECT 'npc_forest_warrior' AS code,'warrior_taunt' AS skill_code,1 AS slot UNION ALL SELECT 'npc_forest_warrior','shield_counter',2 UNION ALL SELECT 'npc_forest_warrior','guard_break',3
      UNION ALL SELECT 'npc_forest_mage','arcane_shackle',1 UNION ALL SELECT 'npc_forest_mage','ember_burst',2
      UNION ALL SELECT 'npc_forest_priest','healing_prayer',1 UNION ALL SELECT 'npc_forest_priest','blessing_aegis',2 UNION ALL SELECT 'npc_forest_priest','sanctified_bolt',3 UNION ALL SELECT 'npc_forest_priest','mana_benediction',4
    ) v ON v.code=c.npc_code JOIN skill_definitions s ON s.code=v.skill_code`);
  await pool.query(`INSERT IGNORE INTO player_quick_items (character_id, quick_slot, item_id)
    SELECT c.id, 1, i.id FROM characters c JOIN item_definitions i ON i.code='healing_herb'`);
};
