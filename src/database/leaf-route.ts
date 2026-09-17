import type { Pool } from 'mysql2/promise';
export const initializeLeafRoute = async (pool: Pool) => {
    await pool.query("CREATE TABLE IF NOT EXISTS player_leaf_permits(character_id BIGINT UNSIGNED PRIMARY KEY,source VARCHAR(24) NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB");
    await pool.query("CREATE TABLE IF NOT EXISTS player_leaf_route_progress(character_id BIGINT UNSIGNED PRIMARY KEY,stage INT NOT NULL DEFAULT 1,work INT NOT NULL DEFAULT 0,revision INT NOT NULL DEFAULT 0,level_snapshot INT NOT NULL,experience_snapshot BIGINT NOT NULL,claimed TINYINT NOT NULL DEFAULT 0,FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB");
    await pool.query("CREATE TABLE IF NOT EXISTS player_leaf_route_battles(session_id CHAR(36) PRIMARY KEY,character_id BIGINT UNSIGNED NOT NULL,stage INT NOT NULL,wave INT NOT NULL DEFAULT 0,state VARCHAR(16) NOT NULL DEFAULT 'active',anchor_used TINYINT NOT NULL DEFAULT 0,snapshot_json JSON NOT NULL,FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB");
    await pool.query("CREATE TABLE IF NOT EXISTS leaf_route_migrations(code VARCHAR(64) PRIMARY KEY) ENGINE=InnoDB");
    const c = await pool.getConnection();
    try {
        await c.beginTransaction();
        const [marker] = await c.execute<any>("INSERT IGNORE INTO leaf_route_migrations(code) VALUES ('legacy_access_v1')");
        await c.query("INSERT IGNORE INTO player_leaf_permits(character_id,source) SELECT character_id,'opening_origin' FROM player_opening_stories WHERE route_code='M01' AND destination_code='floating_leaf_town' AND state='completed'");
        if (marker.affectedRows)
            await c.query(`INSERT IGNORE INTO player_leaf_permits(character_id,source)
      SELECT c.id,'legacy_access' FROM characters c WHERE c.current_region_id=(SELECT id FROM map_regions WHERE code='floating_leaf_town')
      OR EXISTS(SELECT 1 FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=c.id AND p.quantity>0 AND i.code='map_floating_leaf_town')
      OR EXISTS(SELECT 1 FROM player_home_storage_items s JOIN player_homes h ON h.id=s.home_id JOIN item_definitions i ON i.id=s.item_id WHERE h.character_id=c.id AND s.quantity>0 AND i.code='map_floating_leaf_town')
      OR EXISTS(SELECT 1 FROM player_main_quest_progress q WHERE q.character_id=c.id AND q.quest_code='floating_leaf_tour' AND q.stage>0)
      OR EXISTS(SELECT 1 FROM player_events e WHERE e.character_id=c.id AND e.event_type LIKE 'travel.%' AND JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.destinationCode'))='floating_leaf_town')`);
        await c.commit();
    }
    catch (e) {
        await c.rollback();
        throw e;
    }
    finally {
        c.release();
    }
};
