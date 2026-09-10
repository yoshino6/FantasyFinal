import { secondaryShopFormat } from './secondary-shop.js';
import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { addNpcAffinity, nearbyPoints, requireNpcAtCurrentPosition } from '../game/adventure.service.js';
import { buyBlacksmithEquipment, sellBlacksmithEquipment, sellBlacksmithMaterial, blacksmithSellCatalog } from '../game/blacksmith-shop.service.js';
import { xiaobeiCraftsmanshipStatus, learnXiaobeiCraftsmanship } from '../game/blacksmith.service.js';
import { messageFormat } from '../game/message.js';
import { npcChatDialogue } from '../game/npc-dialogue.service.js';

const requireBlacksmithShop = async (qqUserId) => {
    await requireNpcAtCurrentPosition(qqUserId, 'blacksmith');
};
const sellPageButtons = (page, totalPages, keyword = '') => Format.createButtonGroup().addRow()
    .addButton('上一页', `/铁匠铺出售页 ${Math.max(1, page - 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page > 1 ? 'blue' : undefined })
    .addButton('搜索', '/铁匠铺出售搜索 ', { type: 'command', autoEnter: false, style: 'blue' })
    .addButton('下一页', `/铁匠铺出售页 ${Math.min(totalPages, page + 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page < totalPages ? 'blue' : undefined })
    .addRow().addButton('返回 铁匠铺', '/铁匠铺', { type: 'command', autoEnter: true });
const buyFormat = async (qqUserId, page = 1, category = '全部', keyword = '') => secondaryShopFormat(qqUserId, 'blacksmith', page, keyword, category);
const sellFormat = async (qqUserId, page = 1, keyword = '') => {
    const shop = await blacksmithSellCatalog(qqUserId, page, keyword);
    const markdown = Format.createMarkdown().addTitle('铁匠铺·出售').addNewline().addNewline()
        .addBlockquote(keyword ? `小北看了看你挑出的「${keyword}」相关物品。` : '“未装备的武器和防具，还有兽材、锻材、粒子都可以拿来。我会按材料与成色收下。”小北从铁砧旁拖来一只空木箱。').addNewline().addNewline();
    if (!shop.items.length)
        markdown.addText('没有可出售的未装备物品或锻造素材。');
    shop.items.forEach((item, index) => {
        const command = item.kind === 'equipment' ? `/出售铁匠铺装备 ${item.id}` : `/出售铁匠铺材料 ${item.id} `;
        const suffix = item.kind === 'equipment' ? ` #${item.id}` : `×${item.quantity}`;
        const detail = item.kind === 'equipment' ? `等级：Lv.${item.level}｜品质：${(item.quality ?? 0).toFixed(1)}%｜收购价：铜币×${item.price}` : `收购价：铜币×${item.price}`;
        markdown.addText(`${'①②③④⑤'[index]}【${item.category}】${item.name}${suffix} `).addButton('[出售]', { data: command, autoEnter: false }).addNewline().addBlockquote(detail).addNewline().addNewline();
    });
    markdown.addText(`当前第(${shop.page}/${shop.totalPages})页｜持有铜币：${shop.copper}`);
    return Format.create().addMarkdown(markdown).addButtonGroup(sellPageButtons(shop.page, shop.totalPages, shop.keyword));
};
const blacksmithShopBuyListHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        await requireBlacksmithShop(event.current.UserId);
        await message.send({ format: await buyFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('category') ?? '全部'), String(route.param('keyword') ?? '')) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法购买', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const blacksmithShopBuySearchHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        await requireBlacksmithShop(event.current.UserId);
        await message.send({ format: await buyFormat(event.current.UserId, 1, String(route.param('category') ?? '全部'), String(route.param('keyword'))) });
    }
    catch (error) {
        await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const blacksmithShopPurchaseHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        await requireBlacksmithShop(event.current.UserId);
        const requested = String(route.param('quantity') ?? '').trim();
        const result = await buyBlacksmithEquipment(event.current.UserId, Number(route.param('id')), requested ? Number(requested) : 1);
        await addNpcAffinity(event.current.UserId, 'blacksmith', 'buy');
        await message.send({ format: messageFormat('购买成功', `获得【${result.name}】×${result.quantity}\n消耗铜币×${result.price}`) });
        await message.send({ format: await buyFormat(event.current.UserId) });
    }
    catch (error) {
        await message.send({ format: messageFormat('购买失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const blacksmithShopSellListHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        await requireBlacksmithShop(event.current.UserId);
        await message.send({ format: await sellFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法出售', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const blacksmithShopSellSearchHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        await requireBlacksmithShop(event.current.UserId);
        await message.send({ format: await sellFormat(event.current.UserId, 1, String(route.param('keyword'))) });
    }
    catch (error) {
        await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const blacksmithShopSellHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        await requireBlacksmithShop(event.current.UserId);
        const result = await sellBlacksmithEquipment(event.current.UserId, Number(route.param('instanceId')));
        await addNpcAffinity(event.current.UserId, 'blacksmith', 'sell');
        await message.send({ format: messageFormat('出售成功', `出售【${result.name}】\n获得铜币×${result.price}`) });
        await message.send({ format: await sellFormat(event.current.UserId) });
    }
    catch (error) {
        await message.send({ format: messageFormat('出售失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const blacksmithShopSellMaterialHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        await requireBlacksmithShop(event.current.UserId);
        const requested = String(route.param('quantity') ?? '').trim();
        const result = await sellBlacksmithMaterial(event.current.UserId, Number(route.param('itemId')), requested ? Number(requested) : 1);
        await addNpcAffinity(event.current.UserId, 'blacksmith', 'sell');
        await message.send({ format: messageFormat('出售成功', `出售【${result.name}】×${result.quantity}\n获得铜币×${result.price}`) });
        await message.send({ format: await sellFormat(event.current.UserId) });
    }
    catch (error) {
        await message.send({ format: messageFormat('出售失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const blacksmithChatHandler = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        await requireBlacksmithShop(event.current.UserId);
        const { affinity, rank } = await addNpcAffinity(event.current.UserId, 'blacksmith', 'chat');
        const detailsUnlocked = (await nearbyPoints(event.current.UserId)).npcDetailsUnlocked;
        const text = npcChatDialogue('blacksmith', affinity);
        const craftHeart = await xiaobeiCraftsmanshipStatus(event.current.UserId);
        if (affinity >= 200 && !craftHeart.learned) {
            const markdown = Format.createMarkdown().addTitle('百纳镇·铁匠铺').addNewline().addNewline().addText('【漠北·Lv.3 锻造师】').addNewline().addNewline().addBlockquote(text).addNewline().addNewline();
            if (detailsUnlocked)
                markdown.addText(`好感：${affinity}｜${rank.title}`).addNewline().addNewline();
            markdown.addText('小北从工具架上取下一枚刻着锤纹的铁片：“我有个不错的本事，或许你学得会。要不要试试？”').addNewline().addNewline()
                .addText('是否消耗 5 技能点学习绑定技能【匠心】？');
            const buttons = Format.createButtonGroup().addRow()
                .addButton('确认学习', '/学习小北的匠心', { type: 'command', autoEnter: true, style: 'blue' })
                .addButton('下次再来', '/铁匠铺', { type: 'command', autoEnter: true })
                .addRow().addButton('切磋', '/切磋 blacksmith', { type: 'command', autoEnter: true, style: 'blue' }).addButton('继续闲聊', '/铁匠铺闲聊', { type: 'command', autoEnter: true, style: 'blue' });
            await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
            return;
        }
        const markdown = Format.createMarkdown().addTitle('百纳镇·铁匠铺').addNewline().addNewline().addText('【漠北·Lv.3 锻造师】').addNewline().addNewline().addBlockquote(text);
        if (detailsUnlocked)
            markdown.addNewline().addNewline().addText(`好感：${affinity}｜${rank.title}`);
        const buttons = Format.createButtonGroup().addRow().addButton('切磋', '/切磋 blacksmith', { type: 'command', autoEnter: true, style: 'blue' }).addButton('继续闲聊', '/铁匠铺闲聊', { type: 'command', autoEnter: true, style: 'blue' });
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法闲聊', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const learnXiaobeiCraftsmanshipHandler = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        await requireBlacksmithShop(event.current.UserId);
        const result = await learnXiaobeiCraftsmanship(event.current.UserId);
        await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('学习技能').addNewline().addNewline().addText(`已学习绑定技能【${result.name}】，消耗 ${result.cost} 技能点。`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('技能列表', '/技能列表 已学习', { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回 铁匠铺', '/铁匠铺', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('学习失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { blacksmithChatHandler, blacksmithShopBuyListHandler, blacksmithShopBuySearchHandler, blacksmithShopPurchaseHandler, blacksmithShopSellHandler, blacksmithShopSellListHandler, blacksmithShopSellMaterialHandler, blacksmithShopSellSearchHandler, learnXiaobeiCraftsmanshipHandler };
