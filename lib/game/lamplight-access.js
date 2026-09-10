const assertLamplightRegionAccess = async (c, id, code, partyId) => {
    const match = /^lamplight_wm(0[1-8])$/.exec(code);
    if (!match)
        return;
    const [members] = partyId ? await c.execute('SELECT character_id FROM party_members WHERE party_id=?', [partyId]) : [[{ character_id: id }]];
    for (const member of members) {
        const [rows] = await c.execute('SELECT p.phase,p.node_index,c.level FROM player_lamplight_progress p JOIN characters c ON c.id=p.character_id WHERE p.character_id=?', [member.character_id]);
        const state = rows[0];
        if (!state || Number(state.level) < (match[1] === '01' ? 25 : 30) || state.phase !== 'completed' && (state.phase !== 'world' || Math.floor(Number(state.node_index) / 5) + 1 < Number(match[1])))
            throw Error('同行者尚未取得这一章的公务接驳资格，请先推进本人的灯火主线并达到本章实力要求。');
    }
};

export { assertLamplightRegionAccess };
