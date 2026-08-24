import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { resolvePvpVictory } from './pvp.service';

const DUNGEON_REGION_CODE = 'dark_forest_dungeon';
const FLOORS = [-10, -20, -30] as const;
const key = (x: number, y: number) => `${x},${y}`;
const random = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const skillJson = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value ?? []);
const interactionRange = (character: CharacterRow) => {
  const perception = Number(character.perception) + Number(character.perception_growth) * Math.max(0, Number(character.level) - 1);
  const statValue = 1 + Math.floor(Math.pow(Math.max(1, perception) / 7, .9));
  const levelCap = Math.min(10, 2 + Math.floor(Math.max(1, Number(character.level)) / 5));
  return Math.max(1, Math.min(10, levelCap, statValue));
};

type CharacterRow = RowDataPacket & { id: number; current_region_id: number; pos_x: number; pos_y: number; pos_z: number; level: number; perception: number; perception_growth: number; hp_max: number; mp_max: number; current_hp: number; current_mp: number; physical_attack: number; magic_attack: number; physical_defense: number; magic_defense: number; accuracy: number; evasion: number; game_id: number; name: string; secondary_profession_code: string | null };
type DungeonRow = RowDataPacket & { id: number; entrance_region_id: number; entrance_x: number; entrance_y: number; origin_x: number; origin_y: number; state: 'active' | 'cleared' | 'closed' };
type DungeonCell = RowDataPacket & { id: number; dungeon_id: number; cell_type: string; trap_type: string | null; landmark_text: string | null; chest_quality: '青铜' | '白银' | '黄金' | null; chest_opened: number; pos_x: number; pos_y: number; pos_z: number };

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
const mazeCells = (width: number, height: number) => {
  const visited = new Set<string>(); const cells = new Set<string>();
  const stack: Array<[number, number]> = [[0, 0]]; visited.add(key(0, 0)); cells.add(key(1, 1));
  const columns = Math.floor(width / 2); const rows = Math.floor(height / 2);
  const directions: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const candidates = directions.map(([dx, dy]) => [cx + dx, cy + dy, dx, dy] as const)
      .filter(([nx, ny]) => nx >= 0 && nx < columns && ny >= 0 && ny < rows && !visited.has(key(nx, ny)));
    if (!candidates.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = random(candidates); visited.add(key(nx, ny));
    cells.add(key(1 + cx * 2 + dx, 1 + cy * 2 + dy)); cells.add(key(1 + nx * 2, 1 + ny * 2)); stack.push([nx, ny]);
  }
  return [...cells].map(value => value.split(',').map(Number) as [number, number]);
};

const firstFloorSlimes = ['slime_red', 'slime_orange', 'slime_yellow', 'slime_green', 'slime_cyan', 'slime_blue', 'slime_purple'];
const secondFloorMonsters = [...firstFloorSlimes, 'skeleton', 'undead', 'skeleton_warrior', 'death_wight'];
const dungeonTemplateCodes = [...firstFloorSlimes, ...secondFloorMonsters, 'black_slime', 'skeleton_general', 'death_knight', 'necromancer_uz'];
const chestQuality = (floor: number, required = false): '青铜' | '白银' | '黄金' => {
  const roll = Math.random();
  if (floor === 0) return roll < (required ? .90 : .99) ? '青铜' : roll < (required ? .99 : 1) ? '白银' : '黄金';
  if (floor === 1) return roll < (required ? .80 : .90) ? '青铜' : roll < (required ? .97 : 1) ? '白银' : '黄金';
  return roll < .90 ? '白银' : '黄金';
};
const randomLevel = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const dungeonBossTraits = [
  { code: 'ordinary', name: '普通的' }, { code: 'powerful', name: '强大的', statMultiplier: 1.1, experiencePct: 20, dropPct: 10 },
  { code: 'heroic', name: '英雄的', statMultiplier: 1.2, experiencePct: 30, dropPct: 20 }, { code: 'infernal', name: '深渊的', statMultiplier: 1.35, experiencePct: 50, dropPct: 40 },
  { code: 'abyssal', name: '地狱的', statMultiplier: 1.5, experiencePct: 80, dropPct: 60 }, { code: 'crimson', name: '猩红的', statMultiplier: 1.25, physicalAttackPct: 40, magicAttackPct: 40, accuracyPct: 40, critRatePct: 40, critDamagePct: 40, experiencePct: 100, dropPct: 80 },
  { code: 'corrupted', name: '腐化的', statMultiplier: 1.25, physicalDefensePct: 60, magicDefensePct: 60, critResistPct: 60, critReductionPct: 60, experiencePct: 100, dropPct: 80 }, { code: 'holy', name: '神圣的', statMultiplier: 1.25, hpPct: 100, evasionPct: 100, experiencePct: 100, dropPct: 80 },
  { code: 'golden', name: '黄金的', statMultiplier: 1.5, evasionPct: 33.3333, experiencePct: 150, dropPct: 100 }, { code: 'brilliant', name: '璀璨的', statMultiplier: 1.75, evasionPct: 100, experiencePct: 250, dropPct: 250 },
  { code: 'dreamlike', name: '梦幻的', statMultiplier: 2, evasionPct: 200, experiencePct: 600, dropPct: 600 }
];
const randomDungeonBossTrait = () => {
  const weights = [25, 24, 15, 10, 5, 5, 5, 5, 3, 2, 1]; let roll = Math.random() * 100;
  return dungeonBossTraits[weights.findIndex(weight => (roll -= weight) < 0) || 0];
};

const dungeonSmallMonsterPlan: Record<number, { target: number; codes: string[]; levelFor: (code: string) => number }> = {
  [-10]: { target: 13, codes: firstFloorSlimes, levelFor: () => randomLevel(1, 9) },
  [-20]: { target: 20, codes: secondFloorMonsters, levelFor: code => code === 'skeleton' || code === 'undead' ? randomLevel(16, 18) : code === 'skeleton_warrior' || code === 'death_wight' ? randomLevel(18, 20) : randomLevel(8, 16) },
  [-30]: { target: 6, codes: ['skeleton_warrior', 'death_wight', 'undead'], levelFor: code => code === 'undead' ? randomLevel(16, 18) : randomLevel(18, 20) }
};

