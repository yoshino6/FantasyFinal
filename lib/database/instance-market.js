const initializeInstanceMarket = async (pool) => {
    await pool.query(`CREATE TABLE IF NOT EXISTS market_instance_listings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,seller_id BIGINT UNSIGNED NOT NULL,
    buyer_id BIGINT UNSIGNED NULL,kind VARCHAR(16) NOT NULL,resource_id BIGINT UNSIGNED NOT NULL,
    active_instance_id BIGINT UNSIGNED NULL,active_automaton_id BIGINT UNSIGNED NULL,
    name VARCHAR(128) NOT NULL,price BIGINT UNSIGNED NOT NULL,snapshot_json JSON NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open',fee BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at DATETIME NOT NULL,settled_at DATETIME NULL,
    UNIQUE KEY uk_market_instance (active_instance_id),UNIQUE KEY uk_market_automaton (active_automaton_id),KEY idx_instance_seller (seller_id,status),
    FOREIGN KEY (active_instance_id) REFERENCES player_item_instances(id), FOREIGN KEY (active_automaton_id) REFERENCES player_automatons(id)
  ) ENGINE=InnoDB`);
    for (const table of ['player_item_instances', 'player_automatons'])
        try {
            await pool.query(`ALTER TABLE ${table} ADD COLUMN market_listing_id BIGINT UNSIGNED NULL`);
        }
        catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME')
                throw e;
        }
    const [triggers] = await pool.query('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()');
    const names = new Set(triggers.map(t => t.TRIGGER_NAME));
    for (const [name, table] of [['equipment_market_lock_v1', 'player_equipment'], ['device_market_lock_v1', 'player_active_devices'], ['storage_market_lock_v1', 'player_home_storage_instances']])
        if (!names.has(name))
            await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW BEGIN
    IF EXISTS(SELECT 1 FROM player_item_instances WHERE id=NEW.instance_id AND market_listing_id IS NOT NULL) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='item is in market escrow'; END IF;
  END`);
    for (const [name, table] of [['equipment_binding_update_v2', 'player_equipment'], ['device_binding_update_v2', 'player_active_devices']])
        if (!names.has(name))
            await pool.query(`CREATE TRIGGER ${name} BEFORE UPDATE ON ${table} FOR EACH ROW BEGIN
    IF EXISTS(SELECT 1 FROM player_item_instances WHERE id=NEW.instance_id AND market_listing_id IS NOT NULL) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='item is in market escrow'; END IF;
    UPDATE player_item_instances SET bound_kind='personal',bound_at=COALESCE(bound_at,NOW()),bound_reason=COALESCE(bound_reason,'used') WHERE id=NEW.instance_id;
  END`);
    if (!names.has('instance_escrow_immutable_v1'))
        await pool.query(`CREATE TRIGGER instance_escrow_immutable_v1 BEFORE UPDATE ON player_item_instances FOR EACH ROW BEGIN
    IF OLD.market_listing_id IS NOT NULL AND NEW.market_listing_id IS NOT NULL AND
      (NOT(OLD.quality<=>NEW.quality) OR NOT(OLD.durability<=>NEW.durability) OR NOT(OLD.effect_json<=>NEW.effect_json) OR NOT(OLD.forge_primary_json<=>NEW.forge_primary_json) OR OLD.character_id<>NEW.character_id)
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='item is in market escrow'; END IF;
  END`);
};

export { initializeInstanceMarket };
