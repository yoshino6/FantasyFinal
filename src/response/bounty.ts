import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { acceptBounty, bountyBoard, claimBounty, playerBounties } from '../game/bounty.service';
import { requireNpcAtCurrentPosition } from '../game/adventure.service';
import { messageFormat } from '../game/message';

export const bountyBoardFormat = async (qqUserId: string) => {
  const data = await bountyBoard(qqUserId); const markdown = Format.createMarkdown().addTitle('冒险者公会·悬赏板').addNewline().addNewline().addBlockquote(`今日的羊皮纸整齐钉在木板上。你当前可同时接受三份悬赏：${data.activeCount}/3。`).addNewline().addNewline();
  for (const bounty of data.bounties) {
    markdown.addText(`【悬赏·${bounty.id}】${bounty.title}\n`).addBlockquote(`讨伐：${bounty.targetName} ×${bounty.requiredCount}\n报酬：铜币 ×${bounty.copperReward}`).addNewline();
    if (!bounty.status) markdown.addButton('[接受]', { data: `/接取悬赏 ${bounty.id}`, autoEnter: false });
    else if (bounty.status === 'completed') markdown.addButton('[领取悬赏]', { data: `/领取悬赏 ${bounty.id}`, autoEnter: false });
    else markdown.addText(`进度：${bounty.progress}/${bounty.requiredCount}`);
    markdown.addNewline().addNewline();
  }
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务栏', '/任务', { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回公会大厅', '/建筑进入 guild_counter', { type: 'command', autoEnter: true }));
};

const requireGuildBoard = (qqUserId: string) => requireNpcAtCurrentPosition(qqUserId, 'guild_counter');
export const bountyBoardHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireGuildBoard(event.current.UserId); await message.send({ format: await bountyBoardFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('无法查看悬赏板', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const taskHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const tasks = await playerBounties(event.current.UserId); const markdown = Format.createMarkdown().addTitle('任务栏').addNewline().addNewline(); if (!tasks.length) markdown.addText('当前没有已接受的悬赏。'); for (const task of tasks) { markdown.addText(`【悬赏·${task.id}】${task.title}\n`).addBlockquote(`讨伐：${task.targetName} ${task.progress}/${task.requiredCount}\n报酬：铜币 ×${task.copperReward}`).addNewline(); if (task.status === 'completed') markdown.addButton('[领取悬赏]', { data: `/领取悬赏 ${task.id}`, autoEnter: false }); else markdown.addText('进行中'); markdown.addNewline().addNewline(); } await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('前往悬赏板', '/悬赏板', { type: 'command', autoEnter: true, style: 'blue' })) }); } catch (error) { await message.send({ format: messageFormat('无法查看任务栏', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const acceptBountyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireGuildBoard(event.current.UserId); const result = await acceptBounty(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('接受悬赏', `已接受「${result.title}」，任务已加入任务栏。`) }); await message.send({ format: await bountyBoardFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('接受失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const claimBountyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireGuildBoard(event.current.UserId); const result = await claimBounty(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('悬赏结算', `已完成「${result.title}」\n获得铜币 ×${result.copper}`) }); await message.send({ format: await bountyBoardFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('领取失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
