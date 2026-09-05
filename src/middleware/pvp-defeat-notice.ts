import { logger, useEvent, useMessage } from 'alemonjs';
import { takePvpDefeatNotice } from '../game/pvp.service';
import { messageFormat } from '../game/message';

/** 受击方任意下一条消息都会收到一次战败时间与掉落结算提示。 */
export default async (_event: unknown, next: () => Promise<void>) => {
  const [event] = useEvent();
  const [message] = useMessage();
  const userId = String(event.current.UserId ?? '');
  if (userId) {
    try {
      const notice = await takePvpDefeatNotice(userId);
      if (notice) {
        const defeatedAt = new Date(notice.defeatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
        await message.send({ format: messageFormat('战败通知', `${notice.notice}\n受击时间：${defeatedAt}\n\n战败保护将在你的下一次大型操作结束后解除，最长持续 1 小时。`) });
      }
    } catch (error) {
      logger.warn({ err: error, userId }, '发送 PvP 战败通知失败');
    }
  }
  await next();
};
