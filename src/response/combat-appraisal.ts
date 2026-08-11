import { Format, useEvent, useMessage } from 'alemonjs';
import { inspectCombat } from '../game/adventure.service';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const result = await inspectCombat(event.current.UserId);
    const markdown = Format.createMarkdown().addTitle('鉴识').addNewline().addNewline().addBlockquote(result.text);
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('战斗面板', '/面板', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('鉴识失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
