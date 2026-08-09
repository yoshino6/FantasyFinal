import { logger, useEvent, useMessage } from 'alemonjs';
import { continueRegistration } from '../game/character.service';
import { audienceFormat, audienceText, giftFormat, giftText, messageFormat, sendWithTextFallback } from '../game/message';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const stage = await continueRegistration(event.current.UserId);
    await sendWithTextFallback(message, stage === 'audience' ? audienceFormat() : giftFormat(), stage === 'audience' ? audienceText : giftText());
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'continue registration rejected');
    await message.send({ format: messageFormat('无法继续', error instanceof Error ? error.message : '操作失败，请重新发送“注册”。') });
  }
};
