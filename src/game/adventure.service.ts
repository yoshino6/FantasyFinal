import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { sortMapMarkers } from './map-marker.service';
import { calculateDerivedStats, experienceRequiredForLevel, realmEnergyDissipationText, realmLevelCap, virtualEquipmentStats, type VirtualEquipmentTier } from './constants';
import { recalculateCharacterStats, refreshCharacterStamina } from './character.service';
import { advanceBountyProgress, refreshBounties } from './bounty.service';
import { attributes, type Allocation } from './types';
import { recordSkillPointChange } from './skill-point-ledger.service';
import { recordOmniscientObservation } from './omniscient.service';
import { closeDungeonForBossSpawns, dungeonArrivalEvent, dungeonCellAt, dungeonEntranceAt, dungeonPlayersInRange } from './dungeon.service';
import { completeDungeonSecretForLeader, discoverDungeonEntrance } from './dungeon-quest.service';
import { collectCityDebts, recordWarrantSighting, settleCityPursuitDefeat } from './pvp.service';
import { detentionMessage } from './time-format';
import { homeRestExperiencePerMinute, homeRestRecoveryBonus, isInHome } from './home.service';

type CharacterRow = RowDataPacket & Allocation & Record<`${keyof Allocation}_growth`, number> & { id: number; player_id: number; npc_code: string | null; name: string; level: number; experience: number; realm_stage: number; skill_points: number; stamina: number; stamina_updated_at: Date; hp_max: number; mp_max: number; current_hp: number; current_mp: number; activity_status: 'active' | 'resting' | 'unconscious' | 'detained'; rest_started_at: Date | null; home_rest_experience_updated_at: Date | null; detained_until: Date | null; physical_attack: number; magic_attack: number; physical_defense: number; magic_defense: number; accuracy: number; evasion: number; crit_rate_bp: number; crit_damage_bp: number; crit_resist_bp: number; crit_damage_reduction_bp: number; tenacity: number; speed: number; perception: number; spirit: number; intelligence: number; element_mastery_json: unknown; element_resistance_json: unknown; adventurer_registered: number; secondary_profession_code: string | null; current_region_id: number; pos_x: number; pos_y: number; pos_z: number; region_name: string };
type MonsterAttributes = Allocation & Record<`${keyof Allocation}_growth`, number>;
type MonsterTrait = { code: string; name: string; attributeMultiplier?: number; statMultiplier?: number; hpPct?: number; mpPct?: number; physicalAttackPct?: number; magicAttackPct?: number; physicalDefensePct?: number; magicDefensePct?: number; accuracyPct?: number; evasionPct?: number; speedPct?: number; critRatePct?: number; critDamagePct?: number; critResistPct?: number; critReductionPct?: number; experiencePct?: number; dropPct?: number };
type SpawnRow = RowDataPacket & MonsterAttributes & { id: number; template_id?: number; name: string; monster_class: string; level: number; current_hp: number; hp_max: number; attack: number; defense: number; speed: number; experience: number; drops_json: unknown; skill_sequence?: unknown; traits_json?: unknown; weakness_json?: unknown; resistance_json?: unknown; element_mastery_json?: unknown; element_resistance_json?: unknown };
type CombatMemberRow = CharacterRow & { current_hp: number; current_mp: number; selected_target_id: number | null; pending_action: unknown; cooldowns: unknown; stamina_eligible: number; is_defeated: number };
type CombatTargetRow = SpawnRow & { current_mp: number; cooldowns: unknown; is_defeated: number };
type PendingAction = { type: 'attack' | 'skill' | 'item' | 'escape'; slot?: number; skillId?: number; itemId?: number };
type CombatRetreatPosition = { regionId: number; x: number; y: number; z: number };
type CombatEffectRow = RowDataPacket & { id: number; target_kind: 'member' | 'target'; target_id: number; code: string; name: string; effect_type: string; value: number; stacks: number; remaining_turns: number };
type CombatModifiers = { weaponName?: string; artifact?: 'holy_sword' | 'demon_sword'; artifacts: string[]; physicalAttack: number; magicAttack: number; physicalAttackPct: number; magicAttackPct: number; physicalDefensePct: number; magicDefensePct: number; critRatePct: number; critDamagePct: number; accuracyPct: number; mpPct: number; chantSpeedPct: number; critRateBp: number; ignoreDefensePct: number; lifestealPct: number; magicDamagePct: number; damageBonusPct: number; manaCostReduction: number; experienceMultiplier: number; dropBonus: number; manaAffinity: boolean; lightSkillBonusPct: number; criticalDamageBonusPct: number; unifyAttack: boolean; prayerHymn: boolean; physicalDamageReductionPct: number; magicDamageReductionPct: number; timeGuard: boolean; pursuitChancePct: number; bloodForMana: boolean; hpRegenPct: number; mpRegenPct: number; minimumHitRatePct: number; actualHitRatePct: number; physicalActualHitRatePct: number; physicalSkillDamagePct: number; magicSkillDamagePct: number; magicChantBonus: number; physicalForceCrit: boolean; physicalCriticalFinalDamagePct: number };
type AppraisalMember = { characterId: number; level: number; rangeLevel: number; informationLevel: number };
type AppraisalProfile = { learned: boolean; rangeLevel: number; informationLevel: number; members: AppraisalMember[] };
export type VictorySettlement = { kind: 'victory'; members: { name: string; experience: number; staminaInsufficient?: boolean; realmLocked?: boolean; realmCapReached?: boolean; levelText?: string; drops: { name: string; quantity: number; itemType: string; codexId: string | null; instanceId?: number }[]; learned: { id: number; name: string }[] }[]; arrivalPending?: boolean; dungeonSecretCompleted?: boolean; pursuitCooldownMinutes?: number };
export type AmbushDelivery = { scope: 'group' | 'c2c'; targetId: string; botId?: string };
export type CombatAmbushHandoff = {
  kind: 'boss' | 'party'; spawnId: number; ambusherCharacterId: number; ambusherQqUserId: string; opponentCharacterId?: number;
  delivery: AmbushDelivery;
};
const monsterAttributeColumns = `${attributes.map(attribute => `COALESCE(s.${attribute},t.${attribute}) AS ${attribute},t.${attribute}_growth`).join(',')}`;
const templateMonsterAttributeColumns = `${attributes.map(attribute => `t.${attribute},t.${attribute}_growth`).join(',')}`;
const lowMonsterTraits: MonsterTrait[] = [
  { code: 'fierce', name: '凶猛的', physicalAttackPct: 10 }, { code: 'sturdy', name: '坚韧的', hpPct: 10 },
  { code: 'keen', name: '敏锐的', accuracyPct: 10 }, { code: 'nimble', name: '灵巧的', evasionPct: 10, speedPct: 5 },
  { code: 'arcane', name: '魔蕴的', magicAttackPct: 10 }, { code: 'hardhide', name: '硬皮的', physicalDefensePct: 10 }
];
const traitList = (value: unknown) => jsonArray(value).map(item => jsonObject(item) as unknown as MonsterTrait).filter(trait => trait.code && trait.name);
const isSummonedMonster = (monster: { traits_json?: unknown }) => traitList(monster.traits_json).some(trait => trait.code === 'summoned');
const cityPursuitTrait = (monster: { traits_json?: unknown }) => jsonArray(monster.traits_json).map(jsonObject).find(trait => trait.code === 'city_pursuit');
const isCityPursuit = (monster: { traits_json?: unknown }) => Boolean(cityPursuitTrait(monster));
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
  const baseStats = calculateDerivedStats(values);
  const monsterClass = String((monster as SpawnRow).monster_class ?? 'normal');
  const tier: VirtualEquipmentTier = monsterClass === 'large' || monsterClass === 'elite' || monsterClass === 'boss' ? monsterClass : 'normal';
  // 虚拟装备先并入词条前的派生属性；随后仍由已有怪物词条、Boss 生命倍率等规则修正。
  const virtual = virtualEquipmentStats(Number(monster.level), tier, baseStats.physicalAttack, baseStats.magicAttack);
  const stats = {
    ...baseStats,
    physicalAttack: baseStats.physicalAttack + virtual.physicalAttack,
    magicAttack: baseStats.magicAttack + virtual.magicAttack,
    physicalDefense: baseStats.physicalDefense + virtual.physicalDefense,
    magicDefense: baseStats.magicDefense + virtual.magicDefense
  };
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
  if (gainedPoints > 0) await recordSkillPointChange(connection, character.id, gainedPoints, 'level_up', null, `角色升至 Lv.${level}`);
  return { experience: gainedExperience, level, gainedPoints, realmLocked, realmCapReached };
};
export const settleHomeRestExperience = async (connection: PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & Pick<CharacterRow, 'id' | 'level' | 'experience' | 'realm_stage' | 'activity_status' | 'home_rest_experience_updated_at'>)[]>(`SELECT c.id,c.level,c.experience,c.realm_stage,c.activity_status,c.home_rest_experience_updated_at
    FROM characters c JOIN player_home_visits v ON v.character_id=c.id
    WHERE c.id=? AND c.activity_status='resting' FOR UPDATE`, [characterId]);
  const character = rows[0];
  if (!character) return { experience: 0, minutes: 0, perMinute: 0, level: 0, gainedPoints: 0, realmLocked: false, realmCapReached: false };
  const perMinute = await homeRestExperiencePerMinute(connection, Number(character.id));
  const now = Date.now(); const checkpoint = character.home_rest_experience_updated_at ? new Date(character.home_rest_experience_updated_at).getTime() : now;
  const minutes = Math.max(0, Math.floor((now - checkpoint) / 60_000));
  if (!minutes || !perMinute) {
    if (!character.home_rest_experience_updated_at || !perMinute) await connection.execute('UPDATE characters SET home_rest_experience_updated_at=? WHERE id=?', [new Date(now), character.id]);
    return { experience: 0, minutes: 0, perMinute, level: Number(character.level), gainedPoints: 0, realmLocked: false, realmCapReached: false };
  }
  const gain = await awardRealmExperience(connection, character, minutes * perMinute);
  if (gain.gainedPoints) await recalculateCharacterStats(connection, Number(character.id));
  await connection.execute('UPDATE characters SET home_rest_experience_updated_at=? WHERE id=?', [new Date(checkpoint + minutes * 60_000), character.id]);
  return { ...gain, minutes, perMinute };
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
const bossSpawnChanceByCode: Record<string, number> = { forest_slime: .75, shadow_wolf_king: .5 };
const randomMonsterTraits = (template?: { code?: string }) => {
  if (template?.code === 'shadow_wolf_king' || template?.code === 'forest_slime') {
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

const characterFor = async (qqUserId: string, connection?: PoolConnection): Promise<CharacterRow> => {
  const pool = connection ?? await getPool(); const [rows] = await pool.execute<CharacterRow[]>(`SELECT c.*, r.name AS region_name FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id WHERE p.qq_user_id=? LIMIT 1`, [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  const character = rows[0];
  if (character.activity_status === 'detained' && character.detained_until && new Date(character.detained_until).getTime() <= Date.now()) {
    character.activity_status = 'active'; character.detained_until = null;
    await pool.execute('UPDATE characters SET activity_status=\'active\',detained_until=NULL WHERE id=?', [character.id]);
  }
  let continuesHomeResting = false;
  if (connection && character.activity_status === 'resting') {
    const homeExperience = await settleHomeRestExperience(connection, Number(character.id));
    continuesHomeResting = homeExperience.perMinute > 0;
    if (homeExperience.minutes) { character.level = homeExperience.level; character.experience += homeExperience.experience; }
  }
  if ((character.activity_status === 'resting' || character.activity_status === 'unconscious') && character.rest_started_at) {
    const seconds = Math.floor((Date.now() - new Date(character.rest_started_at).getTime()) / 1000);
    if (seconds > 0) {
      const recoveryMultiplier = 1 + await homeRestRecoveryBonus(pool, Number(character.id)) / 100;
      character.current_hp = Math.min(Number(character.hp_max), Number(character.current_hp) + Math.max(1, Math.ceil(Number(character.hp_max) / 100 * recoveryMultiplier)) * seconds);
      character.current_mp = Math.min(Number(character.mp_max), Number(character.current_mp) + Math.max(1, Math.ceil(Number(character.mp_max) / 100 * recoveryMultiplier)) * seconds);
      if (character.current_hp >= Number(character.hp_max) && character.current_mp >= Number(character.mp_max) && !continuesHomeResting) { character.activity_status = 'active'; character.rest_started_at = null; character.home_rest_experience_updated_at = null; }
      else character.rest_started_at = new Date();
      await pool.execute('UPDATE characters SET current_hp=?,current_mp=?,activity_status=?,rest_started_at=?,home_rest_experience_updated_at=? WHERE id=?', [character.current_hp, character.current_mp, character.activity_status, character.rest_started_at, character.home_rest_experience_updated_at, character.id]);
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
  if (character.activity_status === 'detained') throw new Error(detentionMessage(character.detained_until));
  if (character.activity_status === 'unconscious') throw new Error('你已经昏迷，请等待生命与魔力恢复至满值。');
  if (character.activity_status === 'resting') throw new Error('你正在休息，请先切换至行动。');
};

export const startRest = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId, connection); const [combat] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state=\'active\' LIMIT 1 FOR UPDATE', [character.id]);
  if (combat[0]) throw new Error('战斗中无法休息。');
  if (character.activity_status === 'detained') throw new Error(detentionMessage(character.detained_until));
  const homeExperiencePerMinute = await homeRestExperiencePerMinute(connection, Number(character.id));
  if (Number(character.current_hp) >= Number(character.hp_max) && Number(character.current_mp) >= Number(character.mp_max) && !homeExperiencePerMinute) return { resting: false, message: '当前生命与魔力均已满，无需休息。' };
  const homeBonus = await homeRestRecoveryBonus(connection, Number(character.id));
  await connection.execute('UPDATE characters SET activity_status=\'resting\',rest_started_at=NOW(),home_rest_experience_updated_at=? WHERE id=?', [homeExperiencePerMinute ? new Date() : null, character.id]);
  return { resting: true, message: `你开始休息，每秒恢复 ${1 + homeBonus / 100}% 的生命与魔力。` };
});

export const resumeAction = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId, connection);
  if (character.activity_status === 'detained') throw new Error(detentionMessage(character.detained_until));
  if (character.activity_status === 'unconscious') throw new Error('你已经昏迷，请等待生命与魔力恢复至满值。');
  if (character.activity_status === 'resting') {
    await connection.execute('UPDATE characters SET activity_status=\'active\',rest_started_at=NULL,home_rest_experience_updated_at=NULL WHERE id=?', [character.id]);
    return { message: '你结束休息，可以继续行动。' };
  }
  return { message: '你可以继续行动。' };
});

