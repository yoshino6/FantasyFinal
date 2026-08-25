import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { BAINA_GUILD_POSITION, BAINA_RESIDENCE_CODE, homeCosts, homePlotDistance, slotsPerFloor } from './home.constants';
import { findFurniturePlacement, occupyFurnitureCells } from './home-layout.service';

type Db = Pool | PoolConnection;
type Character = RowDataPacket & { id: number; player_id: number; name: string; copper_coins: number; current_region_id: number; pos_x: number; pos_y: number; pos_z: number; activity_status: string; region_code: string };
type Home = RowDataPacket & { id: number; character_id: number; town_region_id: number; plot_x: number; plot_y: number; plot_z: number; house_level: number; floor_count: number; status: string };
type Furniture = RowDataPacket & { id: number; furniture_code: string; name: string; description: string; effect_json: unknown; floor_no: number; slot_key: string; grid_x: number | null; grid_y: number | null; grid_width: number; grid_height: number };
type FurnitureDefinition = RowDataPacket & { code: string; name: string; description: string; effect_json: unknown; required_house_level: number; max_per_floor: number; floor_slot_cost: number; grid_width: number; grid_height: number; placement_rule: 'wall' | 'center' | 'corner' | 'wall_or_center'; layer_order: number };

const characterFor = async (connection: Db, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<Character[]>(`SELECT c.id,c.player_id,c.name,c.copper_coins,c.current_region_id,c.pos_x,c.pos_y,c.pos_z,c.activity_status,r.code AS region_code
    FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id
    WHERE p.qq_user_id=? AND c.npc_code IS NULL LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  return rows[0];
};
const homeFor = async (connection: Db, characterId: number, lock = false) => {
  const [rows] = await connection.execute<Home[]>(`SELECT * FROM player_homes WHERE character_id=? AND status='active' LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [characterId]);
  return rows[0];
};
const json = (value: unknown) => {
  if (value && typeof value === 'object') return value as Record<string, number>;
  try { return JSON.parse(String(value ?? '{}')) as Record<string, number>; } catch { return {}; }
};
const assertAtResidence = async (connection: Db, character: Character) => {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM map_npcs WHERE code=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1`, [BAINA_RESIDENCE_CODE, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (!rows[0]) throw new Error('请先前往百纳镇的百纳居。');
};
const assertFree = async (connection: Db, character: Character, allowResting = false) => {
  if (character.activity_status === 'detained') throw new Error('你正在被守卫关押。');
  if (character.activity_status === 'unconscious') throw new Error('你已昏迷，暂时无法进入家园。');
  if (!allowResting && character.activity_status === 'resting') throw new Error('请先结束休息。');
  const [[travel], [mining], [combat], [pvp], [party]] = await Promise.all([
    connection.execute<RowDataPacket[]>('SELECT 1 FROM player_travels WHERE character_id=? LIMIT 1', [character.id]),
    connection.execute<RowDataPacket[]>('SELECT 1 FROM player_resource_mining WHERE character_id=? LIMIT 1', [character.id]),
    connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_sessions cs LEFT JOIN combat_members cm ON cm.session_id=cs.id WHERE cs.state='active' AND (cs.character_id=? OR cm.character_id=?) LIMIT 1`, [character.id, character.id]),
    connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?) LIMIT 1`, [character.id, character.id]),
    connection.execute<RowDataPacket[]>('SELECT 1 FROM party_members WHERE character_id=? LIMIT 1', [character.id])
  ]);
  if (travel[0]) throw new Error('移动或寻怪尚未结束。');
  if (mining[0]) throw new Error('开采尚未结束。');
  if (combat[0] || pvp[0]) throw new Error('战斗尚未结束。');
  if (party[0]) throw new Error('请先离开队伍后再进入家园。');
};
const addItem = async (connection: Db, characterId: number, itemId: number, quantity: number) => {
  await connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()`, [characterId, itemId, quantity]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, itemId]);
};
const consumeMaterials = async (connection: Db, characterId: number, materials: Record<string, number>) => {
  for (const [code, quantity] of Object.entries(materials)) {
    const [rows] = await connection.execute<(RowDataPacket & { item_id: number; quantity: number })[]>(`SELECT pi.item_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=? FOR UPDATE`, [characterId, code]);
    if (!rows[0] || Number(rows[0].quantity) < quantity) throw new Error(`材料不足：${code} 需要 ${quantity}。`);
    await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [quantity, characterId, rows[0].item_id]);
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, rows[0].item_id]);
  }
};
const homeEffects = (furniture: Furniture[]) => furniture.reduce((result, item) => {
  for (const [key, value] of Object.entries(json(item.effect_json))) result[key] = (result[key] ?? 0) + Number(value);
  return result;
}, {} as Record<string, number>);

