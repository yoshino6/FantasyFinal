import { negotiationVersion, drawHiddenAttribute } from '../game/negotiation-rules.js';

const negotiationSchema = [
    `CREATE TABLE IF NOT EXISTS character_hidden_attributes (character_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, luck SMALLINT NOT NULL, charm SMALLINT NOT NULL, version INT NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_neg_hidden_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE, CHECK(luck BETWEEN -100 AND 100), CHECK(charm BETWEEN -100 AND 100)) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS monster_negotiation_lives (spawn_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, state_json JSON NOT NULL, profile_json JSON NOT NULL, drops_json JSON NOT NULL, capacity DECIMAL(24,6) NOT NULL, version INT NOT NULL DEFAULT 1, revision INT UNSIGNED NOT NULL DEFAULT 0, resolved TINYINT NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_neg_life_spawn FOREIGN KEY(spawn_id) REFERENCES monster_spawns(id) ON DELETE CASCADE) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS monster_negotiation_memories (spawn_id BIGINT UNSIGNED NOT NULL, character_id BIGINT UNSIGNED NOT NULL, state_json JSON NOT NULL, combat_failed TINYINT NOT NULL DEFAULT 0, first_failure_at DATETIME NULL, PRIMARY KEY(spawn_id,character_id), CONSTRAINT fk_neg_memory_spawn FOREIGN KEY(spawn_id) REFERENCES monster_spawns(id) ON DELETE CASCADE, CONSTRAINT fk_neg_memory_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS negotiation_sessions (id CHAR(36) NOT NULL PRIMARY KEY, spawn_id BIGINT UNSIGNED NOT NULL, owner_id BIGINT UNSIGNED NOT NULL, battle_id CHAR(36) NULL, state VARCHAR(20) NOT NULL DEFAULT 'active', revision INT UNSIGNED NOT NULL DEFAULT 0, members_json JSON NOT NULL, stamina_json JSON NOT NULL, last_text TEXT NOT NULL, last_key VARCHAR(255) NOT NULL DEFAULT '', expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_neg_spawn(spawn_id,state), KEY idx_neg_expiry(state,expires_at), CONSTRAINT fk_neg_session_spawn FOREIGN KEY(spawn_id) REFERENCES monster_spawns(id) ON DELETE CASCADE) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS negotiation_participants (character_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, session_id CHAR(36) NOT NULL, CONSTRAINT fk_neg_participant_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE, CONSTRAINT fk_neg_participant_session FOREIGN KEY(session_id) REFERENCES negotiation_sessions(id) ON DELETE CASCADE) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS negotiation_actions (session_id CHAR(36) NOT NULL, revision INT UNSIGNED NOT NULL, actor_id BIGINT UNSIGNED NOT NULL, request_key VARCHAR(128) NOT NULL, result_json JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(session_id,revision), UNIQUE KEY uk_neg_action_request(session_id,request_key), CONSTRAINT fk_neg_action_session FOREIGN KEY(session_id) REFERENCES negotiation_sessions(id) ON DELETE CASCADE) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS monster_reward_settlements (spawn_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, channel VARCHAR(20) NOT NULL, session_id CHAR(36) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_neg_reward_spawn FOREIGN KEY(spawn_id) REFERENCES monster_spawns(id) ON DELETE CASCADE) ENGINE=InnoDB`
];
const initializeNegotiation = async (pool) => {
    for (const sql of negotiationSchema)
        await pool.query(sql);
    await closeLegacyCombatNegotiations(pool);
    let after = 0;
    for (;;) {
        const [rows] = await pool.execute('SELECT c.id FROM characters c LEFT JOIN character_hidden_attributes h ON h.character_id=c.id WHERE c.id>? AND c.npc_code IS NULL AND h.character_id IS NULL ORDER BY c.id LIMIT 200', [after]);
        if (!rows.length)
            break;
        for (const row of rows)
            await pool.execute('INSERT IGNORE INTO character_hidden_attributes (character_id,luck,charm,version) VALUES (?,?,?,?)', [row.id, drawHiddenAttribute(), drawHiddenAttribute(), negotiationVersion]);
        after = Number(rows[rows.length - 1].id);
    }
};
const closeLegacyCombatNegotiations = async (pool) => {
    await pool.execute("UPDATE negotiation_sessions SET state='closed' WHERE battle_id IS NOT NULL AND state IN ('active','preview')");
    await pool.execute("DELETE p FROM negotiation_participants p JOIN negotiation_sessions n ON n.id=p.session_id WHERE n.battle_id IS NOT NULL AND n.state='closed'");
};

export { closeLegacyCombatNegotiations, initializeNegotiation, negotiationSchema };
