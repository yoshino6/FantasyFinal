import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { requireNpcAtCurrentPosition } from '../game/adventure.service';
import {
  MARKET_TYPES, cancelMarketOrder, createMarketBuyOrder, createMarketSellOrder,
  marketCatalog, marketFeeProfile, marketItemDetail, marketOrders, marketSellable
} from '../game/market.service';
import { messageFormat } from '../game/message';
import { girlGratitudeStage } from '../game/girl-gratitude.service';

const marketCode = 'canopy_exchange';
const sequence = '①②③④⑤';
const access = async (qqUserId: string) => {
  await requireNpcAtCurrentPosition(qqUserId, marketCode);
  if (await girlGratitudeStage(qqUserId) < 6) throw new Error('先完成梨子喵的谢礼之约，万叶联会才会向你开放。');
};
const fail = async (message: any, title: string, error: unknown) => message.send({ format: messageFormat(title, error instanceof Error ? error.message : '请稍后重试。') });

const listButtons = (page: number, totalPages: number, type: string, keyword: string) => {
  const suffix = `${type}${keyword ? ` ${keyword}` : ''}`;
  const buttons = Format.createButtonGroup().addRow()
    .addButton('上一页', `/万叶市场 ${Math.max(1, page - 1)} ${suffix}`, { type: 'command', autoEnter: true, style: page > 1 ? 'blue' : undefined })
    .addButton('搜索', '/万叶搜索 ', { type: 'command', autoEnter: false, style: 'blue' })
    .addButton('下一页', `/万叶市场 ${Math.min(totalPages, page + 1)} ${suffix}`, { type: 'command', autoEnter: true, style: page < totalPages ? 'blue' : undefined });
  buttons.addRow();
  for (const typeName of MARKET_TYPES) buttons.addButton(typeName, `/万叶市场 1 ${typeName}`, { type: 'command', autoEnter: true, style: typeName === type ? 'blue' : undefined });
  buttons.addRow().addButton('返回 万叶联市', '/万叶联市', { type: 'command', autoEnter: true });
  return buttons;
};

