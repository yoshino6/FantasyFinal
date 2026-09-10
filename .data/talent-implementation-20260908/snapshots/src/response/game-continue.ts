import { logger, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { continueRegistration } from '../game/character.service';
import { registrationScene } from '../game/divine-message';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  const [route] = useRoute();
  try {
    const stage: string = await continueRegistration(event.current.UserId, route.param('stage') ? String(route.param('stage')) : undefined);
    await message.send({ format: await registrationScene(stage, event.current.UserId) });
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'continue registration rejected');
    await message.send({ format: messageFormat('无法继续', error instanceof Error ? error.message : '操作失败，请重新发送“注册”。') });
  }
};
