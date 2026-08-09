import { useEvent, useMessage } from 'alemonjs';
import { askWhereAmI } from '../game/character.service';
import { messageFormat, questionFormat, questionText, sendWithTextFallback } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await askWhereAmI(event.current.UserId);
    await sendWithTextFallback(message, questionFormat(), questionText);
  } catch (error) { await message.send({ format: messageFormat('无法询问', error instanceof Error ? error.message : '请稍后重试。') }); }
};
