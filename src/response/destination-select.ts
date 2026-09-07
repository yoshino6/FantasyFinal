import { useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { chooseDestination } from '../game/character.service';
import { dangerFormat, dangerText, heavenFormat, heavenText, messageFormat, sendWithTextFallback } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const destination = String(route.param('destination')) as '天堂' | '异世界';
    const result = await chooseDestination(event.current.UserId, destination);
    await sendWithTextFallback(message, result === 'heaven' ? heavenFormat() : dangerFormat(), result === 'heaven' ? heavenText : dangerText);
  } catch (error) { await message.send({ format: messageFormat('无法选择去向', error instanceof Error ? error.message : '请稍后重试。') }); }
};