export const marketHomeFormat = async (qqUserId: string) => {
  const profile = await marketFeeProfile(qqUserId);
  const markdown = Format.createMarkdown().addTitle('万叶联市').addNewline().addNewline()
    .addBlockquote('世界树以叶脉记录货契，由树灵见证托管与结算。双方姓名不会出现在订单上；价与量，才是这里唯一的语言。').addNewline().addNewline()
    .addText(`本周已售：铜币×${profile.gross}｜已缴手续费：铜币×${profile.fees}`).addNewline()
    .addBlockquote(`下一笔成交手续费：${profile.nextRate}%｜订单最多保留 72 小时`).addNewline().addNewline()
    .addText('提示：市场订单受参考价区间约束，成交后会随供求平缓调整。');
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('浏览市场', '/万叶市场 1 全部', { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('我要出售', '/万叶出售 1', { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('我要收购', '/万叶市场 1 全部', { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('我的订单', '/万叶订单', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('手续费说明', '/万叶手续费', { type: 'command', autoEnter: true }).addButton('离开', '/建筑离开 canopy_exchange', { type: 'command', autoEnter: true }));
};

const marketListFormat = async (qqUserId: string, page: number, type: string, keyword: string) => {
  const market = await marketCatalog(qqUserId, page, type, keyword);
  const markdown = Format.createMarkdown().addTitle('万叶联市·订单簿').addNewline().addNewline()
    .addBlockquote(keyword ? `正在查找「${keyword}」｜类型：${market.type}` : `类型：${market.type}｜选择物品可查看说明与挂单区间。`).addNewline().addNewline();
  if (!market.items.length) markdown.addText('暂时没有符合条件的公开订单。').addNewline().addNewline();
  market.items.forEach((item, index) => {
    const sell = item.lowestSell === null ? '暂无' : `铜币×${item.lowestSell}`;
    const buy = item.highestBuy === null ? '暂无' : `铜币×${item.highestBuy}`;
    markdown.addText(`${sequence[index]}【${item.category}】${item.name} `).addButton('[详情]', { data: `/万叶详情 ${item.id}`, autoEnter: false }).addNewline()
      .addBlockquote(`最低售价：${sell}｜最高求购：${buy}｜参考：${item.reference}`).addNewline().addNewline();
  });
  markdown.addText(`第 ${market.page}/${market.totalPages} 页｜持有铜币：${market.copper}`);
  return Format.create().addMarkdown(markdown).addButtonGroup(listButtons(market.page, market.totalPages, market.type, market.keyword));
};

const sellListFormat = async (qqUserId: string, page: number, keyword: string) => {
  const catalog = await marketSellable(qqUserId, page, keyword);
  const markdown = Format.createMarkdown().addTitle('万叶联市·寄售').addNewline().addNewline()
    .addBlockquote(keyword ? `背包中与「${keyword}」有关、可由联市托管的物品如下。` : '选择物品查看详情；寄售后物品会进入树灵托管，未成交前不能使用。').addNewline().addNewline();
  if (!catalog.items.length) markdown.addText('背包中没有可寄售的常规堆叠物品。').addNewline().addNewline();
  catalog.items.forEach((item, index) => markdown.addText(`${sequence[index]}【${item.category}】${item.name} ×${item.quantity} `).addButton('[详情]', { data: `/万叶详情 ${item.id}`, autoEnter: false }).addNewline()
    .addBlockquote(`当前参考价：铜币×${item.reference}`).addNewline().addNewline());
  markdown.addText(`第 ${catalog.page}/${catalog.totalPages} 页`);
  const buttons = Format.createButtonGroup().addRow()
    .addButton('上一页', `/万叶出售 ${Math.max(1, catalog.page - 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: catalog.page > 1 ? 'blue' : undefined })
    .addButton('搜索', '/万叶出售搜索 ', { type: 'command', autoEnter: false, style: 'blue' })
    .addButton('下一页', `/万叶出售 ${Math.min(catalog.totalPages, catalog.page + 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: catalog.page < catalog.totalPages ? 'blue' : undefined })
    .addRow().addButton('返回 万叶联市', '/万叶联市', { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

const detailFormat = async (qqUserId: string, itemId: number) => {
  const item = await marketItemDetail(qqUserId, itemId);
  const sell = item.lowestSell === null ? '暂无公开卖单' : `铜币×${item.lowestSell}`;
  const buy = item.highestBuy === null ? '暂无公开求购' : `铜币×${item.highestBuy}`;
  const markdown = Format.createMarkdown().addTitle(`万叶联市·${item.name}`).addNewline().addNewline()
    .addText(`【${item.category}】${item.name}`).addNewline().addNewline().addBlockquote(item.description).addNewline().addNewline()
    .addText(`参考价：铜币×${item.reference}｜可挂区间：${item.band.min}～${item.band.max}`).addNewline()
    .addText(`最低售价：${sell}｜最高求购：${buy}`).addNewline()
    .addBlockquote(`近 24 小时成交量：${item.volume}｜仅展示匿名订单。`).addNewline().addNewline()
    .addText('指令格式：').addNewline().addText(`/万叶卖出 ${item.id} 单价 数量`).addNewline().addText(`/万叶求购 ${item.id} 单价 数量`);
  const buttons = Format.createButtonGroup().addRow()
    .addButton('发布卖单', `/万叶卖出 ${item.id} `, { type: 'command', autoEnter: false, style: 'blue' })
    .addButton('发布求购', `/万叶求购 ${item.id} `, { type: 'command', autoEnter: false, style: 'blue' });
  if (item.lowestSell !== null) buttons.addButton('按最低价买入', `/万叶求购 ${item.id} ${item.lowestSell} `, { type: 'command', autoEnter: false });
  buttons.addRow().addButton('返回 市场', '/万叶市场 1 全部', { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

const ordersFormat = async (qqUserId: string) => {
  const result = await marketOrders(qqUserId);
  const markdown = Format.createMarkdown().addTitle('万叶联市·我的订单').addNewline().addNewline()
    .addBlockquote(`持有铜币：${result.copper}｜本周已售：${result.volume.gross}｜手续费：${result.volume.fees}`).addNewline().addNewline();
  if (!result.orders.length) markdown.addText('还没有提交过市场订单。').addNewline().addNewline();
  result.orders.forEach((order, index) => {
    const side = order.side === 'sell' ? '寄售' : '求购';
    const state = ({ open: '等待成交', partial: '部分成交', filled: '已完成', cancelled: '已撤销', expired: '已到期', frozen: '审核中' } as Record<string, string>)[order.status] ?? order.status;
    markdown.addText(`${index + 1}.【${side}】${order.name} ×${order.remaining}/${order.total}`).addNewline().addBlockquote(`单价：铜币×${order.price}｜${state}`).addNewline();
    if (order.status === 'open' || order.status === 'partial') markdown.addButton('[撤销订单]', { data: `/万叶撤单 ${order.id}`, autoEnter: false }).addNewline();
    markdown.addNewline();
  });
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回 万叶联市', '/万叶联市', { type: 'command', autoEnter: true }));
};

export const marketHomeHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await access(event.current.UserId); await message.send({ format: await marketHomeFormat(event.current.UserId) }); } catch (error) { await fail(message, '无法进入万叶联市', error); } };
export const marketListHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await access(event.current.UserId); await message.send({ format: await marketListFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('type') ?? '全部'), String(route.param('keyword') ?? '')) }); } catch (error) { await fail(message, '市场暂不可用', error); } };
export const marketSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await access(event.current.UserId); await message.send({ format: await marketListFormat(event.current.UserId, 1, '全部', String(route.param('keyword') ?? '')) }); } catch (error) { await fail(message, '搜索失败', error); } };
export const marketSellListHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await access(event.current.UserId); await message.send({ format: await sellListFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) }); } catch (error) { await fail(message, '寄售列表不可用', error); } };
export const marketSellSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await access(event.current.UserId); await message.send({ format: await sellListFormat(event.current.UserId, 1, String(route.param('keyword') ?? '')) }); } catch (error) { await fail(message, '搜索失败', error); } };
export const marketDetailHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await access(event.current.UserId); await message.send({ format: await detailFormat(event.current.UserId, Number(route.param('id'))) }); } catch (error) { await fail(message, '无法查看物品', error); } };
export const marketSellHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await access(event.current.UserId); const result = await createMarketSellOrder(event.current.UserId, Number(route.param('id')), Number(route.param('price')), Number(route.param('quantity'))); const suffix = result.remaining ? `，剩余 ${result.remaining} 件等待成交。` : '，已全部成交。'; await message.send({ format: messageFormat('寄售订单已提交', `【${result.name}】×${result.quantity}，单价铜币×${result.price}${suffix}`) }); await message.send({ format: await marketHomeFormat(event.current.UserId) }); } catch (error) { await fail(message, '寄售失败', error); } };
export const marketBuyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await access(event.current.UserId); const result = await createMarketBuyOrder(event.current.UserId, Number(route.param('id')), Number(route.param('price')), Number(route.param('quantity'))); const suffix = result.remaining ? `，剩余 ${result.remaining} 件继续公开求购。` : '，已全部成交。'; await message.send({ format: messageFormat('求购订单已提交', `【${result.name}】×${result.quantity}，单价铜币×${result.price}${suffix}`) }); await message.send({ format: await marketHomeFormat(event.current.UserId) }); } catch (error) { await fail(message, '求购失败', error); } };
export const marketOrdersHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await access(event.current.UserId); await message.send({ format: await ordersFormat(event.current.UserId) }); } catch (error) { await fail(message, '订单列表不可用', error); } };
export const marketCancelHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await access(event.current.UserId); const result = await cancelMarketOrder(event.current.UserId, Number(route.param('id'))); const fee = result.fee ? `快速撤单费用：铜币×${result.fee}\n` : ''; await message.send({ format: messageFormat('订单已撤销', fee + (result.side === 'sell' ? `已退回托管物品×${result.quantity}。` : `已退回未成交部分的铜币。`)) }); await message.send({ format: await ordersFormat(event.current.UserId) }); } catch (error) { await fail(message, '撤单失败', error); } };
export const marketFeeHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await access(event.current.UserId);
    const profile = await marketFeeProfile(event.current.UserId);
    const markdown = Format.createMarkdown().addTitle('万叶联市·手续费').addNewline().addNewline()
      .addBlockquote('手续费仅在寄售成交时从成交额中扣除；\n\n发布免费，发布后 2 分钟内撤单会产生快速撤单费用。').addNewline().addNewline()
      .addText(`本周累计成交额：铜币×${profile.gross}`).addNewline().addNewline()
      .addBlockquote('0～10,000：3%').addNewline().addNewline()
      .addBlockquote('10,001～50,000：5%').addNewline().addNewline()
      .addBlockquote('50,001～150,000：8%').addNewline().addNewline()
      .addBlockquote('150,001～500,000：12%').addNewline().addNewline()
      .addBlockquote('500,000 以上：16%').addNewline().addNewline()
      .addBlockquote(`本周已缴：铜币×${profile.fees}｜主动撤单：${profile.cancellations} 次`);
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回 万叶联市', '/万叶联市', { type: 'command', autoEnter: true })) });
  } catch (error) { await fail(message, '无法查看手续费', error); }
};