const hasPassiveSkill = async (connection: Pool | PoolConnection, characterId: number, code: string) => {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id
    WHERE ps.character_id=? AND s.code=? AND (s.category='bound' OR (s.category='passive' AND ps.passive_linked=1)) LIMIT 1`, [characterId, code]);
  return Boolean(rows[0]);
};

const appraisalProfileFor = async (connection: Pool | PoolConnection, characterIds: number[]): Promise<AppraisalProfile> => {
  if (!characterIds.length) return { learned: false, rangeLevel: 0, informationLevel: 0, members: [] };
  const placeholders = characterIds.map(() => '?').join(',');
  const [rows] = await connection.execute<(RowDataPacket & { character_id: number; level: number; range_level: number; information_level: number })[]>(`SELECT ps.character_id,c.level,COALESCE(ap.range_level,1) AS range_level,COALESCE(ap.information_level,1) AS information_level
    FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id JOIN characters c ON c.id=ps.character_id
    LEFT JOIN player_appraisal_progress ap ON ap.character_id=ps.character_id
    WHERE s.code='appraisal' AND (s.category='bound' OR ps.passive_linked=1) AND ps.character_id IN (${placeholders})`, characterIds);
  const membersByCharacter = new Map(rows.map(row => [Number(row.character_id), { characterId: Number(row.character_id), level: Number(row.level), rangeLevel: Number(row.range_level), informationLevel: Number(row.information_level) }]));
  const [omniscientRows] = await connection.execute<(RowDataPacket & { character_id: number; level: number; profession_level: number })[]>(`SELECT c.id AS character_id,c.level,sp.level AS profession_level FROM characters c
    JOIN player_secondary_professions sp ON sp.character_id=c.id AND sp.profession_code='omniscient'
    WHERE c.secondary_profession_code='omniscient' AND c.id IN (${placeholders})`, characterIds);
  for (const row of omniscientRows) {
    const characterId = Number(row.character_id); const current = membersByCharacter.get(characterId);
    const professionLevel = Math.max(1, Number(row.profession_level)); const informationBonus = Math.min(4, professionLevel); const rangeBonus = professionLevel + (informationBonus >= 4 ? 1 : 0);
    membersByCharacter.set(characterId, { characterId, level: Number(row.level), rangeLevel: Math.max(current?.rangeLevel ?? 0, rangeBonus), informationLevel: Math.max(current?.informationLevel ?? 0, informationBonus) });
  }
  const members = [...membersByCharacter.values()];
  return { learned: members.length > 0, rangeLevel: Math.max(0, ...members.map(member => member.rangeLevel)), informationLevel: Math.max(0, ...members.map(member => member.informationLevel)), members };
};

const appraisalForTarget = (profile: AppraisalProfile, targetLevel: number) => profile.members
  .filter(member => targetLevel <= member.level + member.rangeLevel * 3)
  .sort((left, right) => right.informationLevel - left.informationLevel || right.rangeLevel - left.rangeLevel || right.level - left.level)[0];
const canAppraiseTarget = (profile: AppraisalProfile, targetLevel: number) => Boolean(appraisalForTarget(profile, targetLevel));

const modifiersFor = async (connection: PoolConnection, characterId: number): Promise<CombatModifiers> => {
  const [equippedRows] = await connection.execute<(RowDataPacket & { name: string | null; effect_json: string | null; weapon_type: string | null; slot: string; quality: number })[]>(`SELECT i.name,i.weapon_type,pe.slot,COALESCE(ii.effect_json,i.effect_json) AS effect_json,COALESCE(ii.quality,100) AS quality FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id WHERE pe.character_id=?`, [characterId]);
  const [deviceRows] = await connection.execute<(RowDataPacket & { name: string | null; effect_json: string | null; weapon_type: string | null; slot: string; quality: number })[]>(`SELECT i.name,i.weapon_type,'device' AS slot,COALESCE(ii.effect_json,i.effect_json) AS effect_json,COALESCE(ii.quality,100) AS quality FROM player_active_devices ad JOIN player_item_instances ii ON ii.id=ad.instance_id AND ii.character_id=ad.character_id JOIN item_definitions i ON i.id=ii.item_id WHERE ad.character_id=? AND i.item_category='异械'`, [characterId]);
  const rows = [...equippedRows, ...deviceRows];
  const [passiveRows] = await connection.execute<(RowDataPacket & { id: number; code: string; passive_effect_json: unknown })[]>(`SELECT s.id,s.code,s.passive_effect_json FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND (s.category='bound' OR (s.category='passive' AND ps.passive_linked=1))`, [characterId]);
  const [specializationRows] = await connection.execute<(RowDataPacket & { skill_id: number; specialization: string; level: number })[]>('SELECT skill_id,specialization,level FROM player_skill_specializations WHERE character_id=?', [characterId]);
  const [battleBuffs] = await connection.execute<(RowDataPacket & { buff_code: string })[]>('SELECT buff_code FROM player_battle_buffs WHERE character_id=? AND remaining_battles>0', [characterId]);
  const [timedBuffs] = await connection.execute<(RowDataPacket & { experience_multiplier: number })[]>(`SELECT experience_multiplier FROM player_timed_buffs WHERE character_id=? AND buff_code='church_blessing' AND expires_at>NOW() LIMIT 1`, [characterId]);
  const effect = jsonObject(rows.find(row => row.slot === 'weapon')?.effect_json);
  const passives = new Map(passiveRows.map(row => [row.code, jsonObject(row.passive_effect_json)]));
  const growth = passives.get('growth_blessing'); const lucky = passives.get('lucky_favor'); const mana = passives.get('mana_affinity');
  const mastery = (key: string) => passiveRows.reduce((result, row) => { const passive = jsonObject(row.passive_effect_json); const type = String(passive.weaponType ?? ''); const matched = rows.find(item => item.weapon_type === type); if (!matched) return result; const proficiency = Math.min(5, Math.max(1, Number(specializationRows.find(item => Number(item.skill_id) === Number(row.id) && item.specialization === 'overcharge')?.level ?? 1))); const focus = Math.min(6, Math.max(1, Number(specializationRows.find(item => Number(item.skill_id) === Number(row.id) && item.specialization === 'instant')?.level ?? 1))); const scale = matched.slot === 'offhand' ? .5 + (focus - 1) * .1 : 1; return result + Number(passive[key] ?? 0) * proficiency * scale; }, 0);
  const equipmentEffect = (key: string) => rows.reduce((total, row) => total + Number(jsonObject(row.effect_json)[key] ?? 0) * (.6 + Math.max(0, Math.min(100, Number(row.quality))) * .004), 0);
  const blessingEffect = (key: string) => passiveRows.reduce((total, row) => {
    const passive = jsonObject(row.passive_effect_json);
    return passive.weaponType ? total : total + Number(passive[key] ?? 0);
  }, 0);
  const damageBonusPct = equipmentEffect('damageBonusPct') + blessingEffect('damageBonusPct');
  const experienceElixir = battleBuffs.some(buff => buff.buff_code === 'minor_experience_elixir');
  const artifacts = rows.map(row => String(jsonObject(row.effect_json).artifact ?? '')).filter(Boolean);
  return { weaponName: rows.find(row => row.slot === 'weapon')?.name ?? undefined, artifact: effect.artifact === 'holy_sword' || effect.artifact === 'demon_sword' ? effect.artifact : undefined, artifacts, physicalAttack: 0, magicAttack: 0, physicalAttackPct: mastery('physicalAttackPct'), magicAttackPct: mastery('magicAttackPct'), physicalDefensePct: mastery('physicalDefensePct'), magicDefensePct: mastery('magicDefensePct'), critRatePct: mastery('critRatePct') + blessingEffect('critRatePct'), critDamagePct: mastery('critDamagePct'), accuracyPct: blessingEffect('accuracyPct'), mpPct: mastery('mpPct'), chantSpeedPct: mastery('chantSpeedPct'), critRateBp: 0, ignoreDefensePct: equipmentEffect('ignoreDefensePct'), lifestealPct: equipmentEffect('lifestealPct') + blessingEffect('lifestealPct'), magicDamagePct: equipmentEffect('magicDamagePct') + blessingEffect('magicDamagePct'), damageBonusPct, manaCostReduction: equipmentEffect('manaCostReduction'), experienceMultiplier: Number(growth?.experienceMultiplier ?? 1) * (experienceElixir ? 1.25 : 1) * Number(timedBuffs[0]?.experience_multiplier ?? 1), dropBonus: (Number(lucky?.dropBonusPct ?? 0) + blessingEffect('dropBonusPct')) / 100, manaAffinity: Boolean(mana), lightSkillBonusPct: equipmentEffect('lightSkillBonusPct'), criticalDamageBonusPct: equipmentEffect('criticalDamageBonusPct'), unifyAttack: artifacts.includes('godfist'), prayerHymn: artifacts.includes('prayer_orb'), physicalDamageReductionPct: equipmentEffect('physicalDamageReductionPct'), magicDamageReductionPct: equipmentEffect('magicDamageReductionPct'), timeGuard: artifacts.includes('time_greaves'), pursuitChancePct: equipmentEffect('pursuitChancePct'), bloodForMana: artifacts.includes('fate_bracelet'), hpRegenPct: equipmentEffect('hpRegenPct'), mpRegenPct: equipmentEffect('mpRegenPct'), minimumHitRatePct: equipmentEffect('minimumHitRatePct'), actualHitRatePct: equipmentEffect('actualHitRatePct'), physicalActualHitRatePct: equipmentEffect('physicalActualHitRatePct'), physicalSkillDamagePct: equipmentEffect('physicalSkillDamagePct'), magicSkillDamagePct: equipmentEffect('magicSkillDamagePct'), magicChantBonus: equipmentEffect('magicChantBonus'), physicalForceCrit: rows.some(row => Boolean(jsonObject(row.effect_json).physicalForceCrit)), physicalCriticalFinalDamagePct: equipmentEffect('physicalCriticalFinalDamagePct') };
};
const miningSecondsByCode: Record<string, number> = { living_wood: 15 * 60, meteor_iron: 30 * 60, star_copper: 60 * 60, moon_silver: 90 * 60, sun_gold: 120 * 60 };
const resourceKindByCode = (code: string) => code === 'living_wood' ? '植被' as const : '矿脉' as const;

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
  const [blockedRows] = await pool.execute<(RowDataPacket & { pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pos_x,pos_y,pos_z FROM map_npcs WHERE region_id=? AND pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL
    UNION SELECT pos_x,pos_y,pos_z FROM map_special_objects WHERE region_id=?
    UNION SELECT entrance_x AS pos_x,entrance_y AS pos_y,0 AS pos_z FROM dungeon_instances WHERE state='active' AND entrance_region_id=?`, [region.id, region.id, region.id]);
  const [overlays] = await pool.execute<MapRegionRow[]>('SELECT id,code,name,min_x,max_x,min_y,max_y,min_z,max_z FROM map_regions WHERE danger_level>(SELECT danger_level FROM map_regions WHERE id=?)', [region.id]);
  const overridden = (x: number, y: number, z: number) => overlays.some(area => x >= Number(area.min_x) && x <= Number(area.max_x) && y >= Number(area.min_y) && y <= Number(area.max_y) && z >= Number(area.min_z) && z <= Number(area.max_z));
  const blocked = new Set(blockedRows.map(row => `${row.pos_x},${row.pos_y},${row.pos_z}`)); let x = random(region.min_x, region.max_x); let y = random(region.min_y, region.max_y); const z = random(region.min_z, region.max_z);
  for (let attempt = 0; attempt < 64 && (blocked.has(`${x},${y},${z}`) || overridden(x, y, z)); attempt++) { x = random(region.min_x, region.max_x); y = random(region.min_y, region.max_y); }
  return blocked.has(`${x},${y},${z}`) || overridden(x, y, z) ? null : { x, y, z };
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
    const [overlays] = await pool.execute<MapRegionRow[]>('SELECT id,code,name,min_x,max_x,min_y,max_y,min_z,max_z FROM map_regions WHERE danger_level>(SELECT danger_level FROM map_regions WHERE id=?)', [region.id]);
    const overridden = (x: number, y: number, z: number) => overlays.some(area => x >= Number(area.min_x) && x <= Number(area.max_x) && y >= Number(area.min_y) && y <= Number(area.max_y) && z >= Number(area.min_z) && z <= Number(area.max_z));
  const [allTemplates] = await pool.execute<(RowDataPacket & MonsterAttributes & { id: number; code: string; name: string; level: number; monster_class: string; spawn_weight: number; skill_sequence: unknown })[]>(`SELECT t.id,t.code,t.name,t.level,t.monster_class,t.skill_sequence,p.spawn_weight,${templateMonsterAttributeColumns} FROM map_monster_pools p JOIN monster_templates t ON t.id=p.monster_template_id WHERE p.region_id=?`, [region.id]);
    const bossTemplates = allTemplates.filter(template => template.monster_class === 'boss');
    if (refreshBosses) for (const template of bossTemplates) if (Math.random() < Number(bossSpawnChanceByCode[template.code] ?? 0)) await spawnBoss(pool, region, template);
    const templates = allTemplates.filter(template => template.monster_class !== 'boss');
    if (!templates.length) continue;
    const [blockedRows] = await pool.execute<(RowDataPacket & { pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pos_x,pos_y,pos_z FROM map_npcs WHERE region_id=? AND pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL
      UNION SELECT pos_x,pos_y,pos_z FROM map_special_objects WHERE region_id=?
      UNION SELECT entrance_x AS pos_x,entrance_y AS pos_y,0 AS pos_z FROM dungeon_instances WHERE state='active' AND entrance_region_id=?`, [region.id, region.id, region.id]);
    const blocked = new Set(blockedRows.map(row => `${row.pos_x},${row.pos_y},${row.pos_z}`));
    const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM monster_spawns s
      JOIN monster_templates t ON t.id=s.template_id
      WHERE s.region_id=? AND s.defeated_at IS NULL AND t.monster_class<>'boss'`, [region.id]);
    const area = (region.max_x - region.min_x + 1) * (region.max_y - region.min_y + 1) * (region.max_z - region.min_z + 1) - overlays.reduce((sum, area) => sum + Math.max(0, Math.min(region.max_x, area.max_x) - Math.max(region.min_x, area.min_x) + 1) * Math.max(0, Math.min(region.max_y, area.max_y) - Math.max(region.min_y, area.min_y) + 1) * Math.max(0, Math.min(region.max_z, area.max_z) - Math.max(region.min_z, area.min_z) + 1), 0);
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
      for (let attempt = 0; attempt < 64 && (blocked.has(`${x},${y},${z}`) || overridden(x, y, z)); attempt++) { x = random(region.min_x, region.max_x); y = random(region.min_y, region.max_y); z = random(region.min_z, region.max_z); }
      if (blocked.has(`${x},${y},${z}`) || overridden(x, y, z)) continue;
      const skillPool = stringList(template.skill_sequence); const skills = template.monster_class === 'boss' ? skillPool : randomItems(skillPool, random(0, Math.min(4, skillPool.length))); const traits = randomMonsterTraits(template);
      const level = randomMonsterLevel(template.monster_class, Number(template.level));
      const baseAttributes = randomMonsterBaseAttributes(template);
      const spawned = { ...template, ...baseAttributes, level, traits_json: traits };
      const stats = monsterCombatStats(spawned);
      await pool.execute('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [template.id, region.id, x, y, z, level, baseAttributes.constitution, baseAttributes.spirit, baseAttributes.strength, baseAttributes.intelligence, baseAttributes.agility, baseAttributes.perception, stats.hpMax, JSON.stringify(skills), JSON.stringify(traits)]);
    }
  }
  // 与怪物共用重启/整点的补齐时机。矿点不参与怪物的位置阻挡，因此二者可以重叠。
  const [resourcePools] = await pool.execute<(RowDataPacket & { region_id: number; item_id: number; spawn_density: number; min_x: number; max_x: number; min_y: number; max_y: number; min_z: number; max_z: number })[]>(`SELECT rp.region_id,rp.item_id,rp.spawn_density,r.min_x,r.max_x,r.min_y,r.max_y,r.min_z,r.max_z
    FROM map_resource_pools rp JOIN map_regions r ON r.id=rp.region_id WHERE r.is_spawn_enabled=1`);
  for (const resource of resourcePools) {
    const [overlays] = await pool.execute<MapRegionRow[]>('SELECT id,code,name,min_x,max_x,min_y,max_y,min_z,max_z FROM map_regions WHERE danger_level>(SELECT danger_level FROM map_regions WHERE id=?)', [resource.region_id]);
    const overridden = (x: number, y: number, z: number) => overlays.some(area => x >= Number(area.min_x) && x <= Number(area.max_x) && y >= Number(area.min_y) && y <= Number(area.max_y) && z >= Number(area.min_z) && z <= Number(area.max_z));
    const area = (Number(resource.max_x) - Number(resource.min_x) + 1) * (Number(resource.max_y) - Number(resource.min_y) + 1) * (Number(resource.max_z) - Number(resource.min_z) + 1) - overlays.reduce((sum, area) => sum + Math.max(0, Math.min(Number(resource.max_x), Number(area.max_x)) - Math.max(Number(resource.min_x), Number(area.min_x)) + 1) * Math.max(0, Math.min(Number(resource.max_y), Number(area.max_y)) - Math.max(Number(resource.min_y), Number(area.min_y)) + 1) * Math.max(0, Math.min(Number(resource.max_z), Number(area.max_z)) - Math.max(Number(resource.min_z), Number(area.min_z)) + 1), 0);
    // 极低密度矿种仍至少保留一个补齐目标，避免月银这类 0.001% 矿脉因地图面积取整后永不出现。
    const target = Math.max(1, Math.round(area * Number(resource.spawn_density)));
    const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM resource_spawns WHERE region_id=? AND item_id=? AND mined_at IS NULL', [resource.region_id, resource.item_id]);
    let activeCount = Number(countRows[0]?.total ?? 0);
    if (trimExcess && activeCount > target) {
      const [excessRows] = await pool.execute<(RowDataPacket & { id: number })[]>(`SELECT rs.id FROM resource_spawns rs
        WHERE rs.region_id=? AND rs.item_id=? AND rs.mined_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM player_resource_mining prm WHERE prm.resource_id=rs.id)
        ORDER BY rs.spawned_at ASC LIMIT ?`, [resource.region_id, resource.item_id, activeCount - target]);
      if (excessRows.length) {
        const ids = excessRows.map(row => Number(row.id));
        await pool.execute(`UPDATE resource_spawns SET mined_at=NOW() WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
        activeCount -= ids.length;
      }
    }
    const missing = Math.max(0, target - activeCount);
    if (!missing) continue;
    const [blockedRows] = await pool.execute<(RowDataPacket & { pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pos_x,pos_y,pos_z FROM map_npcs WHERE region_id=? AND pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL
      UNION SELECT pos_x,pos_y,pos_z FROM map_special_objects WHERE region_id=?
      UNION SELECT pos_x,pos_y,pos_z FROM resource_spawns WHERE region_id=? AND mined_at IS NULL`, [resource.region_id, resource.region_id, resource.region_id]);
    const blocked = new Set(blockedRows.map(row => `${row.pos_x},${row.pos_y},${row.pos_z}`));
    for (let i = 0; i < missing; i++) {
      let x = random(Number(resource.min_x), Number(resource.max_x)); let y = random(Number(resource.min_y), Number(resource.max_y)); let z = random(Number(resource.min_z), Number(resource.max_z));
      for (let attempt = 0; attempt < 64 && (blocked.has(`${x},${y},${z}`) || overridden(x, y, z)); attempt++) { x = random(Number(resource.min_x), Number(resource.max_x)); y = random(Number(resource.min_y), Number(resource.max_y)); z = random(Number(resource.min_z), Number(resource.max_z)); }
      if (blocked.has(`${x},${y},${z}`) || overridden(x, y, z)) continue;
      await pool.execute('INSERT INTO resource_spawns (region_id,item_id,pos_x,pos_y,pos_z) VALUES (?,?,?,?,?)', [resource.region_id, resource.item_id, x, y, z]);
      blocked.add(`${x},${y},${z}`);
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
  const [artifactRows] = await pool.execute<(RowDataPacket & { effect_json: unknown })[]>(`SELECT COALESCE(ii.effect_json,i.effect_json) AS effect_json FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id WHERE pe.character_id=?`, [character.id]);
  const artifactEffects = artifactRows.map(row => jsonObject(row.effect_json)); const ignoreWeightPenalty = artifactEffects.some(effect => Boolean(effect.ignoreWeightPenalty)); const moveSpeedBonus = artifactEffects.reduce((total, effect) => total + Number(effect.moveSpeedBonus ?? 0), 0);
  const speedPenalty = ignoreWeightPenalty ? 0 : Math.max(0, rawSpeedPenalty - constitutionOffset);
  const speed = Math.max(1, Number(character.speed) - speedPenalty);
  return { items: rows, weight, capacity: 30, speed, movementSpeed: Math.min(10, movementSpeedFrom(finalAttribute(character, 'agility'), Number(character.level), speedPenalty) + moveSpeedBonus), speedPenalty, rawSpeedPenalty, constitutionOffset };
};

/** 当前步长独立于属性计算出的移速上限；旧角色首次读取时默认为 1 格。 */
export const movementProfile = async (qqUserId: string) => {
  const [character, bag] = await Promise.all([characterFor(qqUserId), inventory(qqUserId)]);
  const pool = await getPool();
  await pool.execute('INSERT IGNORE INTO player_movement_settings (character_id,movement_step) VALUES (?,1)', [character.id]);
  const [rows] = await pool.execute<(RowDataPacket & { movement_step: number; show_landmarks: number; show_players: number })[]>('SELECT movement_step,show_landmarks,show_players FROM player_movement_settings WHERE character_id=? LIMIT 1', [character.id]);
  const maximum = Math.max(1, Number(bag.movementSpeed));
  return { step: Math.min(maximum, Math.max(1, Number(rows[0]?.movement_step ?? 1))), maximum, showLandmarks: Number(rows[0]?.show_landmarks ?? 1) !== 0, showPlayers: Number(rows[0]?.show_players ?? 1) !== 0 };
};

/** 地图标识仅影响操作面板显示，不影响地图与坐标前往。 */
export const setMapLandmarksVisible = async (qqUserId: string, visible: boolean) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  await pool.execute(`INSERT INTO player_movement_settings (character_id,movement_step,show_landmarks) VALUES (?,1,?)
    ON DUPLICATE KEY UPDATE show_landmarks=VALUES(show_landmarks)`, [character.id, visible ? 1 : 0]);
  return movementProfile(qqUserId);
};

/** 感知列表中的玩家显示只影响界面，不影响玩家所在位置与互动规则。 */
export const setNearbyPlayersVisible = async (qqUserId: string, visible: boolean) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  await pool.execute(`INSERT INTO player_movement_settings (character_id,movement_step,show_players) VALUES (?,1,?)
    ON DUPLICATE KEY UPDATE show_players=VALUES(show_players)`, [character.id, visible ? 1 : 0]);
  return movementProfile(qqUserId);
};

export const adjustMovementStep = async (qqUserId: string, requestedStep: number) => {
  if (!Number.isInteger(requestedStep) || requestedStep < 1) throw new Error('移动距离必须是不小于 1 的整数。');
  const profile = await movementProfile(qqUserId);
  if (requestedStep > profile.maximum) throw new Error(`当前移动速度上限为 ${profile.maximum}，不能调整到 ${requestedStep} 格。`);
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  await pool.execute('INSERT INTO player_movement_settings (character_id,movement_step) VALUES (?,?) ON DUPLICATE KEY UPDATE movement_step=VALUES(movement_step)', [character.id, requestedStep]);
  return { step: requestedStep, maximum: profile.maximum };
};

export const inventoryView = async (qqUserId: string, category?: '装备' | '道具' | '材料') => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  await pool.execute(`INSERT IGNORE INTO player_item_codex (character_id,item_id)
    SELECT ?,item_id FROM player_inventory WHERE character_id=? UNION SELECT ?,item_id FROM player_item_instances WHERE character_id=?`, [character.id, character.id, character.id, character.id]);
  const itemType = category === '装备' ? 'equipment' : category === '道具' ? 'consumable' : 'material';
  const [stacked] = await pool.execute<(RowDataPacket & { id: number; code: string; codex_id: string; name: string; item_category: string; quantity: number; description: string })[]>('SELECT i.id,i.code,i.codex_id,i.name,i.item_category,pi.quantity,i.description FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.item_type=? AND i.stackable=1 ORDER BY i.name', [character.id, itemType]);
  const [instances] = await pool.execute<(RowDataPacket & { id: number; definition_codex_id: string; name: string; item_category: string; quality: number; durability: number; durability_max: number; description: string })[]>('SELECT ii.id,i.codex_id AS definition_codex_id,i.name,i.item_category,ii.quality,ii.durability,ii.durability_max,i.description FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.character_id=? AND i.item_type=? ORDER BY ii.acquired_at DESC', [character.id, itemType]);
  const [recent] = await pool.execute<(RowDataPacket & { code: string; codex_id: string; item_type: string; item_category: string; name: string })[]>(`SELECT code,codex_id,item_type,item_category,name FROM (
      SELECT i.code,i.codex_id,i.item_type,i.item_category,i.name,ii.acquired_at FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.character_id=?
      UNION ALL SELECT i.code,i.codex_id,i.item_type,i.item_category,i.name,pi.acquired_at FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=?
    ) recent_items ORDER BY acquired_at DESC LIMIT 5`, [character.id, character.id]);
  return { stacked, instances, recent };
};

export const itemCodex = async (qqUserId: string, codexId: string) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & { id: number; codex_id: string; name: string; item_type: string; item_category: string; description: string; obtain_source: string; weight: number; effect_json: unknown })[]>(`SELECT DISTINCT i.id,i.codex_id,i.name,i.item_type,i.item_category,i.description,i.obtain_source,i.weight,i.effect_json FROM item_definitions i
    LEFT JOIN player_item_codex c ON c.item_id=i.id AND c.character_id=?
    LEFT JOIN guild_shop_items gs ON gs.item_id=i.id AND gs.is_active=1
    LEFT JOIN blacksmith_shop_items bs ON bs.item_id=i.id AND bs.is_active=1
    LEFT JOIN alchemist_shop_items als ON als.item_id=i.id AND als.is_active=1
    LEFT JOIN bookshop_items bks ON bks.item_id=i.id AND bks.is_active=1
    LEFT JOIN hunter_lodge_items hs ON hs.item_id=i.id AND hs.is_active=1
    LEFT JOIN oddworkshop_items ows ON ows.item_id=i.id AND ows.is_active=1
    WHERE i.codex_id=? AND (c.item_id IS NOT NULL OR gs.item_id IS NOT NULL OR bs.item_id IS NOT NULL OR als.item_id IS NOT NULL OR bks.item_id IS NOT NULL OR hs.item_id IS NOT NULL OR ows.item_id IS NOT NULL)`, [character.id, codexId]);
  if (!rows[0]) throw new Error('尚未解锁该物品图鉴。');
  return rows[0];
};

export const equipmentDetail = async (qqUserId: string, instanceId: number) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & { name: string; item_category: string; weapon_type: string | null; required_level: number; quality: number; durability: number; durability_max: number; effect_json: unknown; forge_primary_json: unknown; description: string })[]>(`
    SELECT i.name,i.item_category,i.weapon_type,i.required_level,ii.quality,ii.durability,ii.durability_max,COALESCE(ii.effect_json,i.effect_json) AS effect_json,ii.forge_primary_json,i.description
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
  const [skills] = await pool.execute<(RowDataPacket & { id: number; name: string; category: string; level: number; quick_slot: number | null; passive_linked: number; learned_at: Date })[]>('SELECT s.id,s.name,s.category,ps.level,ps.quick_slot,ps.passive_linked,ps.learned_at FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? ORDER BY ps.learned_at,s.id', [character.id]);
  const [discoveries] = await pool.execute<(RowDataPacket & { id: number; name: string; category: string; learn_cost: number })[]>(`SELECT s.id,s.name,s.category,s.learn_cost FROM player_skill_discoveries d JOIN skill_definitions s ON s.id=d.skill_id
    LEFT JOIN player_skills ps ON ps.character_id=d.character_id AND ps.skill_id=d.skill_id WHERE d.character_id=? AND ps.skill_id IS NULL ORDER BY d.discovered_at,s.id`, [character.id]);
  return { skillPoints: Number(character.skill_points), passiveLinkLimit: Math.max(2, Number(character.realm_stage ?? 1) + 1), isOmniscient: character.secondary_profession_code === 'omniscient', skills, discoveries };
};

/** 初始可协同两个被动；每次突破境界（realm_stage +1）额外获得一个槽位。 */
export const togglePassiveLink = async (qqUserId: string, skillId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [skills] = await connection.execute<(RowDataPacket & { name: string; category: string; passive_linked: number })[]>(`SELECT s.name,s.category,ps.passive_linked
    FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id
    WHERE ps.character_id=? AND ps.skill_id=? FOR UPDATE`, [character.id, skillId]);
  const skill = skills[0];
  if (!skill) throw new Error('尚未学习该技能。');
  if (skill.category !== 'passive') throw new Error('只有被动技能可以进行协同链接。');
  if (Boolean(skill.passive_linked)) {
    await connection.execute('UPDATE player_skills SET passive_linked=0 WHERE character_id=? AND skill_id=?', [character.id, skillId]);
    return { name: skill.name, linked: false, limit: Math.max(2, Number(character.realm_stage ?? 1) + 1) };
  }
  const limit = Math.max(2, Number(character.realm_stage ?? 1) + 1);
  const [linkedRows] = await connection.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM player_skills ps
    JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.category='passive' AND ps.passive_linked=1 FOR UPDATE`, [character.id]);
  if (Number(linkedRows[0]?.total ?? 0) >= limit) throw new Error(`当前最多只能链接 ${limit} 个被动技能，请先卸下一个。`);
  await connection.execute('UPDATE player_skills SET passive_linked=1 WHERE character_id=? AND skill_id=?', [character.id, skillId]);
  return { name: skill.name, linked: true, limit };
});

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
  return { ...skill, level, learned, characterLevel: Number(character.level), skillPoints: Number(character.skill_points), appraisal: progress, specializations, effectDetails: effectRows, weaponMastery, actualPower, actualManaCost, actualCooldown, actualChant, masteryProficiencyCost: weaponMastery && Number(specializations.overcharge ?? 1) < 5 ? masteryUpgradeCost(Number(specializations.overcharge ?? 1)) : null, masteryFocusCost: weaponMastery && Number(specializations.instant ?? 1) < 6 ? masteryUpgradeCost(Number(specializations.instant ?? 1)) : null, specializationUpgradeCost: !learned || ['passive', 'bound'].includes(skill.category) || level >= Number(skill.max_level) ? null : activeSkillUpgradeCost(level), nextUpgradeCost: skill.code === 'appraisal' || skill.category === 'bound' ? null : !learned || level >= Number(skill.max_level) ? null : activeSkillUpgradeCost(level) };
};

export const learnSkill = async (qqUserId: string, skillId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [skills] = await connection.execute<(RowDataPacket & { name: string; code: string; learn_cost: number })[]>(`SELECT s.name,s.code,s.learn_cost FROM player_skill_discoveries d JOIN skill_definitions s ON s.id=d.skill_id
    LEFT JOIN player_skills ps ON ps.character_id=d.character_id AND ps.skill_id=d.skill_id WHERE d.character_id=? AND d.skill_id=? AND ps.skill_id IS NULL FOR UPDATE`, [character.id, skillId]);
  const skill = skills[0]; if (!skill) throw new Error('该技能尚未领悟，或已经学习。');
  if (Number(character.skill_points) < Number(skill.learn_cost)) throw new Error(`技能点不足，学习「${skill.name}」需要 ${skill.learn_cost} 点。`);
  await connection.execute('UPDATE characters SET skill_points=skill_points-? WHERE id=?', [skill.learn_cost, character.id]);
  await recordSkillPointChange(connection, character.id, -Number(skill.learn_cost), 'learn_skill', skillId, `学习技能「${skill.name}」`);
  await connection.execute('INSERT INTO player_skills (character_id,skill_id) VALUES (?,?)', [character.id, skillId]);
  if (skill.code !== 'appraisal') await connection.execute(`INSERT IGNORE INTO player_skill_specializations (character_id,skill_id,specialization) VALUES (?,?,'overcharge'),(?,?,'instant'),(?,?,'efficient'),(?,?,'potent')`, [character.id, skillId, character.id, skillId, character.id, skillId, character.id, skillId]);
  if (skill.code === 'appraisal') await connection.execute('INSERT IGNORE INTO player_appraisal_progress (character_id) VALUES (?)', [character.id]);
  return { name: skill.name, cost: Number(skill.learn_cost) };
});

export const toggleSkillShortcut = async (qqUserId: string, skillId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [skills] = await connection.execute<(RowDataPacket & { quick_slot: number | null; name: string; category: string })[]>('SELECT ps.quick_slot,s.name,s.category FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=? FOR UPDATE', [character.id, skillId]);
  const skill = skills[0]; if (!skill) throw new Error('尚未学习该技能。');
  if (skill.category === 'passive' || skill.category === 'bound') throw new Error('被动或绑定技能无法配置战斗快捷栏。');
  if (skill.quick_slot) { await connection.execute('UPDATE player_skills SET quick_slot=NULL WHERE character_id=? AND skill_id=?', [character.id, skillId]); return { name: skill.name, slot: null }; }
  const [used] = await connection.execute<(RowDataPacket & { quick_slot: number })[]>('SELECT quick_slot FROM player_skills WHERE character_id=? AND quick_slot IS NOT NULL ORDER BY quick_slot FOR UPDATE', [character.id]);
  const slot = [1, 2, 3, 4].find(candidate => !used.some(item => Number(item.quick_slot) === candidate));
  if (!slot) throw new Error('技能快捷栏已满，请先取消一个快捷技能。');
  await connection.execute('UPDATE player_skills SET quick_slot=? WHERE character_id=? AND skill_id=?', [slot, character.id, skillId]); return { name: skill.name, slot };
});

export const upgradeSkill = async (qqUserId: string, skillId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [skills] = await connection.execute<(RowDataPacket & { name: string; code: string; category: string; level: number; max_level: number; upgrade_cost: number })[]>('SELECT s.name,s.code,s.category,ps.level,s.max_level,s.upgrade_cost FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=? FOR UPDATE', [character.id, skillId]);
  const skill = skills[0]; if (!skill) throw new Error('尚未学习该技能。'); if (Number(skill.level) >= Number(skill.max_level)) throw new Error('该技能已达到最高等级。');
  if (skill.code === 'appraisal') throw new Error('鉴识需要选择“慧眼”或“识珠”专精升级。');
  if (skill.category === 'bound') throw new Error('绑定技能请使用其对应的专精方式升级。');
  const cost = activeSkillUpgradeCost(Number(skill.level)); if (Number(character.skill_points) < cost) throw new Error(`技能点不足，升级需要 ${cost} 点。`);
  await connection.execute('UPDATE characters SET skill_points=skill_points-? WHERE id=?', [cost, character.id]);
  await recordSkillPointChange(connection, character.id, -cost, 'upgrade_skill', skillId, `升级技能「${skill.name}」至 Lv.${Number(skill.level) + 1}`);
  await connection.execute('UPDATE player_skills SET level=level+1 WHERE character_id=? AND skill_id=?', [character.id, skillId]);
  return { name: skill.name, level: Number(skill.level) + 1, cost };
});

export const upgradeSkillSpecialization = async (qqUserId: string, skillId: number, specialization: 'overcharge' | 'instant' | 'efficient' | 'potent') => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [skills] = await connection.execute<(RowDataPacket & { code: string; name: string; category: string; level: number; max_level: number })[]>('SELECT s.code,s.name,s.category,ps.level,s.max_level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=? FOR UPDATE', [character.id, skillId]);
  const skill = skills[0]; const weaponMastery = Boolean(skill && weaponMasteryCodes.has(skill.code)); if (!skill || (['passive', 'bound'].includes(skill.category) && !weaponMastery)) throw new Error('只能升级已学习的主动技能或装备专精。');
  if (!weaponMastery && Number(skill.level) >= Number(skill.max_level)) throw new Error('该技能已达到最高等级。');
  await connection.execute('INSERT IGNORE INTO player_skill_specializations (character_id,skill_id,specialization) VALUES (?,?,?)', [character.id, skillId, specialization]);
  const [rows] = await connection.execute<(RowDataPacket & { level: number })[]>('SELECT level FROM player_skill_specializations WHERE character_id=? AND skill_id=? AND specialization=? FOR UPDATE', [character.id, skillId, specialization]);
  const level = Number(rows[0].level); const maximum = weaponMastery ? specialization === 'overcharge' ? 5 : 6 : 100; if (level >= maximum) throw new Error('该专精已达到最高等级。');
  const cost = weaponMastery ? masteryUpgradeCost(level) : activeSkillUpgradeCost(Number(skill.level)); if (Number(character.skill_points) < cost) throw new Error(`技能点不足，升级需要 ${cost} 点。`);
  await connection.execute('UPDATE characters SET skill_points=skill_points-? WHERE id=?', [cost, character.id]);
  await recordSkillPointChange(connection, character.id, -cost, 'upgrade_specialization', skillId, `升级「${skill.name}」${specialization}`);
  await connection.execute('UPDATE player_skill_specializations SET level=level+1 WHERE character_id=? AND skill_id=? AND specialization=?', [character.id, skillId, specialization]);
  await connection.execute('UPDATE player_skills SET level=level+1 WHERE character_id=? AND skill_id=?', [character.id, skillId]);
  return { name: skill.name, skillLevel: Number(skill.level) + 1, specialization, level: level + 1, cost };
});

