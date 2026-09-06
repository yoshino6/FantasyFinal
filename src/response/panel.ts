import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { battleStatus, blockedDungeonDirections, completeTravel, movementProfile, nearbyPoints, resourceMiningStatus, resumeAction, setMapLandmarksVisible, setNearbyPlayersVisible, startRest, travelStatus, type MapLandmark, type NearbyPoint } from '../game/adventure.service';
import { messageFormat, sendWithTextFallback } from '../game/message';
import { autoBattleConfig } from '../game/auto-battle.service';
import { homePanel } from '../game/home.service';
import { durationText } from '../game/time-format';
import { markerName, sortMapMarkers } from '../game/map-marker.service';
import { omniscientTraces } from '../game/omniscient.service';

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

export const outsidePanel = (title: string, location: string, speed: number, range: number, x: number, y: number, description: string, points: NearbyPoint[], resting = false, landmarks: MapLandmark[] = [], speaker = '', speedLimit = speed, perceptionObscured = false, showLandmarks = true, showPlayers = true, mapUnlocked = false, activityStatus?: string, emphasizeSpeaker = false) => {
  const markdown = Format.createMarkdown().addTitle(title).addNewline().addNewline().addText(location).addNewline().addNewline();
  if (speaker) {
    if (emphasizeSpeaker) for (const line of speaker.split('\n')) markdown.addText('> ').addBold(line).addNewline();
    else markdown.addText(speaker).addNewline();
    markdown.addNewline();
  }
  markdown.addBlockquote(description).addNewline().addNewline();
  if (resting) markdown.addText(activityStatus === 'detained' ? '状态：关押中' : activityStatus === 'unconscious' ? '状态：昏迷中' : '状态：休息中（每秒恢复 1% 生命与魔力）').addNewline();
  markdown.addText(`移动速度：（${speed}/${speedLimit}）`).addButton('[调整移速]', { data: '/调整移速 ', autoEnter: false }).addNewline().addText(`感知范围：${range}`);
  if (perceptionObscured) markdown.addNewline().addBlockquote('压抑的黑暗干扰了你的感知').addNewline();
  const normalLandmarks = sortMapMarkers(landmarks.filter(landmark => landmark.kind !== 'bounty'));
  const entranceLandmarks = normalLandmarks.filter(landmark => landmark.code?.includes('entrance'));
  const regularLandmarks = normalLandmarks.filter(landmark => !landmark.code?.includes('entrance'));
  const bountyLandmarks = landmarks.filter(landmark => landmark.kind === 'bounty');
  if (mapUnlocked || landmarks.length) {
    markdown.addNewline().addNewline().addText('地图标识：').addButton(showLandmarks ? '[折叠]' : '[显示]', { data: `/地图标识 ${showLandmarks ? '折叠' : '显示'}`, autoEnter: false }).addNewline();
    if (showLandmarks) {
      for (const landmark of regularLandmarks) {
        const seconds = Math.max(1, Math.ceil((Math.abs(landmark.x - x) + Math.abs(landmark.y - y)) / speedLimit));
        markdown.addText('> ').addButton(markerName(landmark), { data: `/前往 ${landmark.x} ${landmark.y}`, autoEnter: false }).addText(`（${landmark.x}, ${landmark.y}）[预计${durationText(seconds)}]`).addNewline();
      }
    }
    if (showLandmarks) for (const landmark of bountyLandmarks) {
      const seconds = Math.max(1, Math.ceil((Math.abs(landmark.x - x) + Math.abs(landmark.y - y)) / speedLimit));
      markdown.addText('> ').addButton(`🎯 ${landmark.name}`, { data: `/前往 ${landmark.x} ${landmark.y}`, autoEnter: false }).addText(`（${landmark.x}, ${landmark.y}）[预计${durationText(seconds)}]`).addNewline();
    }
    if (showLandmarks) for (const landmark of entranceLandmarks) {
      const seconds = Math.max(1, Math.ceil((Math.abs(landmark.x - x) + Math.abs(landmark.y - y)) / speedLimit));
      markdown.addText('> ').addButton(markerName(landmark), { data: `/前往 ${landmark.x} ${landmark.y}`, autoEnter: false }).addText(`（${landmark.x}, ${landmark.y}）[预计${durationText(seconds)}]`).addNewline();
    }
  }
  const visiblePoints = showPlayers ? points : points.filter(point => point.type !== '玩家');
  markdown.addNewline().addNewline().addText('感知内目标：').addButton(showPlayers ? '[隐藏玩家]' : '[显示玩家]', { data: `/感知内目标 ${showPlayers ? '隐藏玩家' : '显示玩家'}`, autoEnter: false }).addNewline();
  if (!visiblePoints.length) markdown.addBlockquote('空空如也');
  else {
    for (const point of visiblePoints) {
      const label = `${point.wanted ? '【红名】' : ''}${point.name}`;
      markdown.addText('> ');
      // 标题语法会放大整行；这里仅加深类型，确保名称、方位与操作仍保持引用小号。
      markdown.addBold(point.type).addText(' ');
      markdown.addText(label);
      markdown.addText(` · ${directionText(point, x, y)}${point.distance}`);
      // 域民只有离开驻点时才会进入野外感知；此时明确给出坐标，便于追踪巡游路线。
      if (point.type === '域民') markdown.addText(`（${point.x}, ${point.y}）`);
      // 同格目标的“前往”只会把玩家原地送回；建筑则可直接进入，其余目标重开对应互动。
      if (point.type === '怪物' && point.code) markdown.addText(' ').addButton('[交互]', { data: `/怪物交互 ${point.code}`, autoEnter: false });
      else if (point.distance === 0 && point.interaction?.type === '建筑') markdown.addText(' ').addButton('[进入]', { data: `/建筑进入 ${point.interaction.id}`, autoEnter: false });
      else if (point.type === '玩家' && point.distance === 0 && point.code) markdown.addText(' ').addButton('[互动]', { data: `/玩家互动 ${point.code}`, autoEnter: false });
      else if (point.type === '玩家' && point.distance > 0) markdown.addText(' ').addButton('[前往]', { data: `/前往 ${point.x} ${point.y}`, autoEnter: false });
      else if (point.type !== '玩家' && point.distance === 0 && point.interaction) markdown.addText(' ').addButton('[互动]', { data: `/坐标互动 ${point.interaction.type} ${point.interaction.id}`, autoEnter: false });
      else if (point.type !== '玩家' && point.distance > 0 && speedLimit >= point.distance) markdown.addText(' ').addButton('[前往]', { data: `/前往 ${point.x} ${point.y}`, autoEnter: false });
      if (point.type === '怪物' && point.code) markdown.addText(' ').addButton('[攻击]', { data: `/怪物攻击 ${point.code}`, autoEnter: false });
      if (point.isTrialTarget && point.code) markdown.addText(' ').addButton('[试炼]', { data: `/怪物攻击 ${point.code}`, autoEnter: false });
      if (point.type === '玩家' && point.code) {
        if (point.pvpAvailable) markdown.addText(' ').addButton('[攻击]', { data: `/玩家攻击 ${point.code}`, autoEnter: false });
        else markdown.addText(' [好友]');
      }
      markdown.addNewline();
    }
  }
  return Format.create().addMarkdown(markdown);
};

