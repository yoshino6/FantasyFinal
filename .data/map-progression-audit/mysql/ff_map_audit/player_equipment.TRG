TYPE=TRIGGERS
triggers='CREATE DEFINER=`root`@`localhost` TRIGGER equipment_market_lock_v1 BEFORE INSERT ON player_equipment FOR EACH ROW BEGIN\n    IF EXISTS(SELECT 1 FROM player_item_instances WHERE id=NEW.instance_id AND market_listing_id IS NOT NULL) THEN SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT=\'item is in market escrow\'; END IF;\n  END' 'CREATE DEFINER=`root`@`localhost` TRIGGER equipment_bind_insert_v2 AFTER INSERT ON player_equipment FOR EACH ROW\n      UPDATE player_item_instances SET bound_kind=\'personal\',bound_at=COALESCE(bound_at,NOW()),bound_reason=COALESCE(bound_reason,\'used\') WHERE id=NEW.instance_id' 'CREATE DEFINER=`root`@`localhost` TRIGGER equipment_binding_update_v2 BEFORE UPDATE ON player_equipment FOR EACH ROW BEGIN\n    IF EXISTS(SELECT 1 FROM player_item_instances WHERE id=NEW.instance_id AND market_listing_id IS NOT NULL) THEN SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT=\'item is in market escrow\'; END IF;\n    UPDATE player_item_instances SET bound_kind=\'personal\',bound_at=COALESCE(bound_at,NOW()),bound_reason=COALESCE(bound_reason,\'used\') WHERE id=NEW.instance_id;\n  END'
sql_modes=1436549160 1436549160 1436549160
definers='root@localhost' 'root@localhost' 'root@localhost'
client_cs_names='utf8mb4' 'utf8mb4' 'utf8mb4'
connection_cl_names='utf8mb4_general_ci' 'utf8mb4_general_ci' 'utf8mb4_general_ci'
db_cl_names='utf8mb4_unicode_ci' 'utf8mb4_unicode_ci' 'utf8mb4_unicode_ci'
created=178956591462 178956591432 178956591463
