import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { negotiateEncounter } from '../game/adventure.service.js';
import { NegotiationCombatError } from '../game/negotiation.service.js';

const sequence = '①②③④⑤⑥⑦⑧⑨⑩';
const prefix = (view) => `${view.spawnId} ${view.sessionId}`;
const negotiationFormat = (result) => {
    const markdown = Format.createMarkdown().addTitle('交涉').addNewline().addNewline();
    const buttons = Format.createButtonGroup();
    if (result.kind !== 'ongoing') {
        markdown.addText(result.text);
        if (result.kind === 'closed')
            buttons.addRow().addButton('继续交涉', `/交涉 ${result.spawnId}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('躲避', `/躲避 ${result.spawnId}`, { type: 'command', autoEnter: true });
        buttons.addRow().addButton('战斗面板', '/战斗信息', { type: 'command', autoEnter: true, style: 'blue' }).addButton('操作面板', '/面板', { type: 'command', autoEnter: true });
        return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
    }
    const bag = result.inventory;
    const tail = bag.keyword ? ` ${bag.keyword}` : '';
    markdown.addText(`【${result.name}】心情：${result.mood}\n\n> 善意积累：${result.goodwill}/3｜开战保护：${result.protection} 次\n\n`);
    for (const line of result.text.split('\n').filter(Boolean)) {
        const receipt = /^(已交付|对方未收下)：(.*)$/.exec(line);
        if (receipt)
            markdown.addText(`${receipt[1]}：\n\n> ${receipt[2]}\n\n`);
        else
            markdown.addText('> ').addBold(line).addText('\n\n');
    }
    if (result.completionText)
        markdown.addText(`> ${result.completionText}\n\n`);
    markdown.addText(`${bag.keyword ? `可交涉物品 · 搜索「${bag.keyword}」` : '背包 · 可交涉物品'}\n\n`);
    if (!bag.items.length)
        markdown.addText('> 没有符合条件的未绑定材料。\n\n');
    for (const [index, item] of bag.items.entries())
        markdown.addText('> ').addBold(`${sequence[index]} ${item.name} ×${item.available}`).addText('  ')
            .addButton('[交涉]', { data: `/交涉物品 ${prefix(result)} ${result.revision} ${item.id} 1`, autoEnter: false })
            .addText(`\n> ${item.policy.subtype}\n\n`);
    markdown.addText(`第 ${bag.page}/${bag.totalPages} 页｜共 ${bag.total} 种\n\n> 从对方的反应判断喜恶。仅收下的喜好物品会消耗；一般与厌恶物品会退回，但仍可能激怒对方。`);
    buttons.addRow()
        .addButton('上一页', `/交涉分页 ${prefix(result)} ${Math.max(1, bag.page - 1)}${tail}`, { type: 'command', autoEnter: true })
        .addButton('搜索', `/交涉搜索 ${prefix(result)} `, { type: 'command', autoEnter: false, style: 'blue' })
        .addButton('翻页', `/交涉分页 ${prefix(result)} `, { type: 'command', autoEnter: false })
        .addButton('下一页', `/交涉分页 ${prefix(result)} ${Math.min(bag.totalPages, bag.page + 1)}${tail}`, { type: 'command', autoEnter: true });
    buttons.addRow().addButton('交谈', `/交涉行动 ${prefix(result)} ${result.revision} 交谈`, { type: 'command', autoEnter: true, style: 'blue' })
        .addButton('刷新', `/交涉分页 ${prefix(result)} ${bag.page}${tail}`, { type: 'command', autoEnter: true });
    buttons.addRow().addButton('主动开战', `/交涉行动 ${prefix(result)} ${result.revision} 开战`, { type: 'command', autoEnter: true })
        .addButton('离开交涉', `/交涉行动 ${prefix(result)} ${result.revision} 离开`, { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const negotiationHandler = (mode = 'open') => async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    const spawnId = Number(route.param('id'));
    const sessionId = String(route.param('session') ?? '');
    try {
        const command = { type: 'view', ...(sessionId ? { sessionId } : {}), page: mode === 'search' ? 1 : Number(route.param('page') ?? 1), keyword: String(route.param('keyword') ?? '') };
        if (mode === 'action' || mode === 'gift') {
            command.revision = Number(route.param('revision'));
            command.type = mode === 'gift' ? 'gift' : { 交谈: 'talk', 开战: 'fight', 离开: 'leave' }[String(route.param('action'))];
            if (!command.type)
                throw new Error('请选择交谈、开战或离开。');
            if (mode === 'gift') {
                command.itemId = Number(route.param('item'));
                command.quantity = Number(route.param('quantity'));
            }
        }
        const result = await negotiateEncounter(event.current.UserId, spawnId, command);
        if (mode === 'item' && result.kind === 'ongoing') {
            if (result.revision !== Number(route.param('revision')))
                throw new Error('交涉状态已改变，请刷新后重新选择物品。');
            const selected = await negotiateEncounter(event.current.UserId, spawnId, { type: 'view', sessionId: result.sessionId, keyword: String(route.param('item')) });
            if (selected.kind !== 'ongoing') {
                await message.send({ format: negotiationFormat(selected) });
                return;
            }
            const item = selected.inventory.items.find(entry => Number(entry.id) === Number(route.param('item')));
            const quantity = Number(route.param('quantity') ?? 1);
            if (!item || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > Math.min(item.available, 999999))
                throw new Error('交付数量无效或未绑定数量不足。');
            const data = `${prefix(selected)} ${selected.revision} ${item.id}`;
            const markdown = Format.createMarkdown().addTitle('交涉 · 确认交付').addNewline().addNewline()
                .addText(`向【${selected.name}】交付：${item.name} ×${quantity}`).addNewline()
                .addBlockquote(`可用 ${item.available}｜${item.policy.subtype}`).addNewline().addNewline()
                .addText('对方会如何回应，只有出示后才知道。喜好物品收下后消耗；一般与厌恶物品不收，仍留在背包，但可能激怒对方。');
            await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
                    .addButton('确认交付', `/交涉交付 ${data} ${quantity}`, { type: 'command', autoEnter: true, style: 'blue' })
                    .addButton('修改数量', `/交涉物品 ${data} `, { type: 'command', autoEnter: false })
                    .addButton('返回', `/交涉分页 ${prefix(selected)} 1`, { type: 'command', autoEnter: true })) });
            return;
        }
        await message.send({ format: negotiationFormat(result) });
    }
    catch (error) {
        const buttons = Format.createButtonGroup().addRow();
        if (error instanceof NegotiationCombatError)
            buttons.addButton('战斗面板', '/战斗信息', { type: 'command', autoEnter: true, style: 'blue' });
        else
            buttons.addButton('返回交涉', `/交涉 ${spawnId}`, { type: 'command', autoEnter: true, style: 'blue' });
        buttons.addButton('操作面板', '/面板', { type: 'command', autoEnter: true });
        await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('交涉提示').addNewline().addNewline().addText(error instanceof Error ? error.message : '交涉暂时无法继续。'))
                .addButtonGroup(buttons) });
    }
};

export { negotiationFormat, negotiationHandler };
