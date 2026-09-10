import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { confirmInstanceMarket, previewInstanceMarket, instanceMarketList } from '../game/instance-market.service.js';
import { requireNpcAtCurrentPosition } from '../game/adventure.service.js';
import { girlGratitudeStage } from '../game/girl-gratitude.service.js';
import { escapeAutomatonText } from '../game/automaton-dialogue.js';
import { automatonSkills } from '../game/automaton-skill-catalog.js';
import { messageFormat } from '../game/message.js';

const navigationButtons = () => Format.createButtonGroup().addRow()
    .addButton('标准品市场', '/万叶市场 1 全部', { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('返回 万叶联市', '/万叶联市', { type: 'command', autoEnter: true });
const listFormat = async (user, page, category, keyword) => {
    const data = await instanceMarketList(user, page, category, keyword);
    const markdown = Format.createMarkdown().addTitle('万叶联市·实例寄售').addNewline().addNewline();
    for (const label of ['全部', '装备', '异械', '机巧']) {
        markdown.addButton(`[${label}]`, { data: `/实例寄售 列表 1 ${label}`, autoEnter: false }).addText(' ');
    }
    markdown.addNewline().addNewline()
        .addBlockquote(`当前分类：${data.category === 'instance' ? '装备与异械' : data.category}${data.keyword ? `｜搜索：${escapeAutomatonText(data.keyword)}` : ''}`)
        .addNewline().addNewline().addText('在售实例：').addNewline().addNewline();
    if (!data.items.length)
        markdown.addBlockquote('暂无符合条件的寄售。').addNewline().addNewline();
    for (const [index, item] of data.items.entries()) {
        const snapshot = item.snapshot;
        markdown.addText(`${'①②③④⑤'[index]}【${escapeAutomatonText(item.name)}】 `)
            .addButton(Number(item.seller_id) === data.characterId ? '[撤单]' : '[购买]', {
            data: `/实例寄售 ${Number(item.seller_id) === data.characterId ? '撤单' : '购买'} ${item.id} ${item.kind}`, autoEnter: false
        }).addNewline().addBlockquote(`售价：铜币×${item.price}｜订单 #${item.id}`).addNewline();
        if (item.kind === 'automaton') {
            const skills = Array.isArray(snapshot.skills) ? snapshot.skills : [];
            markdown.addBlockquote(`等级：Lv.${snapshot.level ?? 1}｜未认主`)
                .addNewline().addBlockquote(`技能：${escapeAutomatonText(skills.map(id => automatonSkills.find(s => s.id === id)?.name ?? String(id)).join('、') || '无')}`).addNewline();
        }
        else {
            markdown.addBlockquote(`等级：${snapshot.required_level ?? 1}｜品质：${Number(snapshot.quality ?? 0).toFixed(2)}%｜耐久：${snapshot.durability ?? '—'}/${snapshot.durability_max ?? '—'}`).addNewline();
            if (snapshot.description)
                markdown.addBlockquote(escapeAutomatonText(String(snapshot.description))).addNewline();
        }
        markdown.addNewline();
    }
    markdown.addText('我的可寄售实例：').addNewline()
        .addBlockquote('选择上架，填写铜币单价后提交；确认后进入托管，成交后绑定。').addNewline().addNewline();
    if (!data.instances.length && !data.pets.length)
        markdown.addBlockquote('当前分类暂无可寄售的实例。').addNewline();
    for (const item of data.instances) {
        markdown.addText('> ').addText(`【${item.item_category}】${escapeAutomatonText(String(item.name))}｜品质 ${Number(item.quality).toFixed(2)}%｜实例 #${item.id} `)
            .addButton('[上架]', { data: `/实例寄售 上架 ${item.id} instance `, autoEnter: false }).addNewline();
    }
    for (const item of data.pets) {
        markdown.addText('> ').addText(`【机巧】${escapeAutomatonText(item.name)}｜实例 #${item.id} `)
            .addButton('[上架]', { data: `/实例寄售 上架 ${item.id} automaton `, autoEnter: false }).addNewline();
    }
    markdown.addNewline().addText(`当前第（${data.page}/${data.pages}）页`);
    const command = (target) => `/实例寄售 列表 ${target} ${data.category}${data.keyword ? ` ${data.keyword}` : ''}`;
    const buttons = Format.createButtonGroup().addRow()
        .addButton('上一页', command(Math.max(1, data.page - 1)), { type: 'command', autoEnter: true, style: data.page > 1 ? 'blue' : undefined })
        .addButton('搜索', `/实例寄售 列表 1 ${data.category} `, { type: 'command', autoEnter: false, style: 'blue' })
        .addButton('下一页', command(Math.min(data.pages, data.page + 1)), { type: 'command', autoEnter: true, style: data.page < data.pages ? 'blue' : undefined })
        .addRow().addButton('标准品市场', '/万叶市场 1 全部', { type: 'command', autoEnter: true, style: 'blue' })
        .addButton('返回 万叶联市', '/万叶联市', { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
var instanceMarket = async () => {
    const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
    const user = event.current.UserId;
    const action = String(route.param('action') ?? '列表'), id = Number(route.param('id') ?? 1);
    const kind = String(route.param('kind') ?? '全部'), value = String(route.param('value') ?? '');
    try {
        await requireNpcAtCurrentPosition(user, 'canopy_exchange');
        if (await girlGratitudeStage(user) < 6)
            throw new Error('先完成梨子喵的谢礼之约。');
        if (action === '列表') {
            await message.send({ format: await listFormat(user, id, kind, value) });
            return;
        }
        const markdown = Format.createMarkdown().addTitle('万叶联市·实例寄售').addNewline().addNewline();
        const buttons = navigationButtons();
        if (action === '确认') {
            const result = await confirmInstanceMarket(user, value);
            markdown.addBlockquote(result.text);
        }
        else {
            const operation = action === '上架' ? 'list' : action === '购买' ? 'buy' : action === '撤单' ? 'cancel' : undefined;
            if (!operation)
                throw new Error('未知寄售操作。');
            const result = await previewInstanceMarket(user, operation, kind, id, action === '上架' ? Number(value) : 1);
            markdown.addBlockquote(result.summary);
            buttons.addRow().addButton('确认', `/实例寄售 确认 0 token ${result.token}`, { type: 'command', autoEnter: false, style: 'blue' });
        }
        buttons.addRow().addButton('返回寄售', '/实例寄售', { type: 'command', autoEnter: true });
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
    }
    catch (error) {
        await message.send({ format: messageFormat('实例寄售不可用', error instanceof Error ? error.message : '市场操作失败。') });
    }
};

export { instanceMarket as default };
