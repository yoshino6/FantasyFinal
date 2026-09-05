import { useEvent, useMessage, useRoute, Format } from 'alemonjs';
import { addNpcAffinity, requireNpcAtCurrentPosition } from '../game/adventure.service.js';
import { buyHunterItem, sellHunterItem, hunterDailySpecial, hunterCatalog, hunterSellCatalog } from '../game/hunter-lodge.service.js';
import { messageFormat } from '../game/message.js';

const code = 'hunter_lodge';
const requireHunter = (qqUserId) => requireNpcAtCurrentPosition(qqUserId, code);
const timeScene = () => {
    const hour = new Date().getHours();
    if (hour < 11)
        return '晨雾还挂在屋檐下。雷恩正在门前削制箭杆，黄发间夹着几缕霜白，锐利的目光却始终没有离开密林深处。';
    if (hour < 18)
        return '日光穿过窗格，照亮墙上整齐悬挂的长弓与兽皮。雷恩正检查刚带回的猎获，动作干净利落。';
    return '油灯映着木屋内的旧地图，密密麻麻的迷宫标记一直延到桌沿。雷恩慢慢磨着箭簇，林中的夜声被他听得一清二楚。';
};
const lodgeFormat = async (text, continuingChat = false) => {
    const markdown = Format.createMarkdown().addTitle('幽暗密林·猎户小屋').addNewline().addNewline().addText('【雷恩·霍尔特】').addNewline().addNewline().addBlockquote(text ?? timeScene());
    if (continuingChat)
        return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('切磋', '/切磋 hunter_lodge', { type: 'command', autoEnter: true, style: 'blue' }).addButton('继续闲聊', '/猎户闲聊', { type: 'command', autoEnter: true, style: 'blue' }));
    return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup()
        .addRow().addButton('我要买', '/猎户购买', { type: 'command', autoEnter: true, style: 'blue' }).addButton('我要卖', '/猎户出售', { type: 'command', autoEnter: true, style: 'blue' })
        .addRow().addButton('切磋', '/切磋 hunter_lodge', { type: 'command', autoEnter: true, style: 'blue' }).addButton('闲聊', '/猎户闲聊', { type: 'command', autoEnter: true, style: 'blue' }).addButton('离开 猎户小屋', '/建筑离开 hunter_lodge', { type: 'command', autoEnter: true }));
};
const pageButtons = (page, totalPages, command, search, keyword = '') => Format.createButtonGroup().addRow()
    .addButton('上一页', `/${command} ${Math.max(1, page - 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page > 1 ? 'blue' : undefined })
    .addButton('搜索', `/${search} `, { type: 'command', autoEnter: false })
    .addButton('下一页', `/${command} ${Math.min(totalPages, page + 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page < totalPages ? 'blue' : undefined })
    .addRow().addButton('返回 猎户小屋', '/猎户小屋', { type: 'command', autoEnter: true });
const buyFormat = async (qqUserId, page = 1, keyword = '') => {
    const shop = await hunterCatalog(qqUserId, page, keyword);
    const markdown = Format.createMarkdown().addTitle('猎户小屋·购买').addNewline().addNewline()
        .addBlockquote(shop.special.name ? `雷恩把一捆新鲜猎获放到柜台上。“今天收得多，${shop.special.name} 便宜些。要就拿走，别浪费。”` : '雷恩将兽材按大小与新鲜度分开放好。“都是我亲手带回来的。密林里没有白拿的东西，价格自然也不会低。”').addNewline().addNewline();
    if (!shop.items.length)
        markdown.addText('没有找到符合条件的兽材。');
    const marks = '①②③④⑤';
    for (const [index, item] of shop.items.entries()) {
        markdown.addText(`${marks.charAt(index)}【${item.category}】`).addButton(item.name, { data: `/物品图鉴 ${item.codexId}`, autoEnter: false }).addText(' ');
        if (item.specialPrice !== null)
            markdown.addText('【特价】');
        markdown.addButton('[购买]', { data: `/购买猎户物品 ${item.id} `, autoEnter: false }).addNewline();
        markdown.addBlockquote(item.specialPrice !== null ? `特价：铜币×${item.specialPrice}（原价×${item.price}）｜剩余：${item.stockQuantity}｜${item.ownedQuantity ? `已拥有${item.ownedQuantity}` : '未拥有'}` : `价格：铜币×${item.price}｜剩余：${item.stockQuantity}｜${item.ownedQuantity ? `已拥有${item.ownedQuantity}` : '未拥有'}`).addNewline();
        markdown.addBlockquote(`简介：${item.description}`).addNewline().addNewline();
    }
    markdown.addText(`当前第（${shop.page}/${shop.totalPages}）页｜持有铜币：${shop.copper}`);
    return Format.create().addMarkdown(markdown).addButtonGroup(pageButtons(shop.page, shop.totalPages, '猎户购买页', '猎户购买搜索', shop.keyword));
};
const sellFormat = async (qqUserId, page = 1, keyword = '') => {
    const shop = await hunterSellCatalog(qqUserId, page, keyword);
    const markdown = Format.createMarkdown().addTitle('猎户小屋·出售').addNewline().addNewline().addBlockquote('雷恩扫过你的背包。“药剂、食物之类的消耗品我收。进迷宫前，多一份补给，也许就多一条命。”').addNewline().addNewline();
    if (!shop.items.length)
        markdown.addText('背包中没有雷恩会收购的消耗品。');
    shop.items.forEach((item, index) => markdown.addText(`${'①②③④⑤'.charAt(index)}【${item.category}】${item.name}×${item.quantity} `).addButton('[出售]', { data: `/出售猎户物品 ${item.id} `, autoEnter: false }).addNewline().addBlockquote(`收购价：铜币×${item.price}`).addNewline().addNewline());
    markdown.addText(`当前第（${shop.page}/${shop.totalPages}）页｜持有铜币：${shop.copper}`);
    return Format.create().addMarkdown(markdown).addButtonGroup(pageButtons(shop.page, shop.totalPages, '猎户出售页', '猎户出售搜索', shop.keyword));
};
const hunterLodgeHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    await requireHunter(event.current.UserId);
    await message.send({ format: await lodgeFormat() });
}
catch (error) {
    await message.send({ format: messageFormat('无法敲门', error instanceof Error ? error.message : '请稍后重试。') });
} };
const hunterBuyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    await requireHunter(event.current.UserId);
    await message.send({ format: await buyFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) });
}
catch (error) {
    await message.send({ format: messageFormat('购买列表不可用', error instanceof Error ? error.message : '请稍后重试。') });
} };
const hunterBuySearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    await requireHunter(event.current.UserId);
    await message.send({ format: await buyFormat(event.current.UserId, 1, String(route.param('keyword'))) });
}
catch (error) {
    await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const hunterPurchaseHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    await requireHunter(event.current.UserId);
    const amount = String(route.param('quantity') ?? '').trim();
    const result = await buyHunterItem(event.current.UserId, Number(route.param('id')), amount ? Number(amount) : 1);
    await addNpcAffinity(event.current.UserId, code, 'buy');
    await message.send({ format: messageFormat('购买成功', `获得【${result.name}】×${result.quantity}\n消耗铜币×${result.price}`) });
    await message.send({ format: await buyFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('购买失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const hunterSellHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    await requireHunter(event.current.UserId);
    await message.send({ format: await sellFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) });
}
catch (error) {
    await message.send({ format: messageFormat('出售列表不可用', error instanceof Error ? error.message : '请稍后重试。') });
} };
const hunterSellSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    await requireHunter(event.current.UserId);
    await message.send({ format: await sellFormat(event.current.UserId, 1, String(route.param('keyword'))) });
}
catch (error) {
    await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const hunterSellItemHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    await requireHunter(event.current.UserId);
    const amount = String(route.param('quantity') ?? '').trim();
    const result = await sellHunterItem(event.current.UserId, Number(route.param('id')), amount ? Number(amount) : 1);
    await addNpcAffinity(event.current.UserId, code, 'sell');
    await message.send({ format: messageFormat('出售成功', `出售【${result.name}】×${result.quantity}\n获得铜币×${result.price}`) });
    await message.send({ format: await sellFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('出售失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const hunterChatHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    await requireHunter(event.current.UserId);
    const affinity = await addNpcAffinity(event.current.UserId, code, 'chat');
    const special = await hunterDailySpecial(await import('../database/pool.js').then(module => module.getPool()));
    const history = affinity.affinity >= 500 ? '他的目光掠过桌上那张被反复描画的地下迷宫图，声音低了几分。“那里夺走过我最重要的人。剩下的路，我得替她走完。”' : affinity.affinity >= 50 ? '雷恩擦拭着箭簇，淡淡道：“迷宫从不缺宝物，缺的是能活着带着同伴出来的人。”' : '雷恩抬眼看了你一瞬，目光锋利得像箭尖。“密林会记住轻敌的人。走之前，先确认自己准备好了。”';
    const specialText = special.name ? `\n\n他朝角落的猎获努了努下巴：“今天${special.name} 多了些，已经按特价摆着。”` : '';
    await message.send({ format: await lodgeFormat(`${history}${specialText}`, true) });
}
catch (error) {
    await message.send({ format: messageFormat('无法闲聊', error instanceof Error ? error.message : '请稍后重试。') });
} };

export { hunterBuyHandler, hunterBuySearchHandler, hunterChatHandler, hunterLodgeHandler, hunterPurchaseHandler, hunterSellHandler, hunterSellItemHandler, hunterSellSearchHandler };
