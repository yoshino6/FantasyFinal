import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { messageFormat } from '../game/message.js';
import { continueFloatingTour, floatingBarrierAdvice, floatingManorText, floatingRescueStart, floatingRescueReturn, floatingRescueReport, continueFloatingThanks, floatingThanksStart } from '../game/floating-leaf.service.js';

const floatingSceneFormat = (scene) => {
    const title = `${scene.kind === 'tour' ? '初章·浮叶初游' : '主线·菲萝缇的假'}（${scene.kind === 'thanks' && scene.stage === 6 ? 4 : scene.stage}/${scene.total}）·${scene.title}`;
    const md = Format.createMarkdown().addTitle(title).addNewline().addNewline().addText(scene.text).addNewline().addNewline();
    if (scene.kind === 'tour' && scene.stage === 1)
        md.addText('**【获得地图·浮叶镇】**').addNewline().addNewline();
    if (scene.kind === 'tour' && scene.stage === 6)
        md.addText('**【获得地图】世界树、世界树草原环带**').addNewline().addNewline();
    if (scene.stage < scene.total)
        return Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow().addButton('继续', scene.kind === 'tour' ? '/浮叶游览' : '/浮叶致谢 继续', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true }));
    return Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务', '/任务', { type: 'command', autoEnter: true }).addButton('查看地图', '/地图', { type: 'command', autoEnter: true }));
};
const prose = (title, body, buttons) => Format.create().addMarkdown(Format.createMarkdown().addTitle(title).addNewline().addNewline().addText(body)).addButtonGroup(buttons);
const fail = async (message, error) => message.send({ format: messageFormat('浮叶镇', error instanceof Error ? error.message : '请稍后再试。') });
const floatingTourHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    await message.send({ format: floatingSceneFormat(await continueFloatingTour(event.current.UserId)) });
}
catch (error) {
    await fail(message, error);
} };
const floatingBarrierHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const source = String(route.param('source')) === 'observatory' ? 'observatory' : 'guild';
        const text = await floatingBarrierAdvice(event.current.UserId, source);
        await message.send({ format: prose(source === 'guild' ? '主线·无形的禁锢' : '主线·观风台', text, Format.createButtonGroup().addRow().addButton(source === 'guild' ? '前往观风台' : '打开材料背包', source === 'guild' ? '/前往 13 2' : '/背包 材料', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await fail(message, error);
    }
};
const floatingManorHandler = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        const { floatingStoryMainQuest } = await import('../game/floating-leaf.service.js');
        const quest = await floatingStoryMainQuest(event.current.UserId);
        const missing = quest?.title === '【主线·失踪的孩子】';
        const thanked = quest?.title === '【主线·菲萝缇的假】';
        const text = missing ? floatingManorText : thanked ? '菲萝缇在公馆门前晃着刚盖好章的请假条：“今天不当航务员。上次说好的世界树，陪我去看看吧？”她已为两人订好安全接驳的位置，只等我点头。' : '公馆里有人整理航务表和救援记录。菲萝缇正在核对返程名单，偶尔抬头向我招手。';
        const buttons = Format.createButtonGroup().addRow();
        if (missing)
            buttons.addButton('接受调查', '/浮叶委托', { type: 'command', autoEnter: true, style: 'blue' });
        else if (thanked)
            buttons.addButton('同游世界树', '/浮叶致谢 开始', { type: 'command', autoEnter: true, style: 'blue' });
        else if (quest?.title === '【主线·返镇复命】')
            buttons.addButton('公馆复命', '/浮叶复命', { type: 'command', autoEnter: true, style: 'blue' });
        buttons.addButton('任务', '/任务', { type: 'command', autoEnter: true });
        await message.send({ format: prose('浮叶镇·公馆', text, buttons) });
    }
    catch (error) {
        await fail(message, error);
    }
};
const floatingRescueStartHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    const text = await floatingRescueStart(event.current.UserId);
    await message.send({ format: prose('主线·失踪的孩子', text, Format.createButtonGroup().addRow().addButton('前往密林深处', '/前往地图 map_dark_forest_deep', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) });
}
catch (error) {
    await fail(message, error);
} };
const floatingRescueReturnHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    const text = await floatingRescueReturn(event.current.UserId);
    await message.send({ format: prose('主线·返镇复命（1/2）', text, Format.createButtonGroup().addRow().addButton('向菲萝缇复命', '/浮叶复命', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) });
}
catch (error) {
    await fail(message, error);
} };
const floatingRescueReportHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    const text = await floatingRescueReport(event.current.UserId);
    await message.send({ format: prose('主线·返镇复命（2/2）', text, Format.createButtonGroup().addRow().addButton('再访公馆', '/建筑进入 leaf_manor', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) });
}
catch (error) {
    await fail(message, error);
} };
const floatingThanksHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const page = String(route.param('action')) === '继续' ? await continueFloatingThanks(event.current.UserId) : await floatingThanksStart(event.current.UserId);
    await message.send({ format: floatingSceneFormat(page) });
}
catch (error) {
    await fail(message, error);
} };

export { floatingBarrierHandler, floatingManorHandler, floatingRescueReportHandler, floatingRescueReturnHandler, floatingRescueStartHandler, floatingSceneFormat, floatingThanksHandler, floatingTourHandler };
