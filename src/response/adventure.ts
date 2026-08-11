import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { battleStatus, combatAction, chooseTarget, encounterAction, explore, forestGuideAdvance, forestGuideChoice, inventory, move, moveTo, nearbyPoints, switchCombatTarget, type VictorySettlement } from '../game/adventure.service';
import { messageFormat } from '../game/message';
import { movedLocationText, outsidePanel, panelButtons } from './panel';

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
  const teammates = battle.members.filter(member => member.id !== battle.characterId);
  const members = battle.members.map(member => {
    const label = member.id === battle.characterId ? '你' : teammates.length === 1 ? '队友' : `队友${teammates.indexOf(member) + 1}`;
    return `${label} HP ${member.hp}/${member.hpMax}｜MP ${member.mp}/${member.mpMax}${member.defeated ? '（倒下）' : member.pending ? '（已行动）' : ''}`;
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
    else if (line.startsWith('➤')) markdown.addNewline().addText(line).addNewline();
    else markdown.addText(line.startsWith('#') ? line.replaceAll('#', '\\#') : line).addNewline();
  }
  return markdown;
};
const battleFormat = (_title: string, text: string, battle: Awaited<ReturnType<typeof battleStatus>>) => {
  const lines = text.split('\n'); if (/^战斗<\d+>回合$/.test(lines[0])) lines.shift();
  const markdown = Format.createMarkdown().addTitle(`战斗<${battle.turn}>回合`);
  if (lines.join('\n')) appendCombatLog(markdown, lines.join('\n')).addNewline();
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
  const lines = log.split('\n'); const turn = /^战斗<(\d+)>回合$/.exec(lines[0]); const title = turn ? `战斗<${Number(turn[1]) + 1}>回合` : '战斗'; if (turn) lines.shift();
  const markdown = Format.createMarkdown().addTitle(title);
  if (lines.join('\n')) appendCombatLog(markdown, lines.join('\n'));
  return Format.create().addMarkdown(markdown);
};
const victoryButtons = () => Format.createButtonGroup().addRow().addButton('操作面板', '/面板', { type: 'command', autoEnter: true, style: 'blue' });
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
  if (settlement.arrivalText) markdown.addText(settlement.arrivalText);
  return Format.create().addMarkdown(markdown);
};
const chapterFormat = (stage: number, text: string) => {
  const markdown = Format.createMarkdown().addTitle(`初章·包容之镇（${stage}/5）`).addNewline().addNewline().addText(text);
  const buttons = Format.createButtonGroup().addRow();
  if (stage === 1) buttons.addButton('循声而去', '/初章 包容之镇 循声而去', { type: 'command', autoEnter: true, style: 'blue' });
  if (stage === 2) buttons.addButton('上前打招呼', '/初章 包容之镇 上前打招呼', { type: 'command', autoEnter: true, style: 'blue' });
  if (stage === 3) buttons.addButton('我也不清楚，一觉醒来就在这儿了', '/初章 包容之镇 我也不清楚，一觉醒来就在这儿了', { type: 'command', autoEnter: true, style: 'blue' });
  if (stage === 4) {
    buttons.addButton('加入', '/初章 包容之镇 加入', { type: 'command', autoEnter: true, style: 'blue' });
    buttons.addButton('婉拒并询问城镇位置', '/初章 包容之镇 婉拒并询问城镇位置', { type: 'command', autoEnter: true });
  }
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export const exploreHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await explore(event.current.UserId); const targets = result.spawns.length ? `\n\n可选目标\n${result.spawns.map(s => result.canViewMonsterInfo ? `#${s.id} ${s.name} Lv.${s.level}｜HP ${s.current_hp}/${s.hp_max}` : `#${s.id} ???`).join('\n')}\n\n发送 /目标 编号 进入战斗。` : ''; await message.send({ format: messageFormat('探索', result.text + targets) }); } catch (error) { logger.warn({ err: error }, 'explore failed'); await fail(message, error); } };
export const inventoryHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const bag = await inventory(event.current.UserId); await message.send({ format: messageFormat('冒险背包', `负重 ${bag.weight.toFixed(2)}/${bag.capacity}｜速度惩罚 -${bag.speedPenalty}\n当前速度 ${bag.speed}\n\n${bag.items.length ? bag.items.map(i => `${i.equipped_slot ? `[已装备·${i.equipped_slot}] ` : i.quick_slot ? `[道具${i.quick_slot}] ` : ''}${i.name} ×${i.quantity}（${i.weight}kg）`).join('\n') : '背包为空。'}`) }); } catch (error) { await fail(message, error); } };
const movementPanel = async (qqUserId: string, description: string) => { const [bag, nearby] = await Promise.all([inventory(qqUserId), nearbyPoints(qqUserId)]); const resting = nearby.character.activity_status !== 'active'; return outsidePanel('行动', movedLocationText(nearby.character), bag.movementSpeed, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), description, nearby.points, resting); };
const showMoveResult = async (message: any, qqUserId: string, result: any) => {
  if (result.kind === 'story') {
    await message.send({ format: chapterFormat(1, '我在雾里听见了兵刃碰撞的声音。那声响被湿润的枝叶过滤得断断续续，却仍清晰地指向前方。\n\n这里不该有人。至少，不该有人像我一样独自在密林深处徘徊。') });
    return;
  }
  if (result.kind !== 'encounter') { const panel = await movementPanel(qqUserId, result.text); const nearby = await nearbyPoints(qqUserId); await message.send({ format: panel.addButtonGroup(panelButtons(nearby.character.activity_status !== 'active')) }); return; }
  const first = result.spawns[0];
  const targets = result.spawns.map((spawn: { name: string; level: number }) => `${spawn.name} Lv.${spawn.level}`).join('\n');
  const markdown = Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(movedLocationText(result.character))
    .addNewline().addBlockquote(result.text).addNewline().addNewline().addTitle('★★★遇战★★★').addNewline().addNewline().addText(targets);
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(encounterButtons(first.id, Boolean(result.canAmbush))) });
};
export const moveHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await showMoveResult(message, event.current.UserId, await move(event.current.UserId, String(route.param('direction')))); } catch (error) { await fail(message, error, '无法移动'); } };
export const goToHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await showMoveResult(message, event.current.UserId, await moveTo(event.current.UserId, Number(route.param('x')), Number(route.param('y')))); } catch (error) { await fail(message, error, '无法前往该位置'); } };
export const targetHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await chooseTarget(event.current.UserId, Number(route.param('id'))); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleFormat('战斗开始', `遭遇 ${battle.targets.map(target => `[${target.name}]`).join('、')}！`, battle) }); } catch (error) { await fail(message, error, '无法锁定目标'); } };
export const ambushHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await chooseTarget(event.current.UserId, Number(route.param('id')), true); const battle = await battleStatus(event.current.UserId); await message.send({ format: ambushStartFormat(battle) }); } catch (error) { await fail(message, error, '无法发动偷袭'); } };
export const forestGuideHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const progress = await forestGuideAdvance(event.current.UserId, String(route.param('action'))); if (!progress.battleChoice) { await message.send({ format: chapterFormat(progress.stage, progress.text) }); return; } await message.send({ format: chapterFormat(5, progress.text) }); const result = await forestGuideChoice(event.current.UserId, progress.battleChoice); await chooseTarget(event.current.UserId, result.spawnId); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleStartFormat(result.text, battle) }); } catch (error) { await fail(message, error, '初章推进失败'); } };
export const switchTargetHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await switchCombatTarget(event.current.UserId, Number(route.param('id'))); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleFormat('切换目标', '目标已切换。', battle) }); } catch (error) { await fail(message, error, '无法切换目标'); } };
const actionHandler = (action: 'attack' | 'skill' | 'item' | 'escape') => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await combatAction(event.current.UserId, action, Number(route.param('slot')) || undefined); if (result.ended) { await message.send({ format: finalBattleFormat(result.log) }); const settlement = result.settlement; const victory = isVictorySettlement(settlement); const format = victory ? victoryFormat(settlement) : Format.create().addMarkdown(Format.createMarkdown().addTitle('战斗结算').addNewline().addNewline().addText(settlement ?? '战斗结束。')); const nearby = victory ? undefined : await nearbyPoints(event.current.UserId); const buttons = victory ? victoryButtons() : panelButtons(nearby?.character.activity_status !== 'active').addRow().addButton('技能列表', '/技能列表', { type: 'command', autoEnter: true, style: 'blue' }); await message.send({ format: format.addButtonGroup(buttons) }); } else { const battle = await battleStatus(event.current.UserId); await message.send({ format: battleFormat(result.waiting ? '行动已确认' : '战斗回合', result.log, battle) }); } } catch (error) { try { const battle = await battleStatus(event.current.UserId); await message.send({ format: battleErrorFormat(error instanceof Error ? error.message : '操作无法完成。', battle) }); } catch { await fail(message, error, '操作失败'); } } };
export const attackHandler = actionHandler('attack'); export const skillHandler = actionHandler('skill'); export const itemHandler = actionHandler('item'); export const escapeHandler = actionHandler('escape');
export const encounterHandler = (action: 'avoid' | 'persuade', title: string) => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const text = await encounterAction(event.current.UserId, Number(route.param('id')), action); try { const battle = await battleStatus(event.current.UserId); await message.send({ format: action === 'persuade' && text.startsWith('交涉失败！') ? negotiationFailureFormat(text, battle) : battleFormat(title, text, battle) }); } catch { await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle(title).addNewline().addNewline().addText(text)).addButtonGroup(moveButtons()) }); } } catch (error) { await fail(message, error, `${title}失败`); } };
