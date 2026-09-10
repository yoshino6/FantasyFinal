import { useEvent, logger } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { beginRegistration } from '../game/character.service.js';
import { registrationScene } from '../game/divine-message.js';
import { messageFormat } from '../game/message.js';

var gameRegister = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        const result = await beginRegistration(event.current.UserId, event.current.UserName);
        if (result.alreadyRegistered) {
            await message.send({ format: await registrationScene('completed', event.current.UserId) });
            return;
        }
        await message.send({ format: await registrationScene(result.stage, event.current.UserId) });
    }
    catch (error) {
        logger.error({ err: error, userId: event.current.UserId }, 'begin registration failed');
        await message.send({ format: messageFormat('服务暂不可用', '注册服务暂时不可用，请稍后重试。') });
    }
};

export { gameRegister as default };
