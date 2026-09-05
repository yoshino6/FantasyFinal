import { useEvent, useMessage, logger } from 'alemonjs';
import { continueRegistration } from '../game/character.service.js';
import { sendWithTextFallback, audienceFormat, questionFormat, destinationFormat, dangerFormat, giftFormat, audienceText, questionText, destinationText, dangerText, giftText, messageFormat } from '../game/message.js';

var gameContinue = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const stage = await continueRegistration(event.current.UserId);
        await sendWithTextFallback(message, stage === 'audience' ? audienceFormat() : stage === 'question' ? questionFormat() : stage === 'destination' ? destinationFormat() : stage === 'danger' ? dangerFormat() : giftFormat(), stage === 'audience' ? audienceText : stage === 'question' ? questionText : stage === 'destination' ? destinationText : stage === 'danger' ? dangerText : giftText());
    }
    catch (error) {
        logger.warn({ err: error, userId: event.current.UserId }, 'continue registration rejected');
        await message.send({ format: messageFormat('无法继续', error instanceof Error ? error.message : '操作失败，请重新发送“注册”。') });
    }
};

export { gameContinue as default };
