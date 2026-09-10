const hasDivine = async (connection, id, code) => {
    const [rows] = await connection.execute('SELECT 1 FROM player_blessings WHERE character_id=? AND code=? LIMIT 1', [id, code]);
    return rows.length > 0;
};
const divineUses = async (connection, id, code) => {
    const [rows] = await connection.execute('SELECT used FROM player_divine_daily WHERE character_id=? AND code=? AND day_key=CURRENT_DATE()', [id, code]);
    return Number(rows[0]?.used ?? 0);
};
const spendDivineUse = async (connection, id, code, limit = 1, amount = 1) => {
    if (!Number.isSafeInteger(amount) || amount <= 0)
        throw new Error('天赋次数无效。');
    await connection.execute('INSERT IGNORE INTO player_divine_daily (character_id,code,day_key,used) VALUES (?,?,CURRENT_DATE(),0)', [id, code]);
    const [result] = await connection.execute('UPDATE player_divine_daily SET used=used+? WHERE character_id=? AND code=? AND day_key=CURRENT_DATE() AND used+?<=?', [amount, id, code, amount, limit]);
    return Boolean(result.affectedRows);
};
const divineFoodSeconds = async (connection, id, seconds, sharedFactor = 1) => Math.max(0, Math.floor(seconds * Math.max(sharedFactor, await hasDivine(connection, id, 'talent_production_03') ? 3 : 1)));
const openingShopQuote = async (connection, id, item, quantity) => {
    const base = Number(item.buy_price) * quantity;
    const eligible = item.item_type === 'consumable' && ['药剂', '食物'].includes(item.item_category) && (!item.rarity || item.rarity === '普通') && (item.personalBoundOnly || Number(item.trade_price) < Math.ceil(Number(item.buy_price) * .5));
    if (!eligible)
        return { base, price: base, credit: 0, discount: 0 };
    const [credits] = await connection.execute("SELECT uses FROM player_opening_services WHERE character_id=? AND code='supplies'", [id]);
    const credit = Math.min(base, Number(credits[0]?.uses ?? 0));
    if (credit)
        return { base, price: base - credit, credit, discount: 0 };
    const discount = await hasDivine(connection, id, 'talent_production_05') ? Math.max(0, Math.min(5000 - await divineUses(connection, id, 'g10_discount'), base - Math.ceil(base * .5))) : 0;
    return { base, price: base - discount, credit: 0, discount };
};
const payOpeningShopDiscount = async (connection, id, quote) => {
    if (quote.credit) {
        const [result] = await connection.execute("UPDATE player_opening_services SET uses=uses-? WHERE character_id=? AND code='supplies' AND uses>=?", [quote.credit, id, quote.credit]);
        if (!result.affectedRows)
            throw new Error('补给额度已变化，请重新查看价格。');
    }
    if (quote.discount && !await spendDivineUse(connection, id, 'g10_discount', 5000, quote.discount))
        throw new Error('今日折扣额度已变化，请重新查看价格。');
};
const divineFoodValues = async (connection, id, buff, originalSeconds) => {
    const factor = await hasDivine(connection, id, 'talent_production_03') ? 1.5 : 1;
    return { ...Object.fromEntries(Object.entries(buff).map(([key, value]) => [key, typeof value === 'number' ? value * factor : value])), __talentFoodBase: buff, ...(originalSeconds ? { __talentFoodExpires: Date.now() + originalSeconds * 1000 } : {}) };
};

export { divineFoodSeconds, divineFoodValues, divineUses, hasDivine, openingShopQuote, payOpeningShopDiscount, spendDivineUse };