/** 整点补充未攻略迷宫中的小怪。Boss、楼层首领、宝箱格与宝箱状态均不在此处改动。 */
const refreshDungeonSmallMonsters = async (connection: Pool | PoolConnection) => {
  const dungeonRegionId = await regionId(connection, DUNGEON_REGION_CODE);
  const [dungeons] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM dungeon_instances WHERE state=\'active\' FOR UPDATE');
  if (!dungeons.length) return 0;
  const allCodes = [...new Set(Object.values(dungeonSmallMonsterPlan).flatMap(plan => plan.codes))];
  const [templates] = await connection.execute<(RowDataPacket & { id: number; code: string; constitution: number; spirit: number; strength: number; intelligence: number; agility: number; perception: number; skill_sequence: unknown })[]>(`SELECT id,code,constitution,spirit,strength,intelligence,agility,perception,skill_sequence FROM monster_templates WHERE code IN (${allCodes.map(() => '?').join(',')})`, allCodes);
  const byCode = new Map(templates.map(template => [template.code, template]));
  let spawned = 0;
  for (const dungeon of dungeons) for (const z of FLOORS) {
    const plan = dungeonSmallMonsterPlan[z];
    const [countRows] = await connection.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM dungeon_monsters dm
      JOIN monster_spawns s ON s.id=dm.spawn_id
      WHERE dm.dungeon_id=? AND dm.is_boss=0 AND dm.is_floor_leader=0 AND s.pos_z=? AND s.defeated_at IS NULL`, [dungeon.id, z]);
    const missing = Math.max(0, plan.target - Number(countRows[0]?.total ?? 0));
    if (!missing) continue;
    const [cells] = await connection.execute<(RowDataPacket & { pos_x: number; pos_y: number })[]>(`SELECT dc.pos_x,dc.pos_y FROM dungeon_cells dc
      WHERE dc.dungeon_id=? AND dc.pos_z=? AND dc.cell_type IN ('path','trap')
        AND NOT EXISTS (SELECT 1 FROM monster_spawns s WHERE s.region_id=? AND s.pos_x=dc.pos_x AND s.pos_y=dc.pos_y AND s.pos_z=dc.pos_z AND s.defeated_at IS NULL)
      ORDER BY dc.id FOR UPDATE`, [dungeon.id, z, dungeonRegionId]);
    const slots = [...cells].sort(() => Math.random() - .5).slice(0, missing);
    for (const slot of slots) {
      const code = random(plan.codes); const template = byCode.get(code); if (!template) continue;
      const level = plan.levelFor(code); const hp = Math.max(100, Math.floor((Number(template.constitution) * 42 + level * 70) * 1.2));
      const [spawn] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,JSON_ARRAY())', [template.id, dungeonRegionId, slot.pos_x, slot.pos_y, z, level, template.constitution, template.spirit, template.strength, template.intelligence, template.agility, template.perception, hp, skillJson(template.skill_sequence)]);
      await connection.execute('INSERT INTO dungeon_monsters (dungeon_id,spawn_id,is_boss,is_floor_leader) VALUES (?,?,0,0)', [dungeon.id, Number(spawn.insertId)]);
      spawned += 1;
    }
  }
  return spawned;
};

/** 兼容旧迷宫：首领身份保留在 dungeon_monsters，显示与战斗词条改用通用 Boss 词条。 */
const migrateDungeonBossTraits = async (connection: Pool | PoolConnection) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT s.id FROM dungeon_monsters dm
    JOIN monster_spawns s ON s.id=dm.spawn_id
    WHERE (dm.is_boss=1 OR dm.is_floor_leader=1) AND JSON_UNQUOTE(JSON_EXTRACT(s.traits_json,'$[0].code'))='dungeon_boss'`);
  for (const row of rows) await connection.execute('UPDATE monster_spawns SET traits_json=? WHERE id=?', [JSON.stringify([randomDungeonBossTrait()]), row.id]);
};

