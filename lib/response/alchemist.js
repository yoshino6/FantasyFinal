import { currentSecondaryShop } from '../game/secondary-shop-context.js';
import { secondaryShopFormat } from './secondary-shop.js';
import { appendHiddenQuestButton } from './hidden-profession.js';
import { learnAlchemyCreation, alchemyCreationQuestTitle, alchemyCreationQuest } from '../game/alchemy-creation-quest.service.js';
import { useEvent, Format, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { alchemistQuest, acceptAlchemistQuest, claimAlchemistQuest, activatePersonalAlchemy, activateSweetshopAlchemy, selectPurificationMaterial, clearPurificationMaterial, executePurification, executeBulkPurification, selectAlchemyMaterial, clearAlchemyMaterial, saveAlchemyFormula, renameAlchemyFormula, loadAlchemyFormula, deleteAlchemyFormula, alchemistProgress, purificationState, purificationMaterials, bulkPurificationPreview, alchemyState, alchemyMaterials, alchemyFormulaList } from '../game/alchemist.service.js';
import { buyAlchemistItem, sellAlchemistItem, alchemistSellCatalog } from '../game/alchemist-shop.service.js';
import { currentMainQuest } from '../game/main-quest.service.js';
import { addNpcAffinity, grantNpcAffinity, nearbyPoints, requireNpcAtCurrentPosition } from '../game/adventure.service.js';
import { messageFormat } from '../game/message.js';
import { npcChatDialogue } from '../game/npc-dialogue.service.js';

const shopCode = 'alchemy_sweetshop';
const requireAlchemist = (qqUserId) => requireNpcAtCurrentPosition(qqUserId, shopCode);
const barrierActive = async (qqUserId) => ['【主线·寻访晴儿】', '【主线·追寻天空粉尘】', '【主线·归还天空粉尘】', '【主线·窥探世间】'].includes((await currentMainQuest(qqUserId)).title);
const proficiencyBar = (current, required) => {
    const ratio = required > 0 ? Math.max(0, Math.min(1, current / required)) : 1;
    const filled = Math.round(ratio * 10);
    return `${'■'.repeat(filled)}${'□'.repeat(10 - filled)}`;
};
const alchemistBuyFormat = async (qqUserId, page = 1, category = '全部', keyword = '') => secondaryShopFormat(qqUserId, 'alchemy_sweetshop', page, keyword, category);
const alchemistSellButtons = (page, totalPages, keyword = '') => Format.createButtonGroup()
    .addRow().addButton('上一页', `/炼金商店出售页 ${Math.max(1, page - 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page > 1 ? 'blue' : undefined }).addButton('搜索', '/炼金商店出售搜索 ', { type: 'command', autoEnter: false, style: 'blue' }).addButton('下一页', `/炼金商店出售页 ${Math.min(totalPages, page + 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page < totalPages ? 'blue' : undefined })
    .addRow().addButton('返回 糖水屋', '/糖水屋', { type: 'command', autoEnter: true });
const alchemistSellFormat = async (qqUserId, page = 1, keyword = '') => {
    const shop = await alchemistSellCatalog(qqUserId, page, keyword);
    const markdown = Format.createMarkdown().addTitle('糖水屋·出售').addNewline().addNewline()
        .addBlockquote(keyword ? `晴儿从收购清单中找出与「${keyword}」有关的条目。` : '晴儿将几只空瓶与材料盒摆到柜台上。“药剂、食物、草药，还有能用于炼金的素材我都会收；只要还保留着可用的性质，就不该被浪费。”').addNewline().addNewline();
    if (!shop.items.length)
        markdown.addText('背包中没有晴儿会收购的物品。');
    shop.items.forEach((item, index) => markdown.addText(`${'①②③④⑤'[index]}【${item.category}】${item.name}×${item.quantity} `).addButton('[出售]', { data: `/出售炼金商品 ${item.id} `, autoEnter: false }).addNewline().addBlockquote(`收购价：铜币×${item.price}`).addNewline().addNewline());
    markdown.addText(`当前第(${shop.page}/${shop.totalPages})页｜持有铜币：${shop.copper}`);
    return Format.create().addMarkdown(markdown).addButtonGroup(alchemistSellButtons(shop.page, shop.totalPages, shop.keyword));
};
const alchemistShopFormat = async (qqUserId, dialogue, continuingChat = false) => {
    const [questReady, nearby, creationQuest] = await Promise.all([barrierActive(qqUserId), nearbyPoints(qqUserId), alchemyCreationQuest(qqUserId)]);
    const markdown = Format.createMarkdown().addTitle('百纳镇·糖水屋').addNewline().addNewline().addText('【晴儿】｜炼金师 Lv.3');
    if (nearby.npcDetailsUnlocked)
        markdown.addText(' ').addButton('[详情]', { data: '/域民详情 alchemy_sweetshop', autoEnter: false });
    const hour = new Date().getHours();
    const scene = dialogue ?? (hour < 11
        ? '晨光穿过晴空色的玻璃瓶，在木架上折出细碎的光。晴儿正将新鲜草药分装入罐，抬头时朝你露出温和的笑容。'
        : hour < 18
            ? '晴空色的玻璃瓶在木架上折出柔光，空气里是果糖、薄荷与草药混在一起的清甜。柜台后的晴儿正专心搅拌一杯泛着微光的糖水，抬头时朝你露出温和的笑容。'
            : '夜幕让街道安静下来，糖水屋的灯光却格外澄澈。晴儿轻轻盖好药瓶，空气里浮着淡淡的薄荷甜香。\n“晚上好，若是刚从野外回来，先替自己准备些恢复药剂吧。”');
    markdown.addNewline().addNewline().addBlockquote(scene);
    if (continuingChat)
        return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('切磋', '/切磋 alchemy_sweetshop', { type: 'command', autoEnter: true, style: 'blue' }).addButton('继续闲聊', '/晴儿闲聊', { type: 'command', autoEnter: true, style: 'blue' }));
    const buttons = Format.createButtonGroup()
        .addRow().addButton('我要买', '/炼金商店购买', { type: 'command', autoEnter: true, style: 'blue' }).addButton('我要卖', '/炼金商店出售', { type: 'command', autoEnter: true, style: 'blue' })
        .addRow().addButton('切磋', '/切磋 alchemy_sweetshop', { type: 'command', autoEnter: true, style: 'blue' }).addButton('闲聊', '/晴儿闲聊', { type: 'command', autoEnter: true, style: 'blue' }).addButton('关于 炼金师', '/关于炼金师', { type: 'command', autoEnter: true, style: 'blue' });
    buttons
        .addRow().addButton('提纯', '/店铺提纯', { type: 'command', autoEnter: true, style: 'blue' }).addButton('炼金', '/店铺炼金', { type: 'command', autoEnter: true, style: 'blue' });
    if (creationQuest.pending)
        buttons.addRow().addButton(`关于 ${alchemyCreationQuestTitle}`, '/晴儿 关于点灵与育成', { type: 'command', autoEnter: true, style: 'blue' });
    if (questReady)
        buttons.addRow().addButton('关于 无形的禁锢', '/晴儿 关于无形的禁锢', { type: 'command', autoEnter: true, style: 'blue' });
    await appendHiddenQuestButton(buttons, qqUserId, shopCode);
    buttons.addRow().addButton('离开 糖水屋', `/建筑离开 ${shopCode}`, { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const alchemistShopHandler = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        await requireAlchemist(event.current.UserId);
        await message.send({ format: await alchemistShopFormat(event.current.UserId) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法进入糖水屋', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const alchemistChatHandler = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        await requireAlchemist(event.current.UserId);
        const { affinity } = await addNpcAffinity(event.current.UserId, shopCode, 'chat');
        await message.send({ format: await alchemistShopFormat(event.current.UserId, npcChatDialogue('alchemy_sweetshop', affinity), true) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法闲聊', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const alchemistBuyListHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        await requireAlchemist(event.current.UserId);
        await message.send({ format: await alchemistBuyFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('category') ?? '全部'), String(route.param('keyword') ?? '')) });
    }
    catch (error) {
        await message.send({ format: messageFormat('药剂商店不可用', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const alchemistBuySearchHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        await requireAlchemist(event.current.UserId);
        await message.send({ format: await alchemistBuyFormat(event.current.UserId, 1, String(route.param('category') ?? '全部'), String(route.param('keyword'))) });
    }
    catch (error) {
        await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const alchemistPurchaseHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        await requireAlchemist(event.current.UserId);
        const requested = String(route.param('quantity') ?? '').trim();
        const result = await buyAlchemistItem(event.current.UserId, Number(route.param('id')), requested ? Number(requested) : 1);
        await addNpcAffinity(event.current.UserId, shopCode, 'buy');
        await message.send({ format: messageFormat('购买成功', `获得【${result.name}】×${result.quantity}\n消耗铜币×${result.price}`) });
        await message.send({ format: await alchemistBuyFormat(event.current.UserId) });
    }
    catch (error) {
        await message.send({ format: messageFormat('购买失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const barrierAdviceFormat = (fromGuild = false) => Format.create().addMarkdown(Format.createMarkdown().addTitle('关于 无形的禁锢').addNewline().addNewline().addBlockquote(fromGuild
    ? '莫妮卡听完你的描述，神情认真起来。\n“这种身体与能量的异常，公会不宜贸然判断。你可以去找炼金师晴儿——她对人体的各种状态颇有研究，就在糖水屋。”'
    : '晴儿轻轻放下量杯，认真听完你的描述。\n“你不是我们这个世界的人吧。异世界来者会被这方世界压制。想打破躯体的枷锁，不能只靠堆积能量，还得去感悟这方世界，并真正融入其中。”\n“周边密林里的幽影狼王偶尔会携带一种名为天空粉尘的古老尘埃，试着去带一份回来吧。然后我会指导你如何来窥探其中的奥秘。”')).addButtonGroup(Format.createButtonGroup().addRow().addButton('前往 糖水屋', '/前往 -12 -196', { type: 'command', autoEnter: true, style: 'blue' }));
const alchemistAboutHandler = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        await requireAlchemist(event.current.UserId);
        const quest = await alchemistQuest(event.current.UserId);
        if (quest.status === 'none') {
            await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('关于 炼金师').addNewline().addNewline().addBlockquote('“嗨，想了解一下炼金师吗？”“我可以将寻常材料提纯、精炼、合成，变成不寻常的宝物哟~”“是不是很神奇呢？来和我共同见证炼金造物无限真理吧！”')).addButtonGroup(Format.createButtonGroup().addRow().addButton('选定副职业 炼金师', '/选择副职业 炼金师', { type: 'command', autoEnter: true, style: 'blue' })) });
            return;
        }
        if (quest.status === 'completed') {
            await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('炼金师任务').addNewline().addNewline().addText(`微光草药：${quest.herbs}/3\n任务已完成，可以找晴儿开始提纯。`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('提交任务', '/提交炼金师任务', { type: 'command', autoEnter: true, style: 'blue' })) });
            return;
        }
        if (quest.status === 'claimed') {
            await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('关于 炼金师').addNewline().addNewline().addBlockquote('“很不错嘛，比我预想的要快得多。”\n晴儿接过材料，向空中轻轻一抛，便一一悬浮于空中。“要开始了，集中注意力。学着我将精神力细致入微，化为丝线将它们一一提纯。”\n伴随着讲解，一丝丝精神念力在空中缭绕。那些材料在丝线的纷乱里悄然溶解，凝成了一颗颗颜色各异的小球。\n“下面是最重要的一步，异质融合。看仔细了哟！”各色球体在丝线的牵引下开始靠近，一开始还稍有排斥，渐渐地开始融合。凝聚而成的液体里蕴含着不一般的能量。\n晴儿倏地一挥手，泛着金红色泽的液珠已然被收入瓶中。\n“如何，领悟到了吧？”“接下来，就要由你自己去探索炼金术的奥妙了哟！”')).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看 副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' })) });
            return;
        }
        await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('炼金师任务').addNewline().addNewline().addText(`收集微光草药 ×3。\n微光草药：${quest.herbs}/3`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务栏', '/任务', { type: 'command', autoEnter: true, style: 'blue' }).addButton('放弃任务', '/关于炼金师', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法交谈', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const alchemistBarrierHandler = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        await requireAlchemist(event.current.UserId);
        const { advanceRealmBarrier } = await import('../game/main-quest.service.js');
        const progress = await advanceRealmBarrier(event.current.UserId, 'alchemist');
        if (progress.stage === 2 && progress.previous === 1) {
            await message.send({ format: barrierAdviceFormat() });
            return;
        }
        if (progress.stage === 4 && progress.previous === 2) {
            await message.send({ format: skyDustAdviceFormat() });
            return;
        }
        if (progress.stage === 2) {
            await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('关于 无形的禁锢').addNewline().addNewline().addBlockquote('晴儿抬眼看向你：“天空粉尘还没有着落。去幽暗密林寻找幽影狼王吧；只有亲手取得那份尘埃，你才能开始感悟。”')) });
            return;
        }
        if (progress.stage === 4) {
            await message.send({ format: skyDustAdviceFormat() });
            return;
        }
        throw new Error('你暂时还没有遇到这道境界的阻碍。');
    }
    catch (error) {
        await message.send({ format: messageFormat('无法询问', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const skyDustAdviceFormat = () => Format.create().addMarkdown(Format.createMarkdown().addTitle('关于 无形的禁锢').addNewline().addNewline().addBlockquote('晴儿接过天空粉尘，任由细微的光芒从指缝间流过。\n“果然如此……它回应的是你对这方世界的感知，而不是药性。去吧，别把它当成材料；试着用心去窥探它所映照的天空。”')).addButtonGroup(Format.createButtonGroup().addRow().addButton('打开背包', '/背包 材料', { type: 'command', autoEnter: true, style: 'blue' }));
const alchemistProfessionSelectHandler = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        await requireAlchemist(event.current.UserId);
        const quest = await alchemistQuest(event.current.UserId);
        if (quest.status !== 'none')
            throw new Error('你已经接取或完成了炼金师任务。');
        const markdown = Format.createMarkdown().addTitle('我想成为炼金师').addNewline().addNewline().addBlockquote('“我叫晴儿。炼金不是把草药丢进瓶子里那么简单——先替我收集三株微光草药，让我看看你是否愿意认真对待材料。”').addNewline().addNewline().addText('发现新支线，是否接受？\n（只可拥有一个副职业，请谨慎决定）');
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('接受任务', '/接受炼金师任务', { type: 'command', autoEnter: true, style: 'blue' }).addButton('放弃任务', '/关于炼金师', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法选择副职业', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const acceptAlchemistQuestHandler = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        await requireAlchemist(event.current.UserId);
        await acceptAlchemistQuest(event.current.UserId);
        const markdown = Format.createMarkdown().addTitle('接受任务').addNewline().addNewline().addText('已接受【副职业·炼金师入门】\n收集：微光草药×3\n可随时通过 ').addButton('/任务', { data: '/任务', autoEnter: false }).addText(' 查看进度。');
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务', '/任务', { type: 'command', autoEnter: true, style: 'blue' })) });
    }
    catch (error) {
        if (error instanceof Error && error.message === 'secondary_profession_level_required') {
            await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('晴儿的劝告').addNewline().addNewline().addBlockquote('晴儿轻轻合上记录本，朝你笑了笑。\n“先别着急呀。炼金术需要足够稳固的魔力和对材料的感知；等你在冒险中再成长一些，到了 Lv.10，再来找我吧。”')) });
            return;
        }
        await message.send({ format: messageFormat('接取失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const claimAlchemistQuestHandler = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        await requireAlchemist(event.current.UserId);
        const result = await claimAlchemistQuest(event.current.UserId);
        await grantNpcAffinity(event.current.UserId, shopCode, 200);
        const markdown = Format.createMarkdown().addTitle('副职业转职成功').addNewline().addNewline()
            .addBlockquote('晴儿将三株微光草药依次投入蒸馏瓶。雾气在指尖凝成澄澈的液滴，她耐心讲解着提纯、配比与融合的每一步。\n“记住，炼金的第一课从来不是追求力量，而是理解生命。”')
            .addNewline().addNewline().addText('————————————').addNewline()
            .addText(`【${result.characterName}】已转职副职业[${result.name}]！\n【${result.characterName}】获得[${result.giftName}]！`);
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看 副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('提交失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const alchemistProfessionFormat = async (qqUserId) => {
    const progress = await alchemistProgress(qqUserId);
    const maxed = progress.required === 0;
    const markdown = Format.createMarkdown().addTitle('副职业·炼金师').addNewline().addButton('[入门与导师]', { data: '/副职业导师', autoEnter: false }).addNewline().addNewline().addText(`等级：Lv.${maxed ? 'MAX' : progress.level}\n${maxed ? '熟练度：已达上限' : `熟练度：${progress.proficiency}/${progress.required}\n${proficiencyBar(progress.proficiency, progress.required)}`}`).addNewline().addNewline()
        .addBlockquote(`提纯成功率+${progress.bonus}%`).addNewline().addBlockquote(`炼金成功率+${progress.bonus}%`);
    const buttons = Format.createButtonGroup().addRow().addButton('提纯', '/提纯', { type: 'command', autoEnter: true, style: 'blue' }).addButton('炼金', '/炼金', { type: 'command', autoEnter: true, style: 'blue' });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const purificationFormat = async (qqUserId, page = 1, keyword = '') => {
    const [state, materials] = await Promise.all([purificationState(qqUserId), purificationMaterials(qqUserId)]);
    const filtered = materials.filter(material => !keyword || material.name.includes(keyword) || material.category.includes(keyword));
    const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const entries = filtered.slice((currentPage - 1) * 10, currentPage * 10);
    const operator = state.progress.serviceMode === 'sweetshop' ? '本次由【晴儿】代为提纯（炼金师 Lv.3）；不会获得个人炼金熟练度。' : '每份材料都会独立进行提纯判定；失败会消耗该份材料。怪材每跨 10 级，精材料产出按 1.2 倍累乘。';
    const markdown = Format.createMarkdown().addTitle('炼金·提纯').addNewline().addNewline()
        .addBlockquote(operator).addNewline().addNewline();
    if (state.itemId)
        markdown.addText('放入材料：').addText(' ').addButton('[清空]', { data: '/提纯清空', autoEnter: false }).addNewline().addBlockquote(`【${state.name}】×${state.quantity}（实付${state.paid}份）｜单份成功率：${state.success.toFixed(1)}%`).addText(' ').addButton('[修改数量]', { data: `/提纯放入 ${state.itemId} `, autoEnter: false }).addButton('[删除]', { data: '/提纯删除', autoEnter: false }).addNewline().addText('预计产物：').addNewline().addBlockquote(`【${state.outputName}】｜约${Math.floor(state.expectedOutput)}份`).addNewline().addNewline();
    else
        markdown.addBlockquote('当前未放入材料。').addNewline().addNewline();
    markdown.addText('可提纯材料\n');
    if (!entries.length)
        markdown.addBlockquote('背包中没有符合条件的可提纯材料。').addNewline();
    for (const [index, material] of entries.entries())
        markdown.addBlockquote(`${'①②③④⑤⑥⑦⑧⑨⑩'.charAt(index)}【${material.category}】${material.name}×${material.quantity}`).addText(' ').addButton('[放入]', { data: `/提纯放入 ${material.id} `, autoEnter: false }).addText('+数量').addNewline();
    markdown.addText(`当前第（${currentPage}/${totalPages}）页`).addNewline();
    const previous = Math.max(1, currentPage - 1);
    const next = Math.min(totalPages, currentPage + 1);
    const pageCommand = (target) => `/提纯材料页 ${target}${keyword ? ` ${keyword}` : ''}`;
    markdown.addText('操作：').addText(' ').addButton('[开始提纯]', { data: state.token ? `/开始提纯 ${state.token}` : '/继续提纯', autoEnter: false });
    const buttons = Format.createButtonGroup().addRow().addButton('上一页', pageCommand(previous), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined }).addButton('搜索', '/提纯材料搜索 ', { type: 'command', autoEnter: false, style: 'blue' }).addButton('下一页', pageCommand(next), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined })
        .addRow().addButton('一键提纯', '/一键提纯', { type: 'command', autoEnter: true, style: 'blue' }).addButton('炼金手记', '/炼金手记', { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const bulkPurificationConfirmFormat = async (qqUserId) => {
    const preview = await bulkPurificationPreview(qqUserId);
    const markdown = Format.createMarkdown().addTitle('确认一键提纯').addNewline().addNewline()
        .addBlockquote(`仅处理普通与大型怪材；每份材料独立判定。单份成功率：${preview.success.toFixed(1)}%`).addNewline().addNewline();
    if (!preview.materials.length)
        markdown.addBlockquote('背包中没有可一键提纯的普通或大型怪材。');
    else {
        markdown.addText('即将消耗并提纯：').addNewline();
        for (const material of preview.materials)
            markdown.addBlockquote(`【${material.name}】×${material.quantity}（实付${material.paid}份） → 【${material.outputName}】预计${material.expectedOutput.toFixed(1)}份`).addNewline();
    }
    const buttons = Format.createButtonGroup().addRow()
        .addButton('确认提纯', `/确认一键提纯 ${preview.token}`, { type: 'command', autoEnter: true, style: preview.materials.length ? 'blue' : undefined })
        .addButton('取消', '/继续提纯', { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const alchemyFormat = async (qqUserId, page = 1, keyword = '') => {
    const [state, materials, creationQuest] = await Promise.all([alchemyState(qqUserId), alchemyMaterials(qqUserId), currentSecondaryShop() ? Promise.resolve({ unlocked: false, pending: false }) : alchemyCreationQuest(qqUserId)]);
    const filtered = materials.filter(material => !keyword || material.name.includes(keyword) || material.category.includes(keyword));
    const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const entries = filtered.slice((currentPage - 1) * 10, currentPage * 10);
    const operator = state.progress.serviceMode === 'sweetshop' ? '由【晴儿】代为炼制（炼金师 Lv.3）；不会获得个人炼金熟练度。' : '三个槽位均可放入怪材、锻材、炼材或粒子。主材与辅材决定反应方向；每槽可投入 1～99 份。';
    const markdown = Format.createMarkdown().addTitle('炼金').addNewline().addButton('[常规]', { data: '/继续炼金', autoEnter: false }).addText(' ');
    if (creationQuest.unlocked)
        markdown.addButton('[点灵]', { data: '/炼金 点灵', autoEnter: false }).addText(' ').addButton('[育成]', { data: '/炼金 育成', autoEnter: false }).addText(' ');
    markdown.addButton('[炼金手记]', { data: '/炼金手记', autoEnter: false }).addNewline().addButton('[反应说明与洗练露]', { data: '/炼金反应说明', autoEnter: false }).addNewline().addNewline().addBlockquote(operator).addNewline().addNewline();
    if (creationQuest.pending)
        markdown.addBlockquote('新支线·瓶中之外的世界：炼金已达四级，去糖水屋找晴儿，听听她尚未讲完的那堂课。').addNewline().addButton('[前往 糖水屋]', { data: '/前往 -12 -196', autoEnter: false }).addNewline().addNewline();
    const appendSlot = (label, role, id, name, quantity) => {
        markdown.addText(`${label}：`);
        if (id && name)
            markdown.addText(`【${name}】×${quantity} `).addButton('[移除]', { data: `/炼金移除 ${role}`, autoEnter: false });
        else
            markdown.addButton('[添加]', { data: `/炼金添加 ${role === 'main' ? '主材' : role === 'auxiliary' ? '辅材' : '反应剂'} `, autoEnter: false });
        markdown.addNewline();
    };
    appendSlot('主材', 'main', state.mainId, state.mainName, state.mainQuantity);
    appendSlot('辅材', 'auxiliary', state.auxiliaryId, state.auxiliaryName, state.auxiliaryQuantity);
    appendSlot('催化剂', 'reagent', state.reagentId, state.reagentName, state.reagentQuantity);
    markdown.addNewline().addText('背包材料：').addNewline();
    if (!entries.length)
        markdown.addBlockquote('背包中没有符合条件的材料。').addNewline();
    for (const [index, material] of entries.entries()) {
        markdown.addBlockquote(`${'①②③④⑤⑥⑦⑧⑨⑩'.charAt(index)}【${material.category}】${material.name}×${material.quantity}`).addText(' ')
            .addButton('[选为主材]', { data: `/炼金选材 主材 ${material.id} 1`, autoEnter: false }).addText(' ')
            .addButton('[选为辅材]', { data: `/炼金选材 辅材 ${material.id} 1`, autoEnter: false }).addText(' ')
            .addButton('[选为催化剂]', { data: `/炼金选材 反应剂 ${material.id} 1`, autoEnter: false }).addNewline();
    }
    markdown.addNewline().addText(`当前第（${currentPage}/${totalPages}）页`).addNewline();
    const previous = Math.max(1, currentPage - 1);
    const next = Math.min(totalPages, currentPage + 1);
    const pageCommand = (target) => `/炼金材料页 ${target}${keyword ? ` ${keyword}` : ''}`;
    if (state.processing)
        markdown.addNewline().addText('炼金反应正在进行中，请等待本次结果。');
    const buttons = Format.createButtonGroup()
        .addRow().addButton('一键配方', '/一键配方', { type: 'command', autoEnter: true, style: 'blue' }).addButton('炼金手记', '/炼金手记', { type: 'command', autoEnter: true }).addRow().addButton('上一页', pageCommand(previous), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined }).addButton('搜索', '/炼金材料搜索 ', { type: 'command', autoEnter: false, style: 'blue' }).addButton('下一页', pageCommand(next), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined });
    if (!state.processing)
        buttons.addRow()
            .addButton('保存配方', '/保存炼金配方', { type: 'command', autoEnter: true })
            .addButton('查看配方', '/炼金配方', { type: 'command', autoEnter: true })
            .addButton('开始炼金', '/开始炼金', { type: 'command', autoEnter: true, style: 'blue' });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const purificationHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    await activatePersonalAlchemy(event.current.UserId);
    await message.send({ format: await purificationFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法提纯', error instanceof Error ? error.message : '请稍后重试。') });
} };
const sweetshopPurificationHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    await activateSweetshopAlchemy(event.current.UserId);
    await message.send({ format: await purificationFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法使用晴儿的提纯服务', error instanceof Error ? error.message : '请稍后重试。') });
} };
const purificationContinueHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    await message.send({ format: await purificationFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法提纯', error instanceof Error ? error.message : '请稍后重试。') });
} };
const purificationPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await message.send({ format: await purificationFormat(event.current.UserId, Number(route.param('page')), String(route.param('keyword') ?? '')) });
}
catch (error) {
    await message.send({ format: messageFormat('无法查看材料', error instanceof Error ? error.message : '请稍后重试。') });
} };
const purificationSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await message.send({ format: await purificationFormat(event.current.UserId, 1, String(route.param('keyword'))) });
}
catch (error) {
    await message.send({ format: messageFormat('无法搜索材料', error instanceof Error ? error.message : '请稍后重试。') });
} };
const purificationPutHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await selectPurificationMaterial(event.current.UserId, Number(route.param('id')), Number(route.param('quantity') ?? 1));
    await message.send({ format: await purificationFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法放入材料', error instanceof Error ? error.message : '请稍后重试。') });
} };
const purificationClearHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    await clearPurificationMaterial(event.current.UserId);
    await message.send({ format: await purificationFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法清空材料', error instanceof Error ? error.message : '请稍后重试。') });
} };
const purificationExecuteHandler = async () => { const [route] = useRoute(); const [event] = useEvent(); const [message] = useGameMessage(); try {
    if (!route.param('token')) {
        await message.send({ format: await purificationFormat(event.current.UserId) });
        return;
    }
    const result = await executePurification(event.current.UserId, String(route.param('token')));
    await message.send({ format: messageFormat(result.succeeded ? '提纯成功' : '提纯失败', result.succeeded ? `消耗【${result.inputName}】×${result.inputQuantity}\n获得【${result.outputName}】×${result.outputQuantity}\n失败返还：${result.refundedQuantity ?? 0}份\n熟练度：+${result.proficiencyGain}\n成功率：${result.success.toFixed(1)}%` : `【${result.inputName}】在反应中化作了无用残渣。\n消耗×${result.inputQuantity}\n失败返还：${result.refundedQuantity ?? 0}份\n熟练度：+${result.proficiencyGain}\n成功率：${result.success.toFixed(1)}%`) });
    await message.send({ format: await purificationFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法提纯', error instanceof Error ? error.message : '请稍后重试。') });
} };
const bulkPurificationPreviewHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    await message.send({ format: await bulkPurificationConfirmFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法一键提纯', error instanceof Error ? error.message : '请稍后重试。') });
} };
const bulkPurificationExecuteHandler = async () => { const [route] = useRoute(); const [event] = useEvent(); const [message] = useGameMessage(); try {
    const result = await executeBulkPurification(event.current.UserId, String(route.param('token') ?? ''));
    const outputText = result.outputs.length ? result.outputs.map(output => `【${output.name}】×${output.quantity}`).join('\n') : '本次未获得精材料。';
    await message.send({ format: messageFormat('一键提纯完成', `消耗普通与大型怪材×${result.inputQuantity}\n失败返还：${result.refundedQuantity ?? 0}份\n获得：\n${outputText}\n熟练度：+${result.proficiencyGain}\n单份成功率：${result.success.toFixed(1)}%`) });
    await message.send({ format: await purificationFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法一键提纯', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemyFormulaFormat = async (qqUserId, page = 1, keyword = '') => {
    const list = await alchemyFormulaList(qqUserId, page, keyword);
    const markdown = Format.createMarkdown().addTitle('炼金快捷配方').addNewline().addNewline().addText(`已保存：${list.total}/${list.capacity}`).addNewline().addNewline();
    if (!list.formulas.length)
        markdown.addBlockquote('尚未保存快捷配方。').addNewline();
    for (const [index, formula] of list.formulas.entries()) {
        markdown.addText(`${'①②③④⑤'.charAt(index)}【${formula.name}】 `).addButton('[改名]', { data: `/炼金配方改名 ${formula.id} `, autoEnter: false }).addText(' ')
            .addButton('[加入炼金]', { data: `/加入炼金配方 ${formula.id}`, autoEnter: false }).addText(' ')
            .addButton('[删除]', { data: `/删除炼金配方 ${formula.id}`, autoEnter: false }).addNewline()
            .addBlockquote(`主材：【${formula.mainName}】×${formula.mainQuantity}｜辅材：${formula.auxiliaryName ? `【${formula.auxiliaryName}】×${formula.auxiliaryQuantity}` : '无'}｜催化剂：${formula.reagentName ? `【${formula.reagentName}】×${formula.reagentQuantity}` : '无'}`).addNewline().addNewline();
    }
    const previous = Math.max(1, list.page - 1);
    const next = Math.min(list.totalPages, list.page + 1);
    const pageCommand = (target) => `/炼金配方页 ${target}${list.keyword ? ` ${list.keyword}` : ''}`;
    const buttons = Format.createButtonGroup().addRow()
        .addButton('上一页', pageCommand(previous), { type: 'command', autoEnter: true, style: list.page > 1 ? 'blue' : undefined })
        .addButton('搜索', '/炼金配方搜索 ', { type: 'command', autoEnter: false, style: 'blue' })
        .addButton('下一页', pageCommand(next), { type: 'command', autoEnter: true, style: list.page < list.totalPages ? 'blue' : undefined })
        .addRow().addButton('返回炼金', '/继续炼金', { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const alchemyHandler = async () => {
    const [route] = useRoute();
    if (route.param('action'))
        return (await import('./automaton.js')).alchemyCraftHandler();
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        await activatePersonalAlchemy(event.current.UserId);
        await message.send({ format: await alchemyFormat(event.current.UserId) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法炼金', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const sweetshopAlchemyHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    await activateSweetshopAlchemy(event.current.UserId);
    await message.send({ format: await alchemyFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法使用晴儿的炼金服务', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemyContinueHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    await message.send({ format: await alchemyFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法炼金', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemyMaterialPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await message.send({ format: await alchemyFormat(event.current.UserId, Number(route.param('page')), String(route.param('keyword') ?? '')) });
}
catch (error) {
    await message.send({ format: messageFormat('无法查看材料', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemyMaterialSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await message.send({ format: await alchemyFormat(event.current.UserId, 1, String(route.param('keyword'))) });
}
catch (error) {
    await message.send({ format: messageFormat('无法搜索材料', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemySelectHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const label = String(route.param('role'));
    const role = label === '主材' ? 'main' : label === '辅材' ? 'auxiliary' : ['反应剂', '催化剂'].includes(label) ? 'reagent' : null;
    if (!role)
        throw new Error('请选择主材、辅材或反应剂。');
    await selectAlchemyMaterial(event.current.UserId, role, String(route.param('item')), Number(route.param('quantity') ?? 1));
    await message.send({ format: await alchemyFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法选择材料', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemyFormulaListHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    await message.send({ format: await alchemyFormulaFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法查看配方', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemyFormulaPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await message.send({ format: await alchemyFormulaFormat(event.current.UserId, Number(route.param('page')), String(route.param('keyword') ?? '')) });
}
catch (error) {
    await message.send({ format: messageFormat('无法查看配方', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemyFormulaSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await message.send({ format: await alchemyFormulaFormat(event.current.UserId, 1, String(route.param('keyword'))) });
}
catch (error) {
    await message.send({ format: messageFormat('无法搜索配方', error instanceof Error ? error.message : '请稍后重试。') });
} };
const saveAlchemyFormulaHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const formula = await saveAlchemyFormula(event.current.UserId, Number(route.param('id') ?? 0));
    await message.send({ format: messageFormat('保存配方', `已保存快捷配方【${formula.name}】。\n配方容量：${formula.capacity}`) });
    await message.send({ format: await alchemyFormulaFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法保存配方', error instanceof Error ? error.message : '请稍后重试。') });
} };
const renameAlchemyFormulaHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await renameAlchemyFormula(event.current.UserId, Number(route.param('id')), String(route.param('name')));
    await message.send({ format: await alchemyFormulaFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法修改配方', error instanceof Error ? error.message : '请稍后重试。') });
} };
const loadAlchemyFormulaHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const name = await loadAlchemyFormula(event.current.UserId, Number(route.param('id')));
    await message.send({ format: messageFormat('已加入炼金', `已将快捷配方【${name}】加入当前炼金。`) });
    await message.send({ format: await alchemyFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法加入炼金', error instanceof Error ? error.message : '请稍后重试。') });
} };
const deleteAlchemyFormulaHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await deleteAlchemyFormula(event.current.UserId, Number(route.param('id')));
    await message.send({ format: await alchemyFormulaFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法删除配方', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemyAddHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const label = String(route.param('role'));
    const role = label === '主材' ? 'main' : label === '辅材' ? 'auxiliary' : ['反应剂', '催化剂'].includes(label) ? 'reagent' : null;
    if (!role)
        throw new Error('请选择主材、辅材或反应剂。');
    await selectAlchemyMaterial(event.current.UserId, role, String(route.param('item')), Number(route.param('quantity') ?? 1));
    await message.send({ format: await alchemyFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法添加材料', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemyRemoveHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const role = String(route.param('role'));
    if (!['main', 'auxiliary', 'reagent'].includes(role))
        throw new Error('未知材料槽位。');
    await clearAlchemyMaterial(event.current.UserId, role);
    await message.send({ format: await alchemyFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法移除材料', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemistTradeHandler = async () => { const [event] = useEvent(); const [message] = useGameMessage(); try {
    await requireAlchemist(event.current.UserId);
    await message.send({ format: await alchemistSellFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('无法交易', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemistSellPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await requireAlchemist(event.current.UserId);
    await message.send({ format: await alchemistSellFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) });
}
catch (error) {
    await message.send({ format: messageFormat('出售列表不可用', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemistSellSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await requireAlchemist(event.current.UserId);
    await message.send({ format: await alchemistSellFormat(event.current.UserId, 1, String(route.param('keyword'))) });
}
catch (error) {
    await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemistSellItemHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await requireAlchemist(event.current.UserId);
    const requested = String(route.param('quantity') ?? '').trim();
    const result = await sellAlchemistItem(event.current.UserId, Number(route.param('id')), requested ? Number(requested) : 1);
    await addNpcAffinity(event.current.UserId, shopCode, 'sell');
    await message.send({ format: messageFormat('出售成功', `出售【${result.name}】×${result.quantity}\n获得铜币×${result.price}`) });
    await message.send({ format: await alchemistSellFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('出售失败', error instanceof Error ? error.message : '请稍后重试。') });
} };
const alchemyCreationLessonHandler = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        const lesson = await learnAlchemyCreation(event.current.UserId);
        const markdown = Format.createMarkdown().addTitle(alchemyCreationQuestTitle).addNewline().addNewline().addBlockquote(lesson.story).addNewline().addNewline()
            .addText(lesson.alreadyLearned ? '晴儿陪你重温了点灵与育成的要领。' : '支线完成，已学会点灵与育成。').addNewline()
            .addText('灵枢素体需要四级解构师构造，可委托其他玩家制作或在交易行购入。');
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
                .addButton('点灵', '/炼金 点灵', { type: 'command', autoEnter: false, style: 'blue' })
                .addButton('育成', '/炼金 育成', { type: 'command', autoEnter: false, style: 'blue' })
                .addRow().addButton('返回炼金', '/炼金', { type: 'command', autoEnter: true }).addButton('返回糖水屋', '/糖水屋', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('晴儿的课堂', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { acceptAlchemistQuestHandler, alchemistAboutHandler, alchemistBarrierHandler, alchemistBuyListHandler, alchemistBuySearchHandler, alchemistChatHandler, alchemistProfessionFormat, alchemistProfessionSelectHandler, alchemistPurchaseHandler, alchemistSellItemHandler, alchemistSellPageHandler, alchemistSellSearchHandler, alchemistShopFormat, alchemistShopHandler, alchemistTradeHandler, alchemyAddHandler, alchemyContinueHandler, alchemyCreationLessonHandler, alchemyFormulaListHandler, alchemyFormulaPageHandler, alchemyFormulaSearchHandler, alchemyHandler, alchemyMaterialPageHandler, alchemyMaterialSearchHandler, alchemyRemoveHandler, alchemySelectHandler, barrierAdviceFormat, bulkPurificationExecuteHandler, bulkPurificationPreviewHandler, claimAlchemistQuestHandler, deleteAlchemyFormulaHandler, loadAlchemyFormulaHandler, purificationClearHandler, purificationContinueHandler, purificationExecuteHandler, purificationHandler, purificationPageHandler, purificationPutHandler, purificationSearchHandler, renameAlchemyFormulaHandler, saveAlchemyFormulaHandler, sweetshopAlchemyHandler, sweetshopPurificationHandler };
