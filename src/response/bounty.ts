import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { acceptBounty, bountyBoard, claimBounty, clearInvalidBounty, playerBounties } from '../game/bounty.service';
import { blacksmithQuest } from '../game/blacksmith.service';
import { alchemistQuest } from '../game/alchemist.service';
import { currentMainQuest } from '../game/main-quest.service';
import { requireNpcAtCurrentPosition } from '../game/adventure.service';
import { messageFormat } from '../game/message';

export const bountyBoardFormat = async (qqUserId: string) => {
  const data = await bountyBoard(qqUserId); const markdown = Format.createMarkdown().addTitle('冒险者公会·悬赏板').addNewline().addNewline().addBlockquote(`今日的羊皮纸整齐钉在木板上。你当前可同时接受三份悬赏：${data.activeCount}/3。`).addNewline().addNewline();
  for (const bounty of data.bounties) {
    markdown.addText(`【悬赏·${bounty.id}】${bounty.title}\n`).addBlockquote(`讨伐：${bounty.targetName} ×${bounty.requiredCount}\n报酬：铜币 ×${bounty.copperReward}${bounty.location ? `\n坐标：${bounty.location.regionName} (${bounty.location.x}, ${bounty.location.y}, ${bounty.location.z})` : ''}`).addNewline();
    if (!bounty.status) markdown.addButton('[接受]', { data: `/接取悬赏 ${bounty.id}`, autoEnter: false });
    else if (bounty.status === 'completed') markdown.addButton('[领取悬赏]', { data: `/领取悬赏 ${bounty.id}`, autoEnter: false });
    else markdown.addText(`进度：${bounty.progress}/${bounty.requiredCount}`);
    markdown.addNewline().addNewline();
  }
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务栏', '/任务', { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回公会大厅', '/建筑进入 guild_counter', { type: 'command', autoEnter: true }));
};

const requireGuildBoard = (qqUserId: string) => requireNpcAtCurrentPosition(qqUserId, 'guild_counter');
export const bountyBoardHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireGuildBoard(event.current.UserId); await message.send({ format: await bountyBoardFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('无法查看悬赏板', error instanceof Error ? error.message : '请稍后重试。') }); } };
const taskCategories = ['主线', '支线', '悬赏', '委托', '其他'] as const;
type TaskCategory = typeof taskCategories[number];
type TaskEntry = { category: TaskCategory; title: string; description: string; location?: { regionName: string; x: number; y: number; z: number }; action?: { label: string; command: string } };
const sequence = '①②③④⑤';

const taskButtons = (category: TaskCategory | undefined, page: number, totalPages: number, keyword: string) => {
  const pageCommand = (target: number) => `/任务页 ${category ?? '全部'} ${target}${keyword ? ` ${keyword}` : ''}`;
  const buttons = Format.createButtonGroup().addRow()
    .addButton('上一页', pageCommand(Math.max(1, page - 1)), { type: 'command', autoEnter: true })
    .addButton('搜索', '/任务搜索 ', { type: 'command', autoEnter: false })
    .addButton('下一页', pageCommand(Math.min(totalPages, page + 1)), { type: 'command', autoEnter: true });
  buttons.addRow();
  for (const item of taskCategories) buttons.addButton(item, `/任务分类 ${item}`, { type: 'command', autoEnter: true });
  return buttons;
};

