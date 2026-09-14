import type { RowDataPacket } from 'mysql2/promise';
import type { OpeningConnection } from './opening-state';
import { openingHubs } from './opening-world.config';

// danger_level 是旧的区域序号；地图冒险带按常规魔物等级分级，区域 Boss 单独展示。
export const guildMapRisk = (maxLevel: number | null) =>
  maxLevel === null || !Number.isFinite(maxLevel) || maxLevel < 1 ? '待勘测' : maxLevel <= 30 ? '低危' : maxLevel <= 50 ? '中危' : '高危';

export const guildMapContributionPrice = (risk: string) =>
  risk === '安全区' || risk === '低危' ? 200 : risk === '中危' ? 1000 : risk === '高危' ? 10000 : null;

/** 所有分会共用已开放的普通地图目录；未持有的资料不等于已经解锁。 */
export const guildMapCatalog = async (connection: OpeningConnection) => {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT r.code AS region_code,r.name AS region_name,r.description,
    i.id,i.code,i.name,i.codex_id,
    MIN(CASE WHEN t.monster_class<>'boss' THEN t.level END) AS min_level,
    MAX(CASE WHEN t.monster_class<>'boss' THEN t.level END) AS max_level,
    MAX(CASE WHEN t.monster_class='boss' THEN t.level END) AS boss_level
    FROM map_regions r
    LEFT JOIN item_definitions i ON i.item_category='地图' AND JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.map'))=r.code
    LEFT JOIN map_monster_pools p ON p.region_id=r.id
    LEFT JOIN monster_templates t ON t.id=p.monster_template_id AND (p.spawn_weight>0 OR t.monster_class='boss')
    WHERE r.is_enabled=1 AND r.is_owner_only=0 AND i.id IS NOT NULL
    GROUP BY r.id,r.code,r.name,r.description,i.id,i.code,i.name,i.codex_id`);
  return rows.map(row => {
    const minLevel = row.min_level == null ? null : Number(row.min_level);
    const maxLevel = row.max_level == null ? null : Number(row.max_level);
    const bossLevel = row.boss_level == null ? null : Number(row.boss_level);
    const safeTown = Object.hasOwn(openingHubs, String(row.region_code));
    const risk = safeTown ? '安全区' : guildMapRisk(maxLevel);
    return {id: row.id == null ? null : Number(row.id), code: row.code == null ? null : String(row.code),
      name: String(row.name ?? row.region_name), regionCode: String(row.region_code), regionName: String(row.region_name),
      description: String(row.description), codexId: row.codex_id == null ? null : String(row.codex_id),
      minLevel, maxLevel, bossLevel, risk, safeTown, canExchange: safeTown || risk === '低危'};
  }).sort((a, b) => Number(a.safeTown) - Number(b.safeTown) || (a.maxLevel ?? 999) - (b.maxLevel ?? 999) || a.regionName.localeCompare(b.regionName, 'zh-CN'));
};

/** 独立额度行同时是已发放标记；旧角色首次打开公会服务时也能补领，重复登记不会重发。 */
export const ensureRegistrationMapExchange = async (connection: OpeningConnection, characterId: number) => {
  await connection.execute(`INSERT IGNORE INTO player_opening_services (character_id,code,uses)
    SELECT id,'registration_map_exchange',1 FROM characters WHERE id=? AND adventurer_registered=1`, [characterId]);
};
