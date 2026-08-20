import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { readFile } from 'node:fs/promises';
import { addNpcAffinity, battleStatus, cancelTravel, combatAction, chooseTarget, completeTravel, continueForestArrival, currentEncounter, encounterAction, explore, forestGuideAdvance, forestGuideChoice, forestGuideProgress, huntMonster, inventory, leaveOccupiedBattle, move, moveTo, moveToMap, nearbyPoints, queueAmbush, requireNpcAtCurrentPosition, switchCombatTarget, talkToNpc, travelStatus, type VictorySettlement } from '../game/adventure.service';
import { autoBattleConfig, pendingPartyAutoBattleActions } from '../game/auto-battle.service';
import { messageFormat } from '../game/message';
import { currentLocationText, movedLocationText, outsidePanel, panelButtons } from './panel';
import pearGuideImage from '../assets/game/story/pear-guide.png';
import { adventurerProfile, chooseProfession, registerAdventurer } from '../game/character.service';
import { realmEnergyDissipationText } from '../game/constants';
import { currentMainQuest } from '../game/main-quest.service';
import { npcChatDialogue } from '../game/npc-dialogue.service';

const pearGuideImagePath = decodeURIComponent(pearGuideImage).replace(/^([a-zA-Z]):(?![\\/])/, '$1:\\');
const pearGuideImageBuffer = () => readFile(pearGuideImagePath);

const fail = async (message: any, error: unknown, title = '操作失败') => message.send({ format: messageFormat(title, error instanceof Error ? error.message : '请稍后重试。') });
const storyLockedMessage = async (message: any, title: string) => message.send({
  format: messageFormat(title, '你正在推进「初章·包容之镇」，请先完成当前剧情。')
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('继续剧情', '/继续剧情', { type: 'command', autoEnter: true, style: 'blue' }))
});
const isForestGuideLocked = (error: unknown) => error instanceof Error && error.message.includes('你正在推进「初章·包容之镇」');
const moveButtons = panelButtons;
const movementButtons = async (qqUserId: string, resting = false) => {
  const config = await autoBattleConfig(qqUserId);
  return panelButtons(resting, Boolean(config.settings.enabled));
};
const battleButtons = (battle: Awaited<ReturnType<typeof battleStatus>>) => {
  const activeSkills = new Set(battle.readySkillSlots); const activeItems = new Set(battle.itemSlots); const actionStyle = battle.canAct ? 'blue' : undefined;
  const buttons = Format.createButtonGroup()
    .addRow().addButton('普攻', '/攻击', { type: 'command', autoEnter: true, style: actionStyle }).addButton('技能①', '/技能 1', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(1) ? 'blue' : undefined }).addButton('技能②', '/技能 2', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(2) ? 'blue' : undefined }).addButton('技能③', '/技能 3', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(3) ? 'blue' : undefined }).addButton('技能④', '/技能 4', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(4) ? 'blue' : undefined })
    .addRow().addButton('道具①', '/道具 1', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(1) ? 'blue' : undefined }).addButton('道具②', '/道具 2', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(2) ? 'blue' : undefined }).addButton('道具③', '/道具 3', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(3) ? 'blue' : undefined }).addButton('道具④', '/道具 4', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(4) ? 'blue' : undefined }).addButton('逃跑', '/逃跑', { type: 'command', autoEnter: true, style: actionStyle });
  if (battle.appraisal.learned) buttons.addRow().addButton('鉴识', '/鉴识', { type: 'command', autoEnter: true, style: 'blue' });
  return buttons;
};
const encounterButtons = (spawnId: number, canAmbush = false, occupied = false) => occupied
  ? Format.createButtonGroup().addRow().addButton('伏击', `/伏击 ${spawnId}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('离开', '/离开战斗', { type: 'command', autoEnter: true })
  : Format.createButtonGroup().addRow().addButton(canAmbush ? '偷袭' : '战斗', canAmbush ? `/偷袭 ${spawnId}` : `/目标 ${spawnId}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('交涉', `/交涉 ${spawnId}`, { type: 'command', autoEnter: true }).addButton('躲避', `/躲避 ${spawnId}`, { type: 'command', autoEnter: true });
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
  // QQ 会将整段引用以折叠形式呈现，避免冗长战斗过程淹没状态与结算信息。
  markdown.addBlockquote(text.trim().replaceAll('$', '\\$').replaceAll('#', '\\#')).addNewline();
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
    markdown.addText(`【${reward.name}】${reward.levelText ? ` ${reward.levelText}` : ''}\n`).addBlockquote(reward.realmLocked ? realmEnergyDissipationText : `EXP+${reward.experience}`).addNewline();
    for (const drop of reward.drops) {
      markdown.addBlockquote('获得');
      markdown.addButton(`[${drop.name}]`, { data: drop.itemType === 'equipment' && drop.instanceId ? `/装备详情 ${drop.instanceId}` : `/物品图鉴 ${drop.codexId}`, autoEnter: false }).addText(`×${drop.quantity}`).addNewline();
    }
    for (const skill of reward.learned) markdown.addText('领悟').addButton(`[${skill.name}]`, { data: `/技能详情 ${skill.id}`, autoEnter: false }).addText('\n');
    markdown.addNewline();
  }
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
  const markdown = Format.createMarkdown().addTitle(guildStory ? `初临·百纳镇·冒险者工会（${stage}/3）` : `初临·百纳镇（${stage}/6）`).addNewline().addNewline();
  markdown.addText(text);
  const label = guildStory ? '继续' : stage === 4 ? '你说什么？勇者是什么意思？' : stage === 6 ? '挥手告别' : '继续';
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton(label, '/继续剧情', { type: 'command', autoEnter: true, style: 'blue' }));
};

