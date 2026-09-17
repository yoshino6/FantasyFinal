import { advancedProfessionByCode } from './advanced-profession.config';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { grantInventory } from './inventory-binding';
import { openingHubs } from './opening-world.config';

export type MapProgress = {
  adventurer_registered: number; opening_state?: string | null; destination_code?: string | null;
  region_code: string; realm_stage: number; goblin_stage: number; advanced_trial: number; advanced_profession_code?: string | null;
};

/** 保底只覆盖入门与必经主线；其他地图仍使用登记额度或贡献点购买。 */
export const progressionMapRegions = (character: MapProgress) => {
  if (!character.adventurer_registered || character.opening_state && character.opening_state !== 'completed') return [];
  const regions = new Set(['world_tree', 'worldtree_meadow', 'dark_forest', 'baina_town']);
  for (const code of [character.region_code, character.destination_code]) if (code && Object.hasOwn(openingHubs, code)) regions.add(code);
  if (character.goblin_stage > 0 || character.realm_stage >= 3) regions.add('dark_forest_deep');
  if (character.advanced_trial && character.advanced_profession_code) {
    const profession = advancedProfessionByCode(character.advanced_profession_code);
    for (const code of profession?.route.maps ?? []) regions.add(code);
  }
  return [...regions];
};

/** 调用方使用事务；锁角色使登记、补领、任务发放与商店购买串行，仓库已有的地图不重发。 */
export const ensureMapRegions = async (connection: PoolConnection, characterId: number, regions: readonly string[]) => {
  const result = { granted: [] as string[], stored: [] as string[], unavailable: [] as string[] };
  if (!regions.length) return result;
  await connection.execute('SELECT id FROM characters WHERE id=? FOR UPDATE', [characterId]);
  for (const code of new Set(regions)) {
    const [items] = await connection.execute<RowDataPacket[]>(`SELECT i.id,i.name,r.is_enabled,r.is_owner_only FROM map_regions r
      LEFT JOIN item_definitions i ON i.item_category='地图' AND JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.map'))=r.code
      WHERE r.code=? ORDER BY i.id LIMIT 1`, [code]);
    const item = items[0];
    if (!item?.id || !item.is_enabled || item.is_owner_only) { result.unavailable.push(String(item?.name ?? code)); continue; }
    const [owned] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_inventory WHERE character_id=? AND item_id=? AND quantity>0`, [characterId, item.id]);
    if (owned.length) continue;
    const [stored] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_home_storage_items s JOIN player_homes h ON h.id=s.home_id
      WHERE h.character_id=? AND s.item_id=? AND s.quantity>0 LIMIT 1`, [characterId, item.id]);
    if (stored.length) { result.stored.push(String(item.name)); continue; }
    await grantInventory(connection, characterId, Number(item.id), { personal: 1, trade: 0, unbound: 0 });
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, item.id]);
    result.granted.push(String(item.name));
  }
  return result;
};

export const ensureProgressionMaps = async (connection: PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & MapProgress)[]>(`SELECT c.adventurer_registered,c.realm_stage,r.code AS region_code,
    o.state AS opening_state,o.destination_code,
    COALESCE((SELECT stage FROM player_goblin_king_quest WHERE character_id=c.id),0) AS goblin_stage,
    EXISTS(SELECT 1 FROM player_advanced_profession_quests WHERE character_id=c.id AND stage IN (1,2,3)) AS advanced_trial,
    (SELECT profession_code FROM player_advanced_profession_quests WHERE character_id=c.id AND stage IN (1,2,3) ORDER BY stage DESC,profession_code ASC LIMIT 1) AS advanced_profession_code
    FROM characters c JOIN map_regions r ON r.id=c.current_region_id LEFT JOIN player_opening_stories o ON o.character_id=c.id
    WHERE c.id=? FOR UPDATE`, [characterId]);
  return ensureMapRegions(connection, characterId, rows[0] ? progressionMapRegions(rows[0]) : []);
};

/** 主线页也能修复旧存档，避免必须先走到公会才能补领取回公会的地图。 */
export const repairProgressionMaps = async (user: string) => {
  const [rows] = await (await getPool()).execute<RowDataPacket[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND c.npc_id IS NULL LIMIT 1', [user]);
  if (rows[0]) return withTransaction(connection => ensureProgressionMaps(connection, Number(rows[0].id)));
  return { granted: [], stored: [], unavailable: [] };
};

export const progressionMapReceipt = (result: Awaited<ReturnType<typeof ensureMapRegions>>) => [
  result.granted.length ? `公会补齐了本阶段的通行地图：${result.granted.join('、')}。已放入背包，不消耗登记额度或贡献点。` : '本阶段可领取的通行地图已核对，已持有的不会重复发放。',
  result.stored.length ? `以下地图在家园仓库，请取回背包后使用前往：${result.stored.join('、')}。` : '',
  result.unavailable.length ? `以下地图资料尚未开放或未配置，暂不能发放：${result.unavailable.join('、')}。` : ''
].filter(Boolean).join('\n\n');
