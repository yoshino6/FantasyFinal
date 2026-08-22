import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../database/pool';

const DUNGEON_REGION_CODE = 'dark_forest_dungeon';
const FLOORS = [-10, -20, -30] as const;
const key = (x: number, y: number) => `${x},${y}`;
const random = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const skillJson = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value ?? []);

type CharacterRow = RowDataPacket & { id: number; current_region_id: number; pos_x: number; pos_y: number; pos_z: number; hp_max: number; mp_max: number; current_hp: number; current_mp: number; physical_attack: number; physical_defense: number; accuracy: number; evasion: number; game_id: number; name: string };
type DungeonRow = RowDataPacket & { id: number; entrance_region_id: number; entrance_x: number; entrance_y: number; origin_x: number; origin_y: number; state: 'active' | 'cleared' | 'closed' };
type DungeonCell = RowDataPacket & { id: number; dungeon_id: number; cell_type: string; trap_type: string | null; landmark_text: string | null; chest_opened: number; pos_x: number; pos_y: number; pos_z: number };

const junctionSymbols = ['断角鹿', '展翼鸦', '衔月狼', '三尾狐', '沉眠蛇', '逐风马', '负石龟', '举灯人', '执剑骑士', '双角羊', '折翼蝶', '衔钥乌鸦', '观星猫', '踏浪鱼', '抱枝猿', '闭目狮', '卷尾龙', '提灯兔', '环翼鹰', '藏锋豹', '捧杯鹿', '折冠王', '啄火鸟', '回首象'];
const junctionMaterials = ['青铜圆盘', '黑曜石碑', '褪色壁毯', '碎裂石像', '嵌银地砖', '残缺浮雕', '风化木牌', '刻痕石柱', '失色旗帜', '古旧铜铃', '断裂灯架', '半埋陶罐', '褐石座钟', '锈蚀盾牌', '坠地吊坠', '镂空石窗', '裂纹面具', '干枯花盆', '横置长矛', '空心陶铃', '磨损罗盘', '碎角王冠', '染墨卷轴'];
const junctionLandmark = (floor: number, index: number) => {
  const symbol = junctionSymbols[(floor * 17 + index) % junctionSymbols.length]; const material = junctionMaterials[(floor * 19 + index * 7) % junctionMaterials.length];
  return `你来到一处岔路口。中央立着一块${material}，上面清晰刻着「${symbol}」的图案；附近墙面留有${floor + 1}道斜向刻痕。`;
};

