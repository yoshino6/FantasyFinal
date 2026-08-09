import { Format, logger, useEvent, useMessage } from 'alemonjs';
import { battleStatus, inventory } from '../game/adventure.service';
import { messageFormat, sendWithTextFallback } from '../game/message';

const outsidePanel = (speed: number, weight: number) => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('冒险面板').addText(`当前速度 ${speed}｜负重 ${weight.toFixed(2)}kg\n\n使用方向按钮移动；进入格子会立刻触发遭遇或奇遇。`))
  .addButtonGroup(Format.createButtonGroup()
    .addRow().addButton('上', '/移动 上', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('左', '/移动 左', { type: 'command', autoEnter: true }).addButton('右', '/移动 右', { type: 'command', autoEnter: true })
    .addRow().addButton('下', '/移动 下', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('背包', '/背包', { type: 'command', autoEnter: true }).addButton('角色', '/角色', { type: 'command', autoEnter: true }));

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
      const bag = await inventory(event.current.UserId);
      await sendWithTextFallback(message, outsidePanel(bag.speed, bag.weight), `【冒险面板】\n当前速度 ${bag.speed}｜负重 ${bag.weight.toFixed(2)}kg\n/移动 上｜/移动 下｜/移动 左｜/移动 右｜/探索｜/背包`);
    }
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'open panel failed');
    await message.send({ format: messageFormat('面板不可用', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
