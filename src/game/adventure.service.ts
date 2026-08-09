import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';

type CharacterRow = RowDataPacket & { id: number; name: string; level: number; experience: number; hp_max: number; mp_max: number; physical_attack: number; magic_attack: number; physical_defense: number; magic_defense: number; accuracy: number; evasion: number; crit_rate_bp: number; crit_damage_bp: number; crit_resist_bp: number; crit_damage_reduction_bp: number; speed: number; perception: number; spirit: number; intelligence: number; adventurer_registered: number; current_region_id: number; pos_x: number; pos_y: number; pos_z: number; region_name: string };
type SpawnRow = RowDataPacket & { id: number; template_id?: number; name: string; monster_class: string; level: number; current_hp: number; hp_max: number; attack: number; defense: number; speed: number; perception: number; charisma: number; experience: number; drops_json: string | null; skill_sequence?: unknown };
type CombatModifiers = { weaponName?: string; physicalAttack: number; magicAttack: number; critRateBp: number; ignoreDefensePct: number; lifestealPct: number; magicDamagePct: number; manaCostReduction: number; experienceMultiplier: number; dropBonus: number; manaAffinity: boolean };
const pickWeighted = <T extends { spawn_weight: number }>(items: T[]) => {
  const total = items.reduce((sum, item) => sum + Number(item.spawn_weight), 0);
  let roll = Math.random() * total;
  for (const item of items) { roll -= Number(item.spawn_weight); if (roll < 0) return item; }
  return items[items.length - 1];
};
const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const jsonObject = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  return typeof value === 'string' ? JSON.parse(value) as Record<string, unknown> : value as Record<string, unknown>;
};
const stringList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : typeof parsed === 'string' ? [parsed] : [];
  } catch { return value.split(',').map(item => item.trim()).filter(Boolean); }
};
const movementSpeedFrom = (speed: number, level: number) => {
  const statSpeed = Math.floor(1 + Math.sqrt(Math.max(0, speed - 100) / 30));
  const levelCap = Math.min(10, 3 + Math.floor(Math.max(0, level - 1) / 10));
  return Math.max(1, Math.min(10, levelCap, statSpeed));
};

