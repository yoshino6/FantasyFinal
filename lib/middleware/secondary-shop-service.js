import { useEvent, useRoute, useMessage, Format } from 'alemonjs';
import { getPool } from '../database/pool.js';
import { requireNpcAtCurrentPosition } from '../game/adventure.service.js';
import { shopProfessions, withSecondaryShop } from '../game/secondary-shop-context.js';

const shopServiceMiddleware = (fixedShop) => async (_event, next) => {
    const [event] = useEvent(), [route] = useRoute();
    const user = event.current.UserId;
    const shop = fixedShop ?? String(route.param('shop'));
    let context;
    try {
        if (!Object.hasOwn(shopProfessions, shop))
            throw new Error('请选择有效的副职业商店。');
        if (shop === 'alchemy_sweetshop' && route.param('action'))
            throw new Error('店铺炼金固定为 3 级；点灵与育成需要个人炼金达到 4 级并完成教学。');
        await requireNpcAtCurrentPosition(user, shop);
        const [rows] = await (await getPool()).execute('SELECT c.id,c.secondary_profession_code FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1', [user]);
        if (!rows[0])
            throw new Error('请先注册角色。');
        context = { shop, characterId: Number(rows[0].id), user, personalProfession: rows[0].secondary_profession_code };
    }
    catch (error) {
        const [message] = useMessage();
        await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('店铺服务').addText(error instanceof Error ? error.message : '暂时无法使用店铺服务。')) });
        return;
    }
    await withSecondaryShop(context, next);
};

export { shopServiceMiddleware };
