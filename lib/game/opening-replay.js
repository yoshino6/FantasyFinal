const openingReplay = async (c, id, scope, revision) => {
    const [rows] = await c.execute('SELECT action_key,result_json FROM player_opening_service_actions WHERE character_id=? AND scope=? AND revision=?', [id, scope, revision]);
    if (!rows[0])
        return null;
    return { action: String(rows[0].action_key), result: (typeof rows[0].result_json === 'string' ? JSON.parse(rows[0].result_json) : rows[0].result_json) };
};
const saveOpeningReplay = async (c, id, scope, revision, action, result) => {
    await c.execute('INSERT INTO player_opening_service_actions (character_id,scope,revision,action_key,result_json) VALUES (?,?,?,?,?)', [id, scope, revision, action, JSON.stringify(result)]);
};

export { openingReplay, saveOpeningReplay };
