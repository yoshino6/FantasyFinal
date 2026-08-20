import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { calculateDerivedStats, experienceRequiredForLevel, realmEnergyDissipationText, realmLevelCap } from './constants';
import { recalculateCharacterStats } from './character.service';
import { advanceBountyProgress, refreshBounties } from './bounty.service';
import { attributes, type Allocation } from './types';

type CharacterRow = RowDataPacket & Allocation & Record<`${keyof Allocation}_growth`, number> & { id: number; player_id: number; npc_code: string | null; name: string; level: number; experience: number; realm_stage: number; skill_points: number; hp_max: number; mp_max: number; current_hp: number; current_mp: number; activity_status: 'active' | 'resting' | 'unconscious'; rest_started_at: Date | null; physical_attack: number; magic_attack: number; physical_defense: number; magic_defense: number; accuracy: number; evasion: number; crit_rate_bp: number; crit_damage_bp: number; crit_resist_bp: number; crit_damage_reduction_bp: number; tenacity: number; speed: number; perception: number; spirit: number; intelligence: number; element_mastery_json: unknown; element_resistance_json: unknown; adventurer_registered: number; current_region_id: number; pos_x: number; pos_y: number; pos_z: number; region_name: string };
type MonsterAttributes = Allocation & Record<`${keyof Allocation}_growth`, number>;
type MonsterTrait = { code: string; name: string; attributeMultiplier?: number; statMultiplier?: number; hpPct?: number; mpPct?: number; physicalAttackPct?: number; magicAttackPct?: number; physicalDefensePct?: number; magicDefensePct?: number; accuracyPct?: number; evasionPct?: number; speedPct?: number; critRatePct?: number; critDamagePct?: number; critResistPct?: number; critReductionPct?: number; experiencePct?: number; dropPct?: number };
type SpawnRow = RowDataPacket & MonsterAttributes & { id: number; template_id?: number; name: string; monster_class: string; level: number; current_hp: number; hp_max: number; attack: number; defense: number; speed: number; experience: number; drops_json: unknown; skill_sequence?: unknown; traits_json?: unknown; weakness_json?: unknown; resistance_json?: unknown; element_mastery_json?: unknown; element_resistance_json?: unknown };
type CombatMemberRow = CharacterRow & { current_hp: number; current_mp: number; selected_target_id: number | null; pending_action: unknown; cooldowns: unknown; is_defeated: number };
type CombatTargetRow = SpawnRow & { current_mp: number; cooldowns: unknown; is_defeated: number };
type PendingAction = { type: 'attack' | 'skill' | 'item' | 'escape'; slot?: number; skillId?: number };
type CombatEffectRow = RowDataPacket & { id: number; target_kind: 'member' | 'target'; target_id: number; code: string; name: string; effect_type: string; value: number; stacks: number; remaining_turns: number };
type CombatModifiers = { weaponName?: string; artifact?: 'holy_sword' | 'demon_sword'; physicalAttack: number; magicAttack: number; physicalAttackPct: number; magicAttackPct: number; physicalDefensePct: number; magicDefensePct: number; critRatePct: number; critDamagePct: number; accuracyPct: number; mpPct: number; chantSpeedPct: number; critRateBp: number; ignoreDefensePct: number; lifestealPct: number; magicDamagePct: number; damageBonusPct: number; manaCostReduction: number; experienceMultiplier: number; dropBonus: number; manaAffinity: boolean };
type AppraisalMember = { characterId: number; level: number; rangeLevel: number; informationLevel: number };
type AppraisalProfile = { learned: boolean; rangeLevel: number; informationLevel: number; members: AppraisalMember[] };
export type VictorySettlement = { kind: 'victory'; members: { name: string; experience: number; realmLocked?: boolean; realmCapReached?: boolean; levelText?: string; drops: { name: string; quantity: number; itemType: string; codexId: string | null; instanceId?: number }[]; learned: { id: number; name: string }[] }[]; arrivalPending?: boolean };
const monsterAttributeColumns = `${attributes.map(attribute => `COALESCE(s.${attribute},t.${attribute}) AS ${attribute},t.${attribute}_growth`).join(',')}`;
const templateMonsterAttributeColumns = `${attributes.map(attribute => `t.${attribute},t.${attribute}_growth`).join(',')}`;
const lowMonsterTraits: MonsterTrait[] = [
  { code: 'fierce', name: '凶猛的', physicalAttackPct: 10 }, { code: 'sturdy', name: '坚韧的', hpPct: 10 },
  { code: 'keen', name: '敏锐的', accuracyPct: 10 }, { code: 'nimble', name: '灵巧的', evasionPct: 10, speedPct: 5 },
  { code: 'arcane', name: '魔蕴的', magicAttackPct: 10 }, { code: 'hardhide', name: '硬皮的', physicalDefensePct: 10 }
];
const traitList = (value: unknown) => jsonArray(value).map(item => jsonObject(item) as unknown as MonsterTrait).filter(trait => trait.code && trait.name);
const isSummonedMonster = (monster: { traits_json?: unknown }) => traitList(monster.traits_json).some(trait => trait.code === 'summoned');
const riotMaterialByMonster: Record<string, string> = { ball_rabbit: 'magic_wool', roll_rabbit: 'magic_wool', spike_boar: 'magic_tusk', tusk_boar: 'magic_tusk', vine_snake: 'magic_scale', vine_python: 'magic_scale', black_bear: 'magic_claw', pitch_bear: 'magic_claw', mist_wolf: 'magic_heartcore', shadow_wolf: 'magic_heartcore', goblin: 'goblin_ear' };
const percentBonus = (traits: MonsterTrait[], key: keyof MonsterTrait) => traits.reduce((total, trait) => total + Number(trait[key] ?? 0), 0);
const monsterAttributes = (monster: MonsterAttributes & { level: number; traits_json?: unknown }): Allocation => {
  const multiplier = traitList((monster as SpawnRow).traits_json).reduce((value, trait) => value * Number(trait.attributeMultiplier ?? 1), 1);
  return Object.fromEntries(attributes.map(attribute => {
    const baseValue = Number(monster[attribute]) + Math.max(0, Number(monster.level) - 1) * Number(monster[`${attribute}_growth`]);
    return [attribute, Math.floor(baseValue * multiplier)];
  })) as Allocation;
};
const monsterCombatStats = (monster: MonsterAttributes & { level: number; traits_json?: unknown }) => {
  const values = monsterAttributes(monster);
  const stats = calculateDerivedStats(values);
  const traits = traitList((monster as SpawnRow).traits_json);
  const statMultiplier = traits.reduce((value, trait) => value * Number(trait.statMultiplier ?? 1), 1);
  const boss = (monster as SpawnRow).monster_class === 'boss';
  const boosted = (value: number, key: keyof MonsterTrait) => Math.floor(value * statMultiplier * (1 + percentBonus(traits, key) / 100));
  const scaled = (value: number) => Math.floor(value * statMultiplier);
  return {
    hpMax: boosted(stats.hpMax, 'hpPct') * (boss ? 4 : 1), mpMax: boosted(stats.mpMax, 'mpPct'), physicalAttack: boosted(stats.physicalAttack, 'physicalAttackPct'), magicAttack: boosted(stats.magicAttack, 'magicAttackPct'),
    physicalDefense: boosted(stats.physicalDefense, 'physicalDefensePct'), magicDefense: boosted(stats.magicDefense, 'magicDefensePct'), accuracy: boosted(stats.accuracy, 'accuracyPct'), evasion: boosted(stats.evasion, 'evasionPct'),
    crit: boosted(stats.critRateBp, 'critRatePct'), critResist: boosted(stats.critResistBp, 'critResistPct'), critDamage: boosted(stats.critDamageBp, 'critDamagePct'), critReduction: boosted(stats.critDamageReductionBp, 'critReductionPct'), tenacity: scaled(stats.tenacity), speed: boosted(stats.speed, 'speedPct'), perception: scaled(values.perception)
  };
};
const materializeMonster = <T extends SpawnRow>(monster: T, revealTraits = false): T => {
  const stats = monsterCombatStats(monster);
  const traits = traitList(monster.traits_json);
  const baseName = String(monster.name).replace(/^(?:虚弱的|凶猛的|迅捷的|坚韧的)+/, '');
  return Object.assign({}, monster, { name: `${revealTraits ? traits.map(trait => trait.name).join('') : ''}${baseName}`, hp_max: stats.hpMax, attack: stats.physicalAttack, defense: stats.physicalDefense, speed: stats.speed });
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
const awardRealmExperience = async (connection: PoolConnection, character: Pick<CharacterRow, 'id' | 'level' | 'experience' | 'realm_stage'>, rawExperience: number) => {
  const currentLevel = Number(character.level); const levelCap = realmLevelCap(Number(character.realm_stage ?? 1));
  let level = currentLevel; let experience = Number(character.experience); let remaining = Math.max(0, Math.floor(rawExperience));
  const wasAtRealmCap = currentLevel >= levelCap && experience >= experienceRequiredForLevel(currentLevel);
  let gainedExperience = 0; let gainedPoints = 0;

  // 境界封顶时，允许将当前等级的经验条填满；填满后获得的经验才会消散。
  while (remaining > 0) {
    const required = experienceRequiredForLevel(level);
    const room = Math.max(0, required - experience);
    if (room <= 0) {
      if (level >= levelCap) break;
      level++; gainedPoints++; experience = 0;
      continue;
    }
    const granted = Math.min(room, remaining);
    experience += granted; remaining -= granted; gainedExperience += granted;
    if (experience < required || level >= levelCap) break;
    level++; gainedPoints++; experience = 0;
  }

  // 本次奖励若仍成功填入经验条，照常显示经验；只有已满后再次获得经验才提示消散。
  const atRealmCap = level >= levelCap && experience >= experienceRequiredForLevel(level);
  const realmCapReached = !wasAtRealmCap && atRealmCap;
  const realmLocked = gainedExperience === 0 && remaining > 0 && atRealmCap;
  if (gainedExperience > 0 || level !== currentLevel) await connection.execute('UPDATE characters SET level=?,experience=?,skill_points=skill_points+? WHERE id=?', [level, experience, gainedPoints, character.id]);
  return { experience: gainedExperience, level, gainedPoints, realmLocked, realmCapReached };
};
const randomMonsterLevel = (monsterClass: string, defaultLevel: number) => monsterClass === 'normal' ? random(1, 5) : monsterClass === 'elite' && defaultLevel >= 7 ? random(7, 9) : monsterClass === 'large' || monsterClass === 'elite' ? random(4, 9) : defaultLevel;
const randomMonsterBaseAttributes = (template: MonsterAttributes & { monster_class: string }): Allocation => {
  const total = template.monster_class === 'normal' ? random(45, 65)
    : template.monster_class === 'large' ? random(65, 90)
      : template.monster_class === 'elite' ? random(90, 120)
        : template.monster_class === 'boss' ? random(120, 150)
          : attributes.reduce((sum, attribute) => sum + Number(template[attribute]), 0);
  const values = Object.fromEntries(attributes.map(attribute => [attribute, 1])) as Allocation;
  const weights = attributes.map(attribute => Math.max(1, Number(template[attribute])) * (0.85 + Math.random() * 0.3));
  for (let remaining = total - attributes.length; remaining > 0; remaining--) {
    let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
    const index = weights.findIndex(weight => (roll -= weight) < 0);
    values[attributes[index < 0 ? attributes.length - 1 : index]]++;
  }
  return values;
};
const wolfKingTraits: MonsterTrait[] = [
  { code: 'ordinary', name: '普通的' }, { code: 'powerful', name: '强大的', statMultiplier: 1.1, experiencePct: 20, dropPct: 10 },
  { code: 'heroic', name: '英雄的', statMultiplier: 1.2, experiencePct: 30, dropPct: 20 }, { code: 'infernal', name: '深渊的', statMultiplier: 1.35, experiencePct: 50, dropPct: 40 },
  { code: 'abyssal', name: '地狱的', statMultiplier: 1.5, experiencePct: 80, dropPct: 60 }, { code: 'crimson', name: '猩红的', statMultiplier: 1.25, physicalAttackPct: 40, magicAttackPct: 40, accuracyPct: 40, critRatePct: 40, critDamagePct: 40, experiencePct: 100, dropPct: 80 },
  { code: 'corrupted', name: '腐化的', statMultiplier: 1.25, physicalDefensePct: 60, magicDefensePct: 60, critResistPct: 60, critReductionPct: 60, experiencePct: 100, dropPct: 80 }, { code: 'holy', name: '神圣的', statMultiplier: 1.25, hpPct: 100, evasionPct: 100, experiencePct: 100, dropPct: 80 },
  { code: 'golden', name: '黄金的', statMultiplier: 1.5, evasionPct: 33.3333, experiencePct: 150, dropPct: 100 }, { code: 'brilliant', name: '璀璨的', statMultiplier: 1.75, evasionPct: 100, experiencePct: 250, dropPct: 250 },
  { code: 'dreamlike', name: '梦幻的', statMultiplier: 2, evasionPct: 200, experiencePct: 600, dropPct: 600 }
];
const bossSpawnChanceByCode: Record<string, number> = { shadow_wolf_king: .5 };
const randomMonsterTraits = (template?: { code?: string }) => {
  if (template?.code === 'shadow_wolf_king') {
    const weights = [25, 24, 15, 10, 5, 5, 5, 5, 3, 2, 1]; let roll = Math.random() * 100;
    return [wolfKingTraits[weights.findIndex(weight => (roll -= weight) < 0) || 0]];
  }
  if (Math.random() < .01) return [{ code: 'riot', name: '暴动的', statMultiplier: 2 }];
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
const dropQuantity = (drop: Record<string, unknown>) => {
  const minimum = Math.max(1, Math.floor(Number(drop.min_quantity ?? drop.quantity ?? 1)));
  const maximum = Math.max(minimum, Math.floor(Number(drop.max_quantity ?? drop.quantity ?? minimum)));
  return minimum + Math.floor(Math.random() * (maximum - minimum + 1));
};
const finalAttribute = (character: Pick<CharacterRow, keyof Allocation | `${keyof Allocation}_growth` | 'level'>, attribute: keyof Allocation) => Number(character[attribute]) + Number(character[`${attribute}_growth`]) * Math.max(0, Number(character.level) - 1);
// 以 0.9 次幂递减：平均角色约为 Lv.1=2、Lv.10=4、Lv.20=6；后期硬上限为 10。
const explorationScale = (attribute: number, level: number) => {
  const statValue = 1 + Math.floor(Math.pow(Math.max(1, attribute) / 7, .9));
  const levelCap = Math.min(10, 2 + Math.floor(Math.max(1, level) / 5));
  return Math.max(1, Math.min(10, levelCap, statValue));
};
const movementSpeedFrom = (agility: number, level: number, speedPenalty: number) => explorationScale(Math.max(1, agility - speedPenalty / 8), level);
const roundTowardInitialTiming = (initial: number, raw: number) => {
  if (initial <= 0) return raw > 2 ? Math.max(1, Math.floor(raw) - 1) : 0;
  return raw < initial ? Math.ceil(raw) : Math.floor(raw);
};
const activeSkillUpgradeCost = (level: number) => Math.floor(Math.max(1, level) / 10) + 1;
const weaponMasteryCodes = new Set(['longsword_mastery', 'shield_mastery', 'staff_mastery', 'spellbook_mastery', 'orb_mastery', 'dagger_mastery', 'fistblade_mastery']);
const masteryUpgradeCost = (level: number) => Math.max(1, level) * 2;

const characterFor = async (qqUserId: string): Promise<CharacterRow> => {
  const pool = await getPool(); const [rows] = await pool.execute<CharacterRow[]>(`SELECT c.*, r.name AS region_name FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id WHERE p.qq_user_id=? LIMIT 1`, [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  const character = rows[0];
  if ((character.activity_status === 'resting' || character.activity_status === 'unconscious') && character.rest_started_at) {
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

// 初章一旦开始，玩家必须先完成史莱姆剧情，避免旧消息或手动命令绕过剧情去挑战别的目标。
const forestGuideStatusFor = async (connection: Pool | PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { status: string })[]>('SELECT status FROM player_story_progress WHERE character_id=? AND story_code=\'forest_guide\' LIMIT 1', [characterId]);
  return rows[0]?.status;
};
const ensureForestGuideFreeAction = async (connection: Pool | PoolConnection, characterId: number) => {
  const status = await forestGuideStatusFor(connection, characterId);
  if (status && status !== 'completed') throw new Error('你正在推进「初章·包容之镇」，请先完成当前剧情。');
};

const ensureActionAvailable = (character: CharacterRow) => {
  if (character.activity_status === 'unconscious') throw new Error('你已经昏迷，请等待生命与魔力恢复至满值。');
  if (character.activity_status === 'resting') throw new Error('你正在休息，请先切换至行动。');
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
  if (character.activity_status === 'unconscious') throw new Error('你已经昏迷，请等待生命与魔力恢复至满值。');
  if (character.activity_status === 'resting') { const pool = await getPool(); await pool.execute('UPDATE characters SET activity_status=\'active\',rest_started_at=NULL WHERE id=?', [character.id]); return { message: '你结束休息，可以继续行动。' }; }
  return { message: '你可以继续行动。' };
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
  const [rows] = await connection.execute<(RowDataPacket & { name: string | null; effect_json: string | null; weapon_type: string | null; slot: string; quality: number })[]>(`SELECT i.name,i.weapon_type,pe.slot,COALESCE(ii.effect_json,i.effect_json) AS effect_json,COALESCE(ii.quality,100) AS quality FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id WHERE pe.character_id=?`, [characterId]);
  const [passiveRows] = await connection.execute<(RowDataPacket & { id: number; code: string; passive_effect_json: unknown })[]>(`SELECT s.id,s.code,s.passive_effect_json FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.category='passive'`, [characterId]);
  const [specializationRows] = await connection.execute<(RowDataPacket & { skill_id: number; specialization: string; level: number })[]>('SELECT skill_id,specialization,level FROM player_skill_specializations WHERE character_id=?', [characterId]);
  const [battleBuffs] = await connection.execute<(RowDataPacket & { buff_code: string })[]>('SELECT buff_code FROM player_battle_buffs WHERE character_id=? AND remaining_battles>0', [characterId]);
  const effect = jsonObject(rows.find(row => row.slot === 'weapon')?.effect_json);
  const passives = new Map(passiveRows.map(row => [row.code, jsonObject(row.passive_effect_json)]));
  const growth = passives.get('growth_blessing'); const lucky = passives.get('lucky_favor'); const mana = passives.get('mana_affinity');
  const mastery = (key: string) => passiveRows.reduce((result, row) => { const passive = jsonObject(row.passive_effect_json); const type = String(passive.weaponType ?? ''); const matched = rows.find(item => item.weapon_type === type); if (!matched) return result; const proficiency = Math.min(5, Math.max(1, Number(specializationRows.find(item => Number(item.skill_id) === Number(row.id) && item.specialization === 'overcharge')?.level ?? 1))); const focus = Math.min(6, Math.max(1, Number(specializationRows.find(item => Number(item.skill_id) === Number(row.id) && item.specialization === 'instant')?.level ?? 1))); const scale = matched.slot === 'offhand' ? .5 + (focus - 1) * .1 : 1; return result + Number(passive[key] ?? 0) * proficiency * scale; }, 0);
  const damageBonusPct = rows.reduce((total, row) => total + Number(jsonObject(row.effect_json).damageBonusPct ?? 0) * (.6 + Math.max(0, Math.min(100, Number(row.quality))) * .004), 0);
  const experienceElixir = battleBuffs.some(buff => buff.buff_code === 'minor_experience_elixir');
  return { weaponName: rows.find(row => row.slot === 'weapon')?.name ?? undefined, artifact: effect.artifact === 'holy_sword' || effect.artifact === 'demon_sword' ? effect.artifact : undefined, physicalAttack: 0, magicAttack: 0, physicalAttackPct: mastery('physicalAttackPct'), magicAttackPct: mastery('magicAttackPct'), physicalDefensePct: mastery('physicalDefensePct'), magicDefensePct: mastery('magicDefensePct'), critRatePct: mastery('critRatePct'), critDamagePct: mastery('critDamagePct'), accuracyPct: 0, mpPct: mastery('mpPct'), chantSpeedPct: mastery('chantSpeedPct'), critRateBp: 0, ignoreDefensePct: Number(effect.ignoreDefensePct ?? 0), lifestealPct: Number(effect.lifestealPct ?? 0), magicDamagePct: Number(effect.magicDamagePct ?? 0), damageBonusPct, manaCostReduction: Number(effect.manaCostReduction ?? 0), experienceMultiplier: Number(growth?.experienceMultiplier ?? 1) * (experienceElixir ? 1.25 : 1), dropBonus: Number(lucky?.dropBonusPct ?? 0) / 100, manaAffinity: Boolean(mana) };
};

const consumeBattleBuffs = async (connection: PoolConnection, members: CombatMemberRow[]) => {
  const ids = members.filter(member => !member.npc_code).map(member => Number(member.id)); if (!ids.length) return;
  const marks = ids.map(() => '?').join(',');
  await connection.execute(`UPDATE player_battle_buffs SET remaining_battles=remaining_battles-1 WHERE character_id IN (${marks}) AND remaining_battles>0`, ids);
  await connection.execute(`DELETE FROM player_battle_buffs WHERE character_id IN (${marks}) AND remaining_battles<=0`, ids);
};

type MapRegionRow = RowDataPacket & { id: number; code: string; name: string; min_x: number; max_x: number; min_y: number; max_y: number; min_z: number; max_z: number };
type BossTemplateRow = RowDataPacket & MonsterAttributes & { id: number; code: string; name: string; level: number; monster_class: string; skill_sequence: unknown };
export type BossEvent = { regionCode: string; regionName: string; bossCode: string; bossName: string; x: number | null; y: number | null; z: number | null; traits: string[] };

const bossSpawnPosition = async (pool: Pool, region: MapRegionRow) => {
  const [blockedRows] = await pool.execute<(RowDataPacket & { pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pos_x,pos_y,pos_z FROM map_npcs WHERE region_id=? AND pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL UNION SELECT pos_x,pos_y,pos_z FROM map_special_objects WHERE region_id=?`, [region.id, region.id]);
  const blocked = new Set(blockedRows.map(row => `${row.pos_x},${row.pos_y},${row.pos_z}`)); let x = random(region.min_x, region.max_x); let y = random(region.min_y, region.max_y); const z = random(region.min_z, region.max_z);
  for (let attempt = 0; attempt < 64 && blocked.has(`${x},${y},${z}`); attempt++) { x = random(region.min_x, region.max_x); y = random(region.min_y, region.max_y); }
  return blocked.has(`${x},${y},${z}`) ? null : { x, y, z };
};

const spawnBoss = async (pool: Pool, region: MapRegionRow, template: BossTemplateRow) => {
  const [active] = await pool.execute<RowDataPacket[]>('SELECT id FROM monster_spawns WHERE region_id=? AND template_id=? AND defeated_at IS NULL LIMIT 1', [region.id, template.id]);
  if (active[0]) return false;
  const position = await bossSpawnPosition(pool, region); if (!position) return false;
  const attributes = randomMonsterBaseAttributes(template); const traits = randomMonsterTraits(template); const spawned = { ...template, ...attributes, level: Number(template.level), traits_json: traits }; const stats = monsterCombatStats(spawned);
  await pool.execute('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [template.id, region.id, position.x, position.y, position.z, template.level, attributes.constitution, attributes.spirit, attributes.strength, attributes.intelligence, attributes.agility, attributes.perception, stats.hpMax, JSON.stringify(stringList(template.skill_sequence)), JSON.stringify(traits)]);
  return true;
};

export const bossEvents = async (): Promise<BossEvent[]> => {
  const pool = await getPool(); const [rows] = await pool.execute<(RowDataPacket & { region_code: string; region_name: string; boss_code: string; boss_name: string; pos_x: number | null; pos_y: number | null; pos_z: number | null; traits_json: unknown })[]>(`SELECT r.code AS region_code,r.name AS region_name,t.code AS boss_code,t.name AS boss_name,s.pos_x,s.pos_y,s.pos_z,s.traits_json FROM map_monster_pools p JOIN map_regions r ON r.id=p.region_id JOIN monster_templates t ON t.id=p.monster_template_id LEFT JOIN monster_spawns s ON s.region_id=r.id AND s.template_id=t.id AND s.defeated_at IS NULL WHERE t.monster_class='boss' ORDER BY r.id,t.id`);
  return rows.map(row => ({ regionCode: row.region_code, regionName: row.region_name, bossCode: row.boss_code, bossName: row.boss_name, x: row.pos_x === null ? null : Number(row.pos_x), y: row.pos_y === null ? null : Number(row.pos_y), z: row.pos_z === null ? null : Number(row.pos_z), traits: traitList(row.traits_json).map(trait => trait.name) }));
};

export const adminSpawnBoss = async (code: string) => {
  const pool = await getPool(); const [rows] = await pool.execute<(MapRegionRow & BossTemplateRow)[]>(`SELECT r.id,r.code AS region_code,r.name AS region_name,r.min_x,r.max_x,r.min_y,r.max_y,r.min_z,r.max_z,t.id AS template_id,t.code AS boss_code,t.name AS boss_name,t.level,t.monster_class,t.constitution,t.spirit,t.strength,t.intelligence,t.agility,t.perception,t.constitution_growth,t.spirit_growth,t.strength_growth,t.intelligence_growth,t.agility_growth,t.perception_growth,t.skill_sequence FROM map_monster_pools p JOIN map_regions r ON r.id=p.region_id JOIN monster_templates t ON t.id=p.monster_template_id WHERE t.code=? AND t.monster_class='boss' LIMIT 1`, [code]);
  const row = rows[0] as unknown as (MapRegionRow & BossTemplateRow & { region_code: string; region_name: string; template_id: number; boss_code: string; boss_name: string }); if (!row) throw new Error('未找到该 Boss 的地图配置。');
  const region = { ...row, id: Number(row.id), code: row.region_code, name: row.region_name } as MapRegionRow; const template = { ...row, id: Number(row.template_id), code: row.boss_code, name: row.boss_name } as BossTemplateRow;
  await spawnBoss(pool, region, template); return (await bossEvents()).find(event => event.bossCode === code) ?? null;
};

export const adminDefeatBoss = async (code: string) => {
  const pool = await getPool(); const [result] = await pool.execute<any>(`UPDATE monster_spawns s JOIN monster_templates t ON t.id=s.template_id SET s.current_hp=0,s.defeated_at=NOW() WHERE t.code=? AND t.monster_class='boss' AND s.defeated_at IS NULL`, [code]);
  return Number(result.affectedRows) > 0;
};

export const spawnMonsters = async ({ refreshBosses = true, trimExcess = true }: { refreshBosses?: boolean; trimExcess?: boolean } = {}) => {
  const pool = await getPool();
  const [regions] = await pool.execute<MapRegionRow[]>('SELECT id,code,name,min_x,max_x,min_y,max_y,min_z,max_z FROM map_regions WHERE is_spawn_enabled=1');
  for (const region of regions) {
  const [allTemplates] = await pool.execute<(RowDataPacket & MonsterAttributes & { id: number; code: string; name: string; level: number; monster_class: string; spawn_weight: number; skill_sequence: unknown })[]>(`SELECT t.id,t.code,t.name,t.level,t.monster_class,t.skill_sequence,p.spawn_weight,${templateMonsterAttributeColumns} FROM map_monster_pools p JOIN monster_templates t ON t.id=p.monster_template_id WHERE p.region_id=?`, [region.id]);
    const bossTemplates = allTemplates.filter(template => template.monster_class === 'boss');
    if (refreshBosses) for (const template of bossTemplates) if (Math.random() < Number(bossSpawnChanceByCode[template.code] ?? 0)) await spawnBoss(pool, region, template);
    const templates = allTemplates.filter(template => template.monster_class !== 'boss');
    if (!templates.length) continue;
    const [blockedRows] = await pool.execute<(RowDataPacket & { pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pos_x,pos_y,pos_z FROM map_npcs WHERE region_id=? AND pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL
      UNION SELECT pos_x,pos_y,pos_z FROM map_special_objects WHERE region_id=?`, [region.id, region.id]);
    const blocked = new Set(blockedRows.map(row => `${row.pos_x},${row.pos_y},${row.pos_z}`));
    const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM monster_spawns s
      JOIN monster_templates t ON t.id=s.template_id
      WHERE s.region_id=? AND s.defeated_at IS NULL AND t.monster_class<>'boss'`, [region.id]);
    const area = (region.max_x - region.min_x + 1) * (region.max_y - region.min_y + 1) * (region.max_z - region.min_z + 1);
    const spawnLimit = Math.floor(area * 0.01);
    let activeCount = Number(countRows[0].total);
    if (trimExcess && activeCount > spawnLimit) {
      const [excessRows] = await pool.execute<(RowDataPacket & { id: number })[]>(`SELECT s.id FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id
        WHERE s.region_id=? AND s.defeated_at IS NULL AND t.monster_class<>'boss'
          AND NOT EXISTS (SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=s.id AND cs.state='active')
        ORDER BY s.spawned_at ASC LIMIT ?`, [region.id, activeCount - spawnLimit]);
      if (excessRows.length) {
        const ids = excessRows.map(row => Number(row.id));
        await pool.execute(`UPDATE monster_spawns SET current_hp=0,defeated_at=NOW() WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
        activeCount -= ids.length;
      }
    }
    for (let i = activeCount; i < spawnLimit; i++) {
      const template = pickWeighted(templates);
      let x = random(region.min_x, region.max_x); let y = random(region.min_y, region.max_y); let z = random(region.min_z, region.max_z);
      for (let attempt = 0; attempt < 32 && blocked.has(`${x},${y},${z}`); attempt++) { x = random(region.min_x, region.max_x); y = random(region.min_y, region.max_y); z = random(region.min_z, region.max_z); }
      if (blocked.has(`${x},${y},${z}`)) continue;
      const skillPool = stringList(template.skill_sequence); const skills = template.monster_class === 'boss' ? skillPool : randomItems(skillPool, random(0, Math.min(4, skillPool.length))); const traits = randomMonsterTraits(template);
      const level = randomMonsterLevel(template.monster_class, Number(template.level));
      const baseAttributes = randomMonsterBaseAttributes(template);
      const spawned = { ...template, ...baseAttributes, level, traits_json: traits };
      const stats = monsterCombatStats(spawned);
      await pool.execute('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [template.id, region.id, x, y, z, level, baseAttributes.constitution, baseAttributes.spirit, baseAttributes.strength, baseAttributes.intelligence, baseAttributes.agility, baseAttributes.perception, stats.hpMax, JSON.stringify(skills), JSON.stringify(traits)]);
    }
  }
};

export const inventory = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { name: string; quantity: number; weight: number; quick_slot: number | null; equipped_slot: string | null })[]>(`SELECT i.name, pi.quantity, i.weight, qi.quick_slot, pe.slot AS equipped_slot FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id LEFT JOIN player_quick_items qi ON qi.character_id=pi.character_id AND qi.item_id=pi.item_id LEFT JOIN player_equipment pe ON pe.character_id=pi.character_id AND pe.item_id=pi.item_id WHERE pi.character_id=? ORDER BY i.name`, [character.id]);
  const weight = rows.reduce((sum, item) => sum + Number(item.quantity) * Number(item.weight), 0);
  const rawSpeedPenalty = Math.floor(weight / 5) * 2;
  // 每 10 点最终体质抵消 1 点负重速度惩罚；敏捷仍决定基础探索速度。
  const constitutionOffset = Math.floor(finalAttribute(character, 'constitution') / 10);
  const speedPenalty = Math.max(0, rawSpeedPenalty - constitutionOffset);
  const speed = Math.max(1, Number(character.speed) - speedPenalty);
  return { items: rows, weight, capacity: 30, speed, movementSpeed: movementSpeedFrom(finalAttribute(character, 'agility'), Number(character.level), speedPenalty), speedPenalty, rawSpeedPenalty, constitutionOffset };
};

export const inventoryView = async (qqUserId: string, category?: '装备' | '道具' | '材料') => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  await pool.execute(`INSERT IGNORE INTO player_item_codex (character_id,item_id)
    SELECT ?,item_id FROM player_inventory WHERE character_id=? UNION SELECT ?,item_id FROM player_item_instances WHERE character_id=?`, [character.id, character.id, character.id, character.id]);
  const itemType = category === '装备' ? 'equipment' : category === '道具' ? 'consumable' : 'material';
  const [stacked] = await pool.execute<(RowDataPacket & { code: string; codex_id: string; name: string; item_category: string; quantity: number; description: string })[]>('SELECT i.code,i.codex_id,i.name,i.item_category,pi.quantity,i.description FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.item_type=? AND i.stackable=1 ORDER BY i.name', [character.id, itemType]);
  const [instances] = await pool.execute<(RowDataPacket & { id: number; definition_codex_id: string; name: string; item_category: string; quality: number; durability: number; durability_max: number; description: string })[]>('SELECT ii.id,i.codex_id AS definition_codex_id,i.name,i.item_category,ii.quality,ii.durability,ii.durability_max,i.description FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.character_id=? AND i.item_type=? ORDER BY ii.acquired_at DESC', [character.id, itemType]);
  const [recent] = await pool.execute<(RowDataPacket & { code: string; codex_id: string; item_type: string; item_category: string; name: string })[]>(`SELECT code,codex_id,item_type,item_category,name FROM (
      SELECT i.code,i.codex_id,i.item_type,i.item_category,i.name,ii.acquired_at FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.character_id=?
      UNION ALL SELECT i.code,i.codex_id,i.item_type,i.item_category,i.name,pi.acquired_at FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=?
    ) recent_items ORDER BY acquired_at DESC LIMIT 5`, [character.id, character.id]);
  return { stacked, instances, recent };
};

export const itemCodex = async (qqUserId: string, codexId: string) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & { codex_id: string; name: string; item_type: string; item_category: string; description: string; obtain_source: string; weight: number; effect_json: unknown })[]>(`SELECT DISTINCT i.codex_id,i.name,i.item_type,i.item_category,i.description,i.obtain_source,i.weight,i.effect_json FROM item_definitions i
    LEFT JOIN player_item_codex c ON c.item_id=i.id AND c.character_id=?
    LEFT JOIN guild_shop_items gs ON gs.item_id=i.id AND gs.is_active=1
    LEFT JOIN blacksmith_shop_items bs ON bs.item_id=i.id AND bs.is_active=1
    LEFT JOIN alchemist_shop_items als ON als.item_id=i.id AND als.is_active=1
    WHERE i.codex_id=? AND (c.item_id IS NOT NULL OR gs.item_id IS NOT NULL OR bs.item_id IS NOT NULL OR als.item_id IS NOT NULL)`, [character.id, codexId]);
  if (!rows[0]) throw new Error('尚未解锁该物品图鉴。');
  return rows[0];
};