const createDungeon = async (connection: Pool | PoolConnection) => {
  const forestId = await regionId(connection, 'dark_forest'); const dungeonRegionId = await regionId(connection, DUNGEON_REGION_CODE);
  if (!Number.isSafeInteger(forestId) || forestId <= 0 || !Number.isSafeInteger(dungeonRegionId) || dungeonRegionId <= 0) throw new Error('地下迷宫区域数据异常，无法重建。');
  const [existingEntryRows] = await connection.execute<(RowDataPacket & { pos_x: number; pos_y: number })[]>(`SELECT e.pos_x,e.pos_y FROM dungeon_entrances e
    JOIN dungeon_instances d ON d.id=e.dungeon_id WHERE d.state='active' FOR UPDATE`);
  const existingEntries = existingEntryRows.map(entry => ({ x: Number(entry.pos_x), y: Number(entry.pos_y) }));
  const entrances: Array<{ x: number; y: number }> = [];
  const fallbackEntrances: Array<[number, number]> = [[-46, -108], [40, -108], [-46, -30]];
  for (let index = 0; index < 3; index += 1) {
    for (let attempt = 0; attempt < 160; attempt += 1) {
      const x = Math.floor(Math.random() * 100) - 50; const y = Math.floor(Math.random() * 100) - 110;
      const inTown = x >= -25 && x <= 24 && y >= -135 && y <= -86;
      const tooClose = [...existingEntries, ...entrances].some(entry => Math.abs(entry.x - x) + Math.abs(entry.y - y) < 16);
      if (!inTown && !tooClose) { entrances.push({ x, y }); break; }
    }
    if (entrances.length <= index) {
      const [x, y] = fallbackEntrances[index]; entrances.push({ x, y });
    }
  }
  const entranceX = entrances[0].x; const entranceY = entrances[0].y;
  const [originRows] = await connection.execute<(RowDataPacket & { max_origin: number | null })[]>('SELECT MAX(origin_x) AS max_origin FROM dungeon_instances FOR UPDATE');
  const originX = Math.max(10, Number(originRows[0]?.max_origin ?? -20) + 28); const originY = 10;
  const [result] = await connection.execute<any>('INSERT INTO dungeon_instances (entrance_region_id,entrance_x,entrance_y,origin_x,origin_y,state) VALUES (?,?,?,?,?,\'active\')', [forestId, entranceX, entranceY, originX, originY]);
  const dungeonId = Number(result.insertId);
  for (const entrance of entrances) await connection.execute('INSERT INTO dungeon_entrances (dungeon_id,region_id,pos_x,pos_y) VALUES (?,?,?,?)', [dungeonId, forestId, entrance.x, entrance.y]);
  const cells: Array<[number, number, number, string, string | null, string | null, '青铜' | '白银' | '黄金' | null]> = [];
  const monsterSlots: Array<{ x: number; y: number; z: number; floor: number }> = [];
  const floorBossSlots: Array<{ x: number; y: number; z: number; floor: number }> = [];
  for (const [floorIndex, z] of FLOORS.entries()) {
    if (floorIndex === 2) {
      for (let x = 1; x <= 17; x += 1) {
        const type = x === 1 ? 'stairs_up' : x === 9 ? 'boss' : x === 17 ? 'chest' : 'path';
        cells.push([originX + x, originY + 1, z, type, null, null, type === 'chest' ? chestQuality(2, true) : null]);
        if ([3, 5, 7, 11, 13, 15].includes(x)) monsterSlots.push({ x: originX + x, y: originY + 1, z, floor: floorIndex });
        if (type === 'boss') floorBossSlots.push({ x: originX + x, y: originY + 1, z, floor: floorIndex });
      }
      continue;
    }
    const width = floorIndex === 0 ? 10 : 12; const height = width;
    // 保留最右两列为“首领→宝箱→石阶”的唯一出口，不能从迷宫其他路线绕过首领。
    const floorCells = mazeCells(width - 2, height); const start = key(1, 1); const bossCell = key(width - 3, height - 1); const bossChest = key(width - 2, height - 1); const stairsDown = key(width - 1, height - 1);
    const protectedCells = new Set([start, bossCell, bossChest, stairsDown]);
    const candidates = floorCells.filter(([x, y]) => !protectedCells.has(key(x, y))).sort(() => Math.random() - .5);
    const traps = candidates.splice(0, floorIndex === 0 ? 3 : 5); const chests = candidates.splice(0, floorIndex === 0 ? 3 : 4); const monsters = candidates.splice(0, floorIndex === 0 ? 13 : 20);
    const floorCellSet = new Set(floorCells.map(([x, y]) => key(x, y)));
    let junctionIndex = 0;
    for (const [x, y] of floorCells) {
      let type = 'path'; let trap: string | null = null;
      const degree = [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dx, dy]) => floorCellSet.has(key(x + dx, y + dy))).length;
      const landmark = degree >= 3 ? junctionLandmark(floorIndex, junctionIndex++) : null;
      if (key(x, y) === start) type = floorIndex === 0 ? 'entrance' : 'stairs_up';
      else if (key(x, y) === bossCell) type = 'boss';
      else if (key(x, y) === bossChest) type = 'chest';
      else if (key(x, y) === stairsDown) type = 'stairs_down';
      else if (traps.some(([tx, ty]) => tx === x && ty === y)) { type = 'trap'; trap = random(['毒针', '吸魔符文', '坍塌地砖']); }
      else if (chests.some(([tx, ty]) => tx === x && ty === y)) type = 'chest';
      cells.push([originX + x, originY + y, z, type, trap, landmark, type === 'chest' ? chestQuality(floorIndex, key(x, y) === bossChest) : null]);
    }
    if (!floorCellSet.has(bossCell)) cells.push([originX + width - 3, originY + height - 1, z, 'boss', null, null, null]);
    if (!floorCellSet.has(bossChest)) cells.push([originX + width - 2, originY + height - 1, z, 'chest', null, null, chestQuality(floorIndex, true)]);
    if (!floorCellSet.has(stairsDown)) cells.push([originX + width - 1, originY + height - 1, z, 'stairs_down', null, null, null]);
    for (const [x, y] of monsters) monsterSlots.push({ x: originX + x, y: originY + y, z, floor: floorIndex });
    floorBossSlots.push({ x: originX + width - 3, y: originY + height - 1, z, floor: floorIndex });
  }
  for (const [x, y, z, type, trap, landmark, quality] of cells) await connection.execute('INSERT INTO dungeon_cells (dungeon_id,pos_x,pos_y,pos_z,cell_type,trap_type,landmark_text,chest_quality) VALUES (?,?,?,?,?,?,?,?)', [dungeonId, x, y, z, type, trap, landmark, quality]);
  const [templates] = await connection.execute<(RowDataPacket & { id: number; code: string; level: number; constitution: number; spirit: number; strength: number; intelligence: number; agility: number; perception: number; skill_sequence: unknown })[]>(`SELECT id,code,level,constitution,spirit,strength,intelligence,agility,perception,skill_sequence FROM monster_templates WHERE code IN (${dungeonTemplateCodes.map(() => '?').join(',')},'dungeon_warden')`, dungeonTemplateCodes);
  const byCode = new Map(templates.map(template => [template.code, template]));
  for (const slot of monsterSlots) {
    const code = slot.floor === 0 ? random(firstFloorSlimes) : slot.floor === 1 ? random(secondFloorMonsters) : random(['skeleton_warrior', 'death_wight', 'undead']); const template = byCode.get(code); if (!template) continue;
    const level = slot.floor === 0 ? randomLevel(1, 9) : code === 'skeleton' || code === 'undead' ? randomLevel(16, 18) : code === 'skeleton_warrior' || code === 'death_wight' ? randomLevel(18, 20) : randomLevel(8, 16); const hp = Math.max(100, Math.floor((Number(template.constitution) * 42 + level * 70) * 1.2));
    const [spawn] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,JSON_ARRAY())', [template.id, dungeonRegionId, slot.x, slot.y, slot.z, level, template.constitution, template.spirit, template.strength, template.intelligence, template.agility, template.perception, hp, skillJson(template.skill_sequence)]);
    await connection.execute('INSERT INTO dungeon_monsters (dungeon_id,spawn_id,is_boss,is_floor_leader) VALUES (?,?,0,0)', [dungeonId, Number(spawn.insertId)]);
  }
  for (const slot of floorBossSlots) {
    const code = slot.floor === 0 ? 'black_slime' : slot.floor === 1 ? random(['skeleton_general', 'death_knight']) : 'necromancer_uz'; const boss = byCode.get(code); if (!boss) continue;
    const hp = Math.max(900, Math.floor((Number(boss.constitution) * 60 + Number(boss.level) * 120) * 4));
    const [spawn] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [boss.id, dungeonRegionId, slot.x, slot.y, slot.z, boss.level, boss.constitution, boss.spirit, boss.strength, boss.intelligence, boss.agility, boss.perception, hp, skillJson(boss.skill_sequence), JSON.stringify([randomDungeonBossTrait()])]);
    await connection.execute('INSERT INTO dungeon_monsters (dungeon_id,spawn_id,is_boss,is_floor_leader) VALUES (?,?,?,?)', [dungeonId, Number(spawn.insertId), slot.floor === 2 ? 1 : 0, slot.floor < 2 ? 1 : 0]);
  }
  return dungeonId;
};

