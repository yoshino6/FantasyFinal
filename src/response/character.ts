import { logger, useEvent, useMessage } from 'alemonjs';
import { getCharacter } from '../game/character.service';
import { characterText, messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const character = await getCharacter(event.current.UserId);
    const content = !character ? '发送“注册”开始异世界之旅。' : !character.adventurerRegistered
      ? `Lv.${character.level}｜经验 ${character.experience}\n\n你的属性仍被世界法则隐藏。达到 Lv.5 后发送 /冒险者登记，在公会完成登记即可查看完整资料。`
      : `Lv.${character.level}｜经验 ${character.experience}\n恩赐：${character.giftName ?? '无'}\n\n${characterText(character, character, character.growth, character.regionName, character.x, character.y, character.z)}`;
    await message.send({ format: messageFormat(character?.name ?? '尚未注册', content) });
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'load character failed');
    await message.send({ format: messageFormat('读取失败', '角色数据暂时无法读取，请稍后重试。') });
  }
};