export const panelButtons = (resting = false, _autoBattleEnabled = false, blockedDirections: string[] = []) => {
  const blocked = (direction: string) => blockedDirections.includes(direction);
  const dungeon = blockedDirections.length > 0;
  const locationAction = dungeon ? { label: '脱离', command: '/脱离' } : { label: '寻怪', command: '/寻怪' };
  const moveButton = (direction: '上' | '下' | '左' | '右') => ({ label: blocked(direction) ? '石墙' : direction, command: blocked(direction) ? '/面板' : `/移动 ${direction}`, style: blocked(direction) || resting ? undefined : 'blue' as const });
  const up = moveButton('上'); const down = moveButton('下'); const left = moveButton('左'); const right = moveButton('右');
  return Format.createButtonGroup()
    .addRow().addButton(locationAction.label, locationAction.command, { type: 'command', autoEnter: true }).addButton(up.label, up.command, { type: 'command', autoEnter: true, style: up.style }).addButton('地图', '/地图', { type: 'command', autoEnter: true })
    .addRow().addButton(left.label, left.command, { type: 'command', autoEnter: true, style: left.style }).addButton(resting ? '行动' : '休息', resting ? '/行动' : '/休息', { type: 'command', autoEnter: true }).addButton(right.label, right.command, { type: 'command', autoEnter: true, style: right.style })
    .addRow().addButton('自动战斗', '/自动战斗', { type: 'command', autoEnter: true }).addButton(down.label, down.command, { type: 'command', autoEnter: true, style: down.style }).addButton('队伍', '/队伍', { type: 'command', autoEnter: true })
    .addRow().addButton('角色', '/角色', { type: 'command', autoEnter: true }).addButton('装备', '/装备', { type: 'command', autoEnter: true }).addButton('背包', '/背包', { type: 'command', autoEnter: true }).addButton('技能', '/技能列表', { type: 'command', autoEnter: true }).addButton('好友', '/好友', { type: 'command', autoEnter: true })
    .addRow().addButton('菜单', '/菜单', { type: 'command', autoEnter: true });
};

