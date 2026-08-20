import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { inventoryView } from '../game/adventure.service';
import { clearQuickItem, quickItemConfig, setQuickItem, toggleQuickItem } from '../game/quick-item.service';
import { currentMainQuest } from '../game/main-quest.service';
import { messageFormat } from '../game/message';

type InventoryCategory = '装备' | '道具' | '材料';
const categories: InventoryCategory[] = ['装备', '道具', '材料'];

const parseCategory = (value: unknown): InventoryCategory | undefined => {
  const category = String(value ?? '');
  return categories.includes(category as InventoryCategory) ? category as InventoryCategory : undefined;
};

const pageButtons = (category: InventoryCategory, page: number, totalPages: number, keyword: string) => {
  const command = (target: number) => `/背包分页 ${category} ${target}${keyword ? ` ${keyword}` : ''}`;
  return Format.createButtonGroup().addRow()
    .addButton('上一页', command(Math.max(1, page - 1)), { type: 'command', autoEnter: true, style: page > 1 ? 'blue' : undefined })
    .addButton('搜索', `/背包搜索 ${category} `, { type: 'command', autoEnter: false })
    .addButton('下一页', command(Math.min(totalPages, page + 1)), { type: 'command', autoEnter: true, style: page < totalPages ? 'blue' : undefined })
    .addRow()
    .addButton('装备', '/背包 装备', { type: 'command', autoEnter: true })
    .addButton('道具', '/背包 道具', { type: 'command', autoEnter: true })
    .addButton('材料', '/背包 材料', { type: 'command', autoEnter: true });
};

const inventoryFormat = async (qqUserId: string, category?: InventoryCategory, page = 1, keyword = '') => {
  const [result, mainQuest] = await Promise.all([inventoryView(qqUserId, category), currentMainQuest(qqUserId)]);
  const canContemplate = mainQuest.title === '【主线·窥探世间】';
  const markdown = Format.createMarkdown().addTitle('背包');
  if (!category) {
    markdown.addText('\n\n最近获得：\n');
    if (!result.recent.length) markdown.addText('暂无获得记录。');
    for (const item of result.recent) {
      markdown.addButton(`[${item.item_category}]${item.name}`, { data: `/物品图鉴 ${item.codex_id}`, autoEnter: false });
      if (canContemplate && item.code === 'sky_dust') markdown.addText(' ').addButton('[窥探]', { data: '/窥探天空粉尘', autoEnter: false });
      markdown.addNewline();
    }
    return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
      .addButton('装备', '/背包 装备', { type: 'command', autoEnter: true })
      .addButton('道具', '/背包 道具', { type: 'command', autoEnter: true })
      .addButton('材料', '/背包 材料', { type: 'command', autoEnter: true }));
  }

  const normalizedKeyword = keyword.trim();
  const items = [
    ...result.instances.map(item => ({ type: 'instance' as const, ...item })),
    ...result.stacked.map(item => ({ type: 'stacked' as const, ...item }))
  ].filter(item => !normalizedKeyword || item.name.includes(normalizedKeyword) || item.item_category.includes(normalizedKeyword));
  const totalPages = Math.max(1, Math.ceil(items.length / 10));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const displayed = items.slice((currentPage - 1) * 10, currentPage * 10);
  markdown.addText(`\n\n${category}`);
  if (category === '道具') markdown.addText(' ').addButton('[道具配置]', { data: '/道具配置', autoEnter: false });
  markdown.addNewline();
  if (!displayed.length) markdown.addText(normalizedKeyword ? '没有找到符合条件的物品。' : '该分类暂无物品。');
  for (const item of displayed) {
    markdown.addBlockquote('');
    if (item.type === 'instance') {
      markdown.addButton(`[${item.item_category}]${item.name}`, { data: `/装备详情 ${item.id}`, autoEnter: false })
        .addText(`｜品质 ${Number(item.quality).toFixed(2)}%｜耐久 ${item.durability}/${item.durability_max}`);
    } else {
      markdown.addButton(`[${item.item_category}]${item.name}`, { data: `/物品图鉴 ${item.codex_id}`, autoEnter: false }).addText(` × ${item.quantity}`);
      if (canContemplate && item.code === 'sky_dust') markdown.addText(' ').addButton('[窥探]', { data: '/窥探天空粉尘', autoEnter: false });
    }
    markdown.addNewline();
  }
  return Format.create().addMarkdown(markdown).addButtonGroup(pageButtons(category, currentPage, totalPages, normalizedKeyword));
};

