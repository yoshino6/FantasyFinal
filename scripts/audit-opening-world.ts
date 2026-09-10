import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createConnection, type RowDataPacket } from 'mysql2/promise';
import { openingHubs, openingSpawnRegions } from '../src/game/opening-world.config';
import { pointBelongsToRegion } from '../src/game/world-site-geometry';

// 直接读取部署库的地图配置；不使用会触发初始化的游戏连接池。
const { parse } = createRequire(import.meta.url)('yaml');
const config = parse(readFileSync('alemon.config.yaml', 'utf8'));
const db = config.FantasyFinal?.database ?? config.mysql;
const connection = await createConnection({ host: db.host, port: Number(db.port ?? 3306), user: db.user, password: db.password, database: db.database, charset: 'utf8mb4', connectTimeout: 8000 });
try {
  const [tables] = await connection.query<RowDataPacket[]>('SHOW TABLES');
  const names = new Set(tables.map(row => String(Object.values(row)[0])));
  const [regions] = await connection.query<RowDataPacket[]>('SELECT * FROM map_regions');
  const [areas] = await connection.query<any[]>('SELECT a.*,r.danger_level FROM map_region_areas a JOIN map_regions r ON r.id=a.region_id');
  const codes = Object.values(openingHubs).map(hub => hub.guild);
  const [npcs] = await connection.execute<RowDataPacket[]>(`SELECT code,region_id,pos_x,pos_y,pos_z,interaction_kind FROM map_npcs WHERE code IN (${codes.map(() => '?').join(',')})`, codes);
  const [items] = await connection.query<RowDataPacket[]>("SELECT code FROM item_definitions WHERE code LIKE 'map_%' OR code IN ('healing_herb','opening_last_ration','opening_staff','opening_clothes','opening_golden_chest','adventurer_card')");
  const itemCodes = new Set(items.map(row => String(row.code)));
  const hubs = Object.entries(openingHubs).map(([code, hub]) => {
    const region = regions.find(row => row.code === code);
    const npc = npcs.find(row => row.code === hub.guild && row.region_id === region?.id);
    return { code, enabled: Boolean(region?.is_enabled), public: region?.is_owner_only === 0, danger: region?.danger_level, spawnEnabled: region?.is_spawn_enabled,
      guild: npc ?? null, validPoint: Boolean(npc && pointBelongsToRegion(areas, Number(region!.id), { x: Number(npc.pos_x), y: Number(npc.pos_y), z: Number(npc.pos_z) })), mapItem: itemCodes.has(`map_${code}`) };
  });
  const births = Object.entries(openingSpawnRegions).map(([code, rule]) => {
    const region = regions.find(row => row.code === code);
    return { code, name: region?.name, tier: rule.tier, enabled: Boolean(region?.is_enabled), public: region?.is_owner_only === 0, newbie: region?.newbie_spawn_enabled ?? null, danger: region?.danger_level, areas: areas.filter(a => a.region_id === region?.id).length };
  });
  const report = { checkedAt: new Date().toISOString(), births, hubs,
    missingTables: ['opening_world','player_opening_stories','player_opening_actions','player_opening_services','player_opening_visits','player_opening_keepsakes','player_companions','opening_chest_requests'].filter(name => !names.has(name)),
    missingBaseItems: ['healing_herb','opening_last_ration','opening_staff','opening_clothes','opening_golden_chest','adventurer_card'].filter(code => !itemCodes.has(code)) };
  mkdirSync('.data/opening-audit-20260908', { recursive: true });
  writeFileSync('.data/opening-audit-20260908/world.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await connection.end(); }