/** 启动与整点调用：全世界仅维持一座未攻略迷宫，攻略后两小时才替换结构。 */
export const refreshDungeons = async (connection: Pool | PoolConnection, options: { refreshMonsters?: boolean } = {}) => {
  await migrateDungeonBossTraits(connection);
  await connection.execute(`UPDATE dungeon_instances SET state='closed' WHERE state='cleared' AND refresh_at<=NOW()`);
  const [activeRows] = await connection.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM dungeon_instances WHERE state<>\'closed\'');
  const missing = Math.max(0, 1 - Number(activeRows[0]?.total ?? 0));
  for (let index = 0; index < missing; index += 1) await createDungeon(connection);
  if (options.refreshMonsters) await refreshDungeonSmallMonsters(connection);
};

/** 管理面板使用的当前地下迷宫事件概览。 */
export const dungeonEvents = async () => withTransaction(async connection => {
  const dungeonRegionId = await regionId(connection, DUNGEON_REGION_CODE);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; state: 'active' | 'cleared'; entrance_region_id: number; entrance_x: number; entrance_y: number })[]>(`SELECT id,state,entrance_region_id,entrance_x,entrance_y
    FROM dungeon_instances WHERE state<>'closed' ORDER BY id DESC LIMIT 1`);
  const dungeon = rows[0]; if (!dungeon) return [];
  const [entranceRows] = await connection.execute<(RowDataPacket & { x: number; y: number })[]>('SELECT pos_x AS x,pos_y AS y FROM dungeon_entrances WHERE dungeon_id=? ORDER BY pos_x,pos_y', [dungeon.id]);
  const entrances = entranceRows.length ? entranceRows.map(row => ({ x: Number(row.x), y: Number(row.y) })) : [{ x: Number(dungeon.entrance_x), y: Number(dungeon.entrance_y) }];
  const floors = [] as Array<{ z: number; explorers: number; cleared: boolean }>;
  for (const z of FLOORS) {
    const [players] = await connection.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM characters c
      WHERE c.current_region_id=? AND c.pos_z=? AND EXISTS (SELECT 1 FROM dungeon_cells dc WHERE dc.dungeon_id=? AND dc.pos_z=? AND dc.pos_x=c.pos_x AND dc.pos_y=c.pos_y)`, [dungeonRegionId, z, dungeon.id, z]);
    const [boss] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM dungeon_monsters dm JOIN monster_spawns s ON s.id=dm.spawn_id
      WHERE dm.dungeon_id=? AND (dm.is_boss=1 OR dm.is_floor_leader=1) AND s.pos_z=? AND s.defeated_at IS NULL LIMIT 1`, [dungeon.id, z]);
    floors.push({ z, explorers: Number(players[0]?.total ?? 0), cleared: !boss[0] });
  }
  return [{ id: Number(dungeon.id), state: dungeon.state, entrances, floors }];
});

export const dungeonEntranceAt = async (connection: Pool | PoolConnection, regionId: number, x: number, y: number) => {
  const [rows] = await connection.execute<(DungeonRow & { name: string })[]>(`SELECT d.*,r.name FROM dungeon_instances d JOIN map_regions r ON r.id=d.entrance_region_id
    LEFT JOIN dungeon_entrances e ON e.dungeon_id=d.id
    WHERE d.state='active' AND ((e.region_id=? AND e.pos_x=? AND e.pos_y=?) OR (d.entrance_region_id=? AND d.entrance_x=? AND d.entrance_y=?)) LIMIT 1`, [regionId, x, y, regionId, x, y]);
  return rows[0] ? { id: Number(rows[0].id), name: rows[0].name, description: '石阶在藤蔓与雾气下裂开一道幽深的缝隙。冷风自地下涌出，仿佛有什么正在黑暗深处等待。' } : null;
};

export const dungeonCellAt = async (connection: Pool | PoolConnection, regionId: number, x: number, y: number, z: number) => {
  const [rows] = await connection.execute<DungeonCell[]>('SELECT dc.* FROM dungeon_cells dc JOIN dungeon_instances d ON d.id=dc.dungeon_id WHERE d.state=\'active\' AND dc.pos_x=? AND dc.pos_y=? AND dc.pos_z=? AND (SELECT id FROM map_regions WHERE code=\'dark_forest_dungeon\' LIMIT 1)=? LIMIT 1', [x, y, z, regionId]);
  return rows[0] ?? null;
};

