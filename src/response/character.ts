import { Format, logger, useEvent, useMessage } from 'alemonjs';
import { getCharacter } from '../game/character.service';
import { characterText, messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const character = await getCharacter(event.current.UserId);
    const content = !character ? '发送“注册”开始异世界之旅。' : !character.adventurerRegistered
      ? '属性暂时隐藏'
      : `恩赐：${character.giftName ?? '无'}\n\n${characterText(character, character, character.growth, character.regionName, character.x, character.y, character.z)}`;
    if (!character) { await message.send({ format: messageFormat('尚未注册', content) }); return; }
    const gender = character.gender === '男' ? '♂' : character.gender === '女' ? '♀' : '?';
    const markdown = Format.createMarkdown().addTitle('角色信息').addText(`\n\n昵称：${character.name} `)
      .addButton('[改名]', { data: '/改名 ', autoEnter: false }).addText(` \n性别：${gender}`)
      .addButton('[改性]', { data: '/改性 ', autoEnter: false }).addText(`\n等级：Lv.${character.level}\n经验：${character.experience}/${character.level * 100}\n\n${content}`);
    await message.send({ format: Format.create().addMarkdown(markdown) });
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'load character failed');
    await message.send({ format: messageFormat('读取失败', '角色数据暂时无法读取，请稍后重试。') });
  }
};
