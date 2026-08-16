import { Format, logger, useEvent, useMessage } from 'alemonjs';
import { getCharacter } from '../game/character.service';
import { inventory } from '../game/adventure.service';
import { getPool } from '../database/pool';
import { messageFormat } from '../game/message';
import type { RowDataPacket } from 'mysql2/promise';

type OwnedMap = RowDataPacket & { code: string; name: string; description: string; region_code: string | null; region_name: string | null };
type MapTarget = RowDataPacket & { code: string; name: string; x: number; y: number; target_order: number };

const displayName = (map: OwnedMap) => map.code === 'map_baina_town' ? '百纳镇' : map.name;
const estimateSeconds = (x: number, y: number, target: MapTarget, speed: number) => Math.max(1, Math.ceil((Math.abs(target.x - x) + Math.abs(target.y - y)) / speed));

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const character = await getCharacter(event.current.UserId);
    if (!character) {
      await message.send({ format: messageFormat('尚未注册', '请先发送“注册”创建角色。') });
      return;
    }
    const pool = await getPool();
    const [maps] = await pool.execute<OwnedMap[]>(`SELECT i.code,i.name,i.description,
        JSON_UNQUOTE(JSON_EXTRACT(i.effect_json, '$.map')) AS region_code,r.name AS region_name
      FROM player_inventory pi
      JOIN item_definitions i ON i.id=pi.item_id
      LEFT JOIN map_regions r ON r.code=JSON_UNQUOTE(JSON_EXTRACT(i.effect_json, '$.map'))
      JOIN characters c ON c.id=pi.character_id
      JOIN players p ON p.id=c.player_id
      WHERE p.qq_user_id=? AND pi.quantity>0 AND i.item_category='地图'
      ORDER BY i.id`, [event.current.UserId]);
    if (!maps.length) {
      await message.send({ format: messageFormat('世界地图', '迷雾遮蔽了四方。\n\n获得对应地区的地图后，才能查看该地图的地标并进行远距离前往。') });
      return;
    }

    const bag = await inventory(event.current.UserId);
    const x = Number(character.x); const y = Number(character.y);
    const markdown = Format.createMarkdown().addTitle('世界地图').addNewline().addNewline();
    for (const map of maps) {
      markdown.addText(`【${displayName(map)}】`).addButton('[前往]', { data: `/前往地图 ${map.code}`, autoEnter: false }).addNewline();
      if (!map.region_code) {
        markdown.addText('> ').addButton(map.description, { data: '/面板', autoEnter: false }).addNewline().addNewline();
        continue;
      }
      const [targets] = await pool.execute<MapTarget[]>(`SELECT code,name,pos_x AS x,pos_y AS y,
          CASE code WHEN 'guild_counter' THEN 1 WHEN 'pear_guide' THEN 2 WHEN 'blacksmith' THEN 3 ELSE 99 END AS target_order
        FROM map_npcs WHERE region_id=(SELECT id FROM map_regions WHERE code=?)
        UNION ALL
        SELECT code,name,pos_x AS x,pos_y AS y,100 AS target_order
        FROM map_special_objects WHERE region_id=(SELECT id FROM map_regions WHERE code=?)
        ORDER BY target_order,name`, [map.region_code, map.region_code]);
      if (!targets.length) {
        markdown.addText('> ').addButton(map.description, { data: '/面板', autoEnter: false }).addNewline().addNewline();
        continue;
      }
      for (const target of targets) {
        const seconds = estimateSeconds(x, y, target, bag.movementSpeed);
        markdown.addText('> ').addButton(target.name, { data: `/前往 ${target.x} ${target.y}`, autoEnter: false }).addText(`（${target.x}, ${target.y}）[预计${seconds}s]`).addNewline();
      }
      markdown.addNewline();
    }
    await message.send({ format: Format.create().addMarkdown(markdown) });
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'load map failed');
    await message.send({ format: messageFormat('读取失败', '地图数据暂时无法读取，请稍后重试。') });
  }
};
