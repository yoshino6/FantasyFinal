import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { messageFormat } from '../game/message.js';
import { openingRoadPanel, selectOpeningRoad } from '../game/opening-road.service.js';

const openingRoadPanelFormat = (panel) => {
    const markdown = Format.createMarkdown().addTitle('初行·选择道路').addNewline().addNewline()
        .addText('天赋已经觉醒，眼前的初行故事尚未展开。选择一条道路后，打开操作面板；首次移动或寻怪时，才会遇见对应的故事。').addNewline().addNewline()
        .addText(`当前道路：${panel.roads.find(road => road.code === panel.current)?.title ?? panel.current}`).addNewline().addNewline();
    const sequence = '①②③④⑤⑥⑦⑧';
    for (const [index, road] of panel.roads.entries()) {
        markdown.addText(`${sequence[index] ?? `${index + 1}.`}${road.title}`)
            .addButton('[选择]', { data: `/道路选定 ${panel.revision} ${road.code}`, autoEnter: false }).addNewline();
    }
    return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回面板', '/面板', { type: 'command', autoEnter: true }));
};
const openingRoadPanelHandler = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        await message.send({ format: openingRoadPanelFormat(await openingRoadPanel(event.current.UserId)) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法选择道路', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const openingRoadChoiceHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const chosen = await selectOpeningRoad(event.current.UserId, Number(route.param('revision')), String(route.param('code')));
        await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('道路已选定').addNewline().addNewline()
                .addText(`接引印将你送到【${chosen.region}】。你已选定【${chosen.title}】；前往【${chosen.destination}】的相遇仍在路上。`).addNewline().addNewline()
                .addText('请打开操作面板。首次移动或寻怪后，初行故事才会展开。'))
                .addButtonGroup(Format.createButtonGroup().addRow().addButton('打开面板', '/面板', { type: 'command', autoEnter: true, style: 'blue' }).addButton('重新选路', '/选择道路', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法选定道路', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { openingRoadChoiceHandler, openingRoadPanelFormat, openingRoadPanelHandler };