const characterFor = async (qqUserId: string): Promise<CharacterRow> => {
  const [rows] = await (await getPool()).execute<CharacterRow[]>(`SELECT c.*, r.name AS region_name FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id WHERE p.qq_user_id=? LIMIT 1`, [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  return rows[0];
};

const modifiersFor = async (connection: PoolConnection, characterId: number): Promise<CombatModifiers> => {
  const [rows] = await connection.execute<(RowDataPacket & { name: string | null; effect_json: string | null; blessing: string | null })[]>(`SELECT i.name,i.effect_json,b.code AS blessing FROM characters c LEFT JOIN player_equipment pe ON pe.character_id=c.id AND pe.slot='weapon' LEFT JOIN item_definitions i ON i.id=pe.item_id LEFT JOIN player_blessings b ON b.character_id=c.id WHERE c.id=?`, [characterId]);
  const effect = jsonObject(rows[0]?.effect_json);
  const blessing = rows[0]?.blessing;
  return { weaponName: rows[0]?.name ?? undefined, physicalAttack: Number(effect.physicalAttack ?? 0), magicAttack: Number(effect.magicAttack ?? 0), critRateBp: Number(effect.critRateBp ?? 0), ignoreDefensePct: Number(effect.ignoreDefensePct ?? 0), lifestealPct: Number(effect.lifestealPct ?? 0), magicDamagePct: Number(effect.magicDamagePct ?? 0), manaCostReduction: Number(effect.manaCostReduction ?? 0), experienceMultiplier: blessing === 'growth_blessing' ? 2 : 1, dropBonus: blessing === 'lucky_favor' ? 0.2 : 0, manaAffinity: blessing === 'mana_affinity' };
};

export const spawnMonsters = async () => {
  const pool = await getPool();
  const [regions] = await pool.execute<(RowDataPacket & { id: number; min_x: number; max_x: number; min_y: number; max_y: number; min_z: number; max_z: number })[]>('SELECT id,min_x,max_x,min_y,max_y,min_z,max_z FROM map_regions WHERE is_spawn_enabled=1');
  for (const region of regions) {
    const [templates] = await pool.execute<(RowDataPacket & { id: number; hp_max: number; monster_class: string; spawn_weight: number })[]>('SELECT t.id,t.hp_max,t.monster_class,p.spawn_weight FROM map_monster_pools p JOIN monster_templates t ON t.id=p.monster_template_id WHERE p.region_id=?', [region.id]);
    if (!templates.length) continue;
    const [blockedRows] = await pool.execute<(RowDataPacket & { pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pos_x,pos_y,pos_z FROM map_npcs WHERE region_id=? AND pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL
      UNION SELECT pos_x,pos_y,pos_z FROM map_special_objects WHERE region_id=?`, [region.id, region.id]);
    const blocked = new Set(blockedRows.map(row => `${row.pos_x},${row.pos_y},${row.pos_z}`));
    const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM monster_spawns WHERE region_id=? AND defeated_at IS NULL', [region.id]);
    const area = (region.max_x - region.min_x + 1) * (region.max_y - region.min_y + 1) * (region.max_z - region.min_z + 1);
    const spawnLimit = Math.floor(area * 0.01);
    for (let i = Number(countRows[0].total); i < spawnLimit; i++) {
      const template = pickWeighted(templates);
      let x = random(region.min_x, region.max_x); let y = random(region.min_y, region.max_y); let z = random(region.min_z, region.max_z);
      for (let attempt = 0; attempt < 32 && blocked.has(`${x},${y},${z}`); attempt++) { x = random(region.min_x, region.max_x); y = random(region.min_y, region.max_y); z = random(region.min_z, region.max_z); }
      if (blocked.has(`${x},${y},${z}`)) continue;
      await pool.execute('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,current_hp) VALUES (?,?,?,?,?,?)', [template.id, region.id, x, y, z, template.hp_max]);
    }
  }
};

export const inventory = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { name: string; quantity: number; weight: number; quick_slot: number | null; equipped_slot: string | null })[]>(`SELECT i.name, pi.quantity, i.weight, qi.quick_slot, pe.slot AS equipped_slot FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id LEFT JOIN player_quick_items qi ON qi.character_id=pi.character_id AND qi.item_id=pi.item_id LEFT JOIN player_equipment pe ON pe.character_id=pi.character_id AND pe.item_id=pi.item_id WHERE pi.character_id=? ORDER BY i.name`, [character.id]);
  const weight = rows.reduce((sum, item) => sum + Number(item.quantity) * Number(item.weight), 0);
  const speedPenalty = Math.floor(weight / 5) * 2;
  const speed = Math.max(1, Number(character.speed) - speedPenalty);
  return { items: rows, weight, capacity: 30, speed, movementSpeed: movementSpeedFrom(speed, Number(character.level)), speedPenalty };
};

export const inventoryView = async (qqUserId: string, category?: '装备' | '道具' | '材料') => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  await pool.execute(`INSERT IGNORE INTO player_item_codex (character_id,item_id)
    SELECT ?,item_id FROM player_inventory WHERE character_id=? UNION SELECT ?,item_id FROM player_item_instances WHERE character_id=?`, [character.id, character.id, character.id, character.id]);
  const itemType = category === '装备' ? 'equipment' : category === '道具' ? 'consumable' : 'material';
  const [stacked] = await pool.execute<(RowDataPacket & { codex_id: string; name: string; item_category: string; quantity: number; description: string })[]>('SELECT i.codex_id,i.name,i.item_category,pi.quantity,i.description FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.item_type=? AND i.stackable=1 ORDER BY i.name', [character.id, itemType]);
  const [instances] = await pool.execute<(RowDataPacket & { id: number; definition_codex_id: string; name: string; item_category: string; quality: number; durability: number; durability_max: number; description: string })[]>('SELECT ii.id,i.codex_id AS definition_codex_id,i.name,i.item_category,ii.quality,ii.durability,ii.durability_max,i.description FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.character_id=? AND i.item_type=? ORDER BY ii.acquired_at DESC', [character.id, itemType]);
  const [recent] = await pool.execute<(RowDataPacket & { codex_id: string; item_type: string; item_category: string; name: string })[]>(`SELECT codex_id,item_type,item_category,name FROM (
      SELECT i.codex_id,i.item_type,i.item_category,i.name,ii.acquired_at FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.character_id=?
      UNION ALL SELECT i.codex_id,i.item_type,i.item_category,i.name,pi.acquired_at FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=?
    ) recent_items ORDER BY acquired_at DESC LIMIT 5`, [character.id, character.id]);
  return { stacked, instances, recent };
};

export const itemCodex = async (qqUserId: string, codexId: string) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & { codex_id: string; name: string; item_type: string; item_category: string; description: string; weight: number; stackable: number; effect_json: string | null })[]>(`SELECT i.codex_id,i.name,i.item_type,i.item_category,i.description,i.weight,i.stackable,i.effect_json FROM player_item_codex c JOIN item_definitions i ON i.id=c.item_id WHERE c.character_id=? AND i.codex_id=?`, [character.id, codexId]);
  if (!rows[0]) throw new Error('尚未解锁该物品图鉴。');
  return rows[0];
};

export const equipmentDetail = async (qqUserId: string, instanceId: number) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & { name: string; item_category: string; quality: number; durability: number; durability_max: number; effect_json: unknown; description: string })[]>(`
    SELECT i.name,i.item_category,ii.quality,ii.durability,ii.durability_max,COALESCE(ii.effect_json,i.effect_json) AS effect_json,i.description
    FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    WHERE ii.id=? AND ii.character_id=? AND i.item_type='equipment'
  `, [instanceId, character.id]);
  if (!rows[0]) throw new Error('未找到该装备。');
  return rows[0];
};

export const equipment = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & { slot: string; name: string; description: string })[]>('SELECT pe.slot,i.name,i.description FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id WHERE pe.character_id=? ORDER BY pe.slot', [character.id]);
  return rows;
};

export const skillList = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & { quick_slot: number | null; name: string; description: string; mana_cost: number })[]>('SELECT ps.quick_slot,s.name,s.description,s.mana_cost FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? ORDER BY ps.quick_slot', [character.id]);
  return rows;
};

export const partyInfo = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & { member_count: number; leader_name: string })[]>(`SELECT COUNT(pm2.character_id) AS member_count, leader.name AS leader_name FROM party_members pm JOIN parties p ON p.id=pm.party_id JOIN characters leader ON leader.id=p.leader_character_id JOIN party_members pm2 ON pm2.party_id=p.id WHERE pm.character_id=? GROUP BY p.id,leader.name`, [character.id]);
  return rows[0] ?? null;
};

export const explore = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  const [spawns] = await pool.execute<SpawnRow[]>(`SELECT s.id,t.name,t.monster_class,t.level,s.current_hp,t.hp_max,t.attack,t.defense,t.speed,t.perception,t.charisma,t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (!spawns.length) return { character, spawns, text: '四周只有风吹树叶的声音。这里暂时没有敌对生物。' };
  const charm = Math.floor((Number(character.spirit) + Number(character.intelligence)) / 2);
  const text = `你发现 ${spawns.map(s => `#${s.id} ${s.name} Lv.${s.level}`).join('、')}。\n\n感知 ${character.perception}｜负重后速度 ${character.speed}｜魅力 ${charm}\n感知与速度高于敌人时可偷袭；感知较高可尝试躲避；魅力较高可交涉。`;
  return { character, spawns, text };
};

export type NearbyPoint = { type: '怪物' | 'NPC' | '地标'; name: string; x: number; y: number; distance: number };

const perceptionRange = (perception: number) => Math.max(2, Math.floor(perception / 5));

export const nearbyPoints = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const range = perceptionRange(Number(character.perception));
  const pool = await getPool();
  const bounds = [character.current_region_id, Number(character.pos_x) - range, Number(character.pos_x) + range, Number(character.pos_y) - range, Number(character.pos_y) + range, character.pos_z];
  const [monsters] = await pool.execute<(RowDataPacket & { name: string; x: number; y: number })[]>(`SELECT t.name,s.pos_x AS x,s.pos_y AS y FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x BETWEEN ? AND ? AND s.pos_y BETWEEN ? AND ? AND s.pos_z=? AND s.defeated_at IS NULL`, bounds);
  const [npcs] = await pool.execute<(RowDataPacket & { name: string; x: number; y: number })[]>(`SELECT name,pos_x AS x,pos_y AS y FROM map_npcs WHERE region_id=? AND pos_x BETWEEN ? AND ? AND pos_y BETWEEN ? AND ? AND pos_z=?`, bounds);
  const [objects] = await pool.execute<(RowDataPacket & { name: string; x: number; y: number })[]>(`SELECT name,pos_x AS x,pos_y AS y FROM map_special_objects WHERE region_id=? AND pos_x BETWEEN ? AND ? AND pos_y BETWEEN ? AND ? AND pos_z=?`, bounds);
  const [descriptions] = await pool.execute<(RowDataPacket & { description: string })[]>('SELECT description FROM map_move_texts WHERE region_id=? ORDER BY RAND() LIMIT 1', [character.current_region_id]);
  const point = (type: NearbyPoint['type'], item: { name: string; x: number; y: number }): NearbyPoint => ({ type, name: item.name, x: Number(item.x), y: Number(item.y), distance: Math.max(Math.abs(Number(item.x) - Number(character.pos_x)), Math.abs(Number(item.y) - Number(character.pos_y))) });
  const points = [...monsters.map(item => point('怪物', item)), ...npcs.map(item => point('NPC', item)), ...objects.map(item => point('地标', item))]
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name, 'zh-CN'));
  return { character, range, points, description: descriptions[0]?.description ?? '四周一片寂静，暂时没有发现异常。' };
};

const moveToPosition = async (connection: PoolConnection, qqUserId: string, x: number, y: number, restrictToPerception: boolean, speedLimit?: number) => {
  const character = await characterFor(qqUserId);
  const [activeCombat] = await connection.execute<RowDataPacket[]>('SELECT id FROM combat_sessions WHERE character_id=? AND state=\'active\' FOR UPDATE', [character.id]);
  if (activeCombat.length) throw new Error('战斗尚未结束，无法移动。');
  const [partyRows] = await connection.execute<(RowDataPacket & { leader_character_id: number })[]>('SELECT p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=?', [character.id]);
  if (partyRows[0] && Number(partyRows[0].leader_character_id) !== character.id) throw new Error('组队状态下仅队长可以移动。');
  const distance = Math.max(Math.abs(x - Number(character.pos_x)), Math.abs(y - Number(character.pos_y)));
  if (restrictToPerception && distance > perceptionRange(Number(character.perception))) throw new Error('该位置超出你的感知范围。');
  if (speedLimit !== undefined && distance >= speedLimit) throw new Error(`当前移动速度为 ${speedLimit}，一次移动距离必须小于移动速度。`);
  const [regions] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM map_regions WHERE ? BETWEEN min_x AND max_x AND ? BETWEEN min_y AND max_y AND ? BETWEEN min_z AND max_z ORDER BY danger_level DESC LIMIT 1', [x, y, character.pos_z]);
  const region = regions[0]; if (!region) throw new Error('\n\n前面的区域，以后再来探索吧！');
  if (partyRows[0]) await connection.execute('UPDATE characters c JOIN party_members pm ON pm.character_id=c.id SET c.current_region_id=?,c.pos_x=?,c.pos_y=? WHERE pm.party_id=(SELECT party_id FROM party_members WHERE character_id=? LIMIT 1)', [region.id, x, y, character.id]);
  else await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=? WHERE id=?', [region.id, x, y, character.id]);
  const [spawns] = await connection.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,t.level,s.current_hp,t.hp_max,t.attack,t.defense,t.speed,t.perception,t.charisma,t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL FOR UPDATE`, [region.id, x, y, character.pos_z]);
  const moved = { ...character, current_region_id: region.id, region_name: region.name, pos_x: x, pos_y: y };
  if (spawns.length) {
    const [texts] = await connection.execute<(RowDataPacket & { description: string })[]>('SELECT description FROM monster_encounter_texts WHERE monster_template_id=? ORDER BY RAND() LIMIT 1', [spawns[0].template_id]);
    return { character: moved, kind: 'encounter' as const, spawns, text: texts[0]?.description ?? `${spawns[0].name} 拦住了你的去路。` };
  }
  const [texts] = await connection.execute<(RowDataPacket & { description: string })[]>('SELECT description FROM map_move_texts WHERE region_id=? ORDER BY RAND() LIMIT 1', [region.id]);
  return { character: moved, kind: 'event' as const, text: texts[0]?.description ?? '四周一片寂静，暂时没有发现异常。' };
};

export const move = async (qqUserId: string, direction: string) => withTransaction(async connection => {
  const delta: Record<string, [number, number]> = { 上: [0, 1], 下: [0, -1], 左: [-1, 0], 右: [1, 0] };
  if (!delta[direction]) throw new Error('方向只能是 上、下、左、右。');
  const character = await characterFor(qqUserId);
  return moveToPosition(connection, qqUserId, Number(character.pos_x) + delta[direction][0], Number(character.pos_y) + delta[direction][1], false);
});

export const moveTo = async (qqUserId: string, x: number, y: number) => {
  if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error('目标坐标必须为整数。');
  const carry = await inventory(qqUserId);
  return withTransaction(async connection => moveToPosition(connection, qqUserId, x, y, true, carry.movementSpeed));
};

export const chooseTarget = async (qqUserId: string, spawnId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [spawns] = await connection.execute<SpawnRow[]>(`SELECT s.id,t.name,t.monster_class,t.level,s.current_hp,t.hp_max,t.attack,t.defense,t.speed,t.perception,t.charisma,t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.id=? AND s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL FOR UPDATE`, [spawnId, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  const spawn = spawns[0]; if (!spawn) throw new Error('目标已离开当前位置或已被击败。');
  const [old] = await connection.execute<RowDataPacket[]>('SELECT id FROM combat_sessions WHERE character_id=? AND state=\'active\' FOR UPDATE', [character.id]);
  if (old.length) throw new Error('你正在战斗中，请先结束当前战斗。');
  const id = randomUUID();
  await connection.execute('INSERT INTO combat_sessions (id,character_id,spawn_id,player_hp,player_mp,cooldowns) VALUES (?,?,?,?,?,JSON_OBJECT())', [id, character.id, spawn.id, character.hp_max, character.mp_max]);
  return { character, spawn, playerHp: Number(character.hp_max), playerMp: Number(character.mp_max) };
});

export const encounterAction = async (qqUserId: string, spawnId: number, action: 'avoid' | 'persuade') => {
  const found = await explore(qqUserId);
  const spawn = found.spawns.find(item => item.id === spawnId);
  if (!spawn) throw new Error('该目标不在当前位置。');
  const charm = Math.floor((Number(found.character.spirit) + Number(found.character.intelligence)) / 2);
  if (action === 'avoid') {
    if (Number(found.character.perception) + random(1, 20) >= Number(spawn.perception)) return '你借助感知绕开了敌人，没有进入战斗。';
    const started = await chooseTarget(qqUserId, spawnId); return `躲避失败！\n目标：${started.spawn.name}\n进入战斗：/攻击｜/技能 1-4｜/道具 1-4｜/逃跑`;
  }
  if (action === 'persuade') {
    if (charm + random(1, 20) >= Number(spawn.charisma) + 12) return `你以诚意打动了 ${spawn.name}。它暂时退去，未发生战斗。`;
    const started = await chooseTarget(qqUserId, spawnId); return `交涉失败！${started.spawn.name} 露出敌意。\n进入战斗：/攻击｜/技能 1-4｜/道具 1-4｜/逃跑`;
  }
  throw new Error('未知的遇战操作。');
};

const combatRow = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & SpawnRow & { combat_id: string; player_hp: number; player_mp: number; cooldowns: string; turn_no: number })[]>(`SELECT cs.id AS combat_id,cs.player_hp,cs.player_mp,cs.cooldowns,cs.turn_no,s.id,t.name,t.monster_class,t.level,s.current_hp,t.hp_max,t.attack,t.defense,t.speed,t.perception,t.charisma,t.experience,t.drops_json,t.skill_sequence FROM combat_sessions cs JOIN monster_spawns s ON s.id=cs.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE cs.character_id=? AND cs.state='active'`, [character.id]);
  if (!rows[0]) throw new Error('当前不在战斗中。请移动到敌对生物所在格子。');
  return { character, combat: rows[0] };
};

export const battleStatus = async (qqUserId: string) => {
  const { character, combat } = await combatRow(qqUserId);
  return {
    targetId: Number(combat.id), targetName: String(combat.name), targetHp: Number(combat.current_hp), targetHpMax: Number(combat.hp_max),
    playerHp: Number(combat.player_hp), playerHpMax: Number(character.hp_max), playerMp: Number(combat.player_mp), playerMpMax: Number(character.mp_max), turn: Number(combat.turn_no)
  };
};

const finishVictory = async (connection: PoolConnection, character: CharacterRow, combat: any) => {
  await connection.execute('UPDATE monster_spawns SET defeated_at=NOW(),current_hp=0 WHERE id=?', [combat.id]);
  await connection.execute('UPDATE combat_sessions SET state=\'victory\' WHERE combat_sessions.id=?', [combat.combat_id]);
  const modifiers = await modifiersFor(connection, character.id);
  const experience = Number(combat.experience) * modifiers.experienceMultiplier;
  await connection.execute('UPDATE characters SET level=GREATEST(level, FLOOR((experience+?)/100)+1), experience=experience+? WHERE id=?', [experience, experience, character.id]);
  const drops = combat.drops_json ? JSON.parse(combat.drops_json) : [];
  const rewards: string[] = [];
  for (const drop of drops) if (Math.random() <= Math.min(1, Number(drop.chance ?? 1) + modifiers.dropBonus)) {
    const [items] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM item_definitions WHERE code=?', [drop.code]);
    if (items[0]) { await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [character.id, items[0].id, drop.quantity ?? 1]); rewards.push(`${items[0].name}×${drop.quantity ?? 1}`); }
  }
  return `胜利！获得经验 ${experience}${modifiers.experienceMultiplier > 1 ? '（成长祝福生效）' : ''}${rewards.length ? `，掉落 ${rewards.join('、')}` : ''}。`;
};

const opposedChance = (offense: number, defense: number) => {
  const x = Math.max(1, Number(offense)); const y = Math.max(1, Number(defense));
  return x / (x + y);
};

const resolveStrike = (attack: number, defense: number, accuracy: number, evasion: number, crit: number, critResist: number, critDamage: number, critReduction: number) => {
  if (Math.random() >= opposedChance(accuracy, evasion)) return { hit: false, crit: false, damage: 0 };
  let damage = Math.max(1, Math.floor(attack * attack / (attack + Math.max(1, defense))));
  const critical = Math.random() < opposedChance(crit, critResist);
  if (critical) damage = Math.max(1, Math.floor(damage * (1 + opposedChance(critDamage, critReduction))));
  return { hit: true, crit: critical, damage };
};

const monsterCombatStats = (combat: SpawnRow) => {
  const speed = Number(combat.speed); const perception = Number(combat.perception); const level = Number(combat.level);
  const accuracy = 120 + speed * 2 + perception * 8;
  const evasion = 120 + speed * 1.6 + perception * 8;
  const crit = 180 + perception * 12 + level * 20;
  return { accuracy, evasion, crit, critResist: crit, critDamage: 180 + Number(combat.attack) * 4, critReduction: 180 + Number(combat.defense) * 10 + level * 20 };
};

export const combatAction = async (qqUserId: string, action: 'attack' | 'skill' | 'item' | 'escape', slot?: number) => withTransaction(async connection => {
  const { character, combat } = await combatRow(qqUserId);
  const [locked] = await connection.execute<(RowDataPacket & { player_hp: number; player_mp: number; current_hp: number; cooldowns: string })[]>('SELECT cs.player_hp,cs.player_mp,s.current_hp,cs.cooldowns FROM combat_sessions cs JOIN monster_spawns s ON s.id=cs.spawn_id WHERE cs.id=? FOR UPDATE', [combat.combat_id]);
  if (!locked[0]) throw new Error('战斗状态已失效。');
  combat.player_hp = Number(locked[0].player_hp); combat.player_mp = Number(locked[0].player_mp); combat.current_hp = Number(locked[0].current_hp);
  let log = ''; let damage = 0;
  const carry = await inventory(qqUserId); const playerSpeed = carry.speed;
  const modifiers = await modifiersFor(connection, character.id);
  if (action === 'escape') {
    if (playerSpeed + Number(character.perception) >= Number(combat.speed) + Number(combat.perception) + random(0, 30)) { await connection.execute('UPDATE combat_sessions SET state=\'escaped\' WHERE id=?', [combat.combat_id]); return { log: '你抓住空隙撤离了战斗。', ended: true }; }
    log = '撤离失败，敌人堵住了去路！';
  } else if (action === 'item') {
    if (!slot) throw new Error('请选择道具快捷栏。');
    const [items] = await connection.execute<(RowDataPacket & { item_id: number; quantity: number; name: string; effect_json: string })[]>('SELECT pi.item_id,pi.quantity,i.name,i.effect_json FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id JOIN item_definitions i ON i.id=pi.item_id WHERE qi.character_id=? AND qi.quick_slot=?', [character.id, slot]);
    if (!items[0] || !items[0].quantity) throw new Error('该道具快捷栏为空。');
    const effect = JSON.parse(items[0].effect_json ?? '{}'); combat.player_hp = Math.min(Number(character.hp_max), combat.player_hp + Number(effect.heal ?? 0));
    await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [character.id, items[0].item_id]); log = `使用 ${items[0].name}，恢复 ${effect.heal ?? 0} 点生命。`;
  } else {
    if (action === 'skill') {
      if (!slot) throw new Error('请选择技能快捷栏。');
      const [skills] = await connection.execute<(RowDataPacket & { name: string; category: string; mana_cost: number; power: number; cooldown_turns: number })[]>('SELECT s.name,s.category,s.mana_cost,s.power,s.cooldown_turns FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot=?', [character.id, slot]);
      const skill = skills[0]; if (!skill) throw new Error('该技能快捷栏为空。');
      const manaCost = Math.max(skill.mana_cost > 0 ? 1 : 0, Math.ceil(Number(skill.mana_cost) * (modifiers.manaAffinity ? 0.7 : 1)) - modifiers.manaCostReduction);
      if (combat.player_mp < manaCost) throw new Error('魔力不足。');
      combat.player_mp -= manaCost;
      const attack = skill.category === 'magic' ? Number(character.magic_attack) + modifiers.magicAttack : Number(character.physical_attack) + modifiers.physicalAttack;
      const multiplier = skill.category === 'magic' ? 1 + modifiers.magicDamagePct / 100 : 1;
      const strike = resolveStrike(attack * Number(skill.power) / 100 * multiplier, Number(combat.defense), Number(character.accuracy), monsterCombatStats(combat).evasion, Number(character.crit_rate_bp) + modifiers.critRateBp, monsterCombatStats(combat).critResist, Number(character.crit_damage_bp), monsterCombatStats(combat).critReduction);
      damage = strike.damage; log = !strike.hit ? `施放 ${skill.name}，但被敌人闪避。` : `施放 ${skill.name}，造成 ${damage} 点${strike.crit ? '暴击' : ''}伤害${modifiers.weaponName ? `（${modifiers.weaponName}生效）` : ''}。`;
    } else {
      const defense = Math.floor(Number(combat.defense) * (1 - modifiers.ignoreDefensePct / 100));
      const strike = resolveStrike(Number(character.physical_attack) + modifiers.physicalAttack, defense, Number(character.accuracy), monsterCombatStats(combat).evasion, Number(character.crit_rate_bp) + modifiers.critRateBp, monsterCombatStats(combat).critResist, Number(character.crit_damage_bp), monsterCombatStats(combat).critReduction);
      damage = strike.damage;
      if (!strike.hit) log = '发动普攻，但被敌人闪避。';
      else if (modifiers.lifestealPct) { const heal = Math.floor(damage * modifiers.lifestealPct / 100); combat.player_hp = Math.min(Number(character.hp_max), combat.player_hp + heal); log = `发动普攻，造成 ${damage} 点${strike.crit ? '暴击' : ''}伤害，${modifiers.weaponName} 回复了 ${heal} 点生命。`; }
      else log = `发动普攻，造成 ${damage} 点${strike.crit ? '暴击' : ''}伤害。`;
    }
    combat.current_hp -= damage;
  }
  if (combat.current_hp <= 0) { const victory = await finishVictory(connection, character, combat); return { log: `${log}\n${victory}`, ended: true }; }
  const sequence = stringList(combat.skill_sequence);
  const monsterSkill = sequence.length ? String(sequence[(Number(combat.turn_no) - 1) % sequence.length]) : '攻击';
  const multiplier = monsterSkill === 'howl' ? 0.7 : monsterSkill === 'bite' ? 1.25 : 1;
  const monster = monsterCombatStats(combat);
  const strike = resolveStrike(Number(combat.attack) * multiplier, Number(character.physical_defense), monster.accuracy, Number(character.evasion), monster.crit, Number(character.crit_resist_bp), monster.critDamage, Number(character.crit_damage_reduction_bp));
  const monsterDamage = strike.damage; combat.player_hp -= monsterDamage; log += !strike.hit ? `\n${combat.name} 使用「${monsterSkill}」，但你闪避了攻击。` : `\n${combat.name} 使用「${monsterSkill}」，造成 ${monsterDamage} 点${strike.crit ? '暴击' : ''}伤害。`;
  if (combat.player_hp <= 0) { await connection.execute('UPDATE combat_sessions SET state=\'defeat\' WHERE id=?', [combat.combat_id]); await connection.execute('UPDATE characters SET experience=GREATEST(0,experience-10) WHERE id=?', [character.id]); return { log: `${log}\n你战败了，损失 10 点经验并被送回区域边缘。`, ended: true }; }
  await connection.execute('UPDATE monster_spawns SET current_hp=? WHERE id=?', [combat.current_hp, combat.id]);
  await connection.execute('UPDATE combat_sessions SET player_hp=?,player_mp=?,turn_no=turn_no+1 WHERE id=?', [combat.player_hp, combat.player_mp, combat.combat_id]);
  return { log: `${log}\n\n你 HP ${combat.player_hp}/${character.hp_max}｜MP ${combat.player_mp}/${character.mp_max}\n敌方 HP ${combat.current_hp}/${combat.hp_max}`, ended: false };
});

export const createParty = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [existing] = await connection.execute<RowDataPacket[]>('SELECT party_id FROM party_members WHERE character_id=? FOR UPDATE', [character.id]);
  if (existing.length) throw new Error('你已经在一个队伍中。');
  const id = randomUUID();
  await connection.execute('INSERT INTO parties (id,leader_character_id) VALUES (?,?)', [id, character.id]);
  await connection.execute('INSERT INTO party_members (party_id,character_id) VALUES (?,?)', [id, character.id]);
  return id;
});

export const joinParty = async (qqUserId: string, leaderQqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [own] = await connection.execute<RowDataPacket[]>('SELECT party_id FROM party_members WHERE character_id=? FOR UPDATE', [character.id]);
  if (own.length) throw new Error('你已经在一个队伍中。');
  const [leaders] = await connection.execute<(RowDataPacket & { party_id: string; pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pm.party_id,c.pos_x,c.pos_y,c.pos_z FROM players p JOIN characters c ON c.player_id=p.id JOIN party_members pm ON pm.character_id=c.id JOIN parties pt ON pt.id=pm.party_id AND pt.leader_character_id=c.id WHERE p.qq_user_id=? FOR UPDATE`, [leaderQqUserId]);
  if (!leaders[0]) throw new Error('未找到该队长的队伍。');
  const [count] = await connection.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM party_members WHERE party_id=?', [leaders[0].party_id]);
  if (Number(count[0].total) >= 4) throw new Error('队伍已满（最多 4 人）。');
  await connection.execute('INSERT INTO party_members (party_id,character_id) VALUES (?,?)', [leaders[0].party_id, character.id]);
  await connection.execute('UPDATE characters SET pos_x=?,pos_y=?,pos_z=? WHERE id=?', [leaders[0].pos_x, leaders[0].pos_y, leaders[0].pos_z, character.id]);
  return Number(count[0].total) + 1;
});
