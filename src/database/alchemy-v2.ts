import type { Pool } from 'mysql2/promise';

/** 增量结构；不重建旧表，也不回填不存在的试验历史。 */
export const initializeAlchemyV2 = async (pool: Pool) => {
  await pool.query(`CREATE TABLE IF NOT EXISTS secondary_finished_stock (
    shop_code VARCHAR(32) NOT NULL, item_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL DEFAULT 30,
    stock_day DATE NOT NULL, PRIMARY KEY (shop_code,item_id),
    FOREIGN KEY (item_id) REFERENCES item_definitions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS player_craft_requests (
    token VARCHAR(64) NOT NULL PRIMARY KEY, character_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(24) NOT NULL, state VARCHAR(16) NOT NULL DEFAULT 'pending',
    snapshot_json JSON NOT NULL, result_json JSON NULL, expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_craft_request_character (character_id,kind,state),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS player_alchemy_journal (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, character_id BIGINT UNSIGNED NOT NULL,
    request_token VARCHAR(64) NOT NULL, kind VARCHAR(24) NOT NULL, combination_key VARCHAR(128) NOT NULL,
    group_key VARCHAR(64) NOT NULL, snapshot_json JSON NOT NULL, batches_json JSON NOT NULL,
    result_json JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_alchemy_journal_request (request_token), KEY idx_alchemy_journal_character (character_id,id),
    KEY idx_alchemy_journal_combination (character_id,combination_key),
    KEY idx_alchemy_journal_group (character_id,group_key),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS player_alchemy_journal_items (
    journal_id BIGINT UNSIGNED NOT NULL, role VARCHAR(16) NOT NULL, item_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(128) NOT NULL, name VARCHAR(128) NOT NULL, quantity INT UNSIGNED NOT NULL,
    KEY idx_alchemy_journal_item (journal_id,role),
    FOREIGN KEY (journal_id) REFERENCES player_alchemy_journal(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS player_alchemy_stability (
    character_id BIGINT UNSIGNED NOT NULL, group_key VARCHAR(64) NOT NULL, journal_id BIGINT UNSIGNED NOT NULL,
    stats_json JSON NOT NULL, stable TINYINT NOT NULL DEFAULT 0, ever_stable TINYINT NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id,group_key), KEY idx_alchemy_stable (character_id,stable,journal_id),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (journal_id) REFERENCES player_alchemy_journal(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  for (const column of ['main_quantity TINYINT UNSIGNED NOT NULL DEFAULT 1', 'auxiliary_quantity TINYINT UNSIGNED NOT NULL DEFAULT 1', 'reagent_quantity TINYINT UNSIGNED NOT NULL DEFAULT 1']) {
    try { await pool.query(`ALTER TABLE player_alchemy_formulas ADD COLUMN ${column}`); }
    catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  try { await pool.query('ALTER TABLE player_skill_point_ledger ADD COLUMN refund_token VARCHAR(64) NULL'); }
  catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,effect_json,trade_price)
    VALUES ('forge_repair_kit','锻造维修包','战斗外使用，使一件自己的装备恢复全部耐久。','铁匠铺成品货架；个人锻造师制作','consumable','特殊','{"repairKit":true}',0)
    ON DUPLICATE KEY UPDATE description=VALUES(description),obtain_source=VALUES(obtain_source),effect_json=VALUES(effect_json),trade_price=0`);

};
