import { useEvent, Format, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { nearbyPoints, addNpcAffinity } from '../game/adventure.service.js';
import { requireCurrentGuild } from '../game/guild-context.js';
import { freeGuildMealUses, enjoyRestaurantMeal, foodBuffText, restaurantMenu } from '../game/guild-restaurant.service.js';
import { npcInteractionMarkdown, messageFormat } from '../game/message.js';
import { durationText } from '../game/time-format.js';

const pageButtons = (page, totalPages, keyword = '') => Format.createButtonGroup().addRow()
    .addButton('上一页', `/餐厅菜单页 ${Math.max(1, page - 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page > 1 ? 'blue' : undefined })
    .addButton('搜索', '/餐厅搜索 ', { type: 'command', autoEnter: false, style: 'blue' })
    .addButton('下一页', `/餐厅菜单页 ${Math.min(totalPages, page + 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page < totalPages ? 'blue' : undefined })
    .addRow().addButton('返回 公会大厅', '/初行公会', { type: 'command', autoEnter: true });
const ingredientText = (ingredients) => ingredients.map(item => `【${item.category}】${item.name}×${item.quantity}（持有${item.owned}）`).join('、') || '无需素材';
const restaurantFormat = (text, title = '百纳镇·冒险者公会·餐厅', freeMeals = 0) => {
    const hour = new Date().getHours();
    const scene = text ?? (hour < 11
        ? '厨房里飘出新烤面包与热粥的香气。早到的冒险者围着长桌规划路线，掌勺的半身人厨师将早餐逐份端上。'
        : hour < 18
            ? '开放式厨房飘来炖肉、烤面包与香草的暖香。归来的冒险者围坐长桌交换见闻，掌勺的半身人厨师正把热腾腾的餐盘递给下一位客人。'
            : '夜间的餐厅比白日更热闹些。热汤、烤肉与笑声填满长桌，辛苦归来的冒险者在此交换收获与明日的计划。');
    const markdown = Format.createMarkdown().addTitle(title).addNewline().addNewline().addBlockquote(scene.replace(/\r?\n/g, '\n> '))
        .addNewline().addNewline().addText(`免费热食：剩余 ${freeMeals} 次`);
    return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
        .addButton('查看菜单', '/餐厅菜单', { type: 'command', autoEnter: true, style: 'blue' })
        .addButton('领取基础热食', '/初行服务 meal', { type: 'command', autoEnter: true, style: 'blue' }).addRow()
        .addButton('返回公会大厅', '/初行公会', { type: 'command', autoEnter: true }));
};
const menuFormat = async (qqUserId, page = 1, keyword = '') => {
    const context = await requireCurrentGuild(qqUserId);
    const menu = await restaurantMenu(qqUserId, page, keyword);
    const markdown = Format.createMarkdown().addTitle(`${context.hub.name}·${context.hub.guildName}·餐厅`).addNewline().addNewline()
        .addBlockquote(keyword ? `“我把和「${keyword}」有关的菜品找出来了，请慢慢挑选。”` : '“把素材和加工费交给我吧。我会立刻做好端上来，热饭最适合出发前享用。”').addNewline().addNewline();
    if (menu.activeFood)
        markdown.addText(`当前餐食增益：${menu.activeFood.name}（剩余${durationText(menu.activeFood.remainingSeconds)}）`).addNewline().addBlockquote(foodBuffText(menu.activeFood.buff)).addNewline().addNewline();
    if (!menu.meals.length)
        markdown.addText('没有找到符合条件的菜品。');
    const sequence = '①②③④⑤';
    menu.meals.forEach((meal, index) => markdown.addText(`${sequence[index]}【${meal.category}】${meal.name} `).addButton('[制作并享用]', { data: `/享用美食 ${meal.id}`, autoEnter: false }).addNewline().addBlockquote(`素材：${ingredientText(meal.ingredients)}`).addNewline().addBlockquote(`加工费：铜币×${meal.processingFee}`).addNewline().addBlockquote(`增益：${foodBuffText(meal.buff)}（${meal.durationMinutes}分钟）`).addNewline().addBlockquote(`简介：${meal.description}`).addNewline().addNewline());
    markdown.addText(`当前第(${menu.page}/${menu.totalPages})页｜持有铜币：${menu.copper}`);
    return Format.create().addMarkdown(markdown).addButtonGroup(pageButtons(menu.page, menu.totalPages, menu.keyword));
};
const requireRestaurant = requireCurrentGuild;
var guildRestaurant = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        const context = await requireRestaurant(event.current.UserId);
        const freeMeals = await freeGuildMealUses(event.current.UserId);
        if (context.code === 'world_tree') {
            const nearby = await nearbyPoints(event.current.UserId);
            const markdown = npcInteractionMarkdown('冒险者公会·餐厅', '朵菈', '汤锅在灶上咕嘟作响，烤谷物的香气漫过门边。朵菈用围裙擦净手，将空椅往外拉了拉：“坐下。想逞强，也先把汤喝了。饿着肚子想出来的主意，多半不怎么样。”', 'root_guild_cook', nearby.npcDetailsUnlocked);
            markdown.addNewline().addNewline().addText(`免费热食：剩余 ${freeMeals} 次`);
            await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看 菜单', '/餐厅菜单', { type: 'command', autoEnter: true, style: 'blue' }).addButton('领取基础热食', '/初行服务 meal', { type: 'command', autoEnter: true, style: 'blue' }).addRow().addButton('返回 公会大厅', '/初行公会', { type: 'command', autoEnter: true })) });
            return;
        }
        await message.send({ format: context.code === 'baina_town' ? restaurantFormat(undefined, undefined, freeMeals) : restaurantFormat(`${context.hub.description}\n\n热汤的香气从餐桌旁飘来。厨师将菜单和餐票夹摆好：“先坐，今天想吃些什么？”`, `${context.hub.name}·${context.hub.guildName}·餐厅`, freeMeals) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法进入餐厅', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const restaurantMenuHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await requireRestaurant(event.current.UserId);
    await message.send({ format: await menuFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) });
}
catch (error) {
    await message.send({ format: messageFormat('餐厅暂不可用', error instanceof Error ? error.message : '请稍后重试。') });
} };
const restaurantSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await requireRestaurant(event.current.UserId);
    await message.send({ format: await menuFormat(event.current.UserId, 1, String(route.param('keyword'))) });
}
catch (error) {
    await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const enjoyMealHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await requireRestaurant(event.current.UserId);
    const result = await enjoyRestaurantMeal(event.current.UserId, Number(route.param('id')));
    await addNpcAffinity(event.current.UserId, (await requireCurrentGuild(event.current.UserId)).hub.guild, 'buy');
    const replaced = result.replaced ? `\n原有「${result.replaced}」餐食增益已替换。` : '';
    await message.send({ format: messageFormat('用餐完成', `享用了【${result.name}】\n消耗素材：${result.ingredients.map(item => `${item.name}×${item.quantity}`).join('、')}\n加工费：铜币×${result.processingFee}\n获得增益：${foodBuffText(result.buff)}\n持续时间：${result.durationMinutes}分钟${replaced}`) });
    await message.send({ format: await menuFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法制作', error instanceof Error ? error.message : '请稍后重试。') });
} };

export { guildRestaurant as default, enjoyMealHandler, restaurantFormat, restaurantMenuHandler, restaurantSearchHandler };
