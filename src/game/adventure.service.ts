import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { calculateDerivedStats } from './constants';
import { attributes, type Allocation } from './types';

type CharacterRow = RowDataPacket & { id: number; name: string; level: number; experience: number; skill_points: number; hp_max: number; mp_max: number; current_hp: number; current_mp: number; activity_status: 'active' | 'resting'; rest_started_at: Date | null; physical_attack: number; magic_attack: number; physical_defense: number; magic_defense: number; accuracy: number; evasion: number; crit_rate_bp: number; crit_damage_bp: number; crit_resist_bp: number; crit_damage_reduction_bp: number; speed: number; perception: number; spirit: number; intelligence: number; adventurer_registered: number; current_region_id: number; pos_x: number; pos_y: number; pos_z: number; region_name: string };
type MonsterAttributes = Allocation & Record<`${keyof Allocation}_growth`, number>;
type MonsterTrait = { code: string; name: string; hpPct?: number; mpPct?: number; physicalAttackPct?: number; magicAttackPct?: number; physicalDefensePct?: number; magicDefensePct?: number; accuracyPct?: number; evasionPct?: number; speedPct?: number };
type SpawnRow = RowDataPacket & MonsterAttributes & { id: number; template_id?: number; name: string; monster_class: string; level: number; current_hp: number; hp_max: number; attack: number; defense: number; speed: number; experience: number; drops_json: unknown; skill_sequence?: unknown; traits_json?: unknown; weakness_json?: unknown; resistance_json?: unknown };
type CombatMemberRow = CharacterRow & { current_hp: number; current_mp: number; selected_target_id: number | null; pending_action: unknown; cooldowns: unknown; is_defeated: number };
type CombatTargetRow = SpawnRow & { current_mp: number; cooldowns: unknown; is_defeated: number };
type PendingAction = { type: 'attack' | 'skill' | 'item' | 'escape'; slot?: number };
type CombatEffectRow = RowDataPacket & { id: number; target_kind: 'member' | 'target'; target_id: number; code: string; name: string; effect_type: string; value: number; stacks: number; remaining_turns: number };
type CombatModifiers = { weaponName?: string; physicalAttack: number; magicAttack: number; critRateBp: number; ignoreDefensePct: number; lifestealPct: number; magicDamagePct: number; manaCostReduction: number; experienceMultiplier: number; dropBonus: number; manaAffinity: boolean };
type AppraisalMember = { characterId: number; level: number; rangeLevel: number; informationLevel: number };
type AppraisalProfile = { learned: boolean; rangeLevel: number; informationLevel: number; members: AppraisalMember[] };
export type VictorySettlement = { kind: 'victory'; members: { name: string; experience: number; levelText?: string; drops: { name: string; quantity: number; itemType: string; codexId: string | null; instanceId?: number }[]; learned: { id: number; name: string }[] }[] };
const monsterAttributeColumns = `${attributes.map(attribute => `t.${attribute},t.${attribute}_growth`).join(',')}`;
const lowMonsterTraits: MonsterTrait[] = [
  { code: 'fierce', name: '凶猛的', physicalAttackPct: 10 }, { code: 'sturdy', name: '坚韧的', hpPct: 10 },
  { code: 'keen', name: '敏锐的', accuracyPct: 10 }, { code: 'nimble', name: '灵巧的', evasionPct: 10, speedPct: 5 },
  { code: 'arcane', name: '魔蕴的', magicAttackPct: 10 }, { code: 'hardhide', name: '硬皮的', physicalDefensePct: 10 }
];
const traitList = (value: unknown) => jsonArray(value).map(item => jsonObject(item) as unknown as MonsterTrait).filter(trait => trait.code && trait.name);
const percentBonus = (traits: MonsterTrait[], key: keyof MonsterTrait) => traits.reduce((total, trait) => total + Number(trait[key] ?? 0), 0);
const monsterAttributes = (monster: MonsterAttributes & { level: number }): Allocation => Object.fromEntries(attributes.map(attribute => [attribute, Number(monster[attribute]) + Math.max(0, Number(monster.level) - 1) * Number(monster[`${attribute}_growth`])])) as Allocation;
const monsterCombatStats = (monster: MonsterAttributes & { level: number }) => {
  const values = monsterAttributes(monster);
  const stats = calculateDerivedStats(values);
  const traits = traitList((monster as SpawnRow).traits_json);
  const boosted = (value: number, key: keyof MonsterTrait) => Math.floor(value * (1 + percentBonus(traits, key) / 100));
  return {
    hpMax: boosted(stats.hpMax, 'hpPct'), mpMax: boosted(stats.mpMax, 'mpPct'), physicalAttack: boosted(stats.physicalAttack, 'physicalAttackPct'), magicAttack: boosted(stats.magicAttack, 'magicAttackPct'),
    physicalDefense: boosted(stats.physicalDefense, 'physicalDefensePct'), magicDefense: boosted(stats.magicDefense, 'magicDefensePct'), accuracy: boosted(stats.accuracy, 'accuracyPct'), evasion: boosted(stats.evasion, 'evasionPct'),
    crit: Math.floor(stats.critRateBp), critResist: Math.floor(stats.critResistBp), critDamage: Math.floor(stats.critDamageBp), critReduction: Math.floor(stats.critDamageReductionBp), speed: boosted(stats.speed, 'speedPct'), perception: Math.floor(values.perception)
  };
};
const materializeMonster = <T extends SpawnRow>(monster: T, revealTraits = false): T => {
  const stats = monsterCombatStats(monster);
  const traits = traitList(monster.traits_json);
  return Object.assign(monster, { name: `${revealTraits ? traits.map(trait => trait.name).join('') : ''}${monster.name}`, hp_max: stats.hpMax, attack: stats.physicalAttack, defense: stats.physicalDefense, speed: stats.speed });
};
const materializeMonsters = <T extends SpawnRow>(monsters: T[], revealTraits = false) => monsters.map(monster => materializeMonster(monster, revealTraits)).sort((left, right) => monsterCombatStats(right).perception - monsterCombatStats(left).perception || Number(left.id) - Number(right.id));
const pickWeighted = <T extends { spawn_weight: number }>(items: T[]) => {
  const total = items.reduce((sum, item) => sum + Number(item.spawn_weight), 0);
  let roll = Math.random() * total;
  for (const item of items) { roll -= Number(item.spawn_weight); if (roll < 0) return item; }
  return items[items.length - 1];
};
const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomItems = <T>(items: T[], count: number) => [...items].sort(() => Math.random() - .5).slice(0, count);
const randomMonsterTraits = () => {
  const count = Math.random() < .55 ? 0 : Math.random() < .88 ? 1 : 2;
  return randomItems(lowMonsterTraits, count);
};
const quickSlotLabel = (slot: number) => `技能${'①②③④'.charAt(slot - 1) || slot}`;
const jsonObject = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value !== 'string') return value as Record<string, unknown>;
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
};
const stringList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : typeof parsed === 'string' ? [parsed] : [];
  } catch { return value.split(',').map(item => item.trim()).filter(Boolean); }
};
const jsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};
const movementSpeedFrom = (speed: number, level: number) => {
  const statSpeed = Math.floor(1 + Math.sqrt(Math.max(0, speed - 100) / 30));
  const levelCap = Math.min(10, 3 + Math.floor(Math.max(0, level - 1) / 10));
  return Math.max(1, Math.min(10, levelCap, statSpeed));
};

const characterFor = async (qqUserId: string): Promise<CharacterRow> => {
  const pool = await getPool(); const [rows] = await pool.execute<CharacterRow[]>(`SELECT c.*, r.name AS region_name FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id WHERE p.qq_user_id=? LIMIT 1`, [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  const character = rows[0];
  if (character.activity_status === 'resting' && character.rest_started_at) {
    const seconds = Math.floor((Date.now() - new Date(character.rest_started_at).getTime()) / 1000);
    if (seconds > 0) {
      character.current_hp = Math.min(Number(character.hp_max), Number(character.current_hp) + Math.max(1, Math.ceil(Number(character.hp_max) / 100)) * seconds);
      character.current_mp = Math.min(Number(character.mp_max), Number(character.current_mp) + Math.max(1, Math.ceil(Number(character.mp_max) / 100)) * seconds);
      if (character.current_hp >= Number(character.hp_max) && character.current_mp >= Number(character.mp_max)) { character.activity_status = 'active'; character.rest_started_at = null; }
      else character.rest_started_at = new Date();
      await pool.execute('UPDATE characters SET current_hp=?,current_mp=?,activity_status=?,rest_started_at=? WHERE id=?', [character.current_hp, character.current_mp, character.activity_status, character.rest_started_at, character.id]);
    }
  }
  return character;
};

const ensureActionAvailable = (character: CharacterRow) => {
  if (character.activity_status === 'resting') throw new Error('你正在休息，生命与魔力恢复至满值后才能行动。');
};

export const startRest = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); const [combat] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state=\'active\' LIMIT 1 FOR UPDATE', [character.id]);
  if (combat[0]) throw new Error('战斗中无法休息。');
  if (Number(character.current_hp) >= Number(character.hp_max) && Number(character.current_mp) >= Number(character.mp_max)) return { resting: false, message: '当前生命与魔力均已满，无需休息。' };
  await connection.execute('UPDATE characters SET activity_status=\'resting\',rest_started_at=NOW() WHERE id=?', [character.id]);
  return { resting: true, message: '你开始休息，每秒恢复 1% 的生命与魔力。' };
});

export const resumeAction = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  if (character.activity_status === 'resting') throw new Error('休息尚未完成，请等待生命与魔力恢复至满值。');
  return { message: '休息完成，你可以继续行动。' };
};

