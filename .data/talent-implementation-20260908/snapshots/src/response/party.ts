import { Format, logger, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { createParty, joinParty } from '../game/adventure.service';
import { messageFormat } from '../game/message';

export const create = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
  const id = await createParty(event.current.UserId);
  const markdown = Format.createMarkdown().addTitle('队伍创建').addNewline().addNewline().addText(`队伍已建立（最多 4 人）。\n队伍编号：${id.slice(0, 8)}`);
  const buttons = Format.createButtonGroup().addRow().addButton('加入队伍', `/组队 加入 ${id}`, { type: 'command', autoEnter: true, style: 'blue' });
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
} catch (error) { logger.warn({ err: error }, 'create party failed'); await message.send({ format: messageFormat('无法创建队伍', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const join = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const count = await joinParty(event.current.UserId, String(route.param('leader'))); await message.send({ format: messageFormat('加入队伍', `已加入队伍，当前 ${count}/4 人。你的位置已同步至队长，只有队长可移动。`) }); } catch (error) { await message.send({ format: messageFormat('无法加入队伍', error instanceof Error ? error.message : '请稍后重试。') }); } };