export const upgradeAppraisal = async (qqUserId: string, direction: 'range' | 'information') => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [skills] = await connection.execute<(RowDataPacket & { id: number; level: number; name: string })[]>(`SELECT s.id,ps.level,s.name FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.code='appraisal' FOR UPDATE`, [character.id]);
  const skill = skills[0]; if (!skill) throw new Error('尚未学会绑定技能「鉴识」。');
  await connection.execute('INSERT IGNORE INTO player_appraisal_progress (character_id) VALUES (?)', [character.id]);
  const [progressRows] = await connection.execute<(RowDataPacket & { range_level: number; information_level: number })[]>('SELECT range_level,information_level FROM player_appraisal_progress WHERE character_id=? FOR UPDATE', [character.id]);
  const progress = progressRows[0]; const current = direction === 'range' ? Number(progress.range_level) : Number(progress.information_level);
  const cap = direction === 'range' ? 10 : 4; if (current >= cap) throw new Error(direction === 'range' ? '鉴识慧眼已达到上限。' : '鉴识识珠已达到上限。');
  const cost = direction === 'range' ? current : current + 1; if (Number(character.skill_points) < cost) throw new Error(`技能点不足，升级需要 ${cost} 点。`);
  await connection.execute('UPDATE characters SET skill_points=skill_points-? WHERE id=?', [cost, character.id]);
  await recordSkillPointChange(connection, character.id, -cost, 'upgrade_appraisal', Number(skill.id), `升级鉴识${direction === 'range' ? '慧眼' : '识珠'}`);
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
  if (await isInHome(pool, Number(character.id))) throw new Error('你正在自己的家园中，请使用“/家园”管理小屋。');
  await ensureForestGuideFreeAction(pool, Number(character.id));
  const [spawnRows] = await pool.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL AND ${visiblePursuitCondition('s')}`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id]);
  const canViewMonsterInfo = await hasPassiveSkill(pool, character.id, 'appraisal');
  const spawns = materializeMonsters(spawnRows, false);
  if (!spawns.length) return { character, spawns, text: '四周只有风吹树叶的声音。这里暂时没有敌对生物。' };
  if (isCityPursuit(spawns[0])) return { character, spawns, text: '城镇执法者已锁定你的行踪，拒绝任何形式的交涉。', canViewMonsterInfo };
  const perception = finalAttribute(character, 'perception');
  const negotiation = Math.floor(finalAttribute(character, 'spirit') + finalAttribute(character, 'intelligence') + perception / 2);
  const text = canViewMonsterInfo ? `你发现 ${spawns.map(s => `#${s.id} ${s.name} Lv.${s.level}`).join('、')}。\n\n感知 ${perception.toFixed(1)}｜负重后速度 ${character.speed}｜交涉值 ${negotiation}\n感知与速度高于敌人时可偷袭；感知较高可尝试躲避；交涉成功率按双方交涉值对抗结算。` : '你察觉到附近有未知的敌对存在，却无法辨明它们的任何信息。';
  return { character, spawns, text, canViewMonsterInfo };
};

export type CoordinateInteractionTarget = { type: '玩家' | 'NPC' | '建筑' | '资源' | '入口' | '地标'; id: string; name: string; code?: string; description: string; gameId?: number; interactionKind?: 'npc' | 'building'; resourceKind?: '矿脉' | '植被' };
export type NearbyPoint = { type: '怪物' | '域民' | '建筑' | '地标' | '悬赏' | '矿脉' | '植被' | '地下入口' | '玩家'; name: string; x: number; y: number; distance: number; code?: string; interaction?: Pick<CoordinateInteractionTarget, 'type' | 'id'>; pvpAvailable?: boolean; wanted?: boolean };
export type MapLandmark = { code?: string; name: string; x: number; y: number; kind?: 'landmark' | 'bounty' };

const perceptionRange = (perception: number, level: number) => explorationScale(perception, level);
const mapCodeByRegion: Record<string, string | undefined> = {
  '百纳镇': 'map_baina_town',
  '幽暗密林': 'map_dark_forest',
  '幽暗密林深处': 'map_dark_forest_deep'
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
  // 地下迷宫的黑暗会压制感知，避免高感知直接看穿岔路与遭遇。
  const perceptionObscured = character.region_name === '地下迷宫';
  const range = perceptionObscured ? 1 : perceptionRange(finalAttribute(character, 'perception'), Number(character.level));
  const pool = await getPool();
  await refreshBounties(pool);
  const bounds = [character.current_region_id, Number(character.pos_x) - range, Number(character.pos_x) + range, Number(character.pos_y) - range, Number(character.pos_y) + range, character.pos_z];
  const [monsters] = await pool.execute<(RowDataPacket & { id: number; name: string; x: number; y: number })[]>(`SELECT s.id,t.name,s.pos_x AS x,s.pos_y AS y FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x BETWEEN ? AND ? AND s.pos_y BETWEEN ? AND ? AND s.pos_z=? AND s.defeated_at IS NULL
    AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','city_pursuit'))`, bounds);
  const [npcs] = await pool.execute<(RowDataPacket & { code: string; name: string; x: number; y: number; interaction_kind: 'npc' | 'building' })[]>(`SELECT code,name,interaction_kind,pos_x AS x,pos_y AS y FROM map_npcs WHERE region_id=? AND pos_x BETWEEN ? AND ? AND pos_y BETWEEN ? AND ? AND pos_z=?`, bounds);
  const [objects] = await pool.execute<(RowDataPacket & { code: string; name: string; x: number; y: number })[]>(`SELECT code,name,pos_x AS x,pos_y AS y FROM map_special_objects WHERE region_id=? AND pos_x BETWEEN ? AND ? AND pos_y BETWEEN ? AND ? AND pos_z=?`, bounds);
  const [resources] = await pool.execute<(RowDataPacket & { id: number; code: string; name: string; x: number; y: number })[]>(`SELECT rs.id,i.code,i.name,rs.pos_x AS x,rs.pos_y AS y FROM resource_spawns rs JOIN item_definitions i ON i.id=rs.item_id WHERE rs.region_id=? AND rs.pos_x BETWEEN ? AND ? AND rs.pos_y BETWEEN ? AND ? AND rs.pos_z=? AND rs.mined_at IS NULL`, bounds);
  // 入口仅作为周边感知目标显示；地图仍只读取玩家实际抵达后写入的发现标记。
  const [dungeonEntrances] = character.region_name === '幽暗密林'
    ? await pool.execute<(RowDataPacket & { id: number; x: number; y: number })[]>(`SELECT d.id,e.pos_x AS x,e.pos_y AS y FROM dungeon_entrances e
      JOIN dungeon_instances d ON d.id=e.dungeon_id
      WHERE d.state='active' AND e.region_id=? AND e.pos_x BETWEEN ? AND ? AND e.pos_y BETWEEN ? AND ?`, bounds.slice(0, 5))
    : [[] as any];
  // 城镇与地下迷宫都会展示玩家；城镇红名可被无惩罚逮捕。
  const nearbyPlayers = await dungeonPlayersInRange(pool, Number(character.id), Number(character.current_region_id), Number(character.pos_x), Number(character.pos_y), Number(character.pos_z), range);
  const [descriptions] = await pool.execute<(RowDataPacket & { description: string })[]>('SELECT description FROM map_move_texts WHERE region_id=? ORDER BY RAND() LIMIT 1', [character.current_region_id]);
  const dungeonCell = character.region_name === '地下迷宫'
    ? await dungeonCellAt(pool, Number(character.current_region_id), Number(character.pos_x), Number(character.pos_y), Number(character.pos_z))
    : null;
  const point = (type: NearbyPoint['type'], item: { name: string; x: number; y: number; code?: string; interaction?: NearbyPoint['interaction'] }): NearbyPoint => ({ type, name: item.name, x: Number(item.x), y: Number(item.y), distance: Math.abs(Number(item.x) - Number(character.pos_x)) + Math.abs(Number(item.y) - Number(character.pos_y)), code: item.code, interaction: item.interaction });
  const points = [...monsters.map(item => point('怪物', { ...item, code: String(item.id) })), ...resources.map(item => point(resourceKindByCode(item.code), { ...item, interaction: { type: '资源', id: String(item.id) } })), ...npcs.map(item => point(item.interaction_kind === 'building' ? '建筑' : '域民', { ...item, interaction: { type: item.interaction_kind === 'building' ? '建筑' : 'NPC', id: item.code } })), ...objects.map(item => point('地标', { ...item, interaction: { type: '地标', id: item.code } })), ...dungeonEntrances.map(item => point('地下入口', { ...item, name: '地下迷宫入口', code: String(item.id), interaction: { type: '入口', id: String(item.id) } })), ...nearbyPlayers.map(item => ({ ...point('玩家', { ...item, name: item.wanted ? `【红名】${item.name}` : item.name, code: String(item.gameId), interaction: { type: '玩家', id: String(item.gameId) } }), wanted: item.wanted, pvpAvailable: true, inHome: item.inHome }))]
    .filter(item => item.distance <= range)
    .sort((a, b) => a.type === '玩家' && b.type === '玩家' ? Number(Boolean(b.wanted)) - Number(Boolean(a.wanted)) || a.distance - b.distance || a.name.localeCompare(b.name, 'zh-CN') : a.distance - b.distance || a.name.localeCompare(b.name, 'zh-CN'));
  const mapUnlocked = await hasRegionMap(pool, Number(character.id), character.region_name);
  const [landmarks] = mapUnlocked ? await pool.execute<(RowDataPacket & MapLandmark)[]>(`SELECT code,name,pos_x AS x,pos_y AS y FROM map_npcs WHERE region_id=?
    UNION ALL SELECT code,name,pos_x AS x,pos_y AS y FROM map_special_objects WHERE region_id=?`, [character.current_region_id, character.current_region_id]) : [[] as any];
  const [homes] = mapUnlocked ? await pool.execute<(RowDataPacket & MapLandmark)[]>(`SELECT 'player_home' AS code,CONCAT('我的小屋·',h.house_level,'级') AS name,h.plot_x AS x,h.plot_y AS y
    FROM player_homes h WHERE h.character_id=? AND h.town_region_id=? AND h.status='active' LIMIT 1`, [character.id, character.current_region_id]) : [[] as any];
  const [bountyTargets] = mapUnlocked ? await pool.execute<(RowDataPacket & { name: string; x: number; y: number })[]>(`SELECT t.name,s.pos_x AS x,s.pos_y AS y FROM bounty_notices b JOIN monster_spawns s ON s.id=b.source_spawn_id JOIN monster_templates t ON t.id=s.template_id
    WHERE b.is_active=1 AND b.expires_at>NOW() AND s.region_id=? AND s.defeated_at IS NULL ORDER BY b.id`, [character.current_region_id]) : [[] as any];
  const mapMarkers = [...sortMapMarkers([...homes, ...landmarks]).map(item => ({ code: item.code, name: item.name, x: Number(item.x), y: Number(item.y), kind: 'landmark' as const })), ...bountyTargets.map(item => ({ name: `悬赏目标·【暴动】${item.name}`, x: Number(item.x), y: Number(item.y), kind: 'bounty' as const }))];
  const appraisal = await appraisalProfileFor(pool, [Number(character.id)]);
  return { character, range, perceptionObscured, points, landmarks: mapMarkers, mapUnlocked, npcDetailsUnlocked: appraisal.learned && appraisal.informationLevel >= 3, description: dungeonCell?.landmark_text ?? descriptions[0]?.description ?? '四周一片寂静，暂时没有发现异常。' };
};

export const requireNpcAtCurrentPosition = async (qqUserId: string, code: string) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { name: string; description: string; interaction_kind: 'npc' | 'building' })[]>(`SELECT name,description,interaction_kind FROM map_npcs
    WHERE code=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1`, [code, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (!rows[0]) throw new Error('你已经离开该目标坐标，无法继续互动。');
  return rows[0];
};

/** 地下迷宫只保存可走格；未保存的相邻方向即为石墙。 */
export const blockedDungeonDirections = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  if (character.region_name !== '地下迷宫') return [] as string[];
  const pool = await getPool();
  const directions: Array<[string, number, number]> = [['上', 0, 1], ['下', 0, -1], ['左', -1, 0], ['右', 1, 0]];
  const cells = await Promise.all(directions.map(([, dx, dy]) => dungeonCellAt(pool, Number(character.current_region_id), Number(character.pos_x) + dx, Number(character.pos_y) + dy, Number(character.pos_z))));
  return directions.filter((_, index) => !cells[index]).map(([direction]) => direction);
};

export type NpcAffinityInteraction = 'chat' | 'buy' | 'sell' | 'craft';
const npcAffinityReward: Record<NpcAffinityInteraction, { column: string; amount: number }> = {
  chat: { column: 'daily_chat_count', amount: 5 },
  buy: { column: 'daily_buy_count', amount: 5 },
  sell: { column: 'daily_sell_count', amount: 5 },
  craft: { column: 'daily_craft_count', amount: 10 }
};
export const npcAffinityRank = (affinity: number) => {
  if (affinity >= 10000) return { level: 6, title: '矢志同心' };
  if (affinity >= 5000) return { level: 5, title: '契若金兰' };
  if (affinity >= 2000) return { level: 4, title: '心意相通' };
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
    saint_church: { name: '修女·伊芙琳', description: '圣恩教堂的修女。她文静端庄，信仰神明虔诚；无论来访者带着何种困惑，总会以包容、博爱而优雅的态度倾听。' },
    blacksmith: { name: '漠北', description: '镇民多叫他小北。这个九尾狐族与矮人的混血少年经营着铁匠铺，炉火与铁锤是他最熟悉的伙伴。' },
    alchemy_sweetshop: { name: '晴儿', description: '糖水屋的炼金师。她擅长草药提纯与药剂调配，言谈温和，对生命与能量的变化格外敏锐。' },
    oddworkshop: { name: '唯薇安', description: '异工坊的店主，一位有半精灵血脉的解构师。她外表像十六七岁的少女，实际已在大陆上度过数十年，热衷于将一切未知事物拆开、理解，再拼出新的可能。' },
    hunter_lodge: { name: '雷恩·霍尔特', description: '驻扎在幽暗密林的神射手。约莫四十岁，金黄短发与长须间已有风霜；他嫉恶如仇，因地下迷宫中失去爱人，此后便日夜研究迷宫的秘密。' },
    bookshop: { name: '洛文·赫斯特', description: '百味书屋的店主。七十余岁的白须老人已难以看清细小文字，却仍每日研读厚重百科；他曾是王都大贤者，如今把多年搜集的知识留给前来求学的年轻人与冒险者。' }
  };
  const persona = personas[code];
  return { name: persona?.name ?? npc.name, description: persona?.description ?? npc.description, x: Number(npc.x), y: Number(npc.y), affinity, rank: npcAffinityRank(affinity), daily: { chat: Number(npc.chat_count), buy: Number(npc.buy_count), sell: Number(npc.sell_count), craft: Number(npc.craft_count) } };
};

export const npcAffinity = async (qqUserId: string, code: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { affinity: number })[]>('SELECT affinity FROM player_npc_affinity WHERE character_id=? AND npc_code=?', [character.id, code]);
  return Number(rows[0]?.affinity ?? 0);
};

const warrantStars = (victims: number) => victims >= 15 ? 5 : victims >= 10 ? 4 : victims >= 6 ? 3 : victims >= 3 ? 2 : 1;
const visiblePursuitCondition = (alias = 's') => `(NOT JSON_CONTAINS(COALESCE(${alias}.traits_json,JSON_ARRAY()),JSON_OBJECT('code','city_pursuit'))
  OR JSON_CONTAINS(COALESCE(${alias}.traits_json,JSON_ARRAY()),JSON_OBJECT('code','city_pursuit','pursuit_target_id',?)))`;

/** 三星通缉（当前规则为至少 6 名不同受害者）才会引来城镇执法者。追捕者只对被通缉人可见。 */
const createCityPursuitEncounter = async (connection: PoolConnection, character: CharacterRow, region: { id: number; code: string; name: string }, x: number, y: number) => {
  if (region.code !== 'baina_town') return null;
  const [warrants] = await connection.execute<(RowDataPacket & { id: number; victim_count: number; pursuit_defeats: number })[]>(`SELECT w.id,COUNT(DISTINCT v.target_character_id) AS victim_count,w.pursuit_defeats
    FROM player_warrants w
    LEFT JOIN player_warrant_victims v ON v.warrant_id=w.id
    LEFT JOIN city_pursuit_cooldowns c ON c.character_id=w.wanted_character_id AND c.city_region_id=w.city_region_id
    WHERE w.wanted_character_id=? AND w.city_region_id=? AND w.status='active'
    GROUP BY w.id,w.pursuit_defeats,c.expires_at
    HAVING COUNT(DISTINCT v.target_character_id)>=6 AND (c.expires_at IS NULL OR c.expires_at<=NOW())
    LIMIT 1 FOR UPDATE`, [character.id, region.id]);
  const warrant = warrants[0]; if (!warrant) return null;
  // 每次击退执法者都会把追捕烈度推进一档：三星→四星→五星→一至五骷髅。
  const pursuitTier = warrantStars(Number(warrant.victim_count)) + Number(warrant.pursuit_defeats);
  const stars = Math.min(5, pursuitTier);
  const skulls = Math.max(0, Math.min(5, pursuitTier - 5));

  // 旧的追捕者不保留在城镇地格上；该遭遇仅属于当前通缉者，其他玩家不会被它拦下。
  await connection.execute(`UPDATE monster_spawns
    SET current_hp=0,defeated_at=NOW()
    WHERE region_id=? AND defeated_at IS NULL
      AND JSON_CONTAINS(COALESCE(traits_json,JSON_ARRAY()),JSON_OBJECT('code','city_pursuit','pursuit_target_id',?))`, [region.id, character.id]);
  const normalRoster = stars === 3 ? ['city_marshal_blake']
    : stars === 4 ? ['city_marshal_blake', 'city_priest_mare']
      : ['city_captain_roderick', 'city_mage_sen', 'city_priest_mare', 'city_rogue_loke'];
  const escalationRoster = skulls >= 5
    ? ['city_chief_executor', 'city_executioner_arlen', 'city_inquisitor_lynn', 'city_confessor_sola']
    : ['city_executioner_arlen', 'city_inquisitor_lynn', 'city_confessor_sola', 'city_hunter_lyra'].slice(0, skulls);
  const officerCodes = skulls ? escalationRoster : normalRoster;
  const placeholders = officerCodes.map(() => '?').join(',');
  const [officers] = await connection.execute<(RowDataPacket & MonsterAttributes & { id: number; code: string; name: string; monster_class: string; level: number; skill_sequence: unknown; profession: string; equipment_text: string })[]>(`SELECT t.id,t.code,t.name,t.monster_class,t.level,${templateMonsterAttributeColumns},t.skill_sequence,COALESCE(o.profession,'城镇执法者') AS profession,COALESCE(o.equipment_text,'制式执法装备') AS equipment_text
    FROM monster_templates t LEFT JOIN city_pursuit_officers o ON o.template_id=t.id WHERE t.code IN (${placeholders}) FOR UPDATE`, officerCodes);
  const officerByCode = new Map(officers.map(officer => [officer.code, officer]));
  const createdNames: string[] = []; let firstSpawnId = 0;
  for (const [index, code] of officerCodes.entries()) {
    const officer = officerByCode.get(code); if (!officer) continue;
    const level = skulls >= 5 ? (index === 0 ? 80 : 60) : Math.min(100, Number(character.level) + random(skulls ? 20 : 5, skulls ? 30 : 10));
    const traits = [{ code: 'city_pursuit', name: '执法者·', warrant_id: Number(warrant.id), pursuit_target_id: Number(character.id), pursuit_stars: stars, pursuit_skulls: skulls, profession: officer.profession, equipment: officer.equipment_text }];
    const stats = monsterCombatStats({ ...officer, level, traits_json: traits });
    const [created] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [officer.id, region.id, x, y, character.pos_z, level, officer.constitution, officer.spirit, officer.strength, officer.intelligence, officer.agility, officer.perception, stats.hpMax, JSON.stringify(stringList(officer.skill_sequence)), JSON.stringify(traits)]);
    if (!firstSpawnId) firstSpawnId = Number(created.insertId);
    createdNames.push(`${officer.name} Lv.${level}`);
  }
  if (!firstSpawnId) return null;
  const tierText = skulls ? `危险等级：${'☠'.repeat(skulls)}${'☆'.repeat(stars)}。` : `通缉等级：${'★'.repeat(stars)}。`;
  return { spawnId: firstSpawnId, text: `警钟在街巷间急促响起。${tierText}\n${createdNames.join('、')}组成执法小队，封住了你的去路。` };
};

export const createCityPursuitAtCurrentPosition = async (connection: PoolConnection, qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const [regions] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string })[]>('SELECT id,code,name FROM map_regions WHERE id=? LIMIT 1', [character.current_region_id]);
  const region = regions[0]; if (!region) return null;
  return createCityPursuitEncounter(connection, character, region, Number(character.pos_x), Number(character.pos_y));
};

