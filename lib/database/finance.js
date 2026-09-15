import { financeFactions } from '../game/finance-content.js';

const initializeFinance = async (pool) => {
    const statements = [
        `CREATE TABLE IF NOT EXISTS finance_bank_accounts (
      character_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      demand_copper BIGINT UNSIGNED NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_finance_bank_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_pools (
      code VARCHAR(32) NOT NULL PRIMARY KEY,
      copper BIGINT UNSIGNED NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_npc_portfolio (
      instrument_code VARCHAR(48) NOT NULL PRIMARY KEY,
      shares INT UNSIGNED NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_finance_npc_instrument FOREIGN KEY (instrument_code) REFERENCES finance_instruments(code)
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_ledger (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      character_id BIGINT UNSIGNED NULL,
      event_key VARCHAR(128) NOT NULL,
      kind VARCHAR(32) NOT NULL,
      source_account VARCHAR(64) NOT NULL,
      target_account VARCHAR(64) NOT NULL,
      copper BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_finance_ledger_event (event_key),
      KEY idx_finance_ledger_character (character_id,id),
      CONSTRAINT fk_finance_ledger_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_bank_deposits (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      character_id BIGINT UNSIGNED NOT NULL,
      product_code ENUM('seven','thirty','hundred') NOT NULL,
      principal_copper BIGINT UNSIGNED NOT NULL,
      reserved_interest_copper BIGINT UNSIGNED NOT NULL DEFAULT 0,
      opened_ms BIGINT UNSIGNED NOT NULL,
      matures_ms BIGINT UNSIGNED NOT NULL,
      status ENUM('open','matured','early') NOT NULL DEFAULT 'open',
      settled_ms BIGINT UNSIGNED NULL,
      KEY idx_finance_deposit_due (status,matures_ms),
      KEY idx_finance_deposit_owner (character_id,status),
      CONSTRAINT fk_finance_deposit_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_instruments (
      code VARCHAR(48) NOT NULL PRIMARY KEY,
      name VARCHAR(64) NOT NULL,
      share_name VARCHAR(64) NOT NULL,
      total_shares INT UNSIGNED NOT NULL,
      treasury_shares INT UNSIGNED NOT NULL,
      price_milli BIGINT UNSIGNED NOT NULL,
      status ENUM('open','watch','halted') NOT NULL DEFAULT 'watch',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_holdings (
      character_id BIGINT UNSIGNED NOT NULL,
      instrument_code VARCHAR(48) NOT NULL,
      shares INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (character_id,instrument_code),
      CONSTRAINT fk_finance_holding_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      CONSTRAINT fk_finance_holding_instrument FOREIGN KEY (instrument_code) REFERENCES finance_instruments(code)
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_trades (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      character_id BIGINT UNSIGNED NULL,
      actor_kind ENUM('player','npc') NOT NULL DEFAULT 'player',
      instrument_code VARCHAR(48) NOT NULL,
      side ENUM('buy','sell') NOT NULL,
      shares INT UNSIGNED NOT NULL,
      unit_copper BIGINT UNSIGNED NOT NULL,
      gross_copper BIGINT UNSIGNED NOT NULL,
      fee_copper BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_finance_trade_character (character_id,id),
      CONSTRAINT fk_finance_trade_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL,
      CONSTRAINT fk_finance_trade_instrument FOREIGN KEY (instrument_code) REFERENCES finance_instruments(code)
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_price_history (
      instrument_code VARCHAR(48) NOT NULL,
      period_key CHAR(10) NOT NULL,
      price_milli BIGINT UNSIGNED NOT NULL,
      previous_price_milli BIGINT UNSIGNED NOT NULL DEFAULT 0,
      factors_text VARCHAR(512) NOT NULL DEFAULT '',
      score SMALLINT NOT NULL DEFAULT 0,
      PRIMARY KEY (instrument_code,period_key),
      CONSTRAINT fk_finance_price_instrument FOREIGN KEY (instrument_code) REFERENCES finance_instruments(code)
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_missions (
      business_date CHAR(8) NOT NULL,
      instrument_code VARCHAR(48) NOT NULL,
      title VARCHAR(96) NOT NULL,
      source_type VARCHAR(32) NOT NULL,
      status ENUM('available','unavailable') NOT NULL,
      completed_count INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (business_date,instrument_code),
      CONSTRAINT fk_finance_mission_instrument FOREIGN KEY (instrument_code) REFERENCES finance_instruments(code)
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_mission_completions (
      business_date CHAR(8) NOT NULL,
      instrument_code VARCHAR(48) NOT NULL,
      character_id BIGINT UNSIGNED NOT NULL,
      source_key VARCHAR(100) NOT NULL,
      PRIMARY KEY (business_date,instrument_code,character_id),
      UNIQUE KEY uk_finance_mission_source (instrument_code,source_key),
      CONSTRAINT fk_finance_mission_completion_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_mission_acceptances (
      business_date CHAR(8) NOT NULL,
      instrument_code VARCHAR(48) NOT NULL,
      character_id BIGINT UNSIGNED NOT NULL,
      accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (business_date,instrument_code,character_id),
      CONSTRAINT fk_finance_acceptance_instrument FOREIGN KEY (instrument_code) REFERENCES finance_instruments(code),
      CONSTRAINT fk_finance_acceptance_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_signals (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      source_key VARCHAR(100) NOT NULL,
      instrument_code VARCHAR(48) NOT NULL,
      character_id BIGINT UNSIGNED NULL,
      business_date CHAR(8) NOT NULL,
      period_key CHAR(10) NOT NULL,
      event_type VARCHAR(48) NOT NULL,
      source_type VARCHAR(32) NULL,
      score SMALLINT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_finance_signal_source (source_key,instrument_code),
      KEY idx_finance_signal_period (period_key,instrument_code),
      CONSTRAINT fk_finance_signal_instrument FOREIGN KEY (instrument_code) REFERENCES finance_instruments(code),
      CONSTRAINT fk_finance_signal_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_news (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      period_key CHAR(10) NOT NULL,
      instrument_code VARCHAR(48) NOT NULL,
      direction TINYINT NOT NULL,
      scenario_no TINYINT UNSIGNED NOT NULL,
      outcome ENUM('fulfilled','reversed') NOT NULL,
      price_status ENUM('pending','matched','blocked') NOT NULL DEFAULT 'pending',
      price_reason VARCHAR(96) NOT NULL DEFAULT '',
      UNIQUE KEY uk_finance_news_period (period_key,instrument_code),
      CONSTRAINT fk_finance_news_instrument FOREIGN KEY (instrument_code) REFERENCES finance_instruments(code)
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_news_heard (
      character_id BIGINT UNSIGNED NOT NULL,
      period_key CHAR(10) NOT NULL,
      news_id BIGINT UNSIGNED NULL,
      PRIMARY KEY (character_id,period_key),
      CONSTRAINT fk_finance_heard_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      CONSTRAINT fk_finance_heard_news FOREIGN KEY (news_id) REFERENCES finance_news(id) ON DELETE SET NULL
    ) ENGINE=InnoDB`,
        `CREATE TABLE IF NOT EXISTS finance_jobs (
      job_key VARCHAR(60) NOT NULL PRIMARY KEY,
      completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`
    ];
    const npcPortfolioStatement = statements.splice(2, 1)[0];
    for (const statement of statements)
        await pool.query(statement);
    await pool.query(npcPortfolioStatement);
    for (const column of [
        "previous_price_milli BIGINT UNSIGNED NOT NULL DEFAULT 0",
        "factors_text VARCHAR(512) NOT NULL DEFAULT ''"
    ])
        try {
            await pool.query(`ALTER TABLE finance_price_history ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    try {
        await pool.query('ALTER TABLE finance_signals ADD COLUMN source_type VARCHAR(32) NULL');
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    try {
        await pool.query("ALTER TABLE finance_trades ADD COLUMN actor_kind ENUM('player','npc') NOT NULL DEFAULT 'player'");
    }
    catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME')
            throw error;
    }
    for (const column of ["price_status ENUM('pending','matched','blocked') NOT NULL DEFAULT 'pending'", "price_reason VARCHAR(96) NOT NULL DEFAULT ''"])
        try {
            await pool.query(`ALTER TABLE finance_news ADD COLUMN ${column}`);
        }
        catch (error) {
            if (error?.code !== 'ER_DUP_FIELDNAME')
                throw error;
        }
    await pool.query(`CREATE TABLE IF NOT EXISTS finance_daily_anchors (
    business_date CHAR(8) NOT NULL,
    instrument_code VARCHAR(48) NOT NULL,
    price_milli BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (business_date,instrument_code),
    CONSTRAINT fk_finance_daily_anchor_instrument FOREIGN KEY (instrument_code) REFERENCES finance_instruments(code)
  ) ENGINE=InnoDB`);
    await pool.query("INSERT IGNORE INTO finance_pools (code,copper) VALUES ('clearing',0),('interest',0),('fees_burned',0),('signal_gate',0)");
    const capitalConnection = await pool.getConnection();
    try {
        await capitalConnection.beginTransaction();
        const [npcCapital] = await capitalConnection.query("INSERT IGNORE INTO finance_pools (code,copper) VALUES ('npc_capital',12000000)");
        if (npcCapital.affectedRows)
            await capitalConnection.execute(`INSERT INTO finance_ledger
      (character_id,event_key,kind,source_account,target_account,copper)
      VALUES (NULL,'npc-capital:seed-v1','npc_endowment','world:npc_capital','pool:npc_capital',12000000)`);
        await capitalConnection.commit();
    }
    catch (error) {
        await capitalConnection.rollback();
        throw error;
    }
    finally {
        capitalConnection.release();
    }
    for (const faction of financeFactions) {
        await pool.execute(`INSERT INTO finance_instruments (code,name,share_name,total_shares,treasury_shares,price_milli,status)
      VALUES (?,?,?,10000,10000,100000,?) ON DUPLICATE KEY UPDATE name=VALUES(name),share_name=VALUES(share_name)`, [faction.code, faction.name, faction.share, faction.status]);
        await pool.execute('INSERT IGNORE INTO finance_npc_portfolio (instrument_code,shares) VALUES (?,0)', [faction.code]);
    }
    const [safeRegions] = await pool.execute(`SELECT id,code,min_x,max_x,min_y,max_y,min_z FROM map_regions
    WHERE is_spawn_enabled=0 AND is_owner_only=0 AND is_enabled=1 AND (danger_level<=2 OR code='baina_town')`);
    const buildings = safeRegions.map(region => ({
        region: String(region.code), code: 'silver_bell_bank', name: '银铃钱庄分所', description: '银铃钱庄各地分所共用一套总账，可存取银币并查阅存单。'
    }));
    buildings.push({ region: 'world_tree', code: 'worldtree_council', name: '世界树议会办事处', description: '守树人把各地修复与生态委托汇到这里。' }, { region: 'baina_town', code: 'rediron_office', name: '赤铁驿路同盟联络处', description: '驿路同盟在百纳镇的联络处，收集沿途委托和车队消息。' }, { region: 'baina_town', code: 'ferry_office', name: '雾海摆渡同盟联络处', description: '摆渡同盟的百纳联络处，记录航道与救援委托。' });
    for (const building of buildings) {
        const region = safeRegions.find(row => row.code === building.region);
        if (!region)
            continue;
        const [existing] = await pool.execute('SELECT id FROM map_npcs WHERE region_id=? AND code=? LIMIT 1', [region.id, building.code]);
        if (existing.length)
            continue;
        const z = Number(region.min_z);
        const [occupied] = await pool.execute('SELECT pos_x,pos_y FROM map_npcs WHERE region_id=? AND pos_z=? UNION SELECT pos_x,pos_y FROM map_special_objects WHERE region_id=? AND pos_z=?', [region.id, z, region.id, z]);
        const taken = new Set(occupied.map(row => `${row.pos_x},${row.pos_y}`));
        let location = null;
        const minX = Number(region.min_x), maxX = Number(region.max_x), minY = Number(region.min_y), maxY = Number(region.max_y);
        const midX = Math.floor((minX + maxX) / 2), midY = Math.floor((minY + maxY) / 2);
        for (let radius = 1; radius <= 6 && !location; radius++) {
            for (let dy = -radius; dy <= radius && !location; dy++)
                for (let dx = -radius; dx <= radius; dx++) {
                    const x = midX + dx, y = midY + dy;
                    if (x < minX || x > maxX || y < minY || y > maxY || taken.has(`${x},${y}`))
                        continue;
                    location = [x, y];
                    break;
                }
        }
        if (!location)
            throw new Error(`${building.region}没有可供${building.name}使用的安全格。`);
        await pool.execute(`INSERT INTO map_npcs (region_id,code,name,description,interaction_kind,pos_x,pos_y,pos_z)
      VALUES (?,?,?,?,'building',?,?,?)`, [region.id, building.code, building.name, building.description, location[0], location[1], z]);
    }
};

export { initializeFinance };
