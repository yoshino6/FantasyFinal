import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { addNpcAffinity, nearbyPoints, requireNpcAtCurrentPosition } from '../game/adventure.service';
import { blacksmithSellCatalog, blacksmithShopCatalog, buyBlacksmithEquipment, sellBlacksmithEquipment, sellBlacksmithMaterial } from '../game/blacksmith-shop.service';
import { learnXiaobeiCraftsmanship, xiaobeiCraftsmanshipStatus } from '../game/blacksmith.service';
import { messageFormat } from '../game/message';
import { npcChatDialogue } from '../game/npc-dialogue.service';

const requireBlacksmithShop = async (qqUserId: string) => {
  await requireNpcAtCurrentPosition(qqUserId, 'blacksmith');
};
const pageButtons = (page: number, totalPages: number, category: string, keyword = '') => Format.createButtonGroup()
  .addRow().addButton('全部', '/铁匠铺购买 全部', { type: 'command', autoEnter: true, style: category === '全部' ? 'blue' : undefined }).addButton('头肩', '/铁匠铺购买 头肩', { type: 'command', autoEnter: true, style: category === '头肩' ? 'blue' : undefined }).addButton('上装', '/铁匠铺购买 上装', { type: 'command', autoEnter: true, style: category === '上装' ? 'blue' : undefined })
  .addRow().addButton('腰部', '/铁匠铺购买 腰部', { type: 'command', autoEnter: true, style: category === '腰部' ? 'blue' : undefined }).addButton('下装', '/铁匠铺购买 下装', { type: 'command', autoEnter: true, style: category === '下装' ? 'blue' : undefined }).addButton('脚部', '/铁匠铺购买 脚部', { type: 'command', autoEnter: true, style: category === '脚部' ? 'blue' : undefined })
  .addRow()
  .addButton('上一页', `/铁匠铺购买页 ${category} ${Math.max(1, page - 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page > 1 ? 'blue' : undefined })
  .addButton('搜索', `/铁匠铺购买搜索 ${category} `, { type: 'command', autoEnter: false, style: 'blue' })
  .addButton('下一页', `/铁匠铺购买页 ${category} ${Math.min(totalPages, page + 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page < totalPages ? 'blue' : undefined })
  .addRow().addButton('返回 铁匠铺', '/铁匠铺', { type: 'command', autoEnter: true });
const sellPageButtons = (page: number, totalPages: number, keyword = '') => Format.createButtonGroup().addRow()
  .addButton('上一页', `/铁匠铺出售页 ${Math.max(1, page - 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page > 1 ? 'blue' : undefined })
  .addButton('搜索', '/铁匠铺出售搜索 ', { type: 'command', autoEnter: false, style: 'blue' })
  .addButton('下一页', `/铁匠铺出售页 ${Math.min(totalPages, page + 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page < totalPages ? 'blue' : undefined })
  .addRow().addButton('返回 铁匠铺', '/铁匠铺', { type: 'command', autoEnter: true });

const buyFormat = async (qqUserId: string, page = 1, category = '全部', keyword = '') => {
  const shop = await blacksmithShopCatalog(qqUserId, page, category, keyword);
  const markdown = Format.createMarkdown().addTitle('铁匠铺·购买').addNewline().addNewline()
    .addBlockquote(keyword ? `小北翻出与「${keyword}」有关的货架清单。“这些都在这儿了。”` : '小北将一排制式装备摆上柜台。“都是普通货色，但结实耐用。出门在外，先有一件趁手的家伙总没错。”').addNewline().addNewline();
  if (!shop.items.length) markdown.addText('没有找到符合条件的装备。');
  const sequence = '①②③④⑤';
  shop.items.forEach((item, index) => markdown.addText(`${sequence[index]}【${item.category}】`).addButton(item.name, { data: `/物品图鉴 ${item.codexId}`, autoEnter: false }).addText(' ').addButton('[购买]', { data: `/购买铁匠铺装备 ${item.id} `, autoEnter: false }).addNewline().addBlockquote(`等级：Lv.${item.level}｜价格：铜币×${item.price}｜剩余：${item.stockQuantity}｜已拥有${item.ownedQuantity}`).addNewline().addBlockquote(`简介：${item.description}`).addNewline().addNewline());
  markdown.addText(`当前第(${shop.page}/${shop.totalPages})页｜持有铜币：${shop.copper}`);
  return Format.create().addMarkdown(markdown).addButtonGroup(pageButtons(shop.page, shop.totalPages, shop.category, shop.keyword));
};

const sellFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const shop = await blacksmithSellCatalog(qqUserId, page, keyword);
  const markdown = Format.createMarkdown().addTitle('铁匠铺·出售').addNewline().addNewline()
    .addBlockquote(keyword ? `小北看了看你挑出的「${keyword}」相关物品。` : '“未装备的武器和防具，还有兽材、锻材、元素尘都可以拿来。我会按材料与成色收下。”小北从铁砧旁拖来一只空木箱。').addNewline().addNewline();
  if (!shop.items.length) markdown.addText('没有可出售的未装备物品或锻造素材。');
  shop.items.forEach((item, index) => {
    const command = item.kind === 'equipment' ? `/出售铁匠铺装备 ${item.id}` : `/出售铁匠铺材料 ${item.id} `;
    const suffix = item.kind === 'equipment' ? ` #${item.id}` : `×${item.quantity}`;
    const detail = item.kind === 'equipment' ? `等级：Lv.${item.level}｜品质：${(item.quality ?? 0).toFixed(1)}%｜收购价：铜币×${item.price}` : `收购价：铜币×${item.price}`;
    markdown.addText(`${'①②③④⑤'[index]}【${item.category}】${item.name}${suffix} `).addButton('[出售]', { data: command, autoEnter: false }).addNewline().addBlockquote(detail).addNewline().addNewline();
  });
  markdown.addText(`当前第(${shop.page}/${shop.totalPages})页｜持有铜币：${shop.copper}`);
  return Format.create().addMarkdown(markdown).addButtonGroup(sellPageButtons(shop.page, shop.totalPages, shop.keyword));
};

export const blacksmithShopBuyListHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await requireBlacksmithShop(event.current.UserId); await message.send({ format: await buyFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('category') ?? '全部'), String(route.param('keyword') ?? '')) }); }
  catch (error) { await message.send({ format: messageFormat('无法购买', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const blacksmithShopBuySearchHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await requireBlacksmithShop(event.current.UserId); await message.send({ format: await buyFormat(event.current.UserId, 1, String(route.param('category') ?? '全部'), String(route.param('keyword'))) }); }
  catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const blacksmithShopPurchaseHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await requireBlacksmithShop(event.current.UserId); const requested = String(route.param('quantity') ?? '').trim(); const result = await buyBlacksmithEquipment(event.current.UserId, Number(route.param('id')), requested ? Number(requested) : 1); await addNpcAffinity(event.current.UserId, 'blacksmith', 'buy'); await message.send({ format: messageFormat('购买成功', `获得【${result.name}】×${result.quantity}\n消耗铜币×${result.price}`) }); await message.send({ format: await buyFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('购买失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const blacksmithShopSellListHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await requireBlacksmithShop(event.current.UserId); await message.send({ format: await sellFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) }); }
  catch (error) { await message.send({ format: messageFormat('无法出售', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const blacksmithShopSellSearchHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await requireBlacksmithShop(event.current.UserId); await message.send({ format: await sellFormat(event.current.UserId, 1, String(route.param('keyword'))) }); }
  catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const blacksmithShopSellHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await requireBlacksmithShop(event.current.UserId); const result = await sellBlacksmithEquipment(event.current.UserId, Number(route.param('instanceId'))); await addNpcAffinity(event.current.UserId, 'blacksmith', 'sell'); await message.send({ format: messageFormat('出售成功', `出售【${result.name}】\n获得铜币×${result.price}`) }); await message.send({ format: await sellFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('出售失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const blacksmithShopSellMaterialHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await requireBlacksmithShop(event.current.UserId); const requested = String(route.param('quantity') ?? '').trim(); const result = await sellBlacksmithMaterial(event.current.UserId, Number(route.param('itemId')), requested ? Number(requested) : 1); await addNpcAffinity(event.current.UserId, 'blacksmith', 'sell'); await message.send({ format: messageFormat('出售成功', `出售【${result.name}】×${result.quantity}\n获得铜币×${result.price}`) }); await message.send({ format: await sellFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('出售失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const blacksmithChatHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireBlacksmithShop(event.current.UserId);
    const { affinity, rank } = await addNpcAffinity(event.current.UserId, 'blacksmith', 'chat');
    const detailsUnlocked = (await nearbyPoints(event.current.UserId)).npcDetailsUnlocked;
    const text = npcChatDialogue('blacksmith', affinity);
    const craftHeart = await xiaobeiCraftsmanshipStatus(event.current.UserId);
    if (affinity >= 200 && !craftHeart.learned) {
      const markdown = Format.createMarkdown().addTitle('百纳镇·铁匠铺').addNewline().addNewline().addText('【漠北】').addNewline().addNewline().addBlockquote(text).addNewline().addNewline();
      if (detailsUnlocked) markdown.addText(`好感：${affinity}｜${rank.title}`).addNewline().addNewline();
      markdown.addText('小北从工具架上取下一枚刻着锤纹的铁片：“我有个不错的本事，或许你学得会。要不要试试？”').addNewline().addNewline()
        .addText('是否消耗 5 技能点学习绑定技能【匠心】？');
      const buttons = Format.createButtonGroup().addRow()
        .addButton('确认学习', '/学习小北的匠心', { type: 'command', autoEnter: true, style: 'blue' })
        .addButton('下次再来', '/铁匠铺', { type: 'command', autoEnter: true })
        .addRow().addButton('继续闲聊', '/铁匠铺闲聊', { type: 'command', autoEnter: true, style: 'blue' });
      await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
      return;
    }
    const markdown = Format.createMarkdown().addTitle('百纳镇·铁匠铺').addNewline().addNewline().addText('【漠北】').addNewline().addNewline().addBlockquote(text);
    if (detailsUnlocked) markdown.addNewline().addNewline().addText(`好感：${affinity}｜${rank.title}`);
    const buttons = Format.createButtonGroup().addRow().addButton('继续闲聊', '/铁匠铺闲聊', { type: 'command', autoEnter: true, style: 'blue' });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
  } catch (error) { await message.send({ format: messageFormat('无法闲聊', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const learnXiaobeiCraftsmanshipHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireBlacksmithShop(event.current.UserId);
    const result = await learnXiaobeiCraftsmanship(event.current.UserId);
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('学习技能').addNewline().addNewline().addText(`已学习绑定技能【${result.name}】，消耗 ${result.cost} 技能点。`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('技能列表', '/技能列表 已学习', { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回 铁匠铺', '/铁匠铺', { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('学习失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
