import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { friendDetail, friendList, friendRequests, acceptFriendRequest, rejectFriendRequest, giveAffinityGift, requestOath, oathRequests, acceptOath, rejectOath, oathStatus, recordOathMemory, requestOathRelease, acceptOathRelease, rejectOathRelease, oathReleaseRequests, startOathCeremony } from '../game/social.service';
import { messageFormat } from '../game/message';

const sendError = async (message: any, title: string, error: unknown) => message.send({ format: messageFormat(title, error instanceof Error ? error.message : '请稍后重试。') });

const friendPageSize = 5;
const circledNumber = (index: number) => '①②③④⑤'.charAt(index) || `${index + 1}.`;

const friendListFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const normalizedKeyword = keyword.trim();
  const rows = await friendList(qqUserId);
  const matched = rows.filter(row => !normalizedKeyword || row.name.includes(normalizedKeyword) || String(row.game_id).includes(normalizedKeyword));
  const totalPages = Math.max(1, Math.ceil(matched.length / friendPageSize));
  const currentPage = Math.min(totalPages, Math.max(1, Math.floor(page) || 1));
  const displayed = matched.slice((currentPage - 1) * friendPageSize, currentPage * friendPageSize);
  const markdown = Format.createMarkdown().addTitle('我的好友').addNewline().addNewline();
  if (!displayed.length) markdown.addBlockquote(normalizedKeyword ? '没有找到匹配的好友。' : '还没有记录在册的好友。与身边的玩家互相添加好友后，这里会留下你们的同行轨迹。').addNewline().addNewline();
  let normalIndex = 0;
  for (const row of displayed) {
    const label = row.status === 'oath' ? '💍 ' : `${circledNumber(normalIndex++)} `;
    markdown.addText(`${label}${row.name}`).addNewline().addNewline()
      .addBlockquote(`ID：${row.game_id}`).addNewline().addNewline()
      .addBlockquote(`好感：${row.affinity}｜${row.stage.title}`).addNewline().addNewline()
      .addButton('[详情]', { data: `/好友资料 ${row.game_id}`, autoEnter: false }).addButton('[互动]', { data: `/玩家互动 ${row.game_id}`, autoEnter: false }).addNewline().addNewline();
  }
  if (normalizedKeyword) markdown.addBlockquote(`搜索：${normalizedKeyword}｜共 ${matched.length} 位`).addNewline().addNewline();
  markdown.addText(`当前第（${currentPage}/${totalPages}）页`);
  const command = (target: number) => `/好友分页 ${target}${normalizedKeyword ? ` ${normalizedKeyword}` : ''}`;
  const buttons = Format.createButtonGroup().addRow()
    .addButton('上一页', command(Math.max(1, currentPage - 1)), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined })
    .addButton('搜索', '/好友搜索 ', { type: 'command', autoEnter: false })
    .addButton('下一页', command(Math.min(totalPages, currentPage + 1)), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined })
    .addRow().addButton('好友申请', '/好友申请', { type: 'command', autoEnter: true })
    .addButton('星誓状态', '/星誓', { type: 'command', autoEnter: true })
    .addRow().addButton('返回教堂', '/教堂', { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await message.send({ format: await friendListFormat(event.current.UserId) }); }
  catch (error) { await sendError(message, '好友列表不可用', error); }
};

export const friendPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await message.send({ format: await friendListFormat(event.current.UserId, Number(route.param('page')), String(route.param('keyword') ?? '')) }); } catch (error) { await sendError(message, '好友列表不可用', error); } };
export const friendSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await message.send({ format: await friendListFormat(event.current.UserId, 1, String(route.param('keyword') ?? '')) }); } catch (error) { await sendError(message, '好友搜索不可用', error); } };

export const friendRequestHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await import('../game/social.service').then(module => module.sendFriendRequest(event.current.UserId, Number(route.param('id')))); await message.send({ format: messageFormat('好友申请已送达', `你向【${result.targetName}】发出了好友申请。请等待对方回应。`).addButtonGroup(Format.createButtonGroup().addRow().addButton('申请列表', '/好友申请', { type: 'command', autoEnter: true, style: 'blue' })) }); } catch (error) { await sendError(message, '无法添加好友', error); } };

export const friendRequestListHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const rows = await friendRequests(event.current.UserId); const markdown = Format.createMarkdown().addTitle('好友申请').addNewline().addNewline(); if (!rows.length) markdown.addText('当前没有待处理的好友申请。'); for (const row of rows) markdown.addText(`【${row.name}】id：${row.game_id}\n申请编号：${row.id}\n`).addButton('[接受]', { data: `/同意好友 ${row.id}`, autoEnter: false }).addButton('[拒绝]', { data: `/拒绝好友 ${row.id}`, autoEnter: false }).addNewline().addNewline(); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('好友列表', '/好友', { type: 'command', autoEnter: true })) }); } catch (error) { await sendError(message, '申请列表不可用', error); } };

