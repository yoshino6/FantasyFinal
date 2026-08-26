import { Format, logger, MessageDirect, useEvent, useMessage, useRoute } from 'alemonjs';
import { readFile } from 'node:fs/promises';
import { durationText } from '../game/time-format';
import { addNpcAffinity, adjustMovementStep, battleStatus, blockedDungeonDirections, cancelResourceMining, cancelTravel, claimCombatAmbushHandoffs, combatAction, chooseTarget, completeTravel, continueForestArrival, coordinateInteraction, currentEncounter, encounterAction, explore, forceAutoBattleDefeat, forestGuideAdvance, forestGuideChoice, forestGuideProgress, huntMonster, inventory, leaveOccupiedBattle, mineResource, move, moveTo, moveToMap, moveToNearbyMonster, movementProfile, nearbyPoints, queueAmbush, requireNpcAtCurrentPosition, resourceMiningStatus, switchCombatTarget, talkToNpc, travelStatus, type CombatAmbushHandoff, type CoordinateInteractionTarget, type VictorySettlement } from '../game/adventure.service';
import { autoBattleConfig, isFullPartyAutoBattle, pendingPartyAutoBattleActions } from '../game/auto-battle.service';
import { messageFormat } from '../game/message';
import { currentLocationText, movedLocationText, outsidePanel, panelButtons } from './panel';
import pearGuideImage from '../assets/game/story/pear-guide.png';
import { adventurerProfile, chooseProfession, registerAdventurer } from '../game/character.service';
import { adventurerCardImage } from '../game/adventurer-card.service';
import { realmEnergyDissipationText } from '../game/constants';
import { currentMainQuest } from '../game/main-quest.service';
import { npcChatDialogue } from '../game/npc-dialogue.service';
import { changeDungeonFloor, dungeonPvP, dungeonTrackingHint, enterDungeon, interactDungeonPlayer, openDungeonChest } from '../game/dungeon.service';
import { dungeonSecretProgress } from '../game/dungeon-quest.service';
import { cityWantedAlert, pvpBattleStatus, pvpCombatAction, reserveWarrantEntryNotice, startAmbushPvpBattle, startPvpBattle } from '../game/pvp.service';
import { createFormatWithoutGroupMention } from '../middleware/group-reply-mention';
import { knownGroupChannels, rememberGroupChannel } from '../game/group-channel.service';
import { warrantNoticeFormat } from './warrant-notice';
import { gameAssetUrls, isPublicImageUrl } from '../config/game-assets';

const pearGuideImagePath = decodeURIComponent(pearGuideImage).replace(/^([a-zA-Z]):(?![\\/])/, '$1:\\');
const pearGuideImageBuffer = () => readFile(pearGuideImagePath);
/** 通缉公告必须走群主动发送，不能复用当前玩家的回复消息。 */
const publishWantedCityEntryNotice = async (wanted: NonNullable<Awaited<ReturnType<typeof cityWantedAlert>>>) => {
  const [event] = useEvent();
  const channelId = String(event.current.ChannelId ?? '');
  const isPrivate = Boolean(event.current.IsPrivate);
  const botId = String(event.current.BotId ?? '');
  if (!isPrivate && channelId) await rememberGroupChannel(channelId, botId);
  const knownGroups = await knownGroupChannels(botId);
  const targets = [...new Set([...(isPrivate ? [] : [channelId]), ...knownGroups].filter(Boolean))];
  if (!targets.length) return;
  for (const targetId of targets) {
    try {
      if (!await reserveWarrantEntryNotice(wanted.warrantId, targetId)) continue;
      // 不使用 Format.create：该工厂会自动 @ 当前消息发送者，而此处是独立的群公告。
      const results = await MessageDirect.create().sendToTarget({ target: { scope: 'group', targetId, BotId: botId }, format: warrantNoticeFormat(wanted, { independent: true }) });
      if (results.some(result => result.code !== 2000)) throw new Error(results.map(result => String(result.message)).join('；'));
    } catch (error) { logger.warn({ err: error, channelId: targetId }, '主动发送城镇通缉公告失败'); }
  }
};

