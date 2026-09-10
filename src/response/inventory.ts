import { randomUUID } from 'node:crypto';
import { Format, logger, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { inventory, inventoryView } from '../game/adventure.service';
import { clearQuickItem, quickItemConfig, setQuickItem, toggleQuickItem } from '../game/quick-item.service';
import { currentMainQuest } from '../game/main-quest.service';
import { messageFormat } from '../game/message';
import { activateDevice, activeDeviceList, clearDeviceQuickSlot, deactivateDevice, deviceDetail, deviceQuickConfig, deviceSkillDetail, setDeviceQuickSlot } from '../game/device.service';
import { discardMaterial } from '../game/inventory.service';
import {appendItemUse} from './item-use';
import { achievementRewards } from '../game/achievement.service';
import { achievementBoxes, type AchievementBoxKey } from '../game/achievement-rewards.config';
import { achievementBoxCommand } from '../game/achievement-message';

type InventoryCategory = '装备' | '道具' | '材料';
const categories: InventoryCategory[] = ['装备', '道具', '材料'];
const subcategories: Record<InventoryCategory, string[]> = {
  装备: ['全部', '武器', '头肩', '上装', '腰部', '下装', '脚部', '项链', '手镯', '戒指'],
  道具: ['全部', '药剂', '秘药', '投掷物', '符咒', '食物', '特殊', '地图', '图纸', '技能书'],
  材料: ['全部', '怪材', '建材', '锻材', '粒子', '基材', '构件', '炼材', '食材', '草药', '货币']
};

const isPermanentFootprintItem=(value:unknown)=>{
  try{const effect=typeof value==='string'?JSON.parse(value):value;return Boolean(effect&&typeof effect==='object'&&(effect as Record<string,unknown>).personalOnly);}
  catch{return false;}
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
  markdown.addText('> ');
  for (const [index, subcategory] of subcategories[category].entries()) {
    markdown.addButton(`[${subcategory}]`, { data: `/背包分类 ${category} ${subcategory} 1`, autoEnter: false });
    if ((index + 1) % 5 === 0 && index + 1 < subcategories[category].length) markdown.addNewline().addText('> '); else markdown.addText(' ');
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
  const rewards=await achievementRewards(qqUserId);
  const [result, mainQuest, carry] = await Promise.all([inventoryView(qqUserId, category), currentMainQuest(qqUserId), inventory(qqUserId)]);
  const weightText = `${carry.weight.toFixed(2)}/${carry.capacity.toFixed(2)} kg`;
  const canContemplate = mainQuest.title === '【主线·窥探世间】';
  const canContemplateEvolution = mainQuest.title === '【主线·感悟进化之种】';
  const markdown = Format.createMarkdown();
  if (!category) {
    markdown.addTitle('背包').addNewline().addNewline().addText(weightText).addText('\n\n最近获得：\n');
    for(const key of Object.keys(achievementBoxes) as AchievementBoxKey[])if(rewards.boxes[key]>0)markdown.addText(`${achievementBoxes[key].name} ×${rewards.boxes[key]} `).addButton('[打开]',{data:`/${achievementBoxCommand[key]} ${randomUUID()}`,autoEnter:false}).addText(' ').addButton('[批量打开]',{data:`/${achievementBoxCommand[key]} ${randomUUID()} `,autoEnter:false}).addNewline().addNewline();
    if (!result.recent.length) markdown.addBlockquote('暂无获得记录。');
    for (const item of result.recent) {
      markdown.addText('> ');
      markdown.addButton(`[${item.item_category}]${item.name}`, { data: `/物品图鉴 ${item.codex_id}`, autoEnter: false });
      appendItemUse(markdown,item);
      if (canContemplate && item.code === 'sky_dust') markdown.addText(' ').addButton('[窥探]', { data: '/窥探天空粉尘', autoEnter: false });
      if (canContemplateEvolution && item.code === 'evolution_seed') markdown.addText(' ').addButton('[感悟]', { data: '/感悟进化之种', autoEnter: false });
      markdown.addNewline();
    }
    return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
      .addButton('装备', '/背包 装备', { type: 'command', autoEnter: true })
      .addButton('道具', '/背包 道具', { type: 'command', autoEnter: true })
      .addButton('材料', '/背包 材料', { type: 'command', autoEnter: true }));
  }

  const normalizedKeyword = keyword.trim();
  const items = [
    ...(category==='道具'?(Object.keys(achievementBoxes) as AchievementBoxKey[]).filter(key=>rewards.boxes[key]>0).map(key=>({type:'achievement' as const,name:achievementBoxes[key].name,item_category:'特殊',quantity:rewards.boxes[key],code:key})):[]),
    ...result.instances.map(item => ({ type: 'instance' as const, ...item })),
    ...result.stacked.map(item => ({ type: 'stacked' as const, ...item }))
  ].filter(item => matchesSubcategory(category, subcategory, item.item_category))
    .filter(item => !normalizedKeyword || item.name.includes(normalizedKeyword) || item.item_category.includes(normalizedKeyword));
  const totalPages = Math.max(1, Math.ceil(items.length / 10));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const displayed = items.slice((currentPage - 1) * 10, currentPage * 10);
  markdown.addTitle(`背包·${category}`);
  if (category === '道具') markdown.addText(' ').addButton('[道具配置]', { data: '/道具配置', autoEnter: false });
  markdown.addNewline().addNewline().addText(weightText).addNewline().addNewline().addText('子分类：').addNewline();
  appendSubcategoryLinks(markdown, category);
  markdown.addText(`当前子分类：${subcategory}`).addNewline().addNewline();
  if (!displayed.length) markdown.addBlockquote(normalizedKeyword ? '没有找到符合条件的物品。' : '该分类暂无物品。');
  for (const item of displayed) {
    markdown.addText('> ');
    if(item.type==='achievement'){
      markdown.addText(`【特殊】${item.name} ×${item.quantity}｜个人绑定 `);
      const key=item.code as AchievementBoxKey,command=achievementBoxCommand[key];
      markdown.addButton('[打开]',{data:`/${command} ${randomUUID()}`,autoEnter:false}).addText(' ').addButton('[批量打开]',{data:`/${command} ${randomUUID()} `,autoEnter:false});
    } else if (item.type === 'instance') {
      markdown.addButton(`[${item.item_category}]${item.name}`, { data: `/装备详情 ${item.id}`, autoEnter: false })
        .addText(`｜品质 ${Number(item.quality).toFixed(2)}%｜耐久 ${item.durability}/${item.durability_max}｜${item.bound_kind==='none'?'未绑定':'已绑定'}${item.market_listing_id?'｜寄售中':''}`);
    } else {
      markdown.addButton(`[${item.item_category}]${item.name}`, { data: `/物品图鉴 ${item.codex_id}`, autoEnter: false }).addText(` × ${item.quantity}｜绑定 ${Number(item.trade_bound_quantity??0)+Number(item.personal_bound_quantity??0)}／未绑定 ${Number(item.quantity)-Number(item.trade_bound_quantity??0)-Number(item.personal_bound_quantity??0)}`);
      if(item.code.startsWith('automaton_feed_'))markdown.addText(' ').addButton('[使用]',{data:`/机巧 选人偶 0 ${item.code.slice(15)}`,autoEnter:false});
      appendItemUse(markdown,item);
      if (canContemplate && item.code === 'sky_dust') markdown.addText(' ').addButton('[窥探]', { data: '/窥探天空粉尘', autoEnter: false });
      if (canContemplateEvolution && item.code === 'evolution_seed') markdown.addText(' ').addButton('[感悟]', { data: '/感悟进化之种', autoEnter: false });
      if (category === '材料'&&!isPermanentFootprintItem(item.effect_json)) markdown.addText(' ').addButton('[丢弃]', { data: `/丢弃材料 ${item.id} `, autoEnter: false });
    }
    markdown.addNewline();
  }
  markdown.addNewline().addText(`当前第（${currentPage}/${totalPages}）页`);
  return Format.create().addMarkdown(markdown).addButtonGroup(pageButtons(category, subcategory, currentPage, totalPages, normalizedKeyword));
};

const deviceFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const normalizedKeyword = keyword.trim(); const items = (await activeDeviceList(qqUserId)).filter(item => !normalizedKeyword || item.name.includes(normalizedKeyword));
  const totalPages = Math.max(1, Math.ceil(items.length / 10)); const currentPage = Math.min(Math.max(1, page), totalPages); const displayed = items.slice((currentPage - 1) * 10, currentPage * 10);
  const markdown = Format.createMarkdown().addTitle('异械').addNewline().addNewline().addText('已拥有异械：').addNewline();
  if (!displayed.length) markdown.addText(normalizedKeyword ? '没有找到符合条件的异械。' : '暂无异械。');
  for (const item of displayed) {
    const activeText = item.activeDefinition ? `主动异械${item.quickSlot ? `｜已配置异械${'①②③④'.charAt(item.quickSlot - 1)}` : ''}` : '被动异械';
    markdown.addBlockquote('').addButton(`【${item.name}】`, { data: `/异械详情 ${item.id}`, autoEnter: false })
      .addText(`｜${item.active ? '已生效' : '未生效'}｜${activeText} `)
      .addButton(item.active ? '[解除]' : '[激活]', { data: `${item.active ? '/异械解除' : '/异械生效'} ${item.id}`, autoEnter: false });
    if (item.active && item.activeDefinition) markdown.addText(' ').addButton('[配置]', { data: `/异械配置设置 ${item.id}`, autoEnter: false });
    markdown.addNewline();
  }
  markdown.addText(`当前第（${currentPage}/${totalPages}）页`);
  const command = (target: number) => `/异械分页 ${target}${normalizedKeyword ? ` ${normalizedKeyword}` : ''}`;
  const buttons = Format.createButtonGroup().addRow()
    .addButton('上一页', command(Math.max(1, currentPage - 1)), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined })
    .addButton('搜索', '/异械搜索 ', { type: 'command', autoEnter: false })
    .addButton('下一页', command(Math.min(totalPages, currentPage + 1)), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined })
    .addRow().addButton('主动配置', '/异械配置', { type: 'command', autoEnter: true, style: 'blue' }).addButton('背包', '/背包', { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

const deviceTargetScopeText: Record<string, string> = { self: '自身', ally: '友方单体', enemy: '敌方单体', all_allies: '全体友方', all_enemies: '全体敌方', any: '任意单位' };

const deviceDetailFormat = async (qqUserId: string, instanceId: number) => {
  const device = await deviceDetail(qqUserId, instanceId);
  const markdown = Format.createMarkdown().addTitle('异械详情').addNewline().addNewline()
    .addText(`【${device.name}】\n类别：${device.activeDefinition ? '主动异械' : '被动异械'}\n状态：${device.active ? '已生效' : '未生效'}${device.activeDefinition && device.quickSlot ? `｜已配置异械${'①②③④'.charAt(device.quickSlot - 1)}` : ''}`).addNewline().addNewline()
    .addText('简介：').addNewline().addBlockquote(device.description).addNewline();
  markdown.addNewline().addText('实际效果：').addNewline();
  for (const effect of device.actualEffects) markdown.addBlockquote(effect).addNewline();
  if (!device.activeDefinition) {
    if (!device.actualEffects.length) markdown.addBlockquote('该异械生效后自动发挥作用，无需配置到异械栏位。');
  } else {
    for (const skill of device.activeDefinition.skills) {
      markdown.addBlockquote('').addButton(skill.name, { data: `/异械技能详情 ${device.id} ${skill.code}`, autoEnter: false })
        .addText(`：${skill.description}`).addNewline()
        .addBlockquote(`充能 ${skill.energyCost}/${device.activeDefinition.maxEnergy}｜冷却 ${skill.cooldownTurns || '无'}${skill.cooldownTurns ? '回合' : ''}｜目标 ${deviceTargetScopeText[skill.targetScope] ?? skill.targetScope}`).addNewline();
    }
  }
  const buttons = Format.createButtonGroup().addRow().addButton('返回 异械', '/异械', { type: 'command', autoEnter: true });
  if (device.active && device.activeDefinition) buttons.addButton('主动配置', `/异械配置设置 ${device.id}`, { type: 'command', autoEnter: true, style: 'blue' });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

const deviceSkillDetailFormat = async (qqUserId: string, instanceId: number, skillCode: string) => {
  const { device, skill, maxEnergy } = await deviceSkillDetail(qqUserId, instanceId, skillCode);
  const markdown = Format.createMarkdown().addTitle(`异械技·${skill.name}`).addNewline().addNewline()
    .addText(`所属异械：【${device.name}】\n充能消耗：${skill.energyCost}/${maxEnergy}\n冷却：${skill.cooldownTurns ? `${skill.cooldownTurns} 回合` : '无'}\n目标：${deviceTargetScopeText[skill.targetScope] ?? skill.targetScope}`).addNewline().addNewline()
    .addText('效果：').addNewline().addBlockquote(skill.description).addNewline().addNewline()
    .addBlockquote('异械充能不会随回合自然恢复；能量不足时，使用该异械会消耗本回合为其充能 30 点。');
  const buttons = Format.createButtonGroup().addRow().addButton('异械详情', `/异械详情 ${device.id}`, { type: 'command', autoEnter: true }).addButton('主动配置', '/异械配置', { type: 'command', autoEnter: true, style: device.active ? 'blue' : undefined });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

const deviceQuickConfigFormat = async (qqUserId: string) => {
  const data = await deviceQuickConfig(qqUserId); const slots = new Map(data.slots.map(item => [item.quickSlot!, item]));
  const markdown = Format.createMarkdown().addTitle('异械·主动配置').addNewline().addNewline()
    .addBlockquote('仅已生效的主动异械可配置。这里独立于 /技能列表；战斗中配置至少一件后才显示第三排【异械①-④】按键。').addNewline().addNewline();
  for (const slot of [1, 2, 3, 4]) {
    const current = slots.get(slot);
    markdown.addText(`异械${'①②③④'.charAt(slot - 1)}：${current ? current.activeDefinition?.skills[0]?.name ?? current.name : '未配置'} `);
    if (current) markdown.addButton('[取消]', { data: `/异械配置取消 ${slot}`, autoEnter: false });
    markdown.addNewline();
  }
  markdown.addNewline().addText('可配置的生效异械：').addNewline();
  if (!data.candidates.length) markdown.addBlockquote('暂无已生效主动异械。').addNewline();
  for (const device of data.candidates) {
    for (const [index, skill] of device.activeDefinition!.skills.entries()) {
      markdown.addBlockquote('').addButton(`${skill.name}（${skill.energyCost}/${device.activeDefinition!.maxEnergy}）`, { data: `/异械技能详情 ${device.id} ${skill.code}`, autoEnter: false });
      if (index === 0) markdown.addText(' ').addButton('[配置]', { data: `/异械配置设置 ${device.id}`, autoEnter: false });
      markdown.addNewline();
    }
  }
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回 异械', '/异械', { type: 'command', autoEnter: true }));
};

const deviceQuickChoiceFormat = async (qqUserId: string, instanceId: number) => {
  const data = await deviceQuickConfig(qqUserId); const device = data.candidates.find(item => item.id === instanceId);
  if (!device) throw new Error('该主动异械未生效或无法配置。');
  const markdown = Format.createMarkdown().addTitle('异械·选择栏位').addNewline().addNewline().addText(`【${device.name}】\n${device.activeDefinition!.skills.map(skill => `${skill.name}：${skill.description}`).join('\n')}`).addNewline().addNewline().addText('选择要覆盖的异械栏位：').addNewline();
  const buttons = Format.createButtonGroup().addRow();
  for (const slot of [1, 2, 3, 4]) buttons.addButton(`异械${'①②③④'.charAt(slot - 1)}`, `/异械配置确认 ${slot} ${device.id}`, { type: 'command', autoEnter: true, style: 'blue' });
  buttons.addRow().addButton('返回主动配置', '/异械配置', { type: 'command', autoEnter: true });
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

export const deviceDetailHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: await deviceDetailFormat(event.current.UserId, Number(route.param('id'))) }); }
  catch (error) { await message.send({ format: messageFormat('异械详情', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const deviceSkillDetailHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: await deviceSkillDetailFormat(event.current.UserId, Number(route.param('id')), String(route.param('skillCode'))) }); }
  catch (error) { await message.send({ format: messageFormat('异械技能详情', error instanceof Error ? error.message : '请稍后重试。') }); }
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

export const deviceQuickConfigHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await message.send({ format: await deviceQuickConfigFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('异械配置失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const deviceQuickChoiceHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: await deviceQuickChoiceFormat(event.current.UserId, Number(route.param('id'))) }); }
  catch (error) { await message.send({ format: messageFormat('异械配置失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const deviceQuickSetHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await setDeviceQuickSlot(event.current.UserId, Number(route.param('slot')), Number(route.param('id'))); await message.send({ format: await deviceQuickConfigFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('异械配置失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const deviceQuickClearHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await clearDeviceQuickSlot(event.current.UserId, Number(route.param('slot'))); await message.send({ format: await deviceQuickConfigFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('异械配置失败', error instanceof Error ? error.message : '请稍后重试。') }); }
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
