import { useEvent } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { askWhereAmI } from '../game/character.service.js';
import { registrationScene } from '../game/divine-message.js';
import { messageFormat } from '../game/message.js';

var askWhere = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        const stage = await askWhereAmI(event.current.UserId);
        await message.send({ format: await registrationScene(stage, event.current.UserId) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法询问', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { askWhere as default };
