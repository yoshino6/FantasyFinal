import { Format, useEvent, useMessage } from 'alemonjs';
import { addNpcAffinity, nearbyPoints, requireNpcAtCurrentPosition } from '../game/adventure.service';
import { messageFormat } from '../game/message';
import { npcChatDialogue } from '../game/npc-dialogue.service';
import { friendList, oathStatus } from '../game/social.service';

const churchCode = 'saint_church';
const requireChurch = (qqUserId: string) => requireNpcAtCurrentPosition(qqUserId, churchCode);

export const churchFormat = async (qqUserId: string, dialogue?: string) => {
  const [nearby, friends, oath] = await Promise.all([nearbyPoints(qqUserId), friendList(qqUserId), oathStatus(qqUserId)]);
  const playersHere = new Set(nearby.points.filter(point => point.type === '玩家' && point.distance === 0 && point.code).map(point => Number(point.code)));
  const oathCandidates = oath?.status === 'ceremony_pending' ? [] : friends.filter(friend => friend.status === 'friend' && playersHere.has(Number(friend.game_id)));
  const hour = new Date().getHours();
  const scene = dialogue ?? (hour < 11
    ? '晨光穿过高高的彩窗，在石地上铺开安静的光带。修女伊芙琳正将白花摆在祭台前，转身时朝你优雅地欠身。'
    : hour < 18
      ? '午后的圣恩教堂宁静而明亮。伊芙琳为来访者添上一杯温水，随后以温和的目光向你问候。'
      : '暮色渐深，伊芙琳逐一点亮烛台。她在摇曳的烛火中合起祷典，为晚归的来客留出一处安静的位置。');
  const markdown = Format.createMarkdown().addTitle('百纳镇·圣恩教堂').addNewline().addNewline().addText('【修女·伊芙琳】');
  if (nearby.npcDetailsUnlocked) markdown.addText(' ').addButton('[详情]', { data: '/NPC详情 saint_church', autoEnter: false });
  markdown.addNewline().addNewline().addBlockquote(scene);
  if (oath?.status === 'ceremony_pending') markdown.addNewline().addNewline().addText(`【${oath.name}】已接受星光申请。请与对方一同站在祭台前，打开“星誓”开始正式仪式。`);
  if (oathCandidates.length) {
    markdown.addNewline().addNewline().addText('同行的星光在祭台前轻轻回应：').addNewline();
    for (const candidate of oathCandidates) markdown.addText(`【${candidate.name}】好感：${candidate.affinity}/500`).addNewline();
  }
  const buttons = Format.createButtonGroup()
    .addRow().addButton('星誓', '/星誓', { type: 'command', autoEnter: false }).addButton('祈福', '/祈福', { type: 'command', autoEnter: false });
  for (const candidate of oathCandidates) buttons.addRow().addButton(`发起星誓·${candidate.name}`, `/发起星誓 ${candidate.game_id}`, { type: 'command', autoEnter: true, style: 'blue' });
  buttons
    .addRow().addButton('闲聊', '/修女闲聊', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('离开', `/建筑离开 ${churchCode}`, { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

const churchHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await requireChurch(event.current.UserId); await message.send({ format: await churchFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('无法进入圣恩教堂', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export default churchHandler;

export const churchChatHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireChurch(event.current.UserId);
    const { affinity, rank } = await addNpcAffinity(event.current.UserId, churchCode, 'chat');
    const detailsUnlocked = (await nearbyPoints(event.current.UserId)).npcDetailsUnlocked;
    const markdown = Format.createMarkdown().addTitle('百纳镇·圣恩教堂').addNewline().addNewline().addText('【修女·伊芙琳】').addNewline().addNewline()
      .addBlockquote(npcChatDialogue(churchCode, affinity));
    if (detailsUnlocked) markdown.addNewline().addNewline().addText(`好感：${affinity}｜${rank.title}`);
    const buttons = Format.createButtonGroup().addRow().addButton('继续闲聊', '/修女闲聊', { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回教堂', '/教堂', { type: 'command', autoEnter: true });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
  } catch (error) { await message.send({ format: messageFormat('无法闲聊', error instanceof Error ? error.message : '请稍后重试。') }); }
};
