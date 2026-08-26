import { Format, useEvent, useMessage } from 'alemonjs';
import { claimChurchBlessing } from '../game/blessing.service';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const result = await claimChurchBlessing(event.current.UserId);
    const text = result.isOath
      ? `你在祈福台前合起双手，彩窗里的光落在掌心。\n\n修女伊芙琳为你整理好一束花：“愿这份心意，沿着你们共同走过的路抵达远方。”\n${result.fruit ? '一枚共鸣果实从花束间滚落，像是被星光悄悄选中。\n\n' : ''}获得：心意花束 ×1${result.fruit ? '、共鸣果实 ×1' : ''}`
      : '你在祈福台前合起双手，听见烛火与风铃一同回应。温和的光流过身体，像为今日的旅途添上一层安静的护持。';
    const markdown = Format.createMarkdown().addTitle('圣恩教堂·祈福').addNewline().addNewline().addBlockquote(text).addNewline().addNewline().addText('祈福效果：经验获取 +25%｜全六项核心属性 +5%｜持续 1 小时');
    const buttons = Format.createButtonGroup().addRow().addButton('好友', '/好友', { type: 'command', autoEnter: true }).addButton('星誓', '/星誓', { type: 'command', autoEnter: true }).addRow().addButton('返回教堂', '/教堂', { type: 'command', autoEnter: true });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
  } catch (error) { await message.send({ format: messageFormat('祈福未完成', error instanceof Error ? error.message : '请稍后重试。') }); }
};

