import { useEvent, logger } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { issueBindingCode } from '../game/app-channel.service.js';
import { messageFormat } from '../game/message.js';

var appBind = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        const code = await issueBindingCode(event.current.UserId);
        await message.send({
            format: messageFormat('App 绑定码', `在安卓桌宠 App 的“绑定现有角色”中输入以下 6 位绑定码：\n\n${code}\n\n绑定码 10 分钟内有效，且只能使用一次。`)
        });
    }
    catch (error) {
        logger.error({ err: error, userId: event.current.UserId }, 'issue app binding code failed');
        await message.send({ format: messageFormat('绑定码生成失败', '暂时无法生成绑定码，请稍后重试。') });
    }
};

export { appBind as default };
