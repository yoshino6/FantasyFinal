import { randomUUID } from 'node:crypto';
import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { useInventoryItem } from '../game/item-use.service.js';
import { itemUsePolicy } from '../game/item-use-policy.js';
import { messageFormat } from '../game/message.js';

const appendItemUse = (markdown, item) => {
    const policy = itemUsePolicy(item);
    if (policy.kind === 'direct')
        markdown.addText(' ').addButton('[使用]', { data: `/使用道具 ${item.id} ${randomUUID()}`, autoEnter: false });
    else if (policy.kind === 'workflow')
        markdown.addText(' ').addButton('[使用]', { data: policy.command, autoEnter: false });
    else if (policy.kind === 'combat')
        markdown.addText('（战斗中使用）');
    return markdown;
};
var itemUse = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const result = await useInventoryItem(event.current.UserId, Number(route.param('id')), String(route.param('token') ?? randomUUID()));
        await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle(result.name).addNewline().addText(result.message)).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回背包', '/背包 道具', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('道具使用', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { appendItemUse, itemUse as default };
