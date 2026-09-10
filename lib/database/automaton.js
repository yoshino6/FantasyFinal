import { automatonFeeds } from '../game/automaton-feeds.js';

const initializeAutomaton = async (pool) => {
    await pool.query(`CREATE TABLE IF NOT EXISTS automaton_proficiency_remainders (
    character_id BIGINT UNSIGNED NOT NULL, profession_code VARCHAR(32) NOT NULL, budget_units INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY(character_id,profession_code)
  ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS automaton_quote_feedback (
    dialogue_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, character_id BIGINT UNSIGNED NOT NULL, vote TINYINT NOT NULL
  ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS automaton_memories (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,automaton_id BIGINT UNSIGNED NOT NULL,character_id BIGINT UNSIGNED NOT NULL,
    dialogue_id BIGINT UNSIGNED NOT NULL,text_value VARCHAR(512) NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_automaton_memory(automaton_id,dialogue_id),KEY idx_automaton_memories(character_id,automaton_id)
  ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS player_automatons (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, holder_id BIGINT UNSIGNED NOT NULL,
    creator_id BIGINT UNSIGNED NOT NULL, owner_id BIGINT UNSIGNED NULL,
    bound_kind VARCHAR(16) NOT NULL DEFAULT 'none', following TINYINT NOT NULL DEFAULT 0,
    state_json JSON NOT NULL, revision INT UNSIGNED NOT NULL DEFAULT 0,
    recover_at DATETIME NULL, combat_id VARCHAR(64) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_automaton_holder (holder_id), KEY idx_automaton_owner (owner_id,following),
    FOREIGN KEY (holder_id) REFERENCES characters(id), FOREIGN KEY (owner_id) REFERENCES characters(id)
  ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS automaton_portrait_uploads (
    character_id BIGINT UNSIGNED NOT NULL, scope_key CHAR(64) NOT NULL,
    token CHAR(32) NOT NULL, automaton_id BIGINT UNSIGNED NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending', expires_at DATETIME NOT NULL,
    PRIMARY KEY(character_id,scope_key), UNIQUE KEY uk_portrait_token(token),
    FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY(automaton_id) REFERENCES player_automatons(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS automaton_portrait_reviews (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    character_id BIGINT UNSIGNED NOT NULL, automaton_id BIGINT UNSIGNED NOT NULL,
    token CHAR(32) NOT NULL, file_key VARCHAR(40) NOT NULL, width INT UNSIGNED NOT NULL, height INT UNSIGNED NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending', reason VARCHAR(500) NOT NULL DEFAULT '',
    reviewer VARCHAR(64) NULL, reviewed_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_portrait_review_token(token), KEY idx_portrait_review_queue(status,id),
    KEY idx_portrait_review_owner(character_id,automaton_id,id),
    FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY(automaton_id) REFERENCES player_automatons(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS automaton_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, automaton_id BIGINT UNSIGNED NOT NULL,
    character_id BIGINT UNSIGNED NOT NULL, event_key VARCHAR(128) NOT NULL, kind VARCHAR(32) NOT NULL,
    data_json JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_automaton_event (automaton_id,event_key), KEY idx_automaton_events (character_id,id),
    FOREIGN KEY (automaton_id) REFERENCES player_automatons(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
    for (const [source, kind] of [['birth', 'first_met'], ['认主', 'first_met'], ['随行', 'first_follow'], ['battle_start', 'first_battle'], ['victory', 'first_victory']]) {
        await pool.execute(`INSERT IGNORE INTO automaton_events(automaton_id,character_id,event_key,kind,data_json,created_at)
      SELECT e.automaton_id,e.character_id,CONCAT('first:',e.character_id,':',?),?,e.data_json,e.created_at
      FROM automaton_events e JOIN (
        SELECT automaton_id,character_id,MIN(id) first_id FROM automaton_events WHERE kind=? GROUP BY automaton_id,character_id
      ) first_events ON e.id=first_events.first_id`, [kind, kind, source]);
    }
    for (const level of [10, 20, 30, 40, 50])
        await pool.execute(`INSERT IGNORE INTO automaton_events(automaton_id,character_id,event_key,kind,data_json,created_at)
    SELECT e.automaton_id,e.character_id,CONCAT('first:',e.character_id,':breakthrough:',?),'breakthrough',
      JSON_OBJECT('name',JSON_UNQUOTE(JSON_EXTRACT(e.data_json,'$.name')),'level',?),e.created_at
    FROM automaton_events e JOIN (
      SELECT automaton_id,character_id,MIN(id) first_id FROM automaton_events
      WHERE kind='培养' AND JSON_EXTRACT(data_json,'$.previousLevel')<? AND JSON_EXTRACT(data_json,'$.level')>=?
      GROUP BY automaton_id,character_id
    ) first_events ON e.id=first_events.first_id`, [level, level, level, level]);
    await pool.query(`CREATE TABLE IF NOT EXISTS automaton_daily (
    character_id BIGINT UNSIGNED NOT NULL, day_key DATE NOT NULL, interaction TINYINT NOT NULL DEFAULT 0,
    cultivation TINYINT NOT NULL DEFAULT 0, victory TINYINT NOT NULL DEFAULT 0, greeting TINYINT NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id,day_key)
  ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS automaton_dialogues (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, automaton_id BIGINT UNSIGNED NOT NULL,
    event_key VARCHAR(128) NOT NULL, event_type VARCHAR(24) NOT NULL, quote_id VARCHAR(96) NOT NULL,
    text_hash VARCHAR(64) NOT NULL, text_value VARCHAR(512) NOT NULL, sent_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_automaton_dialogue_event (automaton_id,event_key), KEY idx_automaton_dialogue_history (automaton_id,sent_at)
  ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS combat_automatons (
    session_id VARCHAR(64) NOT NULL, automaton_id BIGINT UNSIGNED NOT NULL, owner_id BIGINT UNSIGNED NOT NULL,
    state_json JSON NOT NULL, PRIMARY KEY (session_id,automaton_id), KEY idx_combat_automaton_owner (session_id,owner_id)
  ) ENGINE=InnoDB`);
    const products = [
        { code: 'automaton_body', name: '灵枢素体', category: '构件', price: 3732, description: '解构师四级构造的拟生素体。用于点灵，不能直接认主。' },
        { code: 'pure_soul_trace', name: '纯粹的灵魂痕迹', category: '炼材', price: 1578, description: '炼金师四级制作的固定规格灵魂痕迹。用于机巧点灵。' },
        ...automatonFeeds.map(f => ({ code: `automaton_feed_${f.code}`, name: f.name, category: '育成', price: 187, description: `每瓶提供100机巧培养经验；各属性按材料与性格权重随机成长。${f.name}不直接恢复生命或魔力。` }))
    ];
    for (const p of products)
        await pool.execute(`INSERT INTO item_definitions
    (code,name,description,obtain_source,item_type,item_category,stackable,stack_limit,is_tradeable,trade_price,effect_json)
    VALUES (?,?,?,'四级副职业制造','material',?,1,9999,1,?,?)
    ON DUPLICATE KEY UPDATE description=VALUES(description),effect_json=VALUES(effect_json)`, [p.code, p.name, p.description, p.category, p.price / 2, JSON.stringify({ automatonProduct: true, noNpcSale: true, referencePrice: p.price, feedXp: p.category === '育成' ? 100 : undefined })]);
};

export { initializeAutomaton };
