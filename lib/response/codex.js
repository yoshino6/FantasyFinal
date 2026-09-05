import { useMessage, Format, useEvent, useRoute } from 'alemonjs';
import { monsterCodexDetail, skillCodexDetail, codexList, codexCategories, codexKinds } from '../game/codex.service.js';
import { messageFormat } from '../game/message.js';

const kindFrom = (value) => {
    const kind = String(value);
    if (!codexKinds.includes(kind))
        throw new Error('未知图鉴分类。');
    return kind;
};
const circled = '①②③④⑤';
const detailCommand = (kind, id) => kind === '怪物' ? `/怪物图鉴详情 ${id}` : kind === '技能' ? `/技能图鉴详情 ${id}` : `/物品图鉴 ${id}`;
const skillPurpose = (code, description) => ({
    appraisal: '鉴识未知的敌对生物，解析其基础情报。',
    longsword_mastery: '提升装备长剑类武器时的物理输出。',
    shield_mastery: '提升装备盾牌类武器时的防御能力。',
    staff_mastery: '提升装备法杖类武器时的魔法输出。',
    spellbook_mastery: '提升装备法书类武器时的吟咏效率。',
    orb_mastery: '提升装备法球类武器时的魔力上限。',
    dagger_mastery: '提升装备匕首类武器时的双重攻击能力。',
    fistblade_mastery: '提升装备拳刃类武器时的暴击能力。'
}[code] ?? description.split(/[。；\n]/)[0].trim());
const listFormat = async (qqUserId, kind, category = '全部', page = 1, keyword = '') => {
    const data = await codexList(qqUserId, kind, category, page, keyword);
    const markdown = Format.createMarkdown().addTitle(`${kind}图鉴`).addNewline().addNewline();
    for (const [index, item] of codexCategories(kind).entries()) {
        markdown.addButton(`[${item.label}]`, { data: `/图鉴列表 ${kind} ${item.value}`, autoEnter: false });
        if (kind === '装备' && (index + 1) % 5 === 0)
            markdown.addNewline();
    }
    markdown.addNewline().addNewline();
    if (!data.entries.length)
        markdown.addText('暂无已解锁的图鉴条目。\n');
    for (const [index, entry] of data.entries.entries()) {
        markdown.addText(`${circled.charAt(index)}【${entry.name}】 `).addButton('[详情]', { data: detailCommand(kind, entry.detailId), autoEnter: false }).addNewline();
        markdown.addBlockquote(`子分类：${entry.category}`).addNewline().addNewline();
    }
    markdown.addNewline().addText(`当前第(${data.page}/${data.totalPages})页`);
    const keywordTail = data.keyword ? ` ${data.keyword}` : '';
    const buttons = Format.createButtonGroup().addRow()
        .addButton('上一页', `/图鉴分页 ${kind} ${data.category} ${Math.max(1, data.page - 1)}${keywordTail}`, { type: 'command', autoEnter: true })
        .addButton('搜索', `/图鉴搜索 ${kind} `, { type: 'command', autoEnter: false })
        .addButton('下一页', `/图鉴分页 ${kind} ${data.category} ${Math.min(data.totalPages, data.page + 1)}${keywordTail}`, { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
var codex = async () => {
    const [message] = useMessage();
    const buttons = Format.createButtonGroup()
        .addRow().addButton('装备图鉴', '/图鉴列表 装备', { type: 'command', autoEnter: true, style: 'blue' })
        .addRow().addButton('道具图鉴', '/图鉴列表 道具', { type: 'command', autoEnter: true, style: 'blue' })
        .addRow().addButton('材料图鉴', '/图鉴列表 材料', { type: 'command', autoEnter: true, style: 'blue' })
        .addRow().addButton('怪物图鉴', '/图鉴列表 怪物', { type: 'command', autoEnter: true, style: 'blue' })
        .addRow().addButton('技能图鉴', '/图鉴列表 技能', { type: 'command', autoEnter: true, style: 'blue' });
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('图鉴')).addButtonGroup(buttons) });
};
const codexListHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        await message.send({ format: await listFormat(event.current.UserId, kindFrom(route.param('kind')), String(route.param('category') ?? '全部')) });
    }
    catch (error) {
        await message.send({ format: messageFormat('图鉴', error instanceof Error ? error.message : '图鉴暂时无法打开。') });
    }
};
const codexPageHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        await message.send({ format: await listFormat(event.current.UserId, kindFrom(route.param('kind')), String(route.param('category')), Number(route.param('page')), String(route.param('keyword') ?? '')) });
    }
    catch (error) {
        await message.send({ format: messageFormat('图鉴', error instanceof Error ? error.message : '图鉴暂时无法打开。') });
    }
};
const codexSearchHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        await message.send({ format: await listFormat(event.current.UserId, kindFrom(route.param('kind')), '全部', 1, String(route.param('keyword'))) });
    }
    catch (error) {
        await message.send({ format: messageFormat('图鉴搜索', error instanceof Error ? error.message : '搜索失败，请稍后重试。') });
    }
};
const monsterCodexDetailHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const monster = await monsterCodexDetail(event.current.UserId, Number(route.param('id')));
        const markdown = Format.createMarkdown().addTitle(monster.name).addNewline().addNewline().addText(`Lv.${monster.level}\n`)
            .addBlockquote(`子分类：${monster.category}`).addNewline();
        if (!monster.inRange)
            markdown.addBlockquote('鉴识等级不足，暂时无法解析更多信息。');
        else {
            markdown.addBlockquote(`技能：${monster.skills.length ? monster.skills.join('、') : '无'}`).addNewline();
            if (monster.informationLevel >= 4)
                markdown.addBlockquote(`弱点：${monster.weaknesses.join('、') || '无'}｜抗性：${monster.resistances.join('、') || '无'}`);
            else
                markdown.addBlockquote('识珠达到 Lv.4 后可查看弱点与抗性。');
        }
        await message.send({ format: Format.create().addMarkdown(markdown) });
    }
    catch (error) {
        await message.send({ format: messageFormat('怪物图鉴', error instanceof Error ? error.message : '无法查看该怪物。') });
    }
};
const skillCodexDetailHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const skill = await skillCodexDetail(event.current.UserId, Number(route.param('id')));
        const categoryNames = { physical: '物理', magic: '魔法', utility: '辅助', passive: '被动', bound: '绑定', special: '特殊' };
        const markdown = Format.createMarkdown().addTitle(skill.name).addNewline().addNewline()
            .addText(`【技能】${skill.name}\n图鉴ID：${skill.codex_id}\n类别：${categoryNames[skill.category] ?? '特殊'}\n种类：${skill.skill_kind}\n属性：${skill.element}\n距离：${skill.range_type}\n目标范围：${skill.target_scope}\n基础威力：${skill.power}\n基础蓝耗：${skill.mana_cost}\n基础冷却：${skill.cooldown_turns}\n基础吟咏：${skill.chant_turns}\n\n特殊效果：\n`);
        for (const effect of String(skill.effects ?? '无').split('、').filter(Boolean))
            markdown.addBlockquote(effect).addNewline();
        markdown.addNewline().addText('简介：\n').addBlockquote(skillPurpose(skill.code, skill.description));
        await message.send({ format: Format.create().addMarkdown(markdown) });
    }
    catch (error) {
        await message.send({ format: messageFormat('技能图鉴', error instanceof Error ? error.message : '无法查看该技能。') });
    }
};

export { codexListHandler, codexPageHandler, codexSearchHandler, codex as default, monsterCodexDetailHandler, skillCodexDetailHandler };
