import { Format, logger, useEvent, useMessage } from 'alemonjs';
import { getCharacter } from '../game/character.service';
import { characterText, messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const character = await getCharacter(event.current.UserId);
    const content = !character ? '发送“注册”开始异世界之旅。' : !character.adventurerRegistered
      ? '你的属性仍被世界法则隐藏。达到 Lv.5 后发送 /冒险者登记，在公会完成登记即可查看完整资料。'
      : `恩赐：${character.giftName ?? '无'}\n\n${characterText(character, character, character.growth, character.regionName, character.x, character.y, character.z)}`;
    if (!character) { await message.send({ format: messageFormat('尚未注册', content) }); return; }
    const gender = character.gender === '男' ? '男♂' : character.gender === '女' ? '女♀' : '未设定♀♂';
    const markdown = Format.createMarkdown().addTitle('角色信息').addText(`${character.name} `)
      .addButton('[改名]', { data: '/改名 ', autoEnter: false }).addText(` ${gender}`)
      .addButton('[改性]', { data: '/改性 ', autoEnter: false }).addText(`\nLv.${character.level}｜经验 ${character.experience}\n\n${content}`);
    await message.send({ format: Format.create().addMarkdown(markdown) });
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'load character failed');
    await message.send({ format: messageFormat('读取失败', '角色数据暂时无法读取，请稍后重试。') });
  }
};