const hasPassiveSkill = async (connection: Pool | PoolConnection, characterId: number, code: string) => {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id
    WHERE ps.character_id=? AND s.code=? AND s.category='passive' LIMIT 1`, [characterId, code]);
  return Boolean(rows[0]);
};

const appraisalProfileFor = async (connection: Pool | PoolConnection, characterIds: number[]): Promise<AppraisalProfile> => {
  if (!characterIds.length) return { learned: false, rangeLevel: 0, informationLevel: 0, members: [] };
  const placeholders = characterIds.map(() => '?').join(',');
  const [rows] = await connection.execute<(RowDataPacket & { character_id: number; level: number; range_level: number; information_level: number })[]>(`SELECT ps.character_id,c.level,COALESCE(ap.range_level,1) AS range_level,COALESCE(ap.information_level,1) AS information_level
    FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id JOIN characters c ON c.id=ps.character_id
    LEFT JOIN player_appraisal_progress ap ON ap.character_id=ps.character_id
    WHERE s.code='appraisal' AND ps.character_id IN (${placeholders})`, characterIds);
  const members = rows.map(row => ({ characterId: Number(row.character_id), level: Number(row.level), rangeLevel: Number(row.range_level), informationLevel: Number(row.information_level) }));
  return { learned: members.length > 0, rangeLevel: Math.max(0, ...members.map(member => member.rangeLevel)), informationLevel: Math.max(0, ...members.map(member => member.informationLevel)), members };
};

const appraisalForTarget = (profile: AppraisalProfile, targetLevel: number) => profile.members
  .filter(member => targetLevel <= member.level + member.rangeLevel * 3)
  .sort((left, right) => right.informationLevel - left.informationLevel || right.rangeLevel - left.rangeLevel || right.level - left.level)[0];
const canAppraiseTarget = (profile: AppraisalProfile, targetLevel: number) => Boolean(appraisalForTarget(profile, targetLevel));

const modifiersFor = async (connection: PoolConnection, characterId: number): Promise<CombatModifiers> => {
  const [rows] = await connection.execute<(RowDataPacket & { name: string | null; effect_json: string | null })[]>(`SELECT i.name,COALESCE(ii.effect_json,i.effect_json) AS effect_json FROM characters c LEFT JOIN player_equipment pe ON pe.character_id=c.id AND pe.slot='weapon' LEFT JOIN item_definitions i ON i.id=pe.item_id LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=c.id WHERE c.id=?`, [characterId]);
  const [passiveRows] = await connection.execute<(RowDataPacket & { code: string; passive_effect_json: unknown })[]>(`SELECT s.code,s.passive_effect_json FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.category='passive'`, [characterId]);
  const effect = jsonObject(rows[0]?.effect_json);
  const passives = new Map(passiveRows.map(row => [row.code, jsonObject(row.passive_effect_json)]));
  const growth = passives.get('growth_blessing'); const lucky = passives.get('lucky_favor'); const mana = passives.get('mana_affinity');
  return { weaponName: rows[0]?.name ?? undefined, physicalAttack: Number(effect.physicalAttack ?? 0), magicAttack: Number(effect.magicAttack ?? 0), critRateBp: Number(effect.critRateBp ?? 0), ignoreDefensePct: Number(effect.ignoreDefensePct ?? 0), lifestealPct: Number(effect.lifestealPct ?? 0), magicDamagePct: Number(effect.magicDamagePct ?? 0), manaCostReduction: Number(effect.manaCostReduction ?? 0), experienceMultiplier: Number(growth?.experienceMultiplier ?? 1), dropBonus: Number(lucky?.dropBonusPct ?? 0) / 100, manaAffinity: Boolean(mana) };
};

export const spawnMonsters = async () => {
  const pool = await getPool();
  const [regions] = await pool.execute<(RowDataPacket & { id: number; min_x: number; max_x: number; min_y: number; max_y: number; min_z: number; max_z: number })[]>('SELECT id,min_x,max_x,min_y,max_y,min_z,max_z FROM map_regions WHERE is_spawn_enabled=1');
  for (const region of regions) {
    const [templates] = await pool.execute<(RowDataPacket & MonsterAttributes & { id: number; level: number; monster_class: string; spawn_weight: number; skill_sequence: unknown })[]>(`SELECT t.id,t.level,t.monster_class,t.skill_sequence,p.spawn_weight,${monsterAttributeColumns} FROM map_monster_pools p JOIN monster_templates t ON t.id=p.monster_template_id WHERE p.region_id=?`, [region.id]);
    if (!templates.length) continue;
    const [blockedRows] = await pool.execute<(RowDataPacket & { pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pos_x,pos_y,pos_z FROM map_npcs WHERE region_id=? AND pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL
      UNION SELECT pos_x,pos_y,pos_z FROM map_special_objects WHERE region_id=?`, [region.id, region.id]);
    const blocked = new Set(blockedRows.map(row => `${row.pos_x},${row.pos_y},${row.pos_z}`));
    const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM monster_spawns WHERE region_id=? AND defeated_at IS NULL', [region.id]);
    const area = (region.max_x - region.min_x + 1) * (region.max_y - region.min_y + 1) * (region.max_z - region.min_z + 1);
    const spawnLimit = Math.floor(area * 0.05);
    for (let i = Number(countRows[0].total); i < spawnLimit; i++) {
      const template = pickWeighted(templates);
      let x = random(region.min_x, region.max_x); let y = random(region.min_y, region.max_y); let z = random(region.min_z, region.max_z);
      for (let attempt = 0; attempt < 32 && blocked.has(`${x},${y},${z}`); attempt++) { x = random(region.min_x, region.max_x); y = random(region.min_y, region.max_y); z = random(region.min_z, region.max_z); }
      if (blocked.has(`${x},${y},${z}`)) continue;
      const skillPool = stringList(template.skill_sequence); const skills = randomItems(skillPool, random(0, Math.min(4, skillPool.length))); const traits = randomMonsterTraits();
      const stats = monsterCombatStats({ ...template, traits_json: traits });
      await pool.execute('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?)', [template.id, region.id, x, y, z, stats.hpMax, JSON.stringify(skills), JSON.stringify(traits)]);
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
  const [rows] = await (await getPool()).execute<(RowDataPacket & { codex_id: string; name: string; item_category: string; description: string; obtain_source: string; weight: number })[]>(`SELECT i.codex_id,i.name,i.item_category,i.description,i.obtain_source,i.weight FROM player_item_codex c JOIN item_definitions i ON i.id=c.item_id WHERE c.character_id=? AND i.codex_id=?`, [character.id, codexId]);
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
  const [rows] = await (await getPool()).execute<(RowDataPacket & { slot: string; name: string; instance_id: number | null })[]>(`SELECT pe.slot,i.name,pe.instance_id
    FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id
    WHERE pe.character_id=?
    ORDER BY FIELD(pe.slot,'weapon','offhand','shoulder','upper','waist','lower','feet','necklace','bracelet','ring')`, [character.id]);
  return rows;
};

const equipmentSlots = ['weapon', 'offhand', 'shoulder', 'upper', 'waist', 'lower', 'feet', 'necklace', 'bracelet', 'ring'] as const;
const equipmentSlotCategories: Record<typeof equipmentSlots[number], string[]> = {
  weapon: ['武器'], offhand: ['副手'], shoulder: ['头肩', '头部'], upper: ['上装'], waist: ['腰部'],
  lower: ['下装'], feet: ['脚部'], necklace: ['项链'], bracelet: ['手镯'], ring: ['戒指']
};

const requireEquipmentSlot = (slot: string) => {
  if (!equipmentSlots.includes(slot as typeof equipmentSlots[number])) throw new Error('无效的装备部位。');
  return slot as typeof equipmentSlots[number];
};

export const equipmentCandidates = async (qqUserId: string, slot: string) => {
  const validSlot = requireEquipmentSlot(slot); const character = await characterFor(qqUserId); const categories = equipmentSlotCategories[validSlot];
  const placeholders = categories.map(() => '?').join(',');
  const [rows] = await (await getPool()).execute<(RowDataPacket & { id: number; name: string })[]>(`
    SELECT ii.id,i.name FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    LEFT JOIN player_equipment pe ON pe.character_id=ii.character_id AND pe.instance_id=ii.id
    WHERE ii.character_id=? AND i.item_type='equipment' AND i.item_category IN (${placeholders}) AND pe.instance_id IS NULL
    ORDER BY ii.acquired_at DESC,ii.id DESC
  `, [character.id, ...categories]);
  return rows;
};

export const unequip = async (qqUserId: string, slot: string) => withTransaction(async connection => {
  requireEquipmentSlot(slot);
  const character = await characterFor(qqUserId);
  const [rows] = await connection.execute<(RowDataPacket & { name: string })[]>(`
    SELECT i.name FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id
    WHERE pe.character_id=? AND pe.slot=? FOR UPDATE
  `, [character.id, slot]);
  if (!rows[0]) throw new Error('该部位没有装备。');
  await connection.execute('DELETE FROM player_equipment WHERE character_id=? AND slot=?', [character.id, slot]);
  return rows[0];
});

export const equip = async (qqUserId: string, slot: string, instanceId: number) => withTransaction(async connection => {
  const validSlot = requireEquipmentSlot(slot); const character = await characterFor(qqUserId); const categories = equipmentSlotCategories[validSlot];
  const placeholders = categories.map(() => '?').join(',');
  const [items] = await connection.execute<(RowDataPacket & { id: number; item_id: number; name: string })[]>(`
    SELECT ii.id,ii.item_id,i.name FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    WHERE ii.id=? AND ii.character_id=? AND i.item_type='equipment' AND i.item_category IN (${placeholders}) FOR UPDATE
  `, [instanceId, character.id, ...categories]);
  const item = items[0];
  if (!item) throw new Error('背包中没有这件可装备的物品。');
  const [occupied] = await connection.execute<(RowDataPacket & { slot: string })[]>('SELECT slot FROM player_equipment WHERE character_id=? AND instance_id=? FOR UPDATE', [character.id, instanceId]);
  if (occupied[0] && occupied[0].slot !== validSlot) throw new Error('这件装备正在其他部位穿戴。');
  const [sameDefinitions] = await connection.execute<(RowDataPacket & { slot: string })[]>('SELECT slot FROM player_equipment WHERE character_id=? AND item_id=? AND slot<>? FOR UPDATE', [character.id, item.item_id, validSlot]);
  if (sameDefinitions[0]) throw new Error('同类装备已穿戴在其他部位。');
  await connection.execute('DELETE FROM player_equipment WHERE character_id=? AND slot=?', [character.id, validSlot]);
  await connection.execute('INSERT INTO player_equipment (character_id,slot,item_id,instance_id) VALUES (?,?,?,?)', [character.id, validSlot, item.item_id, item.id]);
  return item;
});

export const skillList = async (qqUserId: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [skills] = await pool.execute<(RowDataPacket & { id: number; name: string; category: string; level: number; quick_slot: number | null; learned_at: Date })[]>('SELECT s.id,s.name,s.category,ps.level,ps.quick_slot,ps.learned_at FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? ORDER BY ps.learned_at,s.id', [character.id]);
  const [discoveries] = await pool.execute<(RowDataPacket & { id: number; name: string; category: string; learn_cost: number })[]>(`SELECT s.id,s.name,s.category,s.learn_cost FROM player_skill_discoveries d JOIN skill_definitions s ON s.id=d.skill_id
    LEFT JOIN player_skills ps ON ps.character_id=d.character_id AND ps.skill_id=d.skill_id WHERE d.character_id=? AND ps.skill_id IS NULL ORDER BY d.discovered_at,s.id`, [character.id]);
  return { skillPoints: Number(character.skill_points), skills, discoveries };
};

