import { Format, ResultCode } from 'alemonjs';
import { attributeNames, gifts, type GiftCategory } from './constants';
import { attributes, type Allocation, type DerivedStats, type Growth } from './types';

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

export const storyText = '\n\n最后的记忆像被雨水浸透的旧照片。\n刺耳的声响、骤然逼近的黑暗，以及胸口最后一次无力的起伏。你想伸手抓住什么，指尖却先失去了温度。\n\n世界终于安静下来。';

export const storyFormat = () => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('序章·最后一幕（1/6）').addText(storyText))
  .addButtonGroup(Format.createButtonGroup().addRow().addButton('继续', '/注册 继续', { type: 'command', autoEnter: true }));

export const audienceText = '\n\n再次睁开眼时，你正站在一片没有尽头的幽暗空间。\n远处只有一张座椅，一名蓝发少女端坐其上，头顶流转着柔和的神辉。\n她似乎正在等你开口。';

export const audienceFormat = () => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('序章·神界苏醒（2/6）').addText(audienceText))
  .addButtonGroup(Format.createButtonGroup().addRow().addButton('这里是哪里？', '/询问 这里是哪里', { type: 'command', autoEnter: true, style: 'blue' }));

export const questionText = '\n\n“这里是哪里？”\n女神合上手中的册子，平静地回答：“死后的中转站。你在原先的世界已经死亡。”\n她的声音没有怜悯，也没有恶意，只是在陈述一件早已写好的事实。\n“吾名阿库娅，是负责接引这一片地区亡者的女神。”';
export const questionFormat = () => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('序章·女神的回答（3/6）').addText(questionText))
  .addButtonGroup(Format.createButtonGroup().addRow().addButton('我接下来要去哪里？', '/注册 继续', { type: 'command', autoEnter: true }));

export const destinationText = '\n\n女神轻轻颔首：“你可以选择去天堂，在宁静中度过没有烦恼的老年生活；也可以转生到异世界，获得一次全新的开始。”\n“不过，异世界从来不温柔。魔物、灾祸与未知会在你踏上土地的那刻迎面而来。”\n\n她看着你，等待你的决定。';
export const destinationFormat = () => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('序章·命运的岔路（4/6）').addText(destinationText))
  .addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('前往天堂', '/选择去向 天堂', { type: 'command', autoEnter: true })
    .addButton('转生异世界', '/选择去向 异世界', { type: 'command', autoEnter: true, style: 'blue' }));

export const heavenText = '\n\n女神右手一挥，一扇散发暖光的门在你身后浮现。\n门后没有战斗，也没有遗憾，只有安静而漫长的时光。\n但在踏入之前，你仍可以回头，选择那条未知的异世界之路。';
export const heavenFormat = () => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('天堂的门扉').addText(heavenText))
  .addButtonGroup(Format.createButtonGroup().addRow().addButton('还是转生异世界', '/选择去向 异世界', { type: 'command', autoEnter: true, style: 'blue' }));

export const dangerText = '\n\n女神的神情认真起来：“异世界的魔物会猎杀弱者，迷宫与荒野埋葬过无数冒险者。即使拥有天赋，也不能保证你活过第一天。”\n“因此，在出发前，我允许你从神器或神技中带走一份恩赐。它会成为你在陌生世界的第一张底牌。”';
export const dangerFormat = () => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('序章·异界的危险（5/6）').addText(dangerText))
  .addButtonGroup(Format.createButtonGroup().addRow().addButton('接受恩赐', '/注册 继续', { type: 'command', autoEnter: true, style: 'blue' }));

export const giftText = (category: GiftCategory = 'artifact') => Object.entries(gifts)
  .filter(([, gift]) => gift.category === category)
  .map(([code, gift]) => `【${gift.name}】${gift.summary}\n/选择恩赐 ${code}`).join('\n\n');
export const giftFormat = (category: GiftCategory = 'artifact') => {
  const categoryName = category === 'artifact' ? '神器' : '神技';
  const markdown = Format.createMarkdown()
    .addTitle('序章·选择恩赐（6/6）')
    .addText(`\n\n女神说：“你可以带走一件神器，或一种神技。\n请慎重选择。”\n当前分类：${categoryName}。点击蓝色名称来选择。\n\n`);
  for (const [code, gift] of Object.entries(gifts).filter(([, gift]) => gift.category === category)) {
    markdown.addButton(`【${gift.name}】`, { data: `/选择恩赐 ${code}`, autoEnter: false }).addText(` ${gift.summary}\n\n`);
  }
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('神器', '/恩赐列表 神器', { type: 'command', autoEnter: true, style: category === 'artifact' ? 'blue' : undefined })
    .addButton('神技', '/恩赐列表 能力', { type: 'command', autoEnter: true, style: category === 'ability' ? 'blue' : undefined }));
};

export const characterText = (allocation: Allocation, stats: DerivedStats, growth: Growth, region: string, x: number, y: number, z: number) =>
  `基础属性\n${attributes.map(key => `${attributeNames[key]} ${allocation[key]}`).join('｜')}\n成长：${attributes.map(key => `${attributeNames[key]} +${growth[key].toFixed(1)}`).join('｜')}\n\n战斗属性\n生命 ${Math.round(stats.hpMax)}｜魔力 ${Math.round(stats.mpMax)}\n物攻 ${Math.round(stats.physicalAttack)}｜魔攻 ${Math.round(stats.magicAttack)}\n物防 ${Math.round(stats.physicalDefense)}｜魔防 ${Math.round(stats.magicDefense)}\n命中 ${Math.round(stats.accuracy)}｜闪避 ${Math.round(stats.evasion)}｜暴击 ${Math.round(stats.critRateBp)}\n爆伤 ${Math.round(stats.critDamageBp)}｜爆免 ${Math.round(stats.critDamageReductionBp)}｜爆抗 ${Math.round(stats.critResistBp)}\n韧性 ${Math.round(stats.tenacity)}｜速度 ${Math.round(stats.speed)}\n\n当前位置\n${region} (${x}, ${y}, ${z})`;
