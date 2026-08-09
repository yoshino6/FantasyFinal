import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { chooseGift } from '../game/character.service';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const character = await chooseGift(event.current.UserId, String(route.param('gift')), event.current.UserName);
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('选择完成').addText(`\n\n你获得了【${character.giftName}】！\n一个光柱将你笼罩，你缓缓升空，被吸入了一道裂口。\n光芒散去时，你已经进入一片幽暗的森林。\n\n面对这片未知之地，你心弦绷紧，一步步地向前摸索而去。`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('上', '/移动 上', { type: 'command', autoEnter: true, style: 'blue' }).addRow().addButton('左', '/移动 左', { type: 'command', autoEnter: true }).addButton('右', '/移动 右', { type: 'command', autoEnter: true }).addRow().addButton('下', '/移动 下', { type: 'command', autoEnter: true, style: 'blue' }).addButton('面板', '/面板', { type: 'command', autoEnter: true })) });
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'gift selection rejected');
    await message.send({ format: messageFormat('无法选择恩赐', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
