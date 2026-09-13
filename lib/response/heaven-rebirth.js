import { useEvent, logger, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { completeHeavenRebirth } from '../game/character.service.js';
import { messageFormat } from '../game/message.js';

const heavenEndingFormat = (replayed) => {
    const md = Format.createMarkdown().addTitle('序章·宁静的彼岸').addNewline().addNewline()
        .addText('我迈过门槛，身后的接引室在暖光里渐渐远去。没有号角，没有等待我去证明的命运；风吹过开满白花的长坡，远处有人朝我招手。').addNewline().addNewline()
        .addText('女神没有再说什么。我明白这一次，我选择的是停下，而不是出发。').addNewline().addNewline()
        .addBold('【成就解锁·宁静的彼岸】').addNewline().addNewline()
        .addText(replayed ? '这段告别已经完成。' : '本次不会创建冒险者角色；如想重新踏上异世界，请重新注册。');
    return Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow().addButton('重新注册', '/注册', { type: 'command', autoEnter: true, style: 'blue' }));
};
var heavenRebirth = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        const result = await completeHeavenRebirth(event.current.UserId);
        await message.send({ format: heavenEndingFormat(result.replayed) });
    }
    catch (error) {
        logger.warn({ err: error, userId: event.current.UserId }, 'heaven rebirth rejected');
        await message.send({ format: messageFormat('无法踏入天堂', error instanceof Error ? error.message : '请稍后重新尝试。') });
    }
};

export { heavenRebirth as default };
