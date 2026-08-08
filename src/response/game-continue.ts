import { Format, logger, useEvent, useMessage } from 'alemonjs';
import { continueRegistration } from '../game/character.service';
import { allocationFormat } from '../game/message';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    await message.send({ format: allocationFormat(await continueRegistration(event.current.UserId)) });
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'continue registration rejected');
    await message.send({ format: Format.create().addText(error instanceof Error ? error.message : '操作失败，请重新发送“注册”。') });
  }
};
