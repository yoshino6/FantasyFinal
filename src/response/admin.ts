import { Format, useEvent, useMention, useMessage, useRoute } from 'alemonjs';
import { addMailAttachment, addMailRecipientByName, addMailRecipientByQq, discardMailEdit, getMailEdit, openMailEdit, previewMailEdit, removeMailAttachment, removeMailRecipient, sendMailEdit, stashMailEdit, switchMailEditToGlobal, updateMailAttachmentQuantity, updateMailContent, updateMailTitle, type MailEdit } from '../game/admin-mail-edit.service';
import { grantAdministrator, loginAsOwner, permissionFor, permissionList, requireAdministrator, requireOwner, revokeAdministrator, type PermissionRole } from '../game/permission.service';
import { messageFormat } from '../game/message';
import { adminDefeatBoss, adminSpawnBoss, bossEvents } from '../game/adventure.service';
import { postBossBounty } from '../game/bounty.service';
import { auditAllPlayers, auditCharacter, auditInventory, auditPlayerState, auditSkills } from '../game/admin-audit.service';
import { dungeonEvents } from '../game/dungeon.service';

const commandLink = (markdown: ReturnType<typeof Format.createMarkdown>, title: string, command: string, format: string) => markdown.addText('> ').addButton(title, { data: command, autoEnter: false }).addNewline().addBlockquote(format).addNewline();
const textButton = (_title: string, command: string) => ({ data: command, autoEnter: false });

const adminFormat = (role: PermissionRole | null) => {
  const markdown = Format.createMarkdown().addTitle('管理员面板').addNewline().addNewline().addText('管理员登录').addNewline();
  commandLink(markdown, '[登录]', '管理员登录 ', '格式：管理员登录 密码');
  if (role === 'owner') {
    markdown.addNewline().addText('管理员分配').addNewline();
    commandLink(markdown, '[给予权限]', '给予权限 ', '格式：给予权限 @xxx');
    commandLink(markdown, '[撤销权限]', '撤销权限 ', '格式：撤销权限 @xxx');
    markdown.addText('> ').addButton('[查看权限]', textButton('查看权限', '查看权限')).addNewline().addBlockquote('可查看当前权限列表及对应用户信息。').addNewline();
  }
  if (role === 'owner' || role === 'admin') {
    markdown.addNewline().addText('邮件发放物品').addNewline();
    commandLink(markdown, '[个人发放]', '管理员命令 邮件发放 个人', '格式：管理员命令 邮件发放 个人');
    commandLink(markdown, '[全服发放]', '管理员命令 邮件发放 全服', '格式：管理员命令 邮件发放 全服');
    markdown.addNewline().addText('玩家管理').addNewline().addText('> ').addButton('[数据核查]', textButton('玩家数据核查', '玩家数据核查')).addNewline().addBlockquote('核查并修复玩家的角色、背包、技能与状态数据。');
    markdown.addNewline().addText('事件管理').addNewline().addNewline();
    markdown.addText('> ').addButton('[BOSS管理]', textButton('BOSS管理', 'BOSS管理')).addNewline().addBlockquote('查看地图中 BOSS 事件并操作。').addNewline();
    markdown.addText('> ').addButton('[迷宫管理]', textButton('迷宫管理', '迷宫管理')).addNewline().addBlockquote('查看当前地下迷宫入口、探索状态与最终 Boss。');
  }
  return Format.create().addMarkdown(markdown);
};

const bossManagementFormat = async () => {
  const events = await bossEvents(); const markdown = Format.createMarkdown();
  const groups = new Map<string, typeof events>();
  for (const event of events) {
    const group = groups.get(event.regionCode) ?? [];
    group.push(event); groups.set(event.regionCode, group);
  }
  for (const group of groups.values()) {
    markdown.addTitle(`【${group[0].regionName}】`).addNewline().addNewline();
    for (const [index, event] of group.entries()) {
      markdown.addText(`${'①②③④⑤⑥⑦⑧⑨⑩'[index] ?? `${index + 1}.`}${event.bossName}`).addButton('[刷新]', textButton('刷新Boss', `BOSS刷新 ${event.bossCode}`)).addButton('[消灭]', textButton('消灭Boss', `BOSS消灭 ${event.bossCode}`)).addButton('[上赏]', textButton('Boss上赏', `BOSS上赏 ${event.bossCode}`)).addNewline();
      if (event.x === null) markdown.addBlockquote('未刷新').addNewline().addNewline();
      else markdown.addText('> 当前坐标：').addButton(`(${event.x}, ${event.y}, ${event.z})`, textButton('前往Boss坐标', `前往 ${event.x} ${event.y}`)).addNewline().addBlockquote(`当前词条：${event.traits.join('、') || '无'}`).addNewline().addNewline();
    }
  }
  return Format.create().addMarkdown(markdown);
};

