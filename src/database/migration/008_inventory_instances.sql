ALTER TABLE item_definitions ADD COLUMN item_category VARCHAR(32) NOT NULL DEFAULT '特殊', ADD COLUMN stackable TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE player_inventory ADD COLUMN acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE player_item_instances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL,
  quality DECIMAL(5,2) NOT NULL DEFAULT 100.00, durability INT UNSIGNED NOT NULL DEFAULT 100, durability_max INT UNSIGNED NOT NULL DEFAULT 100,
  effect_json JSON NULL, forge_primary_json JSON NULL, acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY idx_item_instance_character_acquired (character_id, acquired_at),
  CONSTRAINT fk_item_instance_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_instance_definition FOREIGN KEY (item_id) REFERENCES item_definitions(id)
) ENGINE=InnoDB;