const characterFor = async (connection: Pool | PoolConnection, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<CharacterRow[]>(`SELECT c.* FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  return rows[0];
};

const regionId = async (connection: Pool | PoolConnection, code: string) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM map_regions WHERE code=? LIMIT 1', [code]);
  if (!rows[0]) throw new Error('地下迷宫区域尚未初始化。');
  return Number(rows[0].id);
};

/** 深度优先生成连通迷宫；只保存可行走格，未保存的位置都是墙。 */
const mazeCells = () => {
  const visited = new Set<string>(); const cells = new Set<string>();
  const stack: Array<[number, number]> = [[0, 0]]; visited.add(key(0, 0)); cells.add(key(1, 1));
  const directions: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const candidates = directions.map(([dx, dy]) => [cx + dx, cy + dy, dx, dy] as const)
      .filter(([nx, ny]) => nx >= 0 && nx < 7 && ny >= 0 && ny < 7 && !visited.has(key(nx, ny)));
    if (!candidates.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = random(candidates); visited.add(key(nx, ny));
    cells.add(key(1 + cx * 2 + dx, 1 + cy * 2 + dy)); cells.add(key(1 + nx * 2, 1 + ny * 2)); stack.push([nx, ny]);
  }
  return [...cells].map(value => value.split(',').map(Number) as [number, number]);
};

const dungeonTemplateCodes = ['dungeon_raider', 'dungeon_wisp', 'dungeon_stalker', 'dungeon_guardian'];

const createDungeon = async (connection: Pool | PoolConnection) => {
  const forestId = await regionId(connection, 'dark_forest'); const dungeonRegionId = await regionId(connection, DUNGEON_REGION_CODE);
  const [existingEntries] = await connection.execute<(RowDataPacket & { entrance_x: number; entrance_y: number })[]>('SELECT entrance_x,entrance_y FROM dungeon_instances WHERE state=\'active\' FOR UPDATE');
  let entranceX = 0; let entranceY = 0;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const x = Math.floor(Math.random() * 100) - 50; const y = Math.floor(Math.random() * 100) - 110;
    const inTown = x >= -25 && x <= 24 && y >= -135 && y <= -86;
    const tooClose = existingEntries.some(entry => Math.abs(Number(entry.entrance_x) - x) + Math.abs(Number(entry.entrance_y) - y) < 16);
    if (!inTown && !tooClose) { entranceX = x; entranceY = y; break; }
  }
  if (!entranceX && !entranceY) { entranceX = -46; entranceY = -108; }
  const [originRows] = await connection.execute<(RowDataPacket & { max_origin: number | null })[]>('SELECT MAX(origin_x) AS max_origin FROM dungeon_instances FOR UPDATE');
  const originX = Math.max(10, Number(originRows[0]?.max_origin ?? -20) + 24); const originY = 10;
  const [result] = await connection.execute<any>('INSERT INTO dungeon_instances (entrance_region_id,entrance_x,entrance_y,origin_x,origin_y,state) VALUES (?,?,?,?,?,\'active\')', [forestId, entranceX, entranceY, originX, originY]);
  const dungeonId = Number(result.insertId);
  const cells: Array<[number, number, number, string, string | null, string | null]> = [];
  const monsterSlots: Array<{ x: number; y: number; z: number }> = [];
  for (const [floorIndex, z] of FLOORS.entries()) {
    const floorCells = mazeCells(); const start = key(1, 1); const end = key(13, 13);
    const protectedCells = new Set([start, end]);
    const candidates = floorCells.filter(([x, y]) => !protectedCells.has(key(x, y))).sort(() => Math.random() - .5);
    const traps = candidates.splice(0, 3); const chests = candidates.splice(0, 2); const monsters = candidates.splice(0, 5 + floorIndex * 2);
    const floorCellSet = new Set(floorCells.map(([x, y]) => key(x, y)));
    let junctionIndex = 0;
    for (const [x, y] of floorCells) {
      let type = 'path'; let trap: string | null = null;
      const degree = [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dx, dy]) => floorCellSet.has(key(x + dx, y + dy))).length;
      const landmark = degree >= 3 ? junctionLandmark(floorIndex, junctionIndex++) : null;
      if (key(x, y) === start) type = floorIndex === 0 ? 'entrance' : 'stairs_up';
      else if (key(x, y) === end) type = floorIndex === 2 ? 'boss' : 'stairs_down';
      else if (traps.some(([tx, ty]) => tx === x && ty === y)) { type = 'trap'; trap = random(['毒针', '吸魔符文', '坍塌地砖']); }
      else if (chests.some(([tx, ty]) => tx === x && ty === y)) type = 'chest';
      cells.push([originX + x, originY + y, z, type, trap, landmark]);
    }
    for (const [x, y] of monsters) monsterSlots.push({ x: originX + x, y: originY + y, z });
  }
  for (const [x, y, z, type, trap, landmark] of cells) await connection.execute('INSERT INTO dungeon_cells (dungeon_id,pos_x,pos_y,pos_z,cell_type,trap_type,landmark_text) VALUES (?,?,?,?,?,?,?)', [dungeonId, x, y, z, type, trap, landmark]);
  const [templates] = await connection.execute<(RowDataPacket & { id: number; code: string; level: number; constitution: number; spirit: number; strength: number; intelligence: number; agility: number; perception: number; skill_sequence: unknown })[]>(`SELECT id,code,level,constitution,spirit,strength,intelligence,agility,perception,skill_sequence FROM monster_templates WHERE code IN (${dungeonTemplateCodes.map(() => '?').join(',')},'dungeon_warden')`, dungeonTemplateCodes);
  const byCode = new Map(templates.map(template => [template.code, template]));
  for (const [index, slot] of monsterSlots.entries()) {
    const code = dungeonTemplateCodes[Math.min(dungeonTemplateCodes.length - 1, Math.floor(index / 5))]; const template = byCode.get(code); if (!template) continue;
    const level = Math.min(29, Number(template.level) + Math.floor(Math.random() * 3)); const hp = Math.max(700, Math.floor((Number(template.constitution) * 42 + level * 70) * 1.2));
    const [spawn] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,JSON_ARRAY())', [template.id, dungeonRegionId, slot.x, slot.y, slot.z, level, template.constitution, template.spirit, template.strength, template.intelligence, template.agility, template.perception, hp, skillJson(template.skill_sequence), JSON.stringify([])]);
    await connection.execute('INSERT INTO dungeon_monsters (dungeon_id,spawn_id,is_boss) VALUES (?,?,0)', [dungeonId, Number(spawn.insertId)]);
  }
  const boss = byCode.get('dungeon_warden');
  if (boss) {
    const bossCell = cells.find(cell => cell[3] === 'boss'); const hp = Math.max(4200, Math.floor((Number(boss.constitution) * 60 + Number(boss.level) * 120) * 4));
    if (bossCell) {
      const [spawn] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,JSON_ARRAY())', [boss.id, dungeonRegionId, bossCell[0], bossCell[1], bossCell[2], boss.level, boss.constitution, boss.spirit, boss.strength, boss.intelligence, boss.agility, boss.perception, hp, skillJson(boss.skill_sequence), JSON.stringify([{ code: 'dungeon_boss', name: '地宫领主' }])]);
      await connection.execute('INSERT INTO dungeon_monsters (dungeon_id,spawn_id,is_boss) VALUES (?,?,1)', [dungeonId, Number(spawn.insertId)]);
    }
  }
  return dungeonId;
};

/** 启动与整点调用：保留未攻略迷宫；攻略后两小时才替换为新结构。 */
export const refreshDungeons = async (connection: Pool | PoolConnection) => {
  await connection.execute(`UPDATE dungeon_instances SET state='closed' WHERE state='cleared' AND refresh_at<=NOW()`);
  const [activeRows] = await connection.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM dungeon_instances WHERE state=\'active\'');
  const missing = Math.max(0, 2 - Number(activeRows[0]?.total ?? 0));
  for (let index = 0; index < missing; index += 1) await createDungeon(connection);
};

/** 管理面板使用的当前地下迷宫事件概览。 */
export const dungeonEvents = async () => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; state: 'active' | 'cleared' | 'closed'; entrance_x: number; entrance_y: number; refresh_at: Date | null; boss_name: string | null; boss_hp: number | null; boss_defeated_at: Date | null; explorer_count: number })[]>(`SELECT d.id,d.state,d.entrance_x,d.entrance_y,d.refresh_at,t.name AS boss_name,s.current_hp AS boss_hp,s.defeated_at AS boss_defeated_at,
    (SELECT COUNT(*) FROM characters c JOIN map_regions r ON r.id=c.current_region_id WHERE r.code='dark_forest_dungeon' AND c.pos_x BETWEEN d.origin_x AND d.origin_x+14 AND c.pos_y BETWEEN d.origin_y AND d.origin_y+14) AS explorer_count
    FROM dungeon_instances d
    LEFT JOIN dungeon_monsters dm ON dm.dungeon_id=d.id AND dm.is_boss=1
    LEFT JOIN monster_spawns s ON s.id=dm.spawn_id
    LEFT JOIN monster_templates t ON t.id=s.template_id
    WHERE d.state<>'closed' ORDER BY d.id`);
  return rows.map(row => ({ id: Number(row.id), state: row.state, x: Number(row.entrance_x), y: Number(row.entrance_y), refreshAt: row.refresh_at, bossName: row.boss_name ?? '最终守卫', bossHp: row.boss_hp === null ? null : Number(row.boss_hp), bossDefeated: Boolean(row.boss_defeated_at), explorers: Number(row.explorer_count) }));
});

export const dungeonEntranceAt = async (connection: Pool | PoolConnection, regionId: number, x: number, y: number) => {
  const [rows] = await connection.execute<(DungeonRow & { name: string })[]>(`SELECT d.*,r.name FROM dungeon_instances d JOIN map_regions r ON r.id=d.entrance_region_id
    WHERE d.state='active' AND d.entrance_region_id=? AND d.entrance_x=? AND d.entrance_y=? LIMIT 1`, [regionId, x, y]);
  return rows[0] ? { id: Number(rows[0].id), name: rows[0].name, description: '石阶在藤蔓与雾气下裂开一道幽深的缝隙。冷风自地下涌出，仿佛有什么正在黑暗深处等待。' } : null;
};

export const dungeonCellAt = async (connection: Pool | PoolConnection, regionId: number, x: number, y: number, z: number) => {
  const [rows] = await connection.execute<DungeonCell[]>('SELECT dc.* FROM dungeon_cells dc JOIN dungeon_instances d ON d.id=dc.dungeon_id WHERE d.state=\'active\' AND dc.pos_x=? AND dc.pos_y=? AND dc.pos_z=? AND (SELECT id FROM map_regions WHERE code=\'dark_forest_dungeon\' LIMIT 1)=? LIMIT 1', [x, y, z, regionId]);
  return rows[0] ?? null;
};

export const enterDungeon = async (qqUserId: string, dungeonId: number) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true);
  const [dungeons] = await connection.execute<DungeonRow[]>('SELECT * FROM dungeon_instances WHERE id=? AND state=\'active\' FOR UPDATE', [dungeonId]); const dungeon = dungeons[0];
  if (!dungeon || Number(dungeon.entrance_region_id) !== Number(character.current_region_id) || Number(dungeon.entrance_x) !== Number(character.pos_x) || Number(dungeon.entrance_y) !== Number(character.pos_y) || Number(character.pos_z) !== 0) throw new Error('你已经离开地下迷宫入口，无法进入。');
  const dungeonRegion = await regionId(connection, DUNGEON_REGION_CODE); const [entry] = await connection.execute<DungeonCell[]>('SELECT * FROM dungeon_cells WHERE dungeon_id=? AND cell_type=\'entrance\' LIMIT 1', [dungeonId]);
  if (!entry[0]) throw new Error('这座迷宫的入口结构尚未形成。');
  await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE id=?', [dungeonRegion, entry[0].pos_x, entry[0].pos_y, entry[0].pos_z, character.id]);
  return { dungeonId, x: Number(entry[0].pos_x), y: Number(entry[0].pos_y), z: Number(entry[0].pos_z) };
});

const eventForCell = async (connection: PoolConnection, character: CharacterRow) => {
  const cell = await dungeonCellAt(connection, Number(character.current_region_id), Number(character.pos_x), Number(character.pos_y), Number(character.pos_z));
  if (!cell) return null;
  const directions: Array<[number, number]> = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const adjacent = await Promise.all(directions.map(([dx, dy]) => dungeonCellAt(connection, Number(character.current_region_id), Number(cell.pos_x) + dx, Number(cell.pos_y) + dy, Number(cell.pos_z))));
  // 兼容已生成的旧迷宫：未保存路标时按格子位置生成稳定的临时路标，重构后的新迷宫则直接读取存档文本。
  const landmark = cell.landmark_text || (adjacent.filter(Boolean).length >= 3 ? `${junctionLandmark(Math.max(0, Math.abs(Number(cell.pos_z)) / 10 - 1), Math.abs(Number(cell.pos_x) * 31 + Number(cell.pos_y) * 17) % junctionSymbols.length)} 石缝里另刻着一行辨识用的细小符号。` : null);
  const withLandmark = (text: string) => landmark ? `${landmark}\n\n${text}` : text;
  if (cell.cell_type === 'chest' && !Number(cell.chest_opened)) return { kind: 'chest' as const, cellId: Number(cell.id), text: withLandmark('墙角的尘埃下露出一只布满锈迹的宝箱。锁扣尚未被人触碰。') };
  if (cell.cell_type === 'stairs_down') return { kind: 'down' as const, text: withLandmark('一段向下延伸的石阶没入黑暗，下一层的冷意正沿台阶爬上来。') };
  if (cell.cell_type === 'stairs_up') return { kind: 'up' as const, text: withLandmark('石阶通向上一层。你仍能听见远处地表的风声。') };
  if (cell.cell_type === 'entrance') return { kind: 'leave' as const, text: withLandmark('入口后的石阶仍在，你可以随时离开这座地下迷宫。') };
  if (cell.cell_type !== 'trap') return landmark ? { kind: 'landmark' as const, text: landmark } : null;
  const [trigger] = await connection.execute<any>('INSERT IGNORE INTO dungeon_cell_triggers (cell_id,character_id) VALUES (?,?)', [cell.id, character.id]);
  if (!Number(trigger.affectedRows)) return null;
  if (cell.trap_type === '毒针') {
    const damage = Math.max(1, Math.ceil(Number(character.hp_max) * .08)); await connection.execute('UPDATE characters SET current_hp=GREATEST(1,current_hp-?) WHERE id=?', [damage, character.id]);
    return { kind: 'trap' as const, text: withLandmark(`$毒针陷阱$石缝中弹出毒针，造成 ${damage} 点伤害。`) };
  }
  if (cell.trap_type === '吸魔符文') {
    const loss = Math.max(1, Math.ceil(Number(character.mp_max) * .18)); await connection.execute('UPDATE characters SET current_mp=GREATEST(0,current_mp-?) WHERE id=?', [loss, character.id]);
    return { kind: 'trap' as const, text: withLandmark(`$吸魔符文$脚下的符文亮起，流失 ${loss} 点魔力。`) };
  }
  const damage = Math.max(1, Math.ceil(Number(character.hp_max) * .05)); await connection.execute('UPDATE characters SET current_hp=GREATEST(1,current_hp-?) WHERE id=?', [damage, character.id]);
  return { kind: 'trap' as const, text: withLandmark(`$坍塌地砖$碎石自头顶坠落，造成 ${damage} 点伤害。`) };
};

/** 移动模块在更新位置后调用，触发一次性陷阱、宝箱与楼层出入口。 */
export const dungeonArrivalEvent = async (connection: PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<CharacterRow[]>('SELECT * FROM characters WHERE id=? FOR UPDATE', [characterId]);
  return rows[0] ? eventForCell(connection, rows[0]) : null;
};

export const openDungeonChest = async (qqUserId: string, cellId: number) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true);
  const [cells] = await connection.execute<DungeonCell[]>('SELECT * FROM dungeon_cells WHERE id=? AND pos_x=? AND pos_y=? AND pos_z=? AND cell_type=\'chest\' FOR UPDATE', [cellId, character.pos_x, character.pos_y, character.pos_z]); const cell = cells[0];
  if (!cell || Number(cell.chest_opened)) throw new Error('宝箱已经被开启，或你已离开宝箱旁。');
  const pool = ['beast_core', 'magic_heartcore', 'living_wood', 'meteor_iron']; const itemCode = random(pool); const quantity = itemCode === 'beast_core' ? 1 : 1 + Math.floor(Math.random() * 2); const copper = 20 + Math.floor(Math.random() * 41);
  await connection.execute('UPDATE dungeon_cells SET chest_opened=1 WHERE id=?', [cell.id]);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [copper, character.id]);
  await connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity) SELECT ?,id,? FROM item_definitions WHERE code=? ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()`, [character.id, quantity, itemCode]);
  await connection.execute(`INSERT IGNORE INTO player_item_codex (character_id,item_id) SELECT ?,id FROM item_definitions WHERE code=?`, [character.id, itemCode]);
  const [item] = await connection.execute<(RowDataPacket & { name: string })[]>('SELECT name FROM item_definitions WHERE code=?', [itemCode]);
  return { copper, name: item[0]?.name ?? '未知材料', quantity };
});

