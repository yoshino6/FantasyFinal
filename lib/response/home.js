import { useEvent, useRoute, useMessage, Format } from 'alemonjs';
import { craftFurniture, homePanel, enterHome, expandHome, leaveHome, purchaseHome, removeFurniture, renameHome, upgradeHome, listFurniture } from '../game/home.service.js';
import { homeFloorImage } from '../game/home-render.service.js';
import { moveTo } from '../game/adventure.service.js';
import { durationText } from '../game/time-format.js';
import { messageFormat } from '../game/message.js';
import { scheduleTravelCompletion } from './adventure.js';

const effectText = (effects) => {
    const labels = { restRecoveryPct: '体力恢复速度', storageCapacity: '家园储物容量', trainingBonusPct: '战斗技能领悟概率', cleanseOnHomeRest: '休息清除全部异常状态', alchemyBonusPct: '炼金氛围', homeRestExperiencePerMinute: '休息经验' };
    const entries = Object.entries(effects).filter(([, value]) => value);
    const order = ['①', '②', '③', '④', '⑤'];
    return entries.length ? entries.map(([key, value], index) => `${order[index] ?? `${index + 1}.`} ${labels[key] ?? key}${key === 'cleanseOnHomeRest' ? '' : `+${value}${key.includes('Pct') ? '%' : key === 'homeRestExperiencePerMinute' ? '/分钟' : ''}`}`).join('\n') : '尚未获得家具效果';
};
const homeTravelFormat = (regionName, x, y, seconds, remaining) => Format.create()
    .addMarkdown(Format.createMarkdown().addTitle('家园').addNewline().addNewline()
    .addText(`正在前往${regionName}·我的小屋（${x}, ${y}）`).addNewline()
    .addText(`预计耗时${durationText(seconds)}`).addNewline()
    .addText(`当前剩余${durationText(remaining)}`))
    .addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('刷新', '/刷新行动', { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('取消移动', '/取消移动', { type: 'command', autoEnter: true, style: 'blue' }));
const homeFormat = async (qqUserId, notice = '') => {
    const panel = await homePanel(qqUserId);
    const markdown = Format.createMarkdown().addTitle('百纳镇·我的家园').addNewline().addNewline();
    if (!panel.home) {
        markdown.addBlockquote('百纳居为冒险者准备了可安置在城镇公共地块上的私人小屋。同一地块可以容纳多名住户，彼此的屋内互不干扰。').addNewline().addNewline()
            .addText('简陋木屋：**铜币×500**').addNewline().addText('购买后可在百纳居查看地块，并前往地块回家。');
        return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
            .addButton('购买小屋', '/家园购买', { type: 'command', autoEnter: true, style: 'blue' })
            .addButton('前往百纳居', '/前往 7 -166', { type: 'command', autoEnter: true, style: 'blue' }));
    }
    const home = panel.home;
    markdown.addText(`**${home.home_name || `${panel.character.name}的小屋`}** `).addButton('[更名]', { data: '/家园改名 ', autoEnter: false }).addNewline().addNewline()
        .addBlockquote(`房屋 Lv.${home.house_level}｜${home.floor_count} 层`).addNewline()
        .addBlockquote(`坐标：(${home.plot_x}, ${home.plot_y})`).addNewline().addNewline()
        .addText(panel.inHome ? '**当前：在家中**' : '**当前：在屋外**').addNewline()
        .addBlockquote(panel.inHome ? '普通冒险者无法发现你；若你处于百纳镇通缉状态，仍会公开行踪并可被合法缉捕。' : '使用“回家”会立即开始前往小屋；抵达后将自动进入家园。').addNewline().addNewline();
    if (notice)
        markdown.addBlockquote(notice).addNewline().addNewline();
    markdown.addText('家具效果：').addNewline().addBlockquote(effectText(panel.effects)).addNewline().addNewline();
    const buttons = Format.createButtonGroup().addRow()
        .addButton(panel.inHome ? '出门' : '回家', panel.inHome ? '/家园出门' : '/家园回家', { type: 'command', autoEnter: true, style: 'blue' })
        .addButton('家具', '/家园家具', { type: 'command', autoEnter: true, style: 'blue' });
    if (Number(panel.effects.storageCapacity ?? 0) > 0)
        buttons.addButton('储物', '/家园储物', { type: 'command', autoEnter: true, style: 'blue' });
    buttons.addRow().addButton('查看一层', '/家园楼层 1', { type: 'command', autoEnter: true, style: 'blue' });
    if (Number(home.floor_count) >= 2)
        buttons.addButton('查看二层', '/家园楼层 2', { type: 'command', autoEnter: true, style: 'blue' });
    if (Number(home.floor_count) >= 3)
        buttons.addButton('查看三层', '/家园楼层 3', { type: 'command', autoEnter: true, style: 'blue' });
    if (home.house_level < 3)
        buttons.addRow().addButton('升级房屋', '/家园升级', { type: 'command', autoEnter: true, style: 'blue' });
    if (home.floor_count < 2)
        buttons.addButton('扩建二层', '/家园扩建 2', { type: 'command', autoEnter: true, style: home.house_level >= 2 ? 'blue' : undefined });
    else if (home.floor_count < 3)
        buttons.addButton('扩建三层', '/家园扩建 3', { type: 'command', autoEnter: true, style: home.house_level >= 3 ? 'blue' : undefined });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const furnitureFormat = async (qqUserId, page = 1, keyword = '') => {
    const result = await listFurniture(qqUserId);
    const normalizedKeyword = keyword.trim();
    const matchedDefinitions = result.definitions.filter(definition => !normalizedKeyword || definition.name.includes(normalizedKeyword) || definition.description.includes(normalizedKeyword));
    const pageSize = 5;
    const pageCount = Math.max(1, Math.ceil(matchedDefinitions.length / pageSize));
    const currentPage = Math.min(pageCount, Math.max(1, Math.floor(page) || 1));
    const start = (currentPage - 1) * pageSize;
    const definitions = matchedDefinitions.slice(start, start + pageSize);
    const order = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
    const markdown = Format.createMarkdown().addTitle('我的家园·家具').addNewline().addNewline()
        .addBlockquote(`第 ${currentPage}/${pageCount} 页｜房屋 Lv.${result.home.house_level}｜${result.home.floor_count} 层｜每层 ${result.slots} 个槽位。制作后会自动选择合法位置。`).addNewline().addNewline();
    if (normalizedKeyword)
        markdown.addBlockquote(`搜索：${normalizedKeyword}｜共 ${matchedDefinitions.length} 条`).addNewline().addNewline();
    if (!definitions.length)
        markdown.addBlockquote('没有找到匹配的家具。').addNewline().addNewline();
    for (const [offset, definition] of definitions.entries()) {
        const recipe = (result.recipes.get(definition.code) ?? []).map(item => `${item.name}×${item.quantity}`).join('、') || '无需材料';
        const index = start + offset;
        const owned = result.ownedCounts.get(definition.code) ?? 0;
        markdown.addText(`${order[index] ?? `${index + 1}.`}【${definition.name}】`).addButton('[制作]', { data: `/家园制作 ${definition.code} 1`, autoEnter: false }).addNewline().addNewline()
            .addBlockquote(definition.description).addNewline().addNewline()
            .addBlockquote(`占格 ${definition.grid_width}×${definition.grid_height}｜每层最多 ${definition.max_per_floor} 个`).addNewline().addNewline()
            .addBlockquote(`**已拥有：${owned}**`).addNewline().addNewline()
            .addBlockquote(`需要：${recipe}`).addNewline().addNewline();
    }
    const pageCommand = (target) => `/家园制作清单 ${target}${normalizedKeyword ? ` ${normalizedKeyword}` : ''}`;
    const buttons = Format.createButtonGroup().addRow()
        .addButton('上一页', pageCommand(Math.max(1, currentPage - 1)), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined })
        .addButton('搜索', '/家园家具搜索 ', { type: 'command', autoEnter: false })
        .addButton('下一页', pageCommand(Math.min(pageCount, currentPage + 1)), { type: 'command', autoEnter: true, style: currentPage < pageCount ? 'blue' : undefined });
    buttons.addRow().addButton('制作清单', '/家园制作清单 1', { type: 'command', autoEnter: true, style: 'blue' })
        .addButton('家具摆放', '/家园家具摆放 1', { type: 'command', autoEnter: true, style: 'blue' });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const furniturePlacementFormat = async (qqUserId, floor) => {
    const result = await listFurniture(qqUserId, floor);
    if (!Number.isInteger(floor) || floor < 1 || floor > Number(result.home.floor_count))
        throw new Error('该楼层尚未扩建。');
    const used = result.installed.reduce((sum, item) => sum + (result.definitions.find(definition => definition.code === item.furniture_code)?.floor_slot_cost ?? 0), 0);
    const order = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
    const markdown = Format.createMarkdown().addTitle('我的家园·家具摆放').addNewline().addNewline()
        .addBlockquote(`第 ${floor} 层｜已占 ${used}/${result.slots} 个槽位。选择已摆放家具可收回；制作家具会自动摆入当前指定楼层的合法位置。`).addNewline().addNewline();
    if (!result.installed.length)
        markdown.addBlockquote('本层暂未摆放家具。请先前往制作清单打造家具。').addNewline().addNewline();
    result.installed.forEach((item, index) => {
        const rotated = Number(item.rotation) % 180 !== 0;
        const width = rotated ? item.grid_height : item.grid_width;
        const height = rotated ? item.grid_width : item.grid_height;
        markdown.addText(`${order[index] ?? `${index + 1}.`}【${item.name}】`).addButton('[收回]', { data: `/家园拆除 ${item.id}`, autoEnter: false }).addNewline().addNewline()
            .addBlockquote(`坐标：(${item.grid_x ?? '待定'}, ${item.grid_y ?? '待定'})｜占格 ${width}×${height}`).addNewline().addNewline();
    });
    const buttons = Format.createButtonGroup().addRow().addButton('一层', '/家园家具摆放 1', { type: 'command', autoEnter: true, style: 'blue' });
    if (Number(result.home.floor_count) >= 2)
        buttons.addButton('二层', '/家园家具摆放 2', { type: 'command', autoEnter: true, style: 'blue' });
    if (Number(result.home.floor_count) >= 3)
        buttons.addButton('三层', '/家园家具摆放 3', { type: 'command', autoEnter: true, style: 'blue' });
    buttons.addRow().addButton('制作清单', '/家园制作清单', { type: 'command', autoEnter: true, style: 'blue' });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const homeHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    await message.send({ format: await homeFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('家园不可用', error instanceof Error ? error.message : '请稍后重试。') });
} };
const homePurchaseHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    const result = await purchaseHome(event.current.UserId);
    await message.send({ format: await homeFormat(event.current.UserId, `已购买简陋木屋，公共地块位于 (${result.plot.x}, ${result.plot.y})。`) });
}
catch (error) {
    await message.send({ format: messageFormat('购买失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const homeEnterHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const panel = await homePanel(event.current.UserId);
        if (!panel.home)
            throw new Error('你还没有小屋，请先在百纳居购买。');
        if (panel.inHome) {
            await message.send({ format: await homeFormat(event.current.UserId, '你已经在家中。') });
            return;
        }
        const result = await moveTo(event.current.UserId, Number(panel.home.plot_x), Number(panel.home.plot_y), { destinationKind: 'home', destinationRegionId: Number(panel.home.town_region_id) });
        if (result.kind === 'travel') {
            await message.send({ format: homeTravelFormat(result.regionName, result.x, result.y, result.seconds, result.remaining) });
            scheduleTravelCompletion(message, event.current.UserId, result.remaining);
            return;
        }
        const entry = await enterHome(event.current.UserId);
        await message.send({ format: await homeFormat(event.current.UserId, `你已回家。${entry.pursuit?.text ? `\n${entry.pursuit.text}` : ''}`) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法回家', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const homeLeaveHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    await leaveHome(event.current.UserId);
    await message.send({ format: messageFormat('百纳镇·我的家园', '你离开了家园。') });
}
catch (error) {
    await message.send({ format: messageFormat('无法出门', error instanceof Error ? error.message : '请稍后重试。') });
} };
const homeRenameHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    const result = await renameHome(event.current.UserId, String(route.param('name')));
    await message.send({ format: await homeFormat(event.current.UserId, `小屋已更名为「${result.name}」。`) });
}
catch (error) {
    await message.send({ format: messageFormat('家园改名失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const homeUpgradeHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    const result = await upgradeHome(event.current.UserId);
    await message.send({ format: await homeFormat(event.current.UserId, `房屋已升级至 Lv.${result.level}。`) });
}
catch (error) {
    await message.send({ format: messageFormat('升级失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const homeExpandHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    const result = await expandHome(event.current.UserId, Number(route.param('floor')));
    await message.send({ format: await homeFormat(event.current.UserId, `第 ${result.floor} 层扩建完成。`) });
}
catch (error) {
    await message.send({ format: messageFormat('扩建失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const homeFloorHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const result = await homeFloorImage(event.current.UserId, Number(route.param('floor')));
        await message.send({ format: Format.create().addImage(result.image) });
        await message.send({ format: await homeFormat(event.current.UserId, `已展示第 ${result.floor} 层室内图｜已摆放 ${result.furniture.length} 件家具${result.cached ? '｜已使用缓存图' : ''}。`) });
    }
    catch (error) {
        await message.send({ format: messageFormat('室内图暂不可用', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const homeFurnitureHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    const raw = String(route.param('page') ?? '').trim();
    const keyword = String(route.param('keyword') ?? '').trim();
    await message.send({ format: await furnitureFormat(event.current.UserId, raw ? Number(raw) : 1, keyword) });
}
catch (error) {
    await message.send({ format: messageFormat('家具列表不可用', error instanceof Error ? error.message : '请稍后重试。') });
} };
const homeFurnitureSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    await message.send({ format: await furnitureFormat(event.current.UserId, 1, String(route.param('keyword') ?? '').trim()) });
}
catch (error) {
    await message.send({ format: messageFormat('家具搜索不可用', error instanceof Error ? error.message : '请稍后重试。') });
} };
const homeFurniturePlacementHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    const floor = Number(route.param('floor') ?? 1);
    await message.send({ format: await furniturePlacementFormat(event.current.UserId, floor) });
}
catch (error) {
    await message.send({ format: messageFormat('家具摆放不可用', error instanceof Error ? error.message : '请稍后重试。') });
} };
const homeCraftHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const result = await craftFurniture(event.current.UserId, String(route.param('code')), Number(route.param('floor')), String(route.param('slot') ?? ''));
        await message.send({ format: messageFormat('制作完成', `已自动摆放【${result.name}】到第 ${result.floor} 层坐标 (${result.placement.x}, ${result.placement.y})。`) });
    }
    catch (error) {
        await message.send({ format: messageFormat('制作失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const homeRemoveHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const result = await removeFurniture(event.current.UserId, Number(route.param('id')));
        await message.send({ format: messageFormat('收回完成', `已收回【${result.name}】；材料不会返还。`) });
        try {
            const image = await homeFloorImage(event.current.UserId, Number(result.floor_no));
            await message.send({ format: Format.create().addImage(image.image) });
        }
        catch { }
        await message.send({ format: await furniturePlacementFormat(event.current.UserId, Number(result.floor_no)) });
    }
    catch (error) {
        await message.send({ format: messageFormat('收回失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { homeCraftHandler, homeEnterHandler, homeExpandHandler, homeFloorHandler, homeFormat, homeFurnitureHandler, homeFurniturePlacementHandler, homeFurnitureSearchHandler, homeHandler, homeLeaveHandler, homePurchaseHandler, homeRemoveHandler, homeRenameHandler, homeUpgradeHandler };