const moveToPosition = async (connection: PoolConnection, qqUserId: string, x: number, y: number, restrictToPerception: boolean, speedLimit?: number) => {
  const character = await characterFor(qqUserId);
  if (await isInHome(connection, Number(character.id))) throw new Error('你正在自己的家园中，请先使用“/家园 出门”。');
  await ensureForestGuideFreeAction(connection, Number(character.id));
  const [travels] = await connection.execute<(RowDataPacket & { activity_type: 'move' | 'hunt' })[]>('SELECT activity_type FROM player_travels WHERE character_id=? FOR UPDATE', [character.id]);
  if (travels[0]) throw new Error(travels[0].activity_type === 'hunt' ? '你正在寻怪，请等待完成或取消寻怪。' : '你正在前往目标地点，请等待抵达或取消移动。');
  const [mining] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_resource_mining WHERE character_id=? LIMIT 1 FOR UPDATE', [character.id]);
  if (mining[0]) throw new Error('你正在开采资源，请先完成或取消开采。');
  ensureActionAvailable(character);
  const [activeCombat] = await connection.execute<RowDataPacket[]>(`SELECT cs.id FROM combat_sessions cs LEFT JOIN combat_members cm ON cm.session_id=cs.id
    WHERE cs.state='active' AND (cs.character_id=? OR cm.character_id=?) LIMIT 1 FOR UPDATE`, [character.id, character.id]);
  if (activeCombat.length) throw new Error('战斗尚未结束，无法移动。');
  const [encounters] = await connection.execute<RowDataPacket[]>(`SELECT id FROM monster_spawns s WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL AND ${visiblePursuitCondition('s')} LIMIT 1 FOR UPDATE`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id]);
  const [escapeTokens] = await connection.execute<RowDataPacket[]>('SELECT character_id FROM encounter_escape_tokens WHERE character_id=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? FOR UPDATE', [character.id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (encounters[0] && !escapeTokens[0]) throw new Error('当前格子存在敌对生物，请先选择战斗、交涉或躲避。');
  // 躲避后若只是点击当前位置（例如怪物与地下入口意外重叠），保留本次脱离资格，
  // 让该坐标的入口事件能够正常展示；真正离开该格时再消耗令牌。
  const stayingOnEscapedEncounter = Boolean(escapeTokens[0]) && x === Number(character.pos_x) && y === Number(character.pos_y);
  if (escapeTokens[0] && !stayingOnEscapedEncounter) await connection.execute('DELETE FROM encounter_escape_tokens WHERE character_id=?', [character.id]);
  const [partyRows] = await connection.execute<(RowDataPacket & { leader_character_id: number })[]>('SELECT p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=?', [character.id]);
  if (partyRows[0] && Number(partyRows[0].leader_character_id) !== character.id) throw new Error('组队状态下仅队长可以移动。');
  const distance = Math.abs(x - Number(character.pos_x)) + Math.abs(y - Number(character.pos_y));
  const perceptionLimit = character.region_name === '地下迷宫' ? 1 : perceptionRange(finalAttribute(character, 'perception'), Number(character.level));
  if (restrictToPerception && distance > perceptionLimit) throw new Error('该位置超出你的感知范围。');
  if (speedLimit !== undefined && distance > speedLimit) throw new Error(`当前移动速度为 ${speedLimit}，一次移动距离不能超过移动速度。`);
  const [regions] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string })[]>('SELECT id,code,name FROM map_regions WHERE ? BETWEEN min_x AND max_x AND ? BETWEEN min_y AND max_y AND ? BETWEEN min_z AND max_z ORDER BY danger_level DESC LIMIT 1', [x, y, character.pos_z]);
  const region = regions[0]; if (!region) throw new Error('\n\n前面的区域，以后再来探索吧！');
  if (region.code === 'dark_forest_dungeon') {
    const dx = x - Number(character.pos_x); const dy = y - Number(character.pos_y);
    if (Number(region.id) !== Number(character.current_region_id) || !distance || (dx && dy)) throw new Error('地下迷宫中只能沿上下左右的通路移动。');
    const stepX = Math.sign(dx); const stepY = Math.sign(dy);
    for (let step = 1; step <= distance; step++) {
      if (!await dungeonCellAt(connection, Number(region.id), Number(character.pos_x) + stepX * step, Number(character.pos_y) + stepY * step, Number(character.pos_z))) throw new Error('前方是无法通行的石墙。');
    }
  }
  if (region.code === 'baina_town') {
    const [unlocked] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_story_progress WHERE character_id=? AND story_code=\'forest_guide\' AND status=\'completed\' LIMIT 1', [character.id]);
    if (!unlocked[0]) throw new Error('前方的百纳镇尚未找到入口，先在密林中继续前进吧。');
  }
  if (partyRows[0]) await connection.execute('UPDATE characters c JOIN party_members pm ON pm.character_id=c.id SET c.current_region_id=?,c.pos_x=?,c.pos_y=? WHERE pm.party_id=(SELECT party_id FROM party_members WHERE character_id=? LIMIT 1)', [region.id, x, y, character.id]);
  else await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=? WHERE id=?', [region.id, x, y, character.id]);
  // 追捕遭遇必须以数据库内已经提交的实际落点为准，不能继续使用移动前的角色快照。
  const [arrivedRows] = await connection.execute<(RowDataPacket & { current_region_id: number; pos_x: number; pos_y: number; pos_z: number })[]>(
    'SELECT current_region_id,pos_x,pos_y,pos_z FROM characters WHERE id=? FOR UPDATE', [character.id]);
  const arrived = arrivedRows[0]; if (!arrived) throw new Error('移动后未能读取角色位置。');
  const arrivedX = Number(arrived.pos_x); const arrivedY = Number(arrived.pos_y); const arrivedZ = Number(arrived.pos_z);
  // 离开百纳镇便脱离本轮追捕；若仍留在城镇，记录会保留并由同一名执法者继续追捕。
  if (region.code !== 'baina_town') await connection.execute(`DELETE tracks FROM city_pursuit_tracks tracks
    JOIN map_regions city ON city.id=tracks.city_region_id
    WHERE tracks.character_id=? AND city.code='baina_town'`, [character.id]);
  if (region.code === 'baina_town') await recordWarrantSighting(connection, Number(character.id), Number(region.id), arrivedX, arrivedY);
  const enteringTown = region.code === 'baina_town' && Number(character.current_region_id) !== Number(region.id);
  let debtCollection = { collected: 0, remaining: 0 };
  if (enteringTown) {
    const [members] = partyRows[0]
      ? await connection.execute<(RowDataPacket & { character_id: number })[]>('SELECT character_id FROM party_members WHERE party_id=(SELECT party_id FROM party_members WHERE character_id=? LIMIT 1)', [character.id])
      : [[{ character_id: Number(character.id) }]] as any;
    for (const member of members) {
      const result = await collectCityDebts(connection, Number(member.character_id), Number(region.id));
      if (Number(member.character_id) === Number(character.id)) debtCollection = result;
    }
  }
  const pursuitCharacter = { ...character, current_region_id: Number(arrived.current_region_id), region_name: region.name, pos_x: arrivedX, pos_y: arrivedY, pos_z: arrivedZ };
  const pursuit = await createCityPursuitEncounter(connection, pursuitCharacter, region, arrivedX, arrivedY);
  const [spawnRows] = await connection.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL AND ${visiblePursuitCondition('s')} FOR UPDATE`, [region.id, arrivedX, arrivedY, arrivedZ, character.id]);
  const appraisal = await appraisalProfileFor(connection, [character.id]);
  const spawns = materializeMonsters(spawnRows, appraisal.informationLevel >= 2);
  const moved = { ...pursuitCharacter, enteredTown: enteringTown, debtCollection };
  if (spawns.length && !stayingOnEscapedEncounter) {
    const members = await partyCombatants(connection, character);
    const fastestMonster = Math.max(...spawns.map(spawn => monsterCombatStats(spawn).speed));
    const [texts] = await connection.execute<(RowDataPacket & { description: string })[]>('SELECT description FROM monster_encounter_texts WHERE monster_template_id=? ORDER BY RAND() LIMIT 1', [spawns[0].template_id]);
    const [occupied] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=? AND cs.state='active' LIMIT 1`, [spawns[0].id]);
    // 所有地图的遭遇都记录来路；躲避与战斗撤离均会退回此格。
    for (const member of members) await connection.execute(`INSERT INTO dungeon_encounter_retreats
      (character_id,encounter_region_id,encounter_x,encounter_y,encounter_z,retreat_region_id,retreat_x,retreat_y,retreat_z)
      VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE encounter_region_id=VALUES(encounter_region_id),encounter_x=VALUES(encounter_x),encounter_y=VALUES(encounter_y),encounter_z=VALUES(encounter_z),retreat_region_id=VALUES(retreat_region_id),retreat_x=VALUES(retreat_x),retreat_y=VALUES(retreat_y),retreat_z=VALUES(retreat_z)`, [member.id, region.id, arrivedX, arrivedY, arrivedZ, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
    const cityPursuit = isCityPursuit(spawns[0]);
    return { character: moved, kind: 'encounter' as const, spawns, occupied: Boolean(occupied[0]), cityPursuit, canAmbush: !cityPursuit && members.every(member => Number(member.speed) > fastestMonster), text: pursuit?.text ?? texts[0]?.description ?? `${spawns[0].name} 拦住了你的去路。` };
  }
  const coordinateTargets = await coordinateInteractionTargetsFor(connection, moved, region.code);
  // 玩家抵达必定弹出互动选择；其他目标仅在同格叠加时改为选择页，避免覆盖原有的单目标流程。
  if (coordinateTargets.some(target => target.type === '玩家') || coordinateTargets.length > 1) return { character: moved, kind: 'interaction' as const, targets: coordinateTargets, text: '你抵达了目标位置。' };
  const [resources] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; description: string })[]>(`SELECT rs.id,i.code,i.name,i.description FROM resource_spawns rs JOIN item_definitions i ON i.id=rs.item_id
    WHERE rs.region_id=? AND rs.pos_x=? AND rs.pos_y=? AND rs.pos_z=? AND rs.mined_at IS NULL LIMIT 1 FOR UPDATE`, [region.id, x, y, character.pos_z]);
  if (resources[0]) {
    const resource = resources[0]; const resourceKind = resourceKindByCode(resource.code);
    return { character: moved, kind: 'resource' as const, resource: { ...resource, kind: resourceKind }, text: `你发现了一处${resourceKind}·${resource.name}。${resource.description}` };
  }
  const [npcs] = await connection.execute<(RowDataPacket & { code: string; name: string; description: string; interaction_kind: 'npc' | 'building' })[]>('SELECT code,name,description,interaction_kind FROM map_npcs WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1', [region.id, x, y, character.pos_z]);
  if (npcs[0]) return { character: moved, kind: 'npc' as const, npc: npcs[0], text: npcs[0].description };
  const entrance = region.code === 'dark_forest' ? await dungeonEntranceAt(connection, Number(region.id), x, y) : null;
  if (entrance) {
    const discovery = await discoverDungeonEntrance(connection, Number(character.id), entrance.id, Number(region.id), x, y);
    return { character: moved, kind: 'dungeon_entrance' as const, entrance, discovery, text: entrance.description };
  }
  if (region.code === 'dark_forest_dungeon') {
    const event = await dungeonArrivalEvent(connection, Number(character.id));
    if (event) return { character: moved, kind: 'dungeon' as const, dungeon: event, text: event.text };
  }
  const [objects] = await connection.execute<(RowDataPacket & { description: string })[]>('SELECT description FROM map_special_objects WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1', [region.id, x, y, character.pos_z]);
  if (objects[0]) return { character: moved, kind: 'object' as const, text: objects[0].description };
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

export const move = async (qqUserId: string, direction: string) => {
  const delta: Record<string, [number, number]> = { 上: [0, 1], 下: [0, -1], 左: [-1, 0], 右: [1, 0] };
  if (!delta[direction]) throw new Error('方向只能是 上、下、左、右。');
  const profile = await movementProfile(qqUserId);
  let lastResult: any;
  for (let step = 0; step < profile.step; step++) {
    const character = await characterFor(qqUserId);
    try {
      // 每格单独提交，确保下一格能读取到刚刚落点；遇到任何实际目标立即停止。
      lastResult = await withTransaction(connection => moveToPosition(connection, qqUserId, Number(character.pos_x) + delta[direction][0], Number(character.pos_y) + delta[direction][1], false, 1));
    } catch (error) {
      if (error instanceof Error && error.message.includes('无法通行的石墙')) {
        return lastResult ?? { character, kind: 'event' as const, text: '前方是无法通行的石墙，你停在了墙前。' };
      }
      throw error;
    }
    if (lastResult.kind !== 'event') return lastResult;
  }
  return lastResult;
};

const coordinateInteractionTargetsFor = async (connection: Pool | PoolConnection, character: Pick<CharacterRow, 'id' | 'current_region_id' | 'pos_x' | 'pos_y' | 'pos_z'>, regionCode?: string): Promise<CoordinateInteractionTarget[]> => {
  const [resources, npcs, objects, players] = await Promise.all([
    connection.execute<(RowDataPacket & { id: number; code: string; name: string; description: string })[]>(`SELECT rs.id,i.code,i.name,i.description FROM resource_spawns rs JOIN item_definitions i ON i.id=rs.item_id WHERE rs.region_id=? AND rs.pos_x=? AND rs.pos_y=? AND rs.pos_z=? AND rs.mined_at IS NULL`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]),
    connection.execute<(RowDataPacket & { code: string; name: string; description: string; interaction_kind: 'npc' | 'building' })[]>(`SELECT code,name,description,interaction_kind FROM map_npcs WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=?`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]),
    connection.execute<(RowDataPacket & { code: string; name: string; description: string })[]>(`SELECT code,name,description FROM map_special_objects WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=?`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]),
    connection.execute<(RowDataPacket & { game_id: number; name: string })[]>(`SELECT c.game_id,c.name FROM characters c LEFT JOIN player_home_visits hv ON hv.character_id=c.id
      WHERE c.current_region_id=? AND c.pos_x=? AND c.pos_y=? AND c.pos_z=? AND c.id<>? AND c.npc_code IS NULL
        AND (hv.character_id IS NULL OR (?='baina_town' AND EXISTS(SELECT 1 FROM player_warrants w WHERE w.wanted_character_id=c.id AND w.city_region_id=? AND w.status='active')))`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id, regionCode ?? '', character.current_region_id])
  ]);
  const targets: CoordinateInteractionTarget[] = [
    ...resources[0].map(row => ({ type: '资源' as const, id: String(row.id), name: row.name, code: row.code, description: row.description, resourceKind: resourceKindByCode(row.code) })),
    ...npcs[0].map(row => ({ type: row.interaction_kind === 'building' ? '建筑' as const : 'NPC' as const, id: row.code, name: row.name, code: row.code, description: row.description, interactionKind: row.interaction_kind })),
    ...objects[0].map(row => ({ type: '地标' as const, id: row.code, name: row.name, code: row.code, description: row.description })),
    ...players[0].map(row => ({ type: '玩家' as const, id: String(row.game_id), name: row.name, description: `你在这里遇见了【${row.name}】。`, gameId: Number(row.game_id) }))
  ];
  if (regionCode === 'dark_forest') {
    const entrance = await dungeonEntranceAt(connection, Number(character.current_region_id), Number(character.pos_x), Number(character.pos_y));
    if (entrance) targets.push({ type: '入口', id: String(entrance.id), name: '地下迷宫入口', description: entrance.description });
  }
  return targets;
};

export const coordinateInteractionTargets = async (qqUserId: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  if (await isInHome(pool, Number(character.id))) return { character, targets: [] as CoordinateInteractionTarget[] };
  const [regions] = await pool.execute<(RowDataPacket & { code: string })[]>('SELECT code FROM map_regions WHERE id=? LIMIT 1', [character.current_region_id]);
  return { character, targets: await coordinateInteractionTargetsFor(pool, character, regions[0]?.code) };
};

export const coordinateInteraction = async (qqUserId: string, type: CoordinateInteractionTarget['type'], id: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  if (await isInHome(connection, Number(character.id))) throw new Error('你正在自己的家园中，请使用“/家园”管理小屋。');
  const [regions] = await connection.execute<(RowDataPacket & { code: string })[]>('SELECT code FROM map_regions WHERE id=? LIMIT 1', [character.current_region_id]);
  const target = (await coordinateInteractionTargetsFor(connection, character, regions[0]?.code)).find(item => item.type === type && item.id === id);
  if (!target) throw new Error('该目标已离开当前位置。');
  if (target.type === '入口') {
    const entrance = await dungeonEntranceAt(connection, Number(character.current_region_id), Number(character.pos_x), Number(character.pos_y));
    if (!entrance || String(entrance.id) !== id) throw new Error('地下迷宫入口已消失。');
    const discovery = await discoverDungeonEntrance(connection, Number(character.id), entrance.id, Number(character.current_region_id), Number(character.pos_x), Number(character.pos_y));
    return { character, kind: 'dungeon_entrance' as const, entrance, discovery, text: entrance.description };
  }
  if (target.type === '资源') return { character, kind: 'resource' as const, resource: { id: Number(target.id), code: target.code!, name: target.name, description: target.description, kind: target.resourceKind! }, text: `你发现了一处${target.resourceKind}·${target.name}。${target.description}` };
  if (target.type === 'NPC' || target.type === '建筑') return { character, kind: 'npc' as const, npc: { code: target.code!, name: target.name, description: target.description, interaction_kind: target.interactionKind! }, text: target.description };
  return { character, kind: 'object' as const, text: target.type === '玩家' ? target.description : target.description };
});

export const moveTo = async (qqUserId: string, x: number, y: number, options: { destinationKind?: 'normal' | 'home' } = {}) => {
  if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error('目标坐标必须为整数。');
  const carry = await inventory(qqUserId);
  return withTransaction(async connection => {
    const character = await characterFor(qqUserId); if (await isInHome(connection, Number(character.id))) throw new Error('你正在自己的家园中，请先使用“/家园 出门”。'); await ensureForestGuideFreeAction(connection, Number(character.id)); const distance = Math.abs(x - Number(character.pos_x)) + Math.abs(y - Number(character.pos_y));
    if (character.region_name === '地下迷宫') throw new Error('地下迷宫中无法直接前往远处，请使用上下左右移动探索路线。');
    const [regions] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM map_regions WHERE ? BETWEEN min_x AND max_x AND ? BETWEEN min_y AND max_y AND ? BETWEEN min_z AND max_z ORDER BY danger_level DESC LIMIT 1', [x, y, character.pos_z]); const region = regions[0];
    if (!region) throw new Error('前面的区域，以后再来探索吧！');
    const sameRegion = Number(region.id) === Number(character.current_region_id);
    const currentMapUnlocked = await hasRegionMap(connection, Number(character.id), character.region_name);
    const targetMapUnlocked = await hasRegionMap(connection, Number(character.id), region.name);
    if (!sameRegion && !targetMapUnlocked) throw new Error('尚未解锁目标区域地图，无法前往。');
    if (sameRegion && (!currentMapUnlocked || distance <= carry.movementSpeed)) return moveToPosition(connection, qqUserId, x, y, true, carry.movementSpeed);
    ensureActionAvailable(character);
    const [mining] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_resource_mining WHERE character_id=? LIMIT 1 FOR UPDATE', [character.id]);
    if (mining[0]) throw new Error('你正在开采资源，请先完成或取消开采。');
    const [combat] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state=\'active\' LIMIT 1 FOR UPDATE', [character.id]);
    if (combat[0]) throw new Error('战斗尚未结束，无法移动。');
    const [encounters] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM monster_spawns s WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL AND ${visiblePursuitCondition('s')} LIMIT 1 FOR UPDATE`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id]);
    const [escapeTokens] = await connection.execute<RowDataPacket[]>('SELECT character_id FROM encounter_escape_tokens WHERE character_id=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? FOR UPDATE', [character.id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
    if (encounters[0] && !escapeTokens[0]) throw new Error('当前格子存在敌对生物，请先选择战斗、交涉或躲避。');
    // 远距离前往在抵达前不会更新角色坐标；躲避资格保留至到达结算，
    // 由 moveToPosition 在真正离开当前遭遇格时消耗。
    const [existing] = await connection.execute<(RowDataPacket & { activity_type: 'move' | 'hunt' })[]>('SELECT activity_type FROM player_travels WHERE character_id=? FOR UPDATE', [character.id]); if (existing[0]) throw new Error(existing[0].activity_type === 'hunt' ? '你正在寻怪，请等待完成或取消寻怪。' : '你正在前往目标地点，请等待抵达或取消移动。');
    const seconds = Math.max(1, Math.ceil(distance / carry.movementSpeed));
    const [landmarks] = await connection.execute<(RowDataPacket & { name: string })[]>('SELECT name FROM map_npcs WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND interaction_kind=\'building\' LIMIT 1', [region.id, x, y, character.pos_z]);
    const destinationKind = options.destinationKind ?? 'normal';
    await connection.execute("INSERT INTO player_travels (character_id,region_id,target_x,target_y,target_z,activity_type,destination_kind,arrival_at) VALUES (?,?,?,?,?,'move',?,DATE_ADD(NOW(),INTERVAL ? SECOND))", [character.id, region.id, x, y, character.pos_z, destinationKind, seconds]);
    return { kind: 'travel' as const, regionName: region.name, destinationName: landmarks[0]?.name, destinationKind, x, y, seconds, remaining: seconds };
  });
};

/** 感知范围内的怪物可直接突进攻击：到达目标格后立即交由战斗系统锁定。 */
export const moveToNearbyMonster = async (qqUserId: string, spawnId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [targets] = await connection.execute<(RowDataPacket & { pos_x: number; pos_y: number })[]>(`SELECT pos_x,pos_y FROM monster_spawns s
    WHERE id=? AND region_id=? AND pos_z=? AND defeated_at IS NULL AND ${visiblePursuitCondition('s')} FOR UPDATE`, [spawnId, character.current_region_id, character.pos_z, character.id]);
  const target = targets[0];
  if (!target) throw new Error('该怪物已离开你的感知范围。');
  const x = Number(target.pos_x); const y = Number(target.pos_y);
  const distance = Math.abs(x - Number(character.pos_x)) + Math.abs(y - Number(character.pos_y));
  const range = character.region_name === '地下迷宫' ? 1 : perceptionRange(finalAttribute(character, 'perception'), Number(character.level));
  if (distance > range) throw new Error('该怪物已离开你的感知范围。');
  if (!distance) {
    const encounter = await currentEncounter(qqUserId);
    if (!encounter?.spawns.some(spawn => Number(spawn.id) === spawnId)) throw new Error('该怪物已离开当前位置。');
    return { canAmbush: Boolean(encounter.canAmbush) };
  }
  const moved = await moveToPosition(connection, qqUserId, x, y, true);
  if (moved.kind !== 'encounter' || !moved.spawns.some(spawn => Number(spawn.id) === spawnId)) throw new Error('该怪物已离开当前位置。');
  return { canAmbush: Boolean(moved.canAmbush) };
});
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
  const character = await characterFor(qqUserId); if (await isInHome(connection, Number(character.id))) throw new Error('你正在自己的家园中，请先使用“/家园 出门”。'); await ensureForestGuideFreeAction(connection, Number(character.id)); ensureActionAvailable(character);
  if (character.region_name === '地下迷宫') throw new Error('地下迷宫内无法寻怪，请沿通路自行探索。');
  const [travels] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_travels WHERE character_id=? FOR UPDATE', [character.id]);
  if (travels[0]) throw new Error('你正在进行移动或寻怪，请等待完成或取消当前行动。');
  const [mining] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_resource_mining WHERE character_id=? LIMIT 1 FOR UPDATE', [character.id]);
  if (mining[0]) throw new Error('你正在开采资源，请先完成或取消开采。');
  const [combat] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state=\'active\' LIMIT 1 FOR UPDATE', [character.id]);
  if (combat[0]) throw new Error('战斗尚未结束，无法寻怪。');
  const [encounter] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM monster_spawns WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL LIMIT 1 FOR UPDATE', [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (encounter[0]) throw new Error('当前格子存在敌对生物，请先选择战斗、交涉或躲避。');
  const [partyRows] = await connection.execute<(RowDataPacket & { leader_character_id: number })[]>('SELECT p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=?', [character.id]);
  if (partyRows[0] && Number(partyRows[0].leader_character_id) !== Number(character.id)) throw new Error('组队状态下仅队长可以寻怪。');
  const [recentRows] = await connection.execute<(RowDataPacket & { spawn_id: number })[]>('SELECT spawn_id FROM player_hunt_history WHERE character_id=? ORDER BY id DESC LIMIT 3 FOR UPDATE', [character.id]);
  const recentIds = recentRows.map(row => Number(row.spawn_id));
  const recentCondition = recentIds.length ? ` AND id NOT IN (${recentIds.map(() => '?').join(',')})` : '';
  const [targets] = await connection.execute<(RowDataPacket & { id: number; pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT id,pos_x,pos_y,pos_z FROM monster_spawns
    WHERE region_id=? AND pos_z=? AND defeated_at IS NULL${recentCondition}
    ORDER BY ABS(pos_x-?)+ABS(pos_y-?),id LIMIT 1 FOR UPDATE`, [character.current_region_id, character.pos_z, ...recentIds, character.pos_x, character.pos_y]);
  if (!targets[0]) throw new Error('当前地图没有未寻过的怪物，请等待新的怪物刷新。');
  const target = targets[0]; if (!target) throw new Error('当前地图没有可寻找的怪物。');
  const x = Number(target.pos_x); const y = Number(target.pos_y); const z = Number(target.pos_z);
  const seconds = Math.max(1, Math.abs(x - Number(character.pos_x)) + Math.abs(y - Number(character.pos_y)));
  await connection.execute('INSERT INTO player_hunt_history (character_id,spawn_id) VALUES (?,?)', [character.id, target.id]);
  const [expiredRows] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM player_hunt_history WHERE character_id=? ORDER BY id DESC LIMIT 18446744073709551615 OFFSET 3 FOR UPDATE', [character.id]);
  if (expiredRows.length) await connection.execute(`DELETE FROM player_hunt_history WHERE id IN (${expiredRows.map(() => '?').join(',')})`, expiredRows.map(row => row.id));
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
/** 物理克制优先显示克制/抵抗；元素伤害按精通减抗性后的实际增减伤显示。 */
const affinityTag = (physicalMultiplier: number, elementalMultiplierValue: number) => {
  if (physicalMultiplier < 1 || elementalMultiplierValue < 1) return '[抵抗]';
  if (physicalMultiplier > 1 || elementalMultiplierValue > 1.25) return '[克制]';
  if (elementalMultiplierValue > 1) return '[有效]';
  return '';
};

export const travelStatus = async (qqUserId: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool(); const [rows] = await pool.execute<(RowDataPacket & { target_x: number; target_y: number; target_z: number; activity_type: 'move' | 'hunt'; destination_kind: 'normal' | 'home'; seconds: number; remaining: number; region_name: string; destination_name: string | null })[]>(`SELECT t.target_x,t.target_y,t.target_z,t.activity_type,t.destination_kind,
    GREATEST(1,TIMESTAMPDIFF(SECOND,t.started_at,t.arrival_at)) AS seconds,
    GREATEST(0,CEIL(TIMESTAMPDIFF(MICROSECOND,NOW(6),t.arrival_at)/1000000)) AS remaining,
    r.name AS region_name,n.name AS destination_name
    FROM player_travels t JOIN map_regions r ON r.id=t.region_id
    LEFT JOIN map_npcs n ON n.region_id=t.region_id AND n.pos_x=t.target_x AND n.pos_y=t.target_y AND n.pos_z=t.target_z AND n.interaction_kind='building'
    WHERE t.character_id=?`, [character.id]); const travel = rows[0];
  if (!travel) return null; const remaining = Math.max(0, Number(travel.remaining));
  const seconds = Math.max(1, Number(travel.seconds));
  return { x: Number(travel.target_x), y: Number(travel.target_y), z: Number(travel.target_z), activityType: travel.activity_type, destinationKind: travel.destination_kind, regionName: travel.region_name, destinationName: travel.destination_name ?? undefined, seconds, remaining };
};

export const completeTravel = async (qqUserId: string) => {
  const completed = await withTransaction(async connection => {
    const character = await characterFor(qqUserId); const [rows] = await connection.execute<(RowDataPacket & { target_x: number; target_y: number; target_z: number; activity_type: 'move' | 'hunt'; destination_kind: 'normal' | 'home'; arrived: number })[]>('SELECT target_x,target_y,target_z,activity_type,destination_kind,arrival_at<=NOW(6) AS arrived FROM player_travels WHERE character_id=? FOR UPDATE', [character.id]); const travel = rows[0]; if (!travel || !Number(travel.arrived)) return null;
    await connection.execute('DELETE FROM player_travels WHERE character_id=?', [character.id]);
    const result = await moveToPosition(connection, qqUserId, Number(travel.target_x), Number(travel.target_y), false);
    return { ...result, arrivalActivity: travel.activity_type, destinationKind: travel.destination_kind };
  });
  if (!completed || completed.destinationKind !== 'home') return completed;
  const { enterHome } = await import('./home.service');
  return { ...completed, homeEntry: await enterHome(qqUserId) };
};

/**
 * 延时移动会保存在数据库中；这个补偿结算用于覆盖热重载、进程重启或单次计时器丢失。
 * 它只结算位置和事件，原消息的到达提示仍由当前会话中的计时器负责发送。
 */
export const settleDueTravels = async () => {
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { qq_user_id: string })[]>(`SELECT p.qq_user_id
    FROM player_travels t JOIN characters c ON c.id=t.character_id JOIN players p ON p.id=c.player_id
    -- 被动到达回复依赖原消息计时器。预留两分钟用于数据库波动重试，避免后台补偿先结算并吞掉通知。
    -- 仅热重载、进程重启等导致内存计时器确实丢失时，才由这里修正玩家坐标。
    WHERE t.arrival_at<=DATE_SUB(NOW(6),INTERVAL 120 SECOND) ORDER BY t.arrival_at LIMIT 100`);
  let settled = 0;
  for (const row of rows) {
    try { if (await completeTravel(String(row.qq_user_id))) settled += 1; } catch {
      // 移动目的地在到达前发生状态变化时保留记录，下一轮可继续安全重试。
    }
  }
  return settled;
};


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

