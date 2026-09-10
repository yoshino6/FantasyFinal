import { useEvent, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message';
import { messageFormat } from '../game/message';
import { claimNewWorld, newWorldPanel } from '../game/new-world.service';
import { newWorldFormat } from '../game/new-world-message';

export default async () => {
  const [event] = useEvent(), [message] = useGameMessage();
  try {
    await message.send({ format: newWorldFormat(await newWorldPanel(event.current.UserId)) });
  } catch (error) {
    await message.send({ format: messageFormat('新世界旅途', error instanceof Error ? error.message : '暂时无法查看，请稍后重试。') });
  }
};
export const claimNewWorldHandler = async () => {
  const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
  let notice: string;
  try {
    const result = await claimNewWorld(event.current.UserId, Number(route.param('level')));
    notice = `已领取${result.level}级奖励：\n${result.received.join('\n')}`;
  } catch (error) {
    notice = error instanceof Error ? error.message : '领取未完成，请稍后重试。';
  }
  try {
    await message.send({ format: newWorldFormat(await newWorldPanel(event.current.UserId), notice) });
  } catch {
    await message.send({ format: messageFormat('新世界旅途', notice) });
  }
};
