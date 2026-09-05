import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { npcDetail } from '../game/adventure.service';
import { messageFormat } from '../game/message';
import { npcSparringView } from '../game/npc-sparring.service';

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const npc = await npcDetail(event.current.UserId, String(route.param('code')));
    const spar = await npcSparringView(event.current.UserId, String(route.param('code'))).catch(() => null);
    const markdown = Format.createMarkdown().addTitle('域民资料').addNewline().addNewline()
      .addText(`【${npc.name}】\n位置：(${npc.x}, ${npc.y})\n好感度：${npc.affinity}｜${npc.rank.title}`).addNewline().addNewline()
      .addBlockquote(npc.description).addNewline().addNewline()
      .addText('今日互动：').addNewline()
      .addBlockquote(`闲聊 ${npc.daily.chat}/3｜购买 ${npc.daily.buy}/3｜出售 ${npc.daily.sell}/3｜技艺操作 ${npc.daily.craft}/3`);
    const buttons = Format.createButtonGroup().addRow();
    if (spar) { markdown.addNewline().addBlockquote(`切磋 ${spar.used ? 1 : 0}/1`); buttons.addButton('切磋', `/切磋 ${spar.profile.code}`, { type: 'command', autoEnter: true, style: spar.used ? undefined : 'blue' }); }
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons.addButton('操作面板', '/面板', { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('无法查看域民资料', error instanceof Error ? error.message : '请稍后重试。') }); }
};
