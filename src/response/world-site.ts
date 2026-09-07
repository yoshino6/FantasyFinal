import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { nearbyPoints } from '../game/adventure.service';
import { messageFormat } from '../game/message';
import { acceptWorldSiteCommissionFromAttendant, claimWorldSiteCommission, useWorldSite, worldSiteKnock, worldSiteView, submitWorldSiteCommission } from '../game/world-dynamics.service';

const fail = async (message: any, error: unknown) => message.send({ format: messageFormat('特色站点', error instanceof Error ? error.message : '站点暂时无法响应。') });
export const submitWorldSiteCommissionHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: messageFormat('委托交接', await submitWorldSiteCommission(event.current.UserId, Number(route.param('id')))).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务栏', '/任务', { type: 'command', autoEnter: true })) }); }
  catch (error) { await fail(message, error); }
};

const actionCode: Record<string, 'commission' | 'forecast' | 'exchange' | 'clues' | 'shelter'> = { 委托: 'commission', 预报: 'forecast', 交换: 'exchange', 线索: 'clues', 庇护: 'shelter', commission: 'commission', forecast: 'forecast', exchange: 'exchange', clues: 'clues', shelter: 'shelter' };
const actionCommand: Record<'commission' | 'forecast' | 'exchange' | 'clues' | 'shelter', string> = { commission: '委托', forecast: '预报', exchange: '交换', clues: '线索', shelter: '庇护' };

export const worldSiteFormat = async (qqUserId: string, siteCode: string, notices: string[] = []) => {
  const [site, nearby] = await Promise.all([worldSiteView(qqUserId, siteCode), nearbyPoints(qqUserId)]);
  const markdown = Format.createMarkdown().addTitle(`${site.regionName}·${site.name}`).addNewline().addNewline();
  if (site.attendant) {
    markdown.addText(`【域民】${site.attendant.name}`);
    if (nearby.npcDetailsUnlocked) markdown.addText(' ').addButton('[详情]', { data: `/域民详情 ${site.attendant.code}`, autoEnter: false });
    markdown.addNewline().addNewline().addBlockquote(site.description).addNewline()
      .addBlockquote(`${site.attendant.role}。${site.attendant.description}`).addNewline().addNewline()
      .addText(`可办理：${site.actionLabel}（每日 ${site.dailyLimit} 次）`);
  } else {
    markdown.addBlockquote(site.description).addNewline().addNewline()
      .addBlockquote('站内没有域民值守。柜台与陈设仍保持原样，但暂时无人办理事务。');
  }
  if (notices.length) markdown.addNewline().addNewline().addBlockquote(notices.join('\n'));
  const buttons = Format.createButtonGroup().addRow();
  if (site.attendant) {
    buttons.addButton(`闲聊 ${site.attendant.name}`, `/域民交谈 ${site.attendant.code}`, { type: 'command', autoEnter: true, style: 'blue' });
    buttons.addButton('切磋', `/切磋 ${site.attendant.code}`, { type: 'command', autoEnter: true, style: 'blue' });
    if (site.capability !== 'commission') buttons.addButton(site.actionLabel, `/站点行动 ${site.code} ${actionCommand[site.capability]}`, { type: 'command', autoEnter: true });
    else markdown.addNewline().addNewline().addBlockquote('前台委托需先与值守域民交谈，再由对方亲手交付。');
  }
  buttons.addButton('离开', `/建筑离开 ${site.code}`, { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export const worldSiteActionHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const code = String(route.param('code')); const action = actionCode[String(route.param('action'))]; if (!action) throw new Error('未识别的站点服务。'); if (action === 'commission') throw new Error('请先与前台常驻域民交谈，再接取委托。');
    const result = await useWorldSite(event.current.UserId, code, action as 'forecast' | 'exchange' | 'clues' | 'shelter');
    const markdown = Format.createMarkdown().addTitle(`站点服务·${result.siteName}`).addNewline().addNewline().addText(result.text).addNewline().addNewline()
      .addBlockquote(`今日该服务还可使用 ${result.usage.remaining} 次。`);
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回站点', `/建筑进入 ${code}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务栏', '/任务', { type: 'command', autoEnter: true })) });
  } catch (error) { await fail(message, error); }
};

export const acceptWorldSiteCommissionHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const code = String(route.param('code')); const result = await acceptWorldSiteCommissionFromAttendant(event.current.UserId, code, String(route.param('npc')));
    if (!result.commission) throw new Error('委托交接内容暂未生成，请稍后再试。');
    const commission = result.commission;
    const markdown = Format.createMarkdown().addTitle(`站点委托·${result.siteName}`).addNewline().addNewline()
      .addText(`【域民】${commission.issuerName}`).addNewline().addNewline().addBlockquote(commission.briefing).addNewline().addNewline()
      .addText('任务目标').addNewline().addText(commission.objective).addNewline().addText(`报酬：铜币 ×${commission.reward}`).addNewline()
      .addText('委托已加入任务栏；完成交接后可领取报酬。').addNewline().addNewline().addBlockquote(`今日还可接取 ${result.usage.remaining} 次委托。`);
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务栏', '/任务', { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回站点', `/建筑进入 ${code}`, { type: 'command', autoEnter: true })) });
  } catch (error) { await fail(message, error); }
};

export const claimWorldSiteCommissionHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const result = await claimWorldSiteCommission(event.current.UserId, Number(route.param('id')));
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('委托结算').addNewline().addNewline().addText(`已完成「${result.title}」\n获得铜币 ×${result.copper}`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务栏', '/任务', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await fail(message, error); }
};

export const worldSiteKnockHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const code = String(route.param('code')); const result = await worldSiteKnock(event.current.UserId, code);
    if (result.answered) { await message.send({ format: await worldSiteFormat(event.current.UserId, code) }); return; }
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle(`站点·${result.site.name}`).addNewline().addNewline().addBlockquote(result.text)).addButtonGroup(Format.createButtonGroup().addRow().addButton('离开', `/建筑离开 ${code}`, { type: 'command', autoEnter: true })) });
  } catch (error) { await fail(message, error); }
};
