import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { addNpcAffinity, requireNpcAtCurrentPosition } from '../game/adventure.service';
import { enjoyRestaurantMeal, foodBuffText, restaurantMenu } from '../game/guild-restaurant.service';
import { messageFormat } from '../game/message';
import { durationText } from '../game/time-format';

const pageButtons = (page: number, totalPages: number, keyword = '') => Format.createButtonGroup().addRow()
  .addButton('上一页', `/餐厅菜单页 ${Math.max(1, page - 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page > 1 ? 'blue' : undefined })
  .addButton('搜索', '/餐厅搜索 ', { type: 'command', autoEnter: false, style: 'blue' })
  .addButton('下一页', `/餐厅菜单页 ${Math.min(totalPages, page + 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page < totalPages ? 'blue' : undefined })
  .addRow().addButton('返回 公会大厅', '/建筑进入 guild_counter', { type: 'command', autoEnter: true });

const ingredientText = (ingredients: { category: string; name: string; quantity: number; owned: number }[]) => ingredients.map(item => `【${item.category}】${item.name}×${item.quantity}（持有${item.owned}）`).join('、') || '无需素材';

export const restaurantFormat = (text?: string) => {
  const hour = new Date().getHours();
  const scene = text ?? (hour < 11
    ? '厨房里飘出新烤面包与热粥的香气。早到的冒险者围着长桌规划路线，掌勺的半身人厨师将早餐逐份端上。'
    : hour < 18
      ? '开放式厨房飘来炖肉、烤面包与香草的暖香。归来的冒险者围坐长桌交换见闻，掌勺的半身人厨师正把热腾腾的餐盘递给下一位客人。'
      : '夜间的餐厅比白日更热闹些。热汤、烤肉与笑声填满长桌，辛苦归来的冒险者在此交换收获与明日的计划。');
  const markdown = Format.createMarkdown().addTitle('百纳镇·冒险者公会·餐厅').addNewline().addNewline().addBlockquote(scene);
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('查看菜单', '/餐厅菜单', { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('返回公会大厅', '/建筑进入 guild_counter', { type: 'command', autoEnter: true }));
};

const menuFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const menu = await restaurantMenu(qqUserId, page, keyword); const markdown = Format.createMarkdown().addTitle('百纳镇·冒险者公会·餐厅').addNewline().addNewline()
    .addBlockquote(keyword ? `“我把和「${keyword}」有关的菜品找出来了，请慢慢挑选。”` : '“把素材和加工费交给我吧。我会立刻做好端上来，热饭最适合出发前享用。”').addNewline().addNewline();
  if (menu.activeFood) markdown.addText(`当前餐食增益：${menu.activeFood.name}（剩余${durationText(menu.activeFood.remainingSeconds)}）`).addNewline().addBlockquote(foodBuffText(menu.activeFood.buff)).addNewline().addNewline();
  if (!menu.meals.length) markdown.addText('没有找到符合条件的菜品。');
  const sequence = '①②③④⑤';
  menu.meals.forEach((meal, index) => markdown.addText(`${sequence[index]}【${meal.category}】${meal.name} `).addButton('[制作并享用]', { data: `/享用美食 ${meal.id}`, autoEnter: false }).addNewline().addBlockquote(`素材：${ingredientText(meal.ingredients)}`).addNewline().addBlockquote(`加工费：铜币×${meal.processingFee}`).addNewline().addBlockquote(`增益：${foodBuffText(meal.buff)}（${meal.durationMinutes}分钟）`).addNewline().addBlockquote(`简介：${meal.description}`).addNewline().addNewline());
  markdown.addText(`当前第(${menu.page}/${menu.totalPages})页｜持有铜币：${menu.copper}`);
  return Format.create().addMarkdown(markdown).addButtonGroup(pageButtons(menu.page, menu.totalPages, menu.keyword));
};

const requireRestaurant = (qqUserId: string) => requireNpcAtCurrentPosition(qqUserId, 'guild_counter');
export default async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireRestaurant(event.current.UserId); await message.send({ format: restaurantFormat() }); } catch (error) { await message.send({ format: messageFormat('无法进入餐厅', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const restaurantMenuHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireRestaurant(event.current.UserId); await message.send({ format: await menuFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('餐厅暂不可用', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const restaurantSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireRestaurant(event.current.UserId); await message.send({ format: await menuFormat(event.current.UserId, 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const enjoyMealHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireRestaurant(event.current.UserId); const result = await enjoyRestaurantMeal(event.current.UserId, Number(route.param('id'))); await addNpcAffinity(event.current.UserId, 'guild_counter', 'buy'); const replaced = result.replaced ? `\n原有「${result.replaced}」餐食增益已替换。` : ''; await message.send({ format: messageFormat('用餐完成', `享用了【${result.name}】\n消耗素材：${result.ingredients.map(item => `${item.name}×${item.quantity}`).join('、')}\n加工费：铜币×${result.processingFee}\n获得增益：${foodBuffText(result.buff)}\n持续时间：${result.durationMinutes}分钟${replaced}`) }); await message.send({ format: await menuFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('无法制作', error instanceof Error ? error.message : '请稍后重试。') }); } };
