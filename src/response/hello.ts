import { logger, useMention } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { messageFormat } from '../game/message';

export default async () => {
  const [message] = useMessage();
  const [mention] = useMention();
  const userRes = await mention.findOne();
  if (!userRes.count || !userRes.data) {
    logger.warn('没有找到@用户');
    await message.send({ format: messageFormat('问候失败', '没有找到可问候的用户。') });
    return;
  }
  const user = userRes.data;
  await message.send({ format: messageFormat('问候', `你好，${user.UserName || user.UserId}！`) });
};
