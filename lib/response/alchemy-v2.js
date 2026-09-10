import { alchemyEffectDescription, alchemyOutputDefinitions } from '../game/alchemy-catalog.js';
import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { executeAlchemy, alchemyJournalReload, randomAlchemyFormula } from '../game/alchemist.service.js';
import { cancelCraftPreview, craftCharacterId, craftRequestFor, alchemyJournalPage, alchemyJournalDetail } from '../game/alchemy-journal.service.js';
import { alchemyRuleVersion } from '../game/alchemy-journal.js';
import { withTransaction } from '../database/pool.js';
import { messageFormat } from '../game/message.js';
import { alchemyCreationQuest } from '../game/alchemy-creation-quest.service.js';

const alchemyResultFormat = (result) => {
    if (result.needsConfirmation) {
        const md = Format.createMarkdown().addTitle('炼金确认').addNewline().addNewline();
        for (const item of result.preview?.ingredients ?? [])
            md.addText(`${item.role}：【${item.name}】×${item.quantity}`).addNewline();
        md.addNewline().addText(`确认后消耗以上材料，进行 ${result.batches ?? 1} 批炼金。`);
        if (result.preview?.note)
            md.addNewline().addText(result.preview.note);
        if (result.preview?.warning)
            md.addNewline().addText('⚠️ 素材等级能量相差过大，继续炼金风险极高。');
        return Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow()
            .addButton('确认炼金', `/确认炼金 ${result.token}`, { type: 'command', autoEnter: true, style: 'blue' })
            .addButton('换一组', `/炼金换组 ${result.token}`, { type: 'command', autoEnter: true })
            .addButton('取消', `/取消炼金 ${result.token}`, { type: 'command', autoEnter: true }));
    }
    return Format.create().addMarkdown(Format.createMarkdown().addTitle('炼金结果').addNewline().addText((result.stages ?? []).join('\n\n')))
        .addButtonGroup(Format.createButtonGroup().addRow()
        .addButton('继续尝试', `/继续尝试 ${result.token}`, { type: 'command', autoEnter: true, style: 'blue' })
        .addButton('炼金手记', `/炼金手记详情 ${result.journalId}`, { type: 'command', autoEnter: true })
        .addRow().addButton('保存配方', `/保存炼金配方 ${result.journalId}`, { type: 'command', autoEnter: true })
        .addButton('返回炼金', '/继续炼金', { type: 'command', autoEnter: true }));
};
const respond = async (work) => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        await message.send({ format: await work(event.current.UserId, route) });
    }
    catch (error) {
        await message.send({ format: messageFormat('炼金提示', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const alchemyExecuteV2Handler = async () => respond(async (user) => alchemyResultFormat(await executeAlchemy(user)));
const alchemyConfirmV2Handler = async () => respond(async (user, route) => alchemyResultFormat(await executeAlchemy(user, String(route.param('token') ?? '') || undefined)));
const alchemyCancelV2Handler = async () => respond(async (user, route) => {
    const token = String(route.param('token') ?? '');
    if (!token)
        return alchemyResultFormat(await executeAlchemy(user));
    await cancelCraftPreview(user, token);
    return messageFormat('已取消炼金', '材料尚未消耗。');
});
const randomFormat = async (user, searchToken, replaceToken) => {
    const result = await randomAlchemyFormula(user, searchToken, replaceToken);
    if ('searchToken' in result && result.searchToken)
        return Format.create().addMarkdown(Format.createMarkdown().addTitle('一键配方').addNewline().addText('正在查找可用的新组合，当前扫描尚未完成。'))
            .addButtonGroup(Format.createButtonGroup().addRow().addButton('继续查找', `/炼金查找 ${result.searchToken}${replaceToken ? ` ${replaceToken}` : ''}`, { type: 'command', autoEnter: true }).addButton('返回炼金', '/继续炼金', { type: 'command', autoEnter: true }));
    const format = alchemyResultFormat(result);
    if ('onlyCurrent' in result && result.onlyCurrent)
        format.addText('没有其他未尝试组合，保留当前组合。');
    else
        format.addText('这是你尚未尝试过的材料组合。');
    return format;
};
const alchemyRandomHandler = async () => respond(async (user) => randomFormat(user));
const alchemyReplaceHandler = async () => respond(async (user, route) => randomFormat(user, undefined, String(route.param('token'))));
const alchemySearchContinueHandler = async () => respond(async (user, route) => randomFormat(user, String(route.param('token')), String(route.param('replace') ?? '') || undefined));
const alchemyTryContinueHandler = async () => respond(async (user, route) => {
    await withTransaction(async (connection) => { const id = await craftCharacterId(connection, user, true); const result = await craftRequestFor(connection, id, 'alchemy', String(route.param('token'))); if (!result.result)
        throw new Error('本次炼金尚未完成。'); });
    return randomFormat(user);
});
const alchemyJournalHandler = async () => respond(async (user, route) => {
    const data = await alchemyJournalPage(user, Number(route.param('page') ?? 1), String(route.param('scope') ?? '全部记录'), String(route.param('field') ?? '全部'), String(route.param('keyword') ?? ''), Number(route.param('anchor') ?? 0));
    const md = Format.createMarkdown().addTitle(`炼金手记 · ${data.scope}`).addNewline().addText(`筛选：${data.field}${data.keyword ? `「${data.keyword}」` : ''}`).addNewline().addNewline();
    if (!data.count)
        md.addText(data.keyword ? '未找到匹配记录。' : '炼金手记从本次更新后开始记录，你每次实际炼制的耗材与成果都会自动保存。').addNewline();
    for (const record of data.entries) {
        md.addText(`【手记 ${record.id}】${record.time.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`).addNewline();
        md.addText(record.batches.flatMap(batch => batch.consumed ?? record.snapshot.ingredients).map(item => `${item.role}：${item.name}×${item.quantity}`).join('｜')).addNewline();
        const outputs = new Map();
        record.batches.flatMap(batch => batch.outputs).forEach(item => outputs.set(item.name, (outputs.get(item.name) ?? 0) + item.quantity));
        md.addText(`成果：${[...outputs].map(([name, quantity]) => `${name}×${quantity}`).join('、') || '无成果'}`).addNewline();
        const stats = record.result.statistics;
        if (stats?.stable)
            md.addText(`稳定记录：${stats.batches} 批成功 ${stats.successes} 批；其中 ${stats.count} 批获得常见成果（${(stats.count / stats.successes * 100).toFixed(1)}%）。`).addNewline();
        if (record.snapshot.version !== alchemyRuleVersion)
            md.addText('旧条件记录，当前版本结果可能变化。').addNewline();
        md.addButton('[查看详情]', { data: `/炼金手记详情 ${record.id}`, autoEnter: false });
        if (record.snapshot.kind !== 'purification')
            md.addText(' ').addButton('[再次投料]', { data: record.snapshot.source === 'automaton' ? `/炼金 配方 0 ${record.snapshot.conditions} 1` : `/炼金手记投料 ${record.id}`, autoEnter: false });
        md.addNewline().addNewline();
    }
    md.addText(`当前第 ${data.page} / ${data.pages} 页`);
    const command = (page, scope = data.scope, field = data.field, keyword = data.keyword) => `/炼金手记页 ${page} ${scope} ${field} ${data.anchor}${keyword ? ` ${keyword}` : ''}`;
    const buttons = Format.createButtonGroup().addRow()
        .addButton('上一页', command(Math.max(1, data.page - 1)), { type: 'command', autoEnter: true })
        .addButton('搜索', `/炼金手记搜索 ${data.scope} ${data.field} `, { type: 'command', autoEnter: false })
        .addButton('下一页', command(Math.min(data.pages, data.page + 1)), { type: 'command', autoEnter: true })
        .addRow().addButton('全部记录', command(1, '全部记录'), { type: 'command', autoEnter: true }).addButton('稳定组合', command(1, '稳定组合'), { type: 'command', autoEnter: true })
        .addRow().addButton('全部字段', command(1, data.scope, '全部'), { type: 'command', autoEnter: true }).addButton('耗材', command(1, data.scope, '耗材'), { type: 'command', autoEnter: true }).addButton('成果', command(1, data.scope, '成果'), { type: 'command', autoEnter: true })
        .addRow().addButton('清除筛选', '/炼金手记', { type: 'command', autoEnter: true }).addButton('返回炼金', '/继续炼金', { type: 'command', autoEnter: true });
    const creationQuest = await alchemyCreationQuest(user);
    md.addNewline();
    for (const scope of [...(creationQuest.unlocked ? ['点灵', '育成'] : []), '成功', '失败'])
        md.addButton(`[${scope}]`, { data: `/炼金手记页 1 ${scope} 全部 0`, autoEnter: false }).addText(' ');
    return Format.create().addMarkdown(md).addButtonGroup(buttons);
});
const alchemyJournalDetailHandler = async () => respond(async (user, route) => {
    const record = await alchemyJournalDetail(user, Number(route.param('id')));
    const pages = Math.max(1, Math.ceil(record.batches.length / 5));
    const page = Math.min(pages, Math.max(1, Number(route.param('page') ?? 1)));
    const md = Format.createMarkdown().addTitle(`炼金手记 ${record.id}`).addNewline().addText(`制作时：炼金师 Lv.${record.snapshot.level}｜匠心 ${record.snapshot.craftsmanship}%`).addNewline();
    md.addText(record.snapshot.ingredients.map(item => `${item.role}：${item.name}×${item.quantity * record.batches.length}`).join('\n')).addNewline();
    if (record.snapshot.version !== alchemyRuleVersion)
        md.addText('旧版本记录，当前条件可能不同。').addNewline();
    record.batches.slice((page - 1) * 5, page * 5).forEach((batch, index) => {
        md.addText(`第 ${(page - 1) * 5 + index + 1} 批：${batch.success ? batch.great ? '大成功' : '成功' : '失败'}`).addNewline();
        for (const item of batch.outputs) {
            md.addText(`获得【${item.name}】×${item.quantity}`).addNewline();
            if (item.effect && typeof item.effect === 'object' && item.effect.alchemyOutput)
                md.addText(alchemyEffectDescription(item.effect)).addNewline();
        }
        if (!batch.outputs.length)
            md.addText('无成果').addNewline();
    });
    const stats = record.result.statistics;
    if (stats) {
        md.addText(`可比记录：${stats.settlements} 次结算，${stats.batches} 批，成功 ${stats.successes} 批。${stats.stable ? '已形成稳定组合。' : stats.everStable ? '曾稳定，当前记录出现分歧。' : '尚未形成稳定组合。'}`).addNewline();
        const names = new Map([...alchemyOutputDefinitions.map(item => [item.code, item.name]), ...record.batches.flatMap(batch => batch.outputs).map(item => [item.code, item.name])]);
        md.addText(`常见成果：成功 ${stats.successes} 批中的 ${stats.count} 批；累计产量：${Object.entries(stats.quantities ?? {}).map(([code, value]) => { const q = value; return `${names.get(code) ?? '历史产物'} ${q.min}～${q.max}/成功批，累计${q.total}`; }).join('、') || '无'}`).addNewline();
        md.addText(`品质分布：${Object.entries(stats.qualities ?? {}).map(([code, count]) => `${names.get(code) ?? code}×${count}`).join('、') || '无成果'}`).addNewline();
    }
    md.addText(record.snapshot.cost === undefined ? '投入价值：未估价' : `本次每批投入价值：${record.snapshot.cost.toFixed(2)}；期望单件成本：${Number(record.result.averageCost ?? 0) > 0 ? Number(record.result.averageCost).toFixed(2) : '未估价'}`).addNewline();
    md.addText(`批次第 ${page}/${pages} 页`);
    const buttons = Format.createButtonGroup().addRow().addButton('上一页', `/炼金手记详情 ${record.id} ${Math.max(1, page - 1)}`, { type: 'command', autoEnter: true }).addButton('下一页', `/炼金手记详情 ${record.id} ${Math.min(pages, page + 1)}`, { type: 'command', autoEnter: true });
    if (record.snapshot.kind !== 'purification')
        buttons.addRow().addButton('再次投料', record.snapshot.source === 'automaton' ? `/炼金 配方 0 ${record.snapshot.conditions} 1` : `/炼金手记投料 ${record.id}`, { type: 'command', autoEnter: true });
    buttons.addRow().addButton('返回手记', '/炼金手记', { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(md).addButtonGroup(buttons);
});
const alchemyJournalReloadHandler = async () => respond(async (user, route) => alchemyResultFormat(await alchemyJournalReload(user, Number(route.param('id')))));

export { alchemyCancelV2Handler, alchemyConfirmV2Handler, alchemyExecuteV2Handler, alchemyJournalDetailHandler, alchemyJournalHandler, alchemyJournalReloadHandler, alchemyRandomHandler, alchemyReplaceHandler, alchemyResultFormat, alchemySearchContinueHandler, alchemyTryContinueHandler };