export const isInHome = async (connection: Db, characterId: number) => {
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_home_visits WHERE character_id=? LIMIT 1', [characterId]);
  return Boolean(rows[0]);
};
export const homeRestRecoveryBonus = async (connection: Db, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { bonus: number })[]>(`SELECT COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.effect_json,'$.restRecoveryPct')) AS UNSIGNED)),0) AS bonus
    FROM player_home_visits v JOIN player_home_furniture f ON f.home_id=v.home_id JOIN home_furniture_definitions d ON d.code=f.furniture_code
    WHERE v.character_id=?`, [characterId]);
  return Math.min(100, Number(rows[0]?.bonus ?? 0));
};

export const homePanel = async (qqUserId: string) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); const home = await homeFor(pool, character.id);
  if (!home) return { character, home: null, inHome: false, furniture: [] as Furniture[], effects: {}, materials: [] as Array<{ code: string; name: string; quantity: number }> };
  const [visitResult, furnitureResult, materialResult] = await Promise.all([
    pool.execute<RowDataPacket[]>('SELECT 1 FROM player_home_visits WHERE character_id=? LIMIT 1', [character.id]),
    pool.execute<Furniture[]>(`SELECT f.id,f.furniture_code,d.name,d.description,d.effect_json,f.floor_no,f.slot_key,f.grid_x,f.grid_y,d.grid_width,d.grid_height FROM player_home_furniture f JOIN home_furniture_definitions d ON d.code=f.furniture_code WHERE f.home_id=? ORDER BY f.floor_no,f.id`, [home.id]),
    pool.execute<(RowDataPacket & { code: string; name: string; quantity: number })[]>(`SELECT i.code,i.name,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code IN ('home_wood','home_stone','home_metal','slime_gel') ORDER BY i.id`, [character.id])
  ]);
  const visit = visitResult[0]; const furniture = furnitureResult[0]; const materials = materialResult[0];
  return { character, home, inHome: Boolean(visit[0]), furniture, effects: homeEffects(furniture), materials: materials.map(row => ({ code: row.code, name: row.name, quantity: Number(row.quantity) })) };
};

const choosePlot = async (connection: Db, townId: number) => {
  const candidates: Array<[number, number]> = [];
  for (let x = -25; x <= 24; x++) for (let y = -135; y <= -86; y++) {
    const distance = Math.abs(x - BAINA_GUILD_POSITION.x) + Math.abs(y - BAINA_GUILD_POSITION.y);
    if (distance >= homePlotDistance.min && distance <= homePlotDistance.max) candidates.push([x, y]);
  }
  for (const [x, y] of candidates.sort(() => Math.random() - .5).slice(0, 64)) {
    const [blocked] = await connection.execute<RowDataPacket[]>(`SELECT 1 AS blocked FROM DUAL WHERE EXISTS(SELECT 1 FROM map_npcs WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=0)
      OR EXISTS(SELECT 1 FROM map_special_objects WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=0)
      OR EXISTS(SELECT 1 FROM resource_spawns WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=0 AND mined_at IS NULL)
      OR EXISTS(SELECT 1 FROM monster_spawns WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=0 AND defeated_at IS NULL)
      OR EXISTS(SELECT 1 FROM dungeon_entrances WHERE region_id=? AND pos_x=? AND pos_y=?) LIMIT 1`, [townId, x, y, townId, x, y, townId, x, y, townId, x, y, townId, x, y]);
    if (!blocked[0]) return { x, y, z: 0 };
  }
  throw new Error('暂时找不到可安置的小屋地块，请稍后再试。');
};

export const purchaseHome = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); await assertAtResidence(connection, character); await assertFree(connection, character);
  if (await homeFor(connection, character.id, true)) throw new Error('你已经拥有一间小屋。');
  const plot = await choosePlot(connection, character.current_region_id);
  const [paid] = await connection.execute<any>('UPDATE characters SET copper_coins=copper_coins-? WHERE id=? AND copper_coins>=?', [homeCosts.purchase.copper, character.id, homeCosts.purchase.copper]);
  if (!Number(paid.affectedRows)) throw new Error(`铜币不足，需要 ${homeCosts.purchase.copper} 铜币。`);
  const [created] = await connection.execute<any>('INSERT INTO player_homes (character_id,town_region_id,plot_x,plot_y,plot_z) VALUES (?,?,?,?,?)', [character.id, character.current_region_id, plot.x, plot.y, plot.z]);
  await connection.execute('INSERT INTO player_events (player_id,event_type,payload) VALUES (?,\'home.purchased\',JSON_OBJECT(\'homeId\',?,\'x\',?,\'y\',?))', [character.player_id, created.insertId, plot.x, plot.y]);
  return { plot, copper: homeCosts.purchase.copper };
});

