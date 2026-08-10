import { Format, useEvent, useMessage } from 'alemonjs';
import { equipment } from '../game/adventure.service';
import { messageFormat } from '../game/message';

const slotNames: Record<string, string> = {
  weapon: '武器', offhand: '副手', shoulder: '头肩', upper: '上装', waist: '腰部',
  lower: '下装', feet: '脚部', necklace: '项链', bracelet: '手镯', ring: '戒指'
};

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const items = await equipment(event.current.UserId);
    const markdown = Format.createMarkdown().addTitle('我的装备');
    if (!items.length) markdown.addText('\n当前没有装备。');
    for (const item of items) {
      markdown.addText(`\n【${slotNames[item.slot] ?? item.slot}】`);
      if (item.instance_id) markdown.addButton(item.name, { data: `/装备详情 ${item.instance_id}`, autoEnter: true });
      else markdown.addText(item.name);
    }
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('操作面板', '/面板', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('装备不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};
