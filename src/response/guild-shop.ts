import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { buyShopItem, sellCatalog, sellShopItem, shopCatalog } from '../game/guild-shop.service';
import { addNpcAffinity, requireNpcAtCurrentPosition } from '../game/adventure.service';
import { messageFormat } from '../game/message';

const pageButtons = (page: number, totalPages: number, command: string, searchCommand: string, keyword = '') => Format.createButtonGroup().addRow()
  .addButton('上一页', `/${command} ${Math.max(1, page - 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page > 1 ? 'blue' : undefined })
  .addButton('搜索', `/${searchCommand} `, { type: 'command', autoEnter: false, style: 'blue' })
  .addButton('下一页', `/${command} ${Math.min(totalPages, page + 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page < totalPages ? 'blue' : undefined })
  .addRow().addButton('返回 公会商店', '/工会商店', { type: 'command', autoEnter: true });

export const guildShopFormat = (text?: string, speaker?: string) => {
  const hour = new Date().getHours();
  const scene = text ?? (hour < 11
    ? '商人刚将晨间送来的药剂、兽材与卷轴归到木架上。价签一丝不苟，空气里混着羊皮纸与草药的淡香。'
    : hour < 18
      ? '柜台后的商人正在归类药剂、兽材与卷轴。木架上陈列着实用的旅途用品，价签清晰，空气里混着羊皮纸与草药的淡香。'
      : '商人点亮柜台边的小灯，将白日售出的商品补齐。夜间的商店安静而明亮，仍为归来的冒险者留着一盏灯。');
  const markdown = Format.createMarkdown().addTitle('冒险者公会·商店').addNewline().addNewline();
  if (speaker) markdown.addText(`【${speaker}】`).addNewline().addNewline();
  markdown.addBlockquote(scene);
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('我要买', '/商店购买', { type: 'command', autoEnter: true, style: 'blue' }).addButton('我要卖', '/商店出售', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('闲聊', '/商店闲聊', { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回公会大厅', '/建筑进入 guild_counter', { type: 'command', autoEnter: true }));
};

const buyFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const shop = await shopCatalog(qqUserId, page, keyword); const markdown = Format.createMarkdown().addTitle('冒险者公会·商店').addNewline().addNewline()
    .addBlockquote(keyword ? `“我把和「${keyword}」有关的商品都找出来了。慢慢看，需要我再说明。”` : '“客人想找什么？地图、药剂与材料都可以慢慢挑。出门在外，准备充分总不会错。”').addNewline().addNewline();
  if (!shop.items.length) markdown.addText('没有找到符合条件的商品。');
  const sequence = '①②③④⑤';
  shop.items.forEach((item, index) => {
    const label = item.category === '地图' ? '【地图】' : `【${item.category}】`;
    const ownership = item.ownedQuantity > 0 ? `已拥有${item.ownedQuantity}` : '未拥有';
    markdown.addText(`${sequence[index]}${label}`).addButton(item.name, { data: `/物品图鉴 ${item.codexId}`, autoEnter: false }).addText(' ').addButton('[购买]', { data: `/购买商品 ${item.id} `, autoEnter: false }).addNewline().addBlockquote(`价格：铜币×${item.price}｜${ownership}`).addNewline().addBlockquote(`简介：${item.description}`).addNewline().addNewline();
  });
  markdown.addText(`当前第(${shop.page}/${shop.totalPages})页｜持有铜币：${shop.copper}`);
  return Format.create().addMarkdown(markdown).addButtonGroup(pageButtons(shop.page, shop.totalPages, '商店购买页', '商店搜索', shop.keyword));
};

const sellFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const shop = await sellCatalog(qqUserId, page, keyword); const markdown = Format.createMarkdown().addTitle('冒险者公会·商店·出售').addNewline().addNewline().addBlockquote(keyword ? `“我把背包中和「${keyword}」有关、可以收购的物品都找出来了。”` : '“材料、道具都可以拿来看看。我会按公会公示的价格收购；冒险者的战利品，总会在合适的地方派上用场。”').addNewline().addNewline();
  if (!shop.items.length) markdown.addText('背包里没有可出售的物品。');
  shop.items.forEach((item, index) => markdown.addText(`${index + 1}.【${item.category}】${item.name} ×${item.quantity} `).addButton('[出售]', { data: `/出售商品 ${item.id} `, autoEnter: false }).addNewline().addBlockquote(`收购价：铜币×${item.price}`).addNewline().addNewline());
  markdown.addText(`当前第(${shop.page}/${shop.totalPages})页｜持有铜币：${shop.copper}`);
  return Format.create().addMarkdown(markdown).addButtonGroup(pageButtons(shop.page, shop.totalPages, '商店出售页', '商店出售搜索', shop.keyword));
};

const requireGuildShop = (qqUserId: string) => requireNpcAtCurrentPosition(qqUserId, 'guild_counter');
export const guildShopHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireGuildShop(event.current.UserId); await message.send({ format: guildShopFormat() }); } catch (error) { await message.send({ format: messageFormat('无法进入商店', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const shopBuyListHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireGuildShop(event.current.UserId); await message.send({ format: await buyFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('商店暂不可用', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const shopSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireGuildShop(event.current.UserId); await message.send({ format: await buyFormat(event.current.UserId, 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const shopPurchaseHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireGuildShop(event.current.UserId); const requested = String(route.param('quantity') ?? '').trim(); const result = await buyShopItem(event.current.UserId, Number(route.param('id')), requested ? Number(requested) : 1); await addNpcAffinity(event.current.UserId, 'guild_counter', 'buy'); await message.send({ format: messageFormat('购买成功', `获得【${result.name}】×${result.quantity}\n消耗铜币×${result.price}`) }); await message.send({ format: await buyFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('购买失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const shopSellListHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireGuildShop(event.current.UserId); await message.send({ format: await sellFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('出售列表不可用', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const shopSellSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireGuildShop(event.current.UserId); await message.send({ format: await sellFormat(event.current.UserId, 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const shopSellHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireGuildShop(event.current.UserId); const requested = String(route.param('quantity') ?? '').trim(); const result = await sellShopItem(event.current.UserId, Number(route.param('id')), requested ? Number(requested) : 1); await addNpcAffinity(event.current.UserId, 'guild_counter', 'sell'); await message.send({ format: messageFormat('出售成功', `出售【${result.name}】×${result.quantity}\n获得铜币×${result.price}`) }); await message.send({ format: await sellFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('出售失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const shopChatHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireGuildShop(event.current.UserId); await addNpcAffinity(event.current.UserId, 'guild_counter', 'chat'); await message.send({ format: guildShopFormat('商人抬起头，笑着擦了擦柜台。“东西会用完，冒险的见闻却不会。等你从密林回来，记得和我说说那里又有什么新鲜事。”', '商人') }); } catch (error) { await message.send({ format: messageFormat('无法闲聊', error instanceof Error ? error.message : '请稍后重试。') }); } };
