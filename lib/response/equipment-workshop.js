import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { messageFormat } from '../game/message.js';
import { currentSecondaryShop } from '../game/secondary-shop-context.js';
import { workshopPreview, workshopExecute, workshopList } from '../game/equipment-workshop.service.js';

const labels = { fusion: '熔铸', reroll: '重铸', refine: '精炼' };
const commands = { fusion: '熔铸升级', reroll: '重铸洗练', refine: '装备精炼' };
const descriptions = {
    fusion: '提升装备等级，保留稀有度与原有词条。词条数值和上限保持原样；火候会有所回落，通常需数次精炼恢复。',
    reroll: '重新抽取全部副词条，直接替换原有结果，并略微改善火候。主属性与专属效果保留。',
    refine: '稳定改善装备火候，偶有惊喜。圆满后可另行尝试突破；突破可能失败，但不会损失现有品质。常规突破最高达到传说。'
};
const command = (text) => `/${currentSecondaryShop() ? '店铺' : ''}${text}`;
const list = (mode) => async () => {
    const [event] = useEvent(), [message] = useGameMessage(), [route] = useRoute();
    try {
        const keyword = String(route.param('keyword') ?? ''), all = (await workshopList(event.current.UserId)).filter(r => r.name.includes(keyword));
        const page = Math.max(1, Math.min(Math.ceil(all.length / 8) || 1, Number(route.param('page')) || 1));
        const md = Format.createMarkdown().addTitle(labels[mode]).addNewline().addBlockquote(descriptions[mode]).addNewline();
        for (const row of all.slice((page - 1) * 8, page * 8))
            md.addText(`【${row.name}】Lv.${row.level}｜${row.rarity}｜${row.quality} `).addButton('[放入]', { data: command(`${commands[mode]}预览 ${row.id}`), autoEnter: false }).addNewline();
        if (!all.length)
            md.addText('暂无可放入的未装备物品。');
        if (page > 1)
            md.addButton('[上一页]', { data: command(`${labels[mode]}页 ${page - 1} ${keyword}`.trim()), autoEnter: false });
        if (page * 8 < all.length)
            md.addButton('[下一页]', { data: command(`${labels[mode]}页 ${page + 1} ${keyword}`.trim()), autoEnter: false });
        await message.send({ format: Format.create().addMarkdown(md) });
    }
    catch (e) {
        await message.send({ format: messageFormat('无法查看', e instanceof Error ? e.message : '请稍后重试。') });
    }
};
const preview = (mode) => async () => {
    const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
    try {
        const result = await workshopPreview(event.current.UserId, Number(route.param('id')), mode);
        const md = Format.createMarkdown().addTitle(`${labels[mode]}${result.breakthrough ? '突破' : ''}预览`).addNewline()
            .addText(`【${result.name}】${result.rarity}｜${result.quality}`).addNewline().addBlockquote(descriptions[mode]).addNewline();
        if (result.breakthrough)
            md.addBlockquote('本次将消耗材料尝试突破；失败后仍保持圆满品质。').addNewline();
        if (mode === 'fusion')
            md.addText(`装备等级：Lv.${result.level} → Lv.${result.level + 5}`).addNewline();
        for (const cost of result.costs)
            md.addText(`${cost.name}×${cost.quantity}`).addNewline();
        if (result.fee)
            md.addText(`手续费：铜币×${result.fee}`).addNewline();
        md.addButton(result.breakthrough ? '[确认突破]' : `[确认${labels[mode]}]`, { data: command(`确认${commands[mode]} ${result.token}`), autoEnter: false });
        md.addText(' ').addButton('[返回]', { data: command(labels[mode]), autoEnter: false });
        await message.send({ format: Format.create().addMarkdown(md) });
    }
    catch (e) {
        await message.send({ format: messageFormat('无法预览', e instanceof Error ? e.message : '请稍后重试。') });
    }
};
const execute = (mode) => async () => {
    const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
    try {
        const result = await workshopExecute(event.current.UserId, String(route.param('token')), mode);
        await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle(`${labels[mode]}结果`).addNewline().addText(result.text).addNewline().addButton('[查看装备]', { data: `/装备详情 ${result.instanceId}`, autoEnter: false }).addText(' ').addButton('[返回]', { data: command(labels[mode]), autoEnter: false })) });
    }
    catch (e) {
        await message.send({ format: messageFormat('未能完成', e instanceof Error ? e.message : '请稍后重试。') });
    }
};
const fusionList = list('fusion'), rerollList = list('reroll'), refinementList = list('refine');
const fusionPreview = preview('fusion'), rerollPreview = preview('reroll'), refinementPreview = preview('refine');
const fusionExecute = execute('fusion'), rerollExecute = execute('reroll'), refinementExecute = execute('refine');
const retiredWorkshopHandler = async () => { const [message] = useGameMessage(); await message.send({ format: messageFormat('旧入口已停用', '请从锻造面板重新进入熔铸、重铸或精炼，预览材料后再确认操作。') }); };

export { fusionExecute, fusionList, fusionPreview, refinementExecute, refinementList, refinementPreview, rerollExecute, rerollList, rerollPreview, retiredWorkshopHandler };
