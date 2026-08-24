import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { inventoryView } from '../game/adventure.service';
import { clearQuickItem, quickItemConfig, setQuickItem, toggleQuickItem } from '../game/quick-item.service';
import { currentMainQuest } from '../game/main-quest.service';
import { messageFormat } from '../game/message';
import { activateDevice, activeDeviceList, deactivateDevice } from '../game/device.service';
import { discardMaterial } from '../game/inventory.service';

type InventoryCategory = '装备' | '道具' | '材料';
const categories: InventoryCategory[] = ['装备', '道具', '材料'];
const subcategories: Record<InventoryCategory, string[]> = {
  装备: ['全部', '武器', '头肩', '上装', '腰部', '下装', '脚部', '项链', '手镯', '戒指', '异械'],
  道具: ['全部', '药剂', '食物', '特殊', '地图', '图纸'],
  材料: ['全部', '怪材', '建材', '锻材', '粒子', '元素尘', '基材', '构件', '炼材', '食材', '草药', '货币']
};

const parseCategory = (value: unknown): InventoryCategory | undefined => {
  const category = String(value ?? '');
  return categories.includes(category as InventoryCategory) ? category as InventoryCategory : undefined;
};

const parseSubcategory = (category: InventoryCategory, value: unknown) => {
  const subcategory = String(value ?? '全部');
  return subcategories[category].includes(subcategory) ? subcategory : undefined;
};

const matchesSubcategory = (category: InventoryCategory, subcategory: string, itemCategory: string) => {
  if (subcategory === '全部') return true;
  if (category === '装备' && subcategory === '武器') return itemCategory === '武器' || itemCategory === '副手';
  if (category === '装备' && subcategory === '头肩') return itemCategory === '头肩' || itemCategory === '头部';
  return itemCategory === subcategory;
};

const appendSubcategoryLinks = (markdown: ReturnType<typeof Format.createMarkdown>, category: InventoryCategory) => {
  markdown.addBlockquote('');
  for (const [index, subcategory] of subcategories[category].entries()) {
    markdown.addButton(`[${subcategory}]`, { data: `/背包分类 ${category} ${subcategory} 1`, autoEnter: false });
    if ((index + 1) % 5 === 0 && index + 1 < subcategories[category].length) markdown.addNewline().addBlockquote(''); else markdown.addText(' ');
  }
  // 用空行结束引用块，后续的分隔线与页码必须保持正文样式。
  markdown.addNewline().addNewline();
};

const pageButtons = (category: InventoryCategory, subcategory: string, page: number, totalPages: number, keyword: string) => {
  const command = (target: number) => subcategory === '全部'
    ? `/背包分页 ${category} ${target}${keyword ? ` ${keyword}` : ''}`
    : `/背包分类 ${category} ${subcategory} ${target}${keyword ? ` ${keyword}` : ''}`;
  const search = subcategory === '全部' ? `/背包搜索 ${category} ` : `/背包分类搜索 ${category} ${subcategory} `;
  return Format.createButtonGroup().addRow()
    .addButton('上一页', command(Math.max(1, page - 1)), { type: 'command', autoEnter: true, style: page > 1 ? 'blue' : undefined })
    .addButton('搜索', search, { type: 'command', autoEnter: false })
    .addButton('下一页', command(Math.min(totalPages, page + 1)), { type: 'command', autoEnter: true, style: page < totalPages ? 'blue' : undefined })
    .addRow()
    .addButton('装备', '/背包 装备', { type: 'command', autoEnter: true })
    .addButton('道具', '/背包 道具', { type: 'command', autoEnter: true })
    .addButton('材料', '/背包 材料', { type: 'command', autoEnter: true });
};

const inventoryFormat = async (qqUserId: string, category?: InventoryCategory, page = 1, keyword = '', subcategory = '全部') => {
  const [result, mainQuest] = await Promise.all([inventoryView(qqUserId, category), currentMainQuest(qqUserId)]);
  const canContemplate = mainQuest.title === '【主线·窥探世间】';
  const markdown = Format.createMarkdown();
  if (!category) {
    markdown.addTitle('背包').addText('\n\n最近获得：\n');
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
  ].filter(item => matchesSubcategory(category, subcategory, item.item_category))
    .filter(item => !normalizedKeyword || item.name.includes(normalizedKeyword) || item.item_category.includes(normalizedKeyword));
  const totalPages = Math.max(1, Math.ceil(items.length / 10));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const displayed = items.slice((currentPage - 1) * 10, currentPage * 10);
  markdown.addTitle(`背包·${category}`);
  if (category === '道具') markdown.addText(' ').addButton('[道具配置]', { data: '/道具配置', autoEnter: false });
  markdown.addNewline().addNewline().addText('子分类：').addNewline();
  appendSubcategoryLinks(markdown, category);
  markdown.addText(`当前子分类：${subcategory}`).addNewline().addNewline();
  if (!displayed.length) markdown.addText(normalizedKeyword ? '没有找到符合条件的物品。' : '该分类暂无物品。');
  for (const item of displayed) {
    markdown.addBlockquote('');
    if (item.type === 'instance') {
      markdown.addButton(`[${item.item_category}]${item.name}`, { data: `/装备详情 ${item.id}`, autoEnter: false })
        .addText(`｜品质 ${Number(item.quality).toFixed(2)}%｜耐久 ${item.durability}/${item.durability_max}`);
    } else {
      markdown.addButton(`[${item.item_category}]${item.name}`, { data: `/物品图鉴 ${item.codex_id}`, autoEnter: false }).addText(` × ${item.quantity}`);
      if (item.item_category === '技能书') markdown.addText(' ').addButton('[研读]', { data: `/研读技能书 ${item.id}`, autoEnter: false });
      if (canContemplate && item.code === 'sky_dust') markdown.addText(' ').addButton('[窥探]', { data: '/窥探天空粉尘', autoEnter: false });
      if (category === '材料') markdown.addText(' ').addButton('[丢弃]', { data: `/丢弃材料 ${item.id} `, autoEnter: false });
    }
    markdown.addNewline();
  }
  markdown.addNewline().addText(`当前第（${currentPage}/${totalPages}）页`);
  return Format.create().addMarkdown(markdown).addButtonGroup(pageButtons(category, subcategory, currentPage, totalPages, normalizedKeyword));
};

const deviceFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const normalizedKeyword = keyword.trim(); const items = (await activeDeviceList(qqUserId)).filter(item => !normalizedKeyword || item.name.includes(normalizedKeyword));
  const totalPages = Math.max(1, Math.ceil(items.length / 10)); const currentPage = Math.min(Math.max(1, page), totalPages); const displayed = items.slice((currentPage - 1) * 10, currentPage * 10);
  const markdown = Format.createMarkdown().addTitle('异械').addNewline().addNewline().addText('辅助器材：').addNewline();
  if (!displayed.length) markdown.addText(normalizedKeyword ? '没有找到符合条件的异械。' : '暂无异械。');
  for (const item of displayed) markdown.addBlockquote('').addButton(`【异械】${item.name}`, { data: `/装备详情 ${item.id}`, autoEnter: false })
    .addText(`｜品质 ${item.quality.toFixed(2)}%｜耐久 ${item.durability}/${item.durabilityMax}｜${item.active ? '已生效' : '未生效'} `)
    .addButton(item.active ? '[解除]' : '[生效]', { data: `${item.active ? '/异械解除' : '/异械生效'} ${item.id}`, autoEnter: false }).addNewline();
  markdown.addText(`当前第（${currentPage}/${totalPages}）页`);
  const command = (target: number) => `/异械分页 ${target}${normalizedKeyword ? ` ${normalizedKeyword}` : ''}`;
  const buttons = Format.createButtonGroup().addRow()
    .addButton('上一页', command(Math.max(1, currentPage - 1)), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined })
    .addButton('搜索', '/异械搜索 ', { type: 'command', autoEnter: false })
    .addButton('下一页', command(Math.min(totalPages, currentPage + 1)), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined })
    .addRow().addButton('背包', '/背包 装备', { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
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

export const inventorySubcategoryHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const category = parseCategory(route.param('category')); if (!category) throw new Error('不存在该背包分类。');
    const subcategory = parseSubcategory(category, route.param('subcategory')); if (!subcategory) throw new Error('不存在该子分类。');
    await message.send({ format: await inventoryFormat(event.current.UserId, category, Number(route.param('page') ?? 1), String(route.param('keyword') ?? ''), subcategory) });
  } catch (error) { await message.send({ format: messageFormat('背包不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const inventorySubcategorySearchHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const category = parseCategory(route.param('category')); if (!category) throw new Error('不存在该背包分类。');
    const subcategory = parseSubcategory(category, route.param('subcategory')); if (!subcategory) throw new Error('不存在该子分类。');
    await message.send({ format: await inventoryFormat(event.current.UserId, category, 1, String(route.param('keyword') ?? ''), subcategory) });
  } catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const discardMaterialHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const result = await discardMaterial(event.current.UserId, Number(route.param('id')), Number(route.param('quantity') ?? 1));
    await message.send({ format: messageFormat('丢弃成功', `已丢弃【${result.name}】×${result.quantity}\n剩余：${result.remaining}`) });
    await message.send({ format: await inventoryFormat(event.current.UserId, '材料') });
  } catch (error) { await message.send({ format: messageFormat('无法丢弃', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const deviceHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await message.send({ format: await deviceFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('异械不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const devicePageHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: await deviceFormat(event.current.UserId, Number(route.param('page')), String(route.param('keyword') ?? '')) }); }
  catch (error) { await message.send({ format: messageFormat('异械不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const deviceSearchHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: await deviceFormat(event.current.UserId, 1, String(route.param('keyword') ?? '')) }); }
  catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const activateDeviceHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await activateDevice(event.current.UserId, Number(route.param('id'))); await message.send({ format: await deviceFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('异械生效失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const deactivateDeviceHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await deactivateDevice(event.current.UserId, Number(route.param('id'))); await message.send({ format: await deviceFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('异械解除失败', error instanceof Error ? error.message : '请稍后重试。') }); }
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
