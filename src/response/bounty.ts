import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { abandonBounty, abandonSecondaryQuest, acceptBounty, bountyBoard, claimBounty, clearInvalidBounty, playerBounties } from '../game/bounty.service';
import { blacksmithQuest } from '../game/blacksmith.service';
import { alchemistQuest } from '../game/alchemist.service';
import { deconstructorQuest } from '../game/deconstructor.service';
import { omniscientQuest } from '../game/omniscient.service';
import { currentMainQuest, type MainQuest } from '../game/main-quest.service';
import { advancedProfessionMainQuest } from '../game/career-quest.service';
import { requireNpcAtCurrentPosition } from '../game/adventure.service';
import { messageFormat } from '../game/message';
import { dungeonSecretProgress, secondaryProfessionGuide } from '../game/dungeon-quest.service';
import { evolutionObservationDashboard } from '../game/evolution.service';
import { playerWorldSiteCommissions } from '../game/world-dynamics.service';
import { taskPanelObjectiveForSiteCommission } from '../game/world-dynamics.content';

export const bountyBoardFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const data = await bountyBoard(qqUserId, page, keyword); const markdown = Format.createMarkdown().addTitle('冒险者公会·悬赏板').addNewline().addNewline().addBlockquote(`木板只张贴暴动的精英与强大 Boss 的紧急讨伐令。\n当前展示 ${data.total}/10 条；目标被完成前，悬赏不会换榜。\n你当前可同时接受三份悬赏：${data.activeCount}/3。${data.keyword ? `\n搜索：${data.keyword}` : ''}`).addNewline().addNewline();
  for (const bounty of data.bounties) {
    markdown.addText(`【悬赏·${bounty.boardNo}】${bounty.title}\n`).addBlockquote(`讨伐：${bounty.targetName} ×${bounty.requiredCount}\n报酬：铜币 ×${bounty.copperReward}${bounty.location ? `\n坐标：${bounty.location.regionName} (${bounty.location.x}, ${bounty.location.y}, ${bounty.location.z})` : ''}`).addNewline();
    if (!bounty.status) markdown.addButton('[接受]', { data: `/接取悬赏 ${bounty.id}`, autoEnter: false });
    else if (bounty.status === 'completed') markdown.addButton('[领取悬赏]', { data: `/领取悬赏 ${bounty.id}`, autoEnter: false });
    else markdown.addText(`进度：${bounty.progress}/${bounty.requiredCount}`);
    markdown.addNewline().addNewline();
  }
  if (!data.bounties.length) markdown.addText('当前没有可张贴的紧急悬赏。').addNewline();
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('搜索', '/悬赏板搜索 ', { type: 'command', autoEnter: false })
    .addButton('任务栏', '/任务', { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('返回公会大厅', '/建筑进入 guild_counter', { type: 'command', autoEnter: true }));
};

