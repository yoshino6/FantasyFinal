import { useEvent, useRoute, Format, logger } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { getCharacter } from '../game/character.service.js';
import { inventory } from '../game/adventure.service.js';
import { getPool } from '../database/pool.js';
import { messageFormat } from '../game/message.js';
import { durationText } from '../game/time-format.js';
import { sortMapMarkers, markerName } from '../game/map-marker.service.js';
import { mapRegionDescriptions } from '../game/map-description.config.js';

const displayName = (map) => (map.region_name ?? map.name).replace(/^地图[·・：:\s]*/, '');
const overviewFor = (map) => mapRegionDescriptions[map.region_code ?? ''] ?? map.region_description ?? map.description;
const mapNavigationOrder = ['world_tree', 'worldtree_meadow', 'morningdew_riverbank', 'gravelwind_shore', 'baina_town', 'dark_forest', 'dark_forest_deep', 'ridge_foothills', 'rediron_pass', 'mistalgae_marsh', 'fallenstar_swamp', 'frostcrown_plateau', 'thundercliff', 'eclipse_ruins'];
const compareByDanger = (left, right) => {
    const leftOrder = mapNavigationOrder.indexOf(left.region_code ?? '');
    const rightOrder = mapNavigationOrder.indexOf(right.region_code ?? '');
    if (leftOrder >= 0 || rightOrder >= 0)
        return (leftOrder >= 0 ? leftOrder : Number.MAX_SAFE_INTEGER) - (rightOrder >= 0 ? rightOrder : Number.MAX_SAFE_INTEGER);
    return Number(left.region_danger ?? Number.MAX_SAFE_INTEGER) - Number(right.region_danger ?? Number.MAX_SAFE_INTEGER)
        || displayName(left).localeCompare(displayName(right), 'zh-Hans-CN')
        || left.code.localeCompare(right.code);
};
const estimateSeconds = (x, y, target, speed) => Math.max(1, Math.ceil((Math.abs(target.x - x) + Math.abs(target.y - y)) / speed));
var map = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const character = await getCharacter(event.current.UserId);
        if (!character) {
            await message.send({ format: messageFormat('尚未注册', '请先发送“注册”创建角色。') });
            return;
        }
        const pool = await getPool();
        const [evolutionRows] = await pool.execute(`SELECT 1 FROM player_evolution_profiles ep
      JOIN characters c ON c.id=ep.character_id
      JOIN players p ON p.id=c.player_id
      JOIN player_main_quest_progress q ON q.character_id=c.id AND q.quest_code='evolution_barrier' AND q.stage>=8
      WHERE p.qq_user_id=? LIMIT 1`, [event.current.UserId]);
        const evolutionLabUnlocked = Boolean(evolutionRows[0]);
        const [managerRows] = await pool.execute('SELECT 1 FROM game_permissions WHERE qq_user_id=? AND role IN (\'owner\',\'admin\') LIMIT 1', [event.current.UserId]);
        const manager = Boolean(managerRows[0]);
        const [maps] = await pool.execute(`SELECT i.code,i.name,i.description,
        JSON_UNQUOTE(JSON_EXTRACT(i.effect_json, '$.map')) AS region_code,r.name AS region_name,r.description AS region_description,r.danger_level AS region_danger,(r.id=c.current_region_id) AS is_current_region
      FROM player_inventory pi
      JOIN item_definitions i ON i.id=pi.item_id
      LEFT JOIN map_regions r ON r.code=JSON_UNQUOTE(JSON_EXTRACT(i.effect_json, '$.map'))
      JOIN characters c ON c.id=pi.character_id
      JOIN players p ON p.id=c.player_id
      WHERE p.qq_user_id=? AND pi.quantity>0 AND i.item_category='地图'
        AND (r.id IS NULL OR r.is_owner_only=0 OR ?=1)
      ORDER BY i.id`, [event.current.UserId, manager ? 1 : 0]);
        if (!maps.length) {
            await message.send({ format: messageFormat('世界地图', '迷雾遮蔽了四方。\n\n获得对应地区的地图后，才能查看该地图的地标并进行远距离前往。') });
            return;
        }
        const defaultMap = maps.find(map => Number(map.is_current_region) === 1)
            ?? maps.find(map => map.region_code === 'world_tree')
            ?? maps.find(map => map.region_code === 'dark_forest')
            ?? [...maps].sort(compareByDanger)[0];
        const orderedMaps = [...maps].sort(compareByDanger);
        const requestedCode = String(route.param('code') ?? '').trim();
        const selectedMap = orderedMaps.find(map => map.code === requestedCode) ?? defaultMap;
        const bag = await inventory(event.current.UserId);
        const x = Number(character.x);
        const y = Number(character.y);
        const markdown = Format.createMarkdown().addTitle('世界地图').addNewline().addNewline();
        for (let index = 0; index < orderedMaps.length; index += 2) {
            markdown.addText('> ').addButton(`[${displayName(orderedMaps[index])}]`, { data: `/地图区域 ${orderedMaps[index].code}`, autoEnter: false });
            const next = orderedMaps[index + 1];
            if (next)
                markdown.addText(' ').addButton(`[${displayName(next)}]`, { data: `/地图区域 ${next.code}`, autoEnter: false });
            markdown.addNewline();
        }
        markdown.addNewline();
        markdown.addTitle(displayName(selectedMap)).addNewline().addNewline();
        markdown.addBlockquote(overviewFor(selectedMap)).addNewline().addNewline();
        markdown.addButton('[前往该区域]', { data: `/前往地图 ${selectedMap.code}`, autoEnter: false }).addNewline().addNewline();
        if (selectedMap.region_code) {
            const [targets] = await pool.execute(`SELECT n.code,n.name,n.pos_x AS x,n.pos_y AS y,n.pos_z AS z,s.site_type AS siteType
        FROM map_npcs n LEFT JOIN world_site_states s ON s.code=n.code AND s.region_id=n.region_id
        WHERE n.region_id=(SELECT id FROM map_regions WHERE code=?) AND n.interaction_kind='building'
        `, [selectedMap.region_code]);
            if (selectedMap.region_code === 'baina_town') {
                const [homes] = await pool.execute(`SELECT 'player_home' AS code,CONCAT('我的小屋·',h.house_level,'级') AS name,h.plot_x AS x,h.plot_y AS y,h.plot_z AS z
          FROM player_homes h JOIN characters c ON c.id=h.character_id JOIN players p ON p.id=c.player_id
          WHERE p.qq_user_id=? AND h.status='active' LIMIT 1`, [event.current.UserId]);
                targets.push(...homes);
            }
            const visibleTargets = sortMapMarkers(targets.filter(target => evolutionLabUnlocked || target.code !== 'evolution_lab'));
            if (visibleTargets.length) {
                markdown.addText('建筑站点').addNewline();
                for (const target of visibleTargets) {
                    const seconds = estimateSeconds(x, y, target, bag.movementSpeed);
                    markdown.addText('> ').addButton(markerName(target), { data: `/前往 ${target.x} ${target.y} ${target.z}`, autoEnter: false }).addText(`（${target.x}, ${target.y}, ${target.z}）[预计${durationText(seconds)}]`).addNewline();
                }
            }
            else {
                markdown.addBlockquote('这片区域暂未发现可直接前往的建筑站点。');
            }
        }
        await message.send({ format: Format.create().addMarkdown(markdown) });
    }
    catch (error) {
        logger.error({ err: error, userId: event.current.UserId }, 'load map failed');
        await message.send({ format: messageFormat('读取失败', '地图数据暂时无法读取，请稍后重试。') });
    }
};

export { map as default };
