import { Format, logger, useEvent, useMessage } from 'alemonjs';
import { beginRegistration } from '../game/character.service';
import { allocationFormat, storyFormat } from '../game/message';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const result = await beginRegistration(event.current.UserId, event.current.UserName);
    if (result.alreadyRegistered) {
      await message.send({ format: Format.create().addText('你已抵达异世界。发送 /角色 查看当前属性。') });
      return;
    }
    await message.send({ format: result.stage === 'allocate' ? allocationFormat(result.allocation!) : storyFormat() });
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'begin registration failed');
    await message.send({ format: Format.create().addText('注册服务暂时不可用，请稍后重试。') });
  }
};
