import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { leaveParty, partyInfo, partyList, partyMemberInfo, renameParty, transferPartyLeader } from '../game/adventure.service';
import { messageFormat } from '../game/message';

const partyFormat = async (qqUserId: string) => {
  const party = await partyInfo(qqUserId); const buttons = Format.createButtonGroup();
  if (!party) return Format.create().addMarkdown(Format.createMarkdown().addTitle('我的队伍').addNewline().addNewline().addText('你不在任何队伍中')).addButtonGroup(buttons
    .addRow().addButton('创建队伍', '/组队 创建', { type: 'command', autoEnter: true, style: 'blue' }).addButton('加入队伍', '/组队 加入 ', { type: 'command', autoEnter: false })
    .addRow().addButton('队伍列表', '/队伍列表', { type: 'command', autoEnter: true }));
  const leader = party.leader!; const leaderLine = `【${leader.name}】id：${leader.gameId}`; const markdown = Format.createMarkdown().addTitle('我的队伍').addNewline().addNewline().addText(`队伍名：${party.name} `);
  if (party.ownId === party.leaderId) markdown.addButton('[修改]', { data: '/修改队伍名 ', autoEnter: false });
  markdown.addText('\n队长：\n').addBlockquote(leaderLine).addButton('[查看信息]', { data: `/队伍成员信息 ${leader.gameId}`, autoEnter: false }).addNewline().addNewline().addText('队员：').addNewline();
  if (!party.members.length) markdown.addBlockquote('暂无其他队员。').addNewline();
  for (const member of party.members) { markdown.addBlockquote(`【${member.name}】id：${member.gameId}`).addButton('[查看信息]', { data: `/队伍成员信息 ${member.gameId}`, autoEnter: false }); if (party.ownId === party.leaderId) markdown.addButton('[委任队长]', { data: `/委任队长 ${member.gameId}`, autoEnter: false }); markdown.addNewline(); }
  buttons.addRow().addButton('退出队伍', '/退出队伍', { type: 'command', autoEnter: true }).addButton('加入队伍', '/组队 加入 ', { type: 'command', autoEnter: false });
  buttons.addRow().addButton('队伍列表', '/队伍列表', { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await message.send({ format: await partyFormat(event.current.UserId) });
  } catch (error) { await message.send({ format: messageFormat('队伍不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const leaveHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
  await leaveParty(event.current.UserId);
  const markdown = Format.createMarkdown().addTitle('退出队伍').addNewline().addNewline().addText('你已退出队伍');
  const buttons = Format.createButtonGroup().addRow().addButton('创建队伍', '/组队 创建', { type: 'command', autoEnter: true, style: 'blue' }).addButton('队伍列表', '/队伍列表', { type: 'command', autoEnter: true });
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
} catch (error) { await message.send({ format: messageFormat('无法退出队伍', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const renameHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await renameParty(event.current.UserId, String(route.param('name'))); await message.send({ format: await partyFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('修改失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const transferHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await transferPartyLeader(event.current.UserId, Number(route.param('id'))); await message.send({ format: await partyFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('委任失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const memberInfoHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const member = await partyMemberInfo(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('队员信息', `昵称：${member.name}\n游戏ID：${member.gameId}\n等级：Lv.${member.level}\n职业：${member.profession}`) }); } catch (error) { await message.send({ format: messageFormat('无法查看信息', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const listHandler = async () => { const [message] = useMessage(); try { const rows = await partyList(); const markdown = Format.createMarkdown().addTitle('队伍列表').addNewline().addNewline(); if (!rows.length) markdown.addText('当前没有可加入的队伍。'); else rows.forEach((party, index) => markdown.addText(`${index + 1}. ${party.name}｜队长：${party.leaderName}｜${party.count}/4 `).addButton('[加入]', { data: `/组队 加入 ${party.id}`, autoEnter: false }).addNewline()); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回我的队伍', '/队伍', { type: 'command', autoEnter: true })) }); } catch (error) { await message.send({ format: messageFormat('队伍列表不可用', error instanceof Error ? error.message : '请稍后重试。') }); } };
