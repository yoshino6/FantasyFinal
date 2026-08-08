import { logger, useEvent, useMessage } from 'alemonjs';
import { getCharacter } from '../game/character.service';
import { characterText, messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const character = await getCharacter(event.current.UserId);
    await message.send({ format: character ? messageFormat(character.name, characterText(character, character, character.regionName, character.x, character.y, character.z)) : messageFormat('尚未注册', '发送“注册”开始异世界之旅。') });
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'load character failed');
    await message.send({ format: messageFormat('读取失败', '角色数据暂时无法读取，请稍后重试。') });
  }
};