const battlePanel = async (battle: Awaited<ReturnType<typeof battleStatus>>) => {
  // 与回合结果共用状态与按钮，避免重开面板后丢失切磋模式或友方选取。
  const { battleOperationFormat } = await import('./adventure');
  return battleOperationFormat('', battle);
};
const limitedViewButtons = (buttons: ReturnType<typeof Format.createButtonGroup>) => buttons.addRow()
  .addButton('角色', '/角色', { type: 'command', autoEnter: true }).addButton('装备', '/装备', { type: 'command', autoEnter: true }).addButton('背包', '/背包', { type: 'command', autoEnter: true }).addButton('技能', '/技能列表', { type: 'command', autoEnter: true }).addButton('好友', '/好友', { type: 'command', autoEnter: true });
const travelPanel = (travel: NonNullable<Awaited<ReturnType<typeof travelStatus>>>) => {
  const hunting = travel.activityType === 'hunt';
  const buttons = limitedViewButtons(Format.createButtonGroup().addRow().addButton('刷新', '/刷新行动', { type: 'command', autoEnter: true, style: 'blue' }).addButton(hunting ? '取消寻怪' : '取消移动', hunting ? '/取消寻怪' : '/取消移动', { type: 'command', autoEnter: true, style: 'blue' }));
  return Format.create()
    .addMarkdown(Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText(`${hunting ? '正在寻怪' : `正在前往${travel.regionName}${travel.destinationName ? `·${travel.destinationName}` : ''}（${travel.x}, ${travel.y}）`}\n预计耗时${durationText(travel.seconds)}\n当前剩余${durationText(travel.remaining)}`))
    .addButtonGroup(buttons);
};
const miningPanel = (mining: NonNullable<Awaited<ReturnType<typeof resourceMiningStatus>>>) => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('行动').addNewline().addNewline().addText('正在开采').addNewline().addBlockquote(`【${mining.kind === '植被' ? '植被' : '锻材'}】${mining.name}`).addNewline().addText(`预计耗时${durationText(mining.seconds)}`).addNewline().addText(`当前剩余${durationText(mining.remaining)}`))
  .addButtonGroup(limitedViewButtons(Format.createButtonGroup().addRow().addButton('刷新开采', '/刷新开采', { type: 'command', autoEnter: true, style: 'blue' }).addButton('取消开采', '/取消开采', { type: 'command', autoEnter: true })));

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    if ((await homePanel(event.current.UserId)).inHome) { const { homeFormat } = await import('./home'); await message.send({ format: await homeFormat(event.current.UserId) }); return; }
    const travel = await travelStatus(event.current.UserId);
    if (travel && travel.remaining > 0) { await message.send({ format: travelPanel(travel) }); return; }
    if (travel) await completeTravel(event.current.UserId);
    const mining = await resourceMiningStatus(event.current.UserId);
    if (mining) { await message.send({ format: miningPanel(mining) }); return; }
    try {
      const battle = await battleStatus(event.current.UserId);
      await sendWithTextFallback(message, await battlePanel(battle), `【${battle.mode === 'spar' ? `切磋＜${battle.turn}＞回合` : '战斗面板'}】\n${battle.members.map(member => `【${member.name}】HP ${member.hp}/${member.hpMax}｜MP ${member.mp}/${member.mpMax}`).join('\n')}${battle.spirits.length ? `\n场上灵兽：${battle.spirits.map(spirit => `${spirit.name} HP ${spirit.hp}/${spirit.hpMax}（${spirit.remainingTurns}回合）`).join('、')}` : ''}\n${battle.targets.map(target => `敌方 #${target.id} ${target.name} HP ${target.hp}/${target.hpMax}`).join('\n')}\n/攻击｜/技能 1｜${battle.mode === 'spar' ? '认输（/逃跑）' : '/道具 1｜/逃跑'}`);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('当前不在战斗中')) throw error;
      const [nearby, autoBattle, blockedDirections, movement, trace] = await Promise.all([nearbyPoints(event.current.UserId), autoBattleConfig(event.current.UserId), blockedDungeonDirections(event.current.UserId), movementProfile(event.current.UserId), omniscientTraces(event.current.UserId)]);
      const visiblePoints = movement.showPlayers ? nearby.points : nearby.points.filter(point => point.type !== '玩家');
      const targets = visiblePoints.length ? `\n感知内目标：\n${visiblePoints.map(point => `${point.type} ${point.name} · ${directionText(point, Number(nearby.character.pos_x), Number(nearby.character.pos_y))}${point.distance}${point.type === '怪物' && point.code ? ` [交互：/怪物交互 ${point.code}] [攻击：/怪物攻击 ${point.code}]` : point.distance === 0 && point.interaction?.type === '建筑' ? ' [进入]' : point.type === '玩家' && point.distance === 0 ? ' [互动]' : point.type === '玩家' && point.distance > 0 ? ' [前往]' : point.type !== '玩家' && point.distance === 0 && point.interaction ? ' [互动]' : point.type !== '玩家' && point.distance > 0 && movement.maximum >= point.distance ? ' [前往]' : ''}`).join('\n')}` : '\n感知内目标：\n空空如也';
      const x = Number(nearby.character.pos_x); const y = Number(nearby.character.pos_y);
      const location = currentLocationText(nearby.character);
      const resting = nearby.character.activity_status !== 'active';
      const mapEntries = movement.showLandmarks ? nearby.landmarks : [];
      const mapText = nearby.mapUnlocked ? `\n\n地图标识：${mapEntries.length ? `\n${mapEntries.map(landmark => landmark.name).join('\n')}` : ''}` : '';
      await sendWithTextFallback(message, outsidePanel('操作面板', location, movement.step, nearby.range, x, y, nearby.description, nearby.points, resting, nearby.landmarks, trace ?? '', movement.maximum, nearby.perceptionObscured, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked, nearby.character.activity_status, true).addButtonGroup(panelButtons(resting, Boolean(autoBattle.settings.enabled), blockedDirections)), `【操作面板】\n${location}${trace ? `\n\n${trace}` : ''}\n\n${nearby.description}${mapText}\n\n移动速度：（${movement.step}/${movement.maximum}）\n感知范围：${nearby.range}${nearby.perceptionObscured ? '\n> 压抑的黑暗干扰了你的感知' : ''}${targets}\n\n/移动 上｜/移动 下｜/移动 左｜/移动 右｜/探索｜/背包`);
    }
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'open panel failed');
    await message.send({ format: messageFormat('面板不可用', error instanceof Error ? error.message : '请稍后重试。') });
  }
};

