import { useEvent, useRoute, logger } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { continueRegistration } from '../game/character.service.js';
import { registrationScene } from '../game/divine-message.js';
import { messageFormat } from '../game/message.js';

var gameContinue = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    const [route] = useRoute();
    try {
        const stage = await continueRegistration(event.current.UserId, route.param('stage') ? String(route.param('stage')) : undefined);
        await message.send({ format: await registrationScene(stage, event.current.UserId) });
    }
    catch (error) {
        logger.warn({ err: error, userId: event.current.UserId }, 'continue registration rejected');
        await message.send({ format: messageFormat('无法继续', error instanceof Error ? error.message : '操作失败，请重新发送“注册”。') });
    }
};

export { gameContinue as default };
