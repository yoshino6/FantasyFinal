import { Format, ResultCode } from 'alemonjs';
import { attributeNames, gifts, type GiftCategory } from './constants';
import { attributes, type Allocation, type DerivedStats, type Growth } from './types';

const percent = (bp: number) => `${(bp / 100).toFixed(2)}%`;

type MessageSender = {
  send: (params?: any) => Promise<Array<{ code: number }>>;
};

export const sendWithTextFallback = async (message: MessageSender, format: Format, fallbackText: string) => {
  const results = await message.send({ format });
  if (results.some(result => result.code !== ResultCode.Ok)) {
    await message.send({ format: Format.create().addText(fallbackText) });
  }
};

export const messageFormat = (title: string, content: string) => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle(title).addText(content));

export const storyText = '你记得最后一刻：刺目的白光、失重感，以及一声带着歉意的轻笑。\n\n“抱歉，把你卷进来了。”\n女神坐在云端的柜台后，翻着一本写满涂改的名册。“不过这里是死后转生处，至少我能让你换个世界重新开始。”';

export const storyFormat = () => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('序章·转生窗口（1/3）').addText(storyText))
  .addButtonGroup(Format.createButtonGroup().addRow().addButton('继续', '/注册 继续', { type: 'command', autoEnter: true }));

export const audienceText = '女神将冒险者卡片推到你面前，却没有让你填写任何数字。\n\n“新身体的六维与成长会由世界法则随机固定；总属性为 80～120，成长总和为 8.0～12.0。数值不能重置，也不会在初期公开。”\n\n“先去活下来吧。等你在冒险者公会正式登记后，才有资格查看完整角色资料。”';

export const audienceFormat = () => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('序章·女神的说明（2/3）').addText(audienceText))
  .addButtonGroup(Format.createButtonGroup().addRow().addButton('接受命运', '/注册 继续', { type: 'command', autoEnter: true }));

export const giftText = (category: GiftCategory = 'artifact') => Object.entries(gifts)
  .filter(([, gift]) => gift.category === category)
  .map(([code, gift]) => `【${gift.name}】${gift.summary}\n/选择恩赐 ${code}`).join('\n\n');
export const giftFormat = (category: GiftCategory = 'artifact') => {
  const categoryName = category === 'artifact' ? '神器' : '神技';
  const markdown = Format.createMarkdown()
    .addTitle('序章·带走一份恩赐（3/3）')
    .addText(`女神说：“你可以带走一件神器，或一种神奇能力。慎重选择；选定后便会立刻传送。”\n\n当前分类：${categoryName}。点击蓝色名称，会将选择指令填入输入框。\n\n`);
  for (const [code, gift] of Object.entries(gifts).filter(([, gift]) => gift.category === category)) {
    markdown.addButton(`【${gift.name}】`, { data: `/选择恩赐 ${code}`, autoEnter: false }).addText(` ${gift.summary}\n\n`);
  }
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('神器', '/恩赐列表 神器', { type: 'command', autoEnter: true, style: category === 'artifact' ? 'blue' : undefined })
    .addButton('神奇能力', '/恩赐列表 能力', { type: 'command', autoEnter: true, style: category === 'ability' ? 'blue' : undefined }));
};

export const characterText = (allocation: Allocation, stats: DerivedStats, growth: Growth, region: string, x: number, y: number, z: number) =>
  `基础属性\n${attributes.map(key => `${attributeNames[key]} ${allocation[key]}`).join('｜')}\n成长：${attributes.map(key => `${attributeNames[key]} +${growth[key].toFixed(1)}`).join('｜')}\n\n战斗属性\n生命 ${stats.hpMax}｜魔力 ${stats.mpMax}\n物攻 ${stats.physicalAttack}｜魔攻 ${stats.magicAttack}\n物防 ${stats.physicalDefense}｜魔防 ${stats.magicDefense}\n命中 ${percent(stats.accuracy)}｜闪避 ${percent(stats.evasion)}｜暴击 ${percent(stats.critRateBp)}\n爆伤 ${percent(stats.critDamageBp)}｜爆免 ${percent(stats.critDamageReductionBp)}｜爆抗 ${percent(stats.critResistBp)}\n韧性 ${stats.tenacity}｜速度 ${stats.speed}\n\n当前位置\n${region} (${x}, ${y}, ${z})`;
