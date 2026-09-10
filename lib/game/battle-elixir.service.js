const applyBattleElixir = async (connection, id, effect) => {
    const experience = Number(effect.experienceBonusPct ?? 0) > 0;
    const value = Number(experience ? effect.experienceBonusPct : effect.partyDropBonusPct);
    if (!Number.isFinite(value) || value <= 0)
        throw new Error('秘药效果无效。');
    const count = Math.max(1, Math.floor(Number(effect.battleCount ?? 1)));
    const prefix = experience ? 'alchemy_exp_' : 'alchemy_drop_';
    const legacy = experience ? 'minor_experience_elixir' : 'minor_luck_elixir';
    const [rows] = await connection.execute('SELECT buff_code,remaining_battles FROM player_battle_buffs WHERE character_id=? AND (buff_code LIKE ? OR buff_code=?) FOR UPDATE', [id, prefix + '%', legacy]);
    const active = rows.filter(row => Number(row.remaining_battles) > 0);
    const strength = (row) => row.buff_code === legacy ? 25 : Number(String(row.buff_code).slice(prefix.length));
    if (active.some(row => strength(row) > value))
        return { consumed: false, message: '已有更强的同类秘药效果，未消耗道具。' };
    if (active.some(row => strength(row) === value && Number(row.remaining_battles) >= count))
        return { consumed: false, message: '同类秘药效果与剩余场次已足够，未消耗道具。' };
    await connection.execute('DELETE FROM player_battle_buffs WHERE character_id=? AND (buff_code LIKE ? OR buff_code=?)', [id, prefix + '%', legacy]);
    await connection.execute('INSERT INTO player_battle_buffs (character_id,buff_code,remaining_battles) VALUES (?,?,?)', [id, prefix + value, count]);
    return { consumed: true, message: `${experience ? '经验获取' : '全队材料掉率'}+${value}%，接下来 ${count} 场战斗生效。同类秘药取强，不叠加。` };
};

export { applyBattleElixir };