type ResourceMiningStatus = { resourceId: number; name: string; kind: ReturnType<typeof resourceKindByCode>; seconds: number; remaining: number; finished: boolean };
export const resourceMiningStatus = async (qqUserId: string): Promise<ResourceMiningStatus | null> => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { resource_id: number; code: string; name: string; seconds: number; remaining: number })[]>(`SELECT m.resource_id,i.code,i.name,COALESCE(TIMESTAMPDIFF(SECOND,m.started_at,m.finishes_at),0) AS seconds,
    GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),m.finishes_at)) AS remaining FROM player_resource_mining m
    JOIN resource_spawns rs ON rs.id=m.resource_id JOIN item_definitions i ON i.id=rs.item_id WHERE m.character_id=?`, [character.id]);
  const row = rows[0]; return row ? { resourceId: Number(row.resource_id), name: row.name, kind: resourceKindByCode(row.code), seconds: Number(row.seconds), remaining: Number(row.remaining), finished: Number(row.remaining) <= 0 } : null;
};
export const cancelResourceMining = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); const [result] = await connection.execute<any>('DELETE FROM player_resource_mining WHERE character_id=?', [character.id]);
  if (!Number(result.affectedRows)) throw new Error('当前没有正在进行的资源开采。');
});
export const mineResource = async (qqUserId: string, resourceId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  if (await isInHome(connection, Number(character.id))) throw new Error('你正在自己的家园中，请先使用“/家园 出门”。');
  await ensureForestGuideFreeAction(connection, Number(character.id)); ensureActionAvailable(character);
  const [miningRows] = await connection.execute<(RowDataPacket & { resource_id: number; item_id: number; code: string; name: string; finishes_at: Date })[]>(`SELECT m.resource_id,rs.item_id,i.code,i.name,m.finishes_at FROM player_resource_mining m
    JOIN resource_spawns rs ON rs.id=m.resource_id JOIN item_definitions i ON i.id=rs.item_id WHERE m.character_id=? FOR UPDATE`, [character.id]);
  const mining = miningRows[0];
  if (mining) {
    if (Number(mining.resource_id) !== resourceId) throw new Error('你正在开采另一处资源，请先完成或取消开采。');
    const remaining = Math.max(0, Math.ceil((new Date(mining.finishes_at).getTime() - Date.now()) / 1000));
    if (remaining > 0) return { state: 'mining' as const, name: mining.name, kind: resourceKindByCode(mining.code), seconds: 0, remaining };
    const [result] = await connection.execute<any>('UPDATE resource_spawns SET mined_at=NOW() WHERE id=? AND mined_at IS NULL', [mining.resource_id]);
    if (!Number(result.affectedRows)) throw new Error('这处资源已经被开采。');
    await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1,acquired_at=NOW()', [character.id, mining.item_id]);
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [character.id, mining.item_id]);
    await connection.execute('DELETE FROM player_resource_mining WHERE character_id=?', [character.id]);
    return { state: 'completed' as const, name: mining.name, kind: resourceKindByCode(mining.code), quantity: 1 };
  }
  const [resources] = await connection.execute<(RowDataPacket & { id: number; item_id: number; code: string; name: string })[]>(`SELECT rs.id,rs.item_id,i.code,i.name FROM resource_spawns rs JOIN item_definitions i ON i.id=rs.item_id
    WHERE rs.id=? AND rs.region_id=? AND rs.pos_x=? AND rs.pos_y=? AND rs.pos_z=? AND rs.mined_at IS NULL FOR UPDATE`, [resourceId, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  const resource = resources[0]; if (!resource) throw new Error('这处资源已经被开采，或你已离开资源点。');
  const [otherMiners] = await connection.execute<RowDataPacket[]>('SELECT character_id FROM player_resource_mining WHERE resource_id=? FOR UPDATE', [resource.id]);
  if (otherMiners[0]) throw new Error('这处资源正在被其他冒险者开采。');
  const [monsters] = await connection.execute<RowDataPacket[]>('SELECT id FROM monster_spawns WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL LIMIT 1 FOR UPDATE', [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (monsters[0]) throw new Error('资源旁仍有敌对生物，先结束战斗才能开采。');
  const seconds = miningSecondsByCode[resource.code] ?? 30 * 60;
  await connection.execute('INSERT INTO player_resource_mining (character_id,resource_id,finishes_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL ? SECOND))', [character.id, resource.id, seconds]);
  return { state: 'started' as const, name: resource.name, kind: resourceKindByCode(resource.code), seconds, remaining: seconds };
});

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
    await recalculateCharacterStats(connection, Number(companion.id));
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

/** 每次进入战斗或发动交涉都会结算一次体力；NPC 队友不参与体力及奖励判定。 */
const consumeEncounterStamina = async (connection: PoolConnection, members: CharacterRow[]) => {
  const eligible = new Map<number, boolean>();
  for (const member of members) {
    if (member.npc_code) { eligible.set(Number(member.id), true); continue; }
    const state = await refreshCharacterStamina(connection, Number(member.id));
    const canReceiveRewards = state.stamina >= 1;
    eligible.set(Number(member.id), canReceiveRewards);
    if (canReceiveRewards) await connection.execute('UPDATE characters SET stamina=stamina-1 WHERE id=?', [member.id]);
  }
  return eligible;
};

const activeCombatFor = async (connection: PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { combat_id: string; turn_no: number; opening_damage_bonus: number; cooldowns: unknown })[]>(`SELECT cs.id AS combat_id,cs.turn_no,cs.opening_damage_bonus,cs.cooldowns FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id
    WHERE cm.character_id=? AND cs.state='active' LIMIT 1 FOR UPDATE`, [characterId]);
  return rows[0];
};

const combatMembers = async (connection: PoolConnection, sessionId: string) => {
  const [rows] = await connection.execute<CombatMemberRow[]>(`SELECT c.*,r.name AS region_name,cm.current_hp,cm.current_mp,cm.selected_target_id,cm.pending_action,cm.cooldowns,cm.stamina_eligible,cm.is_defeated
    FROM combat_members cm JOIN characters c ON c.id=cm.character_id JOIN map_regions r ON r.id=c.current_region_id WHERE cm.session_id=? ORDER BY c.id FOR UPDATE`, [sessionId]);
  return rows;
};

const combatTargets = async (connection: PoolConnection, sessionId: string, revealTraits = false) => {
  const [rows] = await connection.execute<CombatTargetRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json,t.element_mastery_json,t.element_resistance_json,ct.current_mp,ct.cooldowns,ct.is_defeated
    FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=? ORDER BY s.id FOR UPDATE`, [sessionId]);
  return materializeMonsters(rows, revealTraits);
};

export const chooseTarget = async (qqUserId: string, spawnId: number, ambush = false, retreatPosition?: CombatRetreatPosition) => withTransaction(async connection => {
  let character = await characterFor(qqUserId); let members = await partyCombatants(connection, character);
  for (const member of members) await recalculateCharacterStats(connection, Number(member.id));
  members = await partyCombatants(connection, character); character = members.find(member => Number(member.id) === Number(character.id)) ?? character;
  ensureActionAvailable(character); if (members.some(member => member.activity_status === 'resting')) throw new Error('队伍中有人正在休息，无法进入战斗。');
  const [existing] = await connection.execute<RowDataPacket[]>(`SELECT cs.id FROM combat_sessions cs JOIN combat_members cm ON cm.session_id=cs.id WHERE cm.character_id IN (${members.map(() => '?').join(',')}) AND cs.state='active' LIMIT 1 FOR UPDATE`, members.map(member => member.id));
  if (existing[0]) throw new Error('队伍正在战斗中，请先结束当前战斗。');
  const storyStatus = await forestGuideStatusFor(connection, Number(character.id));
  const [spawnRows] = await connection.execute<(SpawnRow & { template_code: string })[]>(`SELECT s.id,s.template_id,t.code AS template_code,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json,t.element_mastery_json,t.element_resistance_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL AND ${visiblePursuitCondition('s')} FOR UPDATE`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id]);
  const appraisal = await appraisalProfileFor(connection, [character.id]);
  const spawns = materializeMonsters(spawnRows, appraisal.informationLevel >= 2);
  const selected = spawns.find(spawn => Number(spawn.id) === spawnId); if (!selected) throw new Error('目标已离开当前位置或已被击败。');
  const selectedRow = spawnRows.find(spawn => Number(spawn.id) === spawnId);
  if (storyStatus && storyStatus !== 'completed' && !(['joined', 'declined'].includes(storyStatus) && selectedRow?.template_code === 'forest_slime')) throw new Error('你正在推进「初章·包容之镇」，请先完成当前剧情。');
  const [occupied] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=? AND cs.state='active' LIMIT 1 FOR UPDATE`, [spawnId]);
  if (occupied[0]) throw new Error('该目标正在与其他队伍战斗。你可以选择伏击等待，或离开此处。');
  const canAmbush = members.every(member => Number(member.speed) > Math.max(...spawns.map(spawn => monsterCombatStats(spawn).speed)));
  if (ambush && !canAmbush) throw new Error('队伍速度不足，无法发动偷袭。');
  let actualRetreat = retreatPosition;
  if (!actualRetreat) {
    const [retreatRows] = await connection.execute<(RowDataPacket & { retreat_region_id: number; retreat_x: number; retreat_y: number; retreat_z: number })[]>(`SELECT retreat_region_id,retreat_x,retreat_y,retreat_z FROM dungeon_encounter_retreats
      WHERE character_id=? AND encounter_region_id=? AND encounter_x=? AND encounter_y=? AND encounter_z=? LIMIT 1 FOR UPDATE`, [character.id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
    const retreat = retreatRows[0]; if (retreat) actualRetreat = { regionId: Number(retreat.retreat_region_id), x: Number(retreat.retreat_x), y: Number(retreat.retreat_y), z: Number(retreat.retreat_z) };
  }
  const id = randomUUID();
  const staminaEligibility = await consumeEncounterStamina(connection, members);
  await connection.execute('INSERT INTO combat_sessions (id,character_id,spawn_id,player_hp,player_mp,cooldowns,opening_damage_bonus) VALUES (?,?,?,?,?,?,?)', [id, character.id, spawns[0].id, character.current_hp, character.current_mp, JSON.stringify(actualRetreat ? { dungeonRetreat: actualRetreat } : {}), ambush ? .5 : 0]);
  for (const member of members) await connection.execute('INSERT INTO combat_members (session_id,character_id,current_hp,current_mp,selected_target_id,cooldowns,stamina_eligible) VALUES (?,?,?,?,?,JSON_OBJECT(),?)', [id, member.id, member.current_hp, member.current_mp, selected.id, staminaEligibility.get(Number(member.id)) ? 1 : 0]);
  for (const spawn of spawns) { await connection.execute('INSERT INTO combat_targets (session_id,spawn_id,current_mp,cooldowns) VALUES (?,?,?,JSON_OBJECT())', [id, spawn.id, monsterCombatStats(spawn).mpMax]); for (const member of members) await connection.execute('INSERT INTO combat_threat (session_id,spawn_id,character_id,threat) VALUES (?,?,?,1)', [id, spawn.id, member.id]); }
  return { character, spawn: selected, spawns, members, ambush };
});

export const queueAmbush = async (qqUserId: string, spawnId: number, delivery?: AmbushDelivery) => withTransaction(async connection => {
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
  await connection.execute(`INSERT INTO combat_ambushes (spawn_id,character_id,status,ready_spawn_id,handoff_kind,source_session_id,opponent_character_id,delivery_scope,delivery_target_id,delivery_bot_id)
    VALUES (?,?, 'waiting',NULL,NULL,NULL,NULL,?,?,?)
    ON DUPLICATE KEY UPDATE status='waiting',ready_spawn_id=NULL,handoff_kind=NULL,source_session_id=NULL,opponent_character_id=NULL,
      delivery_scope=VALUES(delivery_scope),delivery_target_id=VALUES(delivery_target_id),delivery_bot_id=VALUES(delivery_bot_id)`, [
    spawnId, character.id, delivery?.scope ?? null, delivery?.targetId ?? null, delivery?.botId ?? null
  ]);
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
    const damage = strike.hit ? directDamageVariance(strike.damage) : 0; const oldHp = Number(victim.current_hp); if (strike.hit) { victim.current_hp = Math.max(0, oldHp - damage); if (!victim.current_hp) victim.is_defeated = 1; if (skill) await applySkillEffects(connection, session.combat_id, Number(skill.id), attacker, 'target', victim, 'member', 'on_hit', actionLog); }
    await connection.execute('UPDATE combat_members SET current_hp=?,is_defeated=? WHERE session_id=? AND character_id=?', [victim.current_hp, victim.is_defeated ? 1 : 0, session.combat_id, victim.id]);
    await connection.execute('UPDATE combat_targets SET current_mp=?,cooldowns=? WHERE session_id=? AND spawn_id=?', [attacker.current_mp, JSON.stringify(cooldowns), session.combat_id, attacker.id]);
    await connection.execute('UPDATE combat_sessions SET turn_no=turn_no+1 WHERE id=?', [session.combat_id]);
    const actionText = skill ? `释放技能「${skill.name}」` : '普通攻击';
    const result = !strike.hit ? `【${attacker.name}】${actionText}\n➥【${victim.name}】闪避了攻击。` : `【${attacker.name}】${actionText}\n➥对【${victim.name}】造成 ${damage} 点${kind}伤害(${oldHp}→${victim.current_hp})${actionLog.length ? `\n${actionLog.join('\n')}` : ''}`;
    return { started, log: `交涉失败！全队错失第一回合行动。\n${result}` };
  });
};

