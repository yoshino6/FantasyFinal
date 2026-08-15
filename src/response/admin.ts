import { Format, useEvent, useMention, useMessage, useRoute } from 'alemonjs';
import { grantAdministrator, loginAsOwner, permissionFor, permissionList, requireAdministrator, requireOwner, revokeAdministrator, type PermissionRole } from '../game/permission.service';
import { registeredMailRecipient, sendAdminItemMail, sendAdminItemMailToAll } from '../game/mail.service';
import { messageFormat } from '../game/message';

const commandLink = (markdown: ReturnType<typeof Format.createMarkdown>, title: string, command: string, format: string) => markdown.addText('> ').addButton(title, { data: command, autoEnter: false }).addNewline().addBlockquote(format).addNewline();

const adminFormat = (role: PermissionRole | null) => {
  const markdown = Format.createMarkdown().addTitle('管理员面板').addNewline().addNewline().addText('管理员登录').addNewline();
  commandLink(markdown, '[登录]', '管理员登录 ', '格式：管理员登录 密码');
  if (role === 'owner') {
    markdown.addNewline().addText('管理员分配').addNewline();
    commandLink(markdown, '[给予权限]', '给予权限 ', '格式：给予权限 @xxx');
    commandLink(markdown, '[撤销权限]', '撤销权限 ', '格式：撤销权限 @xxx');
    markdown.addText('> ').addButton('[查看权限]', { data: '查看权限', autoEnter: false }).addNewline().addBlockquote('可查看当前权限列表及对应用户信息。').addNewline();
  }
  if (role === 'owner' || role === 'admin') {
    markdown.addNewline().addText('邮件发放物品').addNewline();
    commandLink(markdown, '[个人发放]', '管理员命令 邮件发放 ', '格式：管理员命令 邮件发放 @xxx');
    commandLink(markdown, '[全服发放]', '管理员命令 邮件发放 全服', '格式：管理员命令 邮件发放 全服');
  }
  return Format.create().addMarkdown(markdown);
};

const mentionedUserId = async () => {
  const [mention] = useMention(); const mentioned = await mention.findOne();
  if (!mentioned.count || !mentioned.data) throw new Error('请在命令后 @ 一名玩家。');
  return String(mentioned.data.UserId);
};

export default async () => { const [event] = useEvent(); const [message] = useMessage(); try { await message.send({ format: adminFormat(await permissionFor(event.current.UserId)) }); } catch (error) { await message.send({ format: messageFormat('管理员面板不可用', error instanceof Error ? error.message : '请稍后重试。') }); } };

export const ownerLoginHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await loginAsOwner(event.current.UserId, String(route.param('password'))); await message.send({ format: messageFormat('管理员登录成功', '你已获得主人权限。') }); await message.send({ format: adminFormat('owner') }); } catch (error) { await message.send({ format: messageFormat('管理员登录失败', error instanceof Error ? error.message : '请稍后重试。') }); } };

export const grantAdministratorHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const target = await mentionedUserId(); await grantAdministrator(event.current.UserId, target); await message.send({ format: messageFormat('权限已给予', `已给予 QID：${target} 管理员权限。`) }); } catch (error) { await message.send({ format: messageFormat('权限操作失败', error instanceof Error ? error.message : '请稍后重试。') }); } };

export const revokeAdministratorHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const target = await mentionedUserId(); await revokeAdministrator(event.current.UserId, target); await message.send({ format: messageFormat('权限已撤销', `已撤销 QID：${target} 的管理员权限。`) }); } catch (error) { await message.send({ format: messageFormat('权限操作失败', error instanceof Error ? error.message : '请稍后重试。') }); } };

export const permissionListHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireOwner(event.current.UserId); const entries = await permissionList(); const markdown = Format.createMarkdown().addTitle('当前权限列表').addNewline().addNewline(); const sequence = '①②③④⑤⑥⑦⑧⑨⑩'; entries.forEach((entry, index) => markdown.addText(`${sequence[index] ?? `${index + 1}.`}QID：${entry.qqUserId}`).addNewline().addBlockquote(`权限：${entry.role === 'owner' ? '至高' : '管理'}`).addNewline().addBlockquote(`游戏id：${entry.characterId ?? '未注册'}`).addNewline().addBlockquote(entry.name).addNewline().addNewline()); await message.send({ format: Format.create().addMarkdown(markdown) }); } catch (error) { await message.send({ format: messageFormat('查看权限失败', error instanceof Error ? error.message : '请稍后重试。') }); } };

export const adminMailHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await sendAdminItemMail(event.current.UserId, String(route.param('target')), String(route.param('item')), Number(route.param('quantity')), String(route.param('title') ?? '')); await message.send({ format: messageFormat('邮件发放成功', `已向【${result.targetName}】发放邮件 #${result.mailId}\n附件：【${result.itemName}】×${result.quantity}`) }); } catch (error) { await message.send({ format: messageFormat('邮件发放失败', error instanceof Error ? error.message : '请稍后重试。') }); } };

export const adminMailTargetHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    await requireAdministrator(event.current.UserId);
    if (String(route.param('target') ?? '').trim() === '全服') {
      const markdown = Format.createMarkdown().addTitle('邮件发放物品').addNewline().addNewline().addBlockquote('已选择全服收件人。').addNewline().addNewline();
      commandLink(markdown, '[继续填写物品]', '管理全服邮件发放 ', '格式：管理全服邮件发放 物品代码 数量 [标题]');
      await message.send({ format: Format.create().addMarkdown(markdown) }); return;
    }
    const target = await mentionedUserId(); const recipient = await registeredMailRecipient(target);
    const markdown = Format.createMarkdown().addTitle('邮件发放物品').addNewline().addNewline().addBlockquote(`已选择收件人：${recipient.name}。`).addNewline().addNewline();
    commandLink(markdown, '[继续填写物品]', `管理邮件发放 ${target} `, '格式：管理邮件发放 玩家QQ 物品代码 数量 [标题]');
    await message.send({ format: Format.create().addMarkdown(markdown) });
  } catch (error) { await message.send({ format: messageFormat('邮件发放失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const adminAllMailHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await sendAdminItemMailToAll(event.current.UserId, String(route.param('item')), Number(route.param('quantity')), String(route.param('title') ?? '')); await message.send({ format: messageFormat('全服邮件发放成功', `已向 ${result.targetCount} 名玩家发放邮件\n附件：【${result.itemName}】×${result.quantity}`) }); } catch (error) { await message.send({ format: messageFormat('邮件发放失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