export const skillDetail = async (qqUserId: string, skillId: number) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { id: number; code: string; name: string; category: string; damage_type: string; mana_cost: number; cooldown_turns: number; chant_turns: number; power: number; learn_cost: number; upgrade_cost: number; max_level: number; power_per_level: number; cooldown_reduction_per_level: number; level: number; learned: number; description: string; effects: string | null })[]>(`SELECT s.*,COALESCE(ps.level,0) AS level,(ps.skill_id IS NOT NULL) AS learned,GROUP_CONCAT(CONCAT(e.name,' Lv.',se.effect_level) ORDER BY e.id SEPARATOR '、') AS effects
    FROM skill_definitions s LEFT JOIN player_skills ps ON ps.skill_id=s.id AND ps.character_id=? LEFT JOIN player_skill_discoveries d ON d.skill_id=s.id AND d.character_id=?
    LEFT JOIN skill_effects se ON se.skill_id=s.id LEFT JOIN effect_definitions e ON e.id=se.effect_id WHERE s.id=? AND (ps.skill_id IS NOT NULL OR d.skill_id IS NOT NULL) GROUP BY s.id,ps.level,ps.skill_id`, [character.id, character.id, skillId]);
  if (!rows[0]) throw new Error('尚未领悟该技能。');
  const skill = rows[0]; const level = Math.max(1, Number(skill.level)); const learned = Boolean(skill.learned);
  const [specializationRows] = await pool.execute<(RowDataPacket & { specialization: 'overcharge' | 'instant' | 'efficient' | 'potent'; level: number })[]>('SELECT specialization,level FROM player_skill_specializations WHERE character_id=? AND skill_id=?', [character.id, skillId]);
  const specializations = Object.fromEntries(specializationRows.map(row => [row.specialization, Number(row.level)])) as Partial<Record<'overcharge' | 'instant' | 'efficient' | 'potent', number>>;
  let progressRows: (RowDataPacket & { range_level: number; information_level: number })[] = [];
  if (skill.code === 'appraisal' && learned) [progressRows] = await pool.execute<(RowDataPacket & { range_level: number; information_level: number })[]>('SELECT range_level,information_level FROM player_appraisal_progress WHERE character_id=?', [character.id]);
  const progress = progressRows[0] ? { rangeLevel: Number(progressRows[0].range_level), informationLevel: Number(progressRows[0].information_level) } : undefined;
  const overcharge = Number(specializations.overcharge ?? 1) - 1; const instant = Number(specializations.instant ?? 1) - 1; const efficient = Number(specializations.efficient ?? 1) - 1;
  const actualPower = Math.floor((Number(skill.power) + (level - 1) * Number(skill.power_per_level)) * Math.pow(1.08, overcharge) * Math.pow(.96, instant));
  const actualManaCost = Math.max(0, Math.ceil(Number(skill.mana_cost) * Math.pow(1.16, overcharge) * Math.pow(.92, efficient)));
  const baseCooldown = Math.max(0, Number(skill.cooldown_turns) - (level - 1) * Number(skill.cooldown_reduction_per_level));
  const actualCooldown = Math.max(0, Math.ceil(Math.max(1, baseCooldown) * Math.pow(1.08, overcharge) * Math.pow(.92, instant)) - (baseCooldown === 0 ? 1 : 0));
  const baseChant = Number(skill.chant_turns);
  const actualChant = Math.max(0, Math.ceil(Math.max(1, baseChant) * Math.pow(1.08, overcharge) * Math.pow(.92, instant)) - (baseChant === 0 ? 1 : 0));
  return { ...skill, level, learned, characterLevel: Number(character.level), skillPoints: Number(character.skill_points), appraisal: progress, specializations, actualPower, actualManaCost, actualCooldown, actualChant, nextUpgradeCost: skill.code === 'appraisal' ? null : !learned || level >= Number(skill.max_level) ? null : Number(skill.upgrade_cost) + level - 1 };
};

export const learnSkill = async (qqUserId: string, skillId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [skills] = await connection.execute<(RowDataPacket & { name: string; code: string; learn_cost: number })[]>(`SELECT s.name,s.code,s.learn_cost FROM player_skill_discoveries d JOIN skill_definitions s ON s.id=d.skill_id
    LEFT JOIN player_skills ps ON ps.character_id=d.character_id AND ps.skill_id=d.skill_id WHERE d.character_id=? AND d.skill_id=? AND ps.skill_id IS NULL FOR UPDATE`, [character.id, skillId]);
  const skill = skills[0]; if (!skill) throw new Error('该技能尚未领悟，或已经学习。');
  if (Number(character.skill_points) < Number(skill.learn_cost)) throw new Error(`技能点不足，学习「${skill.name}」需要 ${skill.learn_cost} 点。`);
  await connection.execute('UPDATE characters SET skill_points=skill_points-? WHERE id=?', [skill.learn_cost, character.id]);
  await connection.execute('INSERT INTO player_skills (character_id,skill_id) VALUES (?,?)', [character.id, skillId]);
  if (skill.code !== 'appraisal') await connection.execute(`INSERT IGNORE INTO player_skill_specializations (character_id,skill_id,specialization) VALUES (?,?,'overcharge'),(?,?,'instant'),(?,?,'efficient'),(?,?,'potent')`, [character.id, skillId, character.id, skillId, character.id, skillId, character.id, skillId]);
  if (skill.code === 'appraisal') await connection.execute('INSERT IGNORE INTO player_appraisal_progress (character_id) VALUES (?)', [character.id]);
  return { name: skill.name, cost: Number(skill.learn_cost) };
});

export const toggleSkillShortcut = async (qqUserId: string, skillId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [skills] = await connection.execute<(RowDataPacket & { quick_slot: number | null; name: string; category: string })[]>('SELECT ps.quick_slot,s.name,s.category FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=? FOR UPDATE', [character.id, skillId]);
  const skill = skills[0]; if (!skill) throw new Error('尚未学习该技能。');
  if (skill.category === 'passive') throw new Error('被动技能无法配置战斗快捷栏。');
  if (skill.quick_slot) { await connection.execute('UPDATE player_skills SET quick_slot=NULL WHERE character_id=? AND skill_id=?', [character.id, skillId]); return { name: skill.name, slot: null }; }
  const [used] = await connection.execute<(RowDataPacket & { quick_slot: number })[]>('SELECT quick_slot FROM player_skills WHERE character_id=? AND quick_slot IS NOT NULL ORDER BY quick_slot FOR UPDATE', [character.id]);
  const slot = [1, 2, 3, 4].find(candidate => !used.some(item => Number(item.quick_slot) === candidate));
  if (!slot) throw new Error('技能快捷栏已满，请先取消一个快捷技能。');
  await connection.execute('UPDATE player_skills SET quick_slot=? WHERE character_id=? AND skill_id=?', [slot, character.id, skillId]); return { name: skill.name, slot };
});

export const upgradeSkill = async (qqUserId: string, skillId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [skills] = await connection.execute<(RowDataPacket & { name: string; code: string; level: number; max_level: number; upgrade_cost: number })[]>('SELECT s.name,s.code,ps.level,s.max_level,s.upgrade_cost FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=? FOR UPDATE', [character.id, skillId]);
  const skill = skills[0]; if (!skill) throw new Error('尚未学习该技能。'); if (Number(skill.level) >= Number(skill.max_level)) throw new Error('该技能已达到最高等级。');
  if (skill.code === 'appraisal') throw new Error('鉴识需要选择“慧眼”或“识珠”专精升级。');
  const cost = Number(skill.upgrade_cost) + Number(skill.level) - 1; if (Number(character.skill_points) < cost) throw new Error(`技能点不足，升级需要 ${cost} 点。`);
  await connection.execute('UPDATE characters SET skill_points=skill_points-? WHERE id=?', [cost, character.id]); await connection.execute('UPDATE player_skills SET level=level+1 WHERE character_id=? AND skill_id=?', [character.id, skillId]);
  return { name: skill.name, level: Number(skill.level) + 1, cost };
});

export const upgradeSkillSpecialization = async (qqUserId: string, skillId: number, specialization: 'overcharge' | 'instant' | 'efficient' | 'potent') => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [skills] = await connection.execute<(RowDataPacket & { name: string; category: string })[]>('SELECT s.name,s.category FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=? FOR UPDATE', [character.id, skillId]);
  const skill = skills[0]; if (!skill || skill.category === 'passive') throw new Error('只能升级已学习的主动技能专精。');
  await connection.execute('INSERT IGNORE INTO player_skill_specializations (character_id,skill_id,specialization) VALUES (?,?,?)', [character.id, skillId, specialization]);
  const [rows] = await connection.execute<(RowDataPacket & { level: number })[]>('SELECT level FROM player_skill_specializations WHERE character_id=? AND skill_id=? AND specialization=? FOR UPDATE', [character.id, skillId, specialization]);
  const level = Number(rows[0].level); if (level >= 100) throw new Error('该专精已达到最高等级。');
  if (Number(character.skill_points) < 1) throw new Error('技能点不足，升级需要 1 点。');
  await connection.execute('UPDATE characters SET skill_points=skill_points-1 WHERE id=?', [character.id]);
  await connection.execute('UPDATE player_skill_specializations SET level=level+1 WHERE character_id=? AND skill_id=? AND specialization=?', [character.id, skillId, specialization]);
  return { name: skill.name, specialization, level: level + 1 };
});

export const upgradeAppraisal = async (qqUserId: string, direction: 'range' | 'information') => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [skills] = await connection.execute<(RowDataPacket & { id: number; level: number; name: string })[]>(`SELECT s.id,ps.level,s.name FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.code='appraisal' FOR UPDATE`, [character.id]);
  const skill = skills[0]; if (!skill) throw new Error('尚未学会被动技能「鉴识」。');
  await connection.execute('INSERT IGNORE INTO player_appraisal_progress (character_id) VALUES (?)', [character.id]);
  const [progressRows] = await connection.execute<(RowDataPacket & { range_level: number; information_level: number })[]>('SELECT range_level,information_level FROM player_appraisal_progress WHERE character_id=? FOR UPDATE', [character.id]);
  const progress = progressRows[0]; const current = direction === 'range' ? Number(progress.range_level) : Number(progress.information_level);
  const cap = direction === 'range' ? 10 : 4; if (current >= cap) throw new Error(direction === 'range' ? '鉴识慧眼已达到上限。' : '鉴识识珠已达到上限。');
  const cost = direction === 'range' ? current : current + 1; if (Number(character.skill_points) < cost) throw new Error(`技能点不足，升级需要 ${cost} 点。`);
  await connection.execute('UPDATE characters SET skill_points=skill_points-? WHERE id=?', [cost, character.id]);
  await connection.execute(`UPDATE player_appraisal_progress SET ${direction === 'range' ? 'range_level' : 'information_level'}=${direction === 'range' ? 'range_level' : 'information_level'}+1 WHERE character_id=?`, [character.id]);
  await connection.execute('UPDATE player_skills SET level=level+1 WHERE character_id=? AND skill_id=?', [character.id, skill.id]);
  return { name: skill.name, level: Number(skill.level) + 1, cost, direction, rangeLevel: direction === 'range' ? current + 1 : Number(progress.range_level), informationLevel: direction === 'information' ? current + 1 : Number(progress.information_level) };
});

