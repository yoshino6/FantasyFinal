import { useEvent, useRoute, useMessage, logger } from 'alemonjs';
import { changeCharacterName } from '../game/character.service.js';
import { messageFormat } from '../game/message.js';

var changeName = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const result = await changeCharacterName(event.current.UserId, String(route.param('name')));
        await message.send({ format: messageFormat('角色改名成功', `\n\n角色昵称已修改为「${result.name}」。${result.usedCard ? '已消耗一张改名卡。' : '\n\n已使用首次免费改名。'}`) });
    }
    catch (error) {
        logger.warn({ err: error, userId: event.current.UserId }, 'change character name failed');
        await message.send({ format: messageFormat('角色改名失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { changeName as default };
