import { useEvent, useRoute, logger } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { changeCharacterGender } from '../game/character.service.js';
import { messageFormat } from '../game/message.js';

var changeGender = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const result = await changeCharacterGender(event.current.UserId, String(route.param('gender')));
        await message.send({ format: messageFormat('改性成功', `\n\n角色性别已修改为「${result.gender}」。${result.usedCard ? '已消耗一张改性卡。' : '\n\n已使用首次免费改性。'}`) });
    }
    catch (error) {
        logger.warn({ err: error, userId: event.current.UserId }, 'change character gender failed');
        await message.send({ format: messageFormat('改性失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { changeGender as default };