export const partyInfo = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & { member_count: number; leader_name: string })[]>(`SELECT COUNT(pm2.character_id) AS member_count, leader.name AS leader_name FROM party_members pm JOIN parties p ON p.id=pm.party_id JOIN characters leader ON leader.id=p.leader_character_id JOIN party_members pm2 ON pm2.party_id=p.id WHERE pm.character_id=? GROUP BY p.id,leader.name`, [character.id]);
  return rows[0] ?? null;
};

export const explore = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  const [spawnRows] = await pool.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,t.level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  const canViewMonsterInfo = await hasPassiveSkill(pool, character.id, 'appraisal');
  const spawns = materializeMonsters(spawnRows, false);
  if (!spawns.length) return { character, spawns, text: '四周只有风吹树叶的声音。这里暂时没有敌对生物。' };
  const negotiation = Math.floor(Number(character.spirit) + Number(character.intelligence) + Number(character.perception) / 2);
  const text = canViewMonsterInfo ? `你发现 ${spawns.map(s => `#${s.id} ${s.name} Lv.${s.level}`).join('、')}。\n\n感知 ${character.perception}｜负重后速度 ${character.speed}｜交涉值 ${negotiation}\n感知与速度高于敌人时可偷袭；感知较高可尝试躲避；交涉成功率按双方交涉值对抗结算。` : '你察觉到附近有未知的敌对存在，却无法辨明它们的任何信息。';
  return { character, spawns, text, canViewMonsterInfo };
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
  const point = (type: NearbyPoint['type'], item: { name: string; x: number; y: number }): NearbyPoint => ({ type, name: item.name, x: Number(item.x), y: Number(item.y), distance: Math.abs(Number(item.x) - Number(character.pos_x)) + Math.abs(Number(item.y) - Number(character.pos_y)) });
  const points = [...monsters.map(item => point('怪物', item)), ...npcs.map(item => point('NPC', item)), ...objects.map(item => point('地标', item))]
    .filter(item => item.distance <= range)
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name, 'zh-CN'));
  return { character, range, points, description: descriptions[0]?.description ?? '四周一片寂静，暂时没有发现异常。' };
};

const moveToPosition = async (connection: PoolConnection, qqUserId: string, x: number, y: number, restrictToPerception: boolean, speedLimit?: number) => {
  const character = await characterFor(qqUserId);
  ensureActionAvailable(character);
  const [activeCombat] = await connection.execute<RowDataPacket[]>(`SELECT cs.id FROM combat_sessions cs LEFT JOIN combat_members cm ON cm.session_id=cs.id
    WHERE cs.state='active' AND (cs.character_id=? OR cm.character_id=?) LIMIT 1 FOR UPDATE`, [character.id, character.id]);
  if (activeCombat.length) throw new Error('战斗尚未结束，无法移动。');
  const [encounters] = await connection.execute<RowDataPacket[]>('SELECT id FROM monster_spawns WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL LIMIT 1 FOR UPDATE', [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  const [escapeTokens] = await connection.execute<RowDataPacket[]>('SELECT character_id FROM encounter_escape_tokens WHERE character_id=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? FOR UPDATE', [character.id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (encounters[0] && !escapeTokens[0]) throw new Error('当前格子存在敌对生物，请先选择战斗、交涉或躲避。');
  if (escapeTokens[0]) await connection.execute('DELETE FROM encounter_escape_tokens WHERE character_id=?', [character.id]);
  const [partyRows] = await connection.execute<(RowDataPacket & { leader_character_id: number })[]>('SELECT p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=?', [character.id]);
  if (partyRows[0] && Number(partyRows[0].leader_character_id) !== character.id) throw new Error('组队状态下仅队长可以移动。');
  const distance = Math.abs(x - Number(character.pos_x)) + Math.abs(y - Number(character.pos_y));
  if (restrictToPerception && distance > perceptionRange(Number(character.perception))) throw new Error('该位置超出你的感知范围。');
  if (speedLimit !== undefined && distance > speedLimit) throw new Error(`当前移动速度为 ${speedLimit}，一次移动距离不能超过移动速度。`);
  const [regions] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM map_regions WHERE ? BETWEEN min_x AND max_x AND ? BETWEEN min_y AND max_y AND ? BETWEEN min_z AND max_z ORDER BY danger_level DESC LIMIT 1', [x, y, character.pos_z]);
  const region = regions[0]; if (!region) throw new Error('\n\n前面的区域，以后再来探索吧！');
  if (partyRows[0]) await connection.execute('UPDATE characters c JOIN party_members pm ON pm.character_id=c.id SET c.current_region_id=?,c.pos_x=?,c.pos_y=? WHERE pm.party_id=(SELECT party_id FROM party_members WHERE character_id=? LIMIT 1)', [region.id, x, y, character.id]);
  else await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=? WHERE id=?', [region.id, x, y, character.id]);
  const [spawnRows] = await connection.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,t.level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL FOR UPDATE`, [region.id, x, y, character.pos_z]);
  const spawns = materializeMonsters(spawnRows, await hasPassiveSkill(connection, character.id, 'appraisal'));
  const moved = { ...character, current_region_id: region.id, region_name: region.name, pos_x: x, pos_y: y };
  if (spawns.length) {
    const members = await partyCombatants(connection, character);
    const fastestMonster = Math.max(...spawns.map(spawn => monsterCombatStats(spawn).speed));
    const [texts] = await connection.execute<(RowDataPacket & { description: string })[]>('SELECT description FROM monster_encounter_texts WHERE monster_template_id=? ORDER BY RAND() LIMIT 1', [spawns[0].template_id]);
    return { character: moved, kind: 'encounter' as const, spawns, canAmbush: members.every(member => Number(member.speed) > fastestMonster), text: texts[0]?.description ?? `${spawns[0].name} 拦住了你的去路。` };
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

const partyCombatants = async (connection: PoolConnection, character: CharacterRow) => {
  const [rows] = await connection.execute<CharacterRow[]>(`SELECT c.*,r.name AS region_name FROM characters c JOIN map_regions r ON r.id=c.current_region_id
    WHERE c.id=? OR c.id IN (SELECT fellow.character_id FROM party_members own JOIN party_members fellow ON fellow.party_id=own.party_id WHERE own.character_id=?) ORDER BY c.id`, [character.id, character.id]);
  return rows.length ? rows : [character];
};

const activeCombatFor = async (connection: PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { combat_id: string; turn_no: number; opening_damage_bonus: number })[]>(`SELECT cs.id AS combat_id,cs.turn_no,cs.opening_damage_bonus FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id
    WHERE cm.character_id=? AND cs.state='active' LIMIT 1 FOR UPDATE`, [characterId]);
  return rows[0];
};

const combatMembers = async (connection: PoolConnection, sessionId: string) => {
  const [rows] = await connection.execute<CombatMemberRow[]>(`SELECT c.*,r.name AS region_name,cm.current_hp,cm.current_mp,cm.selected_target_id,cm.pending_action,cm.cooldowns,cm.is_defeated
    FROM combat_members cm JOIN characters c ON c.id=cm.character_id JOIN map_regions r ON r.id=c.current_region_id WHERE cm.session_id=? ORDER BY c.id FOR UPDATE`, [sessionId]);
  return rows;
};

const combatTargets = async (connection: PoolConnection, sessionId: string, revealTraits = false) => {
  const [rows] = await connection.execute<CombatTargetRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,t.level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json,ct.current_mp,ct.cooldowns,ct.is_defeated
    FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=? ORDER BY s.id FOR UPDATE`, [sessionId]);
  return materializeMonsters(rows, revealTraits);
};

export const chooseTarget = async (qqUserId: string, spawnId: number, ambush = false) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); const members = await partyCombatants(connection, character);
  ensureActionAvailable(character); if (members.some(member => member.activity_status === 'resting')) throw new Error('队伍中有人正在休息，无法进入战斗。');
  const [existing] = await connection.execute<RowDataPacket[]>(`SELECT cs.id FROM combat_sessions cs JOIN combat_members cm ON cm.session_id=cs.id WHERE cm.character_id IN (${members.map(() => '?').join(',')}) AND cs.state='active' LIMIT 1 FOR UPDATE`, members.map(member => member.id));
  if (existing[0]) throw new Error('队伍正在战斗中，请先结束当前战斗。');
  const [spawnRows] = await connection.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,t.level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL FOR UPDATE`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  const spawns = materializeMonsters(spawnRows, await hasPassiveSkill(connection, character.id, 'appraisal'));
  const selected = spawns.find(spawn => Number(spawn.id) === spawnId); if (!selected) throw new Error('目标已离开当前位置或已被击败。');
  const canAmbush = members.every(member => Number(member.speed) > Math.max(...spawns.map(spawn => monsterCombatStats(spawn).speed)));
  if (ambush && !canAmbush) throw new Error('队伍速度不足，无法发动偷袭。');
  const id = randomUUID();
  await connection.execute('INSERT INTO combat_sessions (id,character_id,spawn_id,player_hp,player_mp,cooldowns,opening_damage_bonus) VALUES (?,?,?,?,?,JSON_OBJECT(),?)', [id, character.id, spawns[0].id, character.current_hp, character.current_mp, ambush ? .5 : 0]);
  for (const member of members) await connection.execute('INSERT INTO combat_members (session_id,character_id,current_hp,current_mp,selected_target_id,cooldowns) VALUES (?,?,?,?,?,JSON_OBJECT())', [id, member.id, member.current_hp, member.current_mp, selected.id]);
  for (const spawn of spawns) { await connection.execute('INSERT INTO combat_targets (session_id,spawn_id,current_mp,cooldowns) VALUES (?,?,?,JSON_OBJECT())', [id, spawn.id, monsterCombatStats(spawn).mpMax]); for (const member of members) await connection.execute('INSERT INTO combat_threat (session_id,spawn_id,character_id,threat) VALUES (?,?,?,1)', [id, spawn.id, member.id]); }
  return { character, spawn: selected, spawns, members, ambush };
});

const negotiationFailureOpening = async (qqUserId: string, spawnId: number) => {
  const started = await chooseTarget(qqUserId, spawnId);
  return withTransaction(async connection => {
    const session = await activeCombatFor(connection, started.character.id); if (!session) throw new Error('战斗状态已失效。');
    const members = await combatMembers(connection, session.combat_id); const targets = await combatTargets(connection, session.combat_id, false);
    const attacker = targets[0]; const victim = attacker && threatTarget(members, new Map(members.map(member => [Number(member.id), 1])));
    if (!attacker || !victim) return { started, log: '交涉失败，敌人露出敌意。' };
    const monster = monsterCombatStats(attacker); const strike = resolveStrike(monster.physicalAttack, Number(victim.physical_defense), monster.accuracy, Number(victim.evasion), monster.crit, Number(victim.crit_resist_bp), monster.critDamage, Number(victim.crit_damage_reduction_bp));
    const oldHp = Number(victim.current_hp); victim.current_hp = Math.max(0, oldHp - strike.damage); if (!victim.current_hp) victim.is_defeated = 1;
    await connection.execute('UPDATE combat_members SET current_hp=?,is_defeated=? WHERE session_id=? AND character_id=?', [victim.current_hp, victim.is_defeated ? 1 : 0, session.combat_id, victim.id]);
    await connection.execute('UPDATE combat_sessions SET turn_no=turn_no+1 WHERE id=?', [session.combat_id]);
    const result = !strike.hit ? `【${attacker.name}】抢先发动攻击，但【${victim.name}】闪避了。` : `【${attacker.name}】抢先发动攻击\n➥对【${victim.name}】造成 ${strike.damage} 点物理伤害(${oldHp}→${victim.current_hp})`;
    return { started, log: `交涉失败！全队错失第一回合行动。\n${result}` };
  });
};

export const encounterAction = async (qqUserId: string, spawnId: number, action: 'avoid' | 'persuade') => {
  const found = await explore(qqUserId);
  const spawn = found.spawns.find(item => item.id === spawnId);
  if (!spawn) throw new Error('该目标不在当前位置。');
  const primary = found.spawns[0];
  const playerNegotiation = Math.max(1, Math.floor(Number(found.character.spirit) + Number(found.character.intelligence) + Number(found.character.perception) / 2));
  if (action === 'avoid') {
    return withTransaction(async connection => {
      const character = await characterFor(qqUserId); const members = await partyCombatants(connection, character); const monster = monsterCombatStats(primary);
      const canAvoid = Number(character.perception) > monster.perception || Number(character.speed) > monster.speed;
      for (const member of members) await connection.execute('INSERT INTO encounter_escape_tokens (character_id,region_id,pos_x,pos_y,pos_z) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE region_id=VALUES(region_id),pos_x=VALUES(pos_x),pos_y=VALUES(pos_y),pos_z=VALUES(pos_z)', [member.id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
      if (canAvoid) return '你抢在敌人反应之前脱离了遭遇，可以继续移动。';
      const victim = members.find(member => Number(member.id) === Number(character.id)) ?? character; const strike = resolveStrike(monster.physicalAttack, Number(victim.physical_defense), monster.accuracy, Number(victim.evasion), monster.crit, Number(victim.crit_resist_bp), monster.critDamage, Number(victim.crit_damage_reduction_bp));
      return !strike.hit ? `躲避不及，${primary.name} 发起追击，但【${victim.name}】闪避了攻击。\n你们仍成功脱离遭遇，可以继续移动。` : `躲避不及，${primary.name} 发起追击，对【${victim.name}】造成 ${strike.damage} 点物理伤害。\n你们仍成功脱离遭遇，可以继续移动。`;
    });
  }
  if (action === 'persuade') {
    const monsterNegotiation = Math.max(1, Math.floor(Object.values(monsterAttributes(primary)).reduce((total, value) => total + Number(value), 0)));
    const chance = opposedChance(playerNegotiation, monsterNegotiation);
    if (Math.random() < chance) return withTransaction(async connection => {
      const [targets] = await connection.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.level,${monsterAttributeColumns},t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.id=? AND s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL FOR UPDATE`, [spawnId, found.character.current_region_id, found.character.pos_x, found.character.pos_y, found.character.pos_z]);
      const target = targets[0]; if (!target) throw new Error('该目标已离开当前位置。');
      const experience = Math.max(1, Math.floor(Number(target.experience) * .2)); const oldLevel = Number(found.character.level); const newLevel = Math.max(oldLevel, Math.floor((Number(found.character.experience) + experience) / 100) + 1); const gainedPoints = newLevel - oldLevel;
      await connection.execute('UPDATE monster_spawns SET current_hp=0,defeated_at=NOW() WHERE id=?', [target.id]);
      await connection.execute('UPDATE characters SET level=?,experience=experience+?,skill_points=skill_points+? WHERE id=?', [newLevel, experience, gainedPoints, found.character.id]);
      const rewards: string[] = [];
      for (const rawDrop of jsonArray(target.drops_json)) {
        const drop = jsonObject(rawDrop); if (!drop.code || Math.random() >= Math.min(1, Number(drop.chance ?? 1) * .2)) continue;
        const [items] = await connection.execute<(RowDataPacket & { id: number; name: string; item_type: string })[]>('SELECT id,name,item_type FROM item_definitions WHERE code=?', [String(drop.code)]); const item = items[0]; if (!item) continue;
        const quantity = Math.max(1, Number(drop.quantity ?? 1)); await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [found.character.id, item.id]);
        if (item.item_type === 'equipment') for (let index = 0; index < quantity; index += 1) await connection.execute('INSERT INTO player_item_instances (character_id,item_id) VALUES (?,?)', [found.character.id, item.id]);
        else await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [found.character.id, item.id, quantity]);
        rewards.push(`${item.name}×${quantity}`);
      }
      return `交涉成功！${target.name} 接受了你的提议，转身消失在雾中。\n获得经验 ${experience}${gainedPoints ? `，升级至 Lv.${newLevel} 并获得 ${gainedPoints} 技能点` : ''}${rewards.length ? `\n获得 ${rewards.join('、')}` : ''}`;
    });
    const failed = await negotiationFailureOpening(qqUserId, spawnId); return failed.log;
  }
  throw new Error('未知的遇战操作。');
};

