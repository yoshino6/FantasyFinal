import { getPool, withTransaction } from '../database/pool.js';
import { removePlayerAccountData } from './account-cleanup.service.js';

class AccountRestoreConflictError extends Error {
    constructor() { super('该玩家已重新创建账号，无法直接覆盖；请先处理当前账号数据。'); }
}
const excludedTables = new Set([
    'account_deletion_records', 'registration_sessions', 'parties', 'party_members',
    'combat_sessions', 'combat_members', 'combat_targets', 'combat_threat', 'combat_status_effects', 'combat_automatons', 'automaton_portrait_uploads',
    'player_pvp_attack_confirmations', 'player_pvp_attack_logs', 'player_pvp_battle_logs', 'player_pvp_battle_sessions', 'player_pvp_auto_battle_settings', 'player_pvp_auto_battle_actions', 'player_pvp_auto_battle_quick_setup',
    'player_warrants', 'player_warrant_victims', 'player_warrant_rewards', 'pvp_stolen_loot', 'player_city_debts', 'city_pursuit_tracks', 'city_pursuit_cooldowns',
    'player_home_visits', 'player_resource_mining', 'player_forge_sessions', 'player_alchemy_sessions'
]);
const identifier = (value) => `\`${value.replaceAll('`', '``')}\``;
const snapshotValue = (value) => {
    if (value instanceof Date)
        return value.toISOString();
    if (Buffer.isBuffer(value))
        return { type: 'buffer', data: value.toString('base64') };
    return value;
};
const databaseValue = (value, temporal = false) => {
    if (temporal && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
        return new Date(value);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const buffer = value;
        if (buffer.type === 'buffer' && typeof buffer.data === 'string')
            return Buffer.from(buffer.data, 'base64');
        return JSON.stringify(value);
    }
    return value;
};
const foreignKeys = async (connection) => {
    const [rows] = await connection.query(`SELECT TABLE_NAME AS tableName,COLUMN_NAME AS columnName,REFERENCED_TABLE_NAME AS referencedTable,REFERENCED_COLUMN_NAME AS referencedColumn
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`);
    const logical = [
        ...['automaton_daily', 'automaton_proficiency_remainders', 'automaton_memories', 'automaton_quote_feedback'].map(tableName => ({ tableName, columnName: 'character_id', referencedTable: 'characters', referencedColumn: 'id' })),
        ...['automaton_dialogues', 'automaton_memories'].map(tableName => ({ tableName, columnName: 'automaton_id', referencedTable: 'player_automatons', referencedColumn: 'id' })),
        { tableName: 'automaton_quote_feedback', columnName: 'dialogue_id', referencedTable: 'automaton_dialogues', referencedColumn: 'id' }
    ];
    return [...rows, ...logical].filter(row => !excludedTables.has(row.tableName) && !excludedTables.has(row.referencedTable));
};
const readRows = async (connection, table, column, values) => {
    if (!values.length)
        return [];
    const placeholders = values.map(() => '?').join(',');
    const [rows] = await connection.query(`SELECT * FROM ${identifier(table)} WHERE ${identifier(column)} IN (${placeholders}) FOR UPDATE`, values);
    return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, snapshotValue(value)])));
};
const tableOrder = (tables, keys) => {
    const names = new Set(Object.keys(tables));
    const outgoing = new Map();
    const indegree = new Map();
    for (const name of names) {
        outgoing.set(name, new Set());
        indegree.set(name, 0);
    }
    for (const key of keys) {
        if (!names.has(key.tableName) || !names.has(key.referencedTable) || key.tableName === key.referencedTable)
            continue;
        const children = outgoing.get(key.referencedTable);
        if (!children.has(key.tableName)) {
            children.add(key.tableName);
            indegree.set(key.tableName, (indegree.get(key.tableName) ?? 0) + 1);
        }
    }
    const ready = [...names].filter(name => !indegree.get(name)).sort();
    const ordered = [];
    while (ready.length) {
        const name = ready.shift();
        ordered.push(name);
        for (const child of outgoing.get(name) ?? []) {
            indegree.set(child, (indegree.get(child) ?? 1) - 1);
            if (!indegree.get(child))
                ready.push(child);
        }
        ready.sort();
    }
    return [...ordered, ...[...names].filter(name => !ordered.includes(name)).sort()];
};
const archiveDeletedAccount = async (connection, qqUserId) => {
    const [playerRows] = await connection.query('SELECT * FROM players WHERE qq_user_id=? FOR UPDATE', [qqUserId]);
    const player = playerRows[0];
    if (!player)
        throw new Error('当前账号尚未创建游戏数据。');
    const [characterRows] = await connection.query('SELECT * FROM characters WHERE player_id=? FOR UPDATE', [player.id]);
    const character = characterRows[0];
    const tables = {
        players: [Object.fromEntries(Object.entries(player).map(([key, value]) => [key, snapshotValue(value)]))],
        ...(character ? { characters: [Object.fromEntries(Object.entries(character).map(([key, value]) => [key, snapshotValue(value)]))] } : {})
    };
    const seen = new Map();
    for (const [name, rows] of Object.entries(tables))
        seen.set(name, new Set(rows.map(row => JSON.stringify(row))));
    const keys = await foreignKeys(connection);
    let changed = true;
    while (changed) {
        changed = false;
        for (const key of keys) {
            const parentRows = tables[key.referencedTable] ?? [];
            const values = [...new Set(parentRows.map(row => row[key.referencedColumn]).filter(value => value !== null && value !== undefined))];
            if (!values.length)
                continue;
            const rows = await readRows(connection, key.tableName, key.columnName, values);
            if (!rows.length)
                continue;
            const target = tables[key.tableName] ?? (tables[key.tableName] = []);
            const targetSeen = seen.get(key.tableName) ?? new Set();
            seen.set(key.tableName, targetSeen);
            for (const row of rows) {
                const serialized = JSON.stringify(row);
                if (!targetSeen.has(serialized)) {
                    targetSeen.add(serialized);
                    target.push(row);
                    changed = true;
                }
            }
        }
    }
    const snapshot = { version: 1, tableOrder: tableOrder(tables, keys), tables };
    await connection.execute('INSERT INTO account_deletion_records (qq_user_id,qq_nickname,character_name,snapshot_json) VALUES (?,?,?,?)', [qqUserId, player.qq_nickname ?? null, character?.name ?? null, JSON.stringify(snapshot)]);
};
const accountDeletionRecords = async (filter = {}) => {
    const pool = await getPool();
    const page = Math.max(1, Number(filter.page ?? 1));
    const keyword = String(filter.keyword ?? '').trim();
    const value = String(filter.value ?? '').trim();
    const where = [];
    const values = [];
    if (keyword) {
        where.push('(qq_user_id LIKE ? OR qq_nickname LIKE ? OR character_name LIKE ?)');
        values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (filter.filter === '玩家' && value) {
        where.push('(qq_user_id=? OR qq_nickname LIKE ? OR character_name LIKE ?)');
        values.push(value, `%${value}%`, `%${value}%`);
    }
    if (filter.filter === '状态' && value)
        where.push(value === '已恢复' ? 'restored_at IS NOT NULL' : 'restored_at IS NULL');
    if (filter.filter === '时间' && value) {
        where.push('DATE(deleted_at)=?');
        values.push(value);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM account_deletion_records ${clause}`, values);
    const total = Number(countRows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / 10));
    const currentPage = Math.min(page, totalPages);
    const [rows] = await pool.query(`SELECT id,qq_user_id,qq_nickname,character_name,deleted_at,restored_at,restored_by_qq_user_id,snapshot_json FROM account_deletion_records ${clause} ORDER BY deleted_at DESC,id DESC LIMIT 10 OFFSET ?`, [...values, (currentPage - 1) * 10]);
    return { page: currentPage, totalPages, total, filter: filter.filter, value, keyword, entries: rows.map(row => ({ id: Number(row.id), qqUserId: row.qq_user_id, qqNickname: row.qq_nickname, characterName: row.character_name, deletedAt: row.deleted_at, restoredAt: row.restored_at, restoredByQqUserId: row.restored_by_qq_user_id })) };
};
const snapshotFrom = (value) => {
    const snapshot = typeof value === 'string' ? JSON.parse(value) : value;
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.tableOrder) || !snapshot.tables || typeof snapshot.tables !== 'object')
        throw new Error('该注销记录的数据格式无效，无法恢复。');
    return snapshot;
};
const restoreDeletedAccount = async (recordId, operatorQqUserId, overwrite = false) => withTransaction(async (connection) => {
    const [recordRows] = await connection.query('SELECT * FROM account_deletion_records WHERE id=? FOR UPDATE', [recordId]);
    const record = recordRows[0];
    if (!record)
        throw new Error('未找到该注销记录。');
    if (record.restored_at)
        throw new Error('该注销记录已经恢复过了。');
    const [currentPlayers] = await connection.query('SELECT id FROM players WHERE qq_user_id=? FOR UPDATE', [record.qq_user_id]);
    if (currentPlayers[0]) {
        if (!overwrite)
            throw new AccountRestoreConflictError();
        await archiveDeletedAccount(connection, record.qq_user_id);
        await removePlayerAccountData(connection, record.qq_user_id);
    }
    const snapshot = snapshotFrom(record.snapshot_json);
    for (const table of snapshot.tableOrder) {
        if (excludedTables.has(table))
            continue;
        const rows = snapshot.tables[table];
        if (!Array.isArray(rows))
            throw new Error('注销记录包含无效数据。');
        const [columnTypes] = await connection.query('SELECT COLUMN_NAME,DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table]);
        const temporalColumns = new Set(columnTypes.filter(column => ['date', 'datetime', 'timestamp'].includes(column.DATA_TYPE)).map(column => column.COLUMN_NAME));
        for (const row of rows) {
            const columns = Object.keys(row);
            if (!columns.length)
                continue;
            const sql = `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
            await connection.execute(sql, columns.map(column => table === 'player_automatons' && column === 'combat_id' ? null : databaseValue(row[column], temporalColumns.has(column))));
        }
    }
    await connection.execute('UPDATE account_deletion_records SET restored_at=NOW(),restored_by_qq_user_id=? WHERE id=?', [operatorQqUserId, record.id]);
    return { qqUserId: record.qq_user_id, characterName: record.character_name ?? '未命名角色' };
});

export { AccountRestoreConflictError, accountDeletionRecords, archiveDeletedAccount, restoreDeletedAccount };
