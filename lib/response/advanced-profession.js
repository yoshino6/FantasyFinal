import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { addNpcAffinity, chooseTarget, battleStatus } from '../game/adventure.service.js';
import { mentorChatDialogue, mentorDialogues, advancedProfessionReveal } from '../game/advanced-profession.dialogue.js';
import { advancedProfessionView, beginAdvancedProfession, advanceAdvancedProfessionStage, submitAdvancedProfessionProof, beginAdvancedProfessionTrial } from '../game/advanced-profession.service.js';
import { beginInheritanceStudy, completeInheritanceStudy, equipInheritanceStudy, inheritanceStudyView } from '../game/advanced-passive.service.js';
import { advancedProfessionByCode, registeredAdvancedProfessionByCode, inheritancePassiveFor } from '../game/advanced-profession.config.js';
import { messageFormat } from '../game/message.js';
import { durationText } from '../game/time-format.js';

const fail = async (message, error, title = '二转试炼') => message.send({ format: messageFormat(title, error instanceof Error ? error.message : '请稍后重试。') });
const baseName = (code) => ({ warrior: '战士', mage: '法师', rogue: '盗贼', priest: '牧师' }[code] ?? code);
const advancedMentorFormat = async (qqUserId, mentorCode) => {
    const view = await advancedProfessionView(qqUserId, mentorCode);
    const { profession, character } = view;
    const trialReady = Number(view.active?.stage) === 3 && view.completedCode !== profession.code;
    const markdown = Format.createMarkdown().addTitle(`${profession.mentor.title}·${profession.mentor.name}`).addNewline().addNewline()
        .addText(`世界树的叶影在导师身侧缓慢流动。对方看了看你手中的装备，又把目光落回你的脸上。`).addNewline().addNewline()
        .addBlockquote(`“Lv.${character.level} 的${baseName(character.profession)}……路走到这里，不妨先想清楚自己想成为怎样的同伴。”`);
    const buttons = Format.createButtonGroup().addRow()
        .addButton('闲聊', `/二转闲聊 ${mentorCode}`, { type: 'command', autoEnter: true, style: 'blue' })
        .addButton('切磋', `/切磋 ${mentorCode}`, { type: 'command', autoEnter: true, style: 'blue' })
        .addButton(`关于 ${profession.name}`, `/二转职业 ${mentorCode}`, { type: 'command', autoEnter: true, style: 'blue' })
        .addButton('离开', `/NPC离开 ${mentorCode}`, { type: 'command', autoEnter: true });
    if (view.completedCode && view.completedCode !== profession.code)
        buttons.addRow().addButton('旁修 传承', `/二转旁修 ${mentorCode}`, { type: 'command', autoEnter: true, style: 'blue' });
    if (trialReady)
        buttons.addRow().addButton('[试炼]', `/开启导师试炼 ${profession.code}`, { type: 'command', autoEnter: true, style: 'blue' });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const advancedProfessionDetailFormat = async (qqUserId, mentorCode) => {
    const view = await advancedProfessionView(qqUserId, mentorCode);
    const { profession, active, activeQuest, completedCode, retrainRemainingSeconds, ridgeCore } = view;
    const stage = Number(active?.stage ?? 0);
    const completed = completedCode === profession.code;
    const activeProfession = activeQuest ? advancedProfessionByCode(activeQuest.profession_code) : undefined;
    const currentProfession = registeredAdvancedProfessionByCode(completedCode ?? '');
    const dialogue = mentorDialogues[mentorCode];
    const markdown = Format.createMarkdown().addTitle(`关于 ${profession.name}`).addNewline().addNewline().addBlockquote(dialogue?.introduction ?? profession.role).addNewline().addNewline()
        .addText(`队伍定位：${profession.role}`).addNewline().addNewline();
    const buttons = Format.createButtonGroup();
    if (completed) {
        markdown.addText(`你已经成为${profession.name}。`).addNewline().addNewline().addBlockquote(advancedProfessionReveal(profession)).addNewline().addNewline().addText('导师不再重复试炼，只提醒你把这份力量用在值得守护的同伴身上。');
    }
    else if (activeQuest && activeQuest.profession_code !== profession.code) {
        markdown.addText(`你正在进行【${activeProfession?.name ?? activeQuest.profession_code}】的第 ${Number(activeQuest.stage)} 段试炼。`).addNewline().addNewline()
            .addBlockquote(`若接受【${profession.name}】的试炼，将中断并清除前一条任务的当前进度；当前二转职业${currentProfession ? `【${currentProfession.name}】` : '尚未确定'}不会立刻改变，只有击败新导师后才会替换。`).addNewline().addNewline()
            .addText('中断后的任务进度无法恢复，是否开始新的二转试炼？');
        buttons.addRow().addButton(`中断并接受 ${profession.name}`, `/确认切换二转 ${profession.code}`, { type: 'command', autoEnter: true, style: 'blue' });
    }
    else if (!active) {
        markdown.addText('这条路尚未开始。接受试炼后，导师会逐步告诉你下一步该做什么。');
        if (retrainRemainingSeconds > 0) {
            markdown.addNewline().addNewline().addBlockquote(`重新二转冷却中：剩余 ${durationText(retrainRemainingSeconds)}。`);
        }
        else {
            buttons.addRow().addButton('接受 试炼任务', `/接受二转 ${profession.code}`, { type: 'command', autoEnter: true, style: 'blue' });
        }
    }
    else if (stage === 1) {
        if (currentProfession)
            markdown.addBlockquote(`重新二转进行中：在击败导师前，你仍以【${currentProfession.name}】的职业、技能与被动战斗。`).addNewline().addNewline();
        markdown.addText(`当前试炼：${profession.first.title}`).addNewline().addNewline().addBlockquote(profession.first.story).addNewline().addNewline()
            .addText(`目标：在岩脊山麓击败【${profession.first.targetText}】 ${Number(active.story_kills)}/${profession.first.requiredKills} 次。`);
        buttons.addRow().addButton('提交 第一段见闻', `/推进二转 ${profession.code}`, { type: 'command', autoEnter: true, style: 'blue' });
    }
    else if (stage === 2) {
        markdown.addText(`当前试炼：${profession.second.title}`).addNewline().addNewline().addBlockquote(profession.second.story).addNewline().addNewline()
            .addText(`目标：击败【${profession.second.targetText}】 ${Number(active.proof_kills)}/${profession.second.requiredKills} 次；提交岩脊核心 ${ridgeCore}/${profession.second.materialCount}。`);
        buttons.addRow().addButton('提交 第二段凭证', `/提交二转凭证 ${profession.code}`, { type: 'command', autoEnter: true, style: 'blue' });
    }
    else if (stage === 3) {
        markdown.addText('当前试炼：导师试炼').addNewline().addNewline().addBlockquote(profession.trial.description).addNewline().addNewline()
            .addText(`准备就绪后，挑战 Lv.30【${profession.trial.name}】。`);
        buttons.addRow().addButton('[试炼]', `/开启导师试炼 ${profession.code}`, { type: 'command', autoEnter: true, style: 'blue' });
    }
    buttons.addRow().addButton('返回 导师', `/二转导师 ${mentorCode}`, { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const inheritanceStudyFormat = async (qqUserId, mentorCode) => {
    const view = await advancedProfessionView(qqUserId, mentorCode);
    const study = await inheritanceStudyView(qqUserId, mentorCode);
    const passive = inheritancePassiveFor(view.profession.code);
    if (!passive)
        throw new Error('这条传承的旁修内容尚未准备好。');
    const markdown = Format.createMarkdown().addTitle(`${view.profession.mentor.title}·${view.profession.mentor.name}｜旁修传承`).addNewline().addNewline()
        .addText(`传承被动【${passive.name}】`).addNewline().addNewline().addBlockquote(`本职：${passive.ownDescription}`).addNewline().addBlockquote(`旁修：${passive.studyDescription}`).addNewline().addNewline();
    const buttons = Format.createButtonGroup();
    if (!study.ownProfessionCode)
        markdown.addText('先完成任意一条二转导师试炼，才能理解其他传承。');
    else if (study.ownProfessionCode === study.professionCode)
        markdown.addText('这是你的本职传承，已按本职数值常驻，不可旁修自己。');
    else if (study.level < 30)
        markdown.addText(`旁修将在 Lv.30 开放。当前：Lv.${study.level}。`);
    else if (study.completedAt) {
        markdown.addText(study.equipped ? '这条旁修传承正在生效；装备其他旁修会自动替换它。' : '这条旁修传承已收入图鉴，尚未装备。');
        buttons.addRow().addButton(study.equipped ? '卸下 旁修' : '装备 旁修', `/切换二转旁修 ${view.profession.code} ${study.equipped ? 'off' : 'on'}`, { type: 'command', autoEnter: true, style: 'blue' });
    }
    else if (!study.startedAt) {
        markdown.addText('导师会用五分钟讲解这条传承的边界与触发时机。完成后交付 1 枚【回响结晶】，即可收入旁修图鉴。');
        buttons.addRow().addButton('开始 旁修课', `/开始二转旁修 ${view.profession.code}`, { type: 'command', autoEnter: true, style: 'blue' });
    }
    else if (study.readyAt && Date.now() < study.readyAt.getTime()) {
        const remaining = Math.max(1, Math.ceil((study.readyAt.getTime() - Date.now()) / 1000));
        markdown.addText(`导师正在讲解实战边界。还需约 ${remaining} 秒；完成后请回来交付【回响结晶】。`);
    }
    else {
        markdown.addText('旁修课已结束。交付 1 枚【回响结晶】，将这条传承收入图鉴；完成后可自行装备或替换。');
        buttons.addRow().addButton('交付 结晶并完成', `/完成二转旁修 ${view.profession.code}`, { type: 'command', autoEnter: true, style: 'blue' });
    }
    buttons.addRow().addButton('返回 导师', `/二转导师 ${mentorCode}`, { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const advancedMentorHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await message.send({ format: await advancedMentorFormat(event.current.UserId, String(route.param('code'))) });
}
catch (error) {
    await fail(message, error);
} };
const advancedProfessionDetailHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await message.send({ format: await advancedProfessionDetailFormat(event.current.UserId, String(route.param('code'))) });
}
catch (error) {
    await fail(message, error);
} };
const inheritanceStudyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    await message.send({ format: await inheritanceStudyFormat(event.current.UserId, String(route.param('code'))) });
}
catch (error) {
    await fail(message, error, '旁修传承');
} };
const advancedMentorChatHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const mentor = String(route.param('code'));
    const view = await advancedProfessionView(event.current.UserId, mentor);
    const { affinity } = await addNpcAffinity(event.current.UserId, mentor, 'chat');
    const markdown = Format.createMarkdown().addTitle(`${view.profession.mentor.title}·${view.profession.mentor.name}｜闲聊`).addNewline().addNewline().addBlockquote(mentorChatDialogue(mentor, affinity));
    const buttons = Format.createButtonGroup().addRow().addButton('继续 闲聊', `/二转闲聊 ${mentor}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton(`关于 ${view.profession.name}`, `/二转职业 ${mentor}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回', `/二转导师 ${mentor}`, { type: 'command', autoEnter: true });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
}
catch (error) {
    await fail(message, error, '闲聊失败');
} };
const acceptAdvancedProfessionHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const profession = await beginAdvancedProfession(event.current.UserId, String(route.param('code')));
    await message.send({ format: await advancedProfessionDetailFormat(event.current.UserId, profession.mentor.code) });
}
catch (error) {
    await fail(message, error);
} };
const confirmAdvancedProfessionSwitchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const profession = await beginAdvancedProfession(event.current.UserId, String(route.param('code')), true);
    await message.send({ format: await advancedProfessionDetailFormat(event.current.UserId, profession.mentor.code) });
}
catch (error) {
    await fail(message, error);
} };
const advanceAdvancedProfessionHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const profession = await advanceAdvancedProfessionStage(event.current.UserId, String(route.param('code')));
    await message.send({ format: await advancedProfessionDetailFormat(event.current.UserId, profession.mentor.code) });
}
catch (error) {
    await fail(message, error);
} };
const submitAdvancedProfessionHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const profession = await submitAdvancedProfessionProof(event.current.UserId, String(route.param('code')));
    await message.send({ format: await advancedProfessionDetailFormat(event.current.UserId, profession.mentor.code) });
}
catch (error) {
    await fail(message, error);
} };
const beginInheritanceStudyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const result = await beginInheritanceStudy(event.current.UserId, String(route.param('code')));
    await message.send({ format: await inheritanceStudyFormat(event.current.UserId, result.profession.mentor.code) });
}
catch (error) {
    await fail(message, error, '旁修传承');
} };
const completeInheritanceStudyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const result = await completeInheritanceStudy(event.current.UserId, String(route.param('code')));
    await message.send({ format: await inheritanceStudyFormat(event.current.UserId, result.profession.mentor.code) });
}
catch (error) {
    await fail(message, error, '旁修传承');
} };
const toggleInheritanceStudyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const code = String(route.param('code'));
    const enabled = String(route.param('state')) === 'on';
    const passive = await equipInheritanceStudy(event.current.UserId, code, enabled);
    const profession = advancedProfessionByCode(code);
    if (!profession || !passive)
        throw new Error('旁修传承不存在。');
    await message.send({ format: await inheritanceStudyFormat(event.current.UserId, profession.mentor.code) });
}
catch (error) {
    await fail(message, error, '旁修传承');
} };
const startAdvancedProfessionTrialHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useGameMessage(); try {
    const result = await beginAdvancedProfessionTrial(event.current.UserId, String(route.param('code')));
    await chooseTarget(event.current.UserId, result.spawnId);
    const battle = await battleStatus(event.current.UserId);
    const markdown = Format.createMarkdown().addTitle('导师试炼').addNewline().addNewline().addText(`Lv.30【${result.profession.trial.name}】在根影间摆开架势。对方已完成进化定型，佩着与自身武器精通相符的传说主副手与毕业套装；二转技与本职武器连段会随战况调整。导师的声音很平静：“让我看看，你是否真的明白这条路。”`).addNewline().addNewline().addBlockquote(`已进入战斗｜当前目标 ${battle.targets[0]?.name ?? result.profession.trial.name}。可用【战斗信息】鉴识导师当前状态。`);
    const buttons = Format.createButtonGroup().addRow().addButton('攻击', '/攻击', { type: 'command', autoEnter: true, style: 'blue' }).addButton('战斗信息', '/战斗信息', { type: 'command', autoEnter: true }).addButton('技能列表', '/技能列表', { type: 'command', autoEnter: true });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
}
catch (error) {
    await fail(message, error, '导师试炼未能开始');
} };

export { acceptAdvancedProfessionHandler, advanceAdvancedProfessionHandler, advancedMentorChatHandler, advancedMentorFormat, advancedMentorHandler, advancedProfessionDetailFormat, advancedProfessionDetailHandler, beginInheritanceStudyHandler, completeInheritanceStudyHandler, confirmAdvancedProfessionSwitchHandler, inheritanceStudyFormat, inheritanceStudyHandler, startAdvancedProfessionTrialHandler, submitAdvancedProfessionHandler, toggleInheritanceStudyHandler };
