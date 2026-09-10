import type { RowDataPacket } from 'mysql2/promise';
import type { OpeningConnection } from './opening-state';
import { openingHubs, type OpeningHubCode } from './opening-world.config';

/** 公会保管的周边资料；不等同于玩家已经持有的地图。 */
export const guildMapRegions: Record<OpeningHubCode, readonly string[]> = {
  baina_town: ['dark_forest', 'dark_forest_deep', 'world_tree'],
  world_tree: ['worldtree_meadow', 'morningdew_riverbank', 'dark_forest', 'ridge_foothills', 'rediron_pass', 'mistalgae_marsh', 'baina_town'],
  floating_leaf_town: ['worldtree_meadow', 'morningdew_riverbank', 'world_tree'],
  snowlamp_hollow: ['frostcrown_plateau', 'rediron_pass', 'frost_dragon_inn'],
  frost_dragon_inn: ['frostcrown_plateau', 'rediron_pass', 'snowlamp_hollow'],
  sleepwhale_market: ['thundercliff', 'mistalgae_marsh', 'world_tree']
};

// danger_level 是旧的区域序号；资料按实际魔物等级（含区域 Boss）分级。
export const guildMapRisk = (maxLevel: number | null) =>
  maxLevel === null || !Number.isFinite(maxLevel) || maxLevel < 1 ? '待勘测' : maxLevel < 20 ? '低危' : maxLevel <= 50 ? '中危' : '高危';

export const guildMapCatalog = async (connection: OpeningConnection, hub: OpeningHubCode) => {
  const regions = guildMapRegions[hub];
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT r.code AS region_code,r.name AS region_name,r.description,
    i.id,i.code,i.name,i.codex_id,MIN(t.level) AS min_level,MAX(t.level) AS max_level
    FROM map_regions r
    LEFT JOIN item_definitions i ON i.item_category='地图' AND JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.map'))=r.code
    LEFT JOIN map_monster_pools p ON p.region_id=r.id
    LEFT JOIN monster_templates t ON t.id=p.monster_template_id AND (p.spawn_weight>0 OR t.monster_class='boss')
    WHERE r.code IN (${regions.map(() => '?').join(',')}) AND r.is_enabled=1 AND r.is_owner_only=0
    GROUP BY r.id,r.code,r.name,r.description,i.id,i.code,i.name,i.codex_id`, [...regions]);
  return rows.map(row => {
    const minLevel = row.min_level == null ? null : Number(row.min_level);
    const maxLevel = row.max_level == null ? null : Number(row.max_level);
    const safeTown = Object.hasOwn(openingHubs, String(row.region_code));
    const risk = safeTown ? '安全区' : guildMapRisk(maxLevel);
    return {id: row.id == null ? null : Number(row.id), code: row.code == null ? null : String(row.code),
      name: String(row.name ?? row.region_name), regionCode: String(row.region_code), regionName: String(row.region_name),
      description: String(row.description), codexId: row.codex_id == null ? null : String(row.codex_id),
      minLevel, maxLevel, risk, safeTown, canExchange: (safeTown || risk === '低危') && row.id != null};
  }).sort((a, b) => regions.indexOf(a.regionCode) - regions.indexOf(b.regionCode));
};