export const equipmentDetail = async (qqUserId: string, instanceId: number) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & { name: string; item_category: string; required_level: number; quality: number; durability: number; durability_max: number; effect_json: unknown; description: string })[]>(`
    SELECT i.name,i.item_category,i.required_level,ii.quality,ii.durability,ii.durability_max,COALESCE(ii.effect_json,i.effect_json) AS effect_json,i.description
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
  weapon: ['武器'], offhand: ['副手', '武器'], shoulder: ['头肩', '头部'], upper: ['上装'], waist: ['腰部'],
  lower: ['下装'], feet: ['脚部'], necklace: ['项链'], bracelet: ['手镯'], ring: ['戒指']
};

const requireEquipmentSlot = (slot: string) => {
  if (!equipmentSlots.includes(slot as typeof equipmentSlots[number])) throw new Error('无效的装备部位。');
  return slot as typeof equipmentSlots[number];
};

export const equipmentCandidates = async (qqUserId: string, slot: string) => {
  const validSlot = requireEquipmentSlot(slot); const character = await characterFor(qqUserId); const categories = equipmentSlotCategories[validSlot];
  const placeholders = categories.map(() => '?').join(',');
  const [rows] = await (await getPool()).execute<(RowDataPacket & { id: number; name: string; required_level: number })[]>(`
    SELECT ii.id,i.name,i.required_level FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
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
  await recalculateCharacterStats(connection, Number(character.id));
  return rows[0];
});

export const equip = async (qqUserId: string, slot: string, instanceId: number) => withTransaction(async connection => {
  const validSlot = requireEquipmentSlot(slot); const character = await characterFor(qqUserId); const categories = equipmentSlotCategories[validSlot];
  const placeholders = categories.map(() => '?').join(',');
  const [items] = await connection.execute<(RowDataPacket & { id: number; item_id: number; name: string; rarity: string; required_level: number })[]>(`
    SELECT ii.id,ii.item_id,i.name,i.rarity,i.required_level FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    WHERE ii.id=? AND ii.character_id=? AND i.item_type='equipment' AND i.item_category IN (${placeholders}) FOR UPDATE
  `, [instanceId, character.id, ...categories]);
  const item = items[0];
  if (!item) throw new Error('背包中没有这件可装备的物品。');
  if (Number(character.level) < Number(item.required_level)) throw new Error(`等级不足：该装备需要 Lv.${item.required_level} 才能穿戴。`);
  if (item.rarity === '神器') {
    const [artifacts] = await connection.execute<(RowDataPacket & { instance_id: number })[]>(`SELECT pe.instance_id FROM player_equipment pe
      JOIN item_definitions i ON i.id=pe.item_id
      WHERE pe.character_id=? AND i.rarity='神器' AND pe.slot<>? FOR UPDATE`, [character.id, validSlot]);
    if (artifacts.some(artifact => Number(artifact.instance_id) !== Number(instanceId))) throw new Error('eternal_artifact_limit');
  }
  const [occupied] = await connection.execute<(RowDataPacket & { slot: string })[]>('SELECT slot FROM player_equipment WHERE character_id=? AND instance_id=? FOR UPDATE', [character.id, instanceId]);
  if (occupied[0] && occupied[0].slot !== validSlot) throw new Error('这件装备正在其他部位穿戴。');
  const [sameDefinitions] = await connection.execute<(RowDataPacket & { slot: string })[]>('SELECT slot FROM player_equipment WHERE character_id=? AND item_id=? AND slot<>? FOR UPDATE', [character.id, item.item_id, validSlot]);
  if (sameDefinitions[0]) throw new Error('同类装备已穿戴在其他部位。');
  await connection.execute('DELETE FROM player_equipment WHERE character_id=? AND slot=?', [character.id, validSlot]);
  await connection.execute('INSERT INTO player_equipment (character_id,slot,item_id,instance_id) VALUES (?,?,?,?)', [character.id, validSlot, item.item_id, item.id]);
  await recalculateCharacterStats(connection, Number(character.id));
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
  const [rows] = await pool.execute<(RowDataPacket & { id: number; code: string; name: string; category: string; damage_type: string; skill_kind: string; element: string; range_type: string; mana_cost: number; cooldown_turns: number; chant_turns: number; power: number; learn_cost: number; upgrade_cost: number; max_level: number; power_per_level: number; cooldown_reduction_per_level: number; level: number; learned: number; description: string })[]>(`SELECT s.*,COALESCE(ps.level,0) AS level,(ps.skill_id IS NOT NULL) AS learned
    FROM skill_definitions s LEFT JOIN player_skills ps ON ps.skill_id=s.id AND ps.character_id=? LEFT JOIN player_skill_discoveries d ON d.skill_id=s.id AND d.character_id=?
    WHERE s.id=? AND (ps.skill_id IS NOT NULL OR d.skill_id IS NOT NULL)`, [character.id, character.id, skillId]);
  if (!rows[0]) throw new Error('尚未领悟该技能。');
  const skill = rows[0]; const level = Math.max(1, Number(skill.level)); const learned = Boolean(skill.learned);
  const [effectRows] = await pool.execute<(RowDataPacket & { code: string; name: string; effect_type: string; value: number; duration: number; target_scope: 'enemy' | 'ally' | 'self'; trigger_timing: 'on_hit' | 'on_cast' })[]>(`SELECT e.code,e.name,e.effect_type,COALESCE(se.value_override,e.default_value) AS value,COALESCE(se.duration_override,e.default_duration) AS duration,se.target_scope,se.trigger_timing
    FROM skill_effects se JOIN effect_definitions e ON e.id=se.effect_id WHERE se.skill_id=? ORDER BY e.id`, [skillId]);
  const [specializationRows] = await pool.execute<(RowDataPacket & { specialization: 'overcharge' | 'instant' | 'efficient' | 'potent'; level: number })[]>('SELECT specialization,level FROM player_skill_specializations WHERE character_id=? AND skill_id=?', [character.id, skillId]);
  const specializations = Object.fromEntries(specializationRows.map(row => [row.specialization, Number(row.level)])) as Partial<Record<'overcharge' | 'instant' | 'efficient' | 'potent', number>>;
  let progressRows: (RowDataPacket & { range_level: number; information_level: number })[] = [];
  if (skill.code === 'appraisal' && learned) [progressRows] = await pool.execute<(RowDataPacket & { range_level: number; information_level: number })[]>('SELECT range_level,information_level FROM player_appraisal_progress WHERE character_id=?', [character.id]);
  const progress = progressRows[0] ? { rangeLevel: Number(progressRows[0].range_level), informationLevel: Number(progressRows[0].information_level) } : undefined;
  const overcharge = Number(specializations.overcharge ?? 1) - 1; const instant = Number(specializations.instant ?? 1) - 1; const efficient = Number(specializations.efficient ?? 1) - 1;
  // 主动技能的综合等级由四项专精共同累积，仅用于等级与升级消耗。
  // 实际数值只应由所选专精改变，否则升级“瞬息”也会被通用等级威力成长反向抬高。
  const actualPower = Math.floor(Number(skill.power) * Math.pow(1.08, overcharge) * Math.pow(.96, instant));
  const actualManaCost = Math.max(0, Math.ceil(Number(skill.mana_cost) * Math.pow(1.16, overcharge) * Math.pow(.92, efficient)));
  const baseCooldown = Math.max(0, Number(skill.cooldown_turns));
  const actualCooldown = Math.max(0, roundTowardInitialTiming(Number(skill.cooldown_turns), Math.max(1, baseCooldown) * Math.pow(1.08, overcharge) * Math.pow(.92, instant)));
  const baseChant = Number(skill.chant_turns);
  const actualChant = Math.max(0, roundTowardInitialTiming(baseChant, Math.max(1, baseChant) * Math.pow(1.08, overcharge) * Math.pow(.92, instant)));
  const weaponMastery = weaponMasteryCodes.has(skill.code);
  return { ...skill, level, learned, characterLevel: Number(character.level), skillPoints: Number(character.skill_points), appraisal: progress, specializations, effectDetails: effectRows, weaponMastery, actualPower, actualManaCost, actualCooldown, actualChant, masteryProficiencyCost: weaponMastery && Number(specializations.overcharge ?? 1) < 5 ? masteryUpgradeCost(Number(specializations.overcharge ?? 1)) : null, masteryFocusCost: weaponMastery && Number(specializations.instant ?? 1) < 6 ? masteryUpgradeCost(Number(specializations.instant ?? 1)) : null, specializationUpgradeCost: !learned || skill.category === 'passive' || level >= Number(skill.max_level) ? null : activeSkillUpgradeCost(level), nextUpgradeCost: skill.code === 'appraisal' ? null : !learned || level >= Number(skill.max_level) ? null : activeSkillUpgradeCost(level) };
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
  const cost = activeSkillUpgradeCost(Number(skill.level)); if (Number(character.skill_points) < cost) throw new Error(`技能点不足，升级需要 ${cost} 点。`);
  await connection.execute('UPDATE characters SET skill_points=skill_points-? WHERE id=?', [cost, character.id]); await connection.execute('UPDATE player_skills SET level=level+1 WHERE character_id=? AND skill_id=?', [character.id, skillId]);
  return { name: skill.name, level: Number(skill.level) + 1, cost };
});

