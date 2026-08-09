import { logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { changeCharacterGender } from '../game/character.service';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const result = await changeCharacterGender(event.current.UserId, String(route.param('gender')));
    await message.send({ format: messageFormat('改性成功', `角色性别已修改为「${result.gender}」。${result.usedCard ? '已消耗一张改性卡。' : '已使用首次免费改性。'}`) });
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'change character gender failed');
    await message.send({ format: messageFormat('改性失败', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
