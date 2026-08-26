import type { Pool } from 'mysql2/promise';
import { refreshShopStocks } from '../game/shop-stock.service';

type BlacksmithStock = { code: string; name: string; category: string; weaponType: string | null; level: number; price: number; effect: Record<string, number | undefined> };
type AlchemistStock = { code: string; name: string; category: '回复' | '特殊'; price: number; description: string; effect: Record<string, number | boolean> };
const alchemistShopStock: AlchemistStock[] = [
  { code: 'glimmer_potion', name: '微光药水', category: '回复', price: 6, description: '恢复 150 点生命与 150 点魔力。', effect: { heal: 150, restoreMp: 150 } },
  { code: 'novice_hp_potion_small', name: '新手生命药水（小）', category: '回复', price: 10, description: '恢复 400 点生命。', effect: { heal: 400 } },
  { code: 'novice_mp_potion_small', name: '新手魔力药水（小）', category: '回复', price: 10, description: '恢复 400 点魔力。', effect: { restoreMp: 400 } },
  { code: 'novice_hp_potion_medium', name: '新手生命药水（中）', category: '回复', price: 16, description: '恢复 600 点生命。', effect: { heal: 600 } },
  { code: 'novice_mp_potion_medium', name: '新手魔力药水（中）', category: '回复', price: 16, description: '恢复 600 点魔力。', effect: { restoreMp: 600 } },
  { code: 'novice_hp_potion_large', name: '新手生命药水（大）', category: '回复', price: 30, description: '恢复 1000 点生命。', effect: { heal: 1000 } },
  { code: 'novice_mp_potion_large', name: '新手魔力药水（大）', category: '回复', price: 30, description: '恢复 1000 点魔力。', effect: { restoreMp: 1000 } },
  { code: 'minor_experience_elixir', name: '经验秘药（小）', category: '特殊', price: 100, description: '接下来 10 场战斗经验获取提高 25%。', effect: { experienceBonusPct: 25, battleCount: 10 } },
  { code: 'minor_luck_elixir', name: '幸运秘药（小）', category: '特殊', price: 200, description: '接下来 10 场战斗中，所在队伍的打怪掉率提高 25%。', effect: { partyDropBonusPct: 25, battleCount: 10 } }
];
const blacksmithShopStock: BlacksmithStock[] = [5, 10, 15, 20].flatMap(level => {
  const price = ({ 5: 200, 10: 400, 15: 1000, 20: 2000 } as Record<number, number>)[level];
  const prefix = ({ 5: '新手', 10: '硬木', 15: '黑铁', 20: '精钢' } as Record<number, string>)[level];
  return [
    { code: `shop_longsword_${level}`, name: `${prefix}长剑`, category: '武器', weaponType: '长剑', level, price, effect: { physicalAttack: level * 4 } },
    { code: `shop_staff_${level}`, name: `${prefix}法杖`, category: '武器', weaponType: '法杖', level, price, effect: { magicAttack: level * 4 } },
    { code: `shop_dagger_${level}`, name: `${prefix}匕首`, category: '武器', weaponType: '匕首', level, price, effect: { physicalAttack: level * 2, magicAttack: level * 2, accuracy: level * 2 } },
    { code: `shop_fistblade_${level}`, name: `${prefix}拳刃`, category: '武器', weaponType: '拳刃', level, price, effect: { physicalAttack: level * 3, critRateBp: level * 3 } },
    { code: `shop_shoulder_${level}`, name: `${prefix}护肩`, category: '头肩', weaponType: null, level, price, effect: { physicalDefense: level * 3, magicDefense: level * 2 } },
    { code: `shop_upper_${level}`, name: `${prefix}胸甲`, category: '上装', weaponType: null, level, price, effect: { physicalDefense: level * 4, hpMax: level * 4 } },
    { code: `shop_waist_${level}`, name: `${prefix}腰带`, category: '腰部', weaponType: null, level, price, effect: { hpMax: level * 4, magicDefense: level * 2 } },
    { code: `shop_lower_${level}`, name: `${prefix}护腿`, category: '下装', weaponType: null, level, price, effect: { physicalDefense: level * 3, magicDefense: level * 3 } },
    { code: `shop_feet_${level}`, name: `${prefix}长靴`, category: '脚部', weaponType: null, level, price, effect: { evasion: level * 2, speed: level } }
  ];
});

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
  `CREATE TABLE IF NOT EXISTS bot_group_channels (
    bot_id VARCHAR(64) NOT NULL, group_openid VARCHAR(128) NOT NULL, last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (bot_id,group_openid), KEY idx_bot_group_channels_seen (bot_id,last_seen_at)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_warrant_notice_cooldowns (
    notice_type ENUM('entry','passive_player','passive_group') NOT NULL, warrant_id BIGINT UNSIGNED NOT NULL,
    group_openid VARCHAR(128) NOT NULL DEFAULT '', recipient_qq_user_id VARCHAR(32) NOT NULL DEFAULT '',
    available_at DATETIME NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (notice_type,warrant_id,group_openid,recipient_qq_user_id), KEY idx_warrant_notice_available (available_at)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS admin_operation_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, operator_qq_user_id VARCHAR(32) NOT NULL, action_type VARCHAR(32) NOT NULL, action_text VARCHAR(255) NOT NULL,
    target_qq_user_id VARCHAR(32) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_admin_log_created (created_at,id), KEY idx_admin_log_operator (operator_qq_user_id,id), KEY idx_admin_log_action (action_type,id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS account_deletion_records (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, qq_user_id VARCHAR(32) NOT NULL, qq_nickname VARCHAR(128) NULL, character_name VARCHAR(24) NULL,
    snapshot_json JSON NOT NULL, deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    restored_at DATETIME NULL, restored_by_qq_user_id VARCHAR(32) NULL,
    PRIMARY KEY (id), KEY idx_deletion_record_deleted (deleted_at,id), KEY idx_deletion_record_player (qq_user_id,id), KEY idx_deletion_record_name (character_name,id), KEY idx_deletion_record_restored (restored_at,id)
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
    level INT UNSIGNED NOT NULL DEFAULT 1, experience BIGINT UNSIGNED NOT NULL DEFAULT 0, realm_stage TINYINT UNSIGNED NOT NULL DEFAULT 1, skill_points INT UNSIGNED NOT NULL DEFAULT 1, copper_coins BIGINT UNSIGNED NOT NULL DEFAULT 0,
    stamina SMALLINT UNSIGNED NOT NULL DEFAULT 120, stamina_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    constitution SMALLINT UNSIGNED NOT NULL, spirit SMALLINT UNSIGNED NOT NULL, strength SMALLINT UNSIGNED NOT NULL,
    intelligence SMALLINT UNSIGNED NOT NULL, agility SMALLINT UNSIGNED NOT NULL, perception SMALLINT UNSIGNED NOT NULL,
    constitution_growth DECIMAL(4,1) NOT NULL DEFAULT 0, spirit_growth DECIMAL(4,1) NOT NULL DEFAULT 0, strength_growth DECIMAL(4,1) NOT NULL DEFAULT 0,
    intelligence_growth DECIMAL(4,1) NOT NULL DEFAULT 0, agility_growth DECIMAL(4,1) NOT NULL DEFAULT 0, perception_growth DECIMAL(4,1) NOT NULL DEFAULT 0,
    adventurer_registered TINYINT(1) NOT NULL DEFAULT 0,
    adventurer_rank ENUM('F','E','D','C','B','A','S','SS','SSS') NOT NULL DEFAULT 'F', profession_code VARCHAR(32) NULL, secondary_profession_code VARCHAR(32) NULL,
    delete_confirmation_code CHAR(6) NULL, delete_confirmation_expires_at DATETIME NULL,
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
    description TEXT NOT NULL, obtain_source VARCHAR(128) NOT NULL DEFAULT '未知来源', item_type ENUM('consumable','material','equipment') NOT NULL DEFAULT 'material', item_category VARCHAR(32) NOT NULL DEFAULT '特殊', weapon_type VARCHAR(32) NULL, rarity ENUM('普通','优秀','精良','稀有','传说','史诗','神器') NOT NULL DEFAULT '普通', required_level SMALLINT UNSIGNED NOT NULL DEFAULT 1, codex_id CHAR(7) NULL,
    weight DECIMAL(8,2) NOT NULL DEFAULT 0, trade_price INT UNSIGNED NOT NULL DEFAULT 0, stack_limit INT UNSIGNED NOT NULL DEFAULT 99, stackable TINYINT(1) NOT NULL DEFAULT 1, is_tradeable TINYINT(1) NOT NULL DEFAULT 1,
    effect_json JSON NULL, PRIMARY KEY (id), UNIQUE KEY uk_item_code (code)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_item_instances (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL,
    quality DECIMAL(5,2) NOT NULL DEFAULT 0.00, durability INT UNSIGNED NOT NULL DEFAULT 100, durability_max INT UNSIGNED NOT NULL DEFAULT 100,
    effect_json JSON NULL, forge_primary_json JSON NULL, acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    character_id BIGINT UNSIGNED NOT NULL, slot ENUM('weapon','offhand','eye','shoulder','upper','waist','lower','feet','necklace','bracelet','ring') NOT NULL, item_id BIGINT UNSIGNED NOT NULL, instance_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (character_id, slot), UNIQUE KEY uk_equipment_item (character_id, item_id), UNIQUE KEY uk_equipment_instance (character_id, instance_id),
    CONSTRAINT fk_equipment_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_equipment_item FOREIGN KEY (item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_equipment_instance FOREIGN KEY (instance_id) REFERENCES player_item_instances(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_active_devices (
    character_id BIGINT UNSIGNED NOT NULL, instance_id BIGINT UNSIGNED NOT NULL, activated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,instance_id), UNIQUE KEY uk_active_device_instance (instance_id),
    CONSTRAINT fk_active_device_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_active_device_instance FOREIGN KEY (instance_id) REFERENCES player_item_instances(id) ON DELETE CASCADE
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
    title VARCHAR(96) NOT NULL DEFAULT '', content TEXT NOT NULL, status ENUM('editing','draft') NOT NULL DEFAULT 'editing',
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
    item_id BIGINT UNSIGNED NOT NULL, buy_price INT UNSIGNED NOT NULL, sell_price INT UNSIGNED NOT NULL DEFAULT 0, stock_capacity INT UNSIGNED NOT NULL DEFAULT 0, stock_quantity INT UNSIGNED NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_guild_shop_active (is_active,item_id),
    CONSTRAINT fk_guild_shop_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS blacksmith_shop_items (
    item_id BIGINT UNSIGNED NOT NULL, buy_price INT UNSIGNED NOT NULL, sell_price INT UNSIGNED NOT NULL DEFAULT 0, stock_capacity INT UNSIGNED NOT NULL DEFAULT 0, stock_quantity INT UNSIGNED NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_blacksmith_shop_active (is_active,item_id),
    CONSTRAINT fk_blacksmith_shop_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS alchemist_shop_items (
    item_id BIGINT UNSIGNED NOT NULL, shop_category VARCHAR(16) NOT NULL DEFAULT '回复', buy_price INT UNSIGNED NOT NULL, sell_price INT UNSIGNED NOT NULL DEFAULT 0, stock_capacity INT UNSIGNED NOT NULL DEFAULT 0, stock_quantity INT UNSIGNED NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_alchemist_shop_active (is_active,shop_category,item_id),
    CONSTRAINT fk_alchemist_shop_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS hunter_lodge_items (
    item_id BIGINT UNSIGNED NOT NULL, buy_price INT UNSIGNED NOT NULL, stock_capacity INT UNSIGNED NOT NULL DEFAULT 0, stock_quantity INT UNSIGNED NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_hunter_lodge_active (is_active,item_id),
    CONSTRAINT fk_hunter_lodge_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS bookshop_items (
    item_id BIGINT UNSIGNED NOT NULL, buy_price INT UNSIGNED NOT NULL, stock_capacity INT UNSIGNED NOT NULL DEFAULT 0, stock_quantity INT UNSIGNED NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_bookshop_active (is_active,item_id),
    CONSTRAINT fk_bookshop_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS oddworkshop_items (
    item_id BIGINT UNSIGNED NOT NULL, buy_price INT UNSIGNED NOT NULL, stock_capacity INT UNSIGNED NOT NULL DEFAULT 99, stock_quantity INT UNSIGNED NOT NULL DEFAULT 99, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_oddworkshop_shop_active (is_active,item_id),
    CONSTRAINT fk_oddworkshop_shop_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_warrants (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, wanted_character_id BIGINT UNSIGNED NOT NULL, city_region_id BIGINT UNSIGNED NOT NULL,
    status ENUM('active','captured','cleared') NOT NULL DEFAULT 'active', pursuit_defeats TINYINT UNSIGNED NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    captured_at DATETIME NULL, captured_by_character_id BIGINT UNSIGNED NULL, last_seen_at DATETIME NULL, last_seen_x INT NULL, last_seen_y INT NULL,
    PRIMARY KEY (id), KEY idx_warrant_character_city_status (wanted_character_id,city_region_id,status), KEY idx_warrant_city_status (city_region_id,status),
    CONSTRAINT fk_warrant_character FOREIGN KEY (wanted_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_warrant_city FOREIGN KEY (city_region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_warrant_victims (
    warrant_id BIGINT UNSIGNED NOT NULL, target_character_id BIGINT UNSIGNED NOT NULL, attacked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (warrant_id,target_character_id), KEY idx_warrant_victim_target (target_character_id),
    CONSTRAINT fk_warrant_victim_warrant FOREIGN KEY (warrant_id) REFERENCES player_warrants(id) ON DELETE CASCADE,
    CONSTRAINT fk_warrant_victim_target FOREIGN KEY (target_character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_adventurer_card_cache (
    character_id BIGINT UNSIGNED NOT NULL, fingerprint CHAR(64) NOT NULL, image_data LONGBLOB NOT NULL,
    generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id), KEY idx_adventurer_card_generated (generated_at),
    CONSTRAINT fk_adventurer_card_cache_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS city_pursuit_cooldowns (
    character_id BIGINT UNSIGNED NOT NULL, city_region_id BIGINT UNSIGNED NOT NULL, expires_at DATETIME NOT NULL,
    PRIMARY KEY (character_id,city_region_id), KEY idx_city_pursuit_cooldown_expiry (expires_at),
    CONSTRAINT fk_city_pursuit_cooldown_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_city_pursuit_cooldown_city FOREIGN KEY (city_region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS city_pursuit_tracks (
    character_id BIGINT UNSIGNED NOT NULL, city_region_id BIGINT UNSIGNED NOT NULL, warrant_id BIGINT UNSIGNED NOT NULL,
    officer_template_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (character_id,city_region_id), KEY idx_city_pursuit_track_warrant (warrant_id),
    CONSTRAINT fk_city_pursuit_track_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_city_pursuit_track_city FOREIGN KEY (city_region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS pvp_stolen_loot (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, original_owner_character_id BIGINT UNSIGNED NOT NULL, holder_character_id BIGINT UNSIGNED NOT NULL,
    item_id BIGINT UNSIGNED NULL, quantity INT UNSIGNED NOT NULL DEFAULT 0, held_quantity INT UNSIGNED NOT NULL DEFAULT 0, sold_quantity INT UNSIGNED NOT NULL DEFAULT 0,
    copper_amount BIGINT UNSIGNED NOT NULL DEFAULT 0, sale_copper_amount BIGINT UNSIGNED NOT NULL DEFAULT 0,
    acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, returned_at DATETIME NULL, restitution_id CHAR(36) NULL,
    restitution_charged_copper BIGINT UNSIGNED NOT NULL DEFAULT 0, restitution_debt_copper BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id), KEY idx_stolen_holder (holder_character_id,returned_at), KEY idx_stolen_owner (original_owner_character_id,returned_at),
    CONSTRAINT fk_stolen_owner FOREIGN KEY (original_owner_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_stolen_holder FOREIGN KEY (holder_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_stolen_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_city_debts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, debtor_character_id BIGINT UNSIGNED NOT NULL, original_owner_character_id BIGINT UNSIGNED NOT NULL,
    city_region_id BIGINT UNSIGNED NOT NULL, restitution_id CHAR(36) NOT NULL, amount_copper BIGINT UNSIGNED NOT NULL, paid_copper BIGINT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('active','settled') NOT NULL DEFAULT 'active', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, settled_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_city_debt_debtor (debtor_character_id,city_region_id,status), KEY idx_city_debt_restitution (restitution_id),
    CONSTRAINT fk_city_debt_debtor FOREIGN KEY (debtor_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_city_debt_owner FOREIGN KEY (original_owner_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_city_debt_region FOREIGN KEY (city_region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_warrant_rewards (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, warrant_id BIGINT UNSIGNED NOT NULL, issuer_character_id BIGINT UNSIGNED NOT NULL,
    reward_item_id BIGINT UNSIGNED NULL, quantity INT UNSIGNED NOT NULL DEFAULT 0, copper_amount BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, claimed_at DATETIME NULL, claimed_by_character_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (id), KEY idx_warrant_reward (warrant_id,claimed_at),
    CONSTRAINT fk_warrant_reward_warrant FOREIGN KEY (warrant_id) REFERENCES player_warrants(id) ON DELETE CASCADE,
    CONSTRAINT fk_warrant_reward_issuer FOREIGN KEY (issuer_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_warrant_reward_item FOREIGN KEY (reward_item_id) REFERENCES item_definitions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_pvp_attack_confirmations (
    attacker_character_id BIGINT UNSIGNED NOT NULL, target_character_id BIGINT UNSIGNED NOT NULL, expires_at DATETIME NOT NULL,
    PRIMARY KEY (attacker_character_id), KEY idx_pvp_confirmation_expiry (expires_at),
    CONSTRAINT fk_pvp_confirmation_attacker FOREIGN KEY (attacker_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_pvp_confirmation_target FOREIGN KEY (target_character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS hunter_lodge_daily_specials (
    special_date DATE NOT NULL, item_id BIGINT UNSIGNED NULL, discount_pct TINYINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (special_date), KEY idx_hunter_special_item (item_id),
    CONSTRAINT fk_hunter_special_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS guild_restaurant_menu (
    item_id BIGINT UNSIGNED NOT NULL, price INT UNSIGNED NOT NULL DEFAULT 0, processing_fee INT UNSIGNED NOT NULL DEFAULT 0, ingredients_json JSON NOT NULL, buff_json JSON NOT NULL, duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_guild_restaurant_active (is_active,item_id),
    CONSTRAINT fk_guild_restaurant_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_food_buffs (
    character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, buff_json JSON NOT NULL, expires_at DATETIME NOT NULL,
    PRIMARY KEY (character_id), KEY idx_food_buff_expires (expires_at),
    CONSTRAINT fk_food_buff_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_food_buff_item FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS blacksmith_refinement_materials (
    item_id BIGINT UNSIGNED NOT NULL, min_gain DECIMAL(5,2) NOT NULL, max_gain DECIMAL(5,2) NOT NULL,
    PRIMARY KEY (item_id), CONSTRAINT fk_refinement_material_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS blacksmith_fusion_material_effects (
    item_id BIGINT UNSIGNED NOT NULL, effect_json JSON NOT NULL, description VARCHAR(255) NOT NULL,
    PRIMARY KEY (item_id), CONSTRAINT fk_fusion_material_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS equipment_fusions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, instance_id BIGINT UNSIGNED NOT NULL, material_item_id BIGINT UNSIGNED NOT NULL, effect_json JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_equipment_fusions_instance (instance_id), CONSTRAINT fk_equipment_fusion_instance FOREIGN KEY (instance_id) REFERENCES player_item_instances(id) ON DELETE CASCADE,
    CONSTRAINT fk_equipment_fusion_material FOREIGN KEY (material_item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_forge_sessions (
    character_id BIGINT UNSIGNED NOT NULL, equipment_category VARCHAR(32) NULL, subtype VARCHAR(32) NULL, target_level SMALLINT UNSIGNED NULL,
    entry_source ENUM('blacksmith','profession') NOT NULL DEFAULT 'blacksmith',
    PRIMARY KEY (character_id), CONSTRAINT fk_forge_session_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_forge_materials (
    character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL,
    PRIMARY KEY (character_id,item_id), CONSTRAINT fk_forge_material_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_forge_material_item FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_alchemy_sessions (
    character_id BIGINT UNSIGNED NOT NULL, purification_item_id BIGINT UNSIGNED NULL, purification_quantity INT UNSIGNED NOT NULL DEFAULT 0,
    main_item_id BIGINT UNSIGNED NULL, auxiliary_item_id BIGINT UNSIGNED NULL, reagent_item_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_alchemy_session_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_alchemy_purification_item FOREIGN KEY (purification_item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_alchemy_main_item FOREIGN KEY (main_item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_alchemy_auxiliary_item FOREIGN KEY (auxiliary_item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_alchemy_reagent_item FOREIGN KEY (reagent_item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_alchemy_formulas (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, name VARCHAR(64) NOT NULL,
    main_item_id BIGINT UNSIGNED NOT NULL, auxiliary_item_id BIGINT UNSIGNED NULL, reagent_item_id BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_alchemy_formula_character_created (character_id,created_at),
    CONSTRAINT fk_alchemy_formula_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_alchemy_formula_main FOREIGN KEY (main_item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_alchemy_formula_auxiliary FOREIGN KEY (auxiliary_item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_alchemy_formula_reagent FOREIGN KEY (reagent_item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_secondary_professions (
    character_id BIGINT UNSIGNED NOT NULL, profession_code VARCHAR(32) NOT NULL, level SMALLINT UNSIGNED NOT NULL DEFAULT 1, proficiency BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id), CONSTRAINT fk_secondary_profession_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_side_quests (
    character_id BIGINT UNSIGNED NOT NULL, quest_code VARCHAR(64) NOT NULL, status ENUM('accepted','completed','claimed') NOT NULL DEFAULT 'accepted', accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME NULL, claimed_at DATETIME NULL,
    PRIMARY KEY (character_id,quest_code), CONSTRAINT fk_side_quest_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_dungeon_secret_progress (
    character_id BIGINT UNSIGNED NOT NULL, stage TINYINT UNSIGNED NOT NULL DEFAULT 0, dungeon_id BIGINT UNSIGNED NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id), KEY idx_dungeon_secret_dungeon (dungeon_id),
    CONSTRAINT fk_dungeon_secret_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_dungeon_entrance_marks (
    character_id BIGINT UNSIGNED NOT NULL, dungeon_id BIGINT UNSIGNED NOT NULL,
    region_id BIGINT UNSIGNED NOT NULL, pos_x INT NOT NULL, pos_y INT NOT NULL,
    discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,dungeon_id,region_id,pos_x,pos_y),
    CONSTRAINT fk_dungeon_mark_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_omniscient_quest_progress (
    character_id BIGINT UNSIGNED NOT NULL, slime_observed TINYINT(1) NOT NULL DEFAULT 0, wolf_king_observed TINYINT(1) NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id), CONSTRAINT fk_omniscient_quest_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_main_quest_progress (
    character_id BIGINT UNSIGNED NOT NULL, quest_code VARCHAR(64) NOT NULL, stage TINYINT UNSIGNED NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,quest_code), CONSTRAINT fk_main_quest_progress_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_npc_affinity (
    character_id BIGINT UNSIGNED NOT NULL, npc_code VARCHAR(64) NOT NULL, affinity INT UNSIGNED NOT NULL DEFAULT 0, daily_date DATE NOT NULL, daily_interactions TINYINT UNSIGNED NOT NULL DEFAULT 0,
    daily_chat_count TINYINT UNSIGNED NOT NULL DEFAULT 0, daily_buy_count TINYINT UNSIGNED NOT NULL DEFAULT 0, daily_sell_count TINYINT UNSIGNED NOT NULL DEFAULT 0, daily_craft_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,npc_code), KEY idx_npc_affinity_npc (npc_code,affinity), CONSTRAINT fk_npc_affinity_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
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
    handoff_kind VARCHAR(16) NULL, source_session_id CHAR(36) NULL, opponent_character_id BIGINT UNSIGNED NULL,
    delivery_scope VARCHAR(16) NULL, delivery_target_id VARCHAR(128) NULL, delivery_bot_id VARCHAR(128) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (spawn_id,character_id), KEY idx_ambush_character_status (character_id,status),
    CONSTRAINT fk_ambush_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_travels (
    character_id BIGINT UNSIGNED NOT NULL, region_id BIGINT UNSIGNED NOT NULL, target_x INT NOT NULL, target_y INT NOT NULL, target_z INT NOT NULL,
    activity_type ENUM('move','hunt') NOT NULL DEFAULT 'move',
    destination_kind ENUM('normal','home') NOT NULL DEFAULT 'normal',
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, arrival_at DATETIME NOT NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_travel_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_travel_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_movement_settings (
    character_id BIGINT UNSIGNED NOT NULL, movement_step TINYINT UNSIGNED NOT NULL DEFAULT 1, show_landmarks TINYINT(1) NOT NULL DEFAULT 1, show_players TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id), CONSTRAINT fk_movement_settings_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_hunt_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, spawn_id BIGINT UNSIGNED NOT NULL,
    found_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_hunt_history_character (character_id,id),
    CONSTRAINT fk_hunt_history_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS skill_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    category ENUM('physical','magic','utility','passive','bound','special') NOT NULL, damage_type VARCHAR(16) NOT NULL DEFAULT '无', skill_kind VARCHAR(16) NOT NULL DEFAULT '无', element VARCHAR(16) NOT NULL DEFAULT '无', range_type VARCHAR(16) NOT NULL DEFAULT '近战', codex_id CHAR(7) NULL,
    mana_cost INT UNSIGNED NOT NULL DEFAULT 0, cooldown_turns TINYINT UNSIGNED NOT NULL DEFAULT 0, chant_turns TINYINT UNSIGNED NOT NULL DEFAULT 0,
    power INT UNSIGNED NOT NULL DEFAULT 100, learn_cost TINYINT UNSIGNED NOT NULL DEFAULT 1, upgrade_cost TINYINT UNSIGNED NOT NULL DEFAULT 1,
    max_level TINYINT UNSIGNED NOT NULL DEFAULT 5, power_per_level INT UNSIGNED NOT NULL DEFAULT 15, cooldown_reduction_per_level TINYINT UNSIGNED NOT NULL DEFAULT 0,
    passive_effect_json JSON NULL, description TEXT NOT NULL, PRIMARY KEY (id), UNIQUE KEY uk_skill_code (code), UNIQUE KEY uk_skill_codex_id (codex_id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_skills (
    character_id BIGINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NOT NULL, level TINYINT UNSIGNED NOT NULL DEFAULT 1,
    quick_slot TINYINT UNSIGNED NULL, passive_linked TINYINT(1) NOT NULL DEFAULT 0, learned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (character_id, skill_id), UNIQUE KEY uk_quick_slot (character_id, quick_slot),
    CONSTRAINT fk_player_skill_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_player_skill_definition FOREIGN KEY (skill_id) REFERENCES skill_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_appraisal_progress (
    character_id BIGINT UNSIGNED NOT NULL, range_level TINYINT UNSIGNED NOT NULL DEFAULT 1, information_level TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id), CONSTRAINT fk_appraisal_progress_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_auto_battle_settings (
    character_id BIGINT UNSIGNED NOT NULL, enabled TINYINT(1) NOT NULL DEFAULT 0, default_encounter_action ENUM('battle','persuade') NOT NULL DEFAULT 'battle', auto_potion_enabled TINYINT(1) NOT NULL DEFAULT 0,
    hp_threshold TINYINT UNSIGNED NOT NULL DEFAULT 30, hp_item_id BIGINT UNSIGNED NULL, mp_threshold TINYINT UNSIGNED NOT NULL DEFAULT 30, mp_item_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_auto_battle_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_auto_battle_actions (
    character_id BIGINT UNSIGNED NOT NULL, sequence_no TINYINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (character_id,sequence_no), CONSTRAINT fk_auto_action_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_battle_buffs (
    character_id BIGINT UNSIGNED NOT NULL, buff_code VARCHAR(64) NOT NULL, remaining_battles TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (character_id,buff_code), CONSTRAINT fk_battle_buff_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_auto_battle_quick_setup (
    character_id BIGINT UNSIGNED NOT NULL, next_sequence TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id), CONSTRAINT fk_auto_quick_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_pvp_auto_battle_settings (
    character_id BIGINT UNSIGNED NOT NULL, enabled TINYINT(1) NOT NULL DEFAULT 0, auto_potion_enabled TINYINT(1) NOT NULL DEFAULT 0,
    hp_threshold TINYINT UNSIGNED NOT NULL DEFAULT 30, hp_item_id BIGINT UNSIGNED NULL, mp_threshold TINYINT UNSIGNED NOT NULL DEFAULT 30, mp_item_id BIGINT UNSIGNED NULL, action_cursor SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id), CONSTRAINT fk_pvp_auto_battle_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_pvp_auto_battle_actions (
    character_id BIGINT UNSIGNED NOT NULL, sequence_no TINYINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (character_id,sequence_no), CONSTRAINT fk_pvp_auto_action_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_pvp_auto_battle_quick_setup (
    character_id BIGINT UNSIGNED NOT NULL, next_sequence TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id), CONSTRAINT fk_pvp_auto_quick_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_pvp_battle_sessions (
    id CHAR(36) NOT NULL, attacker_character_id BIGINT UNSIGNED NOT NULL, defender_character_id BIGINT UNSIGNED NOT NULL,
    turn_no INT UNSIGNED NOT NULL DEFAULT 1, state ENUM('active','attacker_win','defender_win','escaped') NOT NULL DEFAULT 'active',
    attacker_hp INT UNSIGNED NOT NULL, attacker_mp INT UNSIGNED NOT NULL, defender_hp INT UNSIGNED NOT NULL, defender_mp INT UNSIGNED NOT NULL,
    attacker_cooldowns JSON NOT NULL, defender_cooldowns JSON NOT NULL,
    ambush_spawn_id BIGINT UNSIGNED NULL, ambush_delivery_scope VARCHAR(16) NULL, ambush_delivery_target_id VARCHAR(128) NULL, ambush_delivery_bot_id VARCHAR(128) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_pvp_battle_attacker (attacker_character_id,state), KEY idx_pvp_battle_defender (defender_character_id,state),
    CONSTRAINT fk_pvp_battle_attacker FOREIGN KEY (attacker_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_pvp_battle_defender FOREIGN KEY (defender_character_id) REFERENCES characters(id) ON DELETE CASCADE
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
  , `CREATE TABLE IF NOT EXISTS city_pursuit_officers (
    template_id BIGINT UNSIGNED NOT NULL, profession VARCHAR(32) NOT NULL, equipment_text VARCHAR(255) NOT NULL,
    PRIMARY KEY (template_id),
    CONSTRAINT fk_city_pursuit_officer_template FOREIGN KEY (template_id) REFERENCES monster_templates(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_monster_codex (
    character_id BIGINT UNSIGNED NOT NULL, monster_template_id BIGINT UNSIGNED NOT NULL, unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,monster_template_id), CONSTRAINT fk_monster_codex_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_monster_codex_template FOREIGN KEY (monster_template_id) REFERENCES monster_templates(id) ON DELETE CASCADE
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
    description TEXT NOT NULL, interaction_kind ENUM('npc','building') NOT NULL DEFAULT 'npc', pos_x INT NULL, pos_y INT NULL, pos_z INT NULL,
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
  , `CREATE TABLE IF NOT EXISTS dungeon_instances (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, entrance_region_id BIGINT UNSIGNED NOT NULL, entrance_x INT NOT NULL, entrance_y INT NOT NULL,
    origin_x INT NOT NULL, origin_y INT NOT NULL, state ENUM('active','cleared','closed') NOT NULL DEFAULT 'active',
    generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, cleared_at DATETIME NULL, refresh_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_dungeon_state_refresh (state,refresh_at), KEY idx_dungeon_entrance (entrance_region_id,entrance_x,entrance_y),
    CONSTRAINT fk_dungeon_entrance_region FOREIGN KEY (entrance_region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS dungeon_entrances (
    dungeon_id BIGINT UNSIGNED NOT NULL, region_id BIGINT UNSIGNED NOT NULL, pos_x INT NOT NULL, pos_y INT NOT NULL,
    PRIMARY KEY (dungeon_id,region_id,pos_x,pos_y), UNIQUE KEY uk_dungeon_entrance_location (region_id,pos_x,pos_y),
    CONSTRAINT fk_dungeon_entrance_instance FOREIGN KEY (dungeon_id) REFERENCES dungeon_instances(id) ON DELETE CASCADE,
    CONSTRAINT fk_dungeon_entrance_region_map FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS dungeon_cells (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, dungeon_id BIGINT UNSIGNED NOT NULL, pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL,
    cell_type ENUM('path','entrance','stairs_up','stairs_down','trap','chest','boss') NOT NULL DEFAULT 'path', trap_type VARCHAR(32) NULL, landmark_text TEXT NULL, chest_quality ENUM('青铜','白银','黄金') NULL, chest_opened TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id), UNIQUE KEY uk_dungeon_cell_position (dungeon_id,pos_x,pos_y,pos_z), KEY idx_dungeon_cell_position (pos_x,pos_y,pos_z),
    CONSTRAINT fk_dungeon_cell_instance FOREIGN KEY (dungeon_id) REFERENCES dungeon_instances(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS dungeon_monsters (
    dungeon_id BIGINT UNSIGNED NOT NULL, spawn_id BIGINT UNSIGNED NOT NULL, is_boss TINYINT(1) NOT NULL DEFAULT 0, is_floor_leader TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (dungeon_id,spawn_id), UNIQUE KEY uk_dungeon_monster_spawn (spawn_id), KEY idx_dungeon_boss (dungeon_id,is_boss),
    CONSTRAINT fk_dungeon_monster_instance FOREIGN KEY (dungeon_id) REFERENCES dungeon_instances(id) ON DELETE CASCADE,
    CONSTRAINT fk_dungeon_monster_spawn FOREIGN KEY (spawn_id) REFERENCES monster_spawns(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS dungeon_cell_triggers (
    cell_id BIGINT UNSIGNED NOT NULL, character_id BIGINT UNSIGNED NOT NULL, triggered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (cell_id,character_id), CONSTRAINT fk_dungeon_trigger_cell FOREIGN KEY (cell_id) REFERENCES dungeon_cells(id) ON DELETE CASCADE,
    CONSTRAINT fk_dungeon_trigger_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS map_resource_pools (
    region_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, spawn_density DECIMAL(8,5) NOT NULL,
    PRIMARY KEY (region_id,item_id),
    CONSTRAINT fk_resource_pool_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE,
    CONSTRAINT fk_resource_pool_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS resource_spawns (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, region_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL,
    pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL, spawned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, mined_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_resource_active_region (region_id,mined_at), KEY idx_resource_location (region_id,pos_x,pos_y,pos_z,mined_at),
    CONSTRAINT fk_resource_spawn_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE,
    CONSTRAINT fk_resource_spawn_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_resource_mining (
    character_id BIGINT UNSIGNED NOT NULL, resource_id BIGINT UNSIGNED NOT NULL, started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, finishes_at DATETIME NOT NULL,
    PRIMARY KEY (character_id), UNIQUE KEY uk_resource_mining_resource (resource_id), KEY idx_resource_mining_finish (finishes_at),
    CONSTRAINT fk_resource_mining_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_resource_mining_resource FOREIGN KEY (resource_id) REFERENCES resource_spawns(id) ON DELETE CASCADE
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
    selected_target_id BIGINT UNSIGNED NULL, pending_action JSON NULL, cooldowns JSON NOT NULL, stamina_eligible TINYINT(1) NOT NULL DEFAULT 1, is_defeated TINYINT(1) NOT NULL DEFAULT 0,
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
  , `CREATE TABLE IF NOT EXISTS player_skill_point_ledger (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, amount INT NOT NULL,
    change_kind VARCHAR(32) NOT NULL, skill_id BIGINT UNSIGNED NULL, detail VARCHAR(128) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_skill_point_ledger_character_created (character_id,created_at),
    CONSTRAINT fk_skill_point_ledger_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_skill_point_ledger_skill FOREIGN KEY (skill_id) REFERENCES skill_definitions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS encounter_escape_tokens (
    character_id BIGINT UNSIGNED NOT NULL, region_id BIGINT UNSIGNED NOT NULL, pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_escape_token_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS dungeon_encounter_retreats (
    character_id BIGINT UNSIGNED NOT NULL, encounter_region_id BIGINT UNSIGNED NOT NULL, encounter_x INT NOT NULL, encounter_y INT NOT NULL, encounter_z INT NOT NULL,
    retreat_region_id BIGINT UNSIGNED NOT NULL, retreat_x INT NOT NULL, retreat_y INT NOT NULL, retreat_z INT NOT NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_dungeon_retreat_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
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
    id CHAR(36) NOT NULL, name VARCHAR(32) NOT NULL DEFAULT '未命名队伍', leader_character_id BIGINT UNSIGNED NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_party_leader (leader_character_id), CONSTRAINT fk_party_leader FOREIGN KEY (leader_character_id) REFERENCES characters(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS party_members (
    party_id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (party_id, character_id), UNIQUE KEY uk_member_party (character_id),
    CONSTRAINT fk_party_member_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
    CONSTRAINT fk_party_member_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_homes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, town_region_id BIGINT UNSIGNED NOT NULL,
    plot_x INT NOT NULL, plot_y INT NOT NULL, plot_z INT NOT NULL DEFAULT 0, house_level TINYINT UNSIGNED NOT NULL DEFAULT 1,
    floor_count TINYINT UNSIGNED NOT NULL DEFAULT 1, status ENUM('active','demolished') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_home_character (character_id), KEY idx_home_plot (town_region_id,plot_x,plot_y,plot_z), KEY idx_home_town_status (town_region_id,status),
    CONSTRAINT fk_home_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_home_town FOREIGN KEY (town_region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_home_visits (
    character_id BIGINT UNSIGNED NOT NULL, home_id BIGINT UNSIGNED NOT NULL, entered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id), UNIQUE KEY uk_home_visit_home (home_id),
    CONSTRAINT fk_home_visit_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_home_visit_home FOREIGN KEY (home_id) REFERENCES player_homes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS home_furniture_definitions (
    code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL, description TEXT NOT NULL, effect_json JSON NOT NULL,
    required_house_level TINYINT UNSIGNED NOT NULL DEFAULT 1, max_per_floor TINYINT UNSIGNED NOT NULL DEFAULT 1,
    floor_slot_cost TINYINT UNSIGNED NOT NULL DEFAULT 1, grid_width TINYINT UNSIGNED NOT NULL DEFAULT 1, grid_height TINYINT UNSIGNED NOT NULL DEFAULT 1,
    placement_rule ENUM('wall','center','corner','wall_or_center') NOT NULL DEFAULT 'wall_or_center', layer_order SMALLINT NOT NULL DEFAULT 20,
    is_active TINYINT(1) NOT NULL DEFAULT 1, PRIMARY KEY (code)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS home_furniture_recipes (
    furniture_code VARCHAR(64) NOT NULL, item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL, PRIMARY KEY (furniture_code,item_id),
    CONSTRAINT fk_home_recipe_furniture FOREIGN KEY (furniture_code) REFERENCES home_furniture_definitions(code) ON DELETE CASCADE,
    CONSTRAINT fk_home_recipe_item FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_home_furniture (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, home_id BIGINT UNSIGNED NOT NULL, furniture_code VARCHAR(64) NOT NULL,
    floor_no TINYINT UNSIGNED NOT NULL DEFAULT 1, slot_key VARCHAR(32) NOT NULL, grid_x TINYINT UNSIGNED NULL, grid_y TINYINT UNSIGNED NULL,
    rotation SMALLINT UNSIGNED NOT NULL DEFAULT 0, layout_version SMALLINT UNSIGNED NOT NULL DEFAULT 2, placed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_home_furniture_slot (home_id,floor_no,slot_key), KEY idx_home_furniture_floor (home_id,floor_no,furniture_code),
    CONSTRAINT fk_home_furniture_home FOREIGN KEY (home_id) REFERENCES player_homes(id) ON DELETE CASCADE,
    CONSTRAINT fk_home_furniture_definition FOREIGN KEY (furniture_code) REFERENCES home_furniture_definitions(code)
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_home_furniture_cells (
    home_id BIGINT UNSIGNED NOT NULL, floor_no TINYINT UNSIGNED NOT NULL, grid_x TINYINT UNSIGNED NOT NULL, grid_y TINYINT UNSIGNED NOT NULL,
    furniture_id BIGINT UNSIGNED NOT NULL, PRIMARY KEY (home_id,floor_no,grid_x,grid_y), KEY idx_home_furniture_cell_instance (furniture_id),
    CONSTRAINT fk_home_cell_furniture FOREIGN KEY (furniture_id) REFERENCES player_home_furniture(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS player_home_floor_renders (
    home_id BIGINT UNSIGNED NOT NULL, floor_no TINYINT UNSIGNED NOT NULL, layout_hash CHAR(64) NOT NULL, image_path VARCHAR(255) NOT NULL,
    rendered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (home_id,floor_no),
    CONSTRAINT fk_home_render_home FOREIGN KEY (home_id) REFERENCES player_homes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
  , `CREATE TABLE IF NOT EXISTS home_shop_offers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, offer_code VARCHAR(64) NOT NULL, output_item_id BIGINT UNSIGNED NOT NULL,
    output_quantity INT UNSIGNED NOT NULL, input_item_id BIGINT UNSIGNED NULL, input_quantity INT UNSIGNED NOT NULL DEFAULT 0,
    copper_price BIGINT UNSIGNED NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1, sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id), UNIQUE KEY uk_home_offer_code (offer_code), KEY idx_home_offer_active (is_active,sort_order),
    CONSTRAINT fk_home_offer_output FOREIGN KEY (output_item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_home_offer_input FOREIGN KEY (input_item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
];

export const initializeSchema = async (pool: Pool) => {
  for (const statement of schemaStatements) await pool.query(statement);
  try { await pool.query("ALTER TABLE player_travels ADD COLUMN destination_kind ENUM('normal','home') NOT NULL DEFAULT 'normal' AFTER activity_type"); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  for (const column of [
    'grid_width TINYINT UNSIGNED NOT NULL DEFAULT 1',
    'grid_height TINYINT UNSIGNED NOT NULL DEFAULT 1',
    "placement_rule ENUM('wall','center','corner','wall_or_center') NOT NULL DEFAULT 'wall_or_center'",
    'layer_order SMALLINT NOT NULL DEFAULT 20'
  ]) {
    try { await pool.query(`ALTER TABLE home_furniture_definitions ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  for (const column of [
    'grid_x TINYINT UNSIGNED NULL',
    'grid_y TINYINT UNSIGNED NULL',
    'rotation SMALLINT UNSIGNED NOT NULL DEFAULT 0',
    'layout_version SMALLINT UNSIGNED NOT NULL DEFAULT 1'
  ]) {
    try { await pool.query(`ALTER TABLE player_home_furniture ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  await pool.query('ALTER TABLE player_home_furniture MODIFY COLUMN rotation SMALLINT UNSIGNED NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE player_home_furniture MODIFY COLUMN layout_version SMALLINT UNSIGNED NOT NULL DEFAULT 2');
  await pool.query(`INSERT IGNORE INTO dungeon_entrances (dungeon_id,region_id,pos_x,pos_y)
    SELECT id,entrance_region_id,entrance_x,entrance_y FROM dungeon_instances`);
  try { await pool.query('ALTER TABLE dungeon_cells ADD COLUMN landmark_text TEXT NULL AFTER trap_type'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query("ALTER TABLE dungeon_cells ADD COLUMN chest_quality ENUM('青铜','白银','黄金') NULL AFTER landmark_text"); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE dungeon_monsters ADD COLUMN is_floor_leader TINYINT(1) NOT NULL DEFAULT 0 AFTER is_boss'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE player_pvp_auto_battle_settings ADD COLUMN action_cursor SMALLINT UNSIGNED NOT NULL DEFAULT 1'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query("ALTER TABLE player_auto_battle_settings ADD COLUMN default_encounter_action ENUM('battle','persuade') NOT NULL DEFAULT 'battle' AFTER enabled"); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE player_movement_settings ADD COLUMN show_landmarks TINYINT(1) NOT NULL DEFAULT 1'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE player_movement_settings ADD COLUMN show_players TINYINT(1) NOT NULL DEFAULT 1'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  await pool.query(`UPDATE dungeon_monsters dm JOIN (
    SELECT * FROM (SELECT dm2.dungeon_id,MIN(dm2.spawn_id) AS spawn_id FROM dungeon_monsters dm2
      JOIN monster_spawns s2 ON s2.id=dm2.spawn_id WHERE dm2.is_boss=0 AND s2.pos_z=-10 GROUP BY dm2.dungeon_id) AS first_floor_leaders
  ) picked ON picked.dungeon_id=dm.dungeon_id AND picked.spawn_id=dm.spawn_id
    SET dm.is_floor_leader=1`);
  for (const table of ['guild_shop_items', 'blacksmith_shop_items', 'alchemist_shop_items', 'hunter_lodge_items', 'bookshop_items', 'oddworkshop_items']) {
    for (const column of ['stock_capacity INT UNSIGNED NOT NULL DEFAULT 0', 'stock_quantity INT UNSIGNED NOT NULL DEFAULT 0']) {
      try { await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
    }
  }
  try { await pool.query('ALTER TABLE combat_sessions DROP INDEX uk_active_character'); } catch (error: any) { if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw error; }
  try { await pool.query('ALTER TABLE combat_sessions ADD KEY idx_combat_character_state (character_id, state)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  try { await pool.query('ALTER TABLE combat_sessions ADD COLUMN opening_damage_bonus DECIMAL(4,2) NOT NULL DEFAULT 0'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE characters ADD COLUMN detained_until DATETIME NULL AFTER rest_started_at'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  for (const column of ['last_seen_at DATETIME NULL', 'last_seen_x INT NULL', 'last_seen_y INT NULL']) {
    try { await pool.query(`ALTER TABLE player_warrants ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  for (const column of ['held_quantity INT UNSIGNED NOT NULL DEFAULT 0 AFTER quantity', 'sold_quantity INT UNSIGNED NOT NULL DEFAULT 0 AFTER held_quantity', 'sale_copper_amount BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER copper_amount', 'restitution_id CHAR(36) NULL AFTER returned_at', 'restitution_charged_copper BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER restitution_id', 'restitution_debt_copper BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER restitution_charged_copper']) {
    try { await pool.query(`ALTER TABLE pvp_stolen_loot ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  await pool.query('UPDATE pvp_stolen_loot SET held_quantity=quantity WHERE item_id IS NOT NULL AND held_quantity=0 AND sold_quantity=0 AND returned_at IS NULL');
  await pool.query("ALTER TABLE characters MODIFY COLUMN activity_status ENUM('active','resting','unconscious','detained') NOT NULL DEFAULT 'active'");
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
  try { await pool.query('ALTER TABLE combat_members ADD COLUMN stamina_eligible TINYINT(1) NOT NULL DEFAULT 1 AFTER cooldowns'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  for (const column of ['constitution SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'spirit SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'strength SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'intelligence SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'agility SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'perception SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'constitution_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'spirit_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'strength_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'intelligence_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'agility_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'perception_growth DECIMAL(4,1) NOT NULL DEFAULT 0']) {
    try { await pool.query(`ALTER TABLE monster_templates ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  for (const column of ['hp_max INT UNSIGNED NOT NULL DEFAULT 0', 'attack INT UNSIGNED NOT NULL DEFAULT 0', 'defense INT UNSIGNED NOT NULL DEFAULT 0', 'speed INT UNSIGNED NOT NULL DEFAULT 0', 'charisma INT UNSIGNED NOT NULL DEFAULT 0']) {
    await pool.query(`ALTER TABLE monster_templates MODIFY COLUMN ${column}`);
  }
  await pool.query("ALTER TABLE registration_sessions MODIFY stage ENUM('story','audience','question','destination','danger','choice') NOT NULL DEFAULT 'story'");
  await pool.query("ALTER TABLE player_story_progress MODIFY COLUMN status ENUM('met','joined','declined','awaiting_arrival','arrival_story','guild_story','completed') NOT NULL DEFAULT 'met'");
  for (const column of ["adventurer_rank ENUM('F','E','D','C','B','A','S','SS','SSS') NOT NULL DEFAULT 'F'", 'profession_code VARCHAR(32) NULL', 'secondary_profession_code VARCHAR(32) NULL', 'copper_coins BIGINT UNSIGNED NOT NULL DEFAULT 0', 'delete_confirmation_code CHAR(6) NULL', 'delete_confirmation_expires_at DATETIME NULL']) {
    try { await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query("ALTER TABLE admin_mail_edits ADD COLUMN title VARCHAR(96) NOT NULL DEFAULT '' AFTER recipient_scope"); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE bounty_notices ADD COLUMN source_spawn_id BIGINT UNSIGNED NULL'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE player_warrants ADD COLUMN pursuit_defeats TINYINT UNSIGNED NOT NULL DEFAULT 0'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query("ALTER TABLE player_forge_sessions ADD COLUMN entry_source ENUM('blacksmith','profession') NOT NULL DEFAULT 'blacksmith'"); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE bounty_notices MODIFY COLUMN refresh_key VARCHAR(32) NOT NULL'); } catch (error: any) { if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error; }
  for (const column of [
    'ready_spawn_id BIGINT UNSIGNED NULL',
    'handoff_kind VARCHAR(16) NULL',
    'source_session_id CHAR(36) NULL',
    'opponent_character_id BIGINT UNSIGNED NULL',
    'delivery_scope VARCHAR(16) NULL',
    'delivery_target_id VARCHAR(128) NULL',
    'delivery_bot_id VARCHAR(128) NULL'
  ]) {
    try { await pool.query(`ALTER TABLE combat_ambushes ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  for (const column of ['ambush_spawn_id BIGINT UNSIGNED NULL', 'ambush_delivery_scope VARCHAR(16) NULL', 'ambush_delivery_target_id VARCHAR(128) NULL', 'ambush_delivery_bot_id VARCHAR(128) NULL']) {
    try { await pool.query(`ALTER TABLE player_pvp_battle_sessions ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  for (const column of ['element_mastery_json JSON NULL', 'element_resistance_json JSON NULL']) {
    try { await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
    try { await pool.query(`ALTER TABLE monster_templates ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  await pool.query("ALTER TABLE player_equipment MODIFY slot ENUM('weapon','offhand','eye','shoulder','upper','waist','lower','feet','necklace','bracelet','ring') NOT NULL");
  await pool.query('ALTER TABLE player_item_instances MODIFY quality DECIMAL(5,2) NOT NULL DEFAULT 0.00');
  try { await pool.query('ALTER TABLE player_item_instances ADD COLUMN forge_primary_json JSON NULL AFTER effect_json'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE player_equipment ADD COLUMN instance_id BIGINT UNSIGNED NULL'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  await pool.query(`UPDATE player_equipment pe JOIN (SELECT character_id,item_id,MIN(id) AS instance_id FROM player_item_instances GROUP BY character_id,item_id) ii ON ii.character_id=pe.character_id AND ii.item_id=pe.item_id SET pe.instance_id=ii.instance_id WHERE pe.instance_id IS NULL`);
  try { await pool.query('ALTER TABLE player_equipment ADD UNIQUE KEY uk_equipment_instance (character_id,instance_id)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  try { await pool.query('ALTER TABLE combat_status_effects DROP INDEX uk_combat_effect_target'); } catch (error: any) { if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw error; }
  try { await pool.query('ALTER TABLE combat_status_effects ADD KEY idx_combat_effect_target (session_id,target_kind,target_id,effect_id)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  for (const column of ['constitution_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'spirit_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'strength_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'intelligence_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'agility_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'perception_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'adventurer_registered TINYINT(1) NOT NULL DEFAULT 0', "gender VARCHAR(8) NOT NULL DEFAULT '未设定'", 'free_name_change_used TINYINT(1) NOT NULL DEFAULT 0', 'free_gender_change_used TINYINT(1) NOT NULL DEFAULT 0']) {
    try { await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  for (const column of ["item_category VARCHAR(32) NOT NULL DEFAULT '特殊'", "obtain_source VARCHAR(128) NOT NULL DEFAULT '未知来源'", "rarity ENUM('普通','优秀','精良','稀有','传说','史诗','神器') NOT NULL DEFAULT '普通'", 'required_level SMALLINT UNSIGNED NOT NULL DEFAULT 1', 'trade_price INT UNSIGNED NOT NULL DEFAULT 0', 'stackable TINYINT(1) NOT NULL DEFAULT 1', 'is_tradeable TINYINT(1) NOT NULL DEFAULT 1', 'codex_id CHAR(7) NULL']) {
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
  try { await pool.query('ALTER TABLE characters ADD COLUMN realm_stage TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER experience'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  for (const column of ['stamina SMALLINT UNSIGNED NOT NULL DEFAULT 120', 'stamina_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP']) {
    try { await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query('ALTER TABLE characters ADD COLUMN game_id BIGINT UNSIGNED NULL AFTER id'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE characters ADD UNIQUE KEY uk_characters_game_id (game_id)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  await pool.query('UPDATE characters SET game_id=10000000+id WHERE player_id IS NOT NULL AND game_id IS NULL');
  try { await pool.query("ALTER TABLE parties ADD COLUMN name VARCHAR(32) NOT NULL DEFAULT '未命名队伍' AFTER id"); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  await pool.query(`CREATE TABLE IF NOT EXISTS player_auto_battle_settings (character_id BIGINT UNSIGNED NOT NULL, enabled TINYINT(1) NOT NULL DEFAULT 0, default_encounter_action ENUM('battle','persuade') NOT NULL DEFAULT 'battle', auto_potion_enabled TINYINT(1) NOT NULL DEFAULT 0, hp_threshold TINYINT UNSIGNED NOT NULL DEFAULT 30, hp_item_id BIGINT UNSIGNED NULL, mp_threshold TINYINT UNSIGNED NOT NULL DEFAULT 30, mp_item_id BIGINT UNSIGNED NULL, PRIMARY KEY (character_id), CONSTRAINT fk_auto_battle_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS player_auto_battle_actions (character_id BIGINT UNSIGNED NOT NULL, sequence_no TINYINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NULL, PRIMARY KEY (character_id,sequence_no), CONSTRAINT fk_auto_action_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS player_auto_battle_quick_setup (character_id BIGINT UNSIGNED NOT NULL, next_sequence TINYINT UNSIGNED NOT NULL DEFAULT 1, PRIMARY KEY (character_id), CONSTRAINT fk_auto_quick_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`);
  await pool.query(`UPDATE player_auto_battle_settings settings LEFT JOIN player_story_progress story
    ON story.character_id=settings.character_id AND story.story_code='forest_guide' AND story.status='completed'
    SET settings.enabled=0 WHERE story.character_id IS NULL`);
  for (const column of ['learn_cost TINYINT UNSIGNED NOT NULL DEFAULT 1', 'upgrade_cost TINYINT UNSIGNED NOT NULL DEFAULT 1', 'max_level TINYINT UNSIGNED NOT NULL DEFAULT 5', 'power_per_level INT UNSIGNED NOT NULL DEFAULT 15', 'cooldown_reduction_per_level TINYINT UNSIGNED NOT NULL DEFAULT 0']) {
    try { await pool.query(`ALTER TABLE skill_definitions ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query('ALTER TABLE skill_definitions ADD COLUMN passive_effect_json JSON NULL'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  await pool.query("ALTER TABLE skill_definitions MODIFY COLUMN category ENUM('physical','magic','utility','passive','bound','special') NOT NULL");
  try { await pool.query('ALTER TABLE player_skills ADD COLUMN learned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE player_skills ADD COLUMN passive_linked TINYINT(1) NOT NULL DEFAULT 0 AFTER quick_slot'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  for (const column of ['daily_chat_count TINYINT UNSIGNED NOT NULL DEFAULT 0', 'daily_buy_count TINYINT UNSIGNED NOT NULL DEFAULT 0', 'daily_sell_count TINYINT UNSIGNED NOT NULL DEFAULT 0', 'daily_craft_count TINYINT UNSIGNED NOT NULL DEFAULT 0']) {
    try { await pool.query(`ALTER TABLE player_npc_affinity ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query('ALTER TABLE skill_definitions ADD UNIQUE KEY uk_skill_codex_id (codex_id)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  for (const column of ['weakness_json JSON NULL', 'resistance_json JSON NULL']) {
    try { await pool.query(`ALTER TABLE monster_templates ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query('ALTER TABLE player_inventory ADD COLUMN acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  for (const column of ['processing_fee INT UNSIGNED NOT NULL DEFAULT 0', 'ingredients_json JSON NULL', 'buff_json JSON NULL', 'duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30']) {
    try { await pool.query(`ALTER TABLE guild_restaurant_menu ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query('ALTER TABLE player_story_progress ADD COLUMN stage TINYINT UNSIGNED NOT NULL DEFAULT 1'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE characters MODIFY COLUMN player_id BIGINT UNSIGNED NULL'); } catch (error: any) { if (error?.code !== 'ER_FK_INCOMPATIBLE_COLUMNS') throw error; }
  try { await pool.query('ALTER TABLE characters ADD COLUMN npc_id BIGINT UNSIGNED NULL'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE characters ADD COLUMN npc_code VARCHAR(64) NULL'); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.query('ALTER TABLE characters ADD UNIQUE KEY uk_characters_npc_id (npc_id)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  try { await pool.query('ALTER TABLE characters ADD UNIQUE KEY uk_characters_npc_code (npc_code)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  await pool.query(`UPDATE characters c JOIN players p ON p.id=c.player_id SET c.player_id=NULL,c.npc_id=CASE p.qq_user_id WHEN 'npc_forest_warrior' THEN 900000001 WHEN 'npc_forest_mage' THEN 900000002 WHEN 'npc_forest_priest' THEN 900000003 END,c.npc_code=p.qq_user_id WHERE p.qq_user_id IN ('npc_forest_warrior','npc_forest_mage','npc_forest_priest')`);
  await pool.query(`DELETE FROM players WHERE qq_user_id IN ('npc_forest_warrior','npc_forest_mage','npc_forest_priest')`);
  await pool.query(`UPDATE item_definitions SET item_category=CASE code WHEN 'holy_sword_shirulu' THEN '武器' WHEN 'demon_sword_aphia' THEN '武器' WHEN 'healing_herb' THEN '药剂' WHEN 'wolf_fang' THEN '怪材' ELSE item_category END, stackable=CASE WHEN item_type='equipment' THEN 0 ELSE 1 END`);
  await pool.query("UPDATE item_definitions SET item_category='怪材' WHERE item_category IN ('兽材','精兽材')");
  try { await pool.query("ALTER TABLE map_npcs ADD COLUMN interaction_kind ENUM('npc','building') NOT NULL DEFAULT 'npc' AFTER description"); }
  catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  await pool.query(`UPDATE item_definitions SET is_tradeable=0 WHERE item_category IN ('地图','特殊','任务','剧情') OR code='adventurer_card'`);
  await pool.query(`UPDATE item_definitions SET weapon_type=CASE code
    WHEN 'holy_sword_shirulu' THEN '长剑' WHEN 'demon_sword_aphia' THEN '长剑' WHEN 'saint_staff_istaria' THEN '法杖' WHEN 'death_dagger_azra' THEN '匕首' WHEN 'godfist_chronos' THEN '拳刃' WHEN 'oracle_grimoire_sophia' THEN '法书' WHEN 'prayer_orb_lumia' THEN '法球' WHEN 'immortal_shield_auges' THEN '盾牌' ELSE weapon_type END`);
  // 兼容旧版熔铸：旧逻辑会把神器标识字符串 Number 化后写成 null，导致战斗与详情丢失原有效果。
  // 神器标识只来自定义表，且熔铸材料不会修改它，启动时安全补回即可恢复已受影响的装备实例。
  await pool.query(`UPDATE player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    SET ii.effect_json=JSON_SET(ii.effect_json,'$.artifact',JSON_EXTRACT(i.effect_json,'$.artifact'))
    WHERE ii.effect_json IS NOT NULL
      AND JSON_EXTRACT(i.effect_json,'$.artifact') IS NOT NULL
      AND (JSON_EXTRACT(ii.effect_json,'$.artifact') IS NULL OR JSON_TYPE(JSON_EXTRACT(ii.effect_json,'$.artifact'))<>'STRING')`);
  await pool.query(`UPDATE item_definitions SET codex_id=CONCAT(CASE WHEN item_type='equipment' THEN CASE item_category WHEN '武器' THEN '11' WHEN '副手' THEN '12' WHEN '头部' THEN '13' WHEN '头肩' THEN '13' WHEN '上装' THEN '14' WHEN '腰部' THEN '15' WHEN '下装' THEN '16' WHEN '脚部' THEN '17' WHEN '项链' THEN '18' WHEN '手镯' THEN '19' WHEN '戒指' THEN '10' ELSE '19' END WHEN item_type='consumable' THEN CASE item_category WHEN '药剂' THEN '21' WHEN '食物' THEN '22' ELSE '23' END WHEN item_type='material' THEN CASE item_category WHEN '食材' THEN '31' WHEN '草药' THEN '32' ELSE '39' END ELSE '99' END, LPAD(id,5,'0')) WHERE codex_id IS NULL`);
  await pool.query(`INSERT INTO profession_definitions (code,name,description,growth_json,skill_codes_json) VALUES
    ('warrior','战士','以长剑与盾牌守住前线的职业。',JSON_OBJECT('constitution',1.2,'strength',1.2),JSON_ARRAY('longsword_mastery','shield_mastery')),
    ('mage','法师','以法杖与法书编织术式的职业。',JSON_OBJECT('spirit',1.2,'intelligence',1.2),JSON_ARRAY('staff_mastery','spellbook_mastery')),
    ('rogue','盗贼','以匕首与拳刃撕开破绽的职业。',JSON_OBJECT('agility',1.2,'perception',1.2),JSON_ARRAY('dagger_mastery','fistblade_mastery')),
    ('priest','牧师','以法书与法球守望同伴的职业。',JSON_OBJECT('constitution',1.2,'spirit',1.2),JSON_ARRAY('spellbook_mastery','orb_mastery'))
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),growth_json=VALUES(growth_json),skill_codes_json=VALUES(skill_codes_json)`);
  // 旧版本已转职角色曾写入 +2 成长；此迁移只执行一次，将既有加成同步为 +1.2。
  await pool.query('CREATE TABLE IF NOT EXISTS game_data_migrations (code VARCHAR(64) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
  // 入口标记必须对应到具体大门坐标。旧版只按迷宫实例记录，导致发现一扇门后地图会把同一迷宫的所有门都标出来。
  for (const column of ['region_id BIGINT UNSIGNED NULL AFTER dungeon_id', 'pos_x INT NULL AFTER region_id', 'pos_y INT NULL AFTER pos_x']) {
    try { await pool.query(`ALTER TABLE player_dungeon_entrance_marks ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  for (const column of ['element_base_mastery_json JSON NULL', 'element_base_resistance_json JSON NULL']) {
    try { await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`); } catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  const [entranceMarkMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('dungeon_entrance_marks_per_gate_v1')") as unknown as [{ affectedRows: number }];
  if (Number(entranceMarkMigration.affectedRows) > 0) {
    await pool.query(`UPDATE player_dungeon_entrance_marks m JOIN dungeon_instances d ON d.id=m.dungeon_id
      SET m.region_id=d.entrance_region_id,m.pos_x=d.entrance_x,m.pos_y=d.entrance_y
      WHERE m.region_id IS NULL OR m.pos_x IS NULL OR m.pos_y IS NULL`);
    await pool.query('ALTER TABLE player_dungeon_entrance_marks DROP PRIMARY KEY, ADD PRIMARY KEY (character_id,dungeon_id,region_id,pos_x,pos_y)');
    await pool.query('ALTER TABLE player_dungeon_entrance_marks MODIFY COLUMN region_id BIGINT UNSIGNED NOT NULL, MODIFY COLUMN pos_x INT NOT NULL, MODIFY COLUMN pos_y INT NOT NULL');
  }
  const [growthMigration] = await pool.query('INSERT IGNORE INTO game_data_migrations (code) VALUES (\'profession_growth_2_to_1_2\')') as unknown as [{ affectedRows: number }];
  if (Number(growthMigration.affectedRows) > 0) {
    await pool.query(`UPDATE characters SET
      constitution_growth=constitution_growth-IF(profession_code IN ('warrior','priest'),0.8,0),
      spirit_growth=spirit_growth-IF(profession_code IN ('mage','priest'),0.8,0),
      strength_growth=strength_growth-IF(profession_code='warrior',0.8,0),
      intelligence_growth=intelligence_growth-IF(profession_code='mage',0.8,0),
      agility_growth=agility_growth-IF(profession_code='rogue',0.8,0),
      perception_growth=perception_growth-IF(profession_code='rogue',0.8,0)
      WHERE profession_code IN ('warrior','mage','rogue','priest')`);
    const { recalculateCharacterStats } = await import('../game/character.service');
    const [characters] = await pool.query('SELECT id FROM characters WHERE profession_code IN (\'warrior\',\'mage\',\'rogue\',\'priest\')') as unknown as [[{ id: number }]];
    for (const character of characters) await recalculateCharacterStats(pool, Number(character.id));
  }
  try { await pool.query('ALTER TABLE item_definitions ADD UNIQUE KEY uk_item_codex_id (codex_id)'); } catch (error: any) { if (error?.code !== 'ER_DUP_KEYNAME') throw error; }
  // 锻材改名迁移：物品 ID 保持不变，已有背包、打造和精炼记录无需搬运。
  await pool.query(`UPDATE item_definitions SET code='meteor_iron',name='陨铁',description='自天外坠落的沉重铁矿，杂质极少，适合打造玄铁装备。',obtain_source='幽暗密林矿脉开采'
    WHERE code='refined_iron' AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM item_definitions WHERE code='meteor_iron') AS existing)`);
  await pool.execute(
    `INSERT INTO map_regions (code, name, description, min_x, max_x, min_y, max_y, min_z, max_z, is_spawn_enabled, danger_level)
     VALUES
       ('world_tree', '世界树', '世界的中心，占据约 20×20 格。', -10, 9, -10, 9, 0, 0, 0, 0),
       ('dark_forest', '幽暗密林', '世界树正下方、常年被薄雾笼罩的约 100×100 格密林。', -50, 49, -110, -11, 0, 0, 1, 1),
       ('dark_forest_deep', '幽暗密林深处', '与幽暗密林南端相连的深林，古木遮天，路途更为险峻。', -50, 49, -210, -111, 0, 0, 1, 2),
       ('dark_forest_dungeon', '地下迷宫', '位于幽暗密林地下、不断重构的三层迷宫。墙壁与道路会随最终守卫的陨落而改变。', 0, 9999, 0, 24, -30, -10, 0, 30),
       ('baina_town', '百纳镇', '百族汇纳、诸族共居的边境小镇，横跨幽暗密林与幽暗密林深处的交界。', -25, 24, -135, -86, 0, 0, 0, 99)
     ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), min_x = VALUES(min_x), max_x = VALUES(max_x), min_y = VALUES(min_y), max_y = VALUES(max_y), min_z = VALUES(min_z), max_z = VALUES(max_z), is_spawn_enabled = VALUES(is_spawn_enabled), danger_level = VALUES(danger_level)`
  );
  // 城镇覆盖两张密林地图的交界带；迁移时清除旧边界遗留在城镇区域内的野怪，避免出现不可见目标。
  const [geometryMigration] = await pool.query('INSERT IGNORE INTO game_data_migrations (code) VALUES (\'baina_forest_intersection_v1\')') as unknown as [{ affectedRows: number }];
  if (Number(geometryMigration.affectedRows) > 0) {
    await pool.query(`UPDATE monster_spawns s JOIN map_regions r ON r.id=s.region_id JOIN map_regions town ON town.code='baina_town'
      SET s.current_hp=0,s.defeated_at=NOW()
      WHERE r.code IN ('dark_forest','dark_forest_deep') AND s.defeated_at IS NULL
        AND s.pos_x BETWEEN town.min_x AND town.max_x AND s.pos_y BETWEEN town.min_y AND town.max_y AND s.pos_z BETWEEN town.min_z AND town.max_z`);
    await pool.query(`UPDATE characters c JOIN map_regions town ON town.code='baina_town'
      SET c.current_region_id=town.id
      WHERE c.pos_x BETWEEN town.min_x AND town.max_x AND c.pos_y BETWEEN town.min_y AND town.max_y AND c.pos_z BETWEEN town.min_z AND town.max_z`);
  }
  await pool.query(`INSERT INTO item_definitions (code, name, description, obtain_source, item_type, item_category, weight, stackable, effect_json) VALUES
    ('healing_herb', '微光草药', '恢复 30 点生命。', '野外采集与探索发现', 'consumable', '药剂', 0.20, 1, JSON_OBJECT('heal', 30)),
    ('glimmer_potion', '微光药水', '由炼金师提纯制成，恢复 150 点生命。', '糖水屋·炼金师入门', 'consumable', '药剂', 0.25, 1, JSON_OBJECT('heal', 150)),
    ('sky_dust', '天空粉尘', '源自大陆创始的奇异尘埃，纹络间仿佛映着无垠天穹。', '幽影狼王掉落', 'material', '特殊', 0.01, 1, JSON_OBJECT('worldInsight', true)),
    ('xiaobei_gift', '小北的赠礼', '漠北亲手打磨的小巧护符，边缘还残留着炉火的温度。', '副职业·锻造师转职', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('npcGift','xiaobei')),
    ('qinger_gift', '晴儿的赠礼', '晴儿调配的澄澈小瓶，散发着让人安定的草木香。', '副职业·炼金师转职', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('npcGift','qinger')),
    ('xiaowei_gift', '唯薇安的赠礼', '唯薇安亲手拼出的奇巧小匣，轻晃时会传出细微的齿轮声。', '副职业·解构师转职', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('npcGift','xiaowei')),
    ('luowen_gift', '洛文的赠礼', '夹着泛黄批注的旧书签，字迹严谨而温和。', '副职业·全知者转职', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('npcGift','luowen')),
    ('wolf_fang', '幽狼之牙', '可出售的普通材料。', '野外怪物掉落', 'material', '怪材', 0.15, 1, NULL),
    ('beast_meat', '兽肉', '新鲜的野兽肉，可作为烹饪食材。', '幽暗密林怪物掉落', 'material', '怪材', 0.30, 1, NULL),
    ('beast_bone', '兽骨', '坚硬完整的兽骨，常用于制作与加工。', '幽暗密林怪物掉落', 'material', '怪材', 0.25, 1, NULL),
    ('beast_hide', '兽皮', '处理后可制成皮革的普通兽皮。', '幽暗密林怪物掉落', 'material', '怪材', 0.20, 1, NULL),
    ('beast_tendon', '兽筋', '韧性十足的兽筋，是常见的强化素材。', '幽暗密林怪物掉落', 'material', '怪材', 0.10, 1, NULL),
    ('beast_core', '兽核', '凝聚着微弱魔力的兽类核心。', '幽暗密林怪物掉落', 'material', '怪材', 0.08, 1, NULL),
    ('magic_wool', '魔力绒毛', '带有柔和魔力的兔类绒毛。', '兔类怪物掉落', 'material', '怪材', 0.05, 1, NULL),
    ('magic_tusk', '魔力獠牙', '蕴藏野性魔力的锋利獠牙。', '猪类怪物掉落', 'material', '怪材', 0.08, 1, NULL),
    ('magic_scale', '魔力鳞片', '带有自然魔力的蛇类鳞片。', '蛇类怪物掉落', 'material', '怪材', 0.05, 1, NULL),
    ('magic_claw', '魔力利爪', '由熊类巨爪凝成的锋利素材。', '熊类怪物掉落', 'material', '怪材', 0.10, 1, NULL),
    ('magic_heartcore', '魔力心核', '狼类魔力在心脏处凝聚而成的核心。', '狼类怪物掉落', 'material', '怪材', 0.08, 1, NULL),
    ('refined_beast_bone', '兽骨（精）', '经炼金提纯的致密兽骨，适合作为高品质锻造素材。', '炼金师提纯', 'material', '怪材', 0.12, 1, NULL),
    ('refined_beast_hide', '兽皮（精）', '经炼金提纯的柔韧兽皮，蕴含更稳定的护持力量。', '炼金师提纯', 'material', '怪材', 0.10, 1, NULL),
    ('refined_beast_tendon', '兽筋（精）', '经炼金提纯的坚韧兽筋，能将力量传递得更加流畅。', '炼金师提纯', 'material', '怪材', 0.06, 1, NULL),
    ('refined_beast_core', '兽核（精）', '经炼金提纯的兽核，内部魔力更为纯净。', '炼金师提纯', 'material', '怪材', 0.05, 1, NULL),
    ('refined_magic_wool', '魔力绒毛（精）', '提纯后的魔力绒毛，轻盈而富有灵性。', '炼金师提纯', 'material', '怪材', 0.03, 1, NULL),
    ('refined_magic_tusk', '魔力獠牙（精）', '提纯后的魔力獠牙，锋芒与野性被完整保留。', '炼金师提纯', 'material', '怪材', 0.05, 1, NULL),
    ('refined_magic_scale', '魔力鳞片（精）', '提纯后的魔力鳞片，表面流转着稳定的术式纹路。', '炼金师提纯', 'material', '怪材', 0.03, 1, NULL),
    ('refined_magic_claw', '魔力利爪（精）', '提纯后的魔力利爪，锐利且蕴含强烈战意。', '炼金师提纯', 'material', '怪材', 0.05, 1, NULL),
    ('refined_magic_heartcore', '魔力心核（精）', '提纯后的魔力心核，搏动间仍有幽影般的魔力回响。', '炼金师提纯', 'material', '怪材', 0.04, 1, NULL),
    ('home_wood', '木材', '适用于扩建房屋和打造家具的基础建材。', '百纳居购买与兑换', 'material', '建材', 0.20, 1, NULL),
    ('home_stone', '石料', '经过筛选的坚固石料，可用于加固房屋。', '百纳居购买与兑换', 'material', '建材', 0.35, 1, NULL),
    ('home_metal', '金属', '可用于制作耐用家具与房屋构件的金属。', '百纳居购买与兑换', 'material', '建材', 0.30, 1, NULL),
    ('slime_gel', '史莱姆凝胶', '从史莱姆身上收集的弹性凝胶，是制作奇妙家具的怪物材料。', '各类史莱姆怪物掉落', 'material', '怪材', 0.10, 1, NULL),
    ('blood_residue', '血肉残渣', '从兽材结构中拆出的血肉粒子，是生命药剂的基础主材。', '解构师分解', 'material', '粒子', 0.10, 1, NULL),
    ('energy_ember', '能量余烬', '从兽材魔力结构中析出的微弱能量粒子，是魔力药剂的基础主材。', '解构师分解', 'material', '粒子', 0.08, 1, NULL),
    ('magic_unit', '魔力微弧', '高级兽材分解后偶得的稳定魔力微弧，可用于调制秘药。', '解构师分解', 'material', '粒子', 0.05, 1, NULL),
    ('wood_element_dust', '木元素粉尘', '活木解构后逸散出的木元素微粒，带着草木清香。', '锻材解构', 'material', '元素尘', 0.03, 1, NULL),
    ('metal_element_dust', '金元素粉尘', '金属锻材解构后析出的金元素微粒，闪着冷冽光泽。', '锻材解构', 'material', '元素尘', 0.03, 1, NULL),
    ('water_element_dust', '水元素粉尘', '星铜中游离出的水元素微粒，如晨露般清澈。', '锻材解构', 'material', '元素尘', 0.03, 1, NULL),
    ('ice_element_dust', '冰元素粉尘', '月银中沉淀的冰元素微粒，触之微寒。', '锻材解构', 'material', '元素尘', 0.03, 1, NULL),
    ('dark_element_dust', '暗元素粉尘', '月银阴影面析出的暗元素微粒，吞没周围的微光。', '锻材解构', 'material', '元素尘', 0.03, 1, NULL),
    ('fire_element_dust', '火元素粉尘', '曜金中跃动的火元素微粒，隐隐传来灼热。', '锻材解构', 'material', '元素尘', 0.03, 1, NULL),
    ('thunder_element_dust', '雷元素粉尘', '曜金中闪烁的雷元素微粒，偶有细微鸣响。', '锻材解构', 'material', '元素尘', 0.03, 1, NULL),
    ('light_element_dust', '光元素粉尘', '曜金辉芒中剥离的光元素微粒，温和而明亮。', '锻材解构', 'material', '元素尘', 0.03, 1, NULL),
    ('magic_gear', '魔力齿轮', '以金元素粉尘与魔力微弧构成的稳定传动基材。', '解构师构造', 'material', '基材', 0.30, 1, NULL),
    ('energy_core', '能量中枢', '将余烬与元素微粒压缩而成的持续供能基材。', '解构师构造', 'material', '基材', 0.45, 1, NULL),
    ('flesh_atrium', '血肉心房', '模拟生物循环结构制成的活性基材，会随魔力脉动轻轻收缩。', '解构师构造', 'material', '基材', 0.50, 1, NULL),
    ('flame_matrix', '炽焰矩阵', '将火元素规整为稳定热源的基础基材。', '解构师构造', 'material', '基材', 0.20, 1, NULL),
    ('frost_prism', '凝霜棱晶', '将冰与水元素折射为稳定冷却回路的基材。', '解构师构造', 'material', '基材', 0.15, 1, NULL),
    ('shadow_filament', '暗影导丝', '由暗元素编织而成、能传递细微魔力信号的基材。', '解构师构造', 'material', '基材', 0.05, 1, NULL),
    ('luminous_lens', '光导晶片', '将光元素收束为清晰视界的透明基材。', '解构师构造', 'material', '基材', 0.08, 1, NULL),
    ('interference_shell', '阻扰外壳', '隔离外部魔力扰动、保护内部组件的异械构件。', '解构师构造', 'material', '构件', 0.80, 1, NULL),
    ('low_power_standard_lens', '低倍标准镜', '提供基础视距与对焦能力的标准光学构件。', '解构师构造', 'material', '构件', 0.30, 1, NULL),
    ('calibration_module', '校准模块', '负责修正视线偏差与锁定轨迹的精密构件。', '解构师构造', 'material', '构件', 0.25, 1, NULL),
    ('mana_power_source', '魔力源能', '向异械稳定输送魔力的供能构件。', '解构师构造', 'material', '构件', 0.45, 1, NULL),
    ('kinetic_frame', '动能骨架', '将力量与动作稳定传导的强化构件。', '解构师构造', 'material', '构件', 0.55, 1, NULL),
    ('pulse_regulator', '脉冲调节器', '以循环脉冲校准器械响应的精密构件。', '解构师构造', 'material', '构件', 0.40, 1, NULL),
    ('palm_weave', '掌心织片', '能贴合掌心起伏、传递细微动作的柔性构件。', '解构师构造', 'material', '构件', 0.18, 1, NULL),
    ('finger_actuator', '指节驱动器', '嵌入指节位置的微型传动构件，可让动作更迅疾地传达。', '解构师构造', 'material', '构件', 0.22, 1, NULL),
    ('force_feedback_ring', '力反馈环', '回传出力变化的环形构件，用于细微调整发力节奏。', '解构师构造', 'material', '构件', 0.16, 1, NULL),
    ('pressure_buckle', '压感扣具', '能辨识握力与接触变化的扣具，适合装配在手部异械上。', '解构师构造', 'material', '构件', 0.14, 1, NULL),
    ('auxiliary_aiming_scope_blueprint', '辅助瞄准镜图纸', '记录辅助瞄准镜完整构造回路的图纸；持有时可使其构造成功率达到 100%。', '后续任务与探索获取', 'consumable', '图纸', 0.01, 1, JSON_OBJECT('constructionBlueprint','auxiliary_aiming_scope')),
    ('muscle_pacer_blueprint', '肌肉起搏器图纸', '记录肌肉起搏器完整构造回路的图纸；持有时可使其构造成功率达到 100%。', '后续任务与探索获取', 'consumable', '图纸', 0.01, 1, JSON_OBJECT('constructionBlueprint','muscle_pacer')),
    ('critical_glove_blueprint', '刻薄手套图纸', '记录刻薄手套完整构造回路的图纸；持有时可使其构造成功率达到 100%。', '后续任务与探索获取', 'consumable', '图纸', 0.01, 1, JSON_OBJECT('constructionBlueprint','critical_glove')),
    ('mana_accumulator_blueprint', '魔力积蓄仪图纸', '记录魔力积蓄仪完整构造回路的图纸；持有时可使其构造成功率达到 100%。', '后续任务与探索获取', 'consumable', '图纸', 0.01, 1, JSON_OBJECT('constructionBlueprint','mana_accumulator')),
    ('auxiliary_aiming_scope', '辅助瞄准镜', '会自行校准视线的魔导目镜；作为异械生效后，实际命中率提高 8%。', '解构师构造', 'equipment', '异械', 0.20, 0, JSON_OBJECT('actualHitRatePct',8)),
    ('muscle_pacer', '肌肉起搏器', '以脉冲刺激肌肉反应的中等难度异械；物理攻击的实际命中率降低 6%，物理技能威力提高 6%。', '解构师构造', 'equipment', '异械', 0.65, 0, JSON_OBJECT('physicalActualHitRatePct',-6,'physicalSkillDamagePct',6)),
    ('critical_glove', '刻薄手套', '以反射构件锁定攻击节奏的中上难度异械；物理攻击必定暴击，但物理攻击暴击的最终伤害降低 50%。', '解构师构造', 'equipment', '异械', 0.40, 0, JSON_OBJECT('physicalForceCrit',true,'physicalCriticalFinalDamagePct',-50)),
    ('mana_accumulator', '魔力积蓄仪', '以多重源能蓄积术式的困难异械；魔法技能吟咏+1，魔法技能增伤+60%。', '解构师构造', 'equipment', '异械', 0.85, 0, JSON_OBJECT('magicChantBonus',1,'magicSkillDamagePct',60)),
    ('residue_life_potion', '生命萃取药剂', '以血肉残渣为主材、能量余烬为辅材炼成，恢复 240 点生命。', '炼金师炼金', 'consumable', '药剂', 0.25, 1, JSON_OBJECT('heal',240)),
    ('ember_mana_potion', '魔力萃取药剂', '以能量余烬为主材、血肉残渣为辅材炼成，恢复 240 点魔力。', '炼金师炼金', 'consumable', '药剂', 0.25, 1, JSON_OBJECT('restoreMp',240)),
    ('herbal_extract', '草木萃取液', '草药经温和反应析出的基础萃取液。', '炼金师炼金', 'material', '炼材', 0.10, 1, NULL),
    ('mana_dust', '魔力粉尘', '兽核在反应中散逸后凝结的细小魔力颗粒。', '炼金师炼金', 'material', '炼材', 0.05, 1, NULL),
    ('magic_branch', '魔力枝叶', '树精枝梢上凝结的魔力叶片，仍散发着柔和的木属性气息。', '幽暗密林树精掉落', 'material', '锻材', 0.12, 1, NULL),
    ('goblin_ear', '哥布林耳', '哥布林身上留下的辨识素材。', '哥布林掉落', 'material', '怪材', 0.03, 1, NULL),
    ('riot_aura', '暴动的气息', '从暴动怪物身上剥离的躁动气息，隐约散发着危险的魔力。', '暴动怪物额外掉落', 'material', '怪材', 0.05, 1, NULL),
    ('living_wood', '活木', '仍带着微弱生命律动的木材，可用于基础精炼。', '幽暗密林植被开采', 'material', '锻材', 0.40, 1, NULL),
    ('meteor_iron', '陨铁', '自天外坠落的沉重铁矿，杂质极少，适合打造玄铁装备。', '幽暗密林矿脉开采', 'material', '锻材', 0.60, 1, NULL),
    ('star_copper', '星铜', '在夜色中泛着细碎星辉的铜材。', '后续开放获取', 'material', '锻材', 0.50, 1, NULL),
    ('moon_silver', '月银', '吸收月华后变得柔韧的银材。', '后续开放获取', 'material', '锻材', 0.45, 1, NULL),
    ('sun_gold', '曜金', '流淌着炽热金光的珍贵金属。', '后续开放获取', 'material', '锻材', 0.55, 1, NULL),
    ('hearty_meat_stew', '暖胃兽肉炖菜', '慢火炖煮的兽肉与根茎，香气能驱散长途跋涉的疲惫。', '百纳镇冒险者公会餐厅制作', 'consumable', '食物', 0.60, 1, JSON_OBJECT('foodBuff','warm_stew')),
    ('mushroom_cream_soup', '森林蘑菇浓汤', '带有淡淡魔力的浓汤，入口温热柔和。', '百纳镇冒险者公会餐厅制作', 'consumable', '食物', 0.35, 1, JSON_OBJECT('foodBuff','forest_soup')),
    ('honey_roast_rabbit', '蜜烤球兔肉', '外皮焦香、内里柔嫩的烤肉，配上一点琥珀色蜂蜜。', '百纳镇冒险者公会餐厅制作', 'consumable', '食物', 0.45, 1, JSON_OBJECT('foodBuff','honey_roast')),
    ('adventurer_platter', '冒险者能量拼盘', '兼顾肉食、蔬菜与谷物的丰盛拼盘，是出发前最踏实的一餐。', '百纳镇冒险者公会餐厅制作', 'consumable', '食物', 0.80, 1, JSON_OBJECT('foodBuff','adventurer_platter')),
    ('copper_coin', '铜币', '最常见的流通货币，可直接计入货币余额。', '悬赏、交易与邮件发放', 'material', '货币', 0.00, 1, JSON_OBJECT('currency','copper','copper_value',1)),
    ('silver_coin', '银币', '价值一百枚铜币的通用货币，可直接计入货币余额。', '悬赏、交易与邮件发放', 'material', '货币', 0.00, 1, JSON_OBJECT('currency','silver','copper_value',100)),
    ('gold_coin', '金币', '价值一万枚铜币的珍贵货币，可直接计入货币余额。', '悬赏、交易与邮件发放', 'material', '货币', 0.00, 1, JSON_OBJECT('currency','gold','copper_value',10000)),
    ('skill_book_jump_strike', '基础技能书·跃步重击', '记录跃步重击发力诀窍的基础技能书，研读后可领悟该技能。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','jump_strike')),
    ('skill_book_charge', '基础技能书·冲撞', '记录冲撞步法与发力诀窍的基础技能书，研读后可领悟该技能。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','charge')),
    ('skill_book_bite_slash', '基础技能书·咬合斩', '记录咬合斩发力诀窍的基础技能书，研读后可领悟该技能。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','bite_slash')),
    ('skill_book_vine_bolt', '基础技能书·藤蔓弹', '记录藤蔓弹的初阶术式结构，研读后可领悟该技能。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','vine_bolt')),
    ('skill_book_mist_step_slash', '基础技能书·雾步斩', '记录雾步斩步法与斩击诀窍的基础技能书，研读后可领悟该技能。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','mist_step_slash')),
    ('skill_book_moonlight_bolt', '基础技能书·月影弹', '记录月影弹的初阶术式结构，研读后可领悟该技能。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','moonlight_bolt')),
    ('skill_book_guardian_taunt', '通用技能书·守护嘲讽', '记载战场挑衅与护卫步法的通用技能书，研读后可领悟守护嘲讽。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','warrior_taunt')),
    ('skill_book_shield_counter', '通用技能书·盾反', '记载借力格挡与盾缘反击诀窍的通用技能书，研读后可领悟盾反。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','shield_counter')),
    ('skill_book_guard_break', '通用技能书·盾击破甲', '记载以盾击撬开防御架势的通用技能书，研读后可领悟盾击破甲。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','guard_break')),
    ('skill_book_arcane_shackle', '通用技能书·奥术枷锁', '记载奥术锁链构型的通用技能书，研读后可领悟奥术枷锁。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','arcane_shackle')),
    ('skill_book_ember_burst', '通用技能书·爆炎术', '记载压缩火元素并瞬时引爆的通用技能书，研读后可领悟爆炎术。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','ember_burst')),
    ('skill_book_healing_prayer', '通用技能书·治愈祷言', '记载稳定引导光元素的通用技能书，研读后可领悟治愈祷言。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','healing_prayer')),
    ('skill_book_blessing_aegis', '通用技能书·守护祝福', '记载群体护盾术式的通用技能书，研读后可领悟守护祝福。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','blessing_aegis')),
    ('skill_book_mana_benediction', '通用技能书·灵泉祝祷', '记载魔力回流祷文的通用技能书，研读后可领悟灵泉祝祷。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','mana_benediction')),
    ('skill_book_sanctified_bolt', '通用技能书·圣辉弹', '记载攻守一体光术的通用技能书，研读后可领悟圣辉弹。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','sanctified_bolt')),
    ('skill_book_sweeping_slash', '通用技能书·横斩', '记载宽幅斩击节奏的通用技能书，研读后可领悟横斩。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','sweeping_slash')),
    ('skill_book_piercing_thrust', '通用技能书·穿刺突击', '记载直线贯穿发力的通用技能书，研读后可领悟穿刺突击。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','piercing_thrust')),
    ('skill_book_wind_blade', '通用技能书·风刃术', '记载压缩风元素为刃的通用技能书，研读后可领悟风刃术。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','wind_blade')),
    ('skill_book_thunder_lance', '通用技能书·雷枪术', '记载雷元素聚束诀窍的通用技能书，研读后可领悟雷枪术。', '百纳镇·百味书屋', 'consumable', '技能书', 0.35, 1, JSON_OBJECT('skillBook','thunder_lance')),
    ('holy_sword_shirulu', '圣剑·希尔露', '由星辉铸成的圣洁长剑。', '初始恩赐', 'equipment', '武器', 3.50, 0, JSON_OBJECT('artifact','holy_sword','physicalAttackPct',16,'critRatePct',33,'critDamagePct',33)),
    ('demon_sword_aphia', '魔剑·阿菲娅', '寄宿深渊意志的漆黑魔剑。', '初始恩赐', 'equipment', '武器', 3.20, 0, JSON_OBJECT('artifact','demon_sword','magicAttackPct',16,'mpPct',33,'accuracyPct',33)),
    ('saint_staff_istaria', '圣杖·伊斯塔利亚', '以晨星为芯的祝圣法杖，回应纯粹的魔力。', '初始恩赐', 'equipment', '武器', 3.00, 0, JSON_OBJECT('artifact','saint_staff','magicAttackPct',16,'critRatePct',33,'critDamagePct',33,'lightSkillBonusPct',33)),
    ('death_dagger_azra', '死刺·阿兹拉', '短刃所向之处，连濒死的命运也会被割开。', '初始恩赐', 'equipment', '武器', 1.10, 0, JSON_OBJECT('artifact','death_dagger','physicalAttackPct',16,'accuracyPct',33,'critRatePct',33,'criticalDamageBonusPct',50)),
    ('godfist_chronos', '天刃·克罗诺斯', '铭刻古神战纹的拳刃，在瞬息间洞穿防线。', '初始恩赐', 'equipment', '武器', 2.40, 0, JSON_OBJECT('artifact','godfist','physicalAttackPct',16,'magicAttackPct',16,'critDamagePct',66,'unifyAttack',true)),
    ('oracle_grimoire_sophia', '神谕·索芙拉', '书页自行翻动，低声诵读尚未发生的咒文。', '初始恩赐', 'equipment', '武器', 1.40, 0, JSON_OBJECT('artifact','oracle_grimoire','magicAttackPct',16,'mpPct',33,'accuracyPct',33,'chantReduction',1)),
    ('prayer_orb_lumia', '祈祷法球·露弥娅', '凝固的祈愿之光，会将施术者的意志推向远方。', '初始恩赐', 'equipment', '武器', 1.00, 0, JSON_OBJECT('artifact','prayer_orb','magicAttackPct',16,'mpPct',66,'prayerHymn',true)),
    ('immortal_shield_auges', '不灭圣盾·奥格斯', '历经无数冲击仍无裂痕的古老圣盾。', '初始恩赐', 'equipment', '副手', 6.20, 0, JSON_OBJECT('artifact','immortal_shield','hpPct',33,'physicalDefensePct',16,'magicDefensePct',16,'physicalDamageReductionPct',40)),
    ('star_crown_selene', '星冠·塞勒涅', '繁星垂落于冠冕，守望佩戴者的每一次远行。', '初始恩赐', 'equipment', '头肩', 0.80, 0, JSON_OBJECT('artifact','star_crown','magicDefensePct',33,'tenacityPct',33,'magicDamagePct',16)),
    ('sky_robe_asteia', '天穹法衣·阿斯忒雅', '如天空般轻盈的法衣，织入了守护的法则。', '初始恩赐', 'equipment', '上装', 1.20, 0, JSON_OBJECT('artifact','sky_robe','hpPct',33,'physicalDefensePct',16,'magicDefensePct',16,'magicDamageReductionPct',40)),
    ('wind_girdle_hermes', '风行腰封·赫尔墨斯', '流风被束进细密的纹路，步伐与咒文都变得轻快。', '初始恩赐', 'equipment', '腰部', 0.60, 0, JSON_OBJECT('artifact','wind_girdle','mpPct',33,'speedPct',66,'moveSpeedBonus',3,'ignoreWeightPenalty',true)),
    ('time_greaves_chronos', '时隙护腿·克罗诺斯', '行走时仿佛踩在时间的缝隙之间。', '初始恩赐', 'equipment', '下装', 1.50, 0, JSON_OBJECT('artifact','time_greaves','accuracyPct',33,'evasionPct',33,'speedPct',33,'timeGuard',true)),
    ('gale_boots_sif', '逐风战靴·西芙', '靴底从不沾尘，疾风会替佩戴者踏出下一步。', '初始恩赐', 'equipment', '脚部', 1.10, 0, JSON_OBJECT('artifact','gale_boots','accuracyPct',66,'evasionPct',33,'pursuitChancePct',33)),
    ('oath_necklace_norn', '守誓项链·诺恩', '承诺会化为温热的光，护住仍愿前行的人。', '初始恩赐', 'equipment', '项链', 0.10, 0, JSON_OBJECT('artifact','oath_necklace','hpPct',100,'hpRegenPct',3)),
    ('fate_bracelet_clotho', '命运手镯·克洛托', '银线缠绕腕间，仿佛能将断裂的命运重新缝合。', '初始恩赐', 'equipment', '手镯', 0.20, 0, JSON_OBJECT('artifact','fate_bracelet','hpPct',66,'mpPct',66,'bloodForMana',true)),
    ('eternal_ring_aurora', '永恒戒指·奥罗拉', '黎明色的微光永不熄灭，指向每一场可能的胜利。', '初始恩赐', 'equipment', '戒指', 0.05, 0, JSON_OBJECT('artifact','eternal_ring','mpPct',100,'mpRegenPct',3)),
    ('rename_card', '改名卡', '用于再次修改角色昵称。首次改名免费，此后每次改名消耗一张。', '特殊途径获得', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('characterChange','name')),
    ('gender_change_card', '改性卡', '用于再次修改角色性别。首次改性免费，此后每次改性消耗一张。', '特殊途径获得', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('characterChange','gender'))
    ,('adventurer_card', '冒险者卡片', '记录冒险者身份、等级与职业的银白色卡片。', '百纳镇冒险者公会', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('adventurerCard',true))
    ,('map_baina_town', '地图·百纳镇', '标注百纳镇街巷、建筑与重要地点的城镇地图。', '梨子喵的新手引导', 'consumable', '地图', 0.01, 1, JSON_OBJECT('map','baina_town'))
    ,('map_dark_forest', '地图·幽暗密林', '记录幽暗密林外围道路与危险地带的探索地图。', '百纳镇冒险者公会商店', 'consumable', '地图', 0.01, 1, JSON_OBJECT('map','dark_forest'))
    ,('map_dark_forest_deep', '地图·幽暗密林深处', '标有幽暗密林深处的险路与古老遗迹的详尽地图。', '百纳镇冒险者公会商店', 'consumable', '地图', 0.01, 1, JSON_OBJECT('map','dark_forest_deep'))
    ,('demon_breaker_teleporter', '破魔传送器', '唯薇安研制的便携式传送装置。持有时可穿过地下迷宫入口的封印，也能在迷宫中借它强制脱离，回到入口之外。', '百纳镇·异工坊', 'consumable', '特殊', 0.60, 1, JSON_OBJECT('dungeonGatePass',true))
    ,('demon_breaker_teleporter_blueprint', '破魔传送器图纸', '记载破魔传送器完整回路的图纸；解构师持有后可稳定构造该装置。', '百纳镇·异工坊', 'consumable', '图纸', 0.01, 1, JSON_OBJECT('constructionBlueprint','demon_breaker_teleporter'))
    ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), obtain_source = VALUES(obtain_source), item_category = VALUES(item_category), stackable = VALUES(stackable), effect_json = VALUES(effect_json)`);
  await pool.query(`INSERT INTO home_furniture_definitions (code,name,description,effect_json,required_house_level,max_per_floor,floor_slot_cost,grid_width,grid_height,placement_rule,layer_order,is_active) VALUES
    ('wooden_bed','木床','朴素却结实的木床，在家休息时体力恢复速度 +5%。',JSON_OBJECT('restRecoveryPct',5),1,1,1,3,4,'wall',20,1),
    ('slime_bed','史莱姆床','会轻轻回弹的凝胶床，在家休息时体力恢复速度 +6%。',JSON_OBJECT('restRecoveryPct',6),1,1,1,3,4,'wall',20,1),
    ('storage_chest','小型储物箱','加固的木箱，家园内储物容量 +10。',JSON_OBJECT('storageCapacity',10),1,3,1,2,2,'wall',20,1),
    ('training_dummy','训练木桩','可以反复练习发力的木桩，战斗技能领悟概率 +5%。',JSON_OBJECT('trainingBonusPct',5),1,2,1,2,2,'center',20,1),
    ('warm_hearth','暖炉','温暖炉火驱散疲惫，在家休息时清除自身全部异常状态。',JSON_OBJECT('cleanseOnHomeRest',1),2,1,2,3,2,'wall',20,1),
    ('wolfhide_carpet','幽狼皮毯','由柔韧怪材制成的地毯，战斗技能领悟概率 +6%。',JSON_OBJECT('trainingBonusPct',6),2,2,1,4,3,'center',10,1),
    ('alchemy_shelf','炼金陈列架','摆满瓶罐的陈列架，显示炼金氛围 +10%。',JSON_OBJECT('alchemyBonusPct',10),2,1,1,3,2,'wall',20,1),
    ('moonlight_lamp','月光灯','嵌有月银碎片的灯具，在家休息时可缓慢获取经验。',JSON_OBJECT('homeRestExperiencePerMinute',1),3,2,1,1,1,'corner',30,1)
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),effect_json=VALUES(effect_json),required_house_level=VALUES(required_house_level),max_per_floor=VALUES(max_per_floor),floor_slot_cost=VALUES(floor_slot_cost),grid_width=VALUES(grid_width),grid_height=VALUES(grid_height),placement_rule=VALUES(placement_rule),layer_order=VALUES(layer_order),is_active=VALUES(is_active)`);
  await pool.query(`INSERT INTO home_furniture_recipes (furniture_code,item_id,quantity)
    SELECT recipe.furniture_code,i.id,recipe.quantity FROM (
      SELECT 'wooden_bed' AS furniture_code,'home_wood' AS item_code,50 AS quantity UNION ALL SELECT 'wooden_bed','home_stone',18
      UNION ALL SELECT 'slime_bed','home_wood',25 UNION ALL SELECT 'slime_bed','slime_gel',15
      UNION ALL SELECT 'storage_chest','home_wood',15 UNION ALL SELECT 'storage_chest','home_metal',2
      UNION ALL SELECT 'training_dummy','home_wood',40 UNION ALL SELECT 'training_dummy','home_stone',10 UNION ALL SELECT 'training_dummy','home_metal',8
      UNION ALL SELECT 'warm_hearth','home_stone',45 UNION ALL SELECT 'warm_hearth','home_metal',16
      UNION ALL SELECT 'wolfhide_carpet','beast_hide',20 UNION ALL SELECT 'wolfhide_carpet','magic_wool',8
      UNION ALL SELECT 'alchemy_shelf','home_wood',35 UNION ALL SELECT 'alchemy_shelf','beast_core',3
      UNION ALL SELECT 'moonlight_lamp','home_metal',10 UNION ALL SELECT 'moonlight_lamp','moon_silver',1
    ) recipe JOIN item_definitions i ON i.code=recipe.item_code
    ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)`);
  await pool.query(`INSERT INTO home_shop_offers (offer_code,output_item_id,output_quantity,input_item_id,input_quantity,copper_price,is_active,sort_order)
    SELECT offers.offer_code,out_item.id,offers.output_quantity,in_item.id,offers.input_quantity,offers.copper_price,1,offers.sort_order FROM (
      SELECT 'buy_wood' AS offer_code,'home_wood' AS output_code,1 AS output_quantity,NULL AS input_code,0 AS input_quantity,5 AS copper_price,1 AS sort_order
      UNION ALL SELECT 'buy_stone','home_stone',1,NULL,0,8,2 UNION ALL SELECT 'buy_metal','home_metal',1,NULL,0,15,3
      UNION ALL SELECT 'exchange_living_wood','home_wood',10,'living_wood',1,0,10
      UNION ALL SELECT 'exchange_refined_bone','home_stone',12,'refined_beast_bone',1,0,11
      UNION ALL SELECT 'exchange_meteor_iron','home_metal',8,'meteor_iron',1,0,12
      UNION ALL SELECT 'exchange_star_copper','home_metal',18,'star_copper',1,0,13
    ) offers JOIN item_definitions out_item ON out_item.code=offers.output_code LEFT JOIN item_definitions in_item ON in_item.code=offers.input_code
    ON DUPLICATE KEY UPDATE output_item_id=VALUES(output_item_id),output_quantity=VALUES(output_quantity),input_item_id=VALUES(input_item_id),input_quantity=VALUES(input_quantity),copper_price=VALUES(copper_price),is_active=1,sort_order=VALUES(sort_order)`);
  await pool.query(`INSERT INTO oddworkshop_items (item_id,buy_price,stock_capacity,stock_quantity,is_active)
    SELECT id,CASE code WHEN 'demon_breaker_teleporter' THEN 200 WHEN 'demon_breaker_teleporter_blueprint' THEN 999 ELSE 1 END,99,99,1
    FROM item_definitions WHERE code IN ('demon_breaker_teleporter','demon_breaker_teleporter_blueprint')
    ON DUPLICATE KEY UPDATE buy_price=VALUES(buy_price),stock_capacity=VALUES(stock_capacity),is_active=1`);
  // 异械实例不会带随机词条，定义调整后同步其效果，确保已持有的旧异械也立即采用新机制。
  await pool.query(`UPDATE player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    SET ii.effect_json=i.effect_json
    WHERE i.code IN ('auxiliary_aiming_scope','muscle_pacer','critical_glove','mana_accumulator')`);
  await pool.query(`UPDATE item_definitions SET is_tradeable=0 WHERE code IN ('copper_coin','silver_coin','gold_coin')`);
  // 统一基础回收价。不同店铺会按各自的专业方向给出不同加价，未在此列出的剧情物品保持不可交易或零价。
  await pool.query(`UPDATE item_definitions SET trade_price=CASE code
    WHEN 'healing_herb' THEN 2 WHEN 'glimmer_potion' THEN 3
    WHEN 'novice_hp_potion_small' THEN 5 WHEN 'novice_mp_potion_small' THEN 5
    WHEN 'novice_hp_potion_medium' THEN 8 WHEN 'novice_mp_potion_medium' THEN 8
    WHEN 'novice_hp_potion_large' THEN 15 WHEN 'novice_mp_potion_large' THEN 15
    WHEN 'minor_experience_elixir' THEN 50 WHEN 'minor_luck_elixir' THEN 100
    WHEN 'wolf_fang' THEN 4 WHEN 'beast_meat' THEN 3 WHEN 'beast_bone' THEN 4 WHEN 'beast_hide' THEN 6 WHEN 'beast_tendon' THEN 9 WHEN 'beast_core' THEN 25
    WHEN 'magic_wool' THEN 12 WHEN 'magic_tusk' THEN 14 WHEN 'magic_scale' THEN 14 WHEN 'magic_claw' THEN 16 WHEN 'magic_heartcore' THEN 20
    WHEN 'refined_beast_bone' THEN 14 WHEN 'refined_beast_hide' THEN 20 WHEN 'refined_beast_tendon' THEN 28 WHEN 'refined_beast_core' THEN 75
    WHEN 'refined_magic_wool' THEN 36 WHEN 'refined_magic_tusk' THEN 42 WHEN 'refined_magic_scale' THEN 42 WHEN 'refined_magic_claw' THEN 48 WHEN 'refined_magic_heartcore' THEN 60
    WHEN 'blood_residue' THEN 2 WHEN 'energy_ember' THEN 2 WHEN 'magic_unit' THEN 10
    WHEN 'wood_element_dust' THEN 3 WHEN 'metal_element_dust' THEN 3 WHEN 'water_element_dust' THEN 3 WHEN 'ice_element_dust' THEN 4 WHEN 'dark_element_dust' THEN 4 WHEN 'fire_element_dust' THEN 5 WHEN 'thunder_element_dust' THEN 5 WHEN 'light_element_dust' THEN 5
    WHEN 'herbal_extract' THEN 5 WHEN 'mana_dust' THEN 8 WHEN 'residue_life_potion' THEN 8 WHEN 'ember_mana_potion' THEN 8
    WHEN 'magic_branch' THEN 12 WHEN 'goblin_ear' THEN 5 WHEN 'riot_aura' THEN 50
    WHEN 'living_wood' THEN 6 WHEN 'meteor_iron' THEN 20 WHEN 'star_copper' THEN 40 WHEN 'moon_silver' THEN 90 WHEN 'sun_gold' THEN 200
    WHEN 'skill_book_guardian_taunt' THEN 35 WHEN 'skill_book_shield_counter' THEN 60 WHEN 'skill_book_guard_break' THEN 50
    WHEN 'skill_book_arcane_shackle' THEN 50 WHEN 'skill_book_ember_burst' THEN 65 WHEN 'skill_book_healing_prayer' THEN 75
    WHEN 'skill_book_blessing_aegis' THEN 110 WHEN 'skill_book_mana_benediction' THEN 130 WHEN 'skill_book_sanctified_bolt' THEN 40
    WHEN 'skill_book_sweeping_slash' THEN 30 WHEN 'skill_book_piercing_thrust' THEN 45 WHEN 'skill_book_wind_blade' THEN 40 WHEN 'skill_book_thunder_lance' THEN 65
    WHEN 'hearty_meat_stew' THEN 8 WHEN 'mushroom_cream_soup' THEN 8 WHEN 'honey_roast_rabbit' THEN 12 WHEN 'adventurer_platter' THEN 16
    ELSE trade_price END`);
  for (const item of blacksmithShopStock) {
    await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weapon_type,rarity,required_level,weight,stackable,effect_json)
      VALUES (?,?,?,?,? ,?,?,?,?,?,0,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),item_category=VALUES(item_category),weapon_type=VALUES(weapon_type),rarity=VALUES(rarity),required_level=VALUES(required_level),stackable=0,effect_json=VALUES(effect_json)`, [item.code, item.name, `小北铁匠铺出售的普通白板装备，适合 Lv.${item.level} 的冒险者使用。`, '百纳镇·铁匠铺', 'equipment', item.category, item.weaponType, '普通', item.level, 2, JSON.stringify(item.effect)]);
    await pool.execute(`INSERT INTO blacksmith_shop_items (item_id,buy_price,sell_price,is_active)
      SELECT id,?,?,1 FROM item_definitions WHERE code=?
      ON DUPLICATE KEY UPDATE buy_price=VALUES(buy_price),sell_price=VALUES(sell_price),is_active=1`, [item.price, Math.floor(item.price / 2), item.code]);
  }
  for (const item of alchemistShopStock) {
    await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,stackable,effect_json)
      VALUES (?,?,?,?,?,?,?,1,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),stackable=1,effect_json=VALUES(effect_json)`, [item.code, item.name, item.description, '百纳镇·糖水屋', 'consumable', '药剂', .2, JSON.stringify(item.effect)]);
    await pool.execute(`INSERT INTO alchemist_shop_items (item_id,shop_category,buy_price,sell_price,is_active)
      SELECT id,?,?,?,1 FROM item_definitions WHERE code=?
      ON DUPLICATE KEY UPDATE shop_category=VALUES(shop_category),buy_price=VALUES(buy_price),sell_price=VALUES(sell_price),is_active=1`, [item.category, item.price, Math.floor(item.price / 2), item.code]);
    await pool.execute('UPDATE item_definitions SET trade_price=? WHERE code=?', [Math.floor(item.price / 2), item.code]);
  }
  // 雷恩的猎户小屋出售密林兽材，常规价格高于公会回收价；每天偶尔会有一件猎获特价。
  await pool.query(`INSERT INTO hunter_lodge_items (item_id,buy_price,is_active)
    SELECT id,CASE code
      WHEN 'beast_meat' THEN 7 WHEN 'beast_bone' THEN 10 WHEN 'beast_hide' THEN 16 WHEN 'beast_tendon' THEN 27 WHEN 'beast_core' THEN 75
      WHEN 'magic_wool' THEN 35 WHEN 'magic_tusk' THEN 40 WHEN 'magic_scale' THEN 40 WHEN 'magic_claw' THEN 46 WHEN 'magic_heartcore' THEN 52
      ELSE 1 END,1
    FROM item_definitions WHERE code IN ('beast_meat','beast_bone','beast_hide','beast_tendon','beast_core','magic_wool','magic_tusk','magic_scale','magic_claw','magic_heartcore')
    ON DUPLICATE KEY UPDATE buy_price=VALUES(buy_price),is_active=1`);
  await pool.query(`UPDATE bookshop_items bs JOIN item_definitions i ON i.id=bs.item_id
    SET bs.is_active=0 WHERE i.code IN ('skill_book_jump_strike','skill_book_charge','skill_book_bite_slash','skill_book_vine_bolt','skill_book_mist_step_slash','skill_book_moonlight_bolt')`);
  await pool.query(`INSERT INTO bookshop_items (item_id,buy_price,is_active)
    SELECT id,CASE code
      WHEN 'skill_book_guardian_taunt' THEN 70 WHEN 'skill_book_shield_counter' THEN 120 WHEN 'skill_book_guard_break' THEN 100
      WHEN 'skill_book_arcane_shackle' THEN 100 WHEN 'skill_book_ember_burst' THEN 130 WHEN 'skill_book_healing_prayer' THEN 150
      WHEN 'skill_book_blessing_aegis' THEN 220 WHEN 'skill_book_mana_benediction' THEN 260 WHEN 'skill_book_sanctified_bolt' THEN 80
      WHEN 'skill_book_sweeping_slash' THEN 60 WHEN 'skill_book_piercing_thrust' THEN 90 WHEN 'skill_book_wind_blade' THEN 80 WHEN 'skill_book_thunder_lance' THEN 130
      ELSE 1 END,1
    FROM item_definitions WHERE code IN ('skill_book_guardian_taunt','skill_book_shield_counter','skill_book_guard_break','skill_book_arcane_shackle','skill_book_ember_burst','skill_book_healing_prayer','skill_book_blessing_aegis','skill_book_mana_benediction','skill_book_sanctified_bolt','skill_book_sweeping_slash','skill_book_piercing_thrust','skill_book_wind_blade','skill_book_thunder_lance')
    ON DUPLICATE KEY UPDATE buy_price=VALUES(buy_price),is_active=1`);
  await pool.query(`UPDATE item_definitions SET rarity=CASE WHEN code IN ('holy_sword_shirulu','demon_sword_aphia','saint_staff_istaria','death_dagger_azra','godfist_chronos','oracle_grimoire_sophia','prayer_orb_lumia','immortal_shield_auges','star_crown_selene','sky_robe_asteia','wind_girdle_hermes','time_greaves_chronos','gale_boots_sif','oath_necklace_norn','fate_bracelet_clotho','eternal_ring_aurora') THEN '神器' ELSE rarity END,required_level=CASE WHEN code IN ('holy_sword_shirulu','demon_sword_aphia','saint_staff_istaria','death_dagger_azra','godfist_chronos','oracle_grimoire_sophia','prayer_orb_lumia','immortal_shield_auges','star_crown_selene','sky_robe_asteia','wind_girdle_hermes','time_greaves_chronos','gale_boots_sif','oath_necklace_norn','fate_bracelet_clotho','eternal_ring_aurora') THEN 1 ELSE required_level END`);
  await pool.query(`UPDATE item_definitions SET weapon_type=CASE code
    WHEN 'holy_sword_shirulu' THEN '长剑' WHEN 'demon_sword_aphia' THEN '长剑' WHEN 'saint_staff_istaria' THEN '法杖' WHEN 'death_dagger_azra' THEN '匕首' WHEN 'godfist_chronos' THEN '拳刃' WHEN 'oracle_grimoire_sophia' THEN '法书' WHEN 'prayer_orb_lumia' THEN '法球' WHEN 'immortal_shield_auges' THEN '盾牌' ELSE weapon_type END`);
  await pool.query(`UPDATE item_definitions SET codex_id=CONCAT(CASE item_category WHEN '武器' THEN '11' WHEN '副手' THEN '12' WHEN '头部' THEN '13' WHEN '头肩' THEN '13' WHEN '眼部' THEN '13' WHEN '异械' THEN '20' WHEN '上装' THEN '14' WHEN '腰部' THEN '15' WHEN '下装' THEN '16' WHEN '脚部' THEN '17' WHEN '项链' THEN '18' WHEN '手镯' THEN '19' WHEN '戒指' THEN '10' ELSE '19' END,LPAD(id,5,'0')) WHERE item_type='equipment' AND codex_id IS NULL`);
  await pool.query("UPDATE item_definitions SET codex_id=CONCAT('20',LPAD(id,5,'0')) WHERE item_category='异械'");
  // 兼容旧版：原先被写入“眼部”槽位的异械改为独立生效，不再占人物装备栏。
  await pool.query(`INSERT IGNORE INTO player_active_devices (character_id,instance_id)
    SELECT pe.character_id,pe.instance_id FROM player_equipment pe
    JOIN item_definitions i ON i.id=pe.item_id
    WHERE i.item_category='异械' AND pe.instance_id IS NOT NULL`);
  await pool.query(`DELETE pe FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id WHERE i.item_category='异械'`);
  await pool.query(`INSERT INTO blacksmith_refinement_materials (item_id,min_gain,max_gain)
    SELECT id,CASE WHEN code='living_wood' THEN 1 WHEN code='meteor_iron' THEN 2 WHEN code='star_copper' THEN 2 WHEN code='moon_silver' THEN 3 WHEN code='sun_gold' THEN 4 WHEN code='refined_beast_bone' THEN 3 WHEN code='refined_beast_hide' THEN 3 WHEN code='refined_beast_tendon' THEN 3 WHEN code='refined_beast_core' THEN 4 WHEN code LIKE 'refined_magic_%' THEN 5 END,CASE WHEN code='living_wood' THEN 5 WHEN code='meteor_iron' THEN 5 WHEN code='star_copper' THEN 6 WHEN code='moon_silver' THEN 7 WHEN code='sun_gold' THEN 10 WHEN code='refined_beast_bone' THEN 8 WHEN code='refined_beast_hide' THEN 8 WHEN code='refined_beast_tendon' THEN 8 WHEN code='refined_beast_core' THEN 9 WHEN code LIKE 'refined_magic_%' THEN 11 END
    FROM item_definitions WHERE code IN ('living_wood','meteor_iron','star_copper','moon_silver','sun_gold','refined_beast_bone','refined_beast_hide','refined_beast_tendon','refined_beast_core','refined_magic_wool','refined_magic_tusk','refined_magic_scale','refined_magic_claw','refined_magic_heartcore')
    ON DUPLICATE KEY UPDATE min_gain=VALUES(min_gain),max_gain=VALUES(max_gain)`);
  await pool.query(`INSERT INTO blacksmith_fusion_material_effects (item_id,effect_json,description)
    SELECT id,CASE code
      WHEN 'beast_bone' THEN JSON_OBJECT('physicalAttackPct',2)
      WHEN 'beast_hide' THEN JSON_OBJECT('physicalDefensePct',2)
      WHEN 'beast_tendon' THEN JSON_OBJECT('speedPct',2)
      WHEN 'beast_core' THEN JSON_OBJECT('magicAttackPct',2)
      WHEN 'magic_wool' THEN JSON_OBJECT('evasionPct',3)
      WHEN 'magic_tusk' THEN JSON_OBJECT('physicalAttackPct',3)
      WHEN 'magic_scale' THEN JSON_OBJECT('magicDefensePct',3)
      WHEN 'magic_claw' THEN JSON_OBJECT('critRatePct',3)
      WHEN 'magic_heartcore' THEN JSON_OBJECT('accuracyPct',3)
      WHEN 'refined_beast_bone' THEN JSON_OBJECT('physicalAttackPct',4)
      WHEN 'refined_beast_hide' THEN JSON_OBJECT('physicalDefensePct',4,'magicDefensePct',4)
      WHEN 'refined_beast_tendon' THEN JSON_OBJECT('speedPct',4)
      WHEN 'refined_beast_core' THEN JSON_OBJECT('magicAttackPct',4)
      WHEN 'refined_magic_wool' THEN JSON_OBJECT('evasionPct',6)
      WHEN 'refined_magic_tusk' THEN JSON_OBJECT('physicalAttackPct',6)
      WHEN 'refined_magic_scale' THEN JSON_OBJECT('magicDefensePct',6)
      WHEN 'refined_magic_claw' THEN JSON_OBJECT('critRatePct',6)
      WHEN 'refined_magic_heartcore' THEN JSON_OBJECT('accuracyPct',6)
      WHEN 'riot_aura' THEN JSON_OBJECT('damageBonusPct',3)
      WHEN 'living_wood' THEN JSON_OBJECT('hpPct',2)
      WHEN 'meteor_iron' THEN JSON_OBJECT('physicalDefensePct',3)
      WHEN 'star_copper' THEN JSON_OBJECT('accuracyPct',3)
      WHEN 'moon_silver' THEN JSON_OBJECT('mpPct',3)
      WHEN 'sun_gold' THEN JSON_OBJECT('physicalAttackPct',2,'magicAttackPct',2)
      WHEN 'wood_element_dust' THEN JSON_OBJECT('elementMastery_木',2)
      WHEN 'metal_element_dust' THEN JSON_OBJECT('elementMastery_土',2)
      WHEN 'water_element_dust' THEN JSON_OBJECT('elementMastery_水',2)
      WHEN 'ice_element_dust' THEN JSON_OBJECT('elementMastery_冰',2)
      WHEN 'dark_element_dust' THEN JSON_OBJECT('elementMastery_暗',2)
      WHEN 'fire_element_dust' THEN JSON_OBJECT('elementMastery_火',2)
      WHEN 'thunder_element_dust' THEN JSON_OBJECT('elementMastery_雷',2)
      WHEN 'light_element_dust' THEN JSON_OBJECT('elementMastery_光',2) END,
      CASE code WHEN 'beast_bone' THEN '物攻+2%' WHEN 'beast_hide' THEN '物防+2%' WHEN 'beast_tendon' THEN '速度+2%' WHEN 'beast_core' THEN '魔攻+2%' WHEN 'magic_wool' THEN '闪避+3%' WHEN 'magic_tusk' THEN '物攻+3%' WHEN 'magic_scale' THEN '魔防+3%' WHEN 'magic_claw' THEN '暴击+3%' WHEN 'magic_heartcore' THEN '命中+3%' WHEN 'refined_beast_bone' THEN '物攻+4%' WHEN 'refined_beast_hide' THEN '双防+4%' WHEN 'refined_beast_tendon' THEN '速度+4%' WHEN 'refined_beast_core' THEN '魔攻+4%' WHEN 'refined_magic_wool' THEN '闪避+6%' WHEN 'refined_magic_tusk' THEN '物攻+6%' WHEN 'refined_magic_scale' THEN '魔防+6%' WHEN 'refined_magic_claw' THEN '暴击+6%' WHEN 'refined_magic_heartcore' THEN '命中+6%' WHEN 'riot_aura' THEN '伤害增加3%' WHEN 'living_wood' THEN '生命上限+2%' WHEN 'meteor_iron' THEN '物防+3%' WHEN 'star_copper' THEN '命中+3%' WHEN 'moon_silver' THEN '魔力上限+3%' WHEN 'sun_gold' THEN '双攻+2%' WHEN 'wood_element_dust' THEN '武器：木元素精通+2；防具：木元素抗性+2' WHEN 'metal_element_dust' THEN '武器：土元素精通+2；防具：土元素抗性+2' WHEN 'water_element_dust' THEN '武器：水元素精通+2；防具：水元素抗性+2' WHEN 'ice_element_dust' THEN '武器：冰元素精通+2；防具：冰元素抗性+2' WHEN 'dark_element_dust' THEN '武器：暗元素精通+2；防具：暗元素抗性+2' WHEN 'fire_element_dust' THEN '武器：火元素精通+2；防具：火元素抗性+2' WHEN 'thunder_element_dust' THEN '武器：雷元素精通+2；防具：雷元素抗性+2' WHEN 'light_element_dust' THEN '武器：光元素精通+2；防具：光元素抗性+2' END
    FROM item_definitions WHERE code IN ('beast_bone','beast_hide','beast_tendon','beast_core','magic_wool','magic_tusk','magic_scale','magic_claw','magic_heartcore','refined_beast_bone','refined_beast_hide','refined_beast_tendon','refined_beast_core','refined_magic_wool','refined_magic_tusk','refined_magic_scale','refined_magic_claw','refined_magic_heartcore','riot_aura','living_wood','meteor_iron','star_copper','moon_silver','sun_gold','wood_element_dust','metal_element_dust','water_element_dust','ice_element_dust','dark_element_dust','fire_element_dust','thunder_element_dust','light_element_dust')
    ON DUPLICATE KEY UPDATE effect_json=VALUES(effect_json),description=VALUES(description)`);
  await pool.query(`INSERT INTO guild_shop_items (item_id,buy_price,sell_price)
    SELECT id,CASE code WHEN 'map_dark_forest' THEN 20 WHEN 'map_dark_forest_deep' THEN 1000 END,0
    FROM item_definitions WHERE code IN ('map_dark_forest','map_dark_forest_deep')
    ON DUPLICATE KEY UPDATE buy_price=VALUES(buy_price),sell_price=VALUES(sell_price),is_active=1`);
  // 公会只收购以下材料，不将它们加入可购买货架。价格按掉率、提纯损耗与锻造用途统一校准。
  await pool.query(`INSERT INTO guild_shop_items (item_id,buy_price,sell_price,is_active)
    SELECT id,0,CASE code
      WHEN 'healing_herb' THEN 1
      WHEN 'beast_meat' THEN 2 WHEN 'beast_bone' THEN 3 WHEN 'beast_hide' THEN 5 WHEN 'beast_tendon' THEN 9 WHEN 'beast_core' THEN 30
      WHEN 'wolf_fang' THEN 8 WHEN 'magic_wool' THEN 12 WHEN 'magic_tusk' THEN 14 WHEN 'magic_scale' THEN 14 WHEN 'magic_claw' THEN 16 WHEN 'magic_heartcore' THEN 18
      WHEN 'goblin_ear' THEN 25 WHEN 'magic_branch' THEN 80 WHEN 'living_wood' THEN 65 WHEN 'riot_aura' THEN 250
      WHEN 'refined_beast_bone' THEN 15 WHEN 'refined_beast_hide' THEN 25 WHEN 'refined_beast_tendon' THEN 45 WHEN 'refined_beast_core' THEN 160
      WHEN 'refined_magic_wool' THEN 60 WHEN 'refined_magic_tusk' THEN 70 WHEN 'refined_magic_scale' THEN 70 WHEN 'refined_magic_claw' THEN 80 WHEN 'refined_magic_heartcore' THEN 90
      WHEN 'blood_residue' THEN 1 WHEN 'energy_ember' THEN 1 WHEN 'magic_unit' THEN 8 WHEN 'residue_life_potion' THEN 2 WHEN 'ember_mana_potion' THEN 2 WHEN 'herbal_extract' THEN 3 WHEN 'mana_dust' THEN 15
      WHEN 'meteor_iron' THEN 120 WHEN 'star_copper' THEN 220 WHEN 'moon_silver' THEN 450 WHEN 'sun_gold' THEN 850
      WHEN 'hearty_meat_stew' THEN 3 WHEN 'mushroom_cream_soup' THEN 20 WHEN 'honey_roast_rabbit' THEN 12 WHEN 'adventurer_platter' THEN 25
      ELSE 1 END,0
    FROM item_definitions WHERE code IN (
      'healing_herb','beast_meat','beast_bone','beast_hide','beast_tendon','beast_core','wolf_fang','magic_wool','magic_tusk','magic_scale','magic_claw','magic_heartcore',
      'goblin_ear','magic_branch','living_wood','riot_aura','refined_beast_bone','refined_beast_hide','refined_beast_tendon','refined_beast_core',
      'refined_magic_wool','refined_magic_tusk','refined_magic_scale','refined_magic_claw','refined_magic_heartcore','blood_residue','energy_ember','magic_unit','residue_life_potion','ember_mana_potion','herbal_extract','mana_dust',
      'meteor_iron','star_copper','moon_silver','sun_gold','hearty_meat_stew','mushroom_cream_soup','honey_roast_rabbit','adventurer_platter'
    ) ON DUPLICATE KEY UPDATE buy_price=VALUES(buy_price),sell_price=VALUES(sell_price),is_active=VALUES(is_active)`);
  await pool.query(`INSERT INTO guild_restaurant_menu (item_id,price,processing_fee,ingredients_json,buff_json,duration_minutes)
    SELECT id,
      CASE code WHEN 'hearty_meat_stew' THEN 6 WHEN 'mushroom_cream_soup' THEN 8 WHEN 'honey_roast_rabbit' THEN 10 WHEN 'adventurer_platter' THEN 16 END,
      CASE code WHEN 'hearty_meat_stew' THEN 6 WHEN 'mushroom_cream_soup' THEN 8 WHEN 'honey_roast_rabbit' THEN 10 WHEN 'adventurer_platter' THEN 16 END,
      CASE code
        WHEN 'hearty_meat_stew' THEN JSON_ARRAY(JSON_OBJECT('code','beast_meat','quantity',2),JSON_OBJECT('code','healing_herb','quantity',1))
        WHEN 'mushroom_cream_soup' THEN JSON_ARRAY(JSON_OBJECT('code','healing_herb','quantity',3),JSON_OBJECT('code','beast_core','quantity',1))
        WHEN 'honey_roast_rabbit' THEN JSON_ARRAY(JSON_OBJECT('code','beast_meat','quantity',2),JSON_OBJECT('code','magic_wool','quantity',1))
        WHEN 'adventurer_platter' THEN JSON_ARRAY(JSON_OBJECT('code','beast_meat','quantity',3),JSON_OBJECT('code','healing_herb','quantity',2),JSON_OBJECT('code','beast_core','quantity',1)) END,
      CASE code
        WHEN 'hearty_meat_stew' THEN JSON_OBJECT('hpPct',10,'physicalDefensePct',8)
        WHEN 'mushroom_cream_soup' THEN JSON_OBJECT('mpPct',15,'magicAttackPct',8)
        WHEN 'honey_roast_rabbit' THEN JSON_OBJECT('physicalAttackPct',10,'accuracyPct',6)
        WHEN 'adventurer_platter' THEN JSON_OBJECT('hpPct',10,'mpPct',10,'physicalAttackPct',8,'magicAttackPct',8) END,
      30
    FROM item_definitions WHERE code IN ('hearty_meat_stew','mushroom_cream_soup','honey_roast_rabbit','adventurer_platter')
    ON DUPLICATE KEY UPDATE price=VALUES(price),processing_fee=VALUES(processing_fee),ingredients_json=VALUES(ingredients_json),buff_json=VALUES(buff_json),duration_minutes=VALUES(duration_minutes),is_active=1`);
  await pool.query(`UPDATE item_definitions SET codex_id=CONCAT(CASE WHEN item_type='equipment' THEN CASE item_category WHEN '武器' THEN '11' WHEN '副手' THEN '12' WHEN '头部' THEN '13' WHEN '头肩' THEN '13' WHEN '眼部' THEN '13' WHEN '异械' THEN '20' WHEN '上装' THEN '14' WHEN '腰部' THEN '15' WHEN '下装' THEN '16' WHEN '脚部' THEN '17' WHEN '项链' THEN '18' WHEN '手镯' THEN '19' WHEN '戒指' THEN '10' ELSE '19' END WHEN item_type='consumable' THEN CASE item_category WHEN '药剂' THEN '21' WHEN '食物' THEN '22' ELSE '23' END WHEN item_type='material' THEN CASE item_category WHEN '食材' THEN '31' WHEN '草药' THEN '32' ELSE '39' END ELSE '99' END, LPAD(id,5,'0')) WHERE codex_id IS NULL`);
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
    ('charge', '冲撞', 'physical', 55, 1, 135, '发动冲撞后进入冲刺状态，短时间内提升自身速度。'),
    ('bite', '撕咬', 'physical', 30, 2, 125, '野兽撕裂目标，造成持续流血。'),
    ('howl', '震慑咆哮', 'magic', 0, 1, 70, '以咆哮扰乱敌人。'),
    ('jump_strike', '跃步重击', 'physical', 50, 1, 135, '重击目标；基础有 50% 概率使其眩晕 1 回合，实际概率受等级差与韧性影响。'),
    ('bite_slash', '咬合斩', 'physical', 55, 1, 145, '将猛兽撕咬的发力方式融入剑技，命中后削弱目标物防。'),
    ('war_cry', '震荡战吼', 'utility', 90, 3, 0, '发出战吼，提升全队的物理与魔法攻击。'),
    ('scratch', '爪击', 'physical', 0, 0, 90, '野兽以利爪快速挥击。'),
    ('shell_bash', '壳撞', 'physical', 0, 1, 110, '以坚硬外壳发起沉重撞击。'),
    ('spore_dart', '孢子弹', 'magic', 0, 1, 90, '射出会附着在目标身上的微弱孢子。'),
    ('sonic_screech', '尖啸', 'magic', 0, 1, 75, '刺耳的声浪让目标短暂迟缓。'),
    ('thorn_shot', '棘刺射击', 'physical', 0, 1, 105, '射出带有倒刺的硬棘。'),
    ('mist_pounce', '雾袭', 'physical', 35, 2, 115, '借助薄雾发动扑杀，并让下一次出招更具威力。'),
    ('shell_breaker', '碎壳击', 'physical', 60, 2, 125, '借鉴壳撞发力的沉重打击。'),
    ('spore_bolt', '孢子飞矢', 'magic', 65, 2, 120, '将孢子压缩为可控的木属性飞矢。'),
    ('echo_shock', '回音震击', 'magic', 65, 2, 110, '以回荡的声波扰乱目标行动。'),
    ('thorn_stab', '棘刺突击', 'physical', 60, 2, 130, '模仿棘刺射击的贯穿发力。'),
    ('mist_step_slash', '雾步斩', 'physical', 65, 2, 135, '借助身法在薄雾中突进斩击，并使下一次出招伤害提高。'),
    ('constrict', '缠束', 'physical', 6, 2, 110, '以身躯束缚并挤压目标。'),
    ('maul', '重爪', 'physical', 8, 2, 135, '以沉重利爪撕开目标。'),
    ('goblin_slash', '哥布林斩', 'physical', 5, 1, 115, '粗陋却迅速的短刃斩击。'),
    ('goblin_fire', '火种术', 'magic', 8, 2, 105, '投出一团不稳定的小火种。'),
    ('root_bind', '根须禁锢', 'magic', 30, 3, 130, '树精唤醒地下根须，将目标牢牢缠在原地。'),
    ('thorn_burst', '荆棘爆射', 'physical', 22, 2, 145, '树精将硬化荆棘骤然射出，留下难以愈合的伤口。'),
    ('verdant_bolt', '苍翠魔弹', 'magic', 36, 2, 155, '汇聚浓郁木属性魔力，发射沉重的苍翠光弹。'),
    ('vine_hex', '藤咒', 'magic', 8, 1, 92, '藤蛇将微弱的自然魔力缠向目标，使其短暂迟缓。'),
    ('moonbolt', '雾月弹', 'magic', 45, 2, 96, '幽狼凝聚雾中的暗色魔力，令下一次出招必定暴击。'),
    ('vine_bolt', '藤蔓弹', 'magic', 50, 2, 122, '将藤蛇的藤咒改良为适合人类施展的木属性魔法，命中后束缚目标。'),
    ('moonlight_bolt', '月影弹', 'magic', 55, 2, 126, '将幽狼的雾月弹改良为可控的暗属性魔法，使下一次出招必定暴击。'),
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
    ('lucky_favor', '幸运眷顾', 'passive', 0, 0, 0, '战利品掉落概率提高 20%。'),
    ('war_god_favor', '战神眷顾', 'passive', 0, 0, 0, '造成的最终伤害提高 16%。'),
    ('arcane_revelation', '奥术启示', 'passive', 0, 0, 0, '魔法伤害提高 16%。'),
    ('crimson_recovery', '猩红复苏', 'passive', 0, 0, 0, '普攻与刺击伤害的 16% 转化为生命。'),
    ('seer_instinct', '先知直觉', 'passive', 0, 0, 0, '命中与暴击属性在战斗中提高 16%。'),
    ('hunter_blessing', '猎人恩典', 'passive', 0, 0, 0, '战利品掉落概率提高 35%。'),
    ('craftsmanship', '匠心', 'passive', 0, 0, 0, '随副职业等级发挥不同效果：锻造师降低耐久损耗，炼金师提高药品效果。'),
    ('boss_mana_charge', '魔力充能', 'utility', 0, 0, 0, '吸收周遭游离魔力，立即将自身魔力恢复至最大值。')
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
  await pool.query(`INSERT INTO skill_definitions (code,name,category,damage_type,skill_kind,element,range_type,mana_cost,cooldown_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,description) VALUES
    ('sweeping_slash','横斩','physical','斩击','斩击','无','近战',48,1,112,1,1,5,10,'以宽幅剑势横扫目标，命中后造成短暂撕裂。'),
    ('piercing_thrust','穿刺突击','physical','刺击','刺击','无','近战',54,2,125,1,1,5,12,'将力量凝聚于一点，贯穿目标的防御架势。'),
    ('wind_blade','风刃术','magic','风','元素','风','远程',48,1,112,1,1,5,10,'压缩风元素，发射锐利的风刃迟滞目标。'),
    ('thunder_lance','雷枪术','magic','雷','元素','雷','远程',58,2,130,2,1,5,12,'将雷元素凝成贯穿目标的短枪，并有机会使其眩晕。'),
    ('wolfking_summon_shadow_wolf','召唤·影狼','utility','无','召唤','无','全体',80,0,0,99,99,1,0,'呼唤两只10级影狼加入战斗；新加入的影狼下回合才能行动。'),
    ('wolfking_trample','践踏','physical','打击','打击','无','近战',55,1,90,99,99,1,0,'以沉重步伐震击所有敌人，令其失衡。'),
    ('wolfking_rending_pounce','连扑','physical','斩击','斩击','无','近战',70,1,75,99,99,1,0,'对目标发动三次连续扑杀。'),
    ('wolfking_bite','撕咬','physical','斩击','斩击','无','近战',65,1,125,99,99,1,0,'凶狠撕咬目标，使其流血。'),
    ('wolfking_shadow_curse','影咒','utility','无','强化','无','自身',90,4,0,99,99,1,0,'恢复已损失生命的一半，并在短时间内强化自身。'),
    ('wolfking_fang_devour','齿噬','physical','斩击','斩击','无','近战',60,0,125,99,99,1,0,'利齿必定造成暴击，并使目标陷入脆弱。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),damage_type=VALUES(damage_type),skill_kind=VALUES(skill_kind),element=VALUES(element),range_type=VALUES(range_type),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),description=VALUES(description)`);
  await pool.query(`UPDATE skill_definitions SET skill_kind=CASE category WHEN 'physical' THEN CASE damage_type WHEN '斩击' THEN '斩击' WHEN '刺击' THEN '刺击' ELSE '打击' END WHEN 'magic' THEN CASE WHEN damage_type IN ('水','火','土','木','风','冰','雷','光','暗') THEN '元素' WHEN damage_type='奥术' THEN '能量' ELSE '灵异' END WHEN 'utility' THEN '辅助' WHEN 'passive' THEN '被动' WHEN 'bound' THEN '绑定' ELSE skill_kind END, element=CASE WHEN category='magic' AND damage_type IN ('水','火','土','木','风','冰','雷','光','暗') THEN damage_type ELSE '无' END, range_type=CASE WHEN category='physical' THEN '近战' WHEN category='magic' THEN '远程' WHEN category='utility' THEN '全体' WHEN category IN ('passive','bound') THEN '自身' ELSE range_type END`);
  await pool.query(`UPDATE skill_definitions SET category='magic',damage_type=CASE code WHEN 'vine_hex' THEN '木' WHEN 'vine_bolt' THEN '木' WHEN 'moonbolt' THEN '暗' WHEN 'moonlight_bolt' THEN '暗' END,skill_kind='元素',element=CASE code WHEN 'vine_hex' THEN '木' WHEN 'vine_bolt' THEN '木' WHEN 'moonbolt' THEN '暗' WHEN 'moonlight_bolt' THEN '暗' END,range_type='远程',learn_cost=CASE WHEN code IN ('vine_bolt','moonlight_bolt') THEN 1 ELSE 99 END,upgrade_cost=CASE WHEN code IN ('vine_bolt','moonlight_bolt') THEN 1 ELSE 99 END,max_level=CASE WHEN code IN ('vine_hex','moonbolt') THEN 1 ELSE 5 END,power_per_level=CASE WHEN code IN ('vine_hex','moonbolt') THEN 0 ELSE 15 END WHERE code IN ('vine_hex','vine_bolt','moonbolt','moonlight_bolt')`);
  await pool.query(`UPDATE skill_definitions SET category='utility',damage_type='无',skill_kind='辅助',element='无',range_type='全体',mana_cost=90,cooldown_turns=3,power=0,description='发出战吼，提升全队的物理与魔法攻击。' WHERE code='war_cry'`);
  await pool.query(`UPDATE skill_definitions SET category=CASE code WHEN 'thorn_burst' THEN 'physical' ELSE 'magic' END,
    damage_type=CASE code WHEN 'thorn_burst' THEN '刺击' ELSE '木' END,
    skill_kind=CASE code WHEN 'thorn_burst' THEN '刺击' ELSE '元素' END,
    element=CASE code WHEN 'thorn_burst' THEN '无' ELSE '木' END,
    range_type='远程',learn_cost=99,upgrade_cost=99,max_level=1,power_per_level=0
    WHERE code IN ('root_bind','thorn_burst','verdant_bolt')`);
  await pool.query(`INSERT INTO skill_definitions (code,name,category,damage_type,skill_kind,element,range_type,mana_cost,cooldown_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,description,passive_effect_json) VALUES
    ('longsword_mastery','长剑精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备长剑类武器时物攻提高5%至25%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','长剑','physicalAttackPct',5)),
    ('shield_mastery','盾牌精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备盾牌类武器时双防提高5%至25%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','盾牌','physicalDefensePct',5,'magicDefensePct',5)),
    ('staff_mastery','法杖精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备法杖类武器时魔攻提高5%至25%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','法杖','magicAttackPct',5)),
    ('spellbook_mastery','法书精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备法书类武器时吟唱速度提高14%至70%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','法书','chantSpeedPct',14)),
    ('orb_mastery','法球精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备法球类武器时魔力上限提高14%至70%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','法球','mpPct',14)),
    ('dagger_mastery','匕首精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备匕首类武器时双攻提高4%至20%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','匕首','physicalAttackPct',4,'magicAttackPct',4)),
    ('fistblade_mastery','拳刃精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备拳刃类武器时暴击、暴伤提高5%至25%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','拳刃','critRatePct',5,'critDamagePct',5)),
    ('craftsmanship','匠心','passive','无','技艺','无','自身',0,0,0,5,99,1,0,'随副职业等级发挥不同效果：锻造师降低耐久损耗，炼金师提高药品效果。',JSON_OBJECT('secondaryProfessionScaling','craftsmanship'))
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
  await pool.query(`UPDATE characters SET element_base_mastery_json=COALESCE(element_base_mastery_json,element_mastery_json),element_base_resistance_json=COALESCE(element_base_resistance_json,element_resistance_json)`);
  await pool.query(`UPDATE monster_templates SET element_mastery_json=COALESCE(element_mastery_json,JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0)),element_resistance_json=COALESCE(element_resistance_json,JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0))`);
  await pool.query(`UPDATE skill_definitions SET learn_cost=CASE code WHEN 'heavy_strike' THEN 1 WHEN 'armor_break' THEN 1 WHEN 'arcane_bolt' THEN 1 WHEN 'bloodletting' THEN 1 WHEN 'jump_strike' THEN 1 WHEN 'bite_slash' THEN 1 WHEN 'charge' THEN 1 WHEN 'shell_breaker' THEN 1 WHEN 'thorn_stab' THEN 1 WHEN 'mist_step_slash' THEN 1 WHEN 'vine_bolt' THEN 2 WHEN 'moonlight_bolt' THEN 2 WHEN 'spore_bolt' THEN 2 WHEN 'echo_shock' THEN 2 WHEN 'war_cry' THEN 2 WHEN 'toxic_edge' THEN 2 WHEN 'fireball' THEN 2 WHEN 'frost_bind' THEN 2 WHEN 'purifying_light' THEN 3 ELSE 99 END, upgrade_cost=CASE code WHEN 'heavy_strike' THEN 1 WHEN 'armor_break' THEN 1 WHEN 'arcane_bolt' THEN 1 WHEN 'bloodletting' THEN 1 WHEN 'jump_strike' THEN 1 WHEN 'bite_slash' THEN 1 WHEN 'charge' THEN 1 WHEN 'shell_breaker' THEN 1 WHEN 'thorn_stab' THEN 1 WHEN 'mist_step_slash' THEN 1 WHEN 'vine_bolt' THEN 2 WHEN 'moonlight_bolt' THEN 2 WHEN 'spore_bolt' THEN 2 WHEN 'echo_shock' THEN 2 WHEN 'war_cry' THEN 2 WHEN 'toxic_edge' THEN 2 WHEN 'fireball' THEN 2 WHEN 'frost_bind' THEN 2 WHEN 'purifying_light' THEN 3 ELSE 99 END, max_level=CASE WHEN code IN ('hop','bite','howl','scratch','shell_bash','spore_dart','sonic_screech','thorn_shot','mist_pounce','constrict','maul','goblin_slash','goblin_fire') THEN 1 ELSE 5 END, power_per_level=CASE WHEN code IN ('hop','bite','howl','scratch','shell_bash','spore_dart','sonic_screech','thorn_shot','mist_pounce','constrict','maul','goblin_slash','goblin_fire') THEN 0 ELSE 15 END, cooldown_reduction_per_level=CASE WHEN code IN ('heavy_strike','armor_break','fireball','toxic_edge','purifying_light','frost_bind','bloodletting','jump_strike','bite_slash','charge','war_cry','shell_breaker','spore_bolt','echo_shock','thorn_stab','mist_step_slash') THEN 1 ELSE 0 END`);
  await pool.query(`UPDATE skill_definitions SET
    learn_cost=CASE code WHEN 'blessing_aegis' THEN 2 WHEN 'mana_benediction' THEN 2 WHEN 'thunder_lance' THEN 2 ELSE 1 END,
    upgrade_cost=1,max_level=5,power_per_level=CASE WHEN code IN ('warrior_taunt','healing_prayer','blessing_aegis','mana_benediction') THEN 0 ELSE 10 END,
    cooldown_reduction_per_level=CASE WHEN code IN ('warrior_taunt','shield_counter','guard_break','arcane_shackle','ember_burst','sanctified_bolt','sweeping_slash','piercing_thrust','wind_blade','thunder_lance') THEN 1 ELSE 0 END
    WHERE code IN ('warrior_taunt','shield_counter','guard_break','arcane_shackle','ember_burst','healing_prayer','blessing_aegis','mana_benediction','sanctified_bolt','sweeping_slash','piercing_thrust','wind_blade','thunder_lance')`);
  // 主动技能的基础威力与蓝耗在所有技能（含迷宫、BOSS、NPC 技能）写入后统一校准。
  await pool.query(`UPDATE skill_definitions SET category='passive',learn_cost=99,upgrade_cost=99,max_level=1,power_per_level=0,passive_effect_json=CASE code
    WHEN 'growth_blessing' THEN JSON_OBJECT('experienceMultiplier',2)
    WHEN 'mana_affinity' THEN JSON_OBJECT('manaCostReductionPct',30)
    WHEN 'lucky_favor' THEN JSON_OBJECT('dropBonusPct',20)
    WHEN 'war_god_favor' THEN JSON_OBJECT('damageBonusPct',16)
    WHEN 'arcane_revelation' THEN JSON_OBJECT('magicDamagePct',16)
    WHEN 'crimson_recovery' THEN JSON_OBJECT('lifestealPct',16)
    WHEN 'seer_instinct' THEN JSON_OBJECT('accuracyPct',16,'critRatePct',16)
    WHEN 'hunter_blessing' THEN JSON_OBJECT('dropBonusPct',35)
    ELSE passive_effect_json END
    WHERE code IN ('growth_blessing','mana_affinity','lucky_favor','war_god_favor','arcane_revelation','crimson_recovery','seer_instinct','hunter_blessing')`);
  await pool.query(`UPDATE skill_definitions SET category='bound',skill_kind='绑定',range_type='自身',learn_cost=1,upgrade_cost=1,max_level=13,power_per_level=0,passive_effect_json=JSON_OBJECT('revealMonsterTraits',true,'unlockMonsterDetail',true),description='鉴识未知的敌对生物。慧眼每升一级可额外鉴识高于自身 3 级的目标；识珠可逐步解锁更多情报。' WHERE code='appraisal'`);
  await pool.query(`UPDATE skill_definitions SET category='bound',skill_kind='绑定',range_type='自身' WHERE code IN ('longsword_mastery','shield_mastery','staff_mastery','spellbook_mastery','orb_mastery','dagger_mastery','fistblade_mastery','craftsmanship')`);
  await pool.query(`UPDATE player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id SET ps.passive_linked=0,ps.quick_slot=NULL WHERE s.category='bound'`);
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
    ('prayer_hymn','祈祷圣音','heal_over_time',3,3,1,5,1,'每回合恢复最大生命与魔力的 3%，可叠加。'),
    ('time_guard','时隙守护','stat_modifier',1,1,1,1,0,'免疫伤害，直到自身下次出手前。'),
    ('sword_break','破甲剑痕','stat_modifier',16,3,1,5,1,'物理防御降低，可叠加。'),
    ('demon_surge','魔剑激涌','stat_modifier',16,3,1,5,1,'造成伤害提高，可叠加。'),
    ('imbalance','失衡','stat_modifier',20,3,1,1,0,'命中与闪避降低。'),
    ('shadow_curse','影咒','stat_modifier',100,3,1,1,0,'狼王的命中、闪避、双攻与双防强化。')
    ,('shield_guard','盾击守势','stat_modifier',50,1,1,1,0,'下次出手前受到的伤害降低50%。')
    ,('sprint','冲刺','stat_modifier',20,2,1,1,0,'自身速度提高。')
    ,('armor_shatter','碎甲','stat_modifier',5,2,1,1,0,'降低目标物理防御。')
    ,('bind','束缚','stat_modifier',5,2,1,1,0,'降低目标速度与闪避。')
    ,('rending','撕裂','damage_over_time',3,3,1,1,0,'每回合损失最大生命值3%。')
    ,('mist_veil','雾隐','stat_modifier',20,0,1,1,0,'下一次出招伤害提高。')
    ,('shadow_pierce','影刺','stat_modifier',1,0,1,1,0,'下一次出招必定暴击。')
    ,('battle_cry','战吼','stat_modifier',10,2,1,1,0,'物理攻击与魔法攻击提高。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),default_value=VALUES(default_value),default_duration=VALUES(default_duration),max_level=VALUES(max_level),max_stacks=VALUES(max_stacks),stackable=VALUES(stackable),description=VALUES(description)`);
  await pool.query(`DELETE se FROM skill_effects se JOIN skill_definitions s ON s.id=se.skill_id
    WHERE s.code IN ('bite','jump_strike','charge','bite_slash','mist_pounce','mist_step_slash','moonbolt','moonlight_bolt','war_cry','vine_bolt')`);
  await pool.query(`INSERT INTO skill_effects (skill_id,effect_id,effect_level,value_override,duration_override,target_scope,trigger_timing) VALUES
    ((SELECT id FROM skill_definitions WHERE code='armor_break'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,NULL,NULL,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='fireball'),(SELECT id FROM effect_definitions WHERE code='burn'),1,NULL,NULL,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='toxic_edge'),(SELECT id FROM effect_definitions WHERE code='poison'),1,NULL,NULL,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='purifying_light'),(SELECT id FROM effect_definitions WHERE code='purify'),1,NULL,NULL,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='frost_bind'),(SELECT id FROM effect_definitions WHERE code='slow'),1,NULL,NULL,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='bloodletting'),(SELECT id FROM effect_definitions WHERE code='bleeding'),1,NULL,NULL,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='hop'),(SELECT id FROM effect_definitions WHERE code='slow'),1,4,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='jump_strike'),(SELECT id FROM effect_definitions WHERE code='stun'),1,50,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='charge'),(SELECT id FROM effect_definitions WHERE code='sprint'),1,20,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='bite'),(SELECT id FROM effect_definitions WHERE code='rending'),1,3,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='bite_slash'),(SELECT id FROM effect_definitions WHERE code='armor_shatter'),1,5,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='howl'),(SELECT id FROM effect_definitions WHERE code='slow'),1,5,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='scratch'),(SELECT id FROM effect_definitions WHERE code='bleeding'),1,1,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='mist_pounce'),(SELECT id FROM effect_definitions WHERE code='mist_veil'),1,20,0,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='mist_step_slash'),(SELECT id FROM effect_definitions WHERE code='mist_veil'),1,20,0,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='maul'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,5,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='vine_hex'),(SELECT id FROM effect_definitions WHERE code='slow'),1,5,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='vine_bolt'),(SELECT id FROM effect_definitions WHERE code='bind'),1,5,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='moonbolt'),(SELECT id FROM effect_definitions WHERE code='shadow_pierce'),1,1,0,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='moonlight_bolt'),(SELECT id FROM effect_definitions WHERE code='shadow_pierce'),1,1,0,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='war_cry'),(SELECT id FROM effect_definitions WHERE code='battle_cry'),1,10,2,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='spore_dart'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,8,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='sonic_screech'),(SELECT id FROM effect_definitions WHERE code='slow'),1,8,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='thorn_shot'),(SELECT id FROM effect_definitions WHERE code='bleeding'),1,1,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='constrict'),(SELECT id FROM effect_definitions WHERE code='slow'),1,6,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_fire'),(SELECT id FROM effect_definitions WHERE code='burn'),1,1,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='root_bind'),(SELECT id FROM effect_definitions WHERE code='stun'),1,1,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='thorn_burst'),(SELECT id FROM effect_definitions WHERE code='bleeding'),1,4,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='verdant_bolt'),(SELECT id FROM effect_definitions WHERE code='slow'),1,25,2,'enemy','on_hit'),
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
    ,((SELECT id FROM skill_definitions WHERE code='frost_barrier'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,14,3,'self','on_cast')
    ,((SELECT id FROM skill_definitions WHERE code='sweeping_slash'),(SELECT id FROM effect_definitions WHERE code='rending'),1,1,2,'enemy','on_hit')
    ,((SELECT id FROM skill_definitions WHERE code='piercing_thrust'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,8,2,'enemy','on_hit')
    ,((SELECT id FROM skill_definitions WHERE code='wind_blade'),(SELECT id FROM effect_definitions WHERE code='slow'),1,8,1,'enemy','on_hit')
    ,((SELECT id FROM skill_definitions WHERE code='thunder_lance'),(SELECT id FROM effect_definitions WHERE code='stun'),1,25,1,'enemy','on_hit')
    ,((SELECT id FROM skill_definitions WHERE code='shield_bash_player'),(SELECT id FROM effect_definitions WHERE code='shield_guard'),1,50,1,'self','on_cast')
    ,((SELECT id FROM skill_definitions WHERE code='wolfking_trample'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,20,3,'enemy','on_hit')
    ,((SELECT id FROM skill_definitions WHERE code='wolfking_bite'),(SELECT id FROM effect_definitions WHERE code='bleeding'),1,5,3,'enemy','on_hit')
    ,((SELECT id FROM skill_definitions WHERE code='wolfking_fang_devour'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,10,3,'enemy','on_hit')
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
    ('tree_ent', '树精', 'elite', 7, 24,18,20,22,14,18, 1.3,1.2,1.0,1.3,0.6,1.0, JSON_ARRAY('root_bind','thorn_burst','verdant_bolt'), 180, JSON_ARRAY(JSON_OBJECT('code','magic_branch','chance',1,'quantity',1),JSON_OBJECT('code','living_wood','chance',0.50,'quantity',1))),
    ('forest_slime', '森林史莱姆', 'boss', 8, 37,28,25,31,10,15, 1.6,1.4,1.1,1.3,0.5,0.8, JSON_ARRAY('slime_bash','acid_spray','regenerate_slime'), 260, JSON_ARRAY(JSON_OBJECT('code','healing_herb','chance',1,'min_quantity',6,'max_quantity',10))),
    ('shadow_wolf_king', '幽影狼王', 'boss', 12, 18,12,34,10,31,30, 1.0,0.7,1.8,0.5,1.7,1.6, JSON_ARRAY('wolfking_summon_shadow_wolf','wolfking_trample','wolfking_rending_pounce','wolfking_bite','wolfking_shadow_curse','wolfking_fang_devour'), 720, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',1,'min_quantity',5,'max_quantity',8),JSON_OBJECT('code','beast_bone','chance',1,'min_quantity',4,'max_quantity',7),JSON_OBJECT('code','beast_hide','chance',0.9,'min_quantity',3,'max_quantity',5),JSON_OBJECT('code','beast_tendon','chance',0.8,'min_quantity',2,'max_quantity',4),JSON_OBJECT('code','beast_core','chance',0.65,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','magic_heartcore','chance',0.75,'quantity',1),JSON_OBJECT('code','sky_dust','chance',0.40,'quantity',1))),
    ('dungeon_raider', '地宫劫掠者', 'elite', 11, 28,16,31,14,21,18, 1.4,0.8,1.5,0.7,1.1,0.9, JSON_ARRAY('goblin_slash','shield_bash_player'), 280, JSON_ARRAY(JSON_OBJECT('code','beast_core','chance',0.35,'quantity',1),JSON_OBJECT('code','meteor_iron','chance',0.18,'quantity',1))),
    ('dungeon_wisp', '幽邃法灵', 'elite', 15, 19,36,15,39,20,28, 0.9,1.7,0.7,1.9,1.0,1.4, JSON_ARRAY('moonbolt','goblin_fire','vine_hex'), 420, JSON_ARRAY(JSON_OBJECT('code','beast_core','chance',0.45,'quantity',1),JSON_OBJECT('code','magic_heartcore','chance',0.30,'quantity',1))),
    ('dungeon_stalker', '暗影猎手', 'elite', 20, 33,27,37,26,42,36, 1.4,1.2,1.6,1.2,1.9,1.6, JSON_ARRAY('mist_pounce','moonbolt','bite'), 620, JSON_ARRAY(JSON_OBJECT('code','magic_heartcore','chance',0.45,'quantity',1),JSON_OBJECT('code','star_copper','chance',0.12,'quantity',1))),
    ('dungeon_guardian', '迷宫守卫', 'elite', 25, 52,25,49,20,25,31, 2.0,0.9,1.9,0.8,1.0,1.2, JSON_ARRAY('shield_bash_player','maul','howl'), 880, JSON_ARRAY(JSON_OBJECT('code','meteor_iron','chance',0.55,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.60,'quantity',1))),
    ('dungeon_warden', '迷宫镇守者', 'boss', 30, 70,48,68,45,42,55, 2.4,1.6,2.3,1.5,1.3,1.7, JSON_ARRAY('shield_bash_player','maul','goblin_fire','howl'), 1600, JSON_ARRAY(JSON_OBJECT('code','meteor_iron','chance',1,'min_quantity',4,'max_quantity',7),JSON_OBJECT('code','star_copper','chance',0.60,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','beast_core','chance',1,'min_quantity',2,'max_quantity',4)))
    ON DUPLICATE KEY UPDATE name=VALUES(name),monster_class=VALUES(monster_class),level=VALUES(level),constitution=VALUES(constitution),spirit=VALUES(spirit),strength=VALUES(strength),intelligence=VALUES(intelligence),agility=VALUES(agility),perception=VALUES(perception),constitution_growth=VALUES(constitution_growth),spirit_growth=VALUES(spirit_growth),strength_growth=VALUES(strength_growth),intelligence_growth=VALUES(intelligence_growth),agility_growth=VALUES(agility_growth),perception_growth=VALUES(perception_growth),skill_sequence=VALUES(skill_sequence),experience=VALUES(experience),drops_json=VALUES(drops_json)`);
  await pool.query(`UPDATE monster_templates SET weakness_json=CASE code WHEN 'ball_rabbit' THEN JSON_ARRAY('刺击') WHEN 'spike_boar' THEN JSON_ARRAY('斩击') WHEN 'vine_snake' THEN JSON_ARRAY('斩击') WHEN 'black_bear' THEN JSON_ARRAY('刺击') WHEN 'mist_wolf' THEN JSON_ARRAY('打击') WHEN 'roll_rabbit' THEN JSON_ARRAY('刺击') WHEN 'tusk_boar' THEN JSON_ARRAY('斩击') WHEN 'vine_python' THEN JSON_ARRAY('斩击') WHEN 'pitch_bear' THEN JSON_ARRAY('刺击') WHEN 'shadow_wolf' THEN JSON_ARRAY('打击') WHEN 'shadow_wolf_king' THEN JSON_ARRAY('打击','光') WHEN 'goblin' THEN JSON_ARRAY('打击') WHEN 'tree_ent' THEN JSON_ARRAY('斩击') WHEN 'forest_slime' THEN JSON_ARRAY('刺击') ELSE weakness_json END, resistance_json=CASE code WHEN 'ball_rabbit' THEN JSON_ARRAY('打击') WHEN 'spike_boar' THEN JSON_ARRAY('刺击') WHEN 'vine_snake' THEN JSON_ARRAY('刺击') WHEN 'black_bear' THEN JSON_ARRAY('打击') WHEN 'mist_wolf' THEN JSON_ARRAY('斩击') WHEN 'roll_rabbit' THEN JSON_ARRAY('打击') WHEN 'tusk_boar' THEN JSON_ARRAY('刺击') WHEN 'vine_python' THEN JSON_ARRAY('刺击') WHEN 'pitch_bear' THEN JSON_ARRAY('打击') WHEN 'shadow_wolf' THEN JSON_ARRAY('斩击') WHEN 'shadow_wolf_king' THEN JSON_ARRAY('斩击','暗') WHEN 'goblin' THEN JSON_ARRAY('刺击') WHEN 'tree_ent' THEN JSON_ARRAY('刺击') WHEN 'forest_slime' THEN JSON_ARRAY('打击') ELSE resistance_json END`);
  await pool.query(`UPDATE monster_templates SET element_mastery_json=CASE code
    WHEN 'vine_snake' THEN JSON_OBJECT('水',0,'火',0,'土',0,'木',12,'风',0,'冰',0,'雷',0,'光',0,'暗',0)
    WHEN 'vine_python' THEN JSON_OBJECT('水',0,'火',0,'土',0,'木',20,'风',0,'冰',0,'雷',0,'光',0,'暗',0)
    WHEN 'mist_wolf' THEN JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',12)
    WHEN 'shadow_wolf' THEN JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',20)
    WHEN 'goblin' THEN JSON_OBJECT('水',0,'火',10,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0)
    WHEN 'tree_ent' THEN JSON_OBJECT('水',0,'火',0,'土',0,'木',24,'风',0,'冰',0,'雷',0,'光',0,'暗',0)
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
    WHEN 'tree_ent' THEN JSON_OBJECT('水',0,'火',-25,'土',8,'木',25,'风',0,'冰',0,'雷',0,'光',0,'暗',0)
    ELSE element_resistance_json END`);
  await pool.query(`DELETE r FROM monster_skill_learn_rules r JOIN monster_templates t ON t.id=r.monster_template_id WHERE t.code IN ('ball_rabbit','spike_boar','vine_snake','black_bear','mist_wolf','roll_rabbit','tusk_boar','vine_python','pitch_bear','shadow_wolf','goblin')`);
  await pool.query(`INSERT INTO monster_skill_learn_rules (monster_template_id,source_skill_code,skill_id,chance) VALUES
    ((SELECT id FROM monster_templates WHERE code='ball_rabbit'),'hop',(SELECT id FROM skill_definitions WHERE code='jump_strike'),0.20000),
    ((SELECT id FROM monster_templates WHERE code='roll_rabbit'),'hop',(SELECT id FROM skill_definitions WHERE code='jump_strike'),0.20000),
    ((SELECT id FROM monster_templates WHERE code='spike_boar'),'charge',(SELECT id FROM skill_definitions WHERE code='charge'),0.40000),
    ((SELECT id FROM monster_templates WHERE code='tusk_boar'),'charge',(SELECT id FROM skill_definitions WHERE code='charge'),0.40000),
    ((SELECT id FROM monster_templates WHERE code='vine_snake'),'bite',(SELECT id FROM skill_definitions WHERE code='bite_slash'),0.20000),
    ((SELECT id FROM monster_templates WHERE code='vine_python'),'bite',(SELECT id FROM skill_definitions WHERE code='bite_slash'),0.20000),
    ((SELECT id FROM monster_templates WHERE code='vine_snake'),'vine_hex',(SELECT id FROM skill_definitions WHERE code='vine_bolt'),0.20000),
    ((SELECT id FROM monster_templates WHERE code='vine_python'),'vine_hex',(SELECT id FROM skill_definitions WHERE code='vine_bolt'),0.20000),
    ((SELECT id FROM monster_templates WHERE code='mist_wolf'),'mist_pounce',(SELECT id FROM skill_definitions WHERE code='mist_step_slash'),0.10000),
    ((SELECT id FROM monster_templates WHERE code='shadow_wolf'),'mist_pounce',(SELECT id FROM skill_definitions WHERE code='mist_step_slash'),0.10000),
    ((SELECT id FROM monster_templates WHERE code='mist_wolf'),'moonbolt',(SELECT id FROM skill_definitions WHERE code='moonlight_bolt'),0.10000),
    ((SELECT id FROM monster_templates WHERE code='shadow_wolf'),'moonbolt',(SELECT id FROM skill_definitions WHERE code='moonlight_bolt'),0.10000),
    ((SELECT id FROM monster_templates WHERE code='pitch_bear'),'howl',(SELECT id FROM skill_definitions WHERE code='war_cry'),0.05000)`);
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
    ((SELECT id FROM monster_templates WHERE code='goblin'), '一团微弱火光在雾中跳动，哥布林正咧嘴念着听不懂的咒语。'),
    ((SELECT id FROM monster_templates WHERE code='tree_ent'), '前方的古树缓缓拔起根须，枝叶间亮起幽绿的魔力光点——那竟是一只树精。'),
    ((SELECT id FROM monster_templates WHERE code='tree_ent'), '藤蔓忽然封住林间小径，沉睡的树精睁开树洞般的双眼，根须在泥土中翻涌。'),
    ((SELECT id FROM monster_templates WHERE code='shadow_wolf_king'), '林间的阴影被无形利爪撕开，幽蓝狼瞳居高临下地注视着你——幽影狼王现身了。'),
    ((SELECT id FROM monster_templates WHERE code='shadow_wolf_king'), '低沉狼嚎压过整片密林，雾气向两侧退散，庞大的幽影狼王踏着暗影而来。')`);
  await pool.query(`DELETE p FROM map_monster_pools p JOIN map_regions r ON r.id=p.region_id JOIN monster_templates t ON t.id=p.monster_template_id WHERE r.code='dark_forest' AND t.code NOT IN ('ball_rabbit','spike_boar','vine_snake','black_bear','mist_wolf','roll_rabbit','tusk_boar','vine_python','pitch_bear','shadow_wolf','goblin','tree_ent','forest_slime','shadow_wolf_king')`);
  await pool.query(`DELETE s FROM monster_spawns s JOIN map_regions r ON r.id=s.region_id JOIN monster_templates t ON t.id=s.template_id WHERE r.code='dark_forest' AND s.defeated_at IS NULL AND t.code NOT IN ('ball_rabbit','spike_boar','vine_snake','black_bear','mist_wolf','roll_rabbit','tusk_boar','vine_python','pitch_bear','shadow_wolf','goblin','tree_ent','forest_slime','shadow_wolf_king')`);
  await pool.query(`INSERT INTO map_monster_pools (region_id, monster_template_id, spawn_weight)
    SELECT r.id, t.id, CASE t.code WHEN 'ball_rabbit' THEN 24 WHEN 'spike_boar' THEN 18 WHEN 'vine_snake' THEN 16 WHEN 'black_bear' THEN 12 WHEN 'mist_wolf' THEN 18 WHEN 'roll_rabbit' THEN 4 WHEN 'tusk_boar' THEN 3 WHEN 'vine_python' THEN 4 WHEN 'pitch_bear' THEN 1 WHEN 'shadow_wolf' THEN 3 WHEN 'goblin' THEN 4 WHEN 'tree_ent' THEN 3 WHEN 'forest_slime' THEN 1 WHEN 'shadow_wolf_king' THEN 1 END
    FROM map_regions r JOIN monster_templates t ON t.code IN ('ball_rabbit','spike_boar','vine_snake','black_bear','mist_wolf','roll_rabbit','tusk_boar','vine_python','pitch_bear','shadow_wolf','goblin','tree_ent','forest_slime','shadow_wolf_king')
    WHERE r.code='dark_forest'
    ON DUPLICATE KEY UPDATE spawn_weight=VALUES(spawn_weight)`);
  await pool.query(`INSERT INTO map_resource_pools (region_id,item_id,spawn_density)
    SELECT r.id,i.id,CASE i.code WHEN 'living_wood' THEN 0.01000 WHEN 'meteor_iron' THEN 0.00100 WHEN 'star_copper' THEN 0.00010 WHEN 'moon_silver' THEN 0.00001 END
    FROM map_regions r JOIN item_definitions i ON i.code IN ('living_wood','meteor_iron','star_copper','moon_silver')
    WHERE r.code='dark_forest'
    ON DUPLICATE KEY UPDATE spawn_density=VALUES(spawn_density)`);
  await pool.query(`INSERT INTO map_resource_pools (region_id,item_id,spawn_density)
    SELECT r.id,i.id,CASE i.code WHEN 'living_wood' THEN 0.03000 WHEN 'meteor_iron' THEN 0.00500 WHEN 'star_copper' THEN 0.00050 WHEN 'moon_silver' THEN 0.00005 END
    FROM map_regions r JOIN item_definitions i ON i.code IN ('living_wood','meteor_iron','star_copper','moon_silver')
    WHERE r.code='dark_forest_deep'
    ON DUPLICATE KEY UPDATE spawn_density=VALUES(spawn_density)`);
  await pool.query(`DELETE n FROM map_npcs n JOIN map_regions r ON r.id=n.region_id WHERE r.code='baina_town' AND n.code NOT IN ('pear_guide','guild_counter','saint_church','blacksmith','alchemy_sweetshop','oddworkshop','bookshop','baina_residence')`);
  await pool.query(`DELETE n FROM map_npcs n JOIN map_regions r ON r.id=n.region_id WHERE r.code='dark_forest'`);
  await pool.query(`INSERT INTO map_npcs (region_id, code, name, description, interaction_kind, pos_x, pos_y, pos_z) VALUES
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'pear_guide', '梨子喵（新人引导）', '笑容明快的猫族新手引导员，像是正专程在等你。', 'npc', -22, -128, 0),
    ((SELECT id FROM map_regions WHERE code='world_tree'), 'tree_keeper', '树守·阿鲁', '守望世界树的沉默老人。', 'npc', 0, 0, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'guild_counter', '冒险者公会', '承接委托、登记冒险者与交换情报的大厅。', 'building', -2, -111, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'saint_church', '圣恩教堂', '彩窗将柔和的光投在长椅间。一位修女正安静整理祭台前的白花，向每位来客报以温雅的微笑。', 'building', -9, -103, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'blacksmith', '铁匠铺', '炉火终日不熄。年轻的店主漠北正站在铁砧前，铁锤敲击声从半开的门里传来。', 'building', -17, -123, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'alchemy_sweetshop', '糖水屋', '“晴空糖水屋”的门口挂着晴空色风铃，甜香与清新的草药气息一同飘出。', 'building', -12, -128, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'oddworkshop', '异工坊', '异工坊的门牌歪斜地挂在墙上，屋内不时传出弹簧、齿轮与不明小玩意的清脆响动。', 'building', 6, -121, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'bookshop', '百味书屋', '三层高的书屋挤满了书架与求知的人。窗边一位白须老人正抱着厚重的百科全书，逐字细读。', 'building', 14, -108, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'baina_residence', '百纳居', '挂着木材与石料样本的生活工坊，负责出售建材、兑换锻材并协助冒险者安置小屋。', 'building', 7, -99, 0),
    ((SELECT id FROM map_regions WHERE code='dark_forest'), 'hunter_lodge', '猎户小屋', '林间有一座覆着苔藓的木屋。门边挂着风干兽皮与一张旧弓，屋内偶尔传出磨箭的细响。', 'building', 18, -55, 0)
    ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), interaction_kind=VALUES(interaction_kind), pos_x=VALUES(pos_x), pos_y=VALUES(pos_y), pos_z=VALUES(pos_z)`);
  await pool.query(`INSERT INTO map_special_objects (region_id, code, name, description, pos_x, pos_y, pos_z) VALUES
    ((SELECT id FROM map_regions WHERE code='world_tree'), 'world_tree_altar', '世界树祭坛', '被古老根须环抱的石质祭坛。', 0, 0, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'dark_forest_entrance', '幽暗密林入口', '向北望去，丛丛的密林浓郁成一抹幽绿。', -25, -86, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'dark_forest_deep_entrance', '幽暗密林深处入口', '向南延伸的古林愈发幽暗，那里通往幽暗密林深处。', -25, -135, 0),
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
  await pool.query(`INSERT IGNORE INTO map_move_texts (region_id, description) VALUES
    ((SELECT id FROM map_regions WHERE code='dark_forest_deep'), '古树的冠盖遮蔽了天光，脚下的腐叶层深得几乎没有声响。'),
    ((SELECT id FROM map_regions WHERE code='dark_forest_deep'), '空气里混杂着湿土与陈旧木质的气息，远处偶有低沉的回响。')`);
  await pool.query(`UPDATE characters c JOIN map_regions r ON r.id=c.current_region_id
    SET c.pos_x=-22,c.pos_y=-128 WHERE r.code='baina_town' AND (c.pos_x NOT BETWEEN -25 AND 24 OR c.pos_y NOT BETWEEN -135 AND -86)`);
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
  // 地下迷宫第二版：史莱姆、亡灵与分层守卫。迷宫结构会在下一次刷新时重新生成。
  await pool.query(`INSERT INTO skill_definitions (code,name,category,damage_type,skill_kind,element,range_type,mana_cost,cooldown_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,description) VALUES
    ('slime_bump','胶质撞击','physical','打击','打击','无','近战',8,0,92,99,99,1,0,'史莱姆以弹性的身躯撞向目标。'),
    ('slime_ember_blob','炽泡弹','magic','火','元素','火','远程',16,2,92,99,99,1,0,'赤红胶质凝成一枚灼热泡弹。'),
    ('slime_amber_blob','琥珀泡弹','magic','土','元素','土','远程',18,2,96,99,99,1,0,'橙色胶质裹着砂砾与热气砸向目标。'),
    ('slime_spark_blob','电浆泡弹','magic','雷','元素','雷','远程',20,2,94,99,99,1,0,'明黄电浆在触及目标时骤然炸开。'),
    ('slime_acid_blob','酸蚀泡弹','magic','木','元素','木','远程',18,2,94,99,99,1,0,'翠绿泡液会在目标表面留下腐蚀痕迹。'),
    ('slime_tide_blob','潮涌泡弹','magic','水','元素','水','远程',18,2,92,99,99,1,0,'青色水泡破裂后化作拖拽脚步的潮意。'),
    ('slime_frost_blob','霜冻泡弹','magic','冰','元素','冰','远程',20,2,96,99,99,1,0,'蓝色寒胶炸散为刺骨冰雾。'),
    ('slime_dusk_blob','暮光泡弹','magic','暗','元素','暗','远程',22,2,100,99,99,1,0,'紫色黏液吞没光线，令敌人短暂失神。'),
    ('black_slime_crush','暗胶重压','physical','打击','打击','无','近战',38,1,128,99,99,1,0,'黑暗史莱姆将身躯压缩成沉重的胶质铁锤。'),
    ('black_slime_wave','幽蚀浪涌','magic','暗','元素','暗','全体',48,2,105,99,99,1,0,'翻滚的黑色胶浪向所有敌人漫去。'),
    ('black_slime_mend','暗胶再生','utility','无','强化','无','自身',42,3,0,99,99,1,0,'吞噬地缝中的阴影，缓慢重组身躯。'),
    ('black_slime_bind','暗幕缠附','magic','暗','元素','暗','全体',56,3,98,99,99,1,0,'黑色胶幕攀上所有敌人的双足，限制其行动。'),
    ('skeleton_cleave','骨刃横扫','physical','斩击','斩击','无','近战',34,1,122,99,99,1,0,'亡灵骨刃划出横斩。'),
    ('skeleton_bolt','魂火箭','magic','暗','元素','暗','远程',38,2,118,99,99,1,0,'将微弱魂火压成一束飞矢。'),
    ('skeleton_command','亡者号令','utility','无','强化','无','全体',52,3,0,99,99,1,0,'将军的号令令亡灵军势暂时高涨。'),
    ('skeleton_execution','断首斩','physical','斩击','斩击','无','近战',60,3,148,99,99,1,0,'对生命垂危的敌人施以沉重斩击。'),
    ('skeleton_impale','骨枪穿刺','physical','刺击','刺击','无','近战',48,2,136,99,99,1,0,'将军以骨制长枪贯穿目标，并留下难以愈合的创口。'),
    ('skeleton_quake','军阵震击','physical','打击','打击','无','全体',62,3,106,99,99,1,0,'踏碎地砖的冲击沿着军阵扩散，令所有敌人失去平衡。'),
    ('skeleton_guard','骸骨壁垒','utility','无','强化','无','自身',58,4,0,99,99,1,0,'破碎骨甲在将军身前重新拼成厚重壁垒。'),
    ('death_knight_charge','死骑冲锋','physical','刺击','刺击','无','近战',52,2,138,99,99,1,0,'亡灵战马的残影裹着骑枪突进。'),
    ('death_knight_aura','枯荣军势','utility','无','强化','无','自身',55,4,0,99,99,1,0,'死亡骑士以腐朽军势巩固防线。'),
    ('death_knight_cleave','亡骑横斩','physical','斩击','斩击','无','全体',66,3,112,99,99,1,0,'骑枪横扫后接上宽阔斩击，逼退周围所有敌人。'),
    ('death_knight_lance','冥枪贯心','physical','刺击','刺击','无','近战',72,3,158,99,99,1,0,'凝聚死亡气息的一枪，专门刺向虚弱的目标。'),
    ('death_knight_prison','幽冥锁阵','magic','暗','元素','暗','全体',70,4,104,99,99,1,0,'死亡符文在地面闭合，锁链自阴影中缠向全体敌人。'),
    ('necromancer_raise','唤醒残骸','utility','无','召唤','无','全体',72,3,0,99,99,1,0,'乌兹以咒文唤起两具骸骨为其作战。'),
    ('necromancer_bolt','死灵飞矢','magic','暗','元素','暗','远程',60,1,128,99,99,1,0,'凝聚死亡魔力，穿透式轰击目标。'),
    ('necromancer_curse','衰朽诅咒','magic','暗','元素','暗','远程',65,2,106,99,99,1,0,'将衰朽气息附着在目标防线上。'),
    ('necromancer_storm','冥魂风暴','magic','暗','元素','暗','全体',82,3,118,99,99,1,0,'成群哀嚎的灵魂掠过全场。'),
    ('necromancer_rebirth','魂匣回响','utility','无','强化','无','自身',95,5,0,99,99,1,0,'乌兹撕开魂匣的一角，重新凝聚濒散的灵魂。'),
    ('necromancer_grave_bind','墓影禁锢','magic','暗','元素','暗','全体',78,4,102,99,99,1,0,'墓穴阴影化作锁链，压住所有敌人的身形与意识。'),
    ('necromancer_soul_drain','灵魂汲取','magic','暗','元素','暗','远程',76,3,134,99,99,1,0,'从生命最衰弱的敌人身上抽取灵魂，反哺施术者。'),
    ('necromancer_purging_mist','亡雾涤净','utility','无','灵异','无','自身',68,5,0,99,99,1,0,'冰冷亡雾洗去自身的异常，并凝成一层短暂护盾。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),damage_type=VALUES(damage_type),skill_kind=VALUES(skill_kind),element=VALUES(element),range_type=VALUES(range_type),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),description=VALUES(description)`);
  // 不直接攻击或造成伤害的祝福、治疗与自我强化统一归为辅助；元素、能量、灵异仍作为辅助技能的种类保留。
  await pool.query(`UPDATE skill_definitions SET category='utility',damage_type='无',skill_kind='元素',element=CASE code
    WHEN 'purifying_light' THEN '光' WHEN 'frost_barrier' THEN '冰' WHEN 'healing_light' THEN '光'
    WHEN 'blessing_hymn' THEN '光' WHEN 'healing_prayer' THEN '光' WHEN 'blessing_aegis' THEN '光'
    WHEN 'mana_benediction' THEN '光' WHEN 'regenerate_slime' THEN '木' END,
    range_type=CASE code WHEN 'purifying_light' THEN '自身' WHEN 'frost_barrier' THEN '自身'
      WHEN 'healing_light' THEN '远程' WHEN 'healing_prayer' THEN '远程' ELSE '全体' END,power=0
    WHERE code IN ('purifying_light','frost_barrier','healing_light','blessing_hymn','healing_prayer','blessing_aegis','mana_benediction','regenerate_slime')`);
  await pool.query(`UPDATE skill_definitions SET skill_kind=CASE
    WHEN code IN ('war_cry','warrior_taunt_player') THEN '能量'
    WHEN code IN ('purifying_light','frost_barrier','healing_light','blessing_hymn','healing_prayer','blessing_aegis','mana_benediction','regenerate_slime') THEN '元素'
    ELSE '灵异' END
    WHERE category='utility'`);
  // 主动攻击技能按冷却档位统一基础数值：0 回合可连续施放，因此显著低于 1 回合档；
  // 1/2/3 回合分别控制在 110、120、130 威力以内，蓝耗约为 50/90/160。
  await pool.query(`UPDATE skill_definitions SET
    power=CASE cooldown_turns
      WHEN 0 THEN 90 WHEN 1 THEN 108 WHEN 2 THEN 116 WHEN 3 THEN 126 WHEN 4 THEN 134 WHEN 5 THEN 142 ELSE power END,
    mana_cost=CASE cooldown_turns
      WHEN 0 THEN 30 WHEN 1 THEN 50 WHEN 2 THEN 90 WHEN 3 THEN 160 WHEN 4 THEN 210 WHEN 5 THEN 260 ELSE mana_cost END
    WHERE category IN ('physical','magic') AND power>0`);
  // 辅助技能不按攻击技能档位计算；其蓝耗固定为原设计蓝耗的三倍，避免每次启动重复累乘。
  await pool.query(`UPDATE skill_definitions SET mana_cost=CASE code
    WHEN 'warrior_taunt_player' THEN 75 WHEN 'smoke_screen' THEN 105 WHEN 'purifying_light' THEN 270
    WHEN 'frost_barrier' THEN 180 WHEN 'healing_light' THEN 150 WHEN 'blessing_hymn' THEN 195
    WHEN 'war_cry' THEN 270 WHEN 'regenerate_slime' THEN 165 WHEN 'healing_prayer' THEN 195
    WHEN 'blessing_aegis' THEN 225 WHEN 'mana_benediction' THEN 240 WHEN 'wolfking_summon_shadow_wolf' THEN 240
    WHEN 'wolfking_shadow_curse' THEN 270 WHEN 'black_slime_mend' THEN 126 WHEN 'skeleton_command' THEN 156
    WHEN 'skeleton_guard' THEN 174 WHEN 'death_knight_aura' THEN 165 WHEN 'necromancer_raise' THEN 216
    WHEN 'necromancer_rebirth' THEN 285 WHEN 'necromancer_purging_mist' THEN 204 ELSE mana_cost END
    WHERE category='utility'`);
  await pool.query(`DELETE se FROM skill_effects se JOIN skill_definitions s ON s.id=se.skill_id WHERE s.code IN ('slime_ember_blob','slime_amber_blob','slime_spark_blob','slime_acid_blob','slime_tide_blob','slime_frost_blob','slime_dusk_blob','black_slime_wave','black_slime_mend','black_slime_bind','skeleton_command','skeleton_impale','skeleton_quake','skeleton_guard','death_knight_charge','death_knight_aura','death_knight_cleave','death_knight_lance','death_knight_prison','necromancer_curse','necromancer_storm','necromancer_rebirth','necromancer_grave_bind','necromancer_purging_mist')`);
  await pool.query(`INSERT INTO skill_effects (skill_id,effect_id,effect_level,value_override,duration_override,target_scope,trigger_timing) VALUES
    ((SELECT id FROM skill_definitions WHERE code='slime_ember_blob'),(SELECT id FROM effect_definitions WHERE code='burn'),1,2,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='slime_amber_blob'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,5,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='slime_spark_blob'),(SELECT id FROM effect_definitions WHERE code='stun'),1,18,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='slime_acid_blob'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,8,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='slime_tide_blob'),(SELECT id FROM effect_definitions WHERE code='slow'),1,8,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='slime_frost_blob'),(SELECT id FROM effect_definitions WHERE code='bind'),1,8,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='slime_dusk_blob'),(SELECT id FROM effect_definitions WHERE code='shadow_pierce'),1,1,0,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='black_slime_wave'),(SELECT id FROM effect_definitions WHERE code='slow'),1,12,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='black_slime_mend'),(SELECT id FROM effect_definitions WHERE code='regeneration'),1,7,3,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='black_slime_bind'),(SELECT id FROM effect_definitions WHERE code='bind'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='skeleton_command'),(SELECT id FROM effect_definitions WHERE code='battle_cry'),1,15,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='skeleton_impale'),(SELECT id FROM effect_definitions WHERE code='rending'),1,3,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='skeleton_quake'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,18,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='skeleton_guard'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,22,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='death_knight_charge'),(SELECT id FROM effect_definitions WHERE code='sprint'),1,18,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='death_knight_aura'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,18,3,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='death_knight_aura'),(SELECT id FROM effect_definitions WHERE code='regeneration'),1,5,3,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='death_knight_cleave'),(SELECT id FROM effect_definitions WHERE code='slow'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='death_knight_lance'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,12,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='death_knight_prison'),(SELECT id FROM effect_definitions WHERE code='bind'),1,18,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='necromancer_curse'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,15,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='necromancer_storm'),(SELECT id FROM effect_definitions WHERE code='burn'),1,4,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='necromancer_rebirth'),(SELECT id FROM effect_definitions WHERE code='regeneration'),1,10,3,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='necromancer_grave_bind'),(SELECT id FROM effect_definitions WHERE code='bind'),1,20,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='necromancer_grave_bind'),(SELECT id FROM effect_definitions WHERE code='stun'),1,30,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='necromancer_purging_mist'),(SELECT id FROM effect_definitions WHERE code='purify'),1,1,0,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='necromancer_purging_mist'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,25,2,'self','on_cast')
    ON DUPLICATE KEY UPDATE value_override=VALUES(value_override),duration_override=VALUES(duration_override),target_scope=VALUES(target_scope),trigger_timing=VALUES(trigger_timing)`);
  await pool.query(`INSERT INTO monster_templates (code,name,monster_class,level,constitution,spirit,strength,intelligence,agility,perception,constitution_growth,spirit_growth,strength_growth,intelligence_growth,agility_growth,perception_growth,skill_sequence,experience,drops_json,weakness_json,resistance_json,element_mastery_json,element_resistance_json) VALUES
    ('slime_red','红色史莱姆','normal',1,10,5,7,7,5,5,.7,.4,.5,.5,.3,.3,JSON_ARRAY('slime_bump','slime_ember_blob'),38,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.34,'min_quantity',2,'max_quantity',7),JSON_OBJECT('code','slime_gel','chance',.55,'min_quantity',1,'max_quantity',2)),JSON_ARRAY('冰'),JSON_ARRAY('火'),JSON_OBJECT('火',8),JSON_OBJECT('火',8)),
    ('slime_orange','橙色史莱姆','normal',2,13,5,8,6,4,5,.8,.3,.6,.4,.2,.3,JSON_ARRAY('slime_bump','slime_amber_blob'),44,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.36,'min_quantity',3,'max_quantity',8),JSON_OBJECT('code','slime_gel','chance',.60,'min_quantity',1,'max_quantity',2)),JSON_ARRAY('水'),JSON_ARRAY('土'),JSON_OBJECT('土',8),JSON_OBJECT('土',8)),
    ('slime_yellow','黄色史莱姆','normal',3,8,7,6,9,9,8,.5,.5,.4,.7,.7,.6,JSON_ARRAY('slime_bump','slime_spark_blob'),50,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.38,'min_quantity',3,'max_quantity',9),JSON_OBJECT('code','slime_gel','chance',.65,'min_quantity',1,'max_quantity',3)),JSON_ARRAY('土'),JSON_ARRAY('雷'),JSON_OBJECT('雷',9),JSON_OBJECT('雷',9)),
    ('slime_green','绿色史莱姆','normal',4,12,8,7,10,5,7,.8,.6,.5,.8,.3,.5,JSON_ARRAY('slime_bump','slime_acid_blob'),57,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.40,'min_quantity',4,'max_quantity',10),JSON_OBJECT('code','slime_gel','chance',.70,'min_quantity',1,'max_quantity',3)),JSON_ARRAY('火'),JSON_ARRAY('木'),JSON_OBJECT('木',10),JSON_OBJECT('木',10)),
    ('slime_cyan','青色史莱姆','normal',5,10,11,6,12,8,8,.6,.8,.4,.9,.6,.6,JSON_ARRAY('slime_bump','slime_tide_blob'),65,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.42,'min_quantity',4,'max_quantity',12),JSON_OBJECT('code','slime_gel','chance',.75,'min_quantity',2,'max_quantity',3)),JSON_ARRAY('雷'),JSON_ARRAY('水'),JSON_OBJECT('水',12),JSON_OBJECT('水',12)),
    ('slime_blue','蓝色史莱姆','normal',6,15,10,8,11,4,6,1,.7,.6,.8,.3,.4,JSON_ARRAY('slime_bump','slime_frost_blob'),74,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.44,'min_quantity',5,'max_quantity',13),JSON_OBJECT('code','slime_gel','chance',.80,'min_quantity',2,'max_quantity',4)),JSON_ARRAY('火'),JSON_ARRAY('冰'),JSON_OBJECT('冰',12),JSON_OBJECT('冰',12)),
    ('slime_purple','紫色史莱姆','normal',8,11,15,6,16,7,12,.7,1.1,.4,1.2,.5,.9,JSON_ARRAY('slime_bump','slime_dusk_blob'),92,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.46,'min_quantity',6,'max_quantity',15),JSON_OBJECT('code','slime_gel','chance',.85,'min_quantity',2,'max_quantity',4)),JSON_ARRAY('光'),JSON_ARRAY('暗'),JSON_OBJECT('暗',15),JSON_OBJECT('暗',15)),
    ('black_slime','黑暗史莱姆','boss',10,31,22,20,26,12,18,1.5,1.3,1.1,1.5,.6,1,JSON_ARRAY('black_slime_crush','black_slime_bind','black_slime_wave','black_slime_mend'),260,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',1,'min_quantity',30,'max_quantity',70),JSON_OBJECT('code','silver_coin','chance',.12,'quantity',1),JSON_OBJECT('code','slime_gel','chance',1,'min_quantity',10,'max_quantity',18)),JSON_ARRAY('光'),JSON_ARRAY('暗'),JSON_OBJECT('暗',25),JSON_OBJECT('暗',25)),
    ('skeleton','骷髅','large',16,24,9,27,8,15,12,1.1,.4,1.3,.3,.7,.5,JSON_ARRAY('skeleton_cleave'),180,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.55,'min_quantity',8,'max_quantity',18)),JSON_ARRAY('打击','光'),JSON_ARRAY('刺击'),JSON_OBJECT(),JSON_OBJECT('暗',8)),
    ('undead','亡灵','large',17,20,22,16,26,14,23,.9,1.2,.8,1.5,.6,1.2,JSON_ARRAY('skeleton_bolt','slime_dusk_blob'),210,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.58,'min_quantity',10,'max_quantity',22),JSON_OBJECT('code','silver_coin','chance',.06,'quantity',1)),JSON_ARRAY('光'),JSON_ARRAY('暗'),JSON_OBJECT('暗',22),JSON_OBJECT('暗',18)),
    ('skeleton_warrior','骷髅战士','elite',19,33,12,37,10,20,16,1.5,.5,1.7,.4,.9,.7,JSON_ARRAY('skeleton_cleave','skeleton_execution'),380,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.8,'min_quantity',20,'max_quantity',42),JSON_OBJECT('code','silver_coin','chance',.18,'quantity',1)),JSON_ARRAY('打击','光'),JSON_ARRAY('刺击'),JSON_OBJECT(),JSON_OBJECT('暗',12)),
    ('death_wight','死灵','elite',20,28,30,19,33,17,28,1.2,1.6,.8,1.8,.7,1.5,JSON_ARRAY('skeleton_bolt','necromancer_curse'),440,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.85,'min_quantity',25,'max_quantity',50),JSON_OBJECT('code','silver_coin','chance',.22,'quantity',1)),JSON_ARRAY('光'),JSON_ARRAY('暗'),JSON_OBJECT('暗',30),JSON_OBJECT('暗',25)),
    ('skeleton_general','骷髅将军','boss',22,48,21,55,18,24,25,2,.8,2.2,.7,1,.9,JSON_ARRAY('skeleton_command','skeleton_quake','skeleton_cleave','skeleton_impale','skeleton_guard','skeleton_execution'),760,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',1,'min_quantity',80,'max_quantity',160),JSON_OBJECT('code','silver_coin','chance',.45,'min_quantity',1,'max_quantity',3)),JSON_ARRAY('打击','光'),JSON_ARRAY('刺击'),JSON_OBJECT(),JSON_OBJECT('暗',18)),
    ('death_knight','死灵骑士','boss',22,44,29,49,28,31,27,1.8,1.3,2,1.2,1.4,1.1,JSON_ARRAY('death_knight_charge','death_knight_prison','death_knight_cleave','skeleton_bolt','death_knight_aura','death_knight_lance'),820,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',1,'min_quantity',85,'max_quantity',170),JSON_OBJECT('code','silver_coin','chance',.5,'min_quantity',1,'max_quantity',3)),JSON_ARRAY('光'),JSON_ARRAY('暗'),JSON_OBJECT('暗',38),JSON_OBJECT('暗',28)),
    ('necromancer_uz','死灵法师·乌兹','boss',32,52,72,28,78,34,61,2,2.8,1,3,1.2,2.1,JSON_ARRAY('necromancer_raise','necromancer_curse','necromancer_grave_bind','necromancer_bolt','necromancer_storm','necromancer_soul_drain','necromancer_rebirth','necromancer_purging_mist'),1800,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',1,'min_quantity',160,'max_quantity',340),JSON_OBJECT('code','silver_coin','chance',.75,'min_quantity',2,'max_quantity',6)),JSON_ARRAY('光'),JSON_ARRAY('暗'),JSON_OBJECT('暗',70),JSON_OBJECT('暗',55))
    ON DUPLICATE KEY UPDATE name=VALUES(name),monster_class=VALUES(monster_class),level=VALUES(level),constitution=VALUES(constitution),spirit=VALUES(spirit),strength=VALUES(strength),intelligence=VALUES(intelligence),agility=VALUES(agility),perception=VALUES(perception),constitution_growth=VALUES(constitution_growth),spirit_growth=VALUES(spirit_growth),strength_growth=VALUES(strength_growth),intelligence_growth=VALUES(intelligence_growth),agility_growth=VALUES(agility_growth),perception_growth=VALUES(perception_growth),skill_sequence=VALUES(skill_sequence),experience=VALUES(experience),drops_json=VALUES(drops_json),weakness_json=VALUES(weakness_json),resistance_json=VALUES(resistance_json),element_mastery_json=VALUES(element_mastery_json),element_resistance_json=VALUES(element_resistance_json)`);
  await pool.query(`UPDATE monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    SET s.skill_sequence=t.skill_sequence WHERE s.defeated_at IS NULL AND t.code IN ('black_slime','skeleton_general','death_knight','necromancer_uz')`);
  // 城镇追捕专用执法者：只在三星及以上通缉者移动时临时生成，绝不加入地图怪物池或地图 NPC。
  await pool.query(`INSERT INTO monster_templates (code,name,monster_class,level,constitution,spirit,strength,intelligence,agility,perception,constitution_growth,spirit_growth,strength_growth,intelligence_growth,agility_growth,perception_growth,skill_sequence,experience,drops_json,weakness_json,resistance_json,element_mastery_json,element_resistance_json) VALUES
    ('city_guard_gareth','剑盾巡卫·加雷斯','elite',20,34,18,37,17,25,28,1.4,.7,1.5,.6,1,1.1,JSON_ARRAY('shield_counter','guard_break','sweeping_slash'),0,JSON_ARRAY(),JSON_ARRAY('魔法'),JSON_ARRAY('刺击'),JSON_OBJECT(),JSON_OBJECT()),
    ('city_ranger_vera','缉捕游侠·薇拉','elite',21,23,24,27,28,38,42,.8,1,1,1.1,1.6,1.8,JSON_ARRAY('wind_blade','piercing_thrust','backstab'),0,JSON_ARRAY(),JSON_ARRAY('冰'),JSON_ARRAY('风'),JSON_OBJECT('风',18),JSON_OBJECT('风',12)),
    ('city_mage_sen','元素执法官·赛恩','elite',22,19,38,18,45,27,34,.6,1.7,.5,2,1,1.4,JSON_ARRAY('fire_lance','frost_bind','arcane_shackle'),0,JSON_ARRAY(),JSON_ARRAY('水'),JSON_ARRAY('火'),JSON_OBJECT('火',26,'冰',18),JSON_OBJECT('火',12,'冰',10)),
    ('city_priest_mare','圣堂见习官·玛蕾','elite',22,30,41,19,37,24,31,1.2,1.8,.7,1.6,.9,1.2,JSON_ARRAY('sanctified_bolt','healing_prayer','blessing_aegis'),0,JSON_ARRAY(),JSON_ARRAY('暗'),JSON_ARRAY('光'),JSON_OBJECT('光',25),JSON_OBJECT('光',16)),
    ('city_rogue_loke','追迹盗贼·洛克','elite',23,21,23,31,25,43,45,.7,.8,1.2,.9,1.8,1.9,JSON_ARRAY('backstab','smoke_screen','toxic_edge'),0,JSON_ARRAY(),JSON_ARRAY('打击'),JSON_ARRAY('刺击'),JSON_OBJECT(),JSON_OBJECT()),
    ('city_marshal_blake','链锤治安官·布莱克','elite',24,43,20,46,18,20,27,1.8,.7,1.9,.6,.7,1,JSON_ARRAY('heavy_strike','shield_counter','guard_break'),0,JSON_ARRAY(),JSON_ARRAY('魔法'),JSON_ARRAY('打击'),JSON_OBJECT(),JSON_OBJECT()),
    ('city_thunder_isk','雷铳术士·伊斯克','elite',25,20,44,20,50,30,37,.7,2,.7,2.2,1.1,1.5,JSON_ARRAY('thunder_lance','arcane_bolt','frost_bind'),0,JSON_ARRAY(),JSON_ARRAY('土'),JSON_ARRAY('雷'),JSON_OBJECT('雷',30),JSON_OBJECT('雷',18)),
    ('city_warden_ada','森林监察使·艾妲','elite',26,31,29,32,36,35,40,1.2,1.1,1.2,1.5,1.4,1.6,JSON_ARRAY('vine_bolt','wind_blade','piercing_thrust'),0,JSON_ARRAY(),JSON_ARRAY('火'),JSON_ARRAY('木'),JSON_OBJECT('木',24,'风',16),JSON_OBJECT('木',16)),
    ('city_paladin_hector','圣盾裁决官·赫克托','elite',27,45,32,43,29,24,33,1.9,1.3,1.8,1.2,.9,1.3,JSON_ARRAY('sanctified_bolt','guard_break','blessing_aegis'),0,JSON_ARRAY(),JSON_ARRAY('暗'),JSON_ARRAY('光'),JSON_OBJECT('光',28),JSON_OBJECT('光',20)),
    ('city_hex_helena','咒印审查官·伊蕾娜','elite',28,24,48,19,55,28,44,.8,2.1,.6,2.4,1,1.8,JSON_ARRAY('arcane_shackle','frost_bind','moonlight_bolt'),0,JSON_ARRAY(),JSON_ARRAY('光'),JSON_ARRAY('暗'),JSON_OBJECT('暗',32,'冰',20),JSON_OBJECT('暗',22)),
    ('city_brawler_torr','破阵斗士·托尔','elite',29,39,23,49,18,38,35,1.6,.8,2,.6,1.5,1.3,JSON_ARRAY('jump_strike','heavy_strike','sweeping_slash'),0,JSON_ARRAY(),JSON_ARRAY('魔法'),JSON_ARRAY('打击'),JSON_OBJECT(),JSON_OBJECT()),
    ('city_captain_roderick','百纳卫队长·罗德里克','elite',30,48,31,52,30,31,43,2,1.3,2.2,1.2,1.2,1.7,JSON_ARRAY('warrior_taunt','shield_counter','guard_break','sweeping_slash'),0,JSON_ARRAY(),JSON_ARRAY('暗'),JSON_ARRAY('刺击'),JSON_OBJECT('光',12),JSON_OBJECT('光',12)),
    ('city_executioner_arlen','裁决执行官·阿伦','elite',48,58,30,62,26,32,39,2.2,1.2,2.5,1,1.2,1.4,JSON_ARRAY('shield_counter','guard_break','sweeping_slash','heavy_strike'),0,JSON_ARRAY(),JSON_ARRAY('暗'),JSON_ARRAY('刺击'),JSON_OBJECT(),JSON_OBJECT()),
    ('city_inquisitor_lynn','审判术士·琳恩','elite',47,35,64,27,70,31,52,1.2,2.5,1,2.8,1.1,2,JSON_ARRAY('arcane_shackle','frost_bind','thunder_lance','ember_burst'),0,JSON_ARRAY(),JSON_ARRAY('水'),JSON_ARRAY('暗'),JSON_OBJECT('冰',38,'雷',32),JSON_OBJECT('冰',24,'雷',22)),
    ('city_confessor_sola','圣堂告解官·索拉','elite',46,48,72,29,58,26,44,1.8,2.8,1,2.2,.9,1.7,JSON_ARRAY('healing_prayer','blessing_aegis','mana_benediction','sanctified_bolt'),0,JSON_ARRAY(),JSON_ARRAY('暗'),JSON_ARRAY('光'),JSON_OBJECT('光',42),JSON_OBJECT('光',30)),
    ('city_hunter_lyra','猎罪游猎者·莱拉','elite',49,34,34,55,28,62,59,1.2,1.2,2.2,1,2.4,2.2,JSON_ARRAY('wind_blade','piercing_thrust','backstab','smoke_screen'),0,JSON_ARRAY(),JSON_ARRAY('冰'),JSON_ARRAY('风'),JSON_OBJECT('风',36),JSON_OBJECT('风',26)),
    ('city_chief_executor','首席执行官·凯尔','boss',80,84,62,88,64,55,71,3,2.3,3.2,2.4,2,2.7,JSON_ARRAY('warrior_taunt','shield_counter','guard_break','sweeping_slash','thunder_lance','blessing_aegis'),0,JSON_ARRAY(),JSON_ARRAY('暗'),JSON_ARRAY('光'),JSON_OBJECT('光',45,'雷',45),JSON_OBJECT('光',35,'雷',35))
    ON DUPLICATE KEY UPDATE name=VALUES(name),monster_class=VALUES(monster_class),level=VALUES(level),constitution=VALUES(constitution),spirit=VALUES(spirit),strength=VALUES(strength),intelligence=VALUES(intelligence),agility=VALUES(agility),perception=VALUES(perception),constitution_growth=VALUES(constitution_growth),spirit_growth=VALUES(spirit_growth),strength_growth=VALUES(strength_growth),intelligence_growth=VALUES(intelligence_growth),agility_growth=VALUES(agility_growth),perception_growth=VALUES(perception_growth),skill_sequence=VALUES(skill_sequence),experience=VALUES(experience),drops_json=VALUES(drops_json),weakness_json=VALUES(weakness_json),resistance_json=VALUES(resistance_json),element_mastery_json=VALUES(element_mastery_json),element_resistance_json=VALUES(element_resistance_json)`);
  await pool.query(`INSERT INTO city_pursuit_officers (template_id,profession,equipment_text) VALUES
    ((SELECT id FROM monster_templates WHERE code='city_guard_gareth'),'卫戍战士','精钢长剑与塔盾'),
    ((SELECT id FROM monster_templates WHERE code='city_ranger_vera'),'游侠','复合长弓与短刃'),
    ((SELECT id FROM monster_templates WHERE code='city_mage_sen'),'元素法师','炎纹法杖与寒晶副手'),
    ((SELECT id FROM monster_templates WHERE code='city_priest_mare'),'圣堂牧师','银铃法球与祷告书'),
    ((SELECT id FROM monster_templates WHERE code='city_rogue_loke'),'追迹盗贼','双匕首与烟幕斗篷'),
    ((SELECT id FROM monster_templates WHERE code='city_marshal_blake'),'重装治安官','链锤与板甲'),
    ((SELECT id FROM monster_templates WHERE code='city_thunder_isk'),'雷铳术士','雷铜法杖与聚能镜'),
    ((SELECT id FROM monster_templates WHERE code='city_warden_ada'),'森林监察使','藤木长弓与兽皮护具'),
    ((SELECT id FROM monster_templates WHERE code='city_paladin_hector'),'圣盾裁决官','圣辉长剑与祝祷盾'),
    ((SELECT id FROM monster_templates WHERE code='city_hex_helena'),'咒印审查官','暗金法书与封印戒'),
    ((SELECT id FROM monster_templates WHERE code='city_brawler_torr'),'破阵斗士','拳刃与重革手甲'),
    ((SELECT id FROM monster_templates WHERE code='city_captain_roderick'),'百纳卫队长','星钢长剑与城卫重甲'),
    ((SELECT id FROM monster_templates WHERE code='city_executioner_arlen'),'裁决执行官','重型裁决剑与制式板甲'),
    ((SELECT id FROM monster_templates WHERE code='city_inquisitor_lynn'),'审判术士','封印法书与雷晶法杖'),
    ((SELECT id FROM monster_templates WHERE code='city_confessor_sola'),'圣堂告解官','祷告法球与圣印法书'),
    ((SELECT id FROM monster_templates WHERE code='city_hunter_lyra'),'猎罪游猎者','风弦长弓与追迹短刃'),
    ((SELECT id FROM monster_templates WHERE code='city_chief_executor'),'首席执行官','王都裁决大剑与星金重甲')
    ON DUPLICATE KEY UPDATE profession=VALUES(profession),equipment_text=VALUES(equipment_text)`);
  // 所有 Boss 都拥有独立的回蓝手段；同时同步仍存活的旧刷新实例，避免它们沿用旧技能组。
  await pool.query(`UPDATE monster_templates
    SET skill_sequence=CASE
      WHEN JSON_CONTAINS(COALESCE(skill_sequence,JSON_ARRAY()),JSON_QUOTE('boss_mana_charge')) THEN skill_sequence
      ELSE JSON_ARRAY_APPEND(COALESCE(skill_sequence,JSON_ARRAY()),'$', 'boss_mana_charge')
    END
    WHERE monster_class='boss'`);
  await pool.query(`UPDATE monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    SET s.skill_sequence=CASE
      WHEN s.skill_sequence IS NULL THEN t.skill_sequence
      WHEN JSON_CONTAINS(s.skill_sequence,JSON_QUOTE('boss_mana_charge')) THEN s.skill_sequence
      ELSE JSON_ARRAY_APPEND(s.skill_sequence,'$', 'boss_mana_charge')
    END
    WHERE t.monster_class='boss' AND s.defeated_at IS NULL`);
  await pool.query(`INSERT IGNORE INTO monster_encounter_texts (monster_template_id,description) VALUES
    ((SELECT id FROM monster_templates WHERE code='slime_red'),'潮湿石缝里滚出一团赤红胶质，热气在它身周嘶嘶作响。'),
    ((SELECT id FROM monster_templates WHERE code='slime_orange'),'橙色的胶团从碎石间弹起，裹挟着细砂朝你蠕动。'),
    ((SELECT id FROM monster_templates WHERE code='slime_yellow'),'昏暗走廊忽然亮起跳动的黄光，一只史莱姆正蓄积电浆。'),
    ((SELECT id FROM monster_templates WHERE code='slime_green'),'绿胶从墙根缓缓漫出，石面被它拖过后留下轻微腐蚀的痕迹。'),
    ((SELECT id FROM monster_templates WHERE code='slime_cyan'),'地面的积水泛起青色涟漪，潮湿的史莱姆已经堵住前路。'),
    ((SELECT id FROM monster_templates WHERE code='slime_blue'),'寒雾贴着地砖蔓延，一只蓝色史莱姆在雾中收缩、膨胀。'),
    ((SELECT id FROM monster_templates WHERE code='slime_purple'),'紫色的幽光自甬道尽头闪烁，史莱姆的轮廓吞没了周遭的光。'),
    ((SELECT id FROM monster_templates WHERE code='black_slime'),'通往下一层的石阶前，黑暗史莱姆伏在台阶上，仿佛一滩会呼吸的夜色。'),
    ((SELECT id FROM monster_templates WHERE code='skeleton'),'凌乱骨节在地上相互摩擦，骷髅拾起断刃，空洞眼眶燃起魂火。'),
    ((SELECT id FROM monster_templates WHERE code='undead'),'腐朽的身影从阴影里抬头，低沉的呢喃在石墙间来回碰撞。'),
    ((SELECT id FROM monster_templates WHERE code='skeleton_warrior'),'披甲骷髅拖着骨刃走来，甲片碰撞声像一段失拍的军乐。'),
    ((SELECT id FROM monster_templates WHERE code='death_wight'),'死灵的苍白面孔浮在暗影里，冰冷的魔力正从它指间滴落。'),
    ((SELECT id FROM monster_templates WHERE code='skeleton_general'),'石阶尽头，骷髅将军缓缓拔出锈蚀长剑，残破军旗在背后无风自动。'),
    ((SELECT id FROM monster_templates WHERE code='death_knight'),'战马的蹄声穿过空无一物的甬道，死灵骑士已在阴影中端平骑枪。'),
    ((SELECT id FROM monster_templates WHERE code='necromancer_uz'),'直路正中，死灵法师·乌兹抬起嵌着幽火的法杖，脚下散落的白骨随之轻轻颤动。')`);
  const [dungeonMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('underground_dungeon_v2')") as unknown as [{ affectedRows: number }];
  if (Number(dungeonMigration.affectedRows) > 0) {
    await pool.query("UPDATE dungeon_instances SET state='closed' WHERE state='active'");
    await pool.query(`UPDATE characters c JOIN map_regions dungeon ON dungeon.id=c.current_region_id JOIN map_regions forest ON forest.code='dark_forest'
      SET c.current_region_id=forest.id,c.pos_x=0,c.pos_y=-60,c.pos_z=0 WHERE dungeon.code='dark_forest_dungeon'`);
  }
  await refreshShopStocks(pool);
};