const showRestPanel = async (message: any, qqUserId: string, text: string) => {
  if ((await homePanel(qqUserId)).inHome) { const { homeFormat } = await import('./home'); await message.send({ format: await homeFormat(qqUserId, text) }); return; }
  const [nearby, movement, trace] = await Promise.all([nearbyPoints(qqUserId), movementProfile(qqUserId), omniscientTraces(qqUserId)]); const resting = nearby.character.activity_status !== 'active';
  const autoBattle = await autoBattleConfig(qqUserId);
  const blockedDirections = await blockedDungeonDirections(qqUserId);
  const panel = outsidePanel('操作面板', currentLocationText(nearby.character), movement.step, nearby.range, Number(nearby.character.pos_x), Number(nearby.character.pos_y), text, nearby.points, resting, nearby.landmarks, trace ?? '', movement.maximum, nearby.perceptionObscured, movement.showLandmarks, movement.showPlayers, nearby.mapUnlocked, nearby.character.activity_status, true).addButtonGroup(panelButtons(resting, Boolean(autoBattle.settings.enabled), blockedDirections));
  await sendWithTextFallback(message, panel, `【操作面板】\n${text}`);
};
export const restHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await startRest(event.current.UserId); await showRestPanel(message, event.current.UserId, result.message); } catch (error) { await message.send({ format: messageFormat('无法休息', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const resumeActionHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await resumeAction(event.current.UserId); await showRestPanel(message, event.current.UserId, result.message); } catch (error) { await message.send({ format: messageFormat('暂时无法行动', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const mapLandmarkVisibilityHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  const visible = String(route.param('state')) === '显示';
  try { await setMapLandmarksVisible(event.current.UserId, visible); await showRestPanel(message, event.current.UserId, visible ? '地图标识已显示。' : '地图标识已折叠。'); }
  catch (error) { await message.send({ format: messageFormat('地图标识设置失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const nearbyPlayersVisibilityHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  const visible = String(route.param('state')) === '显示玩家';
  try { await setNearbyPlayersVisible(event.current.UserId, visible); await showRestPanel(message, event.current.UserId, visible ? '感知内目标已显示玩家。' : '感知内目标已隐藏玩家。'); }
  catch (error) { await message.send({ format: messageFormat('感知目标设置失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
