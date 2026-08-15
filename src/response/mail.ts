import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { claimMail, deleteMail, mailDetail, playerMails } from '../game/mail.service';
import { messageFormat } from '../game/message';

const oneLine = (text: string, length = 42) => {
  const compact = text.replace(/\s+/g, ' ').trim();
  return [...compact].length > length ? `${[...compact].slice(0, length).join('')}…` : compact || '无';
};
const formatDate = (value: Date) => {
  const date = new Date(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const pager = (page: number, total: number, keyword = '', decorative = false) => Format.createButtonGroup().addRow()
  .addButton('上一页', `/邮件页 ${Math.max(1, page - 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: !decorative && page > 1 ? 'blue' : undefined })
  .addButton('搜索', '/邮件搜索 ', { type: 'command', autoEnter: false, style: decorative ? undefined : 'blue' })
  .addButton('下一页', `/邮件页 ${Math.min(total, page + 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: !decorative && page < total ? 'blue' : undefined });

const mailListFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const data = await playerMails(qqUserId, page, keyword); const markdown = Format.createMarkdown().addTitle('我的邮件').addNewline().addNewline();
  if (!data.mails.length && !keyword) {
    markdown.addText('空空如也').addNewline().addNewline().addText(`当前第(${data.page}/${data.totalPages})页`);
    return Format.create().addMarkdown(markdown).addButtonGroup(pager(data.page, data.totalPages, data.keyword, true));
  }
  if (!data.mails.length) markdown.addText('没有找到符合条件的邮件。');
  const sequence = '①②③④⑤';
  data.mails.forEach((mail, index) => {
    markdown.addText(`${sequence[index]}${mail.title}\n`).addButton('[查看]', { data: `/查看邮件 ${mail.id}`, autoEnter: false }).addText(' ')
      .addButton(mail.claimed || !mail.attachmentCount ? '[已领取]' : '[领取]', { data: `/领取邮件 ${mail.id}`, autoEnter: false }).addText(' ')
      .addButton('[删除]', { data: `/删除邮件 ${mail.id}`, autoEnter: false }).addNewline()
      .addBlockquote(`接收时间：${formatDate(mail.receivedAt)}`).addNewline()
      .addBlockquote(`内容：${oneLine(mail.content)}`).addNewline()
      .addBlockquote(`附件：${oneLine(mail.attachments)}`).addNewline().addNewline();
  });
  markdown.addText(`当前第(${data.page}/${data.totalPages})页`);
  return Format.create().addMarkdown(markdown).addButtonGroup(pager(data.page, data.totalPages, data.keyword));
};

const mailDetailFormat = async (qqUserId: string, mailId: number) => {
  const mail = await mailDetail(qqUserId, mailId);
  const markdown = Format.createMarkdown().addTitle('邮件详情').addNewline().addNewline().addText(mail.title).addNewline()
    .addBlockquote(`接收时间：${formatDate(mail.receivedAt)}`).addNewline().addBlockquote(`内容：${mail.content || '无'}`).addNewline().addBlockquote(`附件：${mail.attachments}`);
  const buttons = Format.createButtonGroup().addRow().addButton(mail.claimed || !mail.attachmentCount ? '已领取' : '领取', `/领取邮件 ${mail.id}`, { type: 'command', autoEnter: true, style: mail.claimed || !mail.attachmentCount ? undefined : 'blue' })
    .addButton('删除', `/删除邮件 ${mail.id}`, { type: 'command', autoEnter: true }).addButton('返回邮箱', '/邮件', { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export default async () => { const [event] = useEvent(); const [message] = useMessage(); try { await message.send({ format: await mailListFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('邮箱不可用', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const mailPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await message.send({ format: await mailListFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('邮箱不可用', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const mailSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await message.send({ format: await mailListFormat(event.current.UserId, 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const mailDetailHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await message.send({ format: await mailDetailFormat(event.current.UserId, Number(route.param('id'))) }); } catch (error) { await message.send({ format: messageFormat('查看失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const mailClaimHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await claimMail(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('附件已领取', result.items.map(item => `获得【${item.name}】×${item.quantity}`).join('\n')) }); await message.send({ format: await mailDetailFormat(event.current.UserId, Number(route.param('id'))) }); } catch (error) { await message.send({ format: messageFormat('领取失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const mailDeleteHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await deleteMail(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('邮件已删除', '该邮件已从邮箱移除。') }); await message.send({ format: await mailListFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('删除失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
