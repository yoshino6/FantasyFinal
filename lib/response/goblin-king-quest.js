import { useEvent, useMessage, Format } from 'alemonjs';
import { startGoblinKingQuest, consultVivianForJudicator, buyCelestialJudicator, continueGoblinKingArrival } from '../game/main-quest.service.js';
import { messageFormat } from '../game/message.js';

const storyFormat = (title, text, buttons) => Format.create()
    .addMarkdown(Format.createMarkdown().addTitle(title).addNewline().addNewline().addText(text))
    .addButtonGroup(buttons);
const fail = async (message, title, error) => message.send({ format: messageFormat(title, error instanceof Error ? error.message : '请稍后再试。') });
const startGoblinKingQuestHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const text = await startGoblinKingQuest(event.current.UserId);
        await message.send({ format: storyFormat('主线·失踪的少女（1/7）', text, Format.createButtonGroup().addRow().addButton('前往 异工坊', '/前往 6 -189', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await fail(message, '无法接受征召', error);
    }
};
const consultVivianForJudicatorHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const text = await consultVivianForJudicator(event.current.UserId);
        await message.send({ format: storyFormat('主线·失踪的少女（2/7）', text, Format.createButtonGroup().addRow().addButton('购买 天位制裁仪（200铜币）', '/购买天位制裁仪', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await fail(message, '无法询问唯薇安', error);
    }
};
const buyCelestialJudicatorHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const result = await buyCelestialJudicator(event.current.UserId);
        await message.send({ format: storyFormat('主线·失踪的少女（3/7）', result.text, Format.createButtonGroup().addRow().addButton('前往 密林深处', '/前往地图 map_dark_forest_deep', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await fail(message, '购买失败', error);
    }
};
const continueGoblinKingArrivalHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const result = await continueGoblinKingArrival(event.current.UserId);
        const buttons = Format.createButtonGroup().addRow();
        if (result.ready)
            buttons.addButton('迎战 哥布林国王', `/目标 ${result.bossSpawnId}`, { type: 'command', autoEnter: true, style: 'blue' });
        else
            buttons.addButton('继续前进', '/继续深处阴谋', { type: 'command', autoEnter: true, style: 'blue' });
        buttons.addButton('任务', '/任务', { type: 'command', autoEnter: true });
        await message.send({ format: storyFormat(`主线·失踪的少女（${result.chapter}/7）`, result.text, buttons) });
    }
    catch (error) {
        await fail(message, '无法继续剧情', error);
    }
};

export { buyCelestialJudicatorHandler, consultVivianForJudicatorHandler, continueGoblinKingArrivalHandler, startGoblinKingQuestHandler };
