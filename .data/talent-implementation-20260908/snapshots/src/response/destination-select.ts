import { useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { chooseDestination } from '../game/character.service';
import { registrationScene } from '../game/divine-message';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const destination = String(route.param('destination')) as '天堂' | '异世界';
    const result = await chooseDestination(event.current.UserId, destination);
    await message.send({ format: await registrationScene(result, event.current.UserId) });
  } catch (error) { await message.send({ format: messageFormat('无法选择去向', error instanceof Error ? error.message : '请稍后重试。') }); }
};
