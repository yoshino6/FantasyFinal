import { useEvent, useMessage, useRoute } from 'alemonjs';
import { activeMailEdit } from '../game/admin-mail-edit.service';
import { mailEditLockedFormat } from '../response/admin';

const editableCommands = new Set([
  '管理员命令 邮件发放', '管理员邮件 添加收件人', '管理员邮件 添加昵称', '管理员邮件 删除收件人',
  '管理员邮件 编辑内容', '管理员邮件 添加附件ID', '管理员邮件 添加附件名称', '管理员邮件 删除附件',
  '管理员邮件 继续编辑', '管理员邮件 暂存编辑', '管理员邮件 退出编辑', '管理员邮件 发送', '管理员邮件 确认发放'
]);

export default async () => {
  const [event, next] = useEvent(); const [route] = useRoute();
  if (!route.matched || editableCommands.has(route.key)) { await next(); return; }
  let editing = false;
  try { editing = await activeMailEdit(event.current.UserId); } catch { await next(); return; }
  if (!editing) { await next(); return; }
  const [message] = useMessage();
  await message.send({ format: mailEditLockedFormat() });
};
