import { Format, useEvent, useMessage } from 'alemonjs';
import { contemplateSkyDust } from '../game/main-quest.service';
import { messageFormat } from '../game/message';

export const contemplateSkyDustHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const result = await contemplateSkyDust(event.current.UserId);
    const markdown = Format.createMarkdown().addTitle('窥探世间').addNewline().addNewline()
      .addText('◈传闻道，这种尘埃源自大陆的创始，蕴含着天地的大道。\n◈你仔细窥察着它的纹络，心醉神迷，恍惚间被眼前之景所吞噬。\n◈周围的混沌片刻融化，你仿若魂游身外，此刻正翱翔于天际，妄图挣脱大陆的束缚。\n◈飘飘乎如遗世独立，羽化而登仙，不外如是。\n◈天空影映着你的身影，你向上却触手难及。\n◈无边无际的天空尽处，你察觉到一丝隐晦的目光，正在向你窥探。。。\n◈你心神一动，一种奇妙的感悟油然而生。。。').addNewline().addNewline()
      .addText('————————————————').addNewline().addNewline()
      .addText('◈回过神时，你又回到了刚刚的地方。\n◈源源不断的精纯能量正汇入你的四肢百骸，你感到体内有什么正在被打破。').addNewline()
      .addText(`【${result.name}】已突破灵阶枷锁`).addNewline().addNewline()
      .addText('————————————').addNewline().addNewline()
      .addText(`【${result.name}】等级上限提升！\n【初心➡窥尘】`);
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('角色', '/角色', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('无法窥探', error instanceof Error ? error.message : '请稍后重试。') }); }
};
