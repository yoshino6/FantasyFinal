import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { messageFormat } from '../game/message.js';
import { listCharacterOperations, getCharacterOperationDetail, characterTendencyBalance } from '../game/character-operation.service.js';
import { attributes } from '../game/types.js';
import { heartAttributeNames } from '../game/heart-question.service.js';

const timeText = (date) => new Date(date).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
const pointText = (units) => `${(units / 10).toFixed(1)} 点`;
const scoreReasonText = { awarded: '已计入', zero_tier: '仅记录事实', system_source: '系统或受动结果', repeat_source: '同源短时重复', daily_cap: '达到今日上限', daily_cap_partial: '受今日上限限制', unmapped: '倾向待映射' };
const fail = async (message, error) => message.send({ format: messageFormat('人物行迹', error instanceof Error ? error.message : '暂时无法读取行迹。') });
const characterOperationsHandler = async () => {
    const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
    try {
        const cursor = Number(route.param('cursor') ?? 0);
        const page = await listCharacterOperations(event.current.UserId, { cursor: cursor || undefined, limit: 10 });
        const md = Format.createMarkdown().addTitle('人物行迹').addNewline().addNewline()
            .addText('只记录已经发生的业务结算与状态变化；积分为 0 的有效结果也会保留。').addNewline().addNewline();
        if (!page.rows.length)
            md.addText('暂无行迹记录。');
        for (const fact of page.rows)
            md.addText(`【${fact.id}】${fact.title} · ${fact.outcome}`).addNewline()
                .addText(`${timeText(fact.occurredAt)}｜${fact.summary || '查看详情了解本次结果'}｜积分 ${fact.points.toFixed(1)}`).addNewline().addNewline();
        md.addText('发送「/行迹详情 编号」可查看单笔结果。').addNewline();
        const buttons = Format.createButtonGroup().addRow().addButton('育成积分', '/育成', { type: 'command', autoEnter: true });
        if (page.nextCursor)
            buttons.addButton('下一页', `/行迹 ${page.nextCursor}`, { type: 'command', autoEnter: true });
        await message.send({ format: Format.create().addMarkdown(md).addButtonGroup(buttons) });
    }
    catch (error) {
        await fail(message, error);
    }
};
const characterOperationDetailHandler = async () => {
    const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
    try {
        const fact = await getCharacterOperationDetail(event.current.UserId, Number(route.param('id')));
        if (!fact) {
            await message.send({ format: messageFormat('人物行迹', '未找到属于你的这笔行迹。') });
            return;
        }
        const changes = attributes.filter(key => fact.pointDelta[key] > 0).map(key => `${heartAttributeNames[key]} +${pointText(fact.pointDelta[key])}`).join('，') || '本次无育成积分';
        const detail = Object.entries(fact.detail).map(([key, value]) => `${key}：${typeof value === 'object' ? JSON.stringify(value) : String(value)}`).join('\n');
        const md = Format.createMarkdown().addTitle(fact.title).addNewline().addNewline()
            .addText(`${timeText(fact.occurredAt)}｜${fact.outcome}`).addNewline().addNewline()
            .addText(fact.summary).addNewline().addNewline()
            .addText(`来源：${fact.source.system} / ${fact.source.id} / ${fact.source.step}`).addNewline()
            .addText(`六维倾向：${attributes.filter(key => fact.weights[key] > 0).map(key => heartAttributeNames[key]).join('、') || '待映射'}`).addNewline()
            .addText(`积分：${changes}（${scoreReasonText[fact.scoreReason] ?? fact.scoreReason}）`).addNewline().addNewline()
            .addText(detail || '无额外详情');
        await message.send({ format: Format.create().addMarkdown(md) });
    }
    catch (error) {
        await fail(message, error);
    }
};
const characterTendencyHandler = async () => {
    const [event] = useEvent(), [message] = useGameMessage();
    try {
        const balance = await characterTendencyBalance(event.current.UserId);
        if (!balance) {
            await message.send({ format: messageFormat('人物育成', '请先创建角色。') });
            return;
        }
        const md = Format.createMarkdown().addTitle('人物育成').addNewline().addNewline()
            .addText('六维行迹积分').addNewline().addNewline();
        for (const key of attributes)
            md.addText(`${heartAttributeNames[key]}：${pointText(balance.earned[key] - balance.spent[key])}`).addNewline();
        md.addNewline().addText('质变领取将在全量业务覆盖与积分回放校准后开放。');
        await message.send({ format: Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看行迹', '/行迹', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await fail(message, error);
    }
};

export { characterOperationDetailHandler, characterOperationsHandler, characterTendencyHandler };
