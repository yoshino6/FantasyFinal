import { refreshShopStocks } from '../game/shop-stock.service.js';
import { recalculateCharacterStats } from '../game/character.service.js';
import { forgedEquipmentBase } from '../game/constants.js';
import { worldSurfaceRegions, worldSurfaceMaterials, worldSurfaceMonsters } from '../config/world-surface.js';
import { rareForgeMaterials, regionalForgeMaterials, epicForgeRecipes } from '../config/epic-forging.js';
import { allPurifiedCraftMaterials, allBeastCoreMaterials, allMeatChunkMaterials, monsterCraftMaterialKinds, monsterCraftMaterialCode, monsterCraftMaterialName, beastCoreCode, monsterDropsMeat, meatChunkQuantity, meatChunkCode } from '../game/monster-crafting-material.service.js';
import { alchemyOutputDefinitions, alchemyStatusDefinitions } from '../game/alchemy-catalog.js';
import { worldTreeAdvancedProfessions, advancedProfessionActiveSkillCodes } from '../game/advanced-profession.config.js';
import { spiritSummonerPassiveDescription, spiritSummonerActiveSkillCodes } from '../game/spirit-summoner.config.js';
import { constructionRecipes, deviceCodes, constructionValueByCode, blindBoxBlueprints, workshopBlueprints } from '../game/deconstructor-catalog.js';
import { regionalBossComponentDefinitions } from '../game/regional-boss-components.config.js';
import { initializeResidentSkills } from './resident-skills.js';
import { initializeCombatSkillBalance } from './combat-skill-balance.js';
import { migrateEquipmentVitalAffixes } from './equipment-vital-affixes.js';

const alchemistShopStock = [
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
const armorShopSlots = [
    { code: 'shoulder', category: '头肩' }, { code: 'upper', category: '上装' }, { code: 'waist', category: '腰部' }, { code: 'lower', category: '下装' }, { code: 'feet', category: '脚部' }
];
const armorShopTypes = [
    { code: 'cloth', name: '布甲', names: { shoulder: '织纹头巾', upper: '粗纺长衣', waist: '织带束腰', lower: '粗纺长裤', feet: '软布短靴' } },
    { code: 'leather', name: '皮甲', names: { shoulder: '行猎兜帽', upper: '鞣革胸衣', waist: '皮革束带', lower: '猎皮护裤', feet: '猎行皮靴' } },
    { code: 'light', name: '轻甲', names: { shoulder: '铆钉护肩', upper: '锁片胸甲', waist: '扣环腰封', lower: '锁片护腿', feet: '钉底战靴' } },
    { code: 'heavy', name: '重甲', names: { shoulder: '铁铸肩甲', upper: '铁铸胸甲', waist: '铁铸腰甲', lower: '铁铸护腿', feet: '铁铸战靴' } },
    { code: 'plate', name: '板甲', names: { shoulder: '全覆板盔', upper: '全覆板甲', waist: '板甲束腰', lower: '板甲腿铠', feet: '板甲战靴' } }
];
const blacksmithShopStock = [5, 10, 15, 20].flatMap(level => {
    const price = { 5: 200, 10: 400, 15: 1000, 20: 2000 }[level];
    const prefix = { 5: '新手', 10: '硬木', 15: '黑铁', 20: '精钢' }[level];
    const armorPrefix = { 5: '新手', 10: '旅用', 15: '匠制', 20: '精制' }[level];
    const weaponBase = forgedEquipmentBase(level, '武器');
    const armorItems = armorShopTypes.flatMap(armor => armorShopSlots.map(slot => ({
        code: armor.code === 'light' ? `shop_${slot.code}_${level}` : `shop_${slot.code}_${armor.code}_${level}`,
        name: `${armorPrefix}${armor.names[slot.code]}`,
        category: slot.category,
        weaponType: armor.name,
        level,
        price,
        effect: { physicalDefense: forgedEquipmentBase(level, '防具', slot.code), magicDefense: forgedEquipmentBase(level, '防具', slot.code) }
    })));
    return [
        { code: `shop_longsword_${level}`, name: `${prefix}长剑`, category: '武器', weaponType: '长剑', level, price, effect: { physicalAttack: weaponBase } },
        { code: `shop_staff_${level}`, name: `${prefix}法杖`, category: '武器', weaponType: '法杖', level, price, effect: { magicAttack: weaponBase } },
        { code: `shop_spellbook_${level}`, name: `${prefix}法书`, category: '武器', weaponType: '法书', level, price, effect: { magicAttack: weaponBase } },
        { code: `shop_orb_${level}`, name: `${prefix}法球`, category: '武器', weaponType: '法球', level, price, effect: { magicAttack: weaponBase } },
        { code: `shop_dagger_${level}`, name: `${prefix}匕首`, category: '武器', weaponType: '匕首', level, price, effect: { physicalAttack: weaponBase * .9, magicAttack: weaponBase * .9 } },
        { code: `shop_fistblade_${level}`, name: `${prefix}拳刃`, category: '武器', weaponType: '拳刃', level, price, effect: { physicalAttack: weaponBase } },
        { code: `shop_shield_${level}`, name: `${prefix}盾牌`, category: '副手', weaponType: '盾牌', level, price, effect: { physicalDefense: weaponBase, magicDefense: weaponBase * .5 } },
        ...armorItems
    ];
});
const seedDynamicAlchemyContent = async (pool) => {
    for (const output of alchemyOutputDefinitions) {
        await pool.execute(`INSERT INTO item_definitions
      (code,name,description,obtain_source,item_type,item_category,rarity,required_level,weight,trade_price,stack_limit,stackable,is_tradeable,effect_json)
      VALUES (?,?,?,'炼金师动态炼金','consumable',?,'普通',?,0.15,0,99,1,1,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),item_type=VALUES(item_type),item_category=VALUES(item_category),required_level=VALUES(required_level),weight=VALUES(weight),stack_limit=VALUES(stack_limit),stackable=VALUES(stackable),is_tradeable=VALUES(is_tradeable),effect_json=VALUES(effect_json)`, [
            output.code,
            output.name,
            output.description,
            output.category,
            output.level,
            JSON.stringify({ ...output.effect, alchemyOutput: true, alchemyTier: output.tier, alchemyLevel: output.level })
        ]);
    }
    for (const effect of alchemyStatusDefinitions) {
        await pool.execute(`INSERT INTO effect_definitions (code,name,effect_type,default_value,default_duration,max_level,max_stacks,stackable,description)
      VALUES (?,?,?,?,?,1,1,0,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),effect_type=VALUES(effect_type),default_value=VALUES(default_value),default_duration=VALUES(default_duration),description=VALUES(description)`, [
            effect.code,
            effect.name,
            effect.effectType,
            effect.value,
            effect.duration,
            effect.description
        ]);
    }
};
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
    `CREATE TABLE IF NOT EXISTS admin_web_accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, username VARCHAR(32) NOT NULL, password_hash VARCHAR(255) NOT NULL,
    role ENUM('owner','admin','viewer') NOT NULL DEFAULT 'viewer', is_enabled TINYINT(1) NOT NULL DEFAULT 1,
    force_password_change TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, last_login_at DATETIME NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_admin_web_username (username), KEY idx_admin_web_role_enabled (role,is_enabled)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS admin_web_sessions (
    id CHAR(36) NOT NULL, account_id BIGINT UNSIGNED NOT NULL, token_hash CHAR(64) NOT NULL, csrf_secret_hash CHAR(64) NOT NULL,
    ip_address VARCHAR(64) NOT NULL DEFAULT '', expires_at DATETIME NOT NULL, absolute_expires_at DATETIME NOT NULL,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, revoked_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_admin_web_session_token (token_hash), KEY idx_admin_web_session_expiry (expires_at,absolute_expires_at,revoked_at),
    CONSTRAINT fk_admin_web_session_account FOREIGN KEY (account_id) REFERENCES admin_web_accounts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS admin_web_login_attempts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, username VARCHAR(32) NOT NULL DEFAULT '', ip_address VARCHAR(64) NOT NULL DEFAULT '',
    outcome ENUM('success','failed','blocked') NOT NULL, reason_code VARCHAR(48) NOT NULL DEFAULT '', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_admin_login_user_created (username,created_at), KEY idx_admin_login_ip_created (ip_address,created_at)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS operation_journals (
    id CHAR(36) NOT NULL, correlation_id CHAR(36) NOT NULL, actor_kind VARCHAR(24) NOT NULL, actor_ref VARCHAR(64) NOT NULL,
    source VARCHAR(24) NOT NULL, action_type VARCHAR(64) NOT NULL, status ENUM('committed','failed','rolled_back') NOT NULL DEFAULT 'committed',
    risk_level ENUM('low','medium','high') NOT NULL DEFAULT 'low', reason VARCHAR(500) NOT NULL DEFAULT '', request_json JSON NOT NULL,
    result_json JSON NOT NULL, rollback_of CHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_operation_created (created_at,id), KEY idx_operation_actor (actor_ref,created_at), KEY idx_operation_action (action_type,created_at),
    KEY idx_operation_status (status,created_at), KEY idx_operation_correlation (correlation_id), KEY idx_operation_rollback (rollback_of)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS operation_targets (
    operation_id CHAR(36) NOT NULL, target_kind VARCHAR(48) NOT NULL, target_id VARCHAR(96) NOT NULL,
    player_id BIGINT UNSIGNED NULL, character_id BIGINT UNSIGNED NULL, region_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (operation_id,target_kind,target_id), KEY idx_operation_target_player (player_id,operation_id), KEY idx_operation_target_character (character_id,operation_id), KEY idx_operation_target_region (region_id,operation_id),
    CONSTRAINT fk_operation_target_journal FOREIGN KEY (operation_id) REFERENCES operation_journals(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS operation_snapshots (
    operation_id CHAR(36) NOT NULL, scope_key VARCHAR(96) NOT NULL, schema_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    before_json JSON NOT NULL, after_json JSON NOT NULL, before_hash CHAR(64) NOT NULL, after_hash CHAR(64) NOT NULL,
    PRIMARY KEY (operation_id,scope_key), CONSTRAINT fk_operation_snapshot_journal FOREIGN KEY (operation_id) REFERENCES operation_journals(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS scheduled_job_runs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, job_code VARCHAR(64) NOT NULL, status ENUM('success','failed') NOT NULL,
    duration_ms INT UNSIGNED NULL, affected_count INT NULL, error_text VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_scheduled_job_code_created (job_code,created_at), KEY idx_scheduled_job_status_created (status,created_at)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS monitor_alerts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, rule_code VARCHAR(64) NOT NULL, fingerprint VARCHAR(96) NOT NULL,
    severity ENUM('warning','critical') NOT NULL, status ENUM('open','acknowledged','resolved') NOT NULL DEFAULT 'open', detail_json JSON NOT NULL,
    first_seen_at DATETIME NOT NULL, last_seen_at DATETIME NOT NULL, occurrences INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (id), UNIQUE KEY uk_monitor_alert (rule_code,fingerprint), KEY idx_monitor_alert_status (status,severity,last_seen_at)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS account_deletion_records (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, qq_user_id VARCHAR(32) NOT NULL, qq_nickname VARCHAR(128) NULL, character_name VARCHAR(24) NULL,
    snapshot_json JSON NOT NULL, deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    restored_at DATETIME NULL, restored_by_qq_user_id VARCHAR(32) NULL,
    PRIMARY KEY (id), KEY idx_deletion_record_deleted (deleted_at,id), KEY idx_deletion_record_player (qq_user_id,id), KEY idx_deletion_record_name (character_name,id), KEY idx_deletion_record_restored (restored_at,id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS registration_sessions (
    id CHAR(36) NOT NULL, player_id BIGINT UNSIGNED NOT NULL, stage ENUM('story','audience','question','destination','heaven','danger','choice') NOT NULL DEFAULT 'story',
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
    activity_status ENUM('active','resting','unconscious') NOT NULL DEFAULT 'active', rest_started_at DATETIME NULL, home_rest_experience_updated_at DATETIME NULL, physical_attack INT UNSIGNED NOT NULL, magic_attack INT UNSIGNED NOT NULL,
    physical_defense INT UNSIGNED NOT NULL, magic_defense INT UNSIGNED NOT NULL, accuracy INT UNSIGNED NOT NULL, evasion INT UNSIGNED NOT NULL,
    crit_rate_bp INT UNSIGNED NOT NULL, crit_damage_bp INT UNSIGNED NOT NULL, crit_resist_bp INT UNSIGNED NOT NULL,
    crit_damage_reduction_bp INT UNSIGNED NOT NULL, tenacity INT UNSIGNED NOT NULL, tenacity_pierce INT UNSIGNED NOT NULL DEFAULT 0, speed INT UNSIGNED NOT NULL,
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
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_story_progress (
    character_id BIGINT UNSIGNED NOT NULL, story_code VARCHAR(64) NOT NULL, status ENUM('met','joined','declined','completed') NOT NULL DEFAULT 'met', stage TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id,story_code),
    CONSTRAINT fk_story_progress_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS item_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    description TEXT NOT NULL, obtain_source VARCHAR(128) NOT NULL DEFAULT '未知来源', item_type ENUM('consumable','material','equipment','device') NOT NULL DEFAULT 'material', item_category VARCHAR(32) NOT NULL DEFAULT '特殊', weapon_type VARCHAR(32) NULL, rarity ENUM('普通','优秀','精良','稀有','传说','史诗','神器') NOT NULL DEFAULT '普通', required_level SMALLINT UNSIGNED NOT NULL DEFAULT 1, codex_id VARCHAR(16) NULL,
    weight DECIMAL(8,2) NOT NULL DEFAULT 0, trade_price INT UNSIGNED NOT NULL DEFAULT 0, stack_limit INT UNSIGNED NOT NULL DEFAULT 99, stackable TINYINT(1) NOT NULL DEFAULT 1, is_tradeable TINYINT(1) NOT NULL DEFAULT 1,
    effect_json JSON NULL, PRIMARY KEY (id), UNIQUE KEY uk_item_code (code)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_item_instances (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL,
    quality DECIMAL(5,2) NOT NULL DEFAULT 0.00, durability INT UNSIGNED NOT NULL DEFAULT 100, durability_max INT UNSIGNED NOT NULL DEFAULT 100,
    effect_json JSON NULL, forge_primary_json JSON NULL, acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_item_instance_character_acquired (character_id, acquired_at),
    CONSTRAINT fk_item_instance_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_item_instance_definition FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_item_codex (
    character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,item_id), CONSTRAINT fk_item_codex_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_item_codex_definition FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_inventory (
    character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL, acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id, item_id), CONSTRAINT fk_inventory_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_inventory_item FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_quick_items (
    character_id BIGINT UNSIGNED NOT NULL, quick_slot TINYINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (character_id, quick_slot), UNIQUE KEY uk_quick_item (character_id, item_id),
    CONSTRAINT fk_quick_item_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_quick_item_definition FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_equipment (
    character_id BIGINT UNSIGNED NOT NULL, slot ENUM('weapon','offhand','eye','shoulder','upper','waist','lower','feet','necklace','bracelet','ring') NOT NULL, item_id BIGINT UNSIGNED NOT NULL, instance_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (character_id, slot), UNIQUE KEY uk_equipment_item (character_id, item_id), UNIQUE KEY uk_equipment_instance (character_id, instance_id),
    CONSTRAINT fk_equipment_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_equipment_item FOREIGN KEY (item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_equipment_instance FOREIGN KEY (instance_id) REFERENCES player_item_instances(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_active_devices (
    character_id BIGINT UNSIGNED NOT NULL, instance_id BIGINT UNSIGNED NOT NULL, activated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,instance_id), UNIQUE KEY uk_active_device_instance (instance_id),
    CONSTRAINT fk_active_device_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_active_device_instance FOREIGN KEY (instance_id) REFERENCES player_item_instances(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_device_quick_slots (
    character_id BIGINT UNSIGNED NOT NULL, quick_slot TINYINT UNSIGNED NOT NULL, instance_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (character_id,quick_slot), UNIQUE KEY uk_device_quick_instance (character_id,instance_id),
    CONSTRAINT fk_device_quick_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_device_quick_instance FOREIGN KEY (instance_id) REFERENCES player_item_instances(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_blessings (
    character_id BIGINT UNSIGNED NOT NULL, code VARCHAR(64) NOT NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_blessing_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_mails (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, title VARCHAR(96) NOT NULL, content TEXT NOT NULL,
    received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, claimed_at DATETIME NULL, deleted_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_mail_character_received (character_id,deleted_at,received_at),
    CONSTRAINT fk_mail_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_mail_attachments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, mail_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL,
    PRIMARY KEY (id), KEY idx_mail_attachment_mail (mail_id),
    CONSTRAINT fk_mail_attachment_mail FOREIGN KEY (mail_id) REFERENCES player_mails(id) ON DELETE CASCADE,
    CONSTRAINT fk_mail_attachment_item FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS admin_mail_edits (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, admin_qq_user_id VARCHAR(32) NOT NULL, recipient_scope ENUM('personal','global') NOT NULL,
    title VARCHAR(96) NOT NULL DEFAULT '', content TEXT NOT NULL, status ENUM('editing','draft') NOT NULL DEFAULT 'editing',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_admin_mail_edit_user (admin_qq_user_id), KEY idx_admin_mail_edit_status (status)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS admin_mail_edit_recipients (
    edit_id BIGINT UNSIGNED NOT NULL, qq_user_id VARCHAR(32) NOT NULL, nickname VARCHAR(64) NOT NULL,
    PRIMARY KEY (edit_id,qq_user_id),
    CONSTRAINT fk_admin_mail_edit_recipient_edit FOREIGN KEY (edit_id) REFERENCES admin_mail_edits(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS admin_mail_edit_attachments (
    edit_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL,
    PRIMARY KEY (edit_id,item_id),
    CONSTRAINT fk_admin_mail_edit_attachment_edit FOREIGN KEY (edit_id) REFERENCES admin_mail_edits(id) ON DELETE CASCADE,
    CONSTRAINT fk_admin_mail_edit_attachment_item FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS profession_definitions (
    code VARCHAR(32) NOT NULL, name VARCHAR(32) NOT NULL, description TEXT NOT NULL, growth_json JSON NOT NULL, skill_codes_json JSON NOT NULL,
    PRIMARY KEY (code)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_guild_chats (
    character_id BIGINT UNSIGNED NOT NULL, chat_count INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id), CONSTRAINT fk_guild_chat_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS guild_shop_items (
    item_id BIGINT UNSIGNED NOT NULL, buy_price INT UNSIGNED NOT NULL, sell_price INT UNSIGNED NOT NULL DEFAULT 0, stock_capacity INT UNSIGNED NOT NULL DEFAULT 0, stock_quantity INT UNSIGNED NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_guild_shop_active (is_active,item_id),
    CONSTRAINT fk_guild_shop_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS blacksmith_shop_items (
    item_id BIGINT UNSIGNED NOT NULL, buy_price INT UNSIGNED NOT NULL, sell_price INT UNSIGNED NOT NULL DEFAULT 0, stock_capacity INT UNSIGNED NOT NULL DEFAULT 0, stock_quantity INT UNSIGNED NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_blacksmith_shop_active (is_active,item_id),
    CONSTRAINT fk_blacksmith_shop_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS alchemist_shop_items (
    item_id BIGINT UNSIGNED NOT NULL, shop_category VARCHAR(16) NOT NULL DEFAULT '回复', buy_price INT UNSIGNED NOT NULL, sell_price INT UNSIGNED NOT NULL DEFAULT 0, stock_capacity INT UNSIGNED NOT NULL DEFAULT 0, stock_quantity INT UNSIGNED NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_alchemist_shop_active (is_active,shop_category,item_id),
    CONSTRAINT fk_alchemist_shop_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS hunter_lodge_items (
    item_id BIGINT UNSIGNED NOT NULL, buy_price INT UNSIGNED NOT NULL, stock_capacity INT UNSIGNED NOT NULL DEFAULT 0, stock_quantity INT UNSIGNED NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_hunter_lodge_active (is_active,item_id),
    CONSTRAINT fk_hunter_lodge_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS bookshop_items (
    item_id BIGINT UNSIGNED NOT NULL, buy_price INT UNSIGNED NOT NULL, stock_capacity INT UNSIGNED NOT NULL DEFAULT 0, stock_quantity INT UNSIGNED NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_bookshop_active (is_active,item_id),
    CONSTRAINT fk_bookshop_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS oddworkshop_items (
    item_id BIGINT UNSIGNED NOT NULL, buy_price INT UNSIGNED NOT NULL, stock_capacity INT UNSIGNED NOT NULL DEFAULT 99, stock_quantity INT UNSIGNED NOT NULL DEFAULT 99, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_oddworkshop_shop_active (is_active,item_id),
    CONSTRAINT fk_oddworkshop_shop_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_warrants (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, wanted_character_id BIGINT UNSIGNED NOT NULL, city_region_id BIGINT UNSIGNED NOT NULL,
    status ENUM('active','captured','cleared') NOT NULL DEFAULT 'active', pursuit_defeats TINYINT UNSIGNED NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    captured_at DATETIME NULL, captured_by_character_id BIGINT UNSIGNED NULL, last_seen_at DATETIME NULL, last_seen_x INT NULL, last_seen_y INT NULL,
    PRIMARY KEY (id), KEY idx_warrant_character_city_status (wanted_character_id,city_region_id,status), KEY idx_warrant_city_status (city_region_id,status),
    CONSTRAINT fk_warrant_character FOREIGN KEY (wanted_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_warrant_city FOREIGN KEY (city_region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_warrant_victims (
    warrant_id BIGINT UNSIGNED NOT NULL, target_character_id BIGINT UNSIGNED NOT NULL, attacked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (warrant_id,target_character_id), KEY idx_warrant_victim_target (target_character_id),
    CONSTRAINT fk_warrant_victim_warrant FOREIGN KEY (warrant_id) REFERENCES player_warrants(id) ON DELETE CASCADE,
    CONSTRAINT fk_warrant_victim_target FOREIGN KEY (target_character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_adventurer_card_cache (
    character_id BIGINT UNSIGNED NOT NULL, fingerprint CHAR(64) NOT NULL, image_data LONGBLOB NOT NULL,
    generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id), KEY idx_adventurer_card_generated (generated_at),
    CONSTRAINT fk_adventurer_card_cache_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS city_pursuit_cooldowns (
    character_id BIGINT UNSIGNED NOT NULL, city_region_id BIGINT UNSIGNED NOT NULL, expires_at DATETIME NOT NULL,
    PRIMARY KEY (character_id,city_region_id), KEY idx_city_pursuit_cooldown_expiry (expires_at),
    CONSTRAINT fk_city_pursuit_cooldown_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_city_pursuit_cooldown_city FOREIGN KEY (city_region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS city_pursuit_tracks (
    character_id BIGINT UNSIGNED NOT NULL, city_region_id BIGINT UNSIGNED NOT NULL, warrant_id BIGINT UNSIGNED NOT NULL,
    officer_template_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (character_id,city_region_id), KEY idx_city_pursuit_track_warrant (warrant_id),
    CONSTRAINT fk_city_pursuit_track_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_city_pursuit_track_city FOREIGN KEY (city_region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS pvp_stolen_loot (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, original_owner_character_id BIGINT UNSIGNED NOT NULL, holder_character_id BIGINT UNSIGNED NOT NULL,
    item_id BIGINT UNSIGNED NULL, quantity INT UNSIGNED NOT NULL DEFAULT 0, held_quantity INT UNSIGNED NOT NULL DEFAULT 0, sold_quantity INT UNSIGNED NOT NULL DEFAULT 0,
    copper_amount BIGINT UNSIGNED NOT NULL DEFAULT 0, sale_copper_amount BIGINT UNSIGNED NOT NULL DEFAULT 0,
    acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, returned_at DATETIME NULL, restitution_id CHAR(36) NULL,
    restitution_charged_copper BIGINT UNSIGNED NOT NULL DEFAULT 0, restitution_debt_copper BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id), KEY idx_stolen_holder (holder_character_id,returned_at), KEY idx_stolen_owner (original_owner_character_id,returned_at),
    CONSTRAINT fk_stolen_owner FOREIGN KEY (original_owner_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_stolen_holder FOREIGN KEY (holder_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_stolen_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_city_debts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, debtor_character_id BIGINT UNSIGNED NOT NULL, original_owner_character_id BIGINT UNSIGNED NOT NULL,
    city_region_id BIGINT UNSIGNED NOT NULL, restitution_id CHAR(36) NOT NULL, amount_copper BIGINT UNSIGNED NOT NULL, paid_copper BIGINT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('active','settled') NOT NULL DEFAULT 'active', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, settled_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_city_debt_debtor (debtor_character_id,city_region_id,status), KEY idx_city_debt_restitution (restitution_id),
    CONSTRAINT fk_city_debt_debtor FOREIGN KEY (debtor_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_city_debt_owner FOREIGN KEY (original_owner_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_city_debt_region FOREIGN KEY (city_region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_warrant_rewards (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, warrant_id BIGINT UNSIGNED NOT NULL, issuer_character_id BIGINT UNSIGNED NOT NULL,
    reward_item_id BIGINT UNSIGNED NULL, quantity INT UNSIGNED NOT NULL DEFAULT 0, copper_amount BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, claimed_at DATETIME NULL, claimed_by_character_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (id), KEY idx_warrant_reward (warrant_id,claimed_at),
    CONSTRAINT fk_warrant_reward_warrant FOREIGN KEY (warrant_id) REFERENCES player_warrants(id) ON DELETE CASCADE,
    CONSTRAINT fk_warrant_reward_issuer FOREIGN KEY (issuer_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_warrant_reward_item FOREIGN KEY (reward_item_id) REFERENCES item_definitions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_pvp_attack_confirmations (
    attacker_character_id BIGINT UNSIGNED NOT NULL, target_character_id BIGINT UNSIGNED NOT NULL, expires_at DATETIME NOT NULL,
    PRIMARY KEY (attacker_character_id), KEY idx_pvp_confirmation_expiry (expires_at),
    CONSTRAINT fk_pvp_confirmation_attacker FOREIGN KEY (attacker_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_pvp_confirmation_target FOREIGN KEY (target_character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_advanced_professions (
    character_id BIGINT UNSIGNED NOT NULL, profession_code VARCHAR(64) NOT NULL, mentor_code VARCHAR(64) NOT NULL, completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id), UNIQUE KEY uk_advanced_profession_code (character_id,profession_code),
    CONSTRAINT fk_advanced_profession_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_advanced_profession_quests (
    character_id BIGINT UNSIGNED NOT NULL, profession_code VARCHAR(64) NOT NULL, stage TINYINT UNSIGNED NOT NULL DEFAULT 1,
    story_kills TINYINT UNSIGNED NOT NULL DEFAULT 0, proof_kills TINYINT UNSIGNED NOT NULL DEFAULT 0, completed_at DATETIME NULL,
    PRIMARY KEY (character_id,profession_code), KEY idx_advanced_quest_stage (character_id,stage),
    CONSTRAINT fk_advanced_quest_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_advanced_passive_studies (
    character_id BIGINT UNSIGNED NOT NULL, profession_code VARCHAR(64) NOT NULL, started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL, equipped TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id,profession_code), KEY idx_advanced_passive_equipped (character_id,equipped),
    CONSTRAINT fk_advanced_passive_study_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_pvp_defeat_protections (
    character_id BIGINT UNSIGNED NOT NULL, attacker_name VARCHAR(64) NOT NULL, notice_text TEXT NOT NULL,
    defeated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME NOT NULL, notice_delivered_at DATETIME NULL,
    PRIMARY KEY (character_id),
    CONSTRAINT fk_pvp_defeat_protection_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_pvp_attack_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, attacker_character_id BIGINT UNSIGNED NOT NULL, defender_character_id BIGINT UNSIGNED NOT NULL,
    attacker_name VARCHAR(64) NOT NULL, defender_name VARCHAR(64) NOT NULL, action_name VARCHAR(128) NOT NULL,
    damage INT UNSIGNED NOT NULL DEFAULT 0, outcome VARCHAR(16) NOT NULL, loot_text TEXT NULL, attacked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_pvp_attack_attacker_time (attacker_character_id,attacked_at), KEY idx_pvp_attack_defender_time (defender_character_id,attacked_at),
    CONSTRAINT fk_pvp_attack_log_attacker FOREIGN KEY (attacker_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_pvp_attack_log_defender FOREIGN KEY (defender_character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_pvp_battle_logs (
    id CHAR(36) NOT NULL, attacker_character_id BIGINT UNSIGNED NOT NULL, defender_character_id BIGINT UNSIGNED NOT NULL,
    attacker_name VARCHAR(64) NOT NULL, defender_name VARCHAR(64) NOT NULL, battle_type VARCHAR(16) NOT NULL,
    outcome VARCHAR(16) NOT NULL DEFAULT 'ongoing', winner_character_id BIGINT UNSIGNED NULL, winner_name VARCHAR(64) NULL,
    loot_text TEXT NULL, started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, ended_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_pvp_battle_attacker_time (attacker_character_id,started_at), KEY idx_pvp_battle_defender_time (defender_character_id,started_at),
    CONSTRAINT fk_pvp_battle_log_attacker FOREIGN KEY (attacker_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_pvp_battle_log_defender FOREIGN KEY (defender_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_pvp_battle_log_winner FOREIGN KEY (winner_character_id) REFERENCES characters(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS hunter_lodge_daily_specials (
    special_date DATE NOT NULL, item_id BIGINT UNSIGNED NULL, discount_pct TINYINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (special_date), KEY idx_hunter_special_item (item_id),
    CONSTRAINT fk_hunter_special_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS guild_restaurant_menu (
    item_id BIGINT UNSIGNED NOT NULL, price INT UNSIGNED NOT NULL DEFAULT 0, processing_fee INT UNSIGNED NOT NULL DEFAULT 0, ingredients_json JSON NOT NULL, buff_json JSON NOT NULL, duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30, is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id), KEY idx_guild_restaurant_active (is_active,item_id),
    CONSTRAINT fk_guild_restaurant_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_food_buffs (
    character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, buff_json JSON NOT NULL, expires_at DATETIME NOT NULL,
    PRIMARY KEY (character_id), KEY idx_food_buff_expires (expires_at),
    CONSTRAINT fk_food_buff_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_food_buff_item FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS blacksmith_refinement_materials (
    item_id BIGINT UNSIGNED NOT NULL, min_gain DECIMAL(5,2) NOT NULL, max_gain DECIMAL(5,2) NOT NULL,
    PRIMARY KEY (item_id), CONSTRAINT fk_refinement_material_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS blacksmith_fusion_material_effects (
    item_id BIGINT UNSIGNED NOT NULL, effect_json JSON NOT NULL, description VARCHAR(255) NOT NULL,
    PRIMARY KEY (item_id), CONSTRAINT fk_fusion_material_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS equipment_fusions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, instance_id BIGINT UNSIGNED NOT NULL, material_item_id BIGINT UNSIGNED NOT NULL, effect_json JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_equipment_fusions_instance (instance_id), CONSTRAINT fk_equipment_fusion_instance FOREIGN KEY (instance_id) REFERENCES player_item_instances(id) ON DELETE CASCADE,
    CONSTRAINT fk_equipment_fusion_material FOREIGN KEY (material_item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS equipment_fusion_effects (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, fusion_id BIGINT UNSIGNED NOT NULL, effect_key VARCHAR(64) NOT NULL, effect_value DECIMAL(12,4) NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_equipment_fusion_effect (fusion_id,effect_key), KEY idx_equipment_fusion_effect_fusion (fusion_id),
    CONSTRAINT fk_equipment_fusion_effect_fusion FOREIGN KEY (fusion_id) REFERENCES equipment_fusions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_forge_sessions (
    character_id BIGINT UNSIGNED NOT NULL, equipment_category VARCHAR(32) NULL, subtype VARCHAR(32) NULL, target_level SMALLINT UNSIGNED NULL,
    entry_source ENUM('blacksmith','profession') NOT NULL DEFAULT 'blacksmith',
    PRIMARY KEY (character_id), CONSTRAINT fk_forge_session_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_forge_materials (
    character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL,
    PRIMARY KEY (character_id,item_id), CONSTRAINT fk_forge_material_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_forge_material_item FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_alchemy_sessions (
    character_id BIGINT UNSIGNED NOT NULL, purification_item_id BIGINT UNSIGNED NULL, purification_quantity INT UNSIGNED NOT NULL DEFAULT 0,
    main_item_id BIGINT UNSIGNED NULL, main_quantity TINYINT UNSIGNED NOT NULL DEFAULT 1,
    auxiliary_item_id BIGINT UNSIGNED NULL, auxiliary_quantity TINYINT UNSIGNED NOT NULL DEFAULT 1,
    reagent_item_id BIGINT UNSIGNED NULL, reagent_quantity TINYINT UNSIGNED NOT NULL DEFAULT 1,
    service_mode ENUM('personal','sweetshop') NOT NULL DEFAULT 'personal',
    alchemy_confirmation_expires_at DATETIME NULL,
    alchemy_processing_until DATETIME NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_alchemy_session_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_alchemy_purification_item FOREIGN KEY (purification_item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_alchemy_main_item FOREIGN KEY (main_item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_alchemy_auxiliary_item FOREIGN KEY (auxiliary_item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_alchemy_reagent_item FOREIGN KEY (reagent_item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_alchemy_formulas (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, name VARCHAR(64) NOT NULL,
    main_item_id BIGINT UNSIGNED NOT NULL, auxiliary_item_id BIGINT UNSIGNED NULL, reagent_item_id BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_alchemy_formula_character_created (character_id,created_at),
    CONSTRAINT fk_alchemy_formula_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_alchemy_formula_main FOREIGN KEY (main_item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_alchemy_formula_auxiliary FOREIGN KEY (auxiliary_item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_alchemy_formula_reagent FOREIGN KEY (reagent_item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_secondary_professions (
    character_id BIGINT UNSIGNED NOT NULL, profession_code VARCHAR(32) NOT NULL, level SMALLINT UNSIGNED NOT NULL DEFAULT 1, proficiency BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id), CONSTRAINT fk_secondary_profession_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_side_quests (
    character_id BIGINT UNSIGNED NOT NULL, quest_code VARCHAR(64) NOT NULL, status ENUM('accepted','completed','claimed') NOT NULL DEFAULT 'accepted', accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME NULL, claimed_at DATETIME NULL,
    PRIMARY KEY (character_id,quest_code), CONSTRAINT fk_side_quest_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_dungeon_secret_progress (
    character_id BIGINT UNSIGNED NOT NULL, stage TINYINT UNSIGNED NOT NULL DEFAULT 0, dungeon_id BIGINT UNSIGNED NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id), KEY idx_dungeon_secret_dungeon (dungeon_id),
    CONSTRAINT fk_dungeon_secret_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_dungeon_entrance_marks (
    character_id BIGINT UNSIGNED NOT NULL, dungeon_id BIGINT UNSIGNED NOT NULL,
    region_id BIGINT UNSIGNED NOT NULL, pos_x INT NOT NULL, pos_y INT NOT NULL,
    discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,dungeon_id,region_id,pos_x,pos_y),
    CONSTRAINT fk_dungeon_mark_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_omniscient_quest_progress (
    character_id BIGINT UNSIGNED NOT NULL, slime_observed TINYINT(1) NOT NULL DEFAULT 0, wolf_king_observed TINYINT(1) NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id), CONSTRAINT fk_omniscient_quest_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_omniscient_boss_traces (
    character_id BIGINT UNSIGNED NOT NULL, spawn_id BIGINT UNSIGNED NOT NULL, region_id BIGINT UNSIGNED NOT NULL,
    boss_code VARCHAR(64) NOT NULL, boss_name VARCHAR(64) NOT NULL, stage TINYINT UNSIGNED NOT NULL DEFAULT 0, interrupted TINYINT(1) NOT NULL DEFAULT 0, completed TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,spawn_id), KEY idx_omniscient_trace_region (character_id,region_id,updated_at),
    CONSTRAINT fk_omniscient_trace_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_main_quest_progress (
    character_id BIGINT UNSIGNED NOT NULL, quest_code VARCHAR(64) NOT NULL, stage TINYINT UNSIGNED NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,quest_code), CONSTRAINT fk_main_quest_progress_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_evolution_profiles (
    character_id BIGINT UNSIGNED NOT NULL, unlocked_level TINYINT UNSIGNED NOT NULL DEFAULT 20, injection_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
    evolution_scale TINYINT UNSIGNED NOT NULL DEFAULT 0, adaptation_pressure TINYINT UNSIGNED NOT NULL DEFAULT 0, stability TINYINT UNSIGNED NOT NULL DEFAULT 50,
    fixed_bonus_json JSON NOT NULL, lineage_marks_json JSON NOT NULL, active_lineage VARCHAR(32) NULL, final_traits_json JSON NOT NULL, symbiosis_trait_code VARCHAR(32) NULL,
    daily_key CHAR(10) NULL, daily_claims TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id), CONSTRAINT fk_evolution_profile_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_mutations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, body_part ENUM('eye','nerve','skin','chest','bone','organ') NOT NULL,
    mutation_code VARCHAR(64) NOT NULL, mutation_name VARCHAR(64) NOT NULL, mutation_state ENUM('stable','deviation','rare','paused','archived') NOT NULL,
    tier TINYINT UNSIGNED NOT NULL DEFAULT 1, source_injection VARCHAR(32) NOT NULL, effect_json JSON NOT NULL, description TEXT NOT NULL,
    acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_mutation_character_code (character_id,mutation_code), KEY idx_mutation_character_part_state (character_id,body_part,mutation_state),
    CONSTRAINT fk_mutation_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_evolution_observations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, business_date CHAR(10) NOT NULL, observation_type ENUM('behavior','sample','adaptation','resonance','containment') NOT NULL,
    status ENUM('available','accepted','completed','claimed') NOT NULL DEFAULT 'available', progress SMALLINT UNSIGNED NOT NULL DEFAULT 0, target_count SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    objective_text VARCHAR(255) NOT NULL DEFAULT '', reward_json JSON NOT NULL, completed_at DATETIME NULL, claimed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_evolution_daily_claim (character_id,business_date,observation_type), KEY idx_evolution_observation_character_date (character_id,business_date),
    CONSTRAINT fk_evolution_observation_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS market_item_state (
    item_id BIGINT UNSIGNED NOT NULL, reference_price BIGINT UNSIGNED NOT NULL, npc_anchor_price BIGINT UNSIGNED NOT NULL,
    daily_buy_volume BIGINT UNSIGNED NOT NULL DEFAULT 0, daily_sell_volume BIGINT UNSIGNED NOT NULL DEFAULT 0,
    last_trade_at DATETIME NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (item_id), CONSTRAINT fk_market_item_state_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS market_orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL,
    side ENUM('sell','buy') NOT NULL, unit_price BIGINT UNSIGNED NOT NULL, quantity_total INT UNSIGNED NOT NULL,
    quantity_remaining INT UNSIGNED NOT NULL, reserved_copper BIGINT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('open','partial','filled','cancelled','expired','frozen') NOT NULL DEFAULT 'open',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME NOT NULL,
    PRIMARY KEY (id), KEY idx_market_match (item_id,side,status,unit_price,created_at), KEY idx_market_owner (character_id,status,created_at),
    CONSTRAINT fk_market_order_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_market_order_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS market_escrow_items (
    order_id BIGINT UNSIGNED NOT NULL, character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL,
    PRIMARY KEY (order_id), KEY idx_market_escrow_owner (character_id,item_id),
    CONSTRAINT fk_market_escrow_order FOREIGN KEY (order_id) REFERENCES market_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_market_escrow_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_market_escrow_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS market_trades (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, buy_order_id BIGINT UNSIGNED NOT NULL, sell_order_id BIGINT UNSIGNED NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL, unit_price BIGINT UNSIGNED NOT NULL,
    gross_copper BIGINT UNSIGNED NOT NULL, fee_copper BIGINT UNSIGNED NOT NULL, seller_net_copper BIGINT UNSIGNED NOT NULL,
    risk_state ENUM('normal','delayed','flagged') NOT NULL DEFAULT 'normal', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_market_trade_item_created (item_id,created_at), KEY idx_market_trade_buy (buy_order_id), KEY idx_market_trade_sell (sell_order_id),
    CONSTRAINT fk_market_trade_buy FOREIGN KEY (buy_order_id) REFERENCES market_orders(id),
    CONSTRAINT fk_market_trade_sell FOREIGN KEY (sell_order_id) REFERENCES market_orders(id),
    CONSTRAINT fk_market_trade_item FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS market_weekly_volume (
    character_id BIGINT UNSIGNED NOT NULL, week_key CHAR(8) NOT NULL, gross_sales BIGINT UNSIGNED NOT NULL DEFAULT 0,
    fee_paid BIGINT UNSIGNED NOT NULL DEFAULT 0, cancellation_count INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id,week_key), CONSTRAINT fk_market_weekly_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS market_risk_flags (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, flag_type VARCHAR(32) NOT NULL,
    score SMALLINT UNSIGNED NOT NULL DEFAULT 1, details JSON NULL, status ENUM('open','reviewed','cleared') NOT NULL DEFAULT 'open',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), KEY idx_market_risk_character (character_id,status,created_at),
    CONSTRAINT fk_market_risk_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_goblin_king_quest (
    character_id BIGINT UNSIGNED NOT NULL, stage TINYINT UNSIGNED NOT NULL DEFAULT 0, goblin_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    region_id BIGINT UNSIGNED NULL, pos_x INT NULL, pos_y INT NULL, pos_z INT NULL, encounter_id VARCHAR(96) NULL, boss_spawn_id BIGINT UNSIGNED NULL,
    completed_at DATETIME NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id), KEY idx_goblin_king_boss_spawn (boss_spawn_id),
    CONSTRAINT fk_goblin_king_quest_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_goblin_king_quest_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_npc_affinity (
    character_id BIGINT UNSIGNED NOT NULL, npc_code VARCHAR(64) NOT NULL, affinity BIGINT NOT NULL DEFAULT 0, daily_date DATE NOT NULL, daily_interactions TINYINT UNSIGNED NOT NULL DEFAULT 0,
    daily_chat_count TINYINT UNSIGNED NOT NULL DEFAULT 0, daily_buy_count TINYINT UNSIGNED NOT NULL DEFAULT 0, daily_sell_count TINYINT UNSIGNED NOT NULL DEFAULT 0, daily_craft_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,npc_code), KEY idx_npc_affinity_npc (npc_code,affinity), CONSTRAINT fk_npc_affinity_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_friend_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, requester_character_id BIGINT UNSIGNED NOT NULL, target_character_id BIGINT UNSIGNED NOT NULL,
    status ENUM('pending','accepted','rejected','expired','cancelled') NOT NULL DEFAULT 'pending', expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, responded_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_friend_request_target_status (target_character_id,status,created_at), KEY idx_friend_request_requester_status (requester_character_id,status,created_at),
    CONSTRAINT fk_friend_request_requester FOREIGN KEY (requester_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_friend_request_target FOREIGN KEY (target_character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_relationships (
    character_low_id BIGINT UNSIGNED NOT NULL, character_high_id BIGINT UNSIGNED NOT NULL,
    status ENUM('friend','oath','ended') NOT NULL DEFAULT 'friend', affinity INT UNSIGNED NOT NULL DEFAULT 0,
    daily_date DATE NOT NULL, daily_interactions TINYINT UNSIGNED NOT NULL DEFAULT 0, daily_gifts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    daily_bouquet_count TINYINT UNSIGNED NOT NULL DEFAULT 0, daily_fruit_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
    daily_ceremony_count TINYINT UNSIGNED NOT NULL DEFAULT 0, became_friends_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_low_id,character_high_id), KEY idx_relationship_low_status (character_low_id,status), KEY idx_relationship_high_status (character_high_id,status),
    CONSTRAINT fk_relationship_low FOREIGN KEY (character_low_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_relationship_high FOREIGN KEY (character_high_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_oath_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, proposer_character_id BIGINT UNSIGNED NOT NULL, target_character_id BIGINT UNSIGNED NOT NULL,
    status ENUM('pending','accepted','rejected','expired','cancelled') NOT NULL DEFAULT 'pending', expires_at DATETIME NOT NULL,
    source_space_id VARCHAR(128) NULL, source_channel_id VARCHAR(128) NULL, source_is_private TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, responded_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_oath_request_target_status (target_character_id,status,created_at), KEY idx_oath_request_proposer_status (proposer_character_id,status,created_at),
    CONSTRAINT fk_oath_request_proposer FOREIGN KEY (proposer_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_oath_request_target FOREIGN KEY (target_character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_oaths (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_low_id BIGINT UNSIGNED NOT NULL, character_high_id BIGINT UNSIGNED NOT NULL,
    initiator_character_id BIGINT UNSIGNED NOT NULL, status ENUM('ceremony_pending','active','release_pending','released') NOT NULL DEFAULT 'active',
    ceremony_at DATETIME NULL, ceremony_space_id VARCHAR(128) NULL, ceremony_channel_id VARCHAR(128) NULL, released_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_oath_pair (character_low_id,character_high_id), KEY idx_oath_low_status (character_low_id,status), KEY idx_oath_high_status (character_high_id,status),
    CONSTRAINT fk_oath_low FOREIGN KEY (character_low_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_oath_high FOREIGN KEY (character_high_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_oath_initiator FOREIGN KEY (initiator_character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_oath_release_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, oath_id BIGINT UNSIGNED NOT NULL, requester_character_id BIGINT UNSIGNED NOT NULL,
    target_character_id BIGINT UNSIGNED NOT NULL, status ENUM('pending','accepted','rejected','expired','cancelled') NOT NULL DEFAULT 'pending',
    expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, responded_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_oath_release_target_status (target_character_id,status,created_at),
    CONSTRAINT fk_oath_release_oath FOREIGN KEY (oath_id) REFERENCES player_oaths(id) ON DELETE CASCADE,
    CONSTRAINT fk_oath_release_requester FOREIGN KEY (requester_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_oath_release_target FOREIGN KEY (target_character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_daily_blessings (
    character_id BIGINT UNSIGNED NOT NULL, business_date DATE NOT NULL, blessed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reward_bouquet_quantity INT UNSIGNED NOT NULL DEFAULT 0, reward_fruit_quantity INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id,business_date), CONSTRAINT fk_daily_blessing_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_timed_buffs (
    character_id BIGINT UNSIGNED NOT NULL, buff_code VARCHAR(64) NOT NULL, expires_at DATETIME NOT NULL,
    experience_multiplier DECIMAL(6,3) NOT NULL DEFAULT 1.000, all_core_attributes_multiplier DECIMAL(6,3) NOT NULL DEFAULT 1.000,
    source VARCHAR(64) NOT NULL DEFAULT 'church_blessing', updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,buff_code), KEY idx_timed_buff_expiry (expires_at),
    CONSTRAINT fk_timed_buff_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS bounty_notices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, refresh_key VARCHAR(32) NOT NULL, title VARCHAR(96) NOT NULL, target_template_id BIGINT UNSIGNED NOT NULL, source_spawn_id BIGINT UNSIGNED NULL,
    required_count SMALLINT UNSIGNED NOT NULL, copper_reward INT UNSIGNED NOT NULL, is_active TINYINT(1) NOT NULL DEFAULT 1,
    expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_bounty_refresh_target (refresh_key,target_template_id), KEY idx_bounty_active (is_active,expires_at)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_bounties (
    character_id BIGINT UNSIGNED NOT NULL, bounty_id BIGINT UNSIGNED NOT NULL, progress SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('accepted','completed','claimed') NOT NULL DEFAULT 'accepted', accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL, claimed_at DATETIME NULL,
    PRIMARY KEY (character_id,bounty_id), KEY idx_player_bounty_status (character_id,status),
    CONSTRAINT fk_player_bounty_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_player_bounty_notice FOREIGN KEY (bounty_id) REFERENCES bounty_notices(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS bounty_board_slots (
    slot_no TINYINT UNSIGNED NOT NULL, bounty_id BIGINT UNSIGNED NOT NULL, assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (slot_no), UNIQUE KEY uk_bounty_board_notice (bounty_id),
    CONSTRAINT fk_bounty_board_notice FOREIGN KEY (bounty_id) REFERENCES bounty_notices(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS game_global_settings (
    setting_key VARCHAR(48) NOT NULL, numeric_value DECIMAL(8,2) NOT NULL DEFAULT 1.00, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (setting_key)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS combat_ambushes (
    spawn_id BIGINT UNSIGNED NOT NULL, character_id BIGINT UNSIGNED NOT NULL, ready_spawn_id BIGINT UNSIGNED NULL, status ENUM('waiting','ready','resolved') NOT NULL DEFAULT 'waiting',
    handoff_kind VARCHAR(16) NULL, source_session_id CHAR(36) NULL, opponent_character_id BIGINT UNSIGNED NULL,
    delivery_scope VARCHAR(16) NULL, delivery_target_id VARCHAR(128) NULL, delivery_bot_id VARCHAR(128) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (spawn_id,character_id), KEY idx_ambush_character_status (character_id,status),
    CONSTRAINT fk_ambush_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_travels (
    character_id BIGINT UNSIGNED NOT NULL, region_id BIGINT UNSIGNED NOT NULL, target_x INT NOT NULL, target_y INT NOT NULL, target_z INT NOT NULL, target_spawn_id BIGINT UNSIGNED NULL,
    activity_type ENUM('move','hunt') NOT NULL DEFAULT 'move',
    destination_kind ENUM('normal','home') NOT NULL DEFAULT 'normal',
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, arrival_at DATETIME NOT NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_travel_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_travel_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_movement_settings (
    character_id BIGINT UNSIGNED NOT NULL, movement_step TINYINT UNSIGNED NOT NULL DEFAULT 1, show_landmarks TINYINT(1) NOT NULL DEFAULT 1, show_players TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id), CONSTRAINT fk_movement_settings_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_hunt_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, spawn_id BIGINT UNSIGNED NOT NULL,
    found_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_hunt_history_character (character_id,id),
    CONSTRAINT fk_hunt_history_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS skill_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    category ENUM('physical','magic','utility','passive','bound','special') NOT NULL, tier ENUM('基础','下位','中位','上位','超位') NOT NULL DEFAULT '下位', damage_type VARCHAR(16) NOT NULL DEFAULT '无', skill_kind VARCHAR(16) NOT NULL DEFAULT '无', element VARCHAR(16) NOT NULL DEFAULT '无', range_type VARCHAR(16) NOT NULL DEFAULT '近战', target_scope VARCHAR(16) NOT NULL DEFAULT '单体', required_weapon_type VARCHAR(32) NULL, codex_id VARCHAR(16) NULL,
    mana_cost INT UNSIGNED NOT NULL DEFAULT 0, base_mana_cost INT UNSIGNED NULL, cooldown_turns TINYINT UNSIGNED NOT NULL DEFAULT 0, chant_turns TINYINT UNSIGNED NOT NULL DEFAULT 0,
    power INT UNSIGNED NOT NULL DEFAULT 100, learn_cost TINYINT UNSIGNED NOT NULL DEFAULT 1, upgrade_cost TINYINT UNSIGNED NOT NULL DEFAULT 1,
    max_level TINYINT UNSIGNED NOT NULL DEFAULT 5, power_per_level INT UNSIGNED NOT NULL DEFAULT 15, cooldown_reduction_per_level TINYINT UNSIGNED NOT NULL DEFAULT 0,
    passive_effect_json JSON NULL, description TEXT NOT NULL, PRIMARY KEY (id), UNIQUE KEY uk_skill_code (code), UNIQUE KEY uk_skill_codex_id (codex_id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_skills (
    character_id BIGINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NOT NULL, level TINYINT UNSIGNED NOT NULL DEFAULT 1,
    quick_slot TINYINT UNSIGNED NULL, passive_linked TINYINT(1) NOT NULL DEFAULT 0, learned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (character_id, skill_id), UNIQUE KEY uk_quick_slot (character_id, quick_slot),
    CONSTRAINT fk_player_skill_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_player_skill_definition FOREIGN KEY (skill_id) REFERENCES skill_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_appraisal_progress (
    character_id BIGINT UNSIGNED NOT NULL, range_level TINYINT UNSIGNED NOT NULL DEFAULT 1, information_level TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id), CONSTRAINT fk_appraisal_progress_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_auto_battle_settings (
    character_id BIGINT UNSIGNED NOT NULL, enabled TINYINT(1) NOT NULL DEFAULT 0, default_encounter_action ENUM('battle','persuade') NOT NULL DEFAULT 'battle', auto_potion_enabled TINYINT(1) NOT NULL DEFAULT 0,
    hp_threshold TINYINT UNSIGNED NOT NULL DEFAULT 30, hp_item_id BIGINT UNSIGNED NULL, mp_threshold TINYINT UNSIGNED NOT NULL DEFAULT 30, mp_item_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_auto_battle_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_auto_battle_actions (
    character_id BIGINT UNSIGNED NOT NULL, sequence_no TINYINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (character_id,sequence_no), CONSTRAINT fk_auto_action_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_battle_buffs (
    character_id BIGINT UNSIGNED NOT NULL, buff_code VARCHAR(64) NOT NULL, remaining_battles TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (character_id,buff_code), CONSTRAINT fk_battle_buff_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_auto_battle_quick_setup (
    character_id BIGINT UNSIGNED NOT NULL, next_sequence TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id), CONSTRAINT fk_auto_quick_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_pvp_auto_battle_settings (
    character_id BIGINT UNSIGNED NOT NULL, enabled TINYINT(1) NOT NULL DEFAULT 0, auto_potion_enabled TINYINT(1) NOT NULL DEFAULT 0,
    hp_threshold TINYINT UNSIGNED NOT NULL DEFAULT 30, hp_item_id BIGINT UNSIGNED NULL, mp_threshold TINYINT UNSIGNED NOT NULL DEFAULT 30, mp_item_id BIGINT UNSIGNED NULL, action_cursor SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id), CONSTRAINT fk_pvp_auto_battle_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_pvp_auto_battle_actions (
    character_id BIGINT UNSIGNED NOT NULL, sequence_no TINYINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (character_id,sequence_no), CONSTRAINT fk_pvp_auto_action_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_pvp_auto_battle_quick_setup (
    character_id BIGINT UNSIGNED NOT NULL, next_sequence TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id), CONSTRAINT fk_pvp_auto_quick_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_pvp_battle_sessions (
    id CHAR(36) NOT NULL, attacker_character_id BIGINT UNSIGNED NOT NULL, defender_character_id BIGINT UNSIGNED NOT NULL,
    turn_no INT UNSIGNED NOT NULL DEFAULT 1, state ENUM('active','attacker_win','defender_win','escaped') NOT NULL DEFAULT 'active',
    attacker_hp INT UNSIGNED NOT NULL, attacker_mp INT UNSIGNED NOT NULL, defender_hp INT UNSIGNED NOT NULL, defender_mp INT UNSIGNED NOT NULL,
    attacker_cooldowns JSON NOT NULL, defender_cooldowns JSON NOT NULL,
    ambush_spawn_id BIGINT UNSIGNED NULL, ambush_delivery_scope VARCHAR(16) NULL, ambush_delivery_target_id VARCHAR(128) NULL, ambush_delivery_bot_id VARCHAR(128) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_pvp_battle_attacker (attacker_character_id,state), KEY idx_pvp_battle_defender (defender_character_id,state),
    CONSTRAINT fk_pvp_battle_attacker FOREIGN KEY (attacker_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_pvp_battle_defender FOREIGN KEY (defender_character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_skill_discoveries (
    character_id BIGINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NOT NULL, discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,skill_id), KEY idx_skill_discovery_order (character_id,discovered_at),
    CONSTRAINT fk_skill_discovery_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_skill_discovery_skill FOREIGN KEY (skill_id) REFERENCES skill_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS effect_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    effect_type ENUM('damage_over_time','stat_modifier','cleanse','control','shield','heal_over_time','mana_regen') NOT NULL,
    default_value DECIMAL(8,3) NOT NULL DEFAULT 0, default_duration TINYINT UNSIGNED NOT NULL DEFAULT 0,
    max_level TINYINT UNSIGNED NOT NULL DEFAULT 1, max_stacks TINYINT UNSIGNED NOT NULL DEFAULT 1, stackable TINYINT(1) NOT NULL DEFAULT 0,
    description TEXT NOT NULL, PRIMARY KEY (id), UNIQUE KEY uk_effect_code (code)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS skill_effects (
    skill_id BIGINT UNSIGNED NOT NULL, effect_id BIGINT UNSIGNED NOT NULL, effect_level TINYINT UNSIGNED NOT NULL DEFAULT 1,
    value_override DECIMAL(8,3) NULL, duration_override TINYINT UNSIGNED NULL, target_scope ENUM('enemy','ally','self') NOT NULL DEFAULT 'enemy',
    trigger_timing ENUM('on_hit','on_cast','turn_start') NOT NULL DEFAULT 'on_hit', PRIMARY KEY (skill_id,effect_id),
    CONSTRAINT fk_skill_effect_skill FOREIGN KEY (skill_id) REFERENCES skill_definitions(id) ON DELETE CASCADE,
    CONSTRAINT fk_skill_effect_definition FOREIGN KEY (effect_id) REFERENCES effect_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS monster_templates (
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
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS city_pursuit_officers (
    template_id BIGINT UNSIGNED NOT NULL, profession VARCHAR(32) NOT NULL, equipment_text VARCHAR(255) NOT NULL,
    PRIMARY KEY (template_id),
    CONSTRAINT fk_city_pursuit_officer_template FOREIGN KEY (template_id) REFERENCES monster_templates(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_monster_codex (
    character_id BIGINT UNSIGNED NOT NULL, monster_template_id BIGINT UNSIGNED NOT NULL, unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,monster_template_id), CONSTRAINT fk_monster_codex_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_monster_codex_template FOREIGN KEY (monster_template_id) REFERENCES monster_templates(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS monster_skill_learn_rules (
    monster_template_id BIGINT UNSIGNED NOT NULL, source_skill_code VARCHAR(64) NOT NULL, skill_id BIGINT UNSIGNED NOT NULL, chance DECIMAL(6,5) NOT NULL,
    PRIMARY KEY (monster_template_id,skill_id),
    CONSTRAINT fk_skill_learn_monster FOREIGN KEY (monster_template_id) REFERENCES monster_templates(id) ON DELETE CASCADE,
    CONSTRAINT fk_skill_learn_skill FOREIGN KEY (skill_id) REFERENCES skill_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS map_monster_pools (
    region_id BIGINT UNSIGNED NOT NULL, monster_template_id BIGINT UNSIGNED NOT NULL, spawn_weight INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (region_id, monster_template_id),
    CONSTRAINT fk_map_monster_pool_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE,
    CONSTRAINT fk_map_monster_pool_template FOREIGN KEY (monster_template_id) REFERENCES monster_templates(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS monster_encounter_texts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, monster_template_id BIGINT UNSIGNED NOT NULL, description TEXT NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_monster_encounter_text (monster_template_id, description(191)),
    CONSTRAINT fk_monster_encounter_template FOREIGN KEY (monster_template_id) REFERENCES monster_templates(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS map_npcs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, region_id BIGINT UNSIGNED NOT NULL, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    description TEXT NOT NULL, interaction_kind ENUM('npc','building') NOT NULL DEFAULT 'npc', pos_x INT NULL, pos_y INT NULL, pos_z INT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_map_npc_code (region_id, code),
    CONSTRAINT fk_map_npc_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS map_special_objects (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, region_id BIGINT UNSIGNED NOT NULL, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
    description TEXT NOT NULL, pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_map_special_object_code (region_id, code), UNIQUE KEY uk_map_special_object_position (region_id, pos_x, pos_y, pos_z),
    CONSTRAINT fk_map_special_object_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS map_move_texts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, region_id BIGINT UNSIGNED NOT NULL, description TEXT NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_map_move_text (region_id, description(128)),
    CONSTRAINT fk_map_move_text_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS monster_spawns (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, template_id BIGINT UNSIGNED NOT NULL, region_id BIGINT UNSIGNED NOT NULL,
    pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL, level INT UNSIGNED NULL,
    constitution SMALLINT UNSIGNED NULL, spirit SMALLINT UNSIGNED NULL, strength SMALLINT UNSIGNED NULL,
    intelligence SMALLINT UNSIGNED NULL, agility SMALLINT UNSIGNED NULL, perception SMALLINT UNSIGNED NULL,
    current_hp INT UNSIGNED NOT NULL, skill_sequence JSON NULL, traits_json JSON NULL, spawned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    defeated_at DATETIME NULL, PRIMARY KEY (id), KEY idx_spawn_location (region_id, pos_x, pos_y, pos_z, defeated_at), KEY idx_spawn_active_region (region_id, defeated_at),
    CONSTRAINT fk_spawn_template FOREIGN KEY (template_id) REFERENCES monster_templates(id),
    CONSTRAINT fk_spawn_region FOREIGN KEY (region_id) REFERENCES map_regions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS boss_bounty_rolls (
    spawn_id BIGINT UNSIGNED NOT NULL, last_roll_key VARCHAR(16) NOT NULL DEFAULT '', posted_at DATETIME NULL,
    PRIMARY KEY (spawn_id), KEY idx_boss_bounty_roll_posted (posted_at),
    CONSTRAINT fk_boss_bounty_roll_spawn FOREIGN KEY (spawn_id) REFERENCES monster_spawns(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS boss_test_sessions (
    id CHAR(36) NOT NULL, owner_character_id BIGINT UNSIGNED NOT NULL, boss_spawn_id BIGINT UNSIGNED NOT NULL, arena_region_id BIGINT UNSIGNED NOT NULL,
    state ENUM('active','finished','abandoned') NOT NULL DEFAULT 'active', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at DATETIME NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_boss_test_spawn (boss_spawn_id), KEY idx_boss_test_owner_state (owner_character_id,state),
    CONSTRAINT fk_boss_test_owner FOREIGN KEY (owner_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_boss_test_spawn FOREIGN KEY (boss_spawn_id) REFERENCES monster_spawns(id) ON DELETE CASCADE,
    CONSTRAINT fk_boss_test_arena FOREIGN KEY (arena_region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS boss_test_participants (
    session_id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, return_region_id BIGINT UNSIGNED NOT NULL,
    return_x INT NOT NULL, return_y INT NOT NULL, return_z INT NOT NULL,
    PRIMARY KEY (session_id,character_id), KEY idx_boss_test_participant_character (character_id,session_id),
    CONSTRAINT fk_boss_test_participant_session FOREIGN KEY (session_id) REFERENCES boss_test_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_boss_test_participant_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_boss_test_participant_region FOREIGN KEY (return_region_id) REFERENCES map_regions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS owner_test_equipment_snapshots (
    character_id BIGINT UNSIGNED NOT NULL, original_equipment_json JSON NOT NULL, test_instance_ids_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (character_id),
    CONSTRAINT fk_owner_test_equipment_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS dungeon_instances (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, entrance_region_id BIGINT UNSIGNED NOT NULL, entrance_x INT NOT NULL, entrance_y INT NOT NULL,
    origin_x INT NOT NULL, origin_y INT NOT NULL, state ENUM('active','cleared','closed') NOT NULL DEFAULT 'active',
    generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, cleared_at DATETIME NULL, refresh_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_dungeon_state_refresh (state,refresh_at), KEY idx_dungeon_entrance (entrance_region_id,entrance_x,entrance_y),
    CONSTRAINT fk_dungeon_entrance_region FOREIGN KEY (entrance_region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS dungeon_entrances (
    dungeon_id BIGINT UNSIGNED NOT NULL, region_id BIGINT UNSIGNED NOT NULL, pos_x INT NOT NULL, pos_y INT NOT NULL,
    PRIMARY KEY (dungeon_id,region_id,pos_x,pos_y), UNIQUE KEY uk_dungeon_entrance_location (region_id,pos_x,pos_y),
    CONSTRAINT fk_dungeon_entrance_instance FOREIGN KEY (dungeon_id) REFERENCES dungeon_instances(id) ON DELETE CASCADE,
    CONSTRAINT fk_dungeon_entrance_region_map FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS dungeon_cells (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, dungeon_id BIGINT UNSIGNED NOT NULL, pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL,
    cell_type ENUM('path','entrance','stairs_up','stairs_down','trap','chest','boss') NOT NULL DEFAULT 'path', trap_type VARCHAR(32) NULL, landmark_text TEXT NULL, chest_quality ENUM('青铜','白银','黄金') NULL, chest_opened TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id), UNIQUE KEY uk_dungeon_cell_position (dungeon_id,pos_x,pos_y,pos_z), KEY idx_dungeon_cell_position (pos_x,pos_y,pos_z),
    CONSTRAINT fk_dungeon_cell_instance FOREIGN KEY (dungeon_id) REFERENCES dungeon_instances(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS dungeon_monsters (
    dungeon_id BIGINT UNSIGNED NOT NULL, spawn_id BIGINT UNSIGNED NOT NULL, is_boss TINYINT(1) NOT NULL DEFAULT 0, is_floor_leader TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (dungeon_id,spawn_id), UNIQUE KEY uk_dungeon_monster_spawn (spawn_id), KEY idx_dungeon_boss (dungeon_id,is_boss),
    CONSTRAINT fk_dungeon_monster_instance FOREIGN KEY (dungeon_id) REFERENCES dungeon_instances(id) ON DELETE CASCADE,
    CONSTRAINT fk_dungeon_monster_spawn FOREIGN KEY (spawn_id) REFERENCES monster_spawns(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS dungeon_cell_triggers (
    cell_id BIGINT UNSIGNED NOT NULL, character_id BIGINT UNSIGNED NOT NULL, triggered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (cell_id,character_id), CONSTRAINT fk_dungeon_trigger_cell FOREIGN KEY (cell_id) REFERENCES dungeon_cells(id) ON DELETE CASCADE,
    CONSTRAINT fk_dungeon_trigger_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS map_resource_pools (
    region_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, spawn_density DECIMAL(8,5) NOT NULL,
    PRIMARY KEY (region_id,item_id),
    CONSTRAINT fk_resource_pool_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE,
    CONSTRAINT fk_resource_pool_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS resource_spawns (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, region_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL,
    pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL, spawned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, mined_at DATETIME NULL,
    PRIMARY KEY (id), KEY idx_resource_active_region (region_id,mined_at), KEY idx_resource_location (region_id,pos_x,pos_y,pos_z,mined_at),
    CONSTRAINT fk_resource_spawn_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE,
    CONSTRAINT fk_resource_spawn_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_resource_mining (
    character_id BIGINT UNSIGNED NOT NULL, resource_id BIGINT UNSIGNED NOT NULL, started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, finishes_at DATETIME NOT NULL,
    PRIMARY KEY (character_id), UNIQUE KEY uk_resource_mining_resource (resource_id), KEY idx_resource_mining_finish (finishes_at),
    CONSTRAINT fk_resource_mining_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_resource_mining_resource FOREIGN KEY (resource_id) REFERENCES resource_spawns(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS combat_sessions (
    id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, spawn_id BIGINT UNSIGNED NOT NULL,
    player_hp INT UNSIGNED NOT NULL, player_mp INT UNSIGNED NOT NULL, cooldowns JSON NOT NULL, opening_damage_bonus DECIMAL(4,2) NOT NULL DEFAULT 0,
    turn_no INT UNSIGNED NOT NULL DEFAULT 1, state ENUM('active','victory','defeat','escaped') NOT NULL DEFAULT 'active',
    last_action_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_combat_character_state (character_id, state), KEY idx_combat_state_activity (state,last_action_at),
    CONSTRAINT fk_combat_character FOREIGN KEY (character_id) REFERENCES characters(id), CONSTRAINT fk_combat_spawn FOREIGN KEY (spawn_id) REFERENCES monster_spawns(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS combat_members (
    session_id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, current_hp INT UNSIGNED NOT NULL, current_mp INT UNSIGNED NOT NULL,
    selected_target_id BIGINT UNSIGNED NULL, pending_action JSON NULL, cooldowns JSON NOT NULL, stamina_eligible TINYINT(1) NOT NULL DEFAULT 1, is_defeated TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, character_id), KEY idx_combat_member_character (character_id),
    CONSTRAINT fk_combat_member_session FOREIGN KEY (session_id) REFERENCES combat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_member_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_member_target FOREIGN KEY (selected_target_id) REFERENCES monster_spawns(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS combat_device_energy (
    battle_kind ENUM('pve','pvp') NOT NULL DEFAULT 'pve', session_id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, instance_id BIGINT UNSIGNED NOT NULL,
    current_energy SMALLINT UNSIGNED NOT NULL, max_energy SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (battle_kind,session_id,character_id,instance_id), KEY idx_combat_device_character (battle_kind,session_id,character_id),
    CONSTRAINT fk_combat_device_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_device_instance FOREIGN KEY (instance_id) REFERENCES player_item_instances(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS rare_forge_materials (
    item_id BIGINT UNSIGNED NOT NULL, hourly_attempts TINYINT UNSIGNED NOT NULL, attempt_chance DECIMAL(5,4) NOT NULL,
    per_region_active_cap SMALLINT UNSIGNED NOT NULL, min_region_level SMALLINT UNSIGNED NOT NULL, mining_seconds INT UNSIGNED NOT NULL,
    yield_json JSON NOT NULL, PRIMARY KEY (item_id),
    CONSTRAINT fk_rare_forge_material_item FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS rare_material_refresh_logs (
    refresh_hour DATETIME NOT NULL, PRIMARY KEY (refresh_hour)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS combat_profession_resources (
    session_id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, profession_code VARCHAR(64) NOT NULL,
    resource_code VARCHAR(32) NOT NULL, resource_name VARCHAR(32) NOT NULL, current_value TINYINT UNSIGNED NOT NULL DEFAULT 0, max_value TINYINT UNSIGNED NOT NULL DEFAULT 100,
    PRIMARY KEY (session_id,character_id), KEY idx_combat_resource_character (character_id),
    CONSTRAINT fk_combat_resource_session FOREIGN KEY (session_id) REFERENCES combat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_resource_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS combat_targets (
    session_id CHAR(36) NOT NULL, spawn_id BIGINT UNSIGNED NOT NULL, current_mp INT UNSIGNED NOT NULL DEFAULT 0, cooldowns JSON NOT NULL, is_defeated TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, spawn_id), KEY idx_combat_target_active (session_id, is_defeated),
    CONSTRAINT fk_combat_target_session FOREIGN KEY (session_id) REFERENCES combat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_target_spawn FOREIGN KEY (spawn_id) REFERENCES monster_spawns(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS combat_spirits (
    session_id CHAR(36) NOT NULL, owner_character_id BIGINT UNSIGNED NOT NULL,
    spirit_code VARCHAR(32) NOT NULL, spirit_name VARCHAR(64) NOT NULL, current_hp INT UNSIGNED NOT NULL, hp_max INT UNSIGNED NOT NULL, stats_json JSON NULL, remaining_turns TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (session_id,owner_character_id,spirit_code), KEY idx_combat_spirit_owner (session_id,owner_character_id),
    CONSTRAINT fk_combat_spirit_session FOREIGN KEY (session_id) REFERENCES combat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_spirit_owner FOREIGN KEY (owner_character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS combat_threat (
    session_id CHAR(36) NOT NULL, spawn_id BIGINT UNSIGNED NOT NULL, character_id BIGINT UNSIGNED NOT NULL, threat INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, spawn_id, character_id), KEY idx_combat_threat_target (session_id, spawn_id, threat),
    CONSTRAINT fk_combat_threat_session FOREIGN KEY (session_id) REFERENCES combat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_threat_spawn FOREIGN KEY (spawn_id) REFERENCES monster_spawns(id),
    CONSTRAINT fk_combat_threat_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_skill_specializations (
    character_id BIGINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NOT NULL, specialization ENUM('overcharge','instant','efficient','potent') NOT NULL,
    level TINYINT UNSIGNED NOT NULL DEFAULT 1, PRIMARY KEY (character_id,skill_id,specialization),
    CONSTRAINT fk_specialization_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_specialization_skill FOREIGN KEY (skill_id) REFERENCES skill_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_skill_point_ledger (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, amount INT NOT NULL,
    change_kind VARCHAR(32) NOT NULL, skill_id BIGINT UNSIGNED NULL, detail VARCHAR(128) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_skill_point_ledger_character_created (character_id,created_at),
    CONSTRAINT fk_skill_point_ledger_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_skill_point_ledger_skill FOREIGN KEY (skill_id) REFERENCES skill_definitions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS encounter_escape_tokens (
    character_id BIGINT UNSIGNED NOT NULL, region_id BIGINT UNSIGNED NOT NULL, pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_escape_token_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS dungeon_encounter_retreats (
    character_id BIGINT UNSIGNED NOT NULL, encounter_region_id BIGINT UNSIGNED NOT NULL, encounter_x INT NOT NULL, encounter_y INT NOT NULL, encounter_z INT NOT NULL,
    retreat_region_id BIGINT UNSIGNED NOT NULL, retreat_x INT NOT NULL, retreat_y INT NOT NULL, retreat_z INT NOT NULL,
    PRIMARY KEY (character_id), CONSTRAINT fk_dungeon_retreat_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS combat_status_effects (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, session_id CHAR(36) NOT NULL, target_kind ENUM('member','target') NOT NULL, target_id BIGINT UNSIGNED NOT NULL,
    effect_id BIGINT UNSIGNED NOT NULL, effect_level TINYINT UNSIGNED NOT NULL, value DECIMAL(8,3) NOT NULL, stacks TINYINT UNSIGNED NOT NULL DEFAULT 1,
    remaining_turns TINYINT UNSIGNED NOT NULL, PRIMARY KEY (id), KEY idx_combat_effect_target (session_id,target_kind,target_id,effect_id),
    KEY idx_combat_effect_turn (session_id,remaining_turns),
    CONSTRAINT fk_combat_effect_session FOREIGN KEY (session_id) REFERENCES combat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_combat_effect_definition FOREIGN KEY (effect_id) REFERENCES effect_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS parties (
    id CHAR(36) NOT NULL, name VARCHAR(32) NOT NULL DEFAULT '未命名队伍', leader_character_id BIGINT UNSIGNED NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_party_leader (leader_character_id), CONSTRAINT fk_party_leader FOREIGN KEY (leader_character_id) REFERENCES characters(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS party_members (
    party_id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (party_id, character_id), UNIQUE KEY uk_member_party (character_id),
    CONSTRAINT fk_party_member_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
    CONSTRAINT fk_party_member_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_homes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, home_name VARCHAR(32) NOT NULL DEFAULT '', town_region_id BIGINT UNSIGNED NOT NULL,
    plot_x INT NOT NULL, plot_y INT NOT NULL, plot_z INT NOT NULL DEFAULT 0, house_level TINYINT UNSIGNED NOT NULL DEFAULT 1,
    floor_count TINYINT UNSIGNED NOT NULL DEFAULT 1, status ENUM('active','demolished') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_home_character (character_id), KEY idx_home_plot (town_region_id,plot_x,plot_y,plot_z), KEY idx_home_town_status (town_region_id,status),
    CONSTRAINT fk_home_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_home_town FOREIGN KEY (town_region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_home_visits (
    character_id BIGINT UNSIGNED NOT NULL, home_id BIGINT UNSIGNED NOT NULL, entered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id), UNIQUE KEY uk_home_visit_home (home_id),
    CONSTRAINT fk_home_visit_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_home_visit_home FOREIGN KEY (home_id) REFERENCES player_homes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS home_furniture_definitions (
    code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL, description TEXT NOT NULL, effect_json JSON NOT NULL,
    required_house_level TINYINT UNSIGNED NOT NULL DEFAULT 1, max_per_floor TINYINT UNSIGNED NOT NULL DEFAULT 1,
    floor_slot_cost TINYINT UNSIGNED NOT NULL DEFAULT 1, grid_width TINYINT UNSIGNED NOT NULL DEFAULT 1, grid_height TINYINT UNSIGNED NOT NULL DEFAULT 1,
    placement_rule ENUM('wall','center','corner','wall_or_center') NOT NULL DEFAULT 'wall_or_center', layer_order SMALLINT NOT NULL DEFAULT 20,
    is_active TINYINT(1) NOT NULL DEFAULT 1, PRIMARY KEY (code)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS home_furniture_recipes (
    furniture_code VARCHAR(64) NOT NULL, item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL, PRIMARY KEY (furniture_code,item_id),
    CONSTRAINT fk_home_recipe_furniture FOREIGN KEY (furniture_code) REFERENCES home_furniture_definitions(code) ON DELETE CASCADE,
    CONSTRAINT fk_home_recipe_item FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_home_furniture (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, home_id BIGINT UNSIGNED NOT NULL, furniture_code VARCHAR(64) NOT NULL,
    floor_no TINYINT UNSIGNED NOT NULL DEFAULT 1, slot_key VARCHAR(32) NOT NULL, grid_x TINYINT UNSIGNED NULL, grid_y TINYINT UNSIGNED NULL,
    rotation SMALLINT UNSIGNED NOT NULL DEFAULT 0, layout_version SMALLINT UNSIGNED NOT NULL DEFAULT 2, placed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_home_furniture_slot (home_id,floor_no,slot_key), KEY idx_home_furniture_floor (home_id,floor_no,furniture_code),
    CONSTRAINT fk_home_furniture_home FOREIGN KEY (home_id) REFERENCES player_homes(id) ON DELETE CASCADE,
    CONSTRAINT fk_home_furniture_definition FOREIGN KEY (furniture_code) REFERENCES home_furniture_definitions(code)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_home_furniture_cells (
    home_id BIGINT UNSIGNED NOT NULL, floor_no TINYINT UNSIGNED NOT NULL, grid_x TINYINT UNSIGNED NOT NULL, grid_y TINYINT UNSIGNED NOT NULL,
    furniture_id BIGINT UNSIGNED NOT NULL, PRIMARY KEY (home_id,floor_no,grid_x,grid_y), KEY idx_home_furniture_cell_instance (furniture_id),
    CONSTRAINT fk_home_cell_furniture FOREIGN KEY (furniture_id) REFERENCES player_home_furniture(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_home_floor_renders (
    home_id BIGINT UNSIGNED NOT NULL, floor_no TINYINT UNSIGNED NOT NULL, layout_hash CHAR(64) NOT NULL, image_path VARCHAR(255) NOT NULL,
    rendered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (home_id,floor_no),
    CONSTRAINT fk_home_render_home FOREIGN KEY (home_id) REFERENCES player_homes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_home_storage_items (
    home_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL,
    stored_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (home_id,item_id), CONSTRAINT fk_home_storage_item_home FOREIGN KEY (home_id) REFERENCES player_homes(id) ON DELETE CASCADE,
    CONSTRAINT fk_home_storage_item_definition FOREIGN KEY (item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_home_storage_instances (
    instance_id BIGINT UNSIGNED NOT NULL, home_id BIGINT UNSIGNED NOT NULL, stored_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (instance_id), KEY idx_home_storage_instance_home (home_id),
    CONSTRAINT fk_home_storage_instance_home FOREIGN KEY (home_id) REFERENCES player_homes(id) ON DELETE CASCADE,
    CONSTRAINT fk_home_storage_instance_item FOREIGN KEY (instance_id) REFERENCES player_item_instances(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS home_shop_offers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, offer_code VARCHAR(64) NOT NULL, output_item_id BIGINT UNSIGNED NOT NULL,
    output_quantity INT UNSIGNED NOT NULL, input_item_id BIGINT UNSIGNED NULL, input_quantity INT UNSIGNED NOT NULL DEFAULT 0,
    copper_price BIGINT UNSIGNED NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1, sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id), UNIQUE KEY uk_home_offer_code (offer_code), KEY idx_home_offer_active (is_active,sort_order),
    CONSTRAINT fk_home_offer_output FOREIGN KEY (output_item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_home_offer_input FOREIGN KEY (input_item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`
];
const seedWorldSurfaceRegions = async (pool) => {
    for (const region of worldSurfaceRegions) {
        await pool.execute(`INSERT INTO map_regions (code,name,description,min_x,max_x,min_y,max_y,min_z,max_z,is_spawn_enabled,danger_level,is_owner_only,is_enabled,is_release_managed)
      VALUES (?,?,?,?,?,?,?,0,0,1,?,1,0,1)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),min_x=VALUES(min_x),max_x=VALUES(max_x),min_y=VALUES(min_y),max_y=VALUES(max_y),is_spawn_enabled=VALUES(is_spawn_enabled),danger_level=VALUES(danger_level)`, [region.code, region.name, region.description, region.minX, region.maxX, region.minY, region.maxY, region.danger]);
    }
};
const seedWorldSurfaceContent = async (pool) => {
    await pool.query(`INSERT INTO skill_definitions (code,name,category,damage_type,skill_kind,element,range_type,mana_cost,cooldown_turns,power,learn_cost,max_level,description) VALUES
    ('water_bolt','水箭','magic','水','元素','水','远程',18,2,112,1,5,'凝结水流射向目标，并压低其行动速度。'),
    ('slow','迟滞术','utility','无','控制','无','远程',16,3,0,1,5,'以迟滞魔力降低目标速度。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),damage_type=VALUES(damage_type),skill_kind=VALUES(skill_kind),element=VALUES(element),range_type=VALUES(range_type),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),description=VALUES(description)`);
    await pool.query(`INSERT INTO skill_effects (skill_id,effect_id,effect_level,value_override,duration_override,target_scope,trigger_timing) VALUES
    ((SELECT id FROM skill_definitions WHERE code='water_bolt'),(SELECT id FROM effect_definitions WHERE code='slow'),1,10,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='slow'),(SELECT id FROM effect_definitions WHERE code='slow'),1,15,2,'enemy','on_hit')
    ON DUPLICATE KEY UPDATE effect_level=VALUES(effect_level),value_override=VALUES(value_override),duration_override=VALUES(duration_override),target_scope=VALUES(target_scope),trigger_timing=VALUES(trigger_timing)`);
    await seedWorldSurfaceRegions(pool);
    for (const region of worldSurfaceRegions) {
        await pool.execute(`INSERT INTO map_terrain_zones (code,name,description,min_x,max_x,min_y,max_y,min_z,max_z,priority,tags_json)
      VALUES (?,?,?,?,?,?,?,0,0,?,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),min_x=VALUES(min_x),max_x=VALUES(max_x),min_y=VALUES(min_y),max_y=VALUES(max_y),priority=VALUES(priority),tags_json=VALUES(tags_json)`, [region.terrain.code, region.terrain.name, region.terrain.description, region.minX, region.maxX, region.minY, region.maxY, region.terrain.priority, JSON.stringify(region.terrain.tags)]);
    }
    for (const region of worldSurfaceRegions)
        await pool.execute(`INSERT INTO item_definitions
    (code,name,description,obtain_source,item_type,item_category,weight,stackable,effect_json)
    VALUES (?,?,?,'对应区域探索','consumable','地图',0.01,1,?)
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),stackable=1,effect_json=VALUES(effect_json)`, [`map_${region.code}`, `地图·${region.name}`, `记录${region.name}的地形边界与已知地貌；持有后可在世界地图中查看该区域。`, JSON.stringify({ map: region.code })]);
    for (const [code, name, description] of worldSurfaceMaterials)
        await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,stackable,effect_json)
    VALUES (?,?,?,'±400世界生态掉落','material','怪材',0.1,1,NULL)
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),stackable=1`, [code, name, description]);
    for (const monster of worldSurfaceMonsters) {
        const tier = monster.monsterClass === 'boss' ? 1.45 : monster.monsterClass === 'elite' ? 1.25 : monster.monsterClass === 'large' ? 1.12 : 1;
        const level = monster.level;
        const constitution = Math.max(4, Math.round((8 + level * 1.35) * tier));
        const spirit = Math.max(3, Math.round((6 + level * 1.05) * tier));
        const strength = Math.max(3, Math.round((7 + level * 1.28) * tier));
        const intelligence = Math.max(3, Math.round((6 + level * 1.15) * tier));
        const agility = Math.max(3, Math.round((6 + level * 1.08) * tier));
        const perception = Math.max(3, Math.round((6 + level * 1.12) * tier));
        const experience = Math.max(36, Math.round(level * (monster.monsterClass === 'boss' ? 30 : monster.monsterClass === 'elite' ? 11 : monster.monsterClass === 'large' ? 7 : 5)));
        const drops = JSON.stringify([
            { code: monster.materialCode, chance: monster.monsterClass === 'boss' ? 1 : monster.monsterClass === 'elite' ? .65 : .45, min_quantity: 1, max_quantity: monster.monsterClass === 'boss' ? 2 : 1 },
            { code: 'copper_coin', chance: 1, min_quantity: Math.max(2, level * 2), max_quantity: Math.max(5, level * 4) }
        ]);
        const skillSequence = monster.monsterClass === 'boss' ? [...monster.skillCodes, 'boss_mana_charge'] : monster.skillCodes;
        await pool.execute(`INSERT INTO monster_templates (code,name,monster_class,level,constitution,spirit,strength,intelligence,agility,perception,constitution_growth,spirit_growth,strength_growth,intelligence_growth,agility_growth,perception_growth,skill_sequence,experience,drops_json,weakness_json,resistance_json,element_mastery_json,element_resistance_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),monster_class=VALUES(monster_class),level=VALUES(level),constitution=VALUES(constitution),spirit=VALUES(spirit),strength=VALUES(strength),intelligence=VALUES(intelligence),agility=VALUES(agility),perception=VALUES(perception),constitution_growth=VALUES(constitution_growth),spirit_growth=VALUES(spirit_growth),strength_growth=VALUES(strength_growth),intelligence_growth=VALUES(intelligence_growth),agility_growth=VALUES(agility_growth),perception_growth=VALUES(perception_growth),skill_sequence=VALUES(skill_sequence),experience=VALUES(experience),drops_json=VALUES(drops_json),weakness_json=VALUES(weakness_json),resistance_json=VALUES(resistance_json),element_mastery_json=VALUES(element_mastery_json),element_resistance_json=VALUES(element_resistance_json)`, [monster.code, monster.name, monster.monsterClass, level, constitution, spirit, strength, intelligence, agility, perception, 0.8, 0.8, 0.9, 0.9, 0.8, 0.8, JSON.stringify(skillSequence), experience, drops, JSON.stringify([monster.weakness]), JSON.stringify([monster.resistance]), JSON.stringify(monster.element ? { [monster.element]: Math.min(50, level) } : {}), JSON.stringify(monster.element ? { [monster.element]: Math.min(35, Math.floor(level * .65)) } : {})]);
        await pool.execute(`INSERT IGNORE INTO monster_encounter_texts (monster_template_id,description)
      SELECT id,? FROM monster_templates WHERE code=?`, [`${monster.name}在${worldSurfaceRegions.find(region => region.code === monster.regionCode)?.name ?? '荒野'}中现身，警惕地注视着你的动作。`, monster.code]);
        await pool.execute(`INSERT INTO map_monster_pools (region_id,monster_template_id,spawn_weight)
      SELECT r.id,t.id,? FROM map_regions r JOIN monster_templates t ON t.code=? WHERE r.code=?
      ON DUPLICATE KEY UPDATE spawn_weight=VALUES(spawn_weight)`, [monster.monsterClass === 'boss' ? 0 : monster.monsterClass === 'elite' ? 2 : monster.monsterClass === 'large' ? 4 : 9, monster.code, monster.regionCode]);
        if (monster.monsterClass !== 'boss') {
            const sourceSkill = monster.skillCodes[0];
            if (sourceSkill)
                await pool.execute(`INSERT INTO monster_skill_learn_rules (monster_template_id,source_skill_code,skill_id,chance)
        SELECT t.id,?,s.id,? FROM monster_templates t JOIN skill_definitions s ON s.code=? WHERE t.code=? AND s.learn_cost<99
        ON DUPLICATE KEY UPDATE source_skill_code=VALUES(source_skill_code),chance=VALUES(chance)`, [sourceSkill, monster.monsterClass === 'elite' ? .06 : .12, sourceSkill, monster.code]);
        }
    }
    for (const component of regionalBossComponentDefinitions) {
        await pool.execute(`INSERT INTO monster_templates
      (code,name,monster_class,level,constitution,spirit,strength,intelligence,agility,perception,constitution_growth,spirit_growth,strength_growth,intelligence_growth,agility_growth,perception_growth,skill_sequence,experience,drops_json,weakness_json,resistance_json,element_mastery_json,element_resistance_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),monster_class=VALUES(monster_class),level=VALUES(level),skill_sequence=VALUES(skill_sequence),experience=0,drops_json=VALUES(drops_json),weakness_json=VALUES(weakness_json),resistance_json=VALUES(resistance_json),element_mastery_json=VALUES(element_mastery_json),element_resistance_json=VALUES(element_resistance_json)`, [
            component.templateCode, component.name, 'elite', 32, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0,
            JSON.stringify([]), 0, JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify({}), JSON.stringify(component.elementResistance)
        ]);
    }
    const level32BossProfiles = {
        gruen_mountainheart: [96, 52, 82, 42, 46, 57, 1.0, .6, 1.0, .5, .5, .65],
        valk_forge_overseer: [74, 70, 70, 105, 64, 72, .8, .9, .75, 1.15, .7, .85],
        threehead_mother: [75, 88, 56, 95, 90, 92, .75, 1.0, .6, 1.05, 1.0, .9],
        necromancer_uz: [68, 82, 32, 98, 46, 74, 1.3, 2.3, 1.0, 2.8, 1.4, 2.0]
    };
    for (const [code, profile] of Object.entries(level32BossProfiles))
        await pool.execute(`UPDATE monster_templates
    SET constitution=?,spirit=?,strength=?,intelligence=?,agility=?,perception=?,constitution_growth=?,spirit_growth=?,strength_growth=?,intelligence_growth=?,agility_growth=?,perception_growth=?
    WHERE code=?`, [...profile, code]);
    const surfaceMonsterCodes = worldSurfaceMonsters.map(monster => monster.code);
    if (surfaceMonsterCodes.length)
        await pool.execute(`DELETE r FROM monster_skill_learn_rules r
    JOIN monster_templates t ON t.id=r.monster_template_id
    JOIN skill_definitions s ON s.id=r.skill_id
    WHERE t.code IN (${surfaceMonsterCodes.map(() => '?').join(',')}) AND s.learn_cost>=99`, surfaceMonsterCodes);
    for (const region of worldSurfaceRegions) {
        const materials = worldSurfaceMonsters.filter(monster => monster.regionCode === region.code && monster.monsterClass !== 'boss').map(monster => monster.materialCode);
        const uniqueMaterials = [...new Set(materials)];
        for (const code of uniqueMaterials)
            await pool.execute(`INSERT INTO map_resource_pools (region_id,item_id,spawn_density)
      SELECT r.id,i.id,.00120 FROM map_regions r JOIN item_definitions i ON i.code=? WHERE r.code=?
      ON DUPLICATE KEY UPDATE spawn_density=VALUES(spawn_density)`, [code, region.code]);
    }
};
const seedMonsterCraftMaterials = async (pool) => {
    for (const material of allPurifiedCraftMaterials())
        await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,trade_price,stackable,effect_json)
    VALUES (?,?,?,'炼金师提纯','material','锻材',0.1,?,1,NULL)
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),trade_price=VALUES(trade_price),stackable=1`, [material.code, material.name, material.description, material.tradePrice]);
    for (const core of allBeastCoreMaterials())
        await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,stackable,effect_json)
    VALUES (?,?,?,'地图怪物掉落','material','怪材',0.1,1,?)
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),stackable=1,effect_json=VALUES(effect_json)`, [core.code, core.name, core.description, JSON.stringify({ beast_core: true })]);
    for (const meat of allMeatChunkMaterials())
        await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,stackable,effect_json)
    VALUES (?,?,?,'地图怪物掉落','material','食材',0.1,1,?)
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),stackable=1,effect_json=VALUES(effect_json)`, [meat.code, meat.name, meat.description, JSON.stringify({ meat_chunk: true })]);
    const [monsters] = await pool.execute(`SELECT t.id,t.code,t.name,t.level,t.monster_class FROM monster_templates t WHERE t.experience>0`);
    for (const monster of monsters) {
        const drops = [];
        const kinds = monsterCraftMaterialKinds(monster.name, monster.monster_class);
        for (const [materialIndex, kind] of kinds.entries()) {
            const code = monsterCraftMaterialCode(monster.code, kind);
            const name = monsterCraftMaterialName(monster.code, monster.name, kind, materialIndex);
            await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,stackable,effect_json)
        VALUES (?,?,?,'地图怪物掉落','material','怪材',0.1,1,?)
        ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),stackable=1,effect_json=VALUES(effect_json)`, [code, name, `${monster.name}独有的部位怪材，可由炼金师提纯为通用甲材。`, JSON.stringify({ monster_craft_material: kind, material_monster: monster.code, material_monster_class: monster.monster_class, material_monster_level: monster.level })]);
            const chance = monster.monster_class === 'boss' ? .15 : monster.monster_class === 'elite' ? .2 : monster.monster_class === 'large' ? .3 : .5;
            drops.push({ code: monsterCraftMaterialCode(monster.code, kind), material_kind: kind, material_monster: monster.code, chance, min_quantity: 1, max_quantity: 1 });
        }
        drops.push({ code: beastCoreCode(), dynamic_material: 'beast_core', chance: .1, min_quantity: 1, max_quantity: 1 });
        if (monsterDropsMeat(monster.name)) {
            const quantity = meatChunkQuantity(monster.monster_class);
            drops.push({ code: meatChunkCode(), dynamic_material: 'meat_chunk', chance: .6, min_quantity: quantity, max_quantity: quantity });
        }
        await pool.execute('UPDATE monster_templates SET drops_json=? WHERE id=?', [JSON.stringify(drops), monster.id]);
    }
};
const seedEpicForgeContent = async (pool) => {
    await pool.query(`UPDATE monster_templates SET level=CASE code
    WHEN 'goblin_vanguard' THEN 20 WHEN 'goblin_warrior' THEN 21 WHEN 'goblin_archer' THEN 21 WHEN 'goblin_bomber' THEN 22
    WHEN 'goblin_daredevil' THEN 23 WHEN 'goblin_drummer' THEN 22 WHEN 'goblin_shieldbearer' THEN 24 WHEN 'goblin_trapper' THEN 23
    WHEN 'goblin_priest' THEN 24 WHEN 'goblin_mage' THEN 25 WHEN 'goblin_assassin' THEN 29 WHEN 'goblin_earthshaper' THEN 30
    WHEN 'goblin_colonel' THEN 30 WHEN 'goblin_king' THEN 32 ELSE level END
    WHERE code IN ('goblin_vanguard','goblin_warrior','goblin_archer','goblin_bomber','goblin_daredevil','goblin_drummer','goblin_shieldbearer','goblin_trapper','goblin_priest','goblin_mage','goblin_assassin','goblin_earthshaper','goblin_colonel','goblin_king')`);
    for (const material of rareForgeMaterials)
        await pool.execute(`INSERT INTO item_definitions
    (code,name,description,obtain_source,item_type,item_category,weight,stackable,is_tradeable,effect_json)
    VALUES (?,?,?,'Lv.20+区域整点矿脉','material','稀有锻材',1,1,1,?)
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),stackable=1,is_tradeable=1,effect_json=VALUES(effect_json)`, [material.code, material.name, material.description, JSON.stringify({ rare_forge_material: true })]);
    for (const material of regionalForgeMaterials)
        await pool.execute(`INSERT INTO item_definitions
    (code,name,description,obtain_source,item_type,item_category,weight,stackable,is_tradeable,effect_json)
    VALUES (?,?,?,'对应Lv.20–30区域特产矿脉','material','区域锻材',.3,1,1,?)
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),stackable=1,is_tradeable=1,effect_json=VALUES(effect_json)`, [material.code, material.name, material.description, JSON.stringify({ regional_forge_material: true, region: material.regionCode })]);
    for (const material of rareForgeMaterials)
        await pool.execute(`INSERT INTO rare_forge_materials
    (item_id,hourly_attempts,attempt_chance,per_region_active_cap,min_region_level,mining_seconds,yield_json)
    SELECT id,?,?,?,?,?,? FROM item_definitions WHERE code=?
    ON DUPLICATE KEY UPDATE hourly_attempts=VALUES(hourly_attempts),attempt_chance=VALUES(attempt_chance),per_region_active_cap=VALUES(per_region_active_cap),min_region_level=VALUES(min_region_level),mining_seconds=VALUES(mining_seconds),yield_json=VALUES(yield_json)`, [material.hourlyAttempts, material.attemptChance, material.perRegionActiveCap, material.minRegionLevel, material.miningSeconds, JSON.stringify({ yields: material.yields, weights: material.weights }), material.code]);
    await pool.query(`DELETE rp FROM map_resource_pools rp JOIN map_regions r ON r.id=rp.region_id
    WHERE r.code IN ('dark_forest_deep','ridge_foothills','rediron_pass','mistalgae_marsh')`);
    for (const material of regionalForgeMaterials)
        await pool.execute(`INSERT INTO map_resource_pools (region_id,item_id,spawn_density)
    SELECT r.id,i.id,.01000 FROM map_regions r JOIN item_definitions i ON i.code=? WHERE r.code=?
    ON DUPLICATE KEY UPDATE spawn_density=VALUES(spawn_density)`, [material.code, material.regionCode]);
    await pool.execute(`INSERT INTO map_resource_pools (region_id,item_id,spawn_density)
    SELECT r.id,i.id,.01000 FROM map_regions r JOIN item_definitions i ON i.code='living_wood' WHERE r.code='dark_forest'
    ON DUPLICATE KEY UPDATE spawn_density=VALUES(spawn_density)`);
    for (const recipe of epicForgeRecipes) {
        const partCode = recipe.materials.find(material => material.code.endsWith('_seal') || material.code.endsWith('_brand') || material.code.endsWith('_sigel'))?.code;
        if (partCode)
            await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,stackable,is_tradeable,effect_json)
      VALUES (?,?,?,'对应区域Boss','material','Boss部件',.2,1,1,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),stackable=1,is_tradeable=1,effect_json=VALUES(effect_json)`, [partCode, { mountainheart_seal: '山心铸印', forge_warden_brand: '炉监烙印', threehead_molt_sigel: '三首蜕印', crown_hunt_seal: '王冠狩印' }[partCode] ?? partCode, `由${recipe.bossName}留下的史诗锻造部件。`, JSON.stringify({ epic_boss_part: recipe.bossCode })]);
        await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,stackable,is_tradeable,effect_json)
      VALUES (?,?,?,'对应区域Boss掉落','material','图纸',.05,1,1,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),stackable=1,is_tradeable=1,effect_json=VALUES(effect_json)`, [recipe.blueprintCode, `${recipe.name}图纸`, `一次性史诗装备图纸。用于打造【${recipe.name}】；打造成功后消耗 1 张。`, JSON.stringify({ epic_blueprint: recipe.code, boss: recipe.bossCode })]);
    }
    await pool.query(`DELETE rp FROM map_resource_pools rp JOIN item_definitions i ON i.id=rp.item_id
    WHERE i.code IN ('meteor_iron','star_copper','moon_silver','sun_gold')`);
    const recipesByBoss = new Map();
    for (const recipe of epicForgeRecipes)
        recipesByBoss.set(recipe.bossCode, [...(recipesByBoss.get(recipe.bossCode) ?? []), recipe]);
    for (const [bossCode, recipes] of recipesByBoss) {
        const [dropRows] = await pool.execute('SELECT id,drops_json FROM monster_templates WHERE code=? LIMIT 1', [bossCode]);
        const boss = dropRows[0];
        if (!boss)
            continue;
        const genericDrops = Array.isArray(boss.drops_json) ? boss.drops_json : typeof boss.drops_json === 'string' ? JSON.parse(boss.drops_json) : [];
        const filtered = genericDrops.filter((drop) => !String(drop.code ?? '').startsWith('blueprint_epic_') && !['mountainheart_seal', 'forge_warden_brand', 'threehead_molt_sigel', 'crown_hunt_seal'].includes(String(drop.code ?? '')));
        const partCode = recipes[0]?.materials.find(material => material.code.endsWith('_seal') || material.code.endsWith('_brand') || material.code.endsWith('_sigel'))?.code;
        if (partCode)
            filtered.push({ code: partCode, chance: 1, min_quantity: 1, max_quantity: 2 });
        for (const recipe of recipes)
            filtered.push({ code: recipe.blueprintCode, chance: recipe.category === '武器' ? .01 : .02, min_quantity: 1, max_quantity: 1 });
        await pool.execute('UPDATE monster_templates SET drops_json=? WHERE id=?', [JSON.stringify(filtered), boss.id]);
    }
};
const initializeSchema = async (pool) => {
    for (const statement of schemaStatements)
        await pool.query(statement);
    await (await import('./achievements.js')).initializeAchievements(pool);
    await (await import('../game/talent-data.js')).initializeTalentPersistence(pool);
    await (await import('./talent-codes.js')).migrateTalentCodes(pool);
    await (await import('./alchemy-v2.js')).initializeAlchemyV2(pool);
    await (await import('./inventory-binding.js')).initializeInventoryBinding(pool);
    await (await import('./automaton.js')).initializeAutomaton(pool);
    await (await import('./instance-market.js')).initializeInstanceMarket(pool);
    await seedDynamicAlchemyContent(pool);
    for (const column of [
        'main_quantity TINYINT UNSIGNED NOT NULL DEFAULT 1',
        'auxiliary_quantity TINYINT UNSIGNED NOT NULL DEFAULT 1',
        'reagent_quantity TINYINT UNSIGNED NOT NULL DEFAULT 1',
        "service_mode ENUM('personal','sweetshop') NOT NULL DEFAULT 'personal'",
        'alchemy_confirmation_expires_at DATETIME NULL',
        'alchemy_processing_until DATETIME NULL'
    ]) {
        try {
            await pool.query(`ALTER TABLE player_alchemy_sessions ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    for (const column of ['current_hp INT UNSIGNED NOT NULL DEFAULT 1 AFTER spirit_name', 'hp_max INT UNSIGNED NOT NULL DEFAULT 1 AFTER current_hp', 'stats_json JSON NULL AFTER hp_max']) {
        try {
            await pool.query(`ALTER TABLE combat_spirits ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    try {
        await pool.query('ALTER TABLE player_pvp_defeat_protections ADD COLUMN expires_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE player_pvp_defeat_protections ADD COLUMN notice_delivered_at DATETIME NULL');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    await pool.query(`CREATE TABLE IF NOT EXISTS map_terrain_zones (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL, description TEXT NOT NULL,
    min_x INT NOT NULL, max_x INT NOT NULL, min_y INT NOT NULL, max_y INT NOT NULL, min_z INT NOT NULL DEFAULT 0, max_z INT NOT NULL DEFAULT 0,
    priority SMALLINT NOT NULL DEFAULT 0, tags_json JSON NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_map_terrain_zone_code (code), KEY idx_map_terrain_bounds (min_x,max_x,min_y,max_y,min_z,max_z)
  ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS map_region_areas (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, region_id BIGINT UNSIGNED NOT NULL,
    min_x INT NOT NULL, max_x INT NOT NULL, min_y INT NOT NULL, max_y INT NOT NULL,
    min_z INT NOT NULL DEFAULT 0, max_z INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id), UNIQUE KEY uk_map_region_area_bounds (region_id,min_x,max_x,min_y,max_y,min_z,max_z),
    KEY idx_map_region_area_bounds (min_x,max_x,min_y,max_y,min_z,max_z),
    CONSTRAINT fk_map_region_area_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
    try {
        await pool.query('ALTER TABLE map_regions ADD COLUMN is_owner_only TINYINT(1) NOT NULL DEFAULT 0 AFTER is_spawn_enabled');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE map_regions ADD COLUMN is_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER is_owner_only');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE map_regions ADD COLUMN is_release_managed TINYINT(1) NOT NULL DEFAULT 0 AFTER is_enabled');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    await pool.query(`INSERT IGNORE INTO game_global_settings (setting_key,numeric_value) VALUES
    ('experience_multiplier',1.00),('drop_multiplier',1.00),('copper_multiplier',1.00)`);
    try {
        await pool.query("ALTER TABLE player_travels ADD COLUMN destination_kind ENUM('normal','home') NOT NULL DEFAULT 'normal' AFTER activity_type");
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE player_travels ADD COLUMN target_spawn_id BIGINT UNSIGNED NULL AFTER target_z');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    for (const column of [
        'grid_width TINYINT UNSIGNED NOT NULL DEFAULT 1',
        'grid_height TINYINT UNSIGNED NOT NULL DEFAULT 1',
        "placement_rule ENUM('wall','center','corner','wall_or_center') NOT NULL DEFAULT 'wall_or_center'",
        'layer_order SMALLINT NOT NULL DEFAULT 20'
    ]) {
        try {
            await pool.query(`ALTER TABLE home_furniture_definitions ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    for (const column of [
        'grid_x TINYINT UNSIGNED NULL',
        'grid_y TINYINT UNSIGNED NULL',
        'rotation SMALLINT UNSIGNED NOT NULL DEFAULT 0',
        'layout_version SMALLINT UNSIGNED NOT NULL DEFAULT 1'
    ]) {
        try {
            await pool.query(`ALTER TABLE player_home_furniture ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    await pool.query('ALTER TABLE player_home_furniture MODIFY COLUMN rotation SMALLINT UNSIGNED NOT NULL DEFAULT 0');
    await pool.query('ALTER TABLE player_home_furniture MODIFY COLUMN layout_version SMALLINT UNSIGNED NOT NULL DEFAULT 2');
    await pool.query(`INSERT IGNORE INTO dungeon_entrances (dungeon_id,region_id,pos_x,pos_y)
    SELECT id,entrance_region_id,entrance_x,entrance_y FROM dungeon_instances`);
    try {
        await pool.query('ALTER TABLE dungeon_cells ADD COLUMN landmark_text TEXT NULL AFTER trap_type');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query("ALTER TABLE dungeon_cells ADD COLUMN chest_quality ENUM('青铜','白银','黄金') NULL AFTER landmark_text");
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE dungeon_monsters ADD COLUMN is_floor_leader TINYINT(1) NOT NULL DEFAULT 0 AFTER is_boss');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE player_pvp_auto_battle_settings ADD COLUMN action_cursor SMALLINT UNSIGNED NOT NULL DEFAULT 1');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query("ALTER TABLE player_auto_battle_settings ADD COLUMN default_encounter_action ENUM('battle','persuade') NOT NULL DEFAULT 'battle' AFTER enabled");
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE player_movement_settings ADD COLUMN show_landmarks TINYINT(1) NOT NULL DEFAULT 1');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE player_movement_settings ADD COLUMN show_players TINYINT(1) NOT NULL DEFAULT 1');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    await pool.query(`UPDATE dungeon_monsters dm JOIN (
    SELECT * FROM (SELECT dm2.dungeon_id,MIN(dm2.spawn_id) AS spawn_id FROM dungeon_monsters dm2
      JOIN monster_spawns s2 ON s2.id=dm2.spawn_id WHERE dm2.is_boss=0 AND s2.pos_z=-10 GROUP BY dm2.dungeon_id) AS first_floor_leaders
  ) picked ON picked.dungeon_id=dm.dungeon_id AND picked.spawn_id=dm.spawn_id
    SET dm.is_floor_leader=1`);
    for (const table of ['guild_shop_items', 'blacksmith_shop_items', 'alchemist_shop_items', 'hunter_lodge_items', 'bookshop_items', 'oddworkshop_items']) {
        for (const column of ['stock_capacity INT UNSIGNED NOT NULL DEFAULT 0', 'stock_quantity INT UNSIGNED NOT NULL DEFAULT 0']) {
            try {
                await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column}`);
            }
            catch (error) {
                if (error?.code !== 'ER_DUP_FIELDNAME')
                    throw error;
            }
        }
    }
    try {
        await pool.query('ALTER TABLE combat_sessions DROP INDEX uk_active_character');
    }
    catch (error) {
        if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE combat_sessions ADD KEY idx_combat_character_state (character_id, state)');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_KEYNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE combat_sessions ADD COLUMN opening_damage_bonus DECIMAL(4,2) NOT NULL DEFAULT 0');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE combat_sessions ADD COLUMN last_action_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE combat_sessions ADD KEY idx_combat_state_activity (state,last_action_at)');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_KEYNAME')
            throw error;
    }
    try {
        await pool.query("ALTER TABLE player_homes ADD COLUMN home_name VARCHAR(32) NOT NULL DEFAULT '' AFTER character_id");
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    await pool.query("UPDATE player_homes h JOIN characters c ON c.id=h.character_id SET h.home_name=CONCAT(c.name,'的小屋') WHERE h.home_name=''");
    try {
        await pool.query('ALTER TABLE characters ADD COLUMN home_rest_experience_updated_at DATETIME NULL AFTER rest_started_at');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE characters ADD COLUMN detained_until DATETIME NULL AFTER rest_started_at');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    for (const column of ['last_seen_at DATETIME NULL', 'last_seen_x INT NULL', 'last_seen_y INT NULL']) {
        try {
            await pool.query(`ALTER TABLE player_warrants ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    for (const column of ['held_quantity INT UNSIGNED NOT NULL DEFAULT 0 AFTER quantity', 'sold_quantity INT UNSIGNED NOT NULL DEFAULT 0 AFTER held_quantity', 'sale_copper_amount BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER copper_amount', 'restitution_id CHAR(36) NULL AFTER returned_at', 'restitution_charged_copper BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER restitution_id', 'restitution_debt_copper BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER restitution_charged_copper']) {
        try {
            await pool.query(`ALTER TABLE pvp_stolen_loot ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    await pool.query('UPDATE pvp_stolen_loot SET held_quantity=quantity WHERE item_id IS NOT NULL AND held_quantity=0 AND sold_quantity=0 AND returned_at IS NULL');
    await pool.query("ALTER TABLE characters MODIFY COLUMN activity_status ENUM('active','resting','unconscious','detained') NOT NULL DEFAULT 'active'");
    try {
        await pool.query("ALTER TABLE player_travels ADD COLUMN activity_type ENUM('move','hunt') NOT NULL DEFAULT 'move'");
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE monster_spawns ADD KEY idx_spawn_active_region (region_id, defeated_at)');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_KEYNAME')
            throw error;
    }
    for (const column of ['skill_sequence JSON NULL', 'traits_json JSON NULL', 'level INT UNSIGNED NULL', 'constitution SMALLINT UNSIGNED NULL', 'spirit SMALLINT UNSIGNED NULL', 'strength SMALLINT UNSIGNED NULL', 'intelligence SMALLINT UNSIGNED NULL', 'agility SMALLINT UNSIGNED NULL', 'perception SMALLINT UNSIGNED NULL']) {
        try {
            await pool.query(`ALTER TABLE monster_spawns ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    await pool.query("ALTER TABLE monster_templates MODIFY COLUMN monster_class ENUM('normal','large','elite','boss') NOT NULL DEFAULT 'normal'");
    for (const column of ['current_mp INT UNSIGNED NOT NULL DEFAULT 0', 'cooldowns JSON NULL']) {
        try {
            await pool.query(`ALTER TABLE combat_targets ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    await pool.query("ALTER TABLE effect_definitions MODIFY COLUMN effect_type ENUM('damage_over_time','stat_modifier','cleanse','control','shield','heal_over_time','mana_regen') NOT NULL");
    await pool.query('UPDATE combat_targets SET cooldowns=JSON_OBJECT() WHERE cooldowns IS NULL');
    await pool.query('ALTER TABLE combat_targets MODIFY COLUMN cooldowns JSON NOT NULL');
    try {
        await pool.query('ALTER TABLE combat_members ADD COLUMN cooldowns JSON NULL');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    await pool.query('UPDATE combat_members SET cooldowns=JSON_OBJECT() WHERE cooldowns IS NULL');
    await pool.query('ALTER TABLE combat_members MODIFY COLUMN cooldowns JSON NOT NULL');
    try {
        await pool.query('ALTER TABLE combat_members ADD COLUMN stamina_eligible TINYINT(1) NOT NULL DEFAULT 1 AFTER cooldowns');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    for (const column of ['constitution SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'spirit SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'strength SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'intelligence SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'agility SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'perception SMALLINT UNSIGNED NOT NULL DEFAULT 0', 'constitution_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'spirit_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'strength_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'intelligence_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'agility_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'perception_growth DECIMAL(4,1) NOT NULL DEFAULT 0']) {
        try {
            await pool.query(`ALTER TABLE monster_templates ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    for (const column of ['hp_max INT UNSIGNED NOT NULL DEFAULT 0', 'attack INT UNSIGNED NOT NULL DEFAULT 0', 'defense INT UNSIGNED NOT NULL DEFAULT 0', 'speed INT UNSIGNED NOT NULL DEFAULT 0', 'charisma INT UNSIGNED NOT NULL DEFAULT 0']) {
        await pool.query(`ALTER TABLE monster_templates MODIFY COLUMN ${column}`);
    }
    await pool.query("ALTER TABLE registration_sessions MODIFY stage ENUM('story','audience','question','destination','heaven','danger','choice') NOT NULL DEFAULT 'story'");
    await pool.query("ALTER TABLE player_story_progress MODIFY COLUMN status ENUM('met','joined','declined','awaiting_arrival','arrival_story','guild_story','completed') NOT NULL DEFAULT 'met'");
    for (const column of ["adventurer_rank ENUM('F','E','D','C','B','A','S','SS','SSS') NOT NULL DEFAULT 'F'", 'profession_code VARCHAR(32) NULL', 'secondary_profession_code VARCHAR(32) NULL', 'copper_coins BIGINT UNSIGNED NOT NULL DEFAULT 0', 'delete_confirmation_code CHAR(6) NULL', 'delete_confirmation_expires_at DATETIME NULL']) {
        try {
            await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    try {
        await pool.query("ALTER TABLE admin_mail_edits ADD COLUMN title VARCHAR(96) NOT NULL DEFAULT '' AFTER recipient_scope");
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE bounty_notices ADD COLUMN source_spawn_id BIGINT UNSIGNED NULL');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE player_warrants ADD COLUMN pursuit_defeats TINYINT UNSIGNED NOT NULL DEFAULT 0');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query("ALTER TABLE player_forge_sessions ADD COLUMN entry_source ENUM('blacksmith','profession') NOT NULL DEFAULT 'blacksmith'");
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE bounty_notices MODIFY COLUMN refresh_key VARCHAR(32) NOT NULL');
    }
    catch (error) {
        if (error?.code !== 'ER_BAD_FIELD_ERROR')
            throw error;
    }
    for (const column of [
        'ready_spawn_id BIGINT UNSIGNED NULL',
        'handoff_kind VARCHAR(16) NULL',
        'source_session_id CHAR(36) NULL',
        'opponent_character_id BIGINT UNSIGNED NULL',
        'delivery_scope VARCHAR(16) NULL',
        'delivery_target_id VARCHAR(128) NULL',
        'delivery_bot_id VARCHAR(128) NULL'
    ]) {
        try {
            await pool.query(`ALTER TABLE combat_ambushes ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    for (const column of ['ambush_spawn_id BIGINT UNSIGNED NULL', 'ambush_delivery_scope VARCHAR(16) NULL', 'ambush_delivery_target_id VARCHAR(128) NULL', 'ambush_delivery_bot_id VARCHAR(128) NULL']) {
        try {
            await pool.query(`ALTER TABLE player_pvp_battle_sessions ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    for (const column of ['element_mastery_json JSON NULL', 'element_resistance_json JSON NULL']) {
        try {
            await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
        try {
            await pool.query(`ALTER TABLE monster_templates ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    await pool.query("ALTER TABLE player_equipment MODIFY slot ENUM('weapon','offhand','eye','shoulder','upper','waist','lower','feet','necklace','bracelet','ring') NOT NULL");
    await pool.query('ALTER TABLE player_item_instances MODIFY quality DECIMAL(5,2) NOT NULL DEFAULT 0.00');
    try {
        await pool.query('ALTER TABLE player_item_instances ADD COLUMN forge_primary_json JSON NULL AFTER effect_json');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE player_equipment ADD COLUMN instance_id BIGINT UNSIGNED NULL');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    await pool.query(`UPDATE player_equipment pe JOIN (SELECT character_id,item_id,MIN(id) AS instance_id FROM player_item_instances GROUP BY character_id,item_id) ii ON ii.character_id=pe.character_id AND ii.item_id=pe.item_id SET pe.instance_id=ii.instance_id WHERE pe.instance_id IS NULL`);
    try {
        await pool.query('ALTER TABLE player_equipment ADD UNIQUE KEY uk_equipment_instance (character_id,instance_id)');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_KEYNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE combat_status_effects ADD COLUMN source_key VARCHAR(80) NULL');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE combat_status_effects DROP INDEX uk_combat_effect_target');
    }
    catch (error) {
        if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE combat_status_effects ADD KEY idx_combat_effect_target (session_id,target_kind,target_id,effect_id)');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_KEYNAME')
            throw error;
    }
    for (const column of ['constitution_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'spirit_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'strength_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'intelligence_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'agility_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'perception_growth DECIMAL(4,1) NOT NULL DEFAULT 0', 'adventurer_registered TINYINT(1) NOT NULL DEFAULT 0', "gender VARCHAR(8) NOT NULL DEFAULT '未设定'", 'free_name_change_used TINYINT(1) NOT NULL DEFAULT 0', 'free_gender_change_used TINYINT(1) NOT NULL DEFAULT 0']) {
        try {
            await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    for (const column of ["item_category VARCHAR(32) NOT NULL DEFAULT '特殊'", "obtain_source VARCHAR(128) NOT NULL DEFAULT '未知来源'", "rarity ENUM('普通','优秀','精良','稀有','传说','史诗','神器') NOT NULL DEFAULT '普通'", 'required_level SMALLINT UNSIGNED NOT NULL DEFAULT 1', 'trade_price INT UNSIGNED NOT NULL DEFAULT 0', 'stackable TINYINT(1) NOT NULL DEFAULT 1', 'is_tradeable TINYINT(1) NOT NULL DEFAULT 1', 'codex_id VARCHAR(16) NULL']) {
        try {
            await pool.query(`ALTER TABLE item_definitions ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    await pool.query("ALTER TABLE item_definitions MODIFY COLUMN item_type ENUM('consumable','material','equipment','device') NOT NULL DEFAULT 'material'");
    await pool.query('ALTER TABLE item_definitions MODIFY COLUMN codex_id VARCHAR(16) NULL');
    await pool.query('UPDATE item_definitions SET codex_id=NULL WHERE id>=100000');
    try {
        await pool.query('ALTER TABLE item_definitions ADD COLUMN weapon_type VARCHAR(32) NULL');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    for (const column of ["damage_type VARCHAR(16) NOT NULL DEFAULT '无'", "skill_kind VARCHAR(16) NOT NULL DEFAULT '无'", "element VARCHAR(16) NOT NULL DEFAULT '无'", "range_type VARCHAR(16) NOT NULL DEFAULT '近战'", 'codex_id CHAR(7) NULL']) {
        try {
            await pool.query(`ALTER TABLE skill_definitions ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    try {
        await pool.query("ALTER TABLE skill_definitions ADD COLUMN target_scope VARCHAR(16) NOT NULL DEFAULT '单体' AFTER range_type");
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE characters ADD COLUMN tenacity_pierce INT UNSIGNED NOT NULL DEFAULT 0 AFTER tenacity');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE skill_definitions ADD COLUMN required_weapon_type VARCHAR(32) NULL AFTER range_type');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query("ALTER TABLE skill_definitions ADD COLUMN tier ENUM('基础','下位','中位','上位','超位') NOT NULL DEFAULT '下位' AFTER category");
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE skill_definitions ADD COLUMN base_mana_cost INT UNSIGNED NULL AFTER mana_cost');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE player_omniscient_boss_traces ADD COLUMN completed TINYINT(1) NOT NULL DEFAULT 0 AFTER interrupted');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE monster_skill_learn_rules ADD COLUMN source_skill_code VARCHAR(64) NULL AFTER monster_template_id');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    for (const column of ['skill_points INT UNSIGNED NOT NULL DEFAULT 1']) {
        try {
            await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    try {
        await pool.query('ALTER TABLE characters ADD COLUMN realm_stage TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER experience');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    for (const column of ['stamina SMALLINT UNSIGNED NOT NULL DEFAULT 120', 'stamina_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP']) {
        try {
            await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    try {
        await pool.query('ALTER TABLE characters ADD COLUMN game_id BIGINT UNSIGNED NULL AFTER id');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE characters ADD UNIQUE KEY uk_characters_game_id (game_id)');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_KEYNAME')
            throw error;
    }
    await pool.query('UPDATE characters SET game_id=10000000+id WHERE player_id IS NOT NULL AND game_id IS NULL');
    try {
        await pool.query("ALTER TABLE parties ADD COLUMN name VARCHAR(32) NOT NULL DEFAULT '未命名队伍' AFTER id");
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    await pool.query(`CREATE TABLE IF NOT EXISTS player_auto_battle_settings (character_id BIGINT UNSIGNED NOT NULL, enabled TINYINT(1) NOT NULL DEFAULT 0, default_encounter_action ENUM('battle','persuade') NOT NULL DEFAULT 'battle', auto_potion_enabled TINYINT(1) NOT NULL DEFAULT 0, hp_threshold TINYINT UNSIGNED NOT NULL DEFAULT 30, hp_item_id BIGINT UNSIGNED NULL, mp_threshold TINYINT UNSIGNED NOT NULL DEFAULT 30, mp_item_id BIGINT UNSIGNED NULL, PRIMARY KEY (character_id), CONSTRAINT fk_auto_battle_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS player_auto_battle_actions (character_id BIGINT UNSIGNED NOT NULL, sequence_no TINYINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NULL, PRIMARY KEY (character_id,sequence_no), CONSTRAINT fk_auto_action_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS player_auto_battle_quick_setup (character_id BIGINT UNSIGNED NOT NULL, next_sequence TINYINT UNSIGNED NOT NULL DEFAULT 1, PRIMARY KEY (character_id), CONSTRAINT fk_auto_quick_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`);
    await pool.query(`UPDATE player_auto_battle_settings settings LEFT JOIN player_story_progress story
    ON story.character_id=settings.character_id AND story.story_code='forest_guide' AND story.status='completed'
    SET settings.enabled=0 WHERE story.character_id IS NULL`);
    for (const column of ['learn_cost TINYINT UNSIGNED NOT NULL DEFAULT 1', 'upgrade_cost TINYINT UNSIGNED NOT NULL DEFAULT 1', 'max_level TINYINT UNSIGNED NOT NULL DEFAULT 5', 'power_per_level INT UNSIGNED NOT NULL DEFAULT 15', 'cooldown_reduction_per_level TINYINT UNSIGNED NOT NULL DEFAULT 0']) {
        try {
            await pool.query(`ALTER TABLE skill_definitions ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    try {
        await pool.query('ALTER TABLE skill_definitions ADD COLUMN passive_effect_json JSON NULL');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    await pool.query("ALTER TABLE skill_definitions MODIFY COLUMN category ENUM('physical','magic','utility','passive','bound','special') NOT NULL");
    await pool.query('ALTER TABLE skill_definitions MODIFY COLUMN codex_id VARCHAR(16) NULL');
    try {
        await pool.query('ALTER TABLE player_skills ADD COLUMN learned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE player_skills ADD COLUMN passive_linked TINYINT(1) NOT NULL DEFAULT 0 AFTER quick_slot');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    for (const column of ['daily_chat_count TINYINT UNSIGNED NOT NULL DEFAULT 0', 'daily_buy_count TINYINT UNSIGNED NOT NULL DEFAULT 0', 'daily_sell_count TINYINT UNSIGNED NOT NULL DEFAULT 0', 'daily_craft_count TINYINT UNSIGNED NOT NULL DEFAULT 0']) {
        try {
            await pool.query(`ALTER TABLE player_npc_affinity ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    for (const column of ['daily_bouquet_count TINYINT UNSIGNED NOT NULL DEFAULT 0', 'daily_fruit_count TINYINT UNSIGNED NOT NULL DEFAULT 0']) {
        try {
            await pool.query(`ALTER TABLE player_relationships ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    await pool.query("ALTER TABLE player_oaths MODIFY COLUMN status ENUM('ceremony_pending','active','release_pending','released') NOT NULL DEFAULT 'active'");
    try {
        await pool.query('ALTER TABLE skill_definitions ADD UNIQUE KEY uk_skill_codex_id (codex_id)');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_KEYNAME')
            throw error;
    }
    for (const column of ['weakness_json JSON NULL', 'resistance_json JSON NULL']) {
        try {
            await pool.query(`ALTER TABLE monster_templates ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    try {
        await pool.query('ALTER TABLE player_inventory ADD COLUMN acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    for (const column of ['processing_fee INT UNSIGNED NOT NULL DEFAULT 0', 'ingredients_json JSON NULL', 'buff_json JSON NULL', 'duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30']) {
        try {
            await pool.query(`ALTER TABLE guild_restaurant_menu ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    try {
        await pool.query('ALTER TABLE player_story_progress ADD COLUMN stage TINYINT UNSIGNED NOT NULL DEFAULT 1');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE characters MODIFY COLUMN player_id BIGINT UNSIGNED NULL');
    }
    catch (error) {
        if (error?.code !== 'ER_FK_INCOMPATIBLE_COLUMNS')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE characters ADD COLUMN npc_id BIGINT UNSIGNED NULL');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE characters ADD COLUMN npc_code VARCHAR(64) NULL');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE characters ADD UNIQUE KEY uk_characters_npc_id (npc_id)');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_KEYNAME')
            throw error;
    }
    try {
        await pool.query('ALTER TABLE characters ADD UNIQUE KEY uk_characters_npc_code (npc_code)');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_KEYNAME')
            throw error;
    }
    await pool.query(`UPDATE characters c JOIN players p ON p.id=c.player_id SET c.player_id=NULL,c.npc_id=CASE p.qq_user_id WHEN 'npc_forest_warrior' THEN 900000001 WHEN 'npc_forest_mage' THEN 900000002 WHEN 'npc_forest_priest' THEN 900000003 END,c.npc_code=p.qq_user_id WHERE p.qq_user_id IN ('npc_forest_warrior','npc_forest_mage','npc_forest_priest')`);
    await pool.query(`DELETE FROM players WHERE qq_user_id IN ('npc_forest_warrior','npc_forest_mage','npc_forest_priest')`);
    await pool.query(`UPDATE item_definitions SET item_category=CASE code WHEN 'holy_sword_shirulu' THEN '武器' WHEN 'demon_sword_aphia' THEN '武器' WHEN 'healing_herb' THEN '药剂' WHEN 'wolf_fang' THEN '怪材' ELSE item_category END, stackable=CASE WHEN item_type='equipment' THEN 0 ELSE 1 END`);
    await pool.query("UPDATE item_definitions SET item_category='怪材' WHERE item_category IN ('兽材','精兽材')");
    try {
        await pool.query("ALTER TABLE map_npcs ADD COLUMN interaction_kind ENUM('npc','building') NOT NULL DEFAULT 'npc' AFTER description");
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    await pool.query(`UPDATE item_definitions SET is_tradeable=0 WHERE item_category IN ('地图','特殊','任务','剧情') OR code='adventurer_card'`);
    await pool.query(`UPDATE item_definitions SET weapon_type=CASE code
    WHEN 'holy_sword_shirulu' THEN '长剑' WHEN 'demon_sword_aphia' THEN '长剑' WHEN 'saint_staff_istaria' THEN '法杖' WHEN 'death_dagger_azra' THEN '匕首' WHEN 'godfist_chronos' THEN '拳刃' WHEN 'oracle_grimoire_sophia' THEN '法书' WHEN 'prayer_orb_lumia' THEN '法球' WHEN 'immortal_shield_auges' THEN '盾牌' ELSE weapon_type END`);
    await pool.query(`UPDATE player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    SET ii.effect_json=JSON_SET(ii.effect_json,'$.artifact',JSON_EXTRACT(i.effect_json,'$.artifact'))
    WHERE ii.effect_json IS NOT NULL
      AND JSON_EXTRACT(i.effect_json,'$.artifact') IS NOT NULL
      AND (JSON_EXTRACT(ii.effect_json,'$.artifact') IS NULL OR JSON_TYPE(JSON_EXTRACT(ii.effect_json,'$.artifact'))<>'STRING')`);
    await pool.query(`UPDATE item_definitions SET codex_id=CONCAT(CASE WHEN item_type='equipment' THEN CASE item_category WHEN '武器' THEN '11' WHEN '副手' THEN '12' WHEN '头部' THEN '13' WHEN '头肩' THEN '13' WHEN '上装' THEN '14' WHEN '腰部' THEN '15' WHEN '下装' THEN '16' WHEN '脚部' THEN '17' WHEN '项链' THEN '18' WHEN '手镯' THEN '19' WHEN '戒指' THEN '10' ELSE '19' END WHEN item_type='consumable' THEN CASE item_category WHEN '药剂' THEN '21' WHEN '食物' THEN '22' ELSE '23' END WHEN item_type='material' THEN CASE item_category WHEN '食材' THEN '31' WHEN '草药' THEN '32' ELSE '39' END ELSE '99' END, CASE WHEN id>=100000 THEN CAST(id AS CHAR) ELSE LPAD(id,5,'0') END) WHERE codex_id IS NULL`);
    await pool.query(`INSERT INTO profession_definitions (code,name,description,growth_json,skill_codes_json) VALUES
    ('warrior','战士','以长剑与盾牌守住前线的职业。',JSON_OBJECT('constitution',1.2,'strength',1.2),JSON_ARRAY('longsword_mastery','shield_mastery')),
    ('mage','法师','以法杖与法书编织术式的职业。',JSON_OBJECT('spirit',1.2,'intelligence',1.2),JSON_ARRAY('staff_mastery','spellbook_mastery')),
    ('rogue','盗贼','以匕首与拳刃撕开破绽的职业。',JSON_OBJECT('agility',1.2,'perception',1.2),JSON_ARRAY('dagger_mastery','fistblade_mastery')),
    ('priest','牧师','以法书与法球守望同伴的职业。',JSON_OBJECT('constitution',1.2,'spirit',1.2),JSON_ARRAY('spellbook_mastery','orb_mastery'))
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),growth_json=VALUES(growth_json),skill_codes_json=VALUES(skill_codes_json)`);
    await pool.query('CREATE TABLE IF NOT EXISTS game_data_migrations (code VARCHAR(64) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
    const [deviceEnergyBattleKindMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('device_energy_battle_kind_v1')");
    if (Number(deviceEnergyBattleKindMigration.affectedRows) > 0) {
        try {
            await pool.query('ALTER TABLE combat_device_energy DROP FOREIGN KEY fk_combat_device_session');
        }
        catch (error) {
            if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY')
                throw error;
        }
        try {
            await pool.query("ALTER TABLE combat_device_energy ADD COLUMN battle_kind ENUM('pve','pvp') NOT NULL DEFAULT 'pve' FIRST");
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
        await pool.query('ALTER TABLE combat_device_energy DROP PRIMARY KEY, ADD PRIMARY KEY (battle_kind,session_id,character_id,instance_id)');
        try {
            await pool.query('ALTER TABLE combat_device_energy DROP INDEX idx_combat_device_character');
        }
        catch (error) {
            if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY')
                throw error;
        }
        await pool.query('ALTER TABLE combat_device_energy ADD KEY idx_combat_device_character (battle_kind,session_id,character_id)');
    }
    const [evolutionProfileMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('evolution_profiles_and_level_gates_v1')");
    if (Number(evolutionProfileMigration.affectedRows) > 0) {
        await pool.query(`INSERT IGNORE INTO player_evolution_profiles
      (character_id,unlocked_level,injection_count,evolution_scale,adaptation_pressure,stability,fixed_bonus_json,lineage_marks_json,final_traits_json)
      SELECT c.id,20,0,0,0,50,JSON_OBJECT(),JSON_OBJECT(),JSON_ARRAY()
      FROM characters c LEFT JOIN player_main_quest_progress q ON q.character_id=c.id AND q.quest_code='evolution_barrier'
      WHERE c.realm_stage=3 OR COALESCE(q.stage,0)>=8`);
        await pool.query(`UPDATE characters c LEFT JOIN player_evolution_profiles e ON e.character_id=c.id
      SET c.experience=CASE WHEN c.realm_stage=3 AND c.level>COALESCE(e.unlocked_level,20) THEN 0 WHEN c.realm_stage<3 AND c.level>20 THEN 0 ELSE c.experience END,
          c.level=CASE WHEN c.realm_stage=3 THEN LEAST(c.level,COALESCE(e.unlocked_level,20)) WHEN c.realm_stage<3 AND c.level>20 THEN 20 ELSE c.level END
      WHERE (c.realm_stage=3 AND c.level>COALESCE(e.unlocked_level,20)) OR (c.realm_stage<3 AND c.level>20)`);
        await pool.query(`DELETE pe FROM player_equipment pe JOIN characters c ON c.id=pe.character_id JOIN item_definitions i ON i.id=pe.item_id
      WHERE COALESCE(i.required_level,1)>c.level`);
        const { recalculateCharacterStats } = await import('../game/character.service.js');
        const [evolvedCharacters] = await pool.query('SELECT id FROM characters WHERE realm_stage=3');
        for (const character of evolvedCharacters)
            await recalculateCharacterStats(pool, Number(character.id));
    }
    const [symbiosisTraitMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('evolution_symbiosis_traits_v1')");
    if (Number(symbiosisTraitMigration.affectedRows) > 0) {
        const [traitColumn] = await pool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='player_evolution_profiles' AND column_name='symbiosis_trait_code'");
        if (!Number(traitColumn[0]?.total))
            await pool.query('ALTER TABLE player_evolution_profiles ADD COLUMN symbiosis_trait_code VARCHAR(32) NULL AFTER final_traits_json');
        await pool.query(`UPDATE player_evolution_profiles ep JOIN characters c ON c.id=ep.character_id
      SET ep.symbiosis_trait_code='shared_guard'
      WHERE ep.symbiosis_trait_code IS NULL AND EXISTS (
        SELECT 1 FROM player_events ev WHERE ev.player_id=c.player_id AND ev.event_type='evolution.injected'
          AND JSON_UNQUOTE(JSON_EXTRACT(ev.payload,'$.code'))='symbiosis'
      )`);
        const [legacySymbiosisCharacters] = await pool.query(`SELECT c.id FROM characters c JOIN player_evolution_profiles ep ON ep.character_id=c.id
      WHERE EXISTS (SELECT 1 FROM player_events ev WHERE ev.player_id=c.player_id AND ev.event_type='evolution.injected'
        AND JSON_UNQUOTE(JSON_EXTRACT(ev.payload,'$.code'))='symbiosis')`);
        await pool.query(`UPDATE player_evolution_profiles ep JOIN characters c ON c.id=ep.character_id JOIN (
        SELECT ev.player_id,COUNT(*) AS total FROM player_events ev WHERE ev.event_type='evolution.injected'
          AND JSON_UNQUOTE(JSON_EXTRACT(ev.payload,'$.code'))='symbiosis' GROUP BY ev.player_id
      ) legacy ON legacy.player_id=c.player_id
      SET ep.fixed_bonus_json=JSON_SET(ep.fixed_bonus_json,
        '$.mpPct',GREATEST(0,COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(ep.fixed_bonus_json,'$.mpPct')) AS DECIMAL(10,2)),0)-legacy.total*2),
        '$.tenacityPct',GREATEST(0,COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(ep.fixed_bonus_json,'$.tenacityPct')) AS DECIMAL(10,2)),0)-legacy.total*2))`);
        const { recalculateCharacterStats } = await import('../game/character.service.js');
        for (const character of legacySymbiosisCharacters)
            await recalculateCharacterStats(pool, Number(character.id));
    }
    const [evolutionObservationMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('evolution_observation_progress_v1')");
    if (Number(evolutionObservationMigration.affectedRows) > 0) {
        const [progressColumn] = await pool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='player_evolution_observations' AND column_name='progress'");
        if (!Number(progressColumn[0]?.total))
            await pool.query(`ALTER TABLE player_evolution_observations
        MODIFY status ENUM('available','accepted','completed','claimed') NOT NULL DEFAULT 'available',
        ADD COLUMN progress SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER status,
        ADD COLUMN target_count SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER progress,
        ADD COLUMN objective_text VARCHAR(255) NOT NULL DEFAULT '' AFTER target_count,
        ADD COLUMN completed_at DATETIME NULL AFTER reward_json,
        ADD COLUMN claimed_at DATETIME NULL AFTER completed_at,
        ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at`);
    }
    const [secondaryProfessionCurveMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('secondary_profession_shared_curve_v1')");
    if (Number(secondaryProfessionCurveMigration.affectedRows) > 0) {
        await pool.query('UPDATE player_secondary_professions SET level=LEAST(11,GREATEST(1,level)),proficiency=IF(level>=11,0,proficiency)');
    }
    const [goblinKingRescueMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('goblin_king_rescue_pear_v2')");
    if (Number(goblinKingRescueMigration.affectedRows) > 0) {
        await pool.query('UPDATE player_goblin_king_quest SET stage=0,goblin_kills=0,region_id=NULL,pos_x=NULL,pos_y=NULL,pos_z=NULL,encounter_id=NULL,boss_spawn_id=NULL,completed_at=NULL');
        await pool.query(`UPDATE monster_spawns SET current_hp=0,defeated_at=NOW()
      WHERE defeated_at IS NULL AND JSON_CONTAINS(COALESCE(traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_goblin_king'))`);
    }
    for (const column of ['region_id BIGINT UNSIGNED NULL AFTER dungeon_id', 'pos_x INT NULL AFTER region_id', 'pos_y INT NULL AFTER pos_x']) {
        try {
            await pool.query(`ALTER TABLE player_dungeon_entrance_marks ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    for (const column of ['element_base_mastery_json JSON NULL', 'element_base_resistance_json JSON NULL']) {
        try {
            await pool.query(`ALTER TABLE characters ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    const [entranceMarkMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('dungeon_entrance_marks_per_gate_v1')");
    if (Number(entranceMarkMigration.affectedRows) > 0) {
        await pool.query(`UPDATE player_dungeon_entrance_marks m JOIN dungeon_instances d ON d.id=m.dungeon_id
      SET m.region_id=d.entrance_region_id,m.pos_x=d.entrance_x,m.pos_y=d.entrance_y
      WHERE m.region_id IS NULL OR m.pos_x IS NULL OR m.pos_y IS NULL`);
        await pool.query('ALTER TABLE player_dungeon_entrance_marks DROP PRIMARY KEY, ADD PRIMARY KEY (character_id,dungeon_id,region_id,pos_x,pos_y)');
        await pool.query('ALTER TABLE player_dungeon_entrance_marks MODIFY COLUMN region_id BIGINT UNSIGNED NOT NULL, MODIFY COLUMN pos_x INT NOT NULL, MODIFY COLUMN pos_y INT NOT NULL');
    }
    const [growthMigration] = await pool.query('INSERT IGNORE INTO game_data_migrations (code) VALUES (\'profession_growth_2_to_1_2\')');
    if (Number(growthMigration.affectedRows) > 0) {
        await pool.query(`UPDATE characters SET
      constitution_growth=constitution_growth-IF(profession_code IN ('warrior','priest'),0.8,0),
      spirit_growth=spirit_growth-IF(profession_code IN ('mage','priest'),0.8,0),
      strength_growth=strength_growth-IF(profession_code='warrior',0.8,0),
      intelligence_growth=intelligence_growth-IF(profession_code='mage',0.8,0),
      agility_growth=agility_growth-IF(profession_code='rogue',0.8,0),
      perception_growth=perception_growth-IF(profession_code='rogue',0.8,0)
      WHERE profession_code IN ('warrior','mage','rogue','priest')`);
        const { recalculateCharacterStats } = await import('../game/character.service.js');
        const [characters] = await pool.query('SELECT id FROM characters WHERE profession_code IN (\'warrior\',\'mage\',\'rogue\',\'priest\')');
        for (const character of characters)
            await recalculateCharacterStats(pool, Number(character.id));
    }
    const [tenacityMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('tenacity_pierce_and_accuracy_rebalance_v1')");
    if (Number(tenacityMigration.affectedRows) > 0) {
        const [characters] = await pool.query('SELECT id FROM characters');
        for (const character of characters)
            await recalculateCharacterStats(pool, Number(character.id));
    }
    const [tenacityPierceWeightMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('tenacity_pierce_half_tenacity_v1')");
    if (Number(tenacityPierceWeightMigration.affectedRows) > 0) {
        const [characters] = await pool.query('SELECT id FROM characters');
        for (const character of characters)
            await recalculateCharacterStats(pool, Number(character.id));
    }
    const [derivedStatRatioMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('derived_stat_ratio_1_2_4_v3')");
    if (Number(derivedStatRatioMigration.affectedRows) > 0) {
        const [characters] = await pool.query('SELECT id FROM characters');
        for (const character of characters)
            await recalculateCharacterStats(pool, Number(character.id));
    }
    const [originalDerivedStatFormulaMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('derived_stat_formula_original_v4')");
    if (Number(originalDerivedStatFormulaMigration.affectedRows) > 0) {
        const [characters] = await pool.query('SELECT id FROM characters');
        for (const character of characters)
            await recalculateCharacterStats(pool, Number(character.id));
    }
    const [derivedStatRatio128Migration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('derived_stat_ratio_1_2_8_v5')");
    if (Number(derivedStatRatio128Migration.affectedRows) > 0) {
        const [characters] = await pool.query('SELECT id FROM characters');
        for (const character of characters)
            await recalculateCharacterStats(pool, Number(character.id));
    }
    try {
        await pool.query('ALTER TABLE item_definitions ADD UNIQUE KEY uk_item_codex_id (codex_id)');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_KEYNAME')
            throw error;
    }
    await pool.query(`UPDATE item_definitions SET code='meteor_iron',name='陨铁',description='自天外坠落的沉重铁矿，杂质极少，适合打造玄铁装备。',obtain_source='幽暗密林矿脉开采'
    WHERE code='refined_iron' AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM item_definitions WHERE code='meteor_iron') AS existing)`);
    await pool.execute(`INSERT INTO map_regions (code, name, description, min_x, max_x, min_y, max_y, min_z, max_z, is_spawn_enabled, danger_level)
     VALUES
       ('world_tree', '世界树', '世界的中心，占据约 20×20 格。', -10, 9, -10, 9, 0, 0, 0, 2),
       ('dark_forest', '幽暗密林', '世界树南侧上半段、常年被薄雾笼罩的扩展密林。', -220, 160, -180, -61, 0, 0, 1, 3),
       ('dark_forest_deep', '幽暗密林深处', '占据幽暗密林下半段的深林冒险带，古木遮天，路途更为险峻。', -220, 160, -300, -181, 0, 0, 1, 4),
       ('dark_forest_dungeon', '地下迷宫', '位于幽暗密林地下、不断重构的三层迷宫。墙壁与道路会随最终守卫的陨落而改变。', 0, 9999, 0, 24, -30, -10, 0, 30),
       ('baina_town', '百纳镇', '百族汇纳、诸族共居的边境小镇，横跨幽暗密林与幽暗密林深处的安全交界。', -25, 24, -205, -156, 0, 0, 0, 99)
     ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), min_x = VALUES(min_x), max_x = VALUES(max_x), min_y = VALUES(min_y), max_y = VALUES(max_y), min_z = VALUES(min_z), max_z = VALUES(max_z), is_spawn_enabled = VALUES(is_spawn_enabled), danger_level = VALUES(danger_level)`);
    await pool.execute(`INSERT INTO map_regions (code,name,description,min_x,max_x,min_y,max_y,min_z,max_z,is_spawn_enabled,danger_level,is_owner_only)
    VALUES ('boss_test_arena','首领测试场','仅供主人发起的首领强度测试使用；首领只会对测试队伍可见。',-400,-381,380,400,0,0,0,1000,1)
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),min_x=VALUES(min_x),max_x=VALUES(max_x),min_y=VALUES(min_y),max_y=VALUES(max_y),min_z=VALUES(min_z),max_z=VALUES(max_z),is_spawn_enabled=VALUES(is_spawn_enabled),danger_level=VALUES(danger_level),is_owner_only=VALUES(is_owner_only)`);
    await seedWorldSurfaceRegions(pool);
    const releaseManagedCodes = ['dark_forest_deep', ...worldSurfaceRegions.map(region => region.code)];
    await pool.execute('UPDATE map_regions SET is_owner_only=0 WHERE is_release_managed=1 AND is_enabled=1 AND is_owner_only=1');
    await pool.execute(`UPDATE map_regions SET is_release_managed=1,is_enabled=IF(is_owner_only=1,0,is_enabled)
    WHERE code IN (${releaseManagedCodes.map(() => '?').join(',')})`, releaseManagedCodes);
    const worldRegionAreas = [
        ['worldtree_meadow', -60, 60, -60, 60, 0, 0],
        ['gravelwind_shore', -220, -61, -60, 160, 0, 0],
        ['morningdew_riverbank', -60, 60, 61, 160, 0, 0],
        ['morningdew_riverbank', 61, 160, -60, 160, 0, 0],
        ['ridge_foothills', -360, -221, -160, 160, 0, 0],
        ['rediron_pass', -220, 160, 161, 300, 0, 0],
        ['mistalgae_marsh', 161, 360, -160, 160, 0, 0],
        ['dark_forest', -220, 160, -180, -61, 0, 0],
        ['dark_forest_deep', -220, 160, -300, -181, 0, 0],
        ['fallenstar_swamp', 161, 360, -400, -301, 0, 0],
        ['frostcrown_plateau', -220, 160, 301, 400, 0, 0],
        ['thundercliff', 161, 360, 161, 400, 0, 0],
        ['eclipse_ruins', 361, 400, -160, 160, 0, 0],
        ['world_tree', -10, 9, -10, 9, 0, 0],
        ['baina_town', -25, 24, -205, -156, 0, 0],
        ['boss_test_arena', -400, -381, 380, 400, 0, 0],
        ['dark_forest_dungeon', 0, 9999, 0, 24, -30, -10]
    ];
    const areaRegionCodes = [...new Set(worldRegionAreas.map(([code]) => code))];
    await pool.execute(`DELETE a FROM map_region_areas a JOIN map_regions r ON r.id=a.region_id WHERE r.code IN (${areaRegionCodes.map(() => '?').join(',')})`, areaRegionCodes);
    for (const [code, minX, maxX, minY, maxY, minZ, maxZ] of worldRegionAreas)
        await pool.execute(`INSERT INTO map_region_areas (region_id,min_x,max_x,min_y,max_y,min_z,max_z)
    SELECT id,?,?,?,?,?,? FROM map_regions WHERE code=?`, [minX, maxX, minY, maxY, minZ, maxZ, code]);
    await pool.execute(`UPDATE monster_spawns s JOIN map_regions r ON r.id=s.region_id
    LEFT JOIN map_region_areas a ON a.region_id=s.region_id AND s.pos_x BETWEEN a.min_x AND a.max_x AND s.pos_y BETWEEN a.min_y AND a.max_y AND s.pos_z BETWEEN a.min_z AND a.max_z
    SET s.current_hp=0,s.defeated_at=NOW() WHERE r.code IN (${areaRegionCodes.map(() => '?').join(',')}) AND s.defeated_at IS NULL AND a.id IS NULL`, areaRegionCodes);
    await pool.execute(`UPDATE resource_spawns s JOIN map_regions r ON r.id=s.region_id
    LEFT JOIN map_region_areas a ON a.region_id=s.region_id AND s.pos_x BETWEEN a.min_x AND a.max_x AND s.pos_y BETWEEN a.min_y AND a.max_y AND s.pos_z BETWEEN a.min_z AND a.max_z
    SET s.mined_at=NOW() WHERE r.code IN (${areaRegionCodes.map(() => '?').join(',')}) AND s.mined_at IS NULL AND a.id IS NULL`, areaRegionCodes);
    const [surfaceMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('world_surface_v1_south_shift')");
    if (Number(surfaceMigration.affectedRows) > 0) {
        await pool.query(`UPDATE characters c JOIN map_regions r ON r.id=c.current_region_id
      SET c.pos_y=c.pos_y-50 WHERE r.code IN ('dark_forest','dark_forest_deep','baina_town') AND c.pos_z=0`);
        await pool.query(`UPDATE monster_spawns s JOIN map_regions r ON r.id=s.region_id
      SET s.pos_y=s.pos_y-50 WHERE r.code IN ('dark_forest','dark_forest_deep','baina_town') AND s.pos_z=0`);
        await pool.query(`UPDATE resource_spawns s JOIN map_regions r ON r.id=s.region_id
      SET s.pos_y=s.pos_y-50 WHERE r.code IN ('dark_forest','dark_forest_deep','baina_town') AND s.pos_z=0`);
        await pool.query(`UPDATE player_travels t JOIN map_regions r ON r.id=t.region_id
      SET t.target_y=t.target_y-50 WHERE r.code IN ('dark_forest','dark_forest_deep','baina_town') AND t.target_z=0`);
        await pool.query(`UPDATE player_homes h JOIN map_regions town ON town.id=h.town_region_id
      SET h.plot_y=h.plot_y-50 WHERE town.code='baina_town' AND h.plot_z=0`);
    }
    const [geometryMigration] = await pool.query('INSERT IGNORE INTO game_data_migrations (code) VALUES (\'baina_forest_intersection_v1\')');
    if (Number(geometryMigration.affectedRows) > 0) {
        await pool.query(`UPDATE monster_spawns s JOIN map_regions r ON r.id=s.region_id JOIN map_regions town ON town.code='baina_town'
      SET s.current_hp=0,s.defeated_at=NOW()
      WHERE r.code IN ('dark_forest','dark_forest_deep') AND s.defeated_at IS NULL
        AND s.pos_x BETWEEN town.min_x AND town.max_x AND s.pos_y BETWEEN town.min_y AND town.max_y AND s.pos_z BETWEEN town.min_z AND town.max_z`);
        await pool.query(`UPDATE characters c JOIN map_regions town ON town.code='baina_town'
      SET c.current_region_id=town.id
      WHERE c.pos_x BETWEEN town.min_x AND town.max_x AND c.pos_y BETWEEN town.min_y AND town.max_y AND c.pos_z BETWEEN town.min_z AND town.max_z`);
    }
    const [outerRingMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('worldtree_outer_ring_layout_v2')");
    if (Number(outerRingMigration.affectedRows) > 0) {
        await pool.query(`UPDATE characters c JOIN map_regions r ON r.id=c.current_region_id SET c.pos_x=0,c.pos_y=-120,c.pos_z=0
      WHERE r.code='dark_forest' AND (c.pos_x NOT BETWEEN -220 AND 160 OR c.pos_y NOT BETWEEN -180 AND -61 OR c.pos_z<>0)`);
        await pool.query(`UPDATE characters c JOIN map_regions r ON r.id=c.current_region_id SET c.pos_x=0,c.pos_y=-240,c.pos_z=0
      WHERE r.code='dark_forest_deep' AND (c.pos_x NOT BETWEEN -220 AND 160 OR c.pos_y NOT BETWEEN -300 AND -181 OR c.pos_z<>0)`);
        await pool.query(`UPDATE characters c JOIN map_regions r ON r.id=c.current_region_id SET c.pos_x=-22,c.pos_y=-196,c.pos_z=0
      WHERE r.code='baina_town' AND (c.pos_x NOT BETWEEN -25 AND 24 OR c.pos_y NOT BETWEEN -205 AND -156 OR c.pos_z<>0)`);
        await pool.query(`UPDATE player_travels t JOIN map_regions r ON r.id=t.region_id
      SET t.target_x=CASE r.code WHEN 'dark_forest' THEN 0 WHEN 'dark_forest_deep' THEN 0 WHEN 'baina_town' THEN -22 ELSE t.target_x END,
          t.target_y=CASE r.code WHEN 'dark_forest' THEN -120 WHEN 'dark_forest_deep' THEN -240 WHEN 'baina_town' THEN -196 ELSE t.target_y END,
          t.target_z=0
      WHERE r.code IN ('dark_forest','dark_forest_deep','baina_town')`);
        await pool.query(`UPDATE player_homes h JOIN map_regions town ON town.id=h.town_region_id
      SET h.plot_x=-18,h.plot_y=-200,h.plot_z=0 WHERE town.code='baina_town'
        AND (h.plot_x NOT BETWEEN -25 AND 24 OR h.plot_y NOT BETWEEN -205 AND -156 OR h.plot_z<>0)`);
    }
    const [questCoordinateMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('goblin_king_quest_coordinate_outside_town_v1')");
    if (Number(questCoordinateMigration.affectedRows) > 0) {
        const [quests] = await pool.query(`SELECT q.character_id,q.stage,q.encounter_id,deep.id AS region_id,deep.min_x,deep.max_x,deep.min_y,town.min_y AS town_min_y
      FROM player_goblin_king_quest q
      JOIN map_regions deep ON deep.code='dark_forest_deep'
      JOIN map_regions town ON town.code='baina_town'
      WHERE q.stage BETWEEN 3 AND 10 AND q.region_id=deep.id
        AND q.pos_z=0 AND q.pos_x BETWEEN town.min_x AND town.max_x AND q.pos_y BETWEEN town.min_y AND town.max_y`);
        for (const quest of quests) {
            const maxY = Number(quest.town_min_y) - 1;
            let x = Number(quest.min_x);
            let y = Number(quest.min_y);
            let found = false;
            for (let attempt = 0; attempt < 80; attempt++) {
                x = Math.floor(Math.random() * (Number(quest.max_x) - Number(quest.min_x) + 1)) + Number(quest.min_x);
                y = Math.floor(Math.random() * (maxY - Number(quest.min_y) + 1)) + Number(quest.min_y);
                const [occupied] = await pool.query('SELECT 1 FROM monster_spawns WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=0 AND defeated_at IS NULL LIMIT 1', [quest.region_id, x, y]);
                if (!occupied[0]) {
                    found = true;
                    break;
                }
            }
            if (!found)
                continue;
            await pool.query('UPDATE player_goblin_king_quest SET pos_x=?,pos_y=? WHERE character_id=?', [x, y, quest.character_id]);
            if (quest.encounter_id)
                await pool.query(`UPDATE monster_spawns
        SET region_id=?,pos_x=?,pos_y=?,pos_z=0
        WHERE JSON_CONTAINS(COALESCE(traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_goblin_king','owner_character_id',?,'encounter_id',?))`, [quest.region_id, x, y, quest.character_id, quest.encounter_id]);
            await pool.query('DELETE FROM player_travels WHERE character_id=?', [quest.character_id]);
        }
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
    ('beast_core', '兽核', '低概率凝聚成形的兽类核心，会随武器主攻击类型转化为物攻或魔攻。', '幽暗密林兽类低概率掉落', 'material', '怪材', 0.08, 1, NULL),
    ('magic_wool', '魔力绒毛', '带有柔和魔力的兔类绒毛。', '兔类怪物掉落', 'material', '怪材', 0.05, 1, NULL),
    ('magic_tusk', '魔力獠牙', '蕴藏野性魔力的锋利獠牙。', '猪类怪物掉落', 'material', '怪材', 0.08, 1, NULL),
    ('magic_scale', '魔力鳞片', '带有自然魔力的蛇类鳞片。', '蛇类怪物掉落', 'material', '怪材', 0.05, 1, NULL),
    ('magic_claw', '魔力利爪', '由熊类巨爪凝成的锋利素材。', '熊类怪物掉落', 'material', '怪材', 0.10, 1, NULL),
    ('magic_heartcore', '魔力心核', '狼类魔力在心脏处凝聚而成的核心。', '狼类怪物掉落', 'material', '怪材', 0.08, 1, NULL),
    ('magic_blood', '魔力血髓', '蕴含稳定魔力循环的精兽血髓，可增强装备魔力上限。', '熊类与树精掉落', 'material', '怪材', 0.07, 1, NULL),
    ('magic_eye', '魔瞳晶核', '凝结于敏锐生物瞳孔中的晶核，可增强暴伤减免。', '兔类与狼类掉落', 'material', '怪材', 0.07, 1, NULL),
    ('magic_horn', '魔力角质', '由野性魔物角质硬化而成，可提升韧性。', '猪类与哥布林掉落', 'material', '怪材', 0.07, 1, NULL),
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
    ('slime_gel', '史莱姆凝胶', '从史莱姆身上收集的普通弹性凝胶，是制作奇妙家具的怪物材料。', '地下史莱姆 80% 掉落', 'material', '怪材', 0.10, 1, NULL),
    ('red_slime_gel', '红色凝胶', '炽热的史莱姆凝胶，可由解构师稳定析出火元素微尘。', '地下红色史莱姆 20% 掉落', 'material', '怪材', 0.10, 1, NULL),
    ('orange_slime_gel', '橙色凝胶', '裹着细砂的史莱姆凝胶，可由解构师稳定析出金元素微尘。', '地下橙色史莱姆 20% 掉落', 'material', '怪材', 0.10, 1, NULL),
    ('yellow_slime_gel', '黄色凝胶', '跳动电光的史莱姆凝胶，可由解构师稳定析出雷元素微尘。', '地下黄色史莱姆 20% 掉落', 'material', '怪材', 0.10, 1, NULL),
    ('green_slime_gel', '绿色凝胶', '带有草木气息的史莱姆凝胶，可由解构师稳定析出木元素微尘。', '地下绿色史莱姆 20% 掉落', 'material', '怪材', 0.10, 1, NULL),
    ('cyan_slime_gel', '青色凝胶', '湿润澄澈的史莱姆凝胶，可由解构师稳定析出水元素微尘。', '地下青色史莱姆 20% 掉落', 'material', '怪材', 0.10, 1, NULL),
    ('blue_slime_gel', '蓝色凝胶', '带着寒意的史莱姆凝胶，可由解构师稳定析出冰元素微尘。', '地下蓝色史莱姆 20% 掉落', 'material', '怪材', 0.10, 1, NULL),
    ('purple_slime_gel', '紫色凝胶', '幽暗微光流转的史莱姆凝胶，可由解构师稳定析出暗元素微尘。', '地下紫色史莱姆 5% 掉落', 'material', '怪材', 0.10, 1, NULL),
    ('black_slime_gel', '黑暗凝胶', '如夜色般深邃的史莱姆凝胶，可由解构师稳定析出暗元素微尘。', '地下黑暗史莱姆 5% 掉落', 'material', '怪材', 0.10, 1, NULL),
    ('blood_residue', '血肉残渣', '从兽材结构中拆出的血肉粒子，是生命药剂的基础主材。', '解构师分解', 'material', '粒子', 0.10, 1, NULL),
    ('energy_ember', '能量余烬', '从兽材魔力结构中析出的微弱能量粒子，是魔力药剂的基础主材。', '解构师分解', 'material', '粒子', 0.08, 1, NULL),
    ('magic_unit', '魔力微弧', '高级兽材分解后偶得的稳定魔力微弧，可用于调制秘药。', '解构师分解', 'material', '粒子', 0.05, 1, NULL),
    ('wood_element_dust', '木元素微尘', '活木解构后逸散出的木元素微粒，带着草木清香。', '锻材解构', 'material', '粒子', 0.03, 1, NULL),
    ('metal_element_dust', '金元素微尘', '金属锻材解构后析出的金元素微粒，闪着冷冽光泽。', '锻材解构', 'material', '粒子', 0.03, 1, NULL),
    ('water_element_dust', '水元素微尘', '星铜中游离出的水元素微粒，如晨露般清澈。', '锻材解构', 'material', '粒子', 0.03, 1, NULL),
    ('ice_element_dust', '冰元素微尘', '月银中沉淀的冰元素微粒，触之微寒。', '锻材解构', 'material', '粒子', 0.03, 1, NULL),
    ('dark_element_dust', '暗元素微尘', '月银阴影面析出的暗元素微粒，吞没周围的微光。', '锻材解构', 'material', '粒子', 0.03, 1, NULL),
    ('fire_element_dust', '火元素微尘', '曜金中跃动的火元素微粒，隐隐传来灼热。', '锻材解构', 'material', '粒子', 0.03, 1, NULL),
    ('thunder_element_dust', '雷元素微尘', '曜金中闪烁的雷元素微粒，偶有细微鸣响。', '锻材解构', 'material', '粒子', 0.03, 1, NULL),
    ('light_element_dust', '光元素微尘', '曜金辉芒中剥离的光元素微粒，温和而明亮。', '锻材解构', 'material', '粒子', 0.03, 1, NULL),
    ('magic_gear', '魔力齿轮', '以金元素微尘与魔力微弧构成的稳定传动基材。', '解构师构造', 'material', '基材', 0.30, 1, NULL),
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
    ('goblin_scrap_iron', '哥布林废铁', '哥布林王国兵器与盾牌上剥落的粗炼废铁。', '幽暗密林深处哥布林掉落', 'material', '怪材', 0.12, 1, NULL),
    ('goblin_whetstone', '粗磨刃石', '沾着暗红磨屑的粗糙磨刀石，可稳定强化攻击词条。', '幽暗密林深处战士、敢死队与刺客掉落', 'material', '怪材', 0.10, 1, NULL),
    ('goblin_bowstring', '林弦筋', '在古木湿气中仍保持韧性的弓弦筋。', '幽暗密林深处弓箭手与网罗工兵掉落', 'material', '怪材', 0.06, 1, NULL),
    ('goblin_blast_core', '爆裂核心', '自爆兵体内不稳定的火性核心，稍有震动便发热。', '幽暗密林深处自爆兵与敢死队掉落', 'material', '怪材', 0.06, 1, NULL),
    ('goblin_drumhide', '战鼓皮', '以兽皮与树脂绷成的战鼓皮，残留催战回响。', '幽暗密林深处战鼓手与盾卫掉落', 'material', '怪材', 0.09, 1, NULL),
    ('goblin_shadowcloth', '暗幕布', '浸过影沼汁液的黑布，能吸收微弱的光与脚步声。', '幽暗密林深处刺客与祭司掉落', 'material', '怪材', 0.05, 1, NULL),
    ('goblin_totem_shard', '沼影图腾片', '哥布林祭坛剥落的图腾碎片，暗属性魔力在裂纹间游走。', '幽暗密林深处祭司与法师掉落', 'material', '怪材', 0.05, 1, NULL),
    ('goblin_earth_crystal', '土行晶', '土行者从地脉中取出的浑浊晶体，握住时会传来震动。', '幽暗密林深处土行者与网罗工兵掉落', 'material', '怪材', 0.07, 1, NULL),
    ('goblin_command_seal', '军令残印', '哥布林军令印章的残片，仍保留着统御与护阵的力量。', '幽暗密林深处祭司与哥布林上校掉落', 'material', '怪材', 0.03, 1, NULL),
    ('goblin_colonel_insignia', '上校军徽', '哥布林上校佩戴的精英军徽，可为装备提供全属性固定加成。', '哥布林上校极低概率掉落', 'material', '怪材', 0.02, 1, NULL),
    ('riot_aura', '暴动的气息', '从暴动怪物身上剥离的躁动气息，隐约散发着危险的魔力。', '暴动怪物额外掉落', 'material', '怪材', 0.05, 1, NULL),
    ('living_wood', '活纹木胚', '保留生命纹路的木质锻造胚，可用于打造 Lv.1～10 装备。', '幽暗密林植被开采', 'material', '锻材', 0.40, 1, NULL),
    ('meteor_iron', '陨铁锻锭', '自天外坠落的沉重铁锭，杂质极少，可用于打造 Lv.11～20 装备。', '幽暗密林矿脉开采', 'material', '锻材', 0.60, 1, NULL),
    ('star_copper', '星铜锻锭', '泛着细碎星辉的精炼铜锭，可用于打造 Lv.21～30 装备。', '后续开放获取', 'material', '锻材', 0.50, 1, NULL),
    ('moon_silver', '月银锻锭', '吸收月华而柔韧的银质锻锭，可用于打造 Lv.31～40 装备。', '后续开放获取', 'material', '锻材', 0.45, 1, NULL),
    ('sun_gold', '曜金合锭', '流淌炽热金光的高纯合金锭，可用于打造 Lv.41～50 装备。', '后续开放获取', 'material', '锻材', 0.55, 1, NULL),
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
    ('oath_necklace_norn', '守誓项链·诺恩', '承诺会化为温热的光，护住仍愿前行的人。', '初始恩赐', 'equipment', '项链', 0.10, 0, JSON_OBJECT('artifact','oath_necklace','hpPct',50,'hpRegenPct',3)),
    ('fate_bracelet_clotho', '命运手镯·克洛托', '银线缠绕腕间，仿佛能将断裂的命运重新缝合。', '初始恩赐', 'equipment', '手镯', 0.20, 0, JSON_OBJECT('artifact','fate_bracelet','hpPct',33,'mpPct',33,'bloodForMana',true)),
    ('eternal_ring_aurora', '永恒戒指·奥罗拉', '黎明色的微光永不熄灭，指向每一场可能的胜利。', '初始恩赐', 'equipment', '戒指', 0.05, 0, JSON_OBJECT('artifact','eternal_ring','mpPct',50,'mpRegenPct',3)),
    ('rename_card', '改名卡', '用于再次修改角色昵称。首次改名免费，此后每次改名消耗一张。', '特殊途径获得', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('characterChange','name')),
    ('gender_change_card', '改性卡', '用于再次修改角色性别。首次改性免费，此后每次改性消耗一张。', '特殊途径获得', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('characterChange','gender'))
    ,('adventurer_card', '冒险者卡片', '记录冒险者身份、等级与职业的银白色卡片。', '百纳镇冒险者公会', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('adventurerCard',true))
    ,('map_baina_town', '地图·百纳镇', '标注百纳镇街巷、建筑与重要地点的城镇地图。', '梨子喵的新手引导', 'consumable', '地图', 0.01, 1, JSON_OBJECT('map','baina_town'))
    ,('map_world_tree', '地图·世界树', '以发光叶脉标出世界树根桥、祭坛与万叶联市的地图。', '少女的谢意', 'consumable', '地图', 0.01, 1, JSON_OBJECT('map','world_tree'))
    ,('map_dark_forest', '地图·幽暗密林', '记录幽暗密林外围道路与危险地带的探索地图。', '百纳镇冒险者公会商店', 'consumable', '地图', 0.01, 1, JSON_OBJECT('map','dark_forest'))
    ,('map_dark_forest_deep', '地图·幽暗密林深处', '标有幽暗密林深处的险路与古老遗迹的详尽地图。', '百纳镇冒险者公会商店', 'consumable', '地图', 0.01, 1, JSON_OBJECT('map','dark_forest_deep'))
    ,('demon_breaker_teleporter', '破魔传送器', '唯薇安研制的便携式传送装置。持有时可穿过地下迷宫入口的封印，也能在迷宫中借它强制脱离，回到入口之外。', '百纳镇·异工坊', 'consumable', '特殊', 0.60, 1, JSON_OBJECT('dungeonGatePass',true))
    ,('demon_breaker_teleporter_blueprint', '破魔传送器图纸', '记载破魔传送器完整回路的图纸；解构师持有后可稳定构造该装置。', '百纳镇·异工坊', 'consumable', '图纸', 0.01, 1, JSON_OBJECT('constructionBlueprint','demon_breaker_teleporter'))
    ,('heart_bouquet', '心意花束', '由修女亲手整理的花束，适合赠给并肩走过一段路的好友。', '圣恩教堂·祈福', 'consumable', '礼物', 0.05, 1, JSON_OBJECT('playerAffinity',25,'giftDailyLimit',3,'giftKind','heart_bouquet'))
    ,('resonance_fruit', '共鸣果实', '沾着星光的果实，入口后会留下温柔而清亮的回响。', '圣恩教堂·祈福', 'consumable', '礼物', 0.08, 1, JSON_OBJECT('playerAffinity',80,'giftDailyLimit',1,'giftKind','resonance_fruit'))
    ,('star_oath_ring', '星誓之环', '两枚环面相对时会映出同一片星空，是开启星誓仪式的重要信物。', '世界树相关剧情与探索', 'consumable', '特殊', 0.05, 1, JSON_OBJECT('starOathRing',true,'consumeOnStarOath',true))
    ,('worldtree_bud_charm', '芽辉护符', '由世界树新芽与金线编成的小护符。它不耀眼，却像有人把“平安回来”认真系在了你身边。', '万叶联市·梨子喵的赠礼', 'consumable', '特殊', 0.01, 1, JSON_OBJECT('girlGratitudeGift',true))
    ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), obtain_source = VALUES(obtain_source), item_category = VALUES(item_category), stackable = VALUES(stackable), effect_json = VALUES(effect_json)`);
    for (const recipe of constructionRecipes) {
        const isDevice = deviceCodes.has(recipe.code);
        if (recipe.constructionCategory !== '异械')
            continue;
        await pool.execute(`INSERT INTO item_definitions
      (code,name,description,obtain_source,item_type,item_category,rarity,required_level,weight,trade_price,stack_limit,stackable,is_tradeable,effect_json)
      VALUES (?,?,?,'解构师构造',?,?, '普通',?, ?,?, ?,?,?,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),required_level=VALUES(required_level),weight=VALUES(weight),trade_price=VALUES(trade_price),stack_limit=VALUES(stack_limit),stackable=VALUES(stackable),is_tradeable=VALUES(is_tradeable),effect_json=VALUES(effect_json)`, [
            recipe.code, recipe.name, recipe.description, recipe.outputType, recipe.itemCategory,
            recipe.recommendedSecondaryLevel, isDevice ? .45 : .15, Number(constructionValueByCode.get(recipe.code) ?? 0),
            isDevice ? 1 : 99, isDevice ? 0 : 1, 0, JSON.stringify(recipe.effect ?? {})
        ]);
        await pool.execute(`INSERT INTO item_definitions
      (code,name,description,obtain_source,item_type,item_category,rarity,required_level,weight,trade_price,stack_limit,stackable,is_tradeable,effect_json)
      VALUES (?,?,?,'解构师图纸','consumable','图纸','优秀',1,.01,0,1,1,0,JSON_OBJECT('constructionBlueprint',?))
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),rarity=VALUES(rarity),required_level=VALUES(required_level),weight=VALUES(weight),trade_price=VALUES(trade_price),stack_limit=VALUES(stack_limit),stackable=VALUES(stackable),is_tradeable=VALUES(is_tradeable),effect_json=VALUES(effect_json)`, [
            recipe.blueprintCode, `${recipe.name}图纸`, `记录【${recipe.name}】完整构造回路的绑定图纸；持有后可在构造中显示并制作该物品。`, recipe.code
        ]);
    }
    for (const box of blindBoxBlueprints)
        await pool.execute(`INSERT INTO item_definitions
    (code,name,description,obtain_source,item_type,item_category,rarity,required_level,weight,trade_price,stack_limit,stackable,is_tradeable,effect_json)
    VALUES (?,?,?,'百纳镇·异工坊','consumable','图纸','优秀',?,.03,0,99,1,0,?)
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),rarity=VALUES(rarity),required_level=VALUES(required_level),weight=VALUES(weight),trade_price=VALUES(trade_price),stack_limit=VALUES(stack_limit),stackable=VALUES(stackable),is_tradeable=VALUES(is_tradeable),effect_json=VALUES(effect_json)`, [
            box.code, box.name, `打开后从尚未持有的图纸中随机获得一张：${box.outputs.map(code => constructionRecipes.find(recipe => recipe.code === code)?.name ?? code).join('、')}。`, box.requiredLevel, JSON.stringify({ deviceBlueprintBox: true, outputs: box.outputs })
        ]);
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
    for (const offer of workshopBlueprints)
        await pool.execute(`INSERT INTO oddworkshop_items (item_id,buy_price,stock_capacity,stock_quantity,is_active)
    SELECT id,?,99,99,1 FROM item_definitions WHERE code=?
    ON DUPLICATE KEY UPDATE buy_price=VALUES(buy_price),stock_capacity=VALUES(stock_capacity),is_active=1`, [offer.price, `${offer.code}_blueprint`]);
    for (const box of blindBoxBlueprints)
        await pool.execute(`INSERT INTO oddworkshop_items (item_id,buy_price,stock_capacity,stock_quantity,is_active)
    SELECT id,?,99,99,1 FROM item_definitions WHERE code=?
    ON DUPLICATE KEY UPDATE buy_price=VALUES(buy_price),stock_capacity=VALUES(stock_capacity),is_active=1`, [box.price, box.code]);
    await pool.query(`UPDATE player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    SET ii.effect_json=i.effect_json
    WHERE i.code IN (${[...deviceCodes].map(code => `'${code}'`).join(',')})`);
    await pool.query(`UPDATE item_definitions SET is_tradeable=0 WHERE code IN ('copper_coin','silver_coin','gold_coin')`);
    await pool.query("UPDATE item_definitions SET is_tradeable=0 WHERE code IN ('heart_bouquet','resonance_fruit','star_oath_ring')");
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
    WHEN 'slime_gel' THEN 1 WHEN 'red_slime_gel' THEN 3 WHEN 'orange_slime_gel' THEN 3 WHEN 'yellow_slime_gel' THEN 3 WHEN 'green_slime_gel' THEN 3 WHEN 'cyan_slime_gel' THEN 3 WHEN 'blue_slime_gel' THEN 3 WHEN 'purple_slime_gel' THEN 3 WHEN 'black_slime_gel' THEN 3
    WHEN 'wood_element_dust' THEN 3 WHEN 'metal_element_dust' THEN 3 WHEN 'water_element_dust' THEN 3 WHEN 'ice_element_dust' THEN 3 WHEN 'dark_element_dust' THEN 4 WHEN 'fire_element_dust' THEN 3 WHEN 'thunder_element_dust' THEN 3 WHEN 'light_element_dust' THEN 5
    WHEN 'herbal_extract' THEN 5 WHEN 'mana_dust' THEN 8 WHEN 'residue_life_potion' THEN 8 WHEN 'ember_mana_potion' THEN 8
    WHEN 'magic_branch' THEN 12 WHEN 'goblin_ear' THEN 5 WHEN 'riot_aura' THEN 150
    WHEN 'goblin_scrap_iron' THEN 18 WHEN 'goblin_whetstone' THEN 24 WHEN 'goblin_bowstring' THEN 22
    WHEN 'goblin_blast_core' THEN 32 WHEN 'goblin_drumhide' THEN 26 WHEN 'goblin_shadowcloth' THEN 35
    WHEN 'goblin_totem_shard' THEN 38 WHEN 'goblin_earth_crystal' THEN 42 WHEN 'goblin_command_seal' THEN 75
    WHEN 'goblin_colonel_insignia' THEN 160
    WHEN 'living_wood' THEN 6 WHEN 'meteor_iron' THEN 100 WHEN 'star_copper' THEN 200 WHEN 'moon_silver' THEN 400 WHEN 'sun_gold' THEN 800 WHEN 'sky_dust' THEN 150
    WHEN 'skill_book_guardian_taunt' THEN 35 WHEN 'skill_book_shield_counter' THEN 60 WHEN 'skill_book_guard_break' THEN 50
    WHEN 'skill_book_arcane_shackle' THEN 50 WHEN 'skill_book_ember_burst' THEN 65 WHEN 'skill_book_healing_prayer' THEN 75
    WHEN 'skill_book_blessing_aegis' THEN 110 WHEN 'skill_book_mana_benediction' THEN 130 WHEN 'skill_book_sanctified_bolt' THEN 40
    WHEN 'skill_book_sweeping_slash' THEN 30 WHEN 'skill_book_piercing_thrust' THEN 45 WHEN 'skill_book_wind_blade' THEN 40 WHEN 'skill_book_thunder_lance' THEN 65
    WHEN 'hearty_meat_stew' THEN 8 WHEN 'mushroom_cream_soup' THEN 8 WHEN 'honey_roast_rabbit' THEN 12 WHEN 'adventurer_platter' THEN 16
    ELSE trade_price END`);
    for (const item of blacksmithShopStock) {
        await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weapon_type,rarity,required_level,weight,stackable,effect_json)
      VALUES (?,?,?,?,? ,?,?,?,?,?,0,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),item_category=VALUES(item_category),weapon_type=VALUES(weapon_type),rarity=VALUES(rarity),required_level=VALUES(required_level),stackable=0,effect_json=VALUES(effect_json)`, [item.code, item.name, `小北铁匠铺出售的同级普通${['头肩', '上装', '腰部', '下装', '脚部'].includes(item.category) ? `${item.weaponType}制式` : '打造'}白板装备，初始品质固定为 0%，可通过精炼提升。`, '百纳镇·铁匠铺', 'equipment', item.category, item.weaponType, '普通', item.level, 2, JSON.stringify({ ...item.effect, balanceVersion: 3 })]);
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
    const [artifactJewelryHalfMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('artifact_jewelry_base_half_v1')");
    if (Number(artifactJewelryHalfMigration.affectedRows) > 0) {
        await pool.query(`UPDATE player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
      SET ii.effect_json=CASE i.code
        WHEN 'oath_necklace_norn' THEN JSON_SET(ii.effect_json,'$.hpPct',50)
        WHEN 'fate_bracelet_clotho' THEN JSON_SET(ii.effect_json,'$.hpPct',33,'$.mpPct',33)
        WHEN 'eternal_ring_aurora' THEN JSON_SET(ii.effect_json,'$.mpPct',50)
        ELSE ii.effect_json END
      WHERE i.code IN ('oath_necklace_norn','fate_bracelet_clotho','eternal_ring_aurora') AND ii.effect_json IS NOT NULL`);
        const [characters] = await pool.query('SELECT id FROM characters');
        for (const character of characters)
            await recalculateCharacterStats(pool, Number(character.id));
    }
    await pool.query(`UPDATE item_definitions SET weapon_type=CASE code
    WHEN 'holy_sword_shirulu' THEN '长剑' WHEN 'demon_sword_aphia' THEN '长剑' WHEN 'saint_staff_istaria' THEN '法杖' WHEN 'death_dagger_azra' THEN '匕首' WHEN 'godfist_chronos' THEN '拳刃' WHEN 'oracle_grimoire_sophia' THEN '法书' WHEN 'prayer_orb_lumia' THEN '法球' WHEN 'immortal_shield_auges' THEN '盾牌' ELSE weapon_type END`);
    await pool.query(`UPDATE item_definitions SET codex_id=CONCAT(CASE item_category WHEN '武器' THEN '11' WHEN '副手' THEN '12' WHEN '头部' THEN '13' WHEN '头肩' THEN '13' WHEN '眼部' THEN '13' WHEN '异械' THEN '20' WHEN '上装' THEN '14' WHEN '腰部' THEN '15' WHEN '下装' THEN '16' WHEN '脚部' THEN '17' WHEN '项链' THEN '18' WHEN '手镯' THEN '19' WHEN '戒指' THEN '10' ELSE '19' END,CASE WHEN id>=100000 THEN CAST(id AS CHAR) ELSE LPAD(id,5,'0') END) WHERE item_type='equipment' AND codex_id IS NULL`);
    await pool.query("UPDATE item_definitions SET codex_id=CONCAT('20',CASE WHEN id>=100000 THEN CAST(id AS CHAR) ELSE LPAD(id,5,'0') END) WHERE item_category='异械'");
    await pool.query(`INSERT IGNORE INTO player_active_devices (character_id,instance_id)
    SELECT pe.character_id,pe.instance_id FROM player_equipment pe
    JOIN item_definitions i ON i.id=pe.item_id
    WHERE i.item_category='异械' AND pe.instance_id IS NOT NULL`);
    await pool.query(`DELETE pe FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id WHERE i.item_category='异械'`);
    await pool.query(`INSERT INTO blacksmith_refinement_materials (item_id,min_gain,max_gain)
    SELECT id,1,3
    FROM item_definitions WHERE code IN ('living_wood','ridge_core','refined_beast_bone','refined_beast_hide','refined_beast_tendon','refined_beast_core','refined_magic_wool','refined_magic_tusk','refined_magic_scale','refined_magic_claw','refined_magic_heartcore')
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
      WHEN 'riot_aura' THEN JSON_OBJECT('damageBonusPct',1)
      WHEN 'goblin_scrap_iron' THEN JSON_OBJECT('physicalDefense',3)
      WHEN 'goblin_whetstone' THEN JSON_OBJECT('physicalAttack',16)
      WHEN 'goblin_bowstring' THEN JSON_OBJECT('accuracy',14)
      WHEN 'goblin_blast_core' THEN JSON_OBJECT('critDamageBp',10)
      WHEN 'goblin_drumhide' THEN JSON_OBJECT('speed',12)
      WHEN 'goblin_shadowcloth' THEN JSON_OBJECT('evasion',12)
      WHEN 'goblin_totem_shard' THEN JSON_OBJECT('magicAttack',18)
      WHEN 'goblin_earth_crystal' THEN JSON_OBJECT('physicalDefense',16)
      WHEN 'goblin_command_seal' THEN JSON_OBJECT('physicalDefense',8,'magicDefense',8)
      WHEN 'goblin_colonel_insignia' THEN JSON_OBJECT('constitution',6,'spirit',6,'strength',6,'intelligence',6,'agility',6,'perception',6)
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
      CASE code WHEN 'beast_bone' THEN '物攻+2%' WHEN 'beast_hide' THEN '物防+2%' WHEN 'beast_tendon' THEN '速度+2%' WHEN 'beast_core' THEN '魔攻+2%' WHEN 'magic_wool' THEN '闪避+3%' WHEN 'magic_tusk' THEN '物攻+3%' WHEN 'magic_scale' THEN '魔防+3%' WHEN 'magic_claw' THEN '暴击+3%' WHEN 'magic_heartcore' THEN '命中+3%' WHEN 'refined_beast_bone' THEN '物攻+4%' WHEN 'refined_beast_hide' THEN '双防+4%' WHEN 'refined_beast_tendon' THEN '速度+4%' WHEN 'refined_beast_core' THEN '魔攻+4%' WHEN 'refined_magic_wool' THEN '闪避+6%' WHEN 'refined_magic_tusk' THEN '物攻+6%' WHEN 'refined_magic_scale' THEN '魔防+6%' WHEN 'refined_magic_claw' THEN '暴击+6%' WHEN 'refined_magic_heartcore' THEN '命中+6%' WHEN 'riot_aura' THEN '造成伤害+0.1%～1.0%' WHEN 'goblin_scrap_iron' THEN '物防+3' WHEN 'goblin_whetstone' THEN '物攻+16' WHEN 'goblin_bowstring' THEN '命中+14' WHEN 'goblin_blast_core' THEN '暴伤+10' WHEN 'goblin_drumhide' THEN '速度+12' WHEN 'goblin_shadowcloth' THEN '闪避+12' WHEN 'goblin_totem_shard' THEN '魔攻+18' WHEN 'goblin_earth_crystal' THEN '物防+16' WHEN 'goblin_command_seal' THEN '双防各+8' WHEN 'goblin_colonel_insignia' THEN '全属性各+6' WHEN 'living_wood' THEN '生命上限+2%' WHEN 'meteor_iron' THEN '物防+3%' WHEN 'star_copper' THEN '命中+3%' WHEN 'moon_silver' THEN '魔力上限+3%' WHEN 'sun_gold' THEN '双攻+2%' WHEN 'wood_element_dust' THEN '武器：木元素精通+2；防具：木元素抗性+2' WHEN 'metal_element_dust' THEN '武器：土元素精通+2；防具：土元素抗性+2' WHEN 'water_element_dust' THEN '武器：水元素精通+2；防具：水元素抗性+2' WHEN 'ice_element_dust' THEN '武器：冰元素精通+2；防具：冰元素抗性+2' WHEN 'dark_element_dust' THEN '武器：暗元素精通+2；防具：暗元素抗性+2' WHEN 'fire_element_dust' THEN '武器：火元素精通+2；防具：火元素抗性+2' WHEN 'thunder_element_dust' THEN '武器：雷元素精通+2；防具：雷元素抗性+2' WHEN 'light_element_dust' THEN '武器：光元素精通+2；防具：光元素抗性+2' END
    FROM item_definitions WHERE code IN ('beast_bone','beast_hide','beast_tendon','beast_core','magic_wool','magic_tusk','magic_scale','magic_claw','magic_heartcore','refined_beast_bone','refined_beast_hide','refined_beast_tendon','refined_beast_core','refined_magic_wool','refined_magic_tusk','refined_magic_scale','refined_magic_claw','refined_magic_heartcore','riot_aura','goblin_scrap_iron','goblin_whetstone','goblin_bowstring','goblin_blast_core','goblin_drumhide','goblin_shadowcloth','goblin_totem_shard','goblin_earth_crystal','goblin_command_seal','goblin_colonel_insignia','living_wood','meteor_iron','star_copper','moon_silver','sun_gold','wood_element_dust','metal_element_dust','water_element_dust','ice_element_dust','dark_element_dust','fire_element_dust','thunder_element_dust','light_element_dust')
    ON DUPLICATE KEY UPDATE effect_json=VALUES(effect_json),description=VALUES(description)`);
    await pool.query(`INSERT INTO guild_shop_items (item_id,buy_price,sell_price)
    SELECT id,CASE code WHEN 'map_dark_forest' THEN 20 WHEN 'map_dark_forest_deep' THEN 150 END,0
    FROM item_definitions WHERE code IN ('map_dark_forest','map_dark_forest_deep')
    ON DUPLICATE KEY UPDATE buy_price=VALUES(buy_price),sell_price=VALUES(sell_price),is_active=1`);
    await pool.query(`INSERT INTO guild_shop_items (item_id,buy_price,sell_price,is_active)
    SELECT id,0,CASE code
      WHEN 'healing_herb' THEN 1
      WHEN 'beast_meat' THEN 2 WHEN 'beast_bone' THEN 3 WHEN 'beast_hide' THEN 5 WHEN 'beast_tendon' THEN 9 WHEN 'beast_core' THEN 30
      WHEN 'wolf_fang' THEN 8 WHEN 'magic_wool' THEN 12 WHEN 'magic_tusk' THEN 14 WHEN 'magic_scale' THEN 14 WHEN 'magic_claw' THEN 16 WHEN 'magic_heartcore' THEN 18
      WHEN 'goblin_ear' THEN 25 WHEN 'magic_branch' THEN 80 WHEN 'living_wood' THEN 65 WHEN 'riot_aura' THEN 75
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
    await pool.query(`UPDATE item_definitions SET codex_id=CONCAT(CASE WHEN item_type='equipment' THEN CASE item_category WHEN '武器' THEN '11' WHEN '副手' THEN '12' WHEN '头部' THEN '13' WHEN '头肩' THEN '13' WHEN '眼部' THEN '13' WHEN '异械' THEN '20' WHEN '上装' THEN '14' WHEN '腰部' THEN '15' WHEN '下装' THEN '16' WHEN '脚部' THEN '17' WHEN '项链' THEN '18' WHEN '手镯' THEN '19' WHEN '戒指' THEN '10' ELSE '19' END WHEN item_type='consumable' THEN CASE item_category WHEN '药剂' THEN '21' WHEN '食物' THEN '22' ELSE '23' END WHEN item_type='material' THEN CASE item_category WHEN '食材' THEN '31' WHEN '草药' THEN '32' ELSE '39' END ELSE '99' END, CASE WHEN id>=100000 THEN CAST(id AS CHAR) ELSE LPAD(id,5,'0') END) WHERE codex_id IS NULL`);
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
    ('acid_spray', '酸液喷吐', 'magic', 45, 2, 125, '喷出腐蚀性的酸液，同时腐蚀护甲与护身法障。'),
    ('regenerate_slime', '胶质再生', 'magic', 55, 3, 80, '汲取林间水汽，缓慢修复自身。'),
    ('guard_break', '盾击破甲', 'physical', 45, 2, 165, '以盾牌撞开敌人的防御架势。'),
    ('warrior_taunt', '守护嘲讽', 'physical', 30, 2, 90, '以盾击与怒喝迫使敌人优先锁定自己。'),
    ('shield_counter', '盾反', 'physical', 45, 2, 185, '格开攻势后立刻以盾缘反击，并强化自身防护。'),
    ('arcane_shackle', '奥术枷锁', 'magic', 55, 2, 125, '以奥术锁链束缚敌人，降低其防御与速度。'),
    ('ember_burst', '爆炎术', 'magic', 60, 2, 155, '将凝聚的火焰瞬间引爆。'),
    ('healing_prayer', '治愈祷言', 'magic', 65, 1, 0, '为生命最低的同伴恢复生命，并赋予短暂再生。'),
    ('blessing_aegis', '守护祝福', 'magic', 75, 3, 0, '为全体同伴施加减伤与再生祝福。'),
    ('mana_benediction', '灵泉祝祷', 'magic', 80, 5, 0, '为全体同伴施加回流祝福，每回合恢复最大魔力的 5%。'),
    ('sanctified_bolt', '圣辉弹', 'magic', 50, 1, 115, '以圣光轰击敌人，并为自身覆上一层守护。'),
    ('appraisal', '鉴识', 'passive', 0, 0, 0, '学会后可识别怪物词条，并解锁怪物属性查看。'),
    ('growth_blessing', '成长祝福', 'bound', 0, 0, 0, '所有获得的经验值翻倍。'),
    ('mana_affinity', '魔力亲和', 'bound', 0, 0, 0, '技能魔力消耗降低 30%。'),
    ('lucky_favor', '幸运眷顾', 'bound', 0, 0, 0, '战利品掉落概率提高 20%。'),
    ('war_god_favor', '战神眷顾', 'bound', 0, 0, 0, '造成的最终伤害提高 16%。'),
    ('arcane_revelation', '奥术启示', 'bound', 0, 0, 0, '魔法伤害提高 16%。'),
    ('crimson_recovery', '猩红复苏', 'bound', 0, 0, 0, '普攻与刺击伤害的 16% 转化为生命。'),
    ('seer_instinct', '先知直觉', 'bound', 0, 0, 0, '命中与暴击属性在战斗中提高 16%。'),
    ('hunter_blessing', '猎人恩典', 'bound', 0, 0, 0, '战利品掉落概率提高 35%。'),
    ('craftsmanship', '匠心', 'passive', 0, 0, 0, '随副职业等级发挥不同效果：锻造师降低耐久损耗，炼金师提高药品效果。'),
    ('boss_mana_charge', '魔力充能', 'utility', 0, 0, 0, '吸收周遭游离魔力，立即将自身魔力恢复至最大值。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),description=VALUES(description)`);
    await pool.query(`INSERT INTO skill_definitions (code,name,category,damage_type,skill_kind,element,range_type,target_scope,mana_cost,cooldown_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,description)
    VALUES ('machine_echo','万机回响','special','无','异械','无','自身','自身',0,3,0,99,99,1,0,'立即为当前角色每一件已生效主动异械恢复 25 点充能，最多不超过上限；不作用于队友或未生效异械。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),damage_type=VALUES(damage_type),skill_kind=VALUES(skill_kind),element=VALUES(element),range_type=VALUES(range_type),target_scope=VALUES(target_scope),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),learn_cost=VALUES(learn_cost),upgrade_cost=VALUES(upgrade_cost),max_level=VALUES(max_level),power_per_level=VALUES(power_per_level),description=VALUES(description)`);
    await pool.query(`INSERT IGNORE INTO player_skills (character_id,skill_id)
    SELECT c.id,s.id FROM characters c JOIN player_npc_affinity a ON a.character_id=c.id AND a.npc_code='oddworkshop' AND a.affinity>=500
    JOIN skill_definitions s ON s.code='machine_echo' WHERE c.secondary_profession_code='deconstructor'`);
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
    await pool.query(`UPDATE skill_definitions SET skill_kind=CASE category WHEN 'physical' THEN CASE damage_type WHEN '斩击' THEN '斩击' WHEN '刺击' THEN '刺击' ELSE '打击' END WHEN 'magic' THEN CASE WHEN damage_type IN ('水','火','土','木','风','冰','雷','光','暗') THEN '元素' WHEN damage_type='奥术' THEN '奥术' ELSE '灵异' END WHEN 'utility' THEN '辅助' WHEN 'passive' THEN '被动' WHEN 'bound' THEN '绑定' ELSE skill_kind END, element=CASE WHEN category='magic' AND damage_type IN ('水','火','土','木','风','冰','雷','光','暗') THEN damage_type ELSE '无' END, range_type=CASE WHEN category='physical' THEN '近战' WHEN category='magic' THEN '远程' WHEN category='utility' THEN '全体' WHEN category IN ('passive','bound') THEN '自身' ELSE range_type END`);
    await pool.query(`UPDATE skill_definitions SET category='magic',damage_type=CASE code WHEN 'vine_hex' THEN '木' WHEN 'vine_bolt' THEN '木' WHEN 'moonbolt' THEN '暗' WHEN 'moonlight_bolt' THEN '暗' END,skill_kind='元素',element=CASE code WHEN 'vine_hex' THEN '木' WHEN 'vine_bolt' THEN '木' WHEN 'moonbolt' THEN '暗' WHEN 'moonlight_bolt' THEN '暗' END,range_type='远程',learn_cost=CASE WHEN code IN ('vine_bolt','moonlight_bolt') THEN 1 ELSE 99 END,upgrade_cost=CASE WHEN code IN ('vine_bolt','moonlight_bolt') THEN 1 ELSE 99 END,max_level=CASE WHEN code IN ('vine_hex','moonbolt') THEN 1 ELSE 5 END,power_per_level=CASE WHEN code IN ('vine_hex','moonbolt') THEN 0 ELSE 15 END WHERE code IN ('vine_hex','vine_bolt','moonbolt','moonlight_bolt')`);
    await pool.query(`UPDATE skill_definitions SET category='utility',damage_type='无',skill_kind='辅助',element='无',range_type='全体',mana_cost=90,cooldown_turns=3,power=0,description='发出战吼，提升全队的物理与魔法攻击。' WHERE code='war_cry'`);
    await pool.query(`UPDATE skill_definitions SET category=CASE code WHEN 'thorn_burst' THEN 'physical' ELSE 'magic' END,
    damage_type=CASE code WHEN 'thorn_burst' THEN '刺击' ELSE '木' END,
    skill_kind=CASE code WHEN 'thorn_burst' THEN '刺击' ELSE '元素' END,
    element=CASE code WHEN 'thorn_burst' THEN '无' ELSE '木' END,
    range_type='远程',learn_cost=99,upgrade_cost=99,max_level=1,power_per_level=0
    WHERE code IN ('root_bind','thorn_burst','verdant_bolt')`);
    await pool.query(`INSERT INTO skill_definitions (code,name,category,damage_type,skill_kind,element,range_type,mana_cost,cooldown_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,description,passive_effect_json) VALUES
    ('longsword_mastery','长剑精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备长剑类武器时暴击提高40%至80%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','长剑','critRatePct',40,'masteryStepPct',10)),
    ('shield_mastery','盾牌精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备盾牌类武器时暴免、暴抗各提高20%至40%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','盾牌','critResistPct',20,'critDamageReductionPct',20,'masteryStepPct',5)),
    ('staff_mastery','法杖精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备法杖类武器时暴伤提高40%至80%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','法杖','critDamagePct',40,'masteryStepPct',10)),
    ('spellbook_mastery','法书精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备法书类武器时吟唱速度提高40%至80%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','法书','chantSpeedPct',40,'masteryStepPct',10)),
    ('orb_mastery','法球精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备法球类武器时魔力上限提高40%至80%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','法球','mpPct',40,'masteryStepPct',10)),
    ('dagger_mastery','匕首精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备匕首类武器时命中提高40%至80%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','匕首','accuracyPct',40,'masteryStepPct',10)),
    ('fistblade_mastery','拳刃精通','passive','无','精通','无','自身',0,0,0,99,99,10,0,'装备拳刃类武器时暴击、暴伤各提高20%至40%，副手装备时可减免衰减。',JSON_OBJECT('weaponType','拳刃','critRatePct',20,'critDamagePct',20,'masteryStepPct',5)),
    ('craftsmanship','匠心','passive','无','技艺','无','自身',0,0,0,5,99,1,0,'随副职业等级发挥不同效果：锻造师降低耐久损耗，炼金师提高药品效果。',JSON_OBJECT('secondaryProfessionScaling','craftsmanship'))
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),max_level=VALUES(max_level),passive_effect_json=VALUES(passive_effect_json)`);
    await pool.query(`DELETE ps FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE s.code IN ('sword_shield_mastery','warrior_counter','warrior_taunt_player','shield_bash_player','arcane_mastery','fire_lance','frost_barrier','shadow_step','backstab','smoke_screen','holy_prayer','healing_light','blessing_hymn')`);
    await pool.query(`INSERT IGNORE INTO player_skills (character_id,skill_id)
    SELECT c.id,s.id FROM characters c JOIN profession_definitions p ON p.code=c.profession_code JOIN skill_definitions s ON JSON_CONTAINS(p.skill_codes_json,JSON_QUOTE(s.code))`);
    await pool.query(`INSERT IGNORE INTO player_skill_specializations (character_id,skill_id,specialization)
    SELECT ps.character_id,ps.skill_id,'overcharge' FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE s.code IN ('longsword_mastery','shield_mastery','staff_mastery','spellbook_mastery','orb_mastery','dagger_mastery','fistblade_mastery')`);
    await pool.query(`INSERT IGNORE INTO player_skill_specializations (character_id,skill_id,specialization)
    SELECT ps.character_id,ps.skill_id,'instant' FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE s.code IN ('longsword_mastery','shield_mastery','staff_mastery','spellbook_mastery','orb_mastery','dagger_mastery','fistblade_mastery')`);
    const [weaponMasteryLinearMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('weapon_mastery_linear_effects_v2')");
    if (Number(weaponMasteryLinearMigration.affectedRows) > 0) {
        const [characters] = await pool.query('SELECT id FROM characters');
        for (const character of characters)
            await recalculateCharacterStats(pool, Number(character.id));
    }
    await pool.query(`UPDATE skill_definitions SET damage_type=CASE code WHEN 'arcane_bolt' THEN '奥术' WHEN 'heavy_strike' THEN '打击' WHEN 'armor_break' THEN '斩击' WHEN 'fireball' THEN '火' WHEN 'toxic_edge' THEN '刺击' WHEN 'purifying_light' THEN '光' WHEN 'frost_bind' THEN '冰' WHEN 'bloodletting' THEN '斩击' WHEN 'hop' THEN '打击' WHEN 'jump_strike' THEN '打击' WHEN 'charge' THEN '刺击' WHEN 'bite' THEN '斩击' WHEN 'bite_slash' THEN '斩击' WHEN 'howl' THEN '暗' WHEN 'war_cry' THEN '暗' WHEN 'scratch' THEN '斩击' WHEN 'shell_bash' THEN '打击' WHEN 'shell_breaker' THEN '打击' WHEN 'spore_dart' THEN '木' WHEN 'spore_bolt' THEN '木' WHEN 'sonic_screech' THEN '暗' WHEN 'echo_shock' THEN '暗' WHEN 'thorn_shot' THEN '刺击' WHEN 'thorn_stab' THEN '刺击' WHEN 'mist_pounce' THEN '斩击' WHEN 'mist_step_slash' THEN '斩击' WHEN 'constrict' THEN '打击' WHEN 'maul' THEN '斩击' WHEN 'goblin_slash' THEN '斩击' WHEN 'goblin_fire' THEN '火' WHEN 'slime_bash' THEN '打击' WHEN 'acid_spray' THEN '水' WHEN 'regenerate_slime' THEN '木' WHEN 'guard_break' THEN '打击' WHEN 'warrior_taunt' THEN '打击' WHEN 'shield_counter' THEN '打击' WHEN 'arcane_shackle' THEN '奥术' WHEN 'ember_burst' THEN '火' WHEN 'healing_prayer' THEN '光' WHEN 'blessing_aegis' THEN '光' WHEN 'sanctified_bolt' THEN '光' ELSE damage_type END`);
    await pool.query(`UPDATE skill_definitions SET skill_kind=CASE category WHEN 'physical' THEN CASE damage_type WHEN '斩击' THEN '斩击' WHEN '刺击' THEN '刺击' ELSE '打击' END WHEN 'magic' THEN CASE WHEN damage_type IN ('水','火','土','木','风','冰','雷','光','暗') THEN '元素' WHEN damage_type='奥术' THEN '奥术' ELSE '灵异' END WHEN 'utility' THEN '辅助' WHEN 'passive' THEN '被动' ELSE skill_kind END, element=CASE WHEN category='magic' AND damage_type IN ('水','火','土','木','风','冰','雷','光','暗') THEN damage_type ELSE '无' END, range_type=CASE WHEN category='physical' THEN '近战' WHEN category='magic' THEN '远程' WHEN category='utility' THEN '全体' WHEN category='passive' THEN '自身' ELSE range_type END`);
    await pool.query(`UPDATE characters SET element_mastery_json=COALESCE(element_mastery_json,JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0)),element_resistance_json=COALESCE(element_resistance_json,JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0))`);
    await pool.query(`UPDATE characters SET element_base_mastery_json=COALESCE(element_base_mastery_json,element_mastery_json),element_base_resistance_json=COALESCE(element_base_resistance_json,element_resistance_json)`);
    await pool.query(`UPDATE monster_templates SET element_mastery_json=COALESCE(element_mastery_json,JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0)),element_resistance_json=COALESCE(element_resistance_json,JSON_OBJECT('水',0,'火',0,'土',0,'木',0,'风',0,'冰',0,'雷',0,'光',0,'暗',0))`);
    await pool.query(`UPDATE skill_definitions SET learn_cost=CASE code WHEN 'heavy_strike' THEN 1 WHEN 'armor_break' THEN 1 WHEN 'arcane_bolt' THEN 1 WHEN 'bloodletting' THEN 1 WHEN 'jump_strike' THEN 1 WHEN 'bite_slash' THEN 1 WHEN 'charge' THEN 1 WHEN 'shell_breaker' THEN 1 WHEN 'thorn_stab' THEN 1 WHEN 'mist_step_slash' THEN 1 WHEN 'vine_bolt' THEN 2 WHEN 'moonlight_bolt' THEN 2 WHEN 'spore_bolt' THEN 2 WHEN 'echo_shock' THEN 2 WHEN 'war_cry' THEN 2 WHEN 'toxic_edge' THEN 2 WHEN 'fireball' THEN 2 WHEN 'frost_bind' THEN 2 WHEN 'purifying_light' THEN 3 ELSE 99 END, upgrade_cost=CASE code WHEN 'heavy_strike' THEN 1 WHEN 'armor_break' THEN 1 WHEN 'arcane_bolt' THEN 1 WHEN 'bloodletting' THEN 1 WHEN 'jump_strike' THEN 1 WHEN 'bite_slash' THEN 1 WHEN 'charge' THEN 1 WHEN 'shell_breaker' THEN 1 WHEN 'thorn_stab' THEN 1 WHEN 'mist_step_slash' THEN 1 WHEN 'vine_bolt' THEN 2 WHEN 'moonlight_bolt' THEN 2 WHEN 'spore_bolt' THEN 2 WHEN 'echo_shock' THEN 2 WHEN 'war_cry' THEN 2 WHEN 'toxic_edge' THEN 2 WHEN 'fireball' THEN 2 WHEN 'frost_bind' THEN 2 WHEN 'purifying_light' THEN 3 ELSE 99 END, max_level=CASE WHEN code IN ('hop','bite','howl','scratch','shell_bash','spore_dart','sonic_screech','thorn_shot','mist_pounce','constrict','maul','goblin_slash','goblin_fire') THEN 1 ELSE 5 END, power_per_level=CASE WHEN code IN ('hop','bite','howl','scratch','shell_bash','spore_dart','sonic_screech','thorn_shot','mist_pounce','constrict','maul','goblin_slash','goblin_fire') THEN 0 ELSE 15 END, cooldown_reduction_per_level=CASE WHEN code IN ('heavy_strike','armor_break','fireball','toxic_edge','purifying_light','frost_bind','bloodletting','jump_strike','bite_slash','charge','war_cry','shell_breaker','spore_bolt','echo_shock','thorn_stab','mist_step_slash') THEN 1 ELSE 0 END`);
    await pool.query(`UPDATE skill_definitions SET
    learn_cost=CASE code WHEN 'blessing_aegis' THEN 2 WHEN 'mana_benediction' THEN 2 WHEN 'thunder_lance' THEN 2 ELSE 1 END,
    upgrade_cost=1,max_level=5,power_per_level=CASE WHEN code IN ('warrior_taunt','healing_prayer','blessing_aegis','mana_benediction') THEN 0 ELSE 10 END,
    cooldown_reduction_per_level=CASE WHEN code IN ('warrior_taunt','shield_counter','guard_break','arcane_shackle','ember_burst','sanctified_bolt','sweeping_slash','piercing_thrust','wind_blade','thunder_lance') THEN 1 ELSE 0 END
    WHERE code IN ('warrior_taunt','shield_counter','guard_break','arcane_shackle','ember_burst','healing_prayer','blessing_aegis','mana_benediction','sanctified_bolt','sweeping_slash','piercing_thrust','wind_blade','thunder_lance')`);
    await pool.query(`UPDATE skill_definitions SET category='bound',skill_kind='绑定',range_type='自身',learn_cost=99,upgrade_cost=99,max_level=1,power_per_level=0,passive_effect_json=CASE code
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
    await pool.query(`UPDATE skill_definitions SET category='bound',skill_kind='绑定',range_type='自身',learn_cost=0,upgrade_cost=1,max_level=13,power_per_level=0,passive_effect_json=JSON_OBJECT('revealMonsterTraits',true,'unlockMonsterDetail',true),description='降临异世界时由女神授予的通用绑定能力，初始 Lv.1，无需学习。后续须自行消耗技能点升级慧眼与识珠：慧眼每升一级可额外鉴识高于自身 3 级的目标；识珠可逐步解锁更多情报。' WHERE code='appraisal'`);
    await pool.query(`UPDATE skill_definitions SET category='bound',skill_kind='绑定',range_type='自身' WHERE code IN ('longsword_mastery','shield_mastery','staff_mastery','spellbook_mastery','orb_mastery','dagger_mastery','fistblade_mastery','craftsmanship')`);
    await pool.query(`UPDATE player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id SET ps.passive_linked=0,ps.quick_slot=NULL WHERE s.category='bound'`);
    await pool.query(`UPDATE skill_definitions SET codex_id=CONCAT(CASE category WHEN 'physical' THEN '41' WHEN 'magic' THEN '42' ELSE '49' END, CASE WHEN id>=100000 THEN CAST(id AS CHAR) ELSE LPAD(id,5,'0') END) WHERE codex_id IS NULL`);
    await pool.query(`INSERT IGNORE INTO player_skills (character_id,skill_id)
    SELECT b.character_id,s.id FROM player_blessings b JOIN skill_definitions s ON s.code=b.code AND s.category='bound'`);
    await pool.query(`INSERT IGNORE INTO player_skills (character_id,skill_id,level,passive_linked)
    SELECT c.id,s.id,1,0 FROM characters c JOIN skill_definitions s ON s.code='appraisal'
    LEFT JOIN player_skills ps ON ps.character_id=c.id AND ps.skill_id=s.id WHERE ps.skill_id IS NULL`);
    await pool.query(`INSERT IGNORE INTO player_appraisal_progress (character_id)
    SELECT ps.character_id FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE s.code='appraisal'`);
    await pool.query(`INSERT INTO effect_definitions (code,name,effect_type,default_value,default_duration,max_level,max_stacks,stackable,description) VALUES
    ('vulnerability','脆弱','stat_modifier',25,3,5,1,0,'降低目标物理防御，效果值为百分比。'),
    ('burn','灼烧','damage_over_time',5,3,5,1,0,'每回合损失最大生命值一定比例；对首领每回合最多为其最大生命的1.5%。'),
    ('poison','中毒','damage_over_time',3,3,5,5,1,'每回合损失最大生命值一定比例，可叠加；对首领每层最多1.5%，最多3层有效。'),
    ('bleeding','流血','damage_over_time',4,3,5,3,1,'每回合损失最大生命值一定比例，可叠加；对首领同类流血每回合合计最多为其最大生命的1.5%。'),
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
    ,('device_physical_evade','物理闪避','stat_modifier',1,99,1,1,0,'下一次受到的物理直接攻击必定闪避。')
    ,('phase_decoy','相位诱饵','stat_modifier',80,99,1,1,0,'下一次受到的直接伤害降低80%，随后移除。')
    ,('shield_guard','盾击守势','stat_modifier',50,1,1,1,0,'下次出手前受到的伤害降低50%。')
    ,('sprint','冲刺','stat_modifier',20,2,1,1,0,'自身速度提高。')
    ,('armor_shatter','碎甲','stat_modifier',5,2,1,1,0,'降低目标物理防御。')
    ,('magic_shatter','破障','stat_modifier',5,2,1,1,0,'降低目标魔法防御。')
    ,('bind','束缚','stat_modifier',5,2,1,1,0,'降低目标速度与闪避。')
    ,('exposed','易伤','stat_modifier',25,2,1,1,0,'受到的直击伤害提高。')
    ,('rending','撕裂','damage_over_time',3,3,1,1,0,'每回合损失最大生命值3%；对首领每回合最多为其最大生命的1.5%。')
    ,('mist_veil','雾隐','stat_modifier',20,0,1,1,0,'下一次出招伤害提高。')
    ,('shadow_pierce','影刺','stat_modifier',1,0,1,1,0,'下一次出招必定暴击。')
    ,('battle_cry','战吼','stat_modifier',10,2,1,1,0,'物理攻击与魔法攻击提高。')
    ,('royal_intercept','王庭拦截','stat_modifier',25,9,1,1,0,'下一次受到的单体伤害降低。')
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
    ((SELECT id FROM skill_definitions WHERE code='acid_spray'),(SELECT id FROM effect_definitions WHERE code='magic_shatter'),1,12,2,'enemy','on_hit'),
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
    ('ball_rabbit', '球兔', 'normal', 1, 4,3,3,2,17,15, 0.3,0.2,0.3,0.2,1.0,0.8, JSON_ARRAY('hop','scratch'), 36, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',0.70,'quantity',1),JSON_OBJECT('code','beast_hide','chance',0.50,'quantity',1),JSON_OBJECT('code','beast_tendon','chance',0.45,'quantity',1),JSON_OBJECT('code','magic_wool','chance',0.30,'quantity',1),JSON_OBJECT('code','magic_eye','chance',0.18,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.03,'quantity',1))),
    ('spike_boar', '刺猪', 'normal', 1, 17,2,18,2,4,3, 0.8,0.1,0.9,0.1,0.2,0.2, JSON_ARRAY('charge','scratch'), 54, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',0.65,'quantity',1),JSON_OBJECT('code','beast_bone','chance',0.70,'quantity',1),JSON_OBJECT('code','beast_hide','chance',0.45,'quantity',1),JSON_OBJECT('code','magic_tusk','chance',0.30,'quantity',1),JSON_OBJECT('code','magic_horn','chance',0.25,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.03,'quantity',1))),
    ('vine_snake', '藤蛇', 'normal', 1, 4,14,3,16,5,12, 0.2,0.9,0.2,1.0,0.3,0.8, JSON_ARRAY('bite','vine_hex','constrict'), 51, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',0.45,'quantity',1),JSON_OBJECT('code','beast_bone','chance',0.50,'quantity',1),JSON_OBJECT('code','beast_hide','chance',0.60,'quantity',1),JSON_OBJECT('code','beast_tendon','chance',0.35,'quantity',1),JSON_OBJECT('code','magic_scale','chance',0.35,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.03,'quantity',1))),
    ('black_bear', '乌熊', 'normal', 2, 17,3,18,2,3,3, 0.9,0.2,1.0,0.1,0.2,0.2, JSON_ARRAY('maul','howl'), 78, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',0.80,'quantity',1),JSON_OBJECT('code','beast_bone','chance',0.60,'quantity',1),JSON_OBJECT('code','beast_hide','chance',0.60,'quantity',1),JSON_OBJECT('code','magic_claw','chance',0.30,'quantity',1),JSON_OBJECT('code','magic_blood','chance',0.25,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.03,'quantity',1))),
    ('mist_wolf', '幽狼', 'normal', 2, 4,14,5,15,8,11, 0.2,0.9,0.3,1.0,0.5,0.7, JSON_ARRAY('mist_pounce','moonbolt','bite'), 75, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',0.50,'quantity',1),JSON_OBJECT('code','beast_hide','chance',0.60,'quantity',1),JSON_OBJECT('code','beast_tendon','chance',0.55,'quantity',1),JSON_OBJECT('code','magic_heartcore','chance',0.30,'quantity',1),JSON_OBJECT('code','magic_eye','chance',0.25,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.03,'quantity',1))),
    ('roll_rabbit', '滚兔', 'large', 3, 6,7,6,5,22,18, 0.4,0.4,0.4,0.3,1.4,1.1, JSON_ARRAY('hop','charge','scratch'), 54, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',1,'quantity',2),JSON_OBJECT('code','beast_hide','chance',0.80,'quantity',2),JSON_OBJECT('code','beast_tendon','chance',0.75,'quantity',2),JSON_OBJECT('code','magic_wool','chance',0.65,'quantity',1),JSON_OBJECT('code','magic_eye','chance',0.40,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.12,'quantity',1))),
    ('tusk_boar', '獠猪', 'large', 4, 21,4,23,3,6,5, 1.2,0.2,1.3,0.2,0.4,0.3, JSON_ARRAY('charge','maul','scratch'), 74, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',1,'quantity',2),JSON_OBJECT('code','beast_bone','chance',0.90,'quantity',2),JSON_OBJECT('code','beast_hide','chance',0.60,'quantity',2),JSON_OBJECT('code','magic_tusk','chance',0.65,'quantity',1),JSON_OBJECT('code','magic_horn','chance',0.55,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.12,'quantity',1))),
    ('vine_python', '藤蚺', 'large', 4, 6,18,5,20,7,18, 0.4,1.2,0.3,1.3,0.5,1.2, JSON_ARRAY('bite','vine_hex','constrict'), 78, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',0.75,'quantity',2),JSON_OBJECT('code','beast_bone','chance',0.80,'quantity',2),JSON_OBJECT('code','beast_hide','chance',0.90,'quantity',2),JSON_OBJECT('code','beast_tendon','chance',0.50,'quantity',2),JSON_OBJECT('code','magic_scale','chance',0.65,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.12,'quantity',1))),
    ('pitch_bear', '漆熊', 'large', 5, 23,6,25,4,4,7, 1.4,0.3,1.5,0.2,0.3,0.4, JSON_ARRAY('maul','howl','bite'), 108, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',1,'quantity',2),JSON_OBJECT('code','beast_bone','chance',0.80,'quantity',2),JSON_OBJECT('code','beast_hide','chance',0.80,'quantity',2),JSON_OBJECT('code','magic_claw','chance',0.65,'quantity',1),JSON_OBJECT('code','magic_blood','chance',0.55,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.12,'quantity',1))),
    ('shadow_wolf', '影狼', 'large', 5, 7,19,8,21,14,16, 0.5,1.2,0.5,1.4,0.9,1.0, JSON_ARRAY('mist_pounce','moonbolt','howl','bite'), 96, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',0.75,'quantity',2),JSON_OBJECT('code','beast_hide','chance',0.80,'quantity',2),JSON_OBJECT('code','beast_tendon','chance',0.75,'quantity',2),JSON_OBJECT('code','magic_heartcore','chance',0.65,'quantity',1),JSON_OBJECT('code','magic_eye','chance',0.55,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.12,'quantity',1))),
    ('goblin', '哥布林', 'elite', 4, 10,13,13,16,16,15, 0.8,1.0,0.9,1.2,1.1,1.0, JSON_ARRAY('goblin_slash','goblin_fire','scratch'), 82, JSON_ARRAY(JSON_OBJECT('code','beast_bone','chance',0.65,'quantity',1),JSON_OBJECT('code','beast_hide','chance',0.50,'quantity',1),JSON_OBJECT('code','magic_horn','chance',0.45,'quantity',1),JSON_OBJECT('code','beast_core','chance',0.15,'quantity',1),JSON_OBJECT('code','goblin_ear','chance',0.75,'quantity',1))),
    ('tree_ent', '树精', 'elite', 7, 24,18,20,22,14,18, 1.3,1.2,1.0,1.3,0.6,1.0, JSON_ARRAY('root_bind','thorn_burst','verdant_bolt'), 180, JSON_ARRAY(JSON_OBJECT('code','magic_branch','chance',1,'quantity',1),JSON_OBJECT('code','living_wood','chance',0.70,'quantity',2),JSON_OBJECT('code','magic_blood','chance',0.55,'quantity',1),JSON_OBJECT('code','magic_scale','chance',0.40,'quantity',1))),
    ('forest_slime', '森林史莱姆', 'boss', 8, 37,28,25,31,10,15, 1.6,1.4,1.1,1.3,0.5,0.8, JSON_ARRAY('slime_bash','acid_spray','regenerate_slime'), 260, JSON_ARRAY(JSON_OBJECT('code','healing_herb','chance',1,'min_quantity',2,'max_quantity',4),JSON_OBJECT('code','slime_gel','chance',1,'min_quantity',2,'max_quantity',4),JSON_OBJECT('code','magic_blood','chance',0.65,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','beast_core','chance',0.30,'quantity',1),JSON_OBJECT('code','living_wood','chance',0.75,'quantity',1))),
    ('shadow_wolf_king', '幽影狼王', 'boss', 12, 18,12,34,10,31,30, 1.0,0.7,1.8,0.5,1.7,1.6, JSON_ARRAY('wolfking_summon_shadow_wolf','wolfking_trample','wolfking_rending_pounce','wolfking_bite','wolfking_shadow_curse','wolfking_fang_devour'), 720, JSON_ARRAY(JSON_OBJECT('code','beast_meat','chance',1,'min_quantity',3,'max_quantity',5),JSON_OBJECT('code','beast_bone','chance',1,'min_quantity',2,'max_quantity',4),JSON_OBJECT('code','beast_hide','chance',0.9,'min_quantity',2,'max_quantity',3),JSON_OBJECT('code','beast_tendon','chance',0.8,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','beast_core','chance',0.35,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','magic_heartcore','chance',1,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','magic_eye','chance',0.85,'quantity',1),JSON_OBJECT('code','sky_dust','chance',0.40,'quantity',1))),
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
    await pool.query(`DELETE p FROM map_monster_pools p JOIN map_regions r ON r.id=p.region_id JOIN monster_templates t ON t.id=p.monster_template_id WHERE r.code='dark_forest_deep' AND t.code NOT IN ('goblin_vanguard','goblin_warrior','goblin_archer','goblin_bomber','goblin_daredevil','goblin_drummer','goblin_shieldbearer','goblin_trapper','goblin_priest','goblin_mage','goblin_assassin','goblin_earthshaper','goblin_colonel','goblin_king')`);
    await pool.query(`INSERT INTO map_monster_pools (region_id,monster_template_id,spawn_weight)
    SELECT r.id,t.id,CASE t.code
      WHEN 'goblin_vanguard' THEN 22 WHEN 'goblin_warrior' THEN 18 WHEN 'goblin_archer' THEN 16 WHEN 'goblin_bomber' THEN 10
      WHEN 'goblin_daredevil' THEN 9 WHEN 'goblin_drummer' THEN 8 WHEN 'goblin_shieldbearer' THEN 7 WHEN 'goblin_trapper' THEN 6
      WHEN 'goblin_priest' THEN 5 WHEN 'goblin_mage' THEN 4 WHEN 'goblin_assassin' THEN 3 WHEN 'goblin_earthshaper' THEN 2
      WHEN 'goblin_colonel' THEN 0 ELSE 0 END
    FROM map_regions r JOIN monster_templates t ON t.code IN ('goblin_vanguard','goblin_warrior','goblin_archer','goblin_bomber','goblin_daredevil','goblin_drummer','goblin_shieldbearer','goblin_trapper','goblin_priest','goblin_mage','goblin_assassin','goblin_earthshaper','goblin_colonel')
    WHERE r.code='dark_forest_deep'
    ON DUPLICATE KEY UPDATE spawn_weight=VALUES(spawn_weight)`);
    await pool.query(`INSERT INTO map_resource_pools (region_id,item_id,spawn_density)
    SELECT r.id,i.id,CASE i.code WHEN 'living_wood' THEN 0.01000 WHEN 'meteor_iron' THEN 0.00100 WHEN 'star_copper' THEN 0.00010 WHEN 'moon_silver' THEN 0.00001 END
    FROM map_regions r JOIN item_definitions i ON i.code IN ('living_wood','meteor_iron','star_copper','moon_silver')
    WHERE r.code='dark_forest'
    ON DUPLICATE KEY UPDATE spawn_density=VALUES(spawn_density)`);
    await pool.query(`INSERT INTO map_resource_pools (region_id,item_id,spawn_density)
    SELECT r.id,i.id,CASE i.code WHEN 'living_wood' THEN 0.02000 WHEN 'meteor_iron' THEN 0.01000 WHEN 'star_copper' THEN 0.00100 WHEN 'moon_silver' THEN 0.00010 END
    FROM map_regions r JOIN item_definitions i ON i.code IN ('living_wood','meteor_iron','star_copper','moon_silver')
    WHERE r.code='dark_forest_deep'
    ON DUPLICATE KEY UPDATE spawn_density=VALUES(spawn_density)`);
    await pool.query(`DELETE n FROM map_npcs n JOIN map_regions r ON r.id=n.region_id WHERE r.code='baina_town' AND n.code NOT IN ('pear_guide','guild_counter','saint_church','blacksmith','alchemy_sweetshop','oddworkshop','bookshop','baina_residence','world_gate')`);
    await pool.query(`DELETE n FROM map_npcs n JOIN map_regions r ON r.id=n.region_id WHERE r.code='dark_forest'`);
    await pool.query(`INSERT INTO map_npcs (region_id, code, name, description, interaction_kind, pos_x, pos_y, pos_z) VALUES
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'pear_guide', '梨子喵', '笑容明快的猫族少女，正把一张写满涂改痕迹的纸藏到身后。', 'npc', -22, -196, 0),
    ((SELECT id FROM map_regions WHERE code='world_tree'), 'tree_keeper', '树守·阿鲁', '守望世界树的沉默老人。', 'npc', 0, 0, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'guild_counter', '冒险者公会', '承接委托、登记冒险者与交换情报的大厅。', 'building', -2, -181, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'saint_church', '圣恩教堂', '彩窗将柔和的光投在长椅间。一位修女正安静整理祭台前的白花，向每位来客报以温雅的微笑。', 'building', -9, -170, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'blacksmith', '铁匠铺', '炉火终日不熄。年轻的 Lv.3 锻造师漠北正站在铁砧前，铁锤敲击声从半开的门里传来。', 'building', -17, -191, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'alchemy_sweetshop', '糖水屋', '“晴空糖水屋”的门口挂着晴空色风铃，甜香与清新的草药气息一同飘出。', 'building', -12, -196, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'oddworkshop', '异工坊', '异工坊的门牌歪斜地挂在墙上，屋内不时传出弹簧、齿轮与不明小玩意的清脆响动。', 'building', 6, -189, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'bookshop', '百味书屋', '三层高的书屋挤满了书架与求知的人。窗边一位白须老人正抱着厚重的百科全书，逐字细读。', 'building', 14, -176, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'baina_residence', '百纳居', '挂着木材与石料样本的生活工坊，负责出售建材、兑换锻材并协助冒险者安置小屋。', 'building', 7, -166, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'world_gate', '界门驿站', '银蓝色的界门静静立在圆形大厅中央，负责将持有通行资格的旅人送往远方。', 'building', 14, -167, 0),
    ((SELECT id FROM map_regions WHERE code='world_tree'), 'world_tree_gate', '世界树界门', '由巨根与叶脉光纹共同构成的归途界门，门内隐约映着百纳镇的灯火。', 'building', 2, -2, 0),
    ((SELECT id FROM map_regions WHERE code='world_tree'), 'canopy_exchange', '万叶联市', '世界树下没有城墙的交易所。商人循着叶脉光流交换来自各地的契约与奇物。', 'building', 4, 2, 0),
    ((SELECT id FROM map_regions WHERE code='world_tree'), 'world_library', '世界图书馆', '依附在世界树枝冠间的宏伟图书馆。大厅、阅览室、资料室与无尽回廊收藏着漫长岁月的知识。', 'building', -4, 5, 0),
    ((SELECT id FROM map_regions WHERE code='world_tree'), 'evolution_lab', '演化研究室', '覆着银蓝叶脉的枝干卷成一扇深蓝色小门。门牌上只有一行细字：进入前，请确认你愿意承担观察结果。', 'building', -6, 7, 0),
    ((SELECT id FROM map_regions WHERE code='dark_forest'), 'hunter_lodge', '猎户小屋', '林间有一座覆着苔藓的木屋。门边挂着风干兽皮与一张旧弓，屋内偶尔传出磨箭的细响。', 'building', 18, -105, 0)
    ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), interaction_kind=VALUES(interaction_kind), pos_x=VALUES(pos_x), pos_y=VALUES(pos_y), pos_z=VALUES(pos_z)`);
    await pool.query(`INSERT INTO map_special_objects (region_id, code, name, description, pos_x, pos_y, pos_z) VALUES
    ((SELECT id FROM map_regions WHERE code='world_tree'), 'world_tree_altar', '世界树祭坛', '被古老根须环抱的石质祭坛。', 0, 0, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'dark_forest_entrance', '幽暗密林入口', '向北望去，丛丛的密林浓郁成一抹幽绿。', -25, -156, 0),
    ((SELECT id FROM map_regions WHERE code='baina_town'), 'dark_forest_deep_entrance', '幽暗密林深处入口', '向南延伸的古林愈发幽暗，那里通往幽暗密林深处。', -25, -205, 0),
    ((SELECT id FROM map_regions WHERE code='dark_forest'), 'mist_stone', '雾石', '不断散发着冷雾的灰白石碑。', -18, -126, 0)
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
    SET c.pos_x=-22,c.pos_y=-196 WHERE r.code='baina_town' AND (c.pos_x NOT BETWEEN -25 AND 24 OR c.pos_y NOT BETWEEN -205 AND -156)`);
    await pool.query(`INSERT IGNORE INTO player_inventory (character_id, item_id, quantity)
    SELECT c.id, i.id, 3 FROM characters c JOIN item_definitions i ON i.code='healing_herb'`);
    await pool.query(`INSERT INTO characters (player_id,npc_id,npc_code,name,gender,level,experience,skill_points,constitution,spirit,strength,intelligence,agility,perception,constitution_growth,spirit_growth,strength_growth,intelligence_growth,agility_growth,perception_growth,adventurer_registered,hp_max,mp_max,current_hp,current_mp,physical_attack,magic_attack,physical_defense,magic_defense,accuracy,evasion,crit_rate_bp,crit_damage_bp,crit_resist_bp,crit_damage_reduction_bp,tenacity,speed,current_region_id,pos_x,pos_y,pos_z)
    SELECT NULL, v.npc_id, v.code, v.name, '未设定', 10, 900, 0, v.constitution,v.spirit,v.strength,v.intelligence,v.agility,v.perception, 0,0,0,0,0,0, 1, v.hp,v.mp,v.hp,v.mp,v.patk,v.matk,v.pdef,v.mdef,v.accuracy,v.evasion,100,3000,60,100,0,v.speed,(SELECT id FROM map_regions WHERE code='dark_forest'),0,-60,0
    FROM (SELECT 900000001 AS npc_id,'npc_forest_warrior' AS code,'莱昂' AS name,50 AS constitution,20 AS spirit,52 AS strength,12 AS intelligence,28 AS agility,24 AS perception,1150 AS hp,520 AS mp,170 AS patk,55 AS matk,145 AS pdef,85 AS mdef,22 AS accuracy,14 AS evasion,86 AS speed
      UNION ALL SELECT 900000002,'npc_forest_mage','伊芙',24,52,12,55,30,34,820,1150,55,185,78,120,23,16,94
      UNION ALL SELECT 900000003,'npc_forest_priest','希娅',38,55,18,38,25,32,1040,1100,72,145,115,145,21,16,82) v
    ON DUPLICATE KEY UPDATE name=VALUES(name),npc_id=VALUES(npc_id),level=VALUES(level)`);
    const [combatNpcs] = await pool.execute(`SELECT id FROM characters WHERE npc_code IN ('npc_forest_warrior','npc_forest_mage','npc_forest_priest')`);
    for (const npc of combatNpcs)
        await recalculateCharacterStats(pool, Number(npc.id));
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
    ('necromancer_purging_mist','亡雾涤净','utility','无','灵异','无','自身',68,5,0,99,99,1,0,'冰冷亡雾洗去自身的异常，并凝成一层短暂护盾。'),
    ('goblin_colonel_crushing_wave','军令·裂阵镇压','physical','打击','打击','无','全体',72,3,138,99,99,1,0,'哥布林上校挥动军旗与重刃制造震荡波，对全体敌人造成范围打击，并削弱其物防与命中。'),
    ('goblin_colonel_toxic_barrage','军令·毒焰齐射','magic','暗','元素','暗','全体',88,4,146,99,99,1,0,'哥布林上校命令弓手与术士齐射毒焰，对全体敌人造成暗属性范围伤害，并施加灼烧与迟缓。'),
    ('goblin_crossrush','交叉突进','physical','刺击','刺击','无','近战',24,2,125,1,1,5,15,'两名哥布林交叉突进，对目标造成刺击并扰乱其站姿。'),
    ('goblin_marking_horn','标敌号角','utility','无','强化','无','全体',28,3,0,1,1,1,0,'号角标记感知最低的敌人，令哥布林更容易命中。'),
    ('goblin_sawtooth','锯齿横断','physical','斩击','斩击','无','近战',30,2,145,1,1,5,15,'粗重锯刃横断目标，留下难以闭合的破绽。'),
    ('goblin_bloodrush','血沸冲锋','physical','刺击','刺击','无','近战',26,3,135,1,1,5,15,'敢死队以燃血换取冲锋力量，濒危时威力更高。'),
    ('goblin_forest_bolt','林弦穿叶','physical','刺击','刺击','无','远程',22,2,132,1,1,5,15,'弓箭手借古木回声射出穿叶箭。'),
    ('goblin_splitshot','三叉散射','physical','刺击','刺击','无','全体',34,3,105,1,1,5,15,'向多名敌人散射三支短矢。'),
    ('goblin_volatile_flask','炸药投瓶','magic','火','元素','火','全体',38,3,150,1,1,5,15,'将不稳定火药瓶投向敌阵并引发爆燃。'),
    ('goblin_death_oath','敢死誓约','utility','无','强化','无','自身',32,4,0,1,1,1,0,'以军誓压榨生命，短暂提高攻击并拒绝倒下。'),
    ('goblin_spiked_net','荆钉网','physical','打击','打击','无','远程',25,3,115,1,1,5,15,'撒出带倒刺的粗网，限制目标移动。'),
    ('goblin_tripwire','绊索阵','utility','无','控制','无','全体',30,4,0,1,1,1,0,'提前埋设的绊索同时绊倒敌阵。'),
    ('goblin_dust_retreat','烟尘撤步','utility','无','强化','无','自身',18,3,0,1,1,1,0,'扬起烟尘后撤，下一次出招更难被预判。'),
    ('goblin_shieldwall','木盾拒阵','utility','无','强化','无','全体',30,3,0,1,1,1,0,'盾卫结成木盾拒阵，保护哥布林同伴。'),
    ('goblin_pin_down','钉地锁步','physical','打击','打击','无','近战',26,2,125,1,1,5,15,'将短矛钉入地面，锁住目标脚步。'),
    ('goblin_war_drum','战鼓催命','utility','无','强化','无','全体',36,4,0,1,1,1,0,'战鼓加速全队的攻击节奏。'),
    ('goblin_rally_beat','回阵鼓点','utility','无','恢复','无','全体',42,5,0,1,1,1,0,'鼓点召回溃散者，并稳定同伴的魔力。'),
    ('goblin_bone_prayer','骨铃祷言','magic','暗','元素','暗','远程',32,2,118,1,1,5,15,'祭司摇响骨铃，以暗光灼烧敌人的意志。'),
    ('goblin_mire_blessing','沼影赐福','utility','无','强化','暗','全体',38,4,0,1,1,1,0,'将沼影附着于全队，提升暗影战斗适应性。'),
    ('goblin_sacrificial_return','血祭回生','utility','无','复苏','暗','全体',55,6,0,1,1,1,0,'以血祭术唤回一名倒下的哥布林。'),
    ('goblin_mudstar','沼火流星','magic','火','元素','火','全体',48,3,168,1,1,5,15,'抛出沼火流星，在敌阵中炸开。'),
    ('goblin_ashbind','藤灰禁线','magic','木','元素','木','远程',42,3,130,1,1,5,15,'将藤灰化作禁线，削弱目标的行动与防守。'),
    ('goblin_soulscorch','灼魂','magic','火','元素','火','远程',46,4,142,1,1,5,15,'灼烧目标灵魂；目标已有灼烧时伤害提高。'),
    ('goblin_silentthroat','无声割喉','physical','刺击','刺击','无','近战',38,3,175,1,1,5,15,'刺客从死角割喉，专门收割未行动的虚弱目标。'),
    ('goblin_shadowseam','影缝','utility','无','强化','暗','自身',25,3,0,1,1,1,0,'缝合自身影子，下一次攻击更容易暴击。'),
    ('goblin_breathsteal','夺息','physical','刺击','刺击','无','近战',30,2,128,1,1,5,15,'刺入呼吸要害并从伤口夺取生命与魔力。'),
    ('goblin_burrow','潜地突袭','physical','打击','打击','土','近战',42,3,155,1,1,5,15,'潜入泥土后从脚下突袭，带出土属性冲击。'),
    ('goblin_earthfang','土棱壁','utility','无','强化','土','自身',45,4,0,1,1,1,0,'召出土棱壁承受攻击，破裂时反震敌人。'),
    ('goblin_rockfall','崩岩葬','magic','土','元素','土','全体',58,5,165,1,1,5,15,'令古树根脉下的岩层崩落，掩埋整片敌阵。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),damage_type=VALUES(damage_type),skill_kind=VALUES(skill_kind),element=VALUES(element),range_type=VALUES(range_type),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),description=VALUES(description)`);
    await pool.query(`UPDATE skill_definitions SET category='utility',damage_type='无',skill_kind='元素',element=CASE code
    WHEN 'purifying_light' THEN '光' WHEN 'frost_barrier' THEN '冰' WHEN 'healing_light' THEN '光'
    WHEN 'blessing_hymn' THEN '光' WHEN 'healing_prayer' THEN '光' WHEN 'blessing_aegis' THEN '光'
    WHEN 'mana_benediction' THEN '光' WHEN 'regenerate_slime' THEN '木' END,
    range_type=CASE code WHEN 'purifying_light' THEN '自身' WHEN 'frost_barrier' THEN '自身'
      WHEN 'healing_light' THEN '远程' WHEN 'healing_prayer' THEN '远程' ELSE '全体' END,power=0
    WHERE code IN ('purifying_light','frost_barrier','healing_light','blessing_hymn','healing_prayer','blessing_aegis','mana_benediction','regenerate_slime')`);
    await pool.query(`UPDATE skill_definitions SET skill_kind=CASE
    WHEN code IN ('war_cry','warrior_taunt_player') THEN '奥术'
    WHEN code IN ('purifying_light','frost_barrier','healing_light','blessing_hymn','healing_prayer','blessing_aegis','mana_benediction','regenerate_slime') THEN '元素'
    ELSE '灵异' END
    WHERE category='utility'`);
    await pool.query(`UPDATE skill_definitions SET
    power=CASE cooldown_turns
      WHEN 0 THEN 90 WHEN 1 THEN 108 WHEN 2 THEN 116 WHEN 3 THEN 126 WHEN 4 THEN 134 WHEN 5 THEN 142 ELSE power END,
    mana_cost=CASE cooldown_turns
      WHEN 0 THEN 30 WHEN 1 THEN 50 WHEN 2 THEN 90 WHEN 3 THEN 160 WHEN 4 THEN 210 WHEN 5 THEN 260 ELSE mana_cost END
    WHERE category IN ('physical','magic') AND power>0`);
    await pool.query(`UPDATE skill_definitions SET mana_cost=CASE code
    WHEN 'warrior_taunt_player' THEN 75 WHEN 'smoke_screen' THEN 105 WHEN 'purifying_light' THEN 270
    WHEN 'frost_barrier' THEN 180 WHEN 'healing_light' THEN 150 WHEN 'blessing_hymn' THEN 195
    WHEN 'war_cry' THEN 270 WHEN 'regenerate_slime' THEN 165 WHEN 'healing_prayer' THEN 195
    WHEN 'blessing_aegis' THEN 225 WHEN 'mana_benediction' THEN 240 WHEN 'wolfking_summon_shadow_wolf' THEN 240
    WHEN 'wolfking_shadow_curse' THEN 270 WHEN 'black_slime_mend' THEN 126 WHEN 'skeleton_command' THEN 156
    WHEN 'skeleton_guard' THEN 174 WHEN 'death_knight_aura' THEN 165 WHEN 'necromancer_raise' THEN 216
    WHEN 'necromancer_rebirth' THEN 285 WHEN 'necromancer_purging_mist' THEN 204 ELSE mana_cost END
    WHERE category='utility'`);
    await pool.query(`INSERT INTO skill_definitions (code,name,category,damage_type,skill_kind,element,range_type,mana_cost,cooldown_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,description) VALUES
    ('goblin_royal_shield_rush','盾墙冲击','physical','打击','打击','无','近战',48,2,120,99,99,1,0,'王庭盾卫以厚盾撞向仇恨最高的目标。'),
    ('goblin_royal_intercept','王庭拦截','utility','无','强化','无','全体',64,4,0,99,99,1,0,'盾卫替王座核心挡下下一次单体重击。'),
    ('goblin_royal_crowncut','冠卫断刃','physical','斩击','斩击','无','近战',72,3,135,99,99,1,0,'王庭近卫斩向最虚弱的敌人。'),
    ('goblin_royal_thunder_spear','雷矛投掷','magic','雷','元素','雷','远程',56,2,125,99,99,1,0,'雷矛拖着电弧贯穿目标。'),
    ('goblin_royal_static_net','静电缚网','magic','雷','元素','雷','全体',84,4,105,99,99,1,0,'一张电网覆盖整支冒险者队伍。'),
    ('goblin_royal_signal_flag','王旗电令','utility','无','强化','雷','全体',90,5,0,99,99,1,0,'王庭旗语提高同族的命中与行军速度。'),
    ('habadragon_royal_charge','横冲冲阵','physical','打击','打击','无','近战',72,2,132,99,99,1,0,'哈巴龙踏碎地面冲撞当前目标。'),
    ('habadragon_royal_stomp','裂地重踏','physical','打击','打击','无','全体',88,3,102,99,99,1,0,'哈巴龙的巨足震击全场。'),
    ('habadragon_royal_tail_sweep','横尾扫阵','physical','打击','打击','无','全体',82,3,90,99,99,1,0,'粗壮龙尾横扫全场，再追击首要目标。'),
    ('habadragon_royal_cataclysm_trample','末日践踏','physical','打击','打击','无','全体',130,5,142,99,99,1,0,'完成蓄力后，哈巴龙以毁灭性践踏震动整片战场。'),
    ('goblin_king_thunder_edict','雷令','magic','雷','元素','雷','远程',78,2,138,99,99,1,0,'国王将王旗雷霆降向生命最低的敌人。'),
    ('goblin_king_stormchain','王庭连雷','magic','雷','元素','雷','全体',110,4,112,99,99,1,0,'连锁雷暴横扫所有敌人。'),
    ('goblin_king_regal_conduct','王权导律','utility','无','强化','雷','全体',96,5,0,99,99,1,0,'王令令在场哥布林重整攻势。'),
    ('goblin_king_call_elites','王庭再征','utility','无','召唤','无','全体',125,6,0,99,99,1,0,'国王吹响王庭召集令。'),
    ('habadragon_mad_charge','蛮龙冲阵','physical','打击','打击','无','近战',66,2,148,99,99,1,0,'分离后的哈巴龙以蛮力压向前排。'),
    ('habadragon_crushing_stomp','碎地重踏','physical','打击','打击','无','全体',82,3,106,99,99,1,0,'龙足践踏令所有敌人脚步迟缓。'),
    ('habadragon_iron_tail_prison','铁尾囚笼','physical','打击','打击','无','近战',74,4,122,99,99,1,0,'铁尾封锁最虚弱敌人的退路。'),
    ('habadragon_bloodjaw','裂颚汲战','physical','打击','打击','无','近战',88,5,132,99,99,1,0,'哈巴龙撕咬目标，并从实际伤害中恢复生命。'),
    ('gruen_fault_sunder','断层碎甲','physical','打击','打击','土','近战',92,2,120,99,99,1,0,'格鲁恩以断层重拳锁定主目标，撕开护甲并留下可被后续岩震引爆的裂隙。'),
    ('gruen_stoneward','山心护层','utility','无','强化','土','自身',86,4,0,99,99,1,0,'格鲁恩剥落受损岩层，净化自身异常并形成短暂的山心护层。'),
    ('gruen_riftfall','裂谷坠压','physical','打击','打击','土','全体',112,3,90,99,99,1,0,'岩脊自上而下坠落，压制全体；断层裂隙中的目标会承受额外冲击。'),
    ('gruen_tectonic_call','地脉预震','utility','无','能量','土','全体',80,4,0,99,99,1,0,'格鲁恩唤醒山腹地脉，下一次行动将施放全场的核心震荡。'),
    ('gruen_corequake','山心崩震','physical','打击','打击','土','全体',138,5,128,99,99,1,0,'地脉预震后爆发的重型全场打击；断层裂隙会令冲击进一步加剧。'),
    ('valk_slag_brand','炉渣烙印','magic','火','元素','火','远程',96,2,112,99,99,1,0,'瓦尔克以高温炉渣烙印目标，造成火属性直击并留下灼烧。'),
    ('valk_chain_draw','锁链拖阵','physical','打击','打击','无','全体',108,3,84,99,99,1,0,'监工拖动灼热锁链横扫队列，限制行动并暴露站位。'),
    ('valk_anvil_sentence','铁砧裁决','physical','打击','打击','火','近战',118,3,128,99,99,1,0,'瓦尔克将铁砧砸向被炉渣烙印的目标，专门处决被标记者。'),
    ('valk_furnace_stoke','炉温加压','utility','无','能量','火','自身',78,4,0,99,99,1,0,'炉温达到阈值后，瓦尔克向熔炉加压，下一次行动会释放过载热浪。'),
    ('valk_furnace_overdrive','赤炉过载','magic','火','元素','火','全体',136,5,118,99,99,1,0,'加压完成后的高温热浪覆盖全场，并将剩余炉温转为额外伤害。'),
    ('threehead_venom_fang','腐毒獠牙','physical','刺击','刺击','无','近战',90,2,112,99,99,1,0,'蛇母的毒首撕咬主目标，施加中毒并为雾首创造追击窗口。'),
    ('threehead_mist_lash','雾幕鞭击','magic','木','元素','木','全体',104,3,87,99,99,1,0,'雾首甩出遮蔽视野的藻雾鞭，对中毒目标造成更高伤害并削弱施法。'),
    ('threehead_rootcoil','根沼绞缠','magic','木','元素','木','远程',98,3,105,99,99,1,0,'根首以沼根缠住最虚弱的猎物；命中后会为吞噬准备短暂窗口。'),
    ('threehead_swallow','三首吞噬','physical','打击','打击','无','近战',128,4,132,99,99,1,0,'蛇母协同三首吞噬被根沼绞缠的目标；若窗口未建立则不会优先施放。'),
    ('threehead_brood_regrow','蜕茧回生','utility','无','强化','木','自身',110,5,0,99,99,1,0,'蛇母在濒危时蜕下受损鳞茧，恢复生命并净化自身异常，但每场仅一次。'),
    ('uzz_gravebrand','葬印蚀魂','magic','暗','元素','暗','远程',98,2,108,99,99,1,0,'乌兹以葬印蚀入目标灵魂；被葬印的目标会被后续墓群和鸣优先撕裂。'),
    ('uzz_marrow_lash','髓骨缚鞭','magic','暗','元素','暗','远程',102,3,104,99,99,1,0,'乌兹用髓骨长鞭钉住最虚弱的猎物；命中后会为噬魂收割建立短暂窗口。'),
    ('uzz_choir_of_graves','墓群和鸣','magic','暗','元素','暗','全体',116,3,88,99,99,1,0,'墓群齐声哀唱，暗属性波纹席卷全场；葬印目标承受额外冲击。'),
    ('uzz_soul_reaping','噬魂收割','magic','暗','元素','暗','远程',128,4,134,99,99,1,0,'乌兹优先收割被髓骨缚住的灵魂；没有收割窗口时不会主动施放。'),
    ('uzz_phylactery_turn','魂匣折返','utility','无','强化','暗','自身',116,5,0,99,99,1,0,'乌兹在受创后扭转魂匣，恢复生命、净化异常并临时凝出生命护盾；每场仅一次。'),
    ('uzz_revenant_call','遗骸应召','utility','无','召唤','暗','全体',122,5,0,99,99,1,0,'乌兹唤醒两具骸骨守卫战场；战斗中至多发动两次。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),damage_type=VALUES(damage_type),skill_kind=VALUES(skill_kind),element=VALUES(element),range_type=VALUES(range_type),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),description=VALUES(description)`);
    await pool.query(`INSERT INTO skill_definitions (code,name,category,damage_type,skill_kind,element,range_type,mana_cost,cooldown_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,description) VALUES
    ('goblin_player_crossrush','交错突刺','physical','刺击','刺击','无','近战',90,2,116,2,1,5,10,'以交错步法发动突刺，并短暂扰乱目标站姿。'),
    ('goblin_player_sawtooth','裂甲战斩','physical','斩击','斩击','无','近战',90,2,116,2,1,5,10,'以凌厉战斩撕开目标防线。'),
    ('goblin_player_forest_bolt','穿风箭','physical','刺击','刺击','无','远程',90,2,116,2,1,5,10,'借风势射出一支穿刺箭，暴露目标破绽。'),
    ('goblin_player_volatile_flask','爆燃术','magic','火','元素','火','全体',160,3,126,2,1,5,10,'向敌阵投出不稳定的火焰弹，引发火属性爆燃。'),
    ('goblin_player_bloodrush','血怒冲锋','physical','刺击','刺击','无','近战',160,3,126,2,1,5,10,'燃起血性发起冲锋，命中后短暂提升自身攻势。'),
    ('goblin_player_spiked_net','倒刺束网','physical','打击','打击','无','远程',160,3,126,2,1,5,10,'抛出带倒刺的束网打击并禁锢目标。'),
    ('goblin_player_bone_prayer','暗影祷言','magic','暗','元素','暗','远程',90,2,116,2,1,5,10,'以暗属性祷言动摇目标防守。'),
    ('goblin_player_soulscorch','魂焰烙印','magic','火','元素','火','远程',210,4,134,2,1,5,10,'以魂焰灼烧目标，留下持续的灼伤。'),
    ('goblin_player_silentthroat','影袭处决','physical','刺击','刺击','无','近战',160,3,126,2,1,5,10,'从死角刺向要害，使目标短暂陷入脆弱。'),
    ('goblin_player_rockfall','崩岩术','magic','土','元素','土','全体',260,5,112,2,1,5,10,'唤起根脉下的岩层崩落，对敌阵造成土属性范围伤害。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),damage_type=VALUES(damage_type),skill_kind=VALUES(skill_kind),element=VALUES(element),range_type=VALUES(range_type),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),learn_cost=VALUES(learn_cost),upgrade_cost=VALUES(upgrade_cost),max_level=VALUES(max_level),power_per_level=VALUES(power_per_level),description=VALUES(description)`);
    await pool.query("UPDATE skill_definitions SET required_weapon_type=NULL WHERE category IN ('physical','magic','utility')");
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
    ((SELECT id FROM skill_definitions WHERE code='necromancer_purging_mist'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,25,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_colonel_crushing_wave'),(SELECT id FROM effect_definitions WHERE code='armor_shatter'),1,12,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_colonel_crushing_wave'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,14,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_colonel_toxic_barrage'),(SELECT id FROM effect_definitions WHERE code='burn'),1,5,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_colonel_toxic_barrage'),(SELECT id FROM effect_definitions WHERE code='slow'),1,14,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_crossrush'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,12,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_sawtooth'),(SELECT id FROM effect_definitions WHERE code='armor_shatter'),1,12,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_bloodrush'),(SELECT id FROM effect_definitions WHERE code='sprint'),1,20,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_forest_bolt'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,8,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_volatile_flask'),(SELECT id FROM effect_definitions WHERE code='burn'),1,6,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_death_oath'),(SELECT id FROM effect_definitions WHERE code='battle_cry'),1,15,1,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_spiked_net'),(SELECT id FROM effect_definitions WHERE code='bind'),1,16,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_tripwire'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,12,2,'enemy','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_dust_retreat'),(SELECT id FROM effect_definitions WHERE code='mist_veil'),1,20,0,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_shieldwall'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,18,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_pin_down'),(SELECT id FROM effect_definitions WHERE code='slow'),1,12,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_war_drum'),(SELECT id FROM effect_definitions WHERE code='battle_cry'),1,12,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_rally_beat'),(SELECT id FROM effect_definitions WHERE code='mana_regeneration'),1,6,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_bone_prayer'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,10,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_mire_blessing'),(SELECT id FROM effect_definitions WHERE code='battle_cry'),1,10,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_mudstar'),(SELECT id FROM effect_definitions WHERE code='burn'),1,6,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_ashbind'),(SELECT id FROM effect_definitions WHERE code='slow'),1,18,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_ashbind'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,8,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_soulscorch'),(SELECT id FROM effect_definitions WHERE code='burn'),1,8,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_silentthroat'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,12,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_shadowseam'),(SELECT id FROM effect_definitions WHERE code='shadow_pierce'),1,1,0,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_burrow'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,12,1,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_earthfang'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,20,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_rockfall'),(SELECT id FROM effect_definitions WHERE code='stun'),1,18,1,'enemy','on_hit')
    ON DUPLICATE KEY UPDATE value_override=VALUES(value_override),duration_override=VALUES(duration_override),target_scope=VALUES(target_scope),trigger_timing=VALUES(trigger_timing)`);
    await pool.query(`INSERT INTO skill_effects (skill_id,effect_id,effect_level,value_override,duration_override,target_scope,trigger_timing) VALUES
    ((SELECT id FROM skill_definitions WHERE code='goblin_royal_shield_rush'),(SELECT id FROM effect_definitions WHERE code='slow'),1,12,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_royal_crowncut'),(SELECT id FROM effect_definitions WHERE code='bleeding'),1,4,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_royal_thunder_spear'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,12,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_royal_static_net'),(SELECT id FROM effect_definitions WHERE code='bind'),1,16,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='habadragon_royal_charge'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,16,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='habadragon_royal_stomp'),(SELECT id FROM effect_definitions WHERE code='slow'),1,14,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='habadragon_royal_cataclysm_trample'),(SELECT id FROM effect_definitions WHERE code='bind'),1,18,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='habadragon_royal_cataclysm_trample'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,18,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_king_thunder_edict'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_king_stormchain'),(SELECT id FROM effect_definitions WHERE code='bind'),1,18,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='habadragon_crushing_stomp'),(SELECT id FROM effect_definitions WHERE code='slow'),1,16,2,'enemy','on_hit')
    ON DUPLICATE KEY UPDATE value_override=VALUES(value_override),duration_override=VALUES(duration_override),target_scope=VALUES(target_scope),trigger_timing=VALUES(trigger_timing)`);
    await pool.query(`DELETE se FROM skill_effects se JOIN skill_definitions s ON s.id=se.skill_id
    WHERE s.code IN ('gruen_fault_sunder','gruen_stoneward','gruen_riftfall','gruen_tectonic_call','gruen_corequake','valk_slag_brand','valk_chain_draw','valk_furnace_stoke','valk_anvil_sentence','valk_furnace_overdrive','threehead_venom_fang','threehead_mist_lash','threehead_rootcoil','threehead_swallow','threehead_brood_regrow','uzz_gravebrand','uzz_marrow_lash','uzz_choir_of_graves','uzz_soul_reaping','uzz_phylactery_turn','uzz_revenant_call')`);
    await pool.query(`INSERT INTO skill_effects (skill_id,effect_id,effect_level,value_override,duration_override,target_scope,trigger_timing) VALUES
    ((SELECT id FROM skill_definitions WHERE code='gruen_fault_sunder'),(SELECT id FROM effect_definitions WHERE code='armor_shatter'),1,16,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='gruen_fault_sunder'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,12,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='gruen_riftfall'),(SELECT id FROM effect_definitions WHERE code='slow'),1,16,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='gruen_corequake'),(SELECT id FROM effect_definitions WHERE code='bind'),1,18,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='valk_slag_brand'),(SELECT id FROM effect_definitions WHERE code='burn'),1,5,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='valk_chain_draw'),(SELECT id FROM effect_definitions WHERE code='bind'),1,14,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='valk_chain_draw'),(SELECT id FROM effect_definitions WHERE code='exposed'),1,10,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='valk_anvil_sentence'),(SELECT id FROM effect_definitions WHERE code='armor_shatter'),1,14,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='valk_furnace_overdrive'),(SELECT id FROM effect_definitions WHERE code='burn'),1,5,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='threehead_venom_fang'),(SELECT id FROM effect_definitions WHERE code='poison'),1,3,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='threehead_mist_lash'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='threehead_mist_lash'),(SELECT id FROM effect_definitions WHERE code='magic_shatter'),1,10,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='threehead_rootcoil'),(SELECT id FROM effect_definitions WHERE code='bind'),1,20,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='threehead_swallow'),(SELECT id FROM effect_definitions WHERE code='exposed'),1,12,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='uzz_gravebrand'),(SELECT id FROM effect_definitions WHERE code='magic_shatter'),1,12,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='uzz_marrow_lash'),(SELECT id FROM effect_definitions WHERE code='bind'),1,18,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='uzz_choir_of_graves'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,14,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='uzz_soul_reaping'),(SELECT id FROM effect_definitions WHERE code='exposed'),1,12,1,'enemy','on_hit')
    ON DUPLICATE KEY UPDATE effect_level=VALUES(effect_level),value_override=VALUES(value_override),duration_override=VALUES(duration_override),target_scope=VALUES(target_scope),trigger_timing=VALUES(trigger_timing)`);
    await pool.query(`INSERT INTO skill_effects (skill_id,effect_id,effect_level,value_override,duration_override,target_scope,trigger_timing) VALUES
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_crossrush'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,8,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_sawtooth'),(SELECT id FROM effect_definitions WHERE code='armor_shatter'),1,8,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_forest_bolt'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,6,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_volatile_flask'),(SELECT id FROM effect_definitions WHERE code='burn'),1,3,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_bloodrush'),(SELECT id FROM effect_definitions WHERE code='sprint'),1,12,1,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_spiked_net'),(SELECT id FROM effect_definitions WHERE code='bind'),1,10,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_bone_prayer'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,8,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_soulscorch'),(SELECT id FROM effect_definitions WHERE code='burn'),1,4,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_silentthroat'),(SELECT id FROM effect_definitions WHERE code='vulnerability'),1,10,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_rockfall'),(SELECT id FROM effect_definitions WHERE code='stun'),1,12,1,'enemy','on_hit')
    ON DUPLICATE KEY UPDATE value_override=VALUES(value_override),duration_override=VALUES(duration_override),target_scope=VALUES(target_scope),trigger_timing=VALUES(trigger_timing)`);
    await pool.query(`UPDATE skill_definitions SET
    cooldown_turns=CASE
      WHEN code IN ('arcane_bolt','bite_slash','charge','thorn_stab','mist_step_slash','healing_prayer','sanctified_bolt','sweeping_slash','wind_blade') THEN 1
      WHEN code IN ('heavy_strike','armor_break','fireball','toxic_edge','bloodletting','shell_breaker','spore_bolt','echo_shock','vine_bolt','moonlight_bolt','warrior_taunt','shield_counter','guard_break','arcane_shackle','ember_burst','piercing_thrust','thunder_lance','goblin_player_crossrush','goblin_player_sawtooth','goblin_player_forest_bolt','goblin_player_bone_prayer') THEN 2
      WHEN code IN ('frost_bind','purifying_light','war_cry','goblin_player_volatile_flask','goblin_player_bloodrush','goblin_player_spiked_net','goblin_player_silentthroat') THEN 3
      WHEN code IN ('blessing_aegis','goblin_player_soulscorch') THEN 4
      WHEN code='goblin_player_rockfall' THEN 5
      WHEN code='mana_benediction' THEN 6
      ELSE cooldown_turns
    END,
    power=CASE
      WHEN code='jump_strike' THEN 100
      WHEN code IN ('shield_counter','thunder_lance') THEN 110
      WHEN code IN ('arcane_bolt','bite_slash','charge','thorn_stab','mist_step_slash','sanctified_bolt','sweeping_slash','wind_blade') THEN 110
      WHEN code IN ('heavy_strike','armor_break','fireball','toxic_edge','bloodletting','shell_breaker','spore_bolt','echo_shock','vine_bolt','moonlight_bolt','guard_break','arcane_shackle','ember_burst','piercing_thrust','goblin_player_crossrush','goblin_player_sawtooth','goblin_player_forest_bolt','goblin_player_bone_prayer') THEN 120
      WHEN code IN ('frost_bind','goblin_player_volatile_flask','goblin_player_bloodrush','goblin_player_spiked_net','goblin_player_silentthroat') THEN 130
      WHEN code='goblin_player_soulscorch' THEN 140
      WHEN code='goblin_player_rockfall' THEN 112
      ELSE power
    END
    WHERE code IN ('heavy_strike','armor_break','arcane_bolt','fireball','toxic_edge','frost_bind','bloodletting','jump_strike','bite_slash','charge','shell_breaker','spore_bolt','echo_shock','thorn_stab','mist_step_slash','vine_bolt','moonlight_bolt','war_cry','purifying_light','warrior_taunt','shield_counter','guard_break','arcane_shackle','ember_burst','healing_prayer','blessing_aegis','mana_benediction','sanctified_bolt','sweeping_slash','piercing_thrust','wind_blade','thunder_lance','goblin_player_crossrush','goblin_player_sawtooth','goblin_player_forest_bolt','goblin_player_volatile_flask','goblin_player_bloodrush','goblin_player_spiked_net','goblin_player_bone_prayer','goblin_player_soulscorch','goblin_player_silentthroat','goblin_player_rockfall')`);
    await pool.query(`UPDATE skill_definitions SET mana_cost=CASE cooldown_turns
    WHEN 0 THEN 30
    WHEN 1 THEN 60
    WHEN 2 THEN 110
    WHEN 3 THEN 190
    WHEN 4 THEN 300
    WHEN 5 THEN 460
    WHEN 6 THEN 650
    ELSE mana_cost
  END
  WHERE code IN ('heavy_strike','armor_break','arcane_bolt','fireball','toxic_edge','frost_bind','bloodletting','jump_strike','bite_slash','charge','shell_breaker','spore_bolt','echo_shock','thorn_stab','mist_step_slash','vine_bolt','moonlight_bolt','war_cry','purifying_light','warrior_taunt','shield_counter','guard_break','arcane_shackle','ember_burst','healing_prayer','blessing_aegis','mana_benediction','sanctified_bolt','sweeping_slash','piercing_thrust','wind_blade','thunder_lance','goblin_player_crossrush','goblin_player_sawtooth','goblin_player_forest_bolt','goblin_player_volatile_flask','goblin_player_bloodrush','goblin_player_spiked_net','goblin_player_bone_prayer','goblin_player_soulscorch','goblin_player_silentthroat','goblin_player_rockfall')`);
    await pool.query(`UPDATE skill_definitions SET description=CASE code
    WHEN 'armor_break' THEN '重斩扰乱目标架势，使其短暂失衡。'
    WHEN 'fireball' THEN '爆裂火焰冲击目标，使其行动迟滞。'
    WHEN 'toxic_edge' THEN '以淬炼短刃破坏目标的战斗节奏。'
    WHEN 'bloodletting' THEN '锐利斩击压迫目标步法，使其短暂迟缓。'
    WHEN 'frost_bind' THEN '冰霜缠缚目标，使其有机会陷入束缚。'
    WHEN 'jump_strike' THEN '跃起猛击；有 50% 基础概率击晕目标。'
    WHEN 'thunder_lance' THEN '雷光贯穿目标；有 50% 基础概率击晕目标。'
    WHEN 'goblin_player_rockfall' THEN '唤起岩层崩落；有 50% 基础概率击晕目标。'
    WHEN 'goblin_player_soulscorch' THEN '魂焰烙印冲击灵魂，使目标行动迟滞。'
    WHEN 'war_cry' THEN '发出战吼提振自身斗志，短暂提高速度。'
    WHEN 'blessing_aegis' THEN '为一名队友施加持续三回合的圣佑护幕。'
    ELSE description
  END
  WHERE code IN ('armor_break','fireball','toxic_edge','bloodletting','frost_bind','jump_strike','thunder_lance','goblin_player_rockfall','goblin_player_soulscorch','war_cry','blessing_aegis')`);
    await pool.query(`DELETE se FROM skill_effects se JOIN skill_definitions s ON s.id=se.skill_id
    WHERE s.code IN ('armor_break','fireball','toxic_edge','frost_bind','bloodletting','jump_strike','bite_slash','charge','shell_breaker','spore_bolt','echo_shock','thorn_stab','mist_step_slash','vine_bolt','moonlight_bolt','war_cry','guard_break','shield_counter','arcane_shackle','ember_burst','blessing_aegis','sanctified_bolt','sweeping_slash','piercing_thrust','wind_blade','thunder_lance','goblin_player_crossrush','goblin_player_sawtooth','goblin_player_forest_bolt','goblin_player_volatile_flask','goblin_player_bloodrush','goblin_player_spiked_net','goblin_player_bone_prayer','goblin_player_soulscorch','goblin_player_silentthroat','goblin_player_rockfall')`);
    await pool.query(`INSERT INTO skill_effects (skill_id,effect_id,effect_level,value_override,duration_override,target_scope,trigger_timing) VALUES
    ((SELECT id FROM skill_definitions WHERE code='armor_break'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='fireball'),(SELECT id FROM effect_definitions WHERE code='slow'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='toxic_edge'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='frost_bind'),(SELECT id FROM effect_definitions WHERE code='bind'),1,20,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='bloodletting'),(SELECT id FROM effect_definitions WHERE code='slow'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='jump_strike'),(SELECT id FROM effect_definitions WHERE code='stun'),1,50,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='bite_slash'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='charge'),(SELECT id FROM effect_definitions WHERE code='sprint'),1,20,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='shell_breaker'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='spore_bolt'),(SELECT id FROM effect_definitions WHERE code='slow'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='echo_shock'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='thorn_stab'),(SELECT id FROM effect_definitions WHERE code='slow'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='mist_step_slash'),(SELECT id FROM effect_definitions WHERE code='sprint'),1,20,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='vine_bolt'),(SELECT id FROM effect_definitions WHERE code='bind'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='moonlight_bolt'),(SELECT id FROM effect_definitions WHERE code='sprint'),1,20,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='war_cry'),(SELECT id FROM effect_definitions WHERE code='sprint'),1,20,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='guard_break'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,20,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='shield_counter'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,20,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='arcane_shackle'),(SELECT id FROM effect_definitions WHERE code='bind'),1,20,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='ember_burst'),(SELECT id FROM effect_definitions WHERE code='slow'),1,20,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='blessing_aegis'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,20,3,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='sanctified_bolt'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,12,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='sweeping_slash'),(SELECT id FROM effect_definitions WHERE code='slow'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='piercing_thrust'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='wind_blade'),(SELECT id FROM effect_definitions WHERE code='slow'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='thunder_lance'),(SELECT id FROM effect_definitions WHERE code='stun'),1,50,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_crossrush'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_sawtooth'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_forest_bolt'),(SELECT id FROM effect_definitions WHERE code='slow'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_volatile_flask'),(SELECT id FROM effect_definitions WHERE code='slow'),1,20,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_bloodrush'),(SELECT id FROM effect_definitions WHERE code='sprint'),1,20,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_spiked_net'),(SELECT id FROM effect_definitions WHERE code='bind'),1,20,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_bone_prayer'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_soulscorch'),(SELECT id FROM effect_definitions WHERE code='slow'),1,20,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_silentthroat'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,20,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='goblin_player_rockfall'),(SELECT id FROM effect_definitions WHERE code='stun'),1,50,1,'enemy','on_hit')
    ON DUPLICATE KEY UPDATE effect_level=VALUES(effect_level),value_override=VALUES(value_override),duration_override=VALUES(duration_override),target_scope=VALUES(target_scope),trigger_timing=VALUES(trigger_timing)`);
    await pool.query(`INSERT INTO effect_definitions (code,name,effect_type,default_value,default_duration,max_level,max_stacks,stackable,description) VALUES
    ('ice_bind','冰缚','control',50,1,1,1,0,'50%基础概率使目标束缚一回合。'),
    ('lost_health_poison','失血毒','damage_over_time',10,2,1,1,0,'每回合损失已损失生命值的10%；对首领每回合最多为其最大生命的1.5%。'),
    ('precision','精准','stat_modifier',25,2,1,1,0,'提高自身命中。'),
    ('critical_focus','月影专注','stat_modifier',25,2,1,1,0,'提高自身暴击。'),
    ('evasion_down','破绽','stat_modifier',40,2,1,1,0,'降低目标闪避。'),
    ('shield_counter','盾反','shield',80,1,1,1,0,'释放后进入“盾反”状态，持续到自身下次行动前。#盾反#受到的伤害降低80%。受击为近战时，将此次80%的原始攻击反弹给施加者。')
    ,('shield_counter_cooldown','拿捏','stat_modifier',1,0,1,1,0,'格挡成功时，减少1回合该技能冷却；可反复生效。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),effect_type=VALUES(effect_type),default_value=VALUES(default_value),default_duration=VALUES(default_duration),max_level=VALUES(max_level),max_stacks=VALUES(max_stacks),stackable=VALUES(stackable),description=VALUES(description)`);
    await pool.query(`UPDATE skill_definitions SET
    name=CASE code
      WHEN 'warrior_taunt' THEN '嘲讽' WHEN 'guard_break' THEN '盾击' ELSE name END,
    category=CASE code
      WHEN 'war_cry' THEN 'utility' WHEN 'warrior_taunt' THEN 'utility' WHEN 'shield_counter' THEN 'utility'
      WHEN 'healing_prayer' THEN 'utility' WHEN 'blessing_aegis' THEN 'utility' WHEN 'mana_benediction' THEN 'utility' ELSE category END,
    damage_type=CASE code
      WHEN 'heavy_strike' THEN '打击' WHEN 'arcane_bolt' THEN '奥术' WHEN 'frost_bind' THEN '冰' WHEN 'toxic_edge' THEN '刺击'
      WHEN 'jump_strike' THEN '打击' WHEN 'charge' THEN '刺击' WHEN 'bite_slash' THEN '斩击' WHEN 'vine_bolt' THEN '木'
      WHEN 'mist_step_slash' THEN '斩击' WHEN 'moonlight_bolt' THEN '暗' WHEN 'guard_break' THEN '打击'
      WHEN 'arcane_shackle' THEN '奥术' WHEN 'ember_burst' THEN '火' WHEN 'sanctified_bolt' THEN '光'
      WHEN 'sweeping_slash' THEN '斩击' WHEN 'piercing_thrust' THEN '刺击' WHEN 'wind_blade' THEN '风' WHEN 'thunder_lance' THEN '雷'
      WHEN 'war_cry' THEN '无' WHEN 'warrior_taunt' THEN '无' WHEN 'shield_counter' THEN '无' WHEN 'healing_prayer' THEN '无' WHEN 'blessing_aegis' THEN '无' WHEN 'mana_benediction' THEN '无' ELSE damage_type END,
    skill_kind=CASE WHEN code IN ('war_cry','warrior_taunt','shield_counter','healing_prayer','blessing_aegis','mana_benediction') THEN '辅助' ELSE skill_kind END,
    element=CASE code
      WHEN 'arcane_bolt' THEN '奥术' WHEN 'war_cry' THEN '奥术' WHEN 'warrior_taunt' THEN '无' WHEN 'shield_counter' THEN '无'
      WHEN 'healing_prayer' THEN '光' WHEN 'blessing_aegis' THEN '光' WHEN 'mana_benediction' THEN '光' ELSE element END,
    range_type=CASE code
      WHEN 'war_cry' THEN '全体' WHEN 'blessing_aegis' THEN '全体' WHEN 'mana_benediction' THEN '全体'
      WHEN 'frost_bind' THEN '远程' WHEN 'arcane_bolt' THEN '远程' WHEN 'vine_bolt' THEN '远程' WHEN 'moonlight_bolt' THEN '远程' WHEN 'arcane_shackle' THEN '远程'
      WHEN 'ember_burst' THEN '远程' WHEN 'healing_prayer' THEN '远程' WHEN 'sanctified_bolt' THEN '远程' WHEN 'wind_blade' THEN '远程' WHEN 'thunder_lance' THEN '远程' ELSE range_type END,
    required_weapon_type=CASE WHEN code IN ('shield_counter','guard_break') THEN '盾牌' ELSE NULL END,
    power=CASE code
      WHEN 'heavy_strike' THEN 125 WHEN 'arcane_bolt' THEN 115 WHEN 'frost_bind' THEN 128 WHEN 'toxic_edge' THEN 120 WHEN 'jump_strike' THEN 128
      WHEN 'charge' THEN 112 WHEN 'bite_slash' THEN 105 WHEN 'vine_bolt' THEN 118 WHEN 'mist_step_slash' THEN 108 WHEN 'moonlight_bolt' THEN 120
      WHEN 'guard_break' THEN 125 WHEN 'arcane_shackle' THEN 122 WHEN 'ember_burst' THEN 128 WHEN 'sanctified_bolt' THEN 110
      WHEN 'sweeping_slash' THEN 114 WHEN 'piercing_thrust' THEN 116 WHEN 'wind_blade' THEN 110 WHEN 'thunder_lance' THEN 115
      WHEN 'war_cry' THEN 0 WHEN 'warrior_taunt' THEN 0 WHEN 'shield_counter' THEN 0 WHEN 'healing_prayer' THEN 0 WHEN 'blessing_aegis' THEN 0 WHEN 'mana_benediction' THEN 0 ELSE power END,
    mana_cost=CASE code
      WHEN 'heavy_strike' THEN 110 WHEN 'arcane_bolt' THEN 60 WHEN 'frost_bind' THEN 225 WHEN 'toxic_edge' THEN 110 WHEN 'jump_strike' THEN 130
      WHEN 'charge' THEN 60 WHEN 'bite_slash' THEN 60 WHEN 'vine_bolt' THEN 105 WHEN 'mist_step_slash' THEN 70 WHEN 'moonlight_bolt' THEN 140
      WHEN 'war_cry' THEN 190 WHEN 'warrior_taunt' THEN 90 WHEN 'shield_counter' THEN 250 WHEN 'guard_break' THEN 250 WHEN 'arcane_shackle' THEN 210
      WHEN 'ember_burst' THEN 110 WHEN 'healing_prayer' THEN 60 WHEN 'blessing_aegis' THEN 300 WHEN 'mana_benediction' THEN 650 WHEN 'sanctified_bolt' THEN 60
      WHEN 'sweeping_slash' THEN 60 WHEN 'piercing_thrust' THEN 140 WHEN 'wind_blade' THEN 60 WHEN 'thunder_lance' THEN 120 ELSE mana_cost END,
    cooldown_turns=CASE code
      WHEN 'heavy_strike' THEN 2 WHEN 'arcane_bolt' THEN 1 WHEN 'frost_bind' THEN 3 WHEN 'toxic_edge' THEN 2 WHEN 'jump_strike' THEN 3
      WHEN 'charge' THEN 1 WHEN 'bite_slash' THEN 1 WHEN 'vine_bolt' THEN 2 WHEN 'mist_step_slash' THEN 1 WHEN 'moonlight_bolt' THEN 2
      WHEN 'war_cry' THEN 3 WHEN 'warrior_taunt' THEN 1 WHEN 'shield_counter' THEN 3 WHEN 'guard_break' THEN 3 WHEN 'arcane_shackle' THEN 3
      WHEN 'ember_burst' THEN 3 WHEN 'healing_prayer' THEN 1 WHEN 'blessing_aegis' THEN 4 WHEN 'mana_benediction' THEN 6 WHEN 'sanctified_bolt' THEN 1
      WHEN 'sweeping_slash' THEN 2 WHEN 'piercing_thrust' THEN 3 WHEN 'wind_blade' THEN 1 WHEN 'thunder_lance' THEN 2 ELSE cooldown_turns END
    ,description=CASE code
      WHEN 'heavy_strike' THEN '凝聚力量的沉重打击。' WHEN 'arcane_bolt' THEN '发射一枚奥术能量飞矢。' WHEN 'frost_bind' THEN '以冰霜束缚远程目标，有概率使其无法行动。'
      WHEN 'toxic_edge' THEN '命中后施加毒素，使目标持续损失已损失生命的一部分。' WHEN 'jump_strike' THEN '跃步重击目标，有概率使其眩晕。'
      WHEN 'charge' THEN '发动刺击冲撞，并提升自身速度。' WHEN 'bite_slash' THEN '命中后削弱目标物理防御。' WHEN 'vine_bolt' THEN '发射木属性藤蔓弹，降低目标速度与闪避。'
      WHEN 'mist_step_slash' THEN '雾步突进斩击，提升自身命中。' WHEN 'moonlight_bolt' THEN '发射暗属性月影弹，提升自身暴击。'
      WHEN 'war_cry' THEN '震荡战吼，提升全队物理与魔法攻击。' WHEN 'warrior_taunt' THEN '提高全体怪物对自身的仇恨，数值等于自身双防之和。'
      WHEN 'shield_counter' THEN '进入盾反状态：下次行动前受到的伤害降低80%；近战攻击会反弹其原始伤害的80%。每次格挡成功时，减少1回合该技能冷却，可反复生效。' WHEN 'guard_break' THEN '以盾击打击目标；眩晕成功时，使目标获得2回合易伤：受到的直击伤害提高25%。'
      WHEN 'arcane_shackle' THEN '以奥术枷锁远程压制目标闪避。' WHEN 'ember_burst' THEN '引爆火焰并施加灼烧。'
      WHEN 'healing_prayer' THEN '治疗生命比例最低的队友，并赋予再生。' WHEN 'blessing_aegis' THEN '为全队施加伤害减免。' WHEN 'mana_benediction' THEN '为全队持续恢复最大魔力。'
      WHEN 'sanctified_bolt' THEN '发射圣辉弹，并为自身施加伤害减免。' WHEN 'sweeping_slash' THEN '横斩目标，降低其速度。'
      WHEN 'piercing_thrust' THEN '穿刺突击，降低目标命中与闪避。' WHEN 'wind_blade' THEN '发射风刃，降低目标速度。' WHEN 'thunder_lance' THEN '发射雷枪，有概率使目标眩晕。' ELSE description END
    WHERE code IN ('heavy_strike','arcane_bolt','frost_bind','toxic_edge','jump_strike','charge','bite_slash','vine_bolt','mist_step_slash','moonlight_bolt','war_cry','warrior_taunt','shield_counter','guard_break','arcane_shackle','ember_burst','healing_prayer','blessing_aegis','mana_benediction','sanctified_bolt','sweeping_slash','piercing_thrust','wind_blade','thunder_lance')`);
    await pool.query(`DELETE se FROM skill_effects se JOIN skill_definitions s ON s.id=se.skill_id WHERE s.code IN ('frost_bind','toxic_edge','jump_strike','charge','bite_slash','vine_bolt','mist_step_slash','moonlight_bolt','war_cry','shield_counter','guard_break','arcane_shackle','ember_burst','healing_prayer','blessing_aegis','mana_benediction','sanctified_bolt','sweeping_slash','piercing_thrust','wind_blade','thunder_lance')`);
    await pool.query(`INSERT INTO skill_effects (skill_id,effect_id,effect_level,value_override,duration_override,target_scope,trigger_timing) VALUES
    ((SELECT id FROM skill_definitions WHERE code='frost_bind'),(SELECT id FROM effect_definitions WHERE code='ice_bind'),1,50,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='toxic_edge'),(SELECT id FROM effect_definitions WHERE code='lost_health_poison'),1,10,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='jump_strike'),(SELECT id FROM effect_definitions WHERE code='stun'),1,50,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='charge'),(SELECT id FROM effect_definitions WHERE code='sprint'),1,20,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='bite_slash'),(SELECT id FROM effect_definitions WHERE code='armor_shatter'),1,10,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='vine_bolt'),(SELECT id FROM effect_definitions WHERE code='bind'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='mist_step_slash'),(SELECT id FROM effect_definitions WHERE code='precision'),1,25,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='moonlight_bolt'),(SELECT id FROM effect_definitions WHERE code='critical_focus'),1,25,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='war_cry'),(SELECT id FROM effect_definitions WHERE code='battle_cry'),1,10,2,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='shield_counter'),(SELECT id FROM effect_definitions WHERE code='shield_counter'),1,80,1,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='shield_counter'),(SELECT id FROM effect_definitions WHERE code='shield_counter_cooldown'),1,1,0,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='guard_break'),(SELECT id FROM effect_definitions WHERE code='stun'),1,50,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='guard_break'),(SELECT id FROM effect_definitions WHERE code='exposed'),1,25,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='arcane_shackle'),(SELECT id FROM effect_definitions WHERE code='evasion_down'),1,40,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='ember_burst'),(SELECT id FROM effect_definitions WHERE code='burn'),1,3,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='healing_prayer'),(SELECT id FROM effect_definitions WHERE code='regeneration'),1,6,2,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='blessing_aegis'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,18,3,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='mana_benediction'),(SELECT id FROM effect_definitions WHERE code='mana_regeneration'),1,5,3,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='sanctified_bolt'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,12,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='sweeping_slash'),(SELECT id FROM effect_definitions WHERE code='slow'),1,30,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='piercing_thrust'),(SELECT id FROM effect_definitions WHERE code='imbalance'),1,20,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='wind_blade'),(SELECT id FROM effect_definitions WHERE code='slow'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='thunder_lance'),(SELECT id FROM effect_definitions WHERE code='stun'),1,25,1,'enemy','on_hit')
    ON DUPLICATE KEY UPDATE effect_level=VALUES(effect_level),value_override=VALUES(value_override),duration_override=VALUES(duration_override),target_scope=VALUES(target_scope),trigger_timing=VALUES(trigger_timing)`);
    await pool.query(`UPDATE item_definitions SET name=CASE code WHEN 'skill_book_guardian_taunt' THEN '通用技能书·嘲讽' WHEN 'skill_book_guard_break' THEN '通用技能书·盾击' ELSE name END,
    description=CASE code WHEN 'skill_book_guardian_taunt' THEN '记载战场挑衅诀窍的通用技能书，研读后可领悟嘲讽。' WHEN 'skill_book_guard_break' THEN '记载以盾击撬开防御架势的通用技能书，研读后可领悟盾击。' ELSE description END
    WHERE code IN ('skill_book_guardian_taunt','skill_book_guard_break')`);
    await pool.query(`UPDATE bookshop_items bs JOIN item_definitions i ON i.id=bs.item_id SET bs.buy_price=CASE i.code
    WHEN 'skill_book_guardian_taunt' THEN 200 WHEN 'skill_book_shield_counter' THEN 200 WHEN 'skill_book_guard_break' THEN 400
    WHEN 'skill_book_arcane_shackle' THEN 300 WHEN 'skill_book_ember_burst' THEN 300 WHEN 'skill_book_healing_prayer' THEN 200
    WHEN 'skill_book_blessing_aegis' THEN 40 WHEN 'skill_book_mana_benediction' THEN 600 WHEN 'skill_book_sanctified_bolt' THEN 200
    WHEN 'skill_book_sweeping_slash' THEN 200 WHEN 'skill_book_piercing_thrust' THEN 300 WHEN 'skill_book_wind_blade' THEN 200 WHEN 'skill_book_thunder_lance' THEN 300 ELSE bs.buy_price END
    WHERE i.code IN ('skill_book_guardian_taunt','skill_book_shield_counter','skill_book_guard_break','skill_book_arcane_shackle','skill_book_ember_burst','skill_book_healing_prayer','skill_book_blessing_aegis','skill_book_mana_benediction','skill_book_sanctified_bolt','skill_book_sweeping_slash','skill_book_piercing_thrust','skill_book_wind_blade','skill_book_thunder_lance')`);
    await pool.query(`INSERT INTO monster_templates (code,name,monster_class,level,constitution,spirit,strength,intelligence,agility,perception,constitution_growth,spirit_growth,strength_growth,intelligence_growth,agility_growth,perception_growth,skill_sequence,experience,drops_json,weakness_json,resistance_json,element_mastery_json,element_resistance_json) VALUES
    ('slime_red','红色史莱姆','normal',1,10,5,7,7,5,5,.7,.4,.5,.5,.3,.3,JSON_ARRAY('slime_bump','slime_ember_blob'),38,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.34,'min_quantity',2,'max_quantity',7),JSON_OBJECT('code','slime_gel','chance',.8,'exclusive_group','slime_gel','min_quantity',1,'max_quantity',2),JSON_OBJECT('code','red_slime_gel','chance',.2,'exclusive_group','slime_gel','quantity',1)),JSON_ARRAY('冰'),JSON_ARRAY('火'),JSON_OBJECT('火',8),JSON_OBJECT('火',8)),
    ('slime_orange','橙色史莱姆','normal',2,13,5,8,6,4,5,.8,.3,.6,.4,.2,.3,JSON_ARRAY('slime_bump','slime_amber_blob'),44,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.36,'min_quantity',3,'max_quantity',8),JSON_OBJECT('code','slime_gel','chance',.8,'exclusive_group','slime_gel','min_quantity',1,'max_quantity',2),JSON_OBJECT('code','orange_slime_gel','chance',.2,'exclusive_group','slime_gel','quantity',1)),JSON_ARRAY('水'),JSON_ARRAY('土'),JSON_OBJECT('土',8),JSON_OBJECT('土',8)),
    ('slime_yellow','黄色史莱姆','normal',3,8,7,6,9,9,8,.5,.5,.4,.7,.7,.6,JSON_ARRAY('slime_bump','slime_spark_blob'),50,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.38,'min_quantity',3,'max_quantity',9),JSON_OBJECT('code','slime_gel','chance',.8,'exclusive_group','slime_gel','min_quantity',1,'max_quantity',3),JSON_OBJECT('code','yellow_slime_gel','chance',.2,'exclusive_group','slime_gel','quantity',1)),JSON_ARRAY('土'),JSON_ARRAY('雷'),JSON_OBJECT('雷',9),JSON_OBJECT('雷',9)),
    ('slime_green','绿色史莱姆','normal',4,12,8,7,10,5,7,.8,.6,.5,.8,.3,.5,JSON_ARRAY('slime_bump','slime_acid_blob'),57,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.40,'min_quantity',4,'max_quantity',10),JSON_OBJECT('code','slime_gel','chance',.8,'exclusive_group','slime_gel','min_quantity',1,'max_quantity',3),JSON_OBJECT('code','green_slime_gel','chance',.2,'exclusive_group','slime_gel','quantity',1)),JSON_ARRAY('火'),JSON_ARRAY('木'),JSON_OBJECT('木',10),JSON_OBJECT('木',10)),
    ('slime_cyan','青色史莱姆','normal',5,10,11,6,12,8,8,.6,.8,.4,.9,.6,.6,JSON_ARRAY('slime_bump','slime_tide_blob'),65,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.42,'min_quantity',4,'max_quantity',12),JSON_OBJECT('code','slime_gel','chance',.8,'exclusive_group','slime_gel','min_quantity',2,'max_quantity',3),JSON_OBJECT('code','cyan_slime_gel','chance',.2,'exclusive_group','slime_gel','quantity',1)),JSON_ARRAY('雷'),JSON_ARRAY('水'),JSON_OBJECT('水',12),JSON_OBJECT('水',12)),
    ('slime_blue','蓝色史莱姆','normal',6,15,10,8,11,4,6,1,.7,.6,.8,.3,.4,JSON_ARRAY('slime_bump','slime_frost_blob'),74,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.44,'min_quantity',5,'max_quantity',13),JSON_OBJECT('code','slime_gel','chance',.8,'exclusive_group','slime_gel','min_quantity',2,'max_quantity',4),JSON_OBJECT('code','blue_slime_gel','chance',.2,'exclusive_group','slime_gel','quantity',1)),JSON_ARRAY('火'),JSON_ARRAY('冰'),JSON_OBJECT('冰',12),JSON_OBJECT('冰',12)),
    ('slime_purple','紫色史莱姆','normal',8,11,15,6,16,7,12,.7,1.1,.4,1.2,.5,.9,JSON_ARRAY('slime_bump','slime_dusk_blob'),92,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.46,'min_quantity',6,'max_quantity',15),JSON_OBJECT('code','slime_gel','chance',.95,'exclusive_group','slime_gel','min_quantity',2,'max_quantity',4),JSON_OBJECT('code','purple_slime_gel','chance',.05,'exclusive_group','slime_gel','quantity',1)),JSON_ARRAY('光'),JSON_ARRAY('暗'),JSON_OBJECT('暗',15),JSON_OBJECT('暗',15)),
    ('black_slime','黑暗史莱姆','boss',10,31,22,20,26,12,18,1.5,1.3,1.1,1.5,.6,1,JSON_ARRAY('black_slime_crush','black_slime_bind','black_slime_wave','black_slime_mend'),260,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',1,'min_quantity',30,'max_quantity',70),JSON_OBJECT('code','silver_coin','chance',.12,'quantity',1),JSON_OBJECT('code','slime_gel','chance',.95,'exclusive_group','slime_gel','min_quantity',10,'max_quantity',18),JSON_OBJECT('code','black_slime_gel','chance',.05,'exclusive_group','slime_gel','min_quantity',2,'max_quantity',3)),JSON_ARRAY('光'),JSON_ARRAY('暗'),JSON_OBJECT('暗',25),JSON_OBJECT('暗',25)),
    ('skeleton','骷髅','large',16,24,9,27,8,15,12,1.1,.4,1.3,.3,.7,.5,JSON_ARRAY('skeleton_cleave'),180,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.55,'min_quantity',8,'max_quantity',18)),JSON_ARRAY('打击','光'),JSON_ARRAY('刺击'),JSON_OBJECT(),JSON_OBJECT('暗',8)),
    ('undead','亡灵','large',17,20,22,16,26,14,23,.9,1.2,.8,1.5,.6,1.2,JSON_ARRAY('skeleton_bolt','slime_dusk_blob'),210,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.58,'min_quantity',10,'max_quantity',22),JSON_OBJECT('code','silver_coin','chance',.06,'quantity',1)),JSON_ARRAY('光'),JSON_ARRAY('暗'),JSON_OBJECT('暗',22),JSON_OBJECT('暗',18)),
    ('skeleton_warrior','骷髅战士','elite',19,33,12,37,10,20,16,1.5,.5,1.7,.4,.9,.7,JSON_ARRAY('skeleton_cleave','skeleton_execution'),380,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.8,'min_quantity',20,'max_quantity',42),JSON_OBJECT('code','silver_coin','chance',.18,'quantity',1)),JSON_ARRAY('打击','光'),JSON_ARRAY('刺击'),JSON_OBJECT(),JSON_OBJECT('暗',12)),
    ('death_wight','死灵','elite',20,28,30,19,33,17,28,1.2,1.6,.8,1.8,.7,1.5,JSON_ARRAY('skeleton_bolt','necromancer_curse'),440,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',.85,'min_quantity',25,'max_quantity',50),JSON_OBJECT('code','silver_coin','chance',.22,'quantity',1)),JSON_ARRAY('光'),JSON_ARRAY('暗'),JSON_OBJECT('暗',30),JSON_OBJECT('暗',25)),
    ('skeleton_general','骷髅将军','boss',22,48,21,55,18,24,25,2,.8,2.2,.7,1,.9,JSON_ARRAY('skeleton_command','skeleton_quake','skeleton_cleave','skeleton_impale','skeleton_guard','skeleton_execution'),760,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',1,'min_quantity',80,'max_quantity',160),JSON_OBJECT('code','silver_coin','chance',.45,'min_quantity',1,'max_quantity',3)),JSON_ARRAY('打击','光'),JSON_ARRAY('刺击'),JSON_OBJECT(),JSON_OBJECT('暗',18)),
    ('death_knight','死灵骑士','boss',22,44,29,49,28,31,27,1.8,1.3,2,1.2,1.4,1.1,JSON_ARRAY('death_knight_charge','death_knight_prison','death_knight_cleave','skeleton_bolt','death_knight_aura','death_knight_lance'),820,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',1,'min_quantity',85,'max_quantity',170),JSON_OBJECT('code','silver_coin','chance',.5,'min_quantity',1,'max_quantity',3)),JSON_ARRAY('光'),JSON_ARRAY('暗'),JSON_OBJECT('暗',38),JSON_OBJECT('暗',28)),
    ('goblin_vanguard','哥布林先锋','large',18,12,10,16,9,15,14,.95,.65,1.25,.55,1.20,1.05,JSON_ARRAY('goblin_crossrush','goblin_marking_horn','goblin_dust_retreat'),150,JSON_ARRAY(JSON_OBJECT('code','goblin_ear','chance',.80,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_scrap_iron','chance',.50,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_bowstring','chance',.18,'quantity',1)),JSON_ARRAY('暗'),JSON_ARRAY('光'),JSON_OBJECT('暗',6),JSON_OBJECT('暗',4)),
    ('goblin_warrior','哥布林战士','large',19,18,9,21,7,11,10,1.45,.55,1.55,.35,.80,.70,JSON_ARRAY('goblin_sawtooth','goblin_crossrush','goblin_pin_down'),175,JSON_ARRAY(JSON_OBJECT('code','goblin_ear','chance',.85,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_scrap_iron','chance',.55,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_whetstone','chance',.45,'quantity',1)),JSON_ARRAY('暗'),JSON_ARRAY('光'),JSON_OBJECT('暗',7),JSON_OBJECT('暗',5)),
    ('goblin_archer','哥布林弓箭手','large',19,10,12,13,8,22,21,.75,.80,.95,.50,1.55,1.50,JSON_ARRAY('goblin_forest_bolt','goblin_splitshot','goblin_marking_horn'),185,JSON_ARRAY(JSON_OBJECT('code','goblin_ear','chance',.70,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_bowstring','chance',.60,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_scrap_iron','chance',.25,'quantity',1)),JSON_ARRAY('土'),JSON_ARRAY('火'),JSON_OBJECT('风',8),JSON_OBJECT('风',6)),
    ('goblin_bomber','哥布林自爆兵','large',20,20,6,20,5,8,7,1.55,.35,1.50,.25,.50,.45,JSON_ARRAY('goblin_volatile_flask','goblin_crossrush'),220,JSON_ARRAY(JSON_OBJECT('code','goblin_ear','chance',.70,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_blast_core','chance',.65,'quantity',1),JSON_OBJECT('code','goblin_scrap_iron','chance',.35,'quantity',1)),JSON_ARRAY('水'),JSON_ARRAY('火'),JSON_OBJECT('火',14),JSON_OBJECT('火',-8)),
    ('goblin_daredevil','哥布林敢死队','large',20,16,8,23,6,17,12,1.20,.45,1.70,.35,1.10,.80,JSON_ARRAY('goblin_bloodrush','goblin_death_oath','goblin_sawtooth'),255,JSON_ARRAY(JSON_OBJECT('code','goblin_ear','chance',.80,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_blast_core','chance',.55,'quantity',1),JSON_OBJECT('code','goblin_whetstone','chance',.50,'quantity',1)),JSON_ARRAY('暗'),JSON_ARRAY('水'),JSON_OBJECT('火',10),JSON_OBJECT('火',-6)),
    ('goblin_drummer','哥布林战鼓手','large',19,14,18,12,20,16,17,.90,1.40,.50,1.35,1.00,1.20,JSON_ARRAY('goblin_war_drum','goblin_rally_beat','goblin_marking_horn'),245,JSON_ARRAY(JSON_OBJECT('code','goblin_ear','chance',.75,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_drumhide','chance',.70,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_command_seal','chance',.08,'quantity',1)),JSON_ARRAY('刺击'),JSON_ARRAY('暗'),JSON_OBJECT('暗',12),JSON_OBJECT('暗',5)),
    ('goblin_shieldbearer','哥布林盾卫','large',20,24,10,18,6,9,11,1.80,.55,1.30,.30,.40,.70,JSON_ARRAY('goblin_shieldwall','goblin_pin_down','goblin_sawtooth'),280,JSON_ARRAY(JSON_OBJECT('code','goblin_ear','chance',.85,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_scrap_iron','chance',.65,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_drumhide','chance',.35,'quantity',1)),JSON_ARRAY('魔法'),JSON_ARRAY('打击'),JSON_OBJECT('土',10),JSON_OBJECT('土',8)),
    ('goblin_trapper','哥布林网罗工兵','large',19,13,16,14,18,18,22,.85,1.20,.60,1.20,1.25,1.55,JSON_ARRAY('goblin_spiked_net','goblin_tripwire','goblin_dust_retreat'),265,JSON_ARRAY(JSON_OBJECT('code','goblin_ear','chance',.75,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_bowstring','chance',.55,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_earth_crystal','chance',.55,'min_quantity',1,'max_quantity',2)),JSON_ARRAY('火'),JSON_ARRAY('土'),JSON_OBJECT('土',10),JSON_OBJECT('土',5)),
    ('goblin_priest','哥布林祭司','elite',21,15,24,8,25,12,18,1.00,1.80,.35,1.80,.70,1.20,JSON_ARRAY('goblin_bone_prayer','goblin_mire_blessing','goblin_sacrificial_return'),330,JSON_ARRAY(JSON_OBJECT('code','goblin_ear','chance',.85,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_totem_shard','chance',.55,'quantity',1),JSON_OBJECT('code','goblin_command_seal','chance',.10,'quantity',1)),JSON_ARRAY('光'),JSON_ARRAY('暗'),JSON_OBJECT('暗',22),JSON_OBJECT('光',12)),
    ('goblin_mage','哥布林法师','elite',21,10,28,7,30,14,20,.70,2.00,.30,2.10,.80,1.35,JSON_ARRAY('goblin_mudstar','goblin_ashbind','goblin_soulscorch'),370,JSON_ARRAY(JSON_OBJECT('code','goblin_ear','chance',.80,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_totem_shard','chance',.60,'quantity',1),JSON_OBJECT('code','goblin_blast_core','chance',.35,'quantity',1)),JSON_ARRAY('刺击'),JSON_ARRAY('火'),JSON_OBJECT('火',22,'暗',10),JSON_OBJECT('火',10)),
    ('goblin_assassin','哥布林刺客','elite',22,10,13,19,10,28,26,.70,.90,1.30,.55,2.00,1.80,JSON_ARRAY('goblin_silentthroat','goblin_shadowseam','goblin_breathsteal'),405,JSON_ARRAY(JSON_OBJECT('code','goblin_ear','chance',.90,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_shadowcloth','chance',.60,'quantity',1),JSON_OBJECT('code','goblin_whetstone','chance',.22,'quantity',1)),JSON_ARRAY('打击'),JSON_ARRAY('刺击'),JSON_OBJECT('暗',24),JSON_OBJECT('暗',12)),
    ('goblin_earthshaper','哥布林土行者','elite',22,28,15,20,10,9,14,1.80,1.00,1.45,.55,.45,.90,JSON_ARRAY('goblin_burrow','goblin_earthfang','goblin_rockfall'),445,JSON_ARRAY(JSON_OBJECT('code','goblin_ear','chance',.90,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_earth_crystal','chance',.70,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_scrap_iron','chance',.45,'quantity',1)),JSON_ARRAY('水'),JSON_ARRAY('土'),JSON_OBJECT('土',28),JSON_OBJECT('土',18)),
    ('goblin_colonel','精英·哥布林上校','elite',25,32,30,29,25,24,27,2.50,2.00,2.30,1.60,1.50,1.80,JSON_ARRAY('goblin_colonel_crushing_wave','goblin_colonel_toxic_barrage'),850,JSON_ARRAY(JSON_OBJECT('code','goblin_command_seal','chance',1,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_colonel_insignia','chance',1,'quantity',1),JSON_OBJECT('code','silver_coin','chance',.45,'min_quantity',1,'max_quantity',2)),JSON_ARRAY('打击','光'),JSON_ARRAY('刺击'),JSON_OBJECT('暗',20),JSON_OBJECT('暗',12)),
    ('necromancer_uz','死灵法师·乌兹','boss',32,68,82,32,98,46,74,1.3,2.3,1,2.8,1.4,2,JSON_ARRAY('uzz_gravebrand','uzz_marrow_lash','uzz_choir_of_graves','uzz_soul_reaping','uzz_phylactery_turn','uzz_revenant_call'),1800,JSON_ARRAY(JSON_OBJECT('code','copper_coin','chance',1,'min_quantity',160,'max_quantity',340),JSON_OBJECT('code','silver_coin','chance',.75,'min_quantity',2,'max_quantity',6)),JSON_ARRAY('光'),JSON_ARRAY('暗'),JSON_OBJECT('暗',70),JSON_OBJECT('暗',55))
    ON DUPLICATE KEY UPDATE name=VALUES(name),monster_class=VALUES(monster_class),level=VALUES(level),constitution=VALUES(constitution),spirit=VALUES(spirit),strength=VALUES(strength),intelligence=VALUES(intelligence),agility=VALUES(agility),perception=VALUES(perception),constitution_growth=VALUES(constitution_growth),spirit_growth=VALUES(spirit_growth),strength_growth=VALUES(strength_growth),intelligence_growth=VALUES(intelligence_growth),agility_growth=VALUES(agility_growth),perception_growth=VALUES(perception_growth),skill_sequence=VALUES(skill_sequence),experience=VALUES(experience),drops_json=VALUES(drops_json),weakness_json=VALUES(weakness_json),resistance_json=VALUES(resistance_json),element_mastery_json=VALUES(element_mastery_json),element_resistance_json=VALUES(element_resistance_json)`);
    await pool.query(`INSERT INTO monster_templates (code,name,monster_class,level,constitution,spirit,strength,intelligence,agility,perception,constitution_growth,spirit_growth,strength_growth,intelligence_growth,agility_growth,perception_growth,skill_sequence,experience,drops_json,weakness_json,resistance_json,element_mastery_json,element_resistance_json) VALUES
    ('goblin_king','横冲直撞的哥布林国王','boss',32,18,34,12,38,17,22,1.3,2.4,.7,2.6,1,1.6,JSON_ARRAY('habadragon_royal_charge','habadragon_royal_stomp','habadragon_royal_tail_sweep','habadragon_royal_cataclysm_trample','goblin_king_thunder_edict','goblin_king_stormchain','goblin_king_regal_conduct','goblin_king_call_elites'),2200,JSON_ARRAY(JSON_OBJECT('code','goblin_command_seal','chance',1,'min_quantity',2,'max_quantity',4),JSON_OBJECT('code','goblin_colonel_insignia','chance',.30,'quantity',1),JSON_OBJECT('code','silver_coin','chance',1,'min_quantity',4,'max_quantity',8)),JSON_ARRAY('打击'),JSON_ARRAY('刺击'),JSON_OBJECT('雷',35),JSON_OBJECT('雷',20)),
    ('habadragon','横冲直撞哈巴龙·载王中','boss',30,36,8,35,6,24,18,2.7,.3,2.6,.4,1.8,1.2,JSON_ARRAY('habadragon_royal_charge','habadragon_royal_stomp','habadragon_royal_tail_sweep','habadragon_royal_cataclysm_trample','habadragon_mad_charge','habadragon_crushing_stomp','habadragon_iron_tail_prison','habadragon_bloodjaw'),1700,JSON_ARRAY(JSON_OBJECT('code','goblin_scrap_iron','chance',1,'min_quantity',2,'max_quantity',4),JSON_OBJECT('code','goblin_earth_crystal','chance',.45,'quantity',1)),JSON_ARRAY('雷'),JSON_ARRAY('打击'),JSON_OBJECT('土',18),JSON_OBJECT('雷',8)),
    ('goblin_royal_guard','王庭盾卫','elite',28,31,11,25,8,12,16,2.2,.6,1.8,.4,.8,1,JSON_ARRAY('goblin_royal_shield_rush','goblin_royal_intercept','goblin_royal_crowncut'),420,JSON_ARRAY(JSON_OBJECT('code','goblin_ear','chance',.90,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_command_seal','chance',.40,'quantity',1)),JSON_ARRAY('魔法'),JSON_ARRAY('打击'),JSON_OBJECT(),JSON_OBJECT('雷',8)),
    ('goblin_royal_spearman','雷矛侍卫','elite',28,13,22,15,25,18,23,.8,1.6,1,1.8,1.3,1.6,JSON_ARRAY('goblin_royal_thunder_spear','goblin_royal_static_net','goblin_royal_signal_flag'),450,JSON_ARRAY(JSON_OBJECT('code','goblin_ear','chance',.90,'min_quantity',1,'max_quantity',2),JSON_OBJECT('code','goblin_totem_shard','chance',.45,'quantity',1)),JSON_ARRAY('土'),JSON_ARRAY('雷'),JSON_OBJECT('雷',18),JSON_OBJECT('雷',12))
    ON DUPLICATE KEY UPDATE name=VALUES(name),monster_class=VALUES(monster_class),level=VALUES(level),constitution=VALUES(constitution),spirit=VALUES(spirit),strength=VALUES(strength),intelligence=VALUES(intelligence),agility=VALUES(agility),perception=VALUES(perception),constitution_growth=VALUES(constitution_growth),spirit_growth=VALUES(spirit_growth),strength_growth=VALUES(strength_growth),intelligence_growth=VALUES(intelligence_growth),agility_growth=VALUES(agility_growth),perception_growth=VALUES(perception_growth),skill_sequence=VALUES(skill_sequence),experience=VALUES(experience),drops_json=VALUES(drops_json),weakness_json=VALUES(weakness_json),resistance_json=VALUES(resistance_json),element_mastery_json=VALUES(element_mastery_json),element_resistance_json=VALUES(element_resistance_json)`);
    await pool.query(`INSERT INTO map_monster_pools (region_id,monster_template_id,spawn_weight)
    SELECT r.id,t.id,0 FROM map_regions r JOIN monster_templates t ON t.code='goblin_king' WHERE r.code='dark_forest_deep'
    ON DUPLICATE KEY UPDATE spawn_weight=VALUES(spawn_weight)`);
    await pool.query(`UPDATE monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    SET s.traits_json=JSON_ARRAY(JSON_OBJECT('code','ordinary','name','普通的'),JSON_OBJECT(
      'code','kingbeast_encounter','name','',
      'groupId',JSON_UNQUOTE(JSON_EXTRACT(s.traits_json,REPLACE(JSON_UNQUOTE(JSON_SEARCH(s.traits_json,'one','kingbeast_encounter',NULL,'$[*].code')),'.code','.groupId'))),
      'role',CASE t.code WHEN 'goblin_king' THEN 'king' WHEN 'habadragon' THEN 'dragon' WHEN 'goblin_royal_guard' THEN 'guard' ELSE 'spearman' END
    ))
    WHERE t.code IN ('goblin_king','habadragon') AND s.defeated_at IS NULL
      AND JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','kingbeast_encounter'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','summoned'))
      AND NOT (JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','ordinary'))
        OR JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','powerful'))
        OR JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','heroic'))
        OR JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','infernal'))
        OR JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','abyssal'))
        OR JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','crimson'))
        OR JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','corrupted'))
        OR JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','holy'))
        OR JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','golden'))
        OR JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','brilliant'))
        OR JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','dreamlike')))`);
    await pool.query(`UPDATE monster_templates SET level=CASE code
    WHEN 'goblin_vanguard' THEN 9 WHEN 'goblin_warrior' THEN 11 WHEN 'goblin_archer' THEN 12 WHEN 'goblin_bomber' THEN 13
    WHEN 'goblin_daredevil' THEN 15 WHEN 'goblin_drummer' THEN 14 WHEN 'goblin_shieldbearer' THEN 16 WHEN 'goblin_trapper' THEN 14
    WHEN 'goblin_priest' THEN 17 WHEN 'goblin_mage' THEN 18 WHEN 'goblin_assassin' THEN 19 WHEN 'goblin_earthshaper' THEN 20 ELSE level END
    WHERE code IN ('goblin_vanguard','goblin_warrior','goblin_archer','goblin_bomber','goblin_daredevil','goblin_drummer','goblin_shieldbearer','goblin_trapper','goblin_priest','goblin_mage','goblin_assassin','goblin_earthshaper')`);
    await pool.query(`UPDATE monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    SET s.skill_sequence=t.skill_sequence WHERE s.defeated_at IS NULL AND t.code IN ('black_slime','skeleton_general','death_knight','necromancer_uz')`);
    await pool.query(`DELETE r FROM monster_skill_learn_rules r JOIN monster_templates t ON t.id=r.monster_template_id WHERE t.code IN ('goblin_vanguard','goblin_warrior','goblin_archer','goblin_bomber','goblin_daredevil','goblin_trapper','goblin_priest','goblin_mage','goblin_assassin','goblin_earthshaper')`);
    await pool.query(`INSERT INTO monster_skill_learn_rules (monster_template_id,source_skill_code,skill_id,chance) VALUES
    ((SELECT id FROM monster_templates WHERE code='goblin_vanguard'),'goblin_crossrush',(SELECT id FROM skill_definitions WHERE code='goblin_player_crossrush'),0.18000),
    ((SELECT id FROM monster_templates WHERE code='goblin_warrior'),'goblin_sawtooth',(SELECT id FROM skill_definitions WHERE code='goblin_player_sawtooth'),0.18000),
    ((SELECT id FROM monster_templates WHERE code='goblin_archer'),'goblin_forest_bolt',(SELECT id FROM skill_definitions WHERE code='goblin_player_forest_bolt'),0.16000),
    ((SELECT id FROM monster_templates WHERE code='goblin_bomber'),'goblin_volatile_flask',(SELECT id FROM skill_definitions WHERE code='goblin_player_volatile_flask'),0.12000),
    ((SELECT id FROM monster_templates WHERE code='goblin_daredevil'),'goblin_bloodrush',(SELECT id FROM skill_definitions WHERE code='goblin_player_bloodrush'),0.15000),
    ((SELECT id FROM monster_templates WHERE code='goblin_trapper'),'goblin_spiked_net',(SELECT id FROM skill_definitions WHERE code='goblin_player_spiked_net'),0.14000),
    ((SELECT id FROM monster_templates WHERE code='goblin_priest'),'goblin_bone_prayer',(SELECT id FROM skill_definitions WHERE code='goblin_player_bone_prayer'),0.10000),
    ((SELECT id FROM monster_templates WHERE code='goblin_mage'),'goblin_soulscorch',(SELECT id FROM skill_definitions WHERE code='goblin_player_soulscorch'),0.12000),
    ((SELECT id FROM monster_templates WHERE code='goblin_assassin'),'goblin_silentthroat',(SELECT id FROM skill_definitions WHERE code='goblin_player_silentthroat'),0.14000),
    ((SELECT id FROM monster_templates WHERE code='goblin_earthshaper'),'goblin_rockfall',(SELECT id FROM skill_definitions WHERE code='goblin_player_rockfall'),0.10000)`);
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
    await pool.query(`UPDATE monster_templates
    SET skill_sequence=CASE
      WHEN JSON_CONTAINS(COALESCE(skill_sequence,JSON_ARRAY()),JSON_QUOTE('boss_mana_charge')) THEN skill_sequence
      ELSE JSON_ARRAY_APPEND(COALESCE(skill_sequence,JSON_ARRAY()),'$', 'boss_mana_charge')
    END
    WHERE monster_class='boss'`);
    await pool.query(`INSERT IGNORE INTO monster_encounter_texts (monster_template_id,description) VALUES
    ((SELECT id FROM monster_templates WHERE code='goblin_vanguard'),'林下的号角先响了，哥布林先锋从古树根后列阵。'),
    ((SELECT id FROM monster_templates WHERE code='goblin_warrior'),'粗制武器在树根间交错，哥布林战士封住了退路。'),
    ((SELECT id FROM monster_templates WHERE code='goblin_archer'),'树冠缝隙里亮起一排冷硬的箭镞。'),
    ((SELECT id FROM monster_templates WHERE code='goblin_bomber'),'一只背着爆裂罐的哥布林摇晃着冲来。'),
    ((SELECT id FROM monster_templates WHERE code='goblin_daredevil'),'不要命的鼓噪从黑暗里逼近。'),
    ((SELECT id FROM monster_templates WHERE code='goblin_drummer'),'沉闷的战鼓让整支小队同时抬头。'),
    ((SELECT id FROM monster_templates WHERE code='goblin_shieldbearer'),'木盾与菌壳拼成一道低矮的墙。'),
    ((SELECT id FROM monster_templates WHERE code='goblin_trapper'),'脚下的藤索已经被悄悄拉紧。'),
    ((SELECT id FROM monster_templates WHERE code='goblin_priest'),'骨串与苔藓祭坛在阴影中发出低语。'),
    ((SELECT id FROM monster_templates WHERE code='goblin_mage'),'暗绿的火星在哥布林法师掌间聚集。'),
    ((SELECT id FROM monster_templates WHERE code='goblin_assassin'),'你只看见一闪而过的湿冷刀光。'),
    ((SELECT id FROM monster_templates WHERE code='goblin_earthshaper'),'地面像活物一样在它脚下隆起。'),
    ((SELECT id FROM monster_templates WHERE code='goblin_colonel'),'军靴踩碎枯叶，哥布林上校率队现身。')`);
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
    const [dungeonMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('underground_dungeon_v2')");
    if (Number(dungeonMigration.affectedRows) > 0) {
        await pool.query("UPDATE dungeon_instances SET state='closed' WHERE state='active'");
        await pool.query(`UPDATE characters c JOIN map_regions dungeon ON dungeon.id=c.current_region_id JOIN map_regions forest ON forest.code='dark_forest'
      SET c.current_region_id=forest.id,c.pos_x=0,c.pos_y=-60,c.pos_z=0 WHERE dungeon.code='dark_forest_dungeon'`);
    }
    await seedWorldSurfaceContent(pool);
    await pool.query(`UPDATE monster_templates
    SET experience=ROUND((CASE monster_class
      WHEN 'boss' THEN 300
      WHEN 'elite' THEN 100
      WHEN 'large' THEN 65
      ELSE 45
    END) * POW(1.2, FLOOR((GREATEST(1, level) - 1) / 10)))
    WHERE experience > 0`);
    await seedMonsterCraftMaterials(pool);
    await seedEpicForgeContent(pool);
    const [materialLevelRemovalMigration] = await pool.query("INSERT IGNORE INTO game_data_migrations (code) VALUES ('monster_material_level_removal_v4')");
    if (Number(materialLevelRemovalMigration.affectedRows) > 0) {
        const [legacyMaterials] = await pool.query(`SELECT id,code FROM item_definitions
      WHERE code REGEXP '^(monster_.+_(hair|gel_skin|bone|shell|scale)_l[0-9]+|magic_(thread|leather|carbon_plate|hard_shell|scale_armor)_lv[0-9]+|beast_core_lv[0-9]+|meat_chunk_lv[0-9]+)$'`);
        const purifiedReplacement = {
            magic_thread: 'spellcloth_bolt', magic_leather: 'tanned_spirit_leather', magic_carbon_plate: 'bone_steel_plate', magic_hard_shell: 'cast_shell_plate', magic_scale_armor: 'laminated_scale_plate'
        };
        const replacementCodeFor = (code) => {
            const raw = code.match(/^(monster_.+_(?:hair|gel_skin|bone|shell|scale))_l[0-9]+$/);
            if (raw)
                return raw[1];
            const refined = code.match(/^(magic_(?:thread|leather|carbon_plate|hard_shell|scale_armor))_lv[0-9]+$/);
            if (refined)
                return purifiedReplacement[refined[1]];
            if (/^beast_core_lv[0-9]+$/.test(code))
                return 'beast_core';
            if (/^meat_chunk_lv[0-9]+$/.test(code))
                return 'meat_chunk';
            return undefined;
        };
        const replacementCodes = [...new Set(legacyMaterials.map(material => replacementCodeFor(material.code)).filter((code) => Boolean(code)))];
        const [replacementMaterials] = replacementCodes.length
            ? await pool.query(`SELECT id,code FROM item_definitions WHERE code IN (${replacementCodes.map(() => '?').join(',')})`, replacementCodes)
            : [[]];
        const replacementIds = new Map(replacementMaterials.map(material => [material.code, material.id]));
        for (const material of legacyMaterials) {
            const replacementId = replacementIds.get(replacementCodeFor(material.code) ?? '');
            if (!replacementId)
                continue;
            const [inventoryRows] = await pool.query('SELECT character_id,quantity FROM player_inventory WHERE item_id=?', [material.id]);
            for (const row of inventoryRows)
                await pool.query('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [row.character_id, replacementId, row.quantity]);
            const [forgeMaterialRows] = await pool.query('SELECT character_id,quantity FROM player_forge_materials WHERE item_id=?', [material.id]);
            for (const row of forgeMaterialRows)
                await pool.query('INSERT INTO player_forge_materials (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [row.character_id, replacementId, row.quantity]);
            await pool.query('INSERT IGNORE INTO player_item_codex (character_id,item_id) SELECT character_id,? FROM player_item_codex WHERE item_id=?', [replacementId, material.id]);
            await pool.query('UPDATE player_alchemy_sessions SET purification_item_id=? WHERE purification_item_id=?', [replacementId, material.id]);
            await pool.query('DELETE FROM player_inventory WHERE item_id=?', [material.id]);
            await pool.query('DELETE FROM player_forge_materials WHERE item_id=?', [material.id]);
        }
    }
    await pool.query(`UPDATE skill_definitions SET tier='下位',max_level=20 WHERE learn_cost<99 AND code NOT IN ('appraisal')`);
    await pool.query(`INSERT INTO skill_definitions (code,name,category,tier,damage_type,skill_kind,element,range_type,mana_cost,cooldown_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,description) VALUES
    ('basic_slash','斩击','physical','基础','斩击','斩击','无','近战',10,1,100,1,1,10,5,'最基础的横斩技法。'),
    ('basic_thrust','刺击','physical','基础','刺击','刺击','无','近战',10,1,100,1,1,10,5,'最基础的突刺技法。'),
    ('basic_strike','打击','physical','基础','打击','打击','无','近战',10,1,100,1,1,10,5,'最基础的钝击技法。'),
    ('basic_fireball','小火球','magic','基础','火','元素','火','远程',12,1,100,1,1,10,5,'凝聚一枚微小而稳定的火球。'),
    ('basic_iceball','小冰球','magic','基础','冰','元素','冰','远程',12,1,100,1,1,10,5,'凝聚一枚微小的冰霜法球。'),
    ('basic_wind_blade','小风刃','magic','基础','风','元素','风','远程',12,1,100,1,1,10,5,'射出一道微弱的风刃。'),
    ('basic_thunder_orb','小雷球','magic','基础','雷','元素','雷','远程',12,1,100,1,1,10,5,'释放一团短暂跳动的电弧。'),
    ('basic_wood_bolt','小木弹','magic','基础','木','元素','木','远程',12,1,100,1,1,10,5,'发射一枚凝聚自然气息的木弹。'),
    ('basic_light_bolt','小光弹','magic','基础','光','元素','光','远程',12,1,100,1,1,10,5,'发射一枚柔和的光弹。'),
    ('basic_shadow_bolt','小暗弹','magic','基础','暗','元素','暗','远程',12,1,100,1,1,10,5,'发射一枚微弱的暗影法弹。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),tier=VALUES(tier),damage_type=VALUES(damage_type),skill_kind=VALUES(skill_kind),element=VALUES(element),range_type=VALUES(range_type),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),learn_cost=VALUES(learn_cost),upgrade_cost=VALUES(upgrade_cost),max_level=VALUES(max_level),power_per_level=VALUES(power_per_level),description=VALUES(description)`);
    await pool.query(`UPDATE skill_definitions SET target_scope=CASE
    WHEN range_type='全体' THEN '全体'
    WHEN range_type='自身' THEN '自身'
    ELSE '单体' END`);
    await pool.query(`UPDATE skill_definitions SET range_type=CASE
    WHEN range_type='单体' AND category='physical' THEN '近战'
    WHEN range_type='单体' AND category IN ('magic','utility') THEN '远程'
    WHEN range_type='全体' AND category='physical' THEN '近战'
    WHEN range_type='全体' AND category='magic' THEN '远程'
    WHEN range_type IN ('全体','自身') THEN '自身'
    ELSE range_type END`);
    await pool.query(`UPDATE skill_definitions SET range_type='自身',target_scope='自身' WHERE category IN ('passive','bound')`);
    await pool.query(`UPDATE skill_definitions SET range_type='自身',target_scope='全体'
    WHERE code IN ('war_cry','warrior_taunt','blessing_aegis','mana_benediction','blessing_hymn')`);
    await pool.query(`UPDATE skill_definitions SET range_type='自身',target_scope='自身' WHERE code IN ('shield_counter','purifying_light','frost_barrier')`);
    await pool.query(`UPDATE skill_definitions SET target_scope='全体',range_type='近战'
    WHERE code IN ('wolfking_trample','death_knight_cleave','habadragon_royal_stomp','habadragon_royal_tail_sweep','habadragon_royal_cataclysm_trample','habadragon_crushing_stomp')`);
    await pool.query(`UPDATE skill_definitions SET target_scope='全体',range_type='远程'
    WHERE code IN ('black_slime_wave','black_slime_bind','skeleton_quake','death_knight_prison','necromancer_storm','necromancer_grave_bind','goblin_colonel_crushing_wave','goblin_colonel_toxic_barrage','goblin_royal_static_net','goblin_king_stormchain','goblin_rockfall','goblin_player_rockfall')`);
    await pool.query(`INSERT INTO monster_skill_learn_rules (monster_template_id,source_skill_code,skill_id,chance)
    SELECT t.id,r.source_skill_code,s.id,0.70000 FROM monster_templates t
    JOIN (SELECT 'basic_slash' AS skill_code,'scratch' AS source_skill_code UNION ALL SELECT 'basic_thrust','charge' UNION ALL SELECT 'basic_strike','hop' UNION ALL SELECT 'basic_fireball','goblin_fire' UNION ALL SELECT 'basic_iceball','frost_bind' UNION ALL SELECT 'basic_wind_blade','wind_blade' UNION ALL SELECT 'basic_thunder_orb','thunder_lance' UNION ALL SELECT 'basic_wood_bolt','vine_hex' UNION ALL SELECT 'basic_light_bolt','sanctified_bolt' UNION ALL SELECT 'basic_shadow_bolt','moonbolt') r
    JOIN skill_definitions s ON s.code=r.skill_code
    WHERE t.monster_class IN ('normal','large')
    ON DUPLICATE KEY UPDATE source_skill_code=VALUES(source_skill_code),chance=VALUES(chance)`);
    await pool.query('UPDATE skill_definitions SET base_mana_cost=mana_cost WHERE base_mana_cost IS NULL');
    await pool.query("UPDATE skill_definitions SET mana_cost=CEIL(base_mana_cost * 0.4) WHERE category='physical'");
    await pool.query(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,rarity,required_level,weight,trade_price,stack_limit,stackable,is_tradeable,effect_json)
    VALUES ('celestial_judicator_imitation','天位制裁仪（仿品）','唯薇安以异械技术仿制的压制装置。只能在哥布林国王讨伐中使用一次，无法出售或丢弃。','异工坊·唯薇安','consumable','任务','优秀',11,0,0,1,1,0,JSON_OBJECT())
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),rarity=VALUES(rarity),required_level=VALUES(required_level),weight=VALUES(weight),trade_price=VALUES(trade_price),stack_limit=VALUES(stack_limit),stackable=VALUES(stackable),is_tradeable=VALUES(is_tradeable),effect_json=VALUES(effect_json)`);
    await pool.query(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,rarity,required_level,weight,trade_price,stack_limit,stackable,is_tradeable,effect_json)
    VALUES ('evolution_seed','进化之种','大学者【噶】授予的特殊种子。它会回应持有者的灵性，引向更高层次的进化。','世界图书馆·大学者【噶】','consumable','特殊','优秀',20,0,0,1,1,0,JSON_OBJECT('evolutionSeed',true))
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),rarity=VALUES(rarity),required_level=VALUES(required_level),weight=VALUES(weight),trade_price=VALUES(trade_price),stack_limit=VALUES(stack_limit),stackable=VALUES(stackable),is_tradeable=VALUES(is_tradeable),effect_json=VALUES(effect_json)`);
    await pool.query(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,rarity,required_level,weight,trade_price,stack_limit,stackable,is_tradeable,effect_json) VALUES
    ('evolution_active_sample','活性样本','仍在缓慢变化的生物样本，是制作进化针剂的常规原料。','大学者【噶】的观察委托','material','怪材','普通',20,0.05,0,99,1,1,JSON_OBJECT('evolutionMaterial','active')),
    ('evolution_stable_medium','稳定介质','能够缓和样本排异反应的介质。','大学者【噶】的观察委托','material','炼材','优秀',20,0.05,0,99,1,1,JSON_OBJECT('evolutionMaterial','medium')),
    ('evolution_catalyst','演化催化剂','促使生长结继续展开的稀有催化剂。','大学者【噶】的观察委托','material','炼材','精良',20,0.05,0,99,1,0,JSON_OBJECT('evolutionMaterial','catalyst')),
    ('evolution_injection_conservative','保守针剂','以稳定结构引导进化。只能在生长结前由本人注射。','大学者【噶】的演化研究室','consumable','特殊','优秀',20,0,0,1,1,0,JSON_OBJECT('evolutionInjection','conservative')),
    ('evolution_injection_aggressive','激进针剂','以更高的适应压力换取锋利的进化方向。','大学者【噶】的演化研究室','consumable','特殊','优秀',20,0,0,1,1,0,JSON_OBJECT('evolutionInjection','aggressive')),
    ('evolution_injection_harmonic','调和针剂','调节生命循环并修复轻微排异。','大学者【噶】的演化研究室','consumable','特殊','优秀',20,0,0,1,1,0,JSON_OBJECT('evolutionInjection','harmonic')),
    ('evolution_injection_perception','感知针剂','强化感知器官与战场观察。','大学者【噶】的演化研究室','consumable','特殊','稀有',23,0,0,1,1,0,JSON_OBJECT('evolutionInjection','perception')),
    ('evolution_injection_symbiosis','共生针剂','记录与同伴、环境共鸣的变化。','大学者【噶】的演化研究室','consumable','特殊','稀有',23,0,0,1,1,0,JSON_OBJECT('evolutionInjection','symbiosis')),
    ('evolution_injection_metamorphosis','蜕变针剂','可定向观察身体的一处变化。','大学者【噶】的演化研究室','consumable','特殊','传说',26,0,0,1,1,0,JSON_OBJECT('evolutionInjection','metamorphosis')),
    ('evolution_injection_shaping','定型针剂','只在 Lv.29 的成熟结前使用，用以定义开化的方向。','大学者【噶】的演化研究室','consumable','特殊','传说',29,0,0,1,1,0,JSON_OBJECT('evolutionInjection','shaping'))
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),rarity=VALUES(rarity),required_level=VALUES(required_level),weight=VALUES(weight),trade_price=VALUES(trade_price),stack_limit=VALUES(stack_limit),stackable=VALUES(stackable),is_tradeable=VALUES(is_tradeable),effect_json=VALUES(effect_json)`);
    await pool.query(`INSERT INTO skill_definitions (code,name,category,tier,damage_type,skill_kind,element,range_type,target_scope,mana_cost,cooldown_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,description) VALUES
    ('ga_azure_ray','湛蓝射线','magic','上位','魔法','元素','水','远程','单体',38,1,155,99,1,1,0,'双杖交汇，射出压缩的深蓝奥术。'),
    ('ga_specimen_mark','标本印记','magic','上位','魔法','元素','暗','远程','单体',32,2,125,99,1,1,0,'以学术印记锁定最虚弱的敌人。'),
    ('ga_ether_tether','以太牵引','magic','上位','魔法','元素','风','远程','全体',46,3,105,99,1,1,0,'无形丝线牵动全场的元素轨迹。'),
    ('ga_memory_sunder','记忆剖解','magic','上位','魔法','元素','暗','远程','单体',48,2,185,99,1,1,0,'拆解敌人的战斗习惯，给予致命一击。'),
    ('ga_archive_storm','档案风暴','magic','上位','魔法','元素','风','远程','全体',62,4,150,99,1,1,0,'无数书页化作风暴，自四面八方袭来。'),
    ('ga_life_equation','生命方程','magic','上位','魔法','元素','光','远程','单体',56,3,175,99,1,1,0,'以生命的计算式校正战场上的误差。'),
    ('ga_threshold_reversal','阈值反转','magic','上位','魔法','元素','雷','远程','全体',70,5,170,99,1,1,0,'将积蓄的观测结果反转成一场雷鸣。'),
    ('ga_evolution_proof','进化证据','magic','超位','魔法','元素','光','远程','全体',84,6,205,99,1,1,0,'让试炼者直面进化带来的全部感知。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),tier=VALUES(tier),damage_type=VALUES(damage_type),skill_kind=VALUES(skill_kind),element=VALUES(element),range_type=VALUES(range_type),target_scope=VALUES(target_scope),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),learn_cost=VALUES(learn_cost),upgrade_cost=VALUES(upgrade_cost),max_level=VALUES(max_level),power_per_level=VALUES(power_per_level),description=VALUES(description)`);
    await pool.query(`INSERT INTO monster_templates (code,name,monster_class,level,constitution,spirit,strength,intelligence,agility,perception,constitution_growth,spirit_growth,strength_growth,intelligence_growth,agility_growth,perception_growth,skill_sequence,experience,drops_json,weakness_json,resistance_json,element_mastery_json,element_resistance_json) VALUES
    ('scholar_ga','大学者·噶','boss',22,26,48,13,56,30,42,1.0,2.1,.5,2.5,1.2,1.8,JSON_ARRAY('ga_azure_ray','ga_specimen_mark','ga_ether_tether','ga_memory_sunder','ga_archive_storm','ga_life_equation','ga_threshold_reversal','ga_evolution_proof','boss_mana_charge'),1800,JSON_ARRAY(),JSON_ARRAY('暗'),JSON_ARRAY('水','风','雷'),JSON_OBJECT('水',34,'风',30,'雷',26,'暗',20),JSON_OBJECT('水',18,'风',16,'雷',14))
    ON DUPLICATE KEY UPDATE name=VALUES(name),monster_class=VALUES(monster_class),level=VALUES(level),constitution=VALUES(constitution),spirit=VALUES(spirit),strength=VALUES(strength),intelligence=VALUES(intelligence),agility=VALUES(agility),perception=VALUES(perception),constitution_growth=VALUES(constitution_growth),spirit_growth=VALUES(spirit_growth),strength_growth=VALUES(strength_growth),intelligence_growth=VALUES(intelligence_growth),agility_growth=VALUES(agility_growth),perception_growth=VALUES(perception_growth),skill_sequence=VALUES(skill_sequence),experience=VALUES(experience),drops_json=VALUES(drops_json),weakness_json=VALUES(weakness_json),resistance_json=VALUES(resistance_json),element_mastery_json=VALUES(element_mastery_json),element_resistance_json=VALUES(element_resistance_json)`);
    await pool.query(`INSERT IGNORE INTO monster_encounter_texts (monster_template_id,description) VALUES ((SELECT id FROM monster_templates WHERE code='scholar_ga'),'深蓝长杖轻轻落地，大学者【噶】在书页与光尘间抬起眼。')`);
    for (const profession of worldTreeAdvancedProfessions) {
        const [constitution, spirit, strength, intelligence, agility, perception] = profession.trial.stats;
        await pool.execute(`INSERT INTO map_npcs (region_id,code,name,description,interaction_kind,pos_x,pos_y,pos_z)
      VALUES ((SELECT id FROM map_regions WHERE code='world_tree'),?,?,?,'npc',?,?,0)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),pos_x=VALUES(pos_x),pos_y=VALUES(pos_y)`, [
            profession.mentor.code, `${profession.mentor.title}·${profession.mentor.name}`,
            `世界树常驻的${profession.name}导师。${profession.role}。`, profession.mentor.x, profession.mentor.y
        ]);
        await pool.execute(`INSERT INTO skill_definitions (code,name,category,tier,damage_type,skill_kind,element,range_type,target_scope,mana_cost,cooldown_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,description,passive_effect_json)
      VALUES (?,?,'bound','中位','无','二转天赋','无','自身','自身',0,0,0,99,99,1,0,?,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),passive_effect_json=VALUES(passive_effect_json)`, [
            profession.passive.code, profession.passive.name, profession.passive.description, JSON.stringify(profession.passive.effect)
        ]);
        await pool.execute(`INSERT INTO monster_templates (code,name,monster_class,level,constitution,spirit,strength,intelligence,agility,perception,constitution_growth,spirit_growth,strength_growth,intelligence_growth,agility_growth,perception_growth,skill_sequence,experience,drops_json,weakness_json,resistance_json,element_mastery_json,element_resistance_json)
      VALUES (?,?,'boss',30,?,?,?,?,?,?,1,1,1,1,1,1,?,0,JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),JSON_OBJECT(),JSON_OBJECT())
      ON DUPLICATE KEY UPDATE name=VALUES(name),skill_sequence=VALUES(skill_sequence),constitution=VALUES(constitution),spirit=VALUES(spirit),strength=VALUES(strength),intelligence=VALUES(intelligence),agility=VALUES(agility),perception=VALUES(perception)`, [
            profession.trial.code, profession.trial.name, constitution, spirit, strength, intelligence, agility, perception, JSON.stringify(profession.trial.skillCodes)
        ]);
    }
    await pool.query(`INSERT INTO skill_definitions (code,name,category,tier,damage_type,skill_kind,element,range_type,target_scope,mana_cost,cooldown_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,description) VALUES
    ('spirit_call_ember','灵契·炽羽雀','utility','中位','无','灵契','火','远程','自身',42,2,0,99,99,1,0,'召来炽羽雀，持续4回合。回合结束时对当前目标发动火焰追击。'),
    ('spirit_call_tide','灵契·清泉鹿','utility','中位','无','灵契','水','远程','自身',46,3,0,99,99,1,0,'召来清泉鹿，持续4回合。回合结束时治疗生命比例最低的同伴。'),
    ('spirit_call_bark','灵契·苔甲龟','utility','中位','无','灵契','木','远程','自身',52,3,0,99,99,1,0,'召来苔甲龟，持续4回合。回合结束时为全队续上短暂的根系壁垒。'),
    ('spirit_call_gale','灵契·逐风貂','utility','中位','无','灵契','风','远程','自身',48,3,0,99,99,1,0,'召来逐风貂，持续3回合。回合结束时以风压牵制全部敌人。'),
    ('spirit_call_moon','灵契·弯月猫','utility','中位','无','灵契','暗','远程','自身',54,4,0,99,99,1,0,'召来弯月猫，持续3回合。回合结束时为契主回流魔力，并暴露当前目标。'),
    ('mia_ember_echo','雀羽回响','magic','上位','魔法','导师灵契','火','远程','单体',34,2,126,99,1,1,0,'米娅借炽羽雀留下的回响发动火焰追击。'),
    ('mia_tide_chorus','鹿铃潮歌','magic','上位','魔法','导师灵契','水','远程','全体',40,3,88,99,1,1,0,'米娅以清泉鹿的回响扰乱全场节奏。'),
    ('mia_root_resonance','龟甲共振','magic','上位','魔法','导师灵契','木','远程','全体',44,4,96,99,1,1,0,'苔甲龟的回响沿地脉扩散，震荡靠近的敌人。'),
    ('sen_stonefall','引雷坠击','magic','上位','魔法','导师元素','雷','远程','单体',38,3,118,99,1,1,0,'澜烬引落积蓄的雷光轰击目标。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),tier=VALUES(tier),damage_type=VALUES(damage_type),skill_kind=VALUES(skill_kind),element=VALUES(element),range_type=VALUES(range_type),target_scope=VALUES(target_scope),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),learn_cost=VALUES(learn_cost),upgrade_cost=VALUES(upgrade_cost),max_level=VALUES(max_level),power_per_level=VALUES(power_per_level),description=VALUES(description)`);
    await pool.execute(`UPDATE skill_definitions SET description=?,passive_effect_json=? WHERE code='passive_spirit_breath'`, [spiritSummonerPassiveDescription, JSON.stringify({ mpRegenPct: 2, spiritLimitBonus: 2, spiritLimit: 3 })]);
    await pool.execute(`UPDATE map_npcs SET name=?,description=? WHERE code='mentor_summoner_mia'`, ['灵契引路人·米娅', '世界树常驻的唤灵师导师。她教导灵契、灵位与多灵协作。']);
    await pool.query(`INSERT INTO skill_definitions (code,name,category,tier,damage_type,skill_kind,element,range_type,target_scope,mana_cost,cooldown_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,description) VALUES
    ('bulwark_shieldwall_advance','盾墙推进','physical','中位','打击','打击','无','近战','单体',110,2,115,99,99,1,0,'以盾墙压向目标，造成115%物理伤害，并使自身获得12%伤害减免2回合。'),
    ('bulwark_vicarious_guard','代偿守护','utility','中位','无','防护','无','自身','自身',190,3,0,99,99,1,0,'为生命比例最低的队友施加2回合守护：其首次受到的单体伤害有35%转移给你；自身同时获得2回合20%伤害减免，按转移前伤害获得守势，单次最多30。'),
    ('bulwark_immovable_mountain','不动如山','utility','中位','无','防护','无','自身','自身',300,4,0,99,99,1,0,'稳住架势，自身获得35%伤害减免2回合。'),
    ('bulwark_bastion_judgment','壁垒裁决','physical','中位','斩击','斩击','无','近战','全体',650,7,145,99,99,1,0,'以壁垒之势横扫全体敌人，造成145%物理伤害。'),
    ('warlord_quake_command','震地号令','physical','中位','打击','打击','无','近战','全体',110,2,105,99,99,1,0,'震地号令冲击全体敌人，造成105%物理伤害并降低20%速度2回合。'),
    ('warlord_break_formation','破阵军令','physical','中位','刺击','刺击','无','近战','单体',190,3,130,99,99,1,0,'以军令直取阵眼，造成130%物理伤害并使目标易伤12% 2回合。'),
    ('warlord_triumph_banner','凯旋战旗','utility','中位','无','祝福','无','自身','全体',300,4,0,99,99,1,0,'展开凯旋战旗，使全队物理与魔法攻击提高10%，持续2回合。'),
    ('warlord_hundred_battle_sweep','百战横扫','physical','中位','斩击','斩击','无','近战','全体',650,7,170,99,99,1,0,'以百战之势横扫全体敌人，造成170%物理伤害。'),
    ('ironbreaker_armor_rend','裂甲斩','physical','中位','斩击','斩击','无','近战','单体',110,2,150,99,99,1,0,'劈开护甲，造成150%物理伤害并降低目标防御15% 2回合。'),
    ('ironbreaker_breaking_pursuit','断势追斩','physical','中位','斩击','斩击','无','近战','单体',110,2,135,99,99,1,0,'顺着破绽追斩，造成135%物理伤害，并使自身暴击提高15% 2回合。'),
    ('ironbreaker_gap_execution','绝隙处决','physical','中位','斩击','斩击','无','近战','单体',300,4,185,99,99,1,0,'瞄准防线空隙处决，造成185%物理伤害并令目标易伤15% 2回合。'),
    ('ironbreaker_steel_flash','断钢一闪','physical','中位','斩击','斩击','无','近战','单体',650,8,245,99,99,1,0,'以一闪断开钢铁防线，造成245%物理伤害。'),
    ('elementalist_cinderfrost_cycle','炽霜交替','magic','中位','魔法','元素','火','远程','单体',60,1,125,99,99,1,0,'以炽火与霜息交替轰击，造成125%魔法伤害并留下火或冰印记4回合。'),
    ('elementalist_storm_chain','雷暴导链','magic','中位','魔法','元素','雷','远程','全体',190,3,105,99,99,1,0,'引出连锁雷暴，对全体敌人造成105%雷系魔法伤害并留下雷印记4回合。'),
    ('elementalist_fourfold_resonance','四相共鸣','magic','中位','魔法','元素','风','远程','单体',300,4,150,99,99,1,0,'汇聚火、冰、风、雷的共鸣，造成150%风系魔法伤害并刷新元素印记、加入风印记。'),
    ('elementalist_sky_sequence','天穹序列','magic','中位','魔法','元素','风','远程','全体',650,7,145,99,99,1,0,'展开天穹序列，对全体敌人造成145%魔法伤害并引爆全部元素印记。'),
    ('summoner_contract_spirit','契约灵体','utility','中位','无','灵契','无','自身','自身',300,4,0,99,99,1,0,'唤起场上所有存活灵体的契约回响，使其持续时间延长1回合。'),
    ('summoner_spirit_tether','灵线牵引','utility','中位','无','灵契','无','自身','自身',110,2,0,99,99,1,0,'牵引场上存活灵体立刻各行动一次。'),
    ('summoner_returning_veil','返魂帷幕','utility','中位','无','灵契','无','自身','全体',300,4,0,99,99,1,0,'以返魂帷幕护住全队，获得10%伤害减免2回合，并净化可净化异常。'),
    ('summoner_star_pact','群星契约','utility','中位','无','灵契','无','自身','自身',650,7,0,99,99,1,0,'消耗100灵契，需场上至少1只存活契灵。全部存活契灵超载3次行动，完成第3次超载行动后退场。'),
    ('spellblade_arcane_thrust','秘法突刺','magic','中位','魔法','能量','能量','近战','单体',60,1,120,99,99,1,0,'战斗法师的物理技能以物攻+魔攻×35%为攻击基础，且不超过实际魔攻；以近身秘法突刺造成120%魔法伤害。'),
    ('spellblade_phase_guard','相位格挡','utility','中位','无','能量','能量','自身','自身',190,3,0,99,99,1,0,'错开来袭轨迹，自身获得25%伤害减免与20%速度，持续1回合。'),
    ('spellblade_spellbreak_whirl','破法回旋','magic','中位','魔法','能量','能量','近战','全体',190,3,120,99,99,1,0,'旋开破法刃环，对全体敌人造成120%魔法伤害并施加易伤10% 2回合。'),
    ('spellblade_starfire_duel','星火决斗','magic','中位','魔法','元素','火','近战','单体',650,7,210,99,99,1,0,'以星火锁定决斗目标，造成210%魔法伤害，并获得20%伤害减免2回合。'),
    ('nightblade_shadow_mark','暗影标定','physical','中位','刺击','刺击','暗','近战','单体',110,2,105,99,99,1,0,'以暗影标定目标，造成105%物理伤害并施加追猎3回合；施法者下一次攻击伤害提高20%。'),
    ('nightblade_gap_stab','背隙连刺','physical','中位','刺击','刺击','无','近战','单体',60,1,125,99,99,1,0,'沿破绽连刺，造成125%物理伤害，并提高自身暴击15% 2回合。'),
    ('nightblade_crescent_throat','残月割喉','physical','中位','刺击','刺击','暗','近战','单体',300,4,175,99,99,1,0,'以残月般的利刃割喉，造成175%物理伤害并施加2回合40%降疗，使受到的治疗量降低40%。'),
    ('nightblade_silent_finale','无声终章','physical','中位','刺击','刺击','暗','近战','单体',650,8,230,99,99,1,0,'在无声中完成终结，造成230%物理伤害，并获得50%伤害减免1回合。'),
    ('venomancer_serpent_kiss','蛇吻','physical','中位','刺击','刺击','暗','近战','单体',60,1,105,99,99,1,0,'以毒刃刺入目标，造成105%物理伤害并施加3回合剧毒。普通目标每层每回合损失5%最大生命、最多5层；首领每层最多1.5%、最多3层有效。'),
    ('venomancer_corrosion_mist','腐蚀雾','magic','中位','魔法','元素','暗','远程','全体',190,3,90,99,99,1,0,'释放腐蚀雾，对全体敌人造成90%魔法伤害，并使物理与魔法防御各降低8% 2回合；已中毒目标额外叠加一层剧毒。'),
    ('venomancer_venom_burst','毒血引爆','magic','中位','魔法','元素','暗','远程','单体',300,4,165,99,99,1,0,'引爆渗入伤口的毒血，造成165%魔法伤害并结算剩余剧毒总伤害的60%（首领40%，单次最多首领最大生命的6%），再保留一层剧毒1回合。'),
    ('venomancer_thousand_throat','万毒封喉','magic','中位','魔法','元素','暗','远程','单体',650,7,160,99,99,1,0,'以万毒封住要害，造成160%魔法伤害，叠满3层剧毒并施加2回合60%降疗（首领30%）。'),
    ('ranger_grapple_trap','钩索陷阱','physical','中位','刺击','刺击','无','远程','单体',190,3,80,99,99,1,0,'布下钩索陷阱，造成80%物理伤害，并以50%基础概率束缚目标1回合。'),
    ('ranger_weakness_survey','弱点测绘','physical','中位','刺击','刺击','无','远程','单体',110,2,100,99,99,1,0,'测绘敌人的薄弱处，造成100%物理伤害并降低目标闪避20% 2回合。'),
    ('ranger_guiding_smoke','诱导烟幕','utility','中位','无','机关','无','自身','全体',300,4,0,99,99,1,0,'以烟幕遮蔽行踪，全队获得15%伤害减免与20%速度，持续1回合。'),
    ('ranger_hundred_hunt','百发协猎','physical','中位','刺击','刺击','无','远程','单体',650,7,160,99,99,1,0,'引导全队锁定猎物，造成160%物理伤害并使目标易伤20% 2回合。'),
    ('saint_healer_mending_prayer','愈合祷言','utility','中位','无','治疗','光','远程','自身',60,1,0,99,99,1,0,'为生命最低的队友治疗90%魔攻，并施加6%再生2回合。'),
    ('saint_healer_absolution_hand','净罪之手','utility','中位','无','治疗','光','远程','自身',190,3,0,99,99,1,0,'净化生命最低队友的可净化异常，并治疗60%魔攻。'),
    ('saint_healer_resonant_mass','共鸣弥撒','utility','中位','无','治疗','光','自身','全体',300,4,0,99,99,1,0,'以共鸣弥撒照拂全队：获得6%再生与8%伤害减免2回合。'),
    ('saint_healer_revival_sanctuary','复苏圣域','utility','中位','无','治疗','光','自身','全体',650,8,0,99,99,1,0,'展开复苏圣域：全队获得10%再生与12%伤害减免2回合，并净化异常。'),
    ('aegis_watch_bastion','守望壁垒','utility','中位','无','防护','光','自身','自身',110,2,0,99,99,1,0,'为生命最低队友施加15%伤害减免壁垒与20%控制抗性，持续2回合。圣盾使施加的任意壁垒每名受护者每回合首次承伤时，施法者获得10信念。'),
    ('aegis_shared_vow','分担圣约','utility','中位','无','防护','光','自身','全体',190,3,0,99,99,1,0,'使生命最低的两名队友获得20%伤害减免壁垒，持续2回合；队内有战士时其获得10点对应专属资源。'),
    ('aegis_luminous_echo','光幕回响','utility','中位','无','防护','光','自身','全体',300,4,0,99,99,1,0,'全队获得10%伤害减免壁垒与再生，持续1回合；壁垒首次承伤后回复7%最大生命。'),
    ('aegis_undying_dome','不灭穹顶','utility','中位','无','防护','光','自身','全体',650,8,0,99,99,1,0,'全队获得20%伤害减免壁垒，持续2回合；期间每人可触发一次濒危不倒，生命保留为1。'),
    ('dawn_morning_mark','晨星烙印','magic','中位','魔法','元素','光','远程','单体',60,1,125,99,99,1,0,'以晨星烙印照向目标，造成125%光魔法伤害并施加易伤20% 2回合。'),
    ('dawn_exorcism_word','驱邪裁词','magic','中位','魔法','元素','光','远程','单体',190,3,135,99,99,1,0,'以驱邪裁词轰击目标，造成135%光魔法伤害并降低其20%速度2回合。'),
    ('dawn_judgment_litany','审判连祷','magic','中位','魔法','元素','光','远程','单体',300,4,165,99,99,1,0,'以审判连祷裁定目标，造成165%光魔法伤害并施加易伤25% 2回合。'),
    ('dawn_daybreak_decree','破晓宣告','magic','中位','魔法','元素','光','远程','全体',650,7,150,99,99,1,0,'宣告破晓，对全体敌人造成150%光魔法伤害。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),tier=VALUES(tier),damage_type=VALUES(damage_type),skill_kind=VALUES(skill_kind),element=VALUES(element),range_type=VALUES(range_type),target_scope=VALUES(target_scope),mana_cost=VALUES(mana_cost),cooldown_turns=VALUES(cooldown_turns),power=VALUES(power),learn_cost=VALUES(learn_cost),upgrade_cost=VALUES(upgrade_cost),max_level=VALUES(max_level),power_per_level=VALUES(power_per_level),description=VALUES(description)`);
    await pool.query(`UPDATE effect_definitions SET code='element_mark_thunder',name='雷印记',description='持续4回合；可由天穹序列引爆为破障。' WHERE code='element_mark_earth'`);
    await pool.query(`INSERT INTO effect_definitions (code,name,effect_type,default_value,default_duration,max_level,max_stacks,stackable,description) VALUES
    ('advanced_taunt','嘲讽','stat_modifier',0,2,1,1,0,'目标优先攻击施加者。'),
    ('advanced_guard','守护','stat_modifier',35,2,1,1,0,'目标承受的首次单体伤害会按比例转移给守护者。'),
    ('advanced_counter_ready','反击架势','stat_modifier',90,1,1,1,0,'下次行动前对主目标发动一次反击。'),
    ('element_mark_fire','火印记','stat_modifier',0,4,1,1,0,'持续4回合；可由天穹序列引爆为灼烧。'),
    ('element_mark_ice','冰印记','stat_modifier',0,4,1,1,0,'持续4回合；可由天穹序列引爆为减速。'),
    ('element_mark_wind','风印记','stat_modifier',0,4,1,1,0,'持续4回合；可由天穹序列引爆为失衡。'),
    ('element_mark_thunder','雷印记','stat_modifier',0,4,1,1,0,'持续4回合；可由天穹序列引爆为破障。'),
    ('advanced_hunt','追猎','stat_modifier',20,3,1,1,0,'下一次来自施加者的攻击获得额外伤害。'),
    ('advanced_mapping','测绘','stat_modifier',15,2,1,1,0,'全队对目标的命中提高15%，暴击提高8%。'),
    ('advanced_formation','破阵窗口','stat_modifier',12,2,1,1,0,'下一次来自队友的技能直击伤害提高。'),
    ('advanced_light_mark','晨星印记','stat_modifier',20,2,1,1,0,'下一次元素反应伤害提高。'),
    ('advanced_prayer','祷言','stat_modifier',1,3,1,3,1,'治疗或壁垒会叠加，供圣愈者转化为急救。'),
    ('advanced_healing_cut','降疗','stat_modifier',40,2,1,1,0,'受到的治疗量降低。'),
    ('advanced_undying','濒危不倒','stat_modifier',1,2,1,1,0,'本次濒危时保留1点生命，随后消失。'),
    ('life_shield','生命护盾','stat_modifier',0,1,1,1,0,'护盾拥有独立生命值，会先于生命承受伤害；每次获得的护盾独立计时，到期后仅移除该层；同一目标的护盾总量不能超过其最大生命。技能效果中的数值按目标最大生命百分比换算。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),effect_type=VALUES(effect_type),default_value=VALUES(default_value),default_duration=VALUES(default_duration),max_level=VALUES(max_level),max_stacks=VALUES(max_stacks),stackable=VALUES(stackable),description=VALUES(description)`);
    const advancedSkillCodes = Object.values(advancedProfessionActiveSkillCodes).flat();
    await pool.query(`DELETE se FROM skill_effects se JOIN skill_definitions s ON s.id=se.skill_id WHERE s.code IN (${advancedSkillCodes.map(() => '?').join(',')})`, advancedSkillCodes);
    await pool.query(`INSERT INTO skill_effects (skill_id,effect_id,effect_level,value_override,duration_override,target_scope,trigger_timing) VALUES
    ((SELECT id FROM skill_definitions WHERE code='bulwark_shieldwall_advance'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,12,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='bulwark_vicarious_guard'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,20,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='bulwark_immovable_mountain'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,35,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='warlord_quake_command'),(SELECT id FROM effect_definitions WHERE code='slow'),1,20,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='warlord_break_formation'),(SELECT id FROM effect_definitions WHERE code='armor_shatter'),1,8,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='warlord_triumph_banner'),(SELECT id FROM effect_definitions WHERE code='battle_cry'),1,10,2,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='ironbreaker_armor_rend'),(SELECT id FROM effect_definitions WHERE code='armor_shatter'),1,15,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='summoner_returning_veil'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,10,2,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='summoner_returning_veil'),(SELECT id FROM effect_definitions WHERE code='purify'),1,0,0,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='spellblade_arcane_thrust'),(SELECT id FROM effect_definitions WHERE code='precision'),1,15,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='spellblade_phase_guard'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,25,1,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='spellblade_spellbreak_whirl'),(SELECT id FROM effect_definitions WHERE code='exposed'),1,10,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='spellblade_starfire_duel'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,20,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='nightblade_silent_finale'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,50,1,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='venomancer_serpent_kiss'),(SELECT id FROM effect_definitions WHERE code='poison'),1,5,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='venomancer_corrosion_mist'),(SELECT id FROM effect_definitions WHERE code='armor_shatter'),1,8,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='venomancer_corrosion_mist'),(SELECT id FROM effect_definitions WHERE code='magic_shatter'),1,8,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='venomancer_venom_burst'),(SELECT id FROM effect_definitions WHERE code='poison'),1,5,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='venomancer_thousand_throat'),(SELECT id FROM effect_definitions WHERE code='poison'),1,5,3,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='ranger_grapple_trap'),(SELECT id FROM effect_definitions WHERE code='ice_bind'),1,50,1,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='ranger_guiding_smoke'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,15,1,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='ranger_hundred_hunt'),(SELECT id FROM effect_definitions WHERE code='exposed'),1,20,2,'enemy','on_hit'),
    ((SELECT id FROM skill_definitions WHERE code='saint_healer_mending_prayer'),(SELECT id FROM effect_definitions WHERE code='regeneration'),1,6,2,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='saint_healer_absolution_hand'),(SELECT id FROM effect_definitions WHERE code='purify'),1,0,0,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='saint_healer_revival_sanctuary'),(SELECT id FROM effect_definitions WHERE code='regeneration'),1,10,2,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='saint_healer_revival_sanctuary'),(SELECT id FROM effect_definitions WHERE code='purify'),1,0,0,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='aegis_watch_bastion'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,20,2,'self','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='aegis_shared_vow'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,15,2,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='aegis_undying_dome'),(SELECT id FROM effect_definitions WHERE code='barrier'),1,20,2,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='aegis_undying_dome'),(SELECT id FROM effect_definitions WHERE code='regeneration'),1,10,2,'ally','on_cast'),
    ((SELECT id FROM skill_definitions WHERE code='dawn_judgment_litany'),(SELECT id FROM effect_definitions WHERE code='exposed'),1,25,2,'enemy','on_hit')
    ON DUPLICATE KEY UPDATE effect_level=VALUES(effect_level),value_override=VALUES(value_override),duration_override=VALUES(duration_override),target_scope=VALUES(target_scope),trigger_timing=VALUES(trigger_timing)`);
    for (const profession of worldTreeAdvancedProfessions) {
        await pool.execute(`INSERT IGNORE INTO player_skills (character_id,skill_id,level,passive_linked)
      SELECT ap.character_id,s.id,1,1 FROM player_advanced_professions ap JOIN skill_definitions s ON s.code=?
      WHERE ap.profession_code=?`, [profession.passive.code, profession.code]);
        const skillCodes = [...(advancedProfessionActiveSkillCodes[profession.code] ?? []), ...(profession.code === 'spirit_summoner' ? spiritSummonerActiveSkillCodes : [])];
        if (!skillCodes.length)
            continue;
        await pool.execute(`INSERT IGNORE INTO player_skills (character_id,skill_id,level,passive_linked)
      SELECT ap.character_id,s.id,1,0 FROM player_advanced_professions ap JOIN skill_definitions s ON s.code IN (${skillCodes.map(() => '?').join(',')})
      WHERE ap.profession_code=?`, [...skillCodes, profession.code]);
    }
    await pool.query(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,rarity,required_level,weight,trade_price,stack_limit,stackable,is_tradeable,effect_json)
    VALUES ('resonance_crystal','回响结晶','封存着一段导师传承的澄澈结晶。Lv.30 后可在世界树导师处交付，用于完成一条旁修传承。','世界树导师试炼','material','特殊','稀有',30,0.1,0,99,1,0,JSON_OBJECT())
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),rarity=VALUES(rarity),required_level=VALUES(required_level),weight=VALUES(weight),trade_price=VALUES(trade_price),stack_limit=VALUES(stack_limit),stackable=VALUES(stackable),is_tradeable=VALUES(is_tradeable),effect_json=VALUES(effect_json)`);
    await pool.query(`INSERT IGNORE INTO player_inventory (character_id,item_id,quantity)
    SELECT ap.character_id,i.id,1 FROM player_advanced_professions ap JOIN item_definitions i ON i.code='resonance_crystal'
    WHERE NOT EXISTS (SELECT 1 FROM player_advanced_passive_studies ps WHERE ps.character_id=ap.character_id)`);
    await pool.query(`INSERT INTO effect_definitions (code,name,effect_type,default_value,default_duration,max_level,max_stacks,stackable,description) VALUES
    ('inheritance_control_resist','守壁余响','stat_modifier',20,1,1,1,0,'降低下一次受到控制效果的成功率。')
    ON DUPLICATE KEY UPDATE name=VALUES(name),effect_type=VALUES(effect_type),default_value=VALUES(default_value),default_duration=VALUES(default_duration),max_level=VALUES(max_level),max_stacks=VALUES(max_stacks),stackable=VALUES(stackable),description=VALUES(description)`);
    const [weaponMasteryPanelMigration] = await pool.query("SELECT 1 FROM game_data_migrations WHERE code='weapon_mastery_panel_recalculation_v3' LIMIT 1");
    if (!weaponMasteryPanelMigration.length) {
        const [characters] = await pool.query('SELECT id FROM characters WHERE npc_code IS NULL');
        for (const character of characters)
            await recalculateCharacterStats(pool, Number(character.id));
        await pool.execute("INSERT IGNORE INTO game_data_migrations (code) VALUES ('weapon_mastery_panel_recalculation_v3')");
    }
    const [advancedPassivePanelMigration] = await pool.query("SELECT 1 FROM game_data_migrations WHERE code='advanced_passive_panel_recalculation_v1' LIMIT 1");
    if (!advancedPassivePanelMigration.length) {
        const [characters] = await pool.query('SELECT id FROM characters WHERE npc_code IS NULL');
        for (const character of characters)
            await recalculateCharacterStats(pool, Number(character.id));
        await pool.execute("INSERT IGNORE INTO game_data_migrations (code) VALUES ('advanced_passive_panel_recalculation_v1')");
    }
    await initializeResidentSkills(pool);
    await initializeCombatSkillBalance(pool);
    await (await import('./hidden-professions.js')).initializeHiddenProfessions(pool);
    await (await import('./advanced-bound-skills.js')).initializeAdvancedBoundSkills(pool);
    await (await import('./negotiation.js')).initializeNegotiation(pool);
    await (await import('./opening.js')).initializeOpening(pool);
    await (await import('./companions.js')).initializeCompanions(pool);
    await (await import('./opening-chests.js')).initializeOpeningChests(pool);
    await (await import('./new-world.js')).initializeNewWorld(pool);
    await (await import('./lamplight.js')).initializeLamplight(pool);
    await (await import('./achievements.js')).seedAchievementProfiles(pool);
    await migrateEquipmentVitalAffixes(pool, recalculateCharacterStats);
    await refreshShopStocks(pool);
};

export { initializeSchema };
