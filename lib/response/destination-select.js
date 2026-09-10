import { useEvent, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { chooseDestination } from '../game/character.service.js';
import { registrationScene } from '../game/divine-message.js';
import { messageFormat } from '../game/message.js';

var destinationSelect = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const destination = String(route.param('destination'));
        const result = await chooseDestination(event.current.UserId, destination);
        await message.send({ format: await registrationScene(result, event.current.UserId) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法选择去向', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { destinationSelect as default };
