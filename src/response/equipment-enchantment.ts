import { Format, useEvent, useRoute } from 'alemonjs';
import { compatibleEnchantCards, enchantableEquipment, executeEquipmentEnchantment, previewEquipmentEnchantment } from '../game/equipment-enchantment.service';
import { equipmentSlotName, type MonsterCardTier } from '../config/monster-cards';
import { messageFormat } from '../game/message';
import { currentSecondaryShop } from '../game/secondary-shop-context';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { requireBlacksmith } from './blacksmith';

const marks = '①②③④⑤⑥⑦⑧⑨⑩';
const cardTierNames: Record<MonsterCardTier, string> = {
  normal: '普通小怪', large: '大怪', elite: '精英', boss: 'BOSS'
};
const inShop = () => currentSecondaryShop()?.shop === 'blacksmith';
const command = (name: string, suffix = '') => `/${inShop() ? '店铺' : ''}${name}${suffix ? ` ${suffix}` : ''}`;
const pages = <T>(all: T[], page: number) => {
  const total = Math.max(1, Math.ceil(all.length / 10));
  const current = Math.max(1, Math.min(total, Math.floor(page) || 1));
  return { entries: all.slice((current - 1) * 10, current * 10), current, total };
};

const equipmentListFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const all = (await enchantableEquipment(qqUserId)).filter(item => !keyword || item.name.includes(keyword) || item.category.includes(keyword) || item.enchantment?.cardName.includes(keyword));
  const view = pages(all, page);
  const markdown = Format.createMarkdown().addTitle('装备附魔').addNewline().addNewline()
    .addBlockquote('选择一件未穿戴、未寄售的装备。每件装备同时保留一个附魔；重新附魔会完整覆盖旧效果，熔铸升级会保留附魔。').addNewline().addNewline();
  if (!view.entries.length) markdown.addBlockquote('背包中没有符合条件的装备。').addNewline();
  for (const [index, item] of view.entries.entries()) {
    markdown.addBlockquote(`${marks.charAt(index)}【Lv.${item.level}·${item.category}】${item.name} #${item.id}\n当前附魔：${item.enchantment ? `${item.enchantment.cardName}｜${item.enchantment.effectText}` : '无'}`)
      .addText(' ').addButton('[选择]', { data: command('附魔放入', String(item.id)), autoEnter: false }).addNewline();
  }
  markdown.addText(`当前第（${view.current}/${view.total}）页`).addNewline();
  const buttons = Format.createButtonGroup().addRow()
    .addButton('上一页', command('附魔页', `${Math.max(1, view.current - 1)}${keyword ? ` ${keyword}` : ''}`), { type: 'command', autoEnter: false, style: view.current > 1 ? 'blue' : undefined })
    .addButton('搜索', command('附魔搜索', ''), { type: 'command', autoEnter: false, style: 'blue' })
    .addButton('下一页', command('附魔页', `${Math.min(view.total, view.current + 1)}${keyword ? ` ${keyword}` : ''}`), { type: 'command', autoEnter: false, style: view.current < view.total ? 'blue' : undefined });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

