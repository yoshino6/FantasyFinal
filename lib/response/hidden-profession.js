import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { messageFormat } from '../game/message.js';
import { hiddenQuestTopic, hiddenQuestView, becomeHiddenProfession, hiddenQuestAction } from '../game/hidden-quest.service.js';
import { hiddenSkills } from '../game/hidden-profession.config.js';
import { hiddenQuestRetry } from '../game/hidden-quest.story.js';
import { observeHiddenQuestMonster } from '../game/adventure.service.js';

const returnCommand = { magical_scholar: '/糖水屋', weapon_master: '/铁匠铺', inventor: '/异工坊', tactician: '/百味书屋' };
const hiddenObservationHandler = async () => {
    const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
    try {
        const result = await observeHiddenQuestMonster(event.current.UserId, Number(route.param('id')));
        await message.send({ format: messageFormat('观察记录', `【${result.name}】\n\n${result.fact}\n\n这份记录只包含眼前公开的事实。`) });
    }
    catch (error) {
        await message.send({ format: messageFormat('观察记录', error instanceof Error ? error.message : '暂时无法观察。') });
    }
};
const appendHiddenQuestButton = async (buttons, user, npc) => {
    const topic = await hiddenQuestTopic(user, npc);
    if (topic)
        buttons.addRow().addButton(topic.label, `/店内委托 ${topic.code}`, { type: 'command', autoEnter: true, style: 'blue' });
};
const hiddenProfessionFormat = async (user, code, receipt = '') => {
    const data = await hiddenQuestView(user, code), { profession, story, quest, evidence } = data;
    const md = Format.createMarkdown().addTitle(data.qualified ? `关于 ${profession.name}` : `${profession.mentor}·${quest?.name ?? '私人委托'}`).addNewline().addNewline();
    const buttons = Format.createButtonGroup();
    const command = (action, choice) => `/委托操作 ${profession.code} ${data.revision} ${action}${choice === undefined ? '' : ` ${choice}`}`;
    if (receipt)
        md.addBlockquote(receipt).addNewline().addNewline();
    if (data.qualified) {
        md.addBold('十环委托已经完成').addNewline().addText('你已获得永久保留的二转机会。达到Lv.25、完成冒险者登记并选用对应副职业后，可在这里举行仪式。重新二转间隔24小时。').addNewline().addNewline().addBlockquote(profession.role).addNewline().addNewline();
        for (const skill of hiddenSkills.filter(skill => skill.profession === profession.code))
            md.addBold(skill.name).addText(` · ${skill.description}`).addNewline().addNewline();
        buttons.addRow().addButton(`二转 ${profession.name}`, `/隐藏二转 ${profession.code}`, { type: 'command', autoEnter: true, style: 'blue' });
    }
    else if (story && quest) {
        if (!data.accepted) {
            md.addText(story.scene).addNewline().addNewline().addBlockquote(story.speech).addNewline().addNewline();
            if (quest.materials.length)
                md.addBold('需要备齐').addNewline().addText(quest.materials.map(item => `${item.name} ×${item.quantity}`).join('、')).addNewline().addNewline();
            buttons.addRow().addButton('接下委托', command('accept'), { type: 'command', autoEnter: true, style: 'blue' });
        }
        else {
            md.addBold(`私人记录 ${Math.min(data.stage, 10)}/10`).addNewline().addNewline();
            if (profession.code === 'tactician' && data.stage === 2) {
                md.addBlockquote('接受本环后，在真实遇见目标的地方使用「观察记录」。带回森林史莱姆与幽影狼王各一份公开事实，不必击杀。').addNewline().addNewline();
                for (const name of ['森林史莱姆', '幽影狼王'])
                    md.addText(`${data.observations.some(record => record.name === name) ? '✓' : '○'} ${name}`).addNewline();
                buttons.addRow().addButton('观察记录', '/观察记录 ', { type: 'command', autoEnter: false, style: 'blue' });
                if (data.observations.length === 2)
                    buttons.addRow().addButton('交回记录', command('finish'), { type: 'command', autoEnter: true, style: 'blue' });
            }
            else if (!data.paid) {
                md.addBlockquote(story.speech).addNewline().addNewline();
                if (quest.materials.length)
                    md.addBold('交付材料').addNewline().addText(quest.materials.map(item => `${item.name} ×${item.quantity}`).join('、')).addNewline().addNewline();
                md.addText(quest.objective).addNewline();
                buttons.addRow().addButton(quest.materials.length ? '交付并备台' : '查看并备台', command('prepare'), { type: 'command', autoEnter: true, style: 'blue' });
            }
            else if (evidence.lesson?.complete) {
                if (!receipt)
                    md.addBlockquote(evidence.lesson.last).addNewline().addNewline();
                md.addBold('本环操作与记录已齐全');
                buttons.addRow().addButton('交回记录', command('finish'), { type: 'command', autoEnter: true, style: 'blue' });
            }
            else {
                const cursor = evidence.lesson?.cursor ?? 0, step = data.steps[cursor];
                if (data.stage === 6 && profession.code === 'tactician')
                    for (const record of data.observations)
                        md.addBlockquote(`${record.name} · ${record.fact}`).addNewline();
                if (evidence.lesson?.attempts && receipt?.startsWith('演示停'))
                    md.addBlockquote(hiddenQuestRetry(profession.code)).addNewline().addNewline();
                if (step) {
                    md.addBold(data.stage === 10 ? '个人演练' : '工作台').addText(` · ${cursor + 1}/${data.steps.length}`).addNewline().addNewline().addBlockquote(step.prompt);
                    step.choices.forEach((label, index) => buttons.addRow().addButton(label, command('lesson', index), { type: 'command', autoEnter: true, style: 'blue' }));
                }
            }
            buttons.addRow().addButton('重读委托', `/重读委托 ${profession.code}`, { type: 'command', autoEnter: true });
        }
    }
    if (data.qualified)
        buttons.addRow().addButton('二转配置', '/二转配置', { type: 'command', autoEnter: true });
    buttons.addRow().addButton('返回店内', returnCommand[profession.code], { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(md).addButtonGroup(buttons);
};
const hiddenProfessionHandler = (operation) => async () => {
    const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
    const user = event.current.UserId, code = String(route.param('code'));
    try {
        if (operation === 'story') {
            const data = await hiddenQuestView(user, code);
            if (!data.story)
                throw new Error('委托已全部完成。');
            await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle(data.quest?.name ?? '私人委托').addNewline().addNewline().addText(data.story.scene).addNewline().addNewline().addBlockquote(data.story.speech)).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回工作台', `/店内委托 ${code}`, { type: 'command', autoEnter: true })) });
            return;
        }
        if (operation === 'become') {
            const result = await becomeHiddenProfession(user, code);
            await message.send({ format: messageFormat(`二转·${result.profession.name}`, `${result.profession.mentor}为你合上最后一册记录。\n\n你成为了【${result.profession.name}】，获得四项专属主动技能与本职被动。旧二转技能与快捷配置已清理，技能点按现有重置规则处理。`) });
            return;
        }
        const result = operation === 'action' ? await hiddenQuestAction(user, code, Number(route.param('revision')), String(route.param('action')), route.param('choice') === undefined ? undefined : Number(route.param('choice'))) : null;
        await message.send({ format: await hiddenProfessionFormat(user, code, result?.receipt) });
    }
    catch (error) {
        await message.send({ format: messageFormat('店内委托', error instanceof Error ? error.message : '工作台暂时无法响应。') });
    }
};

export { appendHiddenQuestButton, hiddenObservationHandler, hiddenProfessionFormat, hiddenProfessionHandler };
