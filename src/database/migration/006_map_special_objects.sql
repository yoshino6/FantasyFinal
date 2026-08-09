CREATE TABLE IF NOT EXISTS map_special_objects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, region_id BIGINT UNSIGNED NOT NULL, code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL,
  description TEXT NOT NULL, pos_x INT NOT NULL, pos_y INT NOT NULL, pos_z INT NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY uk_map_special_object_code (region_id, code), UNIQUE KEY uk_map_special_object_position (region_id, pos_x, pos_y, pos_z),
  CONSTRAINT fk_map_special_object_region FOREIGN KEY (region_id) REFERENCES map_regions(id) ON DELETE CASCADE
) ENGINE=InnoDB;