export const battleStatus = async (qqUserId: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [sessions] = await pool.execute<(RowDataPacket & { combat_id: string; turn_no: number })[]>(`SELECT cs.id AS combat_id,cs.turn_no FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state='active' LIMIT 1`, [character.id]);
  const session = sessions[0]; if (!session) throw new Error('当前不在战斗中。请移动到敌对生物所在格子。');
  const [members] = await pool.execute<CombatMemberRow[]>(`SELECT c.*,r.name AS region_name,cm.current_hp,cm.current_mp,cm.selected_target_id,cm.pending_action,cm.cooldowns,cm.is_defeated FROM combat_members cm JOIN characters c ON c.id=cm.character_id JOIN map_regions r ON r.id=c.current_region_id WHERE cm.session_id=? ORDER BY c.id`, [session.combat_id]);
  const [targetRows] = await pool.execute<CombatTargetRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,t.level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.weakness_json,t.resistance_json,ct.current_mp,ct.cooldowns,ct.is_defeated FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=? ORDER BY s.id`, [session.combat_id]);
  const appraisal = await appraisalProfileFor(pool, members.map(member => Number(member.id)));
  const targets = materializeMonsters(targetRows, false);
  const [skills] = await pool.execute<(RowDataPacket & { quick_slot: number; code: string })[]>('SELECT ps.quick_slot,s.code FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot IS NOT NULL', [character.id]);
  const [items] = await pool.execute<(RowDataPacket & { quick_slot: number })[]>('SELECT qi.quick_slot FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id WHERE qi.character_id=? AND pi.quantity>0', [character.id]);
  const own = members.find(member => Number(member.id) === Number(character.id)); if (!own) throw new Error('战斗成员状态异常。');
  return {
    sessionId: session.combat_id, characterId: Number(character.id), turn: Number(session.turn_no), playerHp: Number(own.current_hp), playerHpMax: Number(character.hp_max), playerMp: Number(own.current_mp), playerMpMax: Number(character.mp_max), selectedTargetId: own.selected_target_id ? Number(own.selected_target_id) : null,
    canAct: !Boolean(own.is_defeated) && !Boolean(own.pending_action), skillSlots: skills.map(skill => Number(skill.quick_slot)), readySkillSlots: skills.filter(skill => Number(jsonObject(own.cooldowns)[skill.code] ?? 0) <= 0).map(skill => Number(skill.quick_slot)), itemSlots: items.map(item => Number(item.quick_slot)), appraisal: { learned: appraisal.learned, rangeLevel: appraisal.rangeLevel, informationLevel: appraisal.informationLevel },
    members: members.map(member => ({ id: Number(member.id), name: member.name, hp: Number(member.current_hp), hpMax: Number(member.hp_max), mp: Number(member.current_mp), mpMax: Number(member.mp_max), defeated: Boolean(member.is_defeated), pending: Boolean(member.pending_action) })),
    targets: targets.map(target => {
      const observer = appraisalForTarget(appraisal, Number(target.level)); const identified = Boolean(observer);
      return { id: Number(target.id), name: identified ? (Number(observer!.informationLevel) >= 2 ? materializeMonster(target, true).name : target.name) : '？？？', level: identified ? Number(target.level) : null, hp: identified ? Number(target.current_hp) : '？？？', hpMax: identified ? Number(target.hp_max) : '？？？', mp: identified ? Number(target.current_mp) : '？？？', mpMax: identified ? monsterCombatStats(target).mpMax : '？？？', defeated: Boolean(target.is_defeated), identified };
    })
  };
};

export const inspectCombat = async (qqUserId: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [sessions] = await pool.execute<(RowDataPacket & { combat_id: string })[]>(`SELECT cs.id AS combat_id FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state='active' LIMIT 1`, [character.id]);
  const session = sessions[0]; if (!session) throw new Error('当前不在战斗中。');
  const [members] = await pool.execute<CombatMemberRow[]>(`SELECT c.*,r.name AS region_name,cm.current_hp,cm.current_mp,cm.selected_target_id,cm.pending_action,cm.cooldowns,cm.is_defeated FROM combat_members cm JOIN characters c ON c.id=cm.character_id JOIN map_regions r ON r.id=c.current_region_id WHERE cm.session_id=? ORDER BY c.id`, [session.combat_id]);
  const profile = await appraisalProfileFor(pool, members.map(member => Number(member.id))); if (!profile.learned) throw new Error('队伍中无人学会被动技能「鉴识」。');
  const [targets] = await pool.execute<CombatTargetRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,t.level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json,ct.current_mp,ct.cooldowns,ct.is_defeated
    FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=? ORDER BY s.id`, [session.combat_id]);
  let effects: CombatEffectRow[] = []; let threats: (RowDataPacket & { spawn_id: number; name: string; threat: number })[] = [];
  if (profile.informationLevel >= 3) [effects] = await pool.execute<CombatEffectRow[]>('SELECT ce.id,ce.target_kind,ce.target_id,e.code,e.name,e.effect_type,ce.value,ce.stacks,ce.remaining_turns FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=?', [session.combat_id]);
  if (profile.informationLevel >= 3) [threats] = await pool.execute<(RowDataPacket & { spawn_id: number; name: string; threat: number })[]>('SELECT ct.spawn_id,c.name,ct.threat FROM combat_threat ct JOIN characters c ON c.id=ct.character_id WHERE ct.session_id=?', [session.combat_id]);
  const lines = ['我方状态', ...members.map(member => `【${member.name}】HP ${member.current_hp}/${member.hp_max}｜MP ${member.current_mp}/${member.mp_max}${member.is_defeated ? '（倒下）' : ''}`), '', `鉴识：慧眼 Lv.${profile.rangeLevel}（可鉴识至自身等级 +${profile.rangeLevel * 3}）｜识珠 Lv.${profile.informationLevel}`, '', '敌方状态'];
  for (const raw of targets) {
    const observer = appraisalForTarget(profile, Number(raw.level)); const target = materializeMonster(raw, Number(observer?.informationLevel ?? 0) >= 2); if (!observer) { lines.push('【？？？】数据无法解析。'); continue; }
    lines.push(`【${target.name}】HP ${target.current_hp}/${target.hp_max}｜MP ${target.current_mp}/${monsterCombatStats(target).mpMax}`);
    if (observer.informationLevel >= 2) { const stats = monsterCombatStats(target); lines.push(`词条：${traitList(target.traits_json).map(trait => trait.name).join('、') || '无'}｜物攻 ${stats.physicalAttack}｜魔攻 ${stats.magicAttack}｜物防 ${stats.physicalDefense}｜魔防 ${stats.magicDefense}｜命中 ${stats.accuracy}｜闪避 ${stats.evasion}`); }
    if (observer.informationLevel >= 3) { const statuses = effects.filter(effect => effect.target_kind === 'target' && Number(effect.target_id) === Number(target.id)); const threat = threats.filter(item => Number(item.spawn_id) === Number(target.id)).sort((left, right) => Number(right.threat) - Number(left.threat))[0]; lines.push(`状态：${statuses.length ? statuses.map(effect => `${effect.name}${effect.stacks > 1 ? `×${effect.stacks}` : ''}(${effect.remaining_turns})`).join('、') : '无'}｜目标仇恨：${threat ? threat.name : '无'}`); }
    if (observer.informationLevel >= 4) { const className: Record<string, string> = { normal: '普通', elite: '精英', boss: '首领' }; const attrs = monsterAttributes(target); lines.push(`种族：${className[target.monster_class] ?? target.monster_class}｜弱点：${stringList(target.weakness_json).join('、') || '无'}｜抗性：${stringList(target.resistance_json).join('、') || '无'}\n六维：体${attrs.constitution} 精${attrs.spirit} 力${attrs.strength} 智${attrs.intelligence} 敏${attrs.agility} 感${attrs.perception}`); }
  }
  return { text: lines.join('\n') };
};