export const changeDungeonFloor = async (qqUserId: string, direction: 'down' | 'up' | 'leave') => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); const cell = await dungeonCellAt(connection, Number(character.current_region_id), Number(character.pos_x), Number(character.pos_y), Number(character.pos_z));
  if (!cell) throw new Error('你当前不在可通行的地下迷宫格子中。');
  const [dungeons] = await connection.execute<DungeonRow[]>('SELECT d.* FROM dungeon_instances d JOIN dungeon_cells dc ON dc.dungeon_id=d.id WHERE dc.id=? AND d.state=\'active\' FOR UPDATE', [cell.id]); const dungeon = dungeons[0]; if (!dungeon) throw new Error('这座迷宫已经关闭。');
  if (direction === 'leave') {
    if (cell.cell_type !== 'entrance') throw new Error('只能从第一层入口离开迷宫。');
    await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=0 WHERE id=?', [dungeon.entrance_region_id, dungeon.entrance_x, dungeon.entrance_y, character.id]);
    return { action: 'leave' as const, x: Number(dungeon.entrance_x), y: Number(dungeon.entrance_y), z: 0 };
  }
  const expected = direction === 'down' ? 'stairs_down' : 'stairs_up'; if (cell.cell_type !== expected) throw new Error(direction === 'down' ? '这里没有通向下一层的石阶。' : '这里没有通向上一层的石阶。');
  const targetZ = Number(character.pos_z) + (direction === 'down' ? -10 : 10); const targetType = direction === 'down' ? 'stairs_up' : Number(targetZ) === -10 ? 'entrance' : 'stairs_down';
  const [target] = await connection.execute<DungeonCell[]>('SELECT * FROM dungeon_cells WHERE dungeon_id=? AND pos_z=? AND cell_type=? LIMIT 1', [dungeon.id, targetZ, targetType]); if (!target[0]) throw new Error('楼层之间的石阶已经坍塌。');
  await connection.execute('UPDATE characters SET pos_x=?,pos_y=?,pos_z=? WHERE id=?', [target[0].pos_x, target[0].pos_y, target[0].pos_z, character.id]);
  return { action: direction, x: Number(target[0].pos_x), y: Number(target[0].pos_y), z: Number(target[0].pos_z) };
});

