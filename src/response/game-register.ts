import { logger, useEvent } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { beginRegistration } from '../game/character.service';
import { audienceFormat, audienceText, dangerFormat, dangerText, destinationFormat, destinationText, giftFormat, giftText, messageFormat, questionFormat, questionText, randomStoryText, sendWithTextFallback, storyFormat } from '../game/message';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const result = await beginRegistration(event.current.UserId, event.current.UserName);
    if (result.alreadyRegistered) {
      await message.send({ format: messageFormat('旅者已归来', '你已抵达异世界。发送 /角色 查看当前属性。') });
      return;
    }
    const text = result.stage === 'story' ? randomStoryText() : result.stage === 'audience' ? audienceText : result.stage === 'question' ? questionText : result.stage === 'destination' ? destinationText : result.stage === 'danger' ? dangerText : giftText();
    await sendWithTextFallback(
      message,
      result.stage === 'story' ? storyFormat(text) : result.stage === 'audience' ? audienceFormat() : result.stage === 'question' ? questionFormat() : result.stage === 'destination' ? destinationFormat() : result.stage === 'danger' ? dangerFormat() : giftFormat(),
      text
    );
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'begin registration failed');
    await message.send({ format: messageFormat('服务暂不可用', '注册服务暂时不可用，请稍后重试。') });
  }
};
