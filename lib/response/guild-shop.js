import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { buyShopItem, sellShopItem, shopCatalog, sellCatalog } from '../game/guild-shop.service.js';
import { addNpcAffinity, nearbyPoints } from '../game/adventure.service.js';
import { requireCurrentGuild } from '../game/guild-context.js';
import { messageFormat, npcInteractionMarkdown } from '../game/message.js';

const guildMerchantName = '赫伯特';
const localGuildShopFormat = async (context, user, chat = false) => {
    const nearby = await nearbyPoints(user);
    const name = context.code === 'world_tree' ? '斐珞' : context.hub.host;
    const text = context.code === 'world_tree' ? (chat ? '斐珞将你拿起的昂贵药剂放回高架，换了一瓶普通的推过来。\n\n“贵的能做更多事，可你今天只需要平安回来。先把钱留着，等你知道自己真正缺什么时，再来找我。”' : '藤架上的价签排得整整齐齐。斐珞拨开挡住药瓶标签的叶子，笑着示意你慢慢看：“补给在这边，需要比较的，我替你拿下来。”') : context.hub.description + `\n\n${name}将补给登记簿转向你：“路上的东西，用得上比摆着好看要紧。我们把每项花费都写清楚。”`;
    return Format.create().addMarkdown(npcInteractionMarkdown('冒险者公会·商店', name, text, context.code === 'world_tree' ? 'root_guild_shopkeeper' : undefined, nearby.npcDetailsUnlocked)).addButtonGroup(Format.createButtonGroup().addRow().addButton('我要买', '/商店购买', { type: 'command', autoEnter: true, style: 'blue' }).addButton('我要卖', '/商店出售', { type: 'command', autoEnter: true }).addRow().addButton('闲聊', '/商店闲聊', { type: 'command', autoEnter: true }).addRow().addButton('返回公会', '/初行公会', { type: 'command', autoEnter: true }));
};
const pageButtons = (page, totalPages, command, searchCommand, keyword = '') => Format.createButtonGroup().addRow()
    .addButton('上一页', `/${command} ${Math.max(1, page - 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page > 1 ? 'blue' : undefined })
    .addButton('搜索', `/${searchCommand} `, { type: 'command', autoEnter: false, style: 'blue' })
    .addButton('下一页', `/${command} ${Math.min(totalPages, page + 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page < totalPages ? 'blue' : undefined })
    .addRow().addButton('返回 公会商店', '/工会商店', { type: 'command', autoEnter: true });
const guildShopFormat = (text, speaker, continuingChat = false) => {
    const hour = new Date().getHours();
    const scene = text ?? (hour < 11
        ? '赫伯特刚将晨间送来的药剂、兽材与卷轴归到木架上。他左侧空荡的衣袖被整齐地束在腰间，右手却仍利落地翻着账册。价签一丝不苟，空气里混着羊皮纸与草药的淡香。'
        : hour < 18
            ? '赫伯特正用右手归类药剂、兽材与卷轴。木架上陈列着实用的旅途用品，价签清晰，空气里混着羊皮纸与草药的淡香。'
            : '赫伯特点亮柜台边的小灯，将白日售出的商品补齐。夜间的商店安静而明亮，仍为归来的冒险者留着一盏灯。');
    const markdown = Format.createMarkdown().addTitle('冒险者公会·商店').addNewline().addNewline();
    markdown.addText(`【${speaker ?? guildMerchantName}】`).addNewline().addNewline();
    markdown.addBlockquote(scene.replace(/\r?\n/g, '\n> '));
    if (continuingChat)
        return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('切磋', '/切磋 guild_merchant', { type: 'command', autoEnter: true, style: 'blue' }).addButton('继续闲聊', '/商店闲聊', { type: 'command', autoEnter: true, style: 'blue' }));
    const buttons = Format.createButtonGroup().addRow()
        .addButton('我要买', '/商店购买', { type: 'command', autoEnter: true, style: 'blue' }).addButton('我要卖', '/商店出售', { type: 'command', autoEnter: true, style: 'blue' })
        .addRow().addButton('切磋', '/切磋 guild_merchant', { type: 'command', autoEnter: true, style: 'blue' }).addButton('闲聊', '/商店闲聊', { type: 'command', autoEnter: true, style: 'blue' })
        .addRow().addButton('返回公会大厅', '/初行公会', { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const buyFormat = async (qqUserId, page = 1, keyword = '') => {
    const context = await requireCurrentGuild(qqUserId);
    const guildMerchantName = context.code === 'baina_town' ? '赫伯特' : context.code === 'world_tree' ? '斐珞' : context.hub.host;
    const shop = await shopCatalog(qqUserId, page, keyword);
    const markdown = Format.createMarkdown().addTitle('冒险者公会·商店').addNewline().addNewline()
        .addBlockquote(keyword ? `【${guildMerchantName}】“我把和「${keyword}」有关的商品都找出来了。慢慢看，需要我再说明。”` : `【${guildMerchantName}】“客人想找什么？地图、药剂与材料都可以慢慢挑。出门在外，准备充分总不会错。”`).addNewline().addNewline();
    if (!shop.items.length)
        markdown.addText('没有找到符合条件的商品。');
    const sequence = '①②③④⑤';
    shop.items.forEach((item, index) => {
        const label = item.category === '地图' ? '【地图】' : `【${item.category}】`;
        const ownership = item.ownedQuantity > 0 ? `已拥有${item.ownedQuantity}` : '未拥有';
        markdown.addText(`${sequence[index]}${label}`).addButton(item.name, { data: `/物品图鉴 ${item.codexId}`, autoEnter: false }).addText(' ').addButton('[购买]', { data: `/购买商品 ${item.id} `, autoEnter: false }).addNewline().addBlockquote(`价格：铜币×${item.price}｜剩余：${item.stockQuantity}｜${ownership}`).addNewline().addBlockquote(`简介：${item.description}`).addNewline().addNewline();
    });
    markdown.addText(`当前第(${shop.page}/${shop.totalPages})页｜持有铜币：${shop.copper}`);
    return Format.create().addMarkdown(markdown).addButtonGroup(pageButtons(shop.page, shop.totalPages, '商店购买页', '商店搜索', shop.keyword));
};
const sellFormat = async (qqUserId, page = 1, keyword = '') => {
    const context = await requireCurrentGuild(qqUserId);
    const guildMerchantName = context.code === 'baina_town' ? '赫伯特' : context.code === 'world_tree' ? '斐珞' : context.hub.host;
    const shop = await sellCatalog(qqUserId, page, keyword);
    const markdown = Format.createMarkdown().addTitle('冒险者公会·商店·出售').addNewline().addNewline().addBlockquote(keyword ? `【${guildMerchantName}】“我把背包中和「${keyword}」有关、可以收购的物品都找出来了。”` : `【${guildMerchantName}】“材料、道具都可以拿来看看。我会按公会公示的价格收购；冒险者的战利品，总会在合适的地方派上用场。”`).addNewline().addNewline();
    if (!shop.items.length)
        markdown.addText('背包里没有可出售的物品。');
    shop.items.forEach((item, index) => markdown.addText(`${index + 1}.【${item.category}】${item.name} ×${item.quantity} `).addButton('[出售]', { data: `/出售商品 ${item.id} `, autoEnter: false }).addNewline().addBlockquote(`收购价：铜币×${item.price}`).addNewline().addNewline());
    markdown.addText(`当前第(${shop.page}/${shop.totalPages})页｜持有铜币：${shop.copper}`);
    return Format.create().addMarkdown(markdown).addButtonGroup(pageButtons(shop.page, shop.totalPages, '商店出售页', '商店出售搜索', shop.keyword));
};
const requireGuildShop = requireCurrentGuild;
const guildShopHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    const context = await requireGuildShop(event.current.UserId);
    await message.send({ format: context.code === 'baina_town' ? guildShopFormat() : await localGuildShopFormat(context, event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法进入商店', error instanceof Error ? error.message : '请稍后重试。') });
} };
const shopBuyListHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await requireGuildShop(event.current.UserId);
    await message.send({ format: await buyFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) });
}
catch (error) {
    await message.send({ format: messageFormat('商店暂不可用', error instanceof Error ? error.message : '请稍后重试。') });
} };
const shopSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await requireGuildShop(event.current.UserId);
    await message.send({ format: await buyFormat(event.current.UserId, 1, String(route.param('keyword'))) });
}
catch (error) {
    await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const shopPurchaseHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await requireGuildShop(event.current.UserId);
    const requested = String(route.param('quantity') ?? '').trim();
    const result = await buyShopItem(event.current.UserId, Number(route.param('id')), requested ? Number(requested) : 1);
    await addNpcAffinity(event.current.UserId, (await requireCurrentGuild(event.current.UserId)).hub.guild, 'buy');
    await message.send({ format: messageFormat('购买成功', `获得【${result.name}】×${result.quantity}\n消耗铜币×${result.price}`) });
    await message.send({ format: await buyFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('购买失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const shopSellListHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await requireGuildShop(event.current.UserId);
    await message.send({ format: await sellFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) });
}
catch (error) {
    await message.send({ format: messageFormat('出售列表不可用', error instanceof Error ? error.message : '请稍后重试。') });
} };
const shopSellSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await requireGuildShop(event.current.UserId);
    await message.send({ format: await sellFormat(event.current.UserId, 1, String(route.param('keyword'))) });
}
catch (error) {
    await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const shopSellHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await requireGuildShop(event.current.UserId);
    const requested = String(route.param('quantity') ?? '').trim();
    const result = await sellShopItem(event.current.UserId, Number(route.param('id')), requested ? Number(requested) : 1);
    await addNpcAffinity(event.current.UserId, (await requireCurrentGuild(event.current.UserId)).hub.guild, 'sell');
    await message.send({ format: messageFormat('出售成功', `出售【${result.name}】×${result.quantity}\n获得铜币×${result.price}`) });
    await message.send({ format: await sellFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('出售失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const shopChatHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    const context = await requireGuildShop(event.current.UserId);
    if (context.code !== 'baina_town') {
        await message.send({ format: await localGuildShopFormat(context, event.current.UserId, true) });
        return;
    }
    await addNpcAffinity(event.current.UserId, (await requireCurrentGuild(event.current.UserId)).hub.guild, 'chat');
    await message.send({ format: guildShopFormat('赫伯特抬起头，笑着擦了擦柜台。左侧空荡的衣袖随着动作轻轻晃了一下。\n\n“早些年我也背着剑往外跑，觉得多危险的委托都能闯过去。”\n\n他用右手将一卷绷带平码在架上，语气平静。\n\n“后来被魔物伤了左手。等同伴找到我时，已经错过了补救的时机；医师能把命留下，却留不住那只手。”\n\n他抬眼笑了笑。\n\n“所以我回到百纳镇开了这间店。东西会用完，冒险的见闻却不会。出门前多备一份药、多看一眼地图，能少吃不少亏。”', guildMerchantName, true) });
}
catch (error) {
    await message.send({ format: messageFormat('无法闲聊', error instanceof Error ? error.message : '请稍后重试。') });
} };

export { guildShopFormat, guildShopHandler, shopBuyListHandler, shopChatHandler, shopPurchaseHandler, shopSearchHandler, shopSellHandler, shopSellListHandler, shopSellSearchHandler };