/** 管理员强制重建：撤离探索者、终止相关战斗，并以最新规则生成两座新迷宫。 */
export const rebuildDungeons = async () => withTransaction(async connection => {
  const dungeonRegionId = await regionId(connection, DUNGEON_REGION_CODE);
  const [inside] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM characters WHERE current_region_id=? FOR UPDATE', [dungeonRegionId]);
  const characterIds = inside.map(row => Number(row.id));
  let moved = 0;
  const [atKnownCells] = await connection.execute<any>(`UPDATE characters c
    JOIN dungeon_cells dc ON dc.pos_x=c.pos_x AND dc.pos_y=c.pos_y AND dc.pos_z=c.pos_z
    JOIN dungeon_instances d ON d.id=dc.dungeon_id AND d.state<>'closed'
    SET c.current_region_id=d.entrance_region_id,c.pos_x=d.entrance_x,c.pos_y=d.entrance_y,c.pos_z=0
    WHERE c.current_region_id=?`, [dungeonRegionId]);
  moved += Number(atKnownCells.affectedRows ?? 0);
  const forestRegionId = await regionId(connection, 'dark_forest');
  const [stranded] = await connection.execute<any>('UPDATE characters SET current_region_id=?,pos_x=0,pos_y=-60,pos_z=0 WHERE current_region_id=?', [forestRegionId, dungeonRegionId]);
  moved += Number(stranded.affectedRows ?? 0);
  if (characterIds.length) {
    const marks = characterIds.map(() => '?').join(',');
    const [sessions] = await connection.execute<(RowDataPacket & { id: string })[]>(`SELECT DISTINCT cs.id FROM combat_sessions cs
      JOIN combat_members cm ON cm.session_id=cs.id WHERE cs.state='active' AND cm.character_id IN (${marks})`, characterIds);
    const sessionIds = sessions.map(row => String(row.id));
    if (sessionIds.length) {
      const sessionMarks = sessionIds.map(() => '?').join(',');
      await connection.execute(`UPDATE combat_sessions SET state='escaped' WHERE id IN (${sessionMarks})`, sessionIds);
      await connection.execute(`UPDATE combat_members SET pending_action=NULL WHERE session_id IN (${sessionMarks})`, sessionIds);
      await connection.execute(`DELETE FROM combat_status_effects WHERE session_id IN (${sessionMarks})`, sessionIds);
    }
    await connection.execute(`DELETE FROM encounter_escape_tokens WHERE character_id IN (${marks})`, characterIds);
  }
  await connection.execute("UPDATE dungeon_instances SET state='closed',refresh_at=NOW() WHERE state<>'closed'");
  const dungeonId = await createDungeon(connection);
  return { moved, dungeonId };
});

/** 全知者的识踪：沿当前层的可走路线寻找首领，不使用坐标直线方向。 */
export const dungeonTrackingHint = async (qqUserId: string) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId);
  if (character.secondary_profession_code !== 'omniscient') return null;
  const [parties] = await pool.execute<(RowDataPacket & { leader_character_id: number })[]>('SELECT p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=? LIMIT 1', [character.id]);
  if (parties[0] && Number(parties[0].leader_character_id) !== Number(character.id)) return null;
  const dungeonRegion = await regionId(pool, DUNGEON_REGION_CODE);
  if (Number(character.current_region_id) !== dungeonRegion) return null;
  const currentCell = await dungeonCellAt(pool, dungeonRegion, Number(character.pos_x), Number(character.pos_y), Number(character.pos_z));
  if (!currentCell) return null;
  const [bosses] = await pool.execute<(RowDataPacket & { pos_x: number; pos_y: number })[]>(`SELECT s.pos_x,s.pos_y FROM dungeon_monsters dm
    JOIN monster_spawns s ON s.id=dm.spawn_id JOIN monster_templates t ON t.id=s.template_id
    WHERE dm.dungeon_id=? AND s.pos_z=? AND t.monster_class='boss' AND s.defeated_at IS NULL
    ORDER BY dm.is_floor_leader DESC,s.id LIMIT 1`, [currentCell.dungeon_id, character.pos_z]);
  const boss = bosses[0];
  const [cells] = await pool.execute<(RowDataPacket & { pos_x: number; pos_y: number; cell_type: string })[]>('SELECT pos_x,pos_y,cell_type FROM dungeon_cells WHERE dungeon_id=? AND pos_z=?', [currentCell.dungeon_id, character.pos_z]);
  const walkable = new Set(cells.map(cell => key(Number(cell.pos_x), Number(cell.pos_y))));
  // 新迷宫优先追踪本层可达首领。旧存档中若首领位置已失效，则先引导至石阶；
  // 石阶交互会修复该层守卫，避免玩家绕过首领继续深入。
  const bossTarget = boss ? key(Number(boss.pos_x), Number(boss.pos_y)) : null;
  const stairs = cells.find(cell => cell.cell_type === 'stairs_down');
  const target = bossTarget && walkable.has(bossTarget)
    ? bossTarget
    : stairs ? key(Number(stairs.pos_x), Number(stairs.pos_y)) : null;
  if (!target) return null;
  const queue: Array<{ x: number; y: number; first: string | null }> = [{ x: Number(character.pos_x), y: Number(character.pos_y), first: null }];
  const seen = new Set([key(Number(character.pos_x), Number(character.pos_y))]);
  const directions: Array<[number, number, string]> = [[0, 1, '北'], [0, -1, '南'], [1, 0, '东'], [-1, 0, '西']];
  while (queue.length) {
    const current = queue.shift()!;
    if (key(current.x, current.y) === target) return current.first ? `你发觉${current.first}方有稍强的魔力踪迹。` : null;
    for (const [dx, dy, name] of directions) {
      const next = key(current.x + dx, current.y + dy);
      if (!walkable.has(next) || seen.has(next)) continue;
      seen.add(next); queue.push({ x: current.x + dx, y: current.y + dy, first: current.first ?? name });
    }
  }
  return null;
};