export const encounterAction = async (qqUserId: string, spawnId: number, action: 'avoid' | 'persuade') => {
  const found = await explore(qqUserId);
  const spawn = found.spawns.find(item => item.id === spawnId);
  if (!spawn) throw new Error('该目标不在当前位置。');
  const primary = found.spawns[0];
  if (action === 'avoid') {
    return withTransaction(async connection => {
      const character = await characterFor(qqUserId); const members = await partyCombatants(connection, character); const monster = monsterCombatStats(primary);
      const canAvoid = Number(character.perception) > monster.perception || Number(character.speed) > monster.speed;
      const clearPursuit = async () => {
        if (isCityPursuit(primary)) await connection.execute(`UPDATE monster_spawns SET current_hp=0,defeated_at=NOW()
          WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL
            AND JSON_CONTAINS(COALESCE(traits_json,JSON_ARRAY()),JSON_OBJECT('code','city_pursuit','pursuit_target_id',?))`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id]);
      };
      const [retreatRows] = await connection.execute<(RowDataPacket & { retreat_region_id: number; retreat_x: number; retreat_y: number; retreat_z: number })[]>(`SELECT retreat_region_id,retreat_x,retreat_y,retreat_z FROM dungeon_encounter_retreats
        WHERE character_id=? AND encounter_region_id=? AND encounter_x=? AND encounter_y=? AND encounter_z=? LIMIT 1 FOR UPDATE`, [character.id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
      const retreat = retreatRows[0];
      const retreatToPreviousCell = async () => {
        if (!retreat) return false;
        for (const member of members) await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE id=?', [retreat.retreat_region_id, retreat.retreat_x, retreat.retreat_y, retreat.retreat_z, member.id]);
        await connection.execute(`DELETE FROM dungeon_encounter_retreats WHERE character_id IN (${members.map(() => '?').join(',')})`, members.map(member => member.id));
        // 退格仍有怪物时，把刚离开的格子作为下一场遭遇的来路，确保可继续后退。
        const [nextSpawns] = await connection.execute<RowDataPacket[]>('SELECT id FROM monster_spawns WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL LIMIT 1 FOR UPDATE', [retreat.retreat_region_id, retreat.retreat_x, retreat.retreat_y, retreat.retreat_z]);
        if (nextSpawns[0]) for (const member of members) await connection.execute(`INSERT INTO dungeon_encounter_retreats
          (character_id,encounter_region_id,encounter_x,encounter_y,encounter_z,retreat_region_id,retreat_x,retreat_y,retreat_z)
          VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE encounter_region_id=VALUES(encounter_region_id),encounter_x=VALUES(encounter_x),encounter_y=VALUES(encounter_y),encounter_z=VALUES(encounter_z),retreat_region_id=VALUES(retreat_region_id),retreat_x=VALUES(retreat_x),retreat_y=VALUES(retreat_y),retreat_z=VALUES(retreat_z)`, [member.id, retreat.retreat_region_id, retreat.retreat_x, retreat.retreat_y, retreat.retreat_z, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
        return true;
      };
      if (!retreat) for (const member of members) await connection.execute('INSERT INTO encounter_escape_tokens (character_id,region_id,pos_x,pos_y,pos_z) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE region_id=VALUES(region_id),pos_x=VALUES(pos_x),pos_y=VALUES(pos_y),pos_z=VALUES(pos_z)', [member.id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
      if (canAvoid) {
        const retreated = await retreatToPreviousCell(); await clearPursuit();
        return retreated ? '你抢在敌人反应之前沿来路退回上一格。' : '你抢在敌人反应之前脱离了遭遇，可以继续移动。';
      }
      const victim = members.find(member => Number(member.id) === Number(character.id)) ?? character; const strike = resolveStrike(monster.physicalAttack, Number(victim.physical_defense), monster.accuracy, Number(victim.evasion), monster.crit, Number(victim.crit_resist_bp), monster.critDamage, Number(victim.crit_damage_reduction_bp));
      const retreatText = await retreatToPreviousCell() ? '你们仍成功沿来路退回上一格。' : '你们仍成功脱离遭遇，可以继续移动。';
      if (strike.hit) await connection.execute('UPDATE characters SET current_hp=GREATEST(1,current_hp-?) WHERE id=?', [strike.damage, victim.id]);
      await clearPursuit();
      return !strike.hit ? `躲避不及，${primary.name} 发起追击，但【${victim.name}】闪避了。\n${retreatText}` : `躲避不及，${primary.name} 发起追击，对【${victim.name}】造成 ${strike.damage} 点物理伤害。\n${retreatText}`;
    });
  }
  if (action === 'persuade') {
    if (isCityPursuit(primary)) {
      const failed = await negotiationFailureOpening(qqUserId, spawnId);
      return `执法者拒绝了你的交涉。\n${failed.log}`;
    }
    const success = await withTransaction(async connection => {
      let character = await characterFor(qqUserId); let members = await partyCombatants(connection, character);
      const [targets] = await connection.execute<(SpawnRow & { code: string })[]>(`SELECT s.id,s.template_id,t.code,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,${monsterAttributeColumns},t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.id=? AND s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL FOR UPDATE`, [spawnId, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
      const target = targets[0]; if (!target) throw new Error('该目标已离开当前位置。');
      const bestNegotiation = Math.max(...members.filter(member => !member.npc_code).map(member => Math.max(1, Math.floor(Number(member.constitution) + Number(member.spirit) * 2 + Number(member.strength) + Number(member.intelligence) * 2))), 1);
      const monsterNegotiation = Math.max(1, Math.floor(Object.values(monsterAttributes(target)).reduce((total, value) => total + Number(value), 0)));
      const chance = negotiationChance(bestNegotiation, monsterNegotiation, target.monster_class, character.region_name === '地下迷宫');
      if (Math.random() >= chance) return null;
      const eligibility = await consumeEncounterStamina(connection, members);
      const rewardMembers = members.filter(member => !member.npc_code && eligibility.get(Number(member.id)));
      const partySize = Math.min(4, rewardMembers.length);
      const partyExperienceBonus = ({ 1: 0, 2: .1, 3: .2, 4: .35 } as Record<number, number>)[partySize] ?? 0;
      const partyDropBonus = ({ 1: 0, 2: .6, 3: 1, 4: 1.5 } as Record<number, number>)[partySize] ?? 0;
      const rewardLines: string[] = [];
      const dropsByMember = new Map<number, string[]>();
      const modifiersByMember = new Map<number, CombatModifiers>();
      for (const member of rewardMembers) {
        const modifiers = await modifiersFor(connection, Number(member.id)); modifiersByMember.set(Number(member.id), modifiers);
        const gain = await awardRealmExperience(connection, member, Math.max(1, Math.floor(Number(target.experience) * .2)) * (1 + partyExperienceBonus) * modifiers.experienceMultiplier);
        if (gain.gainedPoints) await recalculateCharacterStats(connection, Number(member.id));
        rewardLines.push(`【${member.name}】${gain.realmLocked ? realmEnergyDissipationText : `获得经验 ${gain.experience}${gain.gainedPoints ? `，升级至 Lv.${gain.level}` : ''}`}`);
      }
      for (const member of members.filter(member => !member.npc_code && !eligibility.get(Number(member.id)))) rewardLines.push(`【${member.name}】体力不足，未获得经验与战利品。`);
      const randomRecipient = () => rewardMembers[random(0, rewardMembers.length - 1)]!;
      for (const rawDrop of jsonArray(target.drops_json)) {
        const drop = jsonObject(rawDrop); if (!drop.code || !rewardMembers.length) continue;
        const recipient = randomRecipient(); const modifiers = modifiersByMember.get(Number(recipient.id))!;
        const traitBonus = percentBonus(traitList(target.traits_json), 'dropPct') / 100;
        if (Math.random() >= Math.min(1, Number(drop.chance ?? 1) * .2 * (1 + traitBonus + partyDropBonus) + modifiers.dropBonus)) continue;
        const [items] = await connection.execute<(RowDataPacket & { id: number; name: string; item_type: string })[]>('SELECT id,name,item_type FROM item_definitions WHERE code=?', [String(drop.code)]); const item = items[0]; if (!item) continue;
        for (let index = 0; index < dropQuantity(drop); index += 1) {
          const owner = randomRecipient();
          await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [owner.id, item.id]);
          if (item.item_type === 'equipment') await connection.execute('INSERT INTO player_item_instances (character_id,item_id) VALUES (?,?)', [owner.id, item.id]);
          else await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1,acquired_at=NOW()', [owner.id, item.id]);
          const list = dropsByMember.get(Number(owner.id)) ?? []; list.push(item.name); dropsByMember.set(Number(owner.id), list);
        }
      }
      for (const member of rewardMembers) {
        const drops = dropsByMember.get(Number(member.id)); if (drops?.length) rewardLines.push(`【${member.name}】获得 ${drops.join('、')}`);
      }
      await connection.execute('UPDATE monster_spawns SET current_hp=0,defeated_at=NOW() WHERE id=?', [target.id]);
      return `交涉成功！${negotiationSuccessText(target.code, target.name)}\n${rewardLines.join('\n')}`;
    });
    if (success) return success;
    const failed = await negotiationFailureOpening(qqUserId, spawnId); return failed.log;
  }
  throw new Error('未知的遇战操作。');
};

export const battleStatus = async (qqUserId: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [sessions] = await pool.execute<(RowDataPacket & { combat_id: string; turn_no: number })[]>(`SELECT cs.id AS combat_id,cs.turn_no FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state='active' LIMIT 1`, [character.id]);
  const session = sessions[0]; if (!session) throw new Error('当前不在战斗中。请移动到敌对生物所在格子。');
  const [members] = await pool.execute<CombatMemberRow[]>(`SELECT c.*,r.name AS region_name,cm.current_hp,cm.current_mp,cm.selected_target_id,cm.pending_action,cm.cooldowns,cm.stamina_eligible,cm.is_defeated FROM combat_members cm JOIN characters c ON c.id=cm.character_id JOIN map_regions r ON r.id=c.current_region_id WHERE cm.session_id=? ORDER BY c.id`, [session.combat_id]);
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
  const [members] = await pool.execute<CombatMemberRow[]>(`SELECT c.*,r.name AS region_name,cm.current_hp,cm.current_mp,cm.selected_target_id,cm.pending_action,cm.cooldowns,cm.stamina_eligible,cm.is_defeated FROM combat_members cm JOIN characters c ON c.id=cm.character_id JOIN map_regions r ON r.id=c.current_region_id WHERE cm.session_id=? ORDER BY c.id`, [session.combat_id]);
  const profile = await appraisalProfileFor(pool, members.map(member => Number(member.id))); if (!profile.learned) throw new Error('队伍中无人学会绑定技能「鉴识」。');
  const [targets] = await pool.execute<CombatTargetRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json,t.element_mastery_json,t.element_resistance_json,ct.current_mp,ct.cooldowns,ct.is_defeated
    FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=? ORDER BY s.id`, [session.combat_id]);
  let effects: CombatEffectRow[] = []; let threats: (RowDataPacket & { spawn_id: number; name: string; threat: number })[] = [];
  // 识珠 Lv.1 即可完整掌握己方状态；敌方状态仍按每个目标可满足的鉴识深度显示。
  if (profile.informationLevel >= 1) [effects] = await pool.execute<CombatEffectRow[]>('SELECT ce.id,ce.target_kind,ce.target_id,e.code,e.name,e.effect_type,ce.value,ce.stacks,ce.remaining_turns FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=?', [session.combat_id]);
  if (profile.informationLevel >= 3) [threats] = await pool.execute<(RowDataPacket & { spawn_id: number; name: string; threat: number })[]>('SELECT ct.spawn_id,c.name,ct.threat FROM combat_threat ct JOIN characters c ON c.id=ct.character_id WHERE ct.session_id=?', [session.combat_id]);
  const statusText = (targetKind: 'member' | 'target', targetId: number) => {
    const statuses = effects.filter(effect => effect.target_kind === targetKind && Number(effect.target_id) === targetId);
    return statuses.length ? statuses.map(effect => `${effect.name}${effect.stacks > 1 ? `×${effect.stacks}` : ''}(${effect.remaining_turns})`).join('、') : '无';
  };
  const elementText = (raw: unknown) => ['水', '火', '木', '土', '风', '冰', '雷', '光', '暗'].map(element => `${element}${Number(jsonObject(raw)[element] ?? 0) >= 0 ? '+' : ''}${Number(jsonObject(raw)[element] ?? 0)}`).join('｜');
  const weakestElementResistance = (raw: unknown) => {
    const values = ['水', '火', '木', '土', '风', '冰', '雷', '光', '暗'].map(element => ({ element, value: Number(jsonObject(raw)[element] ?? 0) }));
    const weakest = values.sort((left, right) => left.value - right.value || left.element.localeCompare(right.element, 'zh-CN'))[0];
    return weakest ? `${weakest.element}${weakest.value >= 0 ? '+' : ''}${weakest.value}` : '无';
  };
  const lines = ['我方状态'];
  for (const member of members) {
    lines.push(`【${member.name}】HP ${member.current_hp}/${member.hp_max}｜MP ${member.current_mp}/${member.mp_max}${member.is_defeated ? '（倒下）' : ''}`);
    lines.push(`六维：体${member.constitution} 精${member.spirit} 力${member.strength} 智${member.intelligence} 敏${member.agility} 感${member.perception}`);
    lines.push(`物攻 ${member.physical_attack}｜魔攻 ${member.magic_attack}｜物防 ${member.physical_defense}｜魔防 ${member.magic_defense}`);
    lines.push(`命中 ${member.accuracy}｜闪避 ${member.evasion}｜暴击 ${member.crit_rate_bp}｜暴伤 ${member.crit_damage_bp}｜暴免 ${member.crit_resist_bp}｜暴抗 ${member.crit_damage_reduction_bp}`);
    lines.push(`韧性 ${member.tenacity}｜速度 ${member.speed}`);
    lines.push(`元素精通：${elementText(member.element_mastery_json)}`);
    lines.push(`元素抗性：${elementText(member.element_resistance_json)}`);
    lines.push(`状态：${statusText('member', Number(member.id))}`);
  }
  lines.push('', '敌方状态');
  for (const raw of targets) {
    if (isSummonedMonster(raw) && raw.is_defeated) continue;
    const observer = appraisalForTarget(profile, Number(raw.level)); const target = materializeMonster(raw, Number(observer?.informationLevel ?? 0) >= 2); if (!observer) { lines.push('【???】数据无法解析。'); continue; }
    lines.push(`【${target.name}】HP ${target.current_hp}/${target.hp_max}｜MP ${target.current_mp}/${monsterCombatStats(target).mpMax}`);
    if (observer.informationLevel >= 2) { const stats = monsterCombatStats(target); lines.push(`词条：${traitList(target.traits_json).map(trait => trait.name).join('、') || '无'}｜物攻 ${stats.physicalAttack}｜魔攻 ${stats.magicAttack}｜物防 ${stats.physicalDefense}｜魔防 ${stats.magicDefense}｜命中 ${stats.accuracy}｜闪避 ${stats.evasion}`); }
    if (observer.informationLevel >= 3) { const threat = threats.filter(item => Number(item.spawn_id) === Number(target.id)).sort((left, right) => Number(right.threat) - Number(left.threat))[0]; lines.push(`状态：${statusText('target', Number(target.id))}｜目标仇恨：${threat ? threat.name : '无'}`); }
    if (observer.informationLevel >= 4) { const className: Record<string, string> = { normal: '普通', elite: '精英', boss: '首领' }; const attrs = monsterAttributes(target); lines.push(`种族：${className[target.monster_class] ?? target.monster_class}｜物理抗性：${stringList(target.resistance_json).join('、') || '无'}｜元素抗性（最弱）：${weakestElementResistance(target.element_resistance_json)}\n六维：体${attrs.constitution} 精${attrs.spirit} 力${attrs.strength} 智${attrs.intelligence} 敏${attrs.agility} 感${attrs.perception}`); }
  }
  return { text: lines.join('\n') };
};

export const monsterDetail = async (qqUserId: string, spawnId: number) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const appraisal = await appraisalProfileFor(pool, [character.id]);
  if (!appraisal.learned) throw new Error('尚未学会绑定技能「鉴识」，无法查看怪物词条与属性。');
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

const negotiationChance = (negotiation: number, monsterResistance: number, monsterClass: string, inDungeon: boolean) => {
  const tuning = monsterClass === 'boss' ? { resistance: 8, rate: .25, cap: .08 }
    : monsterClass === 'elite' ? { resistance: 2.8, rate: .45, cap: .28 }
      : monsterClass === 'large' ? { resistance: 2.2, rate: .5, cap: .38 }
        : { resistance: 1.6, rate: .55, cap: .5 };
  const chance = opposedChance(negotiation, monsterResistance * tuning.resistance) * tuning.rate * (inDungeon ? .25 : 1);
  return Math.max(monsterClass === 'boss' ? .003 : .01, Math.min(tuning.cap, chance));
};

const negotiationSuccessText = (code: string, name: string) => ({
  ball_rabbit: '球兔竖起长耳听完你的话，鼻尖轻轻抽动，抱着草根一蹦一跳地钻进了灌木。',
  roll_rabbit: '滚兔狐疑地绕着你转了半圈，最终把缩起的身子舒展开，滚向了更深的草丛。',
  spike_boar: '刺猪哼哼两声，前蹄刨了刨泥土，收起戒备后调头离开。',
  tusk_boar: '獠猪盯着你看了许久，重重喷出一口白气，带着泥点消失在林间。',
  vine_snake: '藤蛇在枝叶间吐出信子，感到你没有敌意后，顺着藤蔓无声游远。',
  vine_python: '藤蚺缓缓松开盘起的身躯，粗大的鳞片擦过树皮，退入浓密的树冠。',
  black_bear: '乌熊低头嗅了嗅你放下的食物，终于不再咆哮，转身迈进林雾。',
  pitch_bear: '漆熊沉默地衡量着你，随后低吼一声示意警告，拖着厚重步伐离开。',
  mist_wolf: '幽狼的耳朵微微颤动，狼瞳中的敌意渐渐散去，化作雾影没入林间。',
  shadow_wolf: '影狼绕到风下确认你的气味，轻轻甩尾后隐入树影。',
  goblin: '哥布林把短刃收进怀里，嘀咕着听不懂的话，抱着战利品一溜烟跑远。',
  tree_ent: '树精枝梢轻晃，枯叶像叹息般落下；它认出你的善意，重新扎根沉眠。',
  forest_slime: '森林史莱姆缓缓收拢黏液，吞下你递出的草药后，滑进潮湿的落叶层。',
  shadow_wolf_king: '幽影狼王凝视你片刻，终于收起利爪，在漫长的低嚎中退回幽暗密林。',
  dungeon_raider: '地宫劫掠者掂了掂手中的战利品，衡量过后骂骂咧咧地钻进岔路。',
  dungeon_wisp: '幽邃法灵的轮廓在你面前轻轻闪烁，最后化作几粒幽光散入石壁。',
  dungeon_stalker: '暗影猎手收回窥伺的目光，像一滴墨般融进回廊深处。',
  dungeon_guardian: '迷宫守卫认可了你的来意，缓缓侧身，让出了通向另一条岔路的空隙。',
  dungeon_warden: '迷宫镇守者沉默良久，最终以武器顿地，示意这次不再阻拦。',
  slime_red: '红色史莱姆熄灭了体内躁动的火星，噗叽一声滑回阴影。',
  slime_orange: '橙色史莱姆晃了晃圆润的身躯，带着暖色光晕挪开了道路。',
  slime_yellow: '黄色史莱姆身上的电光渐弱，蹦跳着躲进了石缝。',
  slime_green: '绿色史莱姆收起酸液，缩成一团翠色胶质退到了墙角。',
  slime_cyan: '青色史莱姆轻轻泛起水纹，沿着潮湿的沟槽流向远处。',
  slime_blue: '蓝色史莱姆吐出一缕寒气，安静地滑进了冰冷的暗处。',
  slime_purple: '紫色史莱姆的幽暗光泽逐渐平息，悄无声息地离开了。',
  black_slime: '黑暗史莱姆的表面泛起不安的涟漪，随后贴着石缝悄然退去。',
  skeleton: '骷髅眼眶中的魂火摇曳片刻，断刃垂下，骨架散作一地沉寂。',
  undead: '亡灵低低呢喃，仿佛想起了早已遗忘的名字，转身隐没于黑暗。',
  skeleton_warrior: '骷髅战士缓缓放下武器，向你行了一个古老的礼，随后归于尘土。',
  death_wight: '死灵发出一声几不可闻的叹息，苍白魂火随之飘散。',
  death_knight: '死灵骑士勒住无形缰绳，留下冷冽的注视，策马消失在回廊尽头。',
  necromancer_uz: '乌兹的笑声戛然而止；他审视着你片刻，撕开阴影，暂时放弃了这场交锋。'
} as Record<string, string>)[code] ?? `${name} 感受到你的善意，收起敌意，转身离开了此地。`;

// 仅用于直击与技能本体伤害；持续伤害、治疗、护盾等效果不经过这项随机波动。
const directDamageVariance = (damage: number) => Math.max(1, Math.floor(damage * (.9 + Math.random() * .2)));

const resolveStrike = (attack: number, defense: number, accuracy: number, evasion: number, crit: number, critResist: number, critDamage: number, critReduction: number, forceHit = false, forceCrit = false, minimumHitRatePct = 0, actualHitRatePct = 0) => {
  const hitChance = Math.min(1, Math.max(Math.max(opposedChance(accuracy, evasion), Math.max(0, Math.min(100, minimumHitRatePct)) / 100) + actualHitRatePct / 100, 0));
  if (!forceHit && Math.random() >= hitChance) return { hit: false, crit: false, damage: 0 };
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
      const strike = resolveStrike(attack * Number(skill.power) / 100 * multiplier, Number(combat.defense), Number(character.accuracy), monsterCombatStats(combat).evasion, Number(character.crit_rate_bp) + modifiers.critRateBp, monsterCombatStats(combat).critResist, Number(character.crit_damage_bp), monsterCombatStats(combat).critReduction, false, false, modifiers.minimumHitRatePct);
      damage = directDamageVariance(Math.floor(strike.damage * (1 + modifiers.damageBonusPct / 100))); log = !strike.hit ? `施放 ${skill.name}，但被敌人闪避。` : `施放 ${skill.name}，造成 ${damage} 点${strike.crit ? '暴击' : ''}伤害${modifiers.weaponName ? `（${modifiers.weaponName}生效）` : ''}。`;
    } else {
      const defense = Math.floor(Number(combat.defense) * (1 - modifiers.ignoreDefensePct / 100));
      const strike = resolveStrike(Number(character.physical_attack) + modifiers.physicalAttack, defense, Number(character.accuracy), monsterCombatStats(combat).evasion, Number(character.crit_rate_bp) + modifiers.critRateBp, monsterCombatStats(combat).critResist, Number(character.crit_damage_bp), monsterCombatStats(combat).critReduction, false, false, modifiers.minimumHitRatePct);
      damage = directDamageVariance(Math.floor(strike.damage * (1 + modifiers.damageBonusPct / 100)));
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
  const monsterDamage = strike.hit ? directDamageVariance(strike.damage) : 0; combat.player_hp -= monsterDamage; log += !strike.hit ? `\n${combat.name} 使用「${monsterSkill}」，但你闪避了攻击。` : `\n${combat.name} 使用「${monsterSkill}」，造成 ${monsterDamage} 点${strike.crit ? '暴击' : ''}伤害。`;
  if (combat.player_hp <= 0) { await connection.execute('UPDATE combat_sessions SET state=\'defeat\' WHERE id=?', [combat.combat_id]); return { log: `${log}\n你战败了，被送回区域边缘。`, ended: true }; }
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
    if (effect.code === 'stun' && ['jump_strike', 'necromancer_grave_bind'].includes(effect.skill_code)) {
      const targetTenacity = targetKind === 'member' ? Number(target.tenacity ?? 0) : monsterCombatStats(target as CombatTargetRow).tenacity;
      const levelDifference = Number(caster.level ?? 1) - Number(target.level ?? 1);
      const chance = Math.max(.05, Math.min(.85, Number(value) / 100 + Math.max(-.25, Math.min(.25, levelDifference * .05)) - targetTenacity / (targetTenacity + 200) * .25));
      if (Math.random() >= chance) { log.push(`$眩晕$眩晕判定失败（${(chance * 100).toFixed(1)}%）`); continue; }
    }
    if (effect.effect_type === 'cleanse') {
      const harmfulOnly = effect.skill_code === 'necromancer_purging_mist';
      await connection.execute(`DELETE ce FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=? AND ce.target_kind=? AND ce.target_id=? AND ${harmfulOnly ? "e.code IN ('vulnerability','sword_break','armor_shatter','slow','bind','imbalance','burn','poison','bleeding','rending','stun')" : "e.effect_type IN ('damage_over_time','stat_modifier','control')"}`, [sessionId, effectTargetKind, targetId]);
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
      if (effect.code === 'prayer_hymn' && effect.target_kind === 'member') { const member = target as CombatMemberRow; const oldMp = Number(member.current_mp); const mpAmount = Math.max(1, Math.floor(Number(member.mp_max) * Number(effect.value) * Number(effect.stacks) / 100)); member.current_mp = Math.min(Number(member.mp_max), oldMp + mpAmount); log.push(`§${marker}${effect.name}${marker}恢复 ${amount} HP、${mpAmount} MP(${oldHp}→${member.current_hp}｜${oldMp}→${member.current_mp})`); }
      else log.push(`§${marker}${effect.name}${marker}${effect.effect_type === 'damage_over_time' ? '损失' : '恢复'} ${amount} HP(${oldHp}→${(target as any).current_hp})`);
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

const prepareBossAmbushHandoff = async (connection: PoolConnection, sessionId: string, targets: CombatTargetRow[]) => {
  if (!targets.length) return false;
  const ids = targets.map(target => Number(target.id));
  const [result] = await connection.execute<any>(`UPDATE combat_ambushes
    SET status='ready',ready_spawn_id=spawn_id,handoff_kind='boss',source_session_id=?,opponent_character_id=NULL
    WHERE status='waiting' AND spawn_id IN (${ids.map(() => '?').join(',')})`, [sessionId, ...ids]);
  return Number(result.affectedRows ?? 0) > 0;
};

/** 原队伍击杀 BOSS 后，伏击者将直接和发起该场战斗的残血玩家进入 PvP。 */
const preparePartyAmbushHandoff = async (connection: PoolConnection, sessionId: string, targets: CombatTargetRow[]) => {
  if (!targets.length) return false;
  const ids = targets.map(target => Number(target.id));
  const [ownerRows] = await connection.execute<(RowDataPacket & { character_id: number })[]>('SELECT character_id FROM combat_sessions WHERE id=? FOR UPDATE', [sessionId]);
  const opponentId = Number(ownerRows[0]?.character_id ?? 0); if (!opponentId) return false;
  const [result] = await connection.execute<any>(`UPDATE combat_ambushes
    SET status='ready',ready_spawn_id=NULL,handoff_kind='party',source_session_id=?,opponent_character_id=?
    WHERE status='waiting' AND spawn_id IN (${ids.map(() => '?').join(',')})`, [sessionId, opponentId, ...ids]);
  return Number(result.affectedRows ?? 0) > 0;
};

/** 领取一场已结束战斗所产生的伏击接管事件；领取后不会重复派发。 */
export const claimCombatAmbushHandoffs = async (sessionId: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & {
    spawn_id: number; handoff_kind: 'boss' | 'party'; opponent_character_id: number | null; ambusher_character_id: number;
    qq_user_id: string; delivery_scope: 'group' | 'c2c' | null; delivery_target_id: string | null; delivery_bot_id: string | null;
  })[]>(`SELECT ca.spawn_id,ca.handoff_kind,ca.opponent_character_id,c.id AS ambusher_character_id,p.qq_user_id,ca.delivery_scope,ca.delivery_target_id,ca.delivery_bot_id
    FROM combat_ambushes ca JOIN characters c ON c.id=ca.character_id JOIN players p ON p.id=c.player_id
    WHERE ca.status='ready' AND ca.source_session_id=? FOR UPDATE`, [sessionId]);
  if (!rows.length) return [] as CombatAmbushHandoff[];
  await connection.execute("UPDATE combat_ambushes SET status='resolved' WHERE status='ready' AND source_session_id=?", [sessionId]);
  return rows
    .filter(row => row.handoff_kind === 'boss' || row.handoff_kind === 'party')
    .map<CombatAmbushHandoff>(row => ({
      kind: row.handoff_kind,
      spawnId: Number(row.spawn_id),
      ambusherCharacterId: Number(row.ambusher_character_id),
      ambusherQqUserId: row.qq_user_id,
      opponentCharacterId: row.opponent_character_id ? Number(row.opponent_character_id) : undefined,
      delivery: { scope: row.delivery_scope === 'group' ? 'group' : 'c2c', targetId: row.delivery_target_id || row.qq_user_id, botId: row.delivery_bot_id || undefined }
    }));
});

const finishPartyVictory = async (connection: PoolConnection, sessionId: string, members: CombatMemberRow[], targets: CombatTargetRow[]) => {
  await connection.execute('UPDATE combat_sessions SET state=\'victory\' WHERE id=?', [sessionId]);
  await preparePartyAmbushHandoff(connection, sessionId, targets);
  const pursuitTargets = targets.filter(target => isCityPursuit(target));
  const rewardTargets = targets.filter(target => !isSummonedMonster(target) && !isCityPursuit(target));
  const playerMembers = members.filter(member => !member.npc_code);
  const rewardMembers = playerMembers.filter(member => Boolean(member.stamina_eligible));
  const targetCodes = rewardTargets.length ? (await connection.execute<(RowDataPacket & { code: string })[]>(`SELECT code FROM monster_templates WHERE id IN (${rewardTargets.map(() => '?').join(',')})`, rewardTargets.map(target => Number(target.template_id))))[0].map(row => row.code) : [];
  for (const member of rewardMembers) await recordOmniscientObservation(connection, Number(member.id), targetCodes);
  const partySize = Math.min(4, rewardMembers.length);
  const partyExperienceBonus = ({ 1: 0, 2: .10, 3: .20, 4: .35 } as Record<number, number>)[partySize] ?? .35;
  const partyDropBonus = ({ 1: 0, 2: .60, 3: 1, 4: 1.5 } as Record<number, number>)[partySize] ?? 1.5;
  const [omniscientRows] = rewardMembers.length ? await connection.execute<(RowDataPacket & { level: number | null })[]>(`SELECT MAX(sp.level) AS level FROM characters c JOIN player_secondary_professions sp ON sp.character_id=c.id AND sp.profession_code='omniscient'
    WHERE c.secondary_profession_code='omniscient' AND c.id IN (${rewardMembers.map(() => '?').join(',')})`, rewardMembers.map(member => Number(member.id))) : [[] as any];
  const omniscientDropBonus = Math.max(0, Number(omniscientRows[0]?.level ?? 0)) * .1;
  const [omniscientInsightRows] = rewardMembers.length ? await connection.execute<(RowDataPacket & { character_id: number; level: number | null })[]>(`SELECT c.id AS character_id,sp.level FROM characters c
    JOIN player_secondary_professions sp ON sp.character_id=c.id AND sp.profession_code='omniscient'
    WHERE c.secondary_profession_code='omniscient' AND c.id IN (${rewardMembers.map(() => '?').join(',')})`, rewardMembers.map(member => Number(member.id))) : [[] as any];
  const omniscientInsightBonus = new Map<number, number>(omniscientInsightRows.map(row => [Number(row.character_id), Math.max(0, Number(row.level ?? 0)) * .1]));
  const [luckyElixirs] = rewardMembers.length ? await connection.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM player_battle_buffs WHERE buff_code='minor_luck_elixir' AND remaining_battles>0 AND character_id IN (${rewardMembers.map(() => '?').join(',')})`, rewardMembers.map(member => Number(member.id))) : [[] as any];
  const elixirDropBonus = Number(luckyElixirs[0]?.total ?? 0) > 0 ? .25 : 0;
  const totalExperience = rewardTargets.reduce((sum, target) => sum + Math.floor(Number(target.experience) * (1 + percentBonus(traitList(target.traits_json), 'experiencePct') / 100)), 0);
  const rewards: VictorySettlement['members'] = [];
  const rewardByMemberId = new Map<number, VictorySettlement['members'][number]>();
  const modifiersByMemberId = new Map<number, CombatModifiers>();
  for (const member of playerMembers) {
    if (!member.stamina_eligible) { rewards.push({ name: member.name, experience: 0, staminaInsufficient: true, drops: [], learned: [] }); continue; }
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
        const chance = Math.min(1, Number(rule.chance) + (omniscientInsightBonus.get(Number(member.id)) ?? 0));
        if (!stringList(target.skill_sequence).includes(rule.source_skill_code) || Math.random() > chance) continue;
        const [result] = await connection.execute<any>('INSERT IGNORE INTO player_skill_discoveries (character_id,skill_id) VALUES (?,?)', [member.id, rule.skill_id]);
        if (Number(result.affectedRows)) learned.push({ id: Number(rule.skill_id), name: rule.name });
      }
    }
    const reward = { name: member.name, experience, realmLocked: experienceGain.realmLocked, realmCapReached: experienceGain.realmCapReached, levelText: gainedPoints ? `升级至 Lv.${newLevel}，获得 ${gainedPoints} 技能点` : undefined, drops, learned };
    rewards.push(reward); rewardByMemberId.set(Number(member.id), reward);
  }
  const dungeonSecretCompleted = await completeDungeonSecretForLeader(connection, playerMembers.map(member => Number(member.id)), rewardTargets.map(target => Number(target.id)));
  const randomRecipient = () => rewardMembers[random(0, rewardMembers.length - 1)]!;
  const grantDrop = async (recipient: CombatMemberRow, code: string, quantity: number) => {
    const [items] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; item_type: string; codex_id: string | null })[]>('SELECT id,code,name,item_type,codex_id FROM item_definitions WHERE code=?', [code]); const item = items[0]; const reward = rewardByMemberId.get(Number(recipient.id)); if (!item || !reward) return;
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [recipient.id, item.id]);
    const coinValue = ({ copper_coin: 1, silver_coin: 100, gold_coin: 10000 } as Record<string, number>)[item.code] ?? 0;
    if (coinValue) {
      await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [coinValue * quantity, recipient.id]);
      const existing = reward.drops.find(drop => !drop.instanceId && drop.name === item.name && drop.itemType === item.item_type && drop.codexId === item.codex_id);
      if (existing) existing.quantity += quantity;
      else reward.drops.push({ name: item.name, quantity, itemType: item.item_type, codexId: item.codex_id });
    } else if (item.item_type === 'equipment') for (let index = 0; index < quantity; index += 1) { const [result] = await connection.execute<any>('INSERT INTO player_item_instances (character_id,item_id) VALUES (?,?)', [recipient.id, item.id]); reward.drops.push({ name: item.name, quantity: 1, itemType: item.item_type, codexId: item.codex_id, instanceId: Number(result.insertId) }); }
    else {
      await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [recipient.id, item.id, quantity]);
      const existing = reward.drops.find(drop => !drop.instanceId && drop.name === item.name && drop.itemType === item.item_type && drop.codexId === item.codex_id);
      if (existing) existing.quantity += quantity;
      else reward.drops.push({ name: item.name, quantity, itemType: item.item_type, codexId: item.codex_id });
    }
  };
  // 每个掉落条目只掷一次：组队只提高成功率，不增加基础掉落总量。
  for (const target of rewardTargets) for (const rawDrop of jsonArray(target.drops_json)) {
    const drop = jsonObject(rawDrop); if (!drop.code || !rewardMembers.length) continue;
    const recipient = randomRecipient(); const modifiers = modifiersByMemberId.get(Number(recipient.id))!; const traitDropBonus = percentBonus(traitList(target.traits_json), 'dropPct') / 100;
    if (Math.random() > Math.min(1, Number(drop.chance ?? 1) * (1 + traitDropBonus + partyDropBonus + omniscientDropBonus + elixirDropBonus) + modifiers.dropBonus)) continue;
    // 同种物品一次掉出多份时，每一份独立分配，结算页再按玩家合并显示数量。
    for (let index = 0; index < dropQuantity(drop); index += 1) await grantDrop(randomRecipient(), String(drop.code), 1);
  }
  if (rewardMembers.length) for (const target of rewardTargets.filter(target => traitList(target.traits_json).some(trait => trait.code === 'riot'))) {
    const [templates] = await connection.execute<(RowDataPacket & { code: string })[]>('SELECT code FROM monster_templates WHERE id=?', [target.template_id]);
    const specialCode = riotMaterialByMonster[templates[0]?.code ?? ''] ?? 'beast_core';
    for (const code of Math.random() < .25 ? [specialCode, 'riot_aura'] : [specialCode]) await grantDrop(randomRecipient(), code, 1);
  }
  const [guideBattle] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id
    JOIN combat_members cm ON cm.session_id=ct.session_id JOIN player_story_progress sp ON sp.character_id=cm.character_id AND sp.story_code='forest_guide' AND sp.status IN ('joined','declined')
    WHERE ct.session_id=? AND t.code='forest_slime' LIMIT 1`, [sessionId]);
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
  if (pursuitTargets.length) {
    const pursuitCharacterIds = [...new Set(pursuitTargets.map(target => Number(cityPursuitTrait(target)?.pursuit_target_id ?? 0)).filter(Boolean))];
    const pursuitWarrantIds = [...new Set(pursuitTargets.map(target => Number(cityPursuitTrait(target)?.warrant_id ?? 0)).filter(Boolean))];
    if (pursuitWarrantIds.length) await connection.execute(`UPDATE player_warrants SET pursuit_defeats=LEAST(255,pursuit_defeats+1)
      WHERE id IN (${pursuitWarrantIds.map(() => '?').join(',')}) AND status='active'`, pursuitWarrantIds);
    if (pursuitCharacterIds.length) await connection.execute(`DELETE FROM city_pursuit_tracks
      WHERE city_region_id=? AND character_id IN (${pursuitCharacterIds.map(() => '?').join(',')})`, [Number(members[0]?.current_region_id ?? 0), ...pursuitCharacterIds]);
    for (const characterId of pursuitCharacterIds) await connection.execute(`INSERT INTO city_pursuit_cooldowns (character_id,city_region_id,expires_at)
      VALUES (?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))
      ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at)`, [characterId, Number(members[0]?.current_region_id ?? 0)]);
  }
  await consumeBattleBuffs(connection, members);
  return { kind: 'victory', members: rewards, arrivalPending, dungeonSecretCompleted, pursuitCooldownMinutes: pursuitTargets.length ? 30 : undefined } as VictorySettlement;
};

const applyArtifactEffect = async (connection: PoolConnection, sessionId: string, code: 'sword_break' | 'demon_surge' | 'prayer_hymn', targetKind: 'member' | 'target', targetId: number, log: string[], announce = true) => {
  const [effects] = await connection.execute<(RowDataPacket & { id: number; name: string; default_value: number; default_duration: number; max_stacks: number })[]>('SELECT id,name,default_value,default_duration,max_stacks FROM effect_definitions WHERE code=?', [code]); const effect = effects[0]; if (!effect) return;
  const [existing] = await connection.execute<(RowDataPacket & { stacks: number })[]>('SELECT stacks FROM combat_status_effects WHERE session_id=? AND target_kind=? AND target_id=? AND effect_id=? FOR UPDATE', [sessionId, targetKind, targetId, effect.id]);
  const currentStacks = existing.reduce((total, row) => total + Number(row.stacks), 0);
  const stacks = Math.min(Number(effect.max_stacks), currentStacks + 1);
  if (currentStacks < Number(effect.max_stacks)) await connection.execute('INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns) VALUES (?,?,?,?,?,?,?)', [sessionId, targetKind, targetId, effect.id, 1, effect.default_value, effect.default_duration]);
  if (!announce) return;
  const percent = Number(effect.default_value).toFixed(1);
  const detail = code === 'sword_break' ? `物防降低${percent}%` : code === 'demon_surge' ? `伤害提高${percent}%` : `每回合恢复${percent}%生命与魔力`;
  log.push(`${targetKind === 'member' ? '#' : '$'}${effect.name}${targetKind === 'member' ? '#' : '$'}${detail}(${effect.default_duration})${stacks > 1 ? `×${stacks}` : ''}`);
};

const rescueWithTimeGuard = async (connection: PoolConnection, sessionId: string, member: CombatMemberRow, enabled: boolean, log: string[]) => {
  if (!enabled || Number(member.current_hp) > 0) return false;
  const cooldowns = jsonObject(member.cooldowns); if (cooldowns.time_guard_used) return false;
  cooldowns.time_guard_used = 1; member.cooldowns = cooldowns; member.current_hp = 1; member.is_defeated = 0;
  await connection.execute(`DELETE ce FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id
    WHERE ce.session_id=? AND ce.target_kind='member' AND ce.target_id=? AND e.effect_type IN ('damage_over_time','control')`, [sessionId, member.id]);
  await connection.execute(`INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns)
    VALUES (?, 'member', ?, (SELECT id FROM effect_definitions WHERE code='time_guard'), 1, 1, 1)`, [sessionId, member.id]);
  log.push('#时隙守护#濒死时保留1点生命，清除异常状态并免疫伤害至下次出手前。');
  return true;
};

export const currentEncounter = async (qqUserId: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [rows] = await pool.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json,t.element_mastery_json,t.element_resistance_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL AND ${visiblePursuitCondition('s')}`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id]);
  const appraisal = await appraisalProfileFor(pool, [character.id]);
  const [occupiedRows] = await pool.execute<(RowDataPacket & { spawn_id: number })[]>(`SELECT ct.spawn_id FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id
    WHERE cs.state='active' AND ct.spawn_id IN (${rows.map(() => '?').join(',') || 'NULL'})`, rows.map(row => row.id));
  const spawns = materializeMonsters(rows, appraisal.informationLevel >= 2); if (!spawns.length) return null;
  await pool.query(`INSERT IGNORE INTO player_monster_codex (character_id,monster_template_id) VALUES ${spawns.map(() => '(?,?)').join(',')}`,
    spawns.flatMap(spawn => [character.id, Number(spawn.template_id)]));
  const members = await partyCombatants(pool, character); const fastestMonster = Math.max(...spawns.map(spawn => monsterCombatStats(spawn).speed));
  const cityPursuit = isCityPursuit(spawns[0]);
  const [texts] = await pool.execute<(RowDataPacket & { description: string })[]>('SELECT description FROM monster_encounter_texts WHERE monster_template_id=? ORDER BY RAND() LIMIT 1', [spawns[0].template_id]);
  return { character, spawns, occupied: occupiedRows.some(row => Number(row.spawn_id) === Number(spawns[0]?.id)), cityPursuit, canAmbush: !cityPursuit && members.every(member => Number(member.speed) > fastestMonster), text: cityPursuit ? '城镇执法者仍在原地严阵以待，已封住你的去路。' : texts[0]?.description ?? `${spawns[0].name} 拦住了你的去路。` };
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
    await connection.execute('UPDATE characters SET current_region_id=?,pos_x=-22,pos_y=-128 WHERE id=?', [town[0].id, character.id]);
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
    await connection.execute('UPDATE characters SET current_region_id=?,pos_x=-2,pos_y=-111 WHERE id=?', [town[0].id, character.id]);
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

