import { Format, logger, useEvent, useMessage } from 'alemonjs';
import { battleStatus, completeTravel, inventory, nearbyPoints, resumeAction, startRest, travelStatus, type MapLandmark, type NearbyPoint } from '../game/adventure.service';
import { messageFormat, sendWithTextFallback } from '../game/message';

const directionText = (point: NearbyPoint, x: number, y: number) => {
  const vertical = point.y > y ? '北' : point.y < y ? '南' : '';
  const horizontal = point.x > x ? '东' : point.x < x ? '西' : '';
  return horizontal || vertical ? `${horizontal}${vertical}方` : '此处';
};

type LocationCharacter = { adventurer_registered: number; region_name: string; pos_x: number; pos_y: number; pos_z: number };
const areaText = (character: LocationCharacter, verb: '位于' | '移动至') => Number(character.adventurer_registered)
  ? `你${verb}${character.region_name} (${character.pos_x}, ${character.pos_y}, ${character.pos_z})`
  : `你${verb}未知之地 (?, ?)`;
export const currentLocationText = (character: LocationCharacter) => areaText(character, '位于');
export const movedLocationText = (character: LocationCharacter) => areaText(character, '移动至');

export const outsidePanel = (title: string, location: string, speed: number, range: number, x: number, y: number, description: string, points: NearbyPoint[], resting = false, landmarks: MapLandmark[] = []) => {
  const markdown = Format.createMarkdown().addTitle(title)
    .addText(`\n\n${location}\n\n${description}\n\n${resting ? '状态：休息中（每秒恢复 1% 生命与魔力）\n' : ''}移动速度：${speed}\n感知范围：${range}`);
  if (landmarks.length) {
    markdown.addNewline().addNewline().addText('地图标识：').addNewline();
    for (const landmark of landmarks) markdown.addButton(landmark.name, { data: `/前往 ${landmark.x} ${landmark.y}`, autoEnter: false }).addNewline();
  }
  markdown.addText('\n\n周边目标：\n');
  if (!points.length) markdown.addText('空空如也');
  else {
    for (const point of points) {
      const label = `${point.type === 'NPC' ? '' : `【${point.type}】`}${point.name}`;
      if (speed >= point.distance) markdown.addButton(label, { data: `/前往 ${point.x} ${point.y}`, autoEnter: false });
      else markdown.addText(label);
      markdown.addText(` · ${directionText(point, x, y)}${point.distance}\n`);
    }
  }
  return Format.create().addMarkdown(markdown);
};

export const panelButtons = (resting = false) => Format.createButtonGroup()
    .addRow().addButton('装备', '/装备', { type: 'command', autoEnter: true }).addButton('上', '/移动 上', { type: 'command', autoEnter: true, style: resting ? undefined : 'blue' }).addButton('背包', '/背包', { type: 'command', autoEnter: true })
    .addRow().addButton('左', '/移动 左', { type: 'command', autoEnter: true, style: resting ? undefined : 'blue' }).addButton('角色', '/角色', { type: 'command', autoEnter: true }).addButton('右', '/移动 右', { type: 'command', autoEnter: true, style: resting ? undefined : 'blue' })
    .addRow().addButton('技能', '/技能列表', { type: 'command', autoEnter: true }).addButton('下', '/移动 下', { type: 'command', autoEnter: true, style: resting ? undefined : 'blue' }).addButton('队伍', '/队伍', { type: 'command', autoEnter: true })
    .addRow().addButton(resting ? '行动' : '休息', resting ? '/行动' : '/休息', { type: 'command', autoEnter: true, style: 'blue' }).addButton('菜单', '/菜单', { type: 'command', autoEnter: true, style: 'blue' });

