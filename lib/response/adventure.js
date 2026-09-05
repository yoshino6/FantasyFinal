import { Format, useEvent, useMessage, logger, useRoute, MessageDirect } from 'alemonjs';
import { readFile } from 'node:fs/promises';
import { durationText } from '../game/time-format.js';
import { explore, move, adjustMovementStep, nearbyPoints, movementProfile, moveTo, moveToMap, huntMonster, coordinateInteraction, cancelTravel, travelStatus, completeTravel, mineResource, resourceMiningStatus, cancelResourceMining, chooseTarget, battleStatus, moveToNearbyMonster, queueAmbush, leaveOccupiedBattle, switchCombatTarget, encounterAction, forestGuideAdvance, forestGuideChoice, forestGuideProgress, continueForestArrival, requireNpcAtCurrentPosition, addNpcAffinity, inventory, talkToNpc, currentEncounter, blockedDungeonDirections, combatAction, forceAutoBattleDefeat, continueCombatChant, claimCombatAmbushHandoffs } from '../game/adventure.service.js';
import { isFullPartyAutoBattle, autoBattleConfig, pendingPartyAutoBattleActions } from '../game/auto-battle.service.js';
import { messageFormat } from '../game/message.js';
import { homePanel, leaveHome } from '../game/home.service.js';
import { outsidePanel, currentLocationText, panelButtons, movedLocationText } from './panel.js';
import fileUrl from '../assets/game/story/pear-guide.png.js';
import { registerAdventurer, chooseProfession, adventurerProfile } from '../game/character.service.js';
import { adventurerCardImage } from '../game/adventurer-card.service.js';
import { realmEnergyDissipationText } from '../game/constants.js';
import { currentMainQuest } from '../game/main-quest.service.js';
import { npcChatDialogue } from '../game/npc-dialogue.service.js';
import { dynamicNpcChatDialogue, dynamicNpcProfile } from '../game/dynamic-npc-dialogue.service.js';
import { mentorSuccessDialogue, advancedProfessionReveal } from '../game/advanced-profession.dialogue.js';
import { advancedProfessionByCode } from '../game/advanced-profession.config.js';
import { enterDungeon, openDungeonChest, dungeonPvP, interactDungeonPlayer, dungeonTrackingHint, changeDungeonFloor } from '../game/dungeon.service.js';
import { dungeonSecretProgress } from '../game/dungeon-quest.service.js';
import { startPvpBattle, pvpBattleStatus, selectPvpBattleOption, cityWantedAlert, pvpCombatAction, reserveWarrantEntryNotice, continuePvpChant, startAmbushPvpBattle } from '../game/pvp.service.js';
import { createFormatWithoutGroupMention } from '../middleware/group-reply-mention.js';
import { rememberGroupChannel, knownGroupChannels } from '../game/group-channel.service.js';
import { warrantNoticeFormat } from './warrant-notice.js';
import { isPublicImageUrl, gameAssetUrls } from '../config/game-assets.js';
import { omniscientTraces } from '../game/omniscient.service.js';
import { offerDynamicEncounter, recordExplorationMovement } from '../game/world-dynamics.service.js';
import { encounterFormat } from './world-dynamics.js';

