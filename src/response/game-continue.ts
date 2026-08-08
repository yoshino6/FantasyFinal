import { logger, useEvent, useMessage } from 'alemonjs';
import { continueRegistration } from '../game/character.service';
import { allocationFormat, allocationText, messageFormat, sendWithTextFallback } from '../game/message';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const allocation = await continueRegistration(event.current.UserId);
    await sendWithTextFallback(message, allocationFormat(allocation), allocationText(allocation));
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'continue registration rejected');
    await message.send({ format: messageFormat('无法继续', error instanceof Error ? error.message : '操作失败，请重新发送“注册”。') });
  }
};