export const upgradeSkillSpecialization = async (qqUserId: string, skillId: number, specialization: 'overcharge' | 'instant' | 'efficient' | 'potent') => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [skills] = await connection.execute<(RowDataPacket & { code: string; name: string; category: string; level: number; max_level: number })[]>('SELECT s.code,s.name,s.category,ps.level,s.max_level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=? FOR UPDATE', [character.id, skillId]);
  const skill = skills[0]; const weaponMastery = Boolean(skill && weaponMasteryCodes.has(skill.code)); if (!skill || (skill.category === 'passive' && !weaponMastery)) throw new Error('只能升级已学习的主动技能或装备专精。');
  if (!weaponMastery && Number(skill.level) >= Number(skill.max_level)) throw new Error('该技能已达到最高等级。');
  await connection.execute('INSERT IGNORE INTO player_skill_specializations (character_id,skill_id,specialization) VALUES (?,?,?)', [character.id, skillId, specialization]);
  const [rows] = await connection.execute<(RowDataPacket & { level: number })[]>('SELECT level FROM player_skill_specializations WHERE character_id=? AND skill_id=? AND specialization=? FOR UPDATE', [character.id, skillId, specialization]);
  const level = Number(rows[0].level); const maximum = weaponMastery ? specialization === 'overcharge' ? 5 : 6 : 100; if (level >= maximum) throw new Error('该专精已达到最高等级。');
  const cost = weaponMastery ? masteryUpgradeCost(level) : activeSkillUpgradeCost(Number(skill.level)); if (Number(character.skill_points) < cost) throw new Error(`技能点不足，升级需要 ${cost} 点。`);
  await connection.execute('UPDATE characters SET skill_points=skill_points-? WHERE id=?', [cost, character.id]);
  await connection.execute('UPDATE player_skill_specializations SET level=level+1 WHERE character_id=? AND skill_id=? AND specialization=?', [character.id, skillId, specialization]);
  await connection.execute('UPDATE player_skills SET level=level+1 WHERE character_id=? AND skill_id=?', [character.id, skillId]);
  return { name: skill.name, skillLevel: Number(skill.level) + 1, specialization, level: level + 1, cost };
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
  const pool = await getPool(); const [rows] = await pool.execute<(RowDataPacket & { id: string; name: string; leader_character_id: number })[]>('SELECT p.id,p.name,p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=? LIMIT 1', [character.id]);
  if (!rows[0]) return null; const party = rows[0];
  const [members] = await pool.execute<(RowDataPacket & { id: number; game_id: number; name: string })[]>('SELECT c.id,c.game_id,c.name FROM party_members pm JOIN characters c ON c.id=pm.character_id WHERE pm.party_id=? ORDER BY pm.joined_at,c.id', [party.id]);
  const leader = members.find(member => Number(member.id) === Number(party.leader_character_id));
  return { id: party.id, name: party.name, leaderId: Number(party.leader_character_id), ownId: Number(character.id), leader: leader ? { id: Number(leader.id), gameId: Number(leader.game_id), name: leader.name } : undefined, members: members.filter(member => Number(member.id) !== Number(party.leader_character_id)).map(member => ({ id: Number(member.id), gameId: Number(member.game_id), name: member.name })) };
};

export const explore = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  await ensureForestGuideFreeAction(pool, Number(character.id));
  const [spawnRows] = await pool.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  const canViewMonsterInfo = await hasPassiveSkill(pool, character.id, 'appraisal');
  const spawns = materializeMonsters(spawnRows, false);
  if (!spawns.length) return { character, spawns, text: '四周只有风吹树叶的声音。这里暂时没有敌对生物。' };
  const perception = finalAttribute(character, 'perception');
  const negotiation = Math.floor(finalAttribute(character, 'spirit') + finalAttribute(character, 'intelligence') + perception / 2);
  const text = canViewMonsterInfo ? `你发现 ${spawns.map(s => `#${s.id} ${s.name} Lv.${s.level}`).join('、')}。\n\n感知 ${perception.toFixed(1)}｜负重后速度 ${character.speed}｜交涉值 ${negotiation}\n感知与速度高于敌人时可偷袭；感知较高可尝试躲避；交涉成功率按双方交涉值对抗结算。` : '你察觉到附近有未知的敌对存在，却无法辨明它们的任何信息。';
  return { character, spawns, text, canViewMonsterInfo };
};

export type NearbyPoint = { type: '怪物' | 'NPC' | '地标' | '悬赏'; name: string; x: number; y: number; distance: number; code?: string };
export type MapLandmark = { name: string; x: number; y: number };

const perceptionRange = (perception: number, level: number) => explorationScale(perception, level);
const mapCodeByRegion: Record<string, string | undefined> = {
  '百纳镇': 'map_baina_town',
  '幽暗密林': 'map_dark_forest'
};
const hasRegionMap = async (connection: Pool | PoolConnection, characterId: number, regionName: string) => {
  const mapCode = mapCodeByRegion[regionName];
  if (!mapCode) return false;
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_inventory pi
    JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.quantity>0 AND i.code=? LIMIT 1`, [characterId, mapCode]);
  return Boolean(rows[0]);
};

const grantTownMap = async (connection: PoolConnection, characterId: number) => {
  await connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity)
    SELECT ?,id,1 FROM item_definitions WHERE code='map_baina_town'
    ON DUPLICATE KEY UPDATE quantity=GREATEST(quantity,1),acquired_at=NOW()`, [characterId]);
  await connection.execute(`INSERT IGNORE INTO player_item_codex (character_id,item_id)
    SELECT ?,id FROM item_definitions WHERE code='map_baina_town'`, [characterId]);
};

export const nearbyPoints = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const range = perceptionRange(finalAttribute(character, 'perception'), Number(character.level));
  const pool = await getPool();
  await refreshBounties(pool);
  const bounds = [character.current_region_id, Number(character.pos_x) - range, Number(character.pos_x) + range, Number(character.pos_y) - range, Number(character.pos_y) + range, character.pos_z];
  const [monsters] = await pool.execute<(RowDataPacket & { name: string; x: number; y: number })[]>(`SELECT t.name,s.pos_x AS x,s.pos_y AS y FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x BETWEEN ? AND ? AND s.pos_y BETWEEN ? AND ? AND s.pos_z=? AND s.defeated_at IS NULL`, bounds);
  const [npcs] = await pool.execute<(RowDataPacket & { code: string; name: string; x: number; y: number })[]>(`SELECT code,name,pos_x AS x,pos_y AS y FROM map_npcs WHERE region_id=? AND pos_x BETWEEN ? AND ? AND pos_y BETWEEN ? AND ? AND pos_z=?`, bounds);
  const [objects] = await pool.execute<(RowDataPacket & { name: string; x: number; y: number })[]>(`SELECT name,pos_x AS x,pos_y AS y FROM map_special_objects WHERE region_id=? AND pos_x BETWEEN ? AND ? AND pos_y BETWEEN ? AND ? AND pos_z=?`, bounds);
  const [descriptions] = await pool.execute<(RowDataPacket & { description: string })[]>('SELECT description FROM map_move_texts WHERE region_id=? ORDER BY RAND() LIMIT 1', [character.current_region_id]);
  const point = (type: NearbyPoint['type'], item: { name: string; x: number; y: number; code?: string }): NearbyPoint => ({ type, name: item.name, x: Number(item.x), y: Number(item.y), distance: Math.abs(Number(item.x) - Number(character.pos_x)) + Math.abs(Number(item.y) - Number(character.pos_y)), code: item.code });
  const points = [...monsters.map(item => point('怪物', item)), ...npcs.map(item => point('NPC', item)), ...objects.map(item => point('地标', item))]
    .filter(item => item.distance <= range)
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name, 'zh-CN'));
  const mapUnlocked = await hasRegionMap(pool, Number(character.id), character.region_name);
  const [landmarks] = mapUnlocked && character.region_name === '百纳镇' ? await pool.execute<(RowDataPacket & MapLandmark)[]>('SELECT name,pos_x AS x,pos_y AS y FROM map_npcs WHERE region_id=? ORDER BY name', [character.current_region_id]) : [[] as any];
  const [bountyTargets] = mapUnlocked ? await pool.execute<(RowDataPacket & { name: string; x: number; y: number })[]>(`SELECT t.name,s.pos_x AS x,s.pos_y AS y FROM bounty_notices b JOIN monster_spawns s ON s.id=b.source_spawn_id JOIN monster_templates t ON t.id=s.template_id
    WHERE b.is_active=1 AND b.expires_at>NOW() AND s.region_id=? AND s.defeated_at IS NULL ORDER BY b.id`, [character.current_region_id]) : [[] as any];
  const mapMarkers = [...landmarks.map(item => ({ name: item.name, x: Number(item.x), y: Number(item.y) })), ...bountyTargets.map(item => ({ name: `悬赏目标·【暴动】${item.name}`, x: Number(item.x), y: Number(item.y) }))];
  const appraisal = await appraisalProfileFor(pool, [Number(character.id)]);
  return { character, range, points, landmarks: mapMarkers, mapUnlocked, npcDetailsUnlocked: appraisal.learned && appraisal.informationLevel >= 3, description: descriptions[0]?.description ?? '四周一片寂静，暂时没有发现异常。' };
};

export const requireNpcAtCurrentPosition = async (qqUserId: string, code: string) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { name: string; description: string; interaction_kind: 'npc' | 'building' })[]>(`SELECT name,description,interaction_kind FROM map_npcs
    WHERE code=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1`, [code, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (!rows[0]) throw new Error('你已经离开该目标坐标，无法继续互动。');
  return rows[0];
};

export type NpcAffinityInteraction = 'chat' | 'buy' | 'sell' | 'craft';
const npcAffinityReward: Record<NpcAffinityInteraction, { column: string; amount: number }> = {
  chat: { column: 'daily_chat_count', amount: 5 },
  buy: { column: 'daily_buy_count', amount: 5 },
  sell: { column: 'daily_sell_count', amount: 5 },
  craft: { column: 'daily_craft_count', amount: 10 }
};
export const npcAffinityRank = (affinity: number) => {
  if (affinity >= 10000) return { level: 6, title: '生死相托' };
  if (affinity >= 5000) return { level: 5, title: '金兰之契' };
  if (affinity >= 2000) return { level: 4, title: '肝胆相照' };
  if (affinity >= 500) return { level: 3, title: '莫逆之交' };
  if (affinity >= 200) return { level: 2, title: '意气相投' };
  if (affinity >= 50) return { level: 1, title: '泛泛之交' };
  return { level: 0, title: '素昧平生' };
};
/** 每种互动每天最多计 3 次：闲聊/买入/卖出各 +5，好感技艺操作 +10。 */
export const addNpcAffinity = async (qqUserId: string, code: string, interaction: NpcAffinityInteraction = 'chat') => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [npcs] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM map_npcs WHERE code=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1', [code, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (!npcs[0]) throw new Error('你已经离开该目标坐标，无法继续互动。');
  const reward = npcAffinityReward[interaction];
  await connection.execute(`INSERT INTO player_npc_affinity (character_id,npc_code,affinity,daily_date,daily_interactions,${reward.column})
    VALUES (?,?,?,CURDATE(),0,1)
    ON DUPLICATE KEY UPDATE
      daily_chat_count=IF(daily_date=CURDATE(),daily_chat_count,0),
      daily_buy_count=IF(daily_date=CURDATE(),daily_buy_count,0),
      daily_sell_count=IF(daily_date=CURDATE(),daily_sell_count,0),
      daily_craft_count=IF(daily_date=CURDATE(),daily_craft_count,0),
      affinity=affinity+IF(daily_date=CURDATE(),IF(${reward.column}<3,?,0),?),
      ${reward.column}=IF(daily_date=CURDATE(),LEAST(3,${reward.column}+1),1),
      daily_date=CURDATE()`, [character.id, code, reward.amount, reward.amount, reward.amount]);
  const [rows] = await connection.execute<(RowDataPacket & { affinity: number; daily_count: number })[]>(`SELECT affinity,${reward.column} AS daily_count FROM player_npc_affinity WHERE character_id=? AND npc_code=?`, [character.id, code]);
  const affinity = Number(rows[0]?.affinity ?? 0);
  return { affinity, dailyInteractions: Number(rows[0]?.daily_count ?? 0), rank: npcAffinityRank(affinity) };
});

/** 副职业转职等一次性剧情奖励不占用每日互动次数，也不要求仍站在 NPC 面前。 */
export const grantNpcAffinity = async (qqUserId: string, code: string, amount: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const bonus = Math.max(0, Math.floor(Number(amount)));
  if (!bonus) throw new Error('好感度奖励必须大于 0。');
  await connection.execute(`INSERT INTO player_npc_affinity (character_id,npc_code,affinity,daily_date,daily_interactions)
    VALUES (?,?,?,CURDATE(),0)
    ON DUPLICATE KEY UPDATE affinity=affinity+VALUES(affinity)`, [character.id, code, bonus]);
  const [rows] = await connection.execute<(RowDataPacket & { affinity: number })[]>('SELECT affinity FROM player_npc_affinity WHERE character_id=? AND npc_code=?', [character.id, code]);
  const affinity = Number(rows[0]?.affinity ?? 0);
  return { affinity, rank: npcAffinityRank(affinity) };
});

export const npcDetail = async (qqUserId: string, code: string) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  const appraisal = await appraisalProfileFor(pool, [Number(character.id)]);
  if (!appraisal.learned || appraisal.informationLevel < 3) throw new Error('鉴识达到识珠 Lv.3 后，才能查看 NPC 资料。');
  const [rows] = await pool.execute<(RowDataPacket & { name: string; description: string; x: number; y: number; affinity: number; chat_count: number; buy_count: number; sell_count: number; craft_count: number })[]>(`SELECT n.name,n.description,n.pos_x AS x,n.pos_y AS y,COALESCE(a.affinity,0) AS affinity,
    CASE WHEN a.daily_date=CURDATE() THEN COALESCE(a.daily_chat_count,0) ELSE 0 END AS chat_count,
    CASE WHEN a.daily_date=CURDATE() THEN COALESCE(a.daily_buy_count,0) ELSE 0 END AS buy_count,
    CASE WHEN a.daily_date=CURDATE() THEN COALESCE(a.daily_sell_count,0) ELSE 0 END AS sell_count,
    CASE WHEN a.daily_date=CURDATE() THEN COALESCE(a.daily_craft_count,0) ELSE 0 END AS craft_count
    FROM map_npcs n LEFT JOIN player_npc_affinity a ON a.character_id=? AND a.npc_code=n.code
    WHERE n.code=? AND n.region_id=? LIMIT 1`, [character.id, code, character.current_region_id]);
  const npc = rows[0];
  if (!npc) throw new Error('附近没有可查看的 NPC。');
  const distance = Math.abs(Number(npc.x) - Number(character.pos_x)) + Math.abs(Number(npc.y) - Number(character.pos_y));
  if (distance > perceptionRange(finalAttribute(character, 'perception'), Number(character.level))) throw new Error('该 NPC 已离开你的感知范围。');
  const affinity = Number(npc.affinity ?? 0);
  const personas: Record<string, { name: string; description: string }> = {
    guild_counter: { name: '莫妮卡', description: '百纳镇冒险者公会的前台接待员。她留着利落的黑色短发，待人阳光而专业，总能耐心为冒险者解答疑问。' },
    blacksmith: { name: '漠北', description: '镇民多叫他小北。这个九尾狐族与矮人的混血少年经营着铁匠铺，炉火与铁锤是他最熟悉的伙伴。' },
    alchemy_sweetshop: { name: '晴儿', description: '晴空糖水屋的炼金师。她擅长草药提纯与药剂调配，言谈温和，对生命与能量的变化格外敏锐。' }
  };
  const persona = personas[code];
  return { name: persona?.name ?? npc.name, description: persona?.description ?? npc.description, x: Number(npc.x), y: Number(npc.y), affinity, rank: npcAffinityRank(affinity), daily: { chat: Number(npc.chat_count), buy: Number(npc.buy_count), sell: Number(npc.sell_count), craft: Number(npc.craft_count) } };
};

export const npcAffinity = async (qqUserId: string, code: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { affinity: number })[]>('SELECT affinity FROM player_npc_affinity WHERE character_id=? AND npc_code=?', [character.id, code]);
  return Number(rows[0]?.affinity ?? 0);
};