const dungeonManagementFormat = async () => {
  const events = await dungeonEvents(); const markdown = Format.createMarkdown().addTitle('迷宫管理').addNewline().addNewline();
  if (!events.length) markdown.addBlockquote('当前没有正在维持的地下迷宫事件。');
  const sequence = '①②③④⑤⑥⑦⑧⑨⑩';
  for (const [index, event] of events.entries()) {
    const state = event.state === 'active' ? '探索中' : '已攻略，等待重构';
    markdown.addText(`${sequence[index] ?? `${index + 1}.`}地下迷宫 #${event.id}`).addNewline();
    markdown.addBlockquote(`状态：${state}｜探索者：${event.explorers} 人`).addNewline();
    markdown.addText('> 入口：').addButton(`幽暗密林（${event.x}, ${event.y}）`, textButton('前往迷宫入口', `前往 ${event.x} ${event.y}`)).addNewline();
    markdown.addBlockquote(`最终 Boss：${event.bossName}${event.bossDefeated ? '（已击败）' : event.bossHp === null ? '（未生成）' : `｜当前生命 ${event.bossHp}`}`).addNewline();
    if (event.refreshAt) markdown.addBlockquote(`重构时间：${event.refreshAt.toLocaleString('zh-CN', { hour12: false })}`).addNewline();
    markdown.addNewline();
  }
  return Format.create().addMarkdown(markdown);
};

const playerAuditFormat = () => {
  const markdown = Format.createMarkdown().addTitle('玩家数据核查').addNewline().addNewline();
  markdown.addButton('[角色信息核查]', textButton('角色信息核查', '玩家核查 角色 ')).addNewline();
  markdown.addButton('[背包信息核查]', textButton('背包信息核查', '玩家核查 背包 ')).addNewline();
  markdown.addButton('[技能信息核查]', textButton('技能信息核查', '玩家核查 技能 ')).addNewline();
  markdown.addButton('[玩家状态核查]', textButton('玩家状态核查', '玩家核查 状态 ')).addNewline();
  markdown.addButton('[全部玩家核查]', textButton('全部玩家核查', '全服玩家核查')).addNewline().addNewline();
  markdown.addBlockquote('点击对应项目后 @ 需要核查的玩家并发送。');
  markdown.addNewline().addBlockquote('全部玩家核查会依次核查所有已注册角色的角色、背包、技能与状态数据。');
  return Format.create().addMarkdown(markdown);
};

const recipientLines = (markdown: ReturnType<typeof Format.createMarkdown>, edit: MailEdit) => {
  if (edit.scope === 'global') { markdown.addText('接收人：全服').addNewline(); return; }
  markdown.addText('接收人：').addButton('[@添加]', textButton('添加收件人', '管理员邮件 添加收件人 ')).addText(' ').addButton('[昵称添加]', textButton('添加昵称', '管理员邮件 添加昵称 ')).addNewline();
  const sequence = '①②③④⑤⑥⑦⑧⑨⑩';
  if (!edit.recipients.length) markdown.addBlockquote('暂未添加接收人。').addNewline();
  edit.recipients.forEach((recipient, index) => markdown.addText('> ').addText(`${sequence[index] ?? `${index + 1}.`}${recipient.nickname} `).addButton('[删除]', textButton('删除收件人', `管理员邮件 删除收件人 ${recipient.qqUserId}`)).addNewline());
};

