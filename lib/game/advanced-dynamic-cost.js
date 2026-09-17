const contractSpiritBaseMana = (count) => count <= 0 ? 0 : 60 + 60 * Math.min(3, Math.floor(count));
const advancedDynamicMana = async (c, session, id, code, pricedMana) => {
    if (code !== 'summoner_contract_spirit')
        return pricedMana;
    const [rows] = await c.execute('SELECT COUNT(*) AS count FROM combat_spirits WHERE session_id=? AND owner_character_id=? AND current_hp>0', [session, id]);
    const cost = contractSpiritBaseMana(Number(rows[0]?.count));
    if (!cost)
        throw Error('场上没有存活契灵，不消耗资源。');
    return Math.max(1, Math.ceil(pricedMana * cost / 240));
};

export { advancedDynamicMana, contractSpiritBaseMana };