const fail = async (message: any, error: unknown, title = '操作失败') => message.send({ format: messageFormat(title, error instanceof Error ? error.message : '请稍后重试。') });
const storyLockedMessage = async (message: any, title: string) => message.send({
  format: messageFormat(title, '你正在推进「初章·包容之镇」，请先完成当前剧情。')
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('继续剧情', '/继续剧情', { type: 'command', autoEnter: true, style: 'blue' }))
});
const isForestGuideLocked = (error: unknown) => error instanceof Error && error.message.includes('你正在推进「初章·包容之镇」');
const moveButtons = panelButtons;
const movementButtons = async (qqUserId: string, resting = false) => {
  const [config, blockedDirections] = await Promise.all([autoBattleConfig(qqUserId), blockedDungeonDirections(qqUserId)]);
  return panelButtons(resting, Boolean(config.settings.enabled), blockedDirections);
};
const battleButtons = (battle: Awaited<ReturnType<typeof battleStatus>>) => {
  const activeSkills = new Set(battle.readySkillSlots); const activeItems = new Set(battle.itemSlots); const actionStyle = battle.canAct ? 'blue' : undefined;
  const buttons = Format.createButtonGroup()
    .addRow().addButton('普攻', '/攻击', { type: 'command', autoEnter: true, style: actionStyle }).addButton('技能①', '/技能 1', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(1) ? 'blue' : undefined }).addButton('技能②', '/技能 2', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(2) ? 'blue' : undefined }).addButton('技能③', '/技能 3', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(3) ? 'blue' : undefined }).addButton('技能④', '/技能 4', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(4) ? 'blue' : undefined })
    .addRow().addButton('道具①', '/道具 1', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(1) ? 'blue' : undefined }).addButton('道具②', '/道具 2', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(2) ? 'blue' : undefined }).addButton('道具③', '/道具 3', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(3) ? 'blue' : undefined }).addButton('道具④', '/道具 4', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(4) ? 'blue' : undefined }).addButton('逃跑', '/逃跑', { type: 'command', autoEnter: true, style: actionStyle });
  if (battle.appraisal.learned) buttons.addRow().addButton('鉴识', '/鉴识', { type: 'command', autoEnter: true, style: 'blue' });
  return buttons;
};
const encounterButtons = (spawnId: number, canAmbush = false, occupied = false, cityPursuit = false) => {
  if (occupied) return Format.createButtonGroup().addRow().addButton('伏击', `/伏击 ${spawnId}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('离开', '/离开战斗', { type: 'command', autoEnter: true });
  const buttons = Format.createButtonGroup().addRow().addButton(canAmbush ? '偷袭' : '战斗', canAmbush ? `/偷袭 ${spawnId}` : `/目标 ${spawnId}`, { type: 'command', autoEnter: true, style: 'blue' });
  if (!cityPursuit) buttons.addButton('交涉', `/交涉 ${spawnId}`, { type: 'command', autoEnter: true });
  return buttons.addButton('躲避', `/躲避 ${spawnId}`, { type: 'command', autoEnter: true });
};
const battleStateText = (battle: Awaited<ReturnType<typeof battleStatus>>) => {
  const members = battle.members.map(member => {
    return `【${member.name}】HP ${member.hp}/${member.hpMax}｜MP ${member.mp}/${member.mpMax}${member.defeated ? '（倒下）' : member.pending ? '（已行动）' : ''}`;
  });
  return members.join('\n');
};
const appendBattleState = (markdown: ReturnType<typeof Format.createMarkdown>, battle: Awaited<ReturnType<typeof battleStatus>>) => {
  markdown.addText(`${battleStateText(battle)}\n`);
  for (const [index, target] of battle.targets.entries()) markdown.addButton(`${battle.selectedTargetId === target.id ? '▶' : ''}敌方${index + 1} ${target.name}`, { data: `/切换目标 ${target.id}`, autoEnter: false }).addText(` HP ${target.hp}/${target.hpMax}${target.defeated ? '（击败）' : ''}\n`);
  return markdown;
};
const appendCombatLog = (markdown: ReturnType<typeof Format.createMarkdown>, text: string) => {
  // QQ 对“一个引用块内含多行和标题”的解析不稳定，会让后续内容脱离引用。
  // 逐行构建引用，确保行动、分支与回合前效果都保持统一的战斗过程样式。
  const lines = text.trim().split('\n').flatMap(line => {
    const matched = /^(\s*)(?:§)?([#$&])([^#$&]+)\2(.*)$/.exec(line);
    if (matched) {
      const description = matched[4].trimStart();
      // 效果名单独以引用内标题显示，说明仍保留为引用正文；不显示内部标记符。
      return description ? [`### ${matched[3].trim()}`, description] : [`### ${matched[3].trim()}`];
    }
    return [line.replaceAll('$', '\\$').replaceAll('#', '\\#').replaceAll('&', '\\&').replaceAll('§', '')];
  });
  for (const line of lines) {
    if (!line.trim()) markdown.addNewline();
    else markdown.addBlockquote(line).addNewline();
  }
  return markdown;
};
const battleFormat = (_title: string, text: string, battle: Awaited<ReturnType<typeof battleStatus>>) => {
  const lines = text.split('\n'); const turn = /^战斗<(\d+)>回合$/.exec(lines[0]); if (turn) lines.shift();
  const markdown = Format.createMarkdown().addTitle(`战斗<${turn ? Number(turn[1]) : battle.turn}>回合`);
  if (lines.join('\n')) appendCombatLog(markdown, lines.join('\n')).addNewline();
  return Format.create().addMarkdown(appendBattleState(markdown, battle)).addButtonGroup(battleButtons(battle));
};
const battleOperationFormat = (text: string, battle: Awaited<ReturnType<typeof battleStatus>>) => {
  const markdown = Format.createMarkdown().addTitle(`战斗<${battle.turn}>回合`).addNewline().addNewline().addText(text).addNewline().addNewline();
  return Format.create().addMarkdown(appendBattleState(markdown, battle)).addButtonGroup(battleButtons(battle));
};
const ambushStartFormat = (battle: Awaited<ReturnType<typeof battleStatus>>) => {
  const markdown = Format.createMarkdown().addTitle('战斗开始').addNewline().addNewline()
    .addBlockquote('你看准目标，疾速突进——').addNewline()
    .addBlockquote('（首回合直击伤害+50%）').addNewline().addNewline();
  return Format.create().addMarkdown(appendBattleState(markdown, battle)).addButtonGroup(battleButtons(battle));
};
const battleStartFormat = (text: string, battle: Awaited<ReturnType<typeof battleStatus>>) => {
  const markdown = Format.createMarkdown().addTitle('战斗开始').addNewline().addNewline().addBlockquote(text).addNewline().addNewline();
  return Format.create().addMarkdown(appendBattleState(markdown, battle)).addButtonGroup(battleButtons(battle));
};
const negotiationFailureFormat = (text: string, battle: Awaited<ReturnType<typeof battleStatus>>) => {
  const markdown = Format.createMarkdown().addTitle('交涉失败！').addNewline().addNewline()
    .addTitle('战斗<1>回合').addNewline().addNewline().addBlockquote(text).addNewline().addNewline();
  return Format.create().addMarkdown(appendBattleState(markdown, battle)).addButtonGroup(battleButtons(battle));
};
const battleErrorFormat = (text: string, battle: Awaited<ReturnType<typeof battleStatus>>) => {
  const markdown = Format.createMarkdown().addTitle('操作失败').addNewline().addNewline().addText(`${text}\n\n`);
  return Format.create().addMarkdown(appendBattleState(markdown, battle)).addButtonGroup(battleButtons(battle));
};
const finalBattleFormat = (log: string) => {
  const lines = log.split('\n'); const turn = /^战斗<(\d+)>回合$/.exec(lines[0]); const title = turn ? `战斗<${Number(turn[1])}>回合` : '战斗'; if (turn) lines.shift();
  const markdown = Format.createMarkdown().addTitle(title);
  if (lines.join('\n')) appendCombatLog(markdown, lines.join('\n'));
  return Format.create().addMarkdown(markdown);
};
const victoryButtons = (arrivalPending = false) => Format.createButtonGroup().addRow().addButton(arrivalPending ? '继续' : '操作面板', arrivalPending ? '/继续剧情' : '/面板', { type: 'command', autoEnter: true, style: 'blue' });
const isVictorySettlement = (value: unknown): value is VictorySettlement => Boolean(value) && typeof value === 'object' && (value as VictorySettlement).kind === 'victory';
const victoryFormat = (settlement: VictorySettlement) => {
  const markdown = Format.createMarkdown().addTitle('战斗胜利').addNewline().addNewline();
  for (const reward of settlement.members) {
    if (reward.staminaInsufficient) {
      markdown.addText(`【${reward.name}】\n`).addBlockquote('体力不足，本次未参与经验与战利品结算。').addNewline().addNewline();
      continue;
    }
    markdown.addText(`【${reward.name}】${reward.levelText ? ` ${reward.levelText}` : ''}\n`).addBlockquote(reward.realmLocked ? realmEnergyDissipationText : `EXP+${reward.experience}`).addNewline();
    for (const drop of reward.drops) {
      markdown.addBlockquote('获得');
      markdown.addButton(`[${drop.name}]`, { data: drop.itemType === 'equipment' && drop.instanceId ? `/装备详情 ${drop.instanceId}` : `/物品图鉴 ${drop.codexId}`, autoEnter: false }).addText(`×${drop.quantity}`).addNewline();
    }
    for (const skill of reward.learned) markdown.addText('领悟').addButton(`[${skill.name}]`, { data: `/技能详情 ${skill.id}`, autoEnter: false }).addText('\n');
    markdown.addNewline();
  }
  if (settlement.members.some(reward => reward.levelText?.includes('Lv.8'))) markdown.addText('发现新支线【职业之外的道路】\n去百纳镇的各个店铺转转，或许能找到适合自己的副职业。').addNewline();
  if (settlement.dungeonSecretCompleted) markdown.addText('【地下的秘密】已完成。').addNewline();
  if (settlement.pursuitCooldownMinutes) markdown.addText(`你击退了城镇执法者，暂时脱离追捕。${settlement.pursuitCooldownMinutes} 分钟内不会再遭到强制拦截。`).addNewline();
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
const chapterFormat = (stage: number, text: string) => {
  const markdown = Format.createMarkdown().addTitle(`初章·包容之镇（${stage}/5）`).addNewline().addNewline().addText(text);
  const buttons = Format.createButtonGroup().addRow();
  if (stage === 1) buttons.addButton('循声而去', '/初章 包容之镇 循声而去', { type: 'command', autoEnter: true, style: 'blue' });
  if (stage === 2) buttons.addButton('上前打招呼', '/初章 包容之镇 上前打招呼', { type: 'command', autoEnter: true, style: 'blue' });
  if (stage === 3) buttons.addButton('我也不清楚，睁开眼时就在这儿了', '/初章 包容之镇 我也不清楚，睁开眼时就在这儿了', { type: 'command', autoEnter: true, style: 'blue' });
  if (stage === 4) {
    buttons.addButton('加入', '/初章 包容之镇 加入', { type: 'command', autoEnter: true, style: 'blue' });
    buttons.addButton('婉拒并询问城镇位置', '/初章 包容之镇 婉拒并询问城镇位置', { type: 'command', autoEnter: true });
  }
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const forestGuideChapterTexts: Record<number, string> = {
  1: '你在林中听见了兵刃碰撞的声音。\n那声响被湿润的枝叶过滤得断断续续，却仍清晰地指向前方。\n是有人在附近战斗吗？',
  2: '你拨开最后一丛沾着露水的灌木，望见有三人正擦拭着武器。\n为首的青年手持剑盾，红发少女指尖还缠着未散的火星，白袍少女则正替受伤的同伴施展治愈术。\n\n他们循着动静也发现了你。',
  3: '战士把盾牌背回身后，笑着做了自我介绍。\n他叫莱昂，是一名战士；那位红发少女伊芙是法师；白袍的希娅则是牧师。\n\n他们说自己接下了讨伐森林史莱姆的悬赏，正循着痕迹搜寻。\n莱昂打量着我身上未干的露水，略显困惑：\n\n“你为什么会一个人在这种地方？”\n\n我沉默片刻，不好坦白自己转生到这里的事实。',
  4: '“我也不清楚，”\n我如此回答，\n“我今早一睁开眼，就已经在这片森林里了。”\n\n他们三人交换了一个复杂的眼神，没有继续追问。\n希娅轻声说，百纳镇就在密林南方——那是一座接纳各族居民的包容小镇，半兽人、矮人、精灵与人类都能在那里找到落脚处。\n\n莱昂朝森林深处扬了扬下巴：“我们先解决那只史莱姆。你要不要和我们一起？结束后，我们带你去百纳镇。”'
};

const townArrivalFormat = async (stage: number, text: string, completed = false, guildStory = false) => {
  if (completed) return null;
  const hasInlinePearImage = guildStory && stage === 1 && isPublicImageUrl(gameAssetUrls.pearGuideImageUrl);
  const markdown = Format.createMarkdown().addTitle(guildStory ? `初临·百纳镇·冒险者工会（${stage}/3）` : `初临·百纳镇（${stage}/6）`).addNewline().addNewline();
  // 只有 Markdown 内嵌的公开图片，才能与正文和按钮作为同一条 QQ 消息发送。
  if (hasInlinePearImage) markdown.addImage(gameAssetUrls.pearGuideImageUrl, { width: 320, height: 213 }).addNewline().addNewline();
  markdown.addText(text);
  const label = guildStory ? '继续' : stage === 4 ? '你说什么？勇者是什么意思？' : stage === 6 ? '挥手告别' : '继续';
  if (hasInlinePearImage) {
    markdown.addNewline().addNewline().addButton(`[${label}]`, { data: '/继续剧情', autoEnter: false });
    return Format.create().addMarkdown(markdown);
  }
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton(label, '/继续剧情', { type: 'command', autoEnter: true, style: 'blue' }));
};

const buildingEncounterFormat = (name: string, code: string, location: string) => {
  const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(location).addNewline().addNewline().addText(name);
  const buttons = Format.createButtonGroup().addRow().addButton(code === 'hunter_lodge' ? '敲门' : '进入', `/建筑进入 ${code}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('忽略', `/建筑忽略 ${code}`, { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const simpleNpcName = (name: string) => name.replace(/（[^）]*）/g, '').trim();
const npcInteractionFormat = async (qqUserId: string, npc: { code: string; name: string }, text: string, continuingChat = false) => {
  const nearby = await nearbyPoints(qqUserId);
  const name = simpleNpcName(npc.name);
  const markdown = Format.createMarkdown().addTitle(name).addNewline().addNewline().addText(`【${name}】`);
  if (nearby.npcDetailsUnlocked) markdown.addText(' ').addButton('[详情]', { data: `/NPC详情 ${npc.code}`, autoEnter: false });
  markdown.addNewline().addNewline().addBlockquote(text);
  if (continuingChat) return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('继续闲聊', npc.code === 'pear_guide' ? '/梨子喵闲聊' : `/NPC对话 ${npc.code}`, { type: 'command', autoEnter: true, style: 'blue' }));
  const buttons = Format.createButtonGroup().addRow();
  buttons.addButton('离开', `/NPC离开 ${npc.code}`, { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const unimplementedBuildingFormat = (building: { code: string; name: string; description: string }) => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle(building.name).addNewline().addNewline().addBlockquote(building.description))
  .addButtonGroup(Format.createButtonGroup().addRow().addButton('离开', `/建筑离开 ${building.code}`, { type: 'command', autoEnter: true }));
const travelFormat = (title: string, regionName: string, x: number, y: number, total: number, remaining: number, activityType: 'move' | 'hunt' = 'move', destinationName?: string) => {
  const hunting = activityType === 'hunt';
  return Format.create()
    .addMarkdown(Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(`${hunting ? title : `${title}${regionName}${destinationName ? `·${destinationName}` : ''}（${x}, ${y}）`}\n预计耗时${durationText(total)}\n当前剩余${durationText(remaining)}`))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('刷新', '/刷新行动', { type: 'command', autoEnter: true, style: 'blue' }).addButton(hunting ? '取消寻怪' : '取消移动', hunting ? '/取消寻怪' : '/取消移动', { type: 'command', autoEnter: true, style: 'blue' }));
};
const travelBlockedFormat = (title: string, travel: NonNullable<Awaited<ReturnType<typeof travelStatus>>>) => {
  const hunting = travel.activityType === 'hunt';
  const destination = `${travel.regionName}${travel.destinationName ? `·${travel.destinationName}` : ''}（${travel.x}, ${travel.y}）`;
  const detail = hunting
    ? `你正在寻怪，目标为${destination}，请等待抵达或取消寻怪。`
    : `你正在前往${destination}，请等待抵达或取消移动。`;
  return Format.create()
    .addMarkdown(Format.createMarkdown().addTitle(title).addNewline().addNewline().addText(detail).addNewline().addText(`预计耗时${durationText(travel.seconds)}`).addNewline().addText(`当前剩余${durationText(travel.remaining)}`))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('刷新', '/刷新行动', { type: 'command', autoEnter: true, style: 'blue' }).addButton(hunting ? '取消寻怪' : '取消移动', hunting ? '/取消寻怪' : '/取消移动', { type: 'command', autoEnter: true, style: 'blue' }));
};
const showTravelBlocked = async (message: any, qqUserId: string, title: string) => {
  const travel = await travelStatus(qqUserId);
  if (!travel || travel.remaining <= 0) return false;
  await message.send({ format: travelBlockedFormat(title, travel) });
  return true;
};
const showMiningBlocked = async (message: any, qqUserId: string, title: string) => {
  const mining = await resourceMiningStatus(qqUserId);
  if (!mining) return false;
  const markdown = Format.createMarkdown().addTitle(title).addNewline().addNewline()
    .addText('你正在开采').addNewline().addBlockquote(`【${mining.kind === '植被' ? '植被' : '锻材'}】${mining.name}`).addNewline()
    .addText(`预计耗时${durationText(mining.seconds)}`).addNewline().addText(`当前剩余${durationText(mining.remaining)}`);
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('刷新开采', '/刷新开采', { type: 'command', autoEnter: true, style: 'blue' }).addButton('取消开采', '/取消开采', { type: 'command', autoEnter: true, style: 'blue' })) });
  return true;
};
const showOngoingActivity = async (message: any, qqUserId: string, title: string) => (await showTravelBlocked(message, qqUserId, title)) || showMiningBlocked(message, qqUserId, title);
const travelTimers = new Map<string, ReturnType<typeof setTimeout>>();
const travelReplyTimers = new Set<ReturnType<typeof setTimeout>>();
const PASSIVE_TRAVEL_REPLY_RETRY_DELAYS = [2, 5, 10, 20] as const;

/** 位置已经结算后，保留本次到达结果并用原消息的被动回复通道有限重试。 */
const scheduleCompletedTravelReply = (message: any, qqUserId: string, result: any, attempt = 0) => {
  const delay = PASSIVE_TRAVEL_REPLY_RETRY_DELAYS[attempt];
  if (delay === undefined) {
    logger.warn({ qqUserId }, '到达结果的被动回复多次失败，已停止重试');
    return;
  }
  let timer: ReturnType<typeof setTimeout>;
  timer = setTimeout(async () => {
    try {
      await showMoveResult(message, qqUserId, result);
    } catch (error) {
      logger.warn({ err: error, qqUserId, attempt: attempt + 1 }, '到达结果被动回复失败，准备重试');
      scheduleCompletedTravelReply(message, qqUserId, result, attempt + 1);
    } finally {
      travelReplyTimers.delete(timer);
    }
  }, delay * 1000);
  travelReplyTimers.add(timer);
};

export const scheduleTravelCompletion = (message: any, qqUserId: string, seconds: number) => {
  const previous = travelTimers.get(qqUserId); if (previous) clearTimeout(previous);
  let retrySeconds: number | null = null;
  let timer: ReturnType<typeof setTimeout>;
  timer = setTimeout(async () => {
    try {
      const result = await completeTravel(qqUserId);
      if (result) {
        try { await showMoveResult(message, qqUserId, result); }
        catch (error) {
          logger.warn({ err: error, qqUserId }, '到达结果被动回复失败，准备重试');
          scheduleCompletedTravelReply(message, qqUserId, result);
        }
        return;
      }
      // 数据库时间仍未到点（或计时器过早触发）时，按剩余时间重新挂起，不能静默丢掉到达通知。
      const travel = await travelStatus(qqUserId);
      if (travel) retrySeconds = Math.max(1, travel.remaining) + 1;
    } catch (error) {
      logger.warn({ err: error, qqUserId }, 'complete travel failed');
      // 连接短暂波动时保留提示机会；持久化补偿任务也会兜底更新坐标。
      try { const travel = await travelStatus(qqUserId); if (travel) retrySeconds = Math.max(1, travel.remaining) + 1; } catch { /* 下一轮后台补偿会继续处理 */ }
    } finally {
      if (travelTimers.get(qqUserId) === timer) travelTimers.delete(qqUserId);
      if (retrySeconds !== null) scheduleTravelCompletion(message, qqUserId, retrySeconds);
    }
  }, (Math.max(1, seconds) * 1000) + 250);
  travelTimers.set(qqUserId, timer);
};

// 自动战斗在每次结算后重新挂起，避免同一玩家叠加多个计时器而重复出招。
const autoBattleTimers = new Map<string, ReturnType<typeof setTimeout>>();
const autoBattleVisibleRounds = new Map<string, number>();
// 开战提示与首回合立即结算各占一条 QQ 被动回复；只再展示一回合，
// 下一回合便进入省略结算，确保“省略提示 + 最终结算”仍在五条限制内。
const AUTO_BATTLE_VISIBLE_ROUND_LIMIT = 1;
const stopAutoBattle = (qqUserId: string) => {
  const timer = autoBattleTimers.get(qqUserId);
  if (timer) clearTimeout(timer);
  autoBattleTimers.delete(qqUserId);
  autoBattleVisibleRounds.delete(qqUserId);
};
// 剧情 NPC 队伍仍在战斗时，主角倒下后由队友继续自动推进战斗。
const storyNpcBattleTimers = new Map<string, ReturnType<typeof setTimeout>>();
const scheduleStoryNpcBattle = (message: any, qqUserId: string) => {
  if (storyNpcBattleTimers.has(qqUserId)) return;
  const timer = setTimeout(async () => {
    storyNpcBattleTimers.delete(qqUserId);
    try {
      const battle = await battleStatus(qqUserId);
      if (battle.canAct) return;
      const result = await combatAction(qqUserId, 'attack');
      await sendCombatResult(message, qqUserId, result);
      if (!result.ended && !result.waiting) scheduleStoryNpcBattle(message, qqUserId);
    } catch (error) {
      // 非剧情队伍的倒下角色不会继续推进；其余错误保留在日志中便于定位。
      if (!(error instanceof Error) || !/(当前不在战斗中|你已失去行动能力)/.test(error.message)) logger.warn({ err: error, qqUserId }, 'story npc battle advance failed');
    }
  }, 1000);
  storyNpcBattleTimers.set(qqUserId, timer);
};
const sendCombatResult = async (message: any, qqUserId: string, result: Awaited<ReturnType<typeof combatAction>>, options: { omitFinalLog?: boolean } = {}) => {
  if (result.ended) {
    if (!options.omitFinalLog) await message.send({ format: finalBattleFormat(result.log) });
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
    if (victory && settlement.members.some(member => member.realmCapReached)) await message.send({ format: realmBarrierFormat() });
    const ambushSessionId = 'ambushSessionId' in result ? result.ambushSessionId : undefined;
    if (ambushSessionId) await dispatchCombatAmbushHandoffs(ambushSessionId);
    return;
  }
  const battle = await battleStatus(qqUserId);
  await message.send({ format: battleFormat(result.waiting ? '行动已确认' : '战斗回合', result.log, battle) });
  // 这一轮将主角击倒时，不能再等待玩家按钮；由仍存活的剧情队友每秒继续一轮。
  if (!result.waiting && !battle.canAct) scheduleStoryNpcBattle(message, qqUserId);
};
const resolvePartyAutoBattleActions = async (qqUserId: string) => {
  let latest: Awaited<ReturnType<typeof combatAction>> | null = null;
  for (const entry of await pendingPartyAutoBattleActions(qqUserId)) {
    try {
      latest = await combatAction(entry.qqUserId, entry.action.type, undefined, entry.action.type === 'skill' ? entry.action.skillId : undefined, entry.action.type === 'item' ? entry.action.itemId : undefined);
    } catch (error) {
      // 自动配置的技能处于冷却或蓝量不足时，仅让对应队员退回普通攻击。
      if (!(error instanceof Error) || !error.message.startsWith('自动')) throw error;
      latest = await combatAction(entry.qqUserId, 'attack');
    }
    if (latest.ended || !latest.waiting) return latest;
  }
  return latest;
};
const resolveRemainingAutoBattle = async (qqUserId: string) => {
  // 省略阶段不再逐回合发消息，以免触发 QQ 被动回复上限；仍逐回合复用同一套战斗计算。
  for (let round = 0; round < 200; round += 1) {
    const result = await resolvePartyAutoBattleActions(qqUserId);
    if (!result || result.ended || result.waiting) return result;
  }
  return null;
};
const resolveFullAutoBattle = async (qqUserId: string) => {
  const logs: string[] = [];
  for (let round = 0; round < 100; round += 1) {
    const result = await resolvePartyAutoBattleActions(qqUserId);
    if (!result) return { result: null, log: logs.join('\n\n') };
    if (result.log) logs.push(result.log);
    if (result.ended || result.waiting) return { result, log: logs.join('\n\n') };
    // 分批让出事件循环，避免长战斗连续排队时延迟其他玩家的消息处理。
    if ((round + 1) % 10 === 0) await new Promise<void>(resolve => setImmediate(resolve));
  }
  const exhausted = await forceAutoBattleDefeat(qqUserId);
  logs.push(exhausted.log);
  return { result: exhausted, log: logs.join('\n\n') };
};
const fullAutoBattleFormat = (log: string) => Format.create().addMarkdown(
  // 代码块在 QQ 中会呈现为可复制、可全屏查看的 Markdown 文本框。
  Format.createMarkdown().addTitle('自动战斗过程').addNewline().addNewline().addCode(log.trim(), { language: 'text' })
);
const scheduleAutoBattle = (message: any, qqUserId: string, omitted = false) => {
  if (!omitted) {
    stopAutoBattle(qqUserId);
    autoBattleVisibleRounds.set(qqUserId, 0);
  }
  const advance = () => {
    autoBattleTimers.set(qqUserId, setTimeout(async () => {
      try {
        const result = await resolvePartyAutoBattleActions(qqUserId);
        if (!result) { stopAutoBattle(qqUserId); return; }
        const visibleRounds = autoBattleVisibleRounds.get(qqUserId) ?? 0;
        if (!omitted && !result.ended && !result.waiting && visibleRounds >= AUTO_BATTLE_VISIBLE_ROUND_LIMIT) {
          await message.send({ format: messageFormat('战斗过长，已省略', '后续回合战斗已省略，正在计算战斗结果。') });
          const finalResult = await resolveRemainingAutoBattle(qqUserId);
          if (finalResult?.ended) await sendCombatResult(message, qqUserId, finalResult, { omitFinalLog: true });
          else if (finalResult && !finalResult.waiting) scheduleAutoBattle(message, qqUserId, true);
          else stopAutoBattle(qqUserId);
          return;
        }
        await sendCombatResult(message, qqUserId, result, { omitFinalLog: omitted && result.ended });
        if (!omitted && !result.ended && !result.waiting) autoBattleVisibleRounds.set(qqUserId, visibleRounds + 1);
        if (result.ended || result.waiting) { stopAutoBattle(qqUserId); return; }
        advance();
      } catch (error) {
        // 手动操作、逃离或会话结束时不再继续自动推进；其他异常记入日志便于定位。
        if (!(error instanceof Error) || !/(当前不在战斗中|本回合行动已确认|你已失去行动能力)/.test(error.message)) logger.warn({ err: error, qqUserId }, 'auto battle advance failed');
        stopAutoBattle(qqUserId);
      }
    }, 1000));
  };
  advance();
};
/** 战斗建立后先立刻提交一轮自动操作，避免仅依赖延迟计时器导致战斗停在“战斗开始”。 */
const startAutoBattle = async (message: any, qqUserId: string, openingText = '') => {
  if (await isFullPartyAutoBattle(qqUserId)) {
    const full = await resolveFullAutoBattle(qqUserId);
    const fullLog = [openingText, full.log].filter(Boolean).join('\n\n');
    if (fullLog) await message.send({ format: fullAutoBattleFormat(fullLog) });
    if (full.result?.ended) await sendCombatResult(message, qqUserId, full.result, { omitFinalLog: true });
    else if (full.result && !full.result.waiting) scheduleAutoBattle(message, qqUserId, true);
    return Boolean(full.result);
  }
  const result = await resolvePartyAutoBattleActions(qqUserId);
  if (!result) return false;
  await sendCombatResult(message, qqUserId, result);
  if (!result.ended && !result.waiting) scheduleAutoBattle(message, qqUserId);
  return true;
};

/** 自动寻怪抵达后不再展示遇战选项，按 PVE 配置立即交涉或开战。 */
const resolveAutoHuntEncounter = async (message: any, qqUserId: string, result: any) => {
  if (result.arrivalActivity !== 'hunt' || result.kind !== 'encounter' || result.occupied || !result.spawns?.length) return false;
  const config = await autoBattleConfig(qqUserId, 'pve');
  if (!Number(config.settings.enabled)) return false;
  const spawnId = Number(result.spawns[0].id);
  if (!Number.isInteger(spawnId) || spawnId <= 0) return false;

  // 城镇执法战没有交涉入口，避免自动配置把强制战斗卡在不存在的选项上。
  if (config.settings.default_encounter_action === 'persuade' && !result.cityPursuit) {
    const text = await encounterAction(qqUserId, spawnId, 'persuade');
    const failed = text.startsWith('交涉失败！');
    if (!failed) {
      await message.send({
        format: messageFormat('自动交涉', text).addButtonGroup(
          Format.createButtonGroup().addRow().addButton('操作面板', '/面板', { type: 'command', autoEnter: true, style: 'blue' })
        )
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
// PvP 自动战斗同样一次性结算，避免长战斗触发 QQ 的被动回复上限。
const stopPvpAutoBattle = (_qqUserId: string) => undefined;
const sendPvpCombatResult = async (message: any, qqUserId: string, result: Awaited<ReturnType<typeof pvpCombatAction>>, options: { omitFinalLog?: boolean } = {}) => {
  if (result.ended) {
    if (!options.omitFinalLog) await message.send({ format: finalBattleFormat(result.log) });
    const title = result.winnerId === null ? '战斗结束' : Number(result.winnerId) === Number(result.requesterId) ? '战斗胜利' : '战斗失败';
    const markdown = Format.createMarkdown().addTitle(title).addNewline().addNewline();
    if (result.winnerName) markdown.addText(`【${result.winnerName}】\n`);
    markdown.addBlockquote(result.settlement || '玩家对战结束。');
    if (result.restitutionId) markdown.addNewline().addButton('[详情]', { data: `/失物返还详情 ${result.restitutionId}`, autoEnter: false });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('操作面板', '/面板', { type: 'command', autoEnter: true, style: 'blue' })) });
    const ambushSpawnId = 'ambushSpawnId' in result ? result.ambushSpawnId : undefined;
    const ambushDelivery = 'ambushDelivery' in result ? result.ambushDelivery : undefined;
    if (ambushSpawnId && ambushDelivery?.targetId && Number(result.winnerId) === Number(result.requesterId)) {
      await continueAmbushBossBattle(qqUserId, ambushSpawnId, ambushDelivery);
    }
    return;
  }
  const battle = await pvpBattleStatus(qqUserId);
  await message.send({ format: battleFormat('玩家对战', result.log, battle as Awaited<ReturnType<typeof battleStatus>>) });
};
const startPvpAutoBattle = async (message: any, qqUserId: string) => {
  const config = await autoBattleConfig(qqUserId, 'pvp'); if (!config.settings.enabled) return;
  const logs: string[] = [];
  let result: Awaited<ReturnType<typeof pvpCombatAction>> | null = null;
  for (let round = 0; round < PVP_AUTO_BATTLE_ROUND_LIMIT; round += 1) {
    result = await pvpCombatAction(qqUserId, 'auto');
    if (result.log) logs.push(result.log);
    if (result.ended) break;
    // 每十回合让出事件循环，避免一场长对战阻塞其他玩家的消息。
    if ((round + 1) % 10 === 0) await new Promise<void>(resolve => setImmediate(resolve));
  }
  if (result && !result.ended) {
    const stopped = await pvpCombatAction(qqUserId, 'escape');
    logs.push('自动战斗超过 100 回合，系统已中止本场对战。', stopped.log);
    result = stopped;
  }
  if (!result) return;
  const log = logs.join('\n\n');
  if (log) await message.send({ format: fullAutoBattleFormat(log) });
  if (result.ended) await sendPvpCombatResult(message, qqUserId, result, { omitFinalLog: true });
};

const sendAmbushDirect = async (handoff: CombatAmbushHandoff, format: any, mention = false) => {
  const target = { scope: handoff.delivery.scope, targetId: handoff.delivery.targetId, BotId: handoff.delivery.botId } as const;
  if (mention && handoff.delivery.scope === 'group') {
    const text = handoff.kind === 'party' ? 'BOSS 已被击败，已为你开启对残血玩家的伏击。' : '前一支队伍已倒下，已为你接管残血的 BOSS。';
    const notice = createFormatWithoutGroupMention().addMention(handoff.ambusherQqUserId).addText('\n').addMarkdown(
      Format.createMarkdown().addTitle('伏击接管').addNewline().addNewline().addText(text)
    );
    await MessageDirect.create().sendToTarget({ target, format: notice });
  }
  await MessageDirect.create().sendToTarget({ target, format });
};

const directAmbushMessenger = (handoff: CombatAmbushHandoff) => ({
  send: async ({ format }: { format: any }) => sendAmbushDirect(handoff, format)
});

/** PvP 中伏击者击倒残血玩家后，立刻接着挑战仍保留残局状态的 BOSS。 */
const continueAmbushBossBattle = async (qqUserId: string, spawnId: number, delivery: { scope: 'group' | 'c2c'; targetId: string; botId?: string }) => {
  const handoff: CombatAmbushHandoff = { kind: 'boss', spawnId, ambusherCharacterId: 0, ambusherQqUserId: qqUserId, delivery };
  const messenger = directAmbushMessenger(handoff);
  try {
    await chooseTarget(qqUserId, spawnId);
    const battle = await battleStatus(qqUserId);
    await sendAmbushDirect(handoff, battleStartFormat('伏击目标已倒下。你没有停步，转身继续挑战残血的 BOSS！', battle), delivery.scope === 'group');
    await startAutoBattle(messenger, qqUserId);
  } catch (error) {
    await sendAmbushDirect(handoff, messageFormat('伏击接管失败', error instanceof Error ? error.message : '残血 BOSS 已无法接管。'), delivery.scope === 'group');
  }
};

const dispatchCombatAmbushHandoffs = async (sessionId: string) => {
  const handoffs = await claimCombatAmbushHandoffs(sessionId);
  for (const handoff of handoffs) {
    const messenger = directAmbushMessenger(handoff);
    try {
      if (handoff.kind === 'party') {
        if (!handoff.opponentCharacterId) throw new Error('残血玩家已经离开战场。');
        const started = await startAmbushPvpBattle(handoff.ambusherCharacterId, handoff.opponentCharacterId, handoff.spawnId, handoff.delivery);
        const battle = await pvpBattleStatus(handoff.ambusherQqUserId);
        await sendAmbushDirect(handoff, battleStartFormat(`BOSS 已被击败。你趁【${started.target}】尚未恢复，发动了伏击！`, battle as Awaited<ReturnType<typeof battleStatus>>), handoff.delivery.scope === 'group');
        await startPvpAutoBattle(messenger, handoff.ambusherQqUserId);
      } else {
        await chooseTarget(handoff.ambusherQqUserId, handoff.spawnId);
        const battle = await battleStatus(handoff.ambusherQqUserId);
        await sendAmbushDirect(handoff, battleStartFormat('前一支队伍已倒下。你切入战场，接管了残血的 BOSS！', battle), handoff.delivery.scope === 'group');
        await startAutoBattle(messenger, handoff.ambusherQqUserId);
      }
    } catch (error) {
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

const professionDetails: Record<string, { name: string; blessing: string; skills: { name: string; description: string }[] }> = {
  warrior: { name: '战士', blessing: '体质成长+1.2，力量成长+1.2', skills: [{ name: '长剑精通', description: '（被动）装备长剑类武器时，物攻+(5/25)%。副手装备时效果(减半/无衰减)。' }, { name: '盾牌精通', description: '（被动）装备盾牌类武器时，双防+(5/25)%。副手装备时效果(减半/无衰减)。' }] },
  mage: { name: '法师', blessing: '精神成长+1.2，智力成长+1.2', skills: [{ name: '法杖精通', description: '（被动）装备法杖类武器时，魔攻+(5/25)%。副手装备时效果(减半/无衰减)。' }, { name: '法书精通', description: '（被动）装备法书类武器时，吟唱速度+(14/70)%。副手装备时效果(减半/无衰减)。' }] },
  priest: { name: '牧师', blessing: '体质成长+1.2，精神成长+1.2', skills: [{ name: '法书精通', description: '（被动）装备法书类武器时，吟唱速度+(14/70)%。副手装备时效果(减半/无衰减)。' }, { name: '法球精通', description: '（被动）装备法球类武器时，魔力上限+(14/70)%。副手装备时效果(减半/无衰减)。' }] },
  rogue: { name: '盗贼', blessing: '敏捷成长+1.2，感知成长+1.2', skills: [{ name: '匕首精通', description: '（被动）装备匕首类武器时，双攻+(4/20)%。副手装备时效果(减半/无衰减)。' }, { name: '拳刃精通', description: '（被动）装备拳刃类武器时，暴击、暴伤+(5/25)%。副手装备时效果(减半/无衰减)。' }] }
};
const professionCodeByName: Record<string, string> = { 战士: 'warrior', 法师: 'mage', 盗贼: 'rogue', 牧师: 'priest' };
const timeGreeting = (morning: string, afternoon: string, evening: string) => {
  const hour = new Date().getHours();
  return hour < 11 ? morning : hour < 18 ? afternoon : evening;
};
const guildFrontDeskFormat = async (qqUserId: string, text?: string, continuingChat = false) => {
  const [profile, mainQuest, nearby, dungeonSecret] = await Promise.all([adventurerProfile(qqUserId), currentMainQuest(qqUserId), nearbyPoints(qqUserId), dungeonSecretProgress(qqUserId)]);
  const introduction = text ?? timeGreeting(
    profile.adventurer_registered
      ? '晨间的公会刚刚热闹起来。莫妮卡站在整洁的前台后核对账册，黑色短发利落地贴着耳侧。\n“早上好，冒险者。新的一天，也请平安归来。”'
      : '清晨的阳光落在前台上。莫妮卡整理好登记册，向你露出明朗而专业的笑容。\n“早上好，欢迎来到百纳镇冒险者公会。我是接待员莫妮卡。”',
    profile.adventurer_registered
      ? '明亮的日光照着前台，莫妮卡一边核对归来的队伍的账册，一边抬头向你微笑。\n“欢迎回来，冒险者。无论是委托、晋升还是旅途中的疑问，我都会尽力协助。”'
      : '前台小姐姐莫妮卡站在整洁的柜台后。她有一头干练的黑色短发，笑容阳光，举止从容而专业。\n“您好，欢迎来到百纳镇冒险者公会。我是接待员莫妮卡，很高兴为您服务。”',
    profile.adventurer_registered
      ? '魔石灯为前台镀上一层暖光。莫妮卡合上一本账册，仍精神十足地朝你点头。\n“晚上好，冒险者。先歇一歇，或者告诉我今晚需要什么帮助。”'
      : '夜色渐深，前台的魔石灯却依然明亮。莫妮卡停下笔，温和地向你致意。\n“晚上好，欢迎来到百纳镇冒险者公会。我是接待员莫妮卡。”'
  );
  const markdown = Format.createMarkdown().addTitle('冒险者公会·前台').addNewline().addNewline().addText('【莫妮卡】');
  if (nearby.npcDetailsUnlocked) markdown.addText(' ').addButton('[详情]', { data: '/NPC详情 guild_counter', autoEnter: false });
  markdown.addNewline().addNewline();
  markdown.addBlockquote(introduction);
  if (continuingChat) return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('继续闲聊', '/前台闲聊', { type: 'command', autoEnter: true, style: 'blue' }));
  const buttons = Format.createButtonGroup().addRow().addButton(profile.adventurer_registered ? '冒险者 晋升' : '冒险者 注册', '/公会注册', { type: 'command', autoEnter: true, style: 'blue' });
  buttons.addButton('职业选择', '/职业选择', { type: 'command', autoEnter: true, style: profile.adventurer_registered ? 'blue' : undefined });
  buttons.addRow().addButton('闲聊 莫妮卡', '/前台闲聊', { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回公会大厅', '/建筑进入 guild_counter', { type: 'command', autoEnter: true });
  if (mainQuest.title === '【主线·无形的禁锢】') buttons.addRow().addButton('关于 无形的禁锢', '/关于无形的禁锢', { type: 'command', autoEnter: true, style: 'blue' });
  if (dungeonSecret.stage === 1) buttons.addRow().addButton('关于 地下的秘密', '/询问地下的秘密', { type: 'command', autoEnter: true, style: 'blue' });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const professionSelectFormat = async (qqUserId: string) => {
  const profile = await adventurerProfile(qqUserId); if (!profile.adventurer_registered) throw new Error('完成冒险者注册后才能选择职业。');
  const affinity = profile.level >= 8 ? '综合素质' : '当前的潜力';
  const markdown = Format.createMarkdown().addTitle('职业选择').addNewline().addNewline().addBlockquote(`“我看你${affinity}不错，适合选择自己最喜欢的道路哦~”`).addNewline().addBlockquote('莫妮卡一脸正经，“不过终究还是看你的喜好。后天的努力比先天更重要！”');
  const buttons = Format.createButtonGroup().addRow().addButton('查看 战士', '/职业查看 战士', { type: 'command', autoEnter: true, style: 'blue' }).addButton('查看 法师', '/职业查看 法师', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('查看 盗贼', '/职业查看 盗贼', { type: 'command', autoEnter: true, style: 'blue' }).addButton('查看 牧师', '/职业查看 牧师', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('返回前台', '/建筑区域 guild_counter 前台', { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const professionDetailFormat = async (qqUserId: string, name: string) => {
  const profile = await adventurerProfile(qqUserId); const code = professionCodeByName[name]; const detail = professionDetails[code]; if (!detail) throw new Error('未知职业。');
  const markdown = Format.createMarkdown().addTitle(`职业·${detail.name}`).addNewline().addNewline().addText(`①职业赐福：${detail.blessing}\n②职业技能：\n`);
  detail.skills.forEach(skill => markdown.addText(`【${skill.name}】\n`).addBlockquote(skill.description).addNewline().addNewline());
  const buttons = Format.createButtonGroup().addRow();
  if (!profile.profession_code) buttons.addButton(`选择 ${detail.name}`, `/选择职业 ${detail.name}`, { type: 'command', autoEnter: true, style: 'blue' });
  buttons.addButton('返回职业选择', '/职业选择', { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export const exploreHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await explore(event.current.UserId); const targets = result.spawns.length ? `\n\n可选目标\n${result.spawns.map(s => result.canViewMonsterInfo ? `#${s.id} ${s.name} Lv.${s.level}｜HP ${s.current_hp}/${s.hp_max}` : `#${s.id} ???`).join('\n')}\n\n发送 /目标 编号 进入战斗。` : ''; await message.send({ format: messageFormat('探索', result.text + targets) }); } catch (error) { logger.warn({ err: error }, 'explore failed'); await fail(message, error); } };
export const inventoryHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const bag = await inventory(event.current.UserId); const penaltyText = bag.rawSpeedPenalty > 0 && bag.constitutionOffset > 0 ? `速度惩罚 -${bag.speedPenalty}（体质抵消 ${Math.min(bag.rawSpeedPenalty, bag.constitutionOffset)}）` : `速度惩罚 -${bag.speedPenalty}`; await message.send({ format: messageFormat('冒险背包', `负重 ${bag.weight.toFixed(2)}/${bag.capacity}｜${penaltyText}\n当前速度 ${bag.speed}\n\n${bag.items.length ? bag.items.map(i => `${i.equipped_slot ? `[已装备·${i.equipped_slot}] ` : i.quick_slot ? `[道具${i.quick_slot}] ` : ''}${i.name} ×${i.quantity}（${i.weight}kg）`).join('\n') : '背包为空。'}`) }); } catch (error) { await fail(message, error); } };
const dungeonPanel = async (message: any, qqUserId: string, text: string) => { const panel = await movementPanel(qqUserId, text); const nearby = await nearbyPoints(qqUserId); await message.send({ format: panel.addButtonGroup(await movementButtons(qqUserId, nearby.character.activity_status !== 'active')) }); };
export const dungeonEnterHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await enterDungeon(event.current.UserId, Number(route.param('id'))); await dungeonPanel(message, event.current.UserId, `你沿着石阶踏入地下。地下迷宫第一层（${result.x}, ${result.y}, ${result.z}）的墙壁渗着寒意。`); } catch (error) { await fail(message, error, '无法进入地下迷宫'); } };
const dungeonFloorHandler = (direction: 'down' | 'up' | 'leave' | 'escape') => async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await changeDungeonFloor(event.current.UserId, direction); const leaving = direction === 'leave' || direction === 'escape'; const text = leaving ? `${'usedTeleporter' in result && result.usedTeleporter ? '破魔传送器的符文碎裂成光点，你被送回入口外。' : '你从入口的石阶返回地面。'}\n你回到了幽暗密林（${result.x}, ${result.y}, 0）。` : `你沿石阶来到地下迷宫的下一处区域（${result.x}, ${result.y}, ${result.z}）。`; await dungeonPanel(message, event.current.UserId, text); } catch (error) { await fail(message, error, direction === 'escape' ? '脱离失败' : '无法通过石阶'); } };
export const dungeonDownHandler = dungeonFloorHandler('down'); export const dungeonUpHandler = dungeonFloorHandler('up'); export const dungeonLeaveHandler = dungeonFloorHandler('leave'); export const dungeonEscapeHandler = dungeonFloorHandler('escape');
export const dungeonChestHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await openDungeonChest(event.current.UserId, Number(route.param('id'))); const coins = [`铜币×${result.copper}`, result.silver ? `银币×${result.silver}` : '', result.gold ? `金币×${result.gold}` : ''].filter(Boolean).join('、'); await dungeonPanel(message, event.current.UserId, `${result.quality}宝箱在一阵轻响中开启。获得【${result.name}】×${result.quantity}，${coins}。`); } catch (error) { await fail(message, error, '无法开启宝箱'); } };
export const dungeonPvpHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await dungeonPvP(event.current.UserId, Number(route.param('id'))); await dungeonPanel(message, event.current.UserId, result.text); } catch (error) { await fail(message, error, 'PvP失败'); } };
export const playerPvpHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const targetId = Number(route.param('id')); const result = await startPvpBattle(event.current.UserId, targetId);
    if (result.needsConfirmation) {
      const markdown = Format.createMarkdown().addTitle('警告').addNewline().addNewline().addText('小镇内贸然攻击玩家会被通缉。');
      const buttons = Format.createButtonGroup().addRow().addButton('确认攻击', `/确认攻击 ${targetId}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('取消攻击', '/面板', { type: 'command', autoEnter: true });
      await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) }); return;
    }
    const battle = await pvpBattleStatus(event.current.UserId); await message.send({ format: battleStartFormat(`你向【${result.target}】发起了玩家对战！`, battle as Awaited<ReturnType<typeof battleStatus>>) }); await startPvpAutoBattle(message, event.current.UserId);
  } catch (error) { await fail(message, error, 'PvP失败'); }
};
export const confirmPlayerPvpHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { const result = await startPvpBattle(event.current.UserId, Number(route.param('id')), true); const battle = await pvpBattleStatus(event.current.UserId); await message.send({ format: battleStartFormat(`你向【${result.target}】发起了玩家对战！`, battle as Awaited<ReturnType<typeof battleStatus>>) }); await startPvpAutoBattle(message, event.current.UserId); }
  catch (error) { await fail(message, error, '攻击失败'); }
};
export const playerInteractionHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await interactDungeonPlayer(event.current.UserId, Number(route.param('id'))); await dungeonPanel(message, event.current.UserId, result.text); } catch (error) { await fail(message, error, '互动失败'); } };
const movementPanel = async (qqUserId: string, description: string) => { const [nearby, movement, trackingHint] = await Promise.all([nearbyPoints(qqUserId), movementProfile(qqUserId), dungeonTrackingHint(qqUserId)]); const resting = nearby.character.activity_status !== 'active'; const text = trackingHint ? `${description}\n\n【识踪】${trackingHint}` : description; return outsidePanel('行动', movedLocationText(nearby.character), movement.step, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), text, nearby.points, resting, nearby.landmarks, '', movement.maximum, nearby.perceptionObscured, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked, nearby.character.activity_status); };
const interactionTypeLabel: Record<CoordinateInteractionTarget['type'], string> = { 玩家: '玩家', NPC: 'NPC', 建筑: '建筑', 资源: '资源', 入口: '入口', 地标: '地标' };
const playerInteractionFormat = (character: any, target: CoordinateInteractionTarget) => {
  const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(character)).addNewline().addNewline().addBlockquote(`你在这里遇见了【${target.name}】。`);
  const buttons = Format.createButtonGroup().addRow()
    .addButton('攻击', `/玩家攻击 ${target.gameId}`, { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('互动', `/玩家互动 ${target.gameId}`, { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('忽略', '/面板', { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const coordinateInteractionFormat = (character: any, targets: CoordinateInteractionTarget[]) => {
  if (targets.length === 1 && targets[0].type === '玩家') return playerInteractionFormat(character, targets[0]);
  const markdown = Format.createMarkdown().addTitle('互动').addNewline().addNewline().addText('该位置有多个目标存在：').addNewline().addNewline();
  for (const [index, target] of targets.entries()) {
    markdown.addText(`${'①②③④⑤⑥⑦⑧⑨⑩'.charAt(index)}【${interactionTypeLabel[target.type]}】${target.name}`);
    if (target.type === '玩家') {
      markdown.addNewline().addButton('[攻击]', { data: `/玩家攻击 ${target.gameId}`, autoEnter: false }).addText(' ')
        .addButton('[交易]', { data: `/玩家交易 ${target.gameId}`, autoEnter: false }).addText(' ')
        .addButton('[邀请入队]', { data: `/邀请入队 ${target.gameId}`, autoEnter: false }).addText(' ')
        .addButton('[加好友]', { data: `/加好友 ${target.gameId}`, autoEnter: false });
    } else if (target.type === '建筑') {
      markdown.addText(' ').addButton('[进入]', { data: `/建筑进入 ${target.code}`, autoEnter: false }).addText(' ')
        .addButton('[忽略]', { data: `/建筑忽略 ${target.code}`, autoEnter: false });
    } else markdown.addText(' ').addButton('[互动]', { data: `/坐标互动 ${target.type} ${target.id}`, autoEnter: false });
    markdown.addNewline().addNewline();
  }
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('忽略', '/面板', { type: 'command', autoEnter: true }));
};
export const coordinateInteractionHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const type = String(route.param('type')) as CoordinateInteractionTarget['type']; const id = String(route.param('id'));
    const result = await coordinateInteraction(event.current.UserId, type, id);
    await showMoveResult(message, event.current.UserId, result);
  } catch (error) { await fail(message, error, '无法互动'); }
};
const showMoveResult = async (message: any, qqUserId: string, result: any) => {
  const wanted = await cityWantedAlert(qqUserId);
  if (result.character?.enteredTown && wanted) {
    try { await publishWantedCityEntryNotice(wanted); }
    catch (error) { logger.warn({ err: error, qqUserId }, '到达城镇后的通缉公告发送失败'); }
  }
  if (result.destinationKind === 'home') {
    const entry = result.homeEntry;
    if (!entry) throw new Error('已抵达小屋地块，但自动进入家园失败，请再次发送“/家园回家”。');
    const { homeFormat } = await import('./home');
    await message.send({ format: await homeFormat(qqUserId, `你已回家。${entry.pursuit?.text ? `\n${entry.pursuit.text}` : ''}`) });
    return;
  }
  const debtCollection = result.character?.debtCollection;
  if (debtCollection?.collected) result.text = `${result.text}\n\n城镇执法队扣除了铜币×${debtCollection.collected}，用于归还失主。${debtCollection.remaining ? `尚欠铜币×${debtCollection.remaining}。` : ''}`;
  if (result.kind === 'story') {
    await message.send({ format: chapterFormat(1, '你在林中听见了兵刃碰撞的声音。\n那声响被湿润的枝叶过滤得断断续续，却仍清晰地指向前方。\n是有人在附近战斗吗？') });
    return;
  }
  if (result.kind === 'npc') {
    if (result.npc.interaction_kind === 'building') { await message.send({ format: buildingEncounterFormat(result.npc.name, result.npc.code, movedLocationText(result.character)) }); return; }
    const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character)).addNewline().addBlockquote(result.text).addNewline().addNewline().addText(result.npc.name);
    const buttons = Format.createButtonGroup().addRow().addButton('对话', `/NPC对话 ${result.npc.code}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('忽略', `/NPC忽略 ${result.npc.code}`, { type: 'command', autoEnter: true });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) }); return;
  }
  if (result.kind === 'resource') {
    const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character)).addNewline().addBlockquote(result.text).addNewline().addNewline().addText(`【${result.resource.kind}】${result.resource.name}`);
    const buttons = Format.createButtonGroup().addRow().addButton('开采', `/开采 ${result.resource.id}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('忽略', '/面板', { type: 'command', autoEnter: true });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) }); return;
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
  if (result.kind === 'interaction') { await message.send({ format: coordinateInteractionFormat(result.character, result.targets) }); return; }
  if (result.kind === 'dungeon') {
    // 陷阱与岔路痕迹只是当前位置的信息，不打断正常的行动面板与移动操作。
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
    if (result.dungeon.kind === 'chest') buttons.addButton('开启宝箱', `/开启地宫宝箱 ${result.dungeon.cellId}`, { type: 'command', autoEnter: true, style: 'blue' });
    if (result.dungeon.kind === 'down') buttons.addButton('前往下一层', '/地宫下行', { type: 'command', autoEnter: true, style: 'blue' });
    if (result.dungeon.kind === 'up') buttons.addButton('返回上一层', '/地宫上行', { type: 'command', autoEnter: true, style: 'blue' });
    if (result.dungeon.kind === 'leave') buttons.addButton('离开迷宫', '/离开迷宫', { type: 'command', autoEnter: true, style: 'blue' });
    else buttons.addButton('传送器离开', '/离开迷宫', { type: 'command', autoEnter: true });
    buttons.addButton('操作面板', '/面板', { type: 'command', autoEnter: true });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) }); return;
  }
  if (result.kind !== 'encounter') { const panel = await movementPanel(qqUserId, result.text); const nearby = await nearbyPoints(qqUserId); await message.send({ format: panel.addButtonGroup(await movementButtons(qqUserId, nearby.character.activity_status !== 'active')) }); return; }
  if (await resolveAutoHuntEncounter(message, qqUserId, result)) return;
  const first = result.spawns[0];
  const targets = result.spawns.map((spawn: { name: string; level: number }) => `${spawn.name} Lv.${spawn.level}`).join('\n');
  const hasBoss = result.spawns.some((spawn: { monster_class?: string }) => spawn.monster_class === 'boss');
  const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character))
    .addNewline().addBlockquote(result.text).addNewline().addNewline().addTitle('★★★遇战★★★').addNewline().addNewline().addText(targets);
  if (hasBoss) markdown.addNewline().addButton('[BOSS词条说明]', { data: '/BOSS词条说明', autoEnter: false });
  if (result.occupied) markdown.addNewline().addNewline().addBlockquote('当前坐标有战斗正在进行。你可以伏击等待，或先行离开。');
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(encounterButtons(first.id, Boolean(result.canAmbush), Boolean(result.occupied), Boolean(result.cityPursuit))) });
};
const showBlockedEncounter = async (message: any, qqUserId: string) => {
  const result = await currentEncounter(qqUserId); if (!result) return false;
  const first = result.spawns[0]; const targets = result.spawns.map((spawn: { name: string; level: number }) => `${spawn.name} Lv.${spawn.level}`).join('\n');
  const hasBoss = result.spawns.some((spawn: { monster_class?: string }) => spawn.monster_class === 'boss');
  const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character)).addNewline().addBlockquote(result.text).addNewline().addNewline().addTitle('★★★遇战★★★').addNewline().addNewline().addText(targets);
  if (hasBoss) markdown.addNewline().addButton('[BOSS词条说明]', { data: '/BOSS词条说明', autoEnter: false });
  if (result.occupied) markdown.addNewline().addNewline().addBlockquote('当前坐标有战斗正在进行。你可以伏击等待，或先行离开。');
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(encounterButtons(first.id, Boolean(result.canAmbush), Boolean(result.occupied), Boolean(result.cityPursuit))) }); return true;
};
export const continueStoryHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
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
        try { await message.send({ format: Format.create().addImage(await pearGuideImageBuffer()) }); }
        catch (error) { logger.warn({ err: error, pearGuideImage: pearGuideImagePath }, 'load pear guide image failed'); }
      }
      await message.send({ format: storyFormat }); return;
    }
    if (story.arrivalBuilding) { await message.send({ format: buildingEncounterFormat('冒险者公会', story.arrivalBuilding, '你移动至百纳镇·猫拉瑞亚(-2, -111)') }); return; }
    const panel = await movementPanel(event.current.UserId, story.text);
    const nearby = await nearbyPoints(event.current.UserId);
    await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
  } catch (error) { await fail(message, error, '无法继续剧情'); }
};
export const buildingHandler = (action: 'enter' | 'ignore' | 'leave' | 'area') => async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const code = String(route.param('code'));
    const building = await requireNpcAtCurrentPosition(event.current.UserId, code);
    if (building.interaction_kind !== 'building') throw new Error('该目标不是建筑。');
    if (code === 'blacksmith') {
      if (action === 'enter') { const { blacksmithFormat } = await import('./blacksmith'); await message.send({ format: await blacksmithFormat(event.current.UserId) }); return; }
      const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开了铁匠铺，炉火与锤声在身后渐远。' : '你暂时没有进入铁匠铺。');
      const nearby = await nearbyPoints(event.current.UserId);
      await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); return;
    }
    if (code === 'saint_church') {
      if (action === 'enter') { const { churchFormat } = await import('./church'); await message.send({ format: await churchFormat(event.current.UserId) }); return; }
      const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开圣恩教堂，晚风与街道的声响重新围拢过来。' : '你暂时没有进入圣恩教堂。');
      const nearby = await nearbyPoints(event.current.UserId);
      await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); return;
    }
    if (code === 'alchemy_sweetshop') {
      if (action === 'enter') { const { alchemistShopFormat } = await import('./alchemist'); await message.send({ format: await alchemistShopFormat(event.current.UserId) }); return; }
      const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开了糖水屋，清甜的草药香仍萦绕在衣袖间。' : '你暂时没有进入糖水屋。');
      const nearby = await nearbyPoints(event.current.UserId);
      await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); return;
    }
    if (code === 'oddworkshop') {
      if (action === 'enter') { const { oddWorkshopFormat } = await import('./deconstructor'); await message.send({ format: await oddWorkshopFormat(event.current.UserId) }); return; }
      const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开了异工坊，身后仍传来轻快的齿轮转动声。' : '你暂时没有进入异工坊。');
      const nearby = await nearbyPoints(event.current.UserId);
      await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); return;
    }
    if (code === 'hunter_lodge') {
      if (action === 'enter') { const { hunterLodgeHandler } = await import('./hunter-lodge'); await hunterLodgeHandler(); return; }
      const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开猎户小屋，林风很快盖过了屋内的磨箭声。' : '屋内没有回应，你暂时没有继续敲门。');
      const nearby = await nearbyPoints(event.current.UserId);
      await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); return;
    }
    if (code === 'bookshop') {
      if (action === 'enter') { const { bookshopHandler } = await import('./bookshop'); await bookshopHandler(); return; }
      const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开百味书屋，身后仍传来轻柔的翻页声。' : '你暂时没有进入百味书屋。');
      const nearby = await nearbyPoints(event.current.UserId);
      await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); return;
    }
    if (code === 'baina_residence') {
      if (action === 'enter') { const { homeShopFormat } = await import('./home-shop'); await message.send({ format: await homeShopFormat(event.current.UserId) }); return; }
      const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开百纳居，木料与炉火的气息渐渐淡去。' : '百纳居的店员朝你点头，示意你进门详谈。');
      const nearby = await nearbyPoints(event.current.UserId);
      await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); return;
    }
    if (action === 'enter') {
      if (code === 'guild_counter') { await message.send({ format: guildInteriorFormat() }); return; }
      await message.send({ format: unimplementedBuildingFormat({ code, name: building.name, description: building.description }) }); return;
    }
    if (action === 'area') { if (code !== 'guild_counter') throw new Error('这座建筑暂未开放内部区域。'); const area = String(route.param('area')); if (area === '悬赏板') { const { bountyBoardFormat } = await import('./bounty'); await message.send({ format: await bountyBoardFormat(event.current.UserId) }); return; } if (area === '工会商店') { const { guildShopFormat } = await import('./guild-shop'); await message.send({ format: guildShopFormat() }); return; } if (area === '餐厅') { const { restaurantFormat } = await import('./guild-restaurant'); await message.send({ format: restaurantFormat() }); return; } await message.send({ format: area === '前台' ? await guildFrontDeskFormat(event.current.UserId) : guildInteriorFormat(area) }); return; }
    const panel = await movementPanel(event.current.UserId, action === 'leave' ? `你离开了${building.name}，回到门前的街道。` : `你暂时没有进入${building.name}。`);
    const nearby = await nearbyPoints(event.current.UserId);
    await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
  } catch (error) { await fail(message, error, '建筑操作失败'); }
};
export const guildRegistrationHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireNpcAtCurrentPosition(event.current.UserId, 'guild_counter'); const registered = await registerAdventurer(event.current.UserId); if (!registered) { await message.send({ format: await guildFrontDeskFormat(event.current.UserId, '莫妮卡轻轻摇头：“您的冒险者身份已经登记在册了。晋升考核将在满足条件后开放。”') }); return; } const markdown = Format.createMarkdown().addTitle('冒险家 注册').addNewline().addNewline().addBlockquote('你将手轻放在水晶球上，顿时散发出一阵耀眼的白光。').addNewline().addBlockquote('莫妮卡将一张通体漆黑卡片靠近球体，光芒汇聚成一道银线注入，卡片逐渐被染成银白。').addNewline().addBlockquote('随后一行行异世界文字在卡面上依次浮现——').addNewline().addNewline().addText('获得【冒险者 卡片】').addNewline().addText('你随时可以发送 ').addButton('/卡片', { data: '/卡片', autoEnter: false }).addText(' 查看。').addNewline().addText('你已察觉到自身属性，发送 ').addButton('/角色', { data: '/角色', autoEnter: false }).addText(' 查看。'); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回前台', '/建筑区域 guild_counter 前台', { type: 'command', autoEnter: true, style: 'blue' })) }); } catch (error) { await fail(message, error, '注册失败'); } };
export const professionHandler = (action: 'select' | 'detail' | 'choose') => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireNpcAtCurrentPosition(event.current.UserId, 'guild_counter'); if (action === 'select') { await message.send({ format: await professionSelectFormat(event.current.UserId) }); return; } const name = String(route.param('name')); if (action === 'detail') { await message.send({ format: await professionDetailFormat(event.current.UserId, name) }); return; } const code = professionCodeByName[name]; if (!code) throw new Error('未知职业。'); await chooseProfession(event.current.UserId, code); await message.send({ format: await guildFrontDeskFormat(event.current.UserId, `莫妮卡郑重地在档案上盖下印记。“恭喜您成为一名${name}。愿您始终记得最初踏上旅途的理由。”`) }); } catch (error) { await fail(message, error, '职业操作失败'); } };
export const guildChatHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireNpcAtCurrentPosition(event.current.UserId, 'guild_counter'); const { affinity } = await addNpcAffinity(event.current.UserId, 'guild_counter', 'chat'); await message.send({ format: await guildFrontDeskFormat(event.current.UserId, npcChatDialogue('guild_counter', affinity), true) }); } catch (error) { await fail(message, error, '闲聊失败'); } };
export const guildBarrierHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireNpcAtCurrentPosition(event.current.UserId, 'guild_counter'); const { advanceRealmBarrier } = await import('../game/main-quest.service'); await advanceRealmBarrier(event.current.UserId, 'guild'); const { barrierAdviceFormat } = await import('./alchemist'); await message.send({ format: barrierAdviceFormat(true) }); } catch (error) { await fail(message, error, '无法询问'); } };
export const adventurerCardHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
  const card = await adventurerCardImage(event.current.UserId, event.current.UserAvatar);
  // 富媒体消息会把同一条内容中的 @ 作为图片说明发出；卡片只发送图片，不附加群聊回复 @。
  await message.send({ format: createFormatWithoutGroupMention().addImage(card.image) });
} catch (error) { await fail(message, error, '无法查看卡片'); } };
export const pearGuideHandler = async () => { const [message] = useMessage(); try {
  if (isPublicImageUrl(gameAssetUrls.pearGuideImageUrl)) {
    const markdown = Format.createMarkdown().addTitle('梨子喵').addNewline().addNewline().addImage(gameAssetUrls.pearGuideImageUrl, { width: 320, height: 213 });
    await message.send({ format: Format.create().addMarkdown(markdown) });
    return;
  }
  await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('梨子喵')) });
  await message.send({ format: Format.create().addImage(await pearGuideImageBuffer()) });
} catch (error) { await fail(message, error, '无法展示梨子喵'); } };
export const pearGuidePreviewHandler = async () => {
  const [route] = useRoute(); const [message] = useMessage();
  try {
    const supplied = String(route.param('url') ?? '').trim();
    const imageUrl = supplied || gameAssetUrls.pearGuideImageUrl;
    if (!isPublicImageUrl(imageUrl)) throw new Error('请先在 src/config/game-assets.ts 填写 pearGuideImageUrl，或发送「梨子喵预览 图片URL」进行临时测试。');
    const markdown = Format.createMarkdown().addTitle('梨子喵·剧情图片预览').addNewline().addNewline()
      .addImage(imageUrl, { width: 320, height: 213 }).addNewline().addNewline()
      .addBlockquote('图片、剧情文字与蓝色操作文字均位于同一条 Markdown 消息内。').addNewline().addNewline()
      .addButton('[测试继续]', { data: '/梨子喵预览', autoEnter: false });
    await message.send({ format: Format.create().addMarkdown(markdown) });
  } catch (error) { await fail(message, error, '梨子喵预览不可用'); }
};
const pearGuideFormat = async (qqUserId: string, text?: string, continuingChat = false) => {
  const greeting = text ?? timeGreeting(
    '清晨的百纳镇还带着薄雾。梨子喵抱着一小袋刚买的点心，耳朵轻轻一抖，笑着朝你招手。\n“早上好呀，勇者大人！又要出发了喵？今天也要精神满满喵！”',
    '午后的街道正热闹，梨子喵从人群里探出脑袋，猫耳兴奋地竖起。\n“勇者大人！正好见到你喵。密林那边有没有什么新鲜见闻？”',
    '晚风掠过石板街，梨子喵抱着尾巴站在魔石灯下，见到你便露出安心的笑容。\n“晚上好喵。看到勇者大人平安回来，梨子喵就放心啦。”'
  );
  return npcInteractionFormat(qqUserId, { code: 'pear_guide', name: '梨子喵' }, greeting, continuingChat);
};
export const pearGuideChatHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'pear_guide');
    const { affinity } = await addNpcAffinity(event.current.UserId, 'pear_guide', 'chat');
    const chat = npcChatDialogue('pear_guide', affinity);
    await message.send({ format: await pearGuideFormat(event.current.UserId, chat, true) });
  } catch (error) { await fail(message, error, '无法闲聊'); }
};
export const pearGuideLeaveHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const npc = await requireNpcAtCurrentPosition(event.current.UserId, 'pear_guide');
    await sendNpcLeavePanel(message, event.current.UserId, npc.name);
  } catch (error) { await fail(message, error, '无法离开'); }
};
const sendNpcLeavePanel = async (message: any, qqUserId: string, name: string) => {
  const [nearby, movement] = await Promise.all([nearbyPoints(qqUserId), movementProfile(qqUserId)]);
  const panel = outsidePanel('行动', currentLocationText(nearby.character), movement.step, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), `你和${simpleNpcName(name)}道别，继续留意周围的动静。`, nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks, '', movement.maximum, false, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked);
  await message.send({ format: panel.addButtonGroup(await movementButtons(qqUserId, nearby.character.activity_status !== 'active')) });
};
export const npcLeaveHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { const npc = await requireNpcAtCurrentPosition(event.current.UserId, String(route.param('code'))); if (npc.interaction_kind !== 'npc') throw new Error('该目标不是 NPC。'); await sendNpcLeavePanel(message, event.current.UserId, npc.name); }
  catch (error) { await fail(message, error, '无法离开'); }
};
export const npcEncounterHandler = (action: 'talk' | 'ignore') => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const code = String(route.param('code')); const npc = await requireNpcAtCurrentPosition(event.current.UserId, code); if (npc.interaction_kind !== 'npc') throw new Error('该目标不是 NPC。'); if (action === 'ignore') { const [nearby, movement] = await Promise.all([nearbyPoints(event.current.UserId), movementProfile(event.current.UserId)]); const panel = outsidePanel('行动', currentLocationText(nearby.character), movement.step, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), '你暂时没有上前搭话，继续留意四周。', nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks, '', movement.maximum, false, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked); await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); return; } const affinity = await addNpcAffinity(event.current.UserId, code, 'chat'); const text = code === 'pear_guide' ? npcChatDialogue('pear_guide', affinity.affinity) : await talkToNpc(event.current.UserId, code); if (code === 'pear_guide') { await message.send({ format: await pearGuideFormat(event.current.UserId, text, true) }); return; } await message.send({ format: await npcInteractionFormat(event.current.UserId, { code, name: npc.name }, text, true) }); } catch (error) { await fail(message, error, '对话失败'); } };
const miningFormat = (kind: '矿脉' | '植被', name: string, seconds: number, remaining: number) => Format.create().addMarkdown(Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText('正在开采').addNewline().addBlockquote(`【${kind === '植被' ? '植被' : '锻材'}】${name}`).addNewline().addText(`预计耗时${durationText(seconds)}`).addNewline().addText(`当前剩余${durationText(remaining)}`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('刷新开采', '/刷新开采', { type: 'command', autoEnter: true, style: 'blue' }).addButton('取消开采', '/取消开采', { type: 'command', autoEnter: true }).addRow().addButton('角色', '/角色', { type: 'command', autoEnter: true }).addButton('装备', '/装备', { type: 'command', autoEnter: true }).addButton('背包', '/背包', { type: 'command', autoEnter: true }).addButton('技能', '/技能列表', { type: 'command', autoEnter: true }).addButton('队伍', '/队伍', { type: 'command', autoEnter: true }));
export const mineResourceHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await mineResource(event.current.UserId, Number(route.param('id'))); if (result.state === 'completed') { const panel = await movementPanel(event.current.UserId, `资源开采完成，获得【${result.kind === '植被' ? '植被' : '锻材'}】${result.name}×${result.quantity}。`); const nearby = await nearbyPoints(event.current.UserId); await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); return; } await message.send({ format: miningFormat(result.kind, result.name, result.seconds || (await resourceMiningStatus(event.current.UserId))?.seconds || 0, result.remaining) }); } catch (error) { await fail(message, error, '开采失败'); } };
export const refreshMiningHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const mining = await resourceMiningStatus(event.current.UserId); if (!mining) throw new Error('当前没有正在进行的资源开采。'); const result = await mineResource(event.current.UserId, mining.resourceId); if (result.state === 'completed') { const panel = await movementPanel(event.current.UserId, `资源开采完成，获得【${result.kind === '植被' ? '植被' : '锻材'}】${result.name}×${result.quantity}。`); const nearby = await nearbyPoints(event.current.UserId); await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); return; } await message.send({ format: miningFormat(result.kind, result.name, mining.seconds, result.remaining) }); } catch (error) { await fail(message, error, '开采状态不可用'); } };
export const cancelMiningHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await cancelResourceMining(event.current.UserId); const panel = await movementPanel(event.current.UserId, '你收起工具，中止了本次资源开采。'); const nearby = await nearbyPoints(event.current.UserId); await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); } catch (error) { await fail(message, error, '取消开采失败'); } };
export const moveHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await showMoveResult(message, event.current.UserId, await move(event.current.UserId, String(route.param('direction')))); } catch (error) { if (error instanceof Error && error.message.includes('当前格子存在敌对生物') && await showBlockedEncounter(message, event.current.UserId)) return; if (isForestGuideLocked(error)) { await storyLockedMessage(message, '无法移动'); return; } if (await showOngoingActivity(message, event.current.UserId, '无法移动')) return; await fail(message, error, '无法移动'); } };
export const goToHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await moveTo(event.current.UserId, Number(route.param('x')), Number(route.param('y'))); if (result.kind === 'travel') { await message.send({ format: travelFormat('开始前往', result.regionName, result.x, result.y, result.seconds, result.remaining, 'move', result.destinationName) }); scheduleTravelCompletion(message, event.current.UserId, result.remaining); return; } await showMoveResult(message, event.current.UserId, result); } catch (error) { if (error instanceof Error && error.message.includes('当前格子存在敌对生物') && await showBlockedEncounter(message, event.current.UserId)) return; if (isForestGuideLocked(error)) { await storyLockedMessage(message, '无法前往该位置'); return; } if (await showOngoingActivity(message, event.current.UserId, '无法前往该位置')) return; await fail(message, error, '无法前往该位置'); } };
export const goToMapHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await moveToMap(event.current.UserId, String(route.param('code'))); if (result.kind === 'travel') { await message.send({ format: travelFormat('开始前往', result.regionName, result.x, result.y, result.seconds, result.remaining, 'move', result.destinationName) }); scheduleTravelCompletion(message, event.current.UserId, result.remaining); return; } await showMoveResult(message, event.current.UserId, result); } catch (error) { if (error instanceof Error && error.message.includes('当前格子存在敌对生物') && await showBlockedEncounter(message, event.current.UserId)) return; if (isForestGuideLocked(error)) { await storyLockedMessage(message, '无法前往地图'); return; } if (await showOngoingActivity(message, event.current.UserId, '无法前往地图')) return; await fail(message, error, '无法前往地图'); } };
export const huntHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await huntMonster(event.current.UserId); await message.send({ format: travelFormat('开始寻怪……', result.regionName, result.x, result.y, result.seconds, result.remaining, 'hunt') }); scheduleTravelCompletion(message, event.current.UserId, result.remaining); } catch (error) { if (isForestGuideLocked(error)) { await storyLockedMessage(message, '无法寻怪'); return; } if (await showOngoingActivity(message, event.current.UserId, '无法寻怪')) return; await fail(message, error, '无法寻怪'); } };
export const cancelTravelHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const cancelled = await cancelTravel(event.current.UserId); const timer = travelTimers.get(event.current.UserId); if (timer) clearTimeout(timer); travelTimers.delete(event.current.UserId); const [nearby, movement] = await Promise.all([nearbyPoints(event.current.UserId), movementProfile(event.current.UserId)]); const character = cancelled.character; const cancellationText = cancelled.activityType === 'hunt' ? '寻怪已取消' : '移动已取消'; const panel = outsidePanel('行动', `${cancellationText}\n${currentLocationText(character)}`, movement.step, nearby.range, Number(character.pos_x), Number(character.pos_y), nearby.description, nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks, '', movement.maximum, false, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked); await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); } catch (error) { await fail(message, error, '取消行动失败'); } };

