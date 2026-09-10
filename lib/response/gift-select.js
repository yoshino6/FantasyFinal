import { useEvent, useRoute, logger } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { chooseGift } from '../game/character.service.js';
import { messageFormat } from '../game/message.js';
import { giftSelectionFormat, completedRegistrationFormat } from '../game/registration-message.js';

var giftSelect = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const character = await chooseGift(event.current.UserId, String(route.param('gift')), event.current.UserName);
        await message.send({ format: character ? giftSelectionFormat(character) : await completedRegistrationFormat(event.current.UserId) });
    }
    catch (error) {
        logger.warn({ err: error, userId: event.current.UserId }, 'gift selection rejected');
        await message.send({ format: messageFormat('无法选择恩赐', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { giftSelect as default };
