import { withTransaction, getPool } from '../database/pool.js';
import { recalculateCharacterStats } from './character.service.js';

const PAGE_SIZE = 5;
const pageInfo = (page, total) => ({ page: Math.max(1, Math.min(Math.max(1, Math.ceil(total / PAGE_SIZE)), page)), totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
const jsonRecord = (value) => {
    if (!value)
        return {};
    if (typeof value !== 'string')
        return value;
    try {
        return JSON.parse(value);
    }
    catch {
        return {};
    }
};
const jsonArray = (value) => {
    if (Array.isArray(value))
        return value;
    if (typeof value !== 'string')
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
const recipeOf = (value) => jsonArray(value).map(item => jsonRecord(item)).map(item => ({ code: String(item.code ?? ''), quantity: Math.max(1, Math.floor(Number(item.quantity ?? 1))) })).filter(item => item.code);
const foodBuffText = (buff) => {
    const labels = [['hpPct', '生命上限'], ['mpPct', '魔力上限'], ['physicalAttackPct', '物攻'], ['magicAttackPct', '魔攻'], ['physicalDefensePct', '物防'], ['magicDefensePct', '魔防'], ['accuracyPct', '命中'], ['evasionPct', '闪避'], ['speedPct', '速度']];
    const text = labels.filter(([key]) => Number(buff[key] ?? 0)).map(([key, label]) => `${label}+${Number(buff[key])}%`);
    return text.join('｜') || '获得餐食增益';
};
const characterFor = async (connection, qqUserId, lock = false) => {
    const [rows] = await connection.execute(`SELECT c.id,c.copper_coins FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
    if (!rows[0])
        throw new Error('请先注册角色。');
    return rows[0];
};
const activeFoodFor = async (connection, characterId) => {
    const [rows] = await connection.execute(`SELECT i.name,b.buff_json,TIMESTAMPDIFF(SECOND,NOW(),b.expires_at) AS remaining_seconds FROM player_food_buffs b JOIN item_definitions i ON i.id=b.item_id WHERE b.character_id=? AND b.expires_at>NOW() LIMIT 1`, [characterId]);
    return rows[0] ? { name: rows[0].name, buff: jsonRecord(rows[0].buff_json), remainingSeconds: Math.max(0, Number(rows[0].remaining_seconds)) } : null;
};
const inventoryForRecipe = async (connection, characterId, ingredients, lock = false) => {
    if (!ingredients.length)
        return [];
    const placeholders = ingredients.map(() => '?').join(',');
    const [rows] = await connection.execute(`SELECT i.code,i.name,i.item_category,COALESCE(pi.quantity,0) AS owned FROM item_definitions i LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=? WHERE i.code IN (${placeholders})${lock ? ' FOR UPDATE' : ''}`, [characterId, ...ingredients.map(item => item.code)]);
    const found = new Map(rows.map(row => [row.code, row]));
    return ingredients.map(ingredient => ({ code: ingredient.code, name: found.get(ingredient.code)?.name ?? ingredient.code, category: found.get(ingredient.code)?.item_category ?? '素材', quantity: ingredient.quantity, owned: Number(found.get(ingredient.code)?.owned ?? 0) }));
};
const restaurantMenu = async (qqUserId, page = 1, keyword = '') => {
    const pool = await getPool();
    const character = await characterFor(pool, qqUserId);
    const term = `%${keyword.trim()}%`;
    const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM guild_restaurant_menu m JOIN item_definitions i ON i.id=m.item_id WHERE m.is_active=1 AND i.name LIKE ?', [term]);
    const paging = pageInfo(page, Number(countRows[0]?.total ?? 0));
    const [rows] = await pool.execute(`SELECT i.id,i.name,i.item_category,i.description,m.processing_fee,m.ingredients_json,m.buff_json,m.duration_minutes FROM guild_restaurant_menu m JOIN item_definitions i ON i.id=m.item_id WHERE m.is_active=1 AND i.name LIKE ? ORDER BY m.processing_fee,i.id LIMIT ? OFFSET ?`, [term, PAGE_SIZE, (paging.page - 1) * PAGE_SIZE]);
    const recipes = rows.map(row => recipeOf(row.ingredients_json));
    const ingredients = await Promise.all(recipes.map(recipe => inventoryForRecipe(pool, character.id, recipe)));
    return { meals: rows.map((row, index) => ({ id: Number(row.id), name: row.name, category: row.item_category, description: row.description, processingFee: Number(row.processing_fee), ingredients: ingredients[index], buff: jsonRecord(row.buff_json), durationMinutes: Number(row.duration_minutes) })), ...paging, keyword: keyword.trim(), copper: Number(character.copper_coins), activeFood: await activeFoodFor(pool, character.id) };
};
const enjoyRestaurantMeal = async (qqUserId, itemId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    const [rows] = await connection.execute(`SELECT i.id,i.name,i.item_category,i.description,m.processing_fee,m.ingredients_json,m.buff_json,m.duration_minutes FROM guild_restaurant_menu m JOIN item_definitions i ON i.id=m.item_id WHERE m.item_id=? AND m.is_active=1 FOR UPDATE`, [itemId]);
    const meal = rows[0];
    if (!meal)
        throw new Error('这道菜暂时无法制作。');
    if (Number(character.copper_coins) < Number(meal.processing_fee))
        throw new Error(`铜币不足，需要 ${meal.processing_fee} 铜币加工费。`);
    const ingredients = await inventoryForRecipe(connection, character.id, recipeOf(meal.ingredients_json), true);
    const shortage = ingredients.find(item => item.owned < item.quantity);
    if (shortage)
        throw new Error(`素材不足：${shortage.name}需要 ${shortage.quantity} 份，当前仅有 ${shortage.owned} 份。`);
    for (const ingredient of ingredients)
        await connection.execute('UPDATE player_inventory pi JOIN item_definitions i ON i.id=pi.item_id SET pi.quantity=pi.quantity-? WHERE pi.character_id=? AND i.code=?', [ingredient.quantity, character.id, ingredient.code]);
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND quantity<=0', [character.id]);
    const previous = await activeFoodFor(connection, character.id);
    await connection.execute('DELETE FROM player_food_buffs WHERE character_id=?', [character.id]);
    await connection.execute('INSERT INTO player_food_buffs (character_id,item_id,buff_json,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL ? MINUTE))', [character.id, meal.id, JSON.stringify(jsonRecord(meal.buff_json)), Number(meal.duration_minutes)]);
    await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [meal.processing_fee, character.id]);
    await recalculateCharacterStats(connection, character.id);
    return { name: meal.name, processingFee: Number(meal.processing_fee), ingredients, buff: jsonRecord(meal.buff_json), durationMinutes: Number(meal.duration_minutes), replaced: previous?.name ?? null };
});

export { enjoyRestaurantMeal, foodBuffText, restaurantMenu };