export const adjustMovementHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const result = await adjustMovementStep(event.current.UserId, Number(route.param('step')));
    const [nearby, movement] = await Promise.all([nearbyPoints(event.current.UserId), movementProfile(event.current.UserId)]);
    const panel = outsidePanel('行动', currentLocationText(nearby.character), result.step, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), `你将单次移动距离调整为 ${result.step} 格。`, nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks, '', result.maximum, false, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked);
    await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
  } catch (error) { await fail(message, error, '移动速度调整失败'); }
};
export const refreshTravelHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const travel = await travelStatus(event.current.UserId);
    if (!travel) {
      // 抵达后的旧“刷新”按钮仍可安全使用，改为展示当前位置而非报错。
      const [nearby, movement] = await Promise.all([nearbyPoints(event.current.UserId), movementProfile(event.current.UserId)]);
      const panel = outsidePanel('行动', currentLocationText(nearby.character), movement.step, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), nearby.description, nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks, '', movement.maximum, nearby.perceptionObscured, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked);
      await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
      return;
    }
    if (travel.remaining <= 0) {
      const result = await completeTravel(event.current.UserId);
      if (result) { await showMoveResult(message, event.current.UserId, result); return; }
      const [nearby, movement] = await Promise.all([nearbyPoints(event.current.UserId), movementProfile(event.current.UserId)]);
      const panel = outsidePanel('行动', currentLocationText(nearby.character), movement.step, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), nearby.description, nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks, '', movement.maximum, nearby.perceptionObscured, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked);
      await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) });
      return;
    }
    await message.send({ format: travelFormat(travel.activityType === 'hunt' ? '正在寻怪' : '正在前往', travel.regionName, travel.x, travel.y, travel.seconds, travel.remaining, travel.activityType, travel.destinationName) });
  } catch (error) { await fail(message, error, '刷新行动失败'); }
};
export const targetHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await chooseTarget(event.current.UserId, Number(route.param('id'))); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleStartFormat(`遭遇 ${battle.targets.map(target => `[${target.name}]`).join('、')}！`, battle) }); await startAutoBattle(message, event.current.UserId); } catch (error) { await fail(message, error, '无法锁定目标'); } };
export const nearbyMonsterAttackHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
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
    } else {
      await message.send({ format: battleStartFormat(`你直奔 ${battle.targets.map(target => `[${target.name}]`).join('、')}，抢先发动攻击！`, battle) });
    }
    await startAutoBattle(message, event.current.UserId);
  } catch (error) { await fail(message, error, '无法攻击目标'); }
};
export const ambushHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await chooseTarget(event.current.UserId, Number(route.param('id')), true); const battle = await battleStatus(event.current.UserId); if (await isFullPartyAutoBattle(event.current.UserId)) { await startAutoBattle(message, event.current.UserId, '战斗开始\n你看准目标，疾速突进——\n（首回合直击伤害+50%）'); return; } await message.send({ format: ambushStartFormat(battle) }); await startAutoBattle(message, event.current.UserId); } catch (error) { await fail(message, error, '无法发动偷袭'); } };
export const queueAmbushHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const spawnId = Number(route.param('id')); const channelId = String(event.current.ChannelId ?? ''); const delivery = { scope: !event.current.IsPrivate && channelId ? 'group' as const : 'c2c' as const, targetId: !event.current.IsPrivate && channelId ? channelId : String(event.current.UserId), botId: String(event.current.BotId ?? '') || undefined }; const result = await queueAmbush(event.current.UserId, spawnId, delivery); if (result.ready) { await chooseTarget(event.current.UserId, result.spawnId ?? spawnId); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleStartFormat(result.residualParty ? '前一支队伍击败了目标，但伤势未愈。你抓住破绽，伏击其残余队伍！' : '前一场战斗已经结束，你趁目标尚未恢复时切入战场。', battle) }); await startAutoBattle(message, event.current.UserId); return; } await message.send({ format: messageFormat('伏击等待', '你已埋伏在战场边缘。当前战斗结束后，机器人会在你发送伏击的会话中通知并自动接管后续战斗。') }); } catch (error) { await fail(message, error, '无法伏击'); } };
export const leaveOccupiedBattleHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await leaveOccupiedBattle(event.current.UserId); const panel = await movementPanel(event.current.UserId, '你避开了正在进行的战斗，可以继续移动。'); const nearby = await nearbyPoints(event.current.UserId); await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); } catch (error) { await fail(message, error, '无法离开战场'); } };
export const forestGuideHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const progress = await forestGuideAdvance(event.current.UserId, String(route.param('action'))); if (!progress.battleChoice) { await message.send({ format: chapterFormat(progress.stage, progress.text) }); return; } await message.send({ format: chapterFormat(5, progress.text) }); const result = await forestGuideChoice(event.current.UserId, progress.battleChoice); await chooseTarget(event.current.UserId, result.spawnId); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleStartFormat(`${result.text}\n本场剧情战斗将暂时关闭自动战斗。`, battle) }); } catch (error) { await fail(message, error, '初章推进失败'); } };
export const switchTargetHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await switchCombatTarget(event.current.UserId, Number(route.param('id'))); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleOperationFormat('目标已切换，请选择本回合行动。', battle) }); } catch (error) { await fail(message, error, '无法切换目标'); } };
const showRetreatArrival = async (message: any, qqUserId: string, retreatText: string) => {
  const encounter = await currentEncounter(qqUserId);
  if (encounter) {
    await showMoveResult(message, qqUserId, { ...encounter, kind: 'encounter', text: `${retreatText}\n\n${encounter.text}` });
    return;
  }
  const nearby = await nearbyPoints(qqUserId);
  // 躲避后只展示当前位置的操作面板；不能再用“移动到当前位置”重绘，
  // 否则城镇追捕会被误判为一次新的移动并立刻再次触发。
  const panel = await movementPanel(qqUserId, retreatText);
  await message.send({ format: panel.addButtonGroup(await movementButtons(qqUserId, nearby.character.activity_status !== 'active')) });
};
const actionHandler = (action: 'attack' | 'skill' | 'item' | 'escape') => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
  try {
    await pvpBattleStatus(event.current.UserId); stopPvpAutoBattle(event.current.UserId);
    const pvpResult = await pvpCombatAction(event.current.UserId, action, Number(route.param('slot')) || undefined); await sendPvpCombatResult(message, event.current.UserId, pvpResult);
    if (!pvpResult.ended) await startPvpAutoBattle(message, event.current.UserId);
    return;
  } catch (pvpError) { if (!(pvpError instanceof Error) || !pvpError.message.includes('当前不在玩家对战中')) throw pvpError; }
  stopAutoBattle(event.current.UserId); let result = await combatAction(event.current.UserId, action, Number(route.param('slot')) || undefined); if (!result.ended && result.waiting) result = await resolvePartyAutoBattleActions(event.current.UserId) ?? result; await sendCombatResult(message, event.current.UserId, result);
  if (action === 'escape' && result.ended) {
    await showRetreatArrival(message, event.current.UserId, '你脱离战斗，沿来路退回上一格。');
    return;
  }
  if (!result.ended && !result.waiting) { const battle = await battleStatus(event.current.UserId); if (battle.canAct) await startAutoBattle(message, event.current.UserId); else scheduleStoryNpcBattle(message, event.current.UserId); }
} catch (error) { try {
  const messageText = error instanceof Error ? error.message : '操作无法完成。';
  const battle = await battleStatus(event.current.UserId);
  // 旧会话或并发结算可能留下“全员倒下但仍 active”的短暂状态。
  // 不能再把玩家困在一个无法操作的战斗面板中，应立即按正常战败流程收束。
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
} catch { await fail(message, error, '操作失败'); } } };
export const attackHandler = actionHandler('attack'); export const skillHandler = actionHandler('skill'); export const itemHandler = actionHandler('item'); export const escapeHandler = actionHandler('escape');
export const encounterHandler = (action: 'avoid' | 'persuade', title: string) => async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const text = await encounterAction(event.current.UserId, Number(route.param('id')), action);
    if (action === 'avoid' && text.includes('退回上一格')) {
      await showRetreatArrival(message, event.current.UserId, text);
      return;
    }
    try {
      const battle = await battleStatus(event.current.UserId); const failedNegotiation = action === 'persuade' && text.startsWith('交涉失败！');
      await message.send({ format: failedNegotiation ? negotiationFailureFormat(text, battle) : battleFormat(title, text, battle) });
      if (failedNegotiation) await startAutoBattle(message, event.current.UserId);
    } catch { await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle(title).addNewline().addNewline().addText(text)).addButtonGroup(moveButtons()) }); }
  } catch (error) { await fail(message, error, `${title}失败`); }
};
