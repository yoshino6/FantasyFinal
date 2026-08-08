import { Format, logger, useEvent, useMessage } from 'alemonjs';
import { getCharacter } from '../game/character.service';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const character = await getCharacter(event.current.UserId);
    await message.send({ format: Format.create().addText(character ? `【世界地图】\n世界树：坐标原点 (0, 0, 0)\n你当前位于：${character.regionName} (${character.x}, ${character.y}, ${character.z})\n\n移动功能将在下一阶段开放。` : '请先发送“注册”创建角色。') });
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'load map failed');
    await message.send({ format: Format.create().addText('地图数据暂时无法读取，请稍后重试。') });
  }
};
