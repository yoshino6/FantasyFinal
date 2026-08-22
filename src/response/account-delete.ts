import { Format, useEvent, useMessage } from 'alemonjs';
import { deletePlayerAccount } from '../game/account.service';
import { messageFormat } from '../game/message';

export default async () => {
  const [message] = useMessage();
  const markdown = Format.createMarkdown().addTitle('注销账户').addNewline().addNewline()
    .addText('注销会永久删除当前账号的角色、背包、装备、任务、邮件、图鉴、战斗与副职业等全部游戏数据。').addNewline().addNewline()
    .addBlockquote('此操作无法恢复。确认后仍可发送“注册”重新开始。');
  const buttons = Format.createButtonGroup().addRow()
    .addButton('取消', '/菜单', { type: 'command', autoEnter: true })
    .addButton('确认注销', '/确认注销账户', { type: 'command', autoEnter: true, style: 'blue' });
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
};

export const confirmAccountDeleteHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const result = await deletePlayerAccount(event.current.UserId);
    const extra = [
      result.endedCombats ? `已结束 ${result.endedCombats} 场关联战斗。` : '',
      result.transferredParties ? `已将 ${result.transferredParties} 支队伍移交给其他队员。` : '',
      result.disbandedParties ? `已解散 ${result.disbandedParties} 支无其他成员的队伍。` : ''
    ].filter(Boolean).join('\n');
    await message.send({ format: messageFormat('账户已注销', `${result.characterName ? `【${result.characterName}】的` : ''}全部游戏数据已删除。\n现在可发送“注册”重新创建角色。${extra ? `\n\n${extra}` : ''}`) });
  } catch (error) {
    await message.send({ format: messageFormat('注销失败', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
