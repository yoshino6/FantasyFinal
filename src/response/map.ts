import { logger, useEvent, useMessage } from 'alemonjs';
import { getCharacter } from '../game/character.service';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const character = await getCharacter(event.current.UserId);
    const content = !character ? '请先发送“注册”创建角色。' : !character.adventurerRegistered
      ? '迷雾遮蔽了四方。\n\n脚下的地面：未知之地\n\n完成冒险者公会登记后，地图与坐标才会逐步解锁。'
      : `已解锁区域\n世界树：世界的中心，约 20×20 格。\n幽暗密林：世界树正下方，约 100×100 格。\n\n当前位置\n${character.regionName} (${character.x}, ${character.y}, ${character.z})`;
    await message.send({ format: messageFormat(character ? '世界地图' : '尚未注册', content) });
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'load map failed');
    await message.send({ format: messageFormat('读取失败', '地图数据暂时无法读取，请稍后重试。') });
  }
};
