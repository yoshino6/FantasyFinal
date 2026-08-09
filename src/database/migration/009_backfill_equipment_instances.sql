-- 兼容旧存档：已装备的神器/装备补建装备实例，供背包装备页读取。
INSERT INTO player_item_instances (character_id, item_id, quality, durability, durability_max)
SELECT equipment.character_id, equipment.item_id, 100, 100, 100
FROM player_equipment equipment
INNER JOIN item_definitions item ON item.id = equipment.item_id AND item.item_type = 'equipment'
WHERE NOT EXISTS (
  SELECT 1
  FROM player_item_instances instance
  WHERE instance.character_id = equipment.character_id
    AND instance.item_id = equipment.item_id
);