const moveToPosition = async (connection: PoolConnection, qqUserId: string, x: number, y: number, restrictToPerception: boolean, speedLimit?: number) => {
  const character = await characterFor(qqUserId);
  await ensureForestGuideFreeAction(connection, Number(character.id));
  const [travels] = await connection.execute<(RowDataPacket & { activity_type: 'move' | 'hunt' })[]>('SELECT activity_type FROM player_travels WHERE character_id=? FOR UPDATE', [character.id]);
  if (travels[0]) throw new Error(travels[0].activity_type === 'hunt' ? '你正在寻怪，请等待完成或取消寻怪。' : '你正在前往目标地点，请等待抵达或取消移动。');
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
  if (restrictToPerception && distance > perceptionRange(finalAttribute(character, 'perception'), Number(character.level))) throw new Error('该位置超出你的感知范围。');
  if (speedLimit !== undefined && distance > speedLimit) throw new Error(`当前移动速度为 ${speedLimit}，一次移动距离不能超过移动速度。`);
  const [regions] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string })[]>('SELECT id,code,name FROM map_regions WHERE ? BETWEEN min_x AND max_x AND ? BETWEEN min_y AND max_y AND ? BETWEEN min_z AND max_z ORDER BY danger_level DESC LIMIT 1', [x, y, character.pos_z]);
  const region = regions[0]; if (!region) throw new Error('\n\n前面的区域，以后再来探索吧！');
  if (region.code === 'baina_town') {
    const [unlocked] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_story_progress WHERE character_id=? AND story_code=\'forest_guide\' AND status=\'completed\' LIMIT 1', [character.id]);
    if (!unlocked[0]) throw new Error('前方的百纳镇尚未找到入口，先在密林中继续前进吧。');
  }
  if (partyRows[0]) await connection.execute('UPDATE characters c JOIN party_members pm ON pm.character_id=c.id SET c.current_region_id=?,c.pos_x=?,c.pos_y=? WHERE pm.party_id=(SELECT party_id FROM party_members WHERE character_id=? LIMIT 1)', [region.id, x, y, character.id]);
  else await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=? WHERE id=?', [region.id, x, y, character.id]);
  const [spawnRows] = await connection.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL FOR UPDATE`, [region.id, x, y, character.pos_z]);
  const appraisal = await appraisalProfileFor(connection, [character.id]);
  const spawns = materializeMonsters(spawnRows, appraisal.informationLevel >= 2);
  const moved = { ...character, current_region_id: region.id, region_name: region.name, pos_x: x, pos_y: y };
  if (spawns.length) {
    const members = await partyCombatants(connection, character);
    const fastestMonster = Math.max(...spawns.map(spawn => monsterCombatStats(spawn).speed));
    const [texts] = await connection.execute<(RowDataPacket & { description: string })[]>('SELECT description FROM monster_encounter_texts WHERE monster_template_id=? ORDER BY RAND() LIMIT 1', [spawns[0].template_id]);
    const [occupied] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=? AND cs.state='active' LIMIT 1`, [spawns[0].id]);
    return { character: moved, kind: 'encounter' as const, spawns, occupied: Boolean(occupied[0]), canAmbush: members.every(member => Number(member.speed) > fastestMonster), text: texts[0]?.description ?? `${spawns[0].name} 拦住了你的去路。` };
  }
  const [npcs] = await connection.execute<(RowDataPacket & { code: string; name: string; description: string; interaction_kind: 'npc' | 'building' })[]>('SELECT code,name,description,interaction_kind FROM map_npcs WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1', [region.id, x, y, character.pos_z]);
  if (npcs[0]) return { character: moved, kind: 'npc' as const, npc: npcs[0], text: npcs[0].description };
  const [objects] = await connection.execute<(RowDataPacket & { description: string })[]>('SELECT description FROM map_special_objects WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1', [region.id, x, y, character.pos_z]);
  if (objects[0]) return { character: moved, kind: 'event' as const, text: objects[0].description };
  if (region.code === 'dark_forest' && Number(character.level) >= 5) {
    const [story] = await connection.execute<(RowDataPacket & { status: string })[]>('SELECT status FROM player_story_progress WHERE character_id=? AND story_code=\'forest_guide\' FOR UPDATE', [character.id]);
    if (!story[0]) {
      await connection.execute('INSERT INTO player_story_progress (character_id,story_code,status) VALUES (?,\'forest_guide\',\'met\')', [character.id]);
      return { character: moved, kind: 'story' as const, text: '穿过一片被雨水洗亮的空地时，你遇见了三名结伴的冒险者。' };
    }
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
  return withTransaction(async connection => {
    const character = await characterFor(qqUserId); await ensureForestGuideFreeAction(connection, Number(character.id)); const distance = Math.abs(x - Number(character.pos_x)) + Math.abs(y - Number(character.pos_y));
    const [regions] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM map_regions WHERE ? BETWEEN min_x AND max_x AND ? BETWEEN min_y AND max_y AND ? BETWEEN min_z AND max_z ORDER BY danger_level DESC LIMIT 1', [x, y, character.pos_z]); const region = regions[0];
    if (!region) throw new Error('前面的区域，以后再来探索吧！');
    const sameRegion = Number(region.id) === Number(character.current_region_id);
    const currentMapUnlocked = await hasRegionMap(connection, Number(character.id), character.region_name);
    const targetMapUnlocked = await hasRegionMap(connection, Number(character.id), region.name);
    if (!sameRegion && !targetMapUnlocked) throw new Error('尚未解锁目标区域地图，无法前往。');
    if (sameRegion && (!currentMapUnlocked || distance <= carry.movementSpeed)) return moveToPosition(connection, qqUserId, x, y, true, carry.movementSpeed);
    ensureActionAvailable(character);
    const [combat] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state=\'active\' LIMIT 1 FOR UPDATE', [character.id]);
    if (combat[0]) throw new Error('战斗尚未结束，无法移动。');
    const [encounters] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM monster_spawns WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL LIMIT 1 FOR UPDATE', [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
    if (encounters[0]) throw new Error('当前格子存在敌对生物，请先选择战斗、交涉或躲避。');
    const [existing] = await connection.execute<(RowDataPacket & { activity_type: 'move' | 'hunt' })[]>('SELECT activity_type FROM player_travels WHERE character_id=? FOR UPDATE', [character.id]); if (existing[0]) throw new Error(existing[0].activity_type === 'hunt' ? '你正在寻怪，请等待完成或取消寻怪。' : '你正在前往目标地点，请等待抵达或取消移动。');
    const seconds = Math.max(1, Math.ceil(distance / carry.movementSpeed));
    await connection.execute("INSERT INTO player_travels (character_id,region_id,target_x,target_y,target_z,activity_type,arrival_at) VALUES (?,?,?,?,?,'move',DATE_ADD(NOW(),INTERVAL ? SECOND))", [character.id, region.id, x, y, character.pos_z, seconds]);
    return { kind: 'travel' as const, regionName: region.name, x, y, seconds, remaining: seconds };
  });
};
export const moveToMap = async (qqUserId: string, mapCode: string) => {
  const pool = await getPool();
  const character = await characterFor(qqUserId);
  const [rows] = await pool.execute<(RowDataPacket & { code: string; name: string; min_x: number | null; max_x: number | null; min_y: number | null; max_y: number | null })[]>(`SELECT i.code,r.name,r.min_x,r.max_x,r.min_y,r.max_y
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    LEFT JOIN map_regions r ON r.code=JSON_UNQUOTE(JSON_EXTRACT(i.effect_json, '$.map'))
    WHERE pi.character_id=? AND pi.quantity>0 AND i.item_category='地图' AND i.code=? LIMIT 1`, [character.id, mapCode]);
  const map = rows[0];
  if (!map) throw new Error('尚未拥有该地图。');
  if (map.min_x === null || map.max_x === null || map.min_y === null || map.max_y === null) throw new Error('该地图区域暂未开放。');
  if (map.name === character.region_name) throw new Error(`你已经位于${map.name}。`);
  const x = Math.min(Number(map.max_x), Math.max(Number(map.min_x), Number(character.pos_x)));
  const y = Math.min(Number(map.max_y), Math.max(Number(map.min_y), Number(character.pos_y)));
  return moveTo(qqUserId, x, y);
};
export const huntMonster = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); await ensureForestGuideFreeAction(connection, Number(character.id)); ensureActionAvailable(character);
  const [travels] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_travels WHERE character_id=? FOR UPDATE', [character.id]);
  if (travels[0]) throw new Error('你正在进行移动或寻怪，请等待完成或取消当前行动。');
  const [combat] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state=\'active\' LIMIT 1 FOR UPDATE', [character.id]);
  if (combat[0]) throw new Error('战斗尚未结束，无法寻怪。');
  const [encounter] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM monster_spawns WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL LIMIT 1 FOR UPDATE', [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (encounter[0]) throw new Error('当前格子存在敌对生物，请先选择战斗、交涉或躲避。');
  const [partyRows] = await connection.execute<(RowDataPacket & { leader_character_id: number })[]>('SELECT p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=?', [character.id]);
  if (partyRows[0] && Number(partyRows[0].leader_character_id) !== Number(character.id)) throw new Error('组队状态下仅队长可以寻怪。');
  const [targets] = await connection.execute<(RowDataPacket & { pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pos_x,pos_y,pos_z FROM monster_spawns
    WHERE region_id=? AND pos_z=? AND defeated_at IS NULL
    ORDER BY ABS(pos_x-?)+ABS(pos_y-?),id LIMIT 1 FOR UPDATE`, [character.current_region_id, character.pos_z, character.pos_x, character.pos_y]);
  const target = targets[0]; if (!target) throw new Error('当前地图没有可寻找的怪物。');
  const x = Number(target.pos_x); const y = Number(target.pos_y); const z = Number(target.pos_z);
  const seconds = Math.max(1, Math.abs(x - Number(character.pos_x)) + Math.abs(y - Number(character.pos_y)));
  await connection.execute("INSERT INTO player_travels (character_id,region_id,target_x,target_y,target_z,activity_type,arrival_at) VALUES (?,?,?,?,?,'hunt',DATE_ADD(NOW(),INTERVAL ? SECOND))", [character.id, character.current_region_id, x, y, z, seconds]);
  return { kind: 'hunt' as const, regionName: character.region_name, x, y, seconds, remaining: seconds };
});
const elementValue = (value: unknown, element: string) => Number(jsonObject(value)[element] ?? 0);
const elementalMultiplier = (attackerMastery: unknown, defenderResistance: unknown, element: string) => {
  if (!['水', '火', '土', '木', '风', '冰', '雷', '光', '暗'].includes(element)) return 1;
  const difference = elementValue(attackerMastery, element) - elementValue(defenderResistance, element);
  const magnitude = Math.abs(difference);
  if (!magnitude) return 1;
  const positiveAnchors: Array<[number, number]> = [[0, 0], [10, 10], [22, 20], [38, 30], [60, 40], [250, 100]];
  let percentage: number;
  if (difference > 0) {
    const index = positiveAnchors.findIndex(([value]) => magnitude <= value);
    if (index <= 0) percentage = positiveAnchors[positiveAnchors.length - 1][1];
    else {
      const [leftValue, leftBonus] = positiveAnchors[index - 1]; const [rightValue, rightBonus] = positiveAnchors[index];
      percentage = leftBonus + (rightBonus - leftBonus) * (magnitude - leftValue) / (rightValue - leftValue);
    }
  } else percentage = Math.min(50, 10 * Math.sqrt(magnitude / 10));
  return 1 + (difference > 0 ? percentage : -percentage) / 100;
};

export const travelStatus = async (qqUserId: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool(); const [rows] = await pool.execute<(RowDataPacket & { target_x: number; target_y: number; target_z: number; activity_type: 'move' | 'hunt'; started_at: Date; arrival_at: Date; region_name: string })[]>(`SELECT t.target_x,t.target_y,t.target_z,t.activity_type,t.started_at,t.arrival_at,r.name AS region_name FROM player_travels t JOIN map_regions r ON r.id=t.region_id WHERE t.character_id=?`, [character.id]); const travel = rows[0];
  if (!travel) return null; const remaining = Math.max(0, Math.ceil((new Date(travel.arrival_at).getTime() - Date.now()) / 1000));
  const seconds = Math.max(1, Math.ceil((new Date(travel.arrival_at).getTime() - new Date(travel.started_at).getTime()) / 1000));
  return { x: Number(travel.target_x), y: Number(travel.target_y), z: Number(travel.target_z), activityType: travel.activity_type, regionName: travel.region_name, seconds, remaining };
};

export const completeTravel = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); const [rows] = await connection.execute<(RowDataPacket & { target_x: number; target_y: number; target_z: number; arrival_at: Date })[]>('SELECT target_x,target_y,target_z,arrival_at FROM player_travels WHERE character_id=? FOR UPDATE', [character.id]); const travel = rows[0]; if (!travel || new Date(travel.arrival_at).getTime() > Date.now()) return null;
  await connection.execute('DELETE FROM player_travels WHERE character_id=?', [character.id]);
  return moveToPosition(connection, qqUserId, Number(travel.target_x), Number(travel.target_y), false);
});

export const cancelTravel = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); const [rows] = await connection.execute<(RowDataPacket & { activity_type: 'move' | 'hunt' })[]>('SELECT activity_type FROM player_travels WHERE character_id=? FOR UPDATE', [character.id]); if (!rows[0]) throw new Error('当前没有进行中的移动或寻怪。'); await connection.execute('DELETE FROM player_travels WHERE character_id=?', [character.id]); return { character, activityType: rows[0].activity_type };
});

export const forestGuideAdvance = async (qqUserId: string, action: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [rows] = await connection.execute<(RowDataPacket & { status: string; stage: number })[]>('SELECT status,stage FROM player_story_progress WHERE character_id=? AND story_code=\'forest_guide\' FOR UPDATE', [character.id]);
  const story = rows[0]; if (!story || story.status !== 'met') throw new Error('这段故事已经结束了。');
  const stage = Number(story.stage);
  const pages: Record<number, { action: string; text?: string }> = {
    1: { action: '循声而去' },
    2: { action: '上前打招呼', text: '你拨开最后一丛沾着露水的灌木，望见有三人正擦拭着武器。\n为首的青年手持剑盾，红发少女指尖还缠着未散的火星，白袍少女则正替受伤的同伴施展治愈术。\n\n他们循着动静也发现了你。' },
    3: { action: '我也不清楚，睁开眼时就在这儿了', text: '战士把盾牌背回身后，笑着做了自我介绍。\n他叫莱昂，是一名战士；那位红发少女伊芙是法师；白袍的希娅则是牧师。\n\n他们说自己接下了讨伐森林史莱姆的悬赏，正循着痕迹搜寻。\n莱昂打量着我身上未干的露水，略显困惑：\n\n“你为什么会一个人在这种地方？”\n\n我沉默片刻，不好坦白自己转生到这里的事实。' },
    4: { action: '', text: '“我也不清楚，”\n我如此回答，\n“我今早一睁开眼，就已经在这片森林里了。”\n\n他们三人交换了一个复杂的眼神,没有继续追问\n希娅轻声说，百纳镇就在密林南方————那是一座接纳各族居民的包容小镇，半兽人、矮人、精灵与人类都能在那里找到落脚处。\n\n莱昂朝森林深处扬了扬下巴：“我们先解决那只史莱姆。你要不要和我们一起？结束后，我们带你去百纳镇。”' }
  };
  const page = pages[stage]; if (!page) throw new Error('故事进度异常。');
  if (page.action && action !== page.action) throw new Error('现在还不能做出这个选择。');
  if (stage < 4) {
    const nextPage = pages[stage + 1]; if (!nextPage?.text) throw new Error('下一段剧情缺失。');
    await connection.execute('UPDATE player_story_progress SET stage=stage+1 WHERE character_id=? AND story_code=\'forest_guide\'', [character.id]);
    return { stage: stage + 1, text: nextPage.text, battleChoice: undefined as 'join' | 'depart' | undefined };
  }
  if (action !== '加入' && action !== '婉拒并询问城镇位置') throw new Error('请选择加入队伍，或婉拒并询问城镇位置。');
  await connection.execute('UPDATE player_story_progress SET stage=5 WHERE character_id=? AND story_code=\'forest_guide\'', [character.id]);
  return { stage: 5, text: action === '加入' ? '我点头答应。\n莱昂立刻展开地图，伊芙用火星标出黏液痕迹的去向，希娅则为我们补上祝福。\n我们并肩踏入更深的丛林中。' : '我婉拒了邀请，并向他们确认百纳镇的方向。\n莱昂刚抬手指向南方，脚下的水洼便骤然鼓起。\n一团庞大的翠绿胶质撞开落叶，堵住了去路。', battleChoice: action === '加入' ? 'join' as const : 'depart' as const };
});

export const forestGuideProgress = async (qqUserId: string) => {
  const pool = await getPool();
  const character = await characterFor(qqUserId);
  const [rows] = await pool.execute<(RowDataPacket & { status: string; stage: number })[]>(
    'SELECT status,stage FROM player_story_progress WHERE character_id=? AND story_code=\'forest_guide\' LIMIT 1',
    [character.id]
  );
  return rows[0] ? { status: rows[0].status, stage: Number(rows[0].stage) } : null;
};

export const forestGuideChoice = async (qqUserId: string, choice: 'join' | 'depart') => withTransaction(async connection => {
  const character = await characterFor(qqUserId); ensureActionAvailable(character);
  const [progressRows] = await connection.execute<(RowDataPacket & { status: string; stage: number })[]>('SELECT status,stage FROM player_story_progress WHERE character_id=? AND story_code=\'forest_guide\' FOR UPDATE', [character.id]);
  if (progressRows[0]?.status !== 'met' || Number(progressRows[0]?.stage) !== 5) throw new Error('这段林间相遇尚未推进到最终抉择。');
  const [existingParty] = await connection.execute<RowDataPacket[]>('SELECT party_id FROM party_members WHERE character_id=? FOR UPDATE', [character.id]);
  if (existingParty[0]) throw new Error('请先离开当前队伍，再接受这支冒险小队的邀请。');
  const [companions] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT c.id FROM characters c WHERE c.npc_code IN ('npc_forest_warrior','npc_forest_mage','npc_forest_priest') ORDER BY c.id FOR UPDATE`);
  if (companions.length !== 3) throw new Error('冒险小队尚未抵达密林，请重启机器人初始化数据。');
  const partyId = randomUUID();
  await connection.execute('INSERT INTO parties (id,leader_character_id) VALUES (?,?)', [partyId, character.id]);
  await connection.execute('INSERT INTO party_members (party_id,character_id) VALUES (?,?)', [partyId, character.id]);
  for (const companion of companions) {
    await connection.execute('INSERT INTO party_members (party_id,character_id) VALUES (?,?)', [partyId, companion.id]);
    await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=?,current_hp=hp_max,current_mp=mp_max,activity_status=\'active\' WHERE id=?', [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, companion.id]);
  }
  const [templateRows] = await connection.execute<SpawnRow[]>('SELECT t.id AS template_id,t.name,t.monster_class,t.level,t.constitution,t.spirit,t.strength,t.intelligence,t.agility,t.perception,t.constitution_growth,t.spirit_growth,t.strength_growth,t.intelligence_growth,t.agility_growth,t.perception_growth,t.skill_sequence FROM monster_templates t WHERE t.code=\'forest_slime\' FOR UPDATE');
  const template = templateRows[0]; if (!template) throw new Error('森林史莱姆的数据尚未准备好。');
  const weakenedTraits = [{ code: 'weakened', name: '虚弱的', statMultiplier: .5 }]; const baseAttributes = randomMonsterBaseAttributes(template); const hp = monsterCombatStats({ ...template, ...baseAttributes, traits_json: weakenedTraits }).hpMax;
  const [existing] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM monster_spawns WHERE template_id=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL LIMIT 1 FOR UPDATE', [template.template_id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  let spawnId = Number(existing[0]?.id);
  if (!spawnId) {
    const [result] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [template.template_id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z, template.level, baseAttributes.constitution, baseAttributes.spirit, baseAttributes.strength, baseAttributes.intelligence, baseAttributes.agility, baseAttributes.perception, hp, JSON.stringify(stringList(template.skill_sequence)), JSON.stringify(weakenedTraits)]);
    spawnId = Number(result.insertId);
  } else await connection.execute('UPDATE monster_spawns SET current_hp=?,traits_json=? WHERE id=?', [hp, JSON.stringify(weakenedTraits), spawnId]);
  await connection.execute('UPDATE player_story_progress SET status=? WHERE character_id=? AND story_code=\'forest_guide\'', [choice === 'join' ? 'joined' : 'declined', character.id]);
  return {
    spawnId,
    text: choice === 'join'
      ? '莱昂举起盾牌，伊芙与希娅分别在其身后两侧站定。\n三人示意你一同迎战。'
      : '"小心！"\n莱昂一马当先，将你挡在身后。\n他举起盾牌，伊芙与希娅分别在其身后两侧站定。'
  };
});

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
  const [rows] = await connection.execute<CombatTargetRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json,t.element_mastery_json,t.element_resistance_json,ct.current_mp,ct.cooldowns,ct.is_defeated
    FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=? ORDER BY s.id FOR UPDATE`, [sessionId]);
  return materializeMonsters(rows, revealTraits);
};

export const chooseTarget = async (qqUserId: string, spawnId: number, ambush = false) => withTransaction(async connection => {
  let character = await characterFor(qqUserId); let members = await partyCombatants(connection, character);
  for (const member of members) await recalculateCharacterStats(connection, Number(member.id));
  members = await partyCombatants(connection, character); character = members.find(member => Number(member.id) === Number(character.id)) ?? character;
  ensureActionAvailable(character); if (members.some(member => member.activity_status === 'resting')) throw new Error('队伍中有人正在休息，无法进入战斗。');
  const [existing] = await connection.execute<RowDataPacket[]>(`SELECT cs.id FROM combat_sessions cs JOIN combat_members cm ON cm.session_id=cs.id WHERE cm.character_id IN (${members.map(() => '?').join(',')}) AND cs.state='active' LIMIT 1 FOR UPDATE`, members.map(member => member.id));
  if (existing[0]) throw new Error('队伍正在战斗中，请先结束当前战斗。');
  const storyStatus = await forestGuideStatusFor(connection, Number(character.id));
  const [spawnRows] = await connection.execute<(SpawnRow & { template_code: string })[]>(`SELECT s.id,s.template_id,t.code AS template_code,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json,t.element_mastery_json,t.element_resistance_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL FOR UPDATE`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  const appraisal = await appraisalProfileFor(connection, [character.id]);
  const spawns = materializeMonsters(spawnRows, appraisal.informationLevel >= 2);
  const selected = spawns.find(spawn => Number(spawn.id) === spawnId); if (!selected) throw new Error('目标已离开当前位置或已被击败。');
  const selectedRow = spawnRows.find(spawn => Number(spawn.id) === spawnId);
  if (storyStatus && storyStatus !== 'completed' && !(['joined', 'declined'].includes(storyStatus) && selectedRow?.template_code === 'forest_slime')) throw new Error('你正在推进「初章·包容之镇」，请先完成当前剧情。');
  const [occupied] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=? AND cs.state='active' LIMIT 1 FOR UPDATE`, [spawnId]);
  if (occupied[0]) throw new Error('该目标正在与其他队伍战斗。你可以选择伏击等待，或离开此处。');
  const canAmbush = members.every(member => Number(member.speed) > Math.max(...spawns.map(spawn => monsterCombatStats(spawn).speed)));
  if (ambush && !canAmbush) throw new Error('队伍速度不足，无法发动偷袭。');
  const id = randomUUID();
  await connection.execute('INSERT INTO combat_sessions (id,character_id,spawn_id,player_hp,player_mp,cooldowns,opening_damage_bonus) VALUES (?,?,?,?,?,JSON_OBJECT(),?)', [id, character.id, spawns[0].id, character.current_hp, character.current_mp, ambush ? .5 : 0]);
  for (const member of members) await connection.execute('INSERT INTO combat_members (session_id,character_id,current_hp,current_mp,selected_target_id,cooldowns) VALUES (?,?,?,?,?,JSON_OBJECT())', [id, member.id, member.current_hp, member.current_mp, selected.id]);
  for (const spawn of spawns) { await connection.execute('INSERT INTO combat_targets (session_id,spawn_id,current_mp,cooldowns) VALUES (?,?,?,JSON_OBJECT())', [id, spawn.id, monsterCombatStats(spawn).mpMax]); for (const member of members) await connection.execute('INSERT INTO combat_threat (session_id,spawn_id,character_id,threat) VALUES (?,?,?,1)', [id, spawn.id, member.id]); }
  return { character, spawn: selected, spawns, members, ambush };
});

export const queueAmbush = async (qqUserId: string, spawnId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); ensureActionAvailable(character);
  const [ambushRows] = await connection.execute<(RowDataPacket & { status: 'waiting' | 'ready' | 'resolved'; ready_spawn_id: number | null })[]>('SELECT status,ready_spawn_id FROM combat_ambushes WHERE spawn_id=? AND character_id=? FOR UPDATE', [spawnId, character.id]);
  const queued = ambushRows[0];
  if (queued?.status === 'ready' && queued.ready_spawn_id) {
    const [residualRows] = await connection.execute<RowDataPacket[]>('SELECT id FROM monster_spawns WHERE id=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL FOR UPDATE', [queued.ready_spawn_id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
    if (!residualRows[0]) { await connection.execute('UPDATE combat_ambushes SET status=\'resolved\' WHERE spawn_id=? AND character_id=?', [spawnId, character.id]); throw new Error('前一场战斗已经结束，战场上没有可伏击的残余目标。'); }
    const [residualActive] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=? AND cs.state='active' LIMIT 1 FOR UPDATE`, [queued.ready_spawn_id]);
    if (!residualActive[0]) return { ready: true, spawnId: Number(queued.ready_spawn_id), residualParty: true };
  }
  const [spawnRows] = await connection.execute<RowDataPacket[]>('SELECT id FROM monster_spawns WHERE id=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL FOR UPDATE', [spawnId, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (!spawnRows[0]) throw new Error('前一支队伍已经结束战斗，目标已不在此处。');
  const [active] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=? AND cs.state='active' LIMIT 1 FOR UPDATE`, [spawnId]);
  if (!active[0]) { await connection.execute('UPDATE combat_ambushes SET status=\'ready\',ready_spawn_id=NULL WHERE spawn_id=? AND character_id=?', [spawnId, character.id]); return { ready: true, spawnId }; }
  await connection.execute('INSERT INTO combat_ambushes (spawn_id,character_id,status,ready_spawn_id) VALUES (?,?,\'waiting\',NULL) ON DUPLICATE KEY UPDATE status=\'waiting\',ready_spawn_id=NULL', [spawnId, character.id]);
  return { ready: false };
});

export const leaveOccupiedBattle = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  await connection.execute('INSERT INTO encounter_escape_tokens (character_id,region_id,pos_x,pos_y,pos_z) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE region_id=VALUES(region_id),pos_x=VALUES(pos_x),pos_y=VALUES(pos_y),pos_z=VALUES(pos_z)', [character.id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
});

