import { logger, useEvent, useMessage } from 'alemonjs';
import { beginRegistration } from '../game/character.service';
import { audienceFormat, audienceText, giftFormat, giftText, messageFormat, sendWithTextFallback, storyFormat, storyText } from '../game/message';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const result = await beginRegistration(event.current.UserId, event.current.UserName);
    if (result.alreadyRegistered) {
      await message.send({ format: messageFormat('旅者已归来', '你已抵达异世界。发送 /角色 查看当前属性。') });
      return;
    }
    await sendWithTextFallback(
      message,
      result.stage === 'story' ? storyFormat() : result.stage === 'audience' ? audienceFormat() : giftFormat(),
      result.stage === 'story' ? storyText : result.stage === 'audience' ? audienceText : giftText()
    );
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'begin registration failed');
    await message.send({ format: messageFormat('服务暂不可用', '注册服务暂时不可用，请稍后重试。') });
  }
};
