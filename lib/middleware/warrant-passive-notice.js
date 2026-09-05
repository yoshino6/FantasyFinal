import { useEvent, useMessage, logger } from 'alemonjs';
import { townPassiveWantedAlert, reservePassiveWarrantNotice } from '../game/pvp.service.js';
import { warrantNoticeFormat } from '../response/warrant-notice.js';

var warrantPassiveNotice = async (_event, next) => {
    const [event] = useEvent();
    const [message] = useMessage();
    const { IsPrivate, ChannelId, UserId } = event.current;
    if (!IsPrivate && ChannelId && UserId) {
        try {
            const wanted = await townPassiveWantedAlert(String(UserId));
            if (wanted && await reservePassiveWarrantNotice(wanted.warrantId, String(ChannelId), String(UserId))) {
                await message.send({ format: warrantNoticeFormat(wanted, { passive: true }) });
            }
        }
        catch (error) {
            logger.warn({ err: error, channelId: ChannelId, userId: UserId }, '发送被动城镇通缉提示失败');
        }
    }
    await next();
};

export { warrantPassiveNotice as default };