const quickSlotLabel = (slot: number) => `道具${'①②③④'.charAt(slot - 1) || slot}`;
const quickItemConfigFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const data = await quickItemConfig(qqUserId); const configured = new Set(data.slots.map(item => item.itemId)); const normalizedKeyword = keyword.trim();
  const items = data.items.filter(item => !normalizedKeyword || item.name.includes(normalizedKeyword) || item.category.includes(normalizedKeyword));
  const totalPages = Math.max(1, Math.ceil(items.length / 10)); const currentPage = Math.min(Math.max(1, page), totalPages); const displayed = items.slice((currentPage - 1) * 10, currentPage * 10);
  const markdown = Format.createMarkdown().addTitle('道具配置').addNewline().addNewline().addText('快捷道具：').addNewline();
  if (!data.slots.length) markdown.addBlockquote('暂无快捷道具。').addNewline();
  else for (const item of data.slots) markdown.addText(`${quickSlotLabel(item.slot)}  【${item.category}】${item.name}×${item.quantity} `).addButton('[取消快捷]', { data: `/道具快捷 ${item.itemId}`, autoEnter: false }).addNewline();
  markdown.addNewline().addText('背包道具：').addNewline();
  if (!displayed.length) markdown.addBlockquote(normalizedKeyword ? '没有找到符合条件的道具。' : '背包中没有可配置的战斗道具。').addNewline();
  for (const item of displayed) markdown.addBlockquote(`【${item.name}】 `).addButton('[详情]', { data: `/物品图鉴 ${item.codexId}`, autoEnter: false }).addText(' ').addButton(configured.has(item.id) ? '[取消快捷]' : '[快捷]', { data: `/道具快捷 ${item.id}`, autoEnter: false }).addNewline();
  markdown.addText(`当前第（${currentPage}/${totalPages}）页`);
  const command = (target: number) => `/道具配置分页 ${target}${normalizedKeyword ? ` ${normalizedKeyword}` : ''}`;
  const buttons = Format.createButtonGroup().addRow()
    .addButton('上一页', command(Math.max(1, currentPage - 1)), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined })
    .addButton('搜索', '/道具配置筛选 ', { type: 'command', autoEnter: false, style: 'blue' })
    .addButton('下一页', command(Math.min(totalPages, currentPage + 1)), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

const quickItemChoiceFormat = async (qqUserId: string, slot: number, page = 1, keyword = '') => {
  const data = await quickItemConfig(qqUserId); const normalizedKeyword = keyword.trim();
  const items = data.items.filter(item => !normalizedKeyword || item.name.includes(normalizedKeyword) || item.category.includes(normalizedKeyword));
  const totalPages = Math.max(1, Math.ceil(items.length / 10)); const currentPage = Math.min(Math.max(1, page), totalPages);
  const displayed = items.slice((currentPage - 1) * 10, currentPage * 10);
  const current = data.slots.find(item => item.slot === slot);
  const markdown = Format.createMarkdown().addTitle(`道具配置·${quickSlotLabel(slot)}`).addNewline().addNewline()
    .addText(`当前配置：${current ? `【${current.category}】${current.name}×${current.quantity}` : '未配置'}`).addNewline().addNewline().addText('可配置道具：').addNewline();
  if (!displayed.length) markdown.addBlockquote(normalizedKeyword ? '没有找到符合条件的道具。' : '背包中没有可配置的战斗道具。').addNewline();
  for (const [index, item] of displayed.entries()) markdown.addBlockquote(`${'①②③④⑤⑥⑦⑧⑨⑩'.charAt(index)}【${item.category}】${item.name}×${item.quantity}`).addText(' ').addButton('[配置]', { data: `/道具配置设置 ${slot} ${item.id}`, autoEnter: false }).addNewline();
  markdown.addText(`当前第（${currentPage}/${totalPages}）页`).addNewline();
  const command = (target: number) => `/道具配置选择 ${slot} ${target}${normalizedKeyword ? ` ${normalizedKeyword}` : ''}`;
  const buttons = Format.createButtonGroup().addRow()
    .addButton('上一页', command(Math.max(1, currentPage - 1)), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined })
    .addButton('搜索', `/道具配置搜索 ${slot} `, { type: 'command', autoEnter: false, style: 'blue' })
    .addButton('下一页', command(Math.min(totalPages, currentPage + 1)), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined })
    .addRow().addButton('返回道具配置', '/道具配置', { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  const category = parseCategory(route.param('category'));
  try {
    await message.send({ format: await inventoryFormat(event.current.UserId, category) });
  } catch (error) { logger.warn({ err: error, userId: event.current.UserId }, 'load inventory failed'); await message.send({ format: messageFormat('背包不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const inventoryPageHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const category = parseCategory(route.param('category')); if (!category) throw new Error('不存在该背包分类。');
    await message.send({ format: await inventoryFormat(event.current.UserId, category, Number(route.param('page')), String(route.param('keyword') ?? '')) });
  } catch (error) { await message.send({ format: messageFormat('背包不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const inventorySearchHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const category = parseCategory(route.param('category')); if (!category) throw new Error('不存在该背包分类。');
    await message.send({ format: await inventoryFormat(event.current.UserId, category, 1, String(route.param('keyword') ?? '')) });
  } catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const quickItemConfigHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await message.send({ format: await quickItemConfigFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('道具配置失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const quickItemConfigPageHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: await quickItemConfigFormat(event.current.UserId, Number(route.param('page')), String(route.param('keyword') ?? '')) }); }
  catch (error) { await message.send({ format: messageFormat('道具配置失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const quickItemConfigSearchHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: await quickItemConfigFormat(event.current.UserId, 1, String(route.param('keyword') ?? '')) }); }
  catch (error) { await message.send({ format: messageFormat('道具搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const quickItemToggleHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await toggleQuickItem(event.current.UserId, Number(route.param('id'))); await message.send({ format: await quickItemConfigFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('道具配置失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const quickItemChoiceHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: await quickItemChoiceFormat(event.current.UserId, Number(route.param('slot')), Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) }); }
  catch (error) { await message.send({ format: messageFormat('道具配置失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const quickItemSearchHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: await quickItemChoiceFormat(event.current.UserId, Number(route.param('slot')), 1, String(route.param('keyword') ?? '')) }); }
  catch (error) { await message.send({ format: messageFormat('道具搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const quickItemSetHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await setQuickItem(event.current.UserId, Number(route.param('slot')), Number(route.param('id'))); await message.send({ format: await quickItemConfigFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('道具配置失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const quickItemClearHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await clearQuickItem(event.current.UserId, Number(route.param('slot'))); await message.send({ format: await quickItemConfigFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('道具配置失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
