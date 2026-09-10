import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { messageFormat } from '../game/message.js';
import { previewOpeningChest, confirmOpeningChest, openingChestResult } from '../game/opening-chest.service.js';
import { openingChestName, openingChestContents, chestTables, dawnWeapons } from '../game/opening-chest.config.js';

const openingChestHandler = (mode) => async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const code = String(route.param('code') ?? 'opening_golden_chest'), name = openingChestName(code), contents = openingChestContents(code);
        if (mode === 'contents') {
            if (!chestTables[code])
                throw new Error('这件物品尚未配置宝箱内容。');
            const md = Format.createMarkdown().addTitle(`${name}·内容`).addNewline().addNewline().addText(contents).addNewline().addNewline().addText(dawnWeapons.map(([, type, name]) => `${type}：${name}`).join('\n'));
            await message.send({ format: Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow().addButton('打开一只', `/打开宝箱 ${code} 1`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('批量开启', `/打开宝箱 ${code} `, { type: 'command', autoEnter: false })) });
            return;
        }
        if (mode === 'preview') {
            const result = await previewOpeningChest(event.current.UserId, code, Number(route.param('quantity') ?? 1));
            const md = Format.createMarkdown().addTitle(`${name}·确认开启`).addNewline().addNewline().addText(`本次开启：${result.quantity} 只\n\n${contents}\n\n确认后扣除整批宝箱。承载不足时整批保留，可整理背包后继续此页。`);
            await message.send({ format: Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow().addButton('确认开箱', `/确认开箱 ${result.token}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回背包', '/背包 道具', { type: 'command', autoEnter: true })) });
            return;
        }
        const token = String(route.param('token'));
        const result = mode === 'confirm' ? await confirmOpeningChest(event.current.UserId, token) : await openingChestResult(event.current.UserId, token);
        const total = Math.max(1, Math.ceil(result.items.length / 8));
        const page = Math.min(total, Math.max(1, Math.floor(Number(route.param('page') ?? 1))));
        const md = Format.createMarkdown().addTitle('宝箱·开箱结果').addNewline().addNewline().addText(`已开启 ${result.quantity} 只\n\n`);
        for (const item of result.items.slice((page - 1) * 8, page * 8))
            md.addBlockquote(`${item.name} ×${item.quantity}${item.id ? ` · 装备编号 ${item.id}` : ''}`).addNewline();
        md.addNewline().addText(`第 ${page}/${total} 页 · 奖励已经放入背包，重新查看不会再次扣箱。`);
        const buttons = Format.createButtonGroup();
        if (total > 1)
            buttons.addRow().addButton('上一页', `/开箱记录 ${token} ${Math.max(1, page - 1)}`, { type: 'command', autoEnter: true }).addButton('下一页', `/开箱记录 ${token} ${Math.min(total, page + 1)}`, { type: 'command', autoEnter: true });
        buttons.addRow().addButton('查看装备', '/背包 装备', { type: 'command', autoEnter: true, style: 'blue' }).addButton('继续剧情', '/继续剧情', { type: 'command', autoEnter: true });
        await message.send({ format: Format.create().addMarkdown(md).addButtonGroup(buttons) });
    }
    catch (error) {
        await message.send({ format: messageFormat('宝箱', error instanceof Error ? error.message : '请稍后再试。') });
    }
};

export { openingChestHandler };
