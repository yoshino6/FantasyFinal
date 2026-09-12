import { Format, useEvent } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { continueGirlGratitude, girlGratitudeStage, receiveGirlGratitudeGift, returnToBainaTown, startGirlGratitude, teleportToWorldTree } from '../game/girl-gratitude.service';
import { messageFormat } from '../game/message';

const fail = async (message: any, title: string, error: unknown) => message.send({ format: messageFormat(title, error instanceof Error ? error.message : '请稍后重试。') });
const story = (chapter: number, text: string, buttons: ReturnType<typeof Format.createButtonGroup>) => Format.create().addMarkdown(Format.createMarkdown().addTitle(`主线·少女的谢意（${chapter}/6）`).addNewline().addNewline().addText(text)).addButtonGroup(buttons);

export const girlGratitudeStartHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await message.send({ format: await girlGratitudeStartFormat(event.current.UserId) }); }
  catch (error) { await fail(message, '无法与梨子喵交谈', error); }
};
export const girlGratitudeStartFormat = async (qqUserId: string) => {
  const text = await startGirlGratitude(qqUserId);
  return story(1, text, Format.createButtonGroup().addRow().addButton('前往 界门驿站', '/前往 14 -167', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true }));
};
export const girlGratitudeContinueHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { const result = await continueGirlGratitude(event.current.UserId); const buttons = Format.createButtonGroup().addRow(); if (result.exchange) buttons.addButton('前往 万叶联市', '/前往 4 2', { type: 'command', autoEnter: true, style: 'blue' }); else if (result.chapter !== 6) buttons.addButton('继续 同行', '/少女谢意 继续', { type: 'command', autoEnter: true, style: 'blue' }); buttons.addButton('任务', '/任务', { type: 'command', autoEnter: true }); await message.send({ format: story(result.chapter, result.text, buttons) }); }
  catch (error) { await fail(message, '无法继续同行', error); }
};
export const worldGateFormat = async () => {
  const [message] = useMessage();
  const markdown = Format.createMarkdown().addTitle('界门驿站').addNewline().addNewline().addText('环形门框中流动着安静的银蓝色光纹。值守人没有多问，只将一枚刻着叶脉的令牌放到控制台上。\n\n“目的地由旅人自己选择。请确认传送坐标。”');
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('传送', '/传送门 传送', { type: 'command', autoEnter: true, style: 'blue' }).addButton('离开', '/建筑离开 world_gate', { type: 'command', autoEnter: true })) });
};
export const worldGateTeleportPanelHandler = async () => {
  const [message] = useMessage();
  await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('传送门·传送').addNewline().addNewline().addText('叶脉令牌在控制台上亮起。当前可用目的地：')).addButtonGroup(Format.createButtonGroup().addRow().addButton('世界树', '/传送门 世界树', { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回 驿站', '/建筑进入 world_gate', { type: 'command', autoEnter: true })) });
};
export const worldTreeTeleportHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { const text = await teleportToWorldTree(event.current.UserId); await message.send({ format: story(2, text, Format.createButtonGroup().addRow().addButton('继续 同行', '/少女谢意 继续', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) }); }
  catch (error) { await fail(message, '传送失败', error); }
};
export const worldTreeGateFormat = async () => {
  const [message] = useMessage();
  const markdown = Format.createMarkdown().addTitle('世界树·界门').addNewline().addNewline().addText('巨根之间立着一座由叶脉与银环构成的界门。门内映着百纳镇的朦胧灯火，正等待归途中的旅人。');
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回 百纳镇', '/世界树界门 返回', { type: 'command', autoEnter: true, style: 'blue' }).addButton('离开', '/建筑离开 world_tree_gate', { type: 'command', autoEnter: true })) });
};
export const worldTreeGateReturnHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { const text = await returnToBainaTown(event.current.UserId); await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('界门传送').addNewline().addNewline().addText(text)).addButtonGroup(Format.createButtonGroup().addRow().addButton('操作面板', '/面板', { type: 'command', autoEnter: true, style: 'blue' })) }); }
  catch (error) { await fail(message, '传送失败', error); }
};
export const worldExchangeFormat = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  if (await (await import('../game/floating-leaf.service')).floatingLeafOrigin(event.current.UserId)) {
    const { floatingStoryMainQuest } = await import('../game/floating-leaf.service');
    const quest = await floatingStoryMainQuest(event.current.UserId);
    if (quest?.title === '【主线·菲萝缇的假】') {
      await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('万叶联市').addNewline().addNewline().addText('菲萝缇正兴致勃勃地在摊位间挑选小东西，偶尔回头确认我有没有跟上。“今天不赶航班，想看多久都行。”')).addButtonGroup(Format.createButtonGroup().addRow().addButton('继续同行', '/浮叶致谢 继续', { type: 'command', autoEnter: true, style: 'blue' }).addButton('离开', '/建筑离开 canopy_exchange', { type: 'command', autoEnter: true })) });
      return;
    }
    const { marketHomeFormat } = await import('./market');
    await message.send({ format: await marketHomeFormat(event.current.UserId) }); return;
  }
  const stage = await girlGratitudeStage(event.current.UserId);
  if (stage === 4) {
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('万叶联市').addNewline().addNewline().addText('光叶垂成半透明的穹顶，来自各地的商人把货契、矿石与异乡的香料摆在根须间。梨子喵已经在一处树灵摊位前等着你，双手背在身后，显得格外紧张。')).addButtonGroup(Format.createButtonGroup().addRow().addButton('收下 礼物', '/收下梨子喵的礼物', { type: 'command', autoEnter: true, style: 'blue' }).addButton('离开', '/建筑离开 canopy_exchange', { type: 'command', autoEnter: true })) });
    return;
  }
  if (stage < 6) {
    await message.send({ format: messageFormat('万叶联市尚未开放', '梨子喵似乎还有话想对你说。先完成与她的同行吧。') });
    return;
  }
  const { marketHomeFormat } = await import('./market');
  await message.send({ format: await marketHomeFormat(event.current.UserId) });
};
export const receiveGirlGratitudeGiftHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { const text = await receiveGirlGratitudeGift(event.current.UserId); await message.send({ format: story(5, text, Format.createButtonGroup().addRow().addButton('回应 梨子喵', '/少女谢意 继续', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) }); }
  catch (error) { await fail(message, '无法收下礼物', error); }
};