const battlePanel = (battle: Awaited<ReturnType<typeof battleStatus>>) => {
  const markdown = Format.createMarkdown().addTitle('战斗面板').addNewline().addNewline().addText(`第 ${battle.turn} 回合\n${battle.members.map(member => `【${member.name}】HP ${member.hp}/${member.hpMax}｜MP ${member.mp}/${member.mpMax}`).join('\n')}\n`);
  for (const [index, target] of battle.targets.entries()) markdown.addButton(`${battle.selectedTargetId === target.id ? '▶' : ''}敌方${index + 1} ${target.name}`, { data: `/切换目标 ${target.id}`, autoEnter: false }).addText(` HP ${target.hp}/${target.hpMax}${target.defeated ? '（击败）' : ''}\n`);
  const activeSkills = new Set(battle.readySkillSlots); const activeItems = new Set(battle.itemSlots); const actionStyle = battle.canAct ? 'blue' : undefined;
  const buttons = Format.createButtonGroup()
    .addRow().addButton('普攻', '/攻击', { type: 'command', autoEnter: true, style: actionStyle }).addButton('技能①', '/技能 1', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(1) ? 'blue' : undefined }).addButton('技能②', '/技能 2', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(2) ? 'blue' : undefined }).addButton('技能③', '/技能 3', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(3) ? 'blue' : undefined }).addButton('技能④', '/技能 4', { type: 'command', autoEnter: true, style: battle.canAct && activeSkills.has(4) ? 'blue' : undefined })
    .addRow().addButton('道具①', '/道具 1', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(1) ? 'blue' : undefined }).addButton('道具②', '/道具 2', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(2) ? 'blue' : undefined }).addButton('道具③', '/道具 3', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(3) ? 'blue' : undefined }).addButton('道具④', '/道具 4', { type: 'command', autoEnter: true, style: battle.canAct && activeItems.has(4) ? 'blue' : undefined }).addButton('逃跑', '/逃跑', { type: 'command', autoEnter: true, style: actionStyle });
  if (battle.appraisal.learned) buttons.addRow().addButton('鉴识', '/鉴识', { type: 'command', autoEnter: true, style: 'blue' });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const travelPanel = (travel: NonNullable<Awaited<ReturnType<typeof travelStatus>>>) => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(`正在前往${travel.regionName}（${travel.x}, ${travel.y}）\n预计耗时${travel.seconds}s\n当前剩余${travel.remaining}s`))
  .addButtonGroup(Format.createButtonGroup().addRow().addButton('取消移动', '/取消移动', { type: 'command', autoEnter: true, style: 'blue' }));

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const travel = await travelStatus(event.current.UserId);
    if (travel && travel.remaining > 0) { await message.send({ format: travelPanel(travel) }); return; }
    if (travel) await completeTravel(event.current.UserId);
    try {
      const battle = await battleStatus(event.current.UserId);
      await sendWithTextFallback(message, battlePanel(battle), `【战斗面板】\n${battle.members.map(member => `【${member.name}】HP ${member.hp}/${member.hpMax}｜MP ${member.mp}/${member.mpMax}`).join('\n')}\n${battle.targets.map(target => `敌方 #${target.id} ${target.name} HP ${target.hp}/${target.hpMax}`).join('\n')}\n/攻击｜/技能 1｜/道具 1｜/逃跑`);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('当前不在战斗中')) throw error;
      const [bag, nearby] = await Promise.all([inventory(event.current.UserId), nearbyPoints(event.current.UserId)]);
      const targets = nearby.points.length ? `\n\n周边目标\n${nearby.points.map(point => `${point.type === 'NPC' ? '' : `【${point.type}】`}${point.name} · ${directionText(point, Number(nearby.character.pos_x), Number(nearby.character.pos_y))}${point.distance}${bag.movementSpeed >= point.distance ? `：/前往 ${point.x} ${point.y}` : ''}`).join('\n')}` : '\n\n没有发现任何目标。';
      const x = Number(nearby.character.pos_x); const y = Number(nearby.character.pos_y);
      const location = currentLocationText(nearby.character);
      const resting = nearby.character.activity_status !== 'active';
      const mapText = nearby.mapUnlocked ? `\n\n地图标识：\n${nearby.landmarks.map(landmark => landmark.name).join('\n')}` : '';
      await sendWithTextFallback(message, outsidePanel('操作面板', location, bag.movementSpeed, nearby.range, x, y, nearby.description, nearby.points, resting, nearby.landmarks).addButtonGroup(panelButtons(resting)), `【操作面板】\n${location}\n\n${nearby.description}${mapText}\n\n移动速度：${bag.movementSpeed}\n感知范围：${nearby.range}${targets}\n\n/移动 上｜/移动 下｜/移动 左｜/移动 右｜/探索｜/背包`);
    }
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'open panel failed');
    await message.send({ format: messageFormat('面板不可用', error instanceof Error ? error.message : '请稍后重试。') });
  }
};

const showRestPanel = async (message: any, qqUserId: string, text: string) => {
  const [bag, nearby] = await Promise.all([inventory(qqUserId), nearbyPoints(qqUserId)]); const resting = nearby.character.activity_status !== 'active';
  const panel = outsidePanel('操作面板', currentLocationText(nearby.character), bag.movementSpeed, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), text, nearby.points, resting, nearby.landmarks).addButtonGroup(panelButtons(resting));
  await sendWithTextFallback(message, panel, `【操作面板】\n${text}`);
};
export const restHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await startRest(event.current.UserId); await showRestPanel(message, event.current.UserId, result.message); } catch (error) { await message.send({ format: messageFormat('无法休息', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const resumeActionHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await resumeAction(event.current.UserId); await showRestPanel(message, event.current.UserId, result.message); } catch (error) { await message.send({ format: messageFormat('暂时无法行动', error instanceof Error ? error.message : '请稍后重试。') }); } };