export const enterHome = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); const home = await homeFor(connection, character.id, true);
  if (!home) throw new Error('你还没有小屋，请先在百纳居购买。');
  if (character.region_code !== 'baina_town' || Number(character.pos_x) !== Number(home.plot_x) || Number(character.pos_y) !== Number(home.plot_y) || Number(character.pos_z) !== Number(home.plot_z)) throw new Error('请先前往自己的小屋地块。');
  await assertFree(connection, character);
  await connection.execute('INSERT INTO player_home_visits (character_id,home_id) VALUES (?,?) ON DUPLICATE KEY UPDATE home_id=VALUES(home_id),entered_at=NOW()', [character.id, home.id]);
  const { recordWarrantSighting } = await import('./pvp.service');
  await recordWarrantSighting(connection, Number(character.id), Number(home.town_region_id), Number(home.plot_x), Number(home.plot_y));
  const { createCityPursuitAtCurrentPosition } = await import('./adventure.service');
  const pursuit = await createCityPursuitAtCurrentPosition(connection, qqUserId);
  return { home, pursuit };
});

export const leaveHome = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); const home = await homeFor(connection, character.id, true);
  if (!home || !await isInHome(connection, character.id)) throw new Error('你当前不在自己的家园中。');
  await connection.execute('DELETE FROM player_home_visits WHERE character_id=?', [character.id]);
  await connection.execute('INSERT INTO player_events (player_id,event_type,payload) VALUES (?,\'home.left\',JSON_OBJECT(\'homeId\',?))', [character.player_id, home.id]);
  return home;
});

const costForUpgrade = (home: Home) => Number(home.house_level) === 1 ? homeCosts.upgrade2 : Number(home.house_level) === 2 ? homeCosts.upgrade3 : null;
export const upgradeHome = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); const home = await homeFor(connection, character.id, true); if (!home) throw new Error('你还没有小屋。');
  const cost = costForUpgrade(home); if (!cost) throw new Error('房屋已经达到最高等级。');
  await consumeMaterials(connection, character.id, { ...cost.materials });
  const [paid] = await connection.execute<any>('UPDATE characters SET copper_coins=copper_coins-? WHERE id=? AND copper_coins>=?', [cost.copper, character.id, cost.copper]); if (!Number(paid.affectedRows)) throw new Error(`铜币不足，需要 ${cost.copper} 铜币。`);
  await connection.execute('UPDATE player_homes SET house_level=house_level+1 WHERE id=?', [home.id]); await connection.execute('DELETE FROM player_home_floor_renders WHERE home_id=?', [home.id]); return { level: Number(home.house_level) + 1, cost };
});

export const expandHome = async (qqUserId: string, floor: 2 | 3) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); const home = await homeFor(connection, character.id, true); if (!home) throw new Error('你还没有小屋。');
  const target = Number(floor); const cost = target === 2 ? homeCosts.expand2 : homeCosts.expand3;
  if (Number(home.floor_count) + 1 !== target || Number(home.house_level) < target || (target === 3 && Number(home.floor_count) < 2)) throw new Error(target === 2 ? '需要房屋 Lv.2 且尚未扩建二层。' : '需要房屋 Lv.3 且已拥有二层。');
  await consumeMaterials(connection, character.id, { ...cost.materials });
  const [paid] = await connection.execute<any>('UPDATE characters SET copper_coins=copper_coins-? WHERE id=? AND copper_coins>=?', [cost.copper, character.id, cost.copper]); if (!Number(paid.affectedRows)) throw new Error(`铜币不足，需要 ${cost.copper} 铜币。`);
  await connection.execute('UPDATE player_homes SET floor_count=? WHERE id=?', [target, home.id]); return { floor: target, cost };
});

