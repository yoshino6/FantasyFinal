import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { talentAction } from '../game/talent.service.js';
import { messageFormat } from '../game/message.js';

var talent = async () => {
    const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
    try {
        const action = String(route.param('action') ?? '状态');
        const panel = await talentAction(event.current.UserId, route.param('revision') === undefined ? undefined : Number(route.param('revision')), action, String(route.param('arg') ?? ''), String(route.param('value') ?? ''));
        const md = Format.createMarkdown().addTitle(panel.name).addNewline().addNewline().addText(panel.description);
        if (panel.text)
            md.addNewline().addNewline().addText(panel.text);
        for (const job of panel.jobs) {
            const name = { experience: '研习', review: '复盘', sealed: '封存', crop: '种植', survey: '勘察', investigation: '调查', npcQuest: '委托', letter: '昨日来信' };
            md.addNewline().addBlockquote(`${name[job.kind] ?? '记录'}｜${job.remaining > 0 ? `剩余${job.remaining}秒` : '可操作'}`);
            if (job.detail)
                md.addNewline().addText(job.detail);
            const actions = job.kind === 'letter' ? ['接受来信', '重抽来信'] : job.kind === 'crop' ? ['采收'] : ['survey', 'investigation'].includes(job.kind) ? ['完成调查', '取消调查'] : job.kind === 'npcQuest' ? ['交付委托', '放弃委托'] : job.kind === 'review' ? ['复盘', '领取'] : job.kind === 'sealed' ? ['领取', '取消封存'] : ['领取'];
            for (const label of actions)
                md.addButton(`[${label}]`, { data: `/天赋操作 ${panel.revision} ${label} ${job.id}`, autoEnter: false });
        }
        md.addNewline().addNewline();
        for (const command of panel.commands)
            md.addButton(`[${panel.commandLabels?.[command] ?? command}]`, { data: `/天赋操作 ${panel.revision} ${command}`, autoEnter: false }).addNewline();
        await message.send({ format: Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow().addButton('刷新', '/天赋', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('天赋', error instanceof Error ? error.message : '操作失败，请刷新后重试。') });
    }
};

export { talent as default };
