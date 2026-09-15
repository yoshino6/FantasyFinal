import { achievementItem } from './achievement-hooks.js';
import { randomUUID } from 'node:crypto';
import { recordCharacterOperation } from './character-operation.service.js';
import { grantInventory } from './inventory-binding.js';
import { withTransaction, getPool } from '../database/pool.js';
import { requireGuildService } from './guild-context.js';
import { guildContributionSalePrice, guildSkillBookContributionPrice } from './skill-access.config.js';
import { openingShopQuote, payOpeningShopDiscount } from './divine-effects.js';
import { guildMapCatalog, guildMapContributionPrice } from './guild-map.service.js';

const PAGE_SIZE = 5;
const characterFor = async (connection, qqUserId, lock = false) => {
    const [rows] = await connection.execute(`SELECT c.id,c.guild_contribution FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
    if (!rows[0])
        throw new Error('请先注册角色。');
    await requireGuildService(connection, Number(rows[0].id));
    return rows[0];
};
const pageInfo = (page, total) => ({ page: Math.max(1, Math.min(Math.max(1, Math.ceil(total / PAGE_SIZE)), page)), totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
const validQuantity = (quantity) => {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999)
        throw new Error('数量必须是 1 至 999 之间的整数。');
    return quantity;
};
const purchasableMaps = async (connection) => (await guildMapCatalog(connection)).flatMap(map => {
    const price = guildMapContributionPrice(map.risk);
    return map.id === null || price === null ? [] : [{ ...map, id: map.id, price }];
});
const skillBookPrice = (item) => {
    if (item.item_category !== '技能书')
        return null;
    const price = guildSkillBookContributionPrice(String(item.skill_tier ?? ''), String(item.skill_code ?? ''));
    if (price === null)
        throw new Error('技能书位阶尚未配置价格，暂不可购买。');
    return price;
};
const shopCatalog = async (qqUserId, page = 1, keyword = '') => {
    const pool = await getPool();
    const character = await characterFor(pool, qqUserId);
    const term = `%${keyword.trim()}%`;
    const maps = (await purchasableMaps(pool)).filter(map => map.name.includes(keyword.trim()));
    const [countRows] = await pool.execute("SELECT COUNT(*) AS total FROM guild_shop_items si JOIN item_definitions i ON i.id=si.item_id WHERE si.is_active=1 AND si.buy_price>0 AND i.item_category<>'地图' AND i.name LIKE ?", [term]);
    const paging = pageInfo(page, maps.length + Number(countRows[0]?.total ?? 0));
    const offset = (paging.page - 1) * PAGE_SIZE;
    const mapPage = maps.slice(offset, offset + PAGE_SIZE);
    const remaining = PAGE_SIZE - mapPage.length;
    const [rows] = remaining > 0 ? await pool.execute(`SELECT i.id,i.codex_id,i.name,i.item_type,i.trade_price,i.rarity,i.item_category,i.description,si.buy_price,si.stock_quantity,COALESCE(pi.quantity,0) AS owned_quantity,
      JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.skillBook')) AS skill_code,s.tier AS skill_tier
    FROM guild_shop_items si JOIN item_definitions i ON i.id=si.item_id
    LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=?
    LEFT JOIN skill_definitions s ON s.code=JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.skillBook'))
    WHERE si.is_active=1 AND si.buy_price>0 AND i.item_category<>'地图' AND i.name LIKE ? ORDER BY si.item_id LIMIT ? OFFSET ?`, [character.id, term, String(remaining), String(Math.max(0, offset - maps.length))]) : [[]];
    const mapIds = mapPage.map(map => map.id);
    const [ownedMaps] = mapIds.length ? await pool.execute(`SELECT item_id,SUM(quantity) AS quantity FROM (
    SELECT item_id,quantity FROM player_inventory WHERE character_id=? AND item_id IN (${mapIds.map(() => '?').join(',')})
    UNION ALL SELECT s.item_id,s.quantity FROM player_home_storage_items s JOIN player_homes h ON h.id=s.home_id WHERE h.character_id=? AND s.item_id IN (${mapIds.map(() => '?').join(',')})
    ) owned GROUP BY item_id`, [character.id, ...mapIds, character.id, ...mapIds]) : [[]];
    const ownedById = new Map(ownedMaps.map(row => [Number(row.item_id), Number(row.quantity)]));
    const mapItems = mapPage.map(map => ({ id: map.id, codexId: map.codexId, name: map.name, category: '地图', description: map.description, price: map.price, stockQuantity: null, ownedQuantity: ownedById.get(map.id) ?? 0 }));
    const regularItems = await Promise.all(rows.map(async (row) => { const bookPrice = skillBookPrice(row); const quote = await openingShopQuote(pool, Number(character.id), row, 1); return { id: Number(row.id), codexId: row.codex_id, name: row.name, category: row.item_category, description: row.description, price: bookPrice ?? Math.ceil(quote.price / 10), stockQuantity: Number(row.stock_quantity), ownedQuantity: Number(row.owned_quantity) }; }));
    const items = [...mapItems, ...regularItems];
    return { items, ...paging, keyword: keyword.trim(), contribution: Number(character.guild_contribution) };
};
const sellCatalog = async (qqUserId, page = 1, keyword = '') => {
    const pool = await getPool();
    const character = await characterFor(pool, qqUserId);
    const term = `%${keyword.trim()}%`;
    const sellable = "pi.character_id=? AND pi.quantity>0 AND i.is_tradeable=1 AND i.trade_price>=10 AND i.item_category NOT IN ('特殊','地图','货币') AND i.item_type IN ('material','consumable') AND (CASE WHEN i.code IN ('meteor_iron','star_copper','moon_silver','sun_gold') THEN FLOOR(i.trade_price*.5) ELSE i.trade_price END)>=10 AND i.name LIKE ?";
    const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE ' + sellable, [character.id, term]);
    const paging = pageInfo(page, Number(countRows[0]?.total ?? 0));
    const [rows] = await pool.execute(`SELECT i.id,i.name,i.item_category,pi.quantity,
    CASE WHEN i.code IN ('meteor_iron','star_copper','moon_silver','sun_gold') THEN FLOOR(i.trade_price*.5) ELSE i.trade_price END AS sell_price
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE ${sellable} ORDER BY i.item_type,i.name LIMIT ? OFFSET ?`, [character.id, term, String(PAGE_SIZE), String((paging.page - 1) * PAGE_SIZE)]);
    return { items: rows.map(row => ({ id: Number(row.id), name: row.name, category: row.item_category, quantity: Number(row.quantity), price: guildContributionSalePrice(Number(row.sell_price)) })), ...paging, keyword: keyword.trim(), contribution: Number(character.guild_contribution) };
};
const buyShopItem = async (qqUserId, itemId, quantity = 1) => withTransaction(async (connection) => {
    const amount = validQuantity(quantity);
    const character = await characterFor(connection, qqUserId, true);
    const [categories] = await connection.execute('SELECT item_category FROM item_definitions WHERE id=?', [itemId]);
    if (categories[0]?.item_category === '地图') {
        if (amount !== 1)
            throw new Error('地图一次只能购买一张。');
        const map = (await purchasableMaps(connection)).find(entry => entry.id === itemId);
        if (!map)
            throw new Error('这张地图尚未开放，或危险等级尚未勘定。');
        const [owned] = await connection.execute(`SELECT 1 FROM player_inventory WHERE character_id=? AND item_id=? AND quantity>0 UNION ALL SELECT 1 FROM player_home_storage_items s JOIN player_homes h ON h.id=s.home_id WHERE h.character_id=? AND s.item_id=? AND s.quantity>0`, [character.id, itemId, character.id, itemId]);
        if (owned.length)
            throw new Error('你已经拥有这张地图。');
        if (Number(character.guild_contribution) < map.price)
            throw new Error(`贡献度不足，需要 ${map.price} 点。`);
        const [spent] = await connection.execute('UPDATE characters SET guild_contribution=guild_contribution-? WHERE id=? AND guild_contribution>=?', [map.price, character.id, map.price]);
        if (!spent.affectedRows)
            throw new Error('贡献度已变化，请重新查看商店。');
        await grantInventory(connection, Number(character.id), itemId, { personal: 1, trade: 0, unbound: 0 });
        await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [character.id, itemId]);
        await achievementItem(connection, Number(character.id), itemId);
        await recordCharacterOperation(connection, { characterId: Number(character.id), kind: 'guild_shop.bought', source: { system: 'guild_shop_purchase', id: randomUUID(), step: 'settled' }, outcome: '购入', summary: `在公会商店兑换${map.name}`, detail: { itemId, itemName: map.name, quantity: 1, paidContribution: map.price } });
        return { name: map.name, quantity: 1, price: map.price };
    }
    const [rows] = await connection.execute("SELECT i.id,i.name,i.item_type,i.item_category,i.description,i.trade_price,i.rarity,JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.skillBook')) AS skill_code,s.tier AS skill_tier,si.buy_price,si.stock_quantity FROM guild_shop_items si JOIN item_definitions i ON i.id=si.item_id LEFT JOIN skill_definitions s ON s.code=JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.skillBook')) WHERE si.item_id=? AND si.is_active=1 AND si.buy_price>0 AND i.item_category<>'地图' FOR UPDATE", [itemId]);
    const item = rows[0];
    if (!item)
        throw new Error('该商品已下架。');
    if (Number(item.stock_quantity) < amount)
        throw new Error(`库存不足，剩余 ${item.stock_quantity} 件。`);
    if (item.skill_code) {
        if (amount !== 1)
            throw new Error('技能书每次只能兑换一本。');
        const [known] = await connection.execute(`SELECT 1 FROM skill_definitions s LEFT JOIN player_skills ps ON ps.skill_id=s.id AND ps.character_id=?
      LEFT JOIN player_skill_discoveries d ON d.skill_id=s.id AND d.character_id=? WHERE s.code=? AND (ps.skill_id IS NOT NULL OR d.skill_id IS NOT NULL) LIMIT 1`, [character.id, character.id, item.skill_code]);
        if (known[0])
            throw new Error('你已经领悟这项技能，无需重复兑换技能书。');
    }
    const bookPrice = skillBookPrice(item);
    const quote = await openingShopQuote(connection, Number(character.id), item, amount);
    const totalPrice = bookPrice ?? Math.ceil(quote.price / 10);
    if (Number(character.guild_contribution) < totalPrice)
        throw new Error(`贡献度不足，需要 ${totalPrice} 点。`);
    if (totalPrice > 0) {
        const [spent] = await connection.execute('UPDATE characters SET guild_contribution=guild_contribution-? WHERE id=? AND guild_contribution>=?', [totalPrice, character.id, totalPrice]);
        if (!spent.affectedRows)
            throw new Error('贡献度已变化，请重新查看商店。');
    }
    await payOpeningShopDiscount(connection, Number(character.id), quote);
    const [stock] = await connection.execute('UPDATE guild_shop_items SET stock_quantity=stock_quantity-? WHERE item_id=? AND stock_quantity>=?', [amount, item.id, amount]);
    if (!stock.affectedRows)
        throw new Error('库存已变化，请重新查看商店。');
    const personal = item.item_category === '技能书' || quote.credit > 0 || quote.discount > 0;
    await grantInventory(connection, Number(character.id), Number(item.id), { trade: personal ? 0 : amount, personal: personal ? amount : 0, unbound: 0 });
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [character.id, item.id]);
    await achievementItem(connection, Number(character.id), Number(item.id));
    await recordCharacterOperation(connection, { characterId: Number(character.id), kind: 'guild_shop.bought', source: { system: 'guild_shop_purchase', id: randomUUID(), step: 'settled' }, outcome: '购入', summary: `在公会商店兑换${item.name} ×${amount}`, detail: { itemId, itemName: item.name, quantity: amount, paidContribution: totalPrice } });
    return { name: item.name, quantity: amount, price: totalPrice };
});
const sellShopItem = async (qqUserId, itemId, quantity = 1) => withTransaction(async (connection) => {
    const amount = validQuantity(quantity);
    const character = await characterFor(connection, qqUserId, true);
    const [rows] = await connection.execute(`SELECT i.id,i.name,i.item_type,i.item_category,pi.quantity,pi.personal_bound_quantity,pi.trade_bound_quantity,
    CASE WHEN i.code IN ('meteor_iron','star_copper','moon_silver','sun_gold') THEN FLOOR(i.trade_price*.5) ELSE i.trade_price END AS sell_price
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 AND i.is_tradeable=1 AND i.trade_price>=10
      AND i.item_category NOT IN ('特殊','地图','货币') AND i.item_type IN ('material','consumable') FOR UPDATE`, [character.id, itemId]);
    const item = rows[0];
    if (!item)
        throw new Error('公会商店只收购可交易的常规材料、药剂和食物。');
    if (Number(item.quantity) < amount)
        throw new Error(`背包数量不足，当前仅有 ${item.quantity} 个。`);
    if (Number(item.quantity) - Number(item.personal_bound_quantity) < amount)
        throw new Error('可出售数量不足，个人绑定的补给不能回售。');
    const [stolen] = await connection.execute('SELECT 1 FROM pvp_stolen_loot WHERE holder_character_id=? AND item_id=? AND returned_at IS NULL AND held_quantity>0 LIMIT 1 FOR UPDATE', [character.id, item.id]);
    if (stolen[0])
        throw new Error('赃物不能兑换为个人贡献度。');
    const unitPrice = guildContributionSalePrice(Number(item.sell_price));
    if (unitPrice < 1)
        throw new Error('该物品价值不足，不能兑换贡献度。');
    const totalPrice = unitPrice * amount;
    await connection.execute('UPDATE player_inventory SET quantity=quantity-?,trade_bound_quantity=trade_bound_quantity-?,binding_revision=binding_revision+1 WHERE character_id=? AND item_id=?', [amount, Math.min(amount, Number(item.trade_bound_quantity)), character.id, item.id]);
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [character.id, item.id]);
    await connection.execute('UPDATE characters SET guild_contribution=guild_contribution+? WHERE id=?', [totalPrice, character.id]);
    await recordCharacterOperation(connection, { characterId: Number(character.id), kind: 'guild_shop.sold', source: { system: 'guild_shop_sale', id: randomUUID(), step: 'settled' }, outcome: '售出', summary: `向公会商店交付${item.name} ×${amount}`, detail: { itemId, itemName: item.name, quantity: amount, receivedContribution: totalPrice } });
    return { name: item.name, quantity: amount, price: totalPrice };
});

export { buyShopItem, sellCatalog, sellShopItem, shopCatalog };
