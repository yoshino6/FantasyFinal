TYPE=TRIGGERS
triggers='CREATE DEFINER=`root`@`localhost` TRIGGER storage_market_lock_v1 BEFORE INSERT ON player_home_storage_instances FOR EACH ROW BEGIN\n    IF EXISTS(SELECT 1 FROM player_item_instances WHERE id=NEW.instance_id AND market_listing_id IS NOT NULL) THEN SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT=\'item is in market escrow\'; END IF;\n  END'
sql_modes=1436549160
definers='root@localhost'
client_cs_names='utf8mb4'
connection_cl_names='utf8mb4_general_ci'
db_cl_names='utf8mb4_unicode_ci'
created=178956591463