export const monsterDetail = async (qqUserId: string, spawnId: number) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const appraisal = await appraisalProfileFor(pool, [character.id]);
  if (!appraisal.learned) throw new Error('尚未学会被动技能「鉴识」，无法查看怪物词条与属性。');
  if (appraisal.informationLevel < 4) throw new Error('鉴识识珠达到 Lv.4 后，才能查看完整怪物图鉴。');
  const [rows] = await pool.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,t.level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json
    FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    WHERE s.id=? AND s.defeated_at IS NULL AND (s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? OR EXISTS (
      SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id JOIN combat_members cm ON cm.session_id=cs.id
      WHERE ct.spawn_id=s.id AND cm.character_id=? AND cs.state='active'
    )) LIMIT 1`, [spawnId, character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id]);
  const monster = rows[0]; if (!monster || !canAppraiseTarget(appraisal, Number(monster.level))) throw new Error('该怪物不在你当前可鉴识的范围内。');
  const shown = materializeMonster(monster, true); const stats = monsterCombatStats(shown);
  return { id: Number(shown.id), name: shown.name, level: Number(shown.level), traits: traitList(shown.traits_json).map(trait => trait.name), attributes: monsterAttributes(shown), stats };
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

const resolveStrike = (attack: number, defense: number, accuracy: number, evasion: number, crit: number, critResist: number, critDamage: number, critReduction: number, forceHit = false) => {
  if (!forceHit && Math.random() >= opposedChance(accuracy, evasion)) return { hit: false, crit: false, damage: 0 };
  let damage = Math.max(1, Math.floor(attack * attack / (attack + Math.max(1, defense))));
  const critical = Math.random() < opposedChance(crit, critResist);
  if (critical) damage = Math.max(1, Math.floor(damage * (1 + opposedChance(critDamage, critReduction))));
  return { hit: true, crit: critical, damage };
};

// 旧会话逻辑仅保留给历史会话；新战斗统一使用下方的队伍回合实现。
const combatRow = async (_qqUserId: string): Promise<{ character: CharacterRow; combat: any }> => { throw new Error('历史战斗会话不可继续。'); };
export const legacyCombatAction = async (qqUserId: string, action: 'attack' | 'skill' | 'item' | 'escape', slot?: number) => withTransaction(async connection => {
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

const weaknessMultiplier = (target: CombatTargetRow, damageType: string) => stringList(target.weakness_json).includes(damageType) ? 1.5 : stringList(target.resistance_json).includes(damageType) ? .75 : 1;
const threatTarget = (members: CombatMemberRow[], threat: Map<number, number>) => {
  const alive = members.filter(member => !member.is_defeated); const total = alive.reduce((sum, member) => sum + Math.max(1, threat.get(Number(member.id)) ?? 1), 0); let roll = Math.random() * total;
  for (const member of alive) { roll -= Math.max(1, threat.get(Number(member.id)) ?? 1); if (roll < 0) return member; }
  return alive[alive.length - 1];
};

export const switchCombatTarget = async (qqUserId: string, targetId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); const session = await activeCombatFor(connection, character.id);
  if (!session) throw new Error('当前不在战斗中。');
  const [targets] = await connection.execute<RowDataPacket[]>('SELECT spawn_id FROM combat_targets WHERE session_id=? AND spawn_id=? AND is_defeated=0 FOR UPDATE', [session.combat_id, targetId]);
  if (!targets[0]) throw new Error('该目标已被击败或不在本场战斗中。');
  await connection.execute('UPDATE combat_members SET selected_target_id=? WHERE session_id=? AND character_id=?', [targetId, session.combat_id, character.id]);
  return targetId;
});

const activeCombatEffects = async (connection: PoolConnection, sessionId: string) => {
  const [rows] = await connection.execute<CombatEffectRow[]>(`SELECT ce.id,ce.target_kind,ce.target_id,e.code,e.name,e.effect_type,ce.value,ce.stacks,ce.remaining_turns
    FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=? FOR UPDATE`, [sessionId]);
  return rows;
};

const effectMessage = (effect: { code: string; name: string; effect_type: string }, value: number, duration: number, stacks = 1) => {
  const percent = Number(value).toFixed(Number(value) % 1 ? 1 : 0);
  const detail = effect.code === 'vulnerability' ? `物防降低${percent}%`
    : effect.code === 'slow' ? `速度降低${percent}%`
      : effect.code === 'burn' ? '进入灼烧状态'
        : effect.code === 'poison' ? '进入中毒状态'
          : effect.code === 'bleeding' ? '进入流血状态'
            : effect.code === 'stun' ? '进入眩晕状态'
              : effect.code === 'barrier' ? `获得${percent}%生命值护盾`
                : effect.code === 'regeneration' ? '进入再生状态'
                  : effect.effect_type === 'cleanse' ? '祛除全部异常状态'
                    : '效果生效';
  return `　　$${effect.name}$${detail}${duration ? `(${duration})` : ''}${stacks > 1 ? `×${stacks}` : ''}`;
};

const applySkillEffects = async (connection: PoolConnection, sessionId: string, skillId: number, caster: { id: number }, casterKind: 'member' | 'target', target: { id: number }, targetKind: 'member' | 'target', timing: 'on_hit' | 'on_cast', log: string[]) => {
  const [effects] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; effect_type: string; value: number; duration: number; max_stacks: number; stackable: number; effect_level: number; target_scope: 'enemy' | 'ally' | 'self' })[]>(`SELECT e.id,e.code,e.name,e.effect_type,COALESCE(se.value_override,e.default_value) AS value,COALESCE(se.duration_override,e.default_duration) AS duration,e.max_stacks,e.stackable,se.effect_level,se.target_scope
    FROM skill_effects se JOIN effect_definitions e ON e.id=se.effect_id WHERE se.skill_id=? AND se.trigger_timing=?`, [skillId, timing]);
  for (const effect of effects) {
    const value = Number(effect.value) * (1 + Math.max(0, Number(effect.effect_level) - 1) * .25);
    const effectTargetKind = effect.target_scope === 'enemy' ? targetKind : casterKind; const targetId = effect.target_scope === 'enemy' ? Number(target.id) : Number(caster.id);
    if (effect.effect_type === 'cleanse') {
      await connection.execute(`DELETE ce FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=? AND ce.target_kind=? AND ce.target_id=? AND e.effect_type IN ('damage_over_time','stat_modifier','control')`, [sessionId, effectTargetKind, targetId]);
      log.push(effectMessage(effect, value, Number(effect.duration))); continue;
    }
    const [existing] = await connection.execute<(RowDataPacket & { id: number; stacks: number })[]>('SELECT id,stacks FROM combat_status_effects WHERE session_id=? AND target_kind=? AND target_id=? AND effect_id=? FOR UPDATE', [sessionId, effectTargetKind, targetId, effect.id]);
    if (existing[0]) {
      const stacks = effect.stackable ? Math.min(Number(effect.max_stacks), Number(existing[0].stacks) + 1) : 1;
      await connection.execute('UPDATE combat_status_effects SET effect_level=?,value=?,stacks=?,remaining_turns=GREATEST(remaining_turns,?) WHERE id=?', [effect.effect_level, value, stacks, effect.duration, existing[0].id]);
      log.push(effectMessage(effect, value, Number(effect.duration), stacks));
    } else {
      await connection.execute('INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns) VALUES (?,?,?,?,?,?,?)', [sessionId, effectTargetKind, targetId, effect.id, effect.effect_level, value, effect.duration]);
      log.push(effectMessage(effect, value, Number(effect.duration)));
    }
  }
};

const processTurnEffects = async (connection: PoolConnection, sessionId: string, members: CombatMemberRow[], targets: CombatTargetRow[], log: string[]) => {
  const effects = await activeCombatEffects(connection, sessionId);
  for (const effect of effects) {
    const target = effect.target_kind === 'member' ? members.find(member => Number(member.id) === Number(effect.target_id)) : targets.find(monster => Number(monster.id) === Number(effect.target_id));
    if (!target || target.is_defeated) { await connection.execute('DELETE FROM combat_status_effects WHERE id=?', [effect.id]); continue; }
    if (effect.effect_type === 'damage_over_time' || effect.effect_type === 'heal_over_time') {
      const maxHp = Number(effect.target_kind === 'member' ? (target as CombatMemberRow).hp_max : (target as CombatTargetRow).hp_max); const amount = Math.max(1, Math.floor(maxHp * Number(effect.value) * Number(effect.stacks) / 100)); const oldHp = Number((target as any).current_hp);
      (target as any).current_hp = effect.effect_type === 'damage_over_time' ? Math.max(0, oldHp - amount) : Math.min(maxHp, oldHp + amount);
      if (!(target as any).current_hp) (target as any).is_defeated = 1;
      log.push(`➤【${(target as any).name}】的「${effect.name}」生效\n　➥${effect.effect_type === 'damage_over_time' ? '损失' : '恢复'} ${amount} HP(${oldHp}→${(target as any).current_hp})`);
    }
    if (Number(effect.remaining_turns) <= 1) await connection.execute('DELETE FROM combat_status_effects WHERE id=?', [effect.id]);
    else await connection.execute('UPDATE combat_status_effects SET remaining_turns=remaining_turns-1 WHERE id=?', [effect.id]);
  }
  return activeCombatEffects(connection, sessionId);
};

const finishPartyVictory = async (connection: PoolConnection, sessionId: string, members: CombatMemberRow[], targets: CombatTargetRow[]) => {
  await connection.execute('UPDATE combat_sessions SET state=\'victory\' WHERE id=?', [sessionId]);
  const totalExperience = targets.reduce((sum, target) => sum + Number(target.experience), 0); const rewards: VictorySettlement['members'] = [];
  for (const member of members) {
    const modifiers = await modifiersFor(connection, Number(member.id)); const experience = totalExperience * modifiers.experienceMultiplier;
    const oldLevel = Number(member.level); const newLevel = Math.max(oldLevel, Math.floor((Number(member.experience) + experience) / 100) + 1); const gainedPoints = newLevel - oldLevel;
    await connection.execute('UPDATE characters SET level=?,experience=experience+?,skill_points=skill_points+? WHERE id=?', [newLevel, experience, gainedPoints, member.id]);
    const drops: VictorySettlement['members'][number]['drops'] = [];
    for (const target of targets) for (const rawDrop of jsonArray(target.drops_json)) {
      const drop = jsonObject(rawDrop); if (!drop.code || Math.random() > Math.min(1, Number(drop.chance ?? 1) + modifiers.dropBonus)) continue;
      const [items] = await connection.execute<(RowDataPacket & { id: number; name: string; item_type: string; codex_id: string | null })[]>('SELECT id,name,item_type,codex_id FROM item_definitions WHERE code=?', [String(drop.code)]); const item = items[0]; if (!item) continue;
      const quantity = Math.max(1, Number(drop.quantity ?? 1));
      await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [member.id, item.id]);
      if (item.item_type === 'equipment') {
        for (let index = 0; index < quantity; index += 1) {
          const [result] = await connection.execute<any>('INSERT INTO player_item_instances (character_id,item_id) VALUES (?,?)', [member.id, item.id]);
          drops.push({ name: item.name, quantity: 1, itemType: item.item_type, codexId: item.codex_id, instanceId: Number(result.insertId) });
        }
      } else {
        await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [member.id, item.id, quantity]);
        drops.push({ name: item.name, quantity, itemType: item.item_type, codexId: item.codex_id });
      }
    }
    const learned: VictorySettlement['members'][number]['learned'] = [];
    for (const target of targets) {
      const [rules] = await connection.execute<(RowDataPacket & { skill_id: number; name: string; chance: number; source_skill_code: string })[]>(`SELECT r.skill_id,s.name,r.chance,r.source_skill_code FROM monster_skill_learn_rules r JOIN skill_definitions s ON s.id=r.skill_id JOIN skill_definitions source ON source.code=r.source_skill_code AND source.category=s.category AND source.damage_type=s.damage_type WHERE r.monster_template_id=?`, [Number(target.template_id)]);
      for (const rule of rules) {
        if (!stringList(target.skill_sequence).includes(rule.source_skill_code) || Math.random() > Number(rule.chance)) continue;
        const [result] = await connection.execute<any>('INSERT IGNORE INTO player_skill_discoveries (character_id,skill_id) VALUES (?,?)', [member.id, rule.skill_id]);
        if (Number(result.affectedRows)) learned.push({ id: Number(rule.skill_id), name: rule.name });
      }
    }
    rewards.push({ name: member.name, experience, levelText: gainedPoints ? `升级至 Lv.${newLevel}，获得 ${gainedPoints} 技能点` : undefined, drops, learned });
  }
  return { kind: 'victory', members: rewards } as VictorySettlement;
};

const persistBattleMembers = async (connection: PoolConnection, members: CombatMemberRow[], forceRest = false) => {
  for (const member of members) {
    const defeated = forceRest || Boolean(member.is_defeated); const hp = defeated ? 1 : Math.max(1, Number(member.current_hp));
    await connection.execute('UPDATE characters SET current_hp=?,current_mp=?,activity_status=?,rest_started_at=? WHERE id=?', [hp, Math.max(0, Number(member.current_mp)), defeated ? 'resting' : 'active', defeated ? new Date() : null, member.id]);
  }
};

export const combatAction = async (qqUserId: string, action: PendingAction['type'], slot?: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); const session = await activeCombatFor(connection, character.id);
  if (!session) throw new Error('当前不在战斗中。');
  const members = await combatMembers(connection, session.combat_id); const actor = members.find(member => Number(member.id) === Number(character.id));
  if (!actor || actor.is_defeated) throw new Error('你已失去行动能力。');
  if (actor.pending_action) throw new Error('本回合行动已确认，请等待队友。');
  if ((action === 'skill' || action === 'item') && !slot) throw new Error('请选择快捷栏位。');
  if (action === 'skill') {
    const [skills] = await connection.execute<(RowDataPacket & { skill_id: number; code: string })[]>('SELECT ps.skill_id,s.code FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot=? FOR UPDATE', [character.id, slot]);
    if (!skills[0]) throw new Error(`${quickSlotLabel(Number(slot))}未配置`);
    const remaining = Number(jsonObject(actor.cooldowns)[skills[0].code] ?? 0);
    if (remaining > 0) throw new Error(`${quickSlotLabel(Number(slot))}冷却中，还需${remaining}回合`);
  }
  if (action === 'item') {
    const [items] = await connection.execute<RowDataPacket[]>('SELECT qi.item_id FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id WHERE qi.character_id=? AND qi.quick_slot=? AND pi.quantity>0 FOR UPDATE', [character.id, slot]);
    if (!items[0]) throw new Error(`道具${'①②③④'.charAt(Number(slot) - 1) || slot}未配置或已耗尽。`);
  }
  const pending: PendingAction = { type: action, ...(slot ? { slot } : {}) };
  await connection.execute('UPDATE combat_members SET pending_action=? WHERE session_id=? AND character_id=?', [JSON.stringify(pending), session.combat_id, character.id]); actor.pending_action = JSON.stringify(pending);
  const aliveMembers = members.filter(member => !member.is_defeated);
  if (!aliveMembers.every(member => member.pending_action)) return { ended: false, waiting: true, log: `[${character.name}]已确认行动，等待队友（${aliveMembers.filter(member => member.pending_action).length}/${aliveMembers.length}）。` };

  const appraisal = await appraisalProfileFor(connection, members.map(member => Number(member.id)));
  const targets = await combatTargets(connection, session.combat_id, false); const targetName = (target: CombatTargetRow) => { const observer = appraisalForTarget(appraisal, Number(target.level)); return observer ? (observer.informationLevel >= 2 ? materializeMonster(target, true).name : target.name) : '？？？'; }; const log: string[] = [`战斗<${session.turn_no}>回合`]; const effects = await processTurnEffects(connection, session.combat_id, members, targets, log);
  const effectValue = (kind: 'member' | 'target', targetId: number, code: string) => effects.filter(effect => effect.target_kind === kind && Number(effect.target_id) === targetId && effect.code === code).reduce((sum, effect) => sum + Number(effect.value) * Number(effect.stacks), 0);
  const turns = [...aliveMembers.filter(member => !member.is_defeated).map(member => ({ kind: 'member' as const, id: Number(member.id), speed: Number(member.speed) * (1 - effectValue('member', Number(member.id), 'slow') / 100) })), ...targets.filter(target => !target.is_defeated).map(target => ({ kind: 'target' as const, id: Number(target.id), speed: monsterCombatStats(target).speed * (1 - effectValue('target', Number(target.id), 'slow') / 100) }))].sort((a, b) => b.speed - a.speed || a.id - b.id);
  for (const turn of turns) {
    if (turn.kind === 'member') {
      const member = members.find(item => Number(item.id) === turn.id)!; if (member.is_defeated) continue;
      const choice = jsonObject(member.pending_action) as unknown as PendingAction;
      if (choice.type === 'escape') { log.push(`➤【${member.name}】选择撤离\n　➥等待队伍共同脱离。`); continue; }
      if (choice.type === 'item') {
        const [items] = await connection.execute<(RowDataPacket & { item_id: number; quantity: number; name: string; effect_json: unknown })[]>('SELECT pi.item_id,pi.quantity,i.name,i.effect_json FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id JOIN item_definitions i ON i.id=pi.item_id WHERE qi.character_id=? AND qi.quick_slot=? FOR UPDATE', [member.id, choice.slot]);
        const item = items[0]; if (!item?.quantity) { log.push(`➤【${member.name}】使用道具\n　➥快捷栏为空。`); continue; }
        const oldHp = Number(member.current_hp); member.current_hp = Math.min(Number(member.hp_max), oldHp + Number(jsonObject(item.effect_json).heal ?? 0)); await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [member.id, item.item_id]); log.push(`➤【${member.name}】使用[${item.name}]\n　➥HP ${oldHp}→${member.current_hp}`); continue;
      }
      const target = targets.find(item => Number(item.id) === Number(member.selected_target_id) && !item.is_defeated) ?? targets.find(item => !item.is_defeated); if (!target) continue;
      const modifiers = await modifiersFor(connection, Number(member.id)); let attack = Number(member.physical_attack) + modifiers.physicalAttack; let power = 1; let kind = '物理'; let damageType = '斩击'; let label = '普通攻击'; let skillId: number | undefined;
      if (choice.type === 'skill') {
        const [skills] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; category: 'physical' | 'magic'; damage_type: string; mana_cost: number; cooldown_turns: number; cooldown_reduction_per_level: number; power: number; level: number; power_per_level: number })[]>('SELECT s.id,s.code,s.name,s.category,s.damage_type,s.mana_cost,s.cooldown_turns,s.cooldown_reduction_per_level,s.power,ps.level,s.power_per_level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot=?', [member.id, choice.slot]);
        const skill = skills[0]; if (!skill) { log.push(`➤【${member.name}】释放技能\n　➥技能栏为空。`); continue; }
        const [specializationRows] = await connection.execute<(RowDataPacket & { specialization: string; level: number })[]>('SELECT specialization,level FROM player_skill_specializations WHERE character_id=? AND skill_id=?', [member.id, skill.id]); const specializations = new Map(specializationRows.map(row => [row.specialization, Number(row.level) - 1])); const overcharge = Math.max(0, specializations.get('overcharge') ?? 0); const instant = Math.max(0, specializations.get('instant') ?? 0); const efficient = Math.max(0, specializations.get('efficient') ?? 0);
        const manaCost = Math.max(skill.mana_cost ? 1 : 0, Math.ceil(Number(skill.mana_cost) * Math.pow(1.16, overcharge) * Math.pow(.92, efficient) * (modifiers.manaAffinity ? .7 : 1)) - modifiers.manaCostReduction); if (Number(member.current_mp) < manaCost) { log.push(`➤【${member.name}】释放技能「${skill.name}」\n　➥MP不足。`); continue; }
        member.current_mp -= manaCost; const cooldowns = jsonObject(member.cooldowns); const baseCooldown = Math.max(0, Number(skill.cooldown_turns) - (Number(skill.level) - 1) * Number(skill.cooldown_reduction_per_level)); const cooldown = Math.max(0, Math.ceil(Math.max(1, baseCooldown) * Math.pow(1.08, overcharge) * Math.pow(.92, instant)) - (baseCooldown === 0 ? 1 : 0)); cooldowns[skill.code] = cooldown + 1; member.cooldowns = cooldowns; skillId = Number(skill.id); label = `释放技能「${skill.name}」`; kind = skill.category === 'magic' ? '魔法' : '物理'; damageType = skill.damage_type; attack = (skill.category === 'magic' ? Number(member.magic_attack) + modifiers.magicAttack : Number(member.physical_attack) + modifiers.physicalAttack) * (Number(skill.power) + (Number(skill.level) - 1) * Number(skill.power_per_level)) * Math.pow(1.08, overcharge) * Math.pow(.96, instant) / 100; power = skill.category === 'magic' ? 1 + modifiers.magicDamagePct / 100 : 1;
      }
      const monster = monsterCombatStats(target); const vulnerability = effectValue('target', Number(target.id), 'vulnerability'); const baseDefense = kind === '魔法' ? monster.magicDefense : monster.physicalDefense; const defense = Math.floor(baseDefense * (1 - (kind === '魔法' ? 0 : Math.min(90, modifiers.ignoreDefensePct + vulnerability)) / 100)); const strike = resolveStrike(attack * power * (Number(session.turn_no) === 1 ? 1 + Number(session.opening_damage_bonus) : 1), defense, Number(member.accuracy), monster.evasion, Number(member.crit_rate_bp) + modifiers.critRateBp, monster.critResist, Number(member.crit_damage_bp), monster.critReduction);
      log.push(`➤【${member.name}】${label}`); if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', target, 'target', 'on_cast', log); if (!strike.hit) { log.push(`　➥[${targetName(target)}]闪避了攻击`); continue; }
      const elemental = weaknessMultiplier(target, damageType); const damage = Math.max(1, Math.floor(strike.damage * elemental)); const oldHp = Number(target.current_hp); target.current_hp = Math.max(0, oldHp - damage); if (!target.current_hp) target.is_defeated = 1;
      await connection.execute('UPDATE combat_threat SET threat=threat+? WHERE session_id=? AND spawn_id=? AND character_id=?', [damage, session.combat_id, target.id, member.id]); if (modifiers.lifestealPct && choice.type === 'attack') member.current_hp = Math.min(Number(member.hp_max), Number(member.current_hp) + Math.floor(damage * modifiers.lifestealPct / 100));
      const observer = appraisalForTarget(appraisal, Number(target.level));
      log.push(observer
        ? `　➥${observer.informationLevel >= 4 ? elemental > 1 ? '[克制]' : elemental < 1 ? '[抗性]' : '' : ''}${strike.crit ? '[暴击!]' : ''}对【${targetName(target)}】造成 ${damage}点${kind}伤害(${oldHp}→${target.current_hp})`
        : `　➥对【？？？】造成 ？？？点${kind}伤害(？？？→？？？)`);
      if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', target, 'target', 'on_hit', log);
    } else {
      const monsterTarget = targets.find(item => Number(item.id) === turn.id)!; if (monsterTarget.is_defeated) continue;
      const [threatRows] = await connection.execute<(RowDataPacket & { character_id: number; threat: number })[]>('SELECT character_id,threat FROM combat_threat WHERE session_id=? AND spawn_id=? FOR UPDATE', [session.combat_id, monsterTarget.id]); const victim = threatTarget(members, new Map(threatRows.map(row => [Number(row.character_id), Number(row.threat)]))); if (!victim) continue;
      const sequence = stringList(monsterTarget.skill_sequence); const cooldowns = jsonObject(monsterTarget.cooldowns);
      let skill: (RowDataPacket & { id: number; code: string; name: string; category: 'physical' | 'magic'; power: number; mana_cost: number; cooldown_turns: number }) | undefined;
      if (sequence.length) {
        const placeholders = sequence.map(() => '?').join(',');
        const [skillRows] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; category: 'physical' | 'magic'; power: number; mana_cost: number; cooldown_turns: number })[]>(`SELECT id,code,name,category,power,mana_cost,cooldown_turns FROM skill_definitions WHERE code IN (${placeholders})`, sequence);
        const readySkills = skillRows.filter(candidate => Number(monsterTarget.current_mp) >= Number(candidate.mana_cost) && Number(cooldowns[candidate.code] ?? 0) <= 0);
        skill = readySkills.length ? readySkills[random(0, readySkills.length - 1)] : undefined;
      }
      if (skill) { monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns; }
      const multiplier = Number(skill?.power ?? 100) / 100; const monster = monsterCombatStats(monsterTarget); const bite = skill?.code === 'bite';
      const monsterAttack = skill?.category === 'magic' ? monster.magicAttack : monster.physicalAttack; const victimDefense = skill?.category === 'magic' ? Number(victim.magic_defense) : Number(victim.physical_defense);
      const strike = resolveStrike(monsterAttack * multiplier, victimDefense, monster.accuracy, Number(victim.evasion), monster.crit + (bite ? 2500 : 0), Number(victim.crit_resist_bp), monster.critDamage, Number(victim.crit_damage_reduction_bp), bite);
      const identifiedMonster = Boolean(appraisalForTarget(appraisal, Number(monsterTarget.level)));
      log.push(`➤【${targetName(monsterTarget)}】${skill ? `释放技能「${identifiedMonster ? skill.name : '？？？'}」` : '普通攻击'}`);
      if (bite) { log.push('　#必中#该攻击必定命中'); log.push('　#獠牙#该攻击暴击+25%'); }
      if (!strike.hit) { log.push(`　➥[${victim.name}]闪避了攻击`); continue; }
      const oldHp = Number(victim.current_hp); victim.current_hp = Math.max(0, oldHp - strike.damage); if (!victim.current_hp) victim.is_defeated = 1; log.push(`　➥${strike.crit ? '[暴击!]' : ''}对【${victim.name}】造成 ${strike.damage} 点${skill?.category === 'magic' ? '魔法' : '物理'}伤害(${oldHp}→${victim.current_hp})`); if (skill) await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', victim, 'member', 'on_hit', log);
    }
  }
  for (const target of targets) {
    const cooldowns = jsonObject(target.cooldowns); for (const [code, turns] of Object.entries(cooldowns)) cooldowns[code] = Math.max(0, Number(turns) - 1);
    await connection.execute('UPDATE monster_spawns SET current_hp=?,defeated_at=IF(?,NOW(),defeated_at) WHERE id=?', [target.current_hp, target.is_defeated ? 1 : 0, target.id]);
    await connection.execute('UPDATE combat_targets SET current_mp=?,cooldowns=?,is_defeated=? WHERE session_id=? AND spawn_id=?', [target.current_mp, JSON.stringify(cooldowns), target.is_defeated ? 1 : 0, session.combat_id, target.id]);
  }
  for (const target of targets) if (!canAppraiseTarget(appraisal, Number(target.level))) for (let index = 0; index < log.length; index += 1) {
    if (!log[index].includes(target.name)) continue;
    log[index] = log[index].replaceAll(target.name, '？？？').replace(/(损失|恢复) \d+ HP\(\d+→\d+\)/g, '$1 ？？？ HP(？？？→？？？)');
  }
  for (const member of members) {
    const cooldowns = jsonObject(member.cooldowns); for (const [code, turns] of Object.entries(cooldowns)) cooldowns[code] = Math.max(0, Number(turns) - 1);
    await connection.execute('UPDATE combat_members SET current_hp=?,current_mp=?,cooldowns=?,is_defeated=?,pending_action=NULL WHERE session_id=? AND character_id=?', [member.current_hp, member.current_mp, JSON.stringify(cooldowns), member.is_defeated ? 1 : 0, session.combat_id, member.id]);
  }
  if (aliveMembers.every(member => (jsonObject(member.pending_action) as unknown as PendingAction).type === 'escape')) { await connection.execute('UPDATE combat_sessions SET state=\'escaped\' WHERE id=?', [session.combat_id]); await persistBattleMembers(connection, members); return { ended: true, waiting: false, log: `${log.join('\n')}\n\n队伍一同撤离了战斗。` }; }
  if (targets.every(target => target.is_defeated)) { const settlement = await finishPartyVictory(connection, session.combat_id, members, targets); await persistBattleMembers(connection, members); return { ended: true, waiting: false, log: log.join('\n'), settlement }; }
  if (members.every(member => member.is_defeated)) { await connection.execute('UPDATE combat_sessions SET state=\'defeat\' WHERE id=?', [session.combat_id]); for (const member of members) await connection.execute('UPDATE characters SET experience=GREATEST(0,experience-10) WHERE id=?', [member.id]); await persistBattleMembers(connection, members, true); return { ended: true, waiting: false, log: log.join('\n'), settlement: '战败结算\n队伍战败，每人损失10点经验，生命仅余1点并开始休息。' }; }
  await connection.execute('UPDATE combat_sessions SET turn_no=turn_no+1 WHERE id=?', [session.combat_id]); return { ended: false, waiting: false, log: log.join('\n') };
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