const requireGuildBoard = (qqUserId: string) => requireNpcAtCurrentPosition(qqUserId, 'guild_counter');
export const bountyBoardHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireGuildBoard(event.current.UserId); await message.send({ format: await bountyBoardFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('无法查看悬赏板', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const bountyBoardPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireGuildBoard(event.current.UserId); await message.send({ format: await bountyBoardFormat(event.current.UserId, Number(route.param('page')), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('无法查看悬赏板', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const bountyBoardSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireGuildBoard(event.current.UserId); await message.send({ format: await bountyBoardFormat(event.current.UserId, 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
const taskCategories = ['主线', '支线', '悬赏', '委托', '其他'] as const;
type TaskCategory = typeof taskCategories[number];
type TaskEntry = MainQuest & { category: TaskCategory; location?: { regionName: string; x: number; y: number; z: number }; abandonCommand?: string };
const sequence = '①②③④⑤';
const commissionTravelLabel = (title: string, targetName: string) => {
  if (/封签递送|药匣急送|样本转运|余烬封存|燃料递补|回收旧信|祭仪补位|换哨交接/.test(title)) return `[送往 ${targetName}]`;
  if (/回执核验|货单验收|工匠验工|讯号复核|清点失联|水位测读|欠账清点/.test(title)) return `[前往核验·${targetName}]`;
  if (/遗迹拓片|传闻溯源|旧物归档|行装寻回|失物寻主/.test(title)) return `[去查阅·${targetName}]`;
  if (/路标复勘|引灯巡线|绕行告示|避险引导|巡游接引/.test(title)) return `[前往 ${targetName}]`;
  return `[前往 ${targetName}]`;
};

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
  const [mainQuest, advancedQuest, bounties, smithQuest, alchemyQuest, deconstructQuest, omniscientQuestProgress, dungeonSecret, needsSecondaryGuide, evolutionObservations, siteCommissions] = await Promise.all([currentMainQuest(qqUserId), advancedProfessionMainQuest(qqUserId), playerBounties(qqUserId), blacksmithQuest(qqUserId), alchemistQuest(qqUserId), deconstructorQuest(qqUserId), omniscientQuest(qqUserId), dungeonSecretProgress(qqUserId), secondaryProfessionGuide(qqUserId), evolutionObservationDashboard(qqUserId).catch(() => null), playerWorldSiteCommissions(qqUserId)]);
  const entries: TaskEntry[] = [{ category: '主线', ...mainQuest }, ...(advancedQuest ? [{ category: '主线' as const, ...advancedQuest }] : []), ...bounties.map(task => ({
    category: '悬赏' as const, title: `【悬赏·${task.id}】${task.title}`,
    description: task.status === 'invalid' ? '已失效：悬赏目标已被其他冒险者完成，或该悬赏已经过期。' : `讨伐：${task.targetName} ${task.progress}/${task.requiredCount}\n报酬：铜币 ×${task.copperReward}`,
    location: task.status === 'invalid' ? undefined : task.location,
    action: task.status === 'invalid' ? { label: '[清除]', command: `/清除悬赏 ${task.id}` } : task.status === 'completed' ? { label: '[领取悬赏]', command: `/领取悬赏 ${task.id}` } : undefined,
    abandonCommand: `/放弃悬赏 ${task.id}`
  }))];
  if (smithQuest.status === 'accepted' || smithQuest.status === 'completed') entries.push({
    category: '支线', title: '【副职业·锻造师入门】', description: `收集活木：${smithQuest.wood}/1\n收集兽核：${smithQuest.core}/1`,
    action: smithQuest.status === 'completed' ? { label: '[前往提交 铁匠铺(-17,-191)]', command: '/前往 -17 -191' } : undefined,
    abandonCommand: '/放弃副职业任务 blacksmith_apprentice'
  });
  if (alchemyQuest.status === 'accepted' || alchemyQuest.status === 'completed') entries.push({
    category: '支线', title: '【副职业·炼金师入门】', description: `收集微光草药：${alchemyQuest.herbs}/3`,
    action: alchemyQuest.status === 'completed' ? { label: '[前往提交 糖水屋(-12,-196)]', command: '/前往 -12 -196' } : undefined,
    abandonCommand: '/放弃副职业任务 alchemist_apprentice'
  });
  if (deconstructQuest.status === 'accepted' || deconstructQuest.status === 'completed') entries.push({
    category: '支线', title: '【副职业·解构师入门】', description: `收集兽核：${deconstructQuest.cores}/1`,
    action: deconstructQuest.status === 'completed' ? { label: '[前往提交 异工坊(6,-189)]', command: '/前往 6 -189' } : undefined,
    abandonCommand: '/放弃副职业任务 deconstructor_apprentice'
  });
  if (omniscientQuestProgress.status === 'accepted' || omniscientQuestProgress.status === 'completed') entries.push({
    category: '支线', title: '【副职业·全知者入门】', description: `挑战并观察森林史莱姆：${omniscientQuestProgress.slimeObserved ? '已完成' : '未完成'}\n挑战并观察幽影狼王：${omniscientQuestProgress.wolfKingObserved ? '已完成' : '未完成'}`,
    action: omniscientQuestProgress.status === 'completed' ? { label: '[前往提交 百味书屋(14,-176)]', command: '/前往 14 -176' } : undefined,
    abandonCommand: '/放弃副职业任务 omniscient_apprentice'
  });
  if (needsSecondaryGuide) entries.push({
    category: '支线', title: '【支线·职业之外的道路】', description: '你的冒险经历已足以支撑一门副职业。去百纳镇的各个店铺转转吧：炉火、药香、零件与书页之间，或许有一条适合你的道路。',
    action: { label: '[前往 百纳镇]', command: '/前往 -2 -181' }
  });
  if (evolutionObservations?.active) {
    const observation = evolutionObservations.active;
    const completed = observation.status === 'completed';
    entries.push({
      category: '委托', title: `【委托·${observation.definition.name}】`,
      description: `${observation.objective_text}\n进度：${observation.progress}/${observation.target_count}\n报酬：${observation.rewards}${completed ? '\n观察已完成，返回研究室提交记录。' : ''}`,
      action: completed ? { label: '[前往 演化研究室]', command: '/前往 -6 7' } : undefined
    });
  }
  for (const commission of siteCommissions) entries.push({
    category: '委托', title: `【站点委托·${commission.id}】${commission.title}`,
    description: `目标：${taskPanelObjectiveForSiteCommission(commission.objectiveText, commission.targetName)}`,
    location: commission.location,
    action: commission.status === 'completed' ? { label: '[领取委托]', command: `/领取站点委托 ${commission.id}` } : { label: commissionTravelLabel(commission.title, commission.targetName), command: `/前往 ${commission.location.x} ${commission.location.y}` }
  });
  if (dungeonSecret.status === 'accepted' && dungeonSecret.stage > 0 && dungeonSecret.stage < 7) {
    const details: Record<number, string> = {
      1: '你在封闭的地下大门前受阻。去冒险者公会问问，那究竟是什么地方。',
      2: '莫妮卡指引你前往异工坊，寻找穿过封印的办法。',
      3: '唯薇安提到了破魔传送器。购买一台，或取得图纸后以解构师能力构造它。',
      4: '破魔传送器已经到手。再次前往已标记的地下大门。',
      5: '石门前的猎人正等着你。听完他的忠告，再确认是否进入迷宫。',
      6: '进入地下迷宫第一层，寻找并击败这一层的小头目。'
    };
    entries.push({ category: '支线', title: '【支线·地下的秘密】', description: details[dungeonSecret.stage] ?? '继续追查地下迷宫的秘密。', action: dungeonSecret.stage === 1 ? { label: '[前往 冒险者公会(-2,-181)]', command: '/前往 -2 -181' } : dungeonSecret.stage === 2 || dungeonSecret.stage === 3 ? { label: '[前往 异工坊(6,-189)]', command: '/前往 6 -189' } : undefined });
  }
  const normalizedKeyword = keyword.trim();
  const filtered = entries.filter(task => (!category || task.category === category) && (!normalizedKeyword || `${task.title}\n${task.description}`.includes(normalizedKeyword)));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 5));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const items = filtered.slice((currentPage - 1) * 5, currentPage * 5);
  const markdown = Format.createMarkdown().addTitle('任务栏').addNewline().addNewline();
  if (category || normalizedKeyword) markdown.addText(`${category ? `分类：${category}` : '分类：全部'}${normalizedKeyword ? `｜搜索：${normalizedKeyword}` : ''}\n\n`);
  if (!items.length) markdown.addText(normalizedKeyword ? '没有找到符合条件的任务。' : category ? `当前没有${category}任务。` : '当前没有已接受的任务。');
  for (const [index, task] of items.entries()) {
    markdown.addText(`${sequence[index]}${task.title}`);
    if (task.abandonCommand) markdown.addText(' ').addButton('[放弃]', { data: task.abandonCommand, autoEnter: false });
    markdown.addNewline();
    if (task.title.startsWith('【主线·')) {
      for (const line of task.description.split('\n')) {
        if (line.trim()) markdown.addBlockquote(line).addNewline();
        else markdown.addNewline();
      }
    } else markdown.addBlockquote(task.description).addNewline();
    if (task.location) markdown.addText('> 坐标：').addButton(`${task.location.regionName} (${task.location.x}, ${task.location.y}, ${task.location.z})`, { data: `/前往 ${task.location.x} ${task.location.y}`, autoEnter: false }).addNewline();
    if (task.action) markdown.addButton(task.action.label, { data: task.action.command, autoEnter: false });
    else if (!task.actions?.length && !task.abandonCommand) markdown.addText('进行中');
    for (const action of task.actions ?? []) markdown.addButton(action.label, { data: action.command, autoEnter: false }).addNewline();
    markdown.addNewline().addNewline();
  }
  markdown.addText(`当前第(${currentPage}/${totalPages})页`);
  return Format.create().addMarkdown(markdown).addButtonGroup(taskButtons(category, currentPage, totalPages, normalizedKeyword));
};

const parseCategory = (value: string) => taskCategories.includes(value as TaskCategory) ? value as TaskCategory : undefined;
const taskAbandonedFormat = (title: string, pickupLocation: string) => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('任务放弃').addNewline().addNewline().addText(`你放弃了【${title}】\n可以前往${pickupLocation}重新接取任务`))
  .addButtonGroup(Format.createButtonGroup().addRow().addButton('任务', '/任务', { type: 'command', autoEnter: true }));
const secondaryQuestPickup: Record<'blacksmith_apprentice' | 'alchemist_apprentice' | 'deconstructor_apprentice' | 'omniscient_apprentice', { title: string; location: string }> = {
  blacksmith_apprentice: { title: '副职业·锻造师入门', location: '百纳镇·铁匠铺（-17, -123）' },
  alchemist_apprentice: { title: '副职业·炼金师入门', location: '百纳镇·糖水屋（-12, -178）' },
  deconstructor_apprentice: { title: '副职业·解构师入门', location: '百纳镇·异工坊（6, -171）' },
  omniscient_apprentice: { title: '副职业·全知者入门', location: '百纳镇·百味书屋（14, -108）' }
};
export const taskHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await message.send({ format: await taskFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('无法查看任务栏', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const taskCategoryHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const category = parseCategory(String(route.param('category'))); if (!category) throw new Error('不存在该任务分类。'); await message.send({ format: await taskFormat(event.current.UserId, category) }); } catch (error) { await message.send({ format: messageFormat('无法查看任务栏', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const taskPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const requested = String(route.param('category') ?? '全部'); const category = requested === '全部' ? undefined : parseCategory(requested); if (requested !== '全部' && !category) throw new Error('不存在该任务分类。'); await message.send({ format: await taskFormat(event.current.UserId, category, Number(route.param('page')), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('无法查看任务栏', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const taskSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await message.send({ format: await taskFormat(event.current.UserId, undefined, 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const clearInvalidBountyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await clearInvalidBounty(event.current.UserId, Number(route.param('id'))); await message.send({ format: await taskFormat(event.current.UserId, '悬赏') }); } catch (error) { await message.send({ format: messageFormat('清除失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const abandonBountyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await abandonBounty(event.current.UserId, Number(route.param('id'))); await message.send({ format: taskAbandonedFormat(result.title, '百纳镇·冒险者公会悬赏板') }); } catch (error) { await message.send({ format: messageFormat('放弃失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const abandonSecondaryQuestHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const code = String(route.param('code')) as keyof typeof secondaryQuestPickup; await abandonSecondaryQuest(event.current.UserId, code); const quest = secondaryQuestPickup[code]; await message.send({ format: taskAbandonedFormat(quest.title, quest.location) }); } catch (error) { await message.send({ format: messageFormat('放弃失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const acceptBountyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireGuildBoard(event.current.UserId); const result = await acceptBounty(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('接受悬赏', `已接受「${result.title}」，任务已加入任务栏。`) }); await message.send({ format: await bountyBoardFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('接受失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const claimBountyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireGuildBoard(event.current.UserId); const result = await claimBounty(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('悬赏结算', `已完成「${result.title}」\n获得铜币 ×${result.copper}`) }); await message.send({ format: await bountyBoardFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('领取失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
