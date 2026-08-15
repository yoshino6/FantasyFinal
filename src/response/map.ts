import { logger, useEvent, useMessage } from 'alemonjs';
import { getCharacter } from '../game/character.service';
import { getPool } from '../database/pool';
import { messageFormat } from '../game/message';
import type { RowDataPacket } from 'mysql2/promise';

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const character = await getCharacter(event.current.UserId);
    let content = '请先发送“注册”创建角色。';
    if (character) {
      const pool = await getPool();
      const [maps] = await pool.execute<(RowDataPacket & { name: string; description: string })[]>(`SELECT i.name,i.description FROM characters c
        JOIN players p ON p.id=c.player_id JOIN player_inventory pi ON pi.character_id=c.id
        JOIN item_definitions i ON i.id=pi.item_id
        WHERE p.qq_user_id=? AND pi.quantity>0 AND i.item_category='地图' ORDER BY i.id`, [event.current.UserId]);
      content = maps.length
        ? `已持有地图\n${maps.map(map => `【${map.name}】\n${map.description}`).join('\n\n')}\n\n当前位置\n${character.regionName} (${character.x}, ${character.y}, ${character.z})`
        : '迷雾遮蔽了四方。\n\n脚下的地面：未知之地\n\n获得对应地区的地图后，才能查看该地图的地标并进行远距离前往。';
    }
    await message.send({ format: messageFormat(character ? '世界地图' : '尚未注册', content) });
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'load map failed');
    await message.send({ format: messageFormat('读取失败', '地图数据暂时无法读取，请稍后重试。') });
  }
};
