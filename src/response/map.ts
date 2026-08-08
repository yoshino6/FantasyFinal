import { logger, useEvent, useMessage } from 'alemonjs';
import { getCharacter } from '../game/character.service';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const character = await getCharacter(event.current.UserId);
    await message.send({ format: character ? messageFormat('世界地图', `世界树\n坐标原点 (0, 0, 0)\n\n当前位置\n${character.regionName} (${character.x}, ${character.y}, ${character.z})\n\n移动功能将在下一阶段开放。`) : messageFormat('尚未注册', '请先发送“注册”创建角色。') });
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'load map failed');
    await message.send({ format: messageFormat('读取失败', '地图数据暂时无法读取，请稍后重试。') });
  }
};
