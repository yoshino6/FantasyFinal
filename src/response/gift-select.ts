import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { chooseGift } from '../game/character.service';
import { messageFormat } from '../game/message';

const panelButtons = () => Format.createButtonGroup()
  .addRow().addButton('装备', '/装备', { type: 'command', autoEnter: true }).addButton('上', '/移动 上', { type: 'command', autoEnter: true, style: 'blue' }).addButton('背包', '/背包', { type: 'command', autoEnter: true })
  .addRow().addButton('左', '/移动 左', { type: 'command', autoEnter: true, style: 'blue' }).addButton('角色', '/角色', { type: 'command', autoEnter: true }).addButton('右', '/移动 右', { type: 'command', autoEnter: true, style: 'blue' })
  .addRow().addButton('技能', '/技能列表', { type: 'command', autoEnter: true }).addButton('下', '/移动 下', { type: 'command', autoEnter: true, style: 'blue' }).addButton('队伍', '/队伍', { type: 'command', autoEnter: true })
  .addRow().addButton('菜单', '/菜单', { type: 'command', autoEnter: true, style: 'blue' });

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const character = await chooseGift(event.current.UserId, String(route.param('gift')), event.current.UserName);
    const markdown = Format.createMarkdown().addTitle('选择完成')
      .addText(`\n\n你获得了【${character.giftName}】！\n一个光柱将你笼罩，你缓缓升空，被吸入了一道裂口。\n光芒散去时，你已经进入一片幽暗的森林。\n\n面对这片未知之地，你心弦绷紧，一步步地向前摸索而去。\n\n你随时可以通过 `)
      .addButton('面板', { data: '/面板', autoEnter: false }).addText(' 指令打开操作面板。');
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(panelButtons()) });
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'gift selection rejected');
    await message.send({ format: messageFormat('无法选择恩赐', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
