import { useEvent, useMessage } from 'alemonjs';
import { equipment } from '../game/adventure.service';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const items = await equipment(event.current.UserId);
    await message.send({ format: messageFormat('装备', items.length ? items.map(item => `${item.slot}：${item.name}\n${item.description}`).join('\n\n') : '当前没有装备。') });
  } catch (error) { await message.send({ format: messageFormat('装备不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};
