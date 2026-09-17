import { monsterCards, cardEnchantFee, equipmentSlotName, itemRarityForCard } from '../config/monster-cards.js';

const schema = [
    `CREATE TABLE IF NOT EXISTS equipment_enchantments (
    instance_id BIGINT UNSIGNED NOT NULL,
    card_item_id BIGINT UNSIGNED NOT NULL,
    card_code VARCHAR(96) NOT NULL,
    monster_code VARCHAR(64) NOT NULL,
    card_version SMALLINT UNSIGNED NOT NULL,
    effect_text VARCHAR(500) NOT NULL,
    effects_json JSON NOT NULL,
    allowed_slots_json JSON NOT NULL,
    revision INT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (instance_id), KEY idx_equipment_enchantment_card (card_code),
    CONSTRAINT fk_equipment_enchantment_instance FOREIGN KEY (instance_id) REFERENCES player_item_instances(id) ON DELETE CASCADE,
    CONSTRAINT fk_equipment_enchantment_card_item FOREIGN KEY (card_item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS equipment_enchantment_quotes (
    token CHAR(36) NOT NULL,
    character_id BIGINT UNSIGNED NOT NULL,
    source VARCHAR(16) NOT NULL,
    instance_id BIGINT UNSIGNED NOT NULL,
    equipment_item_id BIGINT UNSIGNED NOT NULL,
    equipment_fingerprint CHAR(64) NOT NULL,
    card_item_id BIGINT UNSIGNED NOT NULL,
    card_code VARCHAR(96) NOT NULL,
    card_version SMALLINT UNSIGNED NOT NULL,
    card_inventory_revision INT UNSIGNED NOT NULL,
    enchant_revision INT UNSIGNED NOT NULL DEFAULT 0,
    fee INT UNSIGNED NOT NULL,
    state ENUM('pending','completed','expired') NOT NULL DEFAULT 'pending',
    result_json JSON NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (token), KEY idx_enchantment_quote_character (character_id,state,expires_at),
    CONSTRAINT fk_enchantment_quote_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_enchantment_quote_instance FOREIGN KEY (instance_id) REFERENCES player_item_instances(id) ON DELETE CASCADE,
    CONSTRAINT fk_enchantment_quote_equipment_item FOREIGN KEY (equipment_item_id) REFERENCES item_definitions(id),
    CONSTRAINT fk_enchantment_quote_card_item FOREIGN KEY (card_item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS monster_card_rolls (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_spawn_id BIGINT UNSIGNED NOT NULL,
    reward_channel VARCHAR(32) NOT NULL DEFAULT 'monster_card',
    session_id CHAR(36) NOT NULL,
    source_boss_code VARCHAR(64) NULL,
    represented_monster_code VARCHAR(64) NOT NULL,
    card_code VARCHAR(96) NOT NULL,
    card_version SMALLINT UNSIGNED NOT NULL,
    formula_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    base_probability DECIMAL(12,10) NOT NULL,
    final_probability DECIMAL(12,10) NOT NULL,
    roll_value DECIMAL(12,10) NOT NULL,
    formula_json JSON NOT NULL,
    eligible_character_ids_json JSON NOT NULL,
    recipient_weights_json JSON NOT NULL,
    recipient_character_id BIGINT UNSIGNED NULL,
    status ENUM('no_drop','pending','granted','failed') NOT NULL,
    attempt_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    last_error VARCHAR(500) NULL,
    last_attempt_at DATETIME(3) NULL,
    granted_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id), UNIQUE KEY uk_monster_card_roll (source_spawn_id,reward_channel,card_code),
    KEY idx_monster_card_roll_pending (status,created_at), KEY idx_monster_card_roll_recipient (recipient_character_id,created_at),
    CONSTRAINT fk_monster_card_roll_recipient FOREIGN KEY (recipient_character_id) REFERENCES characters(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_card_exploration_states (
    character_id BIGINT UNSIGNED NOT NULL,
    legal_move_charge TINYINT UNSIGNED NOT NULL DEFAULT 0,
    charged_move_ready TINYINT(1) NOT NULL DEFAULT 0,
    tracked_spawns_json JSON NOT NULL,
    revision INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (character_id),
    CONSTRAINT fk_card_exploration_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS player_monster_card_reveals (
    character_id BIGINT UNSIGNED NOT NULL,
    spawn_id BIGINT UNSIGNED NOT NULL,
    reveal_kind VARCHAR(32) NOT NULL,
    revealed_json JSON NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (character_id,spawn_id,reveal_kind),
    CONSTRAINT fk_monster_card_reveal_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_monster_card_reveal_spawn FOREIGN KEY (spawn_id) REFERENCES monster_spawns(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
];
const initializeMonsterCards = async (pool) => {
    for (const statement of schema)
        await pool.query(statement);
    const [legacyOwnerColumns] = await pool.execute(`SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='equipment_enchantments' AND COLUMN_NAME='owner_character_id'`);
    if (legacyOwnerColumns.length) {
        try {
            await pool.query('ALTER TABLE equipment_enchantments DROP FOREIGN KEY fk_equipment_enchantment_owner');
        }
        catch (error) {
            if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY')
                throw error;
        }
        try {
            await pool.query('ALTER TABLE equipment_enchantments DROP INDEX idx_equipment_enchantment_owner');
        }
        catch (error) {
            if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY')
                throw error;
        }
        await pool.query('ALTER TABLE equipment_enchantments DROP COLUMN owner_character_id');
    }
    const [rollColumns] = await pool.execute(`SELECT COLUMN_NAME AS column_name,COLUMN_TYPE AS column_type FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='monster_card_rolls'`);
    const rollColumnTypes = new Map(rollColumns.map(row => [row.column_name, row.column_type]));
    if (!String(rollColumnTypes.get('status') ?? '').includes("'failed'"))
        await pool.query("ALTER TABLE monster_card_rolls MODIFY COLUMN status ENUM('no_drop','pending','granted','failed') NOT NULL");
    for (const [column, definition] of Object.entries({
        attempt_count: 'SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER status',
        last_error: 'VARCHAR(500) NULL AFTER attempt_count',
        last_attempt_at: 'DATETIME(3) NULL AFTER last_error'
    })) {
        if (rollColumnTypes.has(column))
            continue;
        try {
            await pool.query(`ALTER TABLE monster_card_rolls ADD COLUMN ${column} ${definition}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    for (const card of monsterCards) {
        const metadata = {
            monsterCard: true, cardCode: card.cardCode, monsterCode: card.monsterCode, cardVersion: card.version,
            cardLevel: card.level, minimumEquipmentLevel: card.minimumEquipmentLevel, cardTier: card.tier,
            allowedSlots: card.allowedSlots, effectText: card.effectText, effects: card.effects,
            sourcePolicy: card.sourcePolicy, pursuitRank: card.pursuitRank ?? null,
            referencePrice: cardEnchantFee(card), noNpcSale: true
        };
        const source = card.sourcePolicy === 'source_boss' ? '对应来源BOSS胜利掉落' : card.sourcePolicy === 'city_pursuit' ? `对应${card.pursuitRank}追捕执法者掉落` : '对应怪物击杀掉落';
        await pool.execute(`INSERT INTO item_definitions
      (code,name,description,obtain_source,item_type,item_category,rarity,required_level,weight,trade_price,stack_limit,stackable,is_tradeable,effect_json)
      VALUES (?,?,?,?, 'material','怪物卡片',?,?,.01,1,999,1,1,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type='material',item_category='怪物卡片',rarity=VALUES(rarity),required_level=VALUES(required_level),weight=.01,trade_price=1,stack_limit=999,stackable=1,is_tradeable=1,effect_json=VALUES(effect_json)`, [
            card.cardCode, card.name, `${card.monsterName}留下的附魔卡片。可附魔部位：${card.allowedSlots.map(equipmentSlotName).join('/')}。效果：${card.effectText}。`, source,
            itemRarityForCard(card.tier), card.level, JSON.stringify(metadata)
        ]);
    }
    const valkCard = monsterCards.find(card => card.cardCode === 'monster_card_valk_forge_overseer');
    if (!valkCard)
        throw new Error('熔炉监工·瓦尔克卡片定义缺失。');
    await pool.execute(`UPDATE equipment_enchantments
    SET card_version=?,effect_text=?,effects_json=?,revision=revision+1
    WHERE card_code=? AND (
      card_version<>? OR effect_text<>? OR JSON_EXTRACT(effects_json,'$."elementMastery_火"') IS NOT NULL
    )`, [valkCard.version, valkCard.effectText, JSON.stringify(valkCard.effects), valkCard.cardCode, valkCard.version, valkCard.effectText]);
    const [counts] = await pool.execute("SELECT COUNT(*) AS total FROM item_definitions WHERE item_category='怪物卡片' AND JSON_EXTRACT(effect_json,'$.monsterCard')=true");
    if (Number(counts[0]?.total ?? 0) < monsterCards.length)
        throw new Error('怪物卡片物品定义未完整写入。');
};

export { initializeMonsterCards };
