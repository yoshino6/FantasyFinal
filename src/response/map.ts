import { Format, logger, useEvent, useMessage } from 'alemonjs';
import { getCharacter } from '../game/character.service';
import { inventory } from '../game/adventure.service';
import { getPool } from '../database/pool';
import { messageFormat } from '../game/message';
import type { RowDataPacket } from 'mysql2/promise';
import { markedDungeonEntrances } from '../game/dungeon-quest.service';
import { durationText } from '../game/time-format';

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
          CASE code WHEN 'guild_counter' THEN 1 WHEN 'pear_guide' THEN 2 WHEN 'blacksmith' THEN 3 WHEN 'alchemy_sweetshop' THEN 4 WHEN 'oddworkshop' THEN 5 WHEN 'bookshop' THEN 6 WHEN 'baina_residence' THEN 7 WHEN 'hunter_lodge' THEN 8 ELSE 99 END AS target_order
        FROM map_npcs WHERE region_id=(SELECT id FROM map_regions WHERE code=?)
        UNION ALL
        SELECT code,name,pos_x AS x,pos_y AS y,100 AS target_order
        FROM map_special_objects WHERE region_id=(SELECT id FROM map_regions WHERE code=?)
        ORDER BY target_order,name`, [map.region_code, map.region_code]);
      if (map.region_code === 'baina_town') {
        const [homes] = await pool.execute<(RowDataPacket & MapTarget)[]>(`SELECT 'player_home' AS code,CONCAT('我的小屋·',h.house_level,'级') AS name,h.plot_x AS x,h.plot_y AS y,8 AS target_order
          FROM player_homes h JOIN characters c ON c.id=h.character_id JOIN players p ON p.id=c.player_id
          WHERE p.qq_user_id=? AND h.status='active' LIMIT 1`, [event.current.UserId]);
        targets.push(...homes);
        targets.sort((left, right) => Number(left.target_order) - Number(right.target_order) || left.name.localeCompare(right.name, 'zh-CN'));
      }
      if (!targets.length && map.region_code !== 'dark_forest') {
        markdown.addText('> ').addButton(map.description, { data: '/面板', autoEnter: false }).addNewline().addNewline();
        continue;
      }
      for (const target of targets) {
        const seconds = estimateSeconds(x, y, target, bag.movementSpeed);
        markdown.addText('> ').addButton(target.name, { data: `/前往 ${target.x} ${target.y}`, autoEnter: false }).addText(`（${target.x}, ${target.y}）[预计${durationText(seconds)}]`).addNewline();
      }
      const entrances = await markedDungeonEntrances(event.current.UserId, map.region_code);
      for (const entrance of entrances) {
        const seconds = Math.max(1, Math.ceil((Math.abs(entrance.x - x) + Math.abs(entrance.y - y)) / bag.movementSpeed));
        markdown.addText('> ').addButton(entrance.name, { data: `/前往 ${entrance.x} ${entrance.y}`, autoEnter: false }).addText(`（${entrance.x}, ${entrance.y}）[预计${durationText(seconds)}]`).addNewline();
      }
      markdown.addNewline();
    }
    await message.send({ format: Format.create().addMarkdown(markdown) });
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'load map failed');
    await message.send({ format: messageFormat('读取失败', '地图数据暂时无法读取，请稍后重试。') });
  }
};
