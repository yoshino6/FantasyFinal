import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { battleStatus, combatAction, chooseTarget, encounterAction, explore, inventory, move, moveTo, nearbyPoints, switchCombatTarget } from '../game/adventure.service';
import { messageFormat } from '../game/message';
import { movedLocationText, outsidePanel, panelButtons } from './panel';

const fail = async (message: any, error: unknown, title = '操作失败') => message.send({ format: messageFormat(title, error instanceof Error ? error.message : '请稍后重试。') });
const moveButtons = panelButtons;
const battleButtons = (battle?: Awaited<ReturnType<typeof battleStatus>>) => {
  const group = Format.createButtonGroup();
  if (battle?.targets.length) {
    const row = group.addRow();
    for (const target of battle.targets.filter(target => !target.defeated)) row.addButton(`${battle.selectedTargetId === target.id ? '▶' : ''}${target.name}`, `/切换目标 ${target.id}`, { type: 'command', autoEnter: true, style: 'blue' });
  }
  return group.addRow().addButton('普攻', '/攻击', { type: 'command', autoEnter: true, style: 'blue' }).addButton('技能①', '/技能 1', { type: 'command', autoEnter: true, style: 'blue' }).addButton('技能②', '/技能 2', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('道具①', '/道具 1', { type: 'command', autoEnter: true }).addButton('逃跑', '/逃跑', { type: 'command', autoEnter: true });
};
const encounterButtons = (spawnId: number) => Format.createButtonGroup().addRow().addButton('战斗', `/目标 ${spawnId}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('说服', `/交涉 ${spawnId}`, { type: 'command', autoEnter: true }).addButton('避战', `/躲避 ${spawnId}`, { type: 'command', autoEnter: true });
const battleStateText = (battle: Awaited<ReturnType<typeof battleStatus>>) => {
  const teammates = battle.members.filter(member => member.id !== battle.characterId);
  const members = battle.members.map(member => {
    const label = member.id === battle.characterId ? '你' : teammates.length === 1 ? '队友' : `队友${teammates.indexOf(member) + 1}`;
    return `${label} HP ${member.hp}/${member.hpMax}｜MP ${member.mp}/${member.mpMax}${member.defeated ? '（倒下）' : member.pending ? '（已行动）' : ''}`;
  });
  const targets = battle.targets.map((target, index) => `敌方${index + 1} HP ${target.hp}/${target.hpMax}${target.defeated ? '（击败）' : ''}`);
  return `${members.join('\n')}\n${targets.join('\n')}`;
};
const battleFormat = (_title: string, text: string, battle: Awaited<ReturnType<typeof battleStatus>>) => {
  const lines = text.split('\n'); if (/^战斗<\d+>回合$/.test(lines[0])) lines.shift();
  return Format.create().addMarkdown(Format.createMarkdown().addTitle(`战斗<${battle.turn}>回合`).addText(`${lines.join('\n')}\n${battleStateText(battle)}`)).addButtonGroup(battleButtons(battle));
};

export const exploreHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await explore(event.current.UserId); const targets = result.spawns.length ? `\n\n可选目标\n${result.spawns.map(s => `#${s.id} ${s.name} Lv.${s.level}｜HP ${s.current_hp}/${s.hp_max}`).join('\n')}\n\n发送 /目标 编号 进入战斗。` : ''; await message.send({ format: messageFormat('探索', result.text + targets) }); } catch (error) { logger.warn({ err: error }, 'explore failed'); await fail(message, error); } };
export const inventoryHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const bag = await inventory(event.current.UserId); await message.send({ format: messageFormat('冒险背包', `负重 ${bag.weight.toFixed(2)}/${bag.capacity}｜速度惩罚 -${bag.speedPenalty}\n当前速度 ${bag.speed}\n\n${bag.items.length ? bag.items.map(i => `${i.equipped_slot ? `[已装备·${i.equipped_slot}] ` : i.quick_slot ? `[道具${i.quick_slot}] ` : ''}${i.name} ×${i.quantity}（${i.weight}kg）`).join('\n') : '背包为空。'}`) }); } catch (error) { await fail(message, error); } };
const movementPanel = async (qqUserId: string, description: string) => { const [bag, nearby] = await Promise.all([inventory(qqUserId), nearbyPoints(qqUserId)]); return outsidePanel('行动', movedLocationText(nearby.character), bag.movementSpeed, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), description, nearby.points); };
const showMoveResult = async (message: any, qqUserId: string, result: any) => { if (result.kind === 'encounter') { const first = result.spawns[0]; await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('行动').addText(`\n\n${movedLocationText(result.character)}\n\n${result.text}\n\n`).addTitle('遇战！！！')).addButtonGroup(encounterButtons(first.id)) }); } else await message.send({ format: (await movementPanel(qqUserId, result.text)).addButtonGroup(panelButtons()) }); };
export const moveHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await showMoveResult(message, event.current.UserId, await move(event.current.UserId, String(route.param('direction')))); } catch (error) { await fail(message, error, '无法移动'); } };
export const goToHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await showMoveResult(message, event.current.UserId, await moveTo(event.current.UserId, Number(route.param('x')), Number(route.param('y')))); } catch (error) { await fail(message, error, '无法前往该位置'); } };
export const targetHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await chooseTarget(event.current.UserId, Number(route.param('id'))); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleFormat('战斗开始', `遭遇 ${result.spawns.map(spawn => `[${spawn.name}]`).join('、')}！`, battle) }); } catch (error) { await fail(message, error, '无法锁定目标'); } };
export const switchTargetHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await switchCombatTarget(event.current.UserId, Number(route.param('id'))); const battle = await battleStatus(event.current.UserId); await message.send({ format: battleFormat('切换目标', '目标已切换。', battle) }); } catch (error) { await fail(message, error, '无法切换目标'); } };
const actionHandler = (action: 'attack' | 'skill' | 'item' | 'escape') => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await combatAction(event.current.UserId, action, Number(route.param('slot')) || undefined); if (result.ended) { const lines = result.log.split('\n'); const title = /^战斗<\d+>回合$/.test(lines[0]) ? lines.shift()! : '战斗'; await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle(title).addText(lines.join('\n'))) }); const buttons = moveButtons().addRow().addButton('技能列表', '/技能列表', { type: 'command', autoEnter: true, style: 'blue' }); await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('结算').addText(result.settlement ?? '战斗结束。')).addButtonGroup(buttons) }); } else { const battle = await battleStatus(event.current.UserId); await message.send({ format: battleFormat(result.waiting ? '行动已确认' : '战斗回合', result.log, battle) }); } } catch (error) { await fail(message, error, '战斗操作失败'); } };
export const attackHandler = actionHandler('attack'); export const skillHandler = actionHandler('skill'); export const itemHandler = actionHandler('item'); export const escapeHandler = actionHandler('escape');
export const encounterHandler = (action: 'avoid' | 'persuade', title: string) => async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const text = await encounterAction(event.current.UserId, Number(route.param('id')), action); try { const battle = await battleStatus(event.current.UserId); await message.send({ format: battleFormat(title, text, battle) }); } catch { await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle(title).addText(text)).addButtonGroup(moveButtons()) }); } } catch (error) { await fail(message, error, `${title}失败`); } };
