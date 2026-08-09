import { Format, logger, useEvent, useMessage } from 'alemonjs';
import { battleStatus, inventory, nearbyPoints, type NearbyPoint } from '../game/adventure.service';
import { messageFormat, sendWithTextFallback } from '../game/message';

const directionText = (point: NearbyPoint, x: number, y: number) => {
  const vertical = point.y > y ? '上方' : point.y < y ? '下方' : '';
  const horizontal = point.x > x ? '右侧' : point.x < x ? '左侧' : '';
  return vertical && horizontal ? `${vertical}${horizontal}` : vertical || horizontal || '脚下';
};

const groundTitle = (registered: number, regionName: string, x: number, y: number, z: number) => Number(registered)
  ? `你移动至${regionName} (${x}, ${y}, ${z})`
  : '你移动至未知之地';

const outsidePanel = (registered: number, regionName: string, speed: number, range: number, x: number, y: number, z: number, description: string, points: NearbyPoint[]) => {
  const markdown = Format.createMarkdown().addTitle(groundTitle(registered, regionName, x, y, z))
    .addText(`${description}\n\n当前速度：${speed}（决定一次能移动几格）\n感知范围：${range}（决定能显示的怪物、NPC 等）\n\n范围内列表：\n`);
  if (!points.length) markdown.addText('感知范围内没有发现怪物、NPC 或特殊地点。');
  else {
    for (const point of points) {
      if (speed > point.distance) markdown.addButton(`【${point.type}】${point.name}`, { data: `/前往 ${point.x} ${point.y}`, autoEnter: false });
      else markdown.addText(`【${point.type}】${point.name}`);
      markdown.addText(` · ${directionText(point, x, y)} ${point.distance} 格\n`);
    }
  }
  return Format.create().addMarkdown(markdown)
  .addButtonGroup(Format.createButtonGroup()
    .addRow().addButton('装备', '/装备', { type: 'command', autoEnter: true }).addButton('上', '/移动 上', { type: 'command', autoEnter: true, style: 'blue' }).addButton('背包', '/背包', { type: 'command', autoEnter: true })
    .addRow().addButton('左', '/移动 左', { type: 'command', autoEnter: true, style: 'blue' }).addButton('角色', '/角色', { type: 'command', autoEnter: true }).addButton('右', '/移动 右', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('技能', '/技能列表', { type: 'command', autoEnter: true }).addButton('下', '/移动 下', { type: 'command', autoEnter: true, style: 'blue' }).addButton('队伍', '/队伍', { type: 'command', autoEnter: true })
    .addRow().addButton('菜单', '/菜单', { type: 'command', autoEnter: true, style: 'blue' }));
};

const battlePanel = (battle: Awaited<ReturnType<typeof battleStatus>>) => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('战斗面板').addText(`第 ${battle.turn} 回合\n你：HP ${battle.playerHp}/${battle.playerHpMax}｜MP ${battle.playerMp}/${battle.playerMpMax}\n锁定目标：#${battle.targetId} ${battle.targetName}｜HP ${battle.targetHp}/${battle.targetHpMax}`))
  .addButtonGroup(Format.createButtonGroup()
    .addRow().addButton('战斗信息', '/战斗信息', { type: 'command', autoEnter: true }).addButton(`锁定目标 #${battle.targetId}`, '/战斗信息', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('普攻', '/攻击', { type: 'command', autoEnter: true, style: 'blue' }).addButton('技能①', '/技能 1', { type: 'command', autoEnter: true, style: 'blue' }).addButton('技能②', '/技能 2', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('道具①', '/道具 1', { type: 'command', autoEnter: true }).addButton('逃跑', '/逃跑', { type: 'command', autoEnter: true }));

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    try {
      const battle = await battleStatus(event.current.UserId);
      await sendWithTextFallback(message, battlePanel(battle), `【战斗面板】\n你 HP ${battle.playerHp}/${battle.playerHpMax}｜MP ${battle.playerMp}/${battle.playerMpMax}\n目标 #${battle.targetId} ${battle.targetName} HP ${battle.targetHp}/${battle.targetHpMax}\n/攻击｜/技能 1｜/道具 1｜/逃跑`);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('当前不在战斗中')) throw error;
      const [bag, nearby] = await Promise.all([inventory(event.current.UserId), nearbyPoints(event.current.UserId)]);
      const targets = nearby.points.length ? `\n\n范围内列表\n${nearby.points.map(point => `【${point.type}】${point.name} · ${directionText(point, Number(nearby.character.pos_x), Number(nearby.character.pos_y))} ${point.distance} 格${bag.speed > point.distance ? `：/前往 ${point.x} ${point.y}` : ''}`).join('\n')}` : '\n\n范围内列表：没有发现目标。';
      const registered = Number(nearby.character.adventurer_registered);
      const x = Number(nearby.character.pos_x); const y = Number(nearby.character.pos_y); const z = Number(nearby.character.pos_z);
      const title = groundTitle(registered, nearby.character.region_name, x, y, z);
      await sendWithTextFallback(message, outsidePanel(registered, nearby.character.region_name, bag.speed, nearby.range, x, y, z, nearby.description, nearby.points), `【${title}】\n${nearby.description}\n\n当前速度：${bag.speed}（决定一次能移动几格）\n感知范围：${nearby.range}（决定能显示的怪物、NPC 等）${targets}\n\n/移动 上｜/移动 下｜/移动 左｜/移动 右｜/探索｜/背包`);
    }
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'open panel failed');
    await message.send({ format: messageFormat('面板不可用', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
