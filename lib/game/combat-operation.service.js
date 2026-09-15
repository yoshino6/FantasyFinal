import { recordCharacterOperation } from './character-operation.service.js';

const recordPveCombatSettlement = async (connection, sessionId, outcome, sourceRole = 'player') => {
    const [sessions] = await connection.execute('SELECT character_id,mode FROM combat_sessions WHERE id=? LIMIT 1', [sessionId]);
    const session = sessions[0];
    if (!session || session.mode === 'spar' || session.mode === 'story')
        return;
    const [rows] = await connection.execute(`SELECT cm.character_id,c.player_id,c.npc_code FROM combat_members cm JOIN characters c ON c.id=cm.character_id WHERE cm.session_id=? ORDER BY cm.character_id`, [sessionId]);
    const players = rows.filter(row => row.player_id !== null && !row.npc_code);
    if (!players.length)
        return;
    const [targets] = await connection.execute(`SELECT DISTINCT s.template_id,t.name FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=? ORDER BY s.template_id LIMIT 8`, [sessionId]);
    const [testRows] = await connection.execute(`SELECT EXISTS(SELECT 1 FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id WHERE ct.session_id=? AND JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','boss_test'))) AS is_test`, [sessionId]);
    const party = players.length > 1;
    const kind = `combat.pve.${party ? 'party_' : ''}${outcome}`;
    const targetName = targets[0]?.name ?? '未知对手';
    for (const member of players)
        await recordCharacterOperation(connection, {
            characterId: Number(member.character_id), kind,
            source: { system: 'combat_session', id: sessionId, step: 'settled' },
            actorRole: sourceRole === 'player' && (Number(testRows[0]?.is_test) || /test|admin/.test(session.mode)) ? 'admin' : sourceRole,
            outcome: outcome === 'victory' ? '胜利' : outcome === 'defeat' ? '战败' : '撤离',
            summary: `${party ? '队伍' : '野外'}战斗${outcome === 'victory' ? '胜利' : outcome === 'defeat' ? '战败' : '撤离'}：${targetName}`,
            detail: { sessionId, mode: session.mode, participantCount: players.length, targets: targets.map(row => ({ templateId: Number(row.template_id), name: row.name })), contributionVerified: !party },
            scoreKey: targets[0] ? `pve:${targets[0].template_id}` : undefined
        });
};

export { recordPveCombatSettlement };
