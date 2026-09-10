import { logger, useEvent, useMessage } from 'alemonjs';
import { reservePassiveWarrantNotice, townPassiveWantedAlert } from '../game/pvp.service';
import { warrantNoticeFormat } from '../response/warrant-notice';

/** 镇内其他玩家发言时，被动提示仍在城内暴露行踪的通缉者。 */
export default async (_event: unknown, next: () => Promise<void>) => {
  const [event] = useEvent();
  const [message] = useMessage();
  const { IsPrivate, ChannelId, UserId } = event.current;
  if (!IsPrivate && ChannelId && UserId) {
    try {
      const wanted = await townPassiveWantedAlert(String(UserId));
      if (wanted && await reservePassiveWarrantNotice(wanted.warrantId, String(ChannelId), String(UserId))) {
        await message.send({ format: warrantNoticeFormat(wanted, { passive: true }) });
      }
    } catch (error) {
      logger.warn({ err: error, channelId: ChannelId, userId: UserId }, '发送被动城镇通缉提示失败');
    }
  }
  await next();
};
