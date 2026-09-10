import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { npcDetail, nearbyPoints } from '../game/adventure.service';
import { messageFormat } from '../game/message';
import { npcSparringView } from '../game/npc-sparring.service';
import { requireCurrentGuild } from '../game/guild-context';
import { rootGuildPeople, rootGuildScenes } from '../game/opening-guild.config';

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const code=String(route.param('code'));
    const person=rootGuildPeople.find(p=>p.code===code);
    if(person){
      const context=await requireCurrentGuild(event.current.UserId);
      if(context.code!=='world_tree')throw new Error('这位接待员不在当前分会。');
      if(!(await nearbyPoints(event.current.UserId)).npcDetailsUnlocked)throw new Error('鉴识达到识珠 Lv.3 后，才能查看域民资料。');
      const markdown=Format.createMarkdown().addTitle('域民资料').addNewline().addNewline().addText(`【${person.name}】`)
        .addNewline().addText(`职责：${person.role}\n所在：世界树·根冠分会（${context.row.pos_x}, ${context.row.pos_y}）`)
        .addNewline().addNewline().addBlockquote(rootGuildScenes[person.code]);
      const back=person.code==='root_guild_clerk'?'/初行公会 前台':person.code==='root_guild_shopkeeper'?'/工会商店':person.code==='root_guild_cook'?'/餐厅':'/初行公会';
      await message.send({format:Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回',back,{type:'command',autoEnter:true}))});return;
    }
    const npc = await npcDetail(event.current.UserId, code);
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