export const mailEditFormat = (edit: MailEdit) => {
  const markdown = Format.createMarkdown().addTitle(edit.scope === 'personal' ? '个人发放' : '全服发放').addNewline().addNewline();
  recipientLines(markdown, edit);
  markdown.addNewline().addText('标题：').addButton('[编辑]', textButton('编辑标题', '管理员邮件 编辑标题 ')).addText(' ').addButton('[清空]', textButton('清空标题', '管理员邮件 清空标题'));
  if (edit.scope === 'personal') markdown.addText(' ').addButton('[切换]', textButton('切换为全服发放', '管理员邮件 切换全服'));
  markdown.addNewline().addBlockquote(edit.title || '无').addNewline().addNewline()
    .addText('内容：').addButton('[编辑]', textButton('编辑内容', '管理员邮件 编辑内容 ')).addText(' ').addButton('[清空]', textButton('清空内容', '管理员邮件 清空内容')).addNewline().addBlockquote(edit.content || '无').addNewline().addNewline()
    .addText('附件：').addButton('[id添加]', textButton('添加附件ID', '管理员邮件 添加附件ID ')).addText(' ').addButton('[名称添加]', textButton('添加附件名称', '管理员邮件 添加附件名称 ')).addNewline();
  const sequence = '①②③④⑤⑥⑦⑧⑨⑩';
  if (!edit.attachments.length) markdown.addBlockquote('暂未添加附件。').addNewline();
  edit.attachments.forEach((attachment, index) => markdown.addText('> ').addText(`${sequence[index] ?? `${index + 1}.`}【${attachment.name}】× ${attachment.quantity} `).addButton('[修改数量]', textButton('修改附件数量', `管理员邮件 修改附件数量 ${attachment.itemId} `)).addText(' ').addButton('[删除]', textButton('删除附件', `管理员邮件 删除附件 ${attachment.itemId}`)).addNewline());
  const buttons = Format.createButtonGroup().addRow()
    .addButton('暂存编辑', '/管理员邮件 暂存编辑', { type: 'command', autoEnter: true })
    .addButton('退出编辑', '/管理员邮件 退出编辑', { type: 'command', autoEnter: true })
    .addButton('发送', '/管理员邮件 发送', { type: 'command', autoEnter: true, style: 'blue' });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

const previewFormat = (edit: MailEdit) => {
  const markdown = Format.createMarkdown().addTitle('邮件全部信息').addNewline().addNewline();
  if (edit.scope === 'global') markdown.addText('接收人：全服').addNewline();
  else markdown.addText(`接收人：${edit.recipients.map(recipient => recipient.nickname).join('、')}`).addNewline();
  markdown.addText(`标题：${edit.title || '无'}`).addNewline();
  markdown.addText('内容：').addNewline().addBlockquote(edit.content || '无').addNewline().addText('附件：').addNewline();
  if (!edit.attachments.length) markdown.addBlockquote('无').addNewline();
  else edit.attachments.forEach(attachment => markdown.addBlockquote(`【${attachment.name}】× ${attachment.quantity}`).addNewline());
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('返回编辑', '/管理员邮件 继续编辑', { type: 'command', autoEnter: true })
    .addButton('确认发放', '/管理员邮件 确认发放', { type: 'command', autoEnter: true, style: 'blue' }));
};

const mentionedUserId = async () => { const [mention] = useMention(); const mentioned = await mention.findOne(); if (!mentioned.count || !mentioned.data) throw new Error('请在命令后 @ 一名玩家。'); return String(mentioned.data.UserId); };
const showEdit = async (message: any, qqUserId: string, edit?: MailEdit) => message.send({ format: mailEditFormat(edit ?? await getMailEdit(qqUserId)) });