export const acceptFriendHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await acceptFriendRequest(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('好友已添加', `你与【${result.name}】成为了游戏内好友。现在可以通过互动与赠礼积累好感。`) }); } catch (error) { await sendError(message, '无法同意好友申请', error); } };
export const rejectFriendHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await rejectFriendRequest(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('申请已处理', '这条好友申请已被放回安静的星尘中。') }); } catch (error) { await sendError(message, '无法处理好友申请', error); } };

export const friendDetailHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const row = await friendDetail(event.current.UserId, Number(route.param('id'))); const skillText = row.skills.length ? row.skills.map(skill => `【${skill.name}】Lv.${skill.level}`).join('、') : '尚未掌握技能。'; const markdown = Format.createMarkdown().addTitle(`玩家信息·${row.name}`).addNewline().addNewline().addText(`ID：${row.gameId}\n等级：Lv.${row.level}｜冒险者评级：${row.rank}\n职业：${row.profession}\n副职业：${row.secondaryProfession}${row.secondaryLevel === null ? '' : ` Lv.${row.secondaryLevel}`}`).addNewline().addNewline().addText('熟悉技能').addNewline().addBlockquote(skillText); const buttons = Format.createButtonGroup().addRow().addButton('互动', `/玩家互动 ${row.gameId}`, { type: 'command', autoEnter: true }).addButton('赠礼', `/好友赠礼选择 ${row.gameId}`, { type: 'command', autoEnter: true }); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons.addRow().addButton('返回好友列表', '/好友', { type: 'command', autoEnter: true })) }); } catch (error) { await sendError(message, '无法查看玩家信息', error); } };
export const friendGiftChoiceHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const row = await friendDetail(event.current.UserId, Number(route.param('id'))); const markdown = Format.createMarkdown().addTitle(`赠礼·${row.name}`).addNewline().addNewline().addText('请选择要交给对方的礼物：'); const buttons = Format.createButtonGroup().addRow().addButton('心意花束', `/好友赠礼 ${row.gameId} heart_bouquet`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('共鸣果实', `/好友赠礼 ${row.gameId} resonance_fruit`, { type: 'command', autoEnter: true }).addRow().addButton('返回玩家信息', `/好友资料 ${row.gameId}`, { type: 'command', autoEnter: true }); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) }); } catch (error) { await sendError(message, '赠礼不可用', error); } };

export const friendGiftHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await giveAffinityGift(event.current.UserId, Number(route.param('id')), String(route.param('item'))); await message.send({ format: messageFormat('赠礼完成', `你将【${result.itemName}】交到【${result.targetName}】手中。\n\n好感 +${result.gain}\n当前阶段：${result.stage.title}｜好感：${result.affinity}\n今日赠礼：${result.dailyGifts}/3`) }); } catch (error) { await sendError(message, '无法赠礼', error); } };

export const oathHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const row = await oathStatus(event.current.UserId); const markdown = Format.createMarkdown().addTitle('星誓·同行记录').addNewline().addNewline(); const buttons = Format.createButtonGroup(); if (!row) markdown.addBlockquote('这里记录着两位好友共同选择的星光。请在圣恩教堂与好友面对面后发起申请。'); else { const state = row.status === 'active' ? '星誓同行' : row.status === 'ceremony_pending' ? '等待教堂仪式' : '等待解除回应'; markdown.addText(`同行者：【${row.name}】id：${row.game_id}\n状态：${state}\n好感：${row.affinity}｜阶段：${row.stage.title}\n${row.stage.description}`); if (row.status === 'ceremony_pending') buttons.addRow().addButton('仪式开始', '/星誓仪式', { type: 'command', autoEnter: true, style: 'blue' }); else if (row.status === 'active') buttons.addRow().addButton('记录教堂纪念', '/星誓纪念', { type: 'command', autoEnter: true }).addButton('发起解除', '/解除星誓', { type: 'command', autoEnter: true }); } buttons.addRow().addButton('星誓申请', '/星誓申请', { type: 'command', autoEnter: true }).addButton('返回教堂', '/教堂', { type: 'command', autoEnter: true }); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) }); } catch (error) { await sendError(message, '星誓记录不可用', error); } };

export const oathRequestHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await requestOath(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('星誓申请已送达', `你与【${result.targetName}】的星光申请已交给对方。请在教堂内等待回应。`).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看星誓申请', '/星誓申请', { type: 'command', autoEnter: true, style: 'blue' })) }); } catch (error) { const reason = error instanceof Error ? error.message : '请稍后重试。'; if (reason === '你们之间已经有一条待处理的星誓申请。') await message.send({ format: messageFormat('无法发起星誓', reason).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看星誓申请', '/星誓申请', { type: 'command', autoEnter: true, style: 'blue' })) }); else await sendError(message, '无法发起星誓', error); } };

