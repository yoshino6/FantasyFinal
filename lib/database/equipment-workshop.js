const initializeEquipmentWorkshop = async (pool) => {
    await pool.execute(`CREATE TABLE IF NOT EXISTS equipment_workshop_states (
    instance_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, budget_level SMALLINT UNSIGNED NOT NULL,
    failures INT UNSIGNED NOT NULL DEFAULT 0, revision INT UNSIGNED NOT NULL DEFAULT 0,
    layers_json JSON NULL,
    CONSTRAINT fk_workshop_instance FOREIGN KEY(instance_id) REFERENCES player_item_instances(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS equipment_workshop_quotes (
    token CHAR(36) NOT NULL PRIMARY KEY, character_id BIGINT UNSIGNED NOT NULL, instance_id BIGINT UNSIGNED NOT NULL,
    source VARCHAR(32) NOT NULL, mode VARCHAR(16) NOT NULL, snapshot_json JSON NOT NULL, costs_json JSON NOT NULL,
    fee INT UNSIGNED NOT NULL, expires_at DATETIME NOT NULL, result_json JSON NULL,
    KEY idx_workshop_owner(character_id,expires_at),
    CONSTRAINT fk_workshop_quote_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
};

export { initializeEquipmentWorkshop };
