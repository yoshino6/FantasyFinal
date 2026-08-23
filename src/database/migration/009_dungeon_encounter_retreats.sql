CREATE TABLE IF NOT EXISTS dungeon_encounter_retreats (
  character_id BIGINT UNSIGNED NOT NULL,
  encounter_region_id BIGINT UNSIGNED NOT NULL,
  encounter_x INT NOT NULL,
  encounter_y INT NOT NULL,
  encounter_z INT NOT NULL,
  retreat_region_id BIGINT UNSIGNED NOT NULL,
  retreat_x INT NOT NULL,
  retreat_y INT NOT NULL,
  retreat_z INT NOT NULL,
  PRIMARY KEY (character_id),
  CONSTRAINT fk_dungeon_retreat_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB;