export const oathRequestListHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const [rows, releaseRows] = await Promise.all([oathRequests(event.current.UserId), oathReleaseRequests(event.current.UserId)]); const markdown = Format.createMarkdown().addTitle('星誓申请').addNewline().addNewline(); if (!rows.length && !releaseRows.length) markdown.addText('当前没有待处理的星誓申请。'); for (const row of rows) markdown.addText(`【${row.name}】id：${row.game_id}\n申请编号：${row.id}\n好感：${row.affinity}｜阶段：${row.stage.title}\n`).addButton('[接受]', { data: `/接受星誓 ${row.id}`, autoEnter: false }).addButton('[拒绝]', { data: `/拒绝星誓 ${row.id}`, autoEnter: false }).addNewline().addNewline(); if (releaseRows.length) markdown.addText('解除申请').addNewline().addNewline(); for (const release of releaseRows) markdown.addText(`【${release.name}】id：${release.game_id}\n申请编号：${release.id}\n对方希望解除当前星誓同行。\n`).addButton('[接受]', { data: `/同意解除星誓 ${release.id}`, autoEnter: false }).addButton('[拒绝]', { data: `/拒绝解除星誓 ${release.id}`, autoEnter: false }).addNewline().addNewline(); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回星誓', '/星誓', { type: 'command', autoEnter: true })) }); } catch (error) { await sendError(message, '申请列表不可用', error); } };
export const acceptOathHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await acceptOath(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('星誓已回应', `你已接受【${result.partnerName}】的星光申请。\n\n请与对方一同回到圣恩教堂，在教堂中打开“星誓”，再点击“仪式开始”，让修女见证这份同行的承诺。\n当前阶段：${result.stage.title}｜好感：${result.affinity}`).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看星誓', '/星誓', { type: 'command', autoEnter: true, style: 'blue' })) }); } catch (error) { await sendError(message, '无法接受星誓申请', error); } };
export const oathCeremonyHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await startOathCeremony(event.current.UserId); const markdown = Format.createMarkdown().addTitle('星誓仪式').addNewline().addNewline()
  .addBlockquote('彩窗把柔和的星光洒在祭台前。').addNewline().addNewline()
  .addBlockquote('修女伊芙琳捧起两枚星誓之环，仰映天穹。').addNewline().addNewline()
  .addBlockquote('钟声轻轻回荡时，你们相望而笑，将一路相伴的温柔、心底的愿望和未来的晨昏交给同一片光。').addNewline().addNewline()
  .addBlockquote('指尖相触，银白纹路如星河般缓缓亮起，仿佛两颗星终于拥有了彼此的轨迹。').addNewline().addNewline()
  .addBlockquote('修女轻声祝祷：').addNewline().addNewline()
  .addBlockquote('“愿你们把每一次并肩都珍藏成甜蜜的回忆。”').addNewline().addNewline()
  .addBlockquote('“让这份约定穿过岁月与远方，永远明亮如初。”').addNewline().addNewline()
  .addText(`💍【${result.actorName}】已与【${result.partnerName}】结为星誓同行`);
  const buttons = Format.createButtonGroup().addRow().addButton('星誓', '/星誓', { type: 'command', autoEnter: true, style: 'blue' });
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
} catch (error) { await sendError(message, '无法开始仪式', error); } };
export const rejectOathHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await rejectOath(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('申请已处理', '这份星光申请暂时没有得到回应。') }); } catch (error) { await sendError(message, '无法处理星誓申请', error); } };
export const oathMemoryHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await recordOathMemory(event.current.UserId); await message.send({ format: messageFormat('教堂纪念', `你与【${result.partnerName}】在彩窗下并肩安静了一会儿。修女将这一刻记入教堂的星册。\n\n好感 +10\n当前阶段：${result.stage.title}｜好感：${result.affinity}`) }); } catch (error) { await sendError(message, '无法记录纪念', error); } };
export const oathReleaseHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await requestOathRelease(event.current.UserId); await message.send({ format: messageFormat('解除申请已送达', `你已向【${result.partnerName}】发出解除星誓的申请，等待对方回应。已有好感与好友关系会被保留。`).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看解除申请', '/星誓申请', { type: 'command', autoEnter: true, style: 'blue' })) }); } catch (error) { await sendError(message, '无法发起解除申请', error); } };
export const oathReleaseAcceptHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await acceptOathRelease(event.current.UserId, Number(route.param('id'))); const markdown = Format.createMarkdown().addTitle('星誓已解除').addNewline().addNewline()
  .addBlockquote('曾在彩窗下交汇的两束星光，今日各自循向远方。').addNewline().addNewline()
  .addBlockquote('修女轻轻合起星册，把一路同行的温柔留在记忆里，也愿往后的旅途仍有明亮相伴。').addNewline().addNewline()
  .addText(`你与【${result.partnerName}】的星誓记录已归档，好友关系与已有好感继续保留。`);
  await message.send({ format: Format.create().addMarkdown(markdown) });
} catch (error) { await sendError(message, '无法确认解除申请', error); } };
export const oathReleaseRejectHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await rejectOathRelease(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('申请已处理', `你已拒绝【${result.partnerName}】的解除申请，星誓同行状态保持不变。`) }); } catch (error) { await sendError(message, '无法处理解除申请', error); } };