/** 地下迷宫内战败时，传送器会被强制触发，将整支队伍送回对应入口外。 */
const evacuateDungeonDefeat = async (connection: PoolConnection, members: CombatMemberRow[], targets: CombatTargetRow[]) => {
  if (!targets.length) return false;
  const placeholders = targets.map(() => '?').join(',');
  const [dungeons] = await connection.execute<(RowDataPacket & { entrance_region_id: number; entrance_x: number; entrance_y: number })[]>(`SELECT d.entrance_region_id,d.entrance_x,d.entrance_y
    FROM dungeon_monsters dm JOIN dungeon_instances d ON d.id=dm.dungeon_id
    WHERE dm.spawn_id IN (${placeholders}) AND d.state='active' LIMIT 1 FOR UPDATE`, targets.map(target => Number(target.id)));
  const dungeon = dungeons[0]; if (!dungeon) return false;
  let consumed = 0;
  for (const member of members) {
    const [result] = await connection.execute<any>(`UPDATE player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
      SET pi.quantity=pi.quantity-1 WHERE pi.character_id=? AND i.code='demon_breaker_teleporter' AND pi.quantity>0`, [member.id]);
    consumed += Number(result.affectedRows ?? 0);
    await connection.execute(`DELETE pi FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
      WHERE pi.character_id=? AND i.code='demon_breaker_teleporter' AND pi.quantity<=0`, [member.id]);
    await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=0 WHERE id=?', [dungeon.entrance_region_id, dungeon.entrance_x, dungeon.entrance_y, member.id]);
  }
  return consumed > 0;
};

/** 迷宫第三层首领专用：召出的亡灵只存在于本场战斗，结算时不会掉落经验或物品。 */
const summonNecromancerMinions = async (connection: PoolConnection, sessionId: string, boss: CombatTargetRow, members: CombatMemberRow[]) => {
  const [templates] = await connection.execute<(RowDataPacket & MonsterAttributes & { id: number; level: number; monster_class: string; skill_sequence: unknown })[]>(`SELECT t.id,t.level,t.monster_class,t.skill_sequence,${templateMonsterAttributeColumns} FROM monster_templates t WHERE t.code='skeleton' LIMIT 1 FOR UPDATE`);
  const template = templates[0]; if (!template) return 0;
  const [locations] = await connection.execute<(RowDataPacket & { region_id: number; pos_x: number; pos_y: number; pos_z: number })[]>('SELECT region_id,pos_x,pos_y,pos_z FROM monster_spawns WHERE id=? FOR UPDATE', [boss.id]); const location = locations[0]; if (!location) return 0;
  for (let index = 0; index < 2; index += 1) {
    const base = randomMonsterBaseAttributes(template); const spawned = { ...template, ...base, level: 16, traits_json: [] }; const stats = monsterCombatStats(spawned);
    const [result] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [template.id, location.region_id, 2000000 + Number(boss.id), 2000000 + index, location.pos_z, 16, base.constitution, base.spirit, base.strength, base.intelligence, base.agility, base.perception, stats.hpMax, JSON.stringify(stringList(template.skill_sequence)), JSON.stringify([{ code: 'summoned', name: '召唤的' }])]);
    await connection.execute('INSERT INTO combat_targets (session_id,spawn_id,current_mp,cooldowns) VALUES (?,?,?,JSON_OBJECT())', [sessionId, result.insertId, stats.mpMax]);
    for (const member of members) await connection.execute('INSERT INTO combat_threat (session_id,spawn_id,character_id,threat) VALUES (?,?,?,1)', [sessionId, result.insertId, member.id]);
  }
  return 2;
};

