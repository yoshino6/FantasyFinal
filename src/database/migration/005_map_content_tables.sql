CREATE TABLE IF NOT EXISTS map_monster_pools (
  region_id BIGINT UNSIGNED NOT NULL, monster_template_id BIGINT UNSIGNED NOT NULL, spawn_weight INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (region_id, monster_template_id),
  CONSTRAINT fk_map_monster_pool_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE,
  CONSTRAINT fk_map_monster_pool_template FOREIGN KEY (monster_template_id) REFERENCES monster_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS map_npcs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, region_id BIGINT UNSIGNED NOT NULL, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
  description TEXT NOT NULL, pos_x INT NULL, pos_y INT NULL, pos_z INT NULL,
  PRIMARY KEY (id), UNIQUE KEY uk_map_npc_code (region_id, code),
  CONSTRAINT fk_map_npc_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS map_move_texts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, region_id BIGINT UNSIGNED NOT NULL, description TEXT NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY uk_map_move_text (region_id, description(128)),
  CONSTRAINT fk_map_move_text_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
) ENGINE=InnoDB;