export const dungeonPlayersInRange = async (connection: Pool | PoolConnection, characterId: number, regionIdValue: number, x: number, y: number, z: number, range: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { game_id: number; name: string; pos_x: number; pos_y: number })[]>(`SELECT game_id,name,pos_x,pos_y FROM characters
    WHERE current_region_id=? AND pos_z=? AND id<>? AND npc_code IS NULL AND ABS(pos_x-?)+ABS(pos_y-?)<=?`, [regionIdValue, z, characterId, x, y, range]);
  return rows.map(row => ({ gameId: Number(row.game_id), name: row.name, x: Number(row.pos_x), y: Number(row.pos_y) }));
};

export const dungeonPvP = async (qqUserId: string, targetGameId: number) => withTransaction(async connection => {
  const attacker = await characterFor(connection, qqUserId, true);
  const dungeonRegion = await regionId(connection, DUNGEON_REGION_CODE); if (Number(attacker.current_region_id) !== dungeonRegion) throw new Error('只能在地下迷宫内进行 PvP。');
  const [targets] = await connection.execute<CharacterRow[]>('SELECT * FROM characters WHERE game_id=? AND npc_code IS NULL FOR UPDATE', [targetGameId]); const target = targets[0];
  if (!target || Number(target.id) === Number(attacker.id) || Number(target.current_region_id) !== dungeonRegion || Number(target.pos_z) !== Number(attacker.pos_z) || Math.abs(Number(target.pos_x) - Number(attacker.pos_x)) + Math.abs(Number(target.pos_y) - Number(attacker.pos_y)) > 1) throw new Error('目标不在你相邻的地下迷宫格子中。');
  const hit = Math.random() < Number(attacker.accuracy) / Math.max(1, Number(attacker.accuracy) + Number(target.evasion)); if (!hit) return { attacker: attacker.name, target: target.name, hit: false, damage: 0, defeated: false };
  const damage = Math.max(1, Math.floor(Number(attacker.physical_attack) ** 2 / Math.max(1, Number(attacker.physical_attack) + Number(target.physical_defense)))); const hp = Math.max(0, Number(target.current_hp) - damage); const defeated = hp <= 0;
  await connection.execute('UPDATE characters SET current_hp=?,activity_status=?,rest_started_at=? WHERE id=?', [defeated ? 1 : hp, defeated ? 'unconscious' : 'active', defeated ? new Date() : null, target.id]);
  return { attacker: attacker.name, target: target.name, hit: true, damage, defeated };
});

