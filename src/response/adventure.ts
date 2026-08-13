import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { battleStatus, cancelTravel, combatAction, chooseTarget, completeTravel, continueForestArrival, currentEncounter, encounterAction, explore, forestGuideAdvance, forestGuideChoice, inventory, move, moveTo, nearbyPoints, switchCombatTarget, talkToNpc, type VictorySettlement } from '../game/adventure.service';
import { messageFormat } from '../game/message';
import { movedLocationText, outsidePanel, panelButtons } from './panel';
import pearGuideImage from '../assets/game/story/pear-guide.png';
import { adventurerProfile, chooseProfession, registerAdventurer } from '../game/character.service';

const fail = async (message: any, error: unknown, title = '操作失败') => message.send({ format: messageFormat(title, error instanceof Error ? error.message : '请稍后重试。') });
const moveButtons = panelButtons;
const battleButtons = (battle: Awaited<ReturnType<typeof battleStatus>>) => {
  const activeSkills = new Set(battle.readySkillSlots); const activeItems = new Set(battle.itemSlots); const actionStyle = battle.canAct ? 'blue' : undefined;
  const buttons = Format.createButtonGroup()
    .addRow().addButton('普攻', '/攻击', { type: 'command', autoEnter: true, style: actionStyle }).addButton('技能①', '/技能 1', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(1) ? 'blue' : undefined }).addButton('技能②', '/技能 2', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(2) ? 'blue' : undefined }).addButton('技能③', '/技能 3', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(3) ? 'blue' : undefined }).addButton('技能④', '/技能 4', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(4) ? 'blue' : undefined })
    .addRow().addButton('道具①', '/道具 1', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(1) ? 'blue' : undefined }).addButton('道具②', '/道具 2', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(2) ? 'blue' : undefined }).addButton('道具③', '/道具 3', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(3) ? 'blue' : undefined }).addButton('道具④', '/道具 4', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(4) ? 'blue' : undefined }).addButton('逃跑', '/逃跑', { type: 'command', autoEnter: true, style: actionStyle });
  if (battle.appraisal.learned) buttons.addRow().addButton('鉴识', '/鉴识', { type: 'command', autoEnter: true, style: 'blue' });
  return buttons;
};
const encounterButtons = (spawnId: number, canAmbush = false) => Format.createButtonGroup().addRow().addButton(canAmbush ? '偷袭' : '战斗', canAmbush ? `/偷袭 ${spawnId}` : `/目标 ${spawnId}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('交涉', `/交涉 ${spawnId}`, { type: 'command', autoEnter: true }).addButton('躲避', `/躲避 ${spawnId}`, { type: 'command', autoEnter: true });
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
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimStart();
    if (!line) { markdown.addNewline(); continue; }
    if (line === '————') { markdown.addNewline().addNewline().addText('————————').addNewline().addNewline(); continue; }
    if (line.startsWith('§')) markdown.addBlockquote(line.slice(1).replaceAll('$', '\\$').replaceAll('#', '\\#')).addNewline();
    else if (line.startsWith('➥') || line.startsWith('$')) markdown.addBlockquote(line.replaceAll('$', '\\$').replaceAll('#', '\\#')).addNewline();
    else if (line.startsWith('#')) markdown.addBlockquote(line.replaceAll('#', '\\#')).addNewline();
    else if (line.startsWith('➤')) markdown.addNewline().addText(line).addNewline();
    else markdown.addText(line).addNewline();
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
    markdown.addText(`【${reward.name}】${reward.levelText ? ` ${reward.levelText}` : ''}\n`).addBlockquote(`EXP+${reward.experience}`).addNewline();
    for (const drop of reward.drops) {
      markdown.addBlockquote('获得');
      markdown.addButton(`[${drop.name}]`, { data: drop.itemType === 'equipment' && drop.instanceId ? `/装备详情 ${drop.instanceId}` : `/物品图鉴 ${drop.codexId}`, autoEnter: false }).addText(`×${drop.quantity}`).addNewline();
    }
    for (const skill of reward.learned) markdown.addText('领悟').addButton(`[${skill.name}]`, { data: `/技能详情 ${skill.id}`, autoEnter: false }).addText('\n');
    markdown.addNewline();
  }
  return Format.create().addMarkdown(markdown);
};
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

const townArrivalFormat = (stage: number, text: string, completed = false, guildStory = false) => {
  if (completed) return null;
  const markdown = Format.createMarkdown().addTitle(guildStory ? `初临·百纳镇·冒险者工会（${stage}/3）` : `初临·百纳镇（${stage}/6）`).addNewline().addNewline();
  if (guildStory) markdown.addImage(pearGuideImage, { width: 360 });
  markdown.addText(text);
  const label = guildStory ? '继续' : stage === 4 ? '你说什么？勇者是什么意思？' : stage === 6 ? '挥手告别' : '继续';
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton(label, '/继续剧情', { type: 'command', autoEnter: true, style: 'blue' }));
};

const buildingEncounterFormat = (name: string, code: string, location: string) => {
  const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(location).addNewline().addNewline().addText(name);
  const buttons = Format.createButtonGroup().addRow().addButton('进入', `/建筑进入 ${code}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('忽略', `/建筑忽略 ${code}`, { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const travelFormat = (title: string, regionName: string, x: number, y: number, total: number, remaining: number) => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(`${title}${regionName}（${x}, ${y}）\n预计耗时${total}s\n当前剩余${remaining}s`))
  .addButtonGroup(Format.createButtonGroup().addRow().addButton('取消移动', '/取消移动', { type: 'command', autoEnter: true, style: 'blue' }));
const travelTimers = new Map<string, ReturnType<typeof setTimeout>>();
const scheduleTravelCompletion = (message: any, qqUserId: string, seconds: number) => {
  const previous = travelTimers.get(qqUserId); if (previous) clearTimeout(previous);
  travelTimers.set(qqUserId, setTimeout(async () => {
    try { const result = await completeTravel(qqUserId); if (result) await showMoveResult(message, qqUserId, result); } catch (error) { logger.warn({ err: error, qqUserId }, 'complete travel failed'); } finally { travelTimers.delete(qqUserId); }
  }, Math.max(1, seconds) * 1000));
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

const professionDetails: Record<string, { name: string; blessing: string; passive: string; active: string }> = {
  warrior: { name: '战士', blessing: '体质成长+8，力量成长+8', passive: '【剑盾精通】装备长剑类武器时，攻击+8%。装备盾牌类武器时，防御+8%。\n【盾反】受到物理伤害时，有25%几率对伤害来源发动一次普通攻击。', active: '【嘲讽】全体队友的仇恨值减半，减少的仇恨转移至自身。\n【盾击】攻击敌人，并使自身下回合受到的伤害降低50%。' },
  mage: { name: '法师', blessing: '精神成长+8，智力成长+8', passive: '【奥术精通】魔法攻击提高8%，最大魔力提高8%。', active: '【炎枪术】凝聚炽热火枪贯穿敌人。\n【冰霜护壁】为自身施加护盾，并降低近身敌人的速度。' },
  rogue: { name: '盗贼', blessing: '敏捷成长+8，感知成长+8', passive: '【影步】闪避提高8%，移动速度提高1。', active: '【背刺】从敌人破绽处发动高伤害刺击。\n【烟幕】降低全体敌人的命中，提升队伍闪避。' },
  priest: { name: '牧师', blessing: '体质成长+4，精神成长+10，智力成长+4', passive: '【圣祷】治疗效果提高10%，最大魔力提高5%。', active: '【治愈之光】恢复生命最低队友的生命。\n【祝福圣歌】为全队施加短暂的攻击与防御祝福。' }
};
const professionCodeByName: Record<string, string> = { 战士: 'warrior', 法师: 'mage', 盗贼: 'rogue', 牧师: 'priest' };
const guildChatTopics = [
  '“早上好！我是前台接待员莫妮卡。冒险者公会会尽力为每一位踏上旅途的人提供帮助，请多关照！”',
  '“公告板左边是悬赏，右边是普通委托。新手最好先接与自身等级相近的工作，安全永远比报酬重要。”',
  '“百纳镇最有趣的事？大概是每到集市日，猫族商人和矮人工匠总会为一枚银币争论半天，最后又一起去餐厅喝茶。”',
  '“如果在野外迷路，可以回到世界树方向辨认方位。也别忘了随时留意自己的生命与魔力。”',
  '“工会的集结区经常有人寻找同伴。一个可靠的队伍，往往比单纯强大的武器更值得信赖。”'
];
const guildFrontDeskFormat = async (qqUserId: string, text?: string) => {
  const profile = await adventurerProfile(qqUserId);
  const introduction = text ?? (profile.adventurer_registered
    ? '莫妮卡站在整洁的前台后，黑色短发利落地贴着耳侧。她微笑着核对账册，目光明亮而专注。\n“欢迎回来，冒险者。无论是委托、晋升还是旅途中的疑问，我都会尽力协助。”'
    : '前台小姐姐莫妮卡站在整洁的柜台后。她有一头干练的黑色短发，笑容阳光，举止从容而专业。\n“您好，欢迎来到百纳镇冒险者公会。我是接待员莫妮卡，很高兴为您服务。”');
  const markdown = Format.createMarkdown().addTitle('冒险者公会·前台').addNewline().addNewline().addBlockquote(introduction);
  const buttons = Format.createButtonGroup().addRow().addButton(profile.adventurer_registered ? '冒险者 晋升' : '冒险者 注册', '/公会注册', { type: 'command', autoEnter: true, style: 'blue' });
  buttons.addButton('职业选择', '/职业选择', { type: 'command', autoEnter: true, style: profile.adventurer_registered ? 'blue' : undefined });
  buttons.addRow().addButton('闲聊', '/前台闲聊', { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回公会大厅', '/建筑进入 guild_counter', { type: 'command', autoEnter: true });
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
  const markdown = Format.createMarkdown().addTitle(`职业·${detail.name}`).addNewline().addNewline().addText(`①职业赐福：${detail.blessing}\n②被动技能：\n${detail.passive}\n③主动技能：\n${detail.active}`);
  const buttons = Format.createButtonGroup().addRow();
  if (!profile.profession_code) buttons.addButton(`选择 ${detail.name}`, `/选择职业 ${detail.name}`, { type: 'command', autoEnter: true, style: 'blue' });
  buttons.addButton('返回职业选择', '/职业选择', { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export const exploreHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await explore(event.current.UserId); const targets = result.spawns.length ? `\n\n可选目标\n${result.spawns.map(s => result.canViewMonsterInfo ? `#${s.id} ${s.name} Lv.${s.level}｜HP ${s.current_hp}/${s.hp_max}` : `#${s.id} ???`).join('\n')}\n\n发送 /目标 编号 进入战斗。` : ''; await message.send({ format: messageFormat('探索', result.text + targets) }); } catch (error) { logger.warn({ err: error }, 'explore failed'); await fail(message, error); } };
export const inventoryHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const bag = await inventory(event.current.UserId); await message.send({ format: messageFormat('冒险背包', `负重 ${bag.weight.toFixed(2)}/${bag.capacity}｜速度惩罚 -${bag.speedPenalty}\n当前速度 ${bag.speed}\n\n${bag.items.length ? bag.items.map(i => `${i.equipped_slot ? `[已装备·${i.equipped_slot}] ` : i.quick_slot ? `[道具${i.quick_slot}] ` : ''}${i.name} ×${i.quantity}（${i.weight}kg）`).join('\n') : '背包为空。'}`) }); } catch (error) { await fail(message, error); } };
const movementPanel = async (qqUserId: string, description: string) => { const [bag, nearby] = await Promise.all([inventory(qqUserId), nearbyPoints(qqUserId)]); const resting = nearby.character.activity_status !== 'active'; return outsidePanel('行动', movedLocationText(nearby.character), bag.movementSpeed, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), description, nearby.points, resting, nearby.landmarks); };
const showMoveResult = async (message: any, qqUserId: string, result: any) => {
  if (result.kind === 'story') {
    await message.send({ format: chapterFormat(1, '你在林中听见了兵刃碰撞的声音。\n那声响被湿润的枝叶过滤得断断续续，却仍清晰地指向前方。\n是有人在附近战斗吗？') });
    return;
  }
  if (result.kind === 'npc') {
    if (result.npc.code === 'guild_counter') { await message.send({ format: buildingEncounterFormat(result.npc.name, result.npc.code, movedLocationText(result.character)) }); return; }
    const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character)).addNewline().addBlockquote(result.text).addNewline().addNewline().addText(result.npc.name);
    const buttons = Format.createButtonGroup().addRow().addButton('对话', `/NPC对话 ${result.npc.code}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('忽略', `/NPC忽略 ${result.npc.code}`, { type: 'command', autoEnter: true });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) }); return;
  }
  if (result.kind !== 'encounter') { const panel = await movementPanel(qqUserId, result.text); const nearby = await nearbyPoints(qqUserId); await message.send({ format: panel.addButtonGroup(panelButtons(nearby.character.activity_status !== 'active')) }); return; }
  const first = result.spawns[0];
  const targets = result.spawns.map((spawn: { name: string; level: number }) => `${spawn.name} Lv.${spawn.level}`).join('\n');
  const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character))
    .addNewline().addBlockquote(result.text).addNewline().addNewline().addTitle('★★★遇战★★★').addNewline().addNewline().addText(targets);
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(encounterButtons(first.id, Boolean(result.canAmbush))) });
};
const showBlockedEncounter = async (message: any, qqUserId: string) => {
  const result = await currentEncounter(qqUserId); if (!result) return false;
  const first = result.spawns[0]; const targets = result.spawns.map((spawn: { name: string; level: number }) => `${spawn.name} Lv.${spawn.level}`).join('\n');
  const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character)).addNewline().addBlockquote(result.text).addNewline().addNewline().addTitle('★★★遇战★★★').addNewline().addNewline().addText(targets);
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(encounterButtons(first.id, Boolean(result.canAmbush))) }); return true;
};
export const continueStoryHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const story = await continueForestArrival(event.current.UserId);
    const storyFormat = townArrivalFormat(story.stage, story.text, story.completed, story.chapter === 'guild');
    if (storyFormat) { await message.send({ format: storyFormat }); return; }
    if (story.arrivalBuilding) { await message.send({ format: buildingEncounterFormat('冒险者公会', story.arrivalBuilding, '你移动至百纳镇·猫拉瑞亚(-8, -116)') }); return; }
    const panel = await movementPanel(event.current.UserId, story.text);
    const nearby = await nearbyPoints(event.current.UserId);
    await message.send({ format: panel.addButtonGroup(panelButtons(nearby.character.activity_status !== 'active')) });
  } catch (error) { await fail(message, error, '无法继续剧情'); }
};
export const buildingHandler = (action: 'enter' | 'ignore' | 'leave' | 'area') => async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const code = String(route.param('code'));
    if (code !== 'guild_counter') throw new Error('这座建筑暂未开放。');
    if (action === 'enter') { await message.send({ format: guildInteriorFormat() }); return; }
    if (action === 'area') { const area = String(route.param('area')); await message.send({ format: area === '前台' ? await guildFrontDeskFormat(event.current.UserId) : guildInteriorFormat(area) }); return; }
    const panel = await movementPanel(event.current.UserId, action === 'leave' ? '你离开了冒险者公会，回到门前的石板街。' : '你暂时没有进入冒险者公会。');
    const nearby = await nearbyPoints(event.current.UserId);
    await message.send({ format: panel.addButtonGroup(panelButtons(nearby.character.activity_status !== 'active')) });
  } catch (error) { await fail(message, error, '建筑操作失败'); }
};
export const guildRegistrationHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const registered = await registerAdventurer(event.current.UserId); if (!registered) { await message.send({ format: await guildFrontDeskFormat(event.current.UserId, '莫妮卡轻轻摇头：“您的冒险者身份已经登记在册了。晋升考核将在满足条件后开放。”') }); return; } const markdown = Format.createMarkdown().addTitle('冒险家 注册').addNewline().addNewline().addBlockquote('你将手轻放在水晶球上，顿时散发出一阵耀眼的白光。').addNewline().addBlockquote('莫妮卡将一张通体漆黑卡片靠近球体，光芒汇聚成一道银线注入，卡片逐渐被染成银白。').addNewline().addBlockquote('随后一行行异世界文字在卡面上依次浮现——').addNewline().addNewline().addText('获得【冒险者 卡片】\n你随时可以发送 /卡片 查看。'); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回前台', '/建筑区域 guild_counter 前台', { type: 'command', autoEnter: true, style: 'blue' })) }); } catch (error) { await fail(message, error, '注册失败'); } };
export const professionHandler = (action: 'select' | 'detail' | 'choose') => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { if (action === 'select') { await message.send({ format: await professionSelectFormat(event.current.UserId) }); return; } const name = String(route.param('name')); if (action === 'detail') { await message.send({ format: await professionDetailFormat(event.current.UserId, name) }); return; } const code = professionCodeByName[name]; if (!code) throw new Error('未知职业。'); await chooseProfession(event.current.UserId, code); await message.send({ format: await guildFrontDeskFormat(event.current.UserId, `莫妮卡郑重地在档案上盖下印记。“恭喜您成为一名${name}。愿您始终记得最初踏上旅途的理由。”`) }); } catch (error) { await fail(message, error, '职业操作失败'); } };
export const guildChatHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const profile = await adventurerProfile(event.current.UserId); const pool = await (await import('../database/pool')).getPool(); await pool.execute('INSERT INTO player_guild_chats (character_id,chat_count) VALUES (?,1) ON DUPLICATE KEY UPDATE chat_count=chat_count+1', [profile.id]); const [rows] = await pool.execute<any[]>('SELECT chat_count FROM player_guild_chats WHERE character_id=?', [profile.id]); const index = (Number(rows[0]?.chat_count ?? 1) - 1) % guildChatTopics.length; await message.send({ format: await guildFrontDeskFormat(event.current.UserId, guildChatTopics[index]) }); } catch (error) { await fail(message, error, '闲聊失败'); } };
export const adventurerCardHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const profile = await adventurerProfile(event.current.UserId); if (!profile.adventurer_registered) throw new Error('尚未完成冒险者注册。'); const pool = await (await import('../database/pool')).getPool(); const [skills] = await pool.execute<any[]>('SELECT s.name,ps.level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? ORDER BY ps.learned_at,s.id', [profile.id]); const markdown = Format.createMarkdown().addTitle('冒险者卡片').addNewline().addNewline().addText(`姓名：${profile.name}\n冒险者等级：RANK ${profile.adventurer_rank}\n角色等级：Lv.${profile.level}\n职业：${profile.profession_name ?? '未选择'}\n资历：百纳镇冒险者公会登记在册\n\n精通技能：\n${skills.length ? skills.map((skill: any) => `【${skill.name}】Lv.${skill.level}`).join('\n') : '尚未掌握技能'}`); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回前台', '/建筑区域 guild_counter 前台', { type: 'command', autoEnter: true, style: 'blue' })) }); } catch (error) { await fail(message, error, '无法查看卡片'); } };
export const npcEncounterHandler = (action: 'talk' | 'ignore') => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const code = String(route.param('code')); if (action === 'ignore') { const [bag, nearby] = await Promise.all([inventory(event.current.UserId), nearbyPoints(event.current.UserId)]); const panel = outsidePanel('行动', currentLocationText(nearby.character), bag.movementSpeed, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), '你暂时没有上前搭话，继续留意四周。', nearby.points, nearby.character.activity_status !== 'active', nearby.landmarks); await message.send({ format: panel.addButtonGroup(panelButtons(nearby.character.activity_status !== 'active')) }); return; } const text = await talkToNpc(event.current.UserId, code); const panel = await movementPanel(event.current.UserId, text); const nearby = await nearbyPoints(event.current.UserId); await message.send({ format: panel.addButtonGroup(panelButtons(nearby.character.activity_status !== 'active')) }); } catch (error) { await fail(message, error, '对话失败'); } };
export const moveHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await showMoveResult(message, event.current.UserId, await move(event.current.UserId, String(route.param('direction')))); } catch (error) { if (error instanceof Error && error.message.includes('当前格子存在敌对生物') && await showBlockedEncounter(message, event.current.UserId)) return; await fail(message, error, '无法移动'); } };
export const goToHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await moveTo(event.current.UserId, Number(route.param('x')), Number(route.param('y'))); if (result.kind === 'travel') { await message.send({ format: travelFormat('开始前往', result.regionName, result.x, result.y, result.seconds, result.remaining) }); scheduleTravelCompletion(message, event.current.UserId, result.remaining); return; } await showMoveResult(message, event.current.UserId, result); } catch (error) { if (error instanceof Error && error.message.includes('当前格子存在敌对生物') && await showBlockedEncounter(message, event.current.UserId)) return; await fail(message, error, '无法前往该位置'); } };
export const cancelTravelHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const character = await cancelTravel(event.current.UserId); const timer = travelTimers.get(event.current.UserId); if (timer) clearTimeout(timer); travelTimers.delete(event.current.UserId); const panel = await movementPanel(event.current.UserId, `移动已取消\n${'你位于'}${character.region_name}（${character.pos_x}, ${character.pos_y}）`); const nearby = await nearbyPoints(event.current.UserId); await message.send({ format: panel.addButtonGroup(panelButtons(nearby.character.activity_status !== 'active')) }); } catch (error) { await fail(message, error, '取消移动失败'); } };
export const targetHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await chooseTarget(event.current.UserId, Number(route.param('id'))); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleStartFormat(`遭遇 ${battle.targets.map(target => `[${target.name}]`).join('、')}！`, battle) }); } catch (error) { await fail(message, error, '无法锁定目标'); } };
export const ambushHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await chooseTarget(event.current.UserId, Number(route.param('id')), true); const battle = await battleStatus(event.current.UserId); await message.send({ format: ambushStartFormat(battle) }); } catch (error) { await fail(message, error, '无法发动偷袭'); } };
export const forestGuideHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const progress = await forestGuideAdvance(event.current.UserId, String(route.param('action'))); if (!progress.battleChoice) { await message.send({ format: chapterFormat(progress.stage, progress.text) }); return; } await message.send({ format: chapterFormat(5, progress.text) }); const result = await forestGuideChoice(event.current.UserId, progress.battleChoice); await chooseTarget(event.current.UserId, result.spawnId); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleStartFormat(result.text, battle) }); } catch (error) { await fail(message, error, '初章推进失败'); } };
export const switchTargetHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await switchCombatTarget(event.current.UserId, Number(route.param('id'))); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleOperationFormat('目标已切换，请选择本回合行动。', battle) }); } catch (error) { await fail(message, error, '无法切换目标'); } };
const actionHandler = (action: 'attack' | 'skill' | 'item' | 'escape') => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await combatAction(event.current.UserId, action, Number(route.param('slot')) || undefined); if (result.ended) { await message.send({ format: finalBattleFormat(result.log) }); const settlement = result.settlement; const victory = isVictorySettlement(settlement); const format = victory ? victoryFormat(settlement) : Format.create().addMarkdown(Format.createMarkdown().addTitle('战斗结算').addNewline().addNewline().addText(settlement ?? '战斗结束。')); const nearby = victory ? undefined : await nearbyPoints(event.current.UserId); const buttons = victory ? victoryButtons(settlement.arrivalPending) : panelButtons(nearby?.character.activity_status !== 'active').addRow().addButton('技能列表', '/技能列表', { type: 'command', autoEnter: true, style: 'blue' }); await message.send({ format: format.addButtonGroup(buttons) }); } else { const battle = await battleStatus(event.current.UserId); await message.send({ format: battleFormat(result.waiting ? '行动已确认' : '战斗回合', result.log, battle) }); } } catch (error) { try { const battle = await battleStatus(event.current.UserId); await message.send({ format: battleErrorFormat(error instanceof Error ? error.message : '操作无法完成。', battle) }); } catch { await fail(message, error, '操作失败'); } } };
export const attackHandler = actionHandler('attack'); export const skillHandler = actionHandler('skill'); export const itemHandler = actionHandler('item'); export const escapeHandler = actionHandler('escape');
export const encounterHandler = (action: 'avoid' | 'persuade', title: string) => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const text = await encounterAction(event.current.UserId, Number(route.param('id')), action); try { const battle = await battleStatus(event.current.UserId); await message.send({ format: action === 'persuade' && text.startsWith('交涉失败！') ? negotiationFailureFormat(text, battle) : battleFormat(title, text, battle) }); } catch { await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle(title).addNewline().addNewline().addText(text)).addButtonGroup(moveButtons()) }); } } catch (error) { await fail(message, error, `${title}失败`); } };