const pearGuideImagePath = decodeURIComponent(fileUrl).replace(/^([a-zA-Z]):(?![\\/])/, '$1:\\');
const pearGuideImageBuffer = () => readFile(pearGuideImagePath);
const publishWantedCityEntryNotice = async (wanted) => {
    const [event] = useEvent();
    const channelId = String(event.current.ChannelId ?? '');
    const isPrivate = Boolean(event.current.IsPrivate);
    const botId = String(event.current.BotId ?? '');
    if (!isPrivate && channelId)
        await rememberGroupChannel(channelId, botId);
    const knownGroups = await knownGroupChannels(botId);
    const targets = [...new Set([...(isPrivate ? [] : [channelId]), ...knownGroups].filter(Boolean))];
    if (!targets.length)
        return;
    for (const targetId of targets) {
        try {
            if (!await reserveWarrantEntryNotice(wanted.warrantId, targetId))
                continue;
            const results = await MessageDirect.create().sendToTarget({ target: { scope: 'group', targetId, BotId: botId }, format: warrantNoticeFormat(wanted, { independent: true }) });
            if (results.some(result => result.code !== 2000))
                throw new Error(results.map(result => String(result.message)).join('；'));
        }
        catch (error) {
            logger.warn({ err: error, channelId: targetId }, '主动发送城镇通缉公告失败');
        }
    }
};
const fail = async (message, error, title = '操作失败') => message.send({ format: messageFormat(title, error instanceof Error ? error.message : '请稍后重试。') });
const storyLockedMessage = async (message, title) => message.send({
    format: messageFormat(title, '你正在推进「初章·包容之镇」，请先完成当前剧情。')
        .addButtonGroup(Format.createButtonGroup().addRow().addButton('继续剧情', '/继续剧情', { type: 'command', autoEnter: true, style: 'blue' }))
});
const isForestGuideLocked = (error) => error instanceof Error && error.message.includes('你正在推进「初章·包容之镇」');
const leaveHomeForMovement = async (message, qqUserId) => {
    if (!(await homePanel(qqUserId)).inHome)
        return;
    await leaveHome(qqUserId);
    await message.send({ format: messageFormat('百纳镇·我的家园', '你离开了家园。') });
};
const moveButtons = panelButtons;
const movementButtons = async (qqUserId, resting = false) => {
    const [config, blockedDirections] = await Promise.all([autoBattleConfig(qqUserId), blockedDungeonDirections(qqUserId)]);
    return panelButtons(resting, Boolean(config.settings.enabled), blockedDirections);
};
const battleButtons = (battle) => {
    const buttons = Format.createButtonGroup().addRow().addButton('普攻', '/攻击', { type: 'command', autoEnter: true, style: battle.canAct ? 'blue' : undefined });
    for (let slot = 1; slot <= 4; slot++)
        buttons.addButton('技能' + '①②③④'[slot - 1], '/技能 ' + slot, { type: 'command', autoEnter: true, style: battle.canAct && battle.readySkillSlots.includes(slot) ? 'blue' : undefined });
    buttons.addRow();
    if (battle.mode !== 'spar')
        for (let slot = 1; slot <= 4; slot++)
            buttons.addButton('道具' + '①②③④'[slot - 1], '/道具 ' + slot, { type: 'command', autoEnter: true, style: battle.canAct && battle.itemSlots.includes(slot) ? 'blue' : undefined });
    buttons.addButton(battle.mode === 'spar' ? '认输' : '逃跑', '/逃跑', { type: 'command', autoEnter: true });
    if (battle.mode !== 'spar' && battle.deviceSlots.length) {
        buttons.addRow();
        for (const device of battle.deviceSlots)
            buttons.addButton('异械' + '①②③④'[device.slot - 1], '/异械施放 ' + device.slot, { type: 'command', autoEnter: true, style: battle.canAct ? 'blue' : undefined });
        buttons.addButton('异械状态', '/战斗异械状态', { type: 'command', autoEnter: true });
    }
    if (battle.appraisal.learned)
        buttons.addRow().addButton('鉴识', '/鉴识', { type: 'command', autoEnter: true, style: 'blue' });
    if (battle.canEnchant) {
        buttons.addRow();
        for (const element of ['风', '雷', '火'])
            buttons.addButton('附锋·' + element, '/附锋元素 ' + element, { type: 'command', autoEnter: true, style: battle.enchantElement === element ? 'blue' : undefined });
    }
    return buttons;
};
const encounterButtons = (spawnId, canAmbush = false, occupied = false, cityPursuit = false) => {
    if (occupied)
        return Format.createButtonGroup().addRow().addButton('伏击', `/伏击 ${spawnId}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('离开', '/离开战斗', { type: 'command', autoEnter: true });
    const buttons = Format.createButtonGroup().addRow().addButton(canAmbush ? '偷袭' : '战斗', canAmbush ? `/偷袭 ${spawnId}` : `/目标 ${spawnId}`, { type: 'command', autoEnter: true, style: 'blue' });
    if (!cityPursuit)
        buttons.addButton('交涉', `/交涉 ${spawnId}`, { type: 'command', autoEnter: true });
    return buttons.addButton('躲避', `/躲避 ${spawnId}`, { type: 'command', autoEnter: true });
};
const appendBattleState = (markdown, battle) => {
    for (const [index, member] of battle.members.entries()) {
        const label = `${battle.selectedAllyId === member.id ? '▶' : ''}友方${index + 1} ${member.name}`;
        markdown.addText('> ');
        if (member.defeated)
            markdown.addText(label);
        else
            markdown.addButton(label, { data: `/切换目标 ${member.id} 友方`, autoEnter: false });
        markdown.addText(` HP ${member.hp}/${member.hpMax}｜MP ${member.mp}/${member.mpMax}${member.resource ? `｜${member.resource.name} ${member.resource.current}/${member.resource.max}` : ''}${member.defeated ? '（倒下）' : member.chanting ? `（吟唱：${member.chanting}）` : member.pending ? '（已确认）' : member.extraAction ? '（额外行动）' : ''}\n`);
        if (member.statusText)
            markdown.addBlockquote(`状态：${member.statusText}`).addNewline();
    }
    if (battle.spirits.length)
        markdown.addBlockquote(`灵兽：${battle.spirits.map(spirit => `【${spirit.name}】HP ${spirit.hp}/${spirit.hpMax}·${spirit.remainingTurns}回合`).join('｜')}`).addNewline();
    if (battle.mode !== 'spar' && battle.deviceSlots.length)
        markdown.addBlockquote(`异械：${battle.deviceSlots.map(device => `${device.deviceName} ${device.currentEnergy}/${device.maxEnergy}`).join('｜')}`).addNewline();
    markdown.addNewline();
    for (const [index, target] of battle.targets.entries()) {
        const hierarchy = target.isBossComponent ? '　└ ' : '';
        const bodyState = !target.isBossComponent && target.livingComponentCount ? `｜部位减伤 ${target.bodyDamageReductionPct}%` : '';
        const componentState = target.isBossComponent ? `｜${target.warning || target.passiveSummary}${target.breakSummary ? `｜击破：${target.breakSummary}` : ''}` : '';
        markdown.addText('> ').addButton(`${!battle.selectedAllyId && battle.selectedTargetId === target.id ? '▶' : ''}${hierarchy}敌方${index + 1} ${target.name}`, { data: `/切换目标 ${target.id}`, autoEnter: false }).addText(` HP ${target.hp}/${target.hpMax}${bodyState}${componentState}${target.defeated ? '（击败）' : ''}\n`);
        if (target.statusText)
            markdown.addBlockquote(`状态：${target.statusText}`).addNewline();
    }
    return markdown;
};
const appendCombatLog = (markdown, text) => {
    for (const raw of text.trim().split(/\r?\n/)) {
        const line = raw.replace(/^§/, '');
        if (!line.trim())
            markdown.addNewline();
        else if (/^(?:➤|　➥)/.test(line))
            markdown.addBlockquote(line).addNewline();
        else if (/^　*&[^&]+&/.test(line))
            markdown.addText(`　\u200B${line.replace(/^　*/, '').replace(/^&([^&]+)&/, '\\&$1\\&')}`).addNewline();
        else if (/^　*[#$][^#$]+[#$]/.test(line))
            markdown.addText(`　\u200B${line.replace(/^　*/, '')}`).addNewline();
        else
            markdown.addBlockquote(line).addNewline();
    }
    return markdown;
};
const battleRoundTitle = (mode, turn) => mode === 'spar' ? `切磋＜${turn}＞回合` : `战斗<${turn}>回合`;
const battleRoundHeader = /^(战斗|切磋)[<＜](\d+)[>＞]回合$/;
const battleFormat = (_title, text, battle) => {
    const lines = text.split(/\r?\n/);
    const turn = battleRoundHeader.exec(lines[0]);
    if (turn)
        lines.shift();
    const markdown = Format.createMarkdown().addTitle(battleRoundTitle(battle.mode, turn ? Number(turn[2]) : battle.turn)).addNewline().addNewline();
    if (lines.join('\n'))
        appendCombatLog(markdown, lines.join('\n')).addNewline();
    return Format.create().addMarkdown(appendBattleState(markdown, battle)).addButtonGroup(battleButtons(battle));
};
const battleOperationFormat = (text, battle) => {
    const markdown = Format.createMarkdown().addTitle(battleRoundTitle(battle.mode, battle.turn)).addNewline().addNewline();
    if (text)
        markdown.addText(text).addNewline().addNewline();
    return Format.create().addMarkdown(appendBattleState(markdown, battle)).addButtonGroup(battleButtons(battle));
};
const ambushStartFormat = (battle) => {
    const markdown = Format.createMarkdown().addTitle('战斗开始').addNewline().addNewline()
        .addBlockquote('你看准目标，疾速突进——').addNewline()
        .addBlockquote('（首回合直击伤害+50%）').addNewline().addNewline();
    return Format.create().addMarkdown(appendBattleState(markdown, battle)).addButtonGroup(battleButtons(battle));
};
const battleStartFormat = (text, battle) => {
    const markdown = Format.createMarkdown().addTitle(battle.mode === 'spar' ? battleRoundTitle(battle.mode, battle.turn) : '战斗开始').addNewline().addNewline().addBlockquote(text).addNewline().addNewline();
    return Format.create().addMarkdown(appendBattleState(markdown, battle)).addButtonGroup(battleButtons(battle));
};
const negotiationFailureFormat = (text, battle) => {
    const markdown = Format.createMarkdown().addTitle('交涉失败！').addNewline().addNewline()
        .addTitle('战斗<1>回合').addNewline().addNewline().addBlockquote(text).addNewline().addNewline();
    return Format.create().addMarkdown(appendBattleState(markdown, battle)).addButtonGroup(battleButtons(battle));
};
const battleErrorFormat = (text, battle) => {
    const markdown = Format.createMarkdown().addTitle('操作失败').addNewline().addNewline().addText(`${text}\n\n`);
    return Format.create().addMarkdown(appendBattleState(markdown, battle)).addButtonGroup(battleButtons(battle));
};
const finalBattleFormat = (log) => {
    const lines = log.split(/\r?\n/);
    const turn = battleRoundHeader.exec(lines[0]);
    const title = turn ? battleRoundTitle(turn[1] === '切磋' ? 'spar' : 'pve', Number(turn[2])) : '战斗';
    if (turn)
        lines.shift();
    const markdown = Format.createMarkdown().addTitle(title).addNewline().addNewline();
    if (lines.join('\n'))
        appendCombatLog(markdown, lines.join('\n'));
    return Format.create().addMarkdown(markdown);
};
const victoryButtons = (arrivalPending = false) => Format.createButtonGroup().addRow().addButton(arrivalPending ? '继续' : '操作面板', arrivalPending ? '/继续剧情' : '/面板', { type: 'command', autoEnter: true, style: 'blue' });
const isVictorySettlement = (value) => Boolean(value) && typeof value === 'object' && value.kind === 'victory';
const victoryFormat = (settlement) => {
    const markdown = Format.createMarkdown().addTitle('战斗胜利').addNewline().addNewline();
    for (const reward of settlement.members) {
        if (reward.staminaInsufficient) {
            markdown.addText(`【${reward.name}】\n`).addBlockquote('体力不足，本次未参与经验与战利品结算。').addNewline().addNewline();
            continue;
        }
        markdown.addText(`【${reward.name}】${reward.levelText ? ` ${reward.levelText}` : ''}\n`).addBlockquote(reward.realmLocked ? realmEnergyDissipationText : `EXP+${reward.experience}`).addNewline();
        if (reward.staminaSpent)
            markdown.addBlockquote(`体力-${reward.staminaSpent}`).addNewline();
        for (const drop of reward.drops) {
            markdown.addBlockquote('获得');
            markdown.addButton(`[${drop.name}]`, { data: drop.itemType === 'equipment' && drop.instanceId ? `/装备详情 ${drop.instanceId}` : `/物品图鉴 ${drop.codexId}`, autoEnter: false }).addText(`×${drop.quantity}`).addNewline();
        }
        for (const skill of reward.learned)
            markdown.addText('领悟').addButton(`[${skill.name}]`, { data: `/技能详情 ${skill.id}`, autoEnter: false }).addText('\n');
        markdown.addNewline();
    }
    if (settlement.members.some(reward => reward.levelText?.includes('Lv.8')))
        markdown.addText('发现新支线【职业之外的道路】\n去百纳镇的各个店铺转转，或许能找到适合自己的副职业。').addNewline();
    for (const completed of settlement.advancedProfessionCompleted ?? []) {
        const profession = advancedProfessionByCode(completed.code);
        markdown.addNewline().addText(`【${completed.name}】的二转仪式`).addNewline().addNewline().addBlockquote(mentorSuccessDialogue(completed.code) ?? `你已二转成功：${completed.profession}。`).addNewline();
        if (profession)
            markdown.addText(`【${profession.name}】职业档案已解锁`).addNewline().addBlockquote(advancedProfessionReveal(profession)).addNewline();
        markdown.addText(`技能点已重置：返还 ${completed.refundedSkillPoints} 点，当前可分配 ${completed.availableSkillPoints} 点。`).addNewline();
    }
    if (settlement.dungeonSecretCompleted)
        markdown.addText('【地下的秘密】已完成。').addNewline();
    if (settlement.pursuitCooldownMinutes)
        markdown.addText(`你击退了城镇执法者，暂时脱离追捕。${settlement.pursuitCooldownMinutes} 分钟内不会再遭到强制拦截。`).addNewline();
    return Format.create().addMarkdown(markdown);
};
const realmBarrierFormat = () => Format.create()
    .addMarkdown(Format.createMarkdown().addTitle('无形的禁锢').addNewline().addNewline()
    .addText('一股精纯的能量冲入你的体壳，然后向外四溢，化为了斑驳的光点，消散在了空中。').addNewline().addNewline()
    .addText('你感觉到身体能量已趋于饱和，无法再吸收更多。').addNewline().addNewline()
    .addText('主线变更【无形的禁锢】').addNewline()
    .addText('你决定去找专业的人来请教这件事情。').addNewline()
    .addText('先去冒险者公会里面问问吧。'))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('任务', '/任务', { type: 'command', autoEnter: true, style: 'blue' }));
const evolutionBarrierFormat = () => Format.create()
    .addMarkdown(Format.createMarkdown().addTitle('未知的枷锁').addNewline().addNewline()
    .addText('一股精纯的能量冲入你的体壳，却没有像往常一样化作成长的养分。它在体内盘桓片刻，最终悄无声息地散去。').addNewline().addNewline()
    .addText('你感觉到身体能量已趋于饱和，而眼前的门槛却比从前更加陌生。').addNewline().addNewline()
    .addText('主线已更新【未知的枷锁】').addNewline()
    .addText('去冒险者公会问问吧。'))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('任务', '/任务', { type: 'command', autoEnter: true, style: 'blue' }));
const chapterFormat = (stage, text) => {
    const markdown = Format.createMarkdown().addTitle(`初章·包容之镇（${stage}/5）`).addNewline().addNewline().addText(text);
    const buttons = Format.createButtonGroup().addRow();
    if (stage === 1)
        buttons.addButton('循声而去', '/初章 包容之镇 循声而去', { type: 'command', autoEnter: true, style: 'blue' });
    if (stage === 2)
        buttons.addButton('上前打招呼', '/初章 包容之镇 上前打招呼', { type: 'command', autoEnter: true, style: 'blue' });
    if (stage === 3)
        buttons.addButton('我也不清楚，睁开眼时就在这儿了', '/初章 包容之镇 我也不清楚，睁开眼时就在这儿了', { type: 'command', autoEnter: true, style: 'blue' });
    if (stage === 4) {
        buttons.addButton('加入', '/初章 包容之镇 加入', { type: 'command', autoEnter: true, style: 'blue' });
        buttons.addButton('婉拒并询问城镇位置', '/初章 包容之镇 婉拒并询问城镇位置', { type: 'command', autoEnter: true });
    }
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const forestGuideChapterTexts = {
    1: '你在林中听见了兵刃碰撞的声音。\n那声响被湿润的枝叶过滤得断断续续，却仍清晰地指向前方。\n是有人在附近战斗吗？',
    2: '你拨开最后一丛沾着露水的灌木，望见有三人正擦拭着武器。\n为首的青年手持剑盾，红发少女指尖还缠着未散的火星，白袍少女则正替受伤的同伴施展治愈术。\n\n他们循着动静也发现了你。',
    3: '战士把盾牌背回身后，笑着做了自我介绍。\n他叫莱昂，是一名战士；那位红发少女伊芙是法师；白袍的希娅则是牧师。\n\n他们说自己接下了讨伐森林史莱姆的悬赏，正循着痕迹搜寻。\n莱昂打量着我身上未干的露水，略显困惑：\n\n“你为什么会一个人在这种地方？”\n\n我沉默片刻，不好坦白自己转生到这里的事实。',
    4: '“我也不清楚，”\n我如此回答，\n“我今早一睁开眼，就已经在这片森林里了。”\n\n他们三人交换了一个复杂的眼神，没有继续追问。\n希娅轻声说，百纳镇就在密林南方——那是一座接纳各族居民的包容小镇，半兽人、矮人、精灵与人类都能在那里找到落脚处。\n\n莱昂朝森林深处扬了扬下巴：“我们先解决那只史莱姆。你要不要和我们一起？结束后，我们带你去百纳镇。”'
};
const townArrivalFormat = async (stage, text, completed = false, guildStory = false) => {
    if (completed)
        return null;
    const hasInlinePearImage = guildStory && stage === 1 && isPublicImageUrl(gameAssetUrls.pearGuideImageUrl);
    const markdown = Format.createMarkdown().addTitle(guildStory ? `初临·百纳镇·冒险者工会（${stage}/3）` : `初临·百纳镇（${stage}/6）`).addNewline().addNewline();
    if (hasInlinePearImage)
        markdown.addImage(gameAssetUrls.pearGuideImageUrl, { width: 320, height: 213 }).addNewline().addNewline();
    markdown.addText(text);
    const label = guildStory ? '继续' : stage === 4 ? '你说什么？勇者是什么意思？' : stage === 6 ? '挥手告别' : '继续';
    if (hasInlinePearImage) {
        markdown.addNewline().addNewline().addButton(`[${label}]`, { data: '/继续剧情', autoEnter: false });
        return Format.create().addMarkdown(markdown);
    }
    return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton(label, '/继续剧情', { type: 'command', autoEnter: true, style: 'blue' }));
};
const buildingEncounterFormat = (name, code, location) => {
    const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(location).addNewline().addNewline().addText(name);
    const buttons = Format.createButtonGroup().addRow().addButton(code === 'hunter_lodge' ? '敲门' : '进入', `/建筑进入 ${code}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('忽略', `/建筑忽略 ${code}`, { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const simpleNpcName = (name) => name.replace(/（[^）]*）/g, '').trim();
const npcInteractionFormat = async (qqUserId, npc, text, continuingChat = false) => {
    const nearby = await nearbyPoints(qqUserId);
    const name = simpleNpcName(npc.name);
    const markdown = Format.createMarkdown().addTitle(name).addNewline().addNewline().addText(`【${name}】`);
    if (nearby.npcDetailsUnlocked)
        markdown.addText(' ').addButton('[详情]', { data: `/域民详情 ${npc.code}`, autoEnter: false });
    markdown.addNewline().addNewline().addBlockquote(text);
    if (continuingChat)
        return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('切磋', `/切磋 ${npc.code}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('继续闲聊', npc.code === 'pear_guide' ? '/梨子喵闲聊' : `/NPC对话 ${npc.code}`, { type: 'command', autoEnter: true, style: 'blue' }));
    const buttons = Format.createButtonGroup().addRow();
    buttons.addButton('切磋', `/切磋 ${npc.code}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('离开', `/NPC离开 ${npc.code}`, { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const unimplementedBuildingFormat = (building) => Format.create()
    .addMarkdown(Format.createMarkdown().addTitle(building.name).addNewline().addNewline().addBlockquote(building.description))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('离开', `/建筑离开 ${building.code}`, { type: 'command', autoEnter: true }));
const travelFormat = (title, regionName, x, y, total, remaining, activityType = 'move', destinationName) => {
    const hunting = activityType === 'hunt';
    return Format.create()
        .addMarkdown(Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(`${hunting ? title : `${title}${regionName}${destinationName ? `·${destinationName}` : ''}（${x}, ${y}）`}\n预计耗时${durationText(total)}\n当前剩余${durationText(remaining)}`))
        .addButtonGroup(Format.createButtonGroup().addRow().addButton('刷新', '/刷新行动', { type: 'command', autoEnter: true, style: 'blue' }).addButton(hunting ? '取消寻怪' : '取消移动', hunting ? '/取消寻怪' : '/取消移动', { type: 'command', autoEnter: true, style: 'blue' }));
};
const travelBlockedFormat = (title, travel) => {
    const hunting = travel.activityType === 'hunt';
    const destination = `${travel.regionName}${travel.destinationName ? `·${travel.destinationName}` : ''}（${travel.x}, ${travel.y}）`;
    const detail = hunting
        ? `你正在寻怪，目标为${destination}，请等待抵达或取消寻怪。`
        : `你正在前往${destination}，请等待抵达或取消移动。`;
    return Format.create()
        .addMarkdown(Format.createMarkdown().addTitle(title).addNewline().addNewline().addText(detail).addNewline().addText(`预计耗时${durationText(travel.seconds)}`).addNewline().addText(`当前剩余${durationText(travel.remaining)}`))
        .addButtonGroup(Format.createButtonGroup().addRow().addButton('刷新', '/刷新行动', { type: 'command', autoEnter: true, style: 'blue' }).addButton(hunting ? '取消寻怪' : '取消移动', hunting ? '/取消寻怪' : '/取消移动', { type: 'command', autoEnter: true, style: 'blue' }));
};
const showTravelBlocked = async (message, qqUserId, title) => {
    const travel = await travelStatus(qqUserId);
    if (!travel || travel.remaining <= 0)
        return false;
    await message.send({ format: travelBlockedFormat(title, travel) });
    return true;
};
const showMiningBlocked = async (message, qqUserId, title) => {
    const mining = await resourceMiningStatus(qqUserId);
    if (!mining)
        return false;
    const markdown = Format.createMarkdown().addTitle(title).addNewline().addNewline()
        .addText('你正在开采').addNewline().addBlockquote(`【${mining.kind === '植被' ? '植被' : '锻材'}】${mining.name}`).addNewline()
        .addText(`预计耗时${durationText(mining.seconds)}`).addNewline().addText(`当前剩余${durationText(mining.remaining)}`);
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('刷新开采', '/刷新开采', { type: 'command', autoEnter: true, style: 'blue' }).addButton('取消开采', '/取消开采', { type: 'command', autoEnter: true, style: 'blue' })) });
    return true;
};
const showOngoingActivity = async (message, qqUserId, title) => (await showTravelBlocked(message, qqUserId, title)) || showMiningBlocked(message, qqUserId, title);
const travelTimers = new Map();
const travelReplyTimers = new Set();
const PASSIVE_TRAVEL_REPLY_RETRY_DELAYS = [2, 5, 10, 20];
const scheduleCompletedTravelReply = (message, qqUserId, result, attempt = 0) => {
    const delay = PASSIVE_TRAVEL_REPLY_RETRY_DELAYS[attempt];
    if (delay === undefined) {
        logger.warn({ qqUserId }, '到达结果的被动回复多次失败，已停止重试');
        return;
    }
    let timer;
    timer = setTimeout(async () => {
        try {
            await showMoveResult(message, qqUserId, result);
        }
        catch (error) {
            logger.warn({ err: error, qqUserId, attempt: attempt + 1 }, '到达结果被动回复失败，准备重试');
            scheduleCompletedTravelReply(message, qqUserId, result, attempt + 1);
        }
        finally {
            travelReplyTimers.delete(timer);
        }
    }, delay * 1000);
    travelReplyTimers.add(timer);
};
const scheduleTravelCompletion = (message, qqUserId, seconds) => {
    const previous = travelTimers.get(qqUserId);
    if (previous)
        clearTimeout(previous);
    let retrySeconds = null;
    let timer;
    timer = setTimeout(async () => {
        try {
            const result = await completeTravel(qqUserId);
            if (result) {
                try {
                    await showMoveResult(message, qqUserId, result);
                }
                catch (error) {
                    logger.warn({ err: error, qqUserId }, '到达结果被动回复失败，准备重试');
                    scheduleCompletedTravelReply(message, qqUserId, result);
                }
                return;
            }
            const travel = await travelStatus(qqUserId);
            if (travel)
                retrySeconds = Math.max(1, travel.remaining) + 1;
        }
        catch (error) {
            logger.warn({ err: error, qqUserId }, 'complete travel failed');
            try {
                const travel = await travelStatus(qqUserId);
                if (travel)
                    retrySeconds = Math.max(1, travel.remaining) + 1;
            }
            catch { }
        }
        finally {
            if (travelTimers.get(qqUserId) === timer)
                travelTimers.delete(qqUserId);
            if (retrySeconds !== null)
                scheduleTravelCompletion(message, qqUserId, retrySeconds);
        }
    }, (Math.max(1, seconds) * 1000) + 250);
    travelTimers.set(qqUserId, timer);
};
const autoBattleTimers = new Map();
const autoBattleVisibleRounds = new Map();
const AUTO_BATTLE_VISIBLE_ROUND_LIMIT = 1;
const stopAutoBattle = (qqUserId) => {
    const timer = autoBattleTimers.get(qqUserId);
    if (timer)
        clearTimeout(timer);
    autoBattleTimers.delete(qqUserId);
    autoBattleVisibleRounds.delete(qqUserId);
};
const storyNpcBattleTimers = new Map();
const scheduleStoryNpcBattle = (message, qqUserId) => {
    if (storyNpcBattleTimers.has(qqUserId))
        return;
    const timer = setTimeout(async () => {
        storyNpcBattleTimers.delete(qqUserId);
        try {
            const battle = await battleStatus(qqUserId);
            if (battle.canAct)
                return;
            const result = await combatAction(qqUserId, 'attack');
            await sendCombatResult(message, qqUserId, result);
            if (!result.ended && !result.waiting)
                scheduleStoryNpcBattle(message, qqUserId);
        }
        catch (error) {
            if (!(error instanceof Error) || !/(当前不在战斗中|你已失去行动能力)/.test(error.message))
                logger.warn({ err: error, qqUserId }, 'story npc battle advance failed');
        }
    }, 1000);
    storyNpcBattleTimers.set(qqUserId, timer);
};
const sendCombatResult = async (message, qqUserId, result, options = {}) => {
    if (result.ended) {
        if (!options.omitFinalLog)
            await message.send({ format: finalBattleFormat(result.log) });
        const settlement = result.settlement;
        const victory = isVictorySettlement(settlement);
        const format = victory
            ? victoryFormat(settlement)
            : Format.create().addMarkdown(Format.createMarkdown().addTitle('战斗结算').addNewline().addNewline().addText(settlement ?? '战斗结束。'));
        const nearby = victory ? undefined : await nearbyPoints(qqUserId);
        const buttons = victory
            ? victoryButtons(settlement.arrivalPending)
            : panelButtons(nearby?.character.activity_status !== 'active').addRow().addButton('技能列表', '/技能列表', { type: 'command', autoEnter: true, style: 'blue' });
        await message.send({ format: format.addButtonGroup(buttons) });
        if (victory && settlement.members.some(member => member.realmCapReached && member.realmStage === 1))
            await message.send({ format: realmBarrierFormat() });
        if (victory && settlement.members.some(member => member.realmCapReached && member.realmStage === 2)) {
            const mainQuest = await currentMainQuest(qqUserId);
            if (mainQuest.title === '【主线·未知的枷锁】')
                await message.send({ format: evolutionBarrierFormat() });
        }
        if (victory && settlement.goblinKingCompleted) {
            const story = Format.createMarkdown().addTitle('主线·少女获救').addNewline().addNewline()
                .addText('哥布林国王倒下后，原本凶悍的大军像忽然失去了脊梁，嘶叫着退入密林。浅红色幼龙拖着伤躯远去，只留下被踩碎的旗帜与尚未散尽的雷鸣。梨子喵扶着短刃站起身，发间缺失的鱼骨头发卡终于被她从泥里拾回。').addNewline().addNewline()
                .addText('她把发卡别回耳边，沉默了好一会儿，才轻声开口。\n\n“那天我本来只是进森林打猎喵。可我在一处废营地里看见了少女留下的布片和脚印，旁边还有哥布林拖拽过的痕迹……我就一路跟了上来。”\n\n她望向哥布林逃散的方向，握着短刃的手仍微微发颤。\n\n“我在部落里看见了那些木笼，才知道失踪的少女都被关在里面。守卫少的时候，我本来想把人带走；可我杀了几个拦路的哥布林，警报就响了。它们把我当成入侵者，越聚越多，我一个人根本撑不住，最后只能藏进断木后面。要不是你赶来，我可能还会被困在这里喵。”').addNewline().addNewline()
                .addText('梨子喵忽然抬起头，指向逃兵消失的方向。\n\n“它们把人藏在部落里面！国王一倒，守卫也散了。跟我来喵！”\n\n她带着我穿过被遗弃的营火与歪斜木栅，来到部落深处的几间木笼前。笼门被一一劈开，失踪的少女们终于重见天光；有人相拥而泣，有人仍攥着同伴的手，却都还活着。\n\n直到最后一人走出阴影，我才真正松开握紧的武器。\n\n我与梨子喵领着她们踏上归路。远处的百纳镇灯火微明，终于有人能等到失而复得的家人。');
            await message.send({ format: Format.create().addMarkdown(story).addButtonGroup(Format.createButtonGroup().addRow().addButton('前往 梨子喵', '/前往 -22 -196', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) });
        }
        if (victory && settlement.evolutionCompleted) {
            const story = Format.createMarkdown().addTitle('大学者·噶').addNewline().addNewline()
                .addText('『噶』\n\n“做得不错。我感受到了你坚定的信念。”\n\n她收起深蓝色的法杖，呼吸仍有些不稳。沉默片刻后，她从桌旁取出一个陈旧的木盒，双手递到你面前。\n\n“来，拿上这个——”\n\n木盒开启的瞬间，一颗金色圆珠在绒布上泛起柔和光泽，仿佛正随着你的心跳轻轻搏动。\n\n“这是开启进化的种子。感悟它之后，你会真正踏进那扇门；但从那一刻起，每一次成长都不再只是积累力量。”\n\n她抬眼望向研究室外层层延展的世界树枝冠。\n\n“你的种子会在每一个新的等级尽头形成生长结。届时，世界树上会有一扇门回应你——那是我留在这里的稳定研究室。你可以在那里查看自身的变化，整理观察记录，接受委托、收集材料，并选择一支针剂决定下一步如何生长。”\n\n“保守一些，身体会更容易维持平衡；激进一些，也许能看见从未有过的表型。无论选择哪一条路，结果都会留下记录，而不是由谁替你决定。”\n\n她将木盒向前推了半寸，声音低了下来。\n\n“去感悟它吧。等你准备面对下一道生长结时，再来找我。”\n\n“不过记住——一旦踏上这条路，就再也无法回头。”').addNewline().addNewline()
                .addText('————————————').addNewline().addNewline().addText('获得【进化之种】');
            await message.send({ format: Format.create().addMarkdown(story).addButtonGroup(Format.createButtonGroup().addRow().addButton('打开 背包', '/背包 道具', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) });
        }
        const ambushSessionId = 'ambushSessionId' in result ? result.ambushSessionId : undefined;
        if (ambushSessionId)
            await dispatchCombatAmbushHandoffs(ambushSessionId);
        return;
    }
    const battle = await battleStatus(qqUserId);
    await message.send({ format: battleFormat(result.waiting ? '行动已确认' : '战斗回合', result.log, battle) });
    const continued = await continueCombatChant(qqUserId);
    if (continued) {
        await sendCombatResult(message, qqUserId, continued);
        return;
    }
    if (!result.waiting && !battle.canAct && battle.mode !== 'spar')
        scheduleStoryNpcBattle(message, qqUserId);
};
const resolvePartyAutoBattleActions = async (qqUserId) => {
    let latest = null;
    for (let count = 0; count < 32; count++) {
        const chanting = await continueCombatChant(qqUserId);
        if (!chanting)
            break;
        latest = chanting;
        if (chanting.ended || !chanting.waiting)
            return chanting;
    }
    for (const entry of await pendingPartyAutoBattleActions(qqUserId)) {
        try {
            if (entry.targetId)
                await switchCombatTarget(entry.qqUserId, entry.targetId);
            latest = await combatAction(entry.qqUserId, entry.action.type, undefined, entry.action.type === 'skill' ? entry.action.skillId : undefined, entry.action.type === 'item' ? entry.action.itemId : undefined);
        }
        catch (error) {
            if (!(error instanceof Error) || entry.action.type === 'attack')
                throw error;
            latest = await combatAction(entry.qqUserId, 'attack');
        }
        if (latest.ended || !latest.waiting)
            return latest;
    }
    return latest;
};
const resolveRemainingAutoBattle = async (qqUserId) => {
    for (let round = 0; round < 200; round += 1) {
        const result = await resolvePartyAutoBattleActions(qqUserId);
        if (!result || result.ended || result.waiting)
            return result;
    }
    return null;
};
const resolveFullAutoBattle = async (qqUserId) => {
    const logs = [];
    for (let round = 0; round < 100; round += 1) {
        const result = await resolvePartyAutoBattleActions(qqUserId);
        if (!result)
            return { result: null, log: logs.join('\n\n') };
        if (result.log)
            logs.push(result.log);
        if (result.ended || result.waiting)
            return { result, log: logs.join('\n\n') };
        if ((round + 1) % 10 === 0)
            await new Promise(resolve => setImmediate(resolve));
    }
    const exhausted = await forceAutoBattleDefeat(qqUserId);
    logs.push(exhausted.log);
    return { result: exhausted, log: logs.join('\n\n') };
};
const fullAutoBattleFormat = (log) => Format.create().addMarkdown(Format.createMarkdown().addTitle('自动战斗过程').addNewline().addNewline().addCode(log.trim(), { language: 'text' }));
const scheduleAutoBattle = (message, qqUserId, omitted = false) => {
    if (!omitted) {
        stopAutoBattle(qqUserId);
        autoBattleVisibleRounds.set(qqUserId, 0);
    }
    const advance = () => {
        autoBattleTimers.set(qqUserId, setTimeout(async () => {
            try {
                const result = await resolvePartyAutoBattleActions(qqUserId);
                if (!result) {
                    stopAutoBattle(qqUserId);
                    return;
                }
                const visibleRounds = autoBattleVisibleRounds.get(qqUserId) ?? 0;
                if (!omitted && !result.ended && !result.waiting && visibleRounds >= AUTO_BATTLE_VISIBLE_ROUND_LIMIT) {
                    await message.send({ format: messageFormat('战斗过长，已省略', '后续回合战斗已省略，正在计算战斗结果。') });
                    const finalResult = await resolveRemainingAutoBattle(qqUserId);
                    if (finalResult?.ended)
                        await sendCombatResult(message, qqUserId, finalResult, { omitFinalLog: true });
                    else if (finalResult && !finalResult.waiting)
                        scheduleAutoBattle(message, qqUserId, true);
                    else
                        stopAutoBattle(qqUserId);
                    return;
                }
                await sendCombatResult(message, qqUserId, result, { omitFinalLog: omitted && result.ended });
                if (!omitted && !result.ended && !result.waiting)
                    autoBattleVisibleRounds.set(qqUserId, visibleRounds + 1);
                if (result.ended || result.waiting) {
                    stopAutoBattle(qqUserId);
                    return;
                }
                advance();
            }
            catch (error) {
                if (!(error instanceof Error) || !/(当前不在战斗中|本回合行动已确认|你已失去行动能力)/.test(error.message))
                    logger.warn({ err: error, qqUserId }, 'auto battle advance failed');
                stopAutoBattle(qqUserId);
            }
        }, 1000));
    };
    advance();
};
const startAutoBattle = async (message, qqUserId, openingText = '') => {
    if (await isFullPartyAutoBattle(qqUserId)) {
        const full = await resolveFullAutoBattle(qqUserId);
        const fullLog = [openingText, full.log].filter(Boolean).join('\n\n');
        if (fullLog)
            await message.send({ format: fullAutoBattleFormat(fullLog) });
        if (full.result?.ended)
            await sendCombatResult(message, qqUserId, full.result, { omitFinalLog: true });
        else if (full.result && !full.result.waiting)
            scheduleAutoBattle(message, qqUserId, true);
        return Boolean(full.result);
    }
    const result = await resolvePartyAutoBattleActions(qqUserId);
    if (!result)
        return false;
    await sendCombatResult(message, qqUserId, result);
    if (!result.ended && !result.waiting)
        scheduleAutoBattle(message, qqUserId);
    return true;
};
const resolveAutoHuntEncounter = async (message, qqUserId, result) => {
    if (result.arrivalActivity !== 'hunt' || result.kind !== 'encounter' || result.occupied || !result.spawns?.length)
        return false;
    const config = await autoBattleConfig(qqUserId, 'pve');
    if (!Number(config.settings.enabled))
        return false;
    const spawnId = Number(result.spawns[0].id);
    if (!Number.isInteger(spawnId) || spawnId <= 0)
        return false;
    if (config.settings.default_encounter_action === 'persuade' && !result.cityPursuit) {
        const text = await encounterAction(qqUserId, spawnId, 'persuade');
        const failed = text.startsWith('交涉失败！');
        if (!failed) {
            await message.send({
                format: messageFormat('自动交涉', text).addButtonGroup(Format.createButtonGroup().addRow().addButton('操作面板', '/面板', { type: 'command', autoEnter: true, style: 'blue' }))
            });
            return true;
        }
        const battle = await battleStatus(qqUserId);
        if (await isFullPartyAutoBattle(qqUserId)) {
            await startAutoBattle(message, qqUserId, `自动选择交涉。\n${text}`);
            return true;
        }
        await message.send({ format: negotiationFailureFormat(text, battle) });
        await startAutoBattle(message, qqUserId);
        return true;
    }
    await chooseTarget(qqUserId, spawnId);
    const battle = await battleStatus(qqUserId);
    const opening = `自动选择战斗，锁定 ${battle.targets.map(target => `【${target.name}】`).join('、')}。`;
    if (await isFullPartyAutoBattle(qqUserId)) {
        await startAutoBattle(message, qqUserId, opening);
        return true;
    }
    await message.send({ format: battleStartFormat(opening, battle) });
    await startAutoBattle(message, qqUserId);
    return true;
};
const PVP_AUTO_BATTLE_ROUND_LIMIT = 100;
const stopPvpAutoBattle = (_qqUserId) => undefined;
const sendPvpCombatResult = async (message, qqUserId, result, options = {}) => {
    if (result.ended) {
        if (!options.omitFinalLog)
            await message.send({ format: finalBattleFormat(result.log) });
        const title = result.winnerId === null ? '战斗结束' : Number(result.winnerId) === Number(result.requesterId) ? '战斗胜利' : '战斗失败';
        const markdown = Format.createMarkdown().addTitle(title).addNewline().addNewline();
        if (result.winnerName)
            markdown.addText(`【${result.winnerName}】\n`);
        markdown.addBlockquote(result.settlement || '玩家对战结束。');
        if (result.restitutionId)
            markdown.addNewline().addButton('[详情]', { data: `/失物返还详情 ${result.restitutionId}`, autoEnter: false });
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('操作面板', '/面板', { type: 'command', autoEnter: true, style: 'blue' })) });
        const ambushSpawnId = 'ambushSpawnId' in result ? result.ambushSpawnId : undefined;
        const ambushDelivery = 'ambushDelivery' in result ? result.ambushDelivery : undefined;
        if (ambushSpawnId && ambushDelivery?.targetId && Number(result.winnerId) === Number(result.requesterId)) {
            await continueAmbushBossBattle(qqUserId, ambushSpawnId, ambushDelivery);
        }
        return;
    }
    const battle = await pvpBattleStatus(qqUserId);
    await message.send({ format: battleFormat('玩家对战', result.log, battle) });
    const continued = await continuePvpChant(qqUserId);
    if (continued)
        await sendPvpCombatResult(message, qqUserId, continued);
};
const startPvpAutoBattle = async (message, qqUserId) => {
    const config = await autoBattleConfig(qqUserId, 'pvp');
    if (!config.settings.enabled)
        return;
    const logs = [];
    let result = null;
    for (let round = 0; round < PVP_AUTO_BATTLE_ROUND_LIMIT; round += 1) {
        result = await pvpCombatAction(qqUserId, 'auto');
        if (result.log)
            logs.push(result.log);
        if (result.ended)
            break;
        if ((round + 1) % 10 === 0)
            await new Promise(resolve => setImmediate(resolve));
    }
    if (result && !result.ended) {
        const stopped = await pvpCombatAction(qqUserId, 'escape');
        logs.push('自动战斗超过 100 回合，系统已中止本场对战。', stopped.log);
        result = stopped;
    }
    if (!result)
        return;
    const log = logs.join('\n\n');
    if (log)
        await message.send({ format: fullAutoBattleFormat(log) });
    if (result.ended)
        await sendPvpCombatResult(message, qqUserId, result, { omitFinalLog: true });
};
const sendAmbushDirect = async (handoff, format, mention = false) => {
    const target = { scope: handoff.delivery.scope, targetId: handoff.delivery.targetId, BotId: handoff.delivery.botId };
    if (mention && handoff.delivery.scope === 'group') {
        const text = handoff.kind === 'party' ? 'BOSS 已被击败，已为你开启对残血玩家的伏击。' : '前一支队伍已倒下，已为你接管残血的 BOSS。';
        const notice = createFormatWithoutGroupMention().addMention(handoff.ambusherQqUserId).addText('\n').addMarkdown(Format.createMarkdown().addTitle('伏击接管').addNewline().addNewline().addText(text));
        await MessageDirect.create().sendToTarget({ target, format: notice });
    }
    await MessageDirect.create().sendToTarget({ target, format });
};
const directAmbushMessenger = (handoff) => ({
    send: async ({ format }) => sendAmbushDirect(handoff, format)
});
const continueAmbushBossBattle = async (qqUserId, spawnId, delivery) => {
    const handoff = { kind: 'boss', spawnId, ambusherCharacterId: 0, ambusherQqUserId: qqUserId, delivery };
    const messenger = directAmbushMessenger(handoff);
    try {
        await chooseTarget(qqUserId, spawnId);
        const battle = await battleStatus(qqUserId);
        await sendAmbushDirect(handoff, battleStartFormat('伏击目标已倒下。你没有停步，转身继续挑战残血的 BOSS！', battle), delivery.scope === 'group');
        await startAutoBattle(messenger, qqUserId);
    }
    catch (error) {
        await sendAmbushDirect(handoff, messageFormat('伏击接管失败', error instanceof Error ? error.message : '残血 BOSS 已无法接管。'), delivery.scope === 'group');
    }
};
const dispatchCombatAmbushHandoffs = async (sessionId) => {
    const handoffs = await claimCombatAmbushHandoffs(sessionId);
    for (const handoff of handoffs) {
        const messenger = directAmbushMessenger(handoff);
        try {
            if (handoff.kind === 'party') {
                if (!handoff.opponentCharacterId)
                    throw new Error('残血玩家已经离开战场。');
                const started = await startAmbushPvpBattle(handoff.ambusherCharacterId, handoff.opponentCharacterId, handoff.spawnId, handoff.delivery);
                const battle = await pvpBattleStatus(handoff.ambusherQqUserId);
                await sendAmbushDirect(handoff, battleStartFormat(`BOSS 已被击败。你趁【${started.target}】尚未恢复，发动了伏击！`, battle), handoff.delivery.scope === 'group');
                await startPvpAutoBattle(messenger, handoff.ambusherQqUserId);
            }
            else {
                await chooseTarget(handoff.ambusherQqUserId, handoff.spawnId);
                const battle = await battleStatus(handoff.ambusherQqUserId);
                await sendAmbushDirect(handoff, battleStartFormat('前一支队伍已倒下。你切入战场，接管了残血的 BOSS！', battle), handoff.delivery.scope === 'group');
                await startAutoBattle(messenger, handoff.ambusherQqUserId);
            }
        }
        catch (error) {
            logger.warn({ err: error, handoff }, 'ambush handoff failed');
            await sendAmbushDirect(handoff, messageFormat('伏击接管失败', error instanceof Error ? error.message : '战场局势已变化，无法接管伏击。'), handoff.delivery.scope === 'group');
        }
    }
};
const guildInteriorFormat = (area = '大厅') => {
    const hour = new Date().getHours();
    const scene = hour < 11
        ? '晨光透过高窗落在木制地板上，工作人员正精神饱满地整理委托。早到的冒险者围着热茶交流昨夜的见闻，整座公会洋溢着新一天的期待。'
        : hour < 18
            ? '明亮的日光照进宽敞大厅，归来的队伍带着笑意结算报酬，新出发的冒险者在公告板前讨论路线。每个人都在为自己的目标努力。'
            : '暖黄的魔石灯逐一点亮，忙碌了一天的冒险者在集结区分享收获。前台仍耐心接待每一位来客，工会在夜色里依旧温暖而可靠。';
    const markdown = Format.createMarkdown().addTitle('百纳镇·冒险者公会').addNewline().addNewline().addBlockquote(area === '大厅' ? scene : `你来到冒险者公会的${area}。${scene}`);
    const buttons = Format.createButtonGroup()
        .addRow().addButton('前往 前台', '/建筑区域 guild_counter 前台', { type: 'command', autoEnter: true, style: 'blue' }).addButton('前往 集结区', '/建筑区域 guild_counter 集结区', { type: 'command', autoEnter: true, style: 'blue' })
        .addRow().addButton('前往 悬赏板', '/建筑区域 guild_counter 悬赏板', { type: 'command', autoEnter: true, style: 'blue' }).addButton('前往 委托板', '/建筑区域 guild_counter 委托板', { type: 'command', autoEnter: true, style: 'blue' })
        .addRow().addButton('前往 餐厅', '/建筑区域 guild_counter 餐厅', { type: 'command', autoEnter: true, style: 'blue' }).addButton('前往 工会商店', '/建筑区域 guild_counter 工会商店', { type: 'command', autoEnter: true, style: 'blue' })
        .addRow().addButton('离开 冒险者公会', '/建筑离开 guild_counter', { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const professionDetails = {
    warrior: { name: '战士', blessing: '体质成长+1.2，力量成长+1.2', skills: [{ name: '长剑精通', description: '（被动）装备长剑类武器时，暴击提高40%至80%。副手效果由50%随专精提升至100%。' }, { name: '盾牌精通', description: '（被动）装备盾牌类武器时，暴免、暴抗各提高20%至40%。副手效果由50%随专精提升至100%。' }] },
    mage: { name: '法师', blessing: '精神成长+1.2，智力成长+1.2', skills: [{ name: '法杖精通', description: '（被动）装备法杖类武器时，暴伤提高40%至80%。副手效果由50%随专精提升至100%。' }, { name: '法书精通', description: '（被动）装备法书类武器时，吟唱速度提高40%至80%。副手效果由50%随专精提升至100%。' }] },
    priest: { name: '牧师', blessing: '体质成长+1.2，精神成长+1.2', skills: [{ name: '法书精通', description: '（被动）装备法书类武器时，吟唱速度提高40%至80%。副手效果由50%随专精提升至100%。' }, { name: '法球精通', description: '（被动）装备法球类武器时，魔力上限提高40%至80%。副手效果由50%随专精提升至100%。' }] },
    rogue: { name: '盗贼', blessing: '敏捷成长+1.2，感知成长+1.2', skills: [{ name: '匕首精通', description: '（被动）装备匕首类武器时，命中提高40%至80%。副手效果由50%随专精提升至100%。' }, { name: '拳刃精通', description: '（被动）装备拳刃类武器时，暴击、暴伤各提高20%至40%。副手效果由50%随专精提升至100%。' }] }
};
const professionCodeByName = { 战士: 'warrior', 法师: 'mage', 盗贼: 'rogue', 牧师: 'priest' };
const timeGreeting = (morning, afternoon, evening) => {
    const hour = new Date().getHours();
    return hour < 11 ? morning : hour < 18 ? afternoon : evening;
};
const guildFrontDeskFormat = async (qqUserId, text, continuingChat = false) => {
    const [profile, mainQuest, nearby, dungeonSecret] = await Promise.all([adventurerProfile(qqUserId), currentMainQuest(qqUserId), nearbyPoints(qqUserId), dungeonSecretProgress(qqUserId)]);
    const introduction = text ?? timeGreeting(profile.adventurer_registered
        ? '晨间的公会刚刚热闹起来。莫妮卡站在整洁的前台后核对账册，黑色短发利落地贴着耳侧。\n“早上好，冒险者。新的一天，也请平安归来。”'
        : '清晨的阳光落在前台上。莫妮卡整理好登记册，向你露出明朗而专业的笑容。\n“早上好，欢迎来到百纳镇冒险者公会。我是接待员莫妮卡。”', profile.adventurer_registered
        ? '明亮的日光照着前台，莫妮卡一边核对归来的队伍的账册，一边抬头向你微笑。\n“欢迎回来，冒险者。无论是委托、晋升还是旅途中的疑问，我都会尽力协助。”'
        : '前台小姐姐莫妮卡站在整洁的柜台后。她有一头干练的黑色短发，笑容阳光，举止从容而专业。\n“您好，欢迎来到百纳镇冒险者公会。我是接待员莫妮卡，很高兴为您服务。”', profile.adventurer_registered
        ? '魔石灯为前台镀上一层暖光。莫妮卡合上一本账册，仍精神十足地朝你点头。\n“晚上好，冒险者。先歇一歇，或者告诉我今晚需要什么帮助。”'
        : '夜色渐深，前台的魔石灯却依然明亮。莫妮卡停下笔，温和地向你致意。\n“晚上好，欢迎来到百纳镇冒险者公会。我是接待员莫妮卡。”');
    const markdown = Format.createMarkdown().addTitle('冒险者公会·前台').addNewline().addNewline().addText('【莫妮卡】');
    if (nearby.npcDetailsUnlocked)
        markdown.addText(' ').addButton('[详情]', { data: '/域民详情 guild_counter', autoEnter: false });
    markdown.addNewline().addNewline();
    markdown.addBlockquote(introduction);
    if (continuingChat)
        return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('继续闲聊', '/前台闲聊', { type: 'command', autoEnter: true, style: 'blue' }));
    const buttons = Format.createButtonGroup().addRow().addButton(profile.adventurer_registered ? '冒险者 晋升' : '冒险者 注册', '/公会注册', { type: 'command', autoEnter: true, style: 'blue' });
    buttons.addButton('职业选择', '/职业选择', { type: 'command', autoEnter: true, style: profile.adventurer_registered ? 'blue' : undefined });
    buttons.addRow().addButton('切磋 莫妮卡', '/切磋 guild_counter', { type: 'command', autoEnter: true, style: 'blue' }).addButton('闲聊 莫妮卡', '/前台闲聊', { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回公会大厅', '/建筑进入 guild_counter', { type: 'command', autoEnter: true });
    if (mainQuest.title === '【主线·无形的禁锢】')
        buttons.addRow().addButton('关于 无形的禁锢', '/关于无形的禁锢', { type: 'command', autoEnter: true, style: 'blue' });
    if (mainQuest.title === '【主线·未知的枷锁】')
        buttons.addRow().addButton('询问 等级停滞', '/询问等级停滞', { type: 'command', autoEnter: true, style: 'blue' });
    if (mainQuest.title === '【主线·失踪的少女】' && mainQuest.description.startsWith('最近哥布林'))
        buttons.addRow().addButton('了解 少女失踪事件', '/关于深处的阴谋', { type: 'command', autoEnter: true, style: 'blue' });
    if (dungeonSecret.stage === 1)
        buttons.addRow().addButton('关于 地下的秘密', '/询问地下的秘密', { type: 'command', autoEnter: true, style: 'blue' });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const professionSelectFormat = async (qqUserId) => {
    const profile = await adventurerProfile(qqUserId);
    if (!profile.adventurer_registered)
        throw new Error('完成冒险者注册后才能选择职业。');
    const affinity = profile.level >= 8 ? '综合素质' : '当前的潜力';
    const markdown = Format.createMarkdown().addTitle('职业选择').addNewline().addNewline().addBlockquote(`“我看你${affinity}不错，适合选择自己最喜欢的道路哦~”`).addNewline().addBlockquote('莫妮卡一脸正经，“不过终究还是看你的喜好。后天的努力比先天更重要！”');
    const buttons = Format.createButtonGroup().addRow().addButton('查看 战士', '/职业查看 战士', { type: 'command', autoEnter: true, style: 'blue' }).addButton('查看 法师', '/职业查看 法师', { type: 'command', autoEnter: true, style: 'blue' })
        .addRow().addButton('查看 盗贼', '/职业查看 盗贼', { type: 'command', autoEnter: true, style: 'blue' }).addButton('查看 牧师', '/职业查看 牧师', { type: 'command', autoEnter: true, style: 'blue' })
        .addRow().addButton('返回前台', '/建筑区域 guild_counter 前台', { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const professionDetailFormat = async (qqUserId, name) => {
    const profile = await adventurerProfile(qqUserId);
    const code = professionCodeByName[name];
    const detail = professionDetails[code];
    if (!detail)
        throw new Error('未知职业。');
    const markdown = Format.createMarkdown().addTitle(`职业·${detail.name}`).addNewline().addNewline().addText(`①职业赐福：${detail.blessing}\n②职业技能：\n`);
    detail.skills.forEach(skill => markdown.addText(`【${skill.name}】\n`).addBlockquote(skill.description).addNewline().addNewline());
    const buttons = Format.createButtonGroup().addRow();
    if (!profile.profession_code)
        buttons.addButton(`选择 ${detail.name}`, `/选择职业 ${detail.name}`, { type: 'command', autoEnter: true, style: 'blue' });
    buttons.addButton('返回职业选择', '/职业选择', { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const exploreHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    const result = await explore(event.current.UserId);
    if (!result.spawns.length) {
        const encounter = await offerDynamicEncounter(event.current.UserId);
        if (encounter) {
            await message.send({ format: encounterFormat(encounter) });
            return;
        }
    }
    const targets = result.spawns.length ? `\n\n可选目标\n${result.spawns.map(s => result.canViewMonsterInfo ? `#${s.id} ${s.name} Lv.${s.level}｜HP ${s.current_hp}/${s.hp_max}` : `#${s.id} ???`).join('\n')}\n\n发送 /目标 编号 进入战斗。` : '';
    await message.send({ format: messageFormat('探索', result.text + targets) });
}
catch (error) {
    logger.warn({ err: error }, 'explore failed');
    await fail(message, error);
} };
const inventoryHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    const bag = await inventory(event.current.UserId);
    const penaltyText = bag.rawSpeedPenalty > 0 && bag.constitutionOffset > 0 ? `速度惩罚 -${bag.speedPenalty}（体质抵消 ${Math.min(bag.rawSpeedPenalty, bag.constitutionOffset)}）` : `速度惩罚 -${bag.speedPenalty}`;
    await message.send({ format: messageFormat('冒险背包', `负重 ${bag.weight.toFixed(2)}/${bag.capacity}｜${penaltyText}\n当前速度 ${bag.speed}\n\n${bag.items.length ? bag.items.map(i => `${i.equipped_slot ? `[已装备·${i.equipped_slot}] ` : i.quick_slot ? `[道具${i.quick_slot}] ` : ''}${i.name} ×${i.quantity}（${i.weight}kg）`).join('\n') : '背包为空。'}`) });
}
catch (error) {
    await fail(message, error);
} };
const dungeonPanel = async (message, qqUserId, text) => { const panel = await movementPanel(qqUserId, text); const nearby = await nearbyPoints(qqUserId); await message.send({ format: panel.addButtonGroup(await movementButtons(qqUserId, nearby.character.activity_status !== 'active')) }); };
const dungeonEnterHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    const result = await enterDungeon(event.current.UserId, Number(route.param('id')));
    await dungeonPanel(message, event.current.UserId, `你沿着石阶踏入地下。地下迷宫第一层（${result.x}, ${result.y}, ${result.z}）的墙壁渗着寒意。`);
}
catch (error) {
    await fail(message, error, '无法进入地下迷宫');
} };
const dungeonFloorHandler = (direction) => async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    const result = await changeDungeonFloor(event.current.UserId, direction);
    const leaving = direction === 'leave' || direction === 'escape';
    const text = leaving ? `${'usedTeleporter' in result && result.usedTeleporter ? '破魔传送器的符文碎裂成光点，你被送回入口外。' : '你从入口的石阶返回地面。'}\n你回到了幽暗密林（${result.x}, ${result.y}, 0）。` : `你沿石阶来到地下迷宫的下一处区域（${result.x}, ${result.y}, ${result.z}）。`;
    await dungeonPanel(message, event.current.UserId, text);
}
catch (error) {
    await fail(message, error, direction === 'escape' ? '脱离失败' : '无法通过石阶');
} };
const dungeonDownHandler = dungeonFloorHandler('down');
const dungeonUpHandler = dungeonFloorHandler('up');
const dungeonLeaveHandler = dungeonFloorHandler('leave');
const dungeonEscapeHandler = dungeonFloorHandler('escape');
const dungeonChestHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    const result = await openDungeonChest(event.current.UserId, Number(route.param('id')));
    const coins = [`铜币×${result.copper}`, result.silver ? `银币×${result.silver}` : '', result.gold ? `金币×${result.gold}` : ''].filter(Boolean).join('、');
    await dungeonPanel(message, event.current.UserId, `${result.quality}宝箱在一阵轻响中开启。获得【${result.name}】×${result.quantity}，${coins}。${result.blueprintName ? `\n额外发现【${result.blueprintName}】；打开「/构造」即可补齐其前置图纸。` : ''}`);
}
catch (error) {
    await fail(message, error, '无法开启宝箱');
} };
const dungeonPvpHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    const result = await dungeonPvP(event.current.UserId, Number(route.param('id')));
    await dungeonPanel(message, event.current.UserId, result.text);
}
catch (error) {
    await fail(message, error, 'PvP失败');
} };
const playerPvpHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const targetId = Number(route.param('id'));
        const result = await startPvpBattle(event.current.UserId, targetId);
        if (result.needsConfirmation) {
            const markdown = Format.createMarkdown().addTitle('警告').addNewline().addNewline().addText('小镇内贸然攻击玩家会被通缉。');
            const buttons = Format.createButtonGroup().addRow().addButton('确认攻击', `/确认攻击 ${targetId}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('取消攻击', '/面板', { type: 'command', autoEnter: true });
            await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
            return;
        }
        const battle = await pvpBattleStatus(event.current.UserId);
        await message.send({ format: battleStartFormat(`你向【${result.target}】发起了玩家对战！`, battle) });
        await startPvpAutoBattle(message, event.current.UserId);
    }
    catch (error) {
        await fail(message, error, 'PvP失败');
    }
};
const confirmPlayerPvpHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const result = await startPvpBattle(event.current.UserId, Number(route.param('id')), true);
        const battle = await pvpBattleStatus(event.current.UserId);
        await message.send({ format: battleStartFormat(`你向【${result.target}】发起了玩家对战！`, battle) });
        await startPvpAutoBattle(message, event.current.UserId);
    }
    catch (error) {
        await fail(message, error, '攻击失败');
    }
};
const playerInteractionHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    const targetGameId = Number(route.param('id'));
    const result = await interactDungeonPlayer(event.current.UserId, targetGameId);
    await message.send({ format: playerInteractionFormat({ type: '玩家', id: String(targetGameId), name: result.name, description: '', gameId: targetGameId }, result.isFriend) });
}
catch (error) {
    await fail(message, error, '互动失败');
} };
const movementPanel = async (qqUserId, description) => { const [nearby, movement, trackingHint, surfaceTrace] = await Promise.all([nearbyPoints(qqUserId), movementProfile(qqUserId), dungeonTrackingHint(qqUserId), omniscientTraces(qqUserId)]); const resting = nearby.character.activity_status !== 'active'; const trace = [surfaceTrace, trackingHint ? `【地宫识踪】${trackingHint}` : ''].filter(Boolean).join('\n'); return outsidePanel('行动', movedLocationText(nearby.character), movement.step, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), description, nearby.points, resting, nearby.landmarks, trace, movement.maximum, nearby.perceptionObscured, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked, nearby.character.activity_status, true); };
const interactionTypeLabel = { 玩家: '玩家', 域民: '域民', NPC: '域民', 建筑: '建筑', 资源: '资源', 入口: '入口', 地标: '地标' };
const playerInteractionFormat = (target, isFriend = false) => {
    const targetGameId = Number(target.gameId ?? target.id);
    const markdown = Format.createMarkdown().addTitle('玩家互动').addNewline().addNewline()
        .addText(`ID：${targetGameId}`).addNewline().addText(`昵称：${target.name}`);
    const buttons = Format.createButtonGroup().addRow()
        .addButton(isFriend ? '赠礼' : '加好友', isFriend ? `/好友赠礼选择 ${targetGameId}` : `/加好友 ${targetGameId}`, { type: 'command', autoEnter: true })
        .addButton('邀请入队', `/邀请入队 ${targetGameId}`, { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const coordinateInteractionFormat = async (qqUserId, _character, targets) => {
    if (targets.length === 1 && targets[0].type === '玩家')
        return playerInteractionFormat(targets[0], Boolean(targets[0].isFriend));
    const markdown = Format.createMarkdown().addTitle('互动').addNewline().addNewline().addText('该位置有多个目标存在：').addNewline().addNewline();
    for (const [index, target] of targets.entries()) {
        markdown.addText(`${'①②③④⑤⑥⑦⑧⑨⑩'.charAt(index)}【${interactionTypeLabel[target.type]}】${target.name}`);
        if (target.type === '玩家') {
            markdown.addNewline();
            if (!target.isFriend)
                markdown.addButton('[攻击]', { data: `/玩家攻击 ${target.gameId}`, autoEnter: false }).addText(' ');
            else
                markdown.addText('[好友] ');
            markdown.addButton('[交易]', { data: `/玩家交易 ${target.gameId}`, autoEnter: false }).addText(' ')
                .addButton('[邀请入队]', { data: `/邀请入队 ${target.gameId}`, autoEnter: false }).addText(' ')
                .addButton(target.isFriend ? '[赠礼]' : '[加好友]', { data: target.isFriend ? `/好友赠礼选择 ${target.gameId}` : `/加好友 ${target.gameId}`, autoEnter: false });
        }
        else if (target.type === '建筑') {
            let actionLabel = '进入';
            let command = `/建筑进入 ${target.code}`;
            if (target.code?.startsWith('dw_')) {
                const { worldSiteView } = await import('../game/world-dynamics.service.js');
                const site = await worldSiteView(qqUserId, target.code);
                if (site.access === 'private' && !site.attendant) {
                    actionLabel = '敲门';
                    command = `/建筑敲门 ${target.code}`;
                }
            }
            markdown.addText(' ').addButton(`[${actionLabel}]`, { data: command, autoEnter: false }).addText(' ')
                .addButton('[忽略]', { data: `/建筑忽略 ${target.code}`, autoEnter: false });
        }
        else
            markdown.addText(' ').addButton('[互动]', { data: `/坐标互动 ${target.type} ${target.id}`, autoEnter: false });
        markdown.addNewline().addNewline();
    }
    return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('忽略', '/面板', { type: 'command', autoEnter: true }));
};
const coordinateInteractionHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const type = String(route.param('type'));
        const id = String(route.param('id'));
        if (type === '玩家') {
            const result = await interactDungeonPlayer(event.current.UserId, Number(id));
            await message.send({ format: playerInteractionFormat({ type: '玩家', id, name: result.name, description: '', gameId: Number(id) }, result.isFriend) });
            return;
        }
        const result = await coordinateInteraction(event.current.UserId, type, id);
        await showMoveResult(message, event.current.UserId, result);
    }
    catch (error) {
        await fail(message, error, '无法互动');
    }
};
const showMoveResult = async (message, qqUserId, result) => {
    try {
        await recordExplorationMovement(qqUserId);
    }
    catch (error) {
        logger.warn({ err: error, qqUserId }, 'exploration exposure recording failed');
    }
    const wanted = await cityWantedAlert(qqUserId);
    if (result.character?.enteredTown && wanted) {
        try {
            await publishWantedCityEntryNotice(wanted);
        }
        catch (error) {
            logger.warn({ err: error, qqUserId }, '到达城镇后的通缉公告发送失败');
        }
    }
    if (result.destinationKind === 'home') {
        const entry = result.homeEntry;
        if (!entry)
            throw new Error('已抵达小屋地块，但自动进入家园失败，请再次发送“/家园回家”。');
        const { homeFormat } = await import('./home.js');
        await message.send({ format: await homeFormat(qqUserId, `你已回家。${entry.pursuit?.text ? `\n${entry.pursuit.text}` : ''}`) });
        return;
    }
    const debtCollection = result.character?.debtCollection;
    if (debtCollection?.collected)
        result.text = `${result.text}\n\n城镇执法队扣除了铜币×${debtCollection.collected}，用于归还失主。${debtCollection.remaining ? `尚欠铜币×${debtCollection.remaining}。` : ''}`;
    if (result.kind === 'story') {
        await message.send({ format: chapterFormat(1, '你在林中听见了兵刃碰撞的声音。\n那声响被湿润的枝叶过滤得断断续续，却仍清晰地指向前方。\n是有人在附近战斗吗？') });
        return;
    }
    if (result.kind === 'main_quest_story') {
        const markdown = Format.createMarkdown().addTitle(`主线·失踪的少女（${result.questChapter}/7）`).addNewline().addNewline().addText(result.text);
        const buttons = Format.createButtonGroup().addRow();
        if (result.questClue)
            buttons.addButton('查看线索', '/任务', { type: 'command', autoEnter: true, style: 'blue' });
        else
            buttons.addButton('继续前进', '/继续深处阴谋', { type: 'command', autoEnter: true, style: 'blue' });
        buttons.addButton('任务', '/任务', { type: 'command', autoEnter: true });
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
        return;
    }
    if (result.kind === 'npc') {
        if (result.npc.interaction_kind === 'building') {
            if (result.npc.code.startsWith('dw_')) {
                const siteCode = result.npc.code;
                const { worldSiteView, worldSiteKnock } = await import('../game/world-dynamics.service.js');
                const site = await worldSiteView(qqUserId, siteCode);
                if (site.access === 'public' || site.attendant)
                    await message.send({ format: buildingEncounterFormat(result.npc.name, siteCode, movedLocationText(result.character)) });
                else {
                    const door = await worldSiteKnock(qqUserId, siteCode);
                    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character)).addNewline().addNewline().addBlockquote(('text' in door ? door.text : undefined) ?? '门后暂时没有回应。')).addButtonGroup(Format.createButtonGroup().addRow().addButton('敲门', `/建筑敲门 ${siteCode}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('忽略', `/建筑忽略 ${siteCode}`, { type: 'command', autoEnter: true })) });
                }
                return;
            }
            await message.send({ format: buildingEncounterFormat(result.npc.name, result.npc.code, movedLocationText(result.character)) });
            return;
        }
        const residentProfile = dynamicNpcProfile(result.npc.code);
        if (residentProfile) {
            try {
                const { worldSiteView } = await import('../game/world-dynamics.service.js');
                const site = await worldSiteView(qqUserId, residentProfile.homeSiteCode);
                if (site.attendant?.code === result.npc.code) {
                    await message.send({ format: buildingEncounterFormat(site.name, site.code, movedLocationText(result.character)) });
                    return;
                }
            }
            catch { }
        }
        const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character)).addNewline().addBlockquote(result.text).addNewline().addNewline().addText(result.npc.name);
        const buttons = Format.createButtonGroup().addRow().addButton('对话', `/NPC对话 ${result.npc.code}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('忽略', `/NPC忽略 ${result.npc.code}`, { type: 'command', autoEnter: true });
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
        return;
    }
    if (result.kind === 'resource') {
        const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character)).addNewline().addBlockquote(result.text).addNewline().addNewline().addText(`【${result.resource.kind}】${result.resource.name}`);
        const buttons = Format.createButtonGroup().addRow().addButton('开采', `/开采 ${result.resource.id}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('忽略', '/面板', { type: 'command', autoEnter: true });
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
        return;
    }
    if (result.kind === 'dungeon_entrance') {
        const dungeonStage = Number(result.discovery?.stage ?? 0);
        const canEnterDungeon = dungeonStage >= 5;
        const entranceDescription = canEnterDungeon
            ? `${result.text}\n\n石门前的结界已裂开一道稳定的缝隙，潮湿的冷风正从石阶下缓缓涌出。`
            : `${result.text}\n\n楼梯下的石门上仿佛覆着一层结界。你试着靠近，却被无形的力量轻轻推开。`;
        const markdown = Format.createMarkdown()
            .addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character)).addNewline()
            .addBlockquote(entranceDescription).addNewline().addNewline()
            .addText(dungeonStage >= 2 ? '地下迷宫入口' : '地下大门');
        const buttons = Format.createButtonGroup().addRow()
            .addButton(canEnterDungeon ? '进入' : '调查石门', canEnterDungeon ? `/下迷宫 ${result.entrance.id}` : `/地下的秘密 ${result.entrance.id}`, { type: 'command', autoEnter: true, style: 'blue' })
            .addButton('忽略', '/面板', { type: 'command', autoEnter: true });
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
        if (result.discovery?.started) {
            const quest = Format.createMarkdown()
                .addTitle('支线·地下的秘密（1/6）')
                .addNewline().addNewline()
                .addBlockquote('石门上的结界轻轻泛起波纹，像在无声拒绝来客。你想起公会的档案或许会知道这里的来历。')
                .addNewline().addNewline()
                .addText('已触发新的任务【支线·地下的秘密】');
            const questButtons = Format.createButtonGroup()
                .addRow()
                .addButton('任务', '/任务', { type: 'command', autoEnter: true, style: 'blue' });
            await message.send({ format: Format.create().addMarkdown(quest).addButtonGroup(questButtons) });
        }
        if (result.discovery?.newMark) {
            const notice = Format.createMarkdown().addTitle('地图·新标记').addNewline().addNewline().addText('你将这一处新发现记录在了地图上。').addNewline().addText('发送 ').addButton('/地图', { data: '/地图', autoEnter: false }).addText(' 可随时查看。');
            await message.send({ format: Format.create().addMarkdown(notice).addButtonGroup(Format.createButtonGroup().addRow().addButton('地图', '/地图', { type: 'command', autoEnter: true, style: 'blue' })) });
        }
        return;
    }
    if (result.kind === 'interaction') {
        await message.send({ format: await coordinateInteractionFormat(qqUserId, result.character, result.targets) });
        return;
    }
    if (result.kind === 'dungeon') {
        if (result.dungeon.kind === 'trap' || result.dungeon.kind === 'landmark') {
            const panel = await movementPanel(qqUserId, result.text);
            const nearby = await nearbyPoints(qqUserId);
            await message.send({ format: panel.addButtonGroup(await movementButtons(qqUserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        const trackingHint = await dungeonTrackingHint(qqUserId);
        const description = trackingHint ? `${result.text}\n\n【识踪】${trackingHint}` : result.text;
        const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character)).addNewline().addBlockquote(description);
        const buttons = Format.createButtonGroup().addRow();
        if (result.dungeon.kind === 'chest')
            buttons.addButton('开启宝箱', `/开启地宫宝箱 ${result.dungeon.cellId}`, { type: 'command', autoEnter: true, style: 'blue' });
        if (result.dungeon.kind === 'down')
            buttons.addButton('前往下一层', '/地宫下行', { type: 'command', autoEnter: true, style: 'blue' });
        if (result.dungeon.kind === 'up')
            buttons.addButton('返回上一层', '/地宫上行', { type: 'command', autoEnter: true, style: 'blue' });
        if (result.dungeon.kind === 'leave')
            buttons.addButton('离开迷宫', '/离开迷宫', { type: 'command', autoEnter: true, style: 'blue' });
        else
            buttons.addButton('传送器离开', '/离开迷宫', { type: 'command', autoEnter: true });
        buttons.addButton('操作面板', '/面板', { type: 'command', autoEnter: true });
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
        return;
    }
    if (result.kind !== 'encounter') {
        const panel = await movementPanel(qqUserId, result.text);
        const nearby = await nearbyPoints(qqUserId);
        await message.send({ format: panel.addButtonGroup(await movementButtons(qqUserId, nearby.character.activity_status !== 'active')) });
        return;
    }
    if (await resolveAutoHuntEncounter(message, qqUserId, result))
        return;
    const first = result.spawns[0];
    const targets = result.spawns.map((spawn) => `${spawn.name} Lv.${spawn.level}`).join('\n');
    const hasBoss = result.spawns.some((spawn) => spawn.monster_class === 'boss');
    const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character))
        .addNewline().addBlockquote(result.text).addNewline().addNewline().addTitle('★★★遇战★★★').addNewline().addNewline().addText(targets);
    if (hasBoss)
        markdown.addNewline().addButton('[BOSS词条说明]', { data: '/BOSS词条说明', autoEnter: false });
    if (result.occupied)
        markdown.addNewline().addNewline().addBlockquote('当前坐标有战斗正在进行。你可以伏击等待，或先行离开。');
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(encounterButtons(first.id, Boolean(result.canAmbush), Boolean(result.occupied), Boolean(result.cityPursuit))) });
};
const showBlockedEncounter = async (message, qqUserId) => {
    const result = await currentEncounter(qqUserId);
    if (!result)
        return false;
    const first = result.spawns[0];
    const targets = result.spawns.map((spawn) => `${spawn.name} Lv.${spawn.level}`).join('\n');
    const hasBoss = result.spawns.some((spawn) => spawn.monster_class === 'boss');
    const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character)).addNewline().addBlockquote(result.text).addNewline().addNewline().addTitle('★★★遇战★★★').addNewline().addNewline().addText(targets);
    if (hasBoss)
        markdown.addNewline().addButton('[BOSS词条说明]', { data: '/BOSS词条说明', autoEnter: false });
    if (result.occupied)
        markdown.addNewline().addNewline().addBlockquote('当前坐标有战斗正在进行。你可以伏击等待，或先行离开。');
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(encounterButtons(first.id, Boolean(result.canAmbush), Boolean(result.occupied), Boolean(result.cityPursuit))) });
    return true;
};
const continueStoryHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const guide = await forestGuideProgress(event.current.UserId);
        if (guide?.status === 'met' && forestGuideChapterTexts[guide.stage]) {
            await message.send({ format: chapterFormat(guide.stage, forestGuideChapterTexts[guide.stage]) });
            return;
        }
        if (guide && ['joined', 'declined'].includes(guide.status)) {
            const battle = await battleStatus(event.current.UserId);
            await message.send({ format: battleOperationFormat('剧情战斗仍在继续。', battle) });
            return;
        }
        const story = await continueForestArrival(event.current.UserId);
        const storyFormat = await townArrivalFormat(story.stage, story.text, story.completed, story.chapter === 'guild');
        if (storyFormat) {
            if (story.chapter === 'guild' && story.stage === 1 && !isPublicImageUrl(gameAssetUrls.pearGuideImageUrl)) {
                try {
                    await message.send({ format: Format.create().addImage(await pearGuideImageBuffer()) });
                }
                catch (error) {
                    logger.warn({ err: error, pearGuideImage: pearGuideImagePath }, 'load pear guide image failed');
                }
            }
            await message.send({ format: storyFormat });
            return;
        }
        if (story.arrivalBuilding) {
            await message.send({ format: buildingEncounterFormat('冒险者公会', story.arrivalBuilding, '你移动至百纳镇·猫拉瑞亚(-2, -161)') });
            return;
        }
        const panel = await movementPanel(event.current.UserId, story.text);
        const nearby = await nearbyPoints(event.current.UserId);
        await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
    }
    catch (error) {
        await fail(message, error, '无法继续剧情');
    }
};
const buildingHandler = (action) => async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const code = String(route.param('code'));
        const building = await requireNpcAtCurrentPosition(event.current.UserId, code);
        if (building.interaction_kind !== 'building')
            throw new Error('该目标不是建筑。');
        if (code === 'blacksmith') {
            if (action === 'enter') {
                const { blacksmithFormat } = await import('./blacksmith.js');
                await message.send({ format: await blacksmithFormat(event.current.UserId) });
                return;
            }
            const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开了铁匠铺，炉火与锤声在身后渐远。' : '你暂时没有进入铁匠铺。');
            const nearby = await nearbyPoints(event.current.UserId);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        if (code === 'saint_church') {
            if (action === 'enter') {
                const { churchFormat } = await import('./church.js');
                await message.send({ format: await churchFormat(event.current.UserId) });
                return;
            }
            const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开圣恩教堂，晚风与街道的声响重新围拢过来。' : '你暂时没有进入圣恩教堂。');
            const nearby = await nearbyPoints(event.current.UserId);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        if (code === 'alchemy_sweetshop') {
            if (action === 'enter') {
                const { alchemistShopFormat } = await import('./alchemist.js');
                await message.send({ format: await alchemistShopFormat(event.current.UserId) });
                return;
            }
            const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开了糖水屋，清甜的草药香仍萦绕在衣袖间。' : '你暂时没有进入糖水屋。');
            const nearby = await nearbyPoints(event.current.UserId);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        if (code === 'oddworkshop') {
            if (action === 'enter') {
                const { oddWorkshopFormat } = await import('./deconstructor.js');
                await message.send({ format: await oddWorkshopFormat(event.current.UserId) });
                return;
            }
            const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开了异工坊，身后仍传来轻快的齿轮转动声。' : '你暂时没有进入异工坊。');
            const nearby = await nearbyPoints(event.current.UserId);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        if (code === 'hunter_lodge') {
            if (action === 'enter') {
                const { hunterLodgeHandler } = await import('./hunter-lodge.js');
                await hunterLodgeHandler();
                return;
            }
            const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开猎户小屋，林风很快盖过了屋内的磨箭声。' : '屋内没有回应，你暂时没有继续敲门。');
            const nearby = await nearbyPoints(event.current.UserId);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        if (code === 'bookshop') {
            if (action === 'enter') {
                const { bookshopHandler } = await import('./bookshop.js');
                await bookshopHandler();
                return;
            }
            const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开百味书屋，身后仍传来轻柔的翻页声。' : '你暂时没有进入百味书屋。');
            const nearby = await nearbyPoints(event.current.UserId);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        if (code === 'baina_residence') {
            if (action === 'enter') {
                const { homeShopFormat } = await import('./home-shop.js');
                await message.send({ format: await homeShopFormat(event.current.UserId) });
                return;
            }
            const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开百纳居，木料与炉火的气息渐渐淡去。' : '百纳居的店员朝你点头，示意你进门详谈。');
            const nearby = await nearbyPoints(event.current.UserId);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        if (code === 'world_gate') {
            if (action === 'enter') {
                const { worldGateFormat } = await import('./girl-gratitude.js');
                await worldGateFormat();
                return;
            }
            const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开界门驿站，银蓝色光纹在身后渐渐暗下。' : '界门驿站的值守人安静地等着你的决定。');
            const nearby = await nearbyPoints(event.current.UserId);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        if (code === 'world_tree_gate') {
            if (action === 'enter') {
                const { worldTreeGateFormat } = await import('./girl-gratitude.js');
                await worldTreeGateFormat();
                return;
            }
            const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开世界树界门，银蓝色光纹在根须之间渐渐收束。' : '世界树界门静静伫立，门内隐约映着远方的城镇灯火。');
            const nearby = await nearbyPoints(event.current.UserId);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        if (code === 'canopy_exchange') {
            if (action === 'enter') {
                const { worldExchangeFormat } = await import('./girl-gratitude.js');
                await worldExchangeFormat();
                return;
            }
            const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开万叶联市，叶脉间的交易声仍在身后流淌。' : '万叶联市的叶灯已为夜间来客亮起。');
            const nearby = await nearbyPoints(event.current.UserId);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        if (code === 'world_library') {
            if (action === 'enter') {
                const { worldLibraryFormat } = await import('./evolution-quest.js');
                await message.send({ format: await worldLibraryFormat(event.current.UserId) });
                return;
            }
            if (action === 'area') {
                const { worldLibraryAreaHandler } = await import('./evolution-quest.js');
                await worldLibraryAreaHandler();
                return;
            }
            const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开世界图书馆，枝叶间的翻页声渐渐远去。' : '图书馆的门扉仍为求知者敞开。');
            const nearby = await nearbyPoints(event.current.UserId);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        if (code === 'evolution_lab') {
            if (action === 'enter') {
                const { evolutionLabHandler } = await import('./evolution.js');
                await evolutionLabHandler();
                return;
            }
            const panel = await movementPanel(event.current.UserId, action === 'leave' ? '深蓝色小门在身后合拢，叶脉的微光渐渐远去。' : '门牌上的字在枝影中静静发亮。');
            const nearby = await nearbyPoints(event.current.UserId);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        if (action === 'enter') {
            if (code.startsWith('dw_')) {
                const { completeWorldSiteCommissionsAtSite, worldSiteKnock, worldSiteView } = await import('../game/world-dynamics.service.js');
                const { worldSiteFormat } = await import('./world-site.js');
                const site = await worldSiteView(event.current.UserId, code);
                if (site.access === 'private' && !site.attendant) {
                    const door = await worldSiteKnock(event.current.UserId, code);
                    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle(`${site.regionName}·${door.site.name}`).addNewline().addNewline().addBlockquote(('text' in door ? door.text : undefined) ?? '门后暂时没有回应。')).addButtonGroup(Format.createButtonGroup().addRow().addButton('敲门', `/建筑敲门 ${code}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('离开', `/建筑离开 ${code}`, { type: 'command', autoEnter: true })) });
                    return;
                }
                const notices = site.attendant ? await completeWorldSiteCommissionsAtSite(event.current.UserId, code) : [];
                await message.send({ format: await worldSiteFormat(event.current.UserId, code, notices) });
                return;
            }
            if (code === 'guild_counter') {
                await message.send({ format: guildInteriorFormat() });
                return;
            }
            await message.send({ format: unimplementedBuildingFormat({ code, name: building.name, description: building.description }) });
            return;
        }
        if (action === 'area') {
            if (code !== 'guild_counter')
                throw new Error('这座建筑暂未开放内部区域。');
            const area = String(route.param('area'));
            if (area === '悬赏板') {
                const { bountyBoardFormat } = await import('./bounty.js');
                await message.send({ format: await bountyBoardFormat(event.current.UserId) });
                return;
            }
            if (area === '工会商店') {
                const { guildShopFormat } = await import('./guild-shop.js');
                await message.send({ format: guildShopFormat() });
                return;
            }
            if (area === '餐厅') {
                const { restaurantFormat } = await import('./guild-restaurant.js');
                await message.send({ format: restaurantFormat() });
                return;
            }
            await message.send({ format: area === '前台' ? await guildFrontDeskFormat(event.current.UserId) : guildInteriorFormat(area) });
            return;
        }
        const panel = await movementPanel(event.current.UserId, action === 'leave' ? `你离开了${building.name}，回到门前的街道。` : `你暂时没有进入${building.name}。`);
        const nearby = await nearbyPoints(event.current.UserId);
        await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
    }
    catch (error) {
        await fail(message, error, '建筑操作失败');
    }
};
const guildRegistrationHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'guild_counter');
    const registered = await registerAdventurer(event.current.UserId);
    if (!registered) {
        await message.send({ format: await guildFrontDeskFormat(event.current.UserId, '莫妮卡轻轻摇头：“您的冒险者身份已经登记在册了。晋升考核将在满足条件后开放。”') });
        return;
    }
    const markdown = Format.createMarkdown().addTitle('冒险家 注册').addNewline().addNewline().addBlockquote('你将手轻放在水晶球上，顿时散发出一阵耀眼的白光。').addNewline().addBlockquote('莫妮卡将一张通体漆黑卡片靠近球体，光芒汇聚成一道银线注入，卡片逐渐被染成银白。').addNewline().addBlockquote('随后一行行异世界文字在卡面上依次浮现——').addNewline().addNewline().addText('获得【冒险者 卡片】').addNewline().addText('你随时可以发送 ').addButton('/卡片', { data: '/卡片', autoEnter: false }).addText(' 查看。').addNewline().addText('你已察觉到自身属性，发送 ').addButton('/角色', { data: '/角色', autoEnter: false }).addText(' 查看。');
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回前台', '/建筑区域 guild_counter 前台', { type: 'command', autoEnter: true, style: 'blue' })) });
}
catch (error) {
    await fail(message, error, '注册失败');
} };
const professionHandler = (action) => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'guild_counter');
    if (action === 'select') {
        await message.send({ format: await professionSelectFormat(event.current.UserId) });
        return;
    }
    const name = String(route.param('name'));
    if (action === 'detail') {
        await message.send({ format: await professionDetailFormat(event.current.UserId, name) });
        return;
    }
    const code = professionCodeByName[name];
    if (!code)
        throw new Error('未知职业。');
    const result = await chooseProfession(event.current.UserId, code);
    await message.send({ format: await guildFrontDeskFormat(event.current.UserId, `莫妮卡郑重地在档案上盖下印记。“恭喜您成为一名${name}。愿您始终记得最初踏上旅途的理由。”\n\n技能点已重置：返还 ${result.reset.restoredPoints} 点，当前可分配 ${result.reset.availablePoints} 点。`) });
}
catch (error) {
    await fail(message, error, '职业操作失败');
} };
const guildChatHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'guild_counter');
    const { affinity } = await addNpcAffinity(event.current.UserId, 'guild_counter', 'chat');
    await message.send({ format: await guildFrontDeskFormat(event.current.UserId, npcChatDialogue('guild_counter', affinity), true) });
}
catch (error) {
    await fail(message, error, '闲聊失败');
} };
const guildBarrierHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'guild_counter');
    const { advanceRealmBarrier } = await import('../game/main-quest.service.js');
    await advanceRealmBarrier(event.current.UserId, 'guild');
    const { barrierAdviceFormat } = await import('./alchemist.js');
    await message.send({ format: barrierAdviceFormat(true) });
}
catch (error) {
    await fail(message, error, '无法询问');
} };
const adventurerCardHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const card = await adventurerCardImage(event.current.UserId, event.current.UserAvatar);
        await message.send({ format: createFormatWithoutGroupMention().addImage(card.image) });
    }
    catch (error) {
        await fail(message, error, '无法查看卡片');
    }
};
const pearGuideHandler = async () => {
    const [message] = useMessage();
    try {
        if (isPublicImageUrl(gameAssetUrls.pearGuideImageUrl)) {
            const markdown = Format.createMarkdown().addTitle('梨子喵').addNewline().addNewline().addImage(gameAssetUrls.pearGuideImageUrl, { width: 320, height: 213 });
            await message.send({ format: Format.create().addMarkdown(markdown) });
            return;
        }
        await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('梨子喵')) });
        await message.send({ format: Format.create().addImage(await pearGuideImageBuffer()) });
    }
    catch (error) {
        await fail(message, error, '无法展示梨子喵');
    }
};
const pearGuidePreviewHandler = async () => {
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const supplied = String(route.param('url') ?? '').trim();
        const imageUrl = supplied || gameAssetUrls.pearGuideImageUrl;
        if (!isPublicImageUrl(imageUrl))
            throw new Error('请先在 src/config/game-assets.ts 填写 pearGuideImageUrl，或发送「梨子喵预览 图片URL」进行临时测试。');
        const markdown = Format.createMarkdown().addTitle('梨子喵·剧情图片预览').addNewline().addNewline()
            .addImage(imageUrl, { width: 320, height: 213 }).addNewline().addNewline()
            .addBlockquote('图片、剧情文字与蓝色操作文字均位于同一条 Markdown 消息内。').addNewline().addNewline()
            .addButton('[测试继续]', { data: '/梨子喵预览', autoEnter: false });
        await message.send({ format: Format.create().addMarkdown(markdown) });
    }
    catch (error) {
        await fail(message, error, '梨子喵预览不可用');
    }
};
const pearGuideFormat = async (qqUserId, text, continuingChat = false) => {
    const greeting = text ?? timeGreeting('清晨的百纳镇还带着薄雾。梨子喵抱着一小袋刚买的点心，耳朵轻轻一抖，笑着朝你招手。\n“早上好呀，勇者大人！又要出发了喵？今天也要精神满满喵！”', '午后的街道正热闹，梨子喵从人群里探出脑袋，猫耳兴奋地竖起。\n“勇者大人！正好见到你喵。密林那边有没有什么新鲜见闻？”', '晚风掠过石板街，梨子喵抱着尾巴站在魔石灯下，见到你便露出安心的笑容。\n“晚上好喵。看到勇者大人平安回来，梨子喵就放心啦。”');
    return npcInteractionFormat(qqUserId, { code: 'pear_guide', name: '梨子喵' }, greeting, continuingChat);
};
const pearGuideChatHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        await requireNpcAtCurrentPosition(event.current.UserId, 'pear_guide');
        const { girlGratitudePending } = await import('../game/girl-gratitude.service.js');
        if (await girlGratitudePending(event.current.UserId)) {
            const { girlGratitudeStartFormat } = await import('./girl-gratitude.js');
            await message.send({ format: await girlGratitudeStartFormat(event.current.UserId) });
            return;
        }
        const { affinity } = await addNpcAffinity(event.current.UserId, 'pear_guide', 'chat');
        const chat = npcChatDialogue('pear_guide', affinity);
        await message.send({ format: await pearGuideFormat(event.current.UserId, chat, true) });
    }
    catch (error) {
        await fail(message, error, '无法闲聊');
    }
};
const pearGuideLeaveHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const npc = await requireNpcAtCurrentPosition(event.current.UserId, 'pear_guide');
        await sendNpcLeavePanel(message, event.current.UserId, npc.name);
    }
    catch (error) {
        await fail(message, error, '无法离开');
    }
};
const sendNpcLeavePanel = async (message, qqUserId, name) => {
    const [nearby, movement] = await Promise.all([nearbyPoints(qqUserId), movementProfile(qqUserId)]);
    const panel = outsidePanel('行动', currentLocationText(nearby.character), movement.step, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), `你和${simpleNpcName(name)}道别，继续留意周围的动静。`, nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks, '', movement.maximum, false, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked);
    await message.send({ format: panel.addButtonGroup(await movementButtons(qqUserId, nearby.character.activity_status !== 'active')) });
};
const npcLeaveHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const npc = await requireNpcAtCurrentPosition(event.current.UserId, String(route.param('code')));
        if (npc.interaction_kind !== 'npc')
            throw new Error('该目标不是 NPC。');
        await sendNpcLeavePanel(message, event.current.UserId, npc.name);
    }
    catch (error) {
        await fail(message, error, '无法离开');
    }
};
const npcEncounterHandler = (action) => async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const code = String(route.param('code'));
        const npc = await requireNpcAtCurrentPosition(event.current.UserId, code);
        if (npc.interaction_kind !== 'npc')
            throw new Error('该目标不是域民。');
        if (action === 'ignore') {
            const [nearby, movement] = await Promise.all([nearbyPoints(event.current.UserId), movementProfile(event.current.UserId)]);
            const panel = outsidePanel('行动', currentLocationText(nearby.character), movement.step, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), '你暂时没有上前搭话，继续留意四周。', nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks, '', movement.maximum, false, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        const { isWorldTreeAdvancedMentor } = await import('../game/advanced-profession.service.js');
        if (isWorldTreeAdvancedMentor(code)) {
            const { advancedMentorFormat } = await import('./advanced-profession.js');
            await message.send({ format: await advancedMentorFormat(event.current.UserId, code) });
            return;
        }
        if (code === 'pear_guide') {
            const { girlGratitudePending } = await import('../game/girl-gratitude.service.js');
            if (await girlGratitudePending(event.current.UserId)) {
                const { girlGratitudeStartFormat } = await import('./girl-gratitude.js');
                await message.send({ format: await girlGratitudeStartFormat(event.current.UserId) });
                return;
            }
        }
        const affinity = await addNpcAffinity(event.current.UserId, code, 'chat');
        const text = code === 'pear_guide' ? npcChatDialogue('pear_guide', affinity.affinity) : dynamicNpcChatDialogue(code, affinity.affinity) ?? await talkToNpc(event.current.UserId, code);
        if (code === 'pear_guide') {
            await message.send({ format: await pearGuideFormat(event.current.UserId, text, true) });
            return;
        }
        const { worldSiteForAttendant } = await import('../game/world-dynamics.service.js');
        const residentSite = await worldSiteForAttendant(event.current.UserId, code);
        if (residentSite) {
            const markdown = Format.createMarkdown().addTitle(`域民·${npc.name}`).addNewline().addNewline().addBlockquote(text);
            if (residentSite.capability === 'commission')
                markdown.addNewline().addNewline().addText('前台的委托簿已经摊开；若你愿意接下巡检，便在这里留下名字。');
            else
                markdown.addNewline().addNewline().addText('对方将手边的事务暂放一旁，等你决定是否办理站内服务。');
            const buttons = Format.createButtonGroup().addRow().addButton('继续闲聊', `/域民交谈 ${code}`, { type: 'command', autoEnter: true, style: 'blue' });
            if (residentSite.capability === 'commission')
                buttons.addButton('接取委托', `/接取站点委托 ${residentSite.siteCode} ${code}`, { type: 'command', autoEnter: true, style: 'blue' });
            buttons.addButton('返回站内', `/建筑进入 ${residentSite.siteCode}`, { type: 'command', autoEnter: true });
            buttons.addButton('切磋', `/切磋 ${code}`, { type: 'command', autoEnter: true, style: 'blue' });
            await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
            return;
        }
        await message.send({ format: await npcInteractionFormat(event.current.UserId, { code, name: npc.name }, text, true) });
    }
    catch (error) {
        await fail(message, error, '对话失败');
    }
};
const miningFormat = (kind, name, seconds, remaining) => Format.create().addMarkdown(Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText('正在开采').addNewline().addBlockquote(`【${kind === '植被' ? '植被' : '锻材'}】${name}`).addNewline().addText(`预计耗时${durationText(seconds)}`).addNewline().addText(`当前剩余${durationText(remaining)}`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('刷新开采', '/刷新开采', { type: 'command', autoEnter: true, style: 'blue' }).addButton('取消开采', '/取消开采', { type: 'command', autoEnter: true }).addRow().addButton('角色', '/角色', { type: 'command', autoEnter: true }).addButton('装备', '/装备', { type: 'command', autoEnter: true }).addButton('背包', '/背包', { type: 'command', autoEnter: true }).addButton('技能', '/技能列表', { type: 'command', autoEnter: true }).addButton('队伍', '/队伍', { type: 'command', autoEnter: true }));
const mineResourceHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    const result = await mineResource(event.current.UserId, Number(route.param('id')));
    if (result.state === 'completed') {
        const panel = await movementPanel(event.current.UserId, `资源开采完成，获得【${result.kind === '植被' ? '植被' : '锻材'}】${result.name}×${result.quantity}。`);
        const nearby = await nearbyPoints(event.current.UserId);
        await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
        return;
    }
    await message.send({ format: miningFormat(result.kind, result.name, result.seconds || (await resourceMiningStatus(event.current.UserId))?.seconds || 0, result.remaining) });
}
catch (error) {
    await fail(message, error, '开采失败');
} };
const refreshMiningHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    const mining = await resourceMiningStatus(event.current.UserId);
    if (!mining)
        throw new Error('当前没有正在进行的资源开采。');
    const result = await mineResource(event.current.UserId, mining.resourceId);
    if (result.state === 'completed') {
        const panel = await movementPanel(event.current.UserId, `资源开采完成，获得【${result.kind === '植被' ? '植被' : '锻材'}】${result.name}×${result.quantity}。`);
        const nearby = await nearbyPoints(event.current.UserId);
        await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
        return;
    }
    await message.send({ format: miningFormat(result.kind, result.name, mining.seconds, result.remaining) });
}
catch (error) {
    await fail(message, error, '开采状态不可用');
} };
const cancelMiningHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    await cancelResourceMining(event.current.UserId);
    const panel = await movementPanel(event.current.UserId, '你收起工具，中止了本次资源开采。');
    const nearby = await nearbyPoints(event.current.UserId);
    await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
}
catch (error) {
    await fail(message, error, '取消开采失败');
} };
const moveHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    await leaveHomeForMovement(message, event.current.UserId);
    await showMoveResult(message, event.current.UserId, await move(event.current.UserId, String(route.param('direction'))));
}
catch (error) {
    if (error instanceof Error && error.message.includes('当前格子存在敌对生物') && await showBlockedEncounter(message, event.current.UserId))
        return;
    if (isForestGuideLocked(error)) {
        await storyLockedMessage(message, '无法移动');
        return;
    }
    if (await showOngoingActivity(message, event.current.UserId, '无法移动'))
        return;
    await fail(message, error, '无法移动');
} };
const goToHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    await leaveHomeForMovement(message, event.current.UserId);
    const result = await moveTo(event.current.UserId, Number(route.param('x')), Number(route.param('y')));
    if (result.kind === 'travel') {
        await message.send({ format: travelFormat('开始前往', result.regionName, result.x, result.y, result.seconds, result.remaining, 'move', result.destinationName) });
        scheduleTravelCompletion(message, event.current.UserId, result.remaining);
        return;
    }
    await showMoveResult(message, event.current.UserId, result);
}
catch (error) {
    if (error instanceof Error && error.message.includes('当前格子存在敌对生物') && await showBlockedEncounter(message, event.current.UserId))
        return;
    if (isForestGuideLocked(error)) {
        await storyLockedMessage(message, '无法前往该位置');
        return;
    }
    if (await showOngoingActivity(message, event.current.UserId, '无法前往该位置'))
        return;
    await fail(message, error, '无法前往该位置');
} };
const goToMapHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    await leaveHomeForMovement(message, event.current.UserId);
    const result = await moveToMap(event.current.UserId, String(route.param('code')));
    if (result.kind === 'travel') {
        await message.send({ format: travelFormat('开始前往', result.regionName, result.x, result.y, result.seconds, result.remaining, 'move', result.destinationName) });
        scheduleTravelCompletion(message, event.current.UserId, result.remaining);
        return;
    }
    await showMoveResult(message, event.current.UserId, result);
}
catch (error) {
    if (error instanceof Error && error.message.includes('当前格子存在敌对生物') && await showBlockedEncounter(message, event.current.UserId))
        return;
    if (isForestGuideLocked(error)) {
        await storyLockedMessage(message, '无法前往地图');
        return;
    }
    if (await showOngoingActivity(message, event.current.UserId, '无法前往地图'))
        return;
    await fail(message, error, '无法前往地图');
} };
const huntHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    const result = await huntMonster(event.current.UserId);
    await message.send({ format: travelFormat('开始寻怪……', result.regionName, result.x, result.y, result.seconds, result.remaining, 'hunt') });
    scheduleTravelCompletion(message, event.current.UserId, result.remaining);
}
catch (error) {
    if (isForestGuideLocked(error)) {
        await storyLockedMessage(message, '无法寻怪');
        return;
    }
    if (await showOngoingActivity(message, event.current.UserId, '无法寻怪'))
        return;
    await fail(message, error, '无法寻怪');
} };
const cancelTravelHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    const cancelled = await cancelTravel(event.current.UserId);
    const timer = travelTimers.get(event.current.UserId);
    if (timer)
        clearTimeout(timer);
    travelTimers.delete(event.current.UserId);
    const [nearby, movement] = await Promise.all([nearbyPoints(event.current.UserId), movementProfile(event.current.UserId)]);
    const character = cancelled.character;
    const cancellationText = cancelled.activityType === 'hunt' ? '寻怪已取消' : '移动已取消';
    const panel = outsidePanel('行动', `${cancellationText}\n${currentLocationText(character)}`, movement.step, nearby.range, Number(character.pos_x), Number(character.pos_y), nearby.description, nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks, '', movement.maximum, false, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked);
    await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
}
catch (error) {
    await fail(message, error, '取消行动失败');
} };
const adjustMovementHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const result = await adjustMovementStep(event.current.UserId, Number(route.param('step')));
        const [nearby, movement] = await Promise.all([nearbyPoints(event.current.UserId), movementProfile(event.current.UserId)]);
        const panel = outsidePanel('行动', currentLocationText(nearby.character), result.step, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), `你将单次移动距离调整为 ${result.step} 格。`, nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks, '', result.maximum, false, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked);
        await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
    }
    catch (error) {
        await fail(message, error, '移动速度调整失败');
    }
};
const refreshTravelHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const travel = await travelStatus(event.current.UserId);
        if (!travel) {
            const home = await homePanel(event.current.UserId);
            if (home.inHome) {
                const { homeFormat } = await import('./home.js');
                await message.send({ format: await homeFormat(event.current.UserId) });
                return;
            }
            const [nearby, movement] = await Promise.all([nearbyPoints(event.current.UserId), movementProfile(event.current.UserId)]);
            const panel = outsidePanel('行动', currentLocationText(nearby.character), movement.step, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), nearby.description, nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks, '', movement.maximum, nearby.perceptionObscured, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        if (travel.remaining <= 0) {
            const result = await completeTravel(event.current.UserId);
            if (result) {
                await showMoveResult(message, event.current.UserId, result);
                return;
            }
            const [nearby, movement] = await Promise.all([nearbyPoints(event.current.UserId), movementProfile(event.current.UserId)]);
            const panel = outsidePanel('行动', currentLocationText(nearby.character), movement.step, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), nearby.description, nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks, '', movement.maximum, nearby.perceptionObscured, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked);
            await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
            return;
        }
        const title = travel.activityType === 'hunt' ? '正在寻怪' : travel.destinationKind === 'home' ? '正在回家·' : '正在前往';
        await message.send({ format: travelFormat(title, travel.regionName, travel.x, travel.y, travel.seconds, travel.remaining, travel.activityType, travel.destinationName) });
    }
    catch (error) {
        await fail(message, error, '刷新行动失败');
    }
};
const targetHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    await chooseTarget(event.current.UserId, Number(route.param('id')));
    const battle = await battleStatus(event.current.UserId);
    await message.send({ format: battleStartFormat(`遭遇 ${battle.targets.map(target => `[${target.name}]`).join('、')}！`, battle) });
    await startAutoBattle(message, event.current.UserId);
}
catch (error) {
    await fail(message, error, '无法锁定目标');
} };
const nearbyMonsterAttackHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const spawnId = Number(route.param('id'));
        const arrival = await moveToNearbyMonster(event.current.UserId, spawnId);
        const started = await chooseTarget(event.current.UserId, spawnId, arrival.canAmbush);
        const battle = await battleStatus(event.current.UserId);
        if (started.ambush) {
            if (await isFullPartyAutoBattle(event.current.UserId)) {
                await startAutoBattle(message, event.current.UserId, '战斗开始\n你看准目标，疾速突进——\n（首回合直击伤害+50%）');
                return;
            }
            await message.send({ format: ambushStartFormat(battle) });
        }
        else {
            await message.send({ format: battleStartFormat(`你直奔 ${battle.targets.map(target => `[${target.name}]`).join('、')}，抢先发动攻击！`, battle) });
        }
        await startAutoBattle(message, event.current.UserId);
    }
    catch (error) {
        await fail(message, error, '无法攻击目标');
    }
};
const ambushHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    await chooseTarget(event.current.UserId, Number(route.param('id')), true);
    const battle = await battleStatus(event.current.UserId);
    if (await isFullPartyAutoBattle(event.current.UserId)) {
        await startAutoBattle(message, event.current.UserId, '战斗开始\n你看准目标，疾速突进——\n（首回合直击伤害+50%）');
        return;
    }
    await message.send({ format: ambushStartFormat(battle) });
    await startAutoBattle(message, event.current.UserId);
}
catch (error) {
    await fail(message, error, '无法发动偷袭');
} };
const queueAmbushHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    const spawnId = Number(route.param('id'));
    const channelId = String(event.current.ChannelId ?? '');
    const delivery = { scope: !event.current.IsPrivate && channelId ? 'group' : 'c2c', targetId: !event.current.IsPrivate && channelId ? channelId : String(event.current.UserId), botId: String(event.current.BotId ?? '') || undefined };
    const result = await queueAmbush(event.current.UserId, spawnId, delivery);
    if (result.ready) {
        await chooseTarget(event.current.UserId, result.spawnId ?? spawnId);
        const battle = await battleStatus(event.current.UserId);
        await message.send({ format: battleStartFormat(result.residualParty ? '前一支队伍击败了目标，但伤势未愈。你抓住破绽，伏击其残余队伍！' : '前一场战斗已经结束，你趁目标尚未恢复时切入战场。', battle) });
        await startAutoBattle(message, event.current.UserId);
        return;
    }
    await message.send({ format: messageFormat('伏击等待', '你已埋伏在战场边缘。当前战斗结束后，机器人会在你发送伏击的会话中通知并自动接管后续战斗。') });
}
catch (error) {
    await fail(message, error, '无法伏击');
} };
const leaveOccupiedBattleHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    await leaveOccupiedBattle(event.current.UserId);
    const panel = await movementPanel(event.current.UserId, '你避开了正在进行的战斗，可以继续移动。');
    const nearby = await nearbyPoints(event.current.UserId);
    await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
}
catch (error) {
    await fail(message, error, '无法离开战场');
} };
const forestGuideHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    const progress = await forestGuideAdvance(event.current.UserId, String(route.param('action')));
    if (!progress.battleChoice) {
        await message.send({ format: chapterFormat(progress.stage, progress.text) });
        return;
    }
    await message.send({ format: chapterFormat(5, progress.text) });
    const result = await forestGuideChoice(event.current.UserId, progress.battleChoice);
    await chooseTarget(event.current.UserId, result.spawnId);
    const battle = await battleStatus(event.current.UserId);
    await message.send({ format: battleStartFormat(`${result.text}\n本场剧情战斗将暂时关闭自动战斗。`, battle) });
}
catch (error) {
    await fail(message, error, '初章推进失败');
} };
const switchTargetHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const id = Number(route.param('id'));
        const side = route.param('side') === '友方' ? 'member' : 'target';
        let battle;
        try {
            battle = await battleStatus(event.current.UserId);
        }
        catch {
            battle = await selectPvpBattleOption(event.current.UserId, { targetId: id, side });
            await message.send({ format: battleOperationFormat('目标已切换。', battle) });
            return;
        }
        await switchCombatTarget(event.current.UserId, id, side);
        await message.send({ format: battleOperationFormat('目标已切换，请选择本回合行动。', await battleStatus(event.current.UserId)) });
    }
    catch (error) {
        await fail(message, error, '无法切换目标');
    }
};
const showRetreatArrival = async (message, qqUserId, retreatText) => {
    const encounter = await currentEncounter(qqUserId);
    if (encounter) {
        await showMoveResult(message, qqUserId, { ...encounter, kind: 'encounter', text: `${retreatText}\n\n${encounter.text}` });
        return;
    }
    const nearby = await nearbyPoints(qqUserId);
    const panel = await movementPanel(qqUserId, retreatText);
    await message.send({ format: panel.addButtonGroup(await movementButtons(qqUserId, nearby.character.activity_status !== 'active')) });
};
const actionHandler = (action) => async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        let pveBattle = null;
        try {
            pveBattle = await battleStatus(event.current.UserId);
        }
        catch { }
        if (pveBattle) {
            stopAutoBattle(event.current.UserId);
            if (!pveBattle.canAct) {
                const recovered = await resolvePartyAutoBattleActions(event.current.UserId);
                if (recovered) {
                    await sendCombatResult(message, event.current.UserId, recovered);
                    if (!recovered.ended && !recovered.waiting) {
                        const battle = await battleStatus(event.current.UserId);
                        if (battle.canAct)
                            await startAutoBattle(message, event.current.UserId);
                        else
                            scheduleStoryNpcBattle(message, event.current.UserId);
                    }
                    return;
                }
            }
            let result = await combatAction(event.current.UserId, action, Number(route.param('slot')) || undefined);
            if (!result.ended && result.waiting)
                result = await resolvePartyAutoBattleActions(event.current.UserId) ?? result;
            await sendCombatResult(message, event.current.UserId, result);
            if (action === 'escape' && result.ended) {
                await showRetreatArrival(message, event.current.UserId, '你脱离战斗，沿来路退回上一格。');
                return;
            }
            if (!result.ended && !result.waiting) {
                const battle = await battleStatus(event.current.UserId);
                if (battle.canAct)
                    await startAutoBattle(message, event.current.UserId);
                else
                    scheduleStoryNpcBattle(message, event.current.UserId);
            }
            return;
        }
        try {
            await pvpBattleStatus(event.current.UserId);
            stopPvpAutoBattle(event.current.UserId);
            const pvpResult = await pvpCombatAction(event.current.UserId, action, Number(route.param('slot')) || undefined);
            await sendPvpCombatResult(message, event.current.UserId, pvpResult);
            if (!pvpResult.ended)
                await startPvpAutoBattle(message, event.current.UserId);
            return;
        }
        catch (pvpError) {
            if (!(pvpError instanceof Error) || !pvpError.message.includes('当前不在玩家对战中')) {
                if (pvpError instanceof Error && pvpError.message.includes('对方正在发起攻击')) {
                    const pvpBattle = await pvpBattleStatus(event.current.UserId);
                    await message.send({ format: battleFormat('玩家对战', `${pvpError.message}\n请等待对方本回合行动结束。`, pvpBattle) });
                    return;
                }
                throw pvpError;
            }
        }
        stopAutoBattle(event.current.UserId);
        let result = await combatAction(event.current.UserId, action, Number(route.param('slot')) || undefined);
        if (!result.ended && result.waiting)
            result = await resolvePartyAutoBattleActions(event.current.UserId) ?? result;
        await sendCombatResult(message, event.current.UserId, result);
        if (action === 'escape' && result.ended) {
            await showRetreatArrival(message, event.current.UserId, '你脱离战斗，沿来路退回上一格。');
            return;
        }
        if (!result.ended && !result.waiting) {
            const battle = await battleStatus(event.current.UserId);
            if (battle.canAct)
                await startAutoBattle(message, event.current.UserId);
            else
                scheduleStoryNpcBattle(message, event.current.UserId);
        }
    }
    catch (error) {
        try {
            const messageText = error instanceof Error ? error.message : '操作无法完成。';
            const battle = await battleStatus(event.current.UserId);
            if (messageText === '你已失去行动能力。') {
                if (battle.members.every(member => member.defeated)) {
                    const defeated = await forceAutoBattleDefeat(event.current.UserId, '你已倒下，战斗无法继续。');
                    await sendCombatResult(message, event.current.UserId, defeated);
                    return;
                }
                await message.send({ format: battleOperationFormat('你已倒下，正在等待仍可行动的队友结束战斗。', battle) });
                return;
            }
            await message.send({ format: battleErrorFormat(messageText, battle) });
        }
        catch {
            await fail(message, error, '操作失败');
        }
    }
};
const attackHandler = actionHandler('attack');
const skillHandler = actionHandler('skill');
const itemHandler = actionHandler('item');
const escapeHandler = actionHandler('escape');
const deviceSkillChoiceFormat = (battle, slot) => {
    const device = battle.deviceSlots.find(item => item.slot === slot);
    if (!device)
        throw new Error('该异械栏位未配置。');
    const markdown = Format.createMarkdown().addTitle(`异械${'①②③④'.charAt(slot - 1)}·${device.deviceName}`).addNewline().addNewline()
        .addText(`充能：${device.currentEnergy}/${device.maxEnergy}`).addNewline().addNewline();
    const buttons = Format.createButtonGroup().addRow();
    for (const skill of device.skills) {
        markdown.addBlockquote(`【${skill.name}】消耗 ${skill.energyCost} 充能｜冷却 ${skill.cooldownTurns ? `${skill.cooldownTurns} 回合` : '无'}\n${skill.description}`).addNewline();
        buttons.addButton(skill.name, `/异械技能 ${slot} ${skill.code}`, { type: 'command', autoEnter: true, style: battle.canAct && skill.ready ? 'blue' : undefined });
    }
    buttons.addRow().addButton('返回战斗', '/战斗异械状态', { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const deviceTargetChoiceFormat = (battle, slot, skillCode) => {
    const device = battle.deviceSlots.find(item => item.slot === slot);
    const skill = device?.skills.find(item => item.code === skillCode);
    if (!device || !skill)
        throw new Error('异械技能配置已变化，请重新选择。');
    const markdown = Format.createMarkdown().addTitle(`异械·${skill.name}`).addNewline().addNewline().addBlockquote(skill.description).addNewline().addNewline().addText('选择作用目标：').addNewline();
    const buttons = Format.createButtonGroup();
    if (skill.targetScope === 'ally' || skill.targetScope === 'any') {
        const row = buttons.addRow();
        for (const member of battle.members.filter(member => !member.defeated))
            row.addButton(`友方·${member.name}`, `/异械目标 ${slot} ${skillCode} member ${member.id}`, { type: 'command', autoEnter: true, style: 'blue' });
    }
    if (skill.targetScope === 'enemy' || skill.targetScope === 'any') {
        const row = buttons.addRow();
        for (const target of battle.targets.filter(target => !target.defeated))
            row.addButton(`敌方·${target.name}`, `/异械目标 ${slot} ${skillCode} target ${target.id}`, { type: 'command', autoEnter: true, style: 'blue' });
    }
    buttons.addRow().addButton('返回异械', `/异械施放 ${slot}`, { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const resolveDeviceAction = async (message, qqUserId, slot, skillCode, targetKind, targetId) => {
    stopAutoBattle(qqUserId);
    let result = await combatAction(qqUserId, 'device', slot, undefined, undefined, skillCode, targetKind, targetId);
    if (!result.ended && result.waiting)
        result = await resolvePartyAutoBattleActions(qqUserId) ?? result;
    await sendCombatResult(message, qqUserId, result);
    if (!result.ended && !result.waiting) {
        const next = await battleStatus(qqUserId);
        if (next.canAct)
            await startAutoBattle(message, qqUserId);
        else
            scheduleStoryNpcBattle(message, qqUserId);
    }
};
const resolvePvpDeviceAction = async (message, qqUserId, slot, skillCode, targetKind) => {
    const result = await pvpCombatAction(qqUserId, 'device', slot, skillCode, targetKind);
    await sendPvpCombatResult(message, qqUserId, result);
    if (!result.ended)
        await startPvpAutoBattle(message, qqUserId);
};
const deviceBattleHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const battle = await battleStatus(event.current.UserId);
        const slot = Number(route.param('slot'));
        const device = battle.deviceSlots.find(item => item.slot === slot);
        if (!device)
            throw new Error('该异械栏位未配置。');
        if (device.skills.length > 1) {
            await message.send({ format: deviceSkillChoiceFormat(battle, slot) });
            return;
        }
        const skill = device.skills[0];
        if (device.currentEnergy < skill.energyCost || ['self', 'all_allies', 'all_enemies'].includes(skill.targetScope)) {
            await resolveDeviceAction(message, event.current.UserId, slot, skill.code);
            return;
        }
        await message.send({ format: deviceTargetChoiceFormat(battle, slot, skill.code) });
    }
    catch (pveError) {
        try {
            const battle = await pvpBattleStatus(event.current.UserId);
            const slot = Number(route.param('slot'));
            const device = battle.deviceSlots.find(item => item.slot === slot);
            if (!device)
                throw new Error('该异械栏位未配置。');
            if (device.skills.length > 1) {
                await message.send({ format: deviceSkillChoiceFormat(battle, slot) });
                return;
            }
            const skill = device.skills[0];
            if (skill.targetScope === 'any') {
                await message.send({ format: deviceTargetChoiceFormat(battle, slot, skill.code) });
                return;
            }
            await resolvePvpDeviceAction(message, event.current.UserId, slot, skill.code);
        }
        catch (error) {
            try {
                const battle = await pvpBattleStatus(event.current.UserId);
                await message.send({ format: battleErrorFormat(error instanceof Error ? error.message : '异械无法启动。', battle) });
            }
            catch {
                await fail(message, pveError, '异械无法启动');
            }
        }
    }
};
const deviceSkillHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const slot = Number(route.param('slot'));
        const skillCode = String(route.param('skillCode'));
        const battle = await battleStatus(event.current.UserId);
        const device = battle.deviceSlots.find(item => item.slot === slot);
        const skill = device?.skills.find(item => item.code === skillCode);
        if (!device || !skill)
            throw new Error('该异械技能未配置。');
        if (device.currentEnergy < skill.energyCost || ['self', 'all_allies', 'all_enemies'].includes(skill.targetScope)) {
            await resolveDeviceAction(message, event.current.UserId, slot, skillCode);
            return;
        }
        await message.send({ format: deviceTargetChoiceFormat(battle, slot, skillCode) });
    }
    catch (pveError) {
        try {
            const slot = Number(route.param('slot'));
            const skillCode = String(route.param('skillCode'));
            const battle = await pvpBattleStatus(event.current.UserId);
            const device = battle.deviceSlots.find(item => item.slot === slot);
            const skill = device?.skills.find(item => item.code === skillCode);
            if (!device || !skill)
                throw new Error('该异械技能未配置。');
            if (skill.targetScope === 'any') {
                await message.send({ format: deviceTargetChoiceFormat(battle, slot, skillCode) });
                return;
            }
            await resolvePvpDeviceAction(message, event.current.UserId, slot, skillCode);
        }
        catch (error) {
            try {
                const battle = await pvpBattleStatus(event.current.UserId);
                await message.send({ format: battleErrorFormat(error instanceof Error ? error.message : '异械无法启动。', battle) });
            }
            catch {
                await fail(message, pveError, '异械无法启动');
            }
        }
    }
};
const deviceTargetHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        await resolveDeviceAction(message, event.current.UserId, Number(route.param('slot')), String(route.param('skillCode')), String(route.param('targetKind')), Number(route.param('targetId')));
    }
    catch (pveError) {
        try {
            await resolvePvpDeviceAction(message, event.current.UserId, Number(route.param('slot')), String(route.param('skillCode')), String(route.param('targetKind')));
        }
        catch (error) {
            try {
                const battle = await pvpBattleStatus(event.current.UserId);
                await message.send({ format: battleErrorFormat(error instanceof Error ? error.message : '异械无法启动。', battle) });
            }
            catch {
                await fail(message, pveError, '异械无法启动');
            }
        }
    }
};
const combatDeviceStatusHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const battle = await battleStatus(event.current.UserId);
        await message.send({ format: battleOperationFormat('异械充能不会随回合自然恢复；能量不足时点击异械会消耗本回合，为该异械恢复 30 点充能。', battle) });
    }
    catch (pveError) {
        try {
            const battle = await pvpBattleStatus(event.current.UserId);
            await message.send({ format: battleOperationFormat('异械充能不会随回合自然恢复；能量不足时点击异械会消耗本回合，为该异械恢复 30 点充能。', battle) });
        }
        catch {
            await fail(message, pveError, '无法查看异械状态');
        }
    }
};
const encounterHandler = (action, title) => async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const text = await encounterAction(event.current.UserId, Number(route.param('id')), action);
        if (action === 'avoid' && text.includes('退回上一格')) {
            await showRetreatArrival(message, event.current.UserId, text);
            return;
        }
        try {
            const battle = await battleStatus(event.current.UserId);
            const failedNegotiation = action === 'persuade' && text.startsWith('交涉失败！');
            await message.send({ format: failedNegotiation ? negotiationFailureFormat(text, battle) : battleFormat(title, text, battle) });
            if (failedNegotiation)
                await startAutoBattle(message, event.current.UserId);
        }
        catch {
            await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle(title).addNewline().addNewline().addText(text)).addButtonGroup(moveButtons()) });
        }
    }
    catch (error) {
        await fail(message, error, `${title}失败`);
    }
};

export { adjustMovementHandler, adventurerCardHandler, ambushHandler, appendBattleState, attackHandler, battleOperationFormat, battleStartFormat, buildingHandler, cancelMiningHandler, cancelTravelHandler, combatDeviceStatusHandler, confirmPlayerPvpHandler, continueStoryHandler, coordinateInteractionHandler, deviceBattleHandler, deviceSkillHandler, deviceTargetHandler, dungeonChestHandler, dungeonDownHandler, dungeonEnterHandler, dungeonEscapeHandler, dungeonLeaveHandler, dungeonPvpHandler, dungeonUpHandler, encounterHandler, escapeHandler, exploreHandler, forestGuideHandler, goToHandler, goToMapHandler, guildBarrierHandler, guildChatHandler, guildRegistrationHandler, huntHandler, inventoryHandler, itemHandler, leaveOccupiedBattleHandler, mineResourceHandler, moveHandler, nearbyMonsterAttackHandler, npcEncounterHandler, npcLeaveHandler, pearGuideChatHandler, pearGuideHandler, pearGuideLeaveHandler, pearGuidePreviewHandler, playerInteractionHandler, playerPvpHandler, professionHandler, queueAmbushHandler, refreshMiningHandler, refreshTravelHandler, scheduleTravelCompletion, skillHandler, switchTargetHandler, targetHandler };