/** 最终 Boss 被击败时关闭该迷宫，并在两小时后允许刷新新结构。 */
export const closeDungeonForBossSpawns = async (connection: PoolConnection, spawnIds: number[]) => {
  if (!spawnIds.length) return false;
  const [rows] = await connection.execute<(RowDataPacket & { dungeon_id: number })[]>(`SELECT dungeon_id FROM dungeon_monsters WHERE is_boss=1 AND spawn_id IN (${spawnIds.map(() => '?').join(',')}) LIMIT 1 FOR UPDATE`, spawnIds);
  const dungeonId = Number(rows[0]?.dungeon_id ?? 0); if (!dungeonId) return false;
  const [dungeons] = await connection.execute<DungeonRow[]>('SELECT * FROM dungeon_instances WHERE id=? AND state=\'active\' FOR UPDATE', [dungeonId]); const dungeon = dungeons[0]; if (!dungeon) return false;
  await connection.execute('UPDATE dungeon_instances SET state=\'cleared\',cleared_at=NOW(),refresh_at=DATE_ADD(NOW(),INTERVAL 2 HOUR) WHERE id=?', [dungeonId]);
  const dungeonRegion = await regionId(connection, DUNGEON_REGION_CODE);
  await connection.execute(`UPDATE characters c JOIN dungeon_cells dc ON dc.pos_x=c.pos_x AND dc.pos_y=c.pos_y AND dc.pos_z=c.pos_z AND dc.dungeon_id=?
    SET c.current_region_id=?,c.pos_x=?,c.pos_y=?,c.pos_z=0 WHERE c.current_region_id=?`, [dungeonId, dungeon.entrance_region_id, dungeon.entrance_x, dungeon.entrance_y, dungeonRegion]);
  return true;
};
