import { useEvent, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { advanceOpening, openingStatus, beginOpening } from '../game/opening.service.js';
import { openingFormat } from '../game/opening-message.js';
import { messageFormat } from '../game/message.js';

const openingPersonHandler = async () => {
    const [message] = useGameMessage();
    await message.send({ format: messageFormat('初行人物', '初行剧情不提供人物详情；抵达安全区后，可与实际值守的域民交谈。') });
};
const openingChoiceHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const result = await advanceOpening(event.current.UserId, Number(route.param('revision')), String(route.param('action')));
        await message.send({ format: openingFormat(result) });
    }
    catch (error) {
        await message.send({ format: messageFormat('初行剧情', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const continueOpeningIfPresent = async (user, message) => {
    const current = await openingStatus(user);
    if (!current || current.state === 'completed')
        return false;
    if (current.state === 'armed') {
        await message.send({ format: openingFormat(current) });
        return true;
    }
    const story = await beginOpening(user);
    if (!story)
        return false;
    await message.send({ format: openingFormat(story) });
    return true;
};

export { continueOpeningIfPresent, openingChoiceHandler, openingPersonHandler };
