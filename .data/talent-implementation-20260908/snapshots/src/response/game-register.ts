import { logger, useEvent } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { beginRegistration } from '../game/character.service';
import { registrationScene } from '../game/divine-message';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const result = await beginRegistration(event.current.UserId, event.current.UserName);
    if (result.alreadyRegistered) {
      await message.send({ format: await registrationScene('completed', event.current.UserId) });
      return;
    }
    await message.send({ format: await registrationScene(result.stage!, event.current.UserId) });
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'begin registration failed');
    await message.send({ format: messageFormat('服务暂不可用', '注册服务暂时不可用，请稍后重试。') });
  }
};
