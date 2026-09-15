import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { messageFormat } from '../game/message.js';
import { heartAttributeNames, openHeartQuestion, answerHeartQuestion, openQueuedHeartQuestion, activeHeartQuestion, skipHeartQuestion } from '../game/heart-question.service.js';

const heartQuestionFormat = (ticket) => {
    const md = Format.createMarkdown().addTitle(`窥尘问心·${ticket.card.title}`).addNewline().addNewline()
        .addText(`升至 Lv${ticket.toLevel} 时映入心中的片段：`).addNewline().addNewline()
        .addText(ticket.card.prompt).addNewline().addNewline();
    ticket.card.options.forEach((choice, index) => md.addText(`${'ABCDEF'[index]}. ${choice.text}（倾向${heartAttributeNames[choice.favor]}／排斥${heartAttributeNames[choice.repel]}）`).addNewline().addNewline());
    const buttons = Format.createButtonGroup()
        .addRow().addButton('A', `/问心选择 ${ticket.id} A`, { type: 'command', autoEnter: true }).addButton('B', `/问心选择 ${ticket.id} B`, { type: 'command', autoEnter: true }).addButton('C', `/问心选择 ${ticket.id} C`, { type: 'command', autoEnter: true })
        .addRow().addButton('D', `/问心选择 ${ticket.id} D`, { type: 'command', autoEnter: true }).addButton('E', `/问心选择 ${ticket.id} E`, { type: 'command', autoEnter: true }).addButton('F', `/问心选择 ${ticket.id} F`, { type: 'command', autoEnter: true })
        .addRow().addButton('先跳过', `/问心跳过 ${ticket.id}`, { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(md).addButtonGroup(buttons);
};
const fail = async (message, error) => message.send({ format: messageFormat('窥尘问心', error instanceof Error ? error.message : '请稍后重试。') });
const openHeartQuestionHandler = async () => {
    const [event] = useEvent(), [message] = useGameMessage();
    try {
        const ticket = await openHeartQuestion(event.current.UserId);
        await message.send({ format: ticket ? heartQuestionFormat(ticket) : messageFormat('窥尘问心', '目前没有待回答的问心片段。') });
    }
    catch (error) {
        await fail(message, error);
    }
};
const heartAnswerHandler = async () => {
    const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
    try {
        const result = await answerHeartQuestion(event.current.UserId, Number(route.param('id')), String(route.param('choice')));
        await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('问心').addNewline().addNewline().addText(result.copy).addNewline().addNewline().addText(result.directions)) });
        const next = await openQueuedHeartQuestion(event.current.UserId);
        if (next)
            await message.send({ format: heartQuestionFormat(next) });
    }
    catch (error) {
        await fail(message, error);
        const current = await activeHeartQuestion(event.current.UserId);
        if (current)
            await message.send({ format: heartQuestionFormat(current) });
    }
};
const heartSkipHandler = async () => {
    const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
    try {
        await skipHeartQuestion(event.current.UserId, Number(route.param('id')));
        await message.send({ format: messageFormat('窥尘问心', '片段暂且收起。之后可在角色等级旁点击[窥尘问心]补答。') });
    }
    catch (error) {
        await fail(message, error);
    }
};

export { heartAnswerHandler, heartQuestionFormat, heartSkipHandler, openHeartQuestionHandler };