export const listFurniture = async (qqUserId: string, floor?: number) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); const home = await homeFor(pool, character.id); if (!home) throw new Error('你还没有小屋。');
  const [definitions, installed, recipes, owned] = await Promise.all([
    pool.execute<FurnitureDefinition[]>('SELECT * FROM home_furniture_definitions WHERE is_active=1 ORDER BY required_house_level,code'),
    pool.execute<Furniture[]>(`SELECT f.id,f.furniture_code,d.name,d.description,d.effect_json,f.floor_no,f.slot_key,f.grid_x,f.grid_y,d.grid_width,d.grid_height FROM player_home_furniture f JOIN home_furniture_definitions d ON d.code=f.furniture_code WHERE f.home_id=?${floor ? ' AND f.floor_no=?' : ''} ORDER BY f.floor_no,f.id`, floor ? [home.id, floor] : [home.id]),
    pool.execute<(RowDataPacket & { furniture_code: string; name: string; quantity: number })[]>(`SELECT r.furniture_code,i.name,r.quantity FROM home_furniture_recipes r JOIN item_definitions i ON i.id=r.item_id ORDER BY r.furniture_code,i.id`),
    pool.execute<(RowDataPacket & { furniture_code: string; quantity: number })[]>('SELECT furniture_code,COUNT(*) AS quantity FROM player_home_furniture WHERE home_id=? GROUP BY furniture_code', [home.id])
  ]);
  const recipesByCode = new Map<string, Array<{ name: string; quantity: number }>>(); recipes[0].forEach(row => recipesByCode.set(row.furniture_code, [...(recipesByCode.get(row.furniture_code) ?? []), { name: row.name, quantity: Number(row.quantity) }]));
  const ownedCounts = new Map<string, number>(); owned[0].forEach(row => ownedCounts.set(row.furniture_code, Number(row.quantity)));
  return { home, definitions: definitions[0], installed: installed[0], recipes: recipesByCode, ownedCounts, slots: slotsPerFloor(Number(home.house_level)) };
};

export const craftFurniture = async (qqUserId: string, code: string, floor: number, _legacySlotKey?: string) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); const home = await homeFor(connection, character.id, true); if (!home) throw new Error('你还没有小屋。');
  if (!Number.isInteger(floor) || floor < 1 || floor > Number(home.floor_count)) throw new Error('楼层不存在。');
  const [definitions] = await connection.execute<FurnitureDefinition[]>('SELECT * FROM home_furniture_definitions WHERE code=? AND is_active=1 FOR UPDATE', [code]); const definition = definitions[0];
  if (!definition || Number(definition.required_house_level) > Number(home.house_level)) throw new Error('该家具尚未解锁。');
  const [[usedRows], [same]] = await Promise.all([
    connection.execute<(RowDataPacket & { floor_slot_cost: number })[]>('SELECT d.floor_slot_cost FROM player_home_furniture f JOIN home_furniture_definitions d ON d.code=f.furniture_code WHERE f.home_id=? AND f.floor_no=? FOR UPDATE', [home.id, floor]),
    connection.execute<(RowDataPacket & { count: number })[]>('SELECT COUNT(*) AS count FROM player_home_furniture WHERE home_id=? AND floor_no=? AND furniture_code=? FOR UPDATE', [home.id, floor, code])
  ]);
  const used = usedRows.reduce((sum, item) => sum + Number(item.floor_slot_cost), 0);
  if (used + Number(definition.floor_slot_cost) > slotsPerFloor(Number(home.house_level))) throw new Error('这一层的家具槽位不足。');
  if (Number(same[0]?.count ?? 0) >= Number(definition.max_per_floor)) throw new Error(`每层最多放置 ${definition.max_per_floor} 个${definition.name}。`);
  const placement = await findFurniturePlacement(connection, Number(home.id), floor, Number(home.house_level), definition);
  const [recipe] = await connection.execute<(RowDataPacket & { item_id: number; quantity: number; name: string })[]>(`SELECT r.item_id,r.quantity,i.name FROM home_furniture_recipes r JOIN item_definitions i ON i.id=r.item_id WHERE r.furniture_code=? FOR UPDATE`, [code]);
  for (const material of recipe) {
    const [owned] = await connection.execute<(RowDataPacket & { quantity: number })[]>('SELECT quantity FROM player_inventory WHERE character_id=? AND item_id=? FOR UPDATE', [character.id, material.item_id]);
    if (!owned[0] || Number(owned[0].quantity) < Number(material.quantity)) throw new Error(`材料不足：${material.name}×${material.quantity}。`);
  }
  for (const material of recipe) { await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [material.quantity, character.id, material.item_id]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [character.id, material.item_id]); }
  const slotKey = `auto-${floor}-${placement.x}-${placement.y}-${Date.now().toString(36)}`;
  const [created] = await connection.execute<any>('INSERT INTO player_home_furniture (home_id,furniture_code,floor_no,slot_key,grid_x,grid_y) VALUES (?,?,?,?,?,?)', [home.id, code, floor, slotKey, placement.x, placement.y]);
  await occupyFurnitureCells(connection, Number(home.id), floor, Number(created.insertId), placement, definition);
  await connection.execute('DELETE FROM player_home_floor_renders WHERE home_id=? AND floor_no=?', [home.id, floor]);
  return { id: Number(created.insertId), name: definition.name, floor, placement };
});

