ALTER TABLE characters
  ADD COLUMN gender VARCHAR(8) NOT NULL DEFAULT '未设定' AFTER name,
  ADD COLUMN free_name_change_used TINYINT(1) NOT NULL DEFAULT 0 AFTER gender,
  ADD COLUMN free_gender_change_used TINYINT(1) NOT NULL DEFAULT 0 AFTER free_name_change_used;

INSERT INTO item_definitions (code, name, description, item_type, weight, effect_json) VALUES
  ('rename_card', '改名卡', '用于再次修改角色昵称。首次改名免费，此后每次改名消耗一张。', 'consumable', 0.01, JSON_OBJECT('characterChange','name')),
  ('gender_change_card', '改性卡', '用于再次修改角色性别。首次改性免费，此后每次改性消耗一张。', 'consumable', 0.01, JSON_OBJECT('characterChange','gender'))
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), effect_json=VALUES(effect_json);