const cardListFormat = async (qqUserId: string, instanceId: number, page = 1, keyword = '') => {
  const result = await compatibleEnchantCards(qqUserId, instanceId);
  const all = result.cards.filter(card => !keyword || card.name.includes(keyword) || card.effectText.includes(keyword));
  const view = pages(all, page);
  const markdown = Format.createMarkdown().addTitle('装备附魔·选择卡片').addNewline().addNewline()
    .addText(`装备：【Lv.${result.equipment.level}·${result.equipment.category}】${result.equipment.name} #${result.equipment.id}`).addNewline()
    .addText(`该装备可放部位：${result.equipment.slots.map(equipmentSlotName).join(' / ')}`).addNewline().addNewline();
  if (!view.entries.length) markdown.addBlockquote('背包中没有满足该部位与装备等级要求的怪物卡片。').addNewline();
  for (const [index, card] of view.entries.entries()) {
    const binding = card.bound === 'personal' ? '个人绑定' : card.bound === 'trade' ? '交易绑定' : '未绑定';
    markdown.addBlockquote(`${marks.charAt(index)}【Lv.${card.level}·${cardTierNames[card.tier]}】${card.name}×${card.quantity}\n${card.effectText}\n附魔后可装备部位：${card.compatibleSlots.map(equipmentSlotName).join(' / ')}\n${binding}`)
      .addText(' ').addButton('[预览]', { data: command('附魔预览', `${instanceId} ${card.itemId}`), autoEnter: false }).addNewline();
  }
  markdown.addText(`当前第（${view.current}/${view.total}）页`).addNewline();
  const buttons = Format.createButtonGroup().addRow()
    .addButton('上一页', command('附魔卡片页', `${instanceId} ${Math.max(1, view.current - 1)}${keyword ? ` ${keyword}` : ''}`), { type: 'command', autoEnter: false, style: view.current > 1 ? 'blue' : undefined })
    .addButton('搜索', command('附魔卡片搜索', `${instanceId} `), { type: 'command', autoEnter: false, style: 'blue' })
    .addButton('下一页', command('附魔卡片页', `${instanceId} ${Math.min(view.total, view.current + 1)}${keyword ? ` ${keyword}` : ''}`), { type: 'command', autoEnter: false, style: view.current < view.total ? 'blue' : undefined })
    .addRow().addButton('返回装备', command('附魔'), { type: 'command', autoEnter: false });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

const sendError = async (title: string, error: unknown) => {
  const [message] = useMessage();
  await message.send({ format: messageFormat(title, error instanceof Error ? error.message : '请稍后重试。') });
};

export const enchantmentListHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await requireBlacksmith(event.current.UserId); await message.send({ format: await equipmentListFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) }); }
  catch (error) { await sendError('无法查看附魔装备', error); }
};
export const enchantmentSearchHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await requireBlacksmith(event.current.UserId); await message.send({ format: await equipmentListFormat(event.current.UserId, 1, String(route.param('keyword') ?? '')) }); }
  catch (error) { await sendError('无法搜索附魔装备', error); }
};
export const enchantmentPutHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await requireBlacksmith(event.current.UserId); await message.send({ format: await cardListFormat(event.current.UserId, Number(route.param('id'))) }); }
  catch (error) { await sendError('无法放入附魔装备', error); }
};
export const enchantmentCardPageHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await requireBlacksmith(event.current.UserId); await message.send({ format: await cardListFormat(event.current.UserId, Number(route.param('id')), Number(route.param('page')), String(route.param('keyword') ?? '')) }); }
  catch (error) { await sendError('无法查看附魔卡片', error); }
};
export const enchantmentCardSearchHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await requireBlacksmith(event.current.UserId); await message.send({ format: await cardListFormat(event.current.UserId, Number(route.param('id')), 1, String(route.param('keyword') ?? '')) }); }
  catch (error) { await sendError('无法搜索附魔卡片', error); }
};
export const enchantmentPreviewHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    await requireBlacksmith(event.current.UserId);
    const preview = await previewEquipmentEnchantment(event.current.UserId, Number(route.param('instanceId')), Number(route.param('cardItemId')));
    const markdown = Format.createMarkdown().addTitle('装备附魔·确认').addNewline().addNewline()
      .addText(`装备：【Lv.${preview.equipment.level}·${preview.equipment.category}】${preview.equipment.name} #${preview.equipment.id}`).addNewline()
      .addText(`当前：${preview.current ? `${preview.current.cardName}｜${preview.current.effectText}` : '无附魔'}`).addNewline().addNewline()
      .addText(`本次：${preview.card.name}`).addNewline().addBlockquote(preview.card.effectText).addNewline()
      .addText(`附魔后可装备部位：${preview.equipment.compatibleSlots.map(equipmentSlotName).join(' / ')}`).addNewline()
      .addText(`消耗：${preview.card.name}×1；铜币×${preview.fee}`).addNewline()
      .addText(`绑定结果：${preview.resultingBinding === 'personal' ? '个人绑定' : preview.resultingBinding === 'trade' ? '交易绑定' : '保持未绑定'}`).addNewline()
      .addText(preview.current ? '结果：旧附魔的全部效果会被覆盖。' : '结果：装备获得该卡片的全部效果。').addNewline();
    if (preview.warning) markdown.addBlockquote(`注意：${preview.warning}`).addNewline();
    markdown.addBlockquote(`确认凭据 ${preview.expiresMinutes} 分钟内有效；装备、卡片库存或原附魔变化后需重新预览。`);
    const buttons = Format.createButtonGroup().addRow()
      .addButton(preview.current ? '确认覆盖附魔' : '确认附魔', command('确认附魔', preview.token), { type: 'command', autoEnter: false, style: 'blue' })
      .addButton('返回选卡', command('附魔放入', String(preview.equipment.id)), { type: 'command', autoEnter: false });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
  } catch (error) { await sendError('无法预览附魔', error); }
};
export const enchantmentExecuteHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    await requireBlacksmith(event.current.UserId);
    const result = await executeEquipmentEnchantment(event.current.UserId, String(route.param('token')));
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle(result.covered ? '附魔覆盖完成' : '附魔完成').addNewline().addNewline()
      .addText(`【${result.equipmentName}】已附魔【${result.cardName}】`).addNewline().addBlockquote(result.effectText).addNewline().addText(`消耗铜币：${result.fee}`))
      .addButtonGroup(Format.createButtonGroup().addRow().addButton('查看装备', `/装备详情 ${result.instanceId}`, { type: 'command', autoEnter: false, style: 'blue' }).addButton('继续附魔', command('附魔'), { type: 'command', autoEnter: false })) });
  } catch (error) { await sendError('附魔失败', error); }
};