const negotiationFailureOpening = async (qqUserId: string, spawnId: number) => {
  const started = await chooseTarget(qqUserId, spawnId);
  return withTransaction(async connection => {
    const session = await activeCombatFor(connection, started.character.id); if (!session) throw new Error('战斗状态已失效。');
    const members = await combatMembers(connection, session.combat_id); const targets = await combatTargets(connection, session.combat_id, false);
    const attacker = targets[0]; const victim = attacker && threatTarget(members, new Map(members.map(member => [Number(member.id), 1])));
    if (!attacker || !victim) return { started, log: '交涉失败，敌人露出敌意。' };
    const [templateRows] = await connection.execute<(RowDataPacket & { code: string })[]>('SELECT code FROM monster_templates WHERE id=?', [Number(attacker.template_id ?? 0)]);
    const isWolfKing = templateRows[0]?.code === 'shadow_wolf_king';
    const sequence = isWolfKing ? ['wolfking_summon_shadow_wolf'] : stringList(attacker.skill_sequence);
    const cooldowns = jsonObject(attacker.cooldowns);
    let skill: (RowDataPacket & { id: number; code: string; name: string; category: string; element: string; power: number; mana_cost: number; cooldown_turns: number }) | undefined;
    if (sequence.length) {
      const placeholders = sequence.map(() => '?').join(',');
      const [skillRows] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; category: string; element: string; power: number; mana_cost: number; cooldown_turns: number })[]>(`SELECT id,code,name,category,element,power,mana_cost,cooldown_turns FROM skill_definitions WHERE code IN (${placeholders})`, sequence);
      const readySkills = skillRows.filter(candidate => Number(attacker.current_mp) >= Number(candidate.mana_cost) && Number(cooldowns[candidate.code] ?? 0) <= 0);
      skill = isWolfKing ? readySkills.find(candidate => candidate.code === 'wolfking_summon_shadow_wolf') : readySkills.length ? readySkills[random(0, readySkills.length - 1)] : undefined;
    }
    const actionLog: string[] = [];
    if (skill?.code === 'wolfking_summon_shadow_wolf') {
      attacker.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns); attacker.cooldowns = cooldowns;
      const count = await summonShadowWolves(connection, session.combat_id, attacker, members);
      await connection.execute('UPDATE combat_targets SET current_mp=?,cooldowns=? WHERE session_id=? AND spawn_id=?', [attacker.current_mp, JSON.stringify(cooldowns), session.combat_id, attacker.id]);
      await connection.execute('UPDATE combat_sessions SET turn_no=turn_no+1 WHERE id=?', [session.combat_id]);
      return { started, log: `交涉失败！全队错失第一回合行动。\n【${attacker.name}】释放技能「${skill.name}」\n➥影幕翻涌，${count}只影狼加入了战斗。` };
    }
    if (skill) { attacker.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns); attacker.cooldowns = cooldowns; }
    const monster = monsterCombatStats(attacker); const attack = skill?.category === 'magic' ? monster.magicAttack : monster.physicalAttack; const kind = skill?.category === 'magic' ? '魔法' : '物理'; const multiplier = Number(skill?.power ?? 100) / 100;
    const strike = resolveStrike(attack * multiplier, kind === '魔法' ? Number(victim.magic_defense) : Number(victim.physical_defense), monster.accuracy, Number(victim.evasion), monster.crit, Number(victim.crit_resist_bp), monster.critDamage, Number(victim.crit_damage_reduction_bp));
    const oldHp = Number(victim.current_hp); if (strike.hit) { victim.current_hp = Math.max(0, oldHp - strike.damage); if (!victim.current_hp) victim.is_defeated = 1; if (skill) await applySkillEffects(connection, session.combat_id, Number(skill.id), attacker, 'target', victim, 'member', 'on_hit', actionLog); }
    await connection.execute('UPDATE combat_members SET current_hp=?,is_defeated=? WHERE session_id=? AND character_id=?', [victim.current_hp, victim.is_defeated ? 1 : 0, session.combat_id, victim.id]);
    await connection.execute('UPDATE combat_targets SET current_mp=?,cooldowns=? WHERE session_id=? AND spawn_id=?', [attacker.current_mp, JSON.stringify(cooldowns), session.combat_id, attacker.id]);
    await connection.execute('UPDATE combat_sessions SET turn_no=turn_no+1 WHERE id=?', [session.combat_id]);
    const actionText = skill ? `释放技能「${skill.name}」` : '普通攻击';
    const result = !strike.hit ? `【${attacker.name}】${actionText}\n➥【${victim.name}】闪避了攻击。` : `【${attacker.name}】${actionText}\n➥对【${victim.name}】造成 ${strike.damage} 点${kind}伤害(${oldHp}→${victim.current_hp})${actionLog.length ? `\n${actionLog.join('\n')}` : ''}`;
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
      return !strike.hit ? `躲避不及，${primary.name} 发起追击，但【${victim.name}】闪避了。\n你们仍成功脱离遭遇，可以继续移动。` : `躲避不及，${primary.name} 发起追击，对【${victim.name}】造成 ${strike.damage} 点物理伤害。\n你们仍成功脱离遭遇，可以继续移动。`;
    });
  }
  if (action === 'persuade') {
    const monsterNegotiation = Math.max(1, Math.floor(Object.values(monsterAttributes(primary)).reduce((total, value) => total + Number(value), 0)));
    const chance = opposedChance(playerNegotiation, monsterNegotiation);
    if (Math.random() < chance) return withTransaction(async connection => {
      const [targets] = await connection.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,COALESCE(s.level,t.level) AS level,${monsterAttributeColumns},t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.id=? AND s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL FOR UPDATE`, [spawnId, found.character.current_region_id, found.character.pos_x, found.character.pos_y, found.character.pos_z]);
      const target = targets[0]; if (!target) throw new Error('该目标已离开当前位置。');
      const experienceGain = await awardRealmExperience(connection, found.character, Math.max(1, Math.floor(Number(target.experience) * .2))); const experience = experienceGain.experience; const newLevel = experienceGain.level; const gainedPoints = experienceGain.gainedPoints;
      await connection.execute('UPDATE monster_spawns SET current_hp=0,defeated_at=NOW() WHERE id=?', [target.id]);
      if (gainedPoints) await recalculateCharacterStats(connection, Number(found.character.id));
      const rewards: string[] = [];
      for (const rawDrop of jsonArray(target.drops_json)) {
        const drop = jsonObject(rawDrop); if (!drop.code || Math.random() >= Math.min(1, Number(drop.chance ?? 1) * .2)) continue;
        const [items] = await connection.execute<(RowDataPacket & { id: number; name: string; item_type: string })[]>('SELECT id,name,item_type FROM item_definitions WHERE code=?', [String(drop.code)]); const item = items[0]; if (!item) continue;
        const quantity = dropQuantity(drop); await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [found.character.id, item.id]);
        if (item.item_type === 'equipment') for (let index = 0; index < quantity; index += 1) await connection.execute('INSERT INTO player_item_instances (character_id,item_id) VALUES (?,?)', [found.character.id, item.id]);
        else await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [found.character.id, item.id, quantity]);
        rewards.push(`${item.name}×${quantity}`);
      }
      return `交涉成功！${target.name} 接受了你的提议，转身消失在雾中。\n${experienceGain.realmLocked ? realmEnergyDissipationText : `获得经验 ${experience}${gainedPoints ? `，升级至 Lv.${newLevel} 并获得 ${gainedPoints} 技能点` : ''}`}${rewards.length ? `\n获得 ${rewards.join('、')}` : ''}`;
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
  const [targetRows] = await pool.execute<CombatTargetRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.weakness_json,t.resistance_json,t.element_mastery_json,t.element_resistance_json,ct.current_mp,ct.cooldowns,ct.is_defeated FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=? ORDER BY s.id`, [session.combat_id]);
  const appraisal = await appraisalProfileFor(pool, members.map(member => Number(member.id)));
  // 战斗内召唤物被击倒后立刻从展示目标中移除，不显示为普通的“击败”目标。
  const targets = materializeMonsters(targetRows, false).filter(target => !isSummonedMonster(target) || !Boolean(target.is_defeated));
  const [skills] = await pool.execute<(RowDataPacket & { quick_slot: number; code: string })[]>('SELECT ps.quick_slot,s.code FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot IS NOT NULL', [character.id]);
  const [items] = await pool.execute<(RowDataPacket & { quick_slot: number })[]>('SELECT qi.quick_slot FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id WHERE qi.character_id=? AND pi.quantity>0', [character.id]);
  const own = members.find(member => Number(member.id) === Number(character.id)); if (!own) throw new Error('战斗成员状态异常。');
  return {
    sessionId: session.combat_id, characterId: Number(character.id), turn: Number(session.turn_no), playerHp: Number(own.current_hp), playerHpMax: Number(character.hp_max), playerMp: Number(own.current_mp), playerMpMax: Number(character.mp_max), selectedTargetId: own.selected_target_id ? Number(own.selected_target_id) : null,
    canAct: !Boolean(own.is_defeated) && !Boolean(own.pending_action), skillSlots: skills.map(skill => Number(skill.quick_slot)), readySkillSlots: skills.filter(skill => Number(jsonObject(own.cooldowns)[skill.code] ?? 0) <= 0).map(skill => Number(skill.quick_slot)), itemSlots: items.map(item => Number(item.quick_slot)), appraisal: { learned: appraisal.learned, rangeLevel: appraisal.rangeLevel, informationLevel: appraisal.informationLevel },
    members: members.map(member => ({ id: Number(member.id), name: member.name, hp: Number(member.current_hp), hpMax: Number(member.hp_max), mp: Number(member.current_mp), mpMax: Number(member.mp_max), defeated: Boolean(member.is_defeated), pending: Boolean(member.pending_action) })),
    targets: targets.map(target => {
      const observer = appraisalForTarget(appraisal, Number(target.level)); const identified = Boolean(observer);
      return { id: Number(target.id), name: identified ? (Number(observer!.informationLevel) >= 2 ? materializeMonster(target, true).name : target.name) : '???', level: identified ? Number(target.level) : null, hp: identified ? Number(target.current_hp) : '???', hpMax: identified ? Number(target.hp_max) : '???', mp: identified ? Number(target.current_mp) : '???', mpMax: identified ? monsterCombatStats(target).mpMax : '???', defeated: Boolean(target.is_defeated), identified };
    })
  };
};

export const inspectCombat = async (qqUserId: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [sessions] = await pool.execute<(RowDataPacket & { combat_id: string })[]>(`SELECT cs.id AS combat_id FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state='active' LIMIT 1`, [character.id]);
  const session = sessions[0]; if (!session) throw new Error('当前不在战斗中。');
  const [members] = await pool.execute<CombatMemberRow[]>(`SELECT c.*,r.name AS region_name,cm.current_hp,cm.current_mp,cm.selected_target_id,cm.pending_action,cm.cooldowns,cm.is_defeated FROM combat_members cm JOIN characters c ON c.id=cm.character_id JOIN map_regions r ON r.id=c.current_region_id WHERE cm.session_id=? ORDER BY c.id`, [session.combat_id]);
  const profile = await appraisalProfileFor(pool, members.map(member => Number(member.id))); if (!profile.learned) throw new Error('队伍中无人学会被动技能「鉴识」。');
  const [targets] = await pool.execute<CombatTargetRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json,t.element_mastery_json,t.element_resistance_json,ct.current_mp,ct.cooldowns,ct.is_defeated
    FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=? ORDER BY s.id`, [session.combat_id]);
  let effects: CombatEffectRow[] = []; let threats: (RowDataPacket & { spawn_id: number; name: string; threat: number })[] = [];
  if (profile.informationLevel >= 3) [effects] = await pool.execute<CombatEffectRow[]>('SELECT ce.id,ce.target_kind,ce.target_id,e.code,e.name,e.effect_type,ce.value,ce.stacks,ce.remaining_turns FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=?', [session.combat_id]);
  if (profile.informationLevel >= 3) [threats] = await pool.execute<(RowDataPacket & { spawn_id: number; name: string; threat: number })[]>('SELECT ct.spawn_id,c.name,ct.threat FROM combat_threat ct JOIN characters c ON c.id=ct.character_id WHERE ct.session_id=?', [session.combat_id]);
  const lines = ['我方状态', ...members.map(member => `【${member.name}】HP ${member.current_hp}/${member.hp_max}｜MP ${member.current_mp}/${member.mp_max}${member.is_defeated ? '（倒下）' : ''}`), '', '敌方状态'];
  for (const raw of targets) {
    if (isSummonedMonster(raw) && raw.is_defeated) continue;
    const observer = appraisalForTarget(profile, Number(raw.level)); const target = materializeMonster(raw, Number(observer?.informationLevel ?? 0) >= 2); if (!observer) { lines.push('【???】数据无法解析。'); continue; }
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
  const [rows] = await pool.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json
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
  const experienceGain = await awardRealmExperience(connection, character, Number(combat.experience) * modifiers.experienceMultiplier);
  if (experienceGain.gainedPoints) await recalculateCharacterStats(connection, Number(character.id));
  const drops = combat.drops_json ? JSON.parse(combat.drops_json) : [];
  const rewards: string[] = [];
  for (const drop of drops) if (Math.random() <= Math.min(1, Number(drop.chance ?? 1) + modifiers.dropBonus)) {
    const [items] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM item_definitions WHERE code=?', [drop.code]);
    if (items[0]) { const quantity = dropQuantity(drop); await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [character.id, items[0].id, quantity]); rewards.push(`${items[0].name}×${quantity}`); }
  }
  return `胜利！${experienceGain.realmLocked ? realmEnergyDissipationText : `获得经验 ${experienceGain.experience}${modifiers.experienceMultiplier > 1 ? '（成长祝福生效）' : ''}`}${rewards.length ? `，掉落 ${rewards.join('、')}` : ''}。`;
};

const opposedChance = (offense: number, defense: number) => {
  const x = Math.max(1, Number(offense)); const y = Math.max(1, Number(defense));
  return x / (x + y);
};

const resolveStrike = (attack: number, defense: number, accuracy: number, evasion: number, crit: number, critResist: number, critDamage: number, critReduction: number, forceHit = false, forceCrit = false) => {
  if (!forceHit && Math.random() >= opposedChance(accuracy, evasion)) return { hit: false, crit: false, damage: 0 };
  let damage = Math.max(1, Math.floor(attack * attack / (attack + Math.max(1, defense))));
  const critical = forceCrit || Math.random() < opposedChance(crit, critResist);
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
      damage = Math.floor(strike.damage * (1 + modifiers.damageBonusPct / 100)); log = !strike.hit ? `施放 ${skill.name}，但被敌人闪避。` : `施放 ${skill.name}，造成 ${damage} 点${strike.crit ? '暴击' : ''}伤害${modifiers.weaponName ? `（${modifiers.weaponName}生效）` : ''}。`;
    } else {
      const defense = Math.floor(Number(combat.defense) * (1 - modifiers.ignoreDefensePct / 100));
      const strike = resolveStrike(Number(character.physical_attack) + modifiers.physicalAttack, defense, Number(character.accuracy), monsterCombatStats(combat).evasion, Number(character.crit_rate_bp) + modifiers.critRateBp, monsterCombatStats(combat).critResist, Number(character.crit_damage_bp), monsterCombatStats(combat).critReduction);
      damage = Math.floor(strike.damage * (1 + modifiers.damageBonusPct / 100));
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

const physicalDamageTypes = new Set(['斩击', '刺击', '打击']);
const physicalWeaknessMultiplier = (target: CombatTargetRow, damageType: string) => {
  if (!physicalDamageTypes.has(damageType)) return 1;
  if (stringList(target.weakness_json).includes(damageType)) return 2;
  if (stringList(target.resistance_json).includes(damageType)) return .5;
  return 1;
};
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

const effectMessage = (effect: { code: string; name: string; effect_type: string }, value: number, duration: number, stacks = 1, marker: '$' | '#' = '$') => {
  const percent = Number(value).toFixed(1);
  const detail = effect.code === 'vulnerability' ? `物防降低${percent}%`
    : effect.code === 'imbalance' ? `命中、闪避降低${percent}%`
    : effect.code === 'slow' ? `速度降低${percent}%`
    : effect.code === 'sprint' ? `速度提高${percent}%`
    : effect.code === 'armor_shatter' ? `物防降低${percent}%`
    : effect.code === 'bind' ? `速度、闪避降低${percent}%`
    : effect.code === 'rending' ? '进入撕裂状态'
    : effect.code === 'mist_veil' ? `下一次出招伤害提高${percent}%`
    : effect.code === 'shadow_pierce' ? '下一次出招必定暴击'
    : effect.code === 'battle_cry' ? `物攻、魔攻提高${percent}%`
      : effect.code === 'burn' ? '进入灼烧状态'
        : effect.code === 'poison' ? '进入中毒状态'
          : effect.code === 'bleeding' ? '进入流血状态'
            : effect.code === 'stun' ? '进入眩晕状态'
              : effect.code === 'barrier' ? `获得${percent}%生命值护盾`
                : effect.code === 'regeneration' ? '进入再生状态'
                  : effect.code === 'mana_regeneration' ? '进入回流状态'
                    : effect.code === 'sword_break' ? `物防降低${percent}%`
                      : effect.code === 'demon_surge' ? `伤害提高${percent}%`
                  : effect.effect_type === 'cleanse' ? '祛除全部异常状态'
                    : '效果生效';
  return `${marker}${effect.name}${marker}${detail}${duration ? `(${duration})` : ''}${stacks > 1 ? `×${stacks}` : ''}`;
};

const applySkillEffects = async (connection: PoolConnection, sessionId: string, skillId: number, caster: { id: number; level?: number }, casterKind: 'member' | 'target', target: { id: number; level?: number; tenacity?: number }, targetKind: 'member' | 'target', timing: 'on_hit' | 'on_cast', log: string[]) => {
  const [effects] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; effect_type: string; value: number; duration: number; max_stacks: number; stackable: number; effect_level: number; target_scope: 'enemy' | 'ally' | 'self'; skill_code: string })[]>(`SELECT e.id,e.code,e.name,e.effect_type,COALESCE(se.value_override,e.default_value) AS value,COALESCE(se.duration_override,e.default_duration) AS duration,e.max_stacks,e.stackable,se.effect_level,se.target_scope,s.code AS skill_code
    FROM skill_effects se JOIN effect_definitions e ON e.id=se.effect_id JOIN skill_definitions s ON s.id=se.skill_id WHERE se.skill_id=? AND se.trigger_timing=?`, [skillId, timing]);
  for (const effect of effects) {
    const value = Number(effect.value) * (1 + Math.max(0, Number(effect.effect_level) - 1) * .25);
    const effectTargetKind = effect.target_scope === 'self' ? casterKind : targetKind; const targetId = effect.target_scope === 'self' ? Number(caster.id) : Number(target.id);
    if (effect.code === 'stun' && effect.skill_code === 'jump_strike') {
      const targetTenacity = targetKind === 'member' ? Number(target.tenacity ?? 0) : monsterCombatStats(target as CombatTargetRow).tenacity;
      const levelDifference = Number(caster.level ?? 1) - Number(target.level ?? 1);
      const chance = Math.max(.05, Math.min(.85, Number(value) / 100 + Math.max(-.25, Math.min(.25, levelDifference * .05)) - targetTenacity / (targetTenacity + 200) * .25));
      if (Math.random() >= chance) { log.push(`$眩晕$眩晕判定失败（${(chance * 100).toFixed(1)}%）`); continue; }
    }
    if (effect.effect_type === 'cleanse') {
      await connection.execute(`DELETE ce FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=? AND ce.target_kind=? AND ce.target_id=? AND e.effect_type IN ('damage_over_time','stat_modifier','control')`, [sessionId, effectTargetKind, targetId]);
      log.push(effectMessage(effect, value, Number(effect.duration), 1, effectTargetKind === casterKind ? '#' : '$')); continue;
    }
    const [existing] = await connection.execute<(RowDataPacket & { id: number; stacks: number })[]>('SELECT id,stacks FROM combat_status_effects WHERE session_id=? AND target_kind=? AND target_id=? AND effect_id=? FOR UPDATE', [sessionId, effectTargetKind, targetId, effect.id]);
    if (effect.stackable) {
      const currentStacks = existing.reduce((total, row) => total + Number(row.stacks), 0);
      const stacks = Math.min(Number(effect.max_stacks), currentStacks + 1);
      if (currentStacks < Number(effect.max_stacks)) await connection.execute('INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns) VALUES (?,?,?,?,?,?,?)', [sessionId, effectTargetKind, targetId, effect.id, effect.effect_level, value, effect.duration]);
      log.push(effectMessage(effect, value, Number(effect.duration), stacks, effectTargetKind === casterKind ? '#' : '$'));
    } else if (existing[0]) {
      await connection.execute('UPDATE combat_status_effects SET effect_level=?,value=?,stacks=1,remaining_turns=GREATEST(remaining_turns,?) WHERE id=?', [effect.effect_level, value, effect.duration, existing[0].id]);
      log.push(effectMessage(effect, value, Number(effect.duration), 1, effectTargetKind === casterKind ? '#' : '$'));
    } else {
      await connection.execute('INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns) VALUES (?,?,?,?,?,?,?)', [sessionId, effectTargetKind, targetId, effect.id, effect.effect_level, value, effect.duration]);
      log.push(effectMessage(effect, value, Number(effect.duration), 1, effectTargetKind === casterKind ? '#' : '$'));
    }
  }
};

const processTurnEffects = async (connection: PoolConnection, sessionId: string, targetKind: 'member' | 'target', targetId: number, members: CombatMemberRow[], targets: CombatTargetRow[], log: string[]) => {
  const effects = (await activeCombatEffects(connection, sessionId)).filter(effect => effect.target_kind === targetKind && Number(effect.target_id) === targetId);
  let controlled = false;
  for (const effect of effects) {
    const target = effect.target_kind === 'member' ? members.find(member => Number(member.id) === Number(effect.target_id)) : targets.find(monster => Number(monster.id) === Number(effect.target_id));
    if (!target || target.is_defeated) { await connection.execute('DELETE FROM combat_status_effects WHERE id=?', [effect.id]); continue; }
    if (effect.effect_type === 'damage_over_time' || effect.effect_type === 'heal_over_time') {
      const maxHp = Number(effect.target_kind === 'member' ? (target as CombatMemberRow).hp_max : (target as CombatTargetRow).hp_max); const amount = Math.max(1, Math.floor(maxHp * Number(effect.value) * Number(effect.stacks) / 100)); const oldHp = Number((target as any).current_hp);
      (target as any).current_hp = effect.effect_type === 'damage_over_time' ? Math.max(0, oldHp - amount) : Math.min(maxHp, oldHp + amount);
      if (!(target as any).current_hp) (target as any).is_defeated = 1;
      const marker = effect.effect_type === 'damage_over_time' ? '$' : '&';
      log.push(`§${marker}${effect.name}${marker}${effect.effect_type === 'damage_over_time' ? '损失' : '恢复'} ${amount} HP(${oldHp}→${(target as any).current_hp})`);
    }
    if (effect.effect_type === 'mana_regen') {
      const maxMp = Number(effect.target_kind === 'member' ? (target as CombatMemberRow).mp_max : (target as CombatTargetRow).current_mp); const oldMp = Number((target as any).current_mp); const amount = Math.max(1, Math.floor(maxMp * Number(effect.value) * Number(effect.stacks) / 100));
      (target as any).current_mp = Math.min(maxMp, oldMp + amount);
      log.push(`§&${effect.name}&恢复 ${amount} MP(${oldMp}→${(target as any).current_mp})`);
    }
    if (effect.effect_type === 'control') {
      controlled = true;
      log.push(`§$${effect.name}$无法行动`);
    }
    if (effect.code === 'mist_veil' || effect.code === 'shadow_pierce') continue;
    if (Number(effect.remaining_turns) <= 1) await connection.execute('DELETE FROM combat_status_effects WHERE id=?', [effect.id]);
    else await connection.execute('UPDATE combat_status_effects SET remaining_turns=remaining_turns-1 WHERE id=?', [effect.id]);
  }
  return controlled;
};

const summonShadowWolves = async (connection: PoolConnection, sessionId: string, boss: CombatTargetRow, members: CombatMemberRow[]) => {
  const [templates] = await connection.execute<(RowDataPacket & MonsterAttributes & { id: number; level: number; monster_class: string; skill_sequence: unknown })[]>(`SELECT t.id,t.level,t.monster_class,t.skill_sequence,${templateMonsterAttributeColumns} FROM monster_templates t WHERE t.code='shadow_wolf' LIMIT 1 FOR UPDATE`);
  const template = templates[0]; if (!template) return 0;
  const [locations] = await connection.execute<(RowDataPacket & { region_id: number; pos_x: number; pos_y: number; pos_z: number })[]>('SELECT region_id,pos_x,pos_y,pos_z FROM monster_spawns WHERE id=? FOR UPDATE', [boss.id]);
  const location = locations[0]; if (!location) return 0;
  for (let index = 0; index < 2; index += 1) {
    const base = randomMonsterBaseAttributes(template); const spawned = { ...template, ...base, level: 10, traits_json: [] }; const stats = monsterCombatStats(spawned);
    const [result] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [template.id, location.region_id, 1000000 + Number(boss.id), 1000000 + index, location.pos_z, 10, base.constitution, base.spirit, base.strength, base.intelligence, base.agility, base.perception, stats.hpMax, JSON.stringify(stringList(template.skill_sequence)), JSON.stringify([{ code: 'summoned', name: '召唤的' }])]);
    await connection.execute('INSERT INTO combat_targets (session_id,spawn_id,current_mp,cooldowns) VALUES (?,?,?,JSON_OBJECT())', [sessionId, result.insertId, stats.mpMax]);
    for (const member of members) await connection.execute('INSERT INTO combat_threat (session_id,spawn_id,character_id,threat) VALUES (?,?,?,1)', [sessionId, result.insertId, member.id]);
  }
  return 2;
};

const clearSummonedTargets = async (connection: PoolConnection, sessionId: string) => {
  await connection.execute(`UPDATE monster_spawns s JOIN combat_targets ct ON ct.spawn_id=s.id
    SET s.current_hp=0,s.defeated_at=NOW() WHERE ct.session_id=? AND s.defeated_at IS NULL AND JSON_CONTAINS(s.traits_json,JSON_OBJECT('code','summoned'))`, [sessionId]);
};

/**
 * 脱离战斗的存活怪物不会保留残局状态。已被击败的怪物以及战斗内召唤物
 * 分别由原本的击败逻辑与 clearSummonedTargets 处理，不能在此复活。
 */
const restoreLivingCombatTargets = async (connection: PoolConnection, sessionId: string, targets: CombatTargetRow[]) => {
  for (const target of targets) {
    if (target.is_defeated || isSummonedMonster(target)) continue;
    const stats = monsterCombatStats(target);
    await connection.execute('UPDATE monster_spawns SET current_hp=? WHERE id=? AND defeated_at IS NULL', [stats.hpMax, target.id]);
    await connection.execute('UPDATE combat_targets SET current_mp=?,cooldowns=JSON_OBJECT() WHERE session_id=? AND spawn_id=?', [stats.mpMax, sessionId, target.id]);
  }
  await connection.execute("DELETE FROM combat_status_effects WHERE session_id=? AND target_kind='target'", [sessionId]);
};

const prepareResidualPartyAmbush = async (connection: PoolConnection, sessionId: string, members: CombatMemberRow[], targets: CombatTargetRow[]) => {
  if (!targets.length) return;
  const targetIds = targets.map(target => Number(target.id)); const marks = targetIds.map(() => '?').join(',');
  const [waitingRows] = await connection.execute<RowDataPacket[]>(`SELECT character_id FROM combat_ambushes WHERE status='waiting' AND spawn_id IN (${marks}) FOR UPDATE`, targetIds);
  if (!waitingRows.length) return;
  const [locations] = await connection.execute<(RowDataPacket & { region_id: number; pos_x: number; pos_y: number; pos_z: number })[]>('SELECT region_id,pos_x,pos_y,pos_z FROM monster_spawns WHERE id=? FOR UPDATE', [targetIds[0]]);
  const location = locations[0];
  if (!location) return;
  const residualSpawns: number[] = [];
  for (const member of members.filter(item => !item.is_defeated && Number(item.current_hp) > 0)) {
    const code = `ambush_${sessionId.replaceAll('-', '').slice(0, 20)}_${member.id}`;
    const base = Object.fromEntries(attributes.map(attribute => [attribute, Math.max(1, Math.floor(Number(member[attribute])))])) as Allocation;
    const blankGrowth = Object.fromEntries(attributes.map(attribute => [`${attribute}_growth`, 0]));
    const replica = { ...base, ...blankGrowth, level: Number(member.level), traits_json: [] } as MonsterAttributes & { level: number; traits_json: unknown };
    const replicaStats = monsterCombatStats(replica);
    const hpRatio = Number(member.current_hp) / Math.max(1, Number(member.hp_max));
    const currentHp = Math.max(1, Math.min(replicaStats.hpMax, Math.floor(replicaStats.hpMax * hpRatio)));
    const [template] = await connection.execute<any>(`INSERT INTO monster_templates SET code=?,name=?,monster_class='elite',level=?,constitution=?,spirit=?,strength=?,intelligence=?,agility=?,perception=?,
      constitution_growth=0,spirit_growth=0,strength_growth=0,intelligence_growth=0,agility_growth=0,perception_growth=0,hp_max=0,attack=0,defense=0,speed=0,charisma=0,
      weakness_json=JSON_ARRAY(),resistance_json=JSON_ARRAY(),element_mastery_json=JSON_OBJECT(),element_resistance_json=JSON_OBJECT(),skill_sequence=JSON_ARRAY(),experience=0,drops_json=JSON_ARRAY()`, [code, `残血的${member.name}`, Number(member.level), ...attributes.map(attribute => base[attribute])]);
    const [spawn] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,JSON_ARRAY())', [template.insertId, location.region_id, location.pos_x, location.pos_y, location.pos_z, Number(member.level), ...attributes.map(attribute => base[attribute]), currentHp, JSON.stringify([])]);
    residualSpawns.push(Number(spawn.insertId));
  }
  if (!residualSpawns.length) return;
  await connection.execute(`UPDATE combat_ambushes SET status='ready',ready_spawn_id=? WHERE status='waiting' AND spawn_id IN (${marks})`, [residualSpawns[0], ...targetIds]);
};

const finishPartyVictory = async (connection: PoolConnection, sessionId: string, members: CombatMemberRow[], targets: CombatTargetRow[]) => {
  await connection.execute('UPDATE combat_sessions SET state=\'victory\' WHERE id=?', [sessionId]);
  if (targets.length) {
    await prepareResidualPartyAmbush(connection, sessionId, members, targets);
    await connection.execute(`UPDATE combat_ambushes SET status='resolved' WHERE status='ready' AND ready_spawn_id IN (${targets.map(() => '?').join(',')})`, targets.map(target => target.id));
  }
  const rewardTargets = targets.filter(target => !isSummonedMonster(target));
  const playerMembers = members.filter(member => !member.npc_code);
  const partySize = Math.min(4, playerMembers.length);
  const partyExperienceBonus = ({ 1: 0, 2: .10, 3: .20, 4: .35 } as Record<number, number>)[partySize] ?? .35;
  const partyDropBonus = ({ 1: 0, 2: .60, 3: 1, 4: 1.5 } as Record<number, number>)[partySize] ?? 1.5;
  const [luckyElixirs] = playerMembers.length ? await connection.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM player_battle_buffs WHERE buff_code='minor_luck_elixir' AND remaining_battles>0 AND character_id IN (${playerMembers.map(() => '?').join(',')})`, playerMembers.map(member => Number(member.id))) : [[] as any];
  const elixirDropBonus = Number(luckyElixirs[0]?.total ?? 0) > 0 ? .25 : 0;
  const totalExperience = rewardTargets.reduce((sum, target) => sum + Math.floor(Number(target.experience) * (1 + percentBonus(traitList(target.traits_json), 'experiencePct') / 100)), 0);
  const rewards: VictorySettlement['members'] = [];
  const rewardByMemberId = new Map<number, VictorySettlement['members'][number]>();
  const modifiersByMemberId = new Map<number, CombatModifiers>();
  for (const member of playerMembers) {
    const modifiers = await modifiersFor(connection, Number(member.id)); modifiersByMemberId.set(Number(member.id), modifiers);
    const experienceGain = await awardRealmExperience(connection, member, totalExperience * (1 + partyExperienceBonus) * modifiers.experienceMultiplier);
    const experience = experienceGain.experience; const newLevel = experienceGain.level; const gainedPoints = experienceGain.gainedPoints;
    if (gainedPoints) await recalculateCharacterStats(connection, Number(member.id));
    await advanceBountyProgress(connection, Number(member.id), rewardTargets.map(target => ({ spawnId: Number(target.id), templateId: Number(target.template_id) })));
    const drops: VictorySettlement['members'][number]['drops'] = [];
    const learned: VictorySettlement['members'][number]['learned'] = [];
    for (const target of rewardTargets) {
      const [rules] = await connection.execute<(RowDataPacket & { skill_id: number; name: string; chance: number; source_skill_code: string })[]>(`SELECT r.skill_id,s.name,r.chance,r.source_skill_code FROM monster_skill_learn_rules r JOIN skill_definitions s ON s.id=r.skill_id JOIN skill_definitions source ON source.code=r.source_skill_code AND source.category=s.category AND source.damage_type=s.damage_type WHERE r.monster_template_id=?`, [Number(target.template_id)]);
      for (const rule of rules) {
        if (!stringList(target.skill_sequence).includes(rule.source_skill_code) || Math.random() > Number(rule.chance)) continue;
        const [result] = await connection.execute<any>('INSERT IGNORE INTO player_skill_discoveries (character_id,skill_id) VALUES (?,?)', [member.id, rule.skill_id]);
        if (Number(result.affectedRows)) learned.push({ id: Number(rule.skill_id), name: rule.name });
      }
    }
    const reward = { name: member.name, experience, realmLocked: experienceGain.realmLocked, realmCapReached: experienceGain.realmCapReached, levelText: gainedPoints ? `升级至 Lv.${newLevel}，获得 ${gainedPoints} 技能点` : undefined, drops, learned };
    rewards.push(reward); rewardByMemberId.set(Number(member.id), reward);
  }
  const randomRecipient = () => playerMembers[random(0, playerMembers.length - 1)]!;
  const grantDrop = async (recipient: CombatMemberRow, code: string, quantity: number) => {
    const [items] = await connection.execute<(RowDataPacket & { id: number; name: string; item_type: string; codex_id: string | null })[]>('SELECT id,name,item_type,codex_id FROM item_definitions WHERE code=?', [code]); const item = items[0]; const reward = rewardByMemberId.get(Number(recipient.id)); if (!item || !reward) return;
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [recipient.id, item.id]);
    if (item.item_type === 'equipment') for (let index = 0; index < quantity; index += 1) { const [result] = await connection.execute<any>('INSERT INTO player_item_instances (character_id,item_id) VALUES (?,?)', [recipient.id, item.id]); reward.drops.push({ name: item.name, quantity: 1, itemType: item.item_type, codexId: item.codex_id, instanceId: Number(result.insertId) }); }
    else {
      await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [recipient.id, item.id, quantity]);
      const existing = reward.drops.find(drop => !drop.instanceId && drop.name === item.name && drop.itemType === item.item_type && drop.codexId === item.codex_id);
      if (existing) existing.quantity += quantity;
      else reward.drops.push({ name: item.name, quantity, itemType: item.item_type, codexId: item.codex_id });
    }
  };
  // 每个掉落条目只掷一次：组队只提高成功率，不增加基础掉落总量。
  for (const target of rewardTargets) for (const rawDrop of jsonArray(target.drops_json)) {
    const drop = jsonObject(rawDrop); if (!drop.code || !playerMembers.length) continue;
    const recipient = randomRecipient(); const modifiers = modifiersByMemberId.get(Number(recipient.id))!; const traitDropBonus = percentBonus(traitList(target.traits_json), 'dropPct') / 100;
    if (Math.random() > Math.min(1, Number(drop.chance ?? 1) * (1 + traitDropBonus + partyDropBonus + elixirDropBonus) + modifiers.dropBonus)) continue;
    // 同种物品一次掉出多份时，每一份独立分配，结算页再按玩家合并显示数量。
    for (let index = 0; index < dropQuantity(drop); index += 1) await grantDrop(randomRecipient(), String(drop.code), 1);
  }
  if (playerMembers.length) for (const target of rewardTargets.filter(target => traitList(target.traits_json).some(trait => trait.code === 'riot'))) {
    const [templates] = await connection.execute<(RowDataPacket & { code: string })[]>('SELECT code FROM monster_templates WHERE id=?', [target.template_id]);
    const specialCode = riotMaterialByMonster[templates[0]?.code ?? ''] ?? 'beast_core';
    for (const code of Math.random() < .25 ? [specialCode, 'riot_aura'] : [specialCode]) await grantDrop(randomRecipient(), code, 1);
  }
  const [guideBattle] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=? AND t.code='forest_slime' LIMIT 1`, [sessionId]);
  let arrivalPending = false;
  if (guideBattle[0]) {
    const [townRows] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM map_regions WHERE code=\'baina_town\' LIMIT 1');
    if (townRows[0]) {
      for (const member of members) {
        const [story] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_story_progress WHERE character_id=? AND story_code=\'forest_guide\' AND status IN (\'joined\',\'declined\') LIMIT 1', [member.id]);
        if (!story[0]) continue;
        await connection.execute('UPDATE player_story_progress SET status=\'awaiting_arrival\' WHERE character_id=? AND story_code=\'forest_guide\'', [member.id]);
        arrivalPending = true;
      }
    }
  }
  await consumeBattleBuffs(connection, members);
  return { kind: 'victory', members: rewards, arrivalPending } as VictorySettlement;
};

const applyArtifactEffect = async (connection: PoolConnection, sessionId: string, code: 'sword_break' | 'demon_surge', targetKind: 'member' | 'target', targetId: number, log: string[]) => {
  const [effects] = await connection.execute<(RowDataPacket & { id: number; name: string; default_value: number; default_duration: number; max_stacks: number })[]>('SELECT id,name,default_value,default_duration,max_stacks FROM effect_definitions WHERE code=?', [code]); const effect = effects[0]; if (!effect) return;
  const [existing] = await connection.execute<(RowDataPacket & { stacks: number })[]>('SELECT stacks FROM combat_status_effects WHERE session_id=? AND target_kind=? AND target_id=? AND effect_id=? FOR UPDATE', [sessionId, targetKind, targetId, effect.id]);
  const currentStacks = existing.reduce((total, row) => total + Number(row.stacks), 0);
  const stacks = Math.min(Number(effect.max_stacks), currentStacks + 1);
  if (currentStacks < Number(effect.max_stacks)) await connection.execute('INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns) VALUES (?,?,?,?,?,?,?)', [sessionId, targetKind, targetId, effect.id, 1, effect.default_value, effect.default_duration]);
  const percent = Number(effect.default_value).toFixed(1);
  log.push(`${targetKind === 'member' ? '#' : '$'}${effect.name}${targetKind === 'member' ? '#' : '$'}${code === 'sword_break' ? `物防降低${percent}%` : `伤害提高${percent}%`}(${effect.default_duration})${stacks > 1 ? `×${stacks}` : ''}`);
};

export const currentEncounter = async (qqUserId: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [rows] = await pool.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json,t.element_mastery_json,t.element_resistance_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  const appraisal = await appraisalProfileFor(pool, [character.id]);
  const [occupiedRows] = await pool.execute<(RowDataPacket & { spawn_id: number })[]>(`SELECT ct.spawn_id FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id
    WHERE cs.state='active' AND ct.spawn_id IN (${rows.map(() => '?').join(',') || 'NULL'})`, rows.map(row => row.id));
  const spawns = materializeMonsters(rows, appraisal.informationLevel >= 2); if (!spawns.length) return null;
  await pool.query(`INSERT IGNORE INTO player_monster_codex (character_id,monster_template_id) VALUES ${spawns.map(() => '(?,?)').join(',')}`,
    spawns.flatMap(spawn => [character.id, Number(spawn.template_id)]));
  const members = await partyCombatants(pool, character); const fastestMonster = Math.max(...spawns.map(spawn => monsterCombatStats(spawn).speed));
  const [texts] = await pool.execute<(RowDataPacket & { description: string })[]>('SELECT description FROM monster_encounter_texts WHERE monster_template_id=? ORDER BY RAND() LIMIT 1', [spawns[0].template_id]);
  return { character, spawns, occupied: occupiedRows.some(row => Number(row.spawn_id) === Number(spawns[0]?.id)), canAmbush: members.every(member => Number(member.speed) > fastestMonster), text: texts[0]?.description ?? `${spawns[0].name} 拦住了你的去路。` };
};

export type TownArrivalStory = { stage: number; text: string; completed: boolean; chapter: 'town' | 'guild'; arrivalBuilding?: 'guild_counter' };

const townArrivalScenes: Record<number, string> = {
  1: '三人冒险队将你带到百纳镇——猫拉瑞亚的边缘。\n城镇看上去规模不小，先映入眼帘的是目光望不到头的城墙。城墙约莫五六米高，由厚重的石砖堆砌而成，其缝隙有青苔蔓延，但表面却光亮整洁。它看上去被维护得很好。\n古旧的金属城门旁，驻守着两名士兵模样的壮汉。我们进城时，他们友好地向我们打了个招呼。\n此时天色正晌，城门后一幅熙熙攘攘的景象。',
  2: '这边貌似是交易兽材的集市。路边散乱地摆放着不少猎物，其身后伫立的摊主看似都不好招惹。依然有不少人上前问价，对货物比比划划。\n莱昂将我带到一个摊前，一名浅黄发色的猫族少女正在和摊主讨价还价。\n“什么喵？3银币太贵了喵~把我卖了都买不起喵……能给个优惠喵？吾一定常来光顾喵！”\n“那你多买点吧，3个算你10银币好了。”\n“成交！”\n似乎怕店主反悔，少女不假思索地丢下银币，将摊上三枚亮闪闪的兽核攥在了手里。',
  3: '“嗨，梨子喵！你又在花冤枉钱了！”\n莱昂走向前去，瞪了摊主一眼。那人悻悻地将一枚银币退了回去。\n“啊，我……我才没有算错！这……这一枚是……是是打赏给店家的。”\n少女的脸瞬间就红了。\n“嗷，这样啊——那我还回去了哟？”\n“别……别呀！”\n莱昂将银币高高举起，少女蹦跳着想要够回属于她的银币。你望着这幅景象，感觉异世界生活似乎也不赖。',
  4: '闹够了后，莱昂向我指了指。\n“梨子喵，交给你一个任务。这位是初来乍到的勇者大人，你带他去咱们这儿的工会看看吧。”\n“勇……勇者！”\n她朝你望过来，眼神散发出星星般闪烁的光芒。\n听到这话，你心头瞬间警惕起来。',
  5: '“嘿，你也别藏了，瞧你这奇装异服的，还能瞒得过我？”莱昂一脸得意，“你也别害怕，我已经见识过数十位莅临此地的转生者了，每年总能遇上这么几位。”\n“原来如此。我早就对你们接纳我这么快而感到奇怪了。能带我去见见那些转生者吗？”\n“我们还有点事儿，要赶去铁匠铺一趟。让梨子喵先带你去冒险者公会看看吧。那里是众多冒险者汇聚之地，你在那儿说不定能碰上老乡呢！”\n莱昂拍了拍我肩，挥挥手带着队友离去。他渐行渐远，抛下了一段令人意味深长的话。',
  6: '“你们的到来，并没有缓解这片世界的焦灼。\n有的人为恶一方兴风作浪，有的人却在遍地留下不朽的传说。\n远道而来的朋友，希望下次遇见时，你还能恪守底线，守住真我。”\n“祝您武运昌顺！”'
};

const guildArrivalScenes: Record<number, string> = {
  1: '“欢迎来到百纳镇喵！”\n那名猫族少女热情地凑上前。\n“吾名阿克谢尔·梨子，如您所见，我是人类与猫族的混血喵。”\n“你这名字……不错。很有味道。”\n“那……那个喵……我出生的时候，父亲与母亲取名各取了一半喵。所以就……”\n梨子喵抓紧衣角，俏脸微红。但很快她就重新抖擞起来。\n“呐呐，勇者大人是第一次喵？我来给你带路喵！”\n她在身后一阵乱摸，掏出一张标满图记的城镇地图塞进我手中，俏脸微红。\n一只柔软但有力的小手牵住了你，向城镇中央一路小跑。',
  2: '梨子喵牵着你穿过纵横交错的石板街。\n路旁的招牌随着风轻轻碰撞，行商的叫卖声、铁锤落在砧板上的脆响与不知名的方言混在一起。\n“这里是百纳镇最热闹的地方喵！只要不惹麻烦，什么种族都能在这里找到落脚处。”\n她一边介绍，一边在地图上点出高塔、市场与冒险者公会的位置。\n最后，她指向街道尽头那座挂着剑与杖徽记的宽大建筑。\n“到了那里，勇者大人就可以正式注册身份、接取悬赏委托了喵，也能向其他冒险者打听转生者的消息喵~”',
  3: '你缓缓推开冒险者公会的大门。\n温暖的灯光从门缝里流出来，混着麦酒、羊皮纸与金属的气味。\n柜台前有人为委托争得面红耳赤，也有人带着新鲜的伤口低声结算报酬。\n更深处的公告板上，密密麻麻贴满了通往未知的纸页。\n梨子喵松开你的手，认真地整了整衣领。\n“从这里开始，勇者大人就要自己选择路了喵~不过别担心，梨子喵会在镇上帮你的喵！”'
};

export const continueForestArrival = async (qqUserId: string): Promise<TownArrivalStory> => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [storyRows] = await connection.execute<(RowDataPacket & { status: string; stage: number })[]>('SELECT status,stage FROM player_story_progress WHERE character_id=? AND story_code=\'forest_guide\' FOR UPDATE', [character.id]);
  const story = storyRows[0];
  if (!story || !['awaiting_arrival', 'arrival_story', 'guild_story'].includes(story.status)) throw new Error('当前没有待继续的剧情。');
  const [town] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM map_regions WHERE code=\'baina_town\' LIMIT 1');
  if (!town[0]) throw new Error('百纳镇地图尚未准备好。');

  if (story.status === 'awaiting_arrival') {
    await connection.execute('UPDATE characters SET current_region_id=?,pos_x=-26,pos_y=-135 WHERE id=?', [town[0].id, character.id]);
    await connection.execute('UPDATE player_story_progress SET status=\'arrival_story\',stage=1 WHERE character_id=? AND story_code=\'forest_guide\'', [character.id]);
    const [party] = await connection.execute<(RowDataPacket & { id: string })[]>('SELECT id FROM parties WHERE leader_character_id=? LIMIT 1', [character.id]);
    if (party[0]) await connection.execute('DELETE FROM parties WHERE id=?', [party[0].id]);
    return { stage: 1, text: townArrivalScenes[1], completed: false, chapter: 'town' };
  }

  const stage = Number(story.stage);
  if (story.status === 'guild_story') {
    if (stage < 3) {
      const nextStage = stage + 1;
      await connection.execute('UPDATE player_story_progress SET stage=? WHERE character_id=? AND story_code=\'forest_guide\'', [nextStage, character.id]);
      return { stage: nextStage, text: guildArrivalScenes[nextStage], completed: false, chapter: 'guild' };
    }
    await connection.execute('UPDATE player_story_progress SET status=\'completed\' WHERE character_id=? AND story_code=\'forest_guide\'', [character.id]);
    await grantTownMap(connection, Number(character.id));
    await connection.execute('UPDATE characters SET current_region_id=?,pos_x=-8,pos_y=-116 WHERE id=?', [town[0].id, character.id]);
    return { stage: 3, completed: true, text: '获得【地图·百纳镇】', chapter: 'guild', arrivalBuilding: 'guild_counter' };
  }
  if (stage < 6) {
    const nextStage = stage + 1;
    await connection.execute('UPDATE player_story_progress SET stage=? WHERE character_id=? AND story_code=\'forest_guide\'', [nextStage, character.id]);
    return { stage: nextStage, text: townArrivalScenes[nextStage], completed: false, chapter: 'town' };
  }

  await connection.execute('UPDATE player_story_progress SET status=\'guild_story\',stage=1 WHERE character_id=? AND story_code=\'forest_guide\'', [character.id]);
  return { stage: 1, completed: false, text: guildArrivalScenes[1], chapter: 'guild' };
});

export const talkToNpc = async (qqUserId: string, code: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); const [npcs] = await connection.execute<(RowDataPacket & { code: string; name: string; description: string })[]>('SELECT code,name,description FROM map_npcs WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND code=? LIMIT 1', [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, code]); const npc = npcs[0]; if (!npc) throw new Error('这位居民已经离开了。');
  if (npc.code !== 'pear_guide') return `${npc.description}\n\n${npc.name} 向你点头致意，安静地等待着你的回应。`;
  return '梨子喵先是愣了一下，随后猫耳高高竖起，快步朝你跑来。\n“是勇者大人喵！又见到你啦。今天的冒险还顺利吗？”\n\n她熟稔地站到你身边，尾巴轻轻晃着，像是随时准备听你讲新的见闻。';
});

const persistBattleMembers = async (connection: PoolConnection, members: CombatMemberRow[], forceRest = false) => {
  for (const member of members) {
    const defeated = forceRest || Boolean(member.is_defeated); const hp = defeated ? 1 : Math.max(1, Number(member.current_hp));
    await connection.execute('UPDATE characters SET current_hp=?,current_mp=?,activity_status=?,rest_started_at=? WHERE id=?', [hp, Math.max(0, Number(member.current_mp)), defeated ? 'unconscious' : 'active', defeated ? new Date() : null, member.id]);
  }
};

export const combatAction = async (qqUserId: string, action: PendingAction['type'], slot?: number, skillId?: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); const session = await activeCombatFor(connection, character.id);
  if (!session) throw new Error('当前不在战斗中。');
  const members = await combatMembers(connection, session.combat_id); const actor = members.find(member => Number(member.id) === Number(character.id));
  // 剧情队友仍存活时，即便主角倒下也要允许系统代为推进他们的回合。
  // 不再依赖特定怪物，避免剧情队伍意外卷入其他战斗后永久卡死。
  const [npcAllyRows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_members cm JOIN characters c ON c.id=cm.character_id
    WHERE cm.session_id=? AND cm.is_defeated=0 AND c.npc_code IN ('npc_forest_warrior','npc_forest_mage','npc_forest_priest') LIMIT 1 FOR UPDATE`, [session.combat_id]);
  const continuingNpcPartyBattle = Boolean(actor?.is_defeated) && Boolean(npcAllyRows[0]);
  if (!actor || (actor.is_defeated && !continuingNpcPartyBattle)) throw new Error('你已失去行动能力。');
  if (!continuingNpcPartyBattle && actor.pending_action) throw new Error('本回合行动已确认，请等待队友。');
  if (!continuingNpcPartyBattle && ((action === 'skill' && !slot && !skillId) || (action === 'item' && !slot))) throw new Error('请选择快捷栏位。');
  if (!continuingNpcPartyBattle && action === 'skill') {
    const [skills] = await connection.execute<(RowDataPacket & { skill_id: number; code: string; mana_cost: number })[]>(skillId ? 'SELECT ps.skill_id,s.code,s.mana_cost FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=? FOR UPDATE' : 'SELECT ps.skill_id,s.code,s.mana_cost FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot=? FOR UPDATE', skillId ? [character.id, skillId] : [character.id, slot]);
    if (!skills[0]) throw new Error(skillId ? '自动战斗技能尚未学习。' : `${quickSlotLabel(Number(slot))}未配置`);
    const remaining = Number(jsonObject(actor.cooldowns)[skills[0].code] ?? 0);
    if (remaining > 0) throw new Error(skillId ? '自动战斗技能冷却中。' : `${quickSlotLabel(Number(slot))}冷却中，还需${remaining}回合`);
    const modifiers = await modifiersFor(connection, Number(character.id));
    const [specializations] = await connection.execute<(RowDataPacket & { specialization: string; level: number })[]>('SELECT specialization,level FROM player_skill_specializations WHERE character_id=? AND skill_id=?', [character.id, skills[0].skill_id]);
    const overcharge = Math.max(0, Number(specializations.find(row => row.specialization === 'overcharge')?.level ?? 1) - 1); const efficient = Math.max(0, Number(specializations.find(row => row.specialization === 'efficient')?.level ?? 1) - 1);
    const manaCost = Math.max(Number(skills[0].mana_cost) ? 1 : 0, Math.ceil(Number(skills[0].mana_cost) * Math.pow(1.16, overcharge) * Math.pow(.92, efficient) * (modifiers.manaAffinity ? .7 : 1)) - modifiers.manaCostReduction);
    if (Number(actor.current_mp) < manaCost) throw new Error(skillId ? `自动战斗技能魔力不足（需要 ${manaCost} MP）。` : `魔力不足，释放${quickSlotLabel(Number(slot))}需要 ${manaCost} MP。`);
  }
  if (!continuingNpcPartyBattle && action === 'item') {
    const [items] = await connection.execute<RowDataPacket[]>('SELECT qi.item_id FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id WHERE qi.character_id=? AND qi.quick_slot=? AND pi.quantity>0 FOR UPDATE', [character.id, slot]);
    if (!items[0]) throw new Error(`道具${'①②③④'.charAt(Number(slot) - 1) || slot}未配置或已耗尽。`);
  }
  if (!continuingNpcPartyBattle) {
    const pending: PendingAction = { type: action, ...(slot ? { slot } : {}), ...(skillId ? { skillId } : {}) };
    await connection.execute('UPDATE combat_members SET pending_action=? WHERE session_id=? AND character_id=?', [JSON.stringify(pending), session.combat_id, character.id]); actor.pending_action = JSON.stringify(pending);
  }
  const [npcRows] = await connection.execute<(RowDataPacket & { character_id: number; npc_code: string })[]>(`SELECT cm.character_id,c.npc_code FROM combat_members cm JOIN characters c ON c.id=cm.character_id WHERE cm.session_id=? AND cm.is_defeated=0 AND cm.pending_action IS NULL AND c.npc_code IN ('npc_forest_warrior','npc_forest_mage','npc_forest_priest') FOR UPDATE`, [session.combat_id]);
  for (const npc of npcRows) {
    const turn = Number(session.turn_no);
    const slot = npc.npc_code === 'npc_forest_warrior' ? (turn % 3 === 1 ? 1 : turn % 3 === 2 ? 2 : 3)
      : npc.npc_code === 'npc_forest_mage' ? (turn % 2 === 1 ? 1 : 2)
        : (turn % 4 === 1 ? 2 : turn % 4 === 2 ? 1 : turn % 4 === 3 ? 4 : 3);
    const code = npc.npc_code === 'npc_forest_warrior' ? ['warrior_taunt', 'shield_counter', 'guard_break'][slot - 1]
      : npc.npc_code === 'npc_forest_mage' ? ['arcane_shackle', 'ember_burst'][slot - 1]
        : ['healing_prayer', 'blessing_aegis', 'sanctified_bolt', 'mana_benediction'][slot - 1];
    const npcMember = members.find(item => Number(item.id) === Number(npc.character_id));
    const [skillRows] = await connection.execute<(RowDataPacket & { mana_cost: number })[]>('SELECT s.mana_cost FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot=?', [npc.character_id, slot]);
    const pending: PendingAction = Number(jsonObject(npcMember?.cooldowns)[code] ?? 0) > 0 || !skillRows[0] || Number(npcMember?.current_mp ?? 0) < Number(skillRows[0].mana_cost) ? { type: 'attack' } : { type: 'skill', slot };
    await connection.execute('UPDATE combat_members SET pending_action=? WHERE session_id=? AND character_id=?', [JSON.stringify(pending), session.combat_id, npc.character_id]);
    if (npcMember) npcMember.pending_action = JSON.stringify(pending);
  }
  const aliveMembers = members.filter(member => !member.is_defeated);
  if (!aliveMembers.every(member => member.pending_action)) return { ended: false, waiting: true, log: `\n\n[${character.name}]已确认行动，等待队友（${aliveMembers.filter(member => member.pending_action).length}/${aliveMembers.length}）。` };

  const appraisal = await appraisalProfileFor(connection, members.map(member => Number(member.id)));
  const targets = await combatTargets(connection, session.combat_id, false); const targetName = (target: CombatTargetRow) => { const observer = appraisalForTarget(appraisal, Number(target.level)); return observer ? (observer.informationLevel >= 2 ? materializeMonster(target, true).name : target.name) : '???'; }; const log: string[] = [`战斗<${session.turn_no}>回合`]; let effects = await activeCombatEffects(connection, session.combat_id);
  const effectValue = (kind: 'member' | 'target', targetId: number, code: string) => effects.filter(effect => effect.target_kind === kind && Number(effect.target_id) === targetId && effect.code === code).reduce((sum, effect) => sum + Number(effect.value) * Number(effect.stacks), 0);
  const turns = [...aliveMembers.filter(member => !member.is_defeated).map(member => ({ kind: 'member' as const, id: Number(member.id), speed: Number(member.speed) * (1 - (effectValue('member', Number(member.id), 'slow') + effectValue('member', Number(member.id), 'bind')) / 100) * (1 + effectValue('member', Number(member.id), 'sprint') / 100) })), ...targets.filter(target => !target.is_defeated).map(target => ({ kind: 'target' as const, id: Number(target.id), speed: monsterCombatStats(target).speed * (1 - (effectValue('target', Number(target.id), 'slow') + effectValue('target', Number(target.id), 'bind')) / 100) * (1 + effectValue('target', Number(target.id), 'sprint') / 100) }))].sort((a, b) => b.speed - a.speed || a.id - b.id);
  let resolvedActions = 0;
  for (const turn of turns) {
    const logStart = log.length;
    const controlled = await processTurnEffects(connection, session.combat_id, turn.kind, turn.id, members, targets, log);
    effects = await activeCombatEffects(connection, session.combat_id);
    if (turn.kind === 'member') {
      const member = members.find(item => Number(item.id) === turn.id)!; if (member.is_defeated) continue;
      if (resolvedActions > 0) log.splice(logStart, 0, '————');
      resolvedActions += 1;
      if (controlled) continue;
      const choice = jsonObject(member.pending_action) as unknown as PendingAction;
      if (choice.type === 'escape') { log.push(`➤【${member.name}】选择撤离\n　➥等待队伍共同脱离。`); continue; }
      if (choice.type === 'item') {
        const [items] = await connection.execute<(RowDataPacket & { item_id: number; quantity: number; name: string; effect_json: unknown })[]>('SELECT pi.item_id,pi.quantity,i.name,i.effect_json FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id JOIN item_definitions i ON i.id=pi.item_id WHERE qi.character_id=? AND qi.quick_slot=? FOR UPDATE', [member.id, choice.slot]);
        const item = items[0]; if (!item?.quantity) { log.push(`➤【${member.name}】使用道具\n　➥快捷栏为空。`); continue; }
        const effect = jsonObject(item.effect_json); const oldHp = Number(member.current_hp); const oldMp = Number(member.current_mp); member.current_hp = Math.min(Number(member.hp_max), oldHp + Number(effect.heal ?? 0)); member.current_mp = Math.min(Number(member.mp_max), oldMp + Number(effect.restoreMp ?? 0)); await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [member.id, item.item_id]); const buffs: string[] = []; if (Number(effect.experienceBonusPct)) { await connection.execute(`INSERT INTO player_battle_buffs (character_id,buff_code,remaining_battles) VALUES (?,'minor_experience_elixir',?) ON DUPLICATE KEY UPDATE remaining_battles=VALUES(remaining_battles)`, [member.id, Number(effect.battleCount ?? 10)]); buffs.push(`经验获取+${Number(effect.experienceBonusPct)}%，持续${Number(effect.battleCount ?? 10)}场战斗`); } if (Number(effect.partyDropBonusPct)) { await connection.execute(`INSERT INTO player_battle_buffs (character_id,buff_code,remaining_battles) VALUES (?,'minor_luck_elixir',?) ON DUPLICATE KEY UPDATE remaining_battles=VALUES(remaining_battles)`, [member.id, Number(effect.battleCount ?? 10)]); buffs.push(`全队掉率+${Number(effect.partyDropBonusPct)}%，持续${Number(effect.battleCount ?? 10)}场战斗`); } const restored = [Number(effect.heal ?? 0) ? `HP ${oldHp}→${member.current_hp}` : '', Number(effect.restoreMp ?? 0) ? `MP ${oldMp}→${member.current_mp}` : '', ...buffs].filter(Boolean).join('｜') || '暂时没有产生效果'; log.push(`➤【${member.name}】使用[${item.name}]\n　➥${restored}`); continue;
      }
      const target = targets.find(item => Number(item.id) === Number(member.selected_target_id) && !item.is_defeated) ?? targets.find(item => !item.is_defeated); if (!target) continue;
      const modifiers = await modifiersFor(connection, Number(member.id)); const swordAction = choice.type === 'attack'; let skillScale = 1; let attack = (Number(member.physical_attack) + modifiers.physicalAttack) * (1 + modifiers.physicalAttackPct / 100); let power = 1; let kind = '物理'; let damageType = '斩击'; let element = ''; let label = '普通攻击'; let skillId: number | undefined; let skillCode: string | undefined;
      if (choice.type === 'skill') {
        const [skills] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; category: 'physical' | 'magic' | 'utility'; damage_type: string; element: string; mana_cost: number; cooldown_turns: number; cooldown_reduction_per_level: number; power: number; level: number; power_per_level: number })[]>(choice.skillId ? 'SELECT s.id,s.code,s.name,s.category,s.damage_type,s.element,s.mana_cost,s.cooldown_turns,s.cooldown_reduction_per_level,s.power,ps.level,s.power_per_level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=?' : 'SELECT s.id,s.code,s.name,s.category,s.damage_type,s.element,s.mana_cost,s.cooldown_turns,s.cooldown_reduction_per_level,s.power,ps.level,s.power_per_level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot=?', choice.skillId ? [member.id, choice.skillId] : [member.id, choice.slot]);
        const skill = skills[0]; if (!skill) { log.push(`➤【${member.name}】释放技能\n　➥技能栏为空。`); continue; }
        const [specializationRows] = await connection.execute<(RowDataPacket & { specialization: string; level: number })[]>('SELECT specialization,level FROM player_skill_specializations WHERE character_id=? AND skill_id=?', [member.id, skill.id]); const specializations = new Map(specializationRows.map(row => [row.specialization, Number(row.level) - 1])); const overcharge = Math.max(0, specializations.get('overcharge') ?? 0); const instant = Math.max(0, specializations.get('instant') ?? 0); const efficient = Math.max(0, specializations.get('efficient') ?? 0);
        const manaCost = Math.max(skill.mana_cost ? 1 : 0, Math.ceil(Number(skill.mana_cost) * Math.pow(1.16, overcharge) * Math.pow(.92, efficient) * (modifiers.manaAffinity ? .7 : 1)) - modifiers.manaCostReduction); if (Number(member.current_mp) < manaCost) { log.push(`➤【${member.name}】释放技能「${skill.name}」\n　➥MP不足。`); continue; }
        member.current_mp -= manaCost; const cooldowns = jsonObject(member.cooldowns); const baseCooldown = Math.max(0, Number(skill.cooldown_turns)); const cooldown = Math.max(0, roundTowardInitialTiming(Number(skill.cooldown_turns), Math.max(1, baseCooldown) * Math.pow(1.08, overcharge) * Math.pow(.92, instant))); cooldowns[skill.code] = cooldown + 1; member.cooldowns = cooldowns; skillId = Number(skill.id); skillCode = skill.code; label = `释放技能「${skill.name}」`; kind = skill.category === 'magic' ? '魔法' : '物理'; damageType = skill.damage_type; element = skill.element; skillScale = Number(skill.power) * Math.pow(1.08, overcharge) * Math.pow(.96, instant) / 100; attack = (skill.category === 'magic' ? (Number(member.magic_attack) + modifiers.magicAttack) * (1 + modifiers.magicAttackPct / 100) : (Number(member.physical_attack) + modifiers.physicalAttack) * (1 + modifiers.physicalAttackPct / 100)) * skillScale; power = skill.category === 'magic' ? 1 + modifiers.magicDamagePct / 100 : 1;
      }
      if (skillCode === 'warrior_taunt_player') {
        log.push(`➤【${member.name}】${label}`);
        for (const target of targets.filter(item => !item.is_defeated)) {
          const [threatRows] = await connection.execute<(RowDataPacket & { character_id: number; threat: number })[]>('SELECT character_id,threat FROM combat_threat WHERE session_id=? AND spawn_id=? FOR UPDATE', [session.combat_id, target.id]);
          let transferred = 0;
          for (const row of threatRows) if (Number(row.character_id) !== Number(member.id)) { const amount = Math.floor(Number(row.threat) / 2); transferred += amount; await connection.execute('UPDATE combat_threat SET threat=threat-? WHERE session_id=? AND spawn_id=? AND character_id=?', [amount, session.combat_id, target.id, row.character_id]); }
          await connection.execute('UPDATE combat_threat SET threat=threat+? WHERE session_id=? AND spawn_id=? AND character_id=?', [transferred, session.combat_id, target.id, member.id]);
        }
        log.push('　#挑衅#队友仇恨减半，减少的仇恨已转移至自身。');
        continue;
      }
      if (skillCode === 'healing_prayer') {
        const ally = [...members].filter(item => !item.is_defeated).sort((left, right) => Number(left.current_hp) / Number(left.hp_max) - Number(right.current_hp) / Number(right.hp_max))[0] ?? member;
        const oldHp = Number(ally.current_hp); const amount = Math.max(1, Math.floor(Number(member.magic_attack) * 1.35)); ally.current_hp = Math.min(Number(ally.hp_max), oldHp + amount);
        log.push(`➤【${member.name}】${label}`); log.push(`　➥【${ally.name}】恢复 ${ally.current_hp - oldHp} HP(${oldHp}→${ally.current_hp})`);
        if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', ally, 'member', 'on_cast', log);
        continue;
      }
      if (skillCode === 'blessing_aegis') {
        log.push(`➤【${member.name}】${label}`);
        for (const ally of members.filter(item => !item.is_defeated)) if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', ally, 'member', 'on_cast', []);
        log.push('#护盾#全队获得18.0%生命值护盾(3)');
        continue;
      }
      if (skillCode === 'mana_benediction') {
        log.push(`➤【${member.name}】${label}`);
        for (const ally of members.filter(item => !item.is_defeated)) if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', ally, 'member', 'on_cast', []);
        log.push('#回流#全队每回合恢复5.0%魔力(3)');
        continue;
      }
      if (skillCode === 'war_cry') {
        log.push(`➤【${member.name}】${label}`);
        for (const ally of members.filter(item => !item.is_defeated)) if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', ally, 'member', 'on_cast', []);
        log.push('&战吼&全队物攻、魔攻提高10.0%(2)');
        continue;
      }
      const nextActionEffects = effects.filter(effect => effect.target_kind === 'member' && Number(effect.target_id) === Number(member.id) && (effect.code === 'mist_veil' || effect.code === 'shadow_pierce'));
      const swordSkill = choice.type === 'skill' && damageType === '斩击'; const artifactAction = swordAction || swordSkill;
      if (artifactAction && modifiers.artifact === 'holy_sword') kind = '物理';
      if (artifactAction && modifiers.artifact === 'demon_sword') { kind = '魔法'; attack = (Number(member.magic_attack) + modifiers.magicAttack) * (1 + modifiers.magicAttackPct / 100) * skillScale; }
      const monster = monsterCombatStats(target); const vulnerability = effectValue('target', Number(target.id), 'vulnerability') + effectValue('target', Number(target.id), 'sword_break') + effectValue('target', Number(target.id), 'armor_shatter'); const surge = effectValue('member', Number(member.id), 'demon_surge'); const mistVeil = effectValue('member', Number(member.id), 'mist_veil'); const shadowPierce = effectValue('member', Number(member.id), 'shadow_pierce'); const battleCry = effectValue('member', Number(member.id), 'battle_cry'); const imbalance = effectValue('member', Number(member.id), 'imbalance'); const bind = effectValue('target', Number(target.id), 'bind'); const baseDefense = kind === '魔法' ? monster.magicDefense : monster.physicalDefense; const defense = Math.floor(baseDefense * (1 - (kind === '魔法' ? 0 : Math.min(90, modifiers.ignoreDefensePct + vulnerability)) / 100)); const strike = resolveStrike(attack * power * (1 + surge / 100) * (1 + mistVeil / 100) * (1 + battleCry / 100) * (Number(session.turn_no) === 1 ? 1 + Number(session.opening_damage_bonus) : 1), defense, Number(member.accuracy) * (1 + modifiers.accuracyPct / 100) * (1 - imbalance / 100), monster.evasion * (1 - bind / 100), (Number(member.crit_rate_bp) + modifiers.critRateBp) * (1 + modifiers.critRatePct / 100), monster.critResist, Number(member.crit_damage_bp) * (1 + modifiers.critDamagePct / 100), monster.critReduction, false, shadowPierce > 0);
      log.push(`➤【${member.name}】${label}`); if (nextActionEffects.length) await connection.execute(`DELETE FROM combat_status_effects WHERE id IN (${nextActionEffects.map(() => '?').join(',')})`, nextActionEffects.map(effect => effect.id)); if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', target, 'target', 'on_cast', log); if (!strike.hit) { log.push(`　➥【${targetName(target)}】闪避了攻击`); continue; }
      const physicalMultiplier = kind === '物理' ? physicalWeaknessMultiplier(target, damageType) : 1;
      const elementalMultiplierValue = elementalMultiplier(member.element_mastery_json, target.element_resistance_json, element);
      const damageMultiplier = physicalMultiplier * elementalMultiplierValue;
      const damage = Math.max(1, Math.floor(strike.damage * damageMultiplier * (1 + modifiers.damageBonusPct / 100))); const oldHp = Number(target.current_hp); target.current_hp = Math.max(0, oldHp - damage); if (!target.current_hp) target.is_defeated = 1;
      await connection.execute('UPDATE combat_threat SET threat=threat+? WHERE session_id=? AND spawn_id=? AND character_id=?', [damage, session.combat_id, target.id, member.id]); if (skillCode === 'warrior_taunt') { await connection.execute('UPDATE combat_threat SET threat=threat+600 WHERE session_id=? AND spawn_id=? AND character_id=?', [session.combat_id, target.id, member.id]); log.push('　#挑衅#目标的注意力被莱昂牢牢吸引'); } if (modifiers.lifestealPct && choice.type === 'attack') member.current_hp = Math.min(Number(member.hp_max), Number(member.current_hp) + Math.floor(damage * modifiers.lifestealPct / 100));
      const observer = appraisalForTarget(appraisal, Number(target.level));
      log.push(observer
        ? `　➥${observer.informationLevel >= 4 ? damageMultiplier > 1 ? '[克制]' : damageMultiplier < 1 ? '[抗性]' : '' : ''}${strike.crit ? '[暴击!]' : ''}对【${targetName(target)}】造成 ${damage}点${kind}伤害(${oldHp}→${target.current_hp})`
        : `　➥对【???】造成 ???点${kind}伤害(???→???)`);
      if (artifactAction && modifiers.artifact === 'holy_sword' && strike.crit) await applyArtifactEffect(connection, session.combat_id, 'sword_break', 'target', Number(target.id), log);
      if (artifactAction && modifiers.artifact === 'demon_sword') await applyArtifactEffect(connection, session.combat_id, 'demon_surge', 'member', Number(member.id), log);
      if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', target, 'target', 'on_hit', log);
    } else {
      const monsterTarget = targets.find(item => Number(item.id) === turn.id)!; if (monsterTarget.is_defeated) continue;
      if (resolvedActions > 0) log.splice(logStart, 0, '————');
      resolvedActions += 1;
      if (controlled || monsterTarget.is_defeated) continue;
      const [threatRows] = await connection.execute<(RowDataPacket & { character_id: number; threat: number })[]>('SELECT character_id,threat FROM combat_threat WHERE session_id=? AND spawn_id=? FOR UPDATE', [session.combat_id, monsterTarget.id]); let victim = threatTarget(members, new Map(threatRows.map(row => [Number(row.character_id), Number(row.threat)]))); if (!victim) continue;
      const [templateRows] = await connection.execute<(RowDataPacket & { code: string })[]>('SELECT code FROM monster_templates WHERE id=?', [monsterTarget.template_id]); const isWolfKing = templateRows[0]?.code === 'shadow_wolf_king';
      const sequence = isWolfKing ? ['wolfking_summon_shadow_wolf', 'wolfking_trample', 'wolfking_rending_pounce', 'wolfking_bite', 'wolfking_shadow_curse', 'wolfking_fang_devour'] : stringList(monsterTarget.skill_sequence); const cooldowns = jsonObject(monsterTarget.cooldowns);
      let skill: (RowDataPacket & { id: number; code: string; name: string; category: 'physical' | 'magic'; element: string; power: number; mana_cost: number; cooldown_turns: number }) | undefined;
      if (sequence.length) {
        const placeholders = sequence.map(() => '?').join(',');
        const [skillRows] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; category: 'physical' | 'magic'; element: string; power: number; mana_cost: number; cooldown_turns: number })[]>(`SELECT id,code,name,category,element,power,mana_cost,cooldown_turns FROM skill_definitions WHERE code IN (${placeholders})`, sequence);
        const readySkills = skillRows.filter(candidate => Number(monsterTarget.current_mp) >= Number(candidate.mana_cost) && Number(cooldowns[candidate.code] ?? 0) <= 0);
        skill = readySkills.length ? readySkills[random(0, readySkills.length - 1)] : undefined;
        if (isWolfKing) {
          const [wolfRows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_targets ct
            JOIN monster_spawns s ON s.id=ct.spawn_id
            JOIN monster_templates t ON t.id=s.template_id
            WHERE ct.session_id=? AND ct.is_defeated=0 AND s.defeated_at IS NULL AND t.code='shadow_wolf' LIMIT 1`, [session.combat_id]);
          const wolfAlive = Boolean(wolfRows[0]);
          const lowest = [...members].filter(member => !member.is_defeated).sort((a, b) => Number(a.current_hp) / Number(a.hp_max) - Number(b.current_hp) / Number(b.hp_max))[0];
          const choose = (code: string) => readySkills.find(candidate => candidate.code === code);
          if (Number(monsterTarget.current_hp) / Math.max(1, Number(monsterTarget.hp_max)) < .1) { skill = choose('wolfking_fang_devour'); if (lowest) victim = lowest; }
          else if (Number(monsterTarget.current_hp) / Math.max(1, Number(monsterTarget.hp_max)) < .5 && !cooldowns.wolfking_shadow_curse_used) { skill = choose('wolfking_shadow_curse'); cooldowns.wolfking_shadow_curse_used = 1; }
          else if (lowest && Number(lowest.current_hp) / Math.max(1, Number(lowest.hp_max)) < .25) { skill = choose('wolfking_fang_devour'); victim = lowest; }
          else if (!wolfAlive) { skill = choose('wolfking_summon_shadow_wolf'); if (cooldowns.wolfking_rotation === undefined) cooldowns.wolfking_rotation = 1; }
          else {
            const rotation = ['wolfking_trample', 'wolfking_rending_pounce', 'wolfking_bite']; const index = Math.max(0, Number(cooldowns.wolfking_rotation ?? 1) - 1) % rotation.length;
            skill = choose(rotation[index]) ?? skill; cooldowns.wolfking_rotation = index + 2 > rotation.length ? 1 : index + 2;
          }
        }
      }
      if (skill?.code === 'wolfking_summon_shadow_wolf') {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const count = await summonShadowWolves(connection, session.combat_id, monsterTarget, members); log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」`); log.push(`　➥影幕翻涌，${count}只影狼加入了战斗。`); continue;
      }
      if (skill?.code === 'wolfking_shadow_curse') {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const monster = monsterCombatStats(monsterTarget); const oldHp = Number(monsterTarget.current_hp); const amount = Math.floor((monster.hpMax - oldHp) * .5); monsterTarget.current_hp = Math.min(monster.hpMax, oldHp + amount);
        await connection.execute(`INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns) VALUES (?, 'target', ?, (SELECT id FROM effect_definitions WHERE code='shadow_curse'), 1, 100, 3)`, [session.combat_id, monsterTarget.id]);
        log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」`); log.push(`　#影咒#恢复 ${amount} HP(${oldHp}→${monsterTarget.current_hp})`); log.push('　#影咒#命中、闪避+100.0%，双攻双防+25.0%(3)'); continue;
      }
      if (skill) { monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns; }
      const multiplier = Number(skill?.power ?? 100) / 100; const monster = monsterCombatStats(monsterTarget); const bite = skill?.code === 'bite';
      const monsterAttack = skill?.category === 'magic' ? monster.magicAttack : monster.physicalAttack; const victimModifiers = await modifiersFor(connection, Number(victim.id)); const victimDefense = (skill?.category === 'magic' ? Number(victim.magic_defense) * (1 + victimModifiers.magicDefensePct / 100) : Number(victim.physical_defense) * (1 + victimModifiers.physicalDefensePct / 100));
      const curse = effectValue('target', Number(monsterTarget.id), 'shadow_curse'); const mistVeil = effectValue('target', Number(monsterTarget.id), 'mist_veil'); const shadowPierce = effectValue('target', Number(monsterTarget.id), 'shadow_pierce'); const nextActionEffects = effects.filter(effect => effect.target_kind === 'target' && Number(effect.target_id) === Number(monsterTarget.id) && (effect.code === 'mist_veil' || effect.code === 'shadow_pierce')); const imbalance = effectValue('member', Number(victim.id), 'imbalance'); const bind = effectValue('member', Number(victim.id), 'bind'); const fang = skill?.code === 'wolfking_fang_devour'; const pounce = skill?.code === 'wolfking_rending_pounce';
      const resolveMonsterStrike = () => resolveStrike(monsterAttack * multiplier * (1 + curse / 400) * (1 + mistVeil / 100), victimDefense * (1 - curse / 400), monster.accuracy * (1 + curse / 100), Number(victim.evasion) * (1 - imbalance / 100) * (1 - bind / 100), monster.crit + (bite ? 500 : 0), Number(victim.crit_resist_bp), monster.critDamage, Number(victim.crit_damage_reduction_bp), false, fang || shadowPierce > 0);
      const identifiedMonster = Boolean(appraisalForTarget(appraisal, Number(monsterTarget.level)));
      log.push(`➤【${targetName(monsterTarget)}】${skill ? `释放技能「${identifiedMonster ? skill.name : '???'}」` : '普通攻击'}`);
      if (nextActionEffects.length) await connection.execute(`DELETE FROM combat_status_effects WHERE id IN (${nextActionEffects.map(() => '?').join(',')})`, nextActionEffects.map(effect => effect.id));
      if (skill) await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', victim, 'member', 'on_cast', log);
      if (pounce) log.push('$连击$疾速三连击！');
      if (fang) log.push('$利齿$该攻击必定暴击。');
      if (bite) log.push('　#獠牙#该攻击暴击+25.0%');
      if (pounce) {
        for (let index = 0; index < 3 && !victim.is_defeated; index += 1) {
          const strike = resolveMonsterStrike();
          if (!strike.hit) { log.push(`　➥【${victim.name}】闪避了攻击`); continue; }
          const barrier = effectValue('member', Number(victim.id), 'barrier'); const guard = effectValue('member', Number(victim.id), 'shield_guard'); const elemental = elementalMultiplier(monsterTarget.element_mastery_json, victim.element_resistance_json, String(skill?.element ?? '')); const damage = Math.max(1, Math.floor(strike.damage * elemental * (1 - Math.min(80, barrier) / 100) * (1 - Math.min(90, guard) / 100)));
          const oldHp = Number(victim.current_hp); victim.current_hp = Math.max(0, oldHp - damage); if (!victim.current_hp) victim.is_defeated = 1;
          log.push(`　➥${strike.crit ? '[暴击!]' : ''}对【${victim.name}】造成 ${damage} 点${skill?.category === 'magic' ? '魔法' : '物理'}伤害(${oldHp}→${victim.current_hp})`);
          if (skill) await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', victim, 'member', 'on_hit', log);
        }
        continue;
      }
      const strike = resolveMonsterStrike();
      if (!strike.hit) { log.push(`　➥【${victim.name}】闪避了攻击`); continue; }
      const barrier = effectValue('member', Number(victim.id), 'barrier'); const guard = effectValue('member', Number(victim.id), 'shield_guard'); const elemental = elementalMultiplier(monsterTarget.element_mastery_json, victim.element_resistance_json, String(skill?.element ?? '')); const damage = Math.max(1, Math.floor(strike.damage * elemental * (1 - Math.min(80, barrier) / 100) * (1 - Math.min(90, guard) / 100)));
      const affected = skill?.code === 'wolfking_trample' ? members.filter(member => !member.is_defeated) : [victim];
      for (const affectedVictim of affected) { const oldHp = Number(affectedVictim.current_hp); const dealt = damage; affectedVictim.current_hp = Math.max(0, oldHp - dealt); if (!affectedVictim.current_hp) affectedVictim.is_defeated = 1; log.push(`　➥${strike.crit || fang ? '[暴击!]' : ''}对【${affectedVictim.name}】造成 ${dealt} 点${skill?.category === 'magic' ? '魔法' : '物理'}伤害(${oldHp}→${affectedVictim.current_hp})`); if (skill) await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', affectedVictim, 'member', 'on_hit', log); }
    }
  }
  for (const target of targets) {
    const cooldowns = jsonObject(target.cooldowns); for (const [code, turns] of Object.entries(cooldowns)) {
      if (code === 'wolfking_rotation' || code === 'wolfking_shadow_curse_used') continue;
      cooldowns[code] = Math.max(0, Number(turns) - 1);
    }
    await connection.execute('UPDATE monster_spawns SET current_hp=?,defeated_at=IF(?,NOW(),defeated_at) WHERE id=?', [target.current_hp, target.is_defeated ? 1 : 0, target.id]);
    await connection.execute('UPDATE combat_targets SET current_mp=?,cooldowns=?,is_defeated=? WHERE session_id=? AND spawn_id=?', [target.current_mp, JSON.stringify(cooldowns), target.is_defeated ? 1 : 0, session.combat_id, target.id]);
  }
  for (const target of targets) if (!canAppraiseTarget(appraisal, Number(target.level))) for (let index = 0; index < log.length; index += 1) {
    if (!log[index].includes(target.name)) continue;
    log[index] = log[index].replaceAll(target.name, '???').replace(/(损失|恢复) \d+ HP\(\d+→\d+\)/g, '$1 ??? HP(???→???)');
  }
  for (const member of members) {
    const cooldowns = jsonObject(member.cooldowns); for (const [code, turns] of Object.entries(cooldowns)) cooldowns[code] = Math.max(0, Number(turns) - 1);
    await connection.execute('UPDATE combat_members SET current_hp=?,current_mp=?,cooldowns=?,is_defeated=?,pending_action=NULL WHERE session_id=? AND character_id=?', [member.current_hp, member.current_mp, JSON.stringify(cooldowns), member.is_defeated ? 1 : 0, session.combat_id, member.id]);
  }
  if (aliveMembers.every(member => (jsonObject(member.pending_action) as unknown as PendingAction).type === 'escape')) { await connection.execute('UPDATE combat_sessions SET state=\'escaped\' WHERE id=?', [session.combat_id]); await clearSummonedTargets(connection, session.combat_id); await restoreLivingCombatTargets(connection, session.combat_id, targets); if (targets.length) await connection.execute(`UPDATE combat_ambushes SET status='ready' WHERE status='waiting' AND spawn_id IN (${targets.map(() => '?').join(',')})`, targets.map(target => target.id)); await persistBattleMembers(connection, members); await consumeBattleBuffs(connection, members); for (const member of members) await connection.execute('INSERT INTO encounter_escape_tokens (character_id,region_id,pos_x,pos_y,pos_z) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE region_id=VALUES(region_id),pos_x=VALUES(pos_x),pos_y=VALUES(pos_y),pos_z=VALUES(pos_z)', [member.id, member.current_region_id, member.pos_x, member.pos_y, member.pos_z]); return { ended: true, waiting: false, log: `${log.join('\n')}\n\n队伍一同撤离了战斗。` }; }
  if (targets.every(target => target.is_defeated)) { const settlement = await finishPartyVictory(connection, session.combat_id, members, targets); await persistBattleMembers(connection, members); return { ended: true, waiting: false, log: log.join('\n'), settlement }; }
  if (members.every(member => member.is_defeated)) { await connection.execute('UPDATE combat_sessions SET state=\'defeat\' WHERE id=?', [session.combat_id]); await clearSummonedTargets(connection, session.combat_id); await restoreLivingCombatTargets(connection, session.combat_id, targets); if (targets.length) await connection.execute(`UPDATE combat_ambushes SET status='ready' WHERE status='waiting' AND spawn_id IN (${targets.map(() => '?').join(',')})`, targets.map(target => target.id)); for (const member of members) if (!member.npc_code) { const [immunity] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_battle_buffs WHERE character_id=? AND buff_code='minor_experience_elixir' AND remaining_battles>0 LIMIT 1`, [member.id]); if (!immunity[0]) await connection.execute('UPDATE characters SET experience=GREATEST(0,experience-10) WHERE id=?', [member.id]); } await persistBattleMembers(connection, members, true); await consumeBattleBuffs(connection, members); return { ended: true, waiting: false, log: log.join('\n'), settlement: '战败结算\n队伍战败，生命仅余1点并开始休息。经验秘药生效的成员不会损失经验。' }; }
  await connection.execute('UPDATE combat_sessions SET turn_no=turn_no+1 WHERE id=?', [session.combat_id]); return { ended: false, waiting: false, log: log.join('\n') };
});

export const createParty = async (qqUserId: string, name?: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [existing] = await connection.execute<RowDataPacket[]>('SELECT party_id FROM party_members WHERE character_id=? FOR UPDATE', [character.id]);
  if (existing.length) throw new Error('你已经在一个队伍中。');
  const id = randomUUID();
  await connection.execute('INSERT INTO parties (id,name,leader_character_id) VALUES (?,?,?)', [id, String(name ?? `${character.name}的队伍`).trim().slice(0, 32) || `${character.name}的队伍`, character.id]);
  await connection.execute('INSERT INTO party_members (party_id,character_id) VALUES (?,?)', [id, character.id]);
  return id;
});

export const joinParty = async (qqUserId: string, leaderQqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [own] = await connection.execute<RowDataPacket[]>('SELECT party_id FROM party_members WHERE character_id=? FOR UPDATE', [character.id]);
  if (own.length) throw new Error('你已经在一个队伍中。');
  const byPartyId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(leaderQqUserId);
  const [leaders] = await connection.execute<(RowDataPacket & { party_id: string; pos_x: number; pos_y: number; pos_z: number })[]>(byPartyId
    ? 'SELECT p.id AS party_id,c.pos_x,c.pos_y,c.pos_z FROM parties p JOIN characters c ON c.id=p.leader_character_id WHERE p.id=? FOR UPDATE'
    : 'SELECT pm.party_id,c.pos_x,c.pos_y,c.pos_z FROM players p JOIN characters c ON c.player_id=p.id JOIN party_members pm ON pm.character_id=c.id JOIN parties pt ON pt.id=pm.party_id AND pt.leader_character_id=c.id WHERE p.qq_user_id=? FOR UPDATE', [leaderQqUserId]);
  if (!leaders[0]) throw new Error('未找到该队长的队伍。');
  const [count] = await connection.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM party_members WHERE party_id=?', [leaders[0].party_id]);
  if (Number(count[0].total) >= 4) throw new Error('队伍已满（最多 4 人）。');
  await connection.execute('INSERT INTO party_members (party_id,character_id) VALUES (?,?)', [leaders[0].party_id, character.id]);
  await connection.execute('UPDATE characters SET pos_x=?,pos_y=?,pos_z=? WHERE id=?', [leaders[0].pos_x, leaders[0].pos_y, leaders[0].pos_z, character.id]);
  return Number(count[0].total) + 1;
});

export const leaveParty = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); const [rows] = await connection.execute<(RowDataPacket & { party_id: string; leader_character_id: number })[]>('SELECT pm.party_id,p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=? FOR UPDATE', [character.id]); const party = rows[0];
  if (!party) throw new Error('你不在任何队伍中。');
  if (Number(party.leader_character_id) === Number(character.id)) { const [members] = await connection.execute<(RowDataPacket & { character_id: number })[]>('SELECT character_id FROM party_members WHERE party_id=? AND character_id<>? ORDER BY joined_at,character_id FOR UPDATE', [party.party_id, character.id]); if (members[0]) await connection.execute('UPDATE parties SET leader_character_id=? WHERE id=?', [members[0].character_id, party.party_id]); }
  await connection.execute('DELETE FROM party_members WHERE party_id=? AND character_id=?', [party.party_id, character.id]);
  await connection.execute('DELETE FROM parties WHERE id=? AND NOT EXISTS (SELECT 1 FROM party_members WHERE party_id=?)', [party.party_id, party.party_id]);
});

export const renameParty = async (qqUserId: string, name: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); const [rows] = await connection.execute<(RowDataPacket & { party_id: string; leader_character_id: number })[]>('SELECT pm.party_id,p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=? FOR UPDATE', [character.id]); if (!rows[0]) throw new Error('你不在任何队伍中。'); if (Number(rows[0].leader_character_id) !== Number(character.id)) throw new Error('只有队长可以修改队伍名。'); const value = name.trim().slice(0, 32); if (!value) throw new Error('队伍名不能为空。'); await connection.execute('UPDATE parties SET name=? WHERE id=?', [value, rows[0].party_id]);
});

export const transferPartyLeader = async (qqUserId: string, targetGameId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); const [rows] = await connection.execute<(RowDataPacket & { party_id: string; leader_character_id: number })[]>('SELECT pm.party_id,p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=? FOR UPDATE', [character.id]); if (!rows[0]) throw new Error('你不在任何队伍中。'); if (Number(rows[0].leader_character_id) !== Number(character.id)) throw new Error('只有队长可以委任队长。'); const [members] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT c.id FROM party_members pm JOIN characters c ON c.id=pm.character_id WHERE pm.party_id=? AND c.game_id=? FOR UPDATE', [rows[0].party_id, targetGameId]); if (!members[0]) throw new Error('该玩家不在你的队伍中。'); await connection.execute('UPDATE parties SET leader_character_id=? WHERE id=?', [members[0].id, rows[0].party_id]);
});

export const partyList = async () => { const pool = await getPool(); const [rows] = await pool.execute<(RowDataPacket & { id: string; name: string; leader_name: string; count: number })[]>('SELECT p.id,p.name,c.name AS leader_name,COUNT(pm.character_id) AS count FROM parties p JOIN characters c ON c.id=p.leader_character_id JOIN party_members pm ON pm.party_id=p.id GROUP BY p.id,p.name,c.name ORDER BY p.created_at DESC LIMIT 20'); return rows.map(row => ({ id: row.id, name: row.name, leaderName: row.leader_name, count: Number(row.count) })); };
export const partyMemberInfo = async (qqUserId: string, gameId: number) => { const character = await characterFor(qqUserId); const pool = await getPool(); const [rows] = await pool.execute<(RowDataPacket & { name: string; game_id: number; level: number; profession: string | null })[]>('SELECT c.name,c.game_id,c.level,p.name AS profession FROM party_members own JOIN party_members member ON member.party_id=own.party_id JOIN characters c ON c.id=member.character_id LEFT JOIN profession_definitions p ON p.code=c.profession_code WHERE own.character_id=? AND c.game_id=? LIMIT 1', [character.id, gameId]); if (!rows[0]) throw new Error('该玩家不在你的队伍中。'); return { name: rows[0].name, gameId: Number(rows[0].game_id), level: Number(rows[0].level), profession: rows[0].profession ?? '未选择' }; };
