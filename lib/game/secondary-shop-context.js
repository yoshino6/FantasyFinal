import { AsyncLocalStorage } from 'node:async_hooks';
import { secondaryProfessionBonus, secondaryProfessionProficiencyRequired } from './secondary-profession.js';

const shopProfessions = { blacksmith: 'blacksmith', alchemy_sweetshop: 'alchemist', oddworkshop: 'deconstructor', bookshop: 'omniscient' };
const storage = new AsyncLocalStorage();
const currentSecondaryShop = () => storage.getStore();
const withSecondaryShop = (context, work) => storage.run(context, work);
const shopProficiency = (amount) => currentSecondaryShop() ? 0 : amount;
const shopProgressFor = async (connection, characterId, profession) => {
    const context = currentSecondaryShop();
    if (!context)
        return null;
    if (context.characterId !== characterId || shopProfessions[context.shop] !== profession)
        throw new Error('店铺服务与本次操作不匹配。');
    const [rows] = await connection.execute('SELECT c.id FROM characters c JOIN map_npcs n ON n.region_id=c.current_region_id AND n.pos_x=c.pos_x AND n.pos_y=c.pos_y AND n.pos_z=c.pos_z WHERE c.id=? AND n.code=? LIMIT 1', [characterId, context.shop]);
    if (!rows.length)
        throw new Error('你已经离开店铺，无法继续使用副职业服务。');
    return { level: 3, proficiency: 0, required: secondaryProfessionProficiencyRequired(3), bonus: secondaryProfessionBonus(3) };
};

export { currentSecondaryShop, shopProfessions, shopProficiency, shopProgressFor, withSecondaryShop };
