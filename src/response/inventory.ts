import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { inventoryView } from '../game/adventure.service';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  const category = String(route.param('category') ?? '装备') as '装备' | '道具' | '材料';
  try {
    const result = await inventoryView(event.current.UserId, ['装备', '道具', '材料'].includes(category) ? category : '装备');
    const recent = result.recent.length ? result.recent.map(item => `[${item.item_category}·${item.name}]`).join('，') : '暂无获得记录。';
    const markdown = Format.createMarkdown().addTitle('背包').addText(`最近获得：${recent}\n\n`);
    for (const item of result.instances) markdown.addButton(`[${item.item_category}]${item.name}`, { data: `/物品图鉴 ${item.definition_id}`, autoEnter: false }).addText(` #${item.id}\n品质 ${Number(item.quality).toFixed(2)}%｜耐久 ${item.durability}/${item.durability_max}\n${item.description}\n\n`);
    for (const item of result.stacked) markdown.addButton(`[${item.item_category}]${item.name}`, { data: `/物品图鉴 ${item.id}`, autoEnter: false }).addText(` ×${item.quantity}\n${item.description}\n\n`);
    if (!result.instances.length && !result.stacked.length) markdown.addText('该分类暂无物品。');
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
      .addButton('装备', '/背包 装备', { type: 'command', autoEnter: true, style: category === '装备' ? 'blue' : undefined })
      .addButton('道具', '/背包 道具', { type: 'command', autoEnter: true, style: category === '道具' ? 'blue' : undefined })
      .addButton('材料', '/背包 材料', { type: 'command', autoEnter: true, style: category === '材料' ? 'blue' : undefined })) });
  } catch (error) { logger.warn({ err: error, userId: event.current.UserId }, 'load inventory failed'); await message.send({ format: messageFormat('背包不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};
