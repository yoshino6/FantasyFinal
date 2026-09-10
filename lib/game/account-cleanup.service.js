const removePlayerAccountData = async (connection, qqUserId) => {
    const [players] = await connection.execute('SELECT id FROM players WHERE qq_user_id=? FOR UPDATE', [qqUserId]);
    const player = players[0];
    if (!player)
        throw new Error('当前账号尚未创建游戏数据。');
    const [characters] = await connection.execute('SELECT id,name FROM characters WHERE player_id=? FOR UPDATE', [player.id]);
    const character = characters[0];
    let endedCombats = 0;
    let transferredParties = 0;
    let disbandedParties = 0;
    if (character) {
        const [sessions] = await connection.execute(`SELECT DISTINCT cs.id FROM combat_sessions cs LEFT JOIN combat_members cm ON cm.session_id=cs.id WHERE cs.character_id=? OR cm.character_id=?`, [character.id, character.id]);
        for (const session of sessions) {
            await connection.execute('DELETE FROM combat_automatons WHERE session_id=?', [session.id]);
            await connection.execute('UPDATE player_automatons SET combat_id=NULL WHERE combat_id=?', [session.id]);
            await connection.execute('DELETE FROM combat_sessions WHERE id=?', [session.id]);
            endedCombats++;
        }
        const [ledParties] = await connection.execute('SELECT id FROM parties WHERE leader_character_id=? FOR UPDATE', [character.id]);
        for (const party of ledParties) {
            const [successors] = await connection.execute('SELECT character_id FROM party_members WHERE party_id=? AND character_id<>? ORDER BY joined_at,character_id LIMIT 1 FOR UPDATE', [party.id, character.id]);
            if (successors[0]) {
                await connection.execute('UPDATE parties SET leader_character_id=? WHERE id=?', [successors[0].character_id, party.id]);
                transferredParties++;
            }
            else {
                await connection.execute('DELETE FROM parties WHERE id=?', [party.id]);
                disbandedParties++;
            }
        }
        await connection.execute('DELETE FROM party_members WHERE character_id=?', [character.id]);
        await connection.execute(`DELETE trade FROM market_trades trade
      JOIN market_orders own_order ON own_order.id=trade.buy_order_id OR own_order.id=trade.sell_order_id
      WHERE own_order.character_id=?`, [character.id]);
        await connection.execute('SELECT id FROM player_automatons WHERE holder_id=? OR owner_id=? FOR UPDATE', [character.id, character.id]);
        await connection.execute(`DELETE listing FROM market_instance_listings listing
      LEFT JOIN player_automatons pet ON pet.id=listing.active_automaton_id
      LEFT JOIN player_item_instances item ON item.id=listing.active_instance_id
      WHERE pet.holder_id=? OR pet.owner_id=? OR item.character_id=?`, [character.id, character.id, character.id]);
        await connection.execute(`DELETE feedback FROM automaton_quote_feedback feedback
      LEFT JOIN automaton_dialogues dialogue ON dialogue.id=feedback.dialogue_id
      LEFT JOIN player_automatons pet ON pet.id=dialogue.automaton_id
      WHERE feedback.character_id=? OR pet.holder_id=? OR pet.owner_id=?`, [character.id, character.id, character.id]);
        await connection.execute(`DELETE memory FROM automaton_memories memory
      LEFT JOIN player_automatons pet ON pet.id=memory.automaton_id
      WHERE memory.character_id=? OR pet.holder_id=? OR pet.owner_id=?`, [character.id, character.id, character.id]);
        await connection.execute(`DELETE dialogue FROM automaton_dialogues dialogue JOIN player_automatons pet ON pet.id=dialogue.automaton_id
      WHERE pet.holder_id=? OR pet.owner_id=?`, [character.id, character.id]);
        await connection.execute(`DELETE battle FROM combat_automatons battle LEFT JOIN player_automatons pet ON pet.id=battle.automaton_id
      WHERE battle.owner_id=? OR pet.holder_id=? OR pet.owner_id=?`, [character.id, character.id, character.id]);
        await connection.execute('DELETE FROM automaton_daily WHERE character_id=?', [character.id]);
        await connection.execute('DELETE FROM automaton_proficiency_remainders WHERE character_id=?', [character.id]);
        await connection.execute('DELETE FROM player_automatons WHERE holder_id=? OR owner_id=?', [character.id, character.id]);
        await connection.execute('DELETE FROM characters WHERE id=?', [character.id]);
    }
    await connection.execute('DELETE FROM admin_mail_edits WHERE admin_qq_user_id=?', [qqUserId]);
    await connection.execute('DELETE FROM game_permissions WHERE qq_user_id=?', [qqUserId]);
    await connection.execute('DELETE FROM players WHERE id=?', [player.id]);
    return { characterName: character?.name ?? null, endedCombats, transferredParties, disbandedParties };
};

export { removePlayerAccountData };
