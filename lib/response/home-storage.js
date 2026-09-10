import { useRoute, useEvent, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { depositHomeStorage, homeStorageView } from '../game/home.service.js';
import { messageFormat } from '../game/message.js';

const categories = ['装备', '道具', '材料'];
const scopes = { 背包: 'backpack', 仓储: 'storage' };
const categoryOf = (value) => categories.includes(String(value)) ? String(value) : '装备';
const scopeOf = (value) => scopes[String(value)] ?? 'backpack';
const storageFormat = async (qqUserId, scope, category, page = 1, keyword = '') => {
    const result = await homeStorageView(qqUserId, scope, category);
    const normalizedKeyword = keyword.trim();
    const items = [...result.instances.map(item => ({ type: 'instance', ...item })), ...result.stacked.map(item => ({ type: 'stacked', ...item }))]
        .filter(item => !normalizedKeyword || item.name.includes(normalizedKeyword) || item.item_category.includes(normalizedKeyword));
    const totalPages = Math.max(1, Math.ceil(items.length / 10));
    const currentPage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
    const displayed = items.slice((currentPage - 1) * 10, currentPage * 10);
    const scopeText = scope === 'backpack' ? '背包' : '仓储';
    const markdown = Format.createMarkdown().addTitle('我的家园·储物面板').addNewline().addNewline()
        .addBlockquote(`当前：${scopeText}｜储物容量：${result.usedWeight.toFixed(2)}/${result.capacity.toFixed(2)} kg`).addNewline().addNewline()
        .addText(`分类：${category}`).addNewline().addNewline();
    if (!displayed.length)
        markdown.addBlockquote(normalizedKeyword ? '没有找到符合条件的物品。' : `${scopeText}中暂无该分类物品。`).addNewline();
    for (const item of displayed) {
        markdown.addBlockquote('');
        if (item.type === 'instance')
            markdown.addButton(`【${item.item_category}】${item.name}`, { data: `/装备详情 ${item.id}`, autoEnter: false }).addText(`｜品质 ${Number(item.quality).toFixed(2)}%｜耐久 ${item.durability}/${item.durability_max}`);
        else {
            markdown.addButton(`【${item.item_category}】${item.name}`, { data: `/物品图鉴 ${item.codex_id}`, autoEnter: false }).addText(` × ${item.quantity}`);
            if (scope === 'backpack')
                markdown.addText(' ').addButton('[放入]', { data: `/家园放入 ${item.id} `, autoEnter: false });
        }
        markdown.addNewline();
    }
    markdown.addNewline().addText(`当前第（${currentPage}/${totalPages}）页`);
    const command = (target) => `/家园储物分页 ${scopeText} ${category} ${target}${normalizedKeyword ? ` ${normalizedKeyword}` : ''}`;
    const buttons = Format.createButtonGroup().addRow()
        .addButton('上一页', command(Math.max(1, currentPage - 1)), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined })
        .addButton('搜索', `/家园储物搜索 ${scopeText} ${category} `, { type: 'command', autoEnter: false })
        .addButton('下一页', command(Math.min(totalPages, currentPage + 1)), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined });
    buttons.addRow();
    for (const itemCategory of categories)
        buttons.addButton(itemCategory, `/家园储物 ${scopeText} ${itemCategory}`, { type: 'command', autoEnter: true, style: itemCategory === category ? 'blue' : undefined });
    buttons.addRow()
        .addButton('背包', `/家园储物 背包 ${category}`, { type: 'command', autoEnter: true, style: scope === 'backpack' ? 'blue' : undefined })
        .addButton('仓储', `/家园储物 仓储 ${category}`, { type: 'command', autoEnter: true, style: scope === 'storage' ? 'blue' : undefined });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const sendStorage = async (scope, category, page = 1, keyword = '') => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        await message.send({ format: await storageFormat(event.current.UserId, scope, category, page, keyword) });
    }
    catch (error) {
        await message.send({ format: messageFormat('家园储物不可用', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const homeStorageHandler = async () => { const [route] = useRoute(); await sendStorage(scopeOf(route.param('scope')), categoryOf(route.param('category'))); };
const homeStoragePageHandler = async () => { const [route] = useRoute(); await sendStorage(scopeOf(route.param('scope')), categoryOf(route.param('category')), Number(route.param('page')), String(route.param('keyword') ?? '')); };
const homeStorageSearchHandler = async () => { const [route] = useRoute(); await sendStorage(scopeOf(route.param('scope')), categoryOf(route.param('category')), 1, String(route.param('keyword') ?? '')); };
const homeStorageDepositHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const result = await depositHomeStorage(event.current.UserId, Number(route.param('id')), Number(route.param('quantity')));
        await message.send({ format: messageFormat('放入完成', `已放入【${result.name}】×${result.quantity}\n仓储负重：${result.usedWeight.toFixed(2)}/${result.capacity.toFixed(2)} kg`) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法放入', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { homeStorageDepositHandler, homeStorageHandler, homeStoragePageHandler, homeStorageSearchHandler };
