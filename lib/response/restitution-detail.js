import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { restitutionDetail as restitutionDetail$1 } from '../game/pvp.service.js';
import { messageFormat } from '../game/message.js';

var restitutionDetail = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const entries = await restitutionDetail$1(event.current.UserId, String(route.param('id')));
        const markdown = Format.createMarkdown().addTitle('失物返还详情').addNewline().addNewline();
        for (const [index, entry] of entries.entries()) {
            if (entry.name) {
                markdown.addText(`${'①②③④⑤⑥⑦⑧⑨⑩'.charAt(index) || `${index + 1}.`}【${entry.owner}】的【${entry.name}】×${entry.quantity}`).addNewline();
                if (entry.sold)
                    markdown.addBlockquote(`其中 ${entry.sold} 件已被变卖，售得铜币×${entry.sale}；物品已物归原主。`).addNewline();
                else
                    markdown.addBlockquote('物品已物归原主。').addNewline();
            }
            else {
                markdown.addText(`${'①②③④⑤⑥⑦⑧⑨⑩'.charAt(index) || `${index + 1}.`}【${entry.owner}】的铜币`).addNewline();
                markdown.addBlockquote(`应返还铜币×${entry.coins}，已追回铜币×${entry.charged}。`).addNewline();
            }
            if (entry.debt)
                markdown.addBlockquote(`剩余铜币×${entry.debt} 已记为城镇债务，进入百纳镇时将被强制执行。`).addNewline();
            markdown.addNewline();
        }
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('操作面板', '/面板', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('失物详情不可用', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { restitutionDetail as default };