export const taskFormat = async (qqUserId: string, category?: TaskCategory, page = 1, keyword = '') => {
  const [mainQuest, bounties, smithQuest, alchemyQuest] = await Promise.all([currentMainQuest(qqUserId), playerBounties(qqUserId), blacksmithQuest(qqUserId), alchemistQuest(qqUserId)]);
  const entries: TaskEntry[] = [{ category: '主线', ...mainQuest }, ...bounties.map(task => ({
    category: '悬赏', title: `【悬赏·${task.id}】${task.title}`,
    description: task.status === 'invalid' ? '已失效：悬赏目标已被其他冒险者完成，或该悬赏已经过期。' : `讨伐：${task.targetName} ${task.progress}/${task.requiredCount}\n报酬：铜币 ×${task.copperReward}`,
    location: task.status === 'invalid' ? undefined : task.location,
    action: task.status === 'invalid' ? { label: '[清除]', command: `/清除悬赏 ${task.id}` } : task.status === 'completed' ? { label: '[领取悬赏]', command: `/领取悬赏 ${task.id}` } : undefined
  }))];
  if (smithQuest.status === 'accepted' || smithQuest.status === 'completed') entries.push({
    category: '支线', title: '【副职业·锻造师入门】', description: `收集活木：${smithQuest.wood}/1\n收集兽核：${smithQuest.core}/1`,
    action: smithQuest.status === 'completed' ? { label: '[前往提交 铁匠铺(-17,-123)]', command: '/前往 -17 -123' } : undefined
  });
  if (alchemyQuest.status === 'accepted' || alchemyQuest.status === 'completed') entries.push({
    category: '支线', title: '【副职业·炼金师入门】', description: `收集微光草药：${alchemyQuest.herbs}/3`,
    action: alchemyQuest.status === 'completed' ? { label: '[前往提交 晴空糖水屋(-12,-127)]', command: '/前往 -12 -127' } : undefined
  });
  const normalizedKeyword = keyword.trim();
  const filtered = entries.filter(task => (!category || task.category === category) && (!normalizedKeyword || `${task.title}\n${task.description}`.includes(normalizedKeyword)));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 5));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const items = filtered.slice((currentPage - 1) * 5, currentPage * 5);
  const markdown = Format.createMarkdown().addTitle('任务栏').addNewline().addNewline();
  if (category || normalizedKeyword) markdown.addText(`${category ? `分类：${category}` : '分类：全部'}${normalizedKeyword ? `｜搜索：${normalizedKeyword}` : ''}\n\n`);
  if (!items.length) markdown.addText(normalizedKeyword ? '没有找到符合条件的任务。' : category ? `当前没有${category}任务。` : '当前没有已接受的任务。');
  for (const [index, task] of items.entries()) {
    markdown.addText(`${sequence[index]}${task.title}\n`).addBlockquote(task.description).addNewline();
    if (task.location) markdown.addText('> 坐标：').addButton(`${task.location.regionName} (${task.location.x}, ${task.location.y}, ${task.location.z})`, { data: `/前往 ${task.location.x} ${task.location.y}`, autoEnter: false }).addNewline();
    if (task.action) markdown.addButton(task.action.label, { data: task.action.command, autoEnter: false });
    else markdown.addText('进行中');
    markdown.addNewline().addNewline();
  }
  markdown.addText(`当前第(${currentPage}/${totalPages})页`);
  return Format.create().addMarkdown(markdown).addButtonGroup(taskButtons(category, currentPage, totalPages, normalizedKeyword));
};

const parseCategory = (value: string) => taskCategories.includes(value as TaskCategory) ? value as TaskCategory : undefined;
export const taskHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await message.send({ format: await taskFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('无法查看任务栏', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const taskCategoryHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const category = parseCategory(String(route.param('category'))); if (!category) throw new Error('不存在该任务分类。'); await message.send({ format: await taskFormat(event.current.UserId, category) }); } catch (error) { await message.send({ format: messageFormat('无法查看任务栏', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const taskPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const requested = String(route.param('category') ?? '全部'); const category = requested === '全部' ? undefined : parseCategory(requested); if (requested !== '全部' && !category) throw new Error('不存在该任务分类。'); await message.send({ format: await taskFormat(event.current.UserId, category, Number(route.param('page')), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('无法查看任务栏', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const taskSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await message.send({ format: await taskFormat(event.current.UserId, undefined, 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const clearInvalidBountyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await clearInvalidBounty(event.current.UserId, Number(route.param('id'))); await message.send({ format: await taskFormat(event.current.UserId, '悬赏') }); } catch (error) { await message.send({ format: messageFormat('清除失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const acceptBountyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireGuildBoard(event.current.UserId); const result = await acceptBounty(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('接受悬赏', `已接受「${result.title}」，任务已加入任务栏。`) }); await message.send({ format: await bountyBoardFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('接受失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const claimBountyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireGuildBoard(event.current.UserId); const result = await claimBounty(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('悬赏结算', `已完成「${result.title}」\n获得铜币 ×${result.copper}`) }); await message.send({ format: await bountyBoardFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('领取失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