export const enterDungeon = async (qqUserId: string, dungeonId: number) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true);
  const [dungeons] = await connection.execute<DungeonRow[]>('SELECT * FROM dungeon_instances WHERE id=? AND state=\'active\' FOR UPDATE', [dungeonId]); const dungeon = dungeons[0];
  const [entrances] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM dungeon_entrances WHERE dungeon_id=? AND region_id=? AND pos_x=? AND pos_y=? LIMIT 1', [dungeonId, character.current_region_id, character.pos_x, character.pos_y]);
  const atLegacyEntrance = dungeon && Number(dungeon.entrance_region_id) === Number(character.current_region_id) && Number(dungeon.entrance_x) === Number(character.pos_x) && Number(dungeon.entrance_y) === Number(character.pos_y);
  if (!dungeon || Number(character.pos_z) !== 0 || (!entrances[0] && !atLegacyEntrance)) throw new Error('你已经离开地下迷宫入口，无法进入。');
  const { authorizeDungeonEntry } = await import('./dungeon-quest.service'); await authorizeDungeonEntry(connection, Number(character.id), dungeonId);
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
  if (cell.cell_type === 'chest' && !Number(cell.chest_opened)) return { kind: 'chest' as const, cellId: Number(cell.id), text: withLandmark(`墙角的尘埃下露出一只${cell.chest_quality ?? '青铜'}宝箱。锁扣尚未被人触碰。`) };
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
  const quality = cell.chest_quality ?? '青铜'; const z = Math.abs(Number(character.pos_z)); const cap = z <= 10 ? 500 : z <= 20 ? 1000 : 2000;
  const upper = Math.min(cap, quality === '青铜' ? (z <= 10 ? 90 : 180) : quality === '白银' ? (z <= 20 ? 420 : 900) : 1800);
  let copper = 20 + Math.floor(Math.random() * Math.max(1, upper - 19)); let silver = 0; const gold = 0;
  if (quality !== '青铜' && Math.random() < (quality === '黄金' ? .70 : .38)) { silver = 1 + Math.floor(Math.random() * (quality === '黄金' ? 4 : 2)); copper = Math.max(1, copper - silver * 100); }
  const walletValue = copper + silver * 100 + gold * 10000;
  const pool = quality === '黄金' ? ['magic_heartcore', 'meteor_iron', 'star_copper', 'moon_silver'] : quality === '白银' ? ['beast_core', 'magic_heartcore', 'living_wood', 'meteor_iron'] : ['beast_core', 'living_wood', 'meteor_iron']; const itemCode = random(pool); const quantity = 1 + Math.floor(Math.random() * (quality === '青铜' ? 2 : 3));
  await connection.execute('UPDATE dungeon_cells SET chest_opened=1 WHERE id=?', [cell.id]);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [walletValue, character.id]);
  await connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity) SELECT ?,id,? FROM item_definitions WHERE code=? ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()`, [character.id, quantity, itemCode]);
  await connection.execute(`INSERT IGNORE INTO player_item_codex (character_id,item_id) SELECT ?,id FROM item_definitions WHERE code=?`, [character.id, itemCode]);
  const [item] = await connection.execute<(RowDataPacket & { name: string })[]>('SELECT name FROM item_definitions WHERE code=?', [itemCode]);
  return { quality, copper, silver, gold, name: item[0]?.name ?? '未知材料', quantity };
});

export const changeDungeonFloor = async (qqUserId: string, direction: 'down' | 'up' | 'leave' | 'escape') => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); const cell = await dungeonCellAt(connection, Number(character.current_region_id), Number(character.pos_x), Number(character.pos_y), Number(character.pos_z));
  if (!cell) throw new Error('你当前不在可通行的地下迷宫格子中。');
  const [dungeons] = await connection.execute<DungeonRow[]>('SELECT d.* FROM dungeon_instances d JOIN dungeon_cells dc ON dc.dungeon_id=d.id WHERE dc.id=? AND d.state=\'active\' FOR UPDATE', [cell.id]); const dungeon = dungeons[0]; if (!dungeon) throw new Error('这座迷宫已经关闭。');
  if (direction === 'leave' || direction === 'escape') {
    let usedTeleporter = false;
    if (cell.cell_type !== 'entrance' || direction === 'escape') {
      const [consume] = await connection.execute<any>(`UPDATE player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
        SET pi.quantity=pi.quantity-1 WHERE pi.character_id=? AND i.code='demon_breaker_teleporter' AND pi.quantity>0`, [character.id]);
      if (Number(consume.affectedRows) !== 1) throw new Error(direction === 'escape' ? '脱离地下迷宫需要一枚破魔传送器。' : '只能从第一层入口离开迷宫；持有破魔传送器时可从任意位置强制脱离。');
      await connection.execute(`DELETE pi FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
        WHERE pi.character_id=? AND i.code='demon_breaker_teleporter' AND pi.quantity<=0`, [character.id]);
      usedTeleporter = true;
    }
    await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=0 WHERE id=?', [dungeon.entrance_region_id, dungeon.entrance_x, dungeon.entrance_y, character.id]);
    return { action: 'leave' as const, x: Number(dungeon.entrance_x), y: Number(dungeon.entrance_y), z: 0, usedTeleporter };
  }
  const expected = direction === 'down' ? 'stairs_down' : 'stairs_up'; if (cell.cell_type !== expected) throw new Error(direction === 'down' ? '这里没有通向下一层的石阶。' : '这里没有通向上一层的石阶。');
  if (direction === 'down') {
    const [leaders] = await connection.execute<(RowDataPacket & { id: number; name: string; pos_x: number; pos_y: number })[]>(`SELECT s.id,t.name,s.pos_x,s.pos_y FROM dungeon_monsters dm
      JOIN monster_spawns s ON s.id=dm.spawn_id JOIN monster_templates t ON t.id=s.template_id
      WHERE dm.dungeon_id=? AND s.pos_z=? AND t.monster_class='boss' AND s.defeated_at IS NULL LIMIT 1 FOR UPDATE`, [dungeon.id, character.pos_z]);
    const leader = leaders[0];
    if (leader) {
      // 旧迷宫曾把首领放进不可通行的宝箱坐标；在首次尝试下楼时移到石阶前的可走格修正。
      const [leaderCell] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM dungeon_cells WHERE dungeon_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1', [dungeon.id, leader.pos_x, leader.pos_y, character.pos_z]);
      if (!leaderCell[0]) {
        const [guardCells] = await connection.execute<DungeonCell[]>(`SELECT * FROM dungeon_cells WHERE dungeon_id=? AND pos_z=? AND cell_type IN ('path','trap','boss')
          ORDER BY ABS(pos_x-?)+ABS(pos_y-?),id LIMIT 1`, [dungeon.id, character.pos_z, cell.pos_x, cell.pos_y]);
        if (guardCells[0]) await connection.execute('UPDATE monster_spawns SET pos_x=?,pos_y=? WHERE id=?', [guardCells[0].pos_x, guardCells[0].pos_y, leader.id]);
      }
      throw new Error(`【${leader.name}】仍守在通往下一层的道路上。击败它后，石阶才会开启。`);
    }
  }
  const targetZ = Number(character.pos_z) + (direction === 'down' ? -10 : 10); const targetType = direction === 'down' ? 'stairs_up' : Number(targetZ) === -10 ? 'entrance' : 'stairs_down';
  const [target] = await connection.execute<DungeonCell[]>('SELECT * FROM dungeon_cells WHERE dungeon_id=? AND pos_z=? AND cell_type=? LIMIT 1', [dungeon.id, targetZ, targetType]); if (!target[0]) throw new Error('楼层之间的石阶已经坍塌。');
  await connection.execute('UPDATE characters SET pos_x=?,pos_y=?,pos_z=? WHERE id=?', [target[0].pos_x, target[0].pos_y, target[0].pos_z, character.id]);
  return { action: direction, x: Number(target[0].pos_x), y: Number(target[0].pos_y), z: Number(target[0].pos_z) };
});

export const dungeonPlayersInRange = async (connection: Pool | PoolConnection, characterId: number, regionIdValue: number, x: number, y: number, z: number, range: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { game_id: number; name: string; pos_x: number; pos_y: number; wanted: number; in_home: number })[]>(`SELECT c.game_id,c.name,c.pos_x,c.pos_y,hv.character_id IS NOT NULL AS in_home,
    EXISTS(SELECT 1 FROM player_warrants w WHERE w.wanted_character_id=c.id AND w.city_region_id=c.current_region_id AND w.status='active') AS wanted
    FROM characters c LEFT JOIN player_home_visits hv ON hv.character_id=c.id
    WHERE c.current_region_id=? AND c.pos_z=? AND c.id<>? AND c.npc_code IS NULL AND ABS(c.pos_x-?)+ABS(c.pos_y-?)<=?
      AND (hv.character_id IS NULL OR EXISTS(SELECT 1 FROM player_warrants w WHERE w.wanted_character_id=c.id AND w.city_region_id=? AND w.status='active'))`, [regionIdValue, z, characterId, x, y, range, regionIdValue]);
  return rows.map(row => ({ gameId: Number(row.game_id), name: row.name, x: Number(row.pos_x), y: Number(row.pos_y), wanted: Boolean(row.wanted), inHome: Boolean(row.in_home) }));
};

type PvpAction = { type: 'attack' } | { type: 'skill'; name: string; category: 'physical' | 'magic' | 'utility'; manaCost: number; power: number } | { type: 'item'; id: number; name: string; effect: Record<string, number> };
const pvpActionFor = async (connection: PoolConnection, character: CharacterRow, manual = false): Promise<PvpAction> => {
  const [settings] = await connection.execute<(RowDataPacket & { enabled: number; auto_potion_enabled: number; hp_threshold: number; hp_item_id: number | null; mp_threshold: number; mp_item_id: number | null; action_cursor: number })[]>('SELECT * FROM player_pvp_auto_battle_settings WHERE character_id=? FOR UPDATE', [character.id]); const setting = settings[0];
  if (setting?.enabled) {
    const lowHp = Number(character.current_hp) * 100 <= Number(character.hp_max) * Number(setting.hp_threshold); const lowMp = Number(character.current_mp) * 100 <= Number(character.mp_max) * Number(setting.mp_threshold); const potionId = Number(setting.auto_potion_enabled) ? (lowHp ? setting.hp_item_id : lowMp ? setting.mp_item_id : null) : null;
    if (potionId) { const [items] = await connection.execute<(RowDataPacket & { id: number; name: string; effect_json: unknown })[]>('SELECT i.id,i.name,i.effect_json FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 AND i.item_type=\'consumable\' LIMIT 1 FOR UPDATE', [character.id, potionId]); if (items[0]) return { type: 'item', id: Number(items[0].id), name: items[0].name, effect: typeof items[0].effect_json === 'string' ? JSON.parse(items[0].effect_json) : (items[0].effect_json as Record<string, number> ?? {}) }; }
    const [actions] = await connection.execute<(RowDataPacket & { name: string; category: 'physical' | 'magic' | 'utility'; mana_cost: number; power: number })[]>('SELECT s.name,s.category,s.mana_cost,s.power FROM player_pvp_auto_battle_actions a JOIN player_skills ps ON ps.character_id=a.character_id AND ps.skill_id=a.skill_id JOIN skill_definitions s ON s.id=a.skill_id WHERE a.character_id=? ORDER BY a.sequence_no', [character.id]);
    if (actions.length) { const picked = actions[(Math.max(1, Number(setting.action_cursor)) - 1) % actions.length]; await connection.execute('UPDATE player_pvp_auto_battle_settings SET action_cursor=action_cursor+1 WHERE character_id=?', [character.id]); return { type: 'skill', name: picked.name, category: picked.category, manaCost: Number(picked.mana_cost), power: Number(picked.power) }; }
    return { type: 'attack' };
  }
  if (manual) return { type: 'attack' };
  const [quick] = await connection.execute<(RowDataPacket & { name: string; category: 'physical' | 'magic' | 'utility'; mana_cost: number; power: number })[]>('SELECT s.name,s.category,s.mana_cost,s.power FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot IS NOT NULL AND s.category IN (\'physical\',\'magic\',\'utility\') ORDER BY ps.quick_slot', [character.id]);
  if (!quick.length) return { type: 'attack' }; const picked = random(quick); return { type: 'skill', name: picked.name, category: picked.category, manaCost: Number(picked.mana_cost), power: Number(picked.power) };
};
const resolvePvpAction = async (connection: PoolConnection, actor: CharacterRow, target: CharacterRow, action: PvpAction) => {
  if (action.type === 'item') { const oldHp = Number(actor.current_hp); const oldMp = Number(actor.current_mp); const hp = Math.min(Number(actor.hp_max), oldHp + Number(action.effect.heal ?? 0)); const mp = Math.min(Number(actor.mp_max), oldMp + Number(action.effect.restoreMp ?? 0)); await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=? AND quantity>0', [actor.id, action.id]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [actor.id, action.id]); await connection.execute('UPDATE characters SET current_hp=?,current_mp=? WHERE id=?', [hp, mp, actor.id]); actor.current_hp = hp; actor.current_mp = mp; return `【${actor.name}】使用【${action.name}】，HP ${oldHp}→${hp}｜MP ${oldMp}→${mp}。`; }
  const skill = action.type === 'skill' && Number(actor.current_mp) >= action.manaCost ? action : null; if (action.type === 'skill' && !skill) return resolvePvpAction(connection, actor, target, { type: 'attack' });
  if (skill) { actor.current_mp = Number(actor.current_mp) - skill.manaCost; await connection.execute('UPDATE characters SET current_mp=? WHERE id=?', [actor.current_mp, actor.id]); }
  if (skill?.category === 'utility') return `【${actor.name}】释放技能「${skill.name}」，但该辅助技能尚未在 PvP 对抗中形成直接伤害。`;
  const magic = skill?.category === 'magic'; const attack = magic ? Number(actor.magic_attack) : Number(actor.physical_attack); const defense = magic ? Number(target.magic_defense) : Number(target.physical_defense); const label = skill ? `释放技能「${skill.name}」` : '普通攻击';
  if (Math.random() >= Number(actor.accuracy) / Math.max(1, Number(actor.accuracy) + Number(target.evasion))) return `【${actor.name}】${label}，但【${target.name}】闪避了攻击。`;
  const damage = Math.max(1, Math.floor(attack * attack / Math.max(1, attack + defense) * (skill ? skill.power / 100 : 1))); const hp = Math.max(0, Number(target.current_hp) - damage); const defeated = hp <= 0;
  if (defeated) {
    const settlement = await resolvePvpVictory(connection, Number(actor.id), Number(target.id)); target.current_hp = 1;
    return `【${actor.name}】${label}，对【${target.name}】造成 ${damage} 点${magic ? '魔法' : '物理'}伤害。${settlement}`;
  }
  await connection.execute('UPDATE characters SET current_hp=? WHERE id=?', [hp, target.id]); target.current_hp = hp;
  return `【${actor.name}】${label}，对【${target.name}】造成 ${damage} 点${magic ? '魔法' : '物理'}伤害（HP ${hp}）`;
};

export const dungeonPvP = async (qqUserId: string, targetGameId: number) => withTransaction(async connection => {
  const attacker = await characterFor(connection, qqUserId, true);
  const dungeonRegion = await regionId(connection, DUNGEON_REGION_CODE); if (Number(attacker.current_region_id) !== dungeonRegion) throw new Error('只能在地下迷宫内进行 PvP。');
  const [targets] = await connection.execute<CharacterRow[]>('SELECT * FROM characters WHERE game_id=? AND npc_code IS NULL FOR UPDATE', [targetGameId]); const target = targets[0];
  if (!target || Number(target.id) === Number(attacker.id) || Number(target.current_region_id) !== dungeonRegion || Number(target.pos_z) !== Number(attacker.pos_z) || Math.abs(Number(target.pos_x) - Number(attacker.pos_x)) + Math.abs(Number(target.pos_y) - Number(attacker.pos_y)) > 1) throw new Error('目标不在你相邻的地下迷宫格子中。');
  const opening = await resolvePvpAction(connection, attacker, target, await pvpActionFor(connection, attacker, true));
  const response = Number(target.current_hp) > 1 ? await resolvePvpAction(connection, target, attacker, await pvpActionFor(connection, target)) : null;
  return { text: [opening, response].filter(Boolean).join('\n') };
});

/** 玩家互动不进入战斗；目标移动后会在这里再次校验位置。
 * 城镇与地下迷宫共用这条命令，不能把城镇玩家误判成“离开感知范围”。
 */
export const interactDungeonPlayer = async (qqUserId: string, targetGameId: number) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true);
  const [targets] = await connection.execute<CharacterRow[]>('SELECT * FROM characters WHERE game_id=? AND npc_code IS NULL FOR UPDATE', [targetGameId]); const target = targets[0];
  const dungeonRegion = await regionId(connection, DUNGEON_REGION_CODE);
  const range = Number(character.current_region_id) === dungeonRegion ? 1 : interactionRange(character);
  if (!target || Number(target.id) === Number(character.id) || Number(target.current_region_id) !== Number(character.current_region_id) || Number(target.pos_z) !== Number(character.pos_z) || Math.abs(Number(target.pos_x) - Number(character.pos_x)) + Math.abs(Number(target.pos_y) - Number(character.pos_y)) > range) throw new Error('对方已经离开你的感知范围。');
  return { name: target.name, text: `你向【${target.name}】打了个招呼。对方也朝你点了点头。` };
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
