const initializeInventoryBinding = async (pool) => {
    for (const [table, definition] of [
        ['player_inventory', 'trade_bound_quantity INT UNSIGNED NOT NULL DEFAULT 0'],
        ['player_inventory', 'personal_bound_quantity INT UNSIGNED NOT NULL DEFAULT 0'],
        ['player_inventory', 'binding_revision INT UNSIGNED NOT NULL DEFAULT 0'],
        ['player_home_storage_items', 'trade_bound_quantity INT UNSIGNED NOT NULL DEFAULT 0'],
        ['player_home_storage_items', 'personal_bound_quantity INT UNSIGNED NOT NULL DEFAULT 0'],
        ['player_item_instances', "bound_kind VARCHAR(16) NOT NULL DEFAULT 'none'"],
        ['player_item_instances', 'bound_at DATETIME NULL'],
        ['player_item_instances', 'bound_reason VARCHAR(32) NULL']
    ]) {
        try {
            await pool.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    }
    const [triggers] = await pool.query("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()");
    const names = new Set(triggers.map(t => t.TRIGGER_NAME));
    const personal = "EXISTS(SELECT 1 FROM item_definitions WHERE id=NEW.item_id AND (is_tradeable=0 OR item_category IN ('任务','剧情') OR JSON_EXTRACT(effect_json,'$.personalOnly')=true))";
    if (!names.has('inventory_binding_insert_v1'))
        await pool.query(`CREATE TRIGGER inventory_binding_insert_v1 BEFORE INSERT ON player_inventory FOR EACH ROW BEGIN
    IF ${personal} THEN SET NEW.personal_bound_quantity=NEW.quantity; SET NEW.trade_bound_quantity=0; END IF;
    IF NEW.personal_bound_quantity+NEW.trade_bound_quantity>NEW.quantity THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='invalid inventory binding quantities'; END IF;
  END`);
    if (!names.has('inventory_personal_update_v1'))
        await pool.query(`CREATE TRIGGER inventory_personal_update_v1 BEFORE UPDATE ON player_inventory FOR EACH ROW BEGIN
    IF ${personal} THEN SET NEW.personal_bound_quantity=NEW.quantity; SET NEW.trade_bound_quantity=0; SET NEW.binding_revision=OLD.binding_revision+1; END IF;
  END`);
    if (!names.has('instance_binding_insert_v1'))
        await pool.query(`CREATE TRIGGER instance_binding_insert_v1 BEFORE INSERT ON player_item_instances FOR EACH ROW BEGIN
    IF ${personal} THEN SET NEW.bound_kind='personal'; SET NEW.bound_reason='personal_item'; SET NEW.bound_at=NOW(); END IF;
  END`);
    if (!names.has('instance_transfer_binding_v1'))
        await pool.query(`CREATE TRIGGER instance_transfer_binding_v1 BEFORE UPDATE ON player_item_instances FOR EACH ROW BEGIN
    IF OLD.character_id<>NEW.character_id THEN
      IF OLD.bound_kind<>'none' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bound item cannot transfer'; END IF;
      SET NEW.bound_kind='trade'; SET NEW.bound_at=NOW(); SET NEW.bound_reason='traded';
    END IF;
  END`);
    if (!names.has('inventory_binding_consume_v1'))
        await pool.query(`CREATE TRIGGER inventory_binding_consume_v1 BEFORE UPDATE ON player_inventory FOR EACH ROW BEGIN
    DECLARE removed INT DEFAULT 0; DECLARE personal_used INT DEFAULT 0; DECLARE trade_used INT DEFAULT 0;
    IF NEW.quantity < OLD.quantity AND NEW.binding_revision = OLD.binding_revision THEN
      SET removed = OLD.quantity - NEW.quantity;
      SET personal_used = LEAST(removed,OLD.personal_bound_quantity);
      SET trade_used = LEAST(removed-personal_used,OLD.trade_bound_quantity);
      SET NEW.personal_bound_quantity = OLD.personal_bound_quantity-personal_used;
      SET NEW.trade_bound_quantity = OLD.trade_bound_quantity-trade_used;
      SET NEW.binding_revision = OLD.binding_revision+1;
    END IF;
    IF NEW.personal_bound_quantity+NEW.trade_bound_quantity>NEW.quantity THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='invalid inventory binding quantities'; END IF;
  END`);
    for (const [name, table, field] of [['equipment_bind_insert_v2', 'player_equipment', 'instance_id'], ['device_bind_insert_v2', 'player_active_devices', 'instance_id']]) {
        if (!names.has(name))
            await pool.query(`CREATE TRIGGER ${name} AFTER INSERT ON ${table} FOR EACH ROW
      UPDATE player_item_instances SET bound_kind='personal',bound_at=COALESCE(bound_at,NOW()),bound_reason=COALESCE(bound_reason,'used') WHERE id=NEW.${field}`);
    }
    await pool.query(`UPDATE player_item_instances i LEFT JOIN player_equipment e ON e.instance_id=i.id LEFT JOIN player_active_devices d ON d.instance_id=i.id
    SET i.bound_kind='personal',i.bound_at=COALESCE(i.bound_at,NOW()),i.bound_reason='legacy_equipped' WHERE i.bound_kind<>'personal' AND (e.instance_id IS NOT NULL OR d.instance_id IS NOT NULL OR i.bound_reason IN ('used','legacy_equipped'))`);
    await pool.query("UPDATE player_inventory p JOIN item_definitions i ON i.id=p.item_id SET p.personal_bound_quantity=p.quantity,p.trade_bound_quantity=0,p.binding_revision=p.binding_revision+1 WHERE i.is_tradeable=0 OR i.item_category IN ('任务','剧情') OR JSON_EXTRACT(i.effect_json,'$.personalOnly')=true");
    await pool.query("UPDATE player_item_instances p JOIN item_definitions i ON i.id=p.item_id SET p.bound_kind='personal',p.bound_at=COALESCE(p.bound_at,NOW()),p.bound_reason='personal_item' WHERE i.is_tradeable=0 OR i.item_category IN ('任务','剧情') OR JSON_EXTRACT(i.effect_json,'$.personalOnly')=true");
};

export { initializeInventoryBinding };
