import { useEvent, logger } from 'alemonjs';
import { rememberGroupChannel as rememberGroupChannel$1 } from '../game/group-channel.service.js';

var rememberGroupChannel = async (_event, next) => {
    const [event] = useEvent();
    const current = event.current;
    if (!current.IsPrivate && current.ChannelId) {
        try {
            await rememberGroupChannel$1(String(current.ChannelId), current.BotId);
        }
        catch (error) {
            logger.warn({ err: error, channelId: current.ChannelId }, '记录 QQ 群主动消息目标失败');
        }
    }
    await next();
};

export { rememberGroupChannel as default };