const buildingEncounterFormat = (name: string, code: string, location: string) => {
  const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(location).addNewline().addNewline().addText(name);
  const buttons = Format.createButtonGroup().addRow().addButton('进入', `/建筑进入 ${code}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('忽略', `/建筑忽略 ${code}`, { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const simpleNpcName = (name: string) => name.replace(/（[^）]*）/g, '').trim();
const npcInteractionFormat = async (qqUserId: string, npc: { code: string; name: string }, text: string) => {
  const nearby = await nearbyPoints(qqUserId);
  const name = simpleNpcName(npc.name);
  const markdown = Format.createMarkdown().addTitle(name).addNewline().addNewline().addText(`【${name}】`);
  if (nearby.npcDetailsUnlocked) markdown.addText(' ').addButton('[详情]', { data: `/NPC详情 ${npc.code}`, autoEnter: false });
  markdown.addNewline().addNewline().addBlockquote(text);
  const buttons = Format.createButtonGroup().addRow();
  if (npc.code === 'pear_guide') buttons.addButton('闲聊', '/梨子喵闲聊', { type: 'command', autoEnter: true, style: 'blue' });
  buttons.addButton('离开', `/NPC离开 ${npc.code}`, { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const unimplementedBuildingFormat = (building: { code: string; name: string; description: string }) => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle(building.name).addNewline().addNewline().addBlockquote(building.description))
  .addButtonGroup(Format.createButtonGroup().addRow().addButton('离开', `/建筑离开 ${building.code}`, { type: 'command', autoEnter: true }));
const travelFormat = (title: string, regionName: string, x: number, y: number, total: number, remaining: number, activityType: 'move' | 'hunt' = 'move') => {
  const hunting = activityType === 'hunt';
  return Format.create()
    .addMarkdown(Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(`${hunting ? title : `${title}${regionName}（${x}, ${y}）`}\n预计耗时${total}s\n当前剩余${remaining}s`))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('刷新', '/刷新行动', { type: 'command', autoEnter: true, style: 'blue' }).addButton(hunting ? '取消寻怪' : '取消移动', hunting ? '/取消寻怪' : '/取消移动', { type: 'command', autoEnter: true, style: 'blue' }));
};
const travelTimers = new Map<string, ReturnType<typeof setTimeout>>();
const scheduleTravelCompletion = (message: any, qqUserId: string, seconds: number) => {
  const previous = travelTimers.get(qqUserId); if (previous) clearTimeout(previous);
  travelTimers.set(qqUserId, setTimeout(async () => {
    try { const result = await completeTravel(qqUserId); if (result) await showMoveResult(message, qqUserId, result); } catch (error) { logger.warn({ err: error, qqUserId }, 'complete travel failed'); } finally { travelTimers.delete(qqUserId); }
  }, Math.max(1, seconds) * 1000));
};

// 自动战斗在每次结算后重新挂起，避免同一玩家叠加多个计时器而重复出招。
const autoBattleTimers = new Map<string, ReturnType<typeof setTimeout>>();
const autoBattleVisibleRounds = new Map<string, number>();
const AUTO_BATTLE_VISIBLE_ROUND_LIMIT = 2;
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
      latest = await combatAction(entry.qqUserId, entry.action.type, undefined, entry.action.type === 'skill' ? entry.action.skillId : undefined);
    } catch (error) {
      // 自动配置的技能处于冷却或蓝量不足时，仅让对应队员退回普通攻击。
      if (!(error instanceof Error) || !error.message.startsWith('自动战斗技能')) throw error;
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
const guildFrontDeskFormat = async (qqUserId: string, text?: string) => {
  const [profile, mainQuest, nearby] = await Promise.all([adventurerProfile(qqUserId), currentMainQuest(qqUserId), nearbyPoints(qqUserId)]);
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
  const buttons = Format.createButtonGroup().addRow().addButton(profile.adventurer_registered ? '冒险者 晋升' : '冒险者 注册', '/公会注册', { type: 'command', autoEnter: true, style: 'blue' });
  buttons.addButton('职业选择', '/职业选择', { type: 'command', autoEnter: true, style: profile.adventurer_registered ? 'blue' : undefined });
  buttons.addRow().addButton('闲聊 莫妮卡', '/前台闲聊', { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回公会大厅', '/建筑进入 guild_counter', { type: 'command', autoEnter: true });
  if (mainQuest.title === '【主线·无形的禁锢】') buttons.addRow().addButton('关于 无形的禁锢', '/关于无形的禁锢', { type: 'command', autoEnter: true, style: 'blue' });
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
const movementPanel = async (qqUserId: string, description: string) => { const [bag, nearby] = await Promise.all([inventory(qqUserId), nearbyPoints(qqUserId)]); const resting = nearby.character.activity_status !== 'active'; return outsidePanel('行动', movedLocationText(nearby.character), bag.movementSpeed, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), description, nearby.points, resting, nearby.landmarks); };
const showMoveResult = async (message: any, qqUserId: string, result: any) => {
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
  if (result.kind !== 'encounter') { const panel = await movementPanel(qqUserId, result.text); const nearby = await nearbyPoints(qqUserId); await message.send({ format: panel.addButtonGroup(await movementButtons(qqUserId, nearby.character.activity_status !== 'active')) }); return; }
  const first = result.spawns[0];
  const targets = result.spawns.map((spawn: { name: string; level: number }) => `${spawn.name} Lv.${spawn.level}`).join('\n');
  const hasBoss = result.spawns.some((spawn: { monster_class?: string }) => spawn.monster_class === 'boss');
  const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character))
    .addNewline().addBlockquote(result.text).addNewline().addNewline().addTitle('★★★遇战★★★').addNewline().addNewline().addText(targets);
  if (hasBoss) markdown.addNewline().addButton('[BOSS词条说明]', { data: '/BOSS词条说明', autoEnter: false });
  if (result.occupied) markdown.addNewline().addNewline().addBlockquote('当前坐标有战斗正在进行。你可以伏击等待，或先行离开。');
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(encounterButtons(first.id, Boolean(result.canAmbush), Boolean(result.occupied))) });
};
const showBlockedEncounter = async (message: any, qqUserId: string) => {
  const result = await currentEncounter(qqUserId); if (!result) return false;
  const first = result.spawns[0]; const targets = result.spawns.map((spawn: { name: string; level: number }) => `${spawn.name} Lv.${spawn.level}`).join('\n');
  const hasBoss = result.spawns.some((spawn: { monster_class?: string }) => spawn.monster_class === 'boss');
  const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character)).addNewline().addBlockquote(result.text).addNewline().addNewline().addTitle('★★★遇战★★★').addNewline().addNewline().addText(targets);
  if (hasBoss) markdown.addNewline().addButton('[BOSS词条说明]', { data: '/BOSS词条说明', autoEnter: false });
  if (result.occupied) markdown.addNewline().addNewline().addBlockquote('当前坐标有战斗正在进行。你可以伏击等待，或先行离开。');
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(encounterButtons(first.id, Boolean(result.canAmbush), Boolean(result.occupied))) }); return true;
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
      if (story.chapter === 'guild' && story.stage === 1) {
        try { await message.send({ format: Format.create().addImage(await pearGuideImageBuffer()) }); }
        catch (error) { logger.warn({ err: error, pearGuideImage: pearGuideImagePath }, 'load pear guide image failed'); }
      }
      await message.send({ format: storyFormat }); return;
    }
    if (story.arrivalBuilding) { await message.send({ format: buildingEncounterFormat('冒险者公会', story.arrivalBuilding, '你移动至百纳镇·猫拉瑞亚(-8, -116)') }); return; }
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
    if (code === 'alchemy_sweetshop') {
      if (action === 'enter') { const { alchemistShopFormat } = await import('./alchemist'); await message.send({ format: await alchemistShopFormat(event.current.UserId) }); return; }
      const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开了晴空糖水屋，清甜的草药香仍萦绕在衣袖间。' : '你暂时没有进入晴空糖水屋。');
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
export const guildRegistrationHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireNpcAtCurrentPosition(event.current.UserId, 'guild_counter'); const registered = await registerAdventurer(event.current.UserId); if (!registered) { await message.send({ format: await guildFrontDeskFormat(event.current.UserId, '莫妮卡轻轻摇头：“您的冒险者身份已经登记在册了。晋升考核将在满足条件后开放。”') }); return; } const markdown = Format.createMarkdown().addTitle('冒险家 注册').addNewline().addNewline().addBlockquote('你将手轻放在水晶球上，顿时散发出一阵耀眼的白光。').addNewline().addBlockquote('莫妮卡将一张通体漆黑卡片靠近球体，光芒汇聚成一道银线注入，卡片逐渐被染成银白。').addNewline().addBlockquote('随后一行行异世界文字在卡面上依次浮现——').addNewline().addNewline().addText('获得【冒险者 卡片】\n你随时可以发送 /卡片 查看。'); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回前台', '/建筑区域 guild_counter 前台', { type: 'command', autoEnter: true, style: 'blue' })) }); } catch (error) { await fail(message, error, '注册失败'); } };
export const professionHandler = (action: 'select' | 'detail' | 'choose') => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireNpcAtCurrentPosition(event.current.UserId, 'guild_counter'); if (action === 'select') { await message.send({ format: await professionSelectFormat(event.current.UserId) }); return; } const name = String(route.param('name')); if (action === 'detail') { await message.send({ format: await professionDetailFormat(event.current.UserId, name) }); return; } const code = professionCodeByName[name]; if (!code) throw new Error('未知职业。'); await chooseProfession(event.current.UserId, code); await message.send({ format: await guildFrontDeskFormat(event.current.UserId, `莫妮卡郑重地在档案上盖下印记。“恭喜您成为一名${name}。愿您始终记得最初踏上旅途的理由。”`) }); } catch (error) { await fail(message, error, '职业操作失败'); } };
export const guildChatHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireNpcAtCurrentPosition(event.current.UserId, 'guild_counter'); const { affinity } = await addNpcAffinity(event.current.UserId, 'guild_counter', 'chat'); await message.send({ format: await guildFrontDeskFormat(event.current.UserId, npcChatDialogue('guild_counter', affinity)) }); } catch (error) { await fail(message, error, '闲聊失败'); } };
export const guildBarrierHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireNpcAtCurrentPosition(event.current.UserId, 'guild_counter'); const { advanceRealmBarrier } = await import('../game/main-quest.service'); await advanceRealmBarrier(event.current.UserId, 'guild'); const { barrierAdviceFormat } = await import('./alchemist'); await message.send({ format: barrierAdviceFormat(true) }); } catch (error) { await fail(message, error, '无法询问'); } };
export const adventurerCardHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const profile = await adventurerProfile(event.current.UserId); if (!profile.adventurer_registered) throw new Error('尚未完成冒险者注册。'); const pool = await (await import('../database/pool')).getPool(); const [skills] = await pool.execute<any[]>('SELECT s.name,ps.level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? ORDER BY ps.learned_at,s.id', [profile.id]); const markdown = Format.createMarkdown().addTitle('冒险者卡片').addNewline().addNewline().addText(`姓名：${profile.name}\n冒险者等级：RANK ${profile.adventurer_rank}\n角色等级：Lv.${profile.level}\n职业：${profile.profession_name ?? '未选择'}\n资历：百纳镇冒险者公会登记在册\n\n精通技能：\n${skills.length ? skills.map((skill: any) => `【${skill.name}】Lv.${skill.level}`).join('\n') : '尚未掌握技能'}`); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回前台', '/建筑区域 guild_counter 前台', { type: 'command', autoEnter: true, style: 'blue' })) }); } catch (error) { await fail(message, error, '无法查看卡片'); } };
export const pearGuideHandler = async () => { const [message] = useMessage(); try { await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('梨子喵')) }); await message.send({ format: Format.create().addImage(await pearGuideImageBuffer()) }); } catch (error) { await fail(message, error, '无法展示梨子喵'); } };
const pearGuideFormat = async (qqUserId: string, text?: string) => {
  const greeting = text ?? timeGreeting(
    '清晨的百纳镇还带着薄雾。梨子喵抱着一小袋刚买的点心，耳朵轻轻一抖，笑着朝你招手。\n“早上好呀，勇者大人！又要出发了喵？今天也要精神满满喵！”',
    '午后的街道正热闹，梨子喵从人群里探出脑袋，猫耳兴奋地竖起。\n“勇者大人！正好见到你喵。密林那边有没有什么新鲜见闻？”',
    '晚风掠过石板街，梨子喵抱着尾巴站在魔石灯下，见到你便露出安心的笑容。\n“晚上好喵。看到勇者大人平安回来，梨子喵就放心啦。”'
  );
  return npcInteractionFormat(qqUserId, { code: 'pear_guide', name: '梨子喵' }, greeting);
};
export const pearGuideChatHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'pear_guide');
    const { affinity } = await addNpcAffinity(event.current.UserId, 'pear_guide', 'chat');
    const chat = npcChatDialogue('pear_guide', affinity);
    await message.send({ format: await pearGuideFormat(event.current.UserId, chat) });
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
  const [bag, nearby] = await Promise.all([inventory(qqUserId), nearbyPoints(qqUserId)]);
  const panel = outsidePanel('行动', currentLocationText(nearby.character), bag.movementSpeed, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), `你和${simpleNpcName(name)}道别，继续留意周围的动静。`, nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks);
  await message.send({ format: panel.addButtonGroup(await movementButtons(qqUserId, nearby.character.activity_status !== 'active')) });
};
export const npcLeaveHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { const npc = await requireNpcAtCurrentPosition(event.current.UserId, String(route.param('code'))); if (npc.interaction_kind !== 'npc') throw new Error('该目标不是 NPC。'); await sendNpcLeavePanel(message, event.current.UserId, npc.name); }
  catch (error) { await fail(message, error, '无法离开'); }
};
export const npcEncounterHandler = (action: 'talk' | 'ignore') => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const code = String(route.param('code')); const npc = await requireNpcAtCurrentPosition(event.current.UserId, code); if (npc.interaction_kind !== 'npc') throw new Error('该目标不是 NPC。'); if (action === 'ignore') { const [bag, nearby] = await Promise.all([inventory(event.current.UserId), nearbyPoints(event.current.UserId)]); const panel = outsidePanel('行动', currentLocationText(nearby.character), bag.movementSpeed, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), '你暂时没有上前搭话，继续留意四周。', nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks); await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); return; } const affinity = await addNpcAffinity(event.current.UserId, code, 'chat'); const text = code === 'pear_guide' ? npcChatDialogue('pear_guide', affinity.affinity) : await talkToNpc(event.current.UserId, code); if (code === 'pear_guide') { await message.send({ format: await pearGuideFormat(event.current.UserId, text) }); return; } await message.send({ format: await npcInteractionFormat(event.current.UserId, { code, name: npc.name }, text) }); } catch (error) { await fail(message, error, '对话失败'); } };
export const moveHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await showMoveResult(message, event.current.UserId, await move(event.current.UserId, String(route.param('direction')))); } catch (error) { if (error instanceof Error && error.message.includes('当前格子存在敌对生物') && await showBlockedEncounter(message, event.current.UserId)) return; if (isForestGuideLocked(error)) { await storyLockedMessage(message, '无法移动'); return; } await fail(message, error, '无法移动'); } };
export const goToHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await moveTo(event.current.UserId, Number(route.param('x')), Number(route.param('y'))); if (result.kind === 'travel') { await message.send({ format: travelFormat('开始前往', result.regionName, result.x, result.y, result.seconds, result.remaining) }); scheduleTravelCompletion(message, event.current.UserId, result.remaining); return; } await showMoveResult(message, event.current.UserId, result); } catch (error) { if (error instanceof Error && error.message.includes('当前格子存在敌对生物') && await showBlockedEncounter(message, event.current.UserId)) return; if (isForestGuideLocked(error)) { await storyLockedMessage(message, '无法前往该位置'); return; } await fail(message, error, '无法前往该位置'); } };
export const goToMapHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await moveToMap(event.current.UserId, String(route.param('code'))); if (result.kind === 'travel') { await message.send({ format: travelFormat('开始前往', result.regionName, result.x, result.y, result.seconds, result.remaining) }); scheduleTravelCompletion(message, event.current.UserId, result.remaining); return; } await showMoveResult(message, event.current.UserId, result); } catch (error) { if (error instanceof Error && error.message.includes('当前格子存在敌对生物') && await showBlockedEncounter(message, event.current.UserId)) return; if (isForestGuideLocked(error)) { await storyLockedMessage(message, '无法前往地图'); return; } await fail(message, error, '无法前往地图'); } };
export const huntHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await huntMonster(event.current.UserId); await message.send({ format: travelFormat('开始寻怪……', result.regionName, result.x, result.y, result.seconds, result.remaining, 'hunt') }); scheduleTravelCompletion(message, event.current.UserId, result.remaining); } catch (error) { if (isForestGuideLocked(error)) { await storyLockedMessage(message, '无法寻怪'); return; } await fail(message, error, '无法寻怪'); } };
export const cancelTravelHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const cancelled = await cancelTravel(event.current.UserId); const timer = travelTimers.get(event.current.UserId); if (timer) clearTimeout(timer); travelTimers.delete(event.current.UserId); const [bag, nearby] = await Promise.all([inventory(event.current.UserId), nearbyPoints(event.current.UserId)]); const character = cancelled.character; const cancellationText = cancelled.activityType === 'hunt' ? '寻怪已取消' : '移动已取消'; const panel = outsidePanel('行动', `${cancellationText}\n${currentLocationText(character)}`, bag.movementSpeed, nearby.range, Number(character.pos_x), Number(character.pos_y), nearby.description, nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks); await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); } catch (error) { await fail(message, error, '取消行动失败'); } };
export const refreshTravelHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const travel = await travelStatus(event.current.UserId); if (!travel) throw new Error('当前没有进行中的移动或寻怪。'); if (travel.remaining <= 0) { const result = await completeTravel(event.current.UserId); if (!result) throw new Error('当前没有进行中的移动或寻怪。'); await showMoveResult(message, event.current.UserId, result); return; } await message.send({ format: travelFormat(travel.activityType === 'hunt' ? '正在寻怪' : '正在前往', travel.regionName, travel.x, travel.y, travel.seconds, travel.remaining, travel.activityType) }); } catch (error) { await fail(message, error, '刷新行动失败'); } };
export const targetHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await chooseTarget(event.current.UserId, Number(route.param('id'))); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleStartFormat(`遭遇 ${battle.targets.map(target => `[${target.name}]`).join('、')}！`, battle) }); scheduleAutoBattle(message, event.current.UserId); } catch (error) { await fail(message, error, '无法锁定目标'); } };
export const ambushHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await chooseTarget(event.current.UserId, Number(route.param('id')), true); const battle = await battleStatus(event.current.UserId); await message.send({ format: ambushStartFormat(battle) }); scheduleAutoBattle(message, event.current.UserId); } catch (error) { await fail(message, error, '无法发动偷袭'); } };
export const queueAmbushHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const spawnId = Number(route.param('id')); const result = await queueAmbush(event.current.UserId, spawnId); if (result.ready) { await chooseTarget(event.current.UserId, result.spawnId ?? spawnId); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleStartFormat(result.residualParty ? '前一支队伍击败了目标，但伤势未愈。你抓住破绽，伏击其残余队伍！' : '前一场战斗已经结束，你趁目标尚未恢复时切入战场。', battle) }); scheduleAutoBattle(message, event.current.UserId); return; } await message.send({ format: messageFormat('伏击等待', '你已埋伏在战场边缘。前一支队伍结束战斗后，再次点击“伏击”即可接管残血目标。') }); } catch (error) { await fail(message, error, '无法伏击'); } };
export const leaveOccupiedBattleHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await leaveOccupiedBattle(event.current.UserId); const panel = await movementPanel(event.current.UserId, '你避开了正在进行的战斗，可以继续移动。'); const nearby = await nearbyPoints(event.current.UserId); await message.send({ format: panel.addButtonGroup(await movementButtons(event.current.UserId, nearby.character.activity_status !== 'active')) }); } catch (error) { await fail(message, error, '无法离开战场'); } };
export const forestGuideHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const progress = await forestGuideAdvance(event.current.UserId, String(route.param('action'))); if (!progress.battleChoice) { await message.send({ format: chapterFormat(progress.stage, progress.text) }); return; } await message.send({ format: chapterFormat(5, progress.text) }); const result = await forestGuideChoice(event.current.UserId, progress.battleChoice); await chooseTarget(event.current.UserId, result.spawnId); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleStartFormat(result.text, battle) }); scheduleAutoBattle(message, event.current.UserId); } catch (error) { await fail(message, error, '初章推进失败'); } };
export const switchTargetHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await switchCombatTarget(event.current.UserId, Number(route.param('id'))); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleOperationFormat('目标已切换，请选择本回合行动。', battle) }); } catch (error) { await fail(message, error, '无法切换目标'); } };
const actionHandler = (action: 'attack' | 'skill' | 'item' | 'escape') => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { stopAutoBattle(event.current.UserId); let result = await combatAction(event.current.UserId, action, Number(route.param('slot')) || undefined); if (!result.ended && result.waiting) result = await resolvePartyAutoBattleActions(event.current.UserId) ?? result; await sendCombatResult(message, event.current.UserId, result); if (!result.ended && !result.waiting) { const battle = await battleStatus(event.current.UserId); if (battle.canAct) scheduleAutoBattle(message, event.current.UserId); else scheduleStoryNpcBattle(message, event.current.UserId); } } catch (error) { try { const battle = await battleStatus(event.current.UserId); await message.send({ format: battleErrorFormat(error instanceof Error ? error.message : '操作无法完成。', battle) }); } catch { await fail(message, error, '操作失败'); } } };
export const attackHandler = actionHandler('attack'); export const skillHandler = actionHandler('skill'); export const itemHandler = actionHandler('item'); export const escapeHandler = actionHandler('escape');
export const encounterHandler = (action: 'avoid' | 'persuade', title: string) => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const text = await encounterAction(event.current.UserId, Number(route.param('id')), action); try { const battle = await battleStatus(event.current.UserId); const failedNegotiation = action === 'persuade' && text.startsWith('交涉失败！'); await message.send({ format: failedNegotiation ? negotiationFailureFormat(text, battle) : battleFormat(title, text, battle) }); if (failedNegotiation) scheduleAutoBattle(message, event.current.UserId); } catch { await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle(title).addNewline().addNewline().addText(text)).addButtonGroup(moveButtons()) }); } } catch (error) { await fail(message, error, `${title}失败`); } };
