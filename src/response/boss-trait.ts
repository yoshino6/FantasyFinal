import { Format, useMessage } from 'alemonjs';

const traitDescriptions = [
  ['普通', '原始属性', '经验+0%，掉率+0%'],
  ['强大', '全属性+10%', '经验+20%，掉率+10%'],
  ['英雄', '全属性+20%', '经验+30%，掉率+20%'],
  ['深渊', '全属性+35%', '经验+50%，掉率+40%'],
  ['地狱', '全属性+50%', '经验+80%，掉率+60%'],
  ['猩红', '双攻、命中、暴击、暴伤+75%，其余属性+25%', '经验+100%，掉率+80%'],
  ['腐化', '双防、暴免、暴抗+100%，其余属性+25%', '经验+100%，掉率+80%'],
  ['神圣', '生命、闪避+150%，其余属性+25%', '经验+100%，掉率+80%'],
  ['黄金', '闪避+100%，其余属性+50%', '经验+150%，掉率+100%'],
  ['璀璨', '闪避+250%，其余属性+75%', '经验+250%，掉率+250%'],
  ['梦幻', '闪避+500%，其余属性+100%', '经验+600%，掉率+600%']
] as const;

export default async () => {
  const [message] = useMessage();
  const markdown = Format.createMarkdown().addTitle('BOSS词条说明').addNewline().addNewline()
    .addBlockquote('自然刷新且未进入战斗的公共地图 BOSS，每逢整点仍存活便会降低一级词条；梦幻、璀璨、黄金会随机降为猩红、腐化或神圣，之后依次降为地狱、深渊、英雄、强大、普通。剧情、导师、试炼与迷宫 BOSS 不受影响。').addNewline().addNewline();
  traitDescriptions.forEach(([name, attributes, rewards], index) => {
    markdown.addText(`【${name}】`).addNewline()
      .addBlockquote(attributes).addNewline()
      .addBlockquote(rewards);
    if (index < traitDescriptions.length - 1) markdown.addNewline().addNewline();
  });
  await message.send({ format: Format.create().addMarkdown(markdown) });
};
