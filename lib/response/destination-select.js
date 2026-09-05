import { useEvent, useRoute, useMessage } from 'alemonjs';
import { chooseDestination } from '../game/character.service.js';
import { sendWithTextFallback, heavenFormat, dangerFormat, heavenText, dangerText, messageFormat } from '../game/message.js';

var destinationSelect = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const destination = String(route.param('destination'));
        const result = await chooseDestination(event.current.UserId, destination);
        await sendWithTextFallback(message, result === 'heaven' ? heavenFormat() : dangerFormat(), result === 'heaven' ? heavenText : dangerText);
    }
    catch (error) {
        await message.send({ format: messageFormat('无法选择去向', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { destinationSelect as default };
