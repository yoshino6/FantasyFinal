import { useEvent, useMessage, Format } from 'alemonjs';
import { personalPvpPanel } from '../game/pvp.service.js';
import { messageFormat } from '../game/message.js';

var pvpPanel = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const data = await personalPvpPanel(event.current.UserId);
        const markdown = Format.createMarkdown().addTitle('PvP 面板').addNewline().addNewline()
            .addText(`昵称：${data.name}｜ID：${data.gameId}\n累计战斗：${data.battleCount} 场`).addNewline().addNewline().addText('城镇通缉（仅本人）').addNewline();
        if (!data.warrants.length)
            markdown.addBlockquote('当前没有生效中的城镇通缉。').addNewline();
        for (const warrant of data.warrants)
            markdown.addBlockquote(`通缉 #${warrant.id}｜${warrant.regionName}｜受害者 ${warrant.victims} 名｜${new Date(warrant.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`).addNewline();
        if (data.detainedUntil)
            markdown.addNewline().addBlockquote(`当前关押至：${new Date(data.detainedUntil).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`);
        const buttons = Format.createButtonGroup().addRow().addButton('战斗记录', '/PvP记录', { type: 'command', autoEnter: true, style: 'blue' }).addButton('我的仇人', '/我的仇人', { type: 'command', autoEnter: true });
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
    }
    catch (error) {
        await message.send({ format: messageFormat('PvP 面板不可用', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { pvpPanel as default };