export const removeFurniture = async (qqUserId: string, furnitureId: number) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); const home = await homeFor(connection, character.id, true); if (!home) throw new Error('你还没有小屋。');
  const [rows] = await connection.execute<Furniture[]>('SELECT f.id,f.furniture_code,d.name,d.description,d.effect_json,f.floor_no,f.slot_key,f.grid_x,f.grid_y,d.grid_width,d.grid_height FROM player_home_furniture f JOIN home_furniture_definitions d ON d.code=f.furniture_code WHERE f.id=? AND f.home_id=? FOR UPDATE', [furnitureId, home.id]); if (!rows[0]) throw new Error('没有找到该家具。');
  await connection.execute('DELETE FROM player_home_furniture WHERE id=?', [furnitureId]); await connection.execute('DELETE FROM player_home_floor_renders WHERE home_id=? AND floor_no=?', [home.id, rows[0].floor_no]); return rows[0];
});

export const listHomeShop = async (qqUserId: string) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); await assertAtResidence(pool, character);
  const [rows] = await pool.execute<(RowDataPacket & { id: number; offer_code: string; output_name: string; output_quantity: number; input_name: string | null; input_quantity: number; copper_price: number })[]>(`SELECT o.id,o.offer_code,out_item.name AS output_name,o.output_quantity,in_item.name AS input_name,o.input_quantity,o.copper_price
    FROM home_shop_offers o JOIN item_definitions out_item ON out_item.id=o.output_item_id LEFT JOIN item_definitions in_item ON in_item.id=o.input_item_id WHERE o.is_active=1 ORDER BY o.sort_order,o.id`);
  return { copper: Number(character.copper_coins), offers: rows.map(row => ({ id: Number(row.id), code: row.offer_code, outputName: row.output_name, outputQuantity: Number(row.output_quantity), inputName: row.input_name, inputQuantity: Number(row.input_quantity), copperPrice: Number(row.copper_price) })) };
};

export const tradeHomeOffer = async (qqUserId: string, offerId: number, quantity: number) => withTransaction(async connection => {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error('数量必须是 1 至 999 之间的整数。');
  const character = await characterFor(connection, qqUserId, true); await assertAtResidence(connection, character);
  const [offers] = await connection.execute<(RowDataPacket & { id: number; output_item_id: number; output_quantity: number; input_item_id: number | null; input_quantity: number; copper_price: number; output_name: string })[]>(`SELECT o.*,i.name AS output_name FROM home_shop_offers o JOIN item_definitions i ON i.id=o.output_item_id WHERE o.id=? AND o.is_active=1 FOR UPDATE`, [offerId]); const offer = offers[0]; if (!offer) throw new Error('该报价已失效。');
  if (offer.input_item_id) {
    const [owned] = await connection.execute<(RowDataPacket & { quantity: number })[]>('SELECT quantity FROM player_inventory WHERE character_id=? AND item_id=? FOR UPDATE', [character.id, offer.input_item_id]);
    const need = Number(offer.input_quantity) * quantity; if (!owned[0] || Number(owned[0].quantity) < need) throw new Error('兑换材料不足。');
    await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [need, character.id, offer.input_item_id]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [character.id, offer.input_item_id]);
  } else {
    const price = Number(offer.copper_price) * quantity; const [paid] = await connection.execute<any>('UPDATE characters SET copper_coins=copper_coins-? WHERE id=? AND copper_coins>=?', [price, character.id, price]); if (!Number(paid.affectedRows)) throw new Error(`铜币不足，需要 ${price} 铜币。`);
  }
  const gained = Number(offer.output_quantity) * quantity; await addItem(connection, character.id, Number(offer.output_item_id), gained); return { name: offer.output_name, quantity: gained };
});