export default async () => { const [event] = useEvent(); const [message] = useMessage(); try { await message.send({ format: adminFormat(await permissionFor(event.current.UserId)) }); } catch (error) { await message.send({ format: messageFormat('管理员面板不可用', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const ownerLoginHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await loginAsOwner(event.current.UserId, String(route.param('password'))); await message.send({ format: messageFormat('管理员登录成功', '你已获得主人权限。') }); await message.send({ format: adminFormat('owner') }); } catch (error) { await message.send({ format: messageFormat('管理员登录失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const grantAdministratorHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const target = await mentionedUserId(); await grantAdministrator(event.current.UserId, target); await message.send({ format: messageFormat('权限已给予', `已给予 QID：${target} 管理员权限。`) }); } catch (error) { await message.send({ format: messageFormat('权限操作失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const revokeAdministratorHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const fromCommand = String(route.param('qq') ?? '').trim(); const target = fromCommand || await mentionedUserId(); await revokeAdministrator(event.current.UserId, target); await message.send({ format: messageFormat('权限已撤销', `已撤销 QID：${target} 的管理员权限。`) }); } catch (error) { await message.send({ format: messageFormat('权限操作失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const permissionListHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireOwner(event.current.UserId); const entries = await permissionList(); const markdown = Format.createMarkdown().addTitle('当前权限列表').addNewline().addNewline(); const sequence = '①②③④⑤⑥⑦⑧⑨⑩'; entries.forEach((entry, index) => { markdown.addText(`${sequence[index] ?? `${index + 1}.`}QID：${entry.qqUserId}`); if (entry.role === 'admin') markdown.addText(' ').addButton('[撤销权限]', textButton('撤销权限', `撤销权限 ${entry.qqUserId}`)); markdown.addNewline().addBlockquote(`权限：${entry.role === 'owner' ? '至高' : '管理'}`).addNewline().addBlockquote(`游戏id：${entry.characterId ?? '未注册'}`).addNewline().addBlockquote(entry.name).addNewline().addNewline(); }); await message.send({ format: Format.create().addMarkdown(markdown) }); } catch (error) { await message.send({ format: messageFormat('查看权限失败', error instanceof Error ? error.message : '请稍后重试。') }); } };

export const playerAuditPanelHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireAdministrator(event.current.UserId); await message.send({ format: playerAuditFormat() }); } catch (error) { await message.send({ format: messageFormat('数据核查失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const playerAuditHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireAdministrator(event.current.UserId); const target = await mentionedUserId(); const type = String(route.param('type')); const result = type === '角色' ? await auditCharacter(target) : type === '背包' ? await auditInventory(target) : type === '状态' ? await auditPlayerState(target) : await auditSkills(target); await message.send({ format: messageFormat('玩家数据核查', `目标：${result.name}\n${result.fixed}`) }); } catch (error) { await message.send({ format: messageFormat('数据核查失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const allPlayersAuditHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireAdministrator(event.current.UserId);
    await message.send({ format: messageFormat('全服玩家数据核查', '正在依次核查所有已注册玩家，请稍候……') });
    const result = await auditAllPlayers();
    const failed = result.failed.length
      ? `\n未完成：${result.failed.length} 名\n${result.failed.slice(0, 5).map(item => `【${item.name}】${item.message}`).join('\n')}${result.failed.length > 5 ? '\n其余异常请查看运行日志。' : ''}`
      : '\n未发现无法核查的角色。';
    const details = result.results.length
      ? `\n\n核查详情：\n${result.results.slice(0, 10).map((item, index) => `${'①②③④⑤⑥⑦⑧⑨⑩'.charAt(index)}【${item.name}】\n${item.fixes.map(fix => `·${fix}`).join('\n')}`).join('\n')}${result.results.length > 10 ? `\n……其余 ${result.results.length - 10} 名玩家已完成核查。` : ''}`
      : '';
    await message.send({ format: messageFormat('全服核查结果', `已核查：${result.completed}/${result.total} 名玩家\n发现并修正异常：${result.results.length} 名\n核查项目：角色信息、背包信息、技能信息、玩家状态${failed}${details}`) });
  } catch (error) { await message.send({ format: messageFormat('全服数据核查失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const bossManagementHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireAdministrator(event.current.UserId); await message.send({ format: await bossManagementFormat() }); } catch (error) { await message.send({ format: messageFormat('BOSS管理失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const dungeonManagementHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireAdministrator(event.current.UserId); await message.send({ format: await dungeonManagementFormat() }); } catch (error) { await message.send({ format: messageFormat('迷宫管理失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const bossSpawnHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireAdministrator(event.current.UserId); const result = await adminSpawnBoss(String(route.param('code'))); await message.send({ format: messageFormat('BOSS已刷新', result?.x === null ? '未能找到可用刷新坐标。' : `${result?.bossName ?? 'BOSS'} 已刷新至 (${result?.x}, ${result?.y}, ${result?.z})。`) }); await message.send({ format: await bossManagementFormat() }); } catch (error) { await message.send({ format: messageFormat('BOSS刷新失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const bossDefeatHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireAdministrator(event.current.UserId); const defeated = await adminDefeatBoss(String(route.param('code'))); await message.send({ format: messageFormat(defeated ? 'BOSS已消灭' : 'BOSS未刷新', defeated ? '当前地图中的该 Boss 已被移除。' : '当前没有可消灭的该 Boss。') }); await message.send({ format: await bossManagementFormat() }); } catch (error) { await message.send({ format: messageFormat('BOSS消灭失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const bossBountyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireAdministrator(event.current.UserId); const result = await postBossBounty(String(route.param('code'))); await message.send({ format: messageFormat('已上悬赏板', `「${result?.title ?? 'BOSS悬赏'}」已立即同步至冒险者公会悬赏板。`) }); await message.send({ format: await bossManagementFormat() }); } catch (error) { await message.send({ format: messageFormat('上赏失败', error instanceof Error ? error.message : '请稍后重试。') }); } };

export const adminMailTargetHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const scope = String(route.param('scope')) === '全服' ? 'global' : 'personal'; await showEdit(message, event.current.UserId, await openMailEdit(event.current.UserId, scope)); } catch (error) { await message.send({ format: messageFormat('邮件编辑失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const switchMailScopeHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await showEdit(message, event.current.UserId, await switchMailEditToGlobal(event.current.UserId)); } catch (error) { await message.send({ format: messageFormat('切换发放范围失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const addRecipientHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await showEdit(message, event.current.UserId, await addMailRecipientByQq(event.current.UserId, await mentionedUserId())); } catch (error) { await message.send({ format: messageFormat('添加接收人失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const addRecipientNameHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await showEdit(message, event.current.UserId, await addMailRecipientByName(event.current.UserId, String(route.param('name')))); } catch (error) { await message.send({ format: messageFormat('添加接收人失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const removeRecipientHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await showEdit(message, event.current.UserId, await removeMailRecipient(event.current.UserId, String(route.param('qq')))); } catch (error) { await message.send({ format: messageFormat('删除接收人失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const updateContentHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await showEdit(message, event.current.UserId, await updateMailContent(event.current.UserId, String(route.param('content')))); } catch (error) { await message.send({ format: messageFormat('编辑内容失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const clearContentHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await showEdit(message, event.current.UserId, await updateMailContent(event.current.UserId, '')); } catch (error) { await message.send({ format: messageFormat('清空内容失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const updateTitleHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await showEdit(message, event.current.UserId, await updateMailTitle(event.current.UserId, String(route.param('title')))); } catch (error) { await message.send({ format: messageFormat('编辑标题失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const clearTitleHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await showEdit(message, event.current.UserId, await updateMailTitle(event.current.UserId, '')); } catch (error) { await message.send({ format: messageFormat('清空标题失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const addAttachmentHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await showEdit(message, event.current.UserId, await addMailAttachment(event.current.UserId, String(route.param('item')), Number(route.param('quantity') ?? 1))); } catch (error) { await message.send({ format: messageFormat('添加附件失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const updateAttachmentQuantityHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await showEdit(message, event.current.UserId, await updateMailAttachmentQuantity(event.current.UserId, Number(route.param('id')), Number(route.param('quantity')))); } catch (error) { await message.send({ format: messageFormat('修改数量失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const removeAttachmentHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await showEdit(message, event.current.UserId, await removeMailAttachment(event.current.UserId, Number(route.param('id')))); } catch (error) { await message.send({ format: messageFormat('删除附件失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const continueEditHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await showEdit(message, event.current.UserId, await openMailEdit(event.current.UserId, 'personal')); } catch (error) { await message.send({ format: messageFormat('继续编辑失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const stashEditHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await stashMailEdit(event.current.UserId); await message.send({ format: messageFormat('邮件编辑已暂存', '编辑内容已保留，下次选择邮件发放时可继续编辑。') }); } catch (error) { await message.send({ format: messageFormat('暂存失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const discardEditHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await discardMailEdit(event.current.UserId); await message.send({ format: messageFormat('邮件编辑已退出', '本次编辑的接收人、内容与附件均已删除。') }); } catch (error) { await message.send({ format: messageFormat('退出失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const previewEditHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await message.send({ format: previewFormat(await previewMailEdit(event.current.UserId)) }); } catch (error) { await message.send({ format: messageFormat('无法发送', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const confirmEditHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await sendMailEdit(event.current.UserId); const attachments = result.attachments.length ? result.attachments.map(attachment => `【${attachment.name}】× ${attachment.quantity}`).join('、') : '无'; await message.send({ format: messageFormat('邮件发放成功', `已向 ${result.recipientCount} 名玩家发放邮件\n附件：${attachments}`) }); } catch (error) { await message.send({ format: messageFormat('邮件发放失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