export const combatAction = async (qqUserId: string, action: PendingAction['type'], slot?: number, skillId?: number, itemId?: number) => withTransaction(async connection => {
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
  if (!continuingNpcPartyBattle && ((action === 'skill' && !slot && !skillId) || (action === 'item' && !slot && !itemId))) throw new Error('请选择快捷栏位。');
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
    const [items] = await connection.execute<RowDataPacket[]>(itemId
      ? 'SELECT pi.item_id FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 AND i.item_type=\'consumable\' FOR UPDATE'
      : 'SELECT qi.item_id FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id WHERE qi.character_id=? AND qi.quick_slot=? AND pi.quantity>0 FOR UPDATE', itemId ? [character.id, Number(itemId)] : [character.id, Number(slot)]);
    if (!items[0]) throw new Error(itemId ? '自动嗑药道具已耗尽或不可使用。' : `道具${'①②③④'.charAt(Number(slot) - 1) || slot}未配置或已耗尽。`);
  }
  if (!continuingNpcPartyBattle) {
    const pending: PendingAction = { type: action, ...(slot ? { slot } : {}), ...(skillId ? { skillId } : {}), ...(itemId ? { itemId } : {}) };
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
      const persistentArtifact = await modifiersFor(connection, Number(member.id));
      if (persistentArtifact.hpRegenPct) { const oldHp = Number(member.current_hp); member.current_hp = Math.min(Number(member.hp_max), oldHp + Math.max(1, Math.floor(Number(member.hp_max) * persistentArtifact.hpRegenPct / 100))); if (member.current_hp > oldHp) log.push(`&守誓&恢复 ${member.current_hp - oldHp} HP(${oldHp}→${member.current_hp})`); }
      if (persistentArtifact.mpRegenPct) { const oldMp = Number(member.current_mp); member.current_mp = Math.min(Number(member.mp_max), oldMp + Math.max(1, Math.floor(Number(member.mp_max) * persistentArtifact.mpRegenPct / 100))); if (member.current_mp > oldMp) log.push(`&永恒&恢复 ${member.current_mp - oldMp} MP(${oldMp}→${member.current_mp})`); }
      if (resolvedActions > 0) log.splice(logStart, 0, '————');
      resolvedActions += 1;
      if (controlled) continue;
      const choice = jsonObject(member.pending_action) as unknown as PendingAction;
      if (choice.type === 'escape') { log.push(`➤【${member.name}】选择撤离\n　➥等待队伍共同脱离。`); continue; }
      if (choice.type === 'item') {
        const [items] = await connection.execute<(RowDataPacket & { item_id: number; quantity: number; name: string; effect_json: unknown })[]>(choice.itemId
          ? 'SELECT pi.item_id,pi.quantity,i.name,i.effect_json FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.item_id=? AND i.item_type=\'consumable\' FOR UPDATE'
          : 'SELECT pi.item_id,pi.quantity,i.name,i.effect_json FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id JOIN item_definitions i ON i.id=pi.item_id WHERE qi.character_id=? AND qi.quick_slot=? FOR UPDATE', choice.itemId ? [member.id, Number(choice.itemId)] : [member.id, Number(choice.slot)]);
        const item = items[0]; if (!item?.quantity) { log.push(`➤【${member.name}】使用道具\n　➥快捷栏为空。`); continue; }
        const effect = jsonObject(item.effect_json); const oldHp = Number(member.current_hp); const oldMp = Number(member.current_mp); member.current_hp = Math.min(Number(member.hp_max), oldHp + Number(effect.heal ?? 0)); member.current_mp = Math.min(Number(member.mp_max), oldMp + Number(effect.restoreMp ?? 0)); await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [member.id, item.item_id]); const buffs: string[] = []; if (Number(effect.experienceBonusPct)) { await connection.execute(`INSERT INTO player_battle_buffs (character_id,buff_code,remaining_battles) VALUES (?,'minor_experience_elixir',?) ON DUPLICATE KEY UPDATE remaining_battles=VALUES(remaining_battles)`, [member.id, Number(effect.battleCount ?? 10)]); buffs.push(`经验获取+${Number(effect.experienceBonusPct)}%，持续${Number(effect.battleCount ?? 10)}场战斗`); } if (Number(effect.partyDropBonusPct)) { await connection.execute(`INSERT INTO player_battle_buffs (character_id,buff_code,remaining_battles) VALUES (?,'minor_luck_elixir',?) ON DUPLICATE KEY UPDATE remaining_battles=VALUES(remaining_battles)`, [member.id, Number(effect.battleCount ?? 10)]); buffs.push(`全队掉率+${Number(effect.partyDropBonusPct)}%，持续${Number(effect.battleCount ?? 10)}场战斗`); } const restored = [Number(effect.heal ?? 0) ? `HP ${oldHp}→${member.current_hp}` : '', Number(effect.restoreMp ?? 0) ? `MP ${oldMp}→${member.current_mp}` : '', ...buffs].filter(Boolean).join('｜') || '暂时没有产生效果'; log.push(`➤【${member.name}】使用[${item.name}]\n　➥${restored}`); continue;
      }
      const target = targets.find(item => Number(item.id) === Number(member.selected_target_id) && !item.is_defeated) ?? targets.find(item => !item.is_defeated); if (!target) continue;
      const modifiers = persistentArtifact; const swordAction = choice.type === 'attack'; const unifiedAttack = modifiers.unifyAttack ? Math.max(Number(member.physical_attack), Number(member.magic_attack)) : 0; let skillScale = 1; let attack = ((unifiedAttack || Number(member.physical_attack)) + modifiers.physicalAttack) * (1 + modifiers.physicalAttackPct / 100); let power = 1; let kind = '物理'; let damageType = '斩击'; let element = ''; let label = '普通攻击'; let skillId: number | undefined; let skillCode: string | undefined; let skillCategory: 'physical' | 'magic' | 'utility' | undefined;
      if (choice.type === 'skill') {
        const [skills] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; category: 'physical' | 'magic' | 'utility'; damage_type: string; element: string; mana_cost: number; cooldown_turns: number; cooldown_reduction_per_level: number; power: number; level: number; power_per_level: number })[]>(choice.skillId ? 'SELECT s.id,s.code,s.name,s.category,s.damage_type,s.element,s.mana_cost,s.cooldown_turns,s.cooldown_reduction_per_level,s.power,ps.level,s.power_per_level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=?' : 'SELECT s.id,s.code,s.name,s.category,s.damage_type,s.element,s.mana_cost,s.cooldown_turns,s.cooldown_reduction_per_level,s.power,ps.level,s.power_per_level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot=?', choice.skillId ? [member.id, choice.skillId] : [member.id, choice.slot]);
        const skill = skills[0]; if (!skill) { log.push(`➤【${member.name}】释放技能\n　➥技能栏为空。`); continue; }
        const [specializationRows] = await connection.execute<(RowDataPacket & { specialization: string; level: number })[]>('SELECT specialization,level FROM player_skill_specializations WHERE character_id=? AND skill_id=?', [member.id, skill.id]); const specializations = new Map(specializationRows.map(row => [row.specialization, Number(row.level) - 1])); const overcharge = Math.max(0, specializations.get('overcharge') ?? 0); const instant = Math.max(0, specializations.get('instant') ?? 0); const efficient = Math.max(0, specializations.get('efficient') ?? 0);
        const manaCost = Math.max(skill.mana_cost ? 1 : 0, Math.ceil(Number(skill.mana_cost) * Math.pow(1.16, overcharge) * Math.pow(.92, efficient) * (modifiers.manaAffinity ? .7 : 1)) - modifiers.manaCostReduction); const manaGap = Math.max(0, manaCost - Number(member.current_mp)); if (manaGap && (!modifiers.bloodForMana || Number(member.current_hp) <= manaGap)) { log.push(`➤【${member.name}】释放技能「${skill.name}」\n　➥MP不足。`); continue; }
        member.current_mp = Math.max(0, Number(member.current_mp) - manaCost); if (manaGap) { member.current_hp -= manaGap; log.push(`&命运代偿&消耗 ${manaGap} HP 补足魔力。`); } const cooldowns = jsonObject(member.cooldowns); const baseCooldown = Math.max(0, Number(skill.cooldown_turns)); const cooldown = Math.max(0, roundTowardInitialTiming(Number(skill.cooldown_turns), Math.max(1, baseCooldown) * Math.pow(1.08, overcharge) * Math.pow(.92, instant))); cooldowns[skill.code] = cooldown + 1; member.cooldowns = cooldowns; skillId = Number(skill.id); skillCode = skill.code; skillCategory = skill.category; label = `释放技能「${skill.name}」`; kind = skill.category === 'magic' ? '魔法' : '物理'; damageType = skill.damage_type; element = skill.element; skillScale = Number(skill.power) * Math.pow(1.08, overcharge) * Math.pow(.96, instant) / 100; const magicBase = unifiedAttack || Number(member.magic_attack); const physicalBase = unifiedAttack || Number(member.physical_attack); attack = (skill.category === 'magic' ? (magicBase + modifiers.magicAttack) * (1 + modifiers.magicAttackPct / 100) : (physicalBase + modifiers.physicalAttack) * (1 + modifiers.physicalAttackPct / 100)) * skillScale; power = skill.category === 'magic'
          ? (1 + modifiers.magicDamagePct / 100 + (skill.element === '光' ? modifiers.lightSkillBonusPct / 100 : 0)) * (1 + modifiers.magicSkillDamagePct / 100)
          : (1 + modifiers.physicalSkillDamagePct / 100);
      }
      if (modifiers.prayerHymn && skillCategory === 'utility') { for (const ally of members.filter(item => !item.is_defeated)) await applyArtifactEffect(connection, session.combat_id, 'prayer_hymn', 'member', Number(ally.id), [], false); log.push('#祈祷圣音#受益对象每回合恢复3.0%生命与魔力(3)'); }
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
      if (skillCode === 'healing_prayer' || skillCode === 'healing_light') {
        const ally = [...members].filter(item => !item.is_defeated).sort((left, right) => Number(left.current_hp) / Number(left.hp_max) - Number(right.current_hp) / Number(right.hp_max))[0] ?? member;
        const oldHp = Number(ally.current_hp); const amount = Math.max(1, Math.floor(Number(member.magic_attack) * (skillCode === 'healing_prayer' ? 1.35 : 1))); ally.current_hp = Math.min(Number(ally.hp_max), oldHp + amount);
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
      if (skillCategory === 'utility') {
        log.push(`➤【${member.name}】${label}`);
        if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', member, 'member', 'on_cast', log);
        continue;
      }
      const nextActionEffects = effects.filter(effect => effect.target_kind === 'member' && Number(effect.target_id) === Number(member.id) && (effect.code === 'mist_veil' || effect.code === 'shadow_pierce'));
      const swordSkill = choice.type === 'skill' && damageType === '斩击'; const artifactAction = swordAction || swordSkill;
      if (artifactAction && modifiers.artifact === 'holy_sword') kind = '物理';
      if (artifactAction && modifiers.artifact === 'demon_sword') { kind = '魔法'; attack = (Number(member.magic_attack) + modifiers.magicAttack) * (1 + modifiers.magicAttackPct / 100) * skillScale; }
      const monster = monsterCombatStats(target); const vulnerability = effectValue('target', Number(target.id), 'vulnerability') + effectValue('target', Number(target.id), 'sword_break') + effectValue('target', Number(target.id), 'armor_shatter'); const surge = effectValue('member', Number(member.id), 'demon_surge'); const mistVeil = effectValue('member', Number(member.id), 'mist_veil'); const shadowPierce = effectValue('member', Number(member.id), 'shadow_pierce'); const battleCry = effectValue('member', Number(member.id), 'battle_cry'); const enemyBattleCry = effectValue('target', Number(target.id), 'battle_cry'); const imbalance = effectValue('member', Number(member.id), 'imbalance'); const bind = effectValue('target', Number(target.id), 'bind'); const physicalAttack = kind === '物理'; const baseDefense = kind === '魔法' ? monster.magicDefense : monster.physicalDefense; const defense = Math.floor(baseDefense * (1 + enemyBattleCry / 100) * (1 - (kind === '魔法' ? 0 : Math.min(90, modifiers.ignoreDefensePct + vulnerability)) / 100)); const strike = resolveStrike(attack * power * (1 + surge / 100) * (1 + mistVeil / 100) * (1 + battleCry / 100) * (Number(session.turn_no) === 1 ? 1 + Number(session.opening_damage_bonus) : 1), defense, Number(member.accuracy) * (1 + modifiers.accuracyPct / 100) * (1 - imbalance / 100), monster.evasion * (1 - bind / 100), (Number(member.crit_rate_bp) + modifiers.critRateBp) * (1 + modifiers.critRatePct / 100), monster.critResist, Number(member.crit_damage_bp) * (1 + modifiers.critDamagePct / 100), monster.critReduction, false, (physicalAttack && modifiers.physicalForceCrit) || shadowPierce > 0, modifiers.minimumHitRatePct, modifiers.actualHitRatePct + (physicalAttack ? modifiers.physicalActualHitRatePct : 0));
      log.push(`➤【${member.name}】${label}`); if (nextActionEffects.length) await connection.execute(`DELETE FROM combat_status_effects WHERE id IN (${nextActionEffects.map(() => '?').join(',')})`, nextActionEffects.map(effect => effect.id)); if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', target, 'target', 'on_cast', log); if (!strike.hit) { log.push(`　➥【${targetName(target)}】闪避了攻击`); continue; }
      const physicalMultiplier = kind === '物理' ? physicalWeaknessMultiplier(target, damageType) : 1;
      const elementalMultiplierValue = elementalMultiplier(member.element_mastery_json, target.element_resistance_json, element);
      const damageMultiplier = physicalMultiplier * elementalMultiplierValue;
      const targetBarrier = effectValue('target', Number(target.id), 'barrier'); const damage = directDamageVariance(Math.max(1, Math.floor(strike.damage * damageMultiplier * (1 + modifiers.damageBonusPct / 100) * (1 - Math.min(80, targetBarrier) / 100) * (strike.crit ? (1 + modifiers.criticalDamageBonusPct / 100) * (1 + (physicalAttack ? modifiers.physicalCriticalFinalDamagePct : 0) / 100) : 1)))); const oldHp = Number(target.current_hp); target.current_hp = Math.max(0, oldHp - damage); if (!target.current_hp) target.is_defeated = 1;
      await connection.execute('UPDATE combat_threat SET threat=threat+? WHERE session_id=? AND spawn_id=? AND character_id=?', [damage, session.combat_id, target.id, member.id]); if (skillCode === 'warrior_taunt') { await connection.execute('UPDATE combat_threat SET threat=threat+600 WHERE session_id=? AND spawn_id=? AND character_id=?', [session.combat_id, target.id, member.id]); log.push('　#挑衅#目标的注意力被莱昂牢牢吸引'); } if (modifiers.lifestealPct && (choice.type === 'attack' || damageType === '刺击')) member.current_hp = Math.min(Number(member.hp_max), Number(member.current_hp) + Math.floor(damage * modifiers.lifestealPct / 100));
      const observer = appraisalForTarget(appraisal, Number(target.level));
      log.push(observer
        ? `　➥${observer.informationLevel >= 4 ? affinityTag(physicalMultiplier, elementalMultiplierValue) : ''}${strike.crit ? '[暴击!]' : ''}对【${targetName(target)}】造成 ${damage}点${kind}伤害(${oldHp}→${target.current_hp})`
        : `　➥对【???】造成 ???点${kind}伤害(???→???)`);
      if (modifiers.pursuitChancePct && !target.is_defeated && Math.random() * 100 < modifiers.pursuitChancePct) { const pursuitOldHp = Number(target.current_hp); const pursuitDamage = Math.min(pursuitOldHp, directDamageVariance(damage)); target.current_hp -= pursuitDamage; if (!target.current_hp) target.is_defeated = 1; log.push(`&追击&再次对【${targetName(target)}】造成 ${pursuitDamage} 点${kind}伤害(${pursuitOldHp}→${target.current_hp})`); }
      if (artifactAction && modifiers.artifact === 'holy_sword' && strike.crit) await applyArtifactEffect(connection, session.combat_id, 'sword_break', 'target', Number(target.id), log);
      if (artifactAction && modifiers.artifact === 'demon_sword') await applyArtifactEffect(connection, session.combat_id, 'demon_surge', 'member', Number(member.id), log);
      if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', target, 'target', 'on_hit', log);
    } else {
      const monsterTarget = targets.find(item => Number(item.id) === turn.id)!; if (monsterTarget.is_defeated) continue;
      if (resolvedActions > 0) log.splice(logStart, 0, '————');
      resolvedActions += 1;
      if (controlled || monsterTarget.is_defeated) continue;
      const [threatRows] = await connection.execute<(RowDataPacket & { character_id: number; threat: number })[]>('SELECT character_id,threat FROM combat_threat WHERE session_id=? AND spawn_id=? FOR UPDATE', [session.combat_id, monsterTarget.id]); let victim = threatTarget(members, new Map(threatRows.map(row => [Number(row.character_id), Number(row.threat)]))); if (!victim) continue;
      const [templateRows] = await connection.execute<(RowDataPacket & { code: string })[]>('SELECT code FROM monster_templates WHERE id=?', [monsterTarget.template_id]); const templateCode = templateRows[0]?.code ?? ''; const isWolfKing = templateCode === 'shadow_wolf_king'; const isDungeonBoss = ['black_slime', 'skeleton_general', 'death_knight', 'necromancer_uz'].includes(templateCode); const isBoss = monsterTarget.monster_class === 'boss';
      const sequence = isWolfKing ? ['wolfking_summon_shadow_wolf', 'wolfking_trample', 'wolfking_rending_pounce', 'wolfking_bite', 'wolfking_shadow_curse', 'wolfking_fang_devour', 'boss_mana_charge'] : stringList(monsterTarget.skill_sequence); const cooldowns = jsonObject(monsterTarget.cooldowns);
      let skill: (RowDataPacket & { id: number; code: string; name: string; category: string; element: string; power: number; mana_cost: number; cooldown_turns: number }) | undefined;
      if (sequence.length) {
        const placeholders = sequence.map(() => '?').join(',');
        const [skillRows] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; category: string; element: string; power: number; mana_cost: number; cooldown_turns: number })[]>(`SELECT id,code,name,category,element,power,mana_cost,cooldown_turns FROM skill_definitions WHERE code IN (${placeholders})`, sequence);
        const manaCharge = isBoss ? skillRows.find(candidate => candidate.code === 'boss_mana_charge') : undefined;
        const normalSkills = skillRows.filter(candidate => candidate.code !== 'boss_mana_charge');
        const offCooldownSkills = normalSkills.filter(candidate => Number(cooldowns[candidate.code] ?? 0) <= 0);
        const readySkills = offCooldownSkills.filter(candidate => Number(monsterTarget.current_mp) >= Number(candidate.mana_cost));
        const needsManaCharge = Boolean(manaCharge && offCooldownSkills.length && !readySkills.length);
        skill = needsManaCharge ? manaCharge : (readySkills.length ? readySkills[random(0, readySkills.length - 1)] : undefined);
        if (!needsManaCharge && isWolfKing) {
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
        } else if (!needsManaCharge && isDungeonBoss) {
          const choose = (code: string) => readySkills.find(candidate => candidate.code === code);
          const rotation = ({
            black_slime: ['black_slime_crush', 'black_slime_bind', 'black_slime_wave', 'black_slime_crush'],
            skeleton_general: ['skeleton_command', 'skeleton_quake', 'skeleton_cleave', 'skeleton_impale', 'skeleton_guard', 'skeleton_execution'],
            death_knight: ['death_knight_charge', 'death_knight_prison', 'death_knight_cleave', 'skeleton_bolt', 'death_knight_aura', 'death_knight_lance'],
            necromancer_uz: ['necromancer_curse', 'necromancer_grave_bind', 'necromancer_bolt', 'necromancer_storm', 'necromancer_soul_drain']
          } as Record<string, string[]>)[templateCode] ?? [];
          const hpRatio = Number(monsterTarget.current_hp) / Math.max(1, Number(monsterTarget.hp_max));
          const lowest = [...members].filter(member => !member.is_defeated).sort((a, b) => Number(a.current_hp) / Math.max(1, Number(a.hp_max)) - Number(b.current_hp) / Math.max(1, Number(b.hp_max)))[0];
          const rotate = () => { const index = Math.max(0, Number(cooldowns.boss_rotation ?? 0)) % rotation.length; skill = choose(rotation[index]) ?? skill; cooldowns.boss_rotation = index + 1; };
          if (templateCode === 'black_slime') {
            if (hpRatio < .70 && !cooldowns.boss_phase_70 && choose('black_slime_mend')) { skill = choose('black_slime_mend'); cooldowns.boss_phase_70 = 1; }
            else if (hpRatio < .35 && !cooldowns.boss_phase_35 && choose('black_slime_wave')) { skill = choose('black_slime_wave'); cooldowns.boss_phase_35 = 1; }
            else rotate();
          } else if (templateCode === 'skeleton_general') {
            if (lowest && Number(lowest.current_hp) / Math.max(1, Number(lowest.hp_max)) < .35 && choose('skeleton_execution')) { skill = choose('skeleton_execution'); victim = lowest; }
            else if (hpRatio < .60 && !cooldowns.boss_phase_60 && choose('skeleton_guard')) { skill = choose('skeleton_guard'); cooldowns.boss_phase_60 = 1; }
            else if (hpRatio < .30 && !cooldowns.boss_phase_30 && choose('skeleton_command')) { skill = choose('skeleton_command'); cooldowns.boss_phase_30 = 1; }
            else rotate();
          } else if (templateCode === 'death_knight') {
            if (lowest && Number(lowest.current_hp) / Math.max(1, Number(lowest.hp_max)) < .40 && choose('death_knight_lance')) { skill = choose('death_knight_lance'); victim = lowest; }
            else if (hpRatio < .60 && !cooldowns.boss_phase_60 && choose('death_knight_aura')) { skill = choose('death_knight_aura'); cooldowns.boss_phase_60 = 1; }
            else if (hpRatio < .30 && !cooldowns.boss_phase_30 && choose('death_knight_prison')) { skill = choose('death_knight_prison'); cooldowns.boss_phase_30 = 1; }
            else rotate();
          } else if (templateCode === 'necromancer_uz') {
            const [minions] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=? AND ct.is_defeated=0 AND JSON_CONTAINS(s.traits_json,JSON_OBJECT('code','summoned')) AND t.code IN ('skeleton','undead') LIMIT 1`, [session.combat_id]);
            const [debuffs] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=? AND ce.target_kind='target' AND ce.target_id=? AND e.code IN ('vulnerability','sword_break','armor_shatter','slow','bind','imbalance','burn','poison','bleeding','rending','stun') LIMIT 1`, [session.combat_id, monsterTarget.id]);
            if (debuffs[0] && choose('necromancer_purging_mist')) skill = choose('necromancer_purging_mist');
            else if (hpRatio < .66 && !cooldowns.boss_phase_66 && choose('necromancer_rebirth')) { skill = choose('necromancer_rebirth'); cooldowns.boss_phase_66 = 1; }
            else if (!minions[0] && choose('necromancer_raise')) skill = choose('necromancer_raise');
            else if (lowest && Number(lowest.current_hp) / Math.max(1, Number(lowest.hp_max)) < .45 && choose('necromancer_soul_drain')) { skill = choose('necromancer_soul_drain'); victim = lowest; }
            else if (hpRatio < .33 && !cooldowns.boss_phase_33 && choose('necromancer_storm')) { skill = choose('necromancer_storm'); cooldowns.boss_phase_33 = 1; }
            else rotate();
          }
        }
      }
      if (skill?.code === 'boss_mana_charge') {
        const oldMp = Number(monsterTarget.current_mp); const maxMp = monsterCombatStats(monsterTarget).mpMax;
        monsterTarget.current_mp = maxMp; cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const identifiedMonster = Boolean(appraisalForTarget(appraisal, Number(monsterTarget.level)));
        log.push(`➤【${targetName(monsterTarget)}】释放技能「${identifiedMonster ? skill.name : '???'}」`);
        log.push(`　#魔力充能#恢复 ${monsterTarget.current_mp - oldMp} MP(${oldMp}→${monsterTarget.current_mp})`);
        continue;
      }
      if (skill?.code === 'wolfking_summon_shadow_wolf') {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const count = await summonShadowWolves(connection, session.combat_id, monsterTarget, members); log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」`); log.push(`　➥影幕翻涌，${count}只影狼加入了战斗。`); continue;
      }
      if (skill?.code === 'necromancer_raise') {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const count = await summonNecromancerMinions(connection, session.combat_id, monsterTarget, members); log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」`); log.push(`　➥残骸在咒文中起身，${count}名亡灵加入了战斗。`); continue;
      }
      if (skill?.code === 'wolfking_shadow_curse') {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const monster = monsterCombatStats(monsterTarget); const oldHp = Number(monsterTarget.current_hp); const amount = Math.floor((monster.hpMax - oldHp) * .5); monsterTarget.current_hp = Math.min(monster.hpMax, oldHp + amount);
        await connection.execute(`INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns) VALUES (?, 'target', ?, (SELECT id FROM effect_definitions WHERE code='shadow_curse'), 1, 100, 3)`, [session.combat_id, monsterTarget.id]);
        log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」`); log.push(`　#影咒#恢复 ${amount} HP(${oldHp}→${monsterTarget.current_hp})`); log.push('　#影咒#命中、闪避+100.0%，双攻双防+25.0%(3)'); continue;
      }
      if (skill?.code === 'necromancer_rebirth') {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const oldHp = Number(monsterTarget.current_hp); const amount = Math.max(1, Math.floor(Number(monsterTarget.hp_max) * .28)); monsterTarget.current_hp = Math.min(Number(monsterTarget.hp_max), oldHp + amount);
        log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」`); log.push(`&魂匣回响&恢复 ${monsterTarget.current_hp - oldHp} HP(${oldHp}→${monsterTarget.current_hp})`);
        await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', victim, 'member', 'on_cast', log); continue;
      }
      // 城镇执法小队的祷告官会真正支援同队执法者，而非把辅助技能误施给通缉目标。
      if (skill && isCityPursuit(monsterTarget) && ['healing_prayer', 'blessing_aegis', 'mana_benediction'].includes(skill.code)) {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const pursuitTargetId = Number(cityPursuitTrait(monsterTarget)?.pursuit_target_id ?? 0);
        const allies = targets.filter(target => !target.is_defeated && isCityPursuit(target) && Number(cityPursuitTrait(target)?.pursuit_target_id ?? 0) === pursuitTargetId);
        log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」`);
        if (skill.code === 'healing_prayer') {
          const ally = [...allies].sort((left, right) => Number(left.current_hp) / Math.max(1, Number(left.hp_max)) - Number(right.current_hp) / Math.max(1, Number(right.hp_max)))[0] ?? monsterTarget;
          const oldHp = Number(ally.current_hp); const amount = Math.max(1, Math.floor(monsterCombatStats(monsterTarget).magicAttack * 1.35)); ally.current_hp = Math.min(Number(ally.hp_max), oldHp + amount);
          log.push(`　➥【${targetName(ally)}】恢复 ${ally.current_hp - oldHp} HP(${oldHp}→${ally.current_hp})`);
          await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', ally, 'target', 'on_cast', []);
        } else {
          for (const ally of allies) await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', ally, 'target', 'on_cast', []);
          log.push(skill.code === 'blessing_aegis' ? '#守护祝福#执法小队获得护盾与再生(3)' : '#灵泉祝祷#执法小队每回合恢复魔力(3)');
        }
        continue;
      }
      if (skill) { monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns; }
      const multiplier = Number(skill?.power ?? 100) / 100 * (skill?.code === 'skeleton_execution' && Number(victim.current_hp) / Math.max(1, Number(victim.hp_max)) < .35 ? 1.45 : 1); const monster = monsterCombatStats(monsterTarget); const bite = skill?.code === 'bite';
      const monsterAttack = skill?.category === 'magic' ? monster.magicAttack : monster.physicalAttack; const victimModifiers = await modifiersFor(connection, Number(victim.id)); const victimDefense = (skill?.category === 'magic' ? Number(victim.magic_defense) * (1 + victimModifiers.magicDefensePct / 100) : Number(victim.physical_defense) * (1 + victimModifiers.physicalDefensePct / 100));
      const curse = effectValue('target', Number(monsterTarget.id), 'shadow_curse'); const battleCry = effectValue('target', Number(monsterTarget.id), 'battle_cry'); const mistVeil = effectValue('target', Number(monsterTarget.id), 'mist_veil'); const shadowPierce = effectValue('target', Number(monsterTarget.id), 'shadow_pierce'); const nextActionEffects = effects.filter(effect => effect.target_kind === 'target' && Number(effect.target_id) === Number(monsterTarget.id) && (effect.code === 'mist_veil' || effect.code === 'shadow_pierce')); const imbalance = effectValue('member', Number(victim.id), 'imbalance'); const bind = effectValue('member', Number(victim.id), 'bind'); const fang = skill?.code === 'wolfking_fang_devour'; const pounce = skill?.code === 'wolfking_rending_pounce';
      const resolveMonsterStrike = () => resolveStrike(monsterAttack * multiplier * (1 + curse / 400) * (1 + battleCry / 100) * (1 + mistVeil / 100), victimDefense * (1 - curse / 400), monster.accuracy * (1 + curse / 100 + battleCry / 100), Number(victim.evasion) * (1 - imbalance / 100) * (1 - bind / 100), monster.crit + (bite ? 500 : 0), Number(victim.crit_resist_bp), monster.critDamage, Number(victim.crit_damage_reduction_bp), false, fang || shadowPierce > 0);
      const identifiedMonster = Boolean(appraisalForTarget(appraisal, Number(monsterTarget.level)));
      log.push(`➤【${targetName(monsterTarget)}】${skill ? `释放技能「${identifiedMonster ? skill.name : '???'}」` : '普通攻击'}`);
      if (nextActionEffects.length) await connection.execute(`DELETE FROM combat_status_effects WHERE id IN (${nextActionEffects.map(() => '?').join(',')})`, nextActionEffects.map(effect => effect.id));
      if (skill) await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', victim, 'member', 'on_cast', log);
      if (skill && (skill as any).category === 'utility') continue;
      if (pounce) log.push('$连击$疾速三连击！');
      if (fang) log.push('$利齿$该攻击必定暴击。');
      if (bite) log.push('　#獠牙#该攻击暴击+25.0%');
      if (pounce) {
        for (let index = 0; index < 3 && !victim.is_defeated; index += 1) {
          const strike = resolveMonsterStrike();
          if (!strike.hit) { log.push(`　➥【${victim.name}】闪避了攻击`); continue; }
          const barrier = effectValue('member', Number(victim.id), 'barrier'); const guard = effectValue('member', Number(victim.id), 'shield_guard'); const elemental = elementalMultiplier(monsterTarget.element_mastery_json, victim.element_resistance_json, String(skill?.element ?? '')); const artifactReduction = skill?.category === 'magic' ? victimModifiers.magicDamageReductionPct : victimModifiers.physicalDamageReductionPct; const timeGuarded = effectValue('member', Number(victim.id), 'time_guard') > 0; const damage = timeGuarded ? 0 : directDamageVariance(Math.max(1, Math.floor(strike.damage * elemental * (1 - Math.min(80, barrier) / 100) * (1 - Math.min(90, guard) / 100) * (1 - Math.min(90, artifactReduction) / 100))));
          const oldHp = Number(victim.current_hp); victim.current_hp = Math.max(0, oldHp - damage); if (!victim.current_hp) victim.is_defeated = 1; const timeSaved = await rescueWithTimeGuard(connection, session.combat_id, victim, victimModifiers.timeGuard, log);
          log.push(`　➥${affinityTag(1, elemental)}${strike.crit ? '[暴击!]' : ''}对【${victim.name}】造成 ${damage} 点${skill?.category === 'magic' ? '魔法' : '物理'}伤害(${oldHp}→${victim.current_hp})`);
          if (skill) await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', victim, 'member', 'on_hit', log);
          if (timeSaved) break;
        }
        continue;
      }
      const strike = resolveMonsterStrike();
      if (!strike.hit) { log.push(`　➥【${victim.name}】闪避了攻击`); continue; }
      const areaSkills = new Set(['wolfking_trample', 'black_slime_wave', 'black_slime_bind', 'skeleton_quake', 'death_knight_cleave', 'death_knight_prison', 'necromancer_storm', 'necromancer_grave_bind']);
      const affected = skill && areaSkills.has(skill.code) ? members.filter(member => !member.is_defeated) : [victim];
      for (const affectedVictim of affected) {
        const affectedModifiers = Number(affectedVictim.id) === Number(victim.id) ? victimModifiers : await modifiersFor(connection, Number(affectedVictim.id));
        const elemental = elementalMultiplier(monsterTarget.element_mastery_json, affectedVictim.element_resistance_json, String(skill?.element ?? ''));
        const barrier = effectValue('member', Number(affectedVictim.id), 'barrier'); const guard = effectValue('member', Number(affectedVictim.id), 'shield_guard'); const artifactReduction = skill?.category === 'magic' ? affectedModifiers.magicDamageReductionPct : affectedModifiers.physicalDamageReductionPct;
        const oldHp = Number(affectedVictim.current_hp); const dealt = effectValue('member', Number(affectedVictim.id), 'time_guard') > 0 ? 0 : directDamageVariance(Math.max(1, Math.floor(strike.damage * elemental * (1 - Math.min(80, barrier) / 100) * (1 - Math.min(90, guard) / 100) * (1 - Math.min(90, artifactReduction) / 100))));
        affectedVictim.current_hp = Math.max(0, oldHp - dealt); if (!affectedVictim.current_hp) affectedVictim.is_defeated = 1; await rescueWithTimeGuard(connection, session.combat_id, affectedVictim, affectedModifiers.timeGuard, log);
        log.push(`　➥${affinityTag(1, elemental)}${strike.crit || fang ? '[暴击!]' : ''}对【${affectedVictim.name}】造成 ${dealt} 点${skill?.category === 'magic' ? '魔法' : '物理'}伤害(${oldHp}→${affectedVictim.current_hp})`);
        if (skill) await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', affectedVictim, 'member', 'on_hit', log);
        if (skill?.code === 'necromancer_soul_drain' && dealt > 0) { const oldBossHp = Number(monsterTarget.current_hp); const restored = Math.min(Number(monsterTarget.hp_max) - oldBossHp, Math.max(1, Math.floor(dealt * .55))); monsterTarget.current_hp += restored; if (restored) log.push(`&灵魂汲取&恢复 ${restored} HP(${oldBossHp}→${monsterTarget.current_hp})`); }
      }
    }
  }
  for (const target of targets) {
    const cooldowns = jsonObject(target.cooldowns); for (const [code, turns] of Object.entries(cooldowns)) {
      if (code === 'wolfking_rotation' || code === 'wolfking_shadow_curse_used' || code === 'boss_rotation' || code === 'dungeon_phase_used' || code.startsWith('boss_phase_')) continue;
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
  if (aliveMembers.every(member => (jsonObject(member.pending_action) as unknown as PendingAction).type === 'escape')) {
    await connection.execute('UPDATE combat_sessions SET state=\'escaped\' WHERE id=?', [session.combat_id]);
    await clearSummonedTargets(connection, session.combat_id);
    await restoreLivingCombatTargets(connection, session.combat_id, targets);
    if (targets.length) await connection.execute(`UPDATE combat_ambushes SET status='ready' WHERE status='waiting' AND spawn_id IN (${targets.map(() => '?').join(',')})`, targets.map(target => target.id));
    await persistBattleMembers(connection, members);
    await consumeBattleBuffs(connection, members);
    const retreat = jsonObject(jsonObject(session.cooldowns).dungeonRetreat);
    const retreatRegionId = Number(retreat.regionId); const retreatX = Number(retreat.x); const retreatY = Number(retreat.y); const retreatZ = Number(retreat.z);
    if (Number.isInteger(retreatRegionId) && retreatRegionId > 0 && Number.isInteger(retreatX) && Number.isInteger(retreatY) && Number.isInteger(retreatZ)) {
      const [nextSpawns] = await connection.execute<RowDataPacket[]>('SELECT id FROM monster_spawns WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL LIMIT 1 FOR UPDATE', [retreatRegionId, retreatX, retreatY, retreatZ]);
      for (const member of members) {
        await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE id=?', [retreatRegionId, retreatX, retreatY, retreatZ, member.id]);
        if (nextSpawns[0]) await connection.execute(`INSERT INTO dungeon_encounter_retreats
          (character_id,encounter_region_id,encounter_x,encounter_y,encounter_z,retreat_region_id,retreat_x,retreat_y,retreat_z)
          VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE encounter_region_id=VALUES(encounter_region_id),encounter_x=VALUES(encounter_x),encounter_y=VALUES(encounter_y),encounter_z=VALUES(encounter_z),retreat_region_id=VALUES(retreat_region_id),retreat_x=VALUES(retreat_x),retreat_y=VALUES(retreat_y),retreat_z=VALUES(retreat_z)`, [member.id, retreatRegionId, retreatX, retreatY, retreatZ, member.current_region_id, member.pos_x, member.pos_y, member.pos_z]);
      }
      return { ended: true, waiting: false, log: `${log.join('\n')}\n\n队伍一同撤离了战斗，退回了怪物前一格。` };
    }
    for (const member of members) await connection.execute('INSERT INTO encounter_escape_tokens (character_id,region_id,pos_x,pos_y,pos_z) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE region_id=VALUES(region_id),pos_x=VALUES(pos_x),pos_y=VALUES(pos_y),pos_z=VALUES(pos_z)', [member.id, member.current_region_id, member.pos_x, member.pos_y, member.pos_z]);
    return { ended: true, waiting: false, log: `${log.join('\n')}\n\n队伍一同撤离了战斗。` };
  }
  if (targets.every(target => target.is_defeated)) { const settlement = await finishPartyVictory(connection, session.combat_id, members, targets); await persistBattleMembers(connection, members); const clearedDungeon = await closeDungeonForBossSpawns(connection, targets.map(target => Number(target.id))); return { ended: true, waiting: false, log: `${log.join('\n')}${clearedDungeon ? '\n\n地下迷宫的最终 Boss 已被攻略。迷宫将在两小时后重构，探索者已被送回入口。' : ''}`, settlement, ambushSessionId: session.combat_id }; }
  if (members.every(member => member.is_defeated)) { await connection.execute('UPDATE combat_sessions SET state=\'defeat\' WHERE id=?', [session.combat_id]); await clearSummonedTargets(connection, session.combat_id); const ambushWaiting = await prepareBossAmbushHandoff(connection, session.combat_id, targets); if (!ambushWaiting) await restoreLivingCombatTargets(connection, session.combat_id, targets); const pursuitIds = targets.filter(target => isCityPursuit(target)).map(target => target.id); const pursuitCharacterIds = [...new Set(targets.filter(target => isCityPursuit(target)).map(target => Number(cityPursuitTrait(target)?.pursuit_target_id ?? 0)).filter(Boolean))]; if (pursuitIds.length) await connection.execute(`UPDATE monster_spawns SET current_hp=0,defeated_at=NOW() WHERE id IN (${pursuitIds.map(() => '?').join(',')})`, pursuitIds); if (pursuitCharacterIds.length) await connection.execute(`DELETE FROM city_pursuit_tracks WHERE city_region_id=? AND character_id IN (${pursuitCharacterIds.map(() => '?').join(',')})`, [Number(members[0]?.current_region_id ?? 0), ...pursuitCharacterIds]); await persistBattleMembers(connection, members, true); const pursuitSettlements = await Promise.all(pursuitCharacterIds.map(characterId => settleCityPursuitDefeat(connection, characterId, Number(members[0]?.current_region_id ?? 0)))); const evacuated = await evacuateDungeonDefeat(connection, members, targets); await consumeBattleBuffs(connection, members); return { ended: true, waiting: false, log: log.join('\n'), settlement: `战败结算\n${pursuitSettlements.map(result => result.text).filter(Boolean).join('\n') || '队伍战败，生命仅余1点并开始休息。'}${evacuated ? '\n破魔传送器被强制触发，你们已被送回地下迷宫入口外，并陷入昏迷。' : ''}`, ambushSessionId: ambushWaiting ? session.combat_id : undefined }; }
  await connection.execute('UPDATE combat_sessions SET turn_no=turn_no+1 WHERE id=?', [session.combat_id]); return { ended: false, waiting: false, log: log.join('\n') };
});

/** 自动战斗超过安全回合数时，以普通战败流程收束会话，避免无限计算占用连接池。 */
export const forceAutoBattleDefeat = async (qqUserId: string, reason = '自动战斗已达到 100 回合上限，为避免战斗持续占用系统资源，队伍判定为战败。') => withTransaction(async connection => {
  const character = await characterFor(qqUserId); const session = await activeCombatFor(connection, Number(character.id));
  if (!session) throw new Error('当前不在战斗中。');
  const members = await combatMembers(connection, session.combat_id); const targets = await combatTargets(connection, session.combat_id);
  await connection.execute("UPDATE combat_sessions SET state='defeat' WHERE id=?", [session.combat_id]);
  await clearSummonedTargets(connection, session.combat_id);
  const ambushWaiting = await prepareBossAmbushHandoff(connection, session.combat_id, targets);
  if (!ambushWaiting) await restoreLivingCombatTargets(connection, session.combat_id, targets);
  const pursuitIds = targets.filter(target => isCityPursuit(target)).map(target => target.id);
  if (pursuitIds.length) await connection.execute(`UPDATE monster_spawns SET current_hp=0,defeated_at=NOW() WHERE id IN (${pursuitIds.map(() => '?').join(',')})`, pursuitIds);
  const pursuitCharacterIds = [...new Set(targets.filter(target => isCityPursuit(target)).map(target => Number(cityPursuitTrait(target)?.pursuit_target_id ?? 0)).filter(Boolean))];
  if (pursuitCharacterIds.length) await connection.execute(`DELETE FROM city_pursuit_tracks WHERE city_region_id=? AND character_id IN (${pursuitCharacterIds.map(() => '?').join(',')})`, [Number(members[0]?.current_region_id ?? 0), ...pursuitCharacterIds]);
  await persistBattleMembers(connection, members, true);
  const pursuitSettlements = await Promise.all(pursuitCharacterIds.map(characterId => settleCityPursuitDefeat(connection, characterId, Number(members[0]?.current_region_id ?? 0))));
  const evacuated = await evacuateDungeonDefeat(connection, members, targets);
  await consumeBattleBuffs(connection, members);
  return {
    ended: true as const,
    waiting: false as const,
    log: reason,
    settlement: `战败结算\n${pursuitSettlements.map(result => result.text).filter(Boolean).join('\n') || '队伍战败，生命仅余1点并开始休息。'}${evacuated ? '\n破魔传送器被强制触发，你们已被送回地下迷宫入口外，并陷入昏迷。' : ''}`,
    ambushSessionId: ambushWaiting ? session.combat_id : undefined
  };
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
