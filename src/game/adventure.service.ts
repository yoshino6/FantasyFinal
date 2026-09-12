import { achievementGatherSurprises } from './achievement-surprise';
import { forestArrivalGuildScenes as guildArrivalScenes, forestArrivalTownScenes as townArrivalScenes } from './forest-arrival-content';
import { achievementBookLearned, achievementBookSkillUsed } from './achievement-state';
import { achievementNpcState } from './achievement-hooks';
import { achievementBattleOutcome } from './achievement-easter';
import { achievementBattleAction, achievementBattleContribution, achievementBattleEvidence, achievementCombatVictory, achievementCombatObserved } from './achievement-combat';
import { recordAchievement } from './achievement-events';
import { achievementEquipment, achievementLevel, achievementItem, achievementActivity, normalSkillSpecializationFacts } from './achievement-hooks';
import { assertTalentReviewResolved } from './talent-review';
import { openingCombatEffectsFor, openingManaCost } from './opening-combat';
import { readTalentData } from './talent-data';
import { talentDropPack } from './talent-drops';
import { talentByCode } from './talent.config';
import { loadTalentBattle, persistTalentBattle, talentTransferBuff } from './talent-battle.service';
import { talentExperience, type TalentRewardContext } from './talent-rewards';
import { talentBeginGather, talentGatherReward, talentMovementFactor, talentMovementArrived } from './talent-exploration';
import { talentRecordEnemyDamage, talentSupport, hasTalent, talentState, talentBeginAction, talentEndAction, talentCommitAction, talentCanPaySkill, talentPaySkill, talentFinishFire } from './talent-combat';
import { monsterGrowthAllocation, monsterIdentityCode, isResidentMonsterCode } from './monster-growth';
import { playerGrowthShares } from './growth-rules';
import { strikeCorrections } from './combat-math';
import { armorSetFromRows, type ArmorSet } from './armor-set';
import { grantInventory } from './inventory-binding';
import { runNegotiation, readNegotiationReplay, assertNoNegotiation, assertMonsterNotNegotiating, closeNegotiationSession, NegotiationCombatError, type NegotiationCommand, type NegotiationDrop, type NegotiationResult } from './negotiation.service';
import { hiddenAttributesFor } from './hidden-attributes.service';
import { negotiationReferenceValue } from './negotiation-item-policy';
import { teamLuckMultiplier, weightedRecipient, scaledDropEntries, moodDropMultiplier, negotiationVersion } from './negotiation-rules';
import { executeHiddenCombat, HiddenBattleError, hiddenEndTurn, hiddenReorder, hiddenDeviceSnapshot, hiddenNativeDevice, hiddenAfterHit } from './hidden-combat';
import { hiddenBattleContext, submitHiddenDraft, initializeHiddenBattleUnits, type HiddenTicket } from './hidden-battle.service';
import { isHiddenSkill } from './hidden-profession.config';
import { hiddenResourceView, hiddenResourceShortage, gainHiddenResource, type HiddenChoice } from './hidden-combat-state';
import { combatUnitLabel } from './combat-unit-label';
import { installBossComponentDamage } from './boss-component-damage';
import { bossSkyDustDrops } from './boss-sky-dust';
import { validWorldSitePoint, type WorldArea } from './world-site-geometry';
import { installAutomatonRules, actAutomaton } from './automaton-combat';
import { loadCombatAutomatons, saveCombatAutomatons, finishCombatAutomatons, appendAutomatonBattleQuotes, applyEnemySkillToAutomaton } from './automaton-combat.service';
import { useAlchemyCombat, alchemyEndTurn, consumeAlchemyChant } from './alchemy-combat';
import { randomUUID } from 'node:crypto';
import { skillSpecialization, manaTransferCost, specializationUpgradeCost, specializationMaximum, specializationOptions, specializeEffectValue, specializeEffectDuration, specializeControlChance, type SkillSpecializations, type SkillSpecializationResult } from './skill-specialization';
import { canDispelCombatEffect, isHardControlEffect, nativeCleanseLimit } from './combat-dispel-policy';
import { canSpecializePassive, passiveSpecializationFactor, specializedPassiveValue } from './passive-specialization';
import { finishNpcSparring } from './npc-sparring.service';
import { createCombatRules } from './combat-rule-adapter';
import { maskRuleBattleLog, readRuleState, ruleManaCost, ruleStatusSummary, displayedRuleName, visibleResidentBuff, type CombatRules } from './combat-rule-registry';
import { residentSkillByCode } from './resident-skill.config';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { sortMapMarkers } from './map-marker.service';
import { calculateDerivedStats, experienceRequiredForLevel, forgedEquipmentBase, realmEnergyDissipationText, realmLevelCap, virtualEquipmentStats, type VirtualEquipmentTier } from './constants';
import { effectiveCharacterAttributes, recalculateCharacterStats, refreshCharacterStamina } from './character.service';
import { encumbrance } from './encumbrance';
import { advanceBountyProgress, refreshBounties } from './bounty.service';
import { attributes, type Allocation } from './types';
import { recordSkillPointChange } from './skill-point-ledger.service';
import { awardOmniscientProficiency, recordOmniscientObservation } from './omniscient.service';
import {applyBattleElixir} from './battle-elixir.service';
import {combatItemEffect} from './item-use-policy';
import { closeDungeonForBossSpawns, dungeonArrivalEvent, dungeonCellAt, dungeonEntranceAt, dungeonPlayersInRange } from './dungeon.service';
import { completeDungeonSecretForLeader, discoverDungeonEntrance } from './dungeon-quest.service';
import { completeEvolutionQuest, completeGoblinKingQuest, goblinKingArrival } from './main-quest.service';
import { collectCityDebts, recordWarrantSighting, settleCityPursuitDefeat } from './pvp.service';
import { worldSurfaceMonsters } from '../config/world-surface';
import { detentionMessage } from './time-format';
import { homeRestExperiencePerMinute, homeRestRecoveryBonus, isInHome } from './home.service';
import { bossControlChanceMultiplier, directDamageVariance, resolveStrike, tenacityContest } from './combat-math';
import { hasCompatibleSkillWeapon, skillWeaponRequirementMessage } from './skill-weapon.service';
import { resolvedMonsterMaterialDropCode } from './monster-crafting-material.service';
import { secondaryProfessionBonus } from './secondary-profession';
import { globalCopperMultiplier, globalDropMultiplier, globalExperienceMultiplier } from './global-management.service';
import { advanceEvolutionObservationBattle, advanceEvolutionObservationMining, evolutionStatBonuses, repairEvolutionProgress, symbiosisTraits, type SymbiosisTraitCode } from './evolution.service';
import { completeAdvancedProfessionTrial, recordAdvancedProfessionKills } from './advanced-profession.service';
import { spiritDefinitionBySkill, type SpiritDefinition } from './spirit-summoner.config';
import { inheritancePassivesFor } from './advanced-passive.service';
import { advancedResourceForProfession, advancedResourceRequirementForSkill } from './advanced-resource.config';
import { registeredAdvancedProfessionByCode as advancedProfessionByCode, isAdvancedProfessionSkillCode, isCachedAdvancedPassiveEffect } from './advanced-profession.config';
import { epicLoadoutFor, hasEpicWeaponEffect, type EpicLoadout } from './epic-equipment.service';
import { combatEnvironmentFor, snapshotCombatEnvironment, weatherElementMultiplier as dynamicWeatherElementMultiplier } from './world-dynamics.service';
import { dynamicNpcProfile } from './dynamic-npc-dialogue.service';
import { activeDeviceSkillByCode, combatDeviceSlotsFor, initializeCombatDeviceEnergy, restoreCombatDeviceEnergy } from './device.service';
import { assertCombatLoadoutMutable } from './combat-loadout-lock.service';
import { regionalBossComponentByKey, regionalBossComponentsFor, type RegionalBossComponentKey } from './regional-boss-components.config';

type CharacterRow = RowDataPacket & Allocation & Record<`${keyof Allocation}_growth`, number> & { id: number; player_id: number; npc_code: string | null; name: string; level: number; experience: number; realm_stage: number; skill_points: number; stamina: number; stamina_updated_at: Date; hp_max: number; mp_max: number; current_hp: number; current_mp: number; activity_status: 'active' | 'resting' | 'unconscious' | 'detained'; rest_started_at: Date | null; home_rest_experience_updated_at: Date | null; detained_until: Date | null; physical_attack: number; magic_attack: number; physical_defense: number; magic_defense: number; accuracy: number; evasion: number; crit_rate_bp: number; crit_damage_bp: number; crit_resist_bp: number; crit_damage_reduction_bp: number; tenacity: number; tenacity_pierce: number; speed: number; perception: number; spirit: number; intelligence: number; element_mastery_json: unknown; element_resistance_json: unknown; adventurer_registered: number; secondary_profession_code: string | null; current_region_id: number; pos_x: number; pos_y: number; pos_z: number; region_name: string };
type MonsterAttributes = Allocation & Record<`${keyof Allocation}_growth`, number> & { code?: string; template_code?: string; growth_template_code?: string };
type BossTraitStat = 'hp' | 'tenacity' | 'physicalAttack' | 'magicAttack' | 'physicalDefense' | 'magicDefense' | 'accuracy' | 'evasion' | 'speed' | 'critRate' | 'critDamage' | 'critResist' | 'critReduction';
type MonsterTrait = { code: string; name: string; groupId?: string; role?: 'leader' | 'member'; session_id?: string; attributeMultiplier?: number; statMultiplier?: number; statMultipliers?: Partial<Record<BossTraitStat, number>>; hpPct?: number; mpPct?: number; physicalAttackPct?: number; magicAttackPct?: number; physicalDefensePct?: number; magicDefensePct?: number; accuracyPct?: number; evasionPct?: number; speedPct?: number; critRatePct?: number; critDamagePct?: number; critResistPct?: number; critReductionPct?: number; experiencePct?: number; dropPct?: number; profession_code?: string; build?: unknown; equipment?: unknown; evolution?: unknown };
type BossComponentStats = { hpMax: number; mpMax: number; physicalAttack: number; magicAttack: number; physicalDefense: number; magicDefense: number; accuracy: number; evasion: number; crit: number; critResist: number; critDamage: number; critReduction: number; tenacity: number; tenacityPierce: number; speed: number; perception: number };
export const regionalBossComponentStats = (body: BossComponentStats, definition: ReturnType<typeof regionalBossComponentsFor>[number]): BossComponentStats => ({
  ...body, hpMax: Math.max(1, Math.floor(body.hpMax * definition.hpRatio)), mpMax: 0,
  physicalAttack: Math.max(1, Math.floor(body.physicalAttack * definition.physicalAttackRatio)), magicAttack: Math.max(1, Math.floor(body.magicAttack * definition.magicAttackRatio)),
  physicalDefense: Math.max(1, Math.floor(body.physicalDefense * definition.physicalDefenseRatio)), magicDefense: Math.max(1, Math.floor(body.magicDefense * definition.magicDefenseRatio)),
  speed: Math.max(1, Math.floor(body.speed * definition.speedRatio))
});
type BossComponentTrait = MonsterTrait & { code: 'boss_component'; body_spawn_id: number; body_code: string; part_key: RegionalBossComponentKey; stats: BossComponentStats };
type SpawnRow = RowDataPacket & MonsterAttributes & { id: number; template_id?: number; name: string; monster_class: string; level: number; current_hp: number; hp_max: number; attack: number; defense: number; speed: number; experience: number; drops_json: unknown; skill_sequence?: unknown; traits_json?: unknown; weakness_json?: unknown; resistance_json?: unknown; element_mastery_json?: unknown; element_resistance_json?: unknown };
type CombatMemberRow = CharacterRow & { current_hp: number; current_mp: number; selected_target_id: number | null; pending_action: unknown; cooldowns: unknown; stamina_eligible: number; is_defeated: number };
const combatInactivityMinutes = 3;
type CombatTargetRow = SpawnRow & { current_mp: number; cooldowns: unknown; is_defeated: number };
type PendingAction = { hidden?: HiddenChoice; type: 'attack' | 'skill' | 'item' | 'escape' | 'device' | 'device_charge' | 'defend'; chantRelease?: boolean; slot?: number; skillId?: number; itemId?: number; deviceSkillCode?: string; deviceInstanceId?: number; targetKind?: 'member' | 'target'; targetId?: number };
type CombatRetreatPosition = { regionId: number; x: number; y: number; z: number };
type CombatEffectRow = RowDataPacket & { source_key?: string | null; id: number; target_kind: 'member' | 'target'; target_id: number; code: string; name: string; effect_type: string; value: number; stacks: number; remaining_turns: number };
type CombatProfessionResourceRow = RowDataPacket & { character_id: number; profession_code: string; resource_code: string; resource_name: string; current_value: number; max_value: number };
type CombatSpiritStats = { physicalAttack: number; magicAttack: number; physicalDefense: number; magicDefense: number; accuracy: number; evasion: number; crit: number; speed: number };
type CombatSpiritRow = RowDataPacket & { owner_character_id: number; spirit_code: string; spirit_name: string; current_hp: number; hp_max: number; stats_json: unknown; remaining_turns: number };
type AlchemyCombatEffect = {
  alchemyOutput?: boolean;
  heal?: number;
  restoreMp?: number;
  healPct?: number;
  restoreMpPct?: number;
  cleanse?: boolean;
  battleCount?: number;
  experienceBonusPct?: number;
  partyDropBonusPct?: number;
  target?: 'self' | 'enemy';
  targetScope?: 'single' | 'all';
  status?: { code: string; value: number; turns: number; chance?: number; applicableLevel?: number };
  throwable?: { damageScale: number; element: string };
  perBattleLimit?: number;
};
type CombatModifiers = { armorSet?: ArmorSet | null; weaponName?: string; artifact?: 'holy_sword' | 'demon_sword'; artifacts: string[]; physicalAttack: number; magicAttack: number; physicalAttackPct: number; magicAttackPct: number; physicalDefensePct: number; magicDefensePct: number; critRatePct: number; critDamagePct: number; accuracyPct: number; mpPct: number; chantSpeedPct: number; critRateBp: number; ignoreDefensePct: number; lifestealPct: number; magicDamagePct: number; damageBonusPct: number; damageReductionPct: number; healingBonusPct: number; healingReceivedPct: number; regenerationBonusPct: number; venomDamagePct: number; manaCostReduction: number; experienceMultiplier: number; dropBonus: number; manaAffinity: boolean; lightSkillBonusPct: number; criticalDamageBonusPct: number; unifyAttack: boolean; prayerHymn: boolean; physicalDamageReductionPct: number; magicDamageReductionPct: number; timeGuard: boolean; pursuitChancePct: number; bloodForMana: boolean; hpRegenPct: number; mpRegenPct: number; minimumHitRatePct: number; actualHitRatePct: number; physicalActualHitRatePct: number; physicalSkillDamagePct: number; magicSkillDamagePct: number; magicChantBonus: number; physicalForceCrit: boolean; physicalCriticalFinalDamagePct: number };
type AppraisalMember = { characterId: number; level: number; rangeLevel: number; informationLevel: number };
type AppraisalProfile = { learned: boolean; rangeLevel: number; informationLevel: number; members: AppraisalMember[] };
export type VictorySettlement = { kind: 'victory'; members: { name: string; experience: number; staminaSpent?: number; staminaInsufficient?: boolean; realmLocked?: boolean; realmCapReached?: boolean; realmStage?: number; talentNotice?: string; levelText?: string; drops: { name: string; quantity: number; itemType: string; codexId: string | null; instanceId?: number }[]; learned: { id: number; name: string }[] }[]; advancedProfessionCompleted?: { name: string; code: string; profession: string; passive: string; refundedSkillPoints: number; availableSkillPoints: number }[]; arrivalPending?: boolean; dungeonSecretCompleted?: boolean; goblinKingCompleted?: boolean; evolutionCompleted?: boolean; pursuitCooldownMinutes?: number };
export type AmbushDelivery = { scope: 'group' | 'c2c'; targetId: string; botId?: string };
export type CombatAmbushHandoff = {
  kind: 'boss' | 'party'; spawnId: number; ambusherCharacterId: number; ambusherQqUserId: string; opponentCharacterId?: number;
  delivery: AmbushDelivery;
};
const monsterAttributeColumns = `t.code AS growth_template_code,${attributes.map(attribute => `COALESCE(s.${attribute},t.${attribute}) AS ${attribute},t.${attribute}_growth`).join(',')}`;
const templateMonsterAttributeColumns = `t.code AS growth_template_code,${attributes.map(attribute => `t.${attribute},t.${attribute}_growth`).join(',')}`;
const lowMonsterTraits: MonsterTrait[] = [
  { code: 'fierce', name: '凶猛的', physicalAttackPct: 10 }, { code: 'sturdy', name: '坚韧的', hpPct: 10 },
  { code: 'keen', name: '敏锐的', accuracyPct: 10 }, { code: 'nimble', name: '灵巧的', evasionPct: 10, speedPct: 5 },
  { code: 'arcane', name: '魔蕴的', magicAttackPct: 10 }, { code: 'hardhide', name: '硬皮的', physicalDefensePct: 10 }
];
// 切磋标记没有展示前缀，但其中的人物真名、属性与携带技能必须保留。
const traitList = (value: unknown) => jsonArray(value).map(item => jsonObject(item) as unknown as MonsterTrait).filter(trait => trait.code && (trait.name || trait.code === 'npc_sparring'));
const isSummonedMonster = (monster: { traits_json?: unknown }) => traitList(monster.traits_json).some(trait => trait.code === 'summoned');
const bossComponentTrait = (monster: { traits_json?: unknown }) => jsonArray(monster.traits_json).map(jsonObject).find(trait => trait.code === 'boss_component') as unknown as BossComponentTrait | undefined;
const isBossComponent = (monster: { traits_json?: unknown }) => Boolean(bossComponentTrait(monster));
const bossComponentDefinition = (monster: { traits_json?: unknown }) => {
  const trait = bossComponentTrait(monster);
  return trait ? regionalBossComponentByKey(String(trait.part_key)) : undefined;
};
const componentBodyId = (monster: { traits_json?: unknown }) => Number(bossComponentTrait(monster)?.body_spawn_id ?? 0);
const livingBossComponentsFor = (body: { id: number }, targets: { is_defeated: number; traits_json?: unknown }[]) => targets.filter(target => !target.is_defeated && componentBodyId(target) === Number(body.id));
const bossBodyDamageMultiplier = (body: { id: number }, targets: { is_defeated: number; traits_json?: unknown }[]) => Math.pow(.7, livingBossComponentsFor(body, targets).length);
const bossBodyDamageReductionPct = (body: { id: number }, targets: { is_defeated: number; traits_json?: unknown }[]) => Math.round((1 - bossBodyDamageMultiplier(body, targets)) * 1000) / 10;
const componentWarningFor = (component: { traits_json?: unknown }, body?: { cooldowns?: unknown }) => {
  const definition = bossComponentDefinition(component); const cooldowns = jsonObject(body?.cooldowns);
  if (!definition) return '';
  if (definition.key === 'gruen_horn' && Number(cooldowns.boss_component_gruen_horn_charge ?? 0) > 0) return '角鸣蓄能：下次崩震强化';
  if (definition.key === 'valk_chain' && Number(cooldowns.boss_component_valk_chain_execute_at ?? 0) > 0) return '熔链处刑倒计时';
  if (definition.key === 'valk_bellows' && Number(cooldowns.regional_valk_heat ?? 0) === 2) return '满压鼓风：下个敌方行动前击破';
  return '';
};
const isBossTestMonster = (monster: { traits_json?: unknown }) => traitList(monster.traits_json).some(trait => trait.code === 'boss_test');
const advancedProfessionTrial = (monster: { traits_json?: unknown }) => traitList(monster.traits_json).find(trait => trait.code === 'advanced_profession_trial') as (MonsterTrait & { owner_character_id?: number; profession_code?: string }) | undefined;
const isAdvancedProfessionTrialMonster = (monster: { traits_json?: unknown }) => Boolean(advancedProfessionTrial(monster));
const kingbeastTrait = (monster: { traits_json?: unknown }) => jsonArray(monster.traits_json).map(jsonObject).find(trait => trait.code === 'kingbeast_encounter') as MonsterTrait | undefined;
const isKingbeastCore = (monster: { traits_json?: unknown }) => Boolean(kingbeastTrait(monster));
const kingbeastRole = (monster: { traits_json?: unknown }) => String((kingbeastTrait(monster) as any)?.role ?? '');
const cityPursuitTrait = (monster: { traits_json?: unknown }) => jsonArray(monster.traits_json).map(jsonObject).find(trait => trait.code === 'city_pursuit');
const isCityPursuit = (monster: { traits_json?: unknown }) => Boolean(cityPursuitTrait(monster));
const mainQuestGoblinKingTrait = (monster: { traits_json?: unknown }) => jsonArray(monster.traits_json).map(jsonObject).find(trait => trait.code === 'main_quest_goblin_king');
const riotMaterialByMonster: Record<string, string> = { ball_rabbit: 'magic_wool', roll_rabbit: 'magic_wool', spike_boar: 'magic_tusk', tusk_boar: 'magic_tusk', vine_snake: 'magic_scale', vine_python: 'magic_scale', black_bear: 'magic_claw', pitch_bear: 'magic_claw', mist_wolf: 'magic_heartcore', shadow_wolf: 'magic_heartcore', goblin: 'goblin_ear' };
const percentBonus = (traits: MonsterTrait[], key: keyof MonsterTrait) => traits.reduce((total, trait) => total + Number(trait[key] ?? 0), 0);
const advancedMentorBuildFor = (monster: { traits_json?: unknown }) => {
  const trait = traitList(monster.traits_json).find(entry => entry.code === 'advanced_mentor_build');
  const build = jsonObject(trait?.build);
  return Object.keys(build).length ? build : null;
};
export const monsterAttributes = (monster: MonsterAttributes & { level: number; traits_json?: unknown }): Allocation => {
  const spar = jsonObject(jsonObject(traitList(monster.traits_json).find(trait => trait.code === 'npc_sparring')).profile);
  const snapshot = jsonObject(spar.trainedAttributes ?? advancedMentorBuildFor(monster)?.trainedAttributes);
  if (attributes.every(key => snapshot[key] !== undefined && Number.isFinite(Number(snapshot[key])))) {
    return Object.fromEntries(attributes.map(key => [key, Number(snapshot[key])])) as Allocation;
  }
  const multiplier = traitList((monster as SpawnRow).traits_json).reduce((value, trait) => value * Number(trait.attributeMultiplier ?? 1), 1);
  return monsterGrowthAllocation(monster, multiplier);
};
export const monsterCombatStats = (monster: MonsterAttributes & { level: number; traits_json?: unknown; monster_class?: string }) => {
  const spar = jsonObject(jsonObject(traitList(monster.traits_json).find(trait => trait.code === 'npc_sparring')).profile);
  if (spar.stats) {
    const stats = jsonObject(spar.stats); const value = (key: string) => Math.max(0, Math.floor(Number(stats[key] ?? 0)));
    return { hpMax: value('hpMax'), mpMax: value('mpMax'), physicalAttack: value('physicalAttack'), magicAttack: value('magicAttack'), physicalDefense: value('physicalDefense'), magicDefense: value('magicDefense'), accuracy: value('accuracy'), evasion: value('evasion'), crit: value('critRateBp'), critResist: value('critResistBp'), critDamage: value('critDamageBp'), critReduction: value('critDamageReductionBp'), tenacity: value('tenacity'), tenacityPierce: value('tenacityPierce'), speed: value('speed'), perception: Number(jsonObject(spar.trainedAttributes).perception ?? 0) };
  }
  const component = bossComponentTrait(monster);
  if (component) {
    const stats = jsonObject(component.stats);
    const value = (key: keyof BossComponentStats) => Math.max(0, Math.floor(Number(stats[key] ?? 0)));
    return {
      hpMax: value('hpMax'), mpMax: value('mpMax'), physicalAttack: value('physicalAttack'), magicAttack: value('magicAttack'), physicalDefense: value('physicalDefense'), magicDefense: value('magicDefense'),
      accuracy: value('accuracy'), evasion: value('evasion'), crit: value('crit'), critResist: value('critResist'), critDamage: value('critDamage'), critReduction: value('critReduction'),
      tenacity: value('tenacity'), tenacityPierce: value('tenacityPierce'), speed: value('speed'), perception: value('perception')
    };
  }
  const mentorBuild = advancedMentorBuildFor(monster);
  if (mentorBuild) {
    const stats = jsonObject(mentorBuild.stats);
    const value = (key: string) => Math.max(0, Math.floor(Number(stats[key] ?? 0)));
    // 导师的数值已由“角色六维→进化→传说装备→副词条”完整计算；不再叠怪物虚拟装备或 Boss 四倍生命。
    return {
      hpMax: value('hpMax'), mpMax: value('mpMax'), physicalAttack: value('physicalAttack'), magicAttack: value('magicAttack'), physicalDefense: value('physicalDefense'), magicDefense: value('magicDefense'),
      accuracy: value('accuracy'), evasion: value('evasion'), crit: value('critRateBp'), critResist: value('critResistBp'), critDamage: value('critDamageBp'), critReduction: value('critDamageReductionBp'),
      tenacity: value('tenacity'), tenacityPierce: value('tenacityPierce'), speed: value('speed'), perception: Math.max(0, Math.floor(Number(jsonObject(mentorBuild.trainedAttributes).perception ?? 0)))
    };
  }
  const values = monsterAttributes(monster);
  const baseStats = calculateDerivedStats(values);
  const monsterClass = String((monster as SpawnRow).monster_class ?? 'normal');
  const tier: VirtualEquipmentTier = monsterClass === 'large' || monsterClass === 'elite' || monsterClass === 'boss' ? monsterClass : 'normal';
  // 虚拟装备先并入词条前的派生属性；随后由怪物词条决定最终倍率。
  // 校准成长不改变既有种类的虚拟武器方向，防止一次重算将装备攻击转移到另一侧。
  const weaponReference = calculateDerivedStats(Object.fromEntries(attributes.map(key => [key, Math.floor(Number(monster[key]) + Number(monster[`${key}_growth`]) * Math.max(0, Number(monster.level) - 1))])) as Allocation);
  const virtual = virtualEquipmentStats(Number(monster.level), tier, weaponReference.physicalAttack, weaponReference.magicAttack, undefined, isResidentMonsterCode(monsterIdentityCode(monster)) ? 'resident' : 'monster');
  const stats = {
    ...baseStats,
    hpMax: baseStats.hpMax + virtual.hpMax,
    mpMax: baseStats.mpMax + virtual.mpMax,
    physicalAttack: baseStats.physicalAttack + virtual.physicalAttack,
    magicAttack: baseStats.magicAttack + virtual.magicAttack,
    physicalDefense: baseStats.physicalDefense + virtual.physicalDefense,
    magicDefense: baseStats.magicDefense + virtual.magicDefense,
    accuracy: baseStats.accuracy + virtual.accuracy,
    evasion: baseStats.evasion + virtual.evasion,
    critRateBp: baseStats.critRateBp + virtual.critRateBp,
    critDamageBp: baseStats.critDamageBp + virtual.critDamageBp,
    critResistBp: baseStats.critResistBp + virtual.critResistBp,
    critDamageReductionBp: baseStats.critDamageReductionBp + virtual.critDamageReductionBp,
    tenacity: baseStats.tenacity + virtual.tenacity,
    tenacityPierce: baseStats.tenacityPierce + virtual.tenacityPierce,
    speed: baseStats.speed + virtual.speed
  };
  // 已生成首领的 traits_json 可能仍是旧版数值；按词条代码映射到当前定义，
  // 使改表后无需等待该首领重生即可按新规则战斗。
  const traits = traitList((monster as SpawnRow).traits_json).map(trait => bossTraitDefinitionFor(trait.code) ?? trait);
  const boss = (monster as SpawnRow).monster_class === 'boss';
  const multiplierFor = (stat?: BossTraitStat) => traits.reduce((value, trait) => value * Number((stat ? trait.statMultipliers?.[stat] : undefined) ?? trait.statMultiplier ?? 1), 1);
  const boosted = (value: number, key: keyof MonsterTrait, stat?: BossTraitStat) => Math.floor(value * multiplierFor(stat) * (1 + percentBonus(traits, key) / 100));
  const scaled = (value: number, stat?: BossTraitStat) => Math.floor(value * multiplierFor(stat));
  // 主线双阶段首领沿用专属的三倍生命设定；随机/地图首领则完全由当前词条给出生命倍率。
  // 无随机词条的剧情首领不再额外叠加通用 Boss 生命倍率。
  const specialQuestBossHpMultiplier = isKingbeastCore(monster) || jsonArray(monster.traits_json).some(trait => jsonObject(trait).code === 'main_quest_evolution') ? 3 : undefined;
  const hasBossTrait = traits.some(trait => bossTraitDefinitionFor(trait.code));
  const hpMultiplier = specialQuestBossHpMultiplier ?? (boss && !hasBossTrait ? 1 : multiplierFor('hp'));
  const result = {
    hpMax: Math.floor(stats.hpMax * hpMultiplier * (1 + percentBonus(traits, 'hpPct') / 100)), mpMax: boosted(stats.mpMax, 'mpPct'), physicalAttack: boosted(stats.physicalAttack, 'physicalAttackPct', 'physicalAttack'), magicAttack: boosted(stats.magicAttack, 'magicAttackPct', 'magicAttack'),
    physicalDefense: boosted(stats.physicalDefense, 'physicalDefensePct', 'physicalDefense'), magicDefense: boosted(stats.magicDefense, 'magicDefensePct', 'magicDefense'), accuracy: boosted(stats.accuracy, 'accuracyPct', 'accuracy'), evasion: boosted(stats.evasion, 'evasionPct', 'evasion'),
    crit: boosted(stats.critRateBp, 'critRatePct', 'critRate'), critResist: boosted(stats.critResistBp, 'critResistPct', 'critResist'), critDamage: boosted(stats.critDamageBp, 'critDamagePct', 'critDamage'), critReduction: boosted(stats.critDamageReductionBp, 'critReductionPct', 'critReduction'), tenacity: scaled(stats.tenacity, 'tenacity'), tenacityPierce: scaled(stats.tenacityPierce), speed: boosted(stats.speed, 'speedPct', 'speed'), perception: scaled(values.perception)
  };
  // 部位的反噬与短时覆层写在本体战斗冷却中，不能污染地图 Boss 的永久模板属性。
  const cooldowns = jsonObject((monster as { cooldowns?: unknown }).cooldowns);
  const physicalDefenseMultiplier = Number(cooldowns.boss_component_gruen_armor_broken ?? 0) ? .5
    : Number(cooldowns.boss_component_valk_armor_broken ?? 0) ? .55 : 1;
  const magicDefenseMultiplier = physicalDefenseMultiplier;
  const physicalAttackMultiplier = (Number(cooldowns.boss_component_gruen_arm_broken ?? 0) ? .7 : 1)
    * (Number(cooldowns.boss_component_gruen_horn_recoil ?? 0) > 0 ? .7 : 1)
    * (Number(cooldowns.boss_component_valk_chain_recoil ?? 0) > 0 ? .8 : 1);
  const magicAttackMultiplier = (Number(cooldowns.boss_component_gruen_horn_recoil ?? 0) > 0 ? .7 : 1)
    * (Number(cooldowns.boss_component_valk_chain_recoil ?? 0) > 0 ? .8 : 1)
    * (Number(cooldowns.boss_component_valk_bellows_recoil ?? 0) > 0 ? .65 : 1);
  const armorGuard = (Number(cooldowns.boss_component_gruen_armor_guard ?? 0) > 0 ? .25 : 0) + (Number(cooldowns.boss_component_valk_armor_guard ?? 0) > 0 ? .20 : 0);
  return {
    ...result,
    physicalAttack: Math.max(1, Math.floor(result.physicalAttack * physicalAttackMultiplier)), magicAttack: Math.max(1, Math.floor(result.magicAttack * magicAttackMultiplier)),
    physicalDefense: Math.max(1, Math.floor(result.physicalDefense * physicalDefenseMultiplier * (1 + armorGuard))), magicDefense: Math.max(1, Math.floor(result.magicDefense * magicDefenseMultiplier * (1 + armorGuard)) )
  };
};
/**
 * 高等级怪物对低等级角色的隐藏等级压制：仅用于战斗回合内的属性对抗，
 * 不写入怪物实体，也不供地图、鉴识或面板展示使用。
 */
const hiddenMonsterLevelPressure = (monster: { level: number }, playerLevel: number) => Math.pow(1.1, Math.max(0, Number(monster.level) - Math.max(1, Number(playerLevel))));
const monsterCombatStatsForPlayer = (monster: MonsterAttributes & { level: number; traits_json?: unknown }, playerLevel: number) => {
  const stats = monsterCombatStats(monster); const multiplier = advancedMentorBuildFor(monster) || traitList(monster.traits_json).some(trait => trait.code === 'npc_sparring') ? 1 : hiddenMonsterLevelPressure(monster, playerLevel);
  if (multiplier === 1) return stats;
  const pressured = (value: number) => Math.floor(value * multiplier);
  return {
    ...stats,
    accuracy: pressured(stats.accuracy), evasion: pressured(stats.evasion), crit: pressured(stats.crit), critDamage: pressured(stats.critDamage),
    critResist: pressured(stats.critResist), critReduction: pressured(stats.critReduction), tenacity: pressured(stats.tenacity), tenacityPierce: pressured(stats.tenacityPierce), speed: pressured(stats.speed)
  };
};
const materializeMonster = <T extends SpawnRow>(monster: T, revealTraits = false): T => {
  const stats = monsterCombatStats(monster);
  const traits = traitList(monster.traits_json);
  // 编队属于遭遇形态而非鉴识信息，始终露出前缀，避免队伍在地图与战斗选择中看起来像单只怪物。
  // “域民”是地图感知分类，不是战斗中的称号前缀；战斗与鉴识名称保持人物本名。
  const displayTraits = traits.filter(trait => !['npc_sparring', 'domain_resident', 'advanced_profession_trial', 'advanced_mentor_build', 'advanced_mentor_equipment', 'advanced_mentor_evolution'].includes(trait.code) && !(isBossComponent(monster) && trait.code === 'summoned'));
  const visibleTraits = displayTraits.filter(trait => revealTraits || trait.code === 'goblin_formation');
  const prefix = visibleTraits.map(trait => trait.name).join(''); const allTraitPrefix = displayTraits.map(trait => trait.name).join('');
  let baseName = String(jsonObject(jsonObject(traits.find(trait => trait.code === 'npc_sparring')).profile).name ?? monster.name);
  // 王座尚未分裂时，国王以驾驭哈巴龙的联合称号出现；分离后恢复双方各自的独立名称。
  const kingbeastPhaseTwo = Boolean(jsonObject((monster as SpawnRow & { cooldowns?: unknown }).cooldowns).kingbeast_phase_two);
  if (kingbeastRole(monster) === 'king') baseName = kingbeastPhaseTwo ? '哥布林国王' : '横冲直撞的哥布林国王';
  if (kingbeastRole(monster) === 'dragon') baseName = kingbeastPhaseTwo ? '横冲直撞哈巴龙' : '横冲直撞哈巴龙·载王中';
  // 同一怪物可能先按普通视图实体化、再按鉴识视图实体化；剥离已有前缀后再统一添加，避免出现“编队·编队·”。
  for (const existingPrefix of [allTraitPrefix, prefix]) while (existingPrefix && baseName.startsWith(existingPrefix)) baseName = baseName.slice(existingPrefix.length);
  baseName = baseName.replace(/^(?:虚弱的|凶猛的|迅捷的|坚韧的)+/, '');
  return Object.assign({}, monster, { name: `${prefix}${baseName}`, hp_max: stats.hpMax, attack: stats.physicalAttack, defense: stats.physicalDefense, speed: stats.speed });
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
export const awardRealmExperience = async (connection: PoolConnection, character: Pick<CharacterRow, 'id' | 'level' | 'experience' | 'realm_stage'>, rawExperience: number, options: { fixed?: boolean; talent?: TalentRewardContext } = {}) => {
  const repaired = await repairEvolutionProgress(connection, Number(character.id));
  const currentLevel = repaired.corrected ? Number(repaired.level) : Number(character.level);
  const levelCap = Math.min(realmLevelCap(Number(character.realm_stage ?? 1)), repaired.profile ? Number(repaired.profile.unlocked_level) : Number.MAX_SAFE_INTEGER);
  let talentRoom=-Number(character.experience);for(let l=currentLevel;l<=levelCap;l++)talentRoom+=experienceRequiredForLevel(l);
  const talentBase=rawExperience*(options.fixed?1:await globalExperienceMultiplier(connection));
  const notice:{text?:string}={};
  const talentAward=options.fixed?talentBase:await talentExperience(connection,Number(character.id),talentBase,{...options.talent,remaining:Math.max(0,talentRoom),notice});
  let level = currentLevel; let experience = repaired.corrected ? 0 : Number(character.experience); let remaining = Math.max(0, Math.floor(talentAward));
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
  if (gainedPoints > 0) achievementLevel(connection, Number(character.id), level);
  if (gainedPoints > 0) await recordSkillPointChange(connection, character.id, gainedPoints, 'level_up', null, `角色升至 Lv.${level}`);
  return { experience: gainedExperience, level, gainedPoints, realmLocked, realmCapReached, realmStage: Number(character.realm_stage),talentNotice:notice.text };
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
const goblinLevelRanges: Record<string, [number, number]> = {
  goblin_vanguard: [20, 21], goblin_warrior: [20, 22], goblin_archer: [21, 23], goblin_bomber: [22, 24],
  goblin_daredevil: [23, 25], goblin_drummer: [22, 24], goblin_shieldbearer: [24, 25], goblin_trapper: [23, 25],
  goblin_priest: [24, 25], goblin_mage: [24, 25], goblin_assassin: [29, 30], goblin_earthshaper: [29, 30], goblin_colonel: [30, 30]
};
const randomGoblinLevel = (code: string, fallback: number) => {
  const range = goblinLevelRanges[code]; return range ? random(range[0], range[1]) : fallback;
};
const randomMonsterLevel = (monsterClass: string, defaultLevel: number) => {
  // 旧世界低级生态仍保留原本的随机等级；±400 生态必须围绕模板等级波动，不能把 50 级怪随机成 1 级。
  if (defaultLevel > 10) {
    const variance = monsterClass === 'normal' ? 2 : 1;
    return random(Math.max(1, defaultLevel - variance), defaultLevel + variance);
  }
  return monsterClass === 'normal' ? random(1, 5) : monsterClass === 'elite' && defaultLevel >= 7 ? random(7, 9) : monsterClass === 'large' || monsterClass === 'elite' ? random(4, 9) : defaultLevel;
};
// 四位 Lv.32 Boss 的模板就是围绕进化后队伍校准过的基础面板，不能再被通用随机分配压缩为 120–150 点。
const level32BossCodes = new Set(['gruen_mountainheart', 'valk_forge_overseer', 'threehead_mother', 'necromancer_uz']);
const randomMonsterBaseAttributes = (template: MonsterAttributes & { monster_class: string; code?: string }): Allocation => {
  if (template.monster_class === 'boss' && level32BossCodes.has(String(template.code ?? ''))) {
    return Object.fromEntries(attributes.map(attribute => [attribute, Number(template[attribute])])) as Allocation;
  }
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
  { code: 'ordinary', name: '普通的', statMultipliers: { hp: 3.2 } },
  { code: 'powerful', name: '强大的', statMultiplier: 1.1, statMultipliers: { hp: 4, tenacity: 1.2 }, experiencePct: 20, dropPct: 10 },
  { code: 'heroic', name: '英雄的', statMultiplier: 1.2, statMultipliers: { hp: 4.8, tenacity: 1.3 }, experiencePct: 30, dropPct: 20 },
  { code: 'infernal', name: '深渊的', statMultiplier: 1.35, statMultipliers: { hp: 6.4, tenacity: 1.5 }, experiencePct: 50, dropPct: 40 },
  { code: 'abyssal', name: '地狱的', statMultiplier: 1.5, statMultipliers: { hp: 8, tenacity: 1.8 }, experiencePct: 80, dropPct: 60 },
  { code: 'crimson', name: '猩红的', statMultiplier: 1.5, statMultipliers: { hp: 8, tenacity: 2, physicalAttack: 2, magicAttack: 2, accuracy: 2, critRate: 2, critDamage: 2 }, experiencePct: 100, dropPct: 80 },
  { code: 'corrupted', name: '腐化的', statMultiplier: 1.5, statMultipliers: { hp: 8, tenacity: 3, physicalDefense: 2.5, magicDefense: 2.5, critResist: 2.5, critReduction: 2.5 }, experiencePct: 100, dropPct: 80 },
  { code: 'holy', name: '神圣的', statMultiplier: 1.5, statMultipliers: { hp: 12, tenacity: 3, evasion: 2.5 }, experiencePct: 100, dropPct: 80 },
  { code: 'golden', name: '黄金的', statMultiplier: 1.6, statMultipliers: { hp: 9.6, tenacity: 5, evasion: 2.5 }, experiencePct: 150, dropPct: 100 },
  { code: 'brilliant', name: '璀璨的', statMultiplier: 1.8, statMultipliers: { hp: 11.2, tenacity: 10, evasion: 2.5 }, experiencePct: 250, dropPct: 250 },
  { code: 'dreamlike', name: '梦幻的', statMultiplier: 2, statMultipliers: { hp: 12.8, tenacity: 20, evasion: 2.5 }, experiencePct: 600, dropPct: 600 }
];
const bossTraitDefinitionFor = (code: string) => wolfKingTraits.find(trait => trait.code === code);
const bossSpawnChanceByCode: Record<string, number> = { forest_slime: .75, shadow_wolf_king: .5, goblin_king: .25 };
const surfaceBossRespawnMinutes = new Map(worldSurfaceMonsters.filter(monster => monster.monsterClass === 'boss').map(monster => [monster.code, monster.level >= 50 ? 120 : 75]));
const surfaceBossMechanics: Record<string, { rotation: string[]; phaseSkill: string; phaseAt: number; focusLowest?: string[] }> = {
  rootcrown_ram: { rotation: ['charge', 'shield_counter', 'thorn_burst'], phaseSkill: 'thorn_burst', phaseAt: .55 },
  dawntide_crocodile: { rotation: ['mist_pounce', 'bite', 'shield_counter'], phaseSkill: 'constrict', phaseAt: .60, focusLowest: ['constrict', 'bite'] },
  shattertide_crab: { rotation: ['shield_counter', 'heavy_strike', 'sweeping_slash'], phaseSkill: 'sweeping_slash', phaseAt: .50 },
  gruen_mountainheart: { rotation: ['shield_counter', 'heavy_strike', 'sweeping_slash'], phaseSkill: 'thunder_lance', phaseAt: .50 },
  valk_forge_overseer: { rotation: ['ember_burst', 'heavy_strike', 'shield_counter'], phaseSkill: 'arcane_shackle', phaseAt: .55 },
  threehead_mother: { rotation: ['constrict', 'toxic_edge', 'vine_hex'], phaseSkill: 'toxic_edge', phaseAt: .50, focusLowest: ['constrict', 'toxic_edge'] },
  fallingstar_mudid: { rotation: ['arcane_shackle', 'moonbolt', 'shield_counter'], phaseSkill: 'thunder_lance', phaseAt: .50 },
  frostking_whiteantler: { rotation: ['charge', 'shield_counter', 'sweeping_slash'], phaseSkill: 'frost_bind', phaseAt: .55, focusLowest: ['frost_bind'] },
  askr_stormroc: { rotation: ['wind_blade', 'thunder_lance', 'shield_counter'], phaseSkill: 'sweeping_slash', phaseAt: .50 },
  seles_eclipse_watcher: { rotation: ['moonbolt', 'sanctified_bolt', 'shield_counter'], phaseSkill: 'arcane_shackle', phaseAt: .50, focusLowest: ['arcane_shackle'] }
};
const bossTraitAliases: Record<string, string> = {
  '普通': 'ordinary', '普通的': 'ordinary', '强大': 'powerful', '强大的': 'powerful', '英雄': 'heroic', '英雄的': 'heroic', '深渊': 'infernal', '深渊的': 'infernal',
  '地狱': 'abyssal', '地狱的': 'abyssal', '猩红': 'crimson', '猩红的': 'crimson', '腐化': 'corrupted', '腐化的': 'corrupted', '神圣': 'holy', '神圣的': 'holy',
  '黄金': 'golden', '黄金的': 'golden', '璀璨': 'brilliant', '璀璨的': 'brilliant', '梦幻': 'dreamlike', '梦幻的': 'dreamlike'
};
const bossTraitFromName = (value?: string) => {
  const normalized = String(value ?? '').trim(); if (!normalized) return undefined;
  const code = bossTraitAliases[normalized] ?? normalized;
  const trait = wolfKingTraits.find(candidate => candidate.code === code);
  if (!trait) throw new Error('首领词条无效。可用：普通、强大、英雄、深渊、地狱、猩红、腐化、神圣、黄金、璀璨、梦幻。');
  return trait;
};
const randomBossTrait = () => {
  const weights = [25, 24, 15, 10, 5, 5, 5, 5, 3, 2, 1]; let roll = Math.random() * 100;
  return wolfKingTraits[weights.findIndex(weight => (roll -= weight) < 0) || 0];
};
const randomMonsterTraits = (template?: { code?: string; monster_class?: string }) => {
  if (template?.monster_class === 'boss' || template?.code === 'shadow_wolf_king' || template?.code === 'forest_slime') {
    return [randomBossTrait()];
  }
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
const bossTraitCodes = new Set(wolfKingTraits.map(trait => trait.code));
const lowerBossTrait = (code: string) => {
  // 梦幻、璀璨、黄金属于同一顶级档；衰减时随机落入猩红／腐化／神圣档，
  // 随后才按固定阶梯逐级降低，避免同档词条之间被误当成高低关系。
  const nextCodes: Record<string, string | string[]> = {
    dreamlike: ['crimson', 'corrupted', 'holy'], brilliant: ['crimson', 'corrupted', 'holy'], golden: ['crimson', 'corrupted', 'holy'],
    crimson: 'abyssal', corrupted: 'abyssal', holy: 'abyssal', abyssal: 'infernal', infernal: 'heroic', heroic: 'powerful', powerful: 'ordinary'
  };
  const next = nextCodes[code];
  const nextCode = Array.isArray(next) ? next[Math.floor(Math.random() * next.length)] : next;
  return nextCode ? bossTraitDefinitionFor(nextCode) : undefined;
};

/** 已出现的 Lv.32 Boss 只在脱战时一次性同步新模板，避免热更新中途改变战斗。 */
const normalizeLevel32RegionalBosses = async (pool: Pool) => {
  const codes = [...level32BossCodes];
  const [rows] = await pool.execute<(RowDataPacket & MonsterAttributes & { id: number; code: string; level: number; skill_sequence: unknown; traits_json: unknown })[]>(`SELECT s.id,t.code,t.level,t.constitution,t.spirit,t.strength,t.intelligence,t.agility,t.perception,
    t.constitution_growth,t.spirit_growth,t.strength_growth,t.intelligence_growth,t.agility_growth,t.perception_growth,t.skill_sequence,s.traits_json
    FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    WHERE s.defeated_at IS NULL AND t.code IN (${codes.map(() => '?').join(',')})
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','level32_boss_rebalance_v1'))
      AND NOT EXISTS (SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=s.id AND cs.state='active')`, codes);
  for (const row of rows) {
    const traits = [...jsonArray(row.traits_json).map(item => jsonObject(item) as unknown as MonsterTrait).filter(trait => trait.code), { code: 'level32_boss_rebalance_v1', name: '' }];
    const stats = monsterCombatStats({ ...row, monster_class: 'boss', traits_json: traits });
    await pool.execute(`UPDATE monster_spawns SET level=?,constitution=?,spirit=?,strength=?,intelligence=?,agility=?,perception=?,
      current_hp=?,skill_sequence=?,traits_json=? WHERE id=?`, [row.level, row.constitution, row.spirit, row.strength, row.intelligence, row.agility, row.perception,
      stats.hpMax, JSON.stringify(stringList(row.skill_sequence)), JSON.stringify(traits), row.id]);
  }
};

/**
 * 早期已生成的地表首领沿用了普通怪词条池，例如“凶猛的”。
 * 仅修正未处于战斗中的常规区域首领；任务、试炼首领与其归属标记保持原样。
 */
const normalizeRegionalBossTraits = async (pool: Pool) => {
  await normalizeLevel32RegionalBosses(pool);
  const [rows] = await pool.execute<(RowDataPacket & MonsterAttributes & { id: number; level: number; traits_json: unknown })[]>(`SELECT DISTINCT s.id,t.code AS growth_template_code,COALESCE(s.level,t.level) AS level,
    COALESCE(s.constitution,t.constitution) AS constitution,COALESCE(s.spirit,t.spirit) AS spirit,COALESCE(s.strength,t.strength) AS strength,
    COALESCE(s.intelligence,t.intelligence) AS intelligence,COALESCE(s.agility,t.agility) AS agility,COALESCE(s.perception,t.perception) AS perception,
    t.constitution_growth,t.spirit_growth,t.strength_growth,t.intelligence_growth,t.agility_growth,t.perception_growth,s.traits_json
    FROM monster_spawns s
    JOIN monster_templates t ON t.id=s.template_id
    WHERE s.defeated_at IS NULL AND t.monster_class='boss'
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','boss_test'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_goblin_king'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_evolution'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','advanced_profession_trial'))
      AND NOT EXISTS (SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=s.id AND cs.state='active')`);
  for (const row of rows) {
    const traits = jsonArray(row.traits_json).map(item => jsonObject(item) as unknown as MonsterTrait).filter(trait => trait.code);
    if (traits.some(trait => bossTraitCodes.has(trait.code))) continue;
    const encounterTrait = traits.find(trait => trait.code === 'kingbeast_encounter');
    const repairedTraits = [randomBossTrait(), ...(encounterTrait ? [encounterTrait] : [])];
    await pool.execute('UPDATE monster_spawns SET current_hp=?,traits_json=? WHERE id=?', [monsterCombatStats({ ...row, traits_json: repairedTraits }).hpMax, JSON.stringify(repairedTraits), row.id]);
  }
};

/**
 * 自然刷新的世界 Boss 若撑过一个整点，词条降低一级。只处理未开战的公共地图 Boss；
 * 剧情、试炼、导师与迷宫首领不参与，避免改写其固定难度或在战斗途中跳变属性。
 */
export const decayWorldBossTraits = async (pool: Pool) => {
  const [rows] = await pool.execute<(RowDataPacket & MonsterAttributes & { id: number; level: number; current_hp: number; traits_json: unknown })[]>(`SELECT DISTINCT s.id,t.code AS growth_template_code,COALESCE(s.level,t.level) AS level,s.current_hp,
    COALESCE(s.constitution,t.constitution) AS constitution,COALESCE(s.spirit,t.spirit) AS spirit,COALESCE(s.strength,t.strength) AS strength,
    COALESCE(s.intelligence,t.intelligence) AS intelligence,COALESCE(s.agility,t.agility) AS agility,COALESCE(s.perception,t.perception) AS perception,
    t.constitution_growth,t.spirit_growth,t.strength_growth,t.intelligence_growth,t.agility_growth,t.perception_growth,s.traits_json
    FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    WHERE s.defeated_at IS NULL AND t.monster_class='boss'
      AND (EXISTS (SELECT 1 FROM map_monster_pools mp WHERE mp.region_id=s.region_id AND mp.monster_template_id=s.template_id)
        OR JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','kingbeast_encounter')))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','boss_test'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_goblin_king'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_evolution'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','advanced_profession_trial'))
      AND NOT EXISTS (SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=s.id AND cs.state='active')`);
  let decayed = 0;
  for (const row of rows) {
    const traits = jsonArray(row.traits_json).map(item => jsonObject(item) as MonsterTrait).filter(trait => trait.code);
    const traitIndex = traits.findIndex(trait => bossTraitCodes.has(trait.code));
    const lowered = traitIndex < 0 ? undefined : lowerBossTrait(traits[traitIndex]!.code);
    if (!lowered) continue;
    const before = monsterCombatStats({ ...row, monster_class: 'boss', traits_json: traits });
    const nextTraits = traits.map((trait, index) => index === traitIndex ? lowered : trait);
    const after = monsterCombatStats({ ...row, monster_class: 'boss', traits_json: nextTraits });
    const healthRatio = Math.max(0, Math.min(1, Number(row.current_hp) / Math.max(1, before.hpMax)));
    const currentHp = Math.max(0, Math.min(after.hpMax, Math.round(after.hpMax * healthRatio)));
    await pool.execute('UPDATE monster_spawns SET current_hp=?,traits_json=? WHERE id=?', [currentHp, JSON.stringify(nextTraits), row.id]);
    decayed += 1;
  }
  return decayed;
};
const dropQuantity = (drop: Record<string, unknown>) => {
  const minimum = Math.max(1, Math.floor(Number(drop.min_quantity ?? drop.quantity ?? 1)));
  const maximum = Math.max(minimum, Math.floor(Number(drop.max_quantity ?? drop.quantity ?? minimum)));
  return minimum + Math.floor(Math.random() * (maximum - minimum + 1));
};
/** 同组掉落按 chance 作为权重二选一；用于普通/彩色凝胶等互斥掉落。 */
const resolvedDrops = (value: unknown): Array<Record<string, unknown> & { code?: string; chance?: number }> => {
  const singles: Array<Record<string, unknown> & { code?: string; chance?: number }> = []; const groups = new Map<string, Array<Record<string, unknown> & { code?: string; chance?: number }>>();
  for (const raw of jsonArray(value)) {
    const drop = jsonObject(raw); const group = String(drop.exclusive_group ?? '');
    if (!group) singles.push(drop as Record<string, unknown> & { code?: string; chance?: number });
    else groups.set(group, [...(groups.get(group) ?? []), drop as Record<string, unknown> & { code?: string; chance?: number }]);
  }
  for (const entries of groups.values()) {
    let roll = Math.random(); let selected: Record<string, unknown> | undefined;
    for (const entry of entries) { roll -= Math.max(0, Number(entry.chance ?? 0)); if (roll < 0) { selected = entry; break; } }
    if (selected) singles.push({ ...selected, chance: 1 });
  }
  return singles;
};
/** 哥布林专属材料不沿用模板概率；除耳朵外统一按 40% 结算。 */
const effectiveGoblinMaterialDropChance = (_target: { traits_json?: unknown }, drop: { code?: string; chance?: number }) => {
  const code = String(drop.code ?? '');
  if (code === 'goblin_ear' || !code.startsWith('goblin_')) return Number(drop.chance ?? 1);
  return .4;
};
const resolvedDropCode = (drop: Record<string, unknown>, monsterLevel: number) => resolvedMonsterMaterialDropCode(drop, monsterLevel);
const finalAttribute = (character: Pick<CharacterRow, keyof Allocation | `${keyof Allocation}_growth` | 'level'>, attribute: keyof Allocation) => Number(character[attribute]) + Number(character[`${attribute}_growth`]) * playerGrowthShares(Number(character.level));
// 以 0.9 次幂递减：平均角色约为 Lv.1=2、Lv.10=4、Lv.20=6；后期硬上限为 10。
const explorationScale = (attribute: number, level: number) => {
  const statValue = 1 + Math.floor(Math.pow(Math.max(1, attribute) / 7, .9));
  const levelCap = Math.min(10, 2 + Math.floor(Math.max(1, level) / 5));
  return Math.max(1, Math.min(10, levelCap, statValue));
};
const movementSpeedFrom = (agility: number, level: number) => explorationScale(agility, level);
// 普通技能及被动升级固定1SP；主动专精按所选方向等级计费，武器精通、鉴识单独计价。
const activeSkillUpgradeCost = (_level: number) => 1;
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
      const epicRest=await epicLoadoutFor(pool,Number(character.id));
      const talentRest=await(await import('./talent-data')).readTalentData(pool,Number(character.id));
      const recoveryMultiplier = (talentRest.flags.restEmpowered?3:1)*(1 + await homeRestRecoveryBonus(pool, Number(character.id)) / 100) * (epicRest.setCode==='crimson_crown'&&epicRest.setCount>=5?1.1:1) * (character.activity_status==='resting'&&await(await import('./companion.service')).activeCompanionSpecialty(pool,Number(character.id),'watch')?1.1:1);
      const received = await modifiersFor(pool, Number(character.id));
      const hpRecovery = receivedHealingAmount(Math.max(1, Math.ceil(Number(character.hp_max) / 100 * recoveryMultiplier)), received.healingReceivedPct);
      character.current_hp = Math.min(Number(character.hp_max), Number(character.current_hp) + hpRecovery * seconds);
      character.current_mp = Math.min(Number(character.mp_max), Number(character.current_mp) + Math.max(1, Math.ceil(Number(character.mp_max) / 100 * recoveryMultiplier)) * seconds);
      if (character.current_hp >= Number(character.hp_max) && character.current_mp >= Number(character.mp_max) && !continuesHomeResting) { character.activity_status = 'active'; character.rest_started_at = null; character.home_rest_experience_updated_at = null; }
      else character.rest_started_at = new Date();
      if(character.activity_status==='active'&&talentRest.flags.restEmpowered)await pool.execute("UPDATE player_talent_state SET data_json=JSON_REMOVE(data_json,'$.flags.restEmpowered') WHERE character_id=?",[character.id]);
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
  await assertNoNegotiation(connection, characterId);
  const status = await forestGuideStatusFor(connection, characterId);
  if (status && status !== 'completed') throw new Error('你正在推进「初章·包容之镇」，请先完成当前剧情。');
  await (await import('./floating-leaf.service')).assertFloatingTourFreeAction(connection, characterId);
};

const ensureActionAvailable = (character: CharacterRow) => {
  if (character.activity_status === 'detained') throw new Error(detentionMessage(character.detained_until));
  if (character.activity_status === 'unconscious') throw new Error('你已经昏迷，请等待生命与魔力恢复至满值。');
  if (character.activity_status === 'resting') throw new Error('你正在休息，请先切换至行动。');
};

export const startRest = async (qqUserId: string) => withTransaction(async connection => {
  await assertNoNegotiation(connection, Number((await characterFor(qqUserId, connection)).id));
  const character = await characterFor(qqUserId, connection);
  const talentData=await(await import('./talent-data')).readTalentData(connection,Number(character.id));
  if(talentData.jobs.some(j=>j.payload.working))throw new Error('请先暂停复盘或结束调查。');
  const [combat] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state=\'active\' LIMIT 1 FOR UPDATE', [character.id]);
  const [travels] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_travels WHERE character_id=? LIMIT 1 FOR UPDATE', [character.id]);
  if (travels[0]) throw new Error('你正在前往目标地点，请等待抵达或取消移动后再休息。');
  if (combat[0]) throw new Error('战斗中无法休息。');
  if (character.activity_status === 'detained') throw new Error(detentionMessage(character.detained_until));
  const homeExperiencePerMinute = await homeRestExperiencePerMinute(connection, Number(character.id));
  if (Number(character.current_hp) >= Number(character.hp_max) && Number(character.current_mp) >= Number(character.mp_max) && !homeExperiencePerMinute) return { resting: false, message: '当前生命与魔力均已满，无需休息。' };
  if(Number(talentData.flags.restMark??0)>Date.now()){talentData.flags.restEmpowered=true;delete talentData.flags.restMark;await(await import('./talent-data')).saveTalentData(connection,Number(character.id),talentData);}
  const homeBonus = await homeRestRecoveryBonus(connection, Number(character.id));
  const restEpic=await epicLoadoutFor(connection,Number(character.id));
  const openingRest=(restEpic.setCode==='crimson_crown'&&restEpic.setCount>=5?1.1:1)*(await(await import('./companion.service')).activeCompanionSpecialty(connection,Number(character.id),'watch')?1.1:1);
  await connection.execute('UPDATE characters SET activity_status=\'resting\',rest_started_at=NOW(),home_rest_experience_updated_at=? WHERE id=?', [homeExperiencePerMinute ? new Date() : null, character.id]);
  return { resting: true, message: `你开始休息，每秒恢复 ${Number(((1 + homeBonus / 100)*openingRest*(talentData.flags.restEmpowered?3:1)).toFixed(3))}% 的生命与魔力。` };
});

export const resumeAction = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId, connection);
  if (character.activity_status === 'detained') throw new Error(detentionMessage(character.detained_until));
  if (character.activity_status === 'unconscious') throw new Error('你已经昏迷，请等待生命与魔力恢复至满值。');
  if (character.activity_status === 'resting') {
    const data=await(await import('./talent-data')).readTalentData(connection,Number(character.id));
    for(const job of data.jobs.filter(j=>j.payload.working)){job.payload.workSeconds=Math.max(0,Math.ceil((job.ready-Date.now())/1000));delete job.payload.working;job.ready=0;}
    data.jobs=data.jobs.filter(j=>!['survey','investigation'].includes(j.kind));delete data.flags.restEmpowered;await(await import('./talent-data')).saveTalentData(connection,Number(character.id),data);
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

/** 共生微被动只以真实玩家为共鸣对象；带 NPC 同伴时视作独行，效果回落为自身增益。 */
const symbiosisBonusFor = async (connection: Pool | PoolConnection, characterId: number) => {
  const [partyRows] = await connection.execute<(RowDataPacket & { party_id: string })[]>('SELECT party_id FROM party_members WHERE character_id=? LIMIT 1', [characterId]);
  const partyId = partyRows[0]?.party_id;
  const [rows] = partyId
    ? await connection.execute<(RowDataPacket & { character_id: number; npc_code: string | null; symbiosis_trait_code: SymbiosisTraitCode | null })[]>(`SELECT pm.character_id,c.npc_code,ep.symbiosis_trait_code
        FROM party_members pm JOIN characters c ON c.id=pm.character_id LEFT JOIN player_evolution_profiles ep ON ep.character_id=c.id WHERE pm.party_id=?`, [partyId])
    : await connection.execute<(RowDataPacket & { character_id: number; npc_code: string | null; symbiosis_trait_code: SymbiosisTraitCode | null })[]>('SELECT c.id AS character_id,c.npc_code,ep.symbiosis_trait_code FROM characters c LEFT JOIN player_evolution_profiles ep ON ep.character_id=c.id WHERE c.id=?', [characterId]);
  const players = rows.filter(row => !row.npc_code); const grouped = players.length >= 2;
  const traits = grouped ? players.map(row => row.symbiosis_trait_code) : [rows.find(row => Number(row.character_id) === characterId)?.symbiosis_trait_code];
  return traits.reduce<Record<string, number>>((bonus, trait) => {
    if (!trait || !symbiosisTraits[trait]) return bonus;
    const effect = grouped ? symbiosisTraits[trait].partyBonus : symbiosisTraits[trait].soloBonus;
    for (const [key, value] of Object.entries(effect)) bonus[key] = Number(bonus[key] ?? 0) + Number(value ?? 0);
    return bonus;
  }, {});
};

const modifiersFor = async (connection: Pool | PoolConnection, characterId: number): Promise<CombatModifiers> => {
  const [equippedRows] = await connection.execute<(RowDataPacket & { name: string | null; effect_json: string | null; weapon_type: string | null; slot: string; quality: number })[]>(`SELECT i.name,i.weapon_type,pe.slot,COALESCE(ii.effect_json,i.effect_json) AS effect_json,COALESCE(ii.quality,100) AS quality FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id WHERE pe.character_id=?`, [characterId]);
  const [deviceRows] = await connection.execute<(RowDataPacket & { name: string | null; effect_json: string | null; weapon_type: string | null; slot: string; quality: number })[]>(`SELECT i.name,i.weapon_type,'device' AS slot,COALESCE(ii.effect_json,i.effect_json) AS effect_json,100 AS quality FROM player_active_devices ad JOIN player_item_instances ii ON ii.id=ad.instance_id AND ii.character_id=ad.character_id JOIN item_definitions i ON i.id=ii.item_id WHERE ad.character_id=? AND i.item_type='device'`, [characterId]);
  const rows = [...equippedRows, ...deviceRows];
  const [passiveRows] = await connection.execute<(RowDataPacket & { id: number; code: string; passive_effect_json: unknown })[]>(`SELECT s.id,s.code,s.passive_effect_json,s.tier,COALESCE(sp.level,1) AS potent_level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id LEFT JOIN player_skill_specializations sp ON sp.character_id=ps.character_id AND sp.skill_id=s.id AND sp.specialization='potent' WHERE ps.character_id=? AND (s.category='bound' OR (s.category='passive' AND ps.passive_linked=1))`, [characterId]);
  const [battleBuffs] = await connection.execute<(RowDataPacket & { buff_code: string })[]>('SELECT buff_code FROM player_battle_buffs WHERE character_id=? AND remaining_battles>0', [characterId]);
  const [timedBuffs] = await connection.execute<(RowDataPacket & { experience_multiplier: number })[]>(`SELECT experience_multiplier FROM player_timed_buffs WHERE character_id=? AND buff_code='church_blessing' AND expires_at>NOW() LIMIT 1`, [characterId]);
  const effect = jsonObject(rows.find(row => row.slot === 'weapon')?.effect_json);
  const passives = new Map(passiveRows.map(row => [row.code, jsonObject(row.passive_effect_json)]));
  const growth = passives.get('growth_blessing'); const lucky = passives.get('lucky_favor'); const mana = passives.get('mana_affinity');
  // 武器精通已在角色属性重算阶段写入基础面板，战斗层仅保留零值字段以避免重复乘算。
  const mastery = (_key: string) => 0;
  const equipmentEffect = (key: string) => rows.reduce((total, row) => total + Number(jsonObject(row.effect_json)[key] ?? 0) * (key === 'damageBonusPct' || key === 'damageReductionPct' ? 1 : .6 + Math.max(0, Math.min(100, Number(row.quality))) * .004), 0);
  const blessingEffect = (key: string) => passiveRows.reduce((total, row) => {
    const passive = jsonObject(row.passive_effect_json);
    return passive.weaponType || isCachedAdvancedPassiveEffect(row.code, key) ? total : total + specializedPassiveValue(key, Number(passive[key] ?? 0), row.potent_level, String(row.tier));
  }, 0);
  const damageBonusPct = equipmentEffect('damageBonusPct') + blessingEffect('damageBonusPct');
  const experienceElixir = battleBuffs.some(buff => buff.buff_code === 'minor_experience_elixir');
  const alchemyExperienceBonus = battleBuffs.reduce((total, buff) => total + Math.max(0, Number(/^alchemy_exp_(\d+(?:\.\d+)?)$/.exec(buff.buff_code)?.[1] ?? 0)), 0);
  const artifacts = rows.map(row => String(jsonObject(row.effect_json).artifact ?? '')).filter(Boolean);
  const evolution = await evolutionStatBonuses(connection, characterId);
  const symbiosis = await symbiosisBonusFor(connection, characterId);
  return { armorSet: armorSetFromRows(equippedRows), weaponName: rows.find(row => row.slot === 'weapon')?.name ?? undefined, artifact: effect.artifact === 'holy_sword' || effect.artifact === 'demon_sword' ? effect.artifact : undefined, artifacts, physicalAttack: 0, magicAttack: 0, physicalAttackPct: mastery('physicalAttackPct'), magicAttackPct: mastery('magicAttackPct'), physicalDefensePct: mastery('physicalDefensePct'), magicDefensePct: mastery('magicDefensePct'), critRatePct: mastery('critRatePct') + blessingEffect('critRatePct'), critDamagePct: mastery('critDamagePct') + blessingEffect('critDamagePct'), accuracyPct: blessingEffect('accuracyPct'), mpPct: mastery('mpPct'), chantSpeedPct: mastery('chantSpeedPct'), critRateBp: 0, ignoreDefensePct: equipmentEffect('ignoreDefensePct'), lifestealPct: equipmentEffect('lifestealPct') + blessingEffect('lifestealPct'), magicDamagePct: equipmentEffect('magicDamagePct') + blessingEffect('magicDamagePct'), damageBonusPct, damageReductionPct: equipmentEffect('damageReductionPct') + blessingEffect('damageReductionPct') + Number(evolution.damageReductionPct ?? 0) + Number(symbiosis.damageReductionPct ?? 0), healingBonusPct: blessingEffect('healingBonusPct') + Number(evolution.healingBonusPct ?? 0), healingReceivedPct: Number(evolution.healingReceivedPct ?? 0) + Number(symbiosis.healingReceivedPct ?? 0), regenerationBonusPct: blessingEffect('regenerationBonusPct'), venomDamagePct: blessingEffect('venomDamagePct'), manaCostReduction: equipmentEffect('manaCostReduction'), experienceMultiplier: Number(growth?.experienceMultiplier ?? 1) * (experienceElixir ? 1.25 : 1) * (1 + alchemyExperienceBonus / 100) * Number(timedBuffs[0]?.experience_multiplier ?? 1), dropBonus: (Number(lucky?.dropBonusPct ?? 0) + blessingEffect('dropBonusPct')) / 100, manaAffinity: Boolean(mana), lightSkillBonusPct: equipmentEffect('lightSkillBonusPct') + blessingEffect('lightSkillBonusPct'), criticalDamageBonusPct: equipmentEffect('criticalDamageBonusPct'), unifyAttack: artifacts.includes('godfist'), prayerHymn: artifacts.includes('prayer_orb'), physicalDamageReductionPct: equipmentEffect('physicalDamageReductionPct'), magicDamageReductionPct: equipmentEffect('magicDamageReductionPct'), timeGuard: artifacts.includes('time_greaves'), pursuitChancePct: equipmentEffect('pursuitChancePct'), bloodForMana: artifacts.includes('fate_bracelet'), hpRegenPct: equipmentEffect('hpRegenPct') + blessingEffect('hpRegenPct') + Number(evolution.hpRegenPct ?? 0), mpRegenPct: equipmentEffect('mpRegenPct') + blessingEffect('mpRegenPct') + Number(evolution.mpRegenPct ?? 0) + Number(symbiosis.mpRegenPct ?? 0), minimumHitRatePct: equipmentEffect('minimumHitRatePct'), actualHitRatePct: equipmentEffect('actualHitRatePct') + blessingEffect('actualHitRatePct'), physicalActualHitRatePct: equipmentEffect('physicalActualHitRatePct'), physicalSkillDamagePct: equipmentEffect('physicalSkillDamagePct'), magicSkillDamagePct: equipmentEffect('magicSkillDamagePct'), magicChantBonus: equipmentEffect('magicChantBonus'), physicalForceCrit: rows.some(row => Boolean(jsonObject(row.effect_json).physicalForceCrit)), physicalCriticalFinalDamagePct: equipmentEffect('physicalCriticalFinalDamagePct') };
};
/** 受疗只放大正向生命恢复；魔力恢复、复活与敌方自疗不参与。 */
const receivedHealingAmount = (amount: number, healingReceivedPct: number) => Math.max(1, Math.floor(amount * (1 + Math.max(0, healingReceivedPct) / 100)));
/** 降疗仅压低生命恢复的数值，不会把存在治疗变成“无法治疗”。 */
const reducedHealingAmount = (amount: number, reductionPct: number) => amount <= 0 ? 0 : Math.max(1, Math.floor(amount * (1 - Math.min(100, Math.max(0, reductionPct)) / 100)));
const miningSecondsByCode: Record<string, number> = {
  living_wood: 5 * 60, ridge_core: 8 * 60, fire_crystal: 8 * 60, marsh_heart: 8 * 60, duskvein_crystal: 8 * 60,
  meteor_iron: 15 * 60, star_copper: 30 * 60, moon_silver: 60 * 60, sun_gold: 120 * 60
};
const regionalForgeResourceCodes = new Set(['duskvein_crystal', 'ridge_core', 'fire_crystal', 'marsh_heart']);
const resourceYield = async (connection: PoolConnection, itemId: number, code: string) => {
  const [rareRows] = await connection.execute<(RowDataPacket & { yield_json: unknown })[]>('SELECT yield_json FROM rare_forge_materials WHERE item_id=? LIMIT 1', [itemId]);
  const profile = jsonObject(rareRows[0]?.yield_json); const yields = jsonArray(profile.yields).map(Number); const weights = jsonArray(profile.weights).map(Number);
  if (yields.length && yields.length === weights.length) {
    let roll = Math.random() * weights.reduce((sum, value) => sum + Math.max(0, value), 0);
    for (let index = 0; index < yields.length; index++) { roll -= Math.max(0, weights[index] ?? 0); if (roll <= 0) return Math.max(1, Math.floor(yields[index] ?? 1)); }
    return Math.max(1, Math.floor(yields[yields.length - 1] ?? 1));
  }
  return regionalForgeResourceCodes.has(code) ? random(1, 3) : 1;
};
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
export type MonsterManagementEvent = { regionCode: string; regionName: string; activeCount: number; spawnLimit: number; formationCount: number; formationMemberCount: number; monsters: { name: string; count: number }[] };
export type ResourceManagementEvent = { regionCode: string; regionName: string; resources: { name: string; activeCount: number; density: number; expected: number; target: number; rareSingleSpawn: boolean }[] };
type RegionBounds = Pick<MapRegionRow, 'min_x' | 'max_x' | 'min_y' | 'max_y' | 'min_z' | 'max_z'>;
type RegionAreaRow = RowDataPacket & RegionBounds;

const regionVolume = (region: RegionBounds) => (Number(region.max_x) - Number(region.min_x) + 1) * (Number(region.max_y) - Number(region.min_y) + 1) * (Number(region.max_z) - Number(region.min_z) + 1);
const spawnableArea = (region: RegionBounds, overlays: RegionBounds[]) => regionVolume(region) - overlays.reduce((sum, area) => sum + Math.max(0, Math.min(Number(region.max_x), Number(area.max_x)) - Math.max(Number(region.min_x), Number(area.min_x)) + 1) * Math.max(0, Math.min(Number(region.max_y), Number(area.max_y)) - Math.max(Number(region.min_y), Number(area.min_y)) + 1) * Math.max(0, Math.min(Number(region.max_z), Number(area.max_z)) - Math.max(Number(region.min_z), Number(area.min_z)) + 1), 0);
const regionAreas = async (connection: Pool | PoolConnection, region: MapRegionRow) => {
  const [rows] = await connection.execute<RegionAreaRow[]>('SELECT min_x,max_x,min_y,max_y,min_z,max_z FROM map_region_areas WHERE region_id=?', [region.id]);
  return rows.length ? rows : [region];
};
const randomAreaPoint = (areas: RegionBounds[]) => {
  const total = areas.reduce((sum, area) => sum + regionVolume(area), 0);
  let roll = Math.random() * total;
  const area = areas.find(candidate => (roll -= regionVolume(candidate)) <= 0) ?? areas[areas.length - 1];
  return { x: random(Number(area.min_x), Number(area.max_x)), y: random(Number(area.min_y), Number(area.max_y)), z: random(Number(area.min_z), Number(area.max_z)) };
};
const pointInAreas = (areas: RegionBounds[], x: number, y: number, z: number) => areas.some(area => x >= Number(area.min_x) && x <= Number(area.max_x) && y >= Number(area.min_y) && y <= Number(area.max_y) && z >= Number(area.min_z) && z <= Number(area.max_z));
const spawnableAreaForAreas = (areas: RegionBounds[], overlays: RegionBounds[]) => Math.max(0, areas.reduce((total, area) => total + spawnableArea(area, overlays), 0));

const bossSpawnPosition = async (pool: Pool, region: MapRegionRow) => {
  const [blockedRows] = await pool.execute<(RowDataPacket & { pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pos_x,pos_y,pos_z FROM map_npcs WHERE region_id=? AND pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL
    UNION SELECT pos_x,pos_y,pos_z FROM map_special_objects WHERE region_id=?
    UNION SELECT entrance_x AS pos_x,entrance_y AS pos_y,0 AS pos_z FROM dungeon_instances WHERE state='active' AND entrance_region_id=?`, [region.id, region.id, region.id]);
  const [overlays] = await pool.execute<RegionAreaRow[]>('SELECT a.min_x,a.max_x,a.min_y,a.max_y,a.min_z,a.max_z FROM map_region_areas a JOIN map_regions r ON r.id=a.region_id WHERE r.danger_level>(SELECT danger_level FROM map_regions WHERE id=?)', [region.id]);
  const areas = await regionAreas(pool, region); const overridden = (x: number, y: number, z: number) => pointInAreas(overlays, x, y, z);
  const blocked = new Set(blockedRows.map(row => `${row.pos_x},${row.pos_y},${row.pos_z}`)); let { x, y, z } = randomAreaPoint(areas);
  for (let attempt = 0; attempt < 64 && (blocked.has(`${x},${y},${z}`) || overridden(x, y, z)); attempt++) ({ x, y, z } = randomAreaPoint(areas));
  return blocked.has(`${x},${y},${z}`) || overridden(x, y, z) ? null : { x, y, z };
};

const spawnBoss = async (pool: Pool, region: MapRegionRow, template: BossTemplateRow, forcedTrait?: MonsterTrait, ignoreRespawn = false) => {
  const [active] = await pool.execute<RowDataPacket[]>('SELECT id FROM monster_spawns WHERE region_id=? AND template_id=? AND defeated_at IS NULL LIMIT 1', [region.id, template.id]);
  if (active[0]) return false;
  const respawnMinutes = surfaceBossRespawnMinutes.get(template.code);
  if (!ignoreRespawn && respawnMinutes) {
    const [cooldown] = await pool.execute<RowDataPacket[]>('SELECT 1 FROM monster_spawns WHERE region_id=? AND template_id=? AND defeated_at IS NOT NULL AND DATE_ADD(defeated_at,INTERVAL ? MINUTE)>NOW() LIMIT 1', [region.id, template.id, respawnMinutes]);
    if (cooldown[0]) return false;
  }
  const position = await bossSpawnPosition(pool, region); if (!position) return false;
  if (template.code === 'goblin_king') {
    const [encounterTemplates] = await pool.execute<(RowDataPacket & MonsterAttributes & { id: number; code: string; name: string; monster_class: string; level: number; skill_sequence: unknown })[]>(`SELECT t.id,t.code,t.name,t.monster_class,t.level,t.skill_sequence,${templateMonsterAttributeColumns}
      FROM monster_templates t WHERE t.code IN ('goblin_king','habadragon','goblin_royal_guard','goblin_royal_spearman')`, []);
    const byCode = new Map(encounterTemplates.map(item => [item.code, item]));
    if (['habadragon', 'goblin_royal_guard', 'goblin_royal_spearman'].some(code => !byCode.has(code))) return false;
    const encounterId = `kingbeast-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`; const bossTrait = forcedTrait ?? randomBossTrait();
    const create = async (entry: typeof template | (typeof encounterTemplates)[number], role: string) => {
      // 双体核心共享首领专属词条；王庭随从不再使用会生成暴动的随机词条。
      const attributes = randomMonsterBaseAttributes(entry); const traits = [...(['king', 'dragon'].includes(role) ? [bossTrait] : []), { code: 'kingbeast_encounter', name: '', groupId: encounterId, role } as any];
      const spawned = { ...entry, ...attributes, level: Number(entry.level), traits_json: traits }; const stats = monsterCombatStats(spawned);
      await pool.execute(`INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [entry.id, region.id, position.x, position.y, position.z, entry.level, attributes.constitution, attributes.spirit, attributes.strength, attributes.intelligence, attributes.agility, attributes.perception, stats.hpMax, JSON.stringify(stringList(entry.skill_sequence)), JSON.stringify(traits)]);
    };
    await create(template, 'king');
    await create(byCode.get('habadragon')!, 'dragon');
    await create(byCode.get('goblin_royal_guard')!, 'guard');
    await create(byCode.get('goblin_royal_spearman')!, 'spearman');
    return true;
  }
  const attributes = randomMonsterBaseAttributes(template); const traits = forcedTrait ? [forcedTrait] : randomMonsterTraits(template); const spawned = { ...template, ...attributes, level: Number(template.level), traits_json: traits }; const stats = monsterCombatStats(spawned);
  await pool.execute('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [template.id, region.id, position.x, position.y, position.z, template.level, attributes.constitution, attributes.spirit, attributes.strength, attributes.intelligence, attributes.agility, attributes.perception, stats.hpMax, JSON.stringify(stringList(template.skill_sequence)), JSON.stringify(traits)]);
  return true;
};

/** 整点世界事件：全地图最多十只暴动精英，数量越多越难继续发生。 */
export const refreshRiotElites = async (pool: Pool) => {
  // 旧版普通怪、首领可能携带随机暴动词条；这些遗留实体不再作为有效暴动保留。
  await pool.execute(`UPDATE monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    SET s.current_hp=0,s.defeated_at=NOW()
    WHERE s.defeated_at IS NULL AND t.monster_class<>'elite'
      AND JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','riot'))
      AND NOT EXISTS (SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=s.id AND cs.state='active')`);
  const [counts] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    WHERE s.defeated_at IS NULL AND t.monster_class='elite' AND JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','riot'))`);
  const active = Number(counts[0]?.total ?? 0); if (active >= 10 || Math.random() >= Math.max(0, .5 - active * .05)) return false;
  const [regions] = await pool.execute<MapRegionRow[]>(`SELECT DISTINCT r.id,r.code,r.name,r.min_x,r.max_x,r.min_y,r.max_y,r.min_z,r.max_z
    FROM map_regions r JOIN map_monster_pools p ON p.region_id=r.id JOIN monster_templates t ON t.id=p.monster_template_id
    WHERE r.is_spawn_enabled=1 AND r.is_enabled=1 AND r.is_owner_only=0 AND t.monster_class='elite' ORDER BY RAND() LIMIT 1`);
  const region = regions[0]; if (!region) return false;
  const [templates] = await pool.execute<(BossTemplateRow & { spawn_weight: number })[]>(`SELECT t.id,t.code,t.name,t.level,t.monster_class,t.skill_sequence,p.spawn_weight,${templateMonsterAttributeColumns}
    FROM map_monster_pools p JOIN monster_templates t ON t.id=p.monster_template_id WHERE p.region_id=? AND t.monster_class='elite' ORDER BY RAND() LIMIT 1`, [region.id]);
  const template = templates[0]; const position = template ? await bossSpawnPosition(pool, region) : null; if (!template || !position) return false;
  const level = randomMonsterLevel('elite', Number(template.level)); const attributes = randomMonsterBaseAttributes(template);
  const traits: MonsterTrait[] = [{ code: 'riot', name: '暴动的', statMultiplier: 2 }]; const stats = monsterCombatStats({ ...template, ...attributes, level, traits_json: traits });
  await pool.execute('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [template.id, region.id, position.x, position.y, position.z, level, attributes.constitution, attributes.spirit, attributes.strength, attributes.intelligence, attributes.agility, attributes.perception, stats.hpMax, JSON.stringify(stringList(template.skill_sequence)), JSON.stringify(traits)]);
  return true;
};

export const bossEvents = async (): Promise<BossEvent[]> => {
  const pool = await getPool(); const [rows] = await pool.execute<(RowDataPacket & { region_code: string; region_name: string; boss_code: string; boss_name: string; pos_x: number | null; pos_y: number | null; pos_z: number | null; traits_json: unknown })[]>(`SELECT r.code AS region_code,r.name AS region_name,t.code AS boss_code,t.name AS boss_name,s.pos_x,s.pos_y,s.pos_z,s.traits_json FROM map_monster_pools p JOIN map_regions r ON r.id=p.region_id JOIN monster_templates t ON t.id=p.monster_template_id LEFT JOIN monster_spawns s ON s.region_id=r.id AND s.template_id=t.id AND s.defeated_at IS NULL WHERE t.monster_class='boss' ORDER BY r.id,t.id`);
  return rows.map(row => ({ regionCode: row.region_code, regionName: row.region_name, bossCode: row.boss_code, bossName: row.boss_name, x: row.pos_x === null ? null : Number(row.pos_x), y: row.pos_y === null ? null : Number(row.pos_y), z: row.pos_z === null ? null : Number(row.pos_z), traits: traitList(row.traits_json).map(trait => trait.name) }));
};

export const adminSpawnBoss = async (code: string, traitName?: string) => {
  const pool = await getPool(); const [rows] = await pool.execute<(MapRegionRow & BossTemplateRow)[]>(`SELECT r.id,r.code AS region_code,r.name AS region_name,r.min_x,r.max_x,r.min_y,r.max_y,r.min_z,r.max_z,t.id AS template_id,t.code AS boss_code,t.name AS boss_name,t.level,t.monster_class,t.constitution,t.spirit,t.strength,t.intelligence,t.agility,t.perception,t.constitution_growth,t.spirit_growth,t.strength_growth,t.intelligence_growth,t.agility_growth,t.perception_growth,t.skill_sequence FROM map_monster_pools p JOIN map_regions r ON r.id=p.region_id JOIN monster_templates t ON t.id=p.monster_template_id WHERE t.code=? AND t.monster_class='boss' LIMIT 1`, [code]);
  const row = rows[0] as unknown as (MapRegionRow & BossTemplateRow & { region_code: string; region_name: string; template_id: number; boss_code: string; boss_name: string }); if (!row) throw new Error('未找到该 Boss 的地图配置。');
  const region = { ...row, id: Number(row.id), code: row.region_code, name: row.region_name } as MapRegionRow; const template = { ...row, id: Number(row.template_id), code: row.boss_code, name: row.boss_name } as BossTemplateRow;
  await pool.execute(`UPDATE monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    SET s.current_hp=0,s.defeated_at=NOW() WHERE s.defeated_at IS NULL AND (t.code=? OR (?='goblin_king' AND JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','kingbeast_encounter'))))`, [code, code]);
  await spawnBoss(pool, region, template, bossTraitFromName(traitName), true); return (await bossEvents()).find(event => event.bossCode === code) ?? null;
};

/** 世界线只请求自然激活：不清除既有首领，也不绕过地表首领的复生冷却。 */
export const activateWorldlineBoss = async (code: string) => {
  const pool = await getPool(); const [rows] = await pool.execute<(MapRegionRow & BossTemplateRow)[]>(`SELECT r.id,r.code AS region_code,r.name AS region_name,r.min_x,r.max_x,r.min_y,r.max_y,r.min_z,r.max_z,t.id AS template_id,t.code AS boss_code,t.name AS boss_name,t.level,t.monster_class,t.constitution,t.spirit,t.strength,t.intelligence,t.agility,t.perception,t.constitution_growth,t.spirit_growth,t.strength_growth,t.intelligence_growth,t.agility_growth,t.perception_growth,t.skill_sequence FROM map_monster_pools p JOIN map_regions r ON r.id=p.region_id JOIN monster_templates t ON t.id=p.monster_template_id WHERE t.code=? AND t.monster_class='boss' LIMIT 1`, [code]);
  const row = rows[0] as unknown as (MapRegionRow & BossTemplateRow & { region_code: string; region_name: string; template_id: number; boss_code: string; boss_name: string }); if (!row) return { state: 'missing' as const };
  const region = { ...row, id: Number(row.id), code: row.region_code, name: row.region_name } as MapRegionRow; const template = { ...row, id: Number(row.template_id), code: row.boss_code, name: row.boss_name } as BossTemplateRow;
  const [active] = await pool.execute<RowDataPacket[]>('SELECT 1 FROM monster_spawns WHERE region_id=? AND template_id=? AND defeated_at IS NULL LIMIT 1', [region.id, template.id]);
  if (active[0]) return { state: 'active' as const };
  return { state: (await spawnBoss(pool, region, template)) ? 'spawned' as const : 'cooldown' as const };
};

type BossTestCharacter = RowDataPacket & { id: number; name: string; profession_code: string | null; current_region_id: number; pos_x: number; pos_y: number; pos_z: number };

const bossTestLoadout = (professionCode: string | null, level: number) => {
  const profession = ['warrior', 'mage', 'rogue', 'priest'].includes(String(professionCode)) ? String(professionCode) : 'warrior';
  const baseWeapon = Math.floor(forgedEquipmentBase(level, '武器'));
  const profile: Record<string, { weapon: string; offhand: string; weaponEffect: Record<string, number>; offhandEffect: Record<string, number> }> = {
    warrior: { weapon: '长剑', offhand: '长剑', weaponEffect: { physicalAttack: baseWeapon }, offhandEffect: { physicalAttack: baseWeapon } },
    mage: { weapon: '法杖', offhand: '法书', weaponEffect: { magicAttack: baseWeapon }, offhandEffect: { magicAttack: baseWeapon } },
    rogue: { weapon: '匕首', offhand: '拳刃', weaponEffect: { physicalAttack: Math.floor(baseWeapon * .9), magicAttack: Math.floor(baseWeapon * .9) }, offhandEffect: { physicalAttack: Math.floor(baseWeapon * .5), magicAttack: Math.floor(baseWeapon * .5) } },
    priest: { weapon: '法书', offhand: '法球', weaponEffect: { magicAttack: baseWeapon }, offhandEffect: { magicAttack: baseWeapon } }
  };
  const selected = profile[profession];
  const armor = [
    ['shoulder', '头肩', '皮帽'], ['upper', '上装', '皮甲'], ['waist', '腰部', '皮带'], ['lower', '下装', '皮裤'], ['feet', '脚部', '皮靴']
  ].map(([slot, category, name]) => ({ slot, category, weaponType: '皮甲', name: `测试·Lv.${level}${name}`, effect: { physicalDefense: forgedEquipmentBase(level, '防具', slot), magicDefense: forgedEquipmentBase(level, '防具', slot) } }));
  return [
    { slot: 'weapon', category: '武器', weaponType: selected.weapon, name: `测试·Lv.${level}${selected.weapon}（主手）`, effect: selected.weaponEffect },
    { slot: 'offhand', category: '副手', weaponType: selected.offhand, name: `测试·Lv.${level}${selected.offhand}（副手）`, effect: selected.offhandEffect },
    ...armor
  ].map(item => ({ ...item, code: `boss_test_${profession}_${level}_${item.slot}` }));
};

/** 主人专用：将本人及当前队伍送入隔离测试场，测试 Boss 不产生经验、材料或图鉴收益。 */
export const adminStartBossTest = async (qqUserId: string, code: string, traitName?: string) => withTransaction(async connection => {
  const [owners] = await connection.execute<BossTestCharacter[]>(`SELECT c.id,c.name,c.profession_code,c.current_region_id,c.pos_x,c.pos_y,c.pos_z
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE`, [qqUserId]);
  const owner = owners[0]; if (!owner) throw new Error('请先创建角色。');
  const [partyRows] = await connection.execute<(RowDataPacket & { party_id: string; leader_character_id: number })[]>('SELECT pm.party_id,p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=? FOR UPDATE', [owner.id]);
  if (partyRows[0] && Number(partyRows[0].leader_character_id) !== Number(owner.id)) throw new Error('组队测试只能由队长发起。');
  const [participants] = partyRows[0]
    ? await connection.execute<BossTestCharacter[]>('SELECT c.id,c.name,c.profession_code,c.current_region_id,c.pos_x,c.pos_y,c.pos_z FROM party_members pm JOIN characters c ON c.id=pm.character_id WHERE pm.party_id=? ORDER BY pm.joined_at,c.id FOR UPDATE', [partyRows[0].party_id])
    : [owners];
  for (const participant of participants) {
    const [busy] = await connection.execute<(RowDataPacket & { busy: number })[]>(`SELECT (
      EXISTS (SELECT 1 FROM player_travels WHERE character_id=?)
      OR EXISTS (SELECT 1 FROM player_resource_mining WHERE character_id=?)
      OR EXISTS (SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state='active')
    ) AS busy`, [participant.id, participant.id, participant.id]);
    if (Number(busy[0]?.busy)) throw new Error(`队员「${participant.name}」正在移动、采集或战斗，暂不能进入测试。`);
  }
  const [existing] = await connection.execute<RowDataPacket[]>('SELECT id FROM boss_test_sessions WHERE owner_character_id=? AND state=\'active\' LIMIT 1 FOR UPDATE', [owner.id]);
  if (existing[0]) throw new Error('已有进行中的首领测试，请先使用“BOSS测试离开”结束该测试。');
  const [templates] = await connection.execute<(BossTemplateRow & { template_id: number; boss_name: string })[]>(`SELECT t.id AS template_id,t.code,t.name AS boss_name,t.level,t.monster_class,t.skill_sequence,${templateMonsterAttributeColumns}
    FROM map_monster_pools mp JOIN monster_templates t ON t.id=mp.monster_template_id WHERE t.code=? AND t.monster_class='boss' LIMIT 1 FOR UPDATE`, [code]);
  const template = templates[0]; if (!template) throw new Error('未找到该 Boss 的地图配置。');
  const [arenas] = await connection.execute<MapRegionRow[]>('SELECT id,code,name,min_x,max_x,min_y,max_y,min_z,max_z FROM map_regions WHERE code=\'boss_test_arena\' LIMIT 1 FOR UPDATE');
  const arena = arenas[0]; if (!arena) throw new Error('首领测试场尚未初始化，请重启服务后重试。');
  const level = Math.max(1, Number(template.level)); const trait = bossTraitFromName(traitName) ?? wolfKingTraits[0];
  const arenaX = -390; const arenaY = 390; const sessionId = randomUUID();
  let spawnId = 0;
  const createTestSpawn = async (entry: BossTemplateRow, role?: string, includeBossTrait = true) => {
    const attributes = randomMonsterBaseAttributes(entry);
    const traits: MonsterTrait[] = [...(includeBossTrait ? [trait] : []), { code: 'boss_test', name: '测试·', session_id: sessionId }, ...(role ? [{ code: 'kingbeast_encounter', name: '', groupId: `kingbeast-test-${sessionId}`, role } as MonsterTrait] : [])];
    const stats = monsterCombatStats({ ...entry, ...attributes, level: Number(entry.level), traits_json: traits });
    const [spawned] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [entry.id, arena.id, arenaX, arenaY, 0, entry.level, attributes.constitution, attributes.spirit, attributes.strength, attributes.intelligence, attributes.agility, attributes.perception, stats.hpMax, JSON.stringify(stringList(entry.skill_sequence)), JSON.stringify(traits)]);
    if (role === 'king' || !role) spawnId = Number(spawned.insertId);
  };
  if (template.code === 'goblin_king') {
    const [encounterTemplates] = await connection.execute<BossTemplateRow[]>(`SELECT t.id,t.code,t.name,t.level,t.monster_class,t.skill_sequence,${templateMonsterAttributeColumns}
      FROM monster_templates t WHERE t.code IN ('goblin_king','habadragon','goblin_royal_guard','goblin_royal_spearman') FOR UPDATE`);
    const byCode = new Map(encounterTemplates.map(item => [item.code, item]));
    if (['goblin_king', 'habadragon', 'goblin_royal_guard', 'goblin_royal_spearman'].some(entry => !byCode.has(entry))) throw new Error('哥布林国王的王庭遭遇配置不完整。');
    await createTestSpawn(byCode.get('goblin_king')!, 'king');
    await createTestSpawn(byCode.get('habadragon')!, 'dragon');
    await createTestSpawn(byCode.get('goblin_royal_guard')!, 'guard', false);
    await createTestSpawn(byCode.get('goblin_royal_spearman')!, 'spearman', false);
  } else {
    await createTestSpawn({ ...template, id: template.template_id }, undefined);
  }
  await connection.execute('INSERT INTO boss_test_sessions (id,owner_character_id,boss_spawn_id,arena_region_id) VALUES (?,?,?,?)', [sessionId, owner.id, spawnId, arena.id]);
  for (const participant of participants) await connection.execute('INSERT INTO boss_test_participants (session_id,character_id,return_region_id,return_x,return_y,return_z) VALUES (?,?,?,?,?,?)', [sessionId, participant.id, participant.current_region_id, participant.pos_x, participant.pos_y, participant.pos_z]);
  await connection.execute(`UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE id IN (${participants.map(() => '?').join(',')})`, [arena.id, arenaX, arenaY, 0, ...participants.map(participant => participant.id)]);
  const realmStage = Math.min(5, Math.max(1, Math.ceil(level / 10)));
  await connection.execute('UPDATE characters SET level=?,experience=0,realm_stage=?,skill_points=? WHERE id=?', [level, realmStage, level, owner.id]);
  await connection.execute('DELETE FROM player_skill_specializations WHERE character_id=?', [owner.id]);
  await connection.execute('DELETE FROM player_skills WHERE character_id=?', [owner.id]);
  await connection.execute('DELETE FROM player_skill_discoveries WHERE character_id=?', [owner.id]);
  await connection.execute('INSERT INTO player_appraisal_progress (character_id,range_level,information_level) VALUES (?,1,1) ON DUPLICATE KEY UPDATE range_level=1,information_level=1', [owner.id]);
  // 测试只授予玩家可取得的技能来源，绝不把 Boss／怪物原始招式塞进角色技能栏。
  await connection.execute(`INSERT IGNORE INTO player_skills (character_id,skill_id)
    SELECT DISTINCT ?,s.id FROM skill_definitions s
    WHERE s.category='bound'
      OR EXISTS (SELECT 1 FROM profession_definitions p WHERE p.code=? AND JSON_CONTAINS(p.skill_codes_json,JSON_QUOTE(s.code)))
      OR EXISTS (SELECT 1 FROM item_definitions i WHERE i.item_type='consumable' AND JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.skillBook'))=s.code)
      OR EXISTS (SELECT 1 FROM monster_skill_learn_rules rule WHERE rule.skill_id=s.id AND s.learn_cost<99)`, [owner.id, owner.profession_code ?? '']);
  await connection.execute('DELETE FROM player_skill_point_ledger WHERE character_id=?', [owner.id]);
  await recordSkillPointChange(connection, owner.id, level, 'legacy_opening_balance', null, `首领测试：按 Lv.${level} 重置技能点`);
  const loadout = bossTestLoadout(owner.profession_code, level);
  await connection.execute('DELETE FROM player_equipment WHERE character_id=?', [owner.id]);
  for (const item of loadout) {
    await connection.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weapon_type,rarity,required_level,weight,trade_price,stack_limit,stackable,is_tradeable,effect_json)
      VALUES (?,?,?,'首领测试','equipment',?,?, '普通', ?,0,0,1,0,0,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),weapon_type=VALUES(weapon_type),required_level=VALUES(required_level),effect_json=VALUES(effect_json)`, [item.code, item.name, `首领测试专用的 Lv.${level} 普通品质装备。`, item.category, item.weaponType, level, JSON.stringify({...item.effect,balanceVersion:3})]);
    const [definitions] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM item_definitions WHERE code=? LIMIT 1', [item.code]);
    const [instance] = await connection.execute<any>('INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max,effect_json) VALUES (?,?,100,100,100,?)', [owner.id, definitions[0].id, JSON.stringify({...item.effect,balanceVersion:3})]);
    await connection.execute('INSERT INTO player_equipment (character_id,slot,item_id,instance_id) VALUES (?,?,?,?)', [owner.id, item.slot, definitions[0].id, Number(instance.insertId)]);
  }
  await recalculateCharacterStats(connection, owner.id);
  await connection.execute('UPDATE characters SET current_hp=hp_max,current_mp=mp_max WHERE id=?', [owner.id]);
  const [skillCounts] = await connection.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM player_skills WHERE character_id=?', [owner.id]);
  return { bossName: template.boss_name, bossCode: template.code, level, skillPoints: level, skillCount: Number(skillCounts[0]?.total ?? 0), trait: trait.name, participants: participants.map(participant => participant.name), x: arenaX, y: arenaY };
});

export const adminLeaveBossTest = async (qqUserId: string) => withTransaction(async connection => {
  const [owners] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  const owner = owners[0]; if (!owner) throw new Error('请先创建角色。');
  const [sessions] = await connection.execute<(RowDataPacket & { id: string; boss_spawn_id: number; state: 'active' | 'finished' })[]>('SELECT id,boss_spawn_id,state FROM boss_test_sessions WHERE owner_character_id=? AND state IN (\'active\',\'finished\') ORDER BY created_at DESC LIMIT 1 FOR UPDATE', [owner.id]);
  const session = sessions[0]; if (!session) throw new Error('当前没有进行中的首领测试。');
  const [combatSessions] = await connection.execute<(RowDataPacket & { id: string })[]>(`SELECT DISTINCT cs.id FROM combat_sessions cs
    JOIN combat_targets ct ON ct.session_id=cs.id
    JOIN monster_spawns s ON s.id=ct.spawn_id
    WHERE cs.state='active' AND JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','boss_test','session_id',?)) FOR UPDATE`, [session.id]);
  if (combatSessions.length) {
    const ids = combatSessions.map(combat => combat.id);
    await connection.execute(`UPDATE combat_sessions SET state='escaped' WHERE state='active' AND id IN (${ids.map(() => '?').join(',')})`, ids);
    await connection.execute(`DELETE FROM combat_status_effects WHERE session_id IN (${ids.map(() => '?').join(',')})`, ids);
  }
  const [participants] = await connection.execute<(RowDataPacket & { character_id: number; return_region_id: number; return_x: number; return_y: number; return_z: number })[]>('SELECT character_id,return_region_id,return_x,return_y,return_z FROM boss_test_participants WHERE session_id=? FOR UPDATE', [session.id]);
  for (const participant of participants) await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE id=?', [participant.return_region_id, participant.return_x, participant.return_y, participant.return_z, participant.character_id]);
  await connection.execute(`UPDATE monster_spawns SET current_hp=0,defeated_at=NOW()
    WHERE defeated_at IS NULL AND JSON_CONTAINS(COALESCE(traits_json,JSON_ARRAY()),JSON_OBJECT('code','boss_test','session_id',?))`, [session.id]);
  if (session.state === 'active') await connection.execute('UPDATE boss_test_sessions SET state=\'abandoned\',finished_at=NOW() WHERE id=?', [session.id]);
  return { participants: participants.length, combatCount: combatSessions.length };
});

export const adminDefeatBoss = async (code: string) => {
  const pool = await getPool(); const [result] = await pool.execute<any>(`UPDATE monster_spawns s JOIN monster_templates t ON t.id=s.template_id SET s.current_hp=0,s.defeated_at=NOW() WHERE (t.code=? OR (?='goblin_king' AND JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','kingbeast_encounter')))) AND s.defeated_at IS NULL`, [code, code]);
  return Number(result.affectedRows) > 0;
};

export const spawnMonsters = async ({ refreshBosses = true, trimExcess = true, regionCode, refreshMonsters = true, refreshResources = true }: { refreshBosses?: boolean; trimExcess?: boolean; regionCode?: string; refreshMonsters?: boolean; refreshResources?: boolean } = {}) => {
  const pool = await getPool();
  await normalizeRegionalBossTraits(pool);
  if (refreshMonsters) {
  const [regions] = await pool.execute<MapRegionRow[]>(`SELECT id,code,name,min_x,max_x,min_y,max_y,min_z,max_z FROM map_regions WHERE is_spawn_enabled=1 AND is_enabled=1 AND is_owner_only=0${regionCode ? ' AND code=?' : ''}`, regionCode ? [regionCode] : []);
  for (const region of regions) {
    const areas = await regionAreas(pool, region);
    const [overlays] = await pool.execute<RegionAreaRow[]>('SELECT a.min_x,a.max_x,a.min_y,a.max_y,a.min_z,a.max_z FROM map_region_areas a JOIN map_regions r ON r.id=a.region_id WHERE r.danger_level>(SELECT danger_level FROM map_regions WHERE id=?)', [region.id]);
    const overridden = (x: number, y: number, z: number) => pointInAreas(overlays, x, y, z);
  const [allTemplates] = await pool.execute<(RowDataPacket & MonsterAttributes & { id: number; code: string; name: string; level: number; monster_class: string; spawn_weight: number; skill_sequence: unknown })[]>(`SELECT t.id,t.code,t.name,t.level,t.monster_class,t.skill_sequence,p.spawn_weight,${templateMonsterAttributeColumns} FROM map_monster_pools p JOIN monster_templates t ON t.id=p.monster_template_id WHERE p.region_id=?`, [region.id]);
    const bossTemplates = allTemplates.filter(template => template.monster_class === 'boss');
    if (refreshBosses) for (const template of bossTemplates) if (Math.random() < Number(bossSpawnChanceByCode[template.code] ?? .15)) await spawnBoss(pool, region, template);
    if (region.code === 'dark_forest_deep') {
      const deepTemplates = allTemplates.filter(template => template.monster_class !== 'boss' && template.code !== 'goblin_colonel');
      const colonelTemplate = allTemplates.find(template => template.code === 'goblin_colonel');
      if (!deepTemplates.length) continue;
      const [blockedRows] = await pool.execute<(RowDataPacket & { pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pos_x,pos_y,pos_z FROM map_npcs WHERE region_id=? AND pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL
        UNION SELECT pos_x,pos_y,pos_z FROM map_special_objects WHERE region_id=?`, [region.id, region.id]);
      const deepBlocked = new Set(blockedRows.map(row => `${row.pos_x},${row.pos_y},${row.pos_z}`));
      const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.defeated_at IS NULL AND t.code IN ('goblin_vanguard','goblin_warrior','goblin_archer','goblin_bomber','goblin_daredevil','goblin_drummer','goblin_shieldbearer','goblin_trapper','goblin_priest','goblin_mage','goblin_assassin','goblin_earthshaper','goblin_colonel')`, [region.id]);
      let deepActive = Number(countRows[0]?.total ?? 0);
      const deepLimit = Math.floor(spawnableAreaForAreas(areas, overlays) * 0.01);
      // 无编队只是不带“编队·”词条，幽暗密林深处的哥布林遭遇本身始终按小队生成。
      while (deepActive + 2 <= deepLimit) {
        const colonelLead = Boolean(colonelTemplate) && deepActive + 4 <= deepLimit && Math.random() < 0.005;
        const goblinFormation = colonelLead || (deepActive + 2 <= deepLimit && Math.random() < .25);
        const groupRoll = Math.random();
        const plannedGroupSize = groupRoll < .45 ? 2 : groupRoll < .85 ? 3 : 4;
        const groupSize = colonelLead ? 4 : Math.min(plannedGroupSize, deepLimit - deepActive);
        const groupTemplates = colonelLead ? [colonelTemplate!] : [pickWeighted(deepTemplates)];
        if (colonelLead) {
          const frontline = deepTemplates.filter(template => ['goblin_vanguard', 'goblin_warrior', 'goblin_shieldbearer', 'goblin_drummer'].includes(template.code));
          groupTemplates.push(pickWeighted(frontline.length ? frontline : deepTemplates));
        }
        while (groupTemplates.length < groupSize) groupTemplates.push(pickWeighted(deepTemplates));
        let { x, y, z } = randomAreaPoint(areas);
        for (let attempt = 0; attempt < 64 && (deepBlocked.has(`${x},${y},${z}`) || overridden(x, y, z)); attempt++) ({ x, y, z } = randomAreaPoint(areas));
        if (deepBlocked.has(`${x},${y},${z}`) || overridden(x, y, z)) break;
        const groupId = `goblin-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        for (const template of groupTemplates) {
          const level = template.code === 'goblin_colonel' ? 30
            : colonelLead || (goblinFormation && template.monster_class === 'elite') ? random(27, 30)
              : goblinFormation ? random(20, 25) : randomGoblinLevel(template.code, Number(template.level));
          const skillPool = stringList(template.skill_sequence);
          const skills = template.code === 'goblin_colonel' ? skillPool : randomItems(skillPool, random(2, Math.min(3, skillPool.length)));
          const baseAttributes = randomMonsterBaseAttributes(template);
          const traits = [...randomMonsterTraits(template), ...(goblinFormation ? [{ code: 'goblin_formation', name: '编队·', groupId, role: template.code === 'goblin_colonel' ? 'leader' : 'member' } as any] : [])];
          const spawned = { ...template, ...baseAttributes, level, traits_json: traits };
          const stats = monsterCombatStats(spawned);
          await pool.execute(`INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [template.id, region.id, x, y, z, level, baseAttributes.constitution, baseAttributes.spirit, baseAttributes.strength, baseAttributes.intelligence, baseAttributes.agility, baseAttributes.perception, stats.hpMax, JSON.stringify(skills), JSON.stringify(traits)]);
        }
        deepActive += groupTemplates.length;
        deepBlocked.add(`${x},${y},${z}`);
      }
      continue;
    }    const templates = allTemplates.filter(template => template.monster_class !== 'boss');
    if (!templates.length) continue;
    const [blockedRows] = await pool.execute<(RowDataPacket & { pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pos_x,pos_y,pos_z FROM map_npcs WHERE region_id=? AND pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL
      UNION SELECT pos_x,pos_y,pos_z FROM map_special_objects WHERE region_id=?
      UNION SELECT entrance_x AS pos_x,entrance_y AS pos_y,0 AS pos_z FROM dungeon_instances WHERE state='active' AND entrance_region_id=?`, [region.id, region.id, region.id]);
    const blocked = new Set(blockedRows.map(row => `${row.pos_x},${row.pos_y},${row.pos_z}`));
    const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM monster_spawns s
      JOIN monster_templates t ON t.id=s.template_id
      WHERE s.region_id=? AND s.defeated_at IS NULL AND t.monster_class<>'boss'`, [region.id]);
    const area = spawnableAreaForAreas(areas, overlays);
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
      let { x, y, z } = randomAreaPoint(areas);
      for (let attempt = 0; attempt < 64 && (blocked.has(`${x},${y},${z}`) || overridden(x, y, z)); attempt++) ({ x, y, z } = randomAreaPoint(areas));
      if (blocked.has(`${x},${y},${z}`) || overridden(x, y, z)) continue;
      const skillPool = stringList(template.skill_sequence); const skills = template.monster_class === 'boss' ? skillPool : randomItems(skillPool, random(0, Math.min(4, skillPool.length))); const traits = randomMonsterTraits(template);
      const level = randomMonsterLevel(template.monster_class, Number(template.level));
      const baseAttributes = randomMonsterBaseAttributes(template);
      const spawned = { ...template, ...baseAttributes, level, traits_json: traits };
      const stats = monsterCombatStats(spawned);
      await pool.execute('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [template.id, region.id, x, y, z, level, baseAttributes.constitution, baseAttributes.spirit, baseAttributes.strength, baseAttributes.intelligence, baseAttributes.agility, baseAttributes.perception, stats.hpMax, JSON.stringify(skills), JSON.stringify(traits)]);
    }
  }
  }
  if (!refreshResources) return;
  // 与怪物共用重启/整点的补齐时机。矿点不参与怪物的位置阻挡，因此二者可以重叠。
  const [resourcePools] = await pool.execute<(RowDataPacket & { region_id: number; item_id: number; spawn_density: number; min_x: number; max_x: number; min_y: number; max_y: number; min_z: number; max_z: number })[]>(`SELECT rp.region_id,rp.item_id,rp.spawn_density,r.min_x,r.max_x,r.min_y,r.max_y,r.min_z,r.max_z
    FROM map_resource_pools rp JOIN map_regions r ON r.id=rp.region_id WHERE r.is_spawn_enabled=1 AND r.is_enabled=1 AND r.is_owner_only=0${regionCode ? ' AND r.code=?' : ''}`, regionCode ? [regionCode] : []);
  for (const resource of resourcePools) {
    const resourceRegion = { ...resource, id: Number(resource.region_id), code: '', name: '' } as MapRegionRow;
    const areas = await regionAreas(pool, resourceRegion);
    const [overlays] = await pool.execute<RegionAreaRow[]>('SELECT a.min_x,a.max_x,a.min_y,a.max_y,a.min_z,a.max_z FROM map_region_areas a JOIN map_regions r ON r.id=a.region_id WHERE r.danger_level>(SELECT danger_level FROM map_regions WHERE id=?)', [resource.region_id]);
    const overridden = (x: number, y: number, z: number) => pointInAreas(overlays, x, y, z);
    const area = spawnableAreaForAreas(areas, overlays);
    const expected = Math.max(0, area * Number(resource.spawn_density));
    // 理论数量不足 1 的稀有资源按整点概率补 1 个；已存在的资源不被随机清除，且始终不会超过 1 个。
    const rareSingleSpawn = expected < 1;
    const target = rareSingleSpawn ? 1 : Math.round(expected);
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
    const missing = rareSingleSpawn
      ? (activeCount === 0 && Math.random() < expected ? 1 : 0)
      : Math.max(0, target - activeCount);
    if (!missing) continue;
    const [blockedRows] = await pool.execute<(RowDataPacket & { pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pos_x,pos_y,pos_z FROM map_npcs WHERE region_id=? AND pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL
      UNION SELECT pos_x,pos_y,pos_z FROM map_special_objects WHERE region_id=?
      UNION SELECT pos_x,pos_y,pos_z FROM resource_spawns WHERE region_id=? AND mined_at IS NULL`, [resource.region_id, resource.region_id, resource.region_id]);
    const blocked = new Set(blockedRows.map(row => `${row.pos_x},${row.pos_y},${row.pos_z}`));
    for (let i = 0; i < missing; i++) {
      let { x, y, z } = randomAreaPoint(areas);
      for (let attempt = 0; attempt < 64 && (blocked.has(`${x},${y},${z}`) || overridden(x, y, z)); attempt++) ({ x, y, z } = randomAreaPoint(areas));
      if (blocked.has(`${x},${y},${z}`) || overridden(x, y, z)) continue;
      await pool.execute('INSERT INTO resource_spawns (region_id,item_id,pos_x,pos_y,pos_z) VALUES (?,?,?,?,?)', [resource.region_id, resource.item_id, x, y, z]);
      blocked.add(`${x},${y},${z}`);
    }
  }
  // 稀有锻材只由全世界整点刷新补齐；区域定向刷新不抢占全局这一轮的幂等锁。
  if (!regionCode) await refreshRareForgeMaterials(pool);
};

type RareForgeMaterialRow = RowDataPacket & { item_id: number; code: string; hourly_attempts: number; attempt_chance: number; per_region_active_cap: number; min_region_level: number };
type RareCandidateRegion = RowDataPacket & MapRegionRow & { minimum_monster_level: number };
const refreshRareForgeMaterials = async (pool: Pool) => {
  // INSERT IGNORE 是按小时的唯一幂等锁：即使定时任务重入，也只会执行一次掷骰。
  const [log] = await pool.execute<any>(`INSERT IGNORE INTO rare_material_refresh_logs (refresh_hour)
    VALUES (DATE_FORMAT(NOW(),'%Y-%m-%d %H:00:00'))`);
  if (!Number(log.affectedRows)) return;
  const [materials] = await pool.execute<RareForgeMaterialRow[]>(`SELECT rfm.item_id,i.code,rfm.hourly_attempts,rfm.attempt_chance,rfm.per_region_active_cap,rfm.min_region_level
    FROM rare_forge_materials rfm JOIN item_definitions i ON i.id=rfm.item_id ORDER BY rfm.item_id`);
  if (!materials.length) return;
  const [regions] = await pool.execute<RareCandidateRegion[]>(`SELECT r.id,r.code,r.name,r.min_x,r.max_x,r.min_y,r.max_y,r.min_z,r.max_z,MIN(t.level) AS minimum_monster_level
    FROM map_regions r JOIN map_monster_pools mp ON mp.region_id=r.id JOIN monster_templates t ON t.id=mp.monster_template_id
    WHERE r.is_spawn_enabled=1 AND r.is_enabled=1 AND r.is_owner_only=0
    GROUP BY r.id,r.code,r.name,r.min_x,r.max_x,r.min_y,r.max_y,r.min_z,r.max_z`);
  const [activeRows] = await pool.execute<(RowDataPacket & { region_id: number; item_id: number; total: number })[]>(`SELECT rs.region_id,rs.item_id,COUNT(*) AS total
    FROM resource_spawns rs JOIN rare_forge_materials rfm ON rfm.item_id=rs.item_id
    WHERE rs.mined_at IS NULL GROUP BY rs.region_id,rs.item_id`);
  const active = new Map(activeRows.map(row => [`${row.region_id}:${row.item_id}`, Number(row.total)]));
  const areasByRegion = new Map<number, RegionAreaRow[]>();
  const blockedByRegion = new Map<number, Set<string>>();
  for (const material of materials) for (const region of regions) {
    if (Number(region.minimum_monster_level) < Number(material.min_region_level)) continue;
    const key = `${region.id}:${material.item_id}`; let activeCount = active.get(key) ?? 0;
    if (activeCount >= Number(material.per_region_active_cap)) continue;
    let areas = areasByRegion.get(Number(region.id));
    if (!areas) { areas = await regionAreas(pool, region); areasByRegion.set(Number(region.id), areas); }
    let blocked = blockedByRegion.get(Number(region.id));
    if (!blocked) {
      const [blockedRows] = await pool.execute<(RowDataPacket & { pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pos_x,pos_y,pos_z FROM map_npcs WHERE region_id=? AND pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL
        UNION SELECT pos_x,pos_y,pos_z FROM map_special_objects WHERE region_id=?
        UNION SELECT pos_x,pos_y,pos_z FROM resource_spawns WHERE region_id=? AND mined_at IS NULL`, [region.id, region.id, region.id]);
      blocked = new Set(blockedRows.map(row => `${row.pos_x},${row.pos_y},${row.pos_z}`)); blockedByRegion.set(Number(region.id), blocked);
    }
    const attempts = Math.min(Number(material.hourly_attempts), Number(material.per_region_active_cap) - activeCount);
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (Math.random() >= Number(material.attempt_chance)) continue;
      let point = randomAreaPoint(areas); let placed = false;
      for (let retry = 0; retry < 64; retry++) {
        const keyAtPoint = `${point.x},${point.y},${point.z}`;
        if (!blocked.has(keyAtPoint)) { placed = true; break; }
        point = randomAreaPoint(areas);
      }
      if (!placed) continue;
      await pool.execute('INSERT INTO resource_spawns (region_id,item_id,pos_x,pos_y,pos_z) VALUES (?,?,?,?,?)', [region.id, material.item_id, point.x, point.y, point.z]);
      blocked.add(`${point.x},${point.y},${point.z}`); activeCount += 1; active.set(key, activeCount);
    }
  }
};

export const monsterManagementEvents = async (): Promise<MonsterManagementEvent[]> => {
  const pool = await getPool();
  const [regions] = await pool.execute<MapRegionRow[]>('SELECT id,code,name,min_x,max_x,min_y,max_y,min_z,max_z FROM map_regions WHERE is_spawn_enabled=1 AND is_enabled=1 AND is_owner_only=0 ORDER BY id');
  const [rows] = await pool.execute<(RowDataPacket & { region_id: number; name: string; total: number })[]>(`SELECT s.region_id,t.name,COUNT(*) AS total FROM monster_spawns s
    JOIN monster_templates t ON t.id=s.template_id
    WHERE s.defeated_at IS NULL AND t.monster_class<>'boss'
    GROUP BY s.region_id,t.id,t.name ORDER BY s.region_id,total DESC,t.id`);
  const monstersByRegion = new Map<number, { name: string; count: number }[]>();
  for (const row of rows) {
    const monsters = monstersByRegion.get(Number(row.region_id)) ?? [];
    monsters.push({ name: row.name, count: Number(row.total) }); monstersByRegion.set(Number(row.region_id), monsters);
  }
  const [formationRows] = await pool.execute<(RowDataPacket & { region_id: number; traits_json: unknown })[]>(`SELECT s.region_id,s.traits_json FROM monster_spawns s
    JOIN monster_templates t ON t.id=s.template_id WHERE s.defeated_at IS NULL AND t.monster_class<>'boss'`);
  const formationsByRegion = new Map<number, Set<string>>(); const formationMembersByRegion = new Map<number, number>();
  for (const row of formationRows) {
    const formation = traitList(row.traits_json).find(trait => trait.code === 'goblin_formation');
    if (!formation?.groupId) continue;
    const regionId = Number(row.region_id); const groups = formationsByRegion.get(regionId) ?? new Set<string>();
    groups.add(formation.groupId); formationsByRegion.set(regionId, groups);
    formationMembersByRegion.set(regionId, Number(formationMembersByRegion.get(regionId) ?? 0) + 1);
  }
  return Promise.all(regions.map(async region => {
    const [overlays] = await pool.execute<MapRegionRow[]>('SELECT id,code,name,min_x,max_x,min_y,max_y,min_z,max_z FROM map_regions WHERE danger_level>(SELECT danger_level FROM map_regions WHERE id=?)', [region.id]);
    const area = region.code === 'dark_forest_deep' ? regionVolume(region) : spawnableArea(region, overlays);
    const monsters = monstersByRegion.get(Number(region.id)) ?? [];
    return { regionCode: region.code, regionName: region.name, activeCount: monsters.reduce((total, monster) => total + monster.count, 0), spawnLimit: Math.floor(area * 0.01), formationCount: formationsByRegion.get(Number(region.id))?.size ?? 0, formationMemberCount: formationMembersByRegion.get(Number(region.id)) ?? 0, monsters };
  }));
};

export const resourceManagementEvents = async (): Promise<ResourceManagementEvent[]> => {
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { region_id: number; region_code: string; region_name: string; min_x: number; max_x: number; min_y: number; max_y: number; min_z: number; max_z: number; item_name: string; spawn_density: number; active_count: number })[]>(`SELECT r.id AS region_id,r.code AS region_code,r.name AS region_name,r.min_x,r.max_x,r.min_y,r.max_y,r.min_z,r.max_z,i.name AS item_name,rp.spawn_density,COUNT(rs.id) AS active_count
    FROM map_resource_pools rp JOIN map_regions r ON r.id=rp.region_id JOIN item_definitions i ON i.id=rp.item_id
    LEFT JOIN resource_spawns rs ON rs.region_id=rp.region_id AND rs.item_id=rp.item_id AND rs.mined_at IS NULL
    WHERE r.is_spawn_enabled=1 GROUP BY r.id,i.id,rp.spawn_density ORDER BY r.id,i.id`);
  const events = new Map<string, ResourceManagementEvent>();
  for (const row of rows) {
    const [overlays] = await pool.execute<MapRegionRow[]>('SELECT id,code,name,min_x,max_x,min_y,max_y,min_z,max_z FROM map_regions WHERE danger_level>(SELECT danger_level FROM map_regions WHERE id=?)', [row.region_id]);
    const expected = Math.max(0, spawnableArea(row, overlays) * Number(row.spawn_density)); const rareSingleSpawn = expected < 1;
    const resource = { name: row.item_name, activeCount: Number(row.active_count), density: Number(row.spawn_density), expected, target: rareSingleSpawn ? 1 : Math.round(expected), rareSingleSpawn };
    const event = events.get(row.region_code) ?? { regionCode: row.region_code, regionName: row.region_name, resources: [] };
    event.resources.push(resource); events.set(row.region_code, event);
  }
  return [...events.values()];
};

const refreshableRegion = async (pool: Pool, regionCode: string) => {
  const [rows] = await pool.execute<MapRegionRow[]>('SELECT id,code,name,min_x,max_x,min_y,max_y,min_z,max_z FROM map_regions WHERE code=? AND is_spawn_enabled=1 LIMIT 1', [regionCode]);
  const region = rows[0]; if (!region) throw new Error('未找到可刷新的地图。'); return region;
};

export const adminRefreshMonsters = async (regionCode: string) => {
  const pool = await getPool(); const region = await refreshableRegion(pool, regionCode);
  const [result] = await pool.execute<any>(`UPDATE monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    SET s.current_hp=0,s.defeated_at=NOW()
    WHERE s.region_id=? AND s.defeated_at IS NULL AND t.monster_class<>'boss'
      AND NOT EXISTS (SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=s.id AND cs.state='active')`, [region.id]);
  await spawnMonsters({ refreshBosses: false, trimExcess: true, regionCode: region.code, refreshResources: false });
  return { regionName: region.name, refreshed: Number(result.affectedRows) };
};

export const adminRefreshResources = async (regionCode: string) => {
  const pool = await getPool(); const region = await refreshableRegion(pool, regionCode);
  const [result] = await pool.execute<any>(`UPDATE resource_spawns rs SET rs.mined_at=NOW()
    WHERE rs.region_id=? AND rs.mined_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM player_resource_mining prm WHERE prm.resource_id=rs.id)`, [region.id]);
  await spawnMonsters({ refreshBosses: false, trimExcess: true, regionCode: region.code, refreshMonsters: false });
  return { regionName: region.name, refreshed: Number(result.affectedRows) };
};

export const inventory = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { name: string; quantity: number; weight: number; quick_slot: number | null; equipped_slot: string | null })[]>(`SELECT i.name,i.rarity,i.item_type,i.item_category, pi.quantity, i.weight, qi.quick_slot, pe.slot AS equipped_slot FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id LEFT JOIN player_quick_items qi ON qi.character_id=pi.character_id AND qi.item_id=pi.item_id LEFT JOIN player_equipment pe ON pe.character_id=pi.character_id AND pe.item_id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 ORDER BY i.name`, [character.id]);
  const talent=await(await import('./talent-data')).ownedTalent(pool,Number(character.id));
  const weight = rows.reduce((sum, item) => sum + Number(item.quantity) * Number(item.weight)*(talent?.number==='I02'&&item.item_type==='material'&&item.rarity==='普通'?1/3:1), 0);
  const attributes = await effectiveCharacterAttributes(pool, character, Number(character.id));
  const [artifactRows] = await pool.execute<(RowDataPacket & { effect_json: unknown })[]>(`SELECT COALESCE(ii.effect_json,i.effect_json) AS effect_json FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id WHERE pe.character_id=?`, [character.id]);
  const artifactEffects = artifactRows.map(row => jsonObject(row.effect_json)); const ignoreWeightPenalty = artifactEffects.some(effect => Boolean(effect.ignoreWeightPenalty)); const moveSpeedBonus = artifactEffects.reduce((total, effect) => total + Number(effect.moveSpeedBonus ?? 0), 0);
  const burden = encumbrance(attributes, weight, ignoreWeightPenalty);
  const speed = burden.applySpeed(Number(character.speed));
  const baseMovementSpeed = Math.min(10, movementSpeedFrom(attributes.agility, Number(character.level)) + moveSpeedBonus);
  return { items: rows, weight, capacity: burden.capacity, speed, movementSpeed: burden.applySpeed(baseMovementSpeed), overloadPct: burden.overloadPct, speedPenaltyPct: burden.speedPenaltyPct };
};

/** 当前步长独立于属性计算出的移速上限；旧角色首次读取时默认为 1 格。 */
export const movementProfile = async (qqUserId: string) => {
  const [character, bag] = await Promise.all([characterFor(qqUserId), inventory(qqUserId)]);
  const pool = await getPool();
  await pool.execute('INSERT IGNORE INTO player_movement_settings (character_id,movement_step) VALUES (?,1)', [character.id]);
  const [rows] = await pool.execute<(RowDataPacket & { movement_step: number; show_landmarks: number; show_players: number })[]>('SELECT movement_step,show_landmarks,show_players FROM player_movement_settings WHERE character_id=? LIMIT 1', [character.id]);
  const maximum = Math.max(1, Math.floor(bag.movementSpeed));
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
  const [stacked] = await pool.execute<(RowDataPacket & { id: number; code: string; codex_id: string; name: string; item_type:string;effect_json:unknown;item_category: string; quantity: number; trade_bound_quantity:number;personal_bound_quantity:number;description: string })[]>('SELECT i.id,i.code,i.codex_id,i.name,i.item_type,i.effect_json,i.item_category,pi.quantity,pi.trade_bound_quantity,pi.personal_bound_quantity,i.description FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type=? AND i.stackable=1 ORDER BY i.name', [character.id, itemType]);
  const [instances] = await pool.execute<(RowDataPacket & { id: number; definition_codex_id: string; name: string; item_category: string; quality: number; durability: number; durability_max: number;bound_kind:string;market_listing_id:number|null; description: string })[]>('SELECT ii.id,i.codex_id AS definition_codex_id,i.name,i.item_category,ii.quality,ii.durability,ii.durability_max,ii.bound_kind,ii.market_listing_id,i.description FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.character_id=? AND i.item_type=? ORDER BY ii.acquired_at DESC', [character.id, itemType]);
  const [recent] = await pool.execute<(RowDataPacket & { id:number;effect_json:unknown;code: string; codex_id: string; item_type: string; item_category: string; name: string })[]>(`SELECT id,effect_json,code,codex_id,item_type,item_category,name FROM (
      SELECT i.id,i.effect_json,i.code,i.codex_id,i.item_type,i.item_category,i.name,ii.acquired_at FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.character_id=?
      UNION ALL SELECT i.id,i.effect_json,i.code,i.codex_id,i.item_type,i.item_category,i.name,pi.acquired_at FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0
    ) recent_items ORDER BY acquired_at DESC LIMIT 5`, [character.id, character.id]);
  return { stacked, instances, recent };
};

export const itemCodex = async (qqUserId: string, codexId: string) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & { id: number; code:string;required_level:number;codex_id: string; name: string; item_type: string; item_category: string; description: string; obtain_source: string; weight: number; effect_json: unknown })[]>(`SELECT DISTINCT i.id,i.code,i.required_level,i.codex_id,i.name,i.item_type,i.item_category,i.description,i.obtain_source,i.weight,i.effect_json FROM item_definitions i
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
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { name: string; item_category: string; weapon_type: string | null; rarity: string; required_level: number; quality: number; durability: number; durability_max: number; effect_json: unknown; forge_primary_json: unknown; description: string })[]>(`
    SELECT i.name,i.item_category,i.weapon_type,i.rarity,i.required_level,ii.quality,ii.durability,ii.durability_max,COALESCE(ii.effect_json,i.effect_json) AS effect_json,ii.forge_primary_json,i.description
    FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    WHERE ii.id=? AND ii.character_id=? AND i.item_type='equipment'
  `, [instanceId, character.id]);
  if (!rows[0]) throw new Error('未找到该装备。');
  const [fusionRows] = await pool.execute<(RowDataPacket & { material_name: string; effect_key: string; effect_value: number; created_at: Date })[]>(`SELECT i.name AS material_name,e.effect_key,e.effect_value,f.created_at
    FROM equipment_fusion_effects e JOIN equipment_fusions f ON f.id=e.fusion_id JOIN item_definitions i ON i.id=f.material_item_id
    WHERE f.instance_id=? ORDER BY e.id`, [instanceId]);
  return { ...rows[0], fusionEffects: fusionRows.map(row => ({ materialName: row.material_name, key: row.effect_key, value: Number(row.effect_value), createdAt: row.created_at })) };
};

/** 按装备槽顺序读取当前已穿戴装备，供装备面板逐件查看详情。 */
export const equippedEquipmentDetails = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & { slot: string; instance_id: number | null; name: string; item_category: string; weapon_type: string | null; rarity: string; required_level: number; quality: number; durability: number; durability_max: number; effect_json: unknown; forge_primary_json: unknown; description: string })[]>(`
    SELECT pe.slot,pe.instance_id,i.name,i.item_category,i.weapon_type,i.rarity,i.required_level,
      COALESCE(ii.quality,100) AS quality,COALESCE(ii.durability,100) AS durability,COALESCE(ii.durability_max,100) AS durability_max,
      COALESCE(ii.effect_json,i.effect_json) AS effect_json,ii.forge_primary_json,i.description
    FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id
      LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id
    WHERE pe.character_id=?
    ORDER BY FIELD(pe.slot,'weapon','offhand','shoulder','upper','waist','lower','feet','necklace','bracelet','ring')
  `, [character.id]);
  return rows;
};

export const equipment = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & { slot: string; name: string; instance_id: number | null; weapon_type: string | null; effect_json: unknown })[]>(`SELECT pe.slot,i.name,pe.instance_id,i.weapon_type,COALESCE(ii.effect_json,i.effect_json) AS effect_json
    FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id
    LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id
    WHERE pe.character_id=?
    ORDER BY FIELD(pe.slot,'weapon','offhand','shoulder','upper','waist','lower','feet','necklace','bracelet','ring')`, [character.id]);
  const data=await(await import('./talent-data')).readTalentData(await getPool(),Number(character.id));
  return rows.map(row=>({...row,appearanceName:rows.find(source=>source.slot===data.flags.appearance?.[row.slot])?.name}));
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
  await assertNoNegotiation(connection, Number(character.id));
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
  await assertNoNegotiation(connection, Number(character.id));
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
  await achievementEquipment(connection, Number(character.id), Number(item.item_id));
  return item;
});

export const skillList = async (qqUserId: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  // 解构师与唯薇安好感达到 500 后直接领悟人物技能；它走普通技能快捷栏，不进入异械栏。
  await pool.execute(`INSERT IGNORE INTO player_skills (character_id,skill_id)
    SELECT c.id,s.id FROM characters c JOIN player_npc_affinity a ON a.character_id=c.id AND a.npc_code='oddworkshop' AND a.affinity>=500
    JOIN skill_definitions s ON s.code='machine_echo' WHERE c.id=? AND c.secondary_profession_code='deconstructor'`, [character.id]);
  const [skills] = await pool.execute<(RowDataPacket & { id: number; code: string; name: string; category: string; tier: string; level: number; quick_slot: number | null; passive_linked: number; learned_at: Date })[]>('SELECT s.id,s.code,s.name,s.category,s.tier,ps.level,ps.quick_slot,ps.passive_linked,ps.learned_at FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? ORDER BY ps.learned_at,s.id', [character.id]);
  const [discoveries] = await pool.execute<(RowDataPacket & { id: number; name: string; category: string; tier: string; learn_cost: number })[]>(`SELECT s.id,s.name,s.category,s.tier,s.learn_cost FROM player_skill_discoveries d JOIN skill_definitions s ON s.id=d.skill_id
    LEFT JOIN player_skills ps ON ps.character_id=d.character_id AND ps.skill_id=d.skill_id WHERE d.character_id=? AND ps.skill_id IS NULL ORDER BY d.discovered_at,s.id`, [character.id]);
  return { skillPoints: Number(character.skill_points), passiveLinkLimit: Math.max(2, Number(character.realm_stage ?? 1) + 1), isOmniscient: character.secondary_profession_code === 'omniscient', skills, discoveries };
};

/** 初始可协同两个被动；每次突破境界（realm_stage +1）额外获得一个槽位。 */
export const togglePassiveLink = async (qqUserId: string, skillId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [skills] = await connection.execute<(RowDataPacket & { code: string; name: string; category: string; passive_linked: number })[]>(`SELECT s.code,s.name,s.category,ps.passive_linked
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
  const resident = residentSkillByCode(skill.code);
  if (resident) {
    const [sameFamily] = await connection.execute<RowDataPacket[]>("SELECT s.name FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.passive_linked=1 AND s.code LIKE ? LIMIT 1", [character.id, `resident_${resident.id[0].toLowerCase()}%`]);
    if (sameFamily[0]) throw new Error(`同一流派最多链接一个域民被动，请先卸下「${sameFamily[0].name}」。`);
  }
  await connection.execute('UPDATE player_skills SET passive_linked=1 WHERE character_id=? AND skill_id=?', [character.id, skillId]);
  return { name: skill.name, linked: true, limit };
});

export const skillDetail = async (qqUserId: string, skillId: number) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { id: number; code: string; name: string; category: string; tier: '基础' | '下位' | '中位' | '上位' | '超位'; damage_type: string; skill_kind: string; element: string; range_type: string; target_scope: string; required_weapon_type: string | null; mana_cost: number; cooldown_turns: number; chant_turns: number; power: number; learn_cost: number; upgrade_cost: number; max_level: number; power_per_level: number; cooldown_reduction_per_level: number; level: number; learned: number; description: string })[]>(`SELECT s.*,COALESCE(ps.level,0) AS level,(ps.skill_id IS NOT NULL) AS learned
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
  const specialized = skillSpecialization(skill, specializations);
  // 主动技能的综合等级由四项专精共同累积，仅用于等级展示；费用由所选方向等级决定。
  // 实际数值只应由所选专精改变，否则升级“瞬息”也会被通用等级威力成长反向抬高。
  const actualPower = Math.floor(specialized.power);
  const actualManaCost = specialized.mana;
  const actualCooldown = specialized.cooldown;
  const actualChant = specialized.chant;
  const weaponMastery = weaponMasteryCodes.has(skill.code);
  const specializationMaxLevel = specializationMaximum(skill.tier);
  const passiveSpecializable = ['passive', 'bound'].includes(skill.category) && canSpecializePassive(skill.code, jsonObject(skill.passive_effect_json));
  const passiveFactor = passiveSpecializationFactor(specializations.potent ?? 1, skill.tier);
  const specializationChoices = specializationOptions(skill, effectRows.some(effect => specializeEffectValue(effect.code, Number(effect.value), 1.25) !== Number(effect.value) || specializeEffectDuration(effect.code, Number(effect.duration), 1) !== Number(effect.duration) || effect.effect_type === 'control' && specializeControlChance(Number(effect.value), 1.15) !== Number(effect.value)));
  const displaySkillMaxLevel = weaponMastery || skill.code === 'appraisal' ? skill.max_level : ['passive', 'bound'].includes(skill.category) ? passiveSpecializable ? specializationMaxLevel : 1 : 1 + specializationChoices.length * (specializationMaxLevel - 1);
  const specializationUpgradeCosts = Object.fromEntries(specializationChoices.map(key => [key, learned && Number(specializations[key] ?? 1) < specializationMaxLevel ? specializationUpgradeCost(specializations[key] ?? 1) : null])) as Partial<Record<keyof SkillSpecializations, number | null>>;
  for (const effect of effectRows) {
    effect.value = effect.effect_type === 'control' ? specializeControlChance(Number(effect.value), specialized.controlChanceFactor) : specializeEffectValue(effect.code, Number(effect.value), specialized.effectFactor);
    effect.duration = specializeEffectDuration(effect.code, Number(effect.duration), specialized.durationChange);
  }
  return { ...skill, level, learned, characterLevel: Number(character.level), skillPoints: Number(character.skill_points), appraisal: progress, specializations, max_level: displaySkillMaxLevel, effectDetails: effectRows, specializationChoices, specializationUpgradeCosts, passiveSpecializable, passiveFactor, specializationResult: specialized, weaponMastery, actualPower, actualManaCost, actualCooldown, actualChant, specializationMaxLevel, masteryProficiencyCost: weaponMastery && Number(specializations.overcharge ?? 1) < 5 ? masteryUpgradeCost(Number(specializations.overcharge ?? 1)) : null, masteryFocusCost: weaponMastery && Number(specializations.instant ?? 1) < 6 ? masteryUpgradeCost(Number(specializations.instant ?? 1)) : null, specializationUpgradeCost: learned && passiveSpecializable ? activeSkillUpgradeCost(level) : null, nextUpgradeCost: skill.code === 'appraisal' || skill.category === 'bound' ? null : !learned || level >= Number(skill.max_level) ? null : activeSkillUpgradeCost(level) };
};

export const learnSkill = async (qqUserId: string, skillId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [skills] = await connection.execute<(RowDataPacket & { name: string; code: string; learn_cost: number })[]>(`SELECT s.name,s.code,s.learn_cost FROM player_skill_discoveries d JOIN skill_definitions s ON s.id=d.skill_id
    LEFT JOIN player_skills ps ON ps.character_id=d.character_id AND ps.skill_id=d.skill_id WHERE d.character_id=? AND d.skill_id=? AND ps.skill_id IS NULL FOR UPDATE`, [character.id, skillId]);
  const skill = skills[0]; if (!skill) throw new Error('该技能尚未领悟，或已经学习。');
  if (talentByCode.has(skill.code)) throw new Error('天赋随人物选择直接绑定，无需学习或消耗SP。');
  if (skill.code === 'appraisal') throw new Error('鉴识是降临时由女神授予的绑定能力，无需学习。请在已学习技能中查看，并选择慧眼或识珠自行升级。');
  if (Number(character.skill_points) < Number(skill.learn_cost)) throw new Error(`技能点不足，学习「${skill.name}」需要 ${skill.learn_cost} 点。`);
  await connection.execute('UPDATE characters SET skill_points=skill_points-? WHERE id=?', [skill.learn_cost, character.id]);
  await recordSkillPointChange(connection, character.id, -Number(skill.learn_cost), 'learn_skill', skillId, `学习技能「${skill.name}」`);
  await connection.execute('INSERT INTO player_skills (character_id,skill_id) VALUES (?,?)', [character.id, skillId]);
  if (skill.code !== 'appraisal') await connection.execute(`INSERT IGNORE INTO player_skill_specializations (character_id,skill_id,specialization) VALUES (?,?,'overcharge'),(?,?,'instant'),(?,?,'efficient'),(?,?,'potent')`, [character.id, skillId, character.id, skillId, character.id, skillId, character.id, skillId]);
  if (skill.code === 'appraisal') await connection.execute('INSERT IGNORE INTO player_appraisal_progress (character_id) VALUES (?)', [character.id]);
  await achievementBookLearned(connection,Number(character.id),skillId);
  return { name: skill.name, cost: Number(skill.learn_cost) };
});

export const toggleSkillShortcut = async (qqUserId: string, skillId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  await assertCombatLoadoutMutable(connection, Number(character.id));
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
  const skill = skills[0]; if (!skill) throw new Error('尚未学习该技能。');
  if (talentByCode.has(skill.code)) throw new Error('天赋为人物固定绑定能力，不升级、不消耗SP。');
  if (Number(skill.level) >= Number(skill.max_level)) throw new Error('该技能已达到最高等级。');
  if (isAdvancedProfessionSkillCode(skill.code)) throw new Error('二转技能为固定等级，无法升级。');
  if (residentSkillByCode(skill.code)) throw new Error('域民规则技能为固定等级，不能升级。');
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
  const [skills] = await connection.execute<(RowDataPacket & { code: string; name: string; category: string; tier: string; level: number; max_level: number })[]>('SELECT s.code,s.name,s.category,s.tier,s.power,s.mana_cost,s.cooldown_turns,s.chant_turns,s.passive_effect_json,ps.level,s.max_level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=? FOR UPDATE', [character.id, skillId]);
  const skill = skills[0]; const weaponMastery = Boolean(skill && weaponMasteryCodes.has(skill.code));
  if (!skill) throw new Error('只能专精已学习的技能。');
  if (talentByCode.has(skill.code)) throw new Error('天赋为人物固定绑定能力，没有专精，不消耗SP。');
  if (['passive', 'bound'].includes(skill.category) && !weaponMastery && (specialization !== 'potent' || !canSpecializePassive(skill.code, jsonObject(skill.passive_effect_json)))) throw new Error('此被动没有可成长的数值效果；机制、次数与资源返还保持固定。');
  if (weaponMastery && !['overcharge', 'instant'].includes(specialization)) throw new Error('装备精通仅开放娴熟和随心。');
  const [battles] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state='active' UNION ALL SELECT 1 FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?) LIMIT 1`, [character.id, character.id, character.id]);
  if (battles.length) throw new Error('请在战斗结束后调整专精，吟唱与战斗内数值不会中途改变。');
  if (!weaponMastery && !['passive', 'bound'].includes(skill.category)) {
    const [effects] = await connection.execute<RowDataPacket[]>('SELECT e.code,e.effect_type,COALESCE(se.value_override,e.default_value) AS value,COALESCE(se.duration_override,e.default_duration) AS duration FROM skill_effects se JOIN effect_definitions e ON e.id=se.effect_id WHERE se.skill_id=?', [skillId]);
    const choices = specializationOptions({ code: skill.code, category: skill.category, tier: skill.tier, power: Number(skill.power), mana_cost: Number(skill.mana_cost), cooldown_turns: Number(skill.cooldown_turns), chant_turns: Number(skill.chant_turns) }, effects.some(effect => specializeEffectValue(String(effect.code), Number(effect.value), 1.25) !== Number(effect.value) || specializeEffectDuration(String(effect.code), Number(effect.duration), 1) !== Number(effect.duration) || effect.effect_type === 'control' && specializeControlChance(Number(effect.value), 1.15) !== Number(effect.value)));
    if (!choices.includes(specialization)) throw new Error('此技能没有该专精的有效成长项，不能消耗技能点升级。');
  }
  if (skill.code === 'resident_d01' && specialization !== 'instant') throw new Error('魔力转赠的支付与转移量固定，仅开放瞬息专精。');
  await connection.execute('INSERT IGNORE INTO player_skill_specializations (character_id,skill_id,specialization) VALUES (?,?,?)', [character.id, skillId, specialization]);
  const [rows] = await connection.execute<(RowDataPacket & { level: number })[]>('SELECT level FROM player_skill_specializations WHERE character_id=? AND skill_id=? AND specialization=? FOR UPDATE', [character.id, skillId, specialization]);
  const level = Number(rows[0].level); const maximum = weaponMastery ? specialization === 'overcharge' ? 5 : 6 : specializationMaximum(skill.tier); if (level >= maximum) throw new Error('该专精已达到最高等级。');
  const cost = weaponMastery ? masteryUpgradeCost(level) : ['passive', 'bound'].includes(skill.category) ? activeSkillUpgradeCost(Number(skill.level)) : specializationUpgradeCost(level); if (Number(character.skill_points) < cost) throw new Error(`技能点不足，升级需要 ${cost} 点。`);
  await connection.execute('UPDATE characters SET skill_points=skill_points-? WHERE id=?', [cost, character.id]);
  await recordSkillPointChange(connection, character.id, -cost, 'upgrade_specialization', skillId, `升级「${skill.name}」${specialization}`);
  await connection.execute('UPDATE player_skill_specializations SET level=level+1 WHERE character_id=? AND skill_id=? AND specialization=?', [character.id, skillId, specialization]);
  await connection.execute('UPDATE player_skills SET level=level+1 WHERE character_id=? AND skill_id=?', [character.id, skillId]);
  if (weaponMastery) await recalculateCharacterStats(connection, Number(character.id));
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
  const [spawnRows] = await pool.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL AND ${visiblePursuitCondition('s')}`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id, character.id, character.id, character.id, character.id]);
  const canViewMonsterInfo = await hasPassiveSkill(pool, character.id, 'appraisal');
  const spawns = materializeMonsters(spawnRows, false);
  if (!spawns.length) return { character, spawns, text: '四周只有风吹树叶的声音。这里暂时没有敌对生物。' };
  if (isCityPursuit(spawns[0])) return { character, spawns, text: '城镇执法者已锁定你的行踪，拒绝任何形式的交涉。', canViewMonsterInfo };
  const perception = finalAttribute(character, 'perception');
  const negotiation = Math.floor(finalAttribute(character, 'spirit') + finalAttribute(character, 'intelligence') + perception / 2);
  const text = canViewMonsterInfo ? `你发现 ${spawns.map(s => `#${s.id} ${s.name} Lv.${s.level}`).join('、')}。\n\n感知 ${perception.toFixed(1)}｜负重后速度 ${character.speed}｜交涉值 ${negotiation}\n感知与速度高于敌人时可偷袭；感知较高可尝试躲避；交涉成功率按双方交涉值对抗结算。` : '你察觉到附近有未知的敌对存在，却无法辨明它们的任何信息。';
  return { character, spawns, text, canViewMonsterInfo };
};

export type CoordinateInteractionTarget = { type: '玩家' | '域民' | 'NPC' | '建筑' | '资源' | '入口' | '地标'; id: string; name: string; code?: string; description: string; gameId?: number; interactionKind?: 'npc' | 'building'; resourceKind?: '矿脉' | '植被'; isFriend?: boolean; };
export type NearbyPoint = { type: '怪物' | '域民' | '建筑' | '地标' | '悬赏' | '矿脉' | '植被' | '地下入口' | '玩家'; name: string; x: number; y: number; distance: number; code?: string; interaction?: Pick<CoordinateInteractionTarget, 'type' | 'id'>; pvpAvailable?: boolean; wanted?: boolean; isTrialTarget?: boolean };
export type MapLandmark = { code?: string; name: string; x: number; y: number; siteType?: string | null; kind?: 'landmark' | 'bounty' };

/** 常驻域民在自己的站点内不属于野外感知目标；只有离开驻点巡游时才会显示。 */
const withoutHomeStationResidents = <T extends { code: string; x: number; y: number; interaction_kind: 'npc' | 'building' }>(rows: T[]) => {
  const buildingsAt = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.interaction_kind !== 'building') continue;
    const position = `${row.x}:${row.y}`;
    const codes = buildingsAt.get(position) ?? new Set<string>();
    codes.add(row.code); buildingsAt.set(position, codes);
  }
  return rows.filter(row => {
    if (row.interaction_kind !== 'npc') return true;
    const homeSiteCode = dynamicNpcProfile(row.code)?.homeSiteCode;
    return !homeSiteCode || !buildingsAt.get(`${row.x}:${row.y}`)?.has(homeSiteCode);
  });
};

const perceptionRange = (perception: number, level: number) => explorationScale(perception, level);
const mapCodeByRegion: Record<string, string | undefined> = {
  '百纳镇': 'map_baina_town',
  '世界树': 'map_world_tree',
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

/** 演化研究室只会向已完成进化主线、且建立过演化档案的角色显现。 */
const evolutionLabUnlockedFor = async (connection: Pool | PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_evolution_profiles ep
    JOIN player_main_quest_progress q ON q.character_id=ep.character_id AND q.quest_code='evolution_barrier' AND q.stage>=8
    WHERE ep.character_id=? LIMIT 1`, [characterId]);
  return Boolean(rows[0]);
};

export const nearbyPoints = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  // 地下迷宫的黑暗会压制感知，避免高感知直接看穿岔路与遭遇。
  const perceptionObscured = character.region_name === '地下迷宫';
  const range = perceptionObscured ? 1 : perceptionRange(finalAttribute(character, 'perception'), Number(character.level));
  const pool = await getPool();
  const evolutionLabUnlocked = await evolutionLabUnlockedFor(pool, Number(character.id));
  await refreshBounties(pool);
  const bounds = [character.current_region_id, Number(character.pos_x) - range, Number(character.pos_x) + range, Number(character.pos_y) - range, Number(character.pos_y) + range, character.pos_z];
  const [monsters] = await pool.execute<(RowDataPacket & { id: number; template_code: string; name: string; x: number; y: number; traits_json: unknown })[]>(`SELECT s.id,t.code AS template_code,t.name,s.pos_x AS x,s.pos_y AS y,s.traits_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x BETWEEN ? AND ? AND s.pos_y BETWEEN ? AND ? AND s.pos_z=? AND s.defeated_at IS NULL
    AND ${visiblePursuitCondition('s')}`, [...bounds, character.id, character.id, character.id, character.id, character.id]);
  const [npcs] = await pool.execute<(RowDataPacket & { code: string; name: string; x: number; y: number; interaction_kind: 'npc' | 'building' })[]>(`SELECT m.code,m.name,m.interaction_kind,m.pos_x AS x,m.pos_y AS y FROM map_npcs m WHERE m.region_id=? AND m.pos_x BETWEEN ? AND ? AND m.pos_y BETWEEN ? AND ? AND m.pos_z=?`, bounds);
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
  const stationFilteredNpcs = withoutHomeStationResidents(npcs);
  const visibleNpcs = evolutionLabUnlocked ? stationFilteredNpcs : stationFilteredNpcs.filter(item => item.code !== 'evolution_lab');
  const points = [...monsters.map(item => {
    const isTrialTarget = item.template_code === 'scholar_ga' || traitList(item.traits_json).some(trait => trait.code === 'domain_resident');
    return { ...point(isTrialTarget ? '域民' : '怪物', { ...item, code: String(item.id) }), isTrialTarget };
  }), ...resources.map(item => point(resourceKindByCode(item.code), { ...item, interaction: { type: '资源', id: String(item.id) } })), ...visibleNpcs.map(item => point(item.interaction_kind === 'building' ? '建筑' : '域民', { ...item, interaction: { type: item.interaction_kind === 'building' ? '建筑' : '域民', id: item.code } })), ...objects.map(item => point('地标', { ...item, interaction: { type: '地标', id: item.code } })), ...dungeonEntrances.map(item => point('地下入口', { ...item, name: '地下迷宫入口', code: String(item.id), interaction: { type: '入口', id: String(item.id) } })), ...nearbyPlayers.map(item => ({ ...point('玩家', { ...item, name: item.wanted ? `【红名】${item.name}` : item.name, code: String(item.gameId), interaction: { type: '玩家', id: String(item.gameId) } }), wanted: item.wanted, pvpAvailable: !item.isFriend, inHome: item.inHome }))]
    .filter(item => item.distance <= range)
    .sort((a, b) => a.type === '玩家' && b.type === '玩家' ? Number(Boolean(b.wanted)) - Number(Boolean(a.wanted)) || a.distance - b.distance || a.name.localeCompare(b.name, 'zh-CN') : a.distance - b.distance || a.name.localeCompare(b.name, 'zh-CN'));
  const mapUnlocked = await hasRegionMap(pool, Number(character.id), character.region_name);
  // 地图只展示可进入的建筑；NPC、资源和特殊物体仍由近距离感知与坐标互动承载。
  const [landmarks] = mapUnlocked ? await pool.execute<(RowDataPacket & MapLandmark)[]>(`SELECT n.code,n.name,n.pos_x AS x,n.pos_y AS y,s.site_type AS siteType
    FROM map_npcs n LEFT JOIN world_site_states s ON s.code=n.code AND s.region_id=n.region_id
    WHERE n.region_id=? AND n.interaction_kind='building'`, [character.current_region_id]) : [[] as any];
  const [homes] = mapUnlocked ? await pool.execute<(RowDataPacket & MapLandmark)[]>(`SELECT 'player_home' AS code,CONCAT('我的小屋·',h.house_level,'级') AS name,h.plot_x AS x,h.plot_y AS y
    FROM player_homes h WHERE h.character_id=? AND h.town_region_id=? AND h.status='active' LIMIT 1`, [character.id, character.current_region_id]) : [[] as any];
  const visibleLandmarks = evolutionLabUnlocked ? landmarks : landmarks.filter(item => item.code !== 'evolution_lab');
  const mapMarkers = sortMapMarkers([...homes, ...visibleLandmarks]).map(item => ({ code: item.code, name: item.name, x: Number(item.x), y: Number(item.y), siteType: item.siteType, kind: 'landmark' as const }));
  const appraisal = await appraisalProfileFor(pool, [Number(character.id)]);
  return { character, range, perceptionObscured, points, landmarks: mapMarkers, mapUnlocked, npcDetailsUnlocked: appraisal.learned && appraisal.informationLevel >= 3, description: dungeonCell?.landmark_text ?? descriptions[0]?.description ?? '四周一片寂静，暂时没有发现异常。' };
};

export const requireNpcAtCurrentPosition = async (qqUserId: string, code: string) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  if (code === 'evolution_lab' && !await evolutionLabUnlockedFor(pool, Number(character.id))) throw new Error('这扇门尚未向你显现。');
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
  const character = await characterFor(qqUserId,connection);
  await connection.execute('SELECT id FROM characters WHERE id=? FOR UPDATE',[character.id]);
  const [npcs] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM map_npcs WHERE code=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1', [code, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (!npcs[0]) throw new Error('你已经离开该目标坐标，无法继续互动。');
  const originalReward=npcAffinityReward[interaction];
  const [prior]=await connection.execute<RowDataPacket[]>(`SELECT ${originalReward.column} AS count FROM player_npc_affinity WHERE character_id=? AND npc_code=? AND daily_date=CURDATE() FOR UPDATE`,[character.id,code]);
  const reward={...originalReward,amount:Number(prior[0]?.count??0)<3?await(await import('./talent-rewards')).talentNpcAffinity(connection,Number(character.id),code,originalReward.amount,interaction==='chat'?'chat':'other'):originalReward.amount};
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
  await achievementNpcState(connection,Number(character.id),code,Number(prior[0]?.count??0)<3);
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
  await achievementNpcState(connection,Number(character.id),code);
  return { affinity, rank: npcAffinityRank(affinity) };
});

export const npcDetail = async (qqUserId: string, code: string) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  const appraisal = await appraisalProfileFor(pool, [Number(character.id)]);
  if (!appraisal.learned || appraisal.informationLevel < 3) throw new Error('鉴识达到识珠 Lv.3 后，才能查看域民资料。');
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
    blacksmith: { name: '漠北', description: '镇民多叫他小北。这位 Lv.3 锻造师是九尾狐族与矮人的混血少年，经营着铁匠铺；炉火与铁锤是他最熟悉的伙伴。' },
    alchemy_sweetshop: { name: '晴儿', description: '糖水屋的炼金师。她擅长草药提纯与药剂调配，言谈温和，对生命与能量的变化格外敏锐。' },
    oddworkshop: { name: '唯薇安', description: '异工坊的店主，一位有半精灵血脉的解构师。她外表像十六七岁的少女，实际已在大陆上度过数十年，热衷于将一切未知事物拆开、理解，再拼出新的可能。' },
    hunter_lodge: { name: '雷恩·霍尔特', description: '驻扎在幽暗密林的神射手。约莫四十岁，金黄短发与长须间已有风霜；他嫉恶如仇，因地下迷宫中失去爱人，此后便日夜研究迷宫的秘密。' },
    bookshop: { name: '洛文·赫斯特', description: '百味书屋的店主。七十余岁的白须老人已难以看清细小文字，却仍每日研读厚重百科；他曾是王都大贤者，如今把多年搜集的知识留给前来求学的年轻人与冒险者。' }
  };
  const persona = personas[code]; const dynamicPersona = dynamicNpcProfile(code);
  return { name: persona?.name ?? dynamicPersona?.displayName ?? npc.name, description: persona?.description ?? dynamicPersona?.meeting ?? npc.description, x: Number(npc.x), y: Number(npc.y), affinity, rank: npcAffinityRank(affinity), daily: { chat: Number(npc.chat_count), buy: Number(npc.buy_count), sell: Number(npc.sell_count), craft: Number(npc.craft_count) } };
};

export const npcAffinity = async (qqUserId: string, code: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { affinity: number })[]>('SELECT affinity FROM player_npc_affinity WHERE character_id=? AND npc_code=?', [character.id, code]);
  return Number(rows[0]?.affinity ?? 0);
};

const warrantStars = (victims: number) => victims >= 15 ? 5 : victims >= 10 ? 4 : victims >= 6 ? 3 : victims >= 3 ? 2 : 1;
const visiblePursuitCondition = (alias = 's') => `(
  NOT JSON_CONTAINS(COALESCE(${alias}.traits_json,JSON_ARRAY()),JSON_OBJECT('code','npc_sparring'))
  AND (NOT JSON_CONTAINS(COALESCE(${alias}.traits_json,JSON_ARRAY()),JSON_OBJECT('code','city_pursuit'))
    OR JSON_CONTAINS(COALESCE(${alias}.traits_json,JSON_ARRAY()),JSON_OBJECT('code','city_pursuit','pursuit_target_id',?)))
  AND (NOT JSON_CONTAINS(COALESCE(${alias}.traits_json,JSON_ARRAY()),JSON_OBJECT('code','boss_test'))
    OR EXISTS (SELECT 1 FROM boss_test_sessions tests JOIN boss_test_participants participants ON participants.session_id=tests.id
      WHERE tests.state='active' AND participants.character_id=?
        AND JSON_CONTAINS(COALESCE(${alias}.traits_json,JSON_ARRAY()),JSON_OBJECT('code','boss_test','session_id',tests.id))))
  AND (NOT JSON_CONTAINS(COALESCE(${alias}.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_goblin_king'))
    OR JSON_CONTAINS(COALESCE(${alias}.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_goblin_king','owner_character_id',?)))
  AND (NOT JSON_CONTAINS(COALESCE(${alias}.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_evolution'))
    OR JSON_CONTAINS(COALESCE(${alias}.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_evolution','owner_character_id',?)))
  AND (NOT JSON_CONTAINS(COALESCE(${alias}.traits_json,JSON_ARRAY()),JSON_OBJECT('code','advanced_profession_trial'))
    OR JSON_CONTAINS(COALESCE(${alias}.traits_json,JSON_ARRAY()),JSON_OBJECT('code','advanced_profession_trial','owner_character_id',?)))
)`;

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

/** 未开放的新区域只允许主人账号测试；队伍中混入普通玩家时也禁止整队进入。 */
const assertOwnerOnlyRegionAccess = async (connection: PoolConnection, qqUserId: string, ownerOnly: boolean, enabled: boolean, partyId?: number) => {
  if (enabled && !ownerOnly) return;
  if (!partyId) {
    const [owners] = await connection.execute<RowDataPacket[]>("SELECT 1 FROM game_permissions WHERE qq_user_id=? AND role='owner' LIMIT 1", [qqUserId]);
    if (!owners[0]) throw new Error(enabled ? '该区域尚未对普通玩家开放。' : '该地图当前未开放。');
    return;
  }
  const [rows] = await connection.execute<(RowDataPacket & { total: number; owners: number })[]>(`SELECT COUNT(*) AS total,SUM(gp.role='owner') AS owners
    FROM party_members pm JOIN characters c ON c.id=pm.character_id JOIN players p ON p.id=c.player_id
    LEFT JOIN game_permissions gp ON gp.qq_user_id=p.qq_user_id
    WHERE pm.party_id=?`, [partyId]);
  if (!rows[0] || Number(rows[0].total) !== Number(rows[0].owners)) throw new Error(enabled ? '该区域尚未对普通玩家开放，队伍中所有成员都必须拥有主人权限。' : '该地图当前未开放，队伍中所有成员都必须拥有主人权限。');
};

const moveToPosition = async (connection: PoolConnection, qqUserId: string, x: number, y: number, restrictToPerception: boolean, speedLimit?: number, destinationRegionId?: number, allowRestingArrival = false) => {
  const character = await characterFor(qqUserId);
  if (await isInHome(connection, Number(character.id))) throw new Error('你正在自己的家园中，请先使用“/家园 出门”。');
  await ensureForestGuideFreeAction(connection, Number(character.id));
  await repairInvalidCombatFor(connection, Number(character.id));
  const [travels] = await connection.execute<(RowDataPacket & { activity_type: 'move' | 'hunt' })[]>('SELECT activity_type FROM player_travels WHERE character_id=? FOR UPDATE', [character.id]);
  if (travels[0]) throw new Error(travels[0].activity_type === 'hunt' ? '你正在寻怪，请等待完成或取消寻怪。' : '你正在前往目标地点，请等待抵达或取消移动。');
  const [mining] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_resource_mining WHERE character_id=? LIMIT 1 FOR UPDATE', [character.id]);
  if (mining[0]) throw new Error('你正在开采资源，请先完成或取消开采。');
  // 已经创建的延时行程必须能结算；兼容旧状态中“行程中点击休息”留下的 resting，
  // 仅在抵达结算入口放行该状态，昏迷、拘押等其他不可行动状态仍照常拦截。
  if (!allowRestingArrival || character.activity_status !== 'resting') ensureActionAvailable(character);
  const [activeCombat] = await connection.execute<RowDataPacket[]>(`SELECT cs.id FROM combat_sessions cs LEFT JOIN combat_members cm ON cm.session_id=cs.id
    WHERE cs.state='active' AND (cs.character_id=? OR cm.character_id=?) LIMIT 1 FOR UPDATE`, [character.id, character.id]);
  if (activeCombat.length) throw new Error('战斗尚未结束，无法移动。');
  const [encounters] = await connection.execute<RowDataPacket[]>(`SELECT id FROM monster_spawns s WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL AND ${visiblePursuitCondition('s')} LIMIT 1 FOR UPDATE`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id, character.id, character.id, character.id, character.id]);
  const [escapeTokens] = await connection.execute<RowDataPacket[]>('SELECT character_id FROM encounter_escape_tokens WHERE character_id=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? FOR UPDATE', [character.id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (encounters[0] && !escapeTokens[0]) throw new Error('当前格子存在敌对生物，请先选择战斗、交涉或躲避。');
  // 躲避后若只是点击当前位置（例如怪物与地下入口意外重叠），保留本次脱离资格，
  // 让该坐标的入口事件能够正常展示；真正离开该格时再消耗令牌。
  const stayingOnEscapedEncounter = Boolean(escapeTokens[0]) && x === Number(character.pos_x) && y === Number(character.pos_y);
  if (escapeTokens[0] && !stayingOnEscapedEncounter) await connection.execute('DELETE FROM encounter_escape_tokens WHERE character_id=?', [character.id]);
  const [partyRows] = await connection.execute<(RowDataPacket & { party_id: number; leader_character_id: number })[]>('SELECT pm.party_id,p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=?', [character.id]);
  if (partyRows[0] && Number(partyRows[0].leader_character_id) !== character.id) throw new Error('组队状态下仅队长可以移动。');
  const distance = Math.abs(x - Number(character.pos_x)) + Math.abs(y - Number(character.pos_y));
  const perceptionLimit = character.region_name === '地下迷宫' ? 1 : perceptionRange(finalAttribute(character, 'perception'), Number(character.level));
  if (restrictToPerception && distance > perceptionLimit) throw new Error('该位置超出你的感知范围。');
  if (speedLimit !== undefined && distance > speedLimit) throw new Error(`当前移动速度为 ${speedLimit}，一次移动距离不能超过移动速度。`);
  const regionQuery = destinationRegionId === undefined
    ? 'SELECT r.id,r.code,r.name,r.is_owner_only,r.is_enabled,r.is_release_managed FROM map_regions r JOIN map_region_areas a ON a.region_id=r.id WHERE ? BETWEEN a.min_x AND a.max_x AND ? BETWEEN a.min_y AND a.max_y AND ? BETWEEN a.min_z AND a.max_z ORDER BY r.danger_level DESC LIMIT 1'
    : 'SELECT r.id,r.code,r.name,r.is_owner_only,r.is_enabled,r.is_release_managed FROM map_regions r JOIN map_region_areas a ON a.region_id=r.id WHERE r.id=? AND ? BETWEEN a.min_x AND a.max_x AND ? BETWEEN a.min_y AND a.max_y AND ? BETWEEN a.min_z AND a.max_z LIMIT 1';
  const regionParameters = destinationRegionId === undefined ? [x, y, character.pos_z] : [destinationRegionId, x, y, character.pos_z];
  const [regions] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; is_owner_only: number; is_enabled: number; is_release_managed: number })[]>(regionQuery, regionParameters);
  const region = regions[0]; if (!region) throw new Error('\n\n前面的区域，以后再来探索吧！');
  await assertOwnerOnlyRegionAccess(connection, qqUserId, Boolean(region.is_owner_only), Boolean(region.is_enabled), partyRows[0] ? Number(partyRows[0].party_id) : undefined);
  await (await import('./lamplight-access')).assertLamplightRegionAccess(connection, Number(character.id), region.code, partyRows[0] ? Number(partyRows[0].party_id) : undefined);
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
  await talentMovementArrived(connection,character,{x:arrivedX,y:arrivedY,z:arrivedZ,regionId:Number(arrived.current_region_id)},allowRestingArrival);
  // 远距离前往会一次抵达目标格；撤离点必须是目标格沿本次来路退一格，不能使用前往开始的坐标。
  const moveX = arrivedX - Number(character.pos_x); const moveY = arrivedY - Number(character.pos_y);
  const retreatX = arrivedX - (Math.abs(moveX) >= Math.abs(moveY) && moveX ? Math.sign(moveX) : 0);
  const retreatY = arrivedY - (Math.abs(moveY) > Math.abs(moveX) && moveY ? Math.sign(moveY) : 0);
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
  const moved = { ...pursuitCharacter, enteredTown: enteringTown, debtCollection };
  const achievementRegionNames=['世界树草原环带','晨露河岸','砾风石滩','幽暗密林深处','岩脊山麓','赤铁山道','雾藻湿地','沉星沼泽','霜冠高原','雷鸣断崖','月蚀遗迹'];
  const achievementRegionIndex=achievementRegionNames.indexOf(String(region.name));
  if(distance>0&&achievementRegionIndex>=0)recordAchievement(connection,Number(character.id),[{metric:'ACH_D'+String(achievementRegionIndex+4).padStart(2,'0')},{metric:'ACH_D19',distinct:String(region.id)},{metric:'ACH_D20',distinct:String(region.id)}]);
  const mainQuestStory = await goblinKingArrival(connection, Number(character.id), Number(region.id), region.code, arrivedX, arrivedY, arrivedZ);
  if (mainQuestStory) return { character: moved, kind: 'main_quest_story' as const, text: mainQuestStory.text, questClue: mainQuestStory.clue, questChapter: mainQuestStory.chapter };
  const [spawnRows] = await connection.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL AND ${visiblePursuitCondition('s')} FOR UPDATE`, [region.id, arrivedX, arrivedY, arrivedZ, character.id, character.id, character.id, character.id, character.id]);
  const appraisal = await appraisalProfileFor(connection, [character.id]);
  const spawns = materializeMonsters(spawnRows, appraisal.informationLevel >= 2);
  if (spawns.length && !stayingOnEscapedEncounter) {
    const members = await partyCombatants(connection, character);
    const fastestMonster = Math.max(...spawns.map(spawn => monsterCombatStats(spawn).speed));
    const [texts] = await connection.execute<(RowDataPacket & { description: string })[]>('SELECT description FROM monster_encounter_texts WHERE monster_template_id=? ORDER BY RAND() LIMIT 1', [Number(spawns[0]?.template_id ?? 0)]);
    const [occupied] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=? AND cs.state='active' LIMIT 1`, [spawns[0].id]);
    // 所有地图的遭遇都记录相邻来路格；躲避与战斗撤离均会退回这一格。
    for (const member of members) await connection.execute(`INSERT INTO dungeon_encounter_retreats
      (character_id,encounter_region_id,encounter_x,encounter_y,encounter_z,retreat_region_id,retreat_x,retreat_y,retreat_z)
      VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE encounter_region_id=VALUES(encounter_region_id),encounter_x=VALUES(encounter_x),encounter_y=VALUES(encounter_y),encounter_z=VALUES(encounter_z),retreat_region_id=VALUES(retreat_region_id),retreat_x=VALUES(retreat_x),retreat_y=VALUES(retreat_y),retreat_z=VALUES(retreat_z)`, [member.id, region.id, arrivedX, arrivedY, arrivedZ, region.id, retreatX, retreatY, arrivedZ]);
    const cityPursuit = isCityPursuit(spawns[0]);
    return { character: moved, kind: 'encounter' as const, spawns, occupied: Boolean(occupied[0]), cityPursuit, canAmbush: !cityPursuit && members.every(member => Number(member.speed) > fastestMonster), text: pursuit?.text ?? texts[0]?.description ?? `${spawns[0].name} 拦住了你的去路。` };
  }
  const coordinateTargets = await coordinateInteractionTargetsFor(connection, moved, region.code);
  // 同队成员已在坐标目标中排除；非队友玩家抵达必定弹出互动选择，其他目标仅在同格叠加时改为选择页。
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
  const[findRegion]=await connection.execute<RowDataPacket[]>('SELECT danger_level,is_owner_only,is_spawn_enabled FROM map_regions WHERE id=?',[region.id]);
  const find=distance>0&&Number(findRegion[0]?.danger_level)>0&&findRegion[0]?.is_spawn_enabled&&!findRegion[0]?.is_owner_only?await(await import('./companion.service')).companionFind(connection,Number(character.id)):'';
  return { character: moved, kind: 'event' as const, text: (texts[0]?.description ?? '四周一片寂静，暂时没有发现异常。')+find };
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
  const evolutionLabUnlocked = await evolutionLabUnlockedFor(connection, Number(character.id));
  const [resources, npcs, objects, players] = await Promise.all([
    connection.execute<(RowDataPacket & { id: number; code: string; name: string; description: string })[]>(`SELECT rs.id,i.code,i.name,i.description FROM resource_spawns rs JOIN item_definitions i ON i.id=rs.item_id WHERE rs.region_id=? AND rs.pos_x=? AND rs.pos_y=? AND rs.pos_z=? AND rs.mined_at IS NULL`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]),
    connection.execute<(RowDataPacket & { code: string; name: string; description: string; x: number; y: number; interaction_kind: 'npc' | 'building' })[]>(`SELECT m.code,m.name,m.description,m.pos_x AS x,m.pos_y AS y,m.interaction_kind FROM map_npcs m WHERE m.region_id=? AND m.pos_x=? AND m.pos_y=? AND m.pos_z=?`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]),
    connection.execute<(RowDataPacket & { code: string; name: string; description: string })[]>(`SELECT code,name,description FROM map_special_objects WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=?`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]),
    connection.execute<(RowDataPacket & { game_id: number; name: string; is_friend: number })[]>(`SELECT c.game_id,c.name,EXISTS(SELECT 1 FROM player_relationships r WHERE r.character_low_id=LEAST(?,c.id) AND r.character_high_id=GREATEST(?,c.id) AND r.status IN ('friend','oath')) AS is_friend FROM characters c LEFT JOIN player_home_visits hv ON hv.character_id=c.id
      WHERE c.current_region_id=? AND c.pos_x=? AND c.pos_y=? AND c.pos_z=? AND c.id<>? AND c.npc_code IS NULL
        AND NOT EXISTS(SELECT 1 FROM party_members self_member JOIN party_members teammate ON teammate.party_id=self_member.party_id WHERE self_member.character_id=? AND teammate.character_id=c.id)
        AND (hv.character_id IS NULL OR (?='baina_town' AND EXISTS(SELECT 1 FROM player_warrants w WHERE w.wanted_character_id=c.id AND w.city_region_id=? AND w.status='active')))`, [character.id, character.id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id, character.id, regionCode ?? '', character.current_region_id])
  ]);
  const targets: CoordinateInteractionTarget[] = [
    ...resources[0].map(row => ({ type: '资源' as const, id: String(row.id), name: row.name, code: row.code, description: row.description, resourceKind: resourceKindByCode(row.code) })),
    ...withoutHomeStationResidents(npcs[0]).filter(row => evolutionLabUnlocked || row.code !== 'evolution_lab').map(row => ({ type: row.interaction_kind === 'building' ? '建筑' as const : '域民' as const, id: row.code, name: row.name, code: row.code, description: row.description, interactionKind: row.interaction_kind })),
    ...objects[0].map(row => ({ type: '地标' as const, id: row.code, name: row.name, code: row.code, description: row.description })),
    ...players[0].map(row => ({ type: '玩家' as const, id: String(row.game_id), name: row.name, description: `你在这里遇见了【${row.name}】。`, gameId: Number(row.game_id), isFriend: Boolean(row.is_friend) }))
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
  // 兼容更新前已发出的 /坐标互动 NPC 指令；界面与新指令统一使用“域民”。
  const normalizedType = type === 'NPC' ? '域民' : type;
  const target = (await coordinateInteractionTargetsFor(connection, character, regions[0]?.code)).find(item => item.type === normalizedType && item.id === id);
  if (!target) throw new Error('该目标已离开当前位置。');
  if (target.type === '入口') {
    const entrance = await dungeonEntranceAt(connection, Number(character.current_region_id), Number(character.pos_x), Number(character.pos_y));
    if (!entrance || String(entrance.id) !== id) throw new Error('地下迷宫入口已消失。');
    const discovery = await discoverDungeonEntrance(connection, Number(character.id), entrance.id, Number(character.current_region_id), Number(character.pos_x), Number(character.pos_y));
    return { character, kind: 'dungeon_entrance' as const, entrance, discovery, text: entrance.description };
  }
  if (target.type === '资源') return { character, kind: 'resource' as const, resource: { id: Number(target.id), code: target.code!, name: target.name, description: target.description, kind: target.resourceKind! }, text: `你发现了一处${target.resourceKind}·${target.name}。${target.description}` };
  if (target.type === '域民' || target.type === '建筑') return { character, kind: 'npc' as const, npc: { code: target.code!, name: target.name, description: target.description, interaction_kind: target.interactionKind! }, text: target.description };
  return { character, kind: 'object' as const, text: target.type === '玩家' ? target.description : target.description };
});

export const moveTo = async (qqUserId: string, x: number, y: number, options: { destinationKind?: 'normal' | 'home'; destinationRegionId?: number } = {}) => {
  if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error('目标坐标必须为整数。');
  const carry = await inventory(qqUserId);
  return withTransaction(async connection => {
    const invalidCombatCharacter = await characterFor(qqUserId);
    await repairInvalidCombatFor(connection, Number(invalidCombatCharacter.id));
    const character = await characterFor(qqUserId); if (await isInHome(connection, Number(character.id))) throw new Error('你正在自己的家园中，请先使用“/家园 出门”。'); await ensureForestGuideFreeAction(connection, Number(character.id)); const distance = Math.abs(x - Number(character.pos_x)) + Math.abs(y - Number(character.pos_y));
    if (character.region_name === '地下迷宫') throw new Error('地下迷宫中无法直接前往远处，请使用上下左右移动探索路线。');
    const regionQuery = options.destinationRegionId === undefined
      ? 'SELECT r.id,r.code,r.name,r.is_owner_only,r.is_enabled,r.is_release_managed FROM map_regions r JOIN map_region_areas a ON a.region_id=r.id WHERE ? BETWEEN a.min_x AND a.max_x AND ? BETWEEN a.min_y AND a.max_y AND ? BETWEEN a.min_z AND a.max_z ORDER BY r.danger_level DESC LIMIT 1'
      : 'SELECT r.id,r.code,r.name,r.is_owner_only,r.is_enabled,r.is_release_managed FROM map_regions r JOIN map_region_areas a ON a.region_id=r.id WHERE r.id=? AND ? BETWEEN a.min_x AND a.max_x AND ? BETWEEN a.min_y AND a.max_y AND ? BETWEEN a.min_z AND a.max_z LIMIT 1';
    const regionParameters = options.destinationRegionId === undefined ? [x, y, character.pos_z] : [options.destinationRegionId, x, y, character.pos_z];
    const [regions] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; is_owner_only: number; is_enabled: number; is_release_managed: number })[]>(regionQuery, regionParameters); const region = regions[0];
    if (!region) throw new Error('前面的区域，以后再来探索吧！');
    const [partyRows] = await connection.execute<(RowDataPacket & { party_id: number })[]>('SELECT party_id FROM party_members WHERE character_id=? LIMIT 1', [character.id]);
    await assertOwnerOnlyRegionAccess(connection, qqUserId, Boolean(region.is_owner_only), Boolean(region.is_enabled), partyRows[0] ? Number(partyRows[0].party_id) : undefined);
  await (await import('./lamplight-access')).assertLamplightRegionAccess(connection, Number(character.id), region.code, partyRows[0] ? Number(partyRows[0].party_id) : undefined);
    const [ownerRows] = await connection.execute<RowDataPacket[]>("SELECT 1 FROM game_permissions WHERE qq_user_id=? AND role='owner' LIMIT 1", [qqUserId]);
    const isOwner = Boolean(ownerRows[0]);
    const sameRegion = Number(region.id) === Number(character.current_region_id);
    const targetMapUnlocked = await hasRegionMap(connection, Number(character.id), region.name);
    if (!sameRegion && !targetMapUnlocked && !Boolean(region.is_release_managed && region.is_enabled) && !(isOwner && Boolean(region.is_owner_only))) throw new Error('尚未解锁目标区域地图，无法前往。');
    // 是否持有当前区域地图不改变移动方式：短距离即时移动，远距离一律按距离创建计时行动。
    if (sameRegion && distance <= carry.movementSpeed) return moveToPosition(connection, qqUserId, x, y, true, carry.movementSpeed, options.destinationRegionId);
    ensureActionAvailable(character);
    const [mining] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_resource_mining WHERE character_id=? LIMIT 1 FOR UPDATE', [character.id]);
    if (mining[0]) throw new Error('你正在开采资源，请先完成或取消开采。');
    const [combat] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state=\'active\' LIMIT 1 FOR UPDATE', [character.id]);
    if (combat[0]) throw new Error('战斗尚未结束，无法移动。');
    const [encounters] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM monster_spawns s WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL AND ${visiblePursuitCondition('s')} LIMIT 1 FOR UPDATE`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id, character.id, character.id, character.id, character.id]);
    const [escapeTokens] = await connection.execute<RowDataPacket[]>('SELECT character_id FROM encounter_escape_tokens WHERE character_id=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? FOR UPDATE', [character.id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
    if (encounters[0] && !escapeTokens[0]) throw new Error('当前格子存在敌对生物，请先选择战斗、交涉或躲避。');
    // 远距离前往在抵达前不会更新角色坐标；躲避资格保留至到达结算，
    // 由 moveToPosition 在真正离开当前遭遇格时消耗。
    const [existing] = await connection.execute<(RowDataPacket & { activity_type: 'move' | 'hunt' })[]>('SELECT activity_type FROM player_travels WHERE character_id=? FOR UPDATE', [character.id]); if (existing[0]) throw new Error(existing[0].activity_type === 'hunt' ? '你正在寻怪，请等待完成或取消寻怪。' : '你正在前往目标地点，请等待抵达或取消移动。');
    const seconds = Math.max(1, Math.ceil(distance / carry.movementSpeed * await talentMovementFactor(connection,character,{x,y,z:Number(character.pos_z),regionId:Number(region.id)})));
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
    WHERE id=? AND region_id=? AND pos_z=? AND defeated_at IS NULL AND ${visiblePursuitCondition('s')} FOR UPDATE`, [spawnId, character.current_region_id, character.pos_z, character.id, character.id, character.id, character.id, character.id]);
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
  const [rows] = await pool.execute<(RowDataPacket & { code: string; region_id: number | null; name: string; min_x: number | null; max_x: number | null; min_y: number | null; max_y: number | null })[]>(`SELECT i.code,r.id AS region_id,r.name,r.min_x,r.max_x,r.min_y,r.max_y
    FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    LEFT JOIN map_regions r ON r.code=JSON_UNQUOTE(JSON_EXTRACT(i.effect_json, '$.map'))
    WHERE pi.character_id=? AND pi.quantity>0 AND i.item_category='地图' AND i.code=? LIMIT 1`, [character.id, mapCode]);
  const map = rows[0];
  if (!map) throw new Error('尚未拥有该地图。');
  if (map.region_id === null || map.min_x === null || map.max_x === null || map.min_y === null || map.max_y === null) throw new Error('该地图区域暂未开放。');
  if (Number(character.pos_z) !== 0) throw new Error('请先返回地表，再前往区域地图。');
  if (Number(map.region_id) === Number(character.current_region_id)) throw new Error(`你已经位于${map.name}。`);
  const [areas] = await pool.execute<(RowDataPacket & WorldArea)[]>('SELECT a.*,r.danger_level FROM map_region_areas a JOIN map_regions r ON r.id=a.region_id');
  // 真实地图由多个矩形拼合，外围包围盒可能落入别的区域；与移动结算采用同一覆盖优先级。
  const { x, y } = validWorldSitePoint(areas, Number(map.region_id), { x: Number(character.pos_x), y: Number(character.pos_y), z: 0 });
  return moveTo(qqUserId, x, y);
};
export const huntMonster = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId); if (await isInHome(connection, Number(character.id))) throw new Error('你正在自己的家园中，请先使用“/家园 出门”。'); await ensureForestGuideFreeAction(connection, Number(character.id)); ensureActionAvailable(character);
  await repairInvalidCombatFor(connection, Number(character.id));
  if (character.region_name === '地下迷宫') throw new Error('地下迷宫内无法寻怪，请沿通路自行探索。');
  const [travels] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_travels WHERE character_id=? FOR UPDATE', [character.id]);
  if (travels[0]) throw new Error('你正在进行移动或寻怪，请等待完成或取消当前行动。');
  const [mining] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_resource_mining WHERE character_id=? LIMIT 1 FOR UPDATE', [character.id]);
  if (mining[0]) throw new Error('你正在开采资源，请先完成或取消开采。');
  const [combat] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state=\'active\' LIMIT 1 FOR UPDATE', [character.id]);
  if (combat[0]) throw new Error('战斗尚未结束，无法寻怪。');
  const [encounter] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM monster_spawns s WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL AND ${visiblePursuitCondition('s')} LIMIT 1 FOR UPDATE`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id, character.id, character.id, character.id, character.id]);
  if (encounter[0]) throw new Error('当前格子存在敌对生物，请先选择战斗、交涉或躲避。');
  const [partyRows] = await connection.execute<(RowDataPacket & { leader_character_id: number })[]>('SELECT p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=?', [character.id]);
  if (partyRows[0] && Number(partyRows[0].leader_character_id) !== Number(character.id)) throw new Error('组队状态下仅队长可以寻怪。');
  const [recentRows] = await connection.execute<(RowDataPacket & { spawn_id: number })[]>('SELECT spawn_id FROM player_hunt_history WHERE character_id=? ORDER BY id DESC LIMIT 3 FOR UPDATE', [character.id]);
  const recentIds = recentRows.map(row => Number(row.spawn_id));
  const recentCondition = recentIds.length ? ` AND s.id NOT IN (${recentIds.map(() => '?').join(',')})` : '';
  const [targets] = await connection.execute<(RowDataPacket & { id: number; pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT s.id,s.pos_x,s.pos_y,s.pos_z FROM monster_spawns s
    WHERE s.region_id=? AND s.pos_z=? AND s.defeated_at IS NULL AND ${visiblePursuitCondition('s')}${recentCondition}
    ORDER BY ABS(s.pos_x-?)+ABS(s.pos_y-?),s.id LIMIT 1 FOR UPDATE`, [character.current_region_id, character.pos_z, character.id, character.id, character.id, character.id, character.id, ...recentIds, character.pos_x, character.pos_y]);
  if (!targets[0]) throw new Error('当前地图没有未寻过的怪物，请等待新的怪物刷新。');
  const target = targets[0]; if (!target) throw new Error('当前地图没有可寻找的怪物。');
  const x = Number(target.pos_x); const y = Number(target.pos_y); const z = Number(target.pos_z);
  const seconds = Math.max(1, Math.abs(x - Number(character.pos_x)) + Math.abs(y - Number(character.pos_y)));
  await connection.execute('INSERT INTO player_hunt_history (character_id,spawn_id) VALUES (?,?)', [character.id, target.id]);
  const [expiredRows] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM player_hunt_history WHERE character_id=? ORDER BY id DESC LIMIT 18446744073709551615 OFFSET 3 FOR UPDATE', [character.id]);
  if (expiredRows.length) await connection.execute(`DELETE FROM player_hunt_history WHERE id IN (${expiredRows.map(() => '?').join(',')})`, expiredRows.map(row => row.id));
  await connection.execute("INSERT INTO player_travels (character_id,region_id,target_x,target_y,target_z,target_spawn_id,activity_type,arrival_at) VALUES (?,?,?,?,?,?,'hunt',DATE_ADD(NOW(),INTERVAL ? SECOND))", [character.id, character.current_region_id, x, y, z, target.id, seconds]);
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
    const character = await characterFor(qqUserId); const [rows] = await connection.execute<(RowDataPacket & { region_id: number; target_x: number; target_y: number; target_z: number; target_spawn_id: number | null; activity_type: 'move' | 'hunt'; destination_kind: 'normal' | 'home'; arrived: number })[]>('SELECT region_id,target_x,target_y,target_z,target_spawn_id,activity_type,destination_kind,arrival_at<=NOW(6) AS arrived FROM player_travels WHERE character_id=? FOR UPDATE', [character.id]); const travel = rows[0]; if (!travel || !Number(travel.arrived)) return null;
    let targetX = Number(travel.target_x); let targetY = Number(travel.target_y);
    if (travel.activity_type === 'hunt' && travel.target_spawn_id !== null) {
      const [targets] = await connection.execute<(RowDataPacket & { pos_x: number; pos_y: number })[]>('SELECT pos_x,pos_y FROM monster_spawns WHERE id=? AND region_id=? AND defeated_at IS NULL FOR UPDATE', [travel.target_spawn_id, travel.region_id]);
      const target = targets[0];
      if (!target) {
        await connection.execute('DELETE FROM player_travels WHERE character_id=?', [character.id]);
        return { character, kind: 'hunt_target_lost' as const, text: '你赶到时，寻怪目标已经被击败或离开。寻怪行动结束。', arrivalActivity: travel.activity_type, destinationKind: travel.destination_kind };
      }
      targetX = Number(target.pos_x); targetY = Number(target.pos_y);
    }
    await connection.execute('DELETE FROM player_travels WHERE character_id=?', [character.id]);
    const result = await moveToPosition(connection, qqUserId, targetX, targetY, false, undefined, Number(travel.region_id), true);
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
  const [miningRows] = await connection.execute<(RowDataPacket & { resource_id: number; item_id: number; resource_region_id: number; code: string; name: string; item_category: string; finishes_at: Date })[]>(`SELECT m.resource_id,rs.item_id,rs.region_id AS resource_region_id,i.code,i.name,i.item_category,m.finishes_at FROM player_resource_mining m
    JOIN resource_spawns rs ON rs.id=m.resource_id JOIN item_definitions i ON i.id=rs.item_id WHERE m.character_id=? FOR UPDATE`, [character.id]);
  const mining = miningRows[0];
  if (mining) {
    if (Number(mining.resource_id) !== resourceId) throw new Error('你正在开采另一处资源，请先完成或取消开采。');
    const remaining = Math.max(0, Math.ceil((new Date(mining.finishes_at).getTime() - Date.now()) / 1000));
    if (remaining > 0) return { state: 'mining' as const, name: mining.name, kind: resourceKindByCode(mining.code), seconds: 0, remaining };
    const [result] = await connection.execute<any>('UPDATE resource_spawns SET mined_at=NOW() WHERE id=? AND mined_at IS NULL', [mining.resource_id]);
    if (!Number(result.affectedRows)) throw new Error('这处资源已经被开采。');
    const baseQuantity = await resourceYield(connection, Number(mining.item_id), mining.code);
    const quantity = await talentGatherReward(connection,character,Number(mining.item_id),baseQuantity,resourceKindByCode(mining.code));
    await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [character.id, mining.item_id, quantity]);
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [character.id, mining.item_id]);
    await connection.execute('DELETE FROM player_resource_mining WHERE character_id=?', [character.id]);
    await advanceEvolutionObservationMining(connection, Number(character.id));
    if(quantity>0){await achievementGatherSurprises(connection,Number(character.id),Number(mining.resource_id),Number(mining.item_id),Number(mining.resource_region_id));recordAchievement(connection,Number(character.id),[{metric:'ACH_EGG12',distinct:String(mining.resource_id)},{metric:'ACH_END05',distinct:String(mining.resource_id)},{metric:'ACH_H01'},{metric:'ACH_H02'},{metric:'ACH_H03'},{metric:'ACH_H06',distinct:String(mining.resource_region_id)}, ...(resourceKindByCode(mining.code)==='植被'?[{metric:'ACH_H04',distinct:String(mining.item_id)}]:['锻材','矿石'].includes(mining.item_category)?[{metric:'ACH_H05',distinct:String(mining.item_id)}]:[])], 'gather:'+mining.resource_id);await achievementItem(connection,Number(character.id),Number(mining.item_id));achievementActivity(connection,Number(character.id));}
    return { state: 'completed' as const, name: mining.name, kind: resourceKindByCode(mining.code), quantity };
  }
  const [resources] = await connection.execute<(RowDataPacket & { id: number; item_id: number; code: string; name: string })[]>(`SELECT rs.id,rs.item_id,i.code,i.name FROM resource_spawns rs JOIN item_definitions i ON i.id=rs.item_id
    WHERE rs.id=? AND rs.region_id=? AND rs.pos_x=? AND rs.pos_y=? AND rs.pos_z=? AND rs.mined_at IS NULL FOR UPDATE`, [resourceId, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  const resource = resources[0]; if (!resource) throw new Error('这处资源已经被开采，或你已离开资源点。');
  const [otherMiners] = await connection.execute<RowDataPacket[]>('SELECT character_id FROM player_resource_mining WHERE resource_id=? FOR UPDATE', [resource.id]);
  if (otherMiners[0]) throw new Error('这处资源正在被其他冒险者开采。');
  const [monsters] = await connection.execute<RowDataPacket[]>('SELECT id FROM monster_spawns WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL LIMIT 1 FOR UPDATE', [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (monsters[0]) throw new Error('资源旁仍有敌对生物，先结束战斗才能开采。');
  const seconds = miningSecondsByCode[resource.code] ?? 30 * 60;
  await talentBeginGather(connection,character,Number(resource.id));
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
  await connection.execute('INSERT INTO party_members (party_id,character_id) VALUES (?,?)', [partyId, character.id]); recordAchievement(connection,Number(character.id),['ACH_G01']);
  for (const companion of companions) {
    await recalculateCharacterStats(connection, Number(companion.id));
    await connection.execute('INSERT INTO party_members (party_id,character_id) VALUES (?,?)', [partyId, companion.id]); recordAchievement(connection,Number(character.id),['ACH_G01']);
    await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=?,current_hp=hp_max,current_mp=mp_max,activity_status=\'active\' WHERE id=?', [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, companion.id]);
  }
  const [templateRows] = await connection.execute<SpawnRow[]>('SELECT t.id AS template_id,t.code AS growth_template_code,t.name,t.monster_class,t.level,t.constitution,t.spirit,t.strength,t.intelligence,t.agility,t.perception,t.constitution_growth,t.spirit_growth,t.strength_growth,t.intelligence_growth,t.agility_growth,t.perception_growth,t.skill_sequence FROM monster_templates t WHERE t.code=\'forest_slime\' FOR UPDATE');
  const template = templateRows[0]; if (!template) throw new Error('森林史莱姆的数据尚未准备好。');
  const weakenedTraits = [{ code: 'weakened', name: '虚弱的', statMultiplier: .5 }]; const baseAttributes = randomMonsterBaseAttributes(template); const hp = monsterCombatStats({ ...template, ...baseAttributes, traits_json: weakenedTraits }).hpMax;
  const [existing] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM monster_spawns WHERE template_id=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL LIMIT 1 FOR UPDATE', [Number(template.template_id), Number(character.current_region_id), Number(character.pos_x), Number(character.pos_y), Number(character.pos_z)]);
  let spawnId = Number(existing[0]?.id);
  if (!spawnId) {
    const [result] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [Number(template.template_id), Number(character.current_region_id), Number(character.pos_x), Number(character.pos_y), Number(character.pos_z), template.level, baseAttributes.constitution, baseAttributes.spirit, baseAttributes.strength, baseAttributes.intelligence, baseAttributes.agility, baseAttributes.perception, hp, JSON.stringify(stringList(template.skill_sequence)), JSON.stringify(weakenedTraits)]);
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

const partyCombatants = async (connection: Pool | PoolConnection, character: CharacterRow) => {
  const [rows] = await connection.execute<CharacterRow[]>(`SELECT c.*,r.name AS region_name FROM characters c JOIN map_regions r ON r.id=c.current_region_id
    WHERE c.id=? OR c.id IN (SELECT fellow.character_id FROM party_members own JOIN party_members fellow ON fellow.party_id=own.party_id WHERE own.character_id=?) ORDER BY c.id`, [character.id, character.id]);
  return rows.length ? rows : [character];
};

/** 开战（或发动交涉）时先扣 1 点体力；胜利后的额外敌人数体力由结算阶段补扣。 */
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

/** 胜利后将体力总消耗补足为本场初始敌方单位数；临时召唤物不额外计入。 */
const consumeVictoryStamina = async (connection: PoolConnection, members: Array<Pick<CombatMemberRow, 'id' | 'npc_code' | 'stamina' | 'stamina_eligible'>>, enemyCount: number) => {
  const additionalCost = Math.max(0, enemyCount - 1); const spent = new Map<number, number>();
  for (const member of members) {
    if (member.npc_code || !member.stamina_eligible) continue;
    const surcharge = Math.min(additionalCost, Math.max(0, Number(member.stamina)));
    if (surcharge) await connection.execute('UPDATE characters SET stamina=stamina-? WHERE id=?', [surcharge, member.id]);
    spent.set(Number(member.id), 1 + surcharge);
  }
  return spent;
};

const activeCombatFor = async (connection: PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { combat_id: string; mode: string; turn_no: number; opening_damage_bonus: number; cooldowns: unknown })[]>(`SELECT cs.id AS combat_id,cs.mode,cs.turn_no,cs.opening_damage_bonus,cs.cooldowns FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id
    WHERE cm.character_id=? AND cs.state='active' LIMIT 1 FOR UPDATE`, [characterId]);
  return rows[0];
};

/** 二转资源从战斗开始重新计数，绝不写回角色的永久数据。 */
const initializeCombatProfessionResources = async (connection: PoolConnection, sessionId: string, members: CharacterRow[]) => {
  if (!members.length) return;
  const ids = members.map(member => Number(member.id));
  const [professions] = await connection.execute<(RowDataPacket & { character_id: number; profession_code: string })[]>(
    `SELECT character_id,profession_code FROM player_advanced_professions WHERE character_id IN (${ids.map(() => '?').join(',')})`, ids
  );
  for (const profession of professions) {
    const definition = advancedResourceForProfession(profession.profession_code);
    if (!definition) continue;
    await connection.execute(`INSERT INTO combat_profession_resources
      (session_id,character_id,profession_code,resource_code,resource_name,current_value,max_value)
      VALUES (?,?,?,?,?,?,100)
      ON DUPLICATE KEY UPDATE profession_code=VALUES(profession_code),resource_code=VALUES(resource_code),resource_name=VALUES(resource_name),current_value=0,max_value=100`,
      [sessionId, profession.character_id, profession.profession_code, definition.code, definition.name, 0]);
  }
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

/**
 * 目标被管理操作移除、或回合结算在写入最终状态前中断时，旧会话会仍显示为 active，
 * 但已经没有任何可行动的敌我单位。此处只收束这种不完整会话，正常战斗绝不触碰。
 */
const repairInvalidCombatFor = async (connection: PoolConnection, characterId: number) => {
  const session = await activeCombatFor(connection, characterId);
  if (!session) return false;
  const [rows] = await connection.execute<(RowDataPacket & { live_members: number; live_target_rows: number; usable_targets: number })[]>(`SELECT
    EXISTS(SELECT 1 FROM combat_members cm JOIN characters c ON c.id=cm.character_id WHERE cm.session_id=? AND cm.is_defeated=0) AS live_members,
    EXISTS(SELECT 1 FROM combat_targets ct JOIN monster_spawns existing_spawn ON existing_spawn.id=ct.spawn_id WHERE ct.session_id=? AND ct.is_defeated=0) AS live_target_rows,
    EXISTS(SELECT 1 FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id
      WHERE ct.session_id=? AND ct.is_defeated=0 AND s.defeated_at IS NULL) AS usable_targets`, [session.combat_id, session.combat_id, session.combat_id]);
  const state = rows[0];
  if (session.mode === 'spar' || session.mode === 'story') {
    if (Number(state?.live_members) && Number(state?.live_target_rows)) return false;
    await finishNpcSparring(connection, session.combat_id, !Number(state?.live_members) ? 'defeat' : 'escaped'); return true;
  }
  if (state && Number(state.live_members) && Number(state.usable_targets)) return false;
  // 敌人已经在本场中全部倒下时保留 victory；敌人实体被外部删除时按 escaped 收束，避免凭空发放战利品。
  const nextState = !Number(state?.live_members) ? 'defeat' : !Number(state?.live_target_rows) ? 'victory' : 'escaped';
  await connection.execute('UPDATE combat_sessions SET state=? WHERE id=? AND state=\'active\'', [nextState, session.combat_id]);
  await connection.execute('UPDATE combat_members SET pending_action=NULL WHERE session_id=?', [session.combat_id]);
  await connection.execute('DELETE FROM combat_status_effects WHERE session_id=?', [session.combat_id]);
  await connection.execute('DELETE FROM combat_spirits WHERE session_id=?', [session.combat_id]);
  if (nextState === 'defeat') await connection.execute(`UPDATE characters c JOIN combat_members cm ON cm.character_id=c.id
    SET c.current_hp=1,c.activity_status='resting',c.rest_started_at=NOW() WHERE cm.session_id=?`, [session.combat_id]);
  return true;
};

const chooseTargetInTransaction = async (connection: PoolConnection, qqUserId: string, spawnId: number, ambush = false, retreatPosition?: CombatRetreatPosition, prepaid?: Record<string, boolean>) => {
  let character = await characterFor(qqUserId, connection); let members = await partyCombatants(connection, character);
  for (const member of members) { await assertNoNegotiation(connection, Number(member.id)); assertTalentReviewResolved(await readTalentData(connection,Number(member.id))); }
  for (const member of members) await recalculateCharacterStats(connection, Number(member.id));
  members = await partyCombatants(connection, character); character = members.find(member => Number(member.id) === Number(character.id)) ?? character;
  ensureActionAvailable(character); if (members.some(member => member.activity_status === 'resting')) throw new Error('队伍中有人正在休息，无法进入战斗。');
  for (const member of members) await repairInvalidCombatFor(connection, Number(member.id));
  const [existing] = await connection.execute<RowDataPacket[]>(`SELECT cs.id FROM combat_sessions cs JOIN combat_members cm ON cm.session_id=cs.id WHERE cm.character_id IN (${members.map(() => '?').join(',')}) AND cs.state='active' LIMIT 1 FOR UPDATE`, members.map(member => member.id));
  if (existing[0]) throw new Error('队伍正在战斗中，请先结束当前战斗。');
  const storyStatus = await forestGuideStatusFor(connection, Number(character.id));
  const [spawnRows] = await connection.execute<(SpawnRow & { template_code: string })[]>(`SELECT s.id,s.template_id,t.code AS template_code,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json,t.element_mastery_json,t.element_resistance_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL AND ${visiblePursuitCondition('s')} FOR UPDATE`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id, character.id, character.id, character.id, character.id]);
  const appraisal = await appraisalProfileFor(connection, [character.id]);
  const spawns = materializeMonsters(spawnRows, appraisal.informationLevel >= 2);
  const selected = spawns.find(spawn => Number(spawn.id) === spawnId); if (!selected) throw new Error('目标已离开当前位置或已被击败。');
  const selectedRow = spawnRows.find(spawn => Number(spawn.id) === spawnId);
  if (storyStatus && storyStatus !== 'completed' && !(['joined', 'declined'].includes(storyStatus) && selectedRow?.template_code === 'forest_slime')) throw new Error('你正在推进「初章·包容之镇」，请先完成当前剧情。');
  const [occupied] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id
    WHERE ct.spawn_id IN (${spawns.map(() => '?').join(',')}) AND cs.state='active' LIMIT 1 FOR UPDATE`, spawns.map(spawn => spawn.id));
  if (occupied[0]) throw new Error('该目标正在与其他队伍战斗。你可以选择伏击等待，或离开此处。');
  await assertMonsterNotNegotiating(connection, spawns.map(spawn => Number(spawn.id)));
  // 每一场新的遭遇都是独立战斗：地图上的残余生命不延续到下一场，所有怪物均以满血、满蓝入场。
  for (const spawn of spawns) {
    const stats = monsterCombatStats(spawn);
    spawn.current_hp = stats.hpMax;
    const source = spawnRows.find(row => Number(row.id) === Number(spawn.id));
    if (source) source.current_hp = stats.hpMax;
    await connection.execute('UPDATE monster_spawns SET current_hp=? WHERE id=?', [stats.hpMax, spawn.id]);
  }
  const canAmbush = members.every(member => Number(member.speed) > Math.max(...spawns.map(spawn => monsterCombatStats(spawn).speed)));
  if (ambush && !canAmbush) throw new Error('队伍速度不足，无法发动偷袭。');
  let actualRetreat = retreatPosition;
  if (!actualRetreat) {
    const [retreatRows] = await connection.execute<(RowDataPacket & { retreat_region_id: number; retreat_x: number; retreat_y: number; retreat_z: number })[]>(`SELECT retreat_region_id,retreat_x,retreat_y,retreat_z FROM dungeon_encounter_retreats
      WHERE character_id=? AND encounter_region_id=? AND encounter_x=? AND encounter_y=? AND encounter_z=? LIMIT 1 FOR UPDATE`, [character.id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
    const retreat = retreatRows[0]; if (retreat) actualRetreat = { regionId: Number(retreat.retreat_region_id), x: Number(retreat.retreat_x), y: Number(retreat.retreat_y), z: Number(retreat.retreat_z) };
  }
  const id = randomUUID();
  const staminaEligibility = prepaid ? new Map(members.map(member => [Number(member.id), member.npc_code ? true : Boolean(prepaid[String(member.id)])])) : await consumeEncounterStamina(connection, members);
  await connection.execute('INSERT INTO combat_sessions (id,character_id,spawn_id,player_hp,player_mp,cooldowns,opening_damage_bonus) VALUES (?,?,?,?,?,?,?)', [id, character.id, spawns[0].id, character.current_hp, character.current_mp, JSON.stringify({ __rewardVersion: negotiationVersion, ...(actualRetreat ? { dungeonRetreat: actualRetreat } : {}) }), ambush ? .5 : 0]);
  const environment = await snapshotCombatEnvironment(connection, id, Number(character.current_region_id), members.map(member => Number(member.id)));
  for (const member of members) {
    await connection.execute('INSERT INTO combat_members (session_id,character_id,current_hp,current_mp,selected_target_id,cooldowns,stamina_eligible) VALUES (?,?,?,?,?,JSON_OBJECT(),?)', [id, member.id, member.current_hp, member.current_mp, selected.id, staminaEligibility.get(Number(member.id)) ? 1 : 0]);
    await initializeCombatDeviceEnergy(connection, id, Number(member.id));
  }
  await initializeCombatProfessionResources(connection, id, members);
  for (const spawn of spawns) { await connection.execute('INSERT INTO combat_targets (session_id,spawn_id,current_mp,cooldowns) VALUES (?,?,?,JSON_OBJECT())', [id, spawn.id, monsterCombatStats(spawn).mpMax]); for (const member of members) await connection.execute('INSERT INTO combat_threat (session_id,spawn_id,character_id,threat) VALUES (?,?,?,1)', [id, spawn.id, member.id]); }
  await spawnRegionalBossComponents(connection, id, spawns, members);
  return { character, spawn: selected, spawns, members, ambush, environment };
};
export const chooseTarget = async (qqUserId: string, spawnId: number, ambush = false, retreatPosition?: CombatRetreatPosition) => withTransaction(connection => chooseTargetInTransaction(connection, qqUserId, spawnId, ambush, retreatPosition));

export const queueAmbush = async (qqUserId: string, spawnId: number, delivery?: AmbushDelivery) => withTransaction(async connection => {
  const character = await characterFor(qqUserId, connection); await assertNoNegotiation(connection, Number(character.id)); ensureActionAvailable(character);
  const [ambushRows] = await connection.execute<(RowDataPacket & { status: 'waiting' | 'ready' | 'resolved'; ready_spawn_id: number | null })[]>('SELECT status,ready_spawn_id FROM combat_ambushes WHERE spawn_id=? AND character_id=? FOR UPDATE', [spawnId, character.id]);
  const queued = ambushRows[0];
  if (queued?.status === 'ready' && queued.ready_spawn_id) {
    const [residualRows] = await connection.execute<RowDataPacket[]>('SELECT id FROM monster_spawns WHERE id=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL FOR UPDATE', [queued.ready_spawn_id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
    if (!residualRows[0]) { await connection.execute('UPDATE combat_ambushes SET status=\'resolved\' WHERE spawn_id=? AND character_id=?', [spawnId, character.id]); throw new Error('前一场战斗已经结束，战场上没有可伏击的残余目标。'); }
    const [residualActive] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=? AND cs.state='active' LIMIT 1 FOR UPDATE`, [queued.ready_spawn_id]);
    if (!residualActive[0]) return { ready: true, spawnId: Number(queued.ready_spawn_id), residualParty: true };
  }
  const [spawnRows] = await connection.execute<RowDataPacket[]>(`SELECT id FROM monster_spawns s
    WHERE id=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? AND defeated_at IS NULL
      AND ${visiblePursuitCondition('s')} FOR UPDATE`, [spawnId, character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id, character.id, character.id, character.id, character.id]);
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
  const character = await characterFor(qqUserId, connection); await assertNoNegotiation(connection, Number(character.id));
  await connection.execute('INSERT INTO encounter_escape_tokens (character_id,region_id,pos_x,pos_y,pos_z) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE region_id=VALUES(region_id),pos_x=VALUES(pos_x),pos_y=VALUES(pos_y),pos_z=VALUES(pos_z)', [character.id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
});

export const encounterAction = async (qqUserId: string, spawnId: number, action: 'avoid' | 'persuade') => {
  const found = await explore(qqUserId);
  const spawn = found.spawns.find(item => item.id === spawnId);
  if (!spawn) throw new Error('该目标不在当前位置。');
  const primary = found.spawns[0];
  if (action === 'avoid') {
    return withTransaction(async connection => {
      const character = await characterFor(qqUserId, connection); await assertNoNegotiation(connection, Number(character.id)); const members = await partyCombatants(connection, character); const monster = monsterCombatStats(primary);
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
      const victim = members.find(member => Number(member.id) === Number(character.id)) ?? character; const strike = resolveStrike(monster.physicalAttack, Number(victim.physical_defense), monster.accuracy, Number(victim.evasion), monster.crit, Number(victim.crit_resist_bp), monster.critDamage, Number(victim.crit_damage_reduction_bp), false, false, 0, 0, 1, strikeCorrections(undefined, await modifiersFor(connection, Number(victim.id))));
      const retreatText = await retreatToPreviousCell() ? '你们仍成功沿来路退回上一格。' : '你们仍成功脱离遭遇，可以继续移动。';
      if (strike.hit) await connection.execute('UPDATE characters SET current_hp=GREATEST(1,current_hp-?) WHERE id=?', [strike.damage, victim.id]);
      await clearPursuit();
      return !strike.hit ? `躲避不及，${primary.name} 发起追击，但${combatUnitLabel(victim)}闪避了。\n${retreatText}` : `躲避不及，${primary.name} 发起追击，对${combatUnitLabel(victim)}造成 ${strike.damage} 点物理伤害。\n${retreatText}`;
    });
  }
  if (action === 'persuade') {
    const view = await negotiateEncounter(qqUserId, spawnId, { type: 'view' });
    if (view.kind !== 'ongoing') return view.text;
    const result = await negotiateEncounter(qqUserId, spawnId, { type: 'talk', sessionId: view.sessionId, revision: view.revision });
    return result.text;
  }
  throw new Error('未知的遇战操作。');
};

export const battleStatus = async (qqUserId: string) => {
  const repaired = await withTransaction(async connection => {
    const character = await characterFor(qqUserId);
    return repairInvalidCombatFor(connection, Number(character.id));
  });
  if (repaired) throw new Error('检测到上一场战斗已失效，已自动结束。请重新寻怪或移动。');
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [sessions] = await pool.execute<(RowDataPacket & { combat_id: string; mode: string; cooldowns: unknown; turn_no: number })[]>(`SELECT cs.id AS combat_id,cs.mode,cs.turn_no,cs.cooldowns FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state='active' LIMIT 1`, [character.id]);
  const session = sessions[0]; if (!session) throw new Error('当前不在战斗中。请移动到敌对生物所在格子。');
  const [parleys] = await pool.execute<RowDataPacket[]>("SELECT n.spawn_id,n.id,n.revision FROM negotiation_participants p JOIN negotiation_sessions n ON n.id=p.session_id WHERE p.character_id=? AND n.state='active' LIMIT 1", [character.id]);
  const environment = await combatEnvironmentFor(pool, session.combat_id);
  const [members] = await pool.execute<CombatMemberRow[]>(`SELECT c.*,r.name AS region_name,cm.current_hp,cm.current_mp,cm.selected_target_id,cm.pending_action,cm.cooldowns,cm.stamina_eligible,cm.is_defeated FROM combat_members cm JOIN characters c ON c.id=cm.character_id JOIN map_regions r ON r.id=c.current_region_id WHERE cm.session_id=? ORDER BY c.id`, [session.combat_id]);
  const [resources] = await pool.execute<CombatProfessionResourceRow[]>('SELECT character_id,profession_code,resource_code,resource_name,current_value,max_value FROM combat_profession_resources WHERE session_id=?', [session.combat_id]);
  const [targetRows] = await pool.execute<CombatTargetRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.weakness_json,t.resistance_json,t.element_mastery_json,t.element_resistance_json,ct.current_mp,ct.cooldowns,ct.is_defeated FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=? ORDER BY s.id`, [session.combat_id]);
  const appraisal = await appraisalProfileFor(pool, members.map(member => Number(member.id)));
  // 战斗内召唤物被击倒后立刻从展示目标中移除，不显示为普通的“击败”目标。
  const targets = materializeMonsters(targetRows, false).filter(target => !isSummonedMonster(target) || !Boolean(target.is_defeated)).sort((left, right) => {
    const leftBody = componentBodyId(left) || Number(left.id); const rightBody = componentBodyId(right) || Number(right.id);
    if (leftBody !== rightBody) return leftBody - rightBody;
    return Number(Boolean(isBossComponent(left))) - Number(Boolean(isBossComponent(right))) || Number(left.id) - Number(right.id);
  });
  const [skills] = await pool.execute<(RowDataPacket & { quick_slot: number; code: string })[]>('SELECT ps.quick_slot,s.code FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot IS NOT NULL', [character.id]);
  const [advancedSkillRows] = await pool.execute<(RowDataPacket & { id: number; code: string; name: string })[]>(`SELECT ps.skill_id AS id,s.code,s.name
    FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id
    WHERE ps.character_id=? AND s.category IN ('physical','magic','utility')
    ORDER BY ps.learned_at,s.id`, [character.id]);
  const [items] = await pool.execute<(RowDataPacket & { quick_slot: number })[]>('SELECT qi.quick_slot FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id WHERE qi.character_id=? AND pi.quantity>0', [character.id]);
  const [spirits] = await pool.execute<CombatSpiritRow[]>('SELECT owner_character_id,spirit_code,spirit_name,current_hp,hp_max,remaining_turns FROM combat_spirits WHERE session_id=? ORDER BY owner_character_id,spirit_code', [session.combat_id]);
  const deviceSlots = await combatDeviceSlotsFor(pool, session.combat_id, Number(character.id));
  const resourceFor = (memberId: number) => resources.find(resource => Number(resource.character_id) === memberId);
  await initializeHiddenBattleUnits(pool, members.map(member=>{const cooldowns=jsonObject(member.cooldowns);member.cooldowns=cooldowns;return {key:`member:${member.id}`,cooldowns};}));
  const own = members.find(member => Number(member.id) === Number(character.id)); if (!own) throw new Error('战斗成员状态异常。');
  const ownResource = resourceFor(Number(own.id));
  const rangeTalent=(await(await import('./talent-data')).ownedTalent(pool,Number(character.id)))?.number==='A09';
  return {
    talentNote:rangeTalent?'百步之外：本场目标位于同一遭遇格，没有独立站位距离限制；是否享受远程加成，以技能的远程标记为准。':'',
    canEnchant: skills.some(skill => skill.code === 'resident_a02'), enchantElement: String(jsonObject(own.cooldowns).__enchantElement ?? '风'),
    negotiation: parleys[0] ? { spawnId: Number(parleys[0].spawn_id), sessionId: String(parleys[0].id), revision: Number(parleys[0].revision) } : null,
    sessionId: session.combat_id, mode: session.mode, environment, characterId: Number(character.id), turn: Number(session.turn_no), playerHp: Number(own.current_hp), playerHpMax: Number(character.hp_max), playerMp: Number(own.current_mp), playerMpMax: Number(character.mp_max), selectedAllyId: Number(jsonObject(own.cooldowns).__selectedAlly) || null, selectedTargetId: own.selected_target_id ? Number(own.selected_target_id) : null,
    canAct: !Boolean(own.is_defeated) && !Boolean(own.pending_action) && !readRuleState(jsonObject(own.cooldowns).__rules).cast && (!jsonObject(session.cooldowns).__bonusPhase || Boolean(jsonObject(own.cooldowns).__bonusAction)), resource: hiddenResourceView(jsonObject(own.cooldowns)) ?? (ownResource ? { professionCode: ownResource.profession_code, code: ownResource.resource_code, name: ownResource.resource_name, current: Number(ownResource.current_value), max: Number(ownResource.max_value) } : null), skillSlots: skills.map(skill => Number(skill.quick_slot)), readySkillSlots: skills.filter(skill => Number(jsonObject(own.cooldowns)[skill.code] ?? 0) <= 0).map(skill => Number(skill.quick_slot)), advancedSkills: advancedSkillRows.filter(skill => isAdvancedProfessionSkillCode(skill.code)).map(skill => ({ id: Number(skill.id), code: skill.code, name: skill.name, ready: Number(jsonObject(own.cooldowns)[skill.code] ?? 0) <= 0 })), itemSlots: items.map(item => Number(item.quick_slot)), deviceSlots: deviceSlots.map(device => ({ ...device, skills: device.skills.map(skill => ({ ...skill, ready: Number(jsonObject(own.cooldowns)[`device_${device.instanceId}_${skill.code}`] ?? 0) <= 0 })) })), appraisal: { learned: appraisal.learned, rangeLevel: appraisal.rangeLevel, informationLevel: appraisal.informationLevel },
    members: members.map(member => { const resource = resourceFor(Number(member.id)); return { statusText: ruleStatusSummary(readRuleState(jsonObject(member.cooldowns).__rules), Number(session.turn_no)), id: Number(member.id), name: member.name, companion: Boolean(member.npc_code), hp: Number(member.current_hp), hpMax: Number(member.hp_max), mp: Number(member.current_mp), mpMax: Number(member.mp_max), resource: hiddenResourceView(jsonObject(member.cooldowns)) ?? (resource ? { professionCode: resource.profession_code, code: resource.resource_code, name: resource.resource_name, current: Number(resource.current_value), max: Number(resource.max_value) } : null), defeated: Boolean(member.is_defeated), pending: Boolean(member.pending_action), chanting: readRuleState(jsonObject(member.cooldowns).__rules).cast?.code ? residentSkillByCode(readRuleState(jsonObject(member.cooldowns).__rules).cast!.code)?.name ?? '技能' : null, extraAction: Boolean(jsonObject(member.cooldowns).__bonusAction) }; }),
    spirits: spirits.map(spirit => ({ ownerCharacterId: Number(spirit.owner_character_id), code: spirit.spirit_code, name: spirit.spirit_name, hp: Number(spirit.current_hp), hpMax: Number(spirit.hp_max), remainingTurns: Number(spirit.remaining_turns) })),
    targets: targets.map(target => {
      const observer = appraisalForTarget(appraisal, Number(target.level)); const hidden = readRuleState(jsonObject(target.cooldowns).__rules).statuses.some(effect => effect.code === 'nightmare' && effect.until >= Number(session.turn_no)); const identified = !hidden && (session.mode === 'spar' || Boolean(observer));
      const definition = bossComponentDefinition(target); const body = definition ? targets.find(candidate => Number(candidate.id) === componentBodyId(target)) : undefined;
      return {
        statusText: identified ? ruleStatusSummary(readRuleState(jsonObject(target.cooldowns).__rules), Number(session.turn_no), false) : '信息被雾遮蔽', id: Number(target.id), name: identified ? (Number(observer?.informationLevel ?? 4) >= 2 ? materializeMonster(target, true).name : target.name) : '???', level: identified ? Number(target.level) : null, hp: identified ? Number(target.current_hp) : '???', hpMax: identified ? Number(target.hp_max) : '???', mp: identified ? Number(target.current_mp) : '???', mpMax: identified ? monsterCombatStats(target).mpMax : '???', defeated: Boolean(target.is_defeated), identified,
        isBossComponent: Boolean(definition), bodyTargetId: definition ? componentBodyId(target) : null, passiveSummary: definition?.passiveSummary ?? null, breakSummary: definition?.breakSummary ?? null,
        warning: definition ? componentWarningFor(target, body) : null, bodyDamageReductionPct: definition ? null : bossBodyDamageReductionPct(target, targets), livingComponentCount: definition ? null : livingBossComponentsFor(target, targets).length
      };
    })
  };
};

export const inspectCombat = async (qqUserId: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [sessions] = await pool.execute<(RowDataPacket & { combat_id: string; turn_no: number })[]>(`SELECT cs.id AS combat_id,cs.turn_no FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.state='active' LIMIT 1`, [character.id]);
  const session = sessions[0]; if (!session) throw new Error('当前不在战斗中。');
  const [members] = await pool.execute<CombatMemberRow[]>(`SELECT c.*,r.name AS region_name,cm.current_hp,cm.current_mp,cm.selected_target_id,cm.pending_action,cm.cooldowns,cm.stamina_eligible,cm.is_defeated FROM combat_members cm JOIN characters c ON c.id=cm.character_id JOIN map_regions r ON r.id=c.current_region_id WHERE cm.session_id=? ORDER BY c.id`, [session.combat_id]);
  const [resources] = await pool.execute<CombatProfessionResourceRow[]>('SELECT character_id,profession_code,resource_code,resource_name,current_value,max_value FROM combat_profession_resources WHERE session_id=?', [session.combat_id]);
  const profile = await appraisalProfileFor(pool, members.map(member => Number(member.id))); if (!profile.learned) throw new Error('队伍中无人学会绑定技能「鉴识」。');
  const [targets] = await pool.execute<CombatTargetRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json,t.element_mastery_json,t.element_resistance_json,ct.current_mp,ct.cooldowns,ct.is_defeated
    FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=? ORDER BY s.id`, [session.combat_id]);
  let effects: CombatEffectRow[] = []; let threats: (RowDataPacket & { spawn_id: number; name: string; threat: number })[] = [];
  // 识珠 Lv.1 即可完整掌握己方状态；敌方状态仍按每个目标可满足的鉴识深度显示。
  if (profile.informationLevel >= 1) [effects] = await pool.execute<CombatEffectRow[]>('SELECT ce.id,ce.source_key,ce.target_kind,ce.target_id,e.code,e.name,e.effect_type,ce.value,ce.stacks,ce.remaining_turns FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=?', [session.combat_id]);
  if (profile.informationLevel >= 3) [threats] = await pool.execute<(RowDataPacket & { spawn_id: number; name: string; threat: number })[]>('SELECT ct.spawn_id,c.name,ct.threat FROM combat_threat ct JOIN characters c ON c.id=ct.character_id WHERE ct.session_id=?', [session.combat_id]);
  const statusText = (targetKind: 'member' | 'target', targetId: number) => {
    const statuses = effects.filter(effect => effect.target_kind === targetKind && Number(effect.target_id) === targetId);
    const grouped = new Map<string, CombatEffectRow[]>();
    for (const status of statuses) grouped.set(status.code, [...(grouped.get(status.code) ?? []), status]);
    return statuses.length ? [...grouped.values()].flatMap(group => {
      if (group[0]!.code === 'life_shield') return group.map(effect => `${effect.name}${Math.floor(Number(effect.value))}HP(${effect.remaining_turns})`);
      const first = group[0]!; const stacks = group.reduce((total, effect) => total + Number(effect.stacks), 0);
      const turns = [...new Set(group.map(effect => Number(effect.remaining_turns)))].sort((left, right) => right - left).join('/');
      const actualLabel = first.code === 'barrier' ? '减伤' : first.name;
      const row = targetKind === 'member' ? members.find(member => Number(member.id) === targetId) : targets.find(target => Number(target.id) === targetId);
      const label = displayedRuleName(readRuleState(jsonObject(row?.cooldowns).__rules), first.code, actualLabel, Number(session.turn_no), targetKind === 'member');
      return `${label}${stacks > 1 ? `×${stacks}` : ''}(${turns})`;
    }).join('、') : '无';
  };
  const elementText = (raw: unknown) => ['水', '火', '木', '土', '风', '冰', '雷', '光', '暗'].map(element => `${element}${Number(jsonObject(raw)[element] ?? 0) >= 0 ? '+' : ''}${Number(jsonObject(raw)[element] ?? 0)}`).join('｜');
  const weakestElementResistance = (raw: unknown) => {
    const values = ['水', '火', '木', '土', '风', '冰', '雷', '光', '暗'].map(element => ({ element, value: Number(jsonObject(raw)[element] ?? 0) }));
    const weakest = values.sort((left, right) => left.value - right.value || left.element.localeCompare(right.element, 'zh-CN'))[0];
    return weakest ? `${weakest.element}${weakest.value >= 0 ? '+' : ''}${weakest.value}` : '无';
  };
  const lines = ['我方状态'];
  for (const member of members) {
    const resource = resources.find(item => Number(item.character_id) === Number(member.id));
    lines.push(`${combatUnitLabel(member)}HP ${member.current_hp}/${member.hp_max}｜MP ${member.current_mp}/${member.mp_max}${member.is_defeated ? '（倒下）' : ''}`);
    if (resource) lines.push(`二转资源：${resource.resource_name} ${resource.current_value}/${resource.max_value}｜${resource.profession_code}`);
    lines.push(`六维：体${member.constitution} 精${member.spirit} 力${member.strength} 智${member.intelligence} 敏${member.agility} 感${member.perception}`);
    lines.push(`物攻 ${member.physical_attack}｜魔攻 ${member.magic_attack}｜物防 ${member.physical_defense}｜魔防 ${member.magic_defense}`);
    lines.push(`命中 ${member.accuracy}｜闪避 ${member.evasion}｜暴击 ${member.crit_rate_bp}｜暴伤 ${member.crit_damage_bp}｜暴免 ${member.crit_resist_bp}｜暴抗 ${member.crit_damage_reduction_bp}`);
    lines.push(`韧性 ${member.tenacity}｜破韧 ${member.tenacity_pierce}｜速度 ${member.speed}`);
    lines.push(`元素精通：${elementText(member.element_mastery_json)}`);
    lines.push(`元素抗性：${elementText(member.element_resistance_json)}`);
    lines.push(`状态：${[statusText('member', Number(member.id)), ruleStatusSummary(readRuleState(jsonObject(member.cooldowns).__rules), Number(session.turn_no))].filter(Boolean).join('、')}`);
  }
  lines.push('', '敌方状态');
  for (const raw of targets) {
    if (isSummonedMonster(raw) && raw.is_defeated) continue;
    if (readRuleState(jsonObject(raw.cooldowns).__rules).statuses.some(effect => effect.code === 'nightmare' && effect.until >= Number(session.turn_no))) { lines.push('【信息被雾遮蔽】'); continue; }
    const observer = appraisalForTarget(profile, Number(raw.level)); const target = materializeMonster(raw, Number(observer?.informationLevel ?? 0) >= 2); if (!observer) { lines.push('【???】数据无法解析。'); continue; }
    lines.push(`${combatUnitLabel(target)}HP ${target.current_hp}/${target.hp_max}｜MP ${target.current_mp}/${monsterCombatStats(target).mpMax}`);
    const component = bossComponentDefinition(target);
    if (component) {
      const body = targets.find(candidate => Number(candidate.id) === componentBodyId(target));
      lines.push(`战斗部位：依附【${body ? materializeMonster(body, Number(observer.informationLevel) >= 2).name : '本体'}】｜${component.passiveSummary}｜击破：${component.breakSummary}${componentWarningFor(target, body) ? `｜预警：${componentWarningFor(target, body)}` : ''}`);
      if (observer.informationLevel >= 4) lines.push(`部位元素抗性：${elementText(target.element_resistance_json)}`);
    } else {
      const count = livingBossComponentsFor(target, targets).length;
      if (count) lines.push(`多部位核心：存活部位 ${count}/3｜当前部位减伤 ${bossBodyDamageReductionPct(target, targets)}%。部位实际扣血会经本体减伤后传递；同次群攻的本体伤害只取最高值一次。`);
    }
    if (observer.informationLevel >= 2) { const stats = monsterCombatStats(target); lines.push(`词条：${traitList(target.traits_json).map(trait => trait.name).join('、') || '无'}｜物攻 ${stats.physicalAttack}｜魔攻 ${stats.magicAttack}｜物防 ${stats.physicalDefense}｜魔防 ${stats.magicDefense}｜命中 ${stats.accuracy}｜闪避 ${stats.evasion}｜韧性 ${stats.tenacity}｜破韧 ${stats.tenacityPierce}`); const mentorBuild = advancedMentorBuildFor(target); if (mentorBuild) { const equipment = jsonObject(mentorBuild.equipment); const passive = jsonObject(mentorBuild.passive); const inheritance = jsonObject(mentorBuild.inheritance); const resource = jsonObject(mentorBuild.resource); const resourceValue = Number(jsonObject(target.cooldowns).advanced_mentor_resource ?? 20); lines.push(`导师装备：Lv.${equipment.level ?? 30}${String(equipment.rarity ?? '传说')}·品质${equipment.quality ?? 100}｜主手 ${String(equipment.weapon ?? '—')}｜副手 ${String(equipment.offhand ?? '—')}｜${String(equipment.armor ?? '毕业套装')}`); lines.push(`武器精通：${jsonArray(equipment.mastery).map(String).join('、') || '无'}｜副词条 ${jsonArray(equipment.secondaryAffixes).map(String).join('、')}`); lines.push(`二转被动【${String(passive.name ?? '—')}】｜本职传承【${String(inheritance.name ?? '—')}】｜${String(resource.name ?? '专属资源')} ${resourceValue}/100`); } }
    if (observer.informationLevel >= 3) { const threat = threats.filter(item => Number(item.spawn_id) === Number(target.id)).sort((left, right) => Number(right.threat) - Number(left.threat))[0]; lines.push(`状态：${[statusText('target', Number(target.id)), ruleStatusSummary(readRuleState(jsonObject(target.cooldowns).__rules), Number(session.turn_no), false)].filter(Boolean).join('、')}｜目标仇恨：${threat ? threat.name : '无'}`); }
    if (observer.informationLevel >= 4) { const className: Record<string, string> = { normal: '普通', elite: '精英', boss: '首领' }; const attrs = monsterAttributes(target); lines.push(`种族：${className[target.monster_class] ?? target.monster_class}｜物理抗性：${stringList(target.resistance_json).join('、') || '无'}｜元素抗性（最弱）：${weakestElementResistance(target.element_resistance_json)}\n六维：体${attrs.constitution} 精${attrs.spirit} 力${attrs.strength} 智${attrs.intelligence} 敏${attrs.agility} 感${attrs.perception}`); }
  }
  return { text: lines.join('\n') };
};

export const observeHiddenQuestMonster = async (qqUserId: string, spawnId: number) => withTransaction(async connection => {
  const { hiddenQuestCharacter, recordHiddenQuestObservation } = await import('./hidden-quest.service');
  const character = await hiddenQuestCharacter(connection, qqUserId);
  const appraisal = await appraisalProfileFor(connection, [Number(character.id)]);
  if (!appraisal.learned || appraisal.informationLevel < 1) throw new Error('请先具备鉴识的公开信息能力，再作观察记录。');
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT s.id,t.code,t.name,COALESCE(s.level,t.level) AS level,s.current_hp FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.id=? AND s.defeated_at IS NULL AND s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND ${visiblePursuitCondition('s')} LIMIT 1 FOR UPDATE`, [spawnId, character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id, character.id, character.id, character.id, character.id]);
  const monster = rows[0];
  if (!monster || !canAppraiseTarget(appraisal, Number(monster.level))) throw new Error('该魔物不在当前坐标的可鉴识范围内。');
  const fact = `Lv.${Number(monster.level)}，观察时生命${Number(monster.current_hp)}。`;
  await recordHiddenQuestObservation(connection, Number(character.id), { code: String(monster.code), name: String(monster.name), fact, sourceId: Number(monster.id) });
  return { name: String(monster.name), fact };
});

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
     )) AND ${visiblePursuitCondition('s')} LIMIT 1`, [spawnId, character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id, character.id, character.id, character.id, character.id, character.id]);
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
  const drops = bossSkyDustDrops(resolvedDrops(combat.drops_json), combat);
  const rewards: string[] = [];
  for (const drop of drops) if (Math.random() <= Math.min(1, Number(drop.chance ?? 1) + modifiers.dropBonus)) {
    const [items] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM item_definitions WHERE code=?', [resolvedDropCode(drop, Number(combat.level))]);
    if (items[0]) { const quantity = dropQuantity(drop); await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [character.id, items[0].id, quantity]); rewards.push(`${items[0].name}×${quantity}`); }
  }
  return `胜利！${experienceGain.realmLocked ? realmEnergyDissipationText : `获得经验 ${experienceGain.experience}${modifiers.experienceMultiplier > 1 ? '（成长祝福生效）' : ''}`}${rewards.length ? `，掉落 ${rewards.join('、')}` : ''}。`;
};


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
      const strike = resolveStrike(attack * Number(skill.power) / 100 * multiplier, Number(combat.defense), Number(character.accuracy), monsterCombatStats(combat).evasion, Number(character.crit_rate_bp) + modifiers.critRateBp, monsterCombatStats(combat).critResist, Number(character.crit_damage_bp), monsterCombatStats(combat).critReduction, false, false, modifiers.minimumHitRatePct, 0, 1, strikeCorrections(modifiers));
      damage = directDamageVariance(Math.floor(strike.damage * (1 + modifiers.damageBonusPct / 100))); log = !strike.hit ? `施放 ${skill.name}，但被敌人闪避。` : `施放 ${skill.name}，造成 ${damage} 点${strike.crit ? '暴击' : ''}伤害${modifiers.weaponName ? `（${modifiers.weaponName}生效）` : ''}。`;
    } else {
      const defense = Math.floor(Number(combat.defense) * (1 - modifiers.ignoreDefensePct / 100));
      const strike = resolveStrike(Number(character.physical_attack) + modifiers.physicalAttack, defense, Number(character.accuracy), monsterCombatStats(combat).evasion, Number(character.crit_rate_bp) + modifiers.critRateBp, monsterCombatStats(combat).critResist, Number(character.crit_damage_bp), monsterCombatStats(combat).critReduction, false, false, modifiers.minimumHitRatePct, 0, 1, strikeCorrections(modifiers));
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
  const strike = resolveStrike(Number(combat.attack) * multiplier, Number(character.physical_defense), monster.accuracy, Number(character.evasion), monster.crit, Number(character.crit_resist_bp), monster.critDamage, Number(character.crit_damage_reduction_bp), false, false, 0, 0, 1, strikeCorrections(undefined, modifiers));
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

export const selectCombatEnchantment = async (qqUserId: string, element: string) => withTransaction(async connection => {
  if (!['风', '雷', '火'].includes(element)) throw new Error('附锋元素只能选择风、雷或火。');
  const character = await characterFor(qqUserId); const session = await activeCombatFor(connection, Number(character.id)); if (!session) throw new Error('当前不在战斗中。');
  await connection.execute("UPDATE combat_members SET cooldowns=JSON_SET(COALESCE(cooldowns,JSON_OBJECT()),'$.__enchantElement',?) WHERE session_id=? AND character_id=? AND pending_action IS NULL", [element, session.combat_id, character.id]);
});

export const switchCombatTarget = async (qqUserId: string, targetId: number, targetKind: 'member' | 'target' = 'target') => withTransaction(async connection => {
  const character = await characterFor(qqUserId, connection); await assertNoNegotiation(connection, Number(character.id)); if (await repairInvalidCombatFor(connection, Number(character.id))) throw new Error('检测到上一场战斗已失效，已自动结束。请重新寻怪或移动。'); const session = await activeCombatFor(connection, character.id);
  if (!session) throw new Error('当前不在战斗中。');
  const [targets] = await connection.execute<RowDataPacket[]>(targetKind === 'member'
    ? 'SELECT character_id FROM combat_members WHERE session_id=? AND character_id=? AND is_defeated=0 FOR UPDATE'
    : 'SELECT spawn_id FROM combat_targets WHERE session_id=? AND spawn_id=? AND is_defeated=0 FOR UPDATE', [session.combat_id, targetId]);
  if (!targets[0]) throw new Error('该目标已被击败或不在本场战斗中。');
  if (targetKind === 'member') await connection.execute("UPDATE combat_members SET cooldowns=JSON_SET(COALESCE(cooldowns,JSON_OBJECT()),'$.__selectedAlly',?) WHERE session_id=? AND character_id=?", [targetId, session.combat_id, character.id]);
  else await connection.execute("UPDATE combat_members SET selected_target_id=?,cooldowns=JSON_REMOVE(COALESCE(cooldowns,JSON_OBJECT()),'$.__selectedAlly') WHERE session_id=? AND character_id=?", [targetId, session.combat_id, character.id]);
  await connection.execute("UPDATE combat_sessions SET last_action_at=NOW() WHERE id=? AND state='active'", [session.combat_id]);
  return targetId;
});

const activeCombatEffects = async (connection: PoolConnection, sessionId: string) => {
  const [rows] = await connection.execute<CombatEffectRow[]>(`SELECT ce.id,ce.source_key,ce.target_kind,ce.target_id,e.code,e.name,e.effect_type,ce.value,ce.stacks,ce.remaining_turns
    FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=? FOR UPDATE`, [sessionId]);
  return rows;
};

type EffectMarker = '$' | '#' | '&';
const effectMarkerForTarget = (targetKind: 'member' | 'target'): EffectMarker => targetKind === 'member' ? '#' : '$';

const effectMessage = (effect: { code: string; name: string; effect_type: string }, value: number, duration: number, stacks = 1, marker: EffectMarker = '$') => {
  const percent = Number(value).toFixed(1);
  const detail = effect.code === 'vulnerability' ? `物防降低${percent}%`
    : effect.code === 'imbalance' ? `命中、闪避降低${percent}%`
    : effect.code === 'slow' ? `速度降低${percent}%`
    : effect.code === 'sprint' ? `速度提高${percent}%`
    : effect.code === 'armor_shatter' ? `物防降低${percent}%`
    : effect.code === 'magic_shatter' ? `魔防降低${percent}%`
    : effect.code === 'bind' ? `速度、闪避降低${percent}%`
    : effect.code === 'evasion_down' ? `闪避降低${percent}%`
    : effect.code === 'exposed' ? `受到直击伤害提高${percent}%`
    : effect.code === 'precision' ? `命中提高${percent}%`
    : effect.code === 'critical_focus' ? `暴击提高${percent}%`
    : effect.code === 'alchemy_guard' ? `物防、魔防提高${percent}%`
    : effect.code === 'alchemy_evasion' ? `闪避提高${percent}%`
    : effect.code === 'alchemy_confusion' ? '行动目标随机化'
    : effect.code === 'rending' ? '进入撕裂状态'
    : effect.code === 'mist_veil' ? `下一次出招伤害提高${percent}%`
    : effect.code === 'shadow_pierce' ? '下一次出招必定暴击'
    : effect.code === 'battle_cry' ? `物攻、魔攻提高${percent}%`
      : effect.code === 'burn' ? '进入灼烧状态'
        : effect.code === 'poison' ? '进入中毒状态'
          : effect.code === 'bleeding' ? '进入流血状态'
            : effect.code === 'stun' ? '进入眩晕状态'
              : effect.code === 'ice_bind' ? '进入束缚状态'
              : effect.code === 'lost_health_poison' ? '进入剧毒状态'
              : effect.code === 'shield_counter' ? '进入盾反状态'
              : effect.code === 'barrier' ? `获得${percent}%伤害减免`
                : effect.code === 'life_shield' ? `获得${Math.floor(value)}点可吸收伤害的生命护盾`
                : effect.code === 'regeneration' ? '进入再生状态'
                  : effect.code === 'mana_regeneration' ? '进入回流状态'
                    : effect.code === 'sword_break' ? `物防降低${percent}%`
                  : effect.code === 'demon_surge' ? `伤害提高${percent}%`
                  : effect.code === 'advanced_taunt' ? '优先攻击施加者'
                  : effect.code === 'advanced_guard' ? `单体伤害转移${percent}%`
                  : effect.code === 'advanced_counter_ready' ? `下次行动前${percent}%反击`
                  : effect.code.startsWith('element_mark_') ? '元素印记已就绪'
                  : effect.code === 'advanced_hunt' ? `下一次追猎伤害提高${percent}%`
                  : effect.code === 'advanced_mapping' ? `全队命中提高${percent}%、暴击提高8%`
                  : effect.code === 'advanced_formation' ? `下一次队友技能伤害提高${percent}%`
                  : effect.code === 'advanced_light_mark' ? `下一次元素反应伤害提高${percent}%`
                  : effect.code === 'advanced_prayer' ? '祷言层数提升'
                  : effect.code === 'advanced_healing_cut' ? `受到的治疗量降低${percent}%`
                  : effect.code === 'advanced_undying' ? '濒危时保留1点生命'
                  : effect.effect_type === 'cleanse' ? '清除普通可净化异常（数量以技能说明为准）'
                    : '效果生效';
  return `${marker}${effect.code === 'barrier' ? '减伤' : effect.name}${marker}${detail}${duration ? `(${duration})` : ''}${stacks > 1 ? `×${stacks}` : ''}`;
};

const applyAlchemyStatus = async (connection: PoolConnection, sessionId: string, targetKind: 'member' | 'target', targetId: number, status: NonNullable<AlchemyCombatEffect['status']>, log: string[]) => {
  if (status.chance !== undefined && Math.random() * 100 >= Number(status.chance)) {
    log.push(`${effectMarkerForTarget(targetKind)}${status.code}${effectMarkerForTarget(targetKind)}未能生效`);
    return false;
  }
  const [definitions] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; effect_type: string })[]>('SELECT id,code,name,effect_type FROM effect_definitions WHERE code=? LIMIT 1', [status.code]);
  const definition = definitions[0];
  if (!definition) return false;
  const [existing] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM combat_status_effects WHERE session_id=? AND target_kind=? AND target_id=? AND effect_id=? FOR UPDATE', [sessionId, targetKind, targetId, definition.id]);
  const value = Math.max(0, Number(status.value)); const turns = Math.max(1, Math.floor(Number(status.turns))); const storedTurns = status.code === 'alchemy_confusion' ? turns + 1 : turns;
  if (existing[0]) await connection.execute('UPDATE combat_status_effects SET effect_level=1,value=?,stacks=1,remaining_turns=GREATEST(remaining_turns,?) WHERE id=?', [value, storedTurns, existing[0].id]);
  else await connection.execute('INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns) VALUES (?,?,?,?,1,?,?)', [sessionId, targetKind, targetId, definition.id, value, storedTurns]);
  log.push(effectMessage(definition, value, turns, 1, effectMarkerForTarget(targetKind)));
  return true;
};

const alchemyBossResistanceKey = 'alchemy_control_debuff_resistance';
const alchemyControlDebuffCodes = new Set(['burn', 'bind', 'stun', 'exposed', 'imbalance', 'alchemy_confusion']);
const isAlchemyControlDebuff = (effect: AlchemyCombatEffect) => effect.target === 'enemy' && Boolean(effect.status && alchemyControlDebuffCodes.has(effect.status.code));

const useCombatConsumable = async (connection: PoolConnection, sessionId: string, member: CombatMemberRow, targets: CombatTargetRow[], itemId: number, itemName: string, rawEffect: unknown, ruleBridge?: CombatRules) => {
  const effect = jsonObject(rawEffect) as AlchemyCombatEffect;
  if(!combatItemEffect(effect))return{consumed:false,message:'该物品不能作为战斗道具使用，请从背包查看使用入口，未消耗道具。'};
  if (ruleBridge && (effect.alchemyOutput || (effect as any).skillReset) && !effect.experienceBonusPct && !effect.partyDropBonusPct) {
    const actor = ruleBridge.units.find(unit => unit.key === `member:${member.id}`)!;
    const victim = ruleBridge.enemies(actor).find(unit => unit.key === `target:${member.selected_target_id}`) ?? ruleBridge.enemies(actor)[0];
    const choice = jsonObject(member.pending_action);
    const ally = choice.targetKind === 'member' ? ruleBridge.units.find(unit => unit.key === `member:${choice.targetId}`) : undefined;
    if(choice.targetKind==='member'&&(!ally||ally.hp<=0))return {consumed:false,message:'指定队友已不在本场或已倒下，未消耗道具。'};
    if(choice.targetKind==='member'&&effect.target==='enemy')return {consumed:false,message:'敌对道具不能用于药剂援助，未消耗道具。'};
    const used = await useAlchemyCombat(ruleBridge, actor, victim, effect, itemName, 'pve', ally);
    if (actor.state.memory.alchemyThreatDrop) { await connection.execute('UPDATE combat_threat SET threat=FLOOR(threat*0.6) WHERE session_id=? AND character_id=?', [sessionId,member.id]); delete actor.state.memory.alchemyThreatDrop; }
    if (actor.state.memory.alchemyThreatBoost && victim) { await connection.execute('UPDATE combat_threat SET threat=threat+? WHERE session_id=? AND character_id=? AND spawn_id=?', [actor.state.memory.alchemyThreatBoost,sessionId,member.id,Number(victim.key.split(':')[1])]); delete actor.state.memory.alchemyThreatBoost; }
    return used;
  }

  const environment = await combatEnvironmentFor(connection, sessionId);
  const cooldowns = jsonObject(member.cooldowns); const limitKey = `alchemy_item_${itemId}`; const used = Number(cooldowns[limitKey] ?? 0); const perBattleLimit = Math.max(0, Math.floor(Number(effect.perBattleLimit ?? 0)));
  if (perBattleLimit && used >= perBattleLimit) return { consumed: false, message: `【${itemName}】本场战斗仅能使用 ${perBattleLimit} 次。` };
  const target = targets.find(candidate => Number(candidate.id) === Number(member.selected_target_id) && !candidate.is_defeated) ?? targets.find(candidate => !candidate.is_defeated);
  const statusTargets = effect.target === 'enemy' && effect.status
    ? (effect.targetScope === 'all' ? targets.filter(candidate => !candidate.is_defeated) : target ? [target] : [])
    : [];
  const applicableTargets = statusTargets;
  const effectiveTargets = applicableTargets.filter(candidate => candidate.monster_class !== 'boss' || !Boolean(jsonObject(candidate.cooldowns)[alchemyBossResistanceKey]));
  if (isAlchemyControlDebuff(effect) && !effectiveTargets.length) {
    const resistedBoss = applicableTargets.find(candidate => candidate.monster_class === 'boss' && Boolean(jsonObject(candidate.cooldowns)[alchemyBossResistanceKey]));
    if (resistedBoss) return { consumed: false, message: `【${resistedBoss.name}】已有炼金抗性，还是别用了吧。` };
  }
  const messages: string[] = [];
  const oldHp = Number(member.current_hp); const oldMp = Number(member.current_mp);
  const rawHeal = Math.max(0, Number(effect.heal ?? 0)) + Math.floor(Number(member.hp_max) * Math.max(0, Number(effect.healPct ?? 0)) / 100);
  let heal = rawHeal ? receivedHealingAmount(rawHeal, (await modifiersFor(connection, Number(member.id))).healingReceivedPct) : 0;
  const restoreMp = Math.max(0, Number(effect.restoreMp ?? 0)) + Math.floor(Number(member.mp_max) * Math.max(0, Number(effect.restoreMpPct ?? 0)) / 100);
  const talentUnit=ruleBridge?.units.find(unit=>unit.key===`member:${member.id}`);
  let bottleApplied=false;
  if(talentUnit&&(heal>0&&oldHp<Number(member.hp_max)||restoreMp>0&&oldMp<Number(member.mp_max)))talentState(talentUnit).poorBroken=true;
  if(talentUnit&&rawHeal>0&&hasTalent(talentUnit,'I09')&&talentUnit.opening?.settings?.invertPotion){
    const state=talentState(talentUnit);talentUnit.state.memory.talentBottleShield=Math.max(Number(talentUnit.state.memory.talentBottleShield??0),Math.floor(rawHeal*2));
    talentUnit.state.memory.talentBottleUntil=state.clock+2;heal=0;messages.push(`倒置药瓶形成 ${Math.floor(rawHeal*2)} 点护盾，持续2个本人正常回合。`);
    bottleApplied=true;
  }
  if (heal) { member.current_hp = Math.min(Number(member.hp_max), oldHp + heal); messages.push(`HP ${oldHp}→${member.current_hp}`); }
  if (restoreMp) { member.current_mp = Math.min(Number(member.mp_max), oldMp + restoreMp); messages.push(`MP ${oldMp}→${member.current_mp}`); }
  if (effect.cleanse) {
    await connection.execute(`DELETE ce FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=? AND ce.target_kind='member' AND ce.target_id=? AND e.code NOT IN ('petrify','charm','nightmare') AND (e.effect_type IN ('damage_over_time','control') OR e.code IN ('vulnerability','sword_break','armor_shatter','magic_shatter','slow','bind','imbalance','evasion_down','exposed','burn','poison','bleeding','rending','stun','alchemy_confusion'))`, [sessionId, member.id]);
    messages.push('清除了可净化异常状态');
  }
  if (effect.throwable && target) {
    const current = await activeCombatEffects(connection, sessionId);
    const statusValue = (kind: 'member' | 'target', targetId: number, code: string) => current.filter(row => row.target_kind === kind && Number(row.target_id) === targetId && row.code === code).reduce((total, row) => total + Number(row.value) * Number(row.stacks), 0);
    const elemental = elementalMultiplier(member.element_mastery_json, target.element_resistance_json, effect.throwable.element);
    const barrier = statusValue('target', Number(target.id), 'barrier'); const exposed = statusValue('target', Number(target.id), 'exposed');
    const rawDamage = Math.max(1, Math.floor(Math.max(Number(member.physical_attack), Number(member.magic_attack)) * Math.max(0, Number(effect.throwable.damageScale))));
    const weather = dynamicWeatherElementMultiplier(environment?.modifiers, effect.throwable.element, 'throwable', Number(member.id));
    const damage = directDamageVariance(Math.max(1, Math.floor(rawDamage * elemental * weather * (1 + exposed / 100) * (1 - Math.min(80, barrier) / 100) * (isBossComponent(target) ? 1 : bossBodyDamageMultiplier(target, targets)))));
    const oldTargetHp = Number(target.current_hp);
    const shield = ruleBridge ? await ruleBridge.takeHit(ruleBridge.units.find(unit => unit.key === `target:${target.id}`)!, damage)
      : await absorbLifeShield(connection, sessionId, 'target', Number(target.id), Number(target.hp_max), damage);
    if (!ruleBridge) { target.current_hp = Math.max(0, oldTargetHp - (damage - shield.absorbed)); if (!target.current_hp) target.is_defeated = 1; }
    await connection.execute('UPDATE combat_threat SET threat=threat+? WHERE session_id=? AND spawn_id=? AND character_id=?', [damage, sessionId, target.id, member.id]);
    messages.push(`对${combatUnitLabel(target)}造成 ${damage} 点${effect.throwable.element}属性直击伤害${lifeShieldAbsorptionText(shield)}(${oldTargetHp}→${target.current_hp})`);
  }
  if (effect.status) {
    const targetKind = effect.target === 'enemy' ? 'target' : 'member';
    if (targetKind === 'member') await applyAlchemyStatus(connection, sessionId, targetKind, Number(member.id), effect.status, messages);
    else for (const statusTarget of statusTargets) {
      if (statusTarget.is_defeated) continue;
      const targetCooldowns = jsonObject(statusTarget.cooldowns);
      if (statusTarget.monster_class === 'boss' && targetCooldowns[alchemyBossResistanceKey]) {
        messages.push(`${combatUnitLabel(statusTarget)}已有炼金抗性，还是别用了吧`);
        continue;
      }
      const bossControl=statusTarget.monster_class==='boss'&&['stun','alchemy_confusion','bind','imbalance'].includes(effect.status.code);
      await applyAlchemyStatus(connection, sessionId, targetKind, Number(statusTarget.id), {...effect.status,chance:Math.max(0,Math.min(100,Number(effect.status.chance??100)))*(bossControl?bossControlChanceMultiplier:1),turns:bossControl&&['stun','alchemy_confusion'].includes(effect.status.code)?1:effect.status.turns}, messages);
      // 首领按“尝试一次”获得本场炼金抗性，避免用 50% / 20% 药剂反复赌中控制。
      if (isAlchemyControlDebuff(effect) && statusTarget.monster_class === 'boss') {
        targetCooldowns[alchemyBossResistanceKey] = true;
        statusTarget.cooldowns = targetCooldowns;
        messages.push(`${combatUnitLabel(statusTarget)}已对炼金控制与减益产生抗性`);
      }
    }
  }
  if(effect.experienceBonusPct||effect.partyDropBonusPct)return applyBattleElixir(connection,Number(member.id),effect);
  if(!bottleApplied&&!effect.status&&!effect.cleanse&&!effect.throwable&&Number(member.current_hp)===oldHp&&Number(member.current_mp)===oldMp)return{consumed:false,message:'当前无需回复，未消耗道具。'};
  if (perBattleLimit) { cooldowns[limitKey] = used + 1; member.cooldowns = cooldowns; }
  return { consumed: true, message: messages.join('｜') || '暂时没有产生效果' };
};

const applySkillEffects = async (connection: PoolConnection, sessionId: string, skillId: number, caster: { id: number; level?: number; tenacity_pierce?: number }, casterKind: 'member' | 'target', target: { id: number; level?: number; tenacity?: number }, targetKind: 'member' | 'target', timing: 'on_hit' | 'on_cast', log: string[], beneficialEffectBonusPct = 0, controlChanceMultiplier = 1, ruleBridge?: CombatRules) => {
  const [effects] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; effect_type: string; value: number; duration: number; max_stacks: number; stackable: number; effect_level: number; target_scope: 'enemy' | 'ally' | 'self'; skill_code: string })[]>(`SELECT e.id,e.code,e.name,e.effect_type,COALESCE(se.value_override,e.default_value) AS value,COALESCE(se.duration_override,e.default_duration) AS duration,e.max_stacks,e.stackable,se.effect_level,se.target_scope,s.code AS skill_code
    FROM skill_effects se JOIN effect_definitions e ON e.id=se.effect_id JOIN skill_definitions s ON s.id=se.skill_id WHERE se.skill_id=? AND se.trigger_timing=? ORDER BY e.id`, [skillId, timing]);
  let potency = 1; let durationChange = 0; let controlFactor = 1;
  if (casterKind === 'member') {
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT sd.tier,sp.specialization,sp.level FROM skill_definitions sd LEFT JOIN player_skill_specializations sp ON sp.skill_id=sd.id AND sp.character_id=? WHERE sd.id=?`, [caster.id, skillId]);
    const specialized = skillSpecialization({ code: '', category: '', tier: String(rows[0]?.tier), power: 0, mana_cost: 0, cooldown_turns: 0 }, Object.fromEntries(rows.map(row => [row.specialization, Number(row.level ?? 1)])));
    potency = specialized.effectFactor; durationChange = specialized.durationChange; controlFactor = specialized.controlChanceFactor;
  }
  let guardBreakStunned = false;
  for (const effect of effects) {
    if (effect.skill_code === 'guard_break' && effect.code === 'exposed' && !guardBreakStunned) continue;
    // “拿捏”仅作为盾反的被动效果说明；真正的冷却缩短在格挡成功时结算，不能在施放时创建状态。
    if (effect.code === 'shield_counter_cooldown') continue;
    const bonus = effect.target_scope === 'enemy' ? 0 : Math.max(0, beneficialEffectBonusPct);
    const rawValue = Number(effect.value) * (1 + Math.max(0, Number(effect.effect_level) - 1) * .25) * (1 + bonus / 100);
    const value = effect.effect_type === 'control' ? specializeControlChance(rawValue, controlFactor) : specializeEffectValue(effect.code, rawValue, potency);
    const duration = specializeEffectDuration(effect.code, Number(effect.duration), durationChange);
    const selfEffect = effect.target_scope === 'self' && !(targetKind === casterKind && ['purifying_light', 'frost_barrier'].includes(effect.skill_code));
    const effectTargetKind = selfEffect ? casterKind : targetKind; const targetId = selfEffect ? Number(caster.id) : Number(target.id);
    const isBossTarget = effectTargetKind === 'target' && targetKind === 'target' && (target as CombatTargetRow).monster_class === 'boss';
    let appliedValue = value; let appliedDuration = duration;
    const harmful = effect.target_scope === 'enemy' && ['damage_over_time', 'stat_modifier', 'control'].includes(effect.effect_type);
    const talentSource=ruleBridge?.units.find(unit=>unit.key===`${casterKind}:${caster.id}`),talentRecipient=ruleBridge?.units.find(unit=>unit.key===`${effectTargetKind}:${targetId}`);
    if(!harmful&&talentSource&&talentRecipient){
      talentSupport(talentSource,talentRecipient);
      if(hasTalent(talentRecipient,'I07')&&['attack','magic','defense','magic_defense','speed','accuracy','life_shield','barrier','battle_cry','precision','sprint'].includes(effect.code))appliedValue*=1.5;
      if(effect.code==='life_shield'&&hasTalent(talentRecipient,'H01'))appliedValue*=.5;
    }
    if (harmful) {
      const casterPierce = casterKind === 'member' ? Number(caster.tenacity_pierce ?? 0) : monsterCombatStatsForPlayer(caster as CombatTargetRow, Number(target.level ?? 1)).tenacityPierce;
      const targetTenacity = targetKind === 'member' ? Number(target.tenacity ?? 0) : monsterCombatStatsForPlayer(target as CombatTargetRow, Number(caster.level ?? 1)).tenacity;
      const contest = tenacityContest(casterPierce, targetTenacity, Number(caster.level ?? 1) - Number(target.level ?? 1), value);
      let controlChance = contest.controlChance * controlChanceMultiplier;
      if (effect.effect_type === 'control' && effectTargetKind === 'member') {
        const [resists] = await connection.execute<(RowDataPacket & { value: number })[]>(`SELECT ce.value FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id
          WHERE ce.session_id=? AND ce.target_kind='member' AND ce.target_id=? AND e.code='inheritance_control_resist'`, [sessionId, targetId]);
        const resistance = resists.reduce((total, row) => total + Number(row.value), 0);
        controlChance *= 1 - Math.min(80, resistance) / 100;
      }
      if (effect.effect_type === 'control' && Math.random() >= controlChance) { log.push(`${effectMessage(effect, value, Number(effect.duration), 1, effectMarkerForTarget(effectTargetKind))}（抵抗）`); continue; }
      const valueMultiplier = effect.effect_type === 'damage_over_time' ? contest.damageOverTimeMultiplier : contest.harmfulMultiplier;
      appliedValue = Math.round(value * valueMultiplier * 10) / 10;
      appliedDuration = Math.max(1, Math.round(duration * contest.harmfulMultiplier));
    }
    if (effect.effect_type === 'control') appliedDuration = Math.min(isBossTarget ? 1 : 3, appliedDuration);
    if (effect.code === 'regeneration' && casterKind === 'member') appliedValue += (await modifiersFor(connection, Number(caster.id))).regenerationBonusPct;
    // 首领持续伤害仍先走韧性对抗；1.5% 只是最终单层结算上限，不能绕过高韧性的压制。
    if (effect.effect_type === 'damage_over_time' && isBossTarget) appliedValue = Math.min(1.5, appliedValue);
    if (effect.code === 'life_shield') {
      const recipient = selfEffect ? caster : target;
      const hpMax = Number((recipient as { hp_max?: number }).hp_max ?? 0);
      let shieldAmount = Math.floor(hpMax * Math.max(0, appliedValue) / 100);
      const source = ruleBridge?.units.find(unit => unit.key === `${casterKind}:${caster.id}`);
      const ally = ruleBridge?.units.find(unit => unit.key === `${effectTargetKind}:${targetId}`);
      if (source && ally && shieldAmount > 0 && ruleBridge!.shieldValue(ally) < hpMax && ruleBridge!.status(source, 'beat')) {
        shieldAmount = Math.floor(shieldAmount * (1 + ruleBridge!.value(source, 'beat') / 100)); await ruleBridge!.consume(source, 'beat');
      }
      const shield = await grantLifeShield(connection, sessionId, effectTargetKind, targetId, hpMax, shieldAmount, appliedDuration);
      if (shield.added) log.push(effectMessage(effect, shield.added, appliedDuration, 1, effectMarkerForTarget(effectTargetKind)));
      else log.push(`${effectMarkerForTarget(effectTargetKind)}${effect.name}${effectMarkerForTarget(effectTargetKind)}总量已达生命上限，未能获得新的护盾层`);
      continue;
    }
    if (effect.effect_type === 'cleanse') {
      const limit = nativeCleanseLimit(effect.skill_code);
      const sourceUnit = ruleBridge?.units.find(unit => unit.key === `${casterKind}:${caster.id}`);
      const recipient = ruleBridge?.units.find(unit => unit.key === `${effectTargetKind}:${targetId}`);
      if (ruleBridge && sourceUnit && recipient) await ruleBridge.dispel(sourceUnit, recipient, true, limit);
      else {
        const [removable] = await connection.execute<RowDataPacket[]>(`SELECT ce.id FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=? AND ce.target_kind=? AND ce.target_id=? AND e.code IN ('vulnerability','sword_break','armor_shatter','magic_shatter','slow','bind','imbalance','burn','poison','bleeding','rending','stun','sleep','fear','confusion','alchemy_confusion','blind','silence','exposed','evasion_down') ORDER BY ce.id`, [sessionId, effectTargetKind, targetId]);
        const selected = removable.slice(0, limit);
        if (selected.length) await connection.execute(`DELETE FROM combat_status_effects WHERE session_id=? AND id IN (${selected.map(() => '?').join(',')})`, [sessionId, ...selected.map(row => row.id)]);
      }
      log.push(effectMessage(effect, value, Number(effect.duration), 1, effectMarkerForTarget(effectTargetKind))); continue;
    }
    const [existing] = await connection.execute<(RowDataPacket & { id: number; stacks: number })[]>('SELECT id,stacks FROM combat_status_effects WHERE session_id=? AND target_kind=? AND target_id=? AND effect_id=? FOR UPDATE', [sessionId, effectTargetKind, targetId, effect.id]);
    if(!existing.length&&harmful&&!isHardControlEffect(effect.code)&&talentRecipient&&talentSource&&hasTalent(talentRecipient,'G05'))log.push(`　➥${talentRecipient.name}受到${talentSource.name}施加的${effect.name}。`);
    if (effect.stackable) {
      const currentStacks = existing.reduce((total, row) => total + Number(row.stacks), 0);
      const maxStacks = effect.code === 'poison' && isBossTarget ? Math.min(3, Number(effect.max_stacks)) : Number(effect.max_stacks);
      const stacks = Math.min(maxStacks, currentStacks + 1);
      if (currentStacks < maxStacks) await connection.execute('INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns,source_key) VALUES (?,?,?,?,?,?,?,?)', [sessionId, effectTargetKind, targetId, effect.id, effect.effect_level, appliedValue, appliedDuration, `${casterKind}:${caster.id}`]);
      log.push(effectMessage(effect, appliedValue, appliedDuration, stacks, effectMarkerForTarget(effectTargetKind)));
    } else if (existing[0]) {
      await connection.execute('UPDATE combat_status_effects SET effect_level=?,value=?,stacks=1,remaining_turns=GREATEST(remaining_turns,?),source_key=? WHERE id=?', [effect.effect_level, appliedValue, appliedDuration, `${casterKind}:${caster.id}`, existing[0].id]);
      log.push(effectMessage(effect, appliedValue, appliedDuration, 1, effectMarkerForTarget(effectTargetKind)));
    } else {
      await connection.execute('INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns,source_key) VALUES (?,?,?,?,?,?,?,?)', [sessionId, effectTargetKind, targetId, effect.id, effect.effect_level, appliedValue, appliedDuration, `${casterKind}:${caster.id}`]);
      log.push(effectMessage(effect, appliedValue, appliedDuration, 1, effectMarkerForTarget(effectTargetKind)));
    }
    if (effect.skill_code === 'guard_break' && effect.code === 'stun') guardBreakStunned = true;
  }
};

const processTurnEffects = async (connection: PoolConnection, sessionId: string, targetKind: 'member' | 'target', targetId: number, members: CombatMemberRow[], targets: CombatTargetRow[], log: string[], absorb: typeof absorbLifeShield = absorbLifeShield, rules?: CombatRules) => {
  const effects = (await activeCombatEffects(connection, sessionId)).filter(effect => effect.target_kind === targetKind && Number(effect.target_id) === targetId);
  const healingCut = effects.filter(effect => effect.code === 'advanced_healing_cut').reduce((total, effect) => total + Number(effect.value) * Number(effect.stacks), 0);
  const bossDotDamageByCode = new Map<string, number>();
  const venomDamageBonusCache = new Map<number, number>();
  const venomDamageBonusFor = async (sourceId: number) => {
    if (!sourceId) return 0;
    const cached = venomDamageBonusCache.get(sourceId);
    if (cached !== undefined) return cached;
    const value = (await modifiersFor(connection, sourceId)).venomDamagePct;
    venomDamageBonusCache.set(sourceId, value);
    return value;
  };
  let controlled = false;
  const prayerHymns = effects.filter(effect => effect.code === 'prayer_hymn' && effect.target_kind === 'member');
  if (prayerHymns.length) {
    const member = members.find(item => Number(item.id) === targetId);
    if (!member || member.is_defeated) {
      await connection.execute(`DELETE FROM combat_status_effects WHERE id IN (${prayerHymns.map(() => '?').join(',')})`, prayerHymns.map(effect => effect.id));
    } else {
      const oldHp = Number(member.current_hp); const oldMp = Number(member.current_mp);
      const totalPercent = prayerHymns.reduce((total, effect) => total + Number(effect.value) * Number(effect.stacks), 0);
      const hpAmount = receivedHealingAmount(Math.max(1, Math.floor(Number(member.hp_max) * totalPercent / 100)), (await modifiersFor(connection, Number(member.id))).healingReceivedPct);
      const mpAmount = Math.max(1, Math.floor(Number(member.mp_max) * totalPercent / 100));
      member.current_hp = Math.min(Number(member.hp_max), oldHp + hpAmount);
      member.current_mp = Math.min(Number(member.mp_max), oldMp + mpAmount);
      const stacks = prayerHymns.reduce((total, effect) => total + Number(effect.stacks), 0);
      log.push(`§&${prayerHymns[0]!.name}(${stacks})&恢复 ${hpAmount} HP、${mpAmount} MP(${oldHp}→${member.current_hp}｜${oldMp}→${member.current_mp})`);
      for (const effect of prayerHymns) {
        if (Number(effect.remaining_turns) <= 1) await connection.execute('DELETE FROM combat_status_effects WHERE id=?', [effect.id]);
        else await connection.execute('UPDATE combat_status_effects SET remaining_turns=remaining_turns-1 WHERE id=?', [effect.id]);
      }
    }
  }
  for (const effect of effects) {
    if (effect.code === 'prayer_hymn' && effect.target_kind === 'member') continue;
    const target = effect.target_kind === 'member' ? members.find(member => Number(member.id) === Number(effect.target_id)) : targets.find(monster => Number(monster.id) === Number(effect.target_id));
    if (!target || target.is_defeated) { await connection.execute('DELETE FROM combat_status_effects WHERE id=?', [effect.id]); continue; }
    if (effect.effect_type === 'damage_over_time' || effect.effect_type === 'heal_over_time') {
      const maxHp = Number(effect.target_kind === 'member' ? (target as CombatMemberRow).hp_max : (target as CombatTargetRow).hp_max);
      const oldHp = Number((target as any).current_hp);
      const poisonCooldowns = jsonObject((target as CombatTargetRow | CombatMemberRow).cooldowns);
      const venomSourceId = effect.code === 'poison' && effect.target_kind === 'target' ? Number(poisonCooldowns.advanced_venom_source ?? 0) : 0;
      const mentorVenomDamagePct = effect.code === 'poison' && effect.target_kind === 'member' ? Number(poisonCooldowns.advanced_mentor_venom_bonus ?? 0) : 0;
      const venomDamagePct = venomSourceId ? await venomDamageBonusFor(venomSourceId) : mentorVenomDamagePct;
      const rawAmount = effect.code === 'lost_health_poison'
        ? Math.floor(Math.max(0, maxHp - oldHp) * Number(effect.value) * Number(effect.stacks) / 100)
        : Math.max(1, Math.floor(maxHp * Number(effect.value) * Number(effect.stacks) / 100));
      const enhancedDotAmount = effect.code === 'poison' ? Math.max(1, Math.floor(rawAmount * (1 + venomDamagePct / 100))) : rawAmount;
      const baseAmount = effect.effect_type === 'heal_over_time' && effect.target_kind === 'member' ? receivedHealingAmount(enhancedDotAmount, (await modifiersFor(connection, Number((target as CombatMemberRow).id))).healingReceivedPct) : enhancedDotAmount;
      const bossDotCap = effect.effect_type === 'damage_over_time' && effect.target_kind === 'target' && (target as CombatTargetRow).monster_class === 'boss' ? Math.max(1, Math.floor(maxHp * .015)) : undefined;
      // 剧毒保留“每层”上限与三层压制；其余持续掉血即使可叠加，也只能合计结算 1.5%。
      const nonPoisonBossDotCap = bossDotCap !== undefined && effect.code !== 'poison' ? Math.max(0, bossDotCap - Number(bossDotDamageByCode.get(effect.code) ?? 0)) : undefined;
      const receiver = rules?.units.find(u => u.key === `${effect.target_kind}:${effect.target_id}`);
      let amount = effect.effect_type === 'heal_over_time' ? reducedHealingAmount(baseAmount, healingCut) : nonPoisonBossDotCap !== undefined ? Math.min(baseAmount, nonPoisonBossDotCap) : bossDotCap === undefined ? baseAmount : Math.min(baseAmount, bossDotCap);
      if (effect.effect_type === 'damage_over_time' && receiver && hasTalent(receiver, 'G07') && canDispelCombatEffect(effect.code, 'ordinary')) amount = Math.floor(amount * .35);
      if (nonPoisonBossDotCap !== undefined) bossDotDamageByCode.set(effect.code, Number(bossDotDamageByCode.get(effect.code) ?? 0) + amount);
      const shield = effect.effect_type === 'damage_over_time'
        ? await absorb(connection, sessionId, effect.target_kind, Number(effect.target_id), maxHp, amount)
        : undefined;
      const hpAmount = effect.effect_type === 'damage_over_time' ? amount - Number(shield?.absorbed ?? 0) : amount;
      (target as any).current_hp = effect.effect_type === 'damage_over_time' ? Math.max(0, oldHp - hpAmount) : Math.min(maxHp, oldHp + amount);
      if (effect.effect_type === 'damage_over_time' && receiver) talentRecordEnemyDamage(rules?.units.find(u => u.key === effect.source_key), receiver, Math.max(0, oldHp - Number((target as any).current_hp)));
      if (!(target as any).current_hp) (target as any).is_defeated = 1;
      const marker: EffectMarker = '&';
      if (effect.code === 'prayer_hymn' && effect.target_kind === 'member') { const member = target as CombatMemberRow; const oldMp = Number(member.current_mp); const mpAmount = Math.max(1, Math.floor(Number(member.mp_max) * Number(effect.value) * Number(effect.stacks) / 100)); member.current_mp = Math.min(Number(member.mp_max), oldMp + mpAmount); log.push(`§${marker}${effect.name}${marker}恢复 ${amount} HP、${mpAmount} MP(${oldHp}→${member.current_hp}｜${oldMp}→${member.current_mp})`); }
      else log.push(`§${marker}${effect.name}${marker}${effect.effect_type === 'damage_over_time' ? '损失' : '恢复'} ${hpAmount} HP${effect.effect_type === 'damage_over_time' ? lifeShieldAbsorptionText(shield!) : ''}${effect.code === 'poison' && venomDamagePct ? `（蚀痕+${venomDamagePct}%）` : ''}(${oldHp}→${(target as any).current_hp})`);
      if (effect.effect_type === 'damage_over_time' && effect.target_kind === 'target') {
        const sourceId = Number(jsonObject((target as CombatTargetRow).cooldowns).advanced_venom_source ?? 0);
        if (sourceId) await gainStoredCombatResource(connection, sessionId, sourceId, 15, `【${effect.name}】结算`, log);
      }
    }
    if (effect.effect_type === 'mana_regen') {
      const maxMp = Number(effect.target_kind === 'member' ? (target as CombatMemberRow).mp_max : (target as CombatTargetRow).current_mp); const oldMp = Number((target as any).current_mp); const amount = Math.max(1, Math.floor(maxMp * Number(effect.value) * Number(effect.stacks) / 100));
      (target as any).current_mp = Math.min(maxMp, oldMp + amount);
      log.push(`§&${effect.name}&恢复 ${amount} MP(${oldMp}→${(target as any).current_mp})`);
    }
    if (effect.effect_type === 'control') {
      controlled = true;
      log.push(`§&${effect.name}&无法行动`);
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

/** 从当前本体的最终面板派生临时部位；这些 spawn 不进入地图，也不会继承随机 Boss 词条。 */
const spawnRegionalBossComponents = async (connection: PoolConnection, sessionId: string, bodies: SpawnRow[], members: Array<Pick<CharacterRow, 'id'>>) => {
  for (const body of bodies) {
    const [templateRows] = await connection.execute<(RowDataPacket & { code: string })[]>('SELECT code FROM monster_templates WHERE id=? LIMIT 1 FOR UPDATE', [Number(body.template_id ?? 0)]);
    const bodyCode = String(templateRows[0]?.code ?? ''); const definitions = regionalBossComponentsFor(bodyCode);
    if (!definitions.length) continue;
    const [locations] = await connection.execute<(RowDataPacket & { region_id: number; pos_x: number; pos_y: number; pos_z: number })[]>('SELECT region_id,pos_x,pos_y,pos_z FROM monster_spawns WHERE id=? FOR UPDATE', [body.id]);
    const location = locations[0]; if (!location) continue;
    const [templates] = await connection.execute<(RowDataPacket & { id: number; code: string })[]>(`SELECT id,code FROM monster_templates WHERE code IN (${definitions.map(() => '?').join(',')}) FOR UPDATE`, definitions.map(definition => definition.templateCode));
    const bodyStats = monsterCombatStats(body);
    for (let index = 0; index < definitions.length; index += 1) {
      const definition = definitions[index]; const template = templates.find(row => row.code === definition.templateCode); if (!template) continue;
      const stats = regionalBossComponentStats(bodyStats, definition);
      const traits: MonsterTrait[] = [
        { code: 'summoned', name: '战斗部位' },
        { code: 'boss_component', name: '', body_spawn_id: Number(body.id), body_code: bodyCode, part_key: definition.key, stats } as BossComponentTrait
      ];
      const [result] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        template.id, location.region_id, 3_000_000 + Number(body.id), 3_000_000 + index, location.pos_z, body.level,
        body.constitution, body.spirit, body.strength, body.intelligence, body.agility, body.perception, stats.hpMax, JSON.stringify([]), JSON.stringify(traits)
      ]);
      await connection.execute('INSERT INTO combat_targets (session_id,spawn_id,current_mp,cooldowns) VALUES (?,?,?,JSON_OBJECT())', [sessionId, result.insertId, 0]);
      for (const member of members) await connection.execute('INSERT INTO combat_threat (session_id,spawn_id,character_id,threat) VALUES (?,?,?,1)', [sessionId, result.insertId, member.id]);
    }
  }
};

const clearSummonedTargets = async (connection: PoolConnection, sessionId: string) => {
  await connection.execute(`UPDATE monster_spawns s JOIN combat_targets ct ON ct.spawn_id=s.id
    SET s.current_hp=0,s.defeated_at=NOW(),ct.is_defeated=1 WHERE ct.session_id=? AND s.defeated_at IS NULL AND JSON_CONTAINS(s.traits_json,JSON_OBJECT('code','summoned'))`, [sessionId]);
};

const clearCombatSpirits = async (connection: PoolConnection, sessionId: string) => {
  const [endState] = await connection.execute<RowDataPacket[]>('SELECT state FROM combat_sessions WHERE id=?', [sessionId]);
  await finishCombatAutomatons(connection, sessionId, endState[0]?.state === 'victory');
  await connection.execute('DELETE FROM combat_spirits WHERE session_id=?', [sessionId]);
};

const spiritCombatStats = (member: CombatMemberRow, definition: SpiritDefinition): CombatSpiritStats => ({
  physicalAttack: Math.max(1, Math.floor(Number(member.physical_attack) * definition.statScale.physicalAttack)), magicAttack: Math.max(1, Math.floor(Number(member.magic_attack) * definition.statScale.magicAttack)),
  physicalDefense: Math.max(1, Math.floor(Number(member.physical_defense) * definition.statScale.physicalDefense)), magicDefense: Math.max(1, Math.floor(Number(member.magic_defense) * definition.statScale.magicDefense)),
  accuracy: Math.max(1, Math.floor(Number(member.accuracy) * definition.statScale.accuracy)), evasion: Math.max(1, Math.floor(Number(member.evasion) * definition.statScale.evasion)),
  crit: Math.max(1, Math.floor(Number(member.crit_rate_bp) * definition.statScale.crit)), speed: Math.max(1, Math.floor(Number(member.speed) * definition.statScale.speed))
});
const storedSpiritStats = (spirit: CombatSpiritRow): CombatSpiritStats => {
  const stats = jsonObject(spirit.stats_json);
  return { physicalAttack: Math.max(1, Number(stats.physicalAttack ?? 1)), magicAttack: Math.max(1, Number(stats.magicAttack ?? 1)), physicalDefense: Math.max(1, Number(stats.physicalDefense ?? 1)), magicDefense: Math.max(1, Number(stats.magicDefense ?? 1)), accuracy: Math.max(1, Number(stats.accuracy ?? 1)), evasion: Math.max(1, Number(stats.evasion ?? 1)), crit: Math.max(1, Number(stats.crit ?? 1)), speed: Math.max(1, Number(stats.speed ?? 1)) };
};

const summonCombatSpirit = async (connection: PoolConnection, sessionId: string, member: CombatMemberRow, definition: SpiritDefinition) => {
  const [passives] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.code=\'passive_spirit_breath\' LIMIT 1', [member.id]);
  const limit = passives[0] ? 3 : 1;
  const [existing] = await connection.execute<CombatSpiritRow[]>('SELECT owner_character_id,spirit_code,spirit_name,current_hp,hp_max,stats_json,remaining_turns FROM combat_spirits WHERE session_id=? AND owner_character_id=? AND spirit_code=? FOR UPDATE', [sessionId, member.id, definition.code]);
  if (existing[0]) {
    await connection.execute('UPDATE combat_spirits SET remaining_turns=? WHERE session_id=? AND owner_character_id=? AND spirit_code=?', [definition.duration, sessionId, member.id, definition.code]);
    return { refreshed: true, active: 0, limit };
  }
  const [active] = await connection.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM combat_spirits WHERE session_id=? AND owner_character_id=? FOR UPDATE', [sessionId, member.id]);
  if (Number(active[0]?.total ?? 0) >= limit) throw new Error(`灵位已满（${limit}/${limit}）。请等待其中一只灵回应完毕。`);
  const stats = spiritCombatStats(member, definition); const hpMax = Math.max(1, Math.floor(Number(member.hp_max) * definition.statScale.hp));
  await connection.execute('INSERT INTO combat_spirits (session_id,owner_character_id,spirit_code,spirit_name,current_hp,hp_max,stats_json,remaining_turns) VALUES (?,?,?,?,?,?,?,?)', [sessionId, member.id, definition.code, definition.name, hpMax, hpMax, JSON.stringify(stats), definition.duration]);
  return { refreshed: false, active: Number(active[0]?.total ?? 0) + 1, limit };
};

const refreshCombatSpiritEffect = async (connection: PoolConnection, sessionId: string, targetKind: 'member' | 'target', targetId: number, effectCode: string, value: number, turns: number, sourceKey: string | null = null) => {
  const [definitions] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM effect_definitions WHERE code=? LIMIT 1', [effectCode]);
  const definition = definitions[0]; if (!definition) return;
  const [existing] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT ce.id FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id
    WHERE ce.session_id=? AND ce.target_kind=? AND ce.target_id=? AND e.code=? LIMIT 1 FOR UPDATE`, [sessionId, targetKind, targetId, effectCode]);
  if (existing[0]) await connection.execute('UPDATE combat_status_effects SET source_key=IF(? >= value,?,source_key),value=GREATEST(value,?),remaining_turns=GREATEST(remaining_turns,?) WHERE id=?', [value, sourceKey, value, turns, existing[0].id]);
  else await connection.execute('INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns,source_key) VALUES (?,?,?,?,1,?,?,?)', [sessionId, targetKind, targetId, definition.id, value, turns, sourceKey]);
};

type LifeShieldResult = { incoming: number; absorbed: number; remaining: number; broken: boolean };

/** 生命护盾按层独立计时；不同来源共用总上限，避免反复叠加超过角色最大生命。 */
const grantLifeShield = async (connection: PoolConnection, sessionId: string, targetKind: 'member' | 'target', targetId: number, hpMax: number, amount: number, turns: number) => {
  const maximum = Math.max(0, Math.floor(hpMax)); const requested = Math.max(0, Math.floor(amount));
  if (!maximum || !requested) return { added: 0, remaining: 0 };
  const [shields] = await connection.execute<(RowDataPacket & { id: number; value: number; remaining_turns: number })[]>(`SELECT ce.id,ce.value,ce.remaining_turns FROM combat_status_effects ce
    JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=? AND ce.target_kind=? AND ce.target_id=? AND e.code='life_shield' ORDER BY ce.id FOR UPDATE`, [sessionId, targetKind, targetId]);
  const current = Math.min(maximum, shields.reduce((sum, shield) => sum + Math.max(0, Number(shield.value)), 0));
  const remaining = Math.min(maximum, current + requested); const added = remaining - current;
  if (!added) return { added: 0, remaining };
  const [definitions] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM effect_definitions WHERE code=\'life_shield\' LIMIT 1', []);
  if (!definitions[0]) return { added: 0, remaining: current };
  await connection.execute('INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns) VALUES (?,?,?,?,1,?,?)', [sessionId, targetKind, targetId, definitions[0].id, added, Math.max(1, Math.floor(turns))]);
  return { added, remaining };
};

const absorbLifeShield = async (connection: PoolConnection, sessionId: string, targetKind: 'member' | 'target', targetId: number, hpMax: number, incoming: number): Promise<LifeShieldResult> => {
  const damage = Math.max(0, Math.floor(incoming)); const maximum = Math.max(0, Math.floor(hpMax));
  if (!damage || !maximum) return { incoming: damage, absorbed: 0, remaining: 0, broken: false };
  const [shields] = await connection.execute<(RowDataPacket & { id: number; value: number })[]>(`SELECT ce.id,ce.value FROM combat_status_effects ce
    JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=? AND ce.target_kind=? AND ce.target_id=? AND e.code='life_shield' ORDER BY ce.id FOR UPDATE`, [sessionId, targetKind, targetId]);
  let left = damage; let total = Math.min(maximum, shields.reduce((sum, shield) => sum + Math.max(0, Number(shield.value)), 0));
  const before = total;
  for (const shield of shields) {
    if (!left) break;
    const available = Math.max(0, Math.min(total, Number(shield.value))); const absorbed = Math.min(left, available);
    left -= absorbed; total -= absorbed;
    if (available - absorbed <= 0) await connection.execute('DELETE FROM combat_status_effects WHERE id=?', [shield.id]);
    else await connection.execute('UPDATE combat_status_effects SET value=? WHERE id=?', [available - absorbed, shield.id]);
  }
  return { incoming: damage, absorbed: damage - left, remaining: total, broken: before > 0 && total <= 0 };
};

const lifeShieldAbsorptionText = (result: Pick<LifeShieldResult, 'absorbed'> & Partial<LifeShieldResult>) => result.absorbed ? `｜生命护盾吸收${result.absorbed}${result.broken ? '（破碎）' : result.remaining !== undefined ? `（余${result.remaining}）` : ''}` : '';

const gainStoredCombatResource = async (connection: PoolConnection, sessionId: string, characterId: number, amount: number, _reason: string, log: string[], _characterName?: string) => {
  const [rows] = await connection.execute<CombatProfessionResourceRow[]>('SELECT character_id,resource_name,current_value,max_value FROM combat_profession_resources WHERE session_id=? AND character_id=? FOR UPDATE', [sessionId, characterId]);
  const resource = rows[0]; if (!resource || amount <= 0) return 0;
  const previous = Number(resource.current_value); const next = Math.min(Number(resource.max_value), previous + Math.floor(amount)); const gained = next - previous;
  if (!gained) return 0;
  await connection.execute('UPDATE combat_profession_resources SET current_value=? WHERE session_id=? AND character_id=?', [next, sessionId, characterId]);
  log.push(`&${resource.resource_name}&${previous}→${next}`);
  return gained;
};

/** 灵兽在自己的速度回合独立出手，且被击倒后会立刻退出本场战斗。 */
const resolveCombatSpirits = async (connection: PoolConnection, sessionId: string, members: CombatMemberRow[], targets: CombatTargetRow[], log: string[], only?: CombatSpiritRow, absorb: typeof absorbLifeShield = absorbLifeShield, ruleBridge?: CombatRules) => {
  const [stored] = await connection.execute<CombatSpiritRow[]>('SELECT owner_character_id,spirit_code,spirit_name,current_hp,hp_max,stats_json,remaining_turns FROM combat_spirits WHERE session_id=? ORDER BY owner_character_id,spirit_code FOR UPDATE', [sessionId]);
  const environment = await combatEnvironmentFor(connection, sessionId);
  const effects = await activeCombatEffects(connection, sessionId);
  const effectValue = (kind: 'member' | 'target', targetId: number, code: string) => effects.filter(effect => effect.target_kind === kind && Number(effect.target_id) === targetId && effect.code === code).reduce((sum, effect) => sum + Number(effect.value) * Number(effect.stacks), 0);
  const spirits = only ? stored.filter(spirit => Number(spirit.owner_character_id) === Number(only.owner_character_id) && spirit.spirit_code === only.spirit_code) : stored;
  for (const spirit of spirits) {
    const owner = members.find(member => Number(member.id) === Number(spirit.owner_character_id));
    if (!owner || owner.is_defeated) { await connection.execute('DELETE FROM combat_spirits WHERE session_id=? AND owner_character_id=? AND spirit_code=?', [sessionId, spirit.owner_character_id, spirit.spirit_code]); continue; }
    const spiritState = jsonObject(spirit.stats_json); const overload = Math.max(0, Number(spiritState.overload ?? 0)); const stats = storedSpiritStats(spirit);
    const activeTargets = targets.filter(target => !target.is_defeated);
    if (spirit.spirit_code === 'ember') {
      const spiritTargets = overload ? activeTargets : [activeTargets.find(item => Number(item.id) === Number(owner.selected_target_id)) ?? activeTargets[0]].filter(Boolean) as CombatTargetRow[];
      const strikeTarget = async (target: CombatTargetRow) => {
        if (target.is_defeated) return;
        const monster = monsterCombatStatsForPlayer(target, Number(owner.level));
        const magicDefenseReduction = effectValue('target', Number(target.id), 'magic_shatter');
        const strike = resolveStrike(stats.magicAttack * (overload ? .85 : .82), monster.magicDefense * (1 - Math.min(90, magicDefenseReduction) / 100), stats.accuracy, monster.evasion, stats.crit, monster.critResist, stats.crit, monster.critReduction, false, false);
        if (!strike.hit) log.push(`&灵契&〖${spirit.spirit_name}〗追击${combatUnitLabel(target)}，但攻击被闪避。`);
        else {
          const elemental = elementalMultiplier(owner.element_mastery_json, target.element_resistance_json, '火'); const oldHp = Number(target.current_hp);
          const unit = ruleBridge?.units.find(unit => unit.key === `target:${target.id}`);
          const bodyMultiplier = unit && ruleBridge?.hooks.bodyMultiplier ? ruleBridge.hooks.bodyMultiplier(unit) : bossBodyDamageMultiplier(target, targets);
          const weather = dynamicWeatherElementMultiplier(environment?.modifiers, '火', 'spirit', Number(owner.id)); const partAoeMultiplier = overload && isBossComponent(target) && Number(target.id) !== Number(owner.selected_target_id) ? .5 : 1;
          const talentOwner=ruleBridge?.units.find(u=>u.key===`member:${owner.id}`),command=talentOwner&&hasTalent(talentOwner,'A10')&&talentOwner.opening?.settings?.command===`spirit:${spirit.spirit_code}`?2:1;
          let damage = directDamageVariance(Math.max(1, Math.floor(strike.damage * elemental * weather * partAoeMultiplier * (isBossComponent(target) ? 1 : bodyMultiplier)*command)));
          const shield = unit && ruleBridge ? await ruleBridge.takeHit(unit, damage, 1, Boolean(overload)) : await absorb(connection, sessionId, 'target', Number(target.id), Number(target.hp_max), damage);
          if ('damage' in shield) damage = Number(shield.damage);
          else { target.current_hp = Math.max(0, oldHp - (damage - shield.absorbed)); if (!target.current_hp) target.is_defeated = 1; }
          await connection.execute('UPDATE combat_threat SET threat=threat+? WHERE session_id=? AND spawn_id=? AND character_id=?', [damage, sessionId, target.id, owner.id]);
          log.push(`&灵契&〖${spirit.spirit_name}〗追击${combatUnitLabel(target)}，造成 ${damage} 点火属性魔法伤害${lifeShieldAbsorptionText(shield)}(${oldHp}→${target.current_hp})`);
        }
      };
      if (ruleBridge) await ruleBridge.areaDamage(spiritTargets.map(target => ruleBridge.units.find(unit => unit.key === `target:${target.id}`)!), unit => strikeTarget(spiritTargets.find(target => `target:${target.id}` === unit.key)!));
      else for (const target of spiritTargets) await strikeTarget(target);
    } else if (spirit.spirit_code === 'tide') {
      const allies = overload ? members.filter(member => !member.is_defeated) : [[...members].filter(member => !member.is_defeated).sort((left, right) => Number(left.current_hp) / Math.max(1, Number(left.hp_max)) - Number(right.current_hp) / Math.max(1, Number(right.hp_max)))[0]].filter(Boolean) as CombatMemberRow[];
      for (const ally of allies) { const oldHp = Number(ally.current_hp); const amount = receivedHealingAmount(Math.max(1, Math.floor(Math.max(stats.magicAttack * .72, overload ? Number(ally.hp_max) * .08 : 0))), (await modifiersFor(connection, Number(ally.id))).healingReceivedPct); ally.current_hp = Math.min(Number(ally.hp_max), oldHp + amount); if (overload) await refreshCombatSpiritEffect(connection, sessionId, 'member', Number(ally.id), 'barrier', 8, 1); log.push(`&灵契&〖${spirit.spirit_name}〗为${combatUnitLabel(ally)}恢复 ${ally.current_hp - oldHp} HP(${oldHp}→${ally.current_hp})`); }
    } else if (spirit.spirit_code === 'bark') {
      const barrier = overload ? 14 : 8; for (const ally of members.filter(member => !member.is_defeated)) await refreshCombatSpiritEffect(connection, sessionId, 'member', Number(ally.id), 'barrier', barrier, 2);
      log.push(`&灵契&〖${spirit.spirit_name}〗为全队续上 ${barrier}% 减伤壁垒(2)`);
    } else if (spirit.spirit_code === 'gale') {
      const slow = overload ? 20 : 12; for (const target of activeTargets) await refreshCombatSpiritEffect(connection, sessionId, 'target', Number(target.id), 'slow', slow, 1);
      if (activeTargets.length) log.push(`&灵契&〖${spirit.spirit_name}〗以风压使 ${activeTargets.length} 名敌人迟缓 ${slow}%(1)`);
    } else if (spirit.spirit_code === 'moon') {
      const oldMp = Number(owner.current_mp); const amount = Math.max(1, Math.floor(Number(owner.mp_max) * (overload ? .10 : .06))); owner.current_mp = Math.min(Number(owner.mp_max), oldMp + amount);
      const target = activeTargets.find(item => Number(item.id) === Number(owner.selected_target_id)) ?? activeTargets[0];
      if (target) await refreshCombatSpiritEffect(connection, sessionId, 'target', Number(target.id), 'exposed', overload ? 20 : 12, 1);
      log.push(`&灵契&〖${spirit.spirit_name}〗为${combatUnitLabel(owner)}回流 ${owner.current_mp - oldMp} MP${target ? `，并暴露${combatUnitLabel(target)}(1)` : ''}`);
    }
    await gainStoredCombatResource(connection, sessionId, Number(owner.id), 15, '灵体回应', log, owner.name);
    if (Number(spirit.remaining_turns) <= 1 || overload === 1) { await connection.execute('DELETE FROM combat_spirits WHERE session_id=? AND owner_character_id=? AND spirit_code=?', [sessionId, spirit.owner_character_id, spirit.spirit_code]); log.push(`&灵契&〖${spirit.spirit_name}〗${overload === 1 ? '超载耗尽，' : ''}回应完毕，化作微光散去。`); }
    else await connection.execute("UPDATE combat_spirits SET remaining_turns=remaining_turns-1,stats_json=JSON_SET(stats_json,'$.overload',?) WHERE session_id=? AND owner_character_id=? AND spirit_code=?", [Math.max(0, overload - 1), sessionId, spirit.owner_character_id, spirit.spirit_code]);
  }
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
  const [versions] = await connection.execute<RowDataPacket[]>('SELECT cooldowns FROM combat_sessions WHERE id=? FOR UPDATE', [sessionId]);
  const useLuck = Number(jsonObject(versions[0]?.cooldowns).__rewardVersion ?? 0) >= negotiationVersion;
  const enemyCount = targets.filter(target => !isSummonedMonster(target) && !isBossComponent(target)).length;
  const [settled] = await connection.execute<RowDataPacket[]>(`SELECT spawn_id FROM monster_reward_settlements WHERE spawn_id IN (${targets.map(() => '?').join(',') || 'NULL'}) FOR UPDATE`, targets.map(target => Number(target.id)));
  const settledIds = new Set(settled.map(row => Number(row.spawn_id)));
  targets = targets.filter(target => !settledIds.has(Number(target.id)));
  await connection.execute('UPDATE combat_sessions SET state=\'victory\' WHERE id=?', [sessionId]);
  await clearCombatSpirits(connection, sessionId);
  await preparePartyAmbushHandoff(connection, sessionId, targets);
  const pursuitTargets = targets.filter(target => isCityPursuit(target));
  const testTargets = targets.filter(target => isBossTestMonster(target));
  if (testTargets.length) await connection.execute(`UPDATE boss_test_sessions SET state='finished',finished_at=NOW() WHERE boss_spawn_id IN (${testTargets.map(() => '?').join(',')}) AND state='active'`, testTargets.map(target => Number(target.id)));
  const rewardTargets = targets.filter(target => !isSummonedMonster(target) && !isCityPursuit(target) && !isBossTestMonster(target) && !isAdvancedProfessionTrialMonster(target));
  const playerMembers = members.filter(member => !member.npc_code);
  await achievementCombatVictory(connection,sessionId,members,rewardTargets.filter(target=>!isBossComponent(target)));
  const rewardMembers = playerMembers.filter(member => Boolean(member.stamina_eligible));
  const staminaSpent = await consumeVictoryStamina(connection, members, Math.max(1, enemyCount));
  for (const target of rewardTargets) await connection.execute("INSERT INTO monster_reward_settlements (spawn_id,channel,session_id) VALUES (?,'combat',?)", [target.id, sessionId]);
  const targetCodes = rewardTargets.length ? (await connection.execute<(RowDataPacket & { code: string })[]>(`SELECT code FROM monster_templates WHERE id IN (${rewardTargets.map(() => '?').join(',')})`, rewardTargets.map(target => Number(target.template_id))))[0].map(row => row.code) : [];
  const targetLevels = rewardTargets.map(target => Number(target.level));
  const eliteOrBossDefeats = rewardTargets.filter(target => ['elite', 'boss'].includes(String(target.monster_class))).length;
  for (const member of playerMembers) await recordAdvancedProfessionKills(connection, Number(member.id), targetCodes);
  for (const member of rewardMembers) {
    await recordOmniscientObservation(connection, Number(member.id), targetCodes);
    if (targetLevels.length) await awardOmniscientProficiency(connection, Number(member.id), targetLevels);
    await advanceEvolutionObservationBattle(connection, Number(member.id), { eliteOrBossDefeats, playerPartySize: rewardMembers.length });
  }
  const partySize = Math.min(4, rewardMembers.length);
  const partyExperienceBonus = ({ 1: 0, 2: .10, 3: .20, 4: .35 } as Record<number, number>)[partySize] ?? .35;
  const partyDropBonus = ({ 1: 0, 2: .60, 3: 1, 4: 1.5 } as Record<number, number>)[partySize] ?? 1.5;
  const [omniscientRows] = rewardMembers.length ? await connection.execute<(RowDataPacket & { level: number | null })[]>(`SELECT MAX(sp.level) AS level FROM characters c JOIN player_secondary_professions sp ON sp.character_id=c.id AND sp.profession_code='omniscient'
    WHERE c.secondary_profession_code='omniscient' AND c.id IN (${rewardMembers.map(() => '?').join(',')})`, rewardMembers.map(member => Number(member.id))) : [[] as any];
  const omniscientDropBonus = secondaryProfessionBonus(Number(omniscientRows[0]?.level ?? 0)) / 100;
  const [omniscientInsightRows] = rewardMembers.length ? await connection.execute<(RowDataPacket & { character_id: number; level: number | null })[]>(`SELECT c.id AS character_id,sp.level FROM characters c
    JOIN player_secondary_professions sp ON sp.character_id=c.id AND sp.profession_code='omniscient'
    WHERE c.secondary_profession_code='omniscient' AND c.id IN (${rewardMembers.map(() => '?').join(',')})`, rewardMembers.map(member => Number(member.id))) : [[] as any];
  const omniscientInsightBonus = new Map<number, number>(omniscientInsightRows.map(row => [Number(row.character_id), secondaryProfessionBonus(Number(row.level ?? 0)) / 100]));
  const [battleDropBuffs] = rewardMembers.length ? await connection.execute<(RowDataPacket & { buff_code: string })[]>(`SELECT buff_code FROM player_battle_buffs WHERE remaining_battles>0 AND character_id IN (${rewardMembers.map(() => '?').join(',')})`, rewardMembers.map(member => Number(member.id))) : [[] as any];
  const elixirDropBonus = battleDropBuffs.reduce((total, buff) => total + (buff.buff_code === 'minor_luck_elixir' ? .25 : Math.max(0, Number(/^alchemy_drop_(\d+(?:\.\d+)?)$/.exec(buff.buff_code)?.[1] ?? 0)) / 100), 0);
  const globalDrop = await globalDropMultiplier(connection); const globalCopper = await globalCopperMultiplier(connection);
  const totalExperience = rewardTargets.reduce((sum, target) => sum + Math.floor(Number(target.experience) * (1 + percentBonus(traitList(target.traits_json), 'experiencePct') / 100)), 0);
  const rewards: VictorySettlement['members'] = [];
  const rewardByMemberId = new Map<number, VictorySettlement['members'][number]>();
  const modifiersByMemberId = new Map<number, CombatModifiers>();
  for (const member of playerMembers) {
    if (!member.stamina_eligible) { rewards.push({ name: member.name, experience: 0, staminaInsufficient: true, drops: [], learned: [] }); continue; }
    const modifiers = await modifiersFor(connection, Number(member.id)); modifiersByMemberId.set(Number(member.id), modifiers);
    const experienceGain = await awardRealmExperience(connection, member, totalExperience * (1 + partyExperienceBonus) * modifiers.experienceMultiplier,{talent:{kind:'combat',parts:rewardTargets.map(target=>({key:String(target.template_id),amount:Number(target.experience),eligible:Math.abs(Number(target.level)-Number(member.level))<=5}))}});
    const experience = experienceGain.experience; const newLevel = experienceGain.level; const gainedPoints = experienceGain.gainedPoints;
    if(experience>0){await(await import('./companion.service')).grantCompanionExperience(connection,Number(member.id),totalExperience);await(await import('./aqua.service')).advanceAquaPermit(connection,Number(member.id));}
    if (gainedPoints) await recalculateCharacterStats(connection, Number(member.id));
    await advanceBountyProgress(connection, Number(member.id), rewardTargets.map(target => ({ spawnId: Number(target.id), templateId: Number(target.template_id) })));
    const drops: VictorySettlement['members'][number]['drops'] = [];
    const learned: VictorySettlement['members'][number]['learned'] = [];
    for (const target of rewardTargets) {
      const [rules] = await connection.execute<(RowDataPacket & { skill_id: number; name: string; chance: number; source_skill_code: string })[]>(`SELECT r.skill_id,s.name,r.chance,r.source_skill_code FROM monster_skill_learn_rules r JOIN skill_definitions s ON s.id=r.skill_id AND s.learn_cost<99 JOIN skill_definitions source ON source.code=r.source_skill_code AND source.category=s.category AND source.damage_type=s.damage_type WHERE r.monster_template_id=?`, [Number(target.template_id)]);
      for (const rule of rules) {
        const chance = Math.min(1, Number(rule.chance) + (omniscientInsightBonus.get(Number(member.id)) ?? 0));
        if (!stringList(target.skill_sequence).includes(rule.source_skill_code) || Math.random() > chance) continue;
        const [result] = await connection.execute<any>('INSERT IGNORE INTO player_skill_discoveries (character_id,skill_id) VALUES (?,?)', [member.id, rule.skill_id]);
        if (Number(result.affectedRows)) learned.push({ id: Number(rule.skill_id), name: rule.name });
      }
    }
    const reward = { name: member.name, experience, staminaSpent: staminaSpent.get(Number(member.id)), realmLocked: experienceGain.realmLocked, realmCapReached: experienceGain.realmCapReached, realmStage: experienceGain.realmStage,talentNotice:experienceGain.talentNotice, levelText: gainedPoints ? `升级至 Lv.${newLevel}，获得 ${gainedPoints} 技能点` : undefined, drops, learned };
    rewards.push(reward); rewardByMemberId.set(Number(member.id), reward);
  }
  const dungeonSecretCompleted = await completeDungeonSecretForLeader(connection, playerMembers.map(member => Number(member.id)), rewardTargets.map(target => Number(target.id)));
  const luckByMember = new Map<number, number>();
  if (useLuck) for (const member of rewardMembers) luckByMember.set(Number(member.id), (await hiddenAttributesFor(connection, Number(member.id))).luck);
  const luckMultiplier = teamLuckMultiplier([...luckByMember.values()]);
  const randomRecipient = () => weightedRecipient(rewardMembers, member => luckByMember.get(Number(member.id)) ?? 0);
  const grantDrop = async (recipient: CombatMemberRow, code: string, quantity: number) => {
    const [items] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; item_type: string; codex_id: string | null })[]>('SELECT id,code,name,item_type,codex_id FROM item_definitions WHERE code=?', [code]); const item = items[0]; const reward = rewardByMemberId.get(Number(recipient.id)); if (!item || !reward || quantity<=0) return;
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [recipient.id, item.id]);
    const coinValue = ({ copper_coin: 1, silver_coin: 100, gold_coin: 10000 } as Record<string, number>)[item.code] ?? 0;
    if (coinValue) {
      const grantedQuantity = Math.floor(quantity * globalCopper);
      if (!grantedQuantity) return;
      await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [coinValue * grantedQuantity, recipient.id]);
      const existing = reward.drops.find(drop => !drop.instanceId && drop.name === item.name && drop.itemType === item.item_type && drop.codexId === item.codex_id);
      if (existing) existing.quantity += grantedQuantity;
      else reward.drops.push({ name: item.name, quantity: grantedQuantity, itemType: item.item_type, codexId: item.codex_id });
    } else if (item.item_type === 'equipment' || item.item_type === 'device') for (let index = 0; index < quantity; index += 1) { const [result] = await connection.execute<any>('INSERT INTO player_item_instances (character_id,item_id) VALUES (?,?)', [recipient.id, item.id]); reward.drops.push({ name: item.name, quantity: 1, itemType: item.item_type, codexId: item.codex_id, instanceId: Number(result.insertId) }); }
    else {
      await grantInventory(connection, Number(recipient.id), Number(item.id), { unbound: quantity, trade: 0, personal: 0 });
      const existing = reward.drops.find(drop => !drop.instanceId && drop.name === item.name && drop.itemType === item.item_type && drop.codexId === item.codex_id);
      if (existing) existing.quantity += quantity;
      else reward.drops.push({ name: item.name, quantity, itemType: item.item_type, codexId: item.codex_id });
    }
    await achievementItem(connection,Number(recipient.id),Number(item.id));
  };
  // 幸运逐人乘算；互斥组额外批次独立选品种，生成与归属分别处理。
  for (const target of rewardTargets) {
    if (!rewardMembers.length) continue;
    const rawDrops: Array<Record<string, unknown> & { code?: string; chance?: number; group?: string }> = bossSkyDustDrops(jsonArray(target.drops_json).map(jsonObject), target).map(raw => ({ ...raw, group: String((raw as Record<string, unknown>).exclusive_group ?? '') }));
    const reference=randomRecipient(),modifiers=modifiersByMemberId.get(Number(reference.id))!;
    const traitDropBonus=percentBonus(traitList(target.traits_json),'dropPct')/100;
    const table=rawDrops.map(drop=>({code:resolvedDropCode(drop,Number(target.level)),chance:effectiveGoblinMaterialDropChance(target,drop),group:drop.group,
      probability:globalDrop*(1+traitDropBonus+partyDropBonus+omniscientDropBonus+elixirDropBonus)+modifiers.dropBonus/Math.max(.000001,effectiveGoblinMaterialDropChance(target,drop)),scale:luckMultiplier,
      min:Math.max(1,Math.floor(Number(drop.min_quantity??drop.quantity??1))),max:Math.max(1,Math.floor(Number(drop.max_quantity??drop.quantity??drop.min_quantity??1)))}));
    const generated=await talentDropPack(connection,Number(reference.id),table,`combat:${sessionId}:${target.id}`,target.monster_class==='boss');
    // 掉落包只生成一次；参照成员不独占整包，每件物品重新按幸运权重选择领取人。
    for (const drop of generated) {
      const allocations = new Map<CombatMemberRow, number>();
      for (let index = 0; index < drop.quantity; index++) {
        const recipient = randomRecipient();
        allocations.set(recipient, (allocations.get(recipient) ?? 0) + 1);
      }
      for (const [recipient, quantity] of allocations) await grantDrop(recipient, drop.code, quantity);
    }
  }
  if (rewardMembers.length) for (const target of rewardTargets.filter(target => traitList(target.traits_json).some(trait => trait.code === 'riot'))) {
    const [templates] = await connection.execute<(RowDataPacket & { code: string })[]>('SELECT code FROM monster_templates WHERE id=?', [Number(target.template_id)]);
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
  const goblinKingCompleted = await completeGoblinKingQuest(connection, targets);
  const evolutionCompleted = await completeEvolutionQuest(connection, targets);
  const advancedProfessionCompleted: { name: string; code: string; profession: string; passive: string; refundedSkillPoints: number; availableSkillPoints: number }[] = [];
  for (const target of targets) {
    const trial = advancedProfessionTrial(target); if (!trial?.profession_code || !trial.owner_character_id) continue;
    const profession = await completeAdvancedProfessionTrial(connection, Number(trial.owner_character_id), String(trial.profession_code));
    if (profession) advancedProfessionCompleted.push({ name: members.find(member => Number(member.id) === Number(trial.owner_character_id))?.name ?? '试炼者', code: profession.code, profession: profession.name, passive: profession.passive.name, refundedSkillPoints: profession.reset.restoredPoints, availableSkillPoints: profession.reset.availablePoints });
  }
  await consumeBattleBuffs(connection, members);
  return { kind: 'victory', members: rewards, advancedProfessionCompleted, arrivalPending, dungeonSecretCompleted, goblinKingCompleted, evolutionCompleted, pursuitCooldownMinutes: pursuitTargets.length ? 30 : undefined } as VictorySettlement;
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
  const [rows] = await pool.execute<SpawnRow[]>(`SELECT s.id,s.template_id,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json,t.element_mastery_json,t.element_resistance_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL AND ${visiblePursuitCondition('s')}`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id, character.id, character.id, character.id, character.id]);
  const appraisal = await appraisalProfileFor(pool, [character.id]);
  const [occupiedRows] = await pool.execute<(RowDataPacket & { spawn_id: number })[]>(`SELECT ct.spawn_id FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id
    WHERE cs.state='active' AND ct.spawn_id IN (${rows.map(() => '?').join(',') || 'NULL'})`, rows.map(row => row.id));
  const spawns = materializeMonsters(rows, appraisal.informationLevel >= 2); if (!spawns.length) return null;
  await withTransaction(async connection=>{
    await connection.query(`INSERT IGNORE INTO player_monster_codex (character_id,monster_template_id) VALUES ${spawns.map(() => '(?,?)').join(',')}`,spawns.flatMap(spawn=>[character.id,Number(spawn.template_id)]));
    for(const spawn of spawns.filter(s=>!isCityPursuit(s)&&!isBossTestMonster(s)&&!isAdvancedProfessionTrialMonster(s))){
      const traits=Array.isArray(spawn.traits_json)?spawn.traits_json:typeof spawn.traits_json==='string'?JSON.parse(spawn.traits_json):[];
      if(traits.some((t:any)=>['npc_sparring','boss_component','summoned'].includes(t.code)))continue;
      recordAchievement(connection,Number(character.id),[{metric:'ACH_E05',distinct:String(spawn.template_id)},{metric:'ACH_E06',distinct:String(spawn.template_id)}],'monster-discovery:'+spawn.template_id);
    }
  });
  const members = await partyCombatants(pool, character); const fastestMonster = Math.max(...spawns.map(spawn => monsterCombatStats(spawn).speed));
  const cityPursuit = isCityPursuit(spawns[0]);
  const [texts] = await pool.execute<(RowDataPacket & { description: string })[]>('SELECT description FROM monster_encounter_texts WHERE monster_template_id=? ORDER BY RAND() LIMIT 1', [Number(spawns[0]?.template_id ?? 0)]);
  return { character, spawns, occupied: occupiedRows.some(row => Number(row.spawn_id) === Number(spawns[0]?.id)), cityPursuit, canAmbush: !cityPursuit && members.every(member => Number(member.speed) > fastestMonster), text: cityPursuit ? '城镇执法者仍在原地严阵以待，已封住你的去路。' : texts[0]?.description ?? `${spawns[0].name} 拦住了你的去路。` };
};

export type TownArrivalStory = { stage: number; text: string; completed: boolean; chapter: 'town' | 'guild'; arrivalBuilding?: 'guild_counter' };

export const continueForestArrival = async (qqUserId: string): Promise<TownArrivalStory> => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [storyRows] = await connection.execute<(RowDataPacket & { status: string; stage: number })[]>('SELECT status,stage FROM player_story_progress WHERE character_id=? AND story_code=\'forest_guide\' FOR UPDATE', [character.id]);
  const story = storyRows[0];
  if (!story || !['awaiting_arrival', 'arrival_story', 'guild_story'].includes(story.status)) throw new Error('当前没有待继续的剧情。');
  const [town] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM map_regions WHERE code=\'baina_town\' LIMIT 1');
  if (!town[0]) throw new Error('百纳镇地图尚未准备好。');

  if (story.status === 'awaiting_arrival') {
    await connection.execute('UPDATE characters SET current_region_id=?,pos_x=-22,pos_y=-178 WHERE id=?', [town[0].id, character.id]);
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
    const [guildRows]=await connection.execute<(RowDataPacket & { pos_x:number;pos_y:number;pos_z:number })[]>("SELECT pos_x,pos_y,pos_z FROM map_npcs WHERE region_id=? AND code='guild_counter' LIMIT 1",[town[0].id]);
    const guild=guildRows[0];if(!guild)throw new Error('百纳镇冒险者公会尚未准备好。');
    await connection.execute("UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=?,activity_status='active' WHERE id=?",[town[0].id,guild.pos_x,guild.pos_y,guild.pos_z,character.id]);
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
    const defeated = forceRest || Boolean(member.is_defeated); let hp = defeated ? 1 : Math.max(1, Number(member.current_hp));
    if(defeated&&!member.npc_code){
      await connection.execute('UPDATE player_companions SET injured=1,stability=GREATEST(0,stability-10) WHERE character_id=? AND is_out=1 AND released_at IS NULL',[member.id]);
    }
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

const combatActionInTransaction = async (connection: PoolConnection, qqUserId: string, action: Exclude<PendingAction['type'], 'device_charge'>, slot?: number, skillId?: number, itemId?: number, deviceSkillCode?: string, targetKind?: 'member' | 'target', targetId?: number, automaticChant = false, hiddenTicket?: HiddenTicket, hiddenAutomatic = false, skipPlayerTurn = false) => {
  const character = await characterFor(qqUserId, connection); if (await repairInvalidCombatFor(connection, Number(character.id))) throw new Error('检测到上一场战斗已失效，已自动结束。请重新寻怪或移动。'); const session = await activeCombatFor(connection, character.id);
  if (!session) throw new Error('当前不在战斗中。');
  if (!skipPlayerTurn) await assertNoNegotiation(connection, Number(character.id));
  const members = await combatMembers(connection, session.combat_id); const actor = members.find(member => Number(member.id) === Number(character.id));
  const bonusPhase = Boolean(jsonObject(session.cooldowns).__bonusPhase);
  if (bonusPhase && !Number(jsonObject(actor?.cooldowns).__bonusAction)) throw new Error('请等待获得额外行动的队友出招。');
  if (bonusPhase && action === 'escape') throw new Error('额外行动阶段不能单独使全队撤离，请选择普攻或技能。');
  if (session.mode === 'spar' && ['item', 'device'].includes(action)) throw new Error('切磋中只能使用普攻与技能。');
  const storedCast = readRuleState(jsonObject(actor?.cooldowns).__rules).cast;
  if (storedCast && !automaticChant && action !== 'escape') throw new Error('你正在吟唱，技能将自动释放。');
  if (automaticChant && (!storedCast || storedCast.skillId !== skillId)) throw new Error('吟唱已经结束或被打断。');
  // 剧情队友仍存活时，即便主角倒下也要允许系统代为推进他们的回合。
  // 不再依赖特定怪物，避免剧情队伍意外卷入其他战斗后永久卡死。
  const [npcAllyRows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_members cm JOIN characters c ON c.id=cm.character_id
    WHERE cm.session_id=? AND cm.is_defeated=0 AND c.npc_code IN ('npc_forest_warrior','npc_forest_mage','npc_forest_priest') LIMIT 1 FOR UPDATE`, [session.combat_id]);
  const continuingNpcPartyBattle = Boolean(actor?.is_defeated) && Boolean(npcAllyRows[0]);
  if (!actor || (actor.is_defeated && !continuingNpcPartyBattle)) throw new Error('你已失去行动能力。');
  if (!continuingNpcPartyBattle && actor.pending_action) throw new Error('本回合行动已确认，请等待队友。');
  if (!continuingNpcPartyBattle && ((action === 'skill' && !slot && !skillId) || (action === 'item' && !slot && !itemId) || (action === 'device' && !slot))) throw new Error('请选择快捷栏位。');
  let pendingType: PendingAction['type'] = action;
  let selectedDevice: { instanceId: number; skillCode: string } | null = null;
  if (!continuingNpcPartyBattle && action === 'device') {
    const devices = await combatDeviceSlotsFor(connection, session.combat_id, Number(character.id), true);
    const device = devices.find(candidate => candidate.slot === Number(slot));
    if (!device) throw new Error(`异械${'①②③④'.charAt(Number(slot) - 1) || slot}未配置或尚未生效。`);
    const selectedSkill = deviceSkillCode ? device.skills.find(skill => skill.code === deviceSkillCode) : device.skills[0];
    if (!selectedSkill) throw new Error('请选择该异械的可用技能。');
    const cooldownKey = `device_${device.instanceId}_${selectedSkill.code}`;
    const remaining = Number(jsonObject(actor.cooldowns)[cooldownKey] ?? 0);
    if (remaining > 0) throw new Error(`【${selectedSkill.name}】冷却中，还需${remaining}回合。`);
    selectedDevice = { instanceId: device.instanceId, skillCode: selectedSkill.code };
    // 充能永远优先于选目标：能量不足时，本回合只会为所点异械恢复 30 点。
    if (device.currentEnergy < selectedSkill.energyCost) pendingType = 'device_charge';
    else if (['ally', 'enemy', 'any'].includes(selectedSkill.targetScope) && (!targetKind || !targetId)) throw new Error('请选择异械作用目标。');
  }
  let hiddenChoice: HiddenChoice | undefined;
  if (!continuingNpcPartyBattle && action === 'skill') {
    const [skills] = await connection.execute<(RowDataPacket & { skill_id: number; code: string; name: string; mana_cost: number; required_weapon_type: string | null })[]>(skillId ? 'SELECT ps.skill_id,s.code,s.name,s.tier,s.category,s.power,s.cooldown_turns,s.chant_turns,s.mana_cost,s.required_weapon_type FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=? FOR UPDATE' : 'SELECT ps.skill_id,s.code,s.name,s.tier,s.category,s.power,s.cooldown_turns,s.chant_turns,s.mana_cost,s.required_weapon_type FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot=? FOR UPDATE', skillId ? [character.id, Number(skillId)] : [character.id, Number(slot)]);
    if (!skills[0]) throw new Error(skillId ? '自动战斗技能尚未学习。' : `${quickSlotLabel(Number(slot))}未配置`);
    if (isHiddenSkill(skills[0].code)) {
      const shortage=hiddenResourceShortage(skills[0].code,jsonObject(actor.cooldowns));if(shortage)throw new HiddenBattleError(shortage);
      hiddenChoice = hiddenAutomatic ? (await hiddenBattleContext(connection,Number(character.id),session.combat_id,'pve')).autoChoice(skills[0].code) : await submitHiddenDraft(connection, Number(character.id), session.combat_id, Number(session.turn_no), 'pve', skills[0].code, hiddenTicket);
      if (!hiddenChoice) throw new Error('尚未设置该隐藏技能的自动选择。');
    }
    const resourceRequirement = advancedResourceRequirementForSkill(skills[0].code);
    if (resourceRequirement && !storedCast) {
      const [resources] = await connection.execute<CombatProfessionResourceRow[]>('SELECT character_id,profession_code,resource_code,resource_name,current_value,max_value FROM combat_profession_resources WHERE session_id=? AND character_id=? FOR UPDATE', [session.combat_id, character.id]);
      const resource = resources[0];
      if (!resource || resource.profession_code !== resourceRequirement.professionCode) throw new Error(`【${skills[0].name}】需要对应二转传承。`);
      if (Number(resource.current_value) < resourceRequirement.amount) throw new Error(`${resource.resource_name}不足：需要 ${resourceRequirement.amount}，当前 ${resource.current_value}/${resource.max_value}。`);
    }
    const remaining = Number(jsonObject(actor.cooldowns)[skills[0].code] ?? 0);
    const resident = residentSkillByCode(skills[0].code);
    const ruleState = readRuleState(jsonObject(actor.cooldowns).__rules);
    if (!storedCast && ruleState.statuses.some(effect => effect.code === 'silence' && effect.until >= Number(session.turn_no))) throw new Error('沉默期间无法使用技能。');
    if (resident?.category === 'passive') throw new Error('被动技能需要在技能列表中链接。');
    if (resident && ['D01', 'C06', 'F04', 'I04'].includes(resident.id) && Number(jsonObject(actor.cooldowns).__selectedAlly) === Number(actor.id)) throw new Error('该技能不能选择自身，请选择另一名友方。');
    if (resident && ['D01', 'C06', 'F04', 'I04'].includes(resident.id) && !members.some(member => !member.is_defeated && Number(member.id) !== Number(actor.id))) throw new Error('该技能需要另一名存活友方。');
    if (remaining > 0) throw new Error(skillId ? '自动战斗技能冷却中。' : `${quickSlotLabel(Number(slot))}冷却中，还需${remaining}回合`);
    if (!await hasCompatibleSkillWeapon(connection, Number(character.id), skills[0].required_weapon_type)) throw new Error(skillWeaponRequirementMessage(skills[0].name, String(skills[0].required_weapon_type)));
    const modifiers = await modifiersFor(connection, Number(character.id));
    const [specializations] = await connection.execute<(RowDataPacket & { specialization: string; level: number })[]>('SELECT specialization,level FROM player_skill_specializations WHERE character_id=? AND skill_id=?', [character.id, skills[0].skill_id]);
    const pricing = skillSpecialization({ code: skills[0].code, category: String(skills[0].category), tier: String(skills[0].tier), power: Number(skills[0].power), mana_cost: Number(skills[0].mana_cost), cooldown_turns: Number(skills[0].cooldown_turns), chant_turns: Number(skills[0].chant_turns) }, Object.fromEntries(specializations.map(row => [row.specialization, Number(row.level)])));
    const baseManaCost = Math.max(Number(skills[0].mana_cost) ? 1 : 0, Math.ceil(pricing.mana * (modifiers.manaAffinity ? .7 : 1)) - modifiers.manaCostReduction);
    const [linked] = await connection.execute<(RowDataPacket & { code: string })[]>("SELECT s.code FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.passive_linked=1 AND s.code LIKE 'resident_%'", [character.id]);
    const opening = (await openingCombatEffectsFor(connection,[Number(actor.id)],session.mode!=='spar')).get(Number(actor.id));
    const manaCost = skills[0].code === 'resident_d01' ? manaTransferCost(Number(actor.current_mp)) : openingManaCost({opening,companion:Boolean(actor.npc_code)},ruleManaCost(ruleState, linked.map(row => row.code), Math.ceil(baseManaCost * (ruleState.memory.debtSkill === skills[0].code ? 1.4 : 1)), Number(session.turn_no)));
    if (!storedCast && Number(actor.current_mp) < manaCost && (skills[0].code === 'resident_d01' || !modifiers.bloodForMana || Number(actor.current_hp) <= manaCost - Number(actor.current_mp))) throw new Error(`魔力不足，释放技能需要 ${manaCost} MP。`);
    if (['summoner_contract_spirit','summoner_spirit_tether','summoner_star_pact'].includes(skills[0].code)) {
      const [spirits] = await connection.execute<RowDataPacket[]>('SELECT spirit_code FROM combat_spirits WHERE session_id=? AND owner_character_id=? AND current_hp>0 LIMIT 1', [session.combat_id, actor.id]);
      if (!spirits.length) throw new Error('场上没有可回应的灵体，未支付资源。');
    }
  }
  if (!continuingNpcPartyBattle && action === 'item') {
    const [items] = await connection.execute<RowDataPacket[]>(itemId
      ? 'SELECT pi.item_id FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 AND i.item_type=\'consumable\' FOR UPDATE'
      : 'SELECT qi.item_id FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id WHERE qi.character_id=? AND qi.quick_slot=? AND pi.quantity>0 FOR UPDATE', itemId ? [character.id, Number(itemId)] : [character.id, Number(slot)]);
    if (!items[0]) throw new Error(itemId ? '自动嗑药道具已耗尽或不可使用。' : `道具${'①②③④'.charAt(Number(slot) - 1) || slot}未配置或已耗尽。`);
  }
  if (!continuingNpcPartyBattle) {
    const pending: PendingAction = { hidden: hiddenChoice, type: pendingType, chantRelease: automaticChant, ...(Number(jsonObject(actor.cooldowns).__selectedAlly) ? { targetKind: 'member', targetId: Number(jsonObject(actor.cooldowns).__selectedAlly) } : { targetKind: 'target', targetId: Number(actor.selected_target_id) }), ...(slot ? { slot } : {}), ...(skillId ? { skillId } : {}), ...(itemId ? { itemId } : {}), ...(selectedDevice ? { deviceInstanceId: selectedDevice.instanceId, deviceSkillCode: selectedDevice.skillCode } : {}), ...(targetKind ? { targetKind } : {}), ...(targetId ? { targetId } : {}) };
    await connection.execute('UPDATE combat_members SET pending_action=? WHERE session_id=? AND character_id=?', [JSON.stringify(pending), session.combat_id, character.id]); actor.pending_action = JSON.stringify(pending);
  }
  await connection.execute("UPDATE combat_sessions SET last_action_at=NOW() WHERE id=? AND state='active'", [session.combat_id]);
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
  const aliveMembers = members.filter(member => !member.is_defeated && (!bonusPhase || Number(jsonObject(member.cooldowns).__bonusAction)));
  if (skipPlayerTurn) for (const member of aliveMembers) member.pending_action = { type: 'attack' };
  if (!aliveMembers.every(member => member.pending_action)) return { ended: false, waiting: true, log: `\n\n[${character.name}]已确认行动，等待队友（${aliveMembers.filter(member => member.pending_action).length}/${aliveMembers.length}）。` };

  const appraisal = await appraisalProfileFor(connection, members.map(member => Number(member.id)));
  const targets = await combatTargets(connection, session.combat_id, false); const targetName = (target: CombatTargetRow) => { const observer = appraisalForTarget(appraisal, Number(target.level)); if (readRuleState(jsonObject(target.cooldowns).__rules).statuses.some(effect => effect.code === 'nightmare' && effect.until >= Number(session.turn_no))) return '信息被雾遮蔽'; if (session.mode === 'spar') return materializeMonster(target, true).name; return observer ? (observer.informationLevel >= 2 ? materializeMonster(target, true).name : target.name) : '???'; }; const log: string[] = [session.mode === 'spar' ? `切磋＜${session.turn_no}＞回合` : `战斗<${session.turn_no}>回合`]; let effects = await activeCombatEffects(connection, session.combat_id);
  const [activeDeviceRows] = await connection.execute<(RowDataPacket & { character_id: number; code: string })[]>(`SELECT ad.character_id,i.code FROM player_active_devices ad
    JOIN player_item_instances ii ON ii.id=ad.instance_id JOIN item_definitions i ON i.id=ii.item_id
    WHERE ad.character_id IN (${members.map(() => '?').join(',')}) AND i.item_type='device'`, members.map(member => Number(member.id)));
  const activeDeviceCodesByMember = new Map<number, Set<string>>();
  for (const row of activeDeviceRows) {
    const codes = activeDeviceCodesByMember.get(Number(row.character_id)) ?? new Set<string>();
    codes.add(row.code); activeDeviceCodesByMember.set(Number(row.character_id), codes);
  }
  const hasActiveDevice = (member: CombatMemberRow, code: string) => session.mode !== 'spar' && (activeDeviceCodesByMember.get(Number(member.id))?.has(code) ?? false);
  // 同一回合只读取一次装备构筑；后续判断完全基于这份真实穿戴快照。
  const epicLoadouts = new Map<number, EpicLoadout>();
  for (const member of members.filter(item => !item.npc_code)) epicLoadouts.set(Number(member.id), await epicLoadoutFor(connection, Number(member.id)));
  const epicFor = (member: CombatMemberRow) => epicLoadouts.get(Number(member.id)) ?? { setCode: null, setCount: 0, weaponEffects: [] };
  const [resourceRows] = await connection.execute<CombatProfessionResourceRow[]>('SELECT character_id,profession_code,resource_code,resource_name,current_value,max_value FROM combat_profession_resources WHERE session_id=? FOR UPDATE', [session.combat_id]);
  const resourceFor = (memberId: number) => resourceRows.find(resource => Number(resource.character_id) === memberId);
  const gainResource = async (member: CombatMemberRow, amount: number, _reason: string) => {
    const resource = resourceFor(Number(member.id)); if (!resource || amount <= 0) return 0;
    const previous = Number(resource.current_value); const next = Math.min(Number(resource.max_value), previous + Math.floor(amount)); const gained = next - previous;
    if (!gained) return 0;
    resource.current_value = next;
    await connection.execute('UPDATE combat_profession_resources SET current_value=? WHERE session_id=? AND character_id=?', [next, session.combat_id, member.id]);
    log.push(`&${resource.resource_name}&${previous}→${next}`);
    return gained;
  };
  const spendResource = async (member: CombatMemberRow, amount: number, skillName: string) => {
    const resource = resourceFor(Number(member.id));
    if (!resource || Number(resource.current_value) < amount) return false;
    resource.current_value = Number(resource.current_value) - amount;
    await connection.execute('UPDATE combat_profession_resources SET current_value=? WHERE session_id=? AND character_id=?', [resource.current_value, session.combat_id, member.id]);
    log.push(`&${resource.resource_name}&${combatUnitLabel(member)}施放「${skillName}」消耗 ${amount}（${resource.current_value}/${resource.max_value}）。`);
    return true;
  };
  const rewardSummonerSupport = async (reason: string) => {
    for (const member of members.filter(item => resourceFor(Number(item.id))?.profession_code === 'spirit_summoner' && !item.is_defeated)) await gainResource(member, 15, reason);
  };
  const inheritancePassives = await inheritancePassivesFor(connection, members.map(member => Number(member.id)));
  const inheritanceValue = (characterId: number, professionCode: string, index = 0) => (inheritancePassives.get(characterId) ?? []).filter(passive => passive.professionCode === professionCode).reduce((highest, passive) => Math.max(highest, Number(passive.values[index] ?? 0)), 0);
  const hasInheritance = (characterId: number, professionCode: string) => inheritanceValue(characterId, professionCode) > 0;
  const inheritanceHarmfulSkill = async (skillId: number | undefined) => {
    if (!skillId) return false;
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM skill_effects se JOIN effect_definitions e ON e.id=se.effect_id
      WHERE se.skill_id=? AND se.target_scope='enemy' AND e.effect_type IN ('damage_over_time','stat_modifier','control') LIMIT 1`, [skillId]);
    return Boolean(rows[0]);
  };
  const inheritanceDebuffCodeCache = new Map<number, string[]>();
  const inheritanceDebuffCodes = async (skillId: number | undefined) => {
    if (!skillId) return [];
    const cached = inheritanceDebuffCodeCache.get(skillId); if (cached) return cached;
    const [rows] = await connection.execute<(RowDataPacket & { code: string })[]>(`SELECT DISTINCT e.code FROM skill_effects se JOIN effect_definitions e ON e.id=se.effect_id
      WHERE se.skill_id=? AND se.target_scope='enemy' AND e.effect_type IN ('damage_over_time','stat_modifier','control')`, [skillId]);
    const codes = rows.map(row => row.code); inheritanceDebuffCodeCache.set(skillId, codes); return codes;
  };
  const markTarget = (target: CombatTargetRow, key: string) => { const cooldowns = jsonObject(target.cooldowns); cooldowns[key] = 1; target.cooldowns = cooldowns; };
  const consumeTargetMark = (target: CombatTargetRow, key: string) => { const cooldowns = jsonObject(target.cooldowns); if (!cooldowns[key]) return false; delete cooldowns[key]; target.cooldowns = cooldowns; return true; };
  let activeSpecialization: SkillSpecializationResult | undefined;
  // 在生命封顶和有效治疗触发之前结算；不把装备触发的额外治疗再次算作主动专精。
  const specializedNativeHealing = async (caster: CombatMemberRow, recipient: CombatMemberRow, amount: number, fixedPercent=false) => {
    const source = ruleUnit('member', Number(caster.id)); const ally = ruleUnit('member', Number(recipient.id));
    let multiplier = rules.healingMultiplier(source, ally, false) * (activeSpecialization?.supportFactor ?? 1);
    if (amount > 0 && ally.hp < ally.hpMax && rules.status(source, 'beat')) { multiplier *= 1 + rules.value(source, 'beat') / 100; await rules.consume(source, 'beat'); }
    if(!fixedPercent)multiplier*=(await import('./opening-combat')).openingSpellHealingFactor(source,ally);
    return Math.max(0, Math.floor(amount * multiplier));
  };
  let residentValue = (_kind: 'member' | 'target', _targetId: number, _code: string): number => 0;
  const effectValue = (kind: 'member' | 'target', targetId: number, code: string) => {
    const own=residentValue(kind,targetId,code);const legacy=effects.filter(effect=>effect.target_kind===kind&&Number(effect.target_id)===targetId&&effect.code===code).reduce((sum,effect)=>sum+Number(effect.value)*Number(effect.stacks),0);
    return own>0&&['battle_cry','critical_focus','alchemy_evasion','precision','armor_shatter','magic_shatter'].includes(code)?Math.max(own,legacy):own+legacy;
  };
  const targetHealingAmount = (target: CombatTargetRow, amount: number) => Math.floor(reducedHealingAmount(amount, effectValue('target', Number(target.id), 'advanced_healing_cut')) * (1-Math.min(90,rules.value(ruleUnit('target',Number(target.id)),'alchemy_antiheal'))/100));
  const elementMarkCodes = ['element_mark_fire', 'element_mark_ice', 'element_mark_wind', 'element_mark_thunder'];
  const elementMarks = (target: CombatTargetRow) => effects.filter(effect => effect.target_kind === 'target' && Number(effect.target_id) === Number(target.id) && elementMarkCodes.includes(effect.code));
  let activeEffectSource: string | null = null;
  const applyAdvancedStatus = async (targetKind: 'member' | 'target', targetId: number, code: string, value: number, turns: number, sourceSkill = false) => {
    await refreshCombatSpiritEffect(connection, session.combat_id, targetKind, targetId, code, specializeEffectValue(code, value, sourceSkill ? activeSpecialization?.effectFactor : 1), specializeEffectDuration(code, turns, sourceSkill ? activeSpecialization?.durationChange : 0), activeEffectSource);
    effects = await activeCombatEffects(connection, session.combat_id);
  };
  const triggerInverseBuffer = async (victim: CombatMemberRow) => {
    if (!hasActiveDevice(victim, 'inverse_buffer') || Number(victim.current_hp) * 100 > Number(victim.hp_max) * 30) return;
    const cooldowns = jsonObject(victim.cooldowns); if (cooldowns.device_inverse_buffer_triggered) return;
    cooldowns.device_inverse_buffer_triggered = 1; victim.cooldowns = cooldowns;
    await applyAdvancedStatus('member', Number(victim.id), 'barrier', 20, 2);
    log.push(`　&逆相缓冲&${combatUnitLabel(victim)}生命低于30%，获得20%减伤(2)。`);
  };
  const epicSetActive = (member: CombatMemberRow, code: EpicLoadout['setCode'], pieces: number) => {
    const loadout = epicFor(member);
    return loadout.setCode === code && loadout.setCount >= pieces;
  };
  const hasLifeShield = async (targetKind: 'member' | 'target', targetId: number) => {
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id
      WHERE ce.session_id=? AND ce.target_kind=? AND ce.target_id=? AND e.code='life_shield' AND ce.value>0 LIMIT 1`, [session.combat_id, targetKind, targetId]);
    return Boolean(rows[0]);
  };
  /** 史诗防具的承伤层数仅在技能直击命中后增长；普通攻击、DOT 与反击不会偷触发。 */
  const triggerEpicIncomingSkill = async (recipient: CombatMemberRow) => {
    const cooldowns = jsonObject(recipient.cooldowns); const turnNo = Number(session.turn_no);
    if (hasEpicWeaponEffect(epicFor(recipient), 'epic_mountaingate_shield') && Number(cooldowns.epic_mountaingate_ready_turn ?? 0) <= turnNo) {
      const shield = await grantLifeShield(connection, session.combat_id, 'member', Number(recipient.id), Number(recipient.hp_max), Math.floor(Number(recipient.hp_max) * .06), 1);
      cooldowns.epic_mountaingate_ready_turn = turnNo + 2;
      if (shield.added) log.push(`&山门盾牌&${combatUnitLabel(recipient)}受击后获得${shield.added}点生命护盾(1)。`);
    }
    if (epicSetActive(recipient, 'mountainheart_regalia', 3) && Number(cooldowns.epic_mountain_lock_until ?? 0) < turnNo && Number(cooldowns.epic_mountain_pressure_turn ?? 0) !== turnNo) {
      cooldowns.epic_mountain_pressure_turn = turnNo;
      const stacks = Math.min(3, Number(cooldowns.epic_mountain_pressure_stacks ?? 0) + 1);
      if (stacks >= 3 && epicSetActive(recipient, 'mountainheart_regalia', 5)) {
        cooldowns.epic_mountain_pressure_stacks = 0; cooldowns.epic_mountain_lock_until = turnNo + 1;
        const shield = await grantLifeShield(connection, session.combat_id, 'member', Number(recipient.id), Number(recipient.hp_max), Math.floor(Number(recipient.hp_max) * .12), 2);
        await applyAdvancedStatus('member', Number(recipient.id), 'inheritance_control_resist', 20, 2);
        log.push(`&断层壁障&${combatUnitLabel(recipient)}消耗3层岩压，获得${shield.added}点生命护盾与20%控制抗性(2)。`);
      } else {
        cooldowns.epic_mountain_pressure_stacks = stacks;
        log.push(`&地脉承压&${combatUnitLabel(recipient)}获得岩压${stacks}/3：技能直击减伤${stacks * 2}%。`);
      }
    }
    if (epicSetActive(recipient, 'valk_forge_regalia', 3) && Number(cooldowns.epic_valk_warmth_turn ?? 0) !== turnNo) {
      cooldowns.epic_valk_warmth_turn = turnNo;
      const stacks = Math.min(2, Number(cooldowns.epic_valk_warmth_stacks ?? 0) + 1);
      cooldowns.epic_valk_warmth_stacks = stacks;
      await applyAdvancedStatus('member', Number(recipient.id), 'inheritance_control_resist', stacks * 10, 1);
      log.push(`&余热铸甲&${combatUnitLabel(recipient)}获得余热${stacks}/2：技能直击减伤${stacks * 2}%、控制抗性${stacks * 10}%、技能直击伤害+${stacks * 2}%。`);
    }
    recipient.cooldowns = cooldowns;
  };
  const epicIncomingSkillReduction = (recipient: CombatMemberRow) => {
    const cooldowns = jsonObject(recipient.cooldowns);
    const mountain = epicSetActive(recipient, 'mountainheart_regalia', 3) ? Number(cooldowns.epic_mountain_pressure_stacks ?? 0) * 2 : 0;
    const valk = epicSetActive(recipient, 'valk_forge_regalia', 3) ? Number(cooldowns.epic_valk_warmth_stacks ?? 0) * 2 : 0;
    return Math.min(20, Math.max(0, mountain + valk));
  };
  /** 有效治疗只在真实恢复生命时计数；护盾、溢出治疗、再生与复活均不误触发。 */
  const triggerEpicEffectiveHeal = async (caster: CombatMemberRow, recipient: CombatMemberRow, hpBefore: number, lowBeforeHeal: boolean) => {
    const healed = Math.max(0, Number(recipient.current_hp) - hpBefore); if (!healed) return;
    (await import('./opening-combat')).openingEffectiveHeal(rules,ruleUnit('member',Number(caster.id)),ruleUnit('member',Number(recipient.id)),healed);
    const loadout = epicFor(caster); const turnNo = Number(session.turn_no);
    if (epicSetActive(caster, 'mistmother_cocoon', 3)) {
      const bonus = Math.min(Number(recipient.hp_max) - Number(recipient.current_hp), Math.floor(healed * .08));
      if (bonus > 0) { recipient.current_hp += bonus; log.push(`&雾生灵潮&${combatUnitLabel(recipient)}治疗额外恢复${bonus} HP。`); }
    }
    const recipientCooldowns = jsonObject(recipient.cooldowns);
    if (hasEpicWeaponEffect(loadout, 'epic_threehead_grimoire') && Number(recipientCooldowns[`epic_threehead_heal_${caster.id}`] ?? 0) !== turnNo) {
      recipientCooldowns[`epic_threehead_heal_${caster.id}`] = turnNo; recipient.cooldowns = recipientCooldowns;
      await applyAdvancedStatus('member', Number(recipient.id), 'barrier', 6, 1);
      log.push(`&三首法书&${combatUnitLabel(recipient)}获得6%减伤(1)。`);
    }
    if (hasEpicWeaponEffect(loadout, 'epic_marshmoon_orb') && lowBeforeHeal && Number(recipientCooldowns[`epic_marshmoon_heal_${caster.id}`] ?? 0) !== turnNo) {
      recipientCooldowns[`epic_marshmoon_heal_${caster.id}`] = turnNo; recipient.cooldowns = recipientCooldowns;
      const bonus = Math.min(Number(recipient.hp_max) - Number(recipient.current_hp), Math.floor(Number(recipient.hp_max) * .03));
      if (bonus > 0) { recipient.current_hp += bonus; log.push(`&沼月回潮&${combatUnitLabel(recipient)}额外恢复${bonus} HP。`); }
    }
    if (!epicSetActive(caster, 'mistmother_cocoon', 5)) return;
    const casterCooldowns = jsonObject(caster.cooldowns); const tides = Number(casterCooldowns.epic_mist_tide_stacks ?? 0);
    if (tides >= 3) {
      casterCooldowns.epic_mist_tide_stacks = 0; caster.cooldowns = casterCooldowns;
      const echo = Math.min(Number(recipient.hp_max) - Number(recipient.current_hp), Math.floor(healed * .35));
      if (echo > 0) { recipient.current_hp += echo; log.push(`&三首潮汐&治疗回响额外恢复${echo} HP。`); }
    } else {
      casterCooldowns.epic_mist_tide_stacks = Math.min(3, tides + 1); caster.cooldowns = casterCooldowns;
      log.push(`&三首潮汐&${combatUnitLabel(caster)}获得潮汐${Math.min(3, tides + 1)}/3。`);
    }
  };
  /** 导师同样使用二转辅助技，但试炼为一对多遭遇，原本的“队友”效果依法收束到导师本人与其灵契回响。 */
  const resolveMentorSupportSkill = async (mentor: CombatTargetRow, skill: { code: string; name: string }, build: Record<string, unknown>) => {
    const stats = monsterCombatStats(mentor); const passive = jsonObject(jsonObject(build.passive).effect); const healingBonus = Number(passive.healingBonusPct ?? 0) / 100;
    const heal = async (ratio: number, maxHpRatio = 0) => {
      const before = Number(mentor.current_hp); const amount = targetHealingAmount(mentor, Math.max(1, Math.floor(stats.magicAttack * ratio + Number(mentor.hp_max) * maxHpRatio)));
      mentor.current_hp = Math.min(Number(mentor.hp_max), before + Math.floor(amount * (1 + healingBonus)));
      return Number(mentor.current_hp) - before;
    };
    const barrier = async (value: number, turns: number) => applyAdvancedStatus('target', Number(mentor.id), 'barrier', value, turns);
    const cleanseSelf = () => rules.dispel(ruleUnit('target', Number(mentor.id)), ruleUnit('target', Number(mentor.id)), true);
    const code = skill.code;
    if (code === 'bulwark_vicarious_guard') { await barrier(20, 2); log.push(`　&代偿守护&【${targetName(mentor)}】展开20%减伤(2)。`); return true; }
    if (code === 'bulwark_immovable_mountain') { await barrier(35, 2); log.push(`　&不动如山&【${targetName(mentor)}】稳住35%减伤架势(2)。`); return true; }
    if (code === 'warlord_triumph_banner') { await applyAdvancedStatus('target', Number(mentor.id), 'battle_cry', 10, 2); log.push(`　&凯旋战旗&【${targetName(mentor)}】双攻提高10%(2)。`); return true; }
    if (code === 'summoner_contract_spirit') { await barrier(10, 2); mentor.current_mp = Math.min(stats.mpMax, Number(mentor.current_mp) + Math.floor(stats.mpMax * .12)); log.push(`　&契约灵体&【${targetName(mentor)}】的灵契回响延续，获得10%减伤并恢复12%MP。`); return true; }
    if (code === 'summoner_spirit_tether') { await applyAdvancedStatus('target', Number(mentor.id), 'battle_cry', 15, 1); log.push(`　&灵线牵引&【${targetName(mentor)}】的三灵回响令双攻提高15%(1)。`); return true; }
    if (code === 'summoner_returning_veil') { await barrier(10, 2); await cleanseSelf(); log.push(`　&返魂帷幕&【${targetName(mentor)}】获得10%减伤并净化异常。`); return true; }
    if (code === 'summoner_star_pact') { await barrier(22, 2); await applyAdvancedStatus('target', Number(mentor.id), 'battle_cry', 20, 2); log.push(`　&群星契约&存活灵契进入超载回响：20%双攻、22%减伤(2)。`); return true; }
    if (code === 'spellblade_phase_guard') { await barrier(25, 1); await applyAdvancedStatus('target', Number(mentor.id), 'mist_veil', 15, 1); log.push(`　&相位格挡&【${targetName(mentor)}】获得25%减伤，下一击提高15%。`); return true; }
    if (code === 'ranger_guiding_smoke') { await barrier(15, 1); await applyAdvancedStatus('target', Number(mentor.id), 'mist_veil', 20, 1); log.push(`　&诱导烟幕&【${targetName(mentor)}】获得15%减伤，下一击提高20%。`); return true; }
    if (code === 'saint_healer_mending_prayer') { const amount = await heal(.9, .08); await applyAdvancedStatus('target', Number(mentor.id), 'regeneration', 6 + Number(passive.regenerationBonusPct ?? 0), 2); log.push(`　&愈合祷言&【${targetName(mentor)}】恢复${amount} HP并获得再生。`); return true; }
    if (code === 'saint_healer_absolution_hand') { const amount = await heal(.6); await cleanseSelf(); log.push(`　&净罪之手&【${targetName(mentor)}】恢复${amount} HP并净化异常。`); return true; }
    if (code === 'saint_healer_resonant_mass') { const amount = await heal(.65, .05); await applyAdvancedStatus('target', Number(mentor.id), 'regeneration', 6 + Number(passive.regenerationBonusPct ?? 0), 2); log.push(`　&共鸣弥撒&【${targetName(mentor)}】恢复${amount} HP并获得再生。`); return true; }
    if (code === 'saint_healer_revival_sanctuary') { const amount = await heal(0, .18); await cleanseSelf(); await applyAdvancedStatus('target', Number(mentor.id), 'regeneration', 10 + Number(passive.regenerationBonusPct ?? 0), 2); log.push(`　&复苏圣域&【${targetName(mentor)}】恢复${amount} HP、净化异常并获得再生。`); return true; }
    if (code === 'aegis_watch_bastion') { await barrier(15, 2); await applyAdvancedStatus('target', Number(mentor.id), 'inheritance_control_resist', 20, 2); log.push(`　&守望壁垒&【${targetName(mentor)}】获得15%减伤与20%控制抗性(2)。`); return true; }
    if (code === 'aegis_shared_vow') { await barrier(20, 2); log.push(`　&分担圣约&【${targetName(mentor)}】获得20%减伤(2)。`); return true; }
    if (code === 'aegis_luminous_echo') { await barrier(10, 1); await applyAdvancedStatus('target', Number(mentor.id), 'regeneration', 7, 1); log.push(`　&光幕回响&【${targetName(mentor)}】获得10%减伤并回复。`); return true; }
    if (code === 'aegis_undying_dome') { await barrier(20, 2); await applyAdvancedStatus('target', Number(mentor.id), 'advanced_undying', 1, 2); log.push(`　&不灭穹顶&【${targetName(mentor)}】获得20%减伤与濒危不倒(2)。`); return true; }
    return false;
  };
  /** 现有壁垒是可刷新的一种减伤状态；额外记录施加者，才能把承伤信念准确给回圣盾使。 */
  const markAegisBarrier = (caster: CombatMemberRow, recipient: CombatMemberRow, turns: number) => {
    const cooldowns = jsonObject(recipient.cooldowns);
    cooldowns.advanced_aegis_barrier_source = Number(caster.id);
    cooldowns.advanced_aegis_barrier_turns = Math.max(Number(cooldowns.advanced_aegis_barrier_turns ?? 0), turns);
    recipient.cooldowns = cooldowns;
  };
  let venomancerSerpentSkillId: number | undefined;
  const addCorrosionPoisonStack = async (caster: { id: number; level?: number; tenacity_pierce?: number }, target: CombatTargetRow) => {
    if (venomancerSerpentSkillId === undefined) {
      const [skills] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM skill_definitions WHERE code=\'venomancer_serpent_kiss\' LIMIT 1', []);
      venomancerSerpentSkillId = Number(skills[0]?.id ?? 0);
    }
    if (!venomancerSerpentSkillId) return false;
    const currentStacks = effects.filter(effect => effect.target_kind === 'target' && Number(effect.target_id) === Number(target.id) && effect.code === 'poison').reduce((total, effect) => total + Number(effect.stacks), 0);
    if (currentStacks >= (target.monster_class === 'boss' ? 3 : 5)) return false;
    const before = effectValue('target', Number(target.id), 'poison');
    await applySkillEffects(connection, session.combat_id, venomancerSerpentSkillId, caster, 'member', target, 'target', 'on_hit', log, 0, 1, rules);
    effects = await activeCombatEffects(connection, session.combat_id);
    return effectValue('target', Number(target.id), 'poison') > before;
  };
  const removeAdvancedStatus = async (targetKind: 'member' | 'target', targetId: number, codes: string[]) => {
    if (!codes.length) return;
    await connection.execute(`DELETE ce FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=? AND ce.target_kind=? AND ce.target_id=? AND e.code IN (${codes.map(() => '?').join(',')})`, [session.combat_id, targetKind, targetId, ...codes]);
    effects = await activeCombatEffects(connection, session.combat_id);
  };
  /** 部位死亡只结算一次；反噬写回同一内存目标，确保本体若尚未行动会立即读到变化。 */
  const resolveBossComponentBreak = async (component: CombatTargetRow) => {
    const definition = bossComponentDefinition(component); const trait = bossComponentTrait(component);
    if (!definition || !trait || !component.is_defeated) return false;
    const componentCooldowns = jsonObject(component.cooldowns); if (componentCooldowns.boss_component_break_resolved) return false;
    componentCooldowns.boss_component_break_resolved = 1; component.cooldowns = componentCooldowns;
    const body = targets.find(target => Number(target.id) === Number(trait.body_spawn_id));
    if (!body) return false;
    const bodyCooldowns = jsonObject(body.cooldowns);
    await rules.releaseMechanism(`target:${body.id}:${definition.key}`);
    if (definition.key === 'gruen_armor') {
      bodyCooldowns.boss_component_gruen_armor_broken = 1; delete bodyCooldowns.boss_component_gruen_armor_guard;
      await removeAdvancedStatus('target', Number(body.id), ['barrier']);
      log.push('【永固之铠】崩解为碎岩，格鲁恩的防御层尽数反噬！本体双防降低 50%。');
    } else if (definition.key === 'gruen_horn') {
      const charging = Number(bodyCooldowns.boss_component_gruen_horn_charge ?? 0) > 0;
      bodyCooldowns.boss_component_gruen_horn_broken = 1; delete bodyCooldowns.boss_component_gruen_horn_charge;
      if (charging) bodyCooldowns.boss_component_gruen_horn_recoil = 2;
      log.push(charging ? '【镇脉之角】在角鸣蓄能中断裂！强化崩震被取消，格鲁恩双攻降低 30%（2回合）。' : '【镇脉之角】断裂，格鲁恩再也无法强化山心崩震。');
    } else if (definition.key === 'gruen_arm') {
      bodyCooldowns.boss_component_gruen_arm_broken = 1; bodyCooldowns.boss_component_gruen_forced_basic = 2;
      for (const member of members) { const cooldowns = jsonObject(member.cooldowns); delete cooldowns.regional_gruen_fault_until; delete cooldowns.boss_component_gruen_arm_press_until; member.cooldowns = cooldowns; }
      log.push('【断层重臂】坠入裂谷，格鲁恩失去平衡！下次行动被迫普攻，物攻永久降低 30%。');
    } else if (definition.key === 'valk_armor') {
      bodyCooldowns.boss_component_valk_armor_broken = 1; delete bodyCooldowns.boss_component_valk_armor_guard;
      await removeAdvancedStatus('target', Number(body.id), ['barrier']);
      log.push('【黑铁炉甲】被冷却水汽撕裂，瓦尔克双防降低 45%。');
    } else if (definition.key === 'valk_chain') {
      bodyCooldowns.boss_component_valk_chain_broken = 1; bodyCooldowns.boss_component_valk_chain_recoil = 2;
      delete bodyCooldowns.boss_component_valk_chain_execute_at; delete bodyCooldowns.boss_component_valk_chain_execute_target;
      for (const member of members) { const cooldowns = jsonObject(member.cooldowns); delete cooldowns.boss_component_valk_chain_execute_at; member.cooldowns = cooldowns; await removeAdvancedStatus('member', Number(member.id), ['bind', 'exposed']); }
      log.push('【拘魂锁链】熔断，所有处刑倒计时、束缚和破绽被取消！瓦尔克攻击降低 20%（2回合）。');
    } else if (definition.key === 'valk_bellows') {
      const heat = Math.max(0, Math.min(3, Number(bodyCooldowns.regional_valk_heat ?? 0)));
      bodyCooldowns.boss_component_valk_bellows_broken = 1; bodyCooldowns.regional_valk_heat = 0;
      delete bodyCooldowns.regional_valk_overdrive_ready; delete bodyCooldowns.regional_valk_overdrive_heat;
      if (heat === 2) {
        bodyCooldowns.boss_component_valk_bellows_recoil = 2; bodyCooldowns.boss_component_valk_overdrive_lock = 4;
        const recoil = Math.max(1, Math.floor(Number(body.hp_max) * .08)); const oldHp = Number(body.current_hp); body.current_hp = Math.max(0, oldHp - recoil); if (!body.current_hp) body.is_defeated = 1;
        log.push(`【赤炉风箱】逆向爆裂！炉温清空，瓦尔克损失 ${recoil} HP（${oldHp}→${body.current_hp}），魔攻降低 35%（2回合），赤炉过载封锁 3 回合。`);
      } else log.push('【赤炉风箱】被拆毁，炉温清空且上限永久降为 1。');
    }
    body.cooldowns = bodyCooldowns;
    return true;
  };
  const consumePrecisionAim = async (victim: CombatMemberRow) => {
    if (effectValue('member', Number(victim.id), 'precision') <= 0 && effectValue('member', Number(victim.id), 'critical_focus') <= 0) return;
    await removeAdvancedStatus('member', Number(victim.id), ['precision', 'critical_focus']);
    log.push(`　&精准瞄准&${combatUnitLabel(victim)}受到攻击，瞄准校正结束。`);
  };
  const dispelOneTargetBuff = async (target: CombatTargetRow) => {
    const removable = effects.find(effect => effect.target_kind === 'target' && Number(effect.target_id) === Number(target.id) && ['barrier', 'battle_cry', 'mist_veil', 'shadow_pierce', 'royal_intercept'].includes(effect.code));
    if (!removable) return false;
    await connection.execute('DELETE FROM combat_status_effects WHERE id=?', [removable.id]); effects = await activeCombatEffects(connection, session.combat_id);
    log.push(`　&驱散&清除了【${targetName(target)}】的「${removable.name}」。`);
    return true;
  };
  const triggerSummonerShelter = async (victim: CombatMemberRow) => {
    if (Number(victim.current_hp) / Math.max(1, Number(victim.hp_max)) > .5) return;
    for (const owner of members.filter(member => !member.is_defeated)) {
      const value = inheritanceValue(Number(owner.id), 'spirit_summoner'); if (!value) continue;
      const cooldowns = jsonObject(owner.cooldowns); const key = 'heritage_once_spirit_summoner';
      if (cooldowns[key]) continue;
      cooldowns[key] = 1; owner.cooldowns = cooldowns;
      await refreshCombatSpiritEffect(connection, session.combat_id, 'member', Number(victim.id), 'barrier', value, 2);
      log.push(`&灵契余荫&${combatUnitLabel(owner)}为濒危的${combatUnitLabel(victim)}展开 ${value}% 减伤壁垒(2)。`);
    }
  };
  const triggerAegisEcho = async (victim: CombatMemberRow, hadBarrier: boolean) => {
    if (!hadBarrier) return;
    const value = Math.max(...members.map(member => inheritanceValue(Number(member.id), 'aegis_priest')), 0); if (!value) return;
    const cooldowns = jsonObject(victim.cooldowns); const key = 'heritage_round_aegis_echo'; if (cooldowns[key]) return;
    cooldowns[key] = 1; victim.cooldowns = cooldowns;
    await refreshCombatSpiritEffect(connection, session.combat_id, 'member', Number(victim.id), 'inheritance_control_resist', value, 1);
    log.push(`&守壁余响&${combatUnitLabel(victim)}的壁垒承受冲击，获得 ${value}% 控制抗性(1)。`);
  };
  /** 战斗法师的两段换挡共用一次状态迁移；具体技能再决定如何放大其治疗或增益数值。 */
  const consumeSpellbladeSupport = (member: CombatMemberRow) => {
    const cooldowns = jsonObject(member.cooldowns);
    if (!cooldowns.heritage_spellblade_support) return 0;
    const value = inheritanceValue(Number(member.id), 'spellblade');
    if (!value) return 0;
    delete cooldowns.heritage_spellblade_support;
    cooldowns.heritage_spellblade_damage = 1;
    member.cooldowns = cooldowns;
    return value;
  };
  /** 盾卫在自己的行动结尾结算；因此后续同一回合的敌方行动也能立即受益。 */
  let completeNativeSupport: (() => Promise<void>) | undefined;
  const triggerBulwarkFormation = async (holder: CombatMemberRow) => {
    const complete = completeNativeSupport; completeNativeSupport = undefined; if (complete) await complete();
    const value = inheritanceValue(Number(holder.id), 'bulwark_guard');
    if (!value || holder.is_defeated) return;
    const holderCooldowns = jsonObject(holder.cooldowns);
    const [guardRows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id
      WHERE ce.session_id=? AND ce.target_kind='member' AND ce.target_id=? AND e.code IN ('barrier','shield_counter','shield_guard') LIMIT 1`, [session.combat_id, holder.id]);
    if (!guardRows[0] && !holderCooldowns.heritage_round_taunt) return;
    const ally = [...members].filter(member => !member.is_defeated).sort((left, right) => Number(left.current_hp) / Math.max(1, Number(left.hp_max)) - Number(right.current_hp) / Math.max(1, Number(right.hp_max)))[0];
    if (!ally) return;
    await refreshCombatSpiritEffect(connection, session.combat_id, 'member', Number(ally.id), 'barrier', value, 1);
    log.push(`&护阵余韵&${combatUnitLabel(holder)}行动结束，为生命最低的${combatUnitLabel(ally)}展开 ${value}% 减伤壁垒(1)。`);
  };
  const kingbeastCores = () => targets.filter(target => isKingbeastCore(target) && ['king', 'dragon'].includes(kingbeastRole(target)));
  const kingbeastFused = () => kingbeastCores().some(target => !jsonObject(target.cooldowns).kingbeast_phase_two);
  const resolveKingbeastState = () => {
    const cores = kingbeastCores(); if (cores.length !== 2) return;
    const fallenDuringFusion = kingbeastFused() ? cores.filter(target => target.is_defeated) : [];
    if (fallenDuringFusion.length) {
      for (const core of cores) {
        const cooldowns = jsonObject(core.cooldowns); cooldowns.kingbeast_phase_two = 1; delete cooldowns.kingbeast_charge; core.cooldowns = cooldowns;
      }
      const survivor = cores.find(target => !target.is_defeated);
      if (survivor) {
        const cooldowns = jsonObject(survivor.cooldowns); cooldowns.royal_beast_enrage = 3; survivor.cooldowns = cooldowns;
        log.push(`$${kingbeastRole(survivor) === 'king' ? '孤王狂怒' : '孤龙狂怒'}$同伴倒下，${kingbeastRole(survivor) === 'king' ? '国王' : '哈巴龙'}挣脱破碎的王座，怒火彻底失控！\n命中 +200%｜暴击 +200%｜暴伤 +200%｜攻击吸血 40%，持续 3 回合。`);
      }
      return;
    }
    if (kingbeastFused() && cores.some(target => !target.is_defeated && Number(target.current_hp) <= Number(target.hp_max) / 2)) {
      for (const core of cores) {
        const cooldowns = jsonObject(core.cooldowns); cooldowns.kingbeast_phase_two = 1; delete cooldowns.kingbeast_charge; core.cooldowns = cooldowns;
      }
      log.push('【哥布林国王】从哈巴龙背上翻身跃下，王旗引落暴雷。\n【横冲直撞哈巴龙】发出震耳欲聋的咆哮，撕开被践踏的地面。\n$王座分裂$二者分离，分别行动！');
    }
    const living = cores.filter(target => !target.is_defeated); const fallen = cores.filter(target => target.is_defeated);
    if (fallen.length === 1 && living.length === 1) {
      const survivor = living[0]; const cooldowns = jsonObject(survivor.cooldowns);
      if (!cooldowns.royal_beast_enrage) { cooldowns.royal_beast_enrage = 3; survivor.cooldowns = cooldowns; log.push(`$${kingbeastRole(survivor) === 'king' ? '孤王狂怒' : '孤龙狂怒'}$同伴倒下，存活者的怒火彻底失控！\n命中 +200%｜暴击 +200%｜暴伤 +200%｜攻击吸血 40%，持续 3 回合。`); }
    }
  };
  const lowestAliveMemberLevel = Math.min(...aliveMembers.filter(member => !member.is_defeated).map(member => Number(member.level)));
  const combatAutomatons = session.mode === 'spar' || targets.some(target => isAdvancedProfessionTrialMonster(target) || isBossTestMonster(target)) ? [] : await loadCombatAutomatons(connection, session.combat_id, aliveMembers.filter(member => !member.npc_code && !member.is_defeated).map(member => Number(member.id)));
  const [combatSpirits] = await connection.execute<CombatSpiritRow[]>('SELECT owner_character_id,spirit_code,spirit_name,current_hp,hp_max,stats_json,remaining_turns FROM combat_spirits WHERE session_id=? AND current_hp>0 ORDER BY owner_character_id,spirit_code FOR UPDATE', [session.combat_id]);
  const environment = await combatEnvironmentFor(connection, session.combat_id);
  const memberWeatherSpeed = (memberId: number) => 1 + Number(environment?.modifiers.memberSpeedPct ?? 0) * (environment?.modifiers.shelteredCharacterIds?.includes(memberId) ? .25 : 1) / 100;
  const targetWeatherSpeed = 1 + Number(environment?.modifiers.targetSpeedPct ?? 0) / 100;
  const weatherElementMultiplier = (element: string, shelteredCharacterId?: number) => dynamicWeatherElementMultiplier(environment?.modifiers, element, 'direct', shelteredCharacterId);
  for (const member of aliveMembers) if (hasActiveDevice(member, 'rocket_propeller')) {
    const cooldowns = jsonObject(member.cooldowns); const previous = Number(cooldowns.device_rocket_boost ?? 0); const next = Math.min(100, previous + 10);
    cooldowns.device_rocket_boost = next; member.cooldowns = cooldowns;
    if (next > previous) log.push(`&火箭推进&${combatUnitLabel(member)}速度提高至 +${next}%。`);
  }
  const turns = [...combatAutomatons.filter(pet => !pet.battle.exited && pet.unit.hp > 0).map(pet => ({ kind: 'automaton' as const, id: pet.id, speed: pet.unit.speed, order: 200000000 + pet.id, pet })), ...aliveMembers.filter(member => !member.is_defeated).map(member => ({ kind: 'member' as const, id: Number(member.id), speed: Number(member.speed) * memberWeatherSpeed(Number(member.id)) * (1 - (effectValue('member', Number(member.id), 'slow') + effectValue('member', Number(member.id), 'bind')) / 100) * (1 + effectValue('member', Number(member.id), 'sprint') / 100) * (1 + Number(jsonObject(member.cooldowns).device_rocket_boost ?? 0) / 100), order: Number(member.id) })), ...combatSpirits.map((spirit, index) => ({ kind: 'spirit' as const, id: 100000000 + index, speed: storedSpiritStats(spirit).speed, order: 100000000 + index, spirit })), ...targets.filter(target => !target.is_defeated).map(target => ({ kind: 'target' as const, id: Number(target.id), speed: monsterCombatStatsForPlayer(target, lowestAliveMemberLevel).speed * targetWeatherSpeed * (1 - (effectValue('target', Number(target.id), 'slow') + effectValue('target', Number(target.id), 'bind')) / 100) * (1 + effectValue('target', Number(target.id), 'sprint') / 100), order: Number(target.id) }))].sort((a, b) => b.speed - a.speed || a.order - b.order);
  const npcExtraTurns = new Set<object>();
  if(session.mode==='spar')for(const member of members)await(await import('./talent-data')).neutralTalentSnapshot(connection,member,Number(session.turn_no)===1);
  const { rule: rules, get: ruleUnit, takeDamage: ruleTakeDamage } = await createCombatRules(connection, session.combat_id, Number(session.turn_no), members, targets, monsterCombatStats, () => effects, log,
    `${environment?.name ?? ''} ${character.region_name ?? ''}`, (kind, id, hpMax, amount) => absorbLifeShield(connection, session.combat_id, kind, id, hpMax, amount),
    (kind, id) => { if (bonusPhase) return; if (kind === 'target') { const original = turns.find(turn => turn.kind === 'target' && turn.id === id); if (original) { const extra = { ...original }; npcExtraTurns.add(extra); turns.push(extra); } return; } const recipient = members.find(member => Number(member.id) === id); if (recipient) { const cooldowns = jsonObject(recipient.cooldowns); cooldowns.__bonusAction = 1; recipient.cooldowns = cooldowns; log.push('　&时隙赠礼&【' + recipient.name + '】本轮结束后可额外选择一次行动。'); } });
  if(session.mode==='spar'||character.region_name==='首领测试场')for(const unit of rules.units)if(unit.opening)unit.opening.pve=false;
  installAutomatonRules(rules, combatAutomatons);
  const supported=new Set<number>([...combatAutomatons.map(p=>p.ownerId),...combatSpirits.map(p=>Number(p.owner_character_id))]);
  const [followingCompanions]=await connection.execute<RowDataPacket[]>('SELECT character_id FROM player_companions WHERE character_id IN ('+members.map(()=>'?').join(',')+') AND is_out=1 AND released_at IS NULL',members.map(m=>m.id));for(const pet of followingCompanions)supported.add(Number(pet.character_id));
  await loadTalentBattle(connection,rules,members,targets,supported);
  for(const pet of combatAutomatons){const owner=rules.units.find(u=>u.key===`member:${pet.ownerId}`);if(owner&&hasTalent(owner,'A10')&&owner.opening?.settings?.command===`automaton:${pet.id}`)pet.unit.state.memory.talentCommand=1;}
  installBossComponentDamage(rules, new Map(targets.filter(isBossComponent).map(part => [`target:${part.id}`, `target:${componentBodyId(part)}`])));
  for(const part of targets.filter(isBossComponent)){const component=ruleUnit('target',Number(part.id));component.state.memory.talentRoot=`target:${componentBodyId(part)}`;component.state.memory.achievementComponentRoot=`target:${componentBodyId(part)}`;}
  const currentBodyMultiplier = (target: CombatTargetRow) => rules.hooks.bodyMultiplier!(ruleUnit('target', Number(target.id)));
  const absorbRuleShield: typeof absorbLifeShield = async (_connection, _sessionId, kind, id, _hpMax, amount) => {
    const unit = ruleUnit(kind, id); const oldHp = unit.hp;
    const result = await ruleTakeDamage(kind, id, amount);
    // 旧调用方会按 oldHp - (incoming - absorbed) 回写；免死触发时保留规则结算后的生命。
    return unit.hp > 0 && unit.hp !== Math.max(0, oldHp - amount + result.absorbed)
      ? { ...result, absorbed: Math.max(result.absorbed, amount - (oldHp - unit.hp)) } : result;
  };
  if (bonusPhase) for (let index = turns.length - 1; index >= 0; index--) if (turns[index].kind !== 'member') turns.splice(index, 1);
  const ownRuleValue = (kind: 'member' | 'target', id: number, code: string) => ruleUnit(kind, id).state.statuses.filter(effect => effect.code === code && effect.until >= Number(session.turn_no)).reduce((sum, effect) => sum + effect.value * effect.stacks, 0);
  residentValue = (kind,id,code) => {
    if(code==='precision')return ownRuleValue(kind,id,'accuracy')-ownRuleValue(kind,id,'accuracy_down');
    if(code==='battle_cry')return Math.min(ownRuleValue(kind,id,'attack'),ownRuleValue(kind,id,'magic'));
    if(code==='critical_focus')return ownRuleValue(kind,id,'crit_bonus');
    if(code==='alchemy_evasion')return ownRuleValue(kind,id,'evasion')-ownRuleValue(kind,id,'evasion_down');
    return ['armor_shatter','magic_shatter'].includes(code)?ownRuleValue(kind,id,code):0;
  };
  for (const member of members) {
    const unit = ruleUnit('member', Number(member.id)); const modifiers = await modifiersFor(connection, Number(member.id));
    unit.modifiers = Object.fromEntries(Object.entries(modifiers).filter((entry): entry is [string, number] => typeof entry[1] === 'number'));
    unit.attack = (unit.attack + modifiers.physicalAttack) * (1 + modifiers.physicalAttackPct / 100); unit.magic = (unit.magic + modifiers.magicAttack) * (1 + modifiers.magicAttackPct / 100);
    if (modifiers.unifyAttack) unit.attack = unit.magic = Math.max(unit.attack, unit.magic);
    unit.defense *= 1 + modifiers.physicalDefensePct / 100; unit.magicDefense *= 1 + modifiers.magicDefensePct / 100;
    unit.accuracy *= 1 + modifiers.accuracyPct / 100; unit.crit = (unit.crit + modifiers.critRateBp) * (1 + modifiers.critRatePct / 100); unit.critDamage *= 1 + modifiers.critDamagePct / 100;
  }
  rules.hooks.directMultiplier = (source, target, element, magic, single, damageType) => {
    const row = target.side === 'target' ? targets.find(item => Number(item.id) === Number(target.key.split(':')[1])) : undefined;
    const physical = !magic && row ? physicalWeaknessMultiplier(row, damageType) : 1;
    const body = row ? isBossComponent(row) ? single ? 1 : .5 : currentBodyMultiplier(row) : 1;
    return physical * body * weatherElementMultiplier(element, source.side === 'member' ? Number(source.key.split(':')[1]) : undefined) * (1 - Math.min(80, rules.value(target, 'barrier')) / 100);
  };
  for (const turn of turns) if (turn.kind === 'automaton') turn.speed = rules.speed(turn.pet.unit); else if (turn.kind !== 'spirit') turn.speed *= rules.speed(ruleUnit(turn.kind, turn.id)) / Math.max(1, ruleUnit(turn.kind, turn.id).speed);
  turns.sort((a, b) => b.speed - a.speed || a.order - b.order);
  hiddenReorder(rules, turns, entry => entry.kind === 'automaton' ? entry.pet.unit : entry.kind === 'spirit' ? ({ key: `spirit:${entry.id}`, hp: 1 } as import('./combat-rule-registry').RuleUnit) : ruleUnit(entry.kind, entry.id), bonusPhase);
  let resolvedActions = 0;
  for (const turn of turns) {
    if (skipPlayerTurn && turn.kind !== 'target') continue;
    if (turn.kind === 'automaton') { await actAutomaton(rules, turn.pet); continue; }
    const logStart = log.length;
    const extraTurn = bonusPhase || npcExtraTurns.has(turn);
    completeNativeSupport = undefined;
    activeSpecialization = undefined;
    for (const unit of rules.units) unit.castSpecialization = undefined;
    if (bonusPhase && turn.kind === 'member') { const member = members.find(member => Number(member.id) === turn.id)!; const cooldowns = jsonObject(member.cooldowns); delete cooldowns.__bonusAction; member.cooldowns = cooldowns; }
    const talentActor = turn.kind === 'spirit' ? undefined : ruleUnit(turn.kind, turn.id);
    activeEffectSource = talentActor?.key ?? null;
    if(talentActor)await talentBeginAction(rules,talentActor,extraTurn);
    try {
    const canRuleAct = turn.kind === 'spirit' || await rules.beforeAction(ruleUnit(turn.kind, turn.id));
    const controlled = turn.kind === 'spirit' || extraTurn ? false : await processTurnEffects(connection, session.combat_id, turn.kind, turn.id, members, targets, log, absorbRuleShield, rules);
    effects = await activeCombatEffects(connection, session.combat_id);
    if (!canRuleAct) continue;
    for (const component of targets.filter(target => isBossComponent(target) && target.is_defeated)) await resolveBossComponentBreak(component);
    resolveKingbeastState();
    if (turn.kind === 'spirit') {
      const spirit = turn.spirit; if (!spirit || Number(spirit.current_hp) <= 0) continue;
      if (resolvedActions > 0) log.splice(logStart, 0, '————');
      resolvedActions += 1;
      log.push(`➤〖${spirit.spirit_name}〗回应灵契`);
      await resolveCombatSpirits(connection, session.combat_id, members, targets, log, spirit, absorbRuleShield, rules);
      continue;
    }
    if (turn.kind === 'member') {
      const member = members.find(item => Number(item.id) === turn.id)!; if (member.is_defeated) continue;
      const epicLoadout = epicFor(member); const epicCooldowns = jsonObject(member.cooldowns); const turnNo = Number(session.turn_no);
      if (epicSetActive(member, 'valk_forge_regalia', 5) && Number(epicCooldowns.epic_valk_warmth_stacks ?? 0) >= 2 && Number(epicCooldowns.epic_valk_set_ready_turn ?? 0) <= turnNo) {
        epicCooldowns.epic_valk_warmth_stacks = 0; epicCooldowns.epic_valk_set_ready_turn = turnNo + 3; epicCooldowns.epic_valk_forged_until = turnNo + 1; epicCooldowns.epic_valk_furnace_shield_until = turnNo + 1;
        const shield = await grantLifeShield(connection, session.combat_id, 'member', Number(member.id), Number(member.hp_max), Math.floor(Number(member.hp_max) * .10), 2);
        log.push(`&炉壁回铸&${combatUnitLabel(member)}消耗余热，获得${shield.added}点炉壁护盾与炽锻(2)：每回合首次技能直击+10%、穿防8%。`);
      }
      if (hasEpicWeaponEffect(epicLoadout, 'epic_royal_banner_shield') && Number(epicCooldowns.epic_royal_banner_ready_turn ?? 0) <= turnNo) {
        const ally = [...members].filter(item => !item.is_defeated).sort((left, right) => Number(left.current_hp) / Math.max(1, Number(left.hp_max)) - Number(right.current_hp) / Math.max(1, Number(right.hp_max)))[0];
        if (ally && Number(ally.current_hp) / Math.max(1, Number(ally.hp_max)) < .5) {
          const shield = await grantLifeShield(connection, session.combat_id, 'member', Number(ally.id), Number(ally.hp_max), Math.floor(Number(ally.hp_max) * .05), 1);
          epicCooldowns.epic_royal_banner_ready_turn = turnNo + 2;
          log.push(`&王旗庇护&${combatUnitLabel(member)}为${combatUnitLabel(ally)}展开${shield.added}点生命护盾(1)。`);
        }
      }
      member.cooldowns = epicCooldowns;
      const persistentArtifact = await modifiersFor(connection, Number(member.id));
      if (!bonusPhase && persistentArtifact.hpRegenPct) { const oldHp = Number(member.current_hp); const amount = receivedHealingAmount(Math.max(1, Math.floor(Number(member.hp_max) * persistentArtifact.hpRegenPct / 100)), persistentArtifact.healingReceivedPct); member.current_hp = Math.min(Number(member.hp_max), oldHp + amount); if (member.current_hp > oldHp) log.push(`&守誓&恢复 ${member.current_hp - oldHp} HP(${oldHp}→${member.current_hp})`); }
      if (!bonusPhase && persistentArtifact.mpRegenPct) { const oldMp = Number(member.current_mp); member.current_mp = Math.min(Number(member.mp_max), oldMp + Math.max(1, Math.floor(Number(member.mp_max) * persistentArtifact.mpRegenPct / 100))); if (member.current_mp > oldMp) log.push(`&永恒&恢复 ${member.current_mp - oldMp} MP(${oldMp}→${member.current_mp})`); }
      if (resolvedActions > 0) log.splice(logStart, 0, '————');
      resolvedActions += 1;
      if (controlled) continue;
      const choice = jsonObject(member.pending_action) as unknown as PendingAction;
      if(choice.type==='defend'){const unit=ruleUnit('member',Number(member.id));talentCommitAction(unit,'defend');achievementBattleAction(unit,'defend');achievementBattleContribution(unit,'defend');rules.add(unit,'reduction',50,hasTalent(unit,'A08')?100000:1,unit,false,hasTalent(unit,'A08')?'talentDefend':undefined);log.push(`➤${member.name}主动防御。`);continue;}
      if (choice.type === 'escape') { log.push(`➤${combatUnitLabel(member)}选择撤离\n　➥等待队伍共同脱离。`); continue; }
      if(!extraTurn&&session.mode!=='spar'&&character.region_name!=='首领测试场'){await(await import('./companion.service')).companionSupport(connection,rules,ruleUnit('member',Number(member.id)),`${session.combat_id}:${session.turn_no}`);await(await import('./aqua.service')).aquaSupport(connection,rules,ruleUnit('member',Number(member.id)),`${session.combat_id}:${session.turn_no}`);if(targets.every(target=>target.is_defeated))continue;}
      if (choice.type === 'item') {
        const [items] = await connection.execute<(RowDataPacket & { item_id: number; quantity: number; code:string; name: string; effect_json: unknown })[]>(choice.itemId
          ? 'SELECT pi.item_id,pi.quantity,i.code,i.name,i.effect_json FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.item_id=? AND i.item_type=\'consumable\' FOR UPDATE'
          : 'SELECT pi.item_id,pi.quantity,i.code,i.name,i.effect_json FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id JOIN item_definitions i ON i.id=pi.item_id WHERE qi.character_id=? AND qi.quick_slot=? FOR UPDATE', choice.itemId ? [member.id, Number(choice.itemId)] : [member.id, Number(choice.slot)]);
        const item = items[0]; if (!item?.quantity) { log.push(`➤${combatUnitLabel(member)}使用道具\n　➥快捷栏为空。`); continue; }
        const used = await useCombatConsumable(connection, session.combat_id, member, targets, Number(item.item_id), item.name, item.effect_json, rules);
        if (used.consumed) {
          talentCommitAction(ruleUnit('member', Number(member.id)), 'item');
          await (await import('./achievement.service')).consumeAchievementRewardItem(connection,Number(member.id),String(item.code),1);
          await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [member.id, item.item_id]);
          await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [member.id, item.item_id]);
        }
        log.push(`➤${combatUnitLabel(member)}使用[${item.name}]\n　➥${used.message}`); continue;
      }
      if (choice.type === 'device_charge') {
        const [energyRows] = await connection.execute<(RowDataPacket & { current_energy: number; max_energy: number; code: string; name: string })[]>(`SELECT energy.current_energy,energy.max_energy,i.code,i.name FROM combat_device_energy energy
          JOIN player_item_instances ii ON ii.id=energy.instance_id JOIN item_definitions i ON i.id=ii.item_id
          WHERE energy.battle_kind='pve' AND energy.session_id=? AND energy.character_id=? AND energy.instance_id=? FOR UPDATE`, [session.combat_id, member.id, Number(choice.deviceInstanceId)]);
        const energy = energyRows[0];
        if (!energy) { log.push(`➤${combatUnitLabel(member)}尝试为异械充能\n　➥异械未处于本场战斗的生效状态。`); continue; }
        const nextEnergy = Math.min(Number(energy.max_energy), Number(energy.current_energy) + 30);
        if (nextEnergy > Number(energy.current_energy)) talentCommitAction(ruleUnit('member', Number(member.id)), 'device');
        if (nextEnergy - Number(energy.current_energy) >= 30) gainHiddenResource(ruleUnit('member',Number(member.id)),Number(session.turn_no),10);
        await connection.execute("UPDATE combat_device_energy SET current_energy=? WHERE battle_kind='pve' AND session_id=? AND character_id=? AND instance_id=?", [nextEnergy, session.combat_id, member.id, Number(choice.deviceInstanceId)]);
        log.push(`➤${combatUnitLabel(member)}为【${energy.name}】充能\n　➥能量 ${energy.current_energy}→${nextEnergy}/${energy.max_energy}（本回合不选择目标，也不触发效果）。`);
        continue;
      }
      if (choice.type === 'device') {
        const beforeHiddenDevice = hiddenDeviceSnapshot(rules);
        const deviceSkill = activeDeviceSkillByCode.get(String(choice.deviceSkillCode ?? ''));
        const [energyRows] = await connection.execute<(RowDataPacket & { current_energy: number; max_energy: number; code: string; name: string })[]>(`SELECT energy.current_energy,energy.max_energy,i.code,i.name FROM combat_device_energy energy
          JOIN player_item_instances ii ON ii.id=energy.instance_id JOIN item_definitions i ON i.id=ii.item_id
          WHERE energy.battle_kind='pve' AND energy.session_id=? AND energy.character_id=? AND energy.instance_id=? FOR UPDATE`, [session.combat_id, member.id, Number(choice.deviceInstanceId)]);
        const energy = energyRows[0];
        if (!deviceSkill || !energy || deviceSkill.deviceCode !== energy.code) { log.push(`➤${combatUnitLabel(member)}启动异械\n　➥异械配置已失效。`); continue; }
        if (Number(energy.current_energy) < deviceSkill.energyCost) { log.push(`➤${combatUnitLabel(member)}启动【${energy.name}】\n　➥能量不足，本回合应改为充能。`); continue; }
        const cooldowns = jsonObject(member.cooldowns); const cooldownKey = `device_${choice.deviceInstanceId}_${deviceSkill.code}`;
        cooldowns[cooldownKey] = deviceSkill.cooldownTurns + 1; member.cooldowns = cooldowns;
        await connection.execute("UPDATE combat_device_energy SET current_energy=current_energy-? WHERE battle_kind='pve' AND session_id=? AND character_id=? AND instance_id=?", [deviceSkill.energyCost, session.combat_id, member.id, Number(choice.deviceInstanceId)]);
        talentCommitAction(ruleUnit('member', Number(member.id)), 'device');
        const selectedEnemy = targets.find(candidate => !candidate.is_defeated && Number(candidate.id) === Number(choice.targetId));
        const selectedAlly = members.find(candidate => !candidate.is_defeated && Number(candidate.id) === Number(choice.targetId));
        const allyTargets = deviceSkill.targetScope === 'all_allies' ? members.filter(candidate => !candidate.is_defeated) : deviceSkill.targetScope === 'self' ? [member] : choice.targetKind === 'member' && selectedAlly ? [selectedAlly] : [];
        const enemyTargets = deviceSkill.targetScope === 'all_enemies' ? targets.filter(candidate => !candidate.is_defeated) : choice.targetKind === 'target' && selectedEnemy ? [selectedEnemy] : [];
        log.push(`➤${combatUnitLabel(member)}启动异械「${deviceSkill.name}」\n　➥【${energy.name}】消耗 ${deviceSkill.energyCost} 点充能。`);
        const applyDamage = async (enemy: CombatTargetRow, magic: boolean, multiplier: number, element = '') => {
          const stats = monsterCombatStatsForPlayer(enemy, Number(member.level)); const attack = magic ? Number(member.magic_attack) : Number(member.physical_attack); const defense = magic ? stats.magicDefense : stats.physicalDefense;
          const accuracyBonus = hasActiveDevice(member, 'precision_scope') ? 10 : 0;
          const damageBonus = (hasActiveDevice(member, 'rail_stabilizer') ? 12 : 0) + (element === '雷' && hasActiveDevice(member, 'electromagnetic_coil_cannon') ? 12 : 0);
          const strike = resolveStrike(attack * multiplier / 100 * (1 + damageBonus / 100), defense, Number(member.accuracy) * (1 + accuracyBonus / 100), stats.evasion, Number(member.crit_rate_bp), stats.critResist, Number(member.crit_damage_bp), stats.critReduction, false, !magic && persistentArtifact.physicalForceCrit, 0, 0, 1, strikeCorrections(ruleUnit('member', Number(member.id)),ruleUnit('target', Number(enemy.id))));
          if (!strike.hit) { log.push(`　➥【${targetName(enemy)}】闪避了异械攻击。`); return; }
          const exposed = effectValue('target', Number(enemy.id), 'exposed'); const barrier = effectValue('target', Number(enemy.id), 'barrier');
          const elemental = element ? elementalMultiplier(member.element_mastery_json, enemy.element_resistance_json, element) * weatherElementMultiplier(element) : 1;
          const partAoeMultiplier = deviceSkill.targetScope === 'all_enemies' && isBossComponent(enemy) && Number(enemy.id) !== Number(member.selected_target_id) ? .5 : 1;
          let damage = directDamageVariance(Math.max(1, Math.floor(strike.damage * elemental * (1 + exposed / 100) * (1 - Math.min(80, barrier) / 100) * partAoeMultiplier * (isBossComponent(enemy) ? 1 : currentBodyMultiplier(enemy)))));
          damage = await rules.incoming(ruleUnit('member',Number(member.id)),ruleUnit('target',Number(enemy.id)),damage,element,magic,true,deviceSkill.targetScope!=='all_enemies',true,false);
          const oldHp = Number(enemy.current_hp); const shield = await ruleTakeDamage('target', Number(enemy.id), damage, deviceSkill.targetScope === 'all_enemies',ruleUnit('member',Number(member.id))); damage = shield.incoming;
          if (damage>0) await hiddenAfterHit(rules,ruleUnit('member',Number(member.id)),ruleUnit('target',Number(enemy.id)),true,false);
          await connection.execute('UPDATE combat_threat SET threat=threat+? WHERE session_id=? AND spawn_id=? AND character_id=?', [damage*(hasTalent(ruleUnit('member',Number(member.id)),'A06')?1.5:1), session.combat_id, enemy.id, member.id]);
          log.push(`　➥对【${targetName(enemy)}】造成 ${damage} 点${magic ? '魔法' : '物理'}伤害${lifeShieldAbsorptionText(shield)}(${oldHp}→${enemy.current_hp})。`);
        };
        const damageEnemies = (hit: (enemy: CombatTargetRow) => Promise<void>) => rules.areaDamage(enemyTargets.map(enemy => ruleUnit('target', Number(enemy.id))), unit => hit(enemyTargets.find(enemy => `target:${enemy.id}` === unit.key)!));
        if (deviceSkill.effect === 'physical_evade_once') await applyAdvancedStatus('member', Number(member.id), 'device_physical_evade', 1, 99);
        else if (deviceSkill.effect === 'easter_egg') {
          const target = choice.targetKind === 'member' ? selectedAlly : selectedEnemy; const kind = choice.targetKind === 'member' ? 'member' : 'target';
          if (target) {
            const pool = [['precision', 30], ['critical_focus', 30], ['sprint', 30], ['barrier', 15], ['regeneration', 4], ['mana_regeneration', 8], ['slow', 30], ['evasion_down', 30], ['exposed', 15], ['bind', 20], ['burn', 3], ['poison', 2]] as const;
            const picked = [...pool].sort(() => Math.random() - .5).slice(0, 5); for (const [code, value] of picked) await applyAdvancedStatus(kind, Number(target.id), code, value, 2);
            log.push(`　&彩蛋&${combatUnitLabel(target)}随机获得 5 种持续 2 回合的效应。`);
          }
        } else if (deviceSkill.effect === 'physical_all') await damageEnemies(enemy => applyDamage(enemy, false, deviceSkill.power ?? 100));
        else if (deviceSkill.effect === 'precision_aim') { for (const ally of allyTargets) { await applyAdvancedStatus('member', Number(ally.id), 'precision', 100, 99); await applyAdvancedStatus('member', Number(ally.id), 'critical_focus', 100, 99); } }
        else if (deviceSkill.effect === 'recycling_reflux') { const restored = await restoreCombatDeviceEnergy(connection, session.combat_id, Number(member.id), 20, Number(choice.deviceInstanceId)); log.push(`　&回收回流&其余 ${restored} 件已生效主动异械各恢复至多 20 点充能。`); }
        else if (deviceSkill.effect === 'weave_repair' || deviceSkill.effect === 'autonomous_repair') {
          for (const ally of allyTargets) { const before = Number(ally.current_hp); const ratio = deviceSkill.effect === 'weave_repair' ? .18 : .30; ally.current_hp = Math.min(Number(ally.hp_max), before + Math.floor(Number(ally.hp_max) * ratio));
            if (deviceSkill.effect === 'weave_repair') {
              const [negative] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT ce.id FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=? AND ce.target_kind='member' AND ce.target_id=? AND e.effect_type IN ('damage_over_time','stat_modifier','control') ORDER BY ce.id LIMIT 1 FOR UPDATE`, [session.combat_id, ally.id]);
              if (negative[0]) await connection.execute('DELETE FROM combat_status_effects WHERE id=?', [negative[0].id]);
            }
            if (deviceSkill.effect === 'autonomous_repair' && await hasLifeShield('member', Number(ally.id))) await restoreCombatDeviceEnergy(connection, session.combat_id, Number(ally.id), 20);
            log.push(`　➥${combatUnitLabel(ally)}HP ${before}→${ally.current_hp}。`); }
        } else if (deviceSkill.effect === 'gravity_tether') for (const enemy of enemyTargets) await applyAdvancedStatus('target', Number(enemy.id), 'bind', 30, 2);
        else if (deviceSkill.effect === 'fold_barrier') for (const ally of allyTargets) await applyAdvancedStatus('member', Number(ally.id), 'barrier', 15, 2 + (hasActiveDevice(member, 'fold_barrier_generator') ? 1 : 0));
        else if (deviceSkill.effect === 'shock_pile') await damageEnemies(async enemy => { await applyDamage(enemy, false, 120); if (Math.random() < .65) await applyAdvancedStatus('target', Number(enemy.id), 'stun', 1, 1); });
        else if (deviceSkill.effect === 'frost_pulse') await damageEnemies(async enemy => { await applyDamage(enemy, true, 100, '冰'); await applyAdvancedStatus('target', Number(enemy.id), 'slow', 25, 2); });
        else if (deviceSkill.effect === 'phase_decoy') for (const ally of allyTargets) await applyAdvancedStatus('member', Number(ally.id), 'phase_decoy', 80, 99);
        else if (deviceSkill.effect === 'counter_spider') { for (const enemy of enemyTargets) if (!await dispelOneTargetBuff(enemy)) await applyAdvancedStatus('target', Number(enemy.id), 'exposed', 15, 2); }
        else if (deviceSkill.effect === 'coil_cannon') await damageEnemies(async enemy => { await applyDamage(enemy, false, 180, '雷'); await applyAdvancedStatus('target', Number(enemy.id), 'exposed', 25, 2); });
        else if (deviceSkill.effect === 'reactor_overcharge') { member.current_hp = Math.max(1, Number(member.current_hp) - Math.floor(Number(member.current_hp) * .15)); await damageEnemies(enemy => applyDamage(enemy, true, 230, '火')); }
        else if (deviceSkill.effect === 'reactor_thermal_share') for (const ally of allyTargets) { await applyAdvancedStatus('member', Number(ally.id), 'battle_cry', 20, 2); if (ally.secondary_profession_code === 'deconstructor') await restoreCombatDeviceEnergy(connection, session.combat_id, Number(ally.id), 10); }
        hiddenNativeDevice(rules,ruleUnit('member',Number(member.id)),deviceSkill,beforeHiddenDevice);
        continue;
      }
      let target = targets.find(item => Number(item.id) === Number(choice.targetKind === 'target' ? choice.targetId : member.selected_target_id) && !item.is_defeated) ?? targets.find(item => !item.is_defeated); if (!target) continue;
      if (effectValue('member', Number(member.id), 'alchemy_confusion') > 0) { const candidates = targets.filter(item => !item.is_defeated); target = candidates[random(0, candidates.length - 1)] ?? target; log.push(`#混乱#${combatUnitLabel(member)}的攻击目标变得随机。`); }
      const counterReady = effectValue('member', Number(member.id), 'advanced_counter_ready');
      if (counterReady > 0) {
        await removeAdvancedStatus('member', Number(member.id), ['advanced_counter_ready']);
        if (Math.random() * 100 < counterReady) {
          const counterMonster = monsterCombatStatsForPlayer(target, Number(member.level)); const counterStrike = resolveStrike(Number(member.physical_attack) * .9, counterMonster.physicalDefense, Number(member.accuracy), counterMonster.evasion, Number(member.crit_rate_bp), counterMonster.critResist, Number(member.crit_damage_bp), counterMonster.critReduction, false, false, 0, 0, 1, strikeCorrections(ruleUnit('member', Number(member.id))));
          if (counterStrike.hit) { const oldHp = Number(target.current_hp); const bodyMultiplier = isBossComponent(target) ? 1 : bossBodyDamageMultiplier(target, targets); const dealt = directDamageVariance(Math.max(1, Math.floor(counterStrike.damage * bodyMultiplier))); const shield = await absorbRuleShield(connection, session.combat_id, 'target', Number(target.id), Number(target.hp_max), dealt); const hpDamage = dealt - shield.absorbed; target.current_hp = Math.max(0, oldHp - hpDamage); if (!target.current_hp) target.is_defeated = 1; await connection.execute('UPDATE combat_threat SET threat=threat+? WHERE session_id=? AND spawn_id=? AND character_id=?', [dealt, session.combat_id, target.id, member.id]); log.push(`&反击架势&${combatUnitLabel(member)}反击【${targetName(target)}】，造成 ${dealt} 点物理伤害${lifeShieldAbsorptionText(shield)}(${oldHp}→${target.current_hp})。`); }
          else log.push(`&反击架势&${combatUnitLabel(member)}的反击被【${targetName(target)}】闪避。`);
        } else log.push(`&反击架势&${combatUnitLabel(member)}未能抓住反击空隙。`);
      }
      const strikingUnit=ruleUnit('member',Number(member.id));
      if(['attack','skill'].includes(choice.type)&&strikingUnit.state.memory.talentWeakness){
        delete strikingUnit.state.memory.talentWeakness;
        const known=canAppraiseTarget(appraisal,Number(target.level))&&appraisal.informationLevel>=4;
        log.push(known?`　➥白虎洞察：已公开的物理弱点为${stringList(target.weakness_json).join('、')||'无'}。`:'　➥白虎洞察：当前鉴识尚未公开该目标的弱点。');
      }
      if(choice.type==='attack'){const unit=ruleUnit('member',Number(member.id));talentCommitAction(unit,'attack','斩击',true,false);achievementBattleAction(unit,'attack');unit.state.memory.achievementNormalAttackAction=Number(unit.state.memory.achievementAction??0);}
      const modifiers = persistentArtifact; const swordAction = choice.type === 'attack'; const unifiedAttack = modifiers.unifyAttack || rules.passive(ruleUnit('member', Number(member.id)), 'G01') ? Math.max(Number(member.physical_attack), Number(member.magic_attack)) : 0; let skillScale = 1; let attack = ((unifiedAttack || Number(member.physical_attack)) + modifiers.physicalAttack) * (1 + modifiers.physicalAttackPct / 100); let power = 1; let kind = '物理'; let damageType = '斩击'; let element = ''; let label = '普通攻击'; let skillId: number | undefined; let skillCode: string | undefined; let skillCategory: 'physical' | 'magic' | 'utility' | 'special' | undefined; let skillTargetScope = '单体';
      if (choice.type === 'skill') {
        const [skills] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; category: 'physical' | 'magic' | 'utility' | 'special'; damage_type: string; element: string; target_scope: string; mana_cost: number; cooldown_turns: number; cooldown_reduction_per_level: number; power: number; level: number; power_per_level: number })[]>(choice.skillId ? 'SELECT s.id,s.code,s.name,s.tier,s.category,s.damage_type,s.element,s.range_type,s.target_scope,s.mana_cost,s.chant_turns,s.cooldown_turns,s.cooldown_reduction_per_level,s.power,ps.level,s.power_per_level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.skill_id=?' : 'SELECT s.id,s.code,s.name,s.tier,s.category,s.damage_type,s.element,s.range_type,s.target_scope,s.mana_cost,s.chant_turns,s.cooldown_turns,s.cooldown_reduction_per_level,s.power,ps.level,s.power_per_level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot=?', choice.skillId ? [member.id, Number(choice.skillId)] : [member.id, Number(choice.slot)]);
        const skill = skills[0]; if (!skill) { log.push(`➤${combatUnitLabel(member)}释放技能\n　➥技能栏为空。`); continue; }
        const unit = ruleUnit('member', Number(member.id)); const resident = residentSkillByCode(skill.code);
        const casting = unit.state.cast?.code === skill.code ? unit.state.cast : undefined;
        if (choice.chantRelease && !casting) { log.push(`➤${combatUnitLabel(member)}的吟唱已被打断，本次行动结束。`); continue; }
        if (rules.status(unit, 'silence') && !casting) { log.push('➤【' + member.name + '】处于沉默，无法使用技能。'); continue; }
        if (casting && casting.releaseTurn > Number(session.turn_no)) { log.push('➤【' + member.name + '】继续吟唱「' + skill.name + '」。。。'); continue; }
        const [specializationRows] = await connection.execute<(RowDataPacket & { specialization: string; level: number })[]>('SELECT specialization,level FROM player_skill_specializations WHERE character_id=? AND skill_id=?', [member.id, skill.id]); const specialized = skillSpecialization({ ...skill, tier: String(skill.tier), chant_turns: Number(skill.chant_turns ?? 0) }, Object.fromEntries(specializationRows.map(row => [row.specialization, Number(row.level)])) as SkillSpecializations);
        if (isHiddenSkill(skill.code)) {
          unit.castSpecialization = specialized;
          const context = await hiddenBattleContext(connection, Number(member.id), session.combat_id, 'pve');
          try { await executeHiddenCombat(rules, unit, skill.code, choice.hidden ?? {}, context); } catch (error) { if (!(error instanceof HiddenBattleError)) throw error; log.push('　➥' + error.message); }
          continue;
        }
        const baseManaCost = Math.max(skill.mana_cost ? 1 : 0, Math.ceil(specialized.mana * (modifiers.manaAffinity ? .7 : 1)) - modifiers.manaCostReduction);
        const otherRequired = resident && ['D01', 'C06', 'F04', 'I04'].includes(resident.id);
        const chosenFriend = choice.targetKind === 'member' ? rules.allies(unit).find(friend => friend.key === `member:${choice.targetId}`) : undefined;
        if (otherRequired && (rules.allies(unit).length < 2 || chosenFriend?.key === unit.key)) { log.push('➤【' + unit.name + '】需要另一名存活友方，未支付资源。'); continue; }
        const hasDebt = unit.state.memory.debtSkill === skill.code;
        const transfer = skill.code === 'resident_d01' ? manaTransferCost(Number(member.current_mp)) : 0;
        const manaCost = casting ? 0 : transfer || rules.manaCost(unit, Math.ceil(baseManaCost * (hasDebt ? 1.4 : 1)));
        const manaGap = Math.max(0, manaCost - Number(member.current_mp));
        if (manaGap && (transfer > 0 || !modifiers.bloodForMana || Number(member.current_hp) <= manaGap)) { log.push('➤【' + member.name + '】释放技能「' + skill.name + '」\n　➥MP不足。'); continue; }
        if (skill.code === 'nightblade_silent_finale' && effectValue('target', Number(target.id), 'advanced_hunt') <= 0) { log.push(`➤${combatUnitLabel(member)}释放技能「${skill.name}」\n　➥目标尚未被追猎标定。`); continue; }
        if (skill.code === 'ranger_hundred_hunt' && effectValue('target', Number(target.id), 'advanced_hunt') <= 0) { log.push(`➤${combatUnitLabel(member)}释放技能「${skill.name}」\n　➥目标尚未被追猎标定。`); continue; }
        const harmfulTalentSkill=['physical','magic'].includes(skill.category);
        if (['summoner_contract_spirit','summoner_spirit_tether','summoner_star_pact'].includes(skill.code)) {
          const [spirits] = await connection.execute<RowDataPacket[]>('SELECT spirit_code FROM combat_spirits WHERE session_id=? AND owner_character_id=? AND current_hp>0 LIMIT 1', [session.combat_id, member.id]);
          if (!spirits.length) { log.push('　&灵契&场上没有可回应的灵体，未支付资源。'); continue; }
        }
        if(!casting&&!talentCanPaySkill(unit,harmfulTalentSkill)){log.push('　➥焚命者的HP不足，未支付资源。');continue;}
        const resourceRequirement = advancedResourceRequirementForSkill(skill.code);
        if (!casting && resourceRequirement && !await spendResource(member, resourceRequirement.amount, skill.name)) { const resource = resourceFor(Number(member.id)); log.push(`➤${combatUnitLabel(member)}释放技能「${skill.name}」\n　➥${resource?.resource_name ?? '专属资源'}不足（需要 ${resourceRequirement.amount}）。`); continue; }
        if(!casting)talentPaySkill(unit,harmfulTalentSkill);
        member.current_mp = Math.max(0, Number(member.current_mp) - manaCost);
        if (manaGap) { member.current_hp -= manaGap; log.push('&命运代偿&消耗 ' + manaGap + ' HP 补足魔力。'); }
        const cooldowns = jsonObject(member.cooldowns);
        const cooldown = casting?.cooldown ?? specialized.cooldown + (hasDebt ? 2 : 0);
        const prayer=hasTalent(unit,'H04')&&Number(skill.chant_turns??0)>=1;
        const chant = casting ? 0 : (await consumeAlchemyChant(rules, unit, specialized.chant))+(prayer?1:0);
        if (transfer) unit.state.memory.manaTransfer = transfer;
        if (!casting) await rules.paid(unit, transfer ? 0 : manaCost, { category: skill.category, cooldown });
        if (hasDebt) delete unit.state.memory.debtSkill;
        if (chant > 0 && !casting) {
          unit.state.cast = { code: skill.code, skillId: Number(skill.id), target: (choice.targetKind ?? 'target') + ':' + (choice.targetId ?? target.id), paid: manaCost, releaseTurn: Number(session.turn_no) + chant, cooldown };
          member.cooldowns = cooldowns; log.push('【' + member.name + '】开始了' + skill.name + '技能吟唱。。。'); continue;
        }
        if (casting) delete unit.state.cast;
        talentCommitAction(unit,harmfulTalentSkill?'skill':'support',skill.damage_type,skill.target_scope!=='全体',resident?.ranged??skill.range_type==='远程',prayer);
        const supportAction=!harmfulTalentSkill||['ally','self','allies'].includes(String(resident?.scope??''));achievementBattleAction(unit,supportAction?'support':'attack');if(supportAction)unit.state.memory.achievementSupportAction=Number(unit.state.memory.achievementAction??0);else delete unit.state.memory.achievementSupportAction;
        activeSpecialization = specialized;
        unit.castSpecialization = specialized;
        cooldowns[skill.code] = cooldown + 1; member.cooldowns = cooldowns; skillId = Number(skill.id); skillCode = skill.code; skillCategory = skill.category; skillTargetScope = skill.target_scope; label = `释放技能「${skill.name}」`; kind = skill.category === 'magic' ? '魔法' : '物理'; damageType = skill.damage_type; element = skill.element;
        const specializationFacts=normalSkillSpecializationFacts(String(skill.category),specializationRows.map(row=>({specialization:String(row.specialization),level:Number(row.level)})));
        if(specializationFacts.length)recordAchievement(connection,Number(member.id),specializationFacts,`specialization-use:${session.combat_id}:${session.turn_no}:${member.id}:${skill.id}`);
        await achievementBookSkillUsed(connection,Number(member.id),Number(skill.id),`${session.combat_id}:${session.turn_no}:${member.id}:${skill.id}`);
        if (resident) {
          const recipient = rules.units.find(candidate => candidate.key === (casting?.target ?? (choice.targetKind ?? 'target') + ':' + (choice.targetId ?? target!.id)) && candidate.hp > 0)
            ?? (resident.scope === 'ally' || resident.scope === 'self' ? unit : rules.enemies(unit)[0]);
          if (recipient) await rules.cast(unit, recipient, resident, casting?.paid ?? manaCost, String(cooldowns.__enchantElement ?? '风'), extraTurn);
          await triggerBulwarkFormation(member); continue;
        }
        if (skill.category === 'utility') {
          const snapshots = rules.allies(unit).map(ally => ({ ally, before: rules.supportSnapshot(ally) }));
          completeNativeSupport = async () => {
            effects = await activeCombatEffects(connection, session.combat_id);
            const changed = snapshots.filter(({ ally, before }) => ally.hp > before.hp || ally.mp > before.mp || rules.effects(ally).some(e => !e.debuff && !before.effects.some(old => old.code === e.code && old.value >= e.value && old.until >= e.until)));
            for (let index = 0; index < changed.length; index++) await rules.rootEcho(unit);
            if (!extraTurn && skill.target_scope !== '全体' && changed.length === 1) await rules.echoSupport(unit, changed[0].ally, changed[0].before);
          };
        }
        if (skill.code === 'machine_echo') {
          const restored = await restoreCombatDeviceEnergy(connection, session.combat_id, Number(member.id), 25);
          log.push(`➤${combatUnitLabel(member)}释放技能「万机回响」\n　&万机回响&当前角色 ${restored} 件已生效主动异械各恢复至多 25 点充能；不影响队友或未生效异械。`);
          continue;
        }
        if (skill.code === 'elementalist_cinderfrost_cycle') { const next = Number(cooldowns.advanced_elementalist_cycle ?? 0) ? 0 : 1; cooldowns.advanced_elementalist_cycle = next; element = next ? '火' : '冰'; }
        skillScale = specialized.power / 100;
        const magicBase = unifiedAttack || Number(member.magic_attack); const physicalBase = unifiedAttack || Number(member.physical_attack);
        const magicAttack = (magicBase + modifiers.magicAttack) * (1 + modifiers.magicAttackPct / 100);
        const physicalAttack = (physicalBase + modifiers.physicalAttack) * (1 + modifiers.physicalAttackPct / 100);
        const spellbladePhysicalSkill = skill.category === 'physical' && resourceFor(Number(member.id))?.profession_code === 'spellblade';
        const attackBase = skill.category === 'magic' ? magicAttack : spellbladePhysicalSkill ? Math.min(magicAttack, physicalAttack + magicAttack * .35) : physicalAttack;
        attack = attackBase * skillScale; power = skill.category === 'magic'
          ? (1 + modifiers.magicDamagePct / 100 + (skill.element === '光' ? modifiers.lightSkillBonusPct / 100 : 0)) * (1 + modifiers.magicSkillDamagePct / 100)
          : (1 + modifiers.physicalSkillDamagePct / 100);
        power *= specialized.damageFactor;
      }
      const actionStyle = choice.type === 'attack' ? 'physical' : skillCategory; let spellbladePreviousAction = '';
      if (resourceFor(Number(member.id))?.profession_code === 'spellblade' && (actionStyle === 'physical' || actionStyle === 'magic')) {
        const actionCooldowns = jsonObject(member.cooldowns); const previous = String(actionCooldowns.advanced_spellblade_action ?? '');
        spellbladePreviousAction = previous;
        await gainResource(member, 20, actionStyle === 'magic' ? '施放魔法' : '进行物理攻击');
        if (previous && previous !== actionStyle) await gainResource(member, 15, '完成法刃换挡');
        actionCooldowns.advanced_spellblade_action = actionStyle; member.cooldowns = actionCooldowns;
      }
      const spirit = skillCode ? spiritDefinitionBySkill(skillCode) : undefined;
      if (spirit) {
        const result = await summonCombatSpirit(connection, session.combat_id, member, spirit);
        log.push(`➤${combatUnitLabel(member)}${label}`);
        log.push(`　&灵契&${result.refreshed ? `重新维系〖${spirit.name}〗（持续${spirit.duration}回合）` : `〖${spirit.name}〗回应召唤，灵位 ${result.active}/${result.limit}`}`);
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'summoner_contract_spirit' || skillCode === 'summoner_spirit_tether' || skillCode === 'summoner_star_pact') {
        const [spirits] = await connection.execute<CombatSpiritRow[]>('SELECT owner_character_id,spirit_code,spirit_name,current_hp,hp_max,stats_json,remaining_turns FROM combat_spirits WHERE session_id=? AND owner_character_id=? AND current_hp>0 FOR UPDATE', [session.combat_id, member.id]);
        log.push(`➤${combatUnitLabel(member)}${label}`);
        if (!spirits.length) {
          throw new Error('灵体状态发生变化，请重新选择行动；本次资源支付已回滚。');
        }
        if (skillCode === 'summoner_contract_spirit') {
          await connection.execute('UPDATE combat_spirits SET remaining_turns=remaining_turns+1 WHERE session_id=? AND owner_character_id=? AND current_hp>0', [session.combat_id, member.id]);
          log.push(`　&灵契&${spirits.length} 只存活灵体的维系时间延长1回合。`);
        } else {
          if (skillCode === 'summoner_star_pact') await connection.execute("UPDATE combat_spirits SET remaining_turns=remaining_turns+3,stats_json=JSON_SET(stats_json,'$.overload',3) WHERE session_id=? AND owner_character_id=? AND current_hp>0", [session.combat_id, member.id]);
          for (const current of spirits) await resolveCombatSpirits(connection, session.combat_id, members, targets, log, current, absorbRuleShield, rules);
          if (skillCode === 'summoner_spirit_tether') await gainResource(member, 20, '以灵线牵引灵体');
          log.push(`　&灵契&${skillCode === 'summoner_star_pact' ? '群星契约延长灵体3回合，并令其' : '灵线牵引令灵体'}立刻回应。`);
        }
        await triggerBulwarkFormation(member);
        continue;
      }
      if (modifiers.prayerHymn && skillCategory === 'utility') { for (const ally of members.filter(item => !item.is_defeated)) await applyArtifactEffect(connection, session.combat_id, 'prayer_hymn', 'member', Number(ally.id), [], false); log.push('#祈祷圣音#受益对象每回合恢复3.0%生命与魔力(3)'); }
      if (skillCode === 'warrior_taunt_player') {
        log.push(`➤${combatUnitLabel(member)}${label}`);
        for (const target of targets.filter(item => !item.is_defeated)) {
          const [threatRows] = await connection.execute<(RowDataPacket & { character_id: number; threat: number })[]>('SELECT character_id,threat FROM combat_threat WHERE session_id=? AND spawn_id=? FOR UPDATE', [session.combat_id, target.id]);
          let transferred = 0;
          for (const row of threatRows) if (Number(row.character_id) !== Number(member.id)) { const amount = Math.floor(Number(row.threat) / 2); transferred += amount; await connection.execute('UPDATE combat_threat SET threat=threat-? WHERE session_id=? AND spawn_id=? AND character_id=?', [amount, session.combat_id, target.id, row.character_id]); }
          await connection.execute('UPDATE combat_threat SET threat=threat+? WHERE session_id=? AND spawn_id=? AND character_id=?', [transferred, session.combat_id, target.id, member.id]);
        }
        if (hasInheritance(Number(member.id), 'bulwark_guard')) {
          const cooldowns = jsonObject(member.cooldowns); cooldowns.heritage_round_taunt = 1; member.cooldowns = cooldowns;
        }
        log.push('　#挑衅#队友仇恨减半，减少的仇恨已转移至自身。');
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'bulwark_vicarious_guard') {
        const ally = members.find(item => !item.is_defeated && choice.targetKind === 'member' && Number(item.id) === Number(choice.targetId)) ?? [...members].filter(item => !item.is_defeated).sort((left, right) => Number(left.current_hp) / Math.max(1, Number(left.hp_max)) - Number(right.current_hp) / Math.max(1, Number(right.hp_max)))[0] ?? member;
        const allyCooldowns = jsonObject(ally.cooldowns); allyCooldowns.advanced_guard_source = Number(member.id); ally.cooldowns = allyCooldowns;
        await applyAdvancedStatus('member', Number(ally.id), 'advanced_guard', 35, 2, true);
        await applyAdvancedStatus('member', Number(member.id), 'barrier', 20, 2, true);
        log.push(`➤${combatUnitLabel(member)}${label}\n　#守护#${combatUnitLabel(ally)}获得守护(2)：首次单体伤害的35%将转移给${combatUnitLabel(member)}。\n　#代偿减伤#${combatUnitLabel(member)}获得20%伤害减免(2)。`);
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'bulwark_immovable_mountain') {
        if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', member, 'member', 'on_cast', log, 0, 1, rules);
        await applyAdvancedStatus('member', Number(member.id), 'inheritance_control_resist', 20, 2, true);
        const cooldowns = jsonObject(member.cooldowns); cooldowns.advanced_bulwark_mountain = 2; cooldowns.advanced_bulwark_hits = 0; member.cooldowns = cooldowns;
        log.push(`➤${combatUnitLabel(member)}${label}\n　#不动如山#减伤35%、控制抗性20%(2)。本回合承受3次攻击后，下次行动将自动反击。`);
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'warlord_triumph_banner') {
        const spellbladeSupport = consumeSpellbladeSupport(member);
        for (const ally of members.filter(item => !item.is_defeated)) {
          if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', ally, 'member', 'on_cast', [], spellbladeSupport, 1, rules);
          await applyAdvancedStatus('member', Number(ally.id), 'inheritance_control_resist', 15 * (1 + spellbladeSupport / 100), 2, true);
          if (targets.filter(item => !item.is_defeated).length >= 3) {
            const oldHp = Number(ally.current_hp); ally.current_hp = Math.min(Number(ally.hp_max), oldHp + await specializedNativeHealing(member, ally, Math.floor(Number(ally.hp_max) * .08),true));
          }
        }
        log.push(`➤${combatUnitLabel(member)}${label}\n　#凯旋战旗#全队伤害+10%、控制抗性+15%(2)${targets.filter(item => !item.is_defeated).length >= 3 ? '，并回复8%最大生命。' : '。'}`);
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'aegis_watch_bastion') {
        const ally = members.find(item => !item.is_defeated && choice.targetKind === 'member' && Number(item.id) === Number(choice.targetId)) ?? [...members].filter(item => !item.is_defeated).sort((left, right) => Number(left.current_hp) / Math.max(1, Number(left.hp_max)) - Number(right.current_hp) / Math.max(1, Number(right.hp_max)))[0] ?? member;
        await applyAdvancedStatus('member', Number(ally.id), 'barrier', 15, 2, true); markAegisBarrier(member, ally, 2);
        await applyAdvancedStatus('member', Number(ally.id), 'inheritance_control_resist', 20, 2, true);
        log.push(`➤${combatUnitLabel(member)}${label}\n　#守望壁垒#${combatUnitLabel(ally)}获得15%减伤壁垒与20%控制抗性(2)。`);
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'aegis_shared_vow') {
        const recipients = [...members].filter(item => !item.is_defeated).sort((left, right) => Number(left.current_hp) / Math.max(1, Number(left.hp_max)) - Number(right.current_hp) / Math.max(1, Number(right.hp_max))).slice(0, 2);
        for (const ally of recipients) { await applyAdvancedStatus('member', Number(ally.id), 'barrier', 20, 2, true); markAegisBarrier(member, ally, 2); }
        const warrior = members.find(item => !item.is_defeated && ['bulwark_guard', 'war_lord', 'ironbreaker'].includes(String(resourceFor(Number(item.id))?.profession_code ?? '')));
        if (warrior) await gainResource(warrior, 10, '获得分担圣约支援');
        log.push(`➤${combatUnitLabel(member)}${label}\n　#分担圣约#生命最低的${recipients.length}名队友获得20%减伤(2)。`);
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'aegis_undying_dome') {
        for (const ally of members.filter(item => !item.is_defeated)) { await applyAdvancedStatus('member', Number(ally.id), 'barrier', 20, 2, true); markAegisBarrier(member, ally, 2); await applyAdvancedStatus('member', Number(ally.id), 'advanced_undying', 1, 2, true); }
        log.push(`➤${combatUnitLabel(member)}${label}\n　#不灭穹顶#全队获得20%减伤壁垒(2)，期间各可触发一次濒危不倒。`);
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'saint_healer_resonant_mass') {
        log.push(`➤${combatUnitLabel(member)}${label}`);
        for (const ally of members.filter(item => !item.is_defeated)) {
          const oldHp = Number(ally.current_hp); const received = await modifiersFor(connection, Number(ally.id)); const amount = receivedHealingAmount(Math.max(1, Math.floor((Number(member.magic_attack) * .65 + Number(ally.hp_max) * .05) * (1 + modifiers.healingBonusPct / 100))), received.healingReceivedPct); ally.current_hp = Math.min(Number(ally.hp_max), oldHp + await specializedNativeHealing(member, ally, amount));
          await applyAdvancedStatus('member', Number(ally.id), 'regeneration', 6 + modifiers.regenerationBonusPct, 2, true);
          await triggerEpicEffectiveHeal(member, ally, oldHp, oldHp / Math.max(1, Number(ally.hp_max)) < .5);
          if (oldHp / Math.max(1, Number(ally.hp_max)) < .4) await applyAdvancedStatus('member', Number(ally.id), 'advanced_prayer', 1, 3, true);
          log.push(`　➥${combatUnitLabel(ally)}恢复 ${ally.current_hp - oldHp} HP，并获得${6 + modifiers.regenerationBonusPct}%再生(2)(${oldHp}→${ally.current_hp})`);
        }
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'saint_healer_revival_sanctuary') {
        log.push(`➤${combatUnitLabel(member)}${label}`);
        for (const ally of members.filter(item => !item.is_defeated)) {
          const oldHp = Number(ally.current_hp); ally.current_hp = Math.min(Number(ally.hp_max), oldHp + await specializedNativeHealing(member, ally, Math.floor(Number(ally.hp_max) * .18 * (1 + modifiers.healingBonusPct / 100)),true));
          if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', ally, 'member', 'on_cast', [], 0, 1, rules);
          await triggerEpicEffectiveHeal(member, ally, oldHp, oldHp / Math.max(1, Number(ally.hp_max)) < .5);
          log.push(`　➥${combatUnitLabel(ally)}恢复 ${ally.current_hp - oldHp} HP，并净化1个异常、获得再生(2)。`);
        }
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'aegis_luminous_echo') {
        for (const ally of members.filter(item => !item.is_defeated)) {
          await applyAdvancedStatus('member', Number(ally.id), 'barrier', 10, 1, true); markAegisBarrier(member, ally, 1); await applyAdvancedStatus('member', Number(ally.id), 'regeneration', 5, 1, true);
          const cooldowns = jsonObject(ally.cooldowns); cooldowns.advanced_aegis_echo = 1; ally.cooldowns = cooldowns;
        }
        log.push(`➤${combatUnitLabel(member)}${label}\n　#光幕回响#全队获得10%减伤壁垒与再生(1)。壁垒首次承伤后回复7%最大生命。`);
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'ranger_guiding_smoke') {
        for (const ally of members.filter(item => !item.is_defeated)) { if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', ally, 'member', 'on_cast', [], 0, 1, rules); await applyAdvancedStatus('member', Number(ally.id), 'alchemy_evasion', 20, 1, true); }
        for (const enemy of targets.filter(item => !item.is_defeated)) await applyAdvancedStatus('target', Number(enemy.id), 'imbalance', 15, 1, true);
        log.push(`➤${combatUnitLabel(member)}${label}\n　#诱导烟幕#全队闪避+20%、减伤15%(1)，敌方全体命中-15%(1)。`);
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'healing_prayer' || skillCode === 'healing_light' || skillCode === 'saint_healer_mending_prayer' || skillCode === 'saint_healer_absolution_hand') {
        const ally = members.find(item => !item.is_defeated && choice.targetKind === 'member' && Number(item.id) === Number(choice.targetId)) ?? [...members].filter(item => !item.is_defeated).sort((left, right) => Number(left.current_hp) / Number(left.hp_max) - Number(right.current_hp) / Number(right.hp_max))[0] ?? member;
        const received = await modifiersFor(connection, Number(ally.id));
        const healingScale = skillCode === 'healing_prayer' ? 1.35 : skillCode === 'saint_healer_mending_prayer' ? .9 : skillCode === 'saint_healer_absolution_hand' ? .6 : 1;
        const spellbladeSupport = consumeSpellbladeSupport(member);
        const oldHp = Number(ally.current_hp); const hpRatioBeforeHeal = oldHp / Math.max(1, Number(ally.hp_max)); const lowHpForFaith = hpRatioBeforeHeal < .5; const lowHpForSaintInheritance = hpRatioBeforeHeal < .4; const controlBefore = rules.effects(ruleUnit('member', Number(ally.id))).filter(effect => ['stun', 'sleep', 'fear', 'confusion', 'blind', 'silence', 'bind'].includes(effect.code) && canDispelCombatEffect(effect.code, 'ordinary', Boolean(effect.mechanism))).map(effect => effect.code); const flatBonus = skillCode === 'saint_healer_mending_prayer' ? Math.floor(Number(ally.hp_max) * .08) : 0; const amount = Math.max(1, Math.floor((Number(member.magic_attack) * healingScale + flatBonus) * (1 + modifiers.healingBonusPct / 100) * (1 + received.healingReceivedPct / 100) * (1 + spellbladeSupport / 100))); ally.current_hp = Math.min(Number(ally.hp_max), oldHp + await specializedNativeHealing(member, ally, amount));
        log.push(`➤${combatUnitLabel(member)}${label}`); log.push(`　➥${combatUnitLabel(ally)}恢复 ${ally.current_hp - oldHp} HP(${oldHp}→${ally.current_hp})`);
        if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', ally, 'member', 'on_cast', log, spellbladeSupport, 1, rules);
        await triggerEpicEffectiveHeal(member, ally, oldHp, hpRatioBeforeHeal < .5);
        if (skillCode === 'saint_healer_absolution_hand' && controlBefore.some(code => !rules.status(ruleUnit('member', Number(ally.id)), code))) { await applyAdvancedStatus('member', Number(ally.id), 'barrier', 10, 1, true); await gainResource(member, 20, '净化控制效果'); }
        if (skillCode === 'saint_healer_mending_prayer' && lowHpForFaith) await gainResource(member, 25, '救治低于50%生命的队友');
        if (skillCode === 'saint_healer_mending_prayer' || skillCode === 'saint_healer_absolution_hand') await applyAdvancedStatus('member', Number(ally.id), 'advanced_prayer', 1, 3, true);
        if (skillCode === 'saint_healer_mending_prayer' || skillCode === 'saint_healer_absolution_hand') for (const dawn of members.filter(item => resourceFor(Number(item.id))?.profession_code === 'dawn_inquisitor')) await gainResource(dawn, 10, '队友获得祷言');
        if (spellbladeSupport) log.push(`&攻势换挡&本次治疗强化 ${spellbladeSupport}%，下一次伤害技能已蓄势。`);
        const saintValue = inheritanceValue(Number(member.id), 'saint_healer');
        if (lowHpForSaintInheritance && saintValue) { await refreshCombatSpiritEffect(connection, session.combat_id, 'member', Number(ally.id), 'barrier', saintValue, 1); log.push(`&余辉援护&为低血的${combatUnitLabel(ally)}追加 ${saintValue}% 减伤壁垒(1)。`); }
        if (ally.current_hp > oldHp) { achievementBattleContribution(ruleUnit('member',Number(member.id)),'support'); await rewardSummonerSupport('队友获得治疗'); }
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'blessing_aegis') {
        log.push(`➤${combatUnitLabel(member)}${label}`);
        const spellbladeSupport = consumeSpellbladeSupport(member);
        for (const ally of members.filter(item => !item.is_defeated)) {
          if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', ally, 'member', 'on_cast', [], spellbladeSupport, 1, rules);
          if (resourceFor(Number(member.id))?.profession_code === 'aegis_priest') markAegisBarrier(member, ally, 3);
        }
        log.push(`#减伤#全队获得${(18 * (1 + spellbladeSupport / 100)).toFixed(1)}%伤害减免(3)${spellbladeSupport ? `｜攻势换挡使护盾增益提高${spellbladeSupport}%` : ''}`);
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'mana_benediction') {
        log.push(`➤${combatUnitLabel(member)}${label}`);
        const spellbladeSupport = consumeSpellbladeSupport(member);
        for (const ally of members.filter(item => !item.is_defeated)) if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', ally, 'member', 'on_cast', [], spellbladeSupport, 1, rules);
        log.push(`#回流#全队每回合恢复${(5 * (1 + spellbladeSupport / 100)).toFixed(1)}%魔力(3)${spellbladeSupport ? `｜攻势换挡使增益提高${spellbladeSupport}%` : ''}`);
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCode === 'war_cry') {
        log.push(`➤${combatUnitLabel(member)}${label}`);
        const spellbladeSupport = consumeSpellbladeSupport(member);
        for (const ally of members.filter(item => !item.is_defeated)) if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', ally, 'member', 'on_cast', [], spellbladeSupport, 1, rules);
        log.push(`#战吼#全队物攻、魔攻提高${(10 * (1 + spellbladeSupport / 100)).toFixed(1)}%(2)${spellbladeSupport ? `｜攻势换挡使增益提高${spellbladeSupport}%` : ''}`);
        await triggerBulwarkFormation(member);
        continue;
      }
      if (skillCategory === 'utility') {
        log.push(`➤${combatUnitLabel(member)}${label}`);
        const recipients = skillTargetScope === '全体' ? members.filter(ally => !ally.is_defeated) : skillTargetScope === '自身' ? [member] : [members.find(ally => !ally.is_defeated && choice.targetKind === 'member' && Number(ally.id) === Number(choice.targetId)) ?? member];
        const spellbladeSupport = consumeSpellbladeSupport(member);
        for (const [index, ally] of recipients.entries()) if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', ally, 'member', 'on_cast', index === 0 ? log : [], spellbladeSupport, 1, rules);
        if (spellbladeSupport) {
          log.push(`&攻势换挡&本次辅助效果提高 ${spellbladeSupport}%，下一次伤害技能已蓄势。`);
        }
        if (skillCode === 'warrior_taunt') {
          const taunt = Number(member.physical_defense) + Number(member.magic_defense);
          await connection.execute('UPDATE combat_threat SET threat=threat+? WHERE session_id=? AND character_id=?', [taunt, session.combat_id, member.id]);
          if (hasInheritance(Number(member.id), 'bulwark_guard')) { const cooldowns = jsonObject(member.cooldowns); cooldowns.heritage_round_taunt = 1; member.cooldowns = cooldowns; await gainResource(member, 20, '使用嘲讽'); }
          log.push(`　$挑衅$全体怪物对${combatUnitLabel(member)}的仇恨提高 ${taunt}`);
        }
        if (skillCode === 'spellblade_phase_guard') {
          const cooldowns = jsonObject(member.cooldowns); cooldowns.advanced_phase_guard = 1; member.cooldowns = cooldowns;
          await applyAdvancedStatus('member', Number(member.id), 'alchemy_evasion', 20, 1, true);
        }
        if (['summoner_returning_veil', 'blessing_aegis', 'aegis_luminous_echo', 'aegis_undying_dome'].includes(String(skillCode))) await rewardSummonerSupport('队友获得壁垒');
        await triggerBulwarkFormation(member);
        continue;
      }
      const nextActionEffects = effects.filter(effect => effect.target_kind === 'member' && Number(effect.target_id) === Number(member.id) && (effect.code === 'mist_veil' || effect.code === 'shadow_pierce'));
      const swordSkill = choice.type === 'skill' && damageType === '斩击'; const artifactAction = swordAction || swordSkill;
      if (artifactAction && modifiers.artifact === 'holy_sword') kind = '物理';
      if (artifactAction && modifiers.artifact === 'demon_sword') { kind = '魔法'; attack = (Number(member.magic_attack) + modifiers.magicAttack) * (1 + modifiers.magicAttackPct / 100) * skillScale; }
      if (skillCode === 'bulwark_bastion_judgment') {
        for (const ally of members.filter(item => !item.is_defeated)) await applyAdvancedStatus('member', Number(ally.id), 'barrier', 15, 2, true);
        const cooldowns = jsonObject(target.cooldowns); cooldowns.advanced_taunt_source = Number(member.id); target.cooldowns = cooldowns;
        await applyAdvancedStatus('target', Number(target.id), 'advanced_taunt', 1, 2, true);
      }
      const actorUnit = ruleUnit('member', Number(member.id));
      const redirected = rules.redirect(actorUnit, ruleUnit('target', Number(target.id)), true);
      if (redirected.side === 'member') {
        log.push('➤【' + member.name + '】' + label);
        const hit = await rules.strike(actorUnit, redirected, skillScale * 100, element, kind === '魔法', extraTurn, false, 1, { skill: Boolean(skillId), redirected: true, damageType, specializedPower: true });
        const ally = members.find(item => Number(item.id) === Number(redirected.key.split(':')[1]));
        if (hit && skillId && ally) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', ally, 'member', 'on_hit', log, 0, 1, rules);
        continue;
      }
      target = targets.find(item => Number(item.id) === Number(redirected.key.split(':')[1])) ?? target;
      const swap = skillId ? await rules.consume(actorUnit, kind === '魔法' ? 'swap_magic' : 'swap_physical') : undefined;
      if (swap) attack = (kind === '魔法' ? Math.min(actorUnit.attack, actorUnit.magic) : Math.max(actorUnit.attack, actorUnit.magic)) * skillScale;
      const expanded = skillId && !extraTurn && skillTargetScope === '单体' && await rules.consume(actorUnit, 'expand');
      if (expanded) skillTargetScope = '全体';
      const affectedTargets = skillTargetScope === '全体' ? targets.filter(item => !item.is_defeated) : [target]; const surge = effectValue('member', Number(member.id), 'demon_surge'); const mistVeil = effectValue('member', Number(member.id), 'mist_veil'); const shadowPierce = effectValue('member', Number(member.id), 'shadow_pierce'); const battleCry = effectValue('member', Number(member.id), 'battle_cry'); const imbalance = effectValue('member', Number(member.id), 'imbalance'); const precision = effectValue('member', Number(member.id), 'precision'); const criticalFocus = effectValue('member', Number(member.id), 'critical_focus'); const physicalAttack = kind === '物理';
      let elementalistRestored = false; let elementalistMarkResourceGained = false; let warlordMarked = false; let spellbladeDamageSpent = false;
      let ironbreakerTriggered = false; let venomancerTriggered = false; let rangerTriggered = false;
      log.push(`➤${combatUnitLabel(member)}${label}`); if (nextActionEffects.length) await connection.execute(`DELETE FROM combat_status_effects WHERE id IN (${nextActionEffects.map(() => '?').join(',')})`, nextActionEffects.map(effect => effect.id));
      await rules.areaDamage(affectedTargets.map(row => ruleUnit('target', Number(row.id))), async struckUnit => {
        const struckTarget = affectedTargets.find(row => Number(row.id) === Number(struckUnit.key.split(':')[1]))!;
        if (struckTarget.is_defeated) return;
        const targetCooldowns = jsonObject(struckTarget.cooldowns); const markedWarlords = Object.keys(targetCooldowns).filter(key => key.startsWith('heritage_round_warlord_')).map(key => Number(key.slice('heritage_round_warlord_'.length))).filter(ownerId => ownerId !== Number(member.id));
        const hadArmorBefore = effectValue('target', Number(struckTarget.id), 'armor_shatter') > 0;
        const debuffCodes = await inheritanceDebuffCodes(skillId);
        let freshDebuffCodes: string[] = []; let appliedDebuffCodes: string[] = []; let dawnDispelled = false;
        if (debuffCodes.length) {
          const [currentDebuffs] = await connection.execute<(RowDataPacket & { code: string })[]>(`SELECT e.code FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id
            WHERE ce.session_id=? AND ce.target_kind='target' AND ce.target_id=? AND e.code IN (${debuffCodes.map(() => '?').join(',')})`, [session.combat_id, struckTarget.id, ...debuffCodes]);
          const present = new Set(currentDebuffs.map(row => row.code)); freshDebuffCodes = debuffCodes.filter(code => !present.has(code));
        }
        const resonanceDamage = Math.max(...markedWarlords.map(ownerId => inheritanceValue(ownerId, 'war_lord')), 0); const resonanceAccuracy = Math.max(...markedWarlords.map(ownerId => inheritanceValue(ownerId, 'war_lord', 1)), 0);
        const dawnKey = `heritage_dawn_${member.id}`; const dawnDamage = skillId && targetCooldowns[dawnKey] ? inheritanceValue(Number(member.id), 'dawn_inquisitor') : 0;
        const targetWeakened = effectValue('target', Number(struckTarget.id), 'vulnerability') + effectValue('target', Number(struckTarget.id), 'sword_break') + effectValue('target', Number(struckTarget.id), 'armor_shatter') + effectValue('target', Number(struckTarget.id), 'magic_shatter') + effectValue('target', Number(struckTarget.id), 'exposed') + effectValue('target', Number(struckTarget.id), 'poison') + effectValue('target', Number(struckTarget.id), 'burn') + effectValue('target', Number(struckTarget.id), 'bleeding') > 0;
        const ironCrit = !ironbreakerTriggered && skillId && skillTargetScope === '单体' && targetWeakened ? inheritanceValue(Number(member.id), 'ironbreaker') : 0;
        const venomCrit = !venomancerTriggered && skillId && targetWeakened ? inheritanceValue(Number(member.id), 'venomancer') : 0;
        const nightDamage = skillId && Number(struckTarget.current_hp) / Math.max(1, Number(struckTarget.hp_max)) <= .35 ? inheritanceValue(Number(member.id), 'nightblade') : 0;
        const spellbladeDamage = !spellbladeDamageSpent && skillId && targetCooldowns ? (jsonObject(member.cooldowns).heritage_spellblade_damage ? inheritanceValue(Number(member.id), 'spellblade', 1) : 0) : 0;
        const marksBeforeHit = elementMarks(struckTarget); const huntBonus = effectValue('target', Number(struckTarget.id), 'advanced_hunt'); const hunterOwnsMark = Number(jsonObject(struckTarget.cooldowns).advanced_hunt_source ?? 0) === Number(member.id); const mapping = effectValue('target', Number(struckTarget.id), 'advanced_mapping'); const formationBonus = effectValue('target', Number(struckTarget.id), 'advanced_formation'); const lightMarkBonus = effectValue('target', Number(struckTarget.id), 'advanced_light_mark'); const exposedStacks = effects.filter(effect => effect.target_kind === 'target' && Number(effect.target_id) === Number(struckTarget.id) && effect.code === 'exposed').reduce((total, effect) => total + Number(effect.stacks), 0);
        let advancedMultiplier = 1; let consumeMarks: string[] = []; let forceNoCritical = false;
        const epicLoadout = epicFor(member); const isSkillDirect = Boolean(skillId) && (skillCategory === 'physical' || skillCategory === 'magic'); const memberCooldowns = jsonObject(member.cooldowns);
        const targetHasNonDotDebuff = effects.some(effect => effect.target_kind === 'target' && Number(effect.target_id) === Number(struckTarget.id)
          && ['stat_modifier', 'control'].includes(effect.effect_type) && !['barrier', 'battle_cry', 'mist_veil', 'shadow_pierce', 'royal_intercept', 'life_shield'].includes(effect.code));
        const redFurnaceReady = isSkillDirect && hasEpicWeaponEffect(epicLoadout, 'epic_redfurnace_longsword') && Number(memberCooldowns.epic_redfurnace_stacks ?? 0) >= 2;
        const forgedReady = isSkillDirect && epicSetActive(member, 'valk_forge_regalia', 5) && Number(memberCooldowns.epic_valk_forged_until ?? 0) >= Number(session.turn_no) && Number(memberCooldowns.epic_valk_forged_round ?? 0) !== Number(session.turn_no);
        const emergencyForgeReady = isSkillDirect && epicSetActive(member, 'valk_forge_regalia', 5) && Number(memberCooldowns.epic_valk_emergency_forge_until ?? 0) >= Number(session.turn_no);
        const mistTideReady = isSkillDirect && skillCategory === 'magic' && epicSetActive(member, 'mistmother_cocoon', 5) && Number(memberCooldowns.epic_mist_tide_stacks ?? 0) >= 3;
        const huntOrderKey = `epic_court_hunt_${member.id}`; const huntOrderExpiresKey = `${huntOrderKey}_expires`;
        const courtHuntReady = isSkillDirect && skillCategory === 'physical' && epicSetActive(member, 'goblin_court_hunt', 5) && Number(targetCooldowns[huntOrderKey] ?? 0) >= 2 && Number(targetCooldowns[huntOrderExpiresKey] ?? 0) >= Number(session.turn_no);
        const hunterFangReady = isSkillDirect && hasEpicWeaponEffect(epicLoadout, 'epic_court_hunter_dagger') && Number(targetCooldowns.epic_hunter_fang_source ?? 0) === Number(member.id) && Number(targetCooldowns.epic_hunter_fang_turn ?? 0) === Number(session.turn_no) - 1;
        const moltenRivetReady = isSkillDirect && skillCategory === 'physical' && hasEpicWeaponEffect(epicLoadout, 'epic_moltenrivet_fistblade') && Number(targetCooldowns.epic_molten_rivet_source ?? 0) === Number(member.id) && Number(targetCooldowns.epic_molten_rivet_turn ?? 0) === Number(session.turn_no) - 1;
        if (isSkillDirect && epicSetActive(member, 'valk_forge_regalia', 3)) advancedMultiplier *= 1 + Math.min(4, Number(memberCooldowns.epic_valk_warmth_stacks ?? 0) * 2) / 100;
        if (isSkillDirect && epicSetActive(member, 'mistmother_cocoon', 3) && skillCategory === 'magic') advancedMultiplier *= 1.06;
        if (isSkillDirect && epicSetActive(member, 'goblin_court_hunt', 3) && targetWeakened) advancedMultiplier *= 1.06;
        if (isSkillDirect && hasEpicWeaponEffect(epicLoadout, 'epic_zhenling_longsword') && await hasLifeShield('member', Number(member.id))) advancedMultiplier *= 1.08;
        if (redFurnaceReady) advancedMultiplier *= 1.12;
        if (forgedReady) advancedMultiplier *= 1.10;
        if (emergencyForgeReady) advancedMultiplier *= 1.08;
        if (mistTideReady) advancedMultiplier *= 1.35;
        if (hunterFangReady) advancedMultiplier *= 1.10;
        if (moltenRivetReady) advancedMultiplier *= 1.08;
        if (isSkillDirect && skillCategory === 'physical' && hasEpicWeaponEffect(epicLoadout, 'epic_temperedflame_dagger') && Number(struckTarget.current_hp) / Math.max(1, Number(struckTarget.hp_max)) < .5) advancedMultiplier *= 1.12;
        if (isSkillDirect && hasEpicWeaponEffect(epicLoadout, 'epic_vanguard_fistblade') && targetHasNonDotDebuff && Number(targetCooldowns[`epic_vanguard_round_${member.id}`] ?? 0) !== Number(session.turn_no)) advancedMultiplier *= 1.08;
        if (skillCode === 'bulwark_bastion_judgment' && Number(struckTarget.id) === Number(target.id)) advancedMultiplier *= 1.6;
        if (skillCode === 'warlord_hundred_battle_sweep') advancedMultiplier *= 1 + Math.min(60, ['slow', 'bind', 'stun'].reduce((total, code) => total + (effectValue('target', Number(struckTarget.id), code) > 0 ? 15 : 0), 0)) / 100;
        if (skillCode === 'ironbreaker_breaking_pursuit' && (effectValue('target', Number(struckTarget.id), 'exposed') > 0 || huntBonus > 0)) advancedMultiplier *= 1.35;
        if (skillCode === 'ironbreaker_gap_execution' && Number(struckTarget.current_hp) / Math.max(1, Number(struckTarget.hp_max)) < .35) advancedMultiplier *= 1.45;
        if (skillCode === 'ironbreaker_steel_flash') forceNoCritical = true;
        if (skillCode === 'ironbreaker_steel_flash' && exposedStacks) advancedMultiplier *= 1 + exposedStacks * .08;
        if (skillCode === 'spellblade_arcane_thrust' && spellbladePreviousAction === 'physical') advancedMultiplier *= 1.35;
        if (skillCode === 'elementalist_storm_chain') {
          const reactiveMarks = marksBeforeHit.filter(mark => ['element_mark_fire', 'element_mark_ice', 'element_mark_wind'].includes(mark.code));
          advancedMultiplier *= 1 + Math.min(30, reactiveMarks.length * 15) / 100;
        }
        if (skillCode === 'elementalist_fourfold_resonance') {
          const stabilizingMarks = marksBeforeHit.filter(mark => ['element_mark_fire', 'element_mark_ice', 'element_mark_thunder'].includes(mark.code));
          advancedMultiplier *= 1 + Math.min(30, stabilizingMarks.length * 10) / 100;
        }
        if (skillCode === 'elementalist_sky_sequence') {
          consumeMarks = marksBeforeHit.map(mark => mark.code);
          advancedMultiplier *= 1 + Math.min(40, consumeMarks.length * 10) / 100;
        }
        if (skillCode === 'nightblade_crescent_throat' && Number(struckTarget.current_hp) / Math.max(1, Number(struckTarget.hp_max)) < .4) advancedMultiplier *= 215 / 175;
        if (skillCode === 'nightblade_gap_stab' && huntBonus > 0 && (effectValue('target', Number(struckTarget.id), 'exposed') > 0 || effectValue('target', Number(struckTarget.id), 'armor_shatter') > 0 || effectValue('target', Number(struckTarget.id), 'bind') > 0 || effectValue('target', Number(struckTarget.id), 'stun') > 0)) advancedMultiplier *= 1.36;
        if (huntBonus > 0 && hunterOwnsMark && skillCode !== 'nightblade_shadow_mark') advancedMultiplier *= 1 + huntBonus / 100;
        if (formationBonus > 0 && skillId) advancedMultiplier *= 1 + formationBonus / 100;
        if (skillCode?.startsWith('elementalist_') && lightMarkBonus > 0) advancedMultiplier *= 1 + lightMarkBonus / 100;
        const monster = monsterCombatStatsForPlayer(struckTarget, Number(member.level));
        const physicalDefenseReduction = effectValue('target', Number(struckTarget.id), 'vulnerability') + effectValue('target', Number(struckTarget.id), 'sword_break') + effectValue('target', Number(struckTarget.id), 'armor_shatter');
        const magicDefenseReduction = effectValue('target', Number(struckTarget.id), 'magic_shatter');
        const enemyBattleCry = effectValue('target', Number(struckTarget.id), 'battle_cry'); const bind = effectValue('target', Number(struckTarget.id), 'bind'); const evasionDown = effectValue('target', Number(struckTarget.id), 'evasion_down');
        const baseDefense = kind === '魔法' ? monster.magicDefense : monster.physicalDefense;
        const epicDefensePierce = (redFurnaceReady ? 8 : 0) + (forgedReady ? 8 : 0);
        const defenseReduction = (kind === '魔法' ? magicDefenseReduction : modifiers.ignoreDefensePct + physicalDefenseReduction) + epicDefensePierce;
        const defense = Math.floor(baseDefense * (1 + enemyBattleCry / 100) * (1 - Math.min(90, defenseReduction) / 100));
        const setup = await rules.attackSetup(actorUnit, ruleUnit('target', Number(struckTarget.id)), kind === '魔法', Boolean(skillId), kind === '魔法' || damageType === '刺击');
        const strike = resolveStrike(attack * power * advancedMultiplier * (1 + surge / 100) * (1 + mistVeil / 100) * (1 + battleCry / 100) * (Number(session.turn_no) === 1 ? 1 + Number(session.opening_damage_bonus) : 1), defense * (1 + ownRuleValue('target', Number(struckTarget.id), kind === '魔法' ? 'magic_defense' : 'defense') / 100), Number(member.accuracy) * (1 + modifiers.accuracyPct / 100) * (1 + precision / 100) * (1 + resonanceAccuracy / 100) * (1 + mapping / 100) * (1 - imbalance / 100), monster.evasion * (1 - bind / 100) * (1 - evasionDown / 100), forceNoCritical ? 0 : (Number(member.crit_rate_bp) + modifiers.critRateBp) * (1 + modifiers.critRatePct / 100) * (1 + criticalFocus / 100) * (1 + (ironCrit + venomCrit + (mapping > 0 ? 8 : 0)) / 100), monster.critResist, Number(member.crit_damage_bp) * (1 + modifiers.critDamagePct / 100), monster.critReduction, setup.forceHit, (physicalAttack && modifiers.physicalForceCrit) || shadowPierce > 0, modifiers.minimumHitRatePct, (setup.hitBonus * 100) + (physicalAttack ? modifiers.physicalActualHitRatePct : 0), setup.hitFactor, strikeCorrections(actorUnit,ruleUnit('target', Number(struckTarget.id))));
        if (skillCode === 'bulwark_shieldwall_advance') {
          const cooldowns = jsonObject(struckTarget.cooldowns); cooldowns.advanced_taunt_source = Number(member.id); struckTarget.cooldowns = cooldowns;
          await applyAdvancedStatus('target', Number(struckTarget.id), 'advanced_taunt', 1, 2, true);
          await gainResource(member, 20, '以盾墙顶住敌意');
        }
        if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', struckTarget, 'target', 'on_cast', log, 0, 1, rules); if (!strike.hit) { await rules.missed(actorUnit, ruleUnit('target', Number(struckTarget.id))); log.push(`　➥【${targetName(struckTarget)}】闪避了攻击`); return; }
        const physicalMultiplier = kind === '物理' ? physicalWeaknessMultiplier(struckTarget, damageType) : 1; const elementalMultiplierValue = elementalMultiplier(member.element_mastery_json, struckTarget.element_resistance_json, element); const weatherElement = weatherElementMultiplier(element); const targetBarrier = effectValue('target', Number(struckTarget.id), 'barrier'); const royalIntercept = skillTargetScope === '单体' ? effectValue('target', Number(struckTarget.id), 'royal_intercept') : 0; const exposed = effectValue('target', Number(struckTarget.id), 'exposed'); const mentorPassiveReduction = Number(jsonObject(jsonObject(advancedMentorBuildFor(struckTarget)?.passive).effect).damageReductionPct ?? 0); const inheritanceDamage = resonanceDamage + dawnDamage + nightDamage + spellbladeDamage;
        // 部位只吃全体招式的一半最终伤害；本体则按存活部位数承受 0.70^N 的最终伤害。
        const partAoeMultiplier = isBossComponent(struckTarget) && skillTargetScope === '全体' && Number(struckTarget.id) !== Number(target.id) ? .5 : 1;
        const bodyReductionMultiplier = isBossComponent(struckTarget) ? 1 : currentBodyMultiplier(struckTarget);
        let damage = directDamageVariance(Math.max(1, Math.floor(strike.damage * physicalMultiplier * elementalMultiplierValue * weatherElement * (1 + modifiers.damageBonusPct / 100) * (1 + exposed / 100) * (1 + inheritanceDamage / 100) * (1 - Math.min(80, targetBarrier) / 100) * (1 - Math.min(80, royalIntercept) / 100) * (1 - Math.min(80, mentorPassiveReduction) / 100) * (strike.crit ? (1 + modifiers.criticalDamageBonusPct / 100) * (1 + (physicalAttack ? modifiers.physicalCriticalFinalDamagePct : 0) / 100) : 1) * partAoeMultiplier * bodyReductionMultiplier)));
        damage = await rules.incoming(ruleUnit('member', Number(member.id)), ruleUnit('target', Number(struckTarget.id)), damage * setup.powerFactor * (expanded && Number(struckTarget.id) !== Number(target.id) ? .65 : 1), element, kind === '魔法', Boolean(skillId), skillTargetScope !== '全体', true);
        const oldHp = Number(struckTarget.current_hp); const shield = await ruleTakeDamage('target', Number(struckTarget.id), damage, skillTargetScope === '全体',ruleUnit('member',Number(member.id))); damage = shield.incoming; const hpDamage = damage - shield.absorbed;
        if(strike.crit&&hpDamage>0)achievementBattleEvidence(ruleUnit('member',Number(member.id))).crit=true;
        await rules.afterHit(ruleUnit('member', Number(member.id)), ruleUnit('target', Number(struckTarget.id)), hpDamage, element, Boolean(skillId), shield.absorbed, extraTurn, kind !== '物理');
        await connection.execute('UPDATE combat_threat SET threat=threat+? WHERE session_id=? AND spawn_id=? AND character_id=?', [damage*(hasTalent(ruleUnit('member',Number(member.id)),'A06')?1.5:1), session.combat_id, struckTarget.id, member.id]);
        if (isBossComponent(struckTarget)) { const body = targets.find(candidate => Number(candidate.id) === componentBodyId(struckTarget)); if (body) await connection.execute('UPDATE combat_threat SET threat=threat+? WHERE session_id=? AND spawn_id=? AND character_id=?', [Math.floor(damage * .6), session.combat_id, body.id, member.id]); }
        if (modifiers.lifestealPct && (choice.type === 'attack' || damageType === '刺击')) { const rawLifesteal = Math.floor(hpDamage * modifiers.lifestealPct / 100); if (rawLifesteal) member.current_hp = Math.min(Number(member.hp_max), Number(member.current_hp) + receivedHealingAmount(rawLifesteal, modifiers.healingReceivedPct)); }
        const observer = appraisalForTarget(appraisal, Number(struckTarget.level)); if (royalIntercept) { await connection.execute(`DELETE ce FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=? AND ce.target_kind='target' AND ce.target_id=? AND e.code='royal_intercept'`, [session.combat_id, struckTarget.id]); log.push('　$王庭拦截$本次单体伤害降低25%。'); }
        resolveKingbeastState(); log.push(observer ? `　➥${observer.informationLevel >= 4 ? affinityTag(physicalMultiplier, elementalMultiplierValue) : ''}${strike.crit ? '[暴击!]' : ''}对【${targetName(struckTarget)}】造成 ${damage}点${kind}伤害${lifeShieldAbsorptionText(shield)}(${oldHp}→${struckTarget.current_hp})` : `　➥对【???】造成 ???点${kind}伤害(???→???)`);
        if (skillCode === 'ranger_hundred_hunt' && !struckTarget.is_defeated) {
          const ally = members.filter(item => !item.is_defeated && Number(item.id) !== Number(member.id)).sort((left, right) => Number(right.speed) - Number(left.speed) || Number(left.id) - Number(right.id))[0];
          if (ally) {
            const monster = monsterCombatStatsForPlayer(struckTarget, Number(ally.level)); const cooperation = resolveStrike(Number(ally.physical_attack) * .7, monster.physicalDefense, Number(ally.accuracy), monster.evasion, 0, monster.critResist, Number(ally.crit_damage_bp), monster.critReduction, false, false, 0, 0, 1, strikeCorrections(ruleUnit('member', Number(ally.id))));
            if (cooperation.hit) { const oldHp = Number(struckTarget.current_hp); const followUp = directDamageVariance(Math.max(1, cooperation.damage)); const shield = await absorbRuleShield(connection, session.combat_id, 'target', Number(struckTarget.id), Number(struckTarget.hp_max), followUp); const hpDamage = followUp - shield.absorbed; struckTarget.current_hp = Math.max(0, oldHp - hpDamage); if (!struckTarget.current_hp) struckTarget.is_defeated = 1; log.push(`　&协同追击&${combatUnitLabel(ally)}追加 ${followUp} 点基础物理伤害${lifeShieldAbsorptionText(shield)}(${oldHp}→${struckTarget.current_hp})。`); }
          }
        }
        if (skillCode === 'nightblade_silent_finale' && struckTarget.is_defeated) { member.current_mp = Math.min(Number(member.mp_max), Number(member.current_mp) + 50); log.push('　&无声终章&完成斩杀，返还 50 MP。'); }
        if (skillCode === 'spellblade_starfire_duel' && struckTarget.is_defeated) { const cooldowns = jsonObject(member.cooldowns); cooldowns.spellblade_phase_guard = 0; member.cooldowns = cooldowns; log.push('　&星火决斗&击杀目标，重置相位格挡冷却。'); }
        if (skillTargetScope === '单体' && modifiers.pursuitChancePct && !struckTarget.is_defeated && Math.random() * 100 < modifiers.pursuitChancePct) { const pursuitOldHp = Number(struckTarget.current_hp); const pursuitDamage = directDamageVariance(damage); const shield = await absorbRuleShield(connection, session.combat_id, 'target', Number(struckTarget.id), Number(struckTarget.hp_max), pursuitDamage); const hpDamage = pursuitDamage - shield.absorbed; struckTarget.current_hp = Math.max(0, pursuitOldHp - hpDamage); if (!struckTarget.current_hp) struckTarget.is_defeated = 1; log.push(`&追击&再次对【${targetName(struckTarget)}】造成 ${pursuitDamage} 点${kind}伤害${lifeShieldAbsorptionText(shield)}(${pursuitOldHp}→${struckTarget.current_hp})`); }
        if (artifactAction && modifiers.artifact === 'holy_sword' && strike.crit) await applyArtifactEffect(connection, session.combat_id, 'sword_break', 'target', Number(struckTarget.id), log);
        if (artifactAction && modifiers.artifact === 'demon_sword') await applyArtifactEffect(connection, session.combat_id, 'demon_surge', 'member', Number(member.id), log);
        const venomStatusBonusPct = venomCrit; const effectCaster = venomStatusBonusPct ? { ...member, tenacity_pierce: Math.round(Number((member as any).tenacity_pierce ?? 0) * (1 + venomStatusBonusPct / 100)) } : member;
        if (skillId) await applySkillEffects(connection, session.combat_id, skillId, effectCaster, 'member', struckTarget, 'target', 'on_hit', log, 0, expanded && Number(struckTarget.id) !== Number(target.id) ? .5 : 1, rules);
        effects = await activeCombatEffects(connection, session.combat_id);
        if (isSkillDirect && hasEpicWeaponEffect(epicLoadout, 'epic_redfurnace_longsword')) {
          const cooldowns = jsonObject(member.cooldowns);
          if (redFurnaceReady) { cooldowns.epic_redfurnace_stacks = 0; log.push('&赤炉长剑&消耗满层炉火：本次技能直击+12%、穿防8%。'); }
          else { const stacks = Math.min(2, Number(cooldowns.epic_redfurnace_stacks ?? 0) + 1); cooldowns.epic_redfurnace_stacks = stacks; log.push(`&赤炉长剑&获得炉火${stacks}/2。`); }
          member.cooldowns = cooldowns;
        }
        if (forgedReady) { const cooldowns = jsonObject(member.cooldowns); cooldowns.epic_valk_forged_round = Number(session.turn_no); member.cooldowns = cooldowns; log.push('&炽锻&本回合首次技能直击获得+10%伤害与8%穿防。'); }
        if (emergencyForgeReady) { const cooldowns = jsonObject(member.cooldowns); cooldowns.epic_valk_emergency_forge_until = 0; member.cooldowns = cooldowns; log.push('&余烬急锻&消耗急锻，本次技能直击+8%。'); }
        if (courtHuntReady) {
          const cooldowns = jsonObject(struckTarget.cooldowns); cooldowns[huntOrderKey] = 0; delete cooldowns[huntOrderExpiresKey]; struckTarget.cooldowns = cooldowns;
          if (!struckTarget.is_defeated) { const pursuit = Math.max(1, Math.floor(damage * .35)); const oldHp = Number(struckTarget.current_hp); const shield = await absorbRuleShield(connection, session.combat_id, 'target', Number(struckTarget.id), Number(struckTarget.hp_max), pursuit); const hpDamage = pursuit - shield.absorbed; struckTarget.current_hp = Math.max(0, oldHp - hpDamage); if (!struckTarget.current_hp) struckTarget.is_defeated = 1; log.push(`&王庭追猎&追加${pursuit}点不可暴击的物理追击${lifeShieldAbsorptionText(shield)}(${oldHp}→${struckTarget.current_hp})。`); }
        }
        if (hunterFangReady) { const cooldowns = jsonObject(struckTarget.cooldowns); delete cooldowns.epic_hunter_fang_source; delete cooldowns.epic_hunter_fang_turn; struckTarget.cooldowns = cooldowns; log.push('&王庭猎牙&消耗猎牙，本次技能直击+10%。'); }
        if (moltenRivetReady) { const cooldowns = jsonObject(struckTarget.cooldowns); delete cooldowns.epic_molten_rivet_source; delete cooldowns.epic_molten_rivet_turn; struckTarget.cooldowns = cooldowns; log.push('&熔铆拳刃&命中同一目标的连段，本次技能直击+8%。'); }
        if (isSkillDirect && skillCategory === 'physical' && hasEpicWeaponEffect(epicLoadout, 'epic_moltenrivet_fistblade')) {
          const cooldowns = jsonObject(struckTarget.cooldowns); cooldowns.epic_molten_rivet_source = Number(member.id); cooldowns.epic_molten_rivet_turn = Number(session.turn_no); struckTarget.cooldowns = cooldowns;
        }
        if (isSkillDirect && hasEpicWeaponEffect(epicLoadout, 'epic_court_hunter_dagger')) {
          const cooldowns = jsonObject(member.cooldowns);
          if (Number(cooldowns.epic_hunter_fang_round ?? 0) !== Number(session.turn_no)) {
            cooldowns.epic_hunter_fang_round = Number(session.turn_no); member.cooldowns = cooldowns;
            const targetCooldowns = jsonObject(struckTarget.cooldowns); targetCooldowns.epic_hunter_fang_source = Number(member.id); targetCooldowns.epic_hunter_fang_turn = Number(session.turn_no); struckTarget.cooldowns = targetCooldowns;
            log.push(`&王庭猎牙&【${targetName(struckTarget)}】被猎牙标定，下一回合你的技能直击+10%。`);
          }
        }
        if (isSkillDirect && damageType === '打击' && hasEpicWeaponEffect(epicLoadout, 'epic_faultline_fistblade') && Number(jsonObject(struckTarget.cooldowns)[`epic_faultline_round_${member.id}`] ?? 0) !== Number(session.turn_no)) {
          const cooldowns = jsonObject(struckTarget.cooldowns); cooldowns[`epic_faultline_round_${member.id}`] = Number(session.turn_no); struckTarget.cooldowns = cooldowns;
          await applyAdvancedStatus('target', Number(struckTarget.id), 'armor_shatter', 8, 1); log.push('&断层拳刃&打击震裂护甲：物防-8%(1)。');
        }
        if (isSkillDirect && hasEpicWeaponEffect(epicLoadout, 'epic_vanguard_fistblade') && targetHasNonDotDebuff) {
          const cooldowns = jsonObject(struckTarget.cooldowns); cooldowns[`epic_vanguard_round_${member.id}`] = Number(session.turn_no); struckTarget.cooldowns = cooldowns;
        }
        if (mistTideReady) {
          const cooldowns = jsonObject(member.cooldowns); cooldowns.epic_mist_tide_stacks = 0; member.cooldowns = cooldowns;
          if (!struckTarget.is_defeated) { const echo = Math.max(1, Math.floor(damage * .35)); const oldHp = Number(struckTarget.current_hp); const shield = await absorbRuleShield(connection, session.combat_id, 'target', Number(struckTarget.id), Number(struckTarget.hp_max), echo); const hpDamage = echo - shield.absorbed; struckTarget.current_hp = Math.max(0, oldHp - hpDamage); if (!struckTarget.current_hp) struckTarget.is_defeated = 1; log.push(`&三首潮汐&魔法潮汐回响造成${echo}点伤害${lifeShieldAbsorptionText(shield)}(${oldHp}→${struckTarget.current_hp})。`); }
        } else if (isSkillDirect && skillCategory === 'magic' && epicSetActive(member, 'mistmother_cocoon', 5)) {
          const cooldowns = jsonObject(member.cooldowns); const stacks = Math.min(3, Number(cooldowns.epic_mist_tide_stacks ?? 0) + 1); cooldowns.epic_mist_tide_stacks = stacks; member.cooldowns = cooldowns; log.push(`&三首潮汐&${combatUnitLabel(member)}获得潮汐${stacks}/3。`);
        }
        if (skillCode === 'venomancer_corrosion_mist' && effectValue('target', Number(struckTarget.id), 'poison') > 0) {
          await addCorrosionPoisonStack(effectCaster, struckTarget);
        }
        if (consumeMarks.length) { await removeAdvancedStatus('target', Number(struckTarget.id), consumeMarks); log.push(`　&元素反应&消耗 ${consumeMarks.length} 枚元素印记，伤害获得强化。`); }
        if (huntBonus > 0 && hunterOwnsMark && skillCode !== 'nightblade_shadow_mark') { await removeAdvancedStatus('target', Number(struckTarget.id), ['advanced_hunt']); const cooldowns = jsonObject(struckTarget.cooldowns); delete cooldowns.advanced_hunt_source; struckTarget.cooldowns = cooldowns; log.push(`　&追猎&消耗追猎标定，追加 ${huntBonus}%伤害。`); }
        if (formationBonus > 0 && skillId) { await removeAdvancedStatus('target', Number(struckTarget.id), ['advanced_formation']); log.push(`　&破阵窗口&消耗破阵军令，追加 ${formationBonus}%技能伤害。`); }
        if (skillCode?.startsWith('elementalist_') && lightMarkBonus > 0) { await removeAdvancedStatus('target', Number(struckTarget.id), ['advanced_light_mark']); log.push(`　&晨星印记&元素反应伤害提高 ${lightMarkBonus}%。`); }
        if (skillCode === 'elementalist_cinderfrost_cycle') {
          const markCode = element === '冰' ? 'element_mark_ice' : 'element_mark_fire';
          const markName = element === '冰' ? '冰' : '火';
          const hasDistinctMark = marksBeforeHit.some(mark => mark.code !== markCode);
          const markIsNew = !marksBeforeHit.some(mark => mark.code === markCode);
          await applyAdvancedStatus('target', Number(struckTarget.id), markCode, 0, 4, true);
          log.push(`　&元素印记&【${targetName(struckTarget)}】获得${markName}印记(4)。`);
          if (hasDistinctMark && markIsNew && !elementalistMarkResourceGained) { await gainResource(member, 25, '引入异种元素印记'); elementalistMarkResourceGained = true; }
          if (element === '冰' && marksBeforeHit.some(mark => mark.code === 'element_mark_fire')) { await applyAdvancedStatus('target', Number(struckTarget.id), 'slow', 25, 1, true); log.push(`　&炽霜交替&冰霜触发火印记，目标减速25%(1)。`); }
        }
        if (skillCode === 'elementalist_storm_chain') {
          const thunderIsNew = !marksBeforeHit.some(mark => mark.code === 'element_mark_thunder');
          await applyAdvancedStatus('target', Number(struckTarget.id), 'element_mark_thunder', 0, 4, true);
          log.push(`　&元素印记&【${targetName(struckTarget)}】获得雷印记(4)。`);
          if (thunderIsNew && marksBeforeHit.length && !elementalistMarkResourceGained) { await gainResource(member, 25, '引入雷印记扩展元素循环'); elementalistMarkResourceGained = true; }
        }
        if (skillCode === 'elementalist_fourfold_resonance') {
          const windWasPresent = marksBeforeHit.some(mark => mark.code === 'element_mark_wind');
          const completedCycle = !windWasPresent && ['element_mark_fire', 'element_mark_ice', 'element_mark_thunder'].every(code => marksBeforeHit.some(mark => mark.code === code));
          for (const mark of marksBeforeHit) await applyAdvancedStatus('target', Number(struckTarget.id), mark.code, 0, 4, true);
          await applyAdvancedStatus('target', Number(struckTarget.id), 'element_mark_wind', 0, 4, true);
          log.push(`　&四相共鸣&【${targetName(struckTarget)}】的已有印记延长至4回合，并获得风印记(4)。`);
          if (completedCycle) { await gainResource(member, 100, '完成火冰风雷四系循环'); log.push('　&四相成环&奥能充满，天穹序列已就绪。'); }
          else if (!windWasPresent && marksBeforeHit.length && !elementalistMarkResourceGained) { await gainResource(member, 25, '引入风印记稳定元素循环'); elementalistMarkResourceGained = true; }
        }
        if (skillCode === 'elementalist_sky_sequence') {
          const reactions: string[] = [];
          for (const mark of marksBeforeHit) {
            if (mark.code === 'element_mark_fire') { await applyAdvancedStatus('target', Number(struckTarget.id), 'burn', 5, 2, true); reactions.push('灼烧5%(2)'); }
            if (mark.code === 'element_mark_ice') { await applyAdvancedStatus('target', Number(struckTarget.id), 'slow', 25, 1, true); reactions.push('减速25%(1)'); }
            if (mark.code === 'element_mark_wind') { await applyAdvancedStatus('target', Number(struckTarget.id), 'imbalance', 15, 1, true); reactions.push('失衡15%(1)'); }
            if (mark.code === 'element_mark_thunder') { await applyAdvancedStatus('target', Number(struckTarget.id), 'magic_shatter', 8, 2, true); reactions.push('破障8%(2)'); }
          }
          if (reactions.length) log.push(`　&天穹序列&引爆${reactions.join('、')}。`);
        }
        if (skillCode === 'ironbreaker_armor_rend' && hadArmorBefore) await applyAdvancedStatus('target', Number(struckTarget.id), 'exposed', 3, 2, true);
        if (skillCode === 'ironbreaker_steel_flash' && exposedStacks) { await removeAdvancedStatus('target', Number(struckTarget.id), ['exposed']); log.push(`　&断钢&清除 ${exposedStacks} 层易伤，转化为额外伤害。`); }
        if (skillCode === 'ironbreaker_gap_execution' && struckTarget.is_defeated) { const cooldowns = jsonObject(member.cooldowns); cooldowns[skillCode] = Math.floor(Number(cooldowns[skillCode] ?? 0) / 2); member.cooldowns = cooldowns; log.push('　&绝隙处决&击杀目标，返还一半冷却。'); }
        if (skillCode === 'ranger_grapple_trap') { await applyAdvancedStatus('target', Number(struckTarget.id), 'advanced_hunt', 15, 2, true); const cooldowns = jsonObject(struckTarget.cooldowns); cooldowns.advanced_ranger_source = Number(member.id); struckTarget.cooldowns = cooldowns; if (struckTarget.monster_class === 'boss') { await removeAdvancedStatus('target', Number(struckTarget.id), ['ice_bind']); await applyAdvancedStatus('target', Number(struckTarget.id), 'slow', 30, 1, true); log.push('　&首领抗性&束缚降级为30%减速。'); } }
        if (skillCode === 'ranger_weakness_survey') { await applyAdvancedStatus('target', Number(struckTarget.id), 'advanced_mapping', 15, 2, true); await gainResource(member, 20, '完成弱点测绘'); }
        if (skillCode === 'warlord_break_formation') { await applyAdvancedStatus('target', Number(struckTarget.id), 'armor_shatter', 8, 2, true); await applyAdvancedStatus('target', Number(struckTarget.id), 'advanced_formation', 12, 2, true); }
        if (skillCode === 'dawn_morning_mark') await applyAdvancedStatus('target', Number(struckTarget.id), 'advanced_light_mark', 20, 2, true);
        if (skillCode === 'dawn_judgment_litany') await applyAdvancedStatus('target', Number(struckTarget.id), 'exposed', 50, 2, true);
        if (skillCode === 'nightblade_shadow_mark') {
          const targetCooldowns = jsonObject(struckTarget.cooldowns); targetCooldowns.advanced_hunt_source = Number(member.id); struckTarget.cooldowns = targetCooldowns;
          await applyAdvancedStatus('target', Number(struckTarget.id), 'advanced_hunt', 20, 3, true);
          await gainResource(member, 20, '完成追猎标定');
          log.push(`　$追猎$【${targetName(struckTarget)}】被标定3回合；下一次来自施法者的攻击伤害+20%。`);
        }
        if (skillCode === 'nightblade_crescent_throat') await applyAdvancedStatus('target', Number(struckTarget.id), 'advanced_healing_cut', 40, 2, true);
        if (skillCode === 'venomancer_thousand_throat') { for (let index = 0; index < 2; index += 1) if (skillId) await applySkillEffects(connection, session.combat_id, skillId, member, 'member', struckTarget, 'target', 'on_hit', [], 0, 1, rules); await applyAdvancedStatus('target', Number(struckTarget.id), 'advanced_healing_cut', struckTarget.monster_class === 'boss' ? 30 : 60, 2, true); }
        if (skillCode === 'venomancer_venom_burst') {
          const [poisons] = await connection.execute<(RowDataPacket & { value: number; remaining_turns: number; stacks: number })[]>(`SELECT ce.value,ce.remaining_turns,ce.stacks FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id WHERE ce.session_id=? AND ce.target_kind='target' AND ce.target_id=? AND e.code='poison' FOR UPDATE`, [session.combat_id, struckTarget.id]);
          const bossTarget = struckTarget.monster_class === 'boss';
          const remainingPercent = poisons.reduce((total, poison) => total + (bossTarget ? Math.min(1.5, Number(poison.value)) : Number(poison.value)) * Number(poison.remaining_turns) * Number(poison.stacks), 0); const coefficient = bossTarget ? .4 : .6; const rawDetonation = Math.floor(Number(struckTarget.hp_max) * remainingPercent * coefficient * (1 + modifiers.venomDamagePct / 100) / 100); const detonationCap = bossTarget ? Math.floor(Number(struckTarget.hp_max) * .06) : Number.POSITIVE_INFINITY; const detonation = Math.min(rawDetonation, detonationCap);
          if (detonation) { const before = Number(struckTarget.current_hp); const shield = await absorbRuleShield(connection, session.combat_id, 'target', Number(struckTarget.id), Number(struckTarget.hp_max), detonation); const hpDamage = detonation - shield.absorbed; struckTarget.current_hp = Math.max(0, before - hpDamage); if (!struckTarget.current_hp) struckTarget.is_defeated = 1; log.push(`　&毒血引爆&结算剩余剧毒，造成 ${detonation} 点暗蚀伤害${lifeShieldAbsorptionText(shield)}${modifiers.venomDamagePct ? `（蚀痕+${modifiers.venomDamagePct}%）` : ''}(${before}→${struckTarget.current_hp})。`); }
          await removeAdvancedStatus('target', Number(struckTarget.id), ['poison']); await applyAdvancedStatus('target', Number(struckTarget.id), 'poison', bossTarget ? 1.5 : 5, 1, true);
        }
        if (skillCode === 'dawn_exorcism_word') {
          dawnDispelled = await dispelOneTargetBuff(struckTarget);
          if (dawnDispelled) { for (const ally of members.filter(item => !item.is_defeated)) { const oldMp = Number(ally.current_mp); ally.current_mp = Math.min(Number(ally.mp_max), oldMp + Math.max(1, Math.floor(Number(ally.mp_max) * .04))); } await gainResource(member, 25, '驱散敌方增益'); log.push('　&驱邪裁词&全队回复4%最大MP。'); }
        }
        if (skillCode === 'dawn_daybreak_decree') { dawnDispelled = await dispelOneTargetBuff(struckTarget); if (dawnDispelled) { for (const ally of members.filter(item => !item.is_defeated)) await applyAdvancedStatus('member', Number(ally.id), 'barrier', 8, 1, true); log.push('　&破晓宣告&驱散成功，全队获得8%减伤壁垒(1)。'); } }
        const ownProfession = resourceFor(Number(member.id))?.profession_code;
        if (ownProfession === 'war_lord' && skillId) await gainResource(member, 15, '命中敌人');
        if (ownProfession === 'ironbreaker' && skillId) { if (strike.crit) await gainResource(member, 20, '打出暴击'); if (targetWeakened) await gainResource(member, 20, '命中破甲或易伤目标'); }
        if (ownProfession === 'nightblade' && skillId) { if (strike.crit) await gainResource(member, 20, '打出暴击'); if (targetWeakened) await gainResource(member, 20, '命中受控或削弱目标'); }
        if (ownProfession === 'elementalist' && elementalMultiplierValue > 1) await gainResource(member, 15, '命中元素弱点');
        if (ownProfession === 'trickster_ranger' && huntBonus > 0) await gainResource(member, 15, '命中追猎目标');
        if (ownProfession === 'venomancer' && skillId && (effectValue('target', Number(struckTarget.id), 'poison') > 0 || targetWeakened) && freshDebuffCodes.length) await gainResource(member, 20, '向中毒目标施加新状态');
        if (ownProfession === 'venomancer' && skillId) { const cooldowns = jsonObject(struckTarget.cooldowns); cooldowns.advanced_venom_source = Number(member.id); struckTarget.cooldowns = cooldowns; }
        if (skillCode === 'ironbreaker_breaking_pursuit' && (effectValue('target', Number(struckTarget.id), 'exposed') > 0 || huntBonus > 0)) await gainResource(member, 20, '抓住破绽追斩');
        if (skillCode === 'nightblade_gap_stab' && huntBonus > 0 && targetWeakened) await gainResource(member, 20, '完成背隙连刺');
        const rangerSourceId = Number(jsonObject(struckTarget.cooldowns).advanced_ranger_source ?? 0); const rangerOwner = huntBonus > 0 ? members.find(item => Number(item.id) === rangerSourceId && !item.is_defeated) : undefined;
        if (rangerOwner) await gainResource(rangerOwner, 15, '队友命中追猎目标');
        if (ironCrit) ironbreakerTriggered = true;
        if (venomCrit) venomancerTriggered = true;
        if (resonanceDamage) for (const ownerId of markedWarlords) consumeTargetMark(struckTarget, `heritage_round_warlord_${ownerId}`);
        if (dawnDamage) consumeTargetMark(struckTarget, dawnKey);
        if (spellbladeDamage) { const cooldowns = jsonObject(member.cooldowns); delete cooldowns.heritage_spellblade_damage; member.cooldowns = cooldowns; spellbladeDamageSpent = true; log.push(`&攻势换挡&下一次伤害技能强化 ${spellbladeDamage}%。`); }
        markTarget(struckTarget, `heritage_round_hit_${member.id}`);
        const harmfulSkill = await inheritanceHarmfulSkill(skillId);
        if (harmfulSkill && !warlordMarked && hasInheritance(Number(member.id), 'war_lord')) { markTarget(struckTarget, `heritage_round_warlord_${member.id}`); warlordMarked = true; log.push(`&共鸣号令&【${targetName(struckTarget)}】被标记，等待队友下一次技能集火。`); }
        if (freshDebuffCodes.length) {
          const [appliedDebuffs] = await connection.execute<(RowDataPacket & { code: string })[]>(`SELECT e.code FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id
            WHERE ce.session_id=? AND ce.target_kind='target' AND ce.target_id=? AND e.code IN (${freshDebuffCodes.map(() => '?').join(',')})`, [session.combat_id, struckTarget.id, ...freshDebuffCodes]);
          appliedDebuffCodes = appliedDebuffs.map(row => row.code);
          const appliedNonDotDebuff = appliedDebuffCodes.some(code => !['poison', 'burn', 'bleeding', 'rending'].includes(code));
          if (appliedNonDotDebuff && hasEpicWeaponEffect(epicLoadout, 'epic_mistcrown_staff')) {
            const cooldowns = jsonObject(member.cooldowns);
            if (Number(cooldowns.epic_mistcrown_restore_turn ?? 0) !== Number(session.turn_no)) {
              cooldowns.epic_mistcrown_restore_turn = Number(session.turn_no); member.cooldowns = cooldowns;
              const before = Number(member.current_mp); member.current_mp = Math.min(Number(member.mp_max), before + Math.max(1, Math.floor(Number(member.mp_max) * .05)));
              log.push(`&雾冠法杖&成功施加减益，恢复${member.current_mp - before} MP。`);
            }
          }
          if (appliedNonDotDebuff && epicSetActive(member, 'mistmother_cocoon', 5)) {
            const cooldowns = jsonObject(member.cooldowns); const stacks = Math.min(3, Number(cooldowns.epic_mist_tide_stacks ?? 0) + 1); cooldowns.epic_mist_tide_stacks = stacks; member.cooldowns = cooldowns;
            log.push(`&三首潮汐&成功施加减益，获得潮汐${stacks}/3。`);
          }
          if (appliedDebuffCodes.length && epicSetActive(member, 'goblin_court_hunt', 5)) {
            const cooldowns = jsonObject(struckTarget.cooldowns); const current = Number(cooldowns[huntOrderExpiresKey] ?? 0) >= Number(session.turn_no) ? Number(cooldowns[huntOrderKey] ?? 0) : 0; const stacks = Math.min(2, current + 1);
            cooldowns[huntOrderKey] = stacks; cooldowns[huntOrderExpiresKey] = Number(session.turn_no) + 2; struckTarget.cooldowns = cooldowns;
            log.push(`&王旗围猎&【${targetName(struckTarget)}】获得猎令${stacks}/2(3)。`);
          }
          if (appliedDebuffs.length && !elementalistRestored) { const restoredPct = inheritanceValue(Number(member.id), 'elementalist'); if (restoredPct) { const oldMp = Number(member.current_mp); const restored = Math.max(1, Math.floor(Number(member.mp_max) * restoredPct / 100)); member.current_mp = Math.min(Number(member.mp_max), oldMp + restored); elementalistRestored = true; log.push(`&异相共鸣&为新施加的减益恢复 ${member.current_mp - oldMp} MP。`); } }
        }
        const dawnTrigger = appliedDebuffCodes.includes('exposed') ? '成功施加易伤' : dawnDispelled ? '成功驱散增益' : null;
        if (dawnTrigger) { const dawnValue = inheritanceValue(Number(member.id), 'dawn_inquisitor'); if (dawnValue) { const cooldowns = jsonObject(struckTarget.cooldowns); cooldowns[dawnKey] = 2; struckTarget.cooldowns = cooldowns; log.push(`&晨钟裁意&${dawnTrigger}，下一次对该目标的技能直击伤害 +${dawnValue}%（至下回合结束）。`); } }
        const rangerValue = inheritanceValue(Number(member.id), 'trickster_ranger'); const joinedHit = Object.keys(jsonObject(struckTarget.cooldowns)).some(key => key.startsWith('heritage_round_hit_') && key !== `heritage_round_hit_${member.id}`);
        if (!rangerTriggered && rangerValue && joinedHit) { await refreshCombatSpiritEffect(connection, session.combat_id, 'target', Number(struckTarget.id), 'slow', rangerValue, 1); rangerTriggered = true; log.push(`&猎线回响&【${targetName(struckTarget)}】减速 ${rangerValue}%(1)。`); }
      });
      if (skillId && hasInheritance(Number(member.id), 'spellblade')) { const cooldowns = jsonObject(member.cooldowns); cooldowns.heritage_spellblade_support = 1; member.cooldowns = cooldowns; }
      await triggerBulwarkFormation(member);
    } else {
      const monsterTarget = targets.find(item => Number(item.id) === turn.id)!; if (monsterTarget.is_defeated) continue;
      const sparProfile = jsonObject(jsonObject(traitList(monsterTarget.traits_json).find(trait => trait.code === 'npc_sparring')).profile);
      if (sparProfile.code) {
        if (controlled || monsterTarget.is_defeated) continue;
        if (controlled) continue;
        const unit = ruleUnit('target', Number(monsterTarget.id)); const enemies = rules.enemies(unit); const victim = enemies[0]; if (!victim) continue;
        if (!extraTurn && Number(unit.modifiers?.mpRegenPct ?? 0) > 0) await rules.restore(unit, unit, 0, unit.mpMax * Number(unit.modifiers?.mpRegenPct) / 100);
        const casting = unit.state.cast;
        const rotation = stringList(sparProfile.rotation).map(residentSkillByCode).filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));
        const planned = casting ? residentSkillByCode(casting.code) : rotation.find((_, index) => index === (Number(session.turn_no) - 1) % Math.max(1, rotation.length));
        const selected = planned && !casting && (visibleResidentBuff(unit.state, planned.code, Number(session.turn_no)) || ['D01', 'C06', 'F04', 'I04'].includes(planned.id) && rules.allies(unit).length < 2) ? undefined : planned;
        if (!selected || (!casting && (rules.status(unit, 'silence') || Number(unit.cooldowns[selected.code] ?? 0) > 0 || unit.mp < rules.manaCost(unit, selected.mana)))) {
          log.push('➤【' + unit.name + '】普通攻击'); await rules.strike(unit, victim, 100, '无', false, extraTurn, false, 1, { skill: false }); continue;
        }
        const paid = casting?.paid ?? rules.manaCost(unit, selected.mana);
        if (!casting) { unit.mp -= paid; await rules.paid(unit, paid, selected); }
        if (!casting && selected.chant) { unit.state.cast = { code: selected.code, skillId: 0, target: victim.key, paid, releaseTurn: Number(session.turn_no) + selected.chant, cooldown: selected.cooldown }; log.push('【' + unit.name + '】开始了' + selected.name + '技能吟唱。。。'); continue; }
        if (casting && casting.releaseTurn > Number(session.turn_no)) { log.push('【' + unit.name + '】继续吟唱。。。'); continue; }
        delete unit.state.cast; unit.cooldowns[selected.code] = selected.cooldown + 1;
        await rules.cast(unit, selected.scope === 'self' || selected.scope === 'ally' ? unit : victim, selected, paid, '风', extraTurn); continue;
      }
      if (resolvedActions > 0) log.splice(logStart, 0, '————');
      resolvedActions += 1;
      if (controlled || monsterTarget.is_defeated) continue;
      const mentorBuildAtTurnStart = advancedMentorBuildFor(monsterTarget);
      const mentorPassiveAtTurnStart = jsonObject(jsonObject(mentorBuildAtTurnStart?.passive).effect);
      if (Number(mentorPassiveAtTurnStart.mpRegenPct ?? 0) > 0) {
        const stats = monsterCombatStats(monsterTarget); const before = Number(monsterTarget.current_mp); const restored = Math.max(1, Math.floor(stats.mpMax * Number(mentorPassiveAtTurnStart.mpRegenPct) / 100));
        monsterTarget.current_mp = Math.min(stats.mpMax, before + restored);
        if (monsterTarget.current_mp > before) log.push(`&${String(jsonObject(mentorBuildAtTurnStart?.passive).name ?? '导师被动')}&【${targetName(monsterTarget)}】恢复 ${monsterTarget.current_mp - before} MP。`);
      }
      const [threatRows] = await connection.execute<(RowDataPacket & { character_id: number; threat: number })[]>('SELECT character_id,threat FROM combat_threat WHERE session_id=? AND spawn_id=? FOR UPDATE', [session.combat_id, monsterTarget.id]); let victim = threatTarget(members, new Map(threatRows.map(row => [Number(row.character_id), Number(row.threat)]))); if (!victim) continue;
      if (effectValue('target', Number(monsterTarget.id), 'alchemy_confusion') > 0) { const candidates = members.filter(item => !item.is_defeated); victim = candidates[random(0, candidates.length - 1)] ?? victim; log.push(`$混乱$【${targetName(monsterTarget)}】的攻击目标变得随机。`); }
      if (effectValue('target', Number(monsterTarget.id), 'advanced_taunt') > 0) {
        const tauntSourceId = Number(jsonObject(monsterTarget.cooldowns).advanced_taunt_source ?? 0);
        const tauntSource = members.find(member => !member.is_defeated && Number(member.id) === tauntSourceId);
        if (tauntSource) { victim = tauntSource; log.push(`$盾墙嘲讽$【${targetName(monsterTarget)}】被迫锁定${combatUnitLabel(victim)}。`); }
      }
      const [templateRows] = await connection.execute<(RowDataPacket & { code: string })[]>('SELECT code FROM monster_templates WHERE id=?', [Number(monsterTarget.template_id)]); const templateCode = templateRows[0]?.code ?? ''; const isWolfKing = templateCode === 'shadow_wolf_king'; const isScholarGa = templateCode === 'scholar_ga'; const isDungeonBoss = ['black_slime', 'skeleton_general', 'death_knight', 'necromancer_uz'].includes(templateCode); const isGoblinColonel = templateCode === 'goblin_colonel'; const isBoss = monsterTarget.monster_class === 'boss'; const isKingbeast = isKingbeastCore(monsterTarget); const fusedKingbeast = isKingbeast && kingbeastFused();
      if (isBossComponent(monsterTarget)) {
        const definition = bossComponentDefinition(monsterTarget); const body = targets.find(target => Number(target.id) === componentBodyId(monsterTarget));
        if (!definition || !body || body.is_defeated) continue;
        const [bodyThreatRows] = await connection.execute<(RowDataPacket & { character_id: number; threat: number })[]>('SELECT character_id,threat FROM combat_threat WHERE session_id=? AND spawn_id=? FOR UPDATE', [session.combat_id, body.id]);
        victim = threatTarget(members, new Map(bodyThreatRows.map(row => [Number(row.character_id), Number(row.threat)]))) ?? victim;
        const componentCooldowns = jsonObject(monsterTarget.cooldowns); const bodyCooldowns = jsonObject(body.cooldowns); const turnNo = Number(session.turn_no);
        const componentHit = async (target: CombatMemberRow, scale: number, label: string) => {
          const stats = monsterCombatStatsForPlayer(monsterTarget, Number(target.level)); const strike = resolveStrike(Math.max(1, stats.physicalAttack * scale), Number(target.physical_defense), stats.accuracy, Number(target.evasion), 0, Number(target.crit_resist_bp), stats.critDamage, Number(target.crit_damage_reduction_bp), false, false, 0, 0, 1, strikeCorrections(undefined,ruleUnit('member', Number(target.id))));
          if (!strike.hit) { log.push(`　➥${combatUnitLabel(target)}闪避了${label}`); return false; }
          const barrier = effectValue('member', Number(target.id), 'barrier'); const dealt = directDamageVariance(Math.max(1, Math.floor(strike.damage * (1 - Math.min(80, barrier) / 100)))); const oldHp = Number(target.current_hp); const shield = await absorbRuleShield(connection, session.combat_id, 'member', Number(target.id), Number(target.hp_max), dealt); const hpDamage = dealt - shield.absorbed;
          target.current_hp = Math.max(0, oldHp - hpDamage); if (!target.current_hp) target.is_defeated = 1;
          log.push(`　➥${label}对${combatUnitLabel(target)}造成 ${dealt} 点物理伤害${lifeShieldAbsorptionText(shield)}(${oldHp}→${target.current_hp})`); return true;
        };
        if (definition.key === 'gruen_armor' && turnNo - Number(componentCooldowns.boss_component_last_active_turn ?? 0) >= 3 && !Number(bodyCooldowns.boss_component_gruen_armor_guard ?? 0)) {
          componentCooldowns.boss_component_last_active_turn = turnNo; bodyCooldowns.boss_component_gruen_armor_guard = 2;
          log.push('➤【格鲁恩·永固之铠】发动「永固覆层」：格鲁恩双防提高 25%，持续至下一轮玩家行动后。');
        } else if (definition.key === 'gruen_arm' && turnNo - Number(componentCooldowns.boss_component_last_active_turn ?? 0) >= 3) {
          const pressed = members.find(member => !member.is_defeated && Number(jsonObject(member.cooldowns).regional_gruen_fault_until ?? 0) >= turnNo) ?? victim;
          componentCooldowns.boss_component_last_active_turn = turnNo;
          if (await componentHit(pressed, .45, '裂谷擒压')) { const victimCooldowns = jsonObject(pressed.cooldowns); victimCooldowns.boss_component_gruen_arm_press_until = turnNo + 2; pressed.cooldowns = victimCooldowns; log.push(`　$裂谷擒压$【${pressed.name}】下一次裂谷坠压额外承受 15% 最终伤害。`); }
        } else if (definition.key === 'valk_armor' && turnNo - Number(componentCooldowns.boss_component_last_active_turn ?? 0) >= 3 && Math.max(0, Number(bodyCooldowns.regional_valk_heat ?? 0)) <= 1 && !Number(bodyCooldowns.boss_component_valk_armor_guard ?? 0)) {
          componentCooldowns.boss_component_last_active_turn = turnNo; bodyCooldowns.boss_component_valk_armor_guard = 2;
          log.push('➤【瓦尔克·黑铁炉甲】发动「砧火覆甲」：瓦尔克双防提高 20%，持续至下一轮玩家行动后。');
        } else if (definition.key === 'valk_chain') {
          const due = members.find(member => !member.is_defeated && Number(jsonObject(member.cooldowns).boss_component_valk_chain_execute_at ?? 0) <= turnNo && Number(jsonObject(member.cooldowns).boss_component_valk_chain_execute_at ?? 0) > 0);
          if (due) {
            const victimCooldowns = jsonObject(due.cooldowns); delete victimCooldowns.boss_component_valk_chain_execute_at; due.cooldowns = victimCooldowns;
            delete bodyCooldowns.boss_component_valk_chain_execute_at;
            if (await componentHit(due, .45, '熔链处刑')) { bodyCooldowns.boss_component_valk_chain_execute_target = Number(due.id); log.push(`　$熔链处刑$瓦尔克将立刻优先对【${due.name}】施放铁砧裁决。`); }
          } else if (turnNo - Number(componentCooldowns.boss_component_last_active_turn ?? 0) >= 3) {
            const slagged = members.find(member => !member.is_defeated && Number(jsonObject(member.cooldowns).regional_valk_slag_until ?? 0) >= turnNo);
            if (slagged) {
              componentCooldowns.boss_component_last_active_turn = turnNo; const victimCooldowns = jsonObject(slagged.cooldowns); victimCooldowns.boss_component_valk_chain_execute_at = turnNo + 2; slagged.cooldowns = victimCooldowns; bodyCooldowns.boss_component_valk_chain_execute_at = turnNo + 2;
              await applyAdvancedStatus('member', Number(slagged.id), 'bind', 10, 1); await applyAdvancedStatus('member', Number(slagged.id), 'exposed', 8, 1);
              log.push(`➤【瓦尔克·拘魂锁链】发动「熔链锁定」：已锁住【${slagged.name}】，2 回合后将发动熔链处刑并引导铁砧裁决。`);
            }
          }
        }
        monsterTarget.cooldowns = componentCooldowns; body.cooldowns = bodyCooldowns;
        // 部位没有普通攻击；未满足条件时只维持自身被动。
        continue;
      }
      if (fusedKingbeast && kingbeastRole(monsterTarget) === 'king') continue;
      const sequence = isWolfKing ? ['wolfking_summon_shadow_wolf', 'wolfking_trample', 'wolfking_rending_pounce', 'wolfking_bite', 'wolfking_shadow_curse', 'wolfking_fang_devour', 'boss_mana_charge'] : stringList(monsterTarget.skill_sequence); const cooldowns = jsonObject(monsterTarget.cooldowns);
      let skill: (RowDataPacket & { id: number; code: string; name: string; category: string; element: string; range_type: string; target_scope: string; power: number; mana_cost: number; cooldown_turns: number }) | undefined; let kingbeastChargeAction = false;
      if (sequence.length) {
        const placeholders = sequence.map(() => '?').join(',');
        const [skillRows] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; category: string; element: string; range_type: string; target_scope: string; power: number; mana_cost: number; cooldown_turns: number })[]>(`SELECT id,code,name,category,element,range_type,target_scope,power,mana_cost,cooldown_turns FROM skill_definitions WHERE code IN (${placeholders})`, sequence);
        const manaCharge = isBoss ? skillRows.find(candidate => candidate.code === 'boss_mana_charge') : undefined;
        const normalSkills = skillRows.filter(candidate => candidate.code !== 'boss_mana_charge');
        const offCooldownSkills = normalSkills.filter(candidate => Number(cooldowns[candidate.code] ?? 0) <= 0);
        const readySkills = offCooldownSkills.filter(candidate => Number(monsterTarget.current_mp) >= Number(candidate.mana_cost));
        const needsManaCharge = Boolean(manaCharge && offCooldownSkills.length && !readySkills.length);
        skill = needsManaCharge ? manaCharge : (readySkills.length ? readySkills[random(0, readySkills.length - 1)] : undefined);
        const mentorBuild = advancedMentorBuildFor(monsterTarget);
        if (!needsManaCharge && mentorBuild) {
          const rotation = jsonArray(mentorBuild.rotation).map(String);
          const professionCode = String(mentorBuild.professionCode ?? '');
          const resource = jsonObject(monsterTarget.cooldowns);
          const currentResource = Math.max(0, Math.min(100, Number(resource.advanced_mentor_resource ?? 20)));
          const choose = (code: string) => readySkills.find(candidate => candidate.code === code && (() => {
            const required = advancedResourceRequirementForSkill(candidate.code);
            return !required || currentResource >= required.amount;
          })());
          const hpRatio = Number(monsterTarget.current_hp) / Math.max(1, Number(monsterTarget.hp_max));
          const lowHealthSkill = String(mentorBuild.lowHealthSkill ?? '');
          const rotationIndex = Math.max(0, Number(resource.advanced_mentor_rotation ?? 0));
          const resourceFinisher = rotation.map(choose).find(candidate => Boolean(candidate && advancedResourceRequirementForSkill(candidate.code)?.amount === 100));
          const lowHealth = hpRatio <= .42 && lowHealthSkill ? choose(lowHealthSkill) : undefined;
          const planned = rotation.length ? [...rotation.slice(rotationIndex % rotation.length), ...rotation.slice(0, rotationIndex % rotation.length)].map(choose).find(Boolean) : undefined;
          skill = (currentResource >= 100 ? resourceFinisher : undefined) ?? lowHealth ?? planned ?? skill;
          resource.advanced_mentor_rotation = rotationIndex + 1;
          const required = skill ? advancedResourceRequirementForSkill(skill.code) : undefined;
          resource.advanced_mentor_resource = Math.min(100, Math.max(0, currentResource - Number(required?.amount ?? 0)) + (skill ? 20 : 10));
          monsterTarget.cooldowns = resource;
          if (skill && required) log.push(`&导师${String(jsonObject(mentorBuild.resource).name ?? '专属资源')}&【${targetName(monsterTarget)}】为「${skill.name}」消耗 ${required.amount}，剩余 ${resource.advanced_mentor_resource}/100。`);
          else if (skill) log.push(`&导师${String(jsonObject(mentorBuild.resource).name ?? '专属资源')}&【${targetName(monsterTarget)}】研习连段 +${skill ? 20 : 10}（${resource.advanced_mentor_resource}/100）。`);
          // 传承不是只挂在鉴识面板：导师会优先把破甲、追猎、元素印记等前置技接入自己的技能轮转。
          if (professionCode === 'nightblade' && effectValue('member', Number(victim.id), 'advanced_hunt') <= 0) skill = choose('nightblade_shadow_mark') ?? skill;
          if (professionCode === 'ironbreaker' && effectValue('member', Number(victim.id), 'armor_shatter') <= 0) skill = choose('ironbreaker_armor_rend') ?? skill;
          if (professionCode === 'venomancer' && effectValue('member', Number(victim.id), 'poison') <= 0) skill = choose('venomancer_serpent_kiss') ?? skill;
          if (professionCode === 'trickster_ranger' && effectValue('member', Number(victim.id), 'advanced_hunt') <= 0) skill = choose('ranger_grapple_trap') ?? skill;
        }
        if (!needsManaCharge && isScholarGa) {
          const choose = (code: string) => readySkills.find(candidate => candidate.code === code);
          const lowest = [...members].filter(member => !member.is_defeated).sort((left, right) => Number(left.current_hp) / Math.max(1, Number(left.hp_max)) - Number(right.current_hp) / Math.max(1, Number(right.hp_max)))[0];
          const hpRatio = Number(monsterTarget.current_hp) / Math.max(1, Number(monsterTarget.hp_max));
          const rotation = ['ga_azure_ray', 'ga_specimen_mark', 'ga_ether_tether', 'ga_memory_sunder', 'ga_archive_storm', 'ga_life_equation'];
          if (hpRatio <= .30 && !cooldowns.ga_phase_30) { skill = choose('ga_evolution_proof') ?? skill; cooldowns.ga_phase_30 = 1; }
          else if (hpRatio <= .60 && !cooldowns.ga_phase_60) { skill = choose('ga_threshold_reversal') ?? skill; cooldowns.ga_phase_60 = 1; }
          else if (lowest && Number(lowest.current_hp) / Math.max(1, Number(lowest.hp_max)) < .42) { skill = choose('ga_memory_sunder') ?? skill; victim = lowest; }
          else {
            const index = Math.max(0, Number(cooldowns.ga_rotation ?? 0)) % rotation.length;
            skill = choose(rotation[index]) ?? skill;
            cooldowns.ga_rotation = index + 1;
          }
        } else if (!needsManaCharge && isWolfKing) {
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
        } else if (!needsManaCharge && isGoblinColonel) {
          const choose = (code: string) => readySkills.find(candidate => candidate.code === code);
          const aliveMembers = members.filter(member => !member.is_defeated);
          const hasMemberEffect = (codes: string[]) => effects.some(effect => effect.target_kind === 'member' && !members.find(member => Number(member.id) === Number(effect.target_id))?.is_defeated && codes.includes(effect.code));
          const lowest = [...aliveMembers].sort((left, right) => Number(left.current_hp) / Math.max(1, Number(left.hp_max)) - Number(right.current_hp) / Math.max(1, Number(right.hp_max)))[0];
          const crushing = choose('goblin_colonel_crushing_wave');
          const barrage = choose('goblin_colonel_toxic_barrage');
          const hpRatio = Number(monsterTarget.current_hp) / Math.max(1, Number(monsterTarget.hp_max));
          const combo = String(cooldowns.goblin_colonel_combo ?? 'open');
          const rotation = ['goblin_colonel_crushing_wave', 'goblin_colonel_toxic_barrage'];
          const rotationIndex = Math.max(0, Number(cooldowns.goblin_colonel_rotation ?? 0)) % rotation.length;
          // 上校的基本连招是“裂阵镇压→毒焰齐射”：先压低命中与物防，再用暗属性范围攻击扩大压制。
          if (hpRatio <= .6 && !cooldowns.goblin_colonel_phase_60) {
            skill = barrage ?? crushing ?? skill;
            cooldowns.goblin_colonel_phase_60 = 1;
          } else if (combo === 'crushing' && barrage) {
            skill = barrage;
          } else if (combo === 'barrage' && crushing) {
            skill = crushing;
          } else if (!hasMemberEffect(['armor_shatter', 'imbalance']) && crushing) {
            skill = crushing;
          } else {
            skill = choose(rotation[rotationIndex]) ?? barrage ?? crushing ?? skill;
            cooldowns.goblin_colonel_rotation = rotationIndex + 1;
          }
          if (skill?.code === 'goblin_colonel_toxic_barrage' && lowest && Number(lowest.current_hp) / Math.max(1, Number(lowest.hp_max)) < .45) victim = lowest;
          if (skill?.code === 'goblin_colonel_crushing_wave' || skill?.code === 'goblin_colonel_toxic_barrage') cooldowns.goblin_colonel_combo = skill.code.endsWith('crushing_wave') ? 'crushing' : 'barrage';
        }
        // 三位 Lv.32 地表首领采用下方独立状态机，不再先经过旧的通用区域首领轮转。
        const surfaceRule = level32BossCodes.has(templateCode) ? undefined : surfaceBossMechanics[templateCode];
        if (!needsManaCharge && surfaceRule) {
          const choose = (code: string) => readySkills.find(candidate => candidate.code === code);
          const lowest = [...members].filter(member => !member.is_defeated).sort((left, right) => Number(left.current_hp) / Math.max(1, Number(left.hp_max)) - Number(right.current_hp) / Math.max(1, Number(right.hp_max)))[0];
          const hpRatio = Number(monsterTarget.current_hp) / Math.max(1, Number(monsterTarget.hp_max));
          const phaseKey = `surface_boss_phase_${templateCode}`;
          if (hpRatio <= surfaceRule.phaseAt && !cooldowns[phaseKey] && choose(surfaceRule.phaseSkill)) {
            skill = choose(surfaceRule.phaseSkill);
            cooldowns[phaseKey] = 1;
          } else {
            const index = Math.max(0, Number(cooldowns.surface_boss_rotation ?? 0)) % surfaceRule.rotation.length;
            skill = choose(surfaceRule.rotation[index]) ?? skill;
            cooldowns.surface_boss_rotation = index + 1;
          }
          if (lowest && surfaceRule.focusLowest?.includes(skill?.code ?? '')) victim = lowest;
        }
        if (!needsManaCharge && level32BossCodes.has(templateCode)) {
          const choose = (code: string) => readySkills.find(candidate => candidate.code === code);
          const alive = members.filter(member => !member.is_defeated);
          const lowest = [...alive].sort((left, right) => Number(left.current_hp) / Math.max(1, Number(left.hp_max)) - Number(right.current_hp) / Math.max(1, Number(right.hp_max)))[0] ?? victim;
          const hpRatio = Number(monsterTarget.current_hp) / Math.max(1, Number(monsterTarget.hp_max));
          const turnNo = Number(session.turn_no);
          const markedMember = (key: string) => alive.find(member => Number(jsonObject(member.cooldowns)[key] ?? 0) >= turnNo);
          if (templateCode === 'gruen_mountainheart') {
            const armAlive = targets.some(target => !target.is_defeated && bossComponentDefinition(target)?.key === 'gruen_arm' && componentBodyId(target) === Number(monsterTarget.id));
            const faulted = armAlive ? markedMember('regional_gruen_fault_until') : undefined;
            // 首轮留下预震倒计时，之后每次预震完成都会重新开始倒计时；避免开场便连续预震。
            if (!Number(cooldowns.regional_gruen_tremor_ready_at ?? 0)) cooldowns.regional_gruen_tremor_ready_at = turnNo + 5;
            if (Number(cooldowns.boss_component_gruen_forced_basic ?? 0) > 0) {
              skill = undefined; log.push('$断层失衡$格鲁恩失去重臂支撑，本次只能普通攻击。');
            } else if (Number(cooldowns.regional_gruen_corequake_ready ?? 0) >= turnNo) {
              skill = choose('gruen_corequake') ?? skill;
            } else if (hpRatio <= .68 && !cooldowns.regional_gruen_stoneward_used) {
              skill = choose('gruen_stoneward') ?? skill; cooldowns.regional_gruen_stoneward_used = 1;
            } else if (faulted && Number(cooldowns.regional_gruen_tremor_ready_at ?? 0) <= turnNo) {
              skill = choose('gruen_tectonic_call') ?? choose('gruen_riftfall') ?? skill;
            } else if (!faulted && armAlive) {
              skill = choose('gruen_fault_sunder') ?? skill;
            } else {
              skill = choose('gruen_riftfall') ?? skill;
            }
          } else if (templateCode === 'valk_forge_overseer') {
            const slagged = markedMember('regional_valk_slag_until');
            const chainAlive = targets.some(target => !target.is_defeated && bossComponentDefinition(target)?.key === 'valk_chain' && componentBodyId(target) === Number(monsterTarget.id));
            const bellowsAlive = targets.some(target => !target.is_defeated && bossComponentDefinition(target)?.key === 'valk_bellows' && componentBodyId(target) === Number(monsterTarget.id));
            const heat = Math.max(0, Math.min(bellowsAlive ? 3 : 1, Number(cooldowns.regional_valk_heat ?? 0)));
            const chainExecutionTarget = chainAlive ? alive.find(member => Number(member.id) === Number(cooldowns.boss_component_valk_chain_execute_target ?? 0)) : undefined;
            if (Number(cooldowns.regional_valk_overdrive_ready ?? 0) >= turnNo && !Number(cooldowns.boss_component_valk_overdrive_lock ?? 0) && bellowsAlive) {
              skill = choose('valk_furnace_overdrive') ?? skill;
            } else if (bellowsAlive && (Number(cooldowns.boss_component_valk_bellows_charge ?? 0) > 0 || heat >= 2)) {
              skill = choose('valk_furnace_stoke') ?? skill;
            } else if (chainExecutionTarget) {
              skill = choose('valk_anvil_sentence') ?? skill; victim = chainExecutionTarget;
            } else if (slagged) {
              skill = choose('valk_anvil_sentence') ?? skill; victim = slagged;
            } else {
              const rotation = chainAlive ? ['valk_slag_brand', 'valk_chain_draw'] : ['valk_slag_brand']; const index = Math.max(0, Number(cooldowns.regional_valk_rotation ?? 0)) % rotation.length;
              skill = choose(rotation[index]) ?? skill; cooldowns.regional_valk_rotation = index + 1;
            }
          } else if (templateCode === 'threehead_mother') {
            const coiled = markedMember('regional_mother_swallow_until');
            if (hpRatio <= .48 && !cooldowns.regional_mother_regrow_used) {
              skill = choose('threehead_brood_regrow') ?? skill; cooldowns.regional_mother_regrow_used = 1;
            } else if (coiled) {
              skill = choose('threehead_swallow') ?? skill; victim = coiled;
            } else {
              const rotation = ['threehead_venom_fang', 'threehead_mist_lash', 'threehead_rootcoil']; const index = Math.max(0, Number(cooldowns.regional_mother_rotation ?? 0)) % rotation.length;
              skill = choose(rotation[index]) ?? skill; cooldowns.regional_mother_rotation = index + 1;
              if (skill?.code === 'threehead_rootcoil') victim = lowest;
            }
          }
        }
        if (!needsManaCharge && isKingbeast) {
          const choose = (code: string) => readySkills.find(candidate => candidate.code === code);
          const lowest = [...members].filter(member => !member.is_defeated).sort((left, right) => Number(left.current_hp) / Math.max(1, Number(left.hp_max)) - Number(right.current_hp) / Math.max(1, Number(right.hp_max)))[0];
          const role = kingbeastRole(monsterTarget); const hpRatio = Number(monsterTarget.current_hp) / Math.max(1, Number(monsterTarget.hp_max));
          if (fusedKingbeast && role === 'dragon') {
            if (cooldowns.kingbeast_charge) skill = choose('habadragon_royal_cataclysm_trample');
            else {
              const slowed = members.filter(member => !member.is_defeated && (effectValue('member', Number(member.id), 'slow') > 0 || effectValue('member', Number(member.id), 'bind') > 0)).length;
              const lowParty = members.filter(member => !member.is_defeated && Number(member.current_hp) / Math.max(1, Number(member.hp_max)) < .55).length;
              const rotation = Math.max(0, Number(cooldowns.kingbeast_rotation ?? 0));
              if (rotation >= 3 || (lowParty >= 3 && choose('habadragon_royal_cataclysm_trample'))) { skill = choose('habadragon_royal_cataclysm_trample'); kingbeastChargeAction = Boolean(skill); cooldowns.kingbeast_rotation = 0; }
              else if (slowed >= 2) { skill = choose('habadragon_royal_charge') ?? skill; cooldowns.kingbeast_rotation = rotation + 1; }
              else { const loop = ['habadragon_royal_charge', 'habadragon_royal_stomp', 'habadragon_royal_tail_sweep']; skill = choose(loop[rotation % loop.length]) ?? skill; cooldowns.kingbeast_rotation = rotation + 1; }
            }
          } else if (!fusedKingbeast && role === 'king') {
            const eliteAlive = targets.filter(target => !target.is_defeated && ['guard', 'spearman'].includes(kingbeastRole(target))).length;
            if (eliteAlive < 2 && Number(cooldowns.royal_elite_summons ?? 0) < 2) skill = choose('goblin_king_call_elites') ?? skill;
            else if (!cooldowns.kingbeast_regal_used) { skill = choose('goblin_king_regal_conduct') ?? skill; cooldowns.kingbeast_regal_used = 1; }
            else if (members.filter(member => !member.is_defeated && Number(member.current_hp) / Math.max(1, Number(member.hp_max)) < .6).length >= 2) skill = choose('goblin_king_stormchain') ?? skill;
            else { skill = choose('goblin_king_thunder_edict') ?? choose('goblin_king_stormchain') ?? skill; if (lowest) victim = lowest; }
          } else if (!fusedKingbeast && role === 'dragon') {
            if ((hpRatio < .6 || kingbeastCores().some(target => target.is_defeated)) && choose('habadragon_bloodjaw')) skill = choose('habadragon_bloodjaw');
            else if (members.filter(member => !member.is_defeated && effectValue('member', Number(member.id), 'slow') <= 0).length >= 3) skill = choose('habadragon_crushing_stomp') ?? skill;
            else { skill = choose('habadragon_mad_charge') ?? choose('habadragon_iron_tail_prison') ?? skill; }
            if (skill?.code === 'habadragon_iron_tail_prison' && lowest) victim = lowest;
          } else if (role === 'guard') {
            const intercepted = kingbeastCores().some(target => effectValue('target', Number(target.id), 'royal_intercept') > 0);
            skill = (!intercepted ? choose('goblin_royal_intercept') : undefined) ?? choose('goblin_royal_shield_rush') ?? choose('goblin_royal_crowncut') ?? skill; if (skill?.code === 'goblin_royal_crowncut' && lowest) victim = lowest;
          } else if (role === 'spearman') {
            const signaled = targets.some(target => Number(jsonObject(target.cooldowns).royal_signal ?? 0) > 0);
            skill = (!signaled ? choose('goblin_royal_signal_flag') : undefined) ?? choose('goblin_royal_thunder_spear') ?? choose('goblin_royal_static_net') ?? skill;
          }
        }
        if (isDungeonBoss) {
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
            const alive = members.filter(member => !member.is_defeated);
            const markedMember = (key: string) => alive.find(member => Number(jsonObject(member.cooldowns)[key] ?? 0) >= Number(session.turn_no));
            const reapingTarget = markedMember('regional_uzz_reap_until'); const brandedTarget = markedMember('regional_uzz_gravebrand_until');
            const minionsAlive = targets.some(target => !target.is_defeated && isSummonedMonster(target));
            const selfDebuffed = effects.some(effect => effect.target_kind === 'target' && Number(effect.target_id) === Number(monsterTarget.id) && ['vulnerability', 'sword_break', 'armor_shatter', 'magic_shatter', 'slow', 'bind', 'imbalance', 'burn', 'poison', 'bleeding', 'rending', 'stun'].includes(effect.code));
            if ((hpRatio <= .58 || selfDebuffed) && !cooldowns.regional_uzz_phylactery_used) {
              skill = choose('uzz_phylactery_turn') ?? skill; cooldowns.regional_uzz_phylactery_used = 1;
            } else if (!minionsAlive && Number(cooldowns.regional_uzz_revenant_calls ?? 0) < 2) {
              skill = choose('uzz_revenant_call') ?? skill; cooldowns.regional_uzz_revenant_calls = Number(cooldowns.regional_uzz_revenant_calls ?? 0) + 1;
            } else if (reapingTarget) {
              skill = choose('uzz_soul_reaping') ?? skill; victim = reapingTarget;
            } else if (brandedTarget) {
              skill = choose('uzz_choir_of_graves') ?? skill;
            } else {
              const sequence = ['uzz_gravebrand', 'uzz_marrow_lash']; const index = Math.max(0, Number(cooldowns.regional_uzz_rotation ?? 0)) % sequence.length;
              skill = choose(sequence[index]) ?? skill; cooldowns.regional_uzz_rotation = index + 1;
              if (skill?.code === 'uzz_marrow_lash' && lowest) victim = lowest;
            }
          }
        }
      }
      if (kingbeastChargeAction && skill) {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns.kingbeast_charge = 2; cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        log.push('【哥布林国王】高举王旗，哈巴龙的四蹄踏得地层嗡鸣。\n$末日践踏$下一次行动将对全体发动雷震践踏！');
        continue;
      }
      if (skill?.code === 'boss_mana_charge') {
        const oldMp = Number(monsterTarget.current_mp); const maxMp = monsterCombatStats(monsterTarget).mpMax;
        monsterTarget.current_mp = maxMp; cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const identifiedMonster = Boolean(appraisalForTarget(appraisal, Number(monsterTarget.level)));
        log.push(`➤【${targetName(monsterTarget)}】释放技能「${identifiedMonster ? skill.name : '???'}」`);
        log.push(`　$魔力充能$恢复 ${monsterTarget.current_mp - oldMp} MP(${oldMp}→${monsterTarget.current_mp})`);
        continue;
      }
      if (skill?.code === 'wolfking_summon_shadow_wolf') {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const count = await summonShadowWolves(connection, session.combat_id, monsterTarget, members); log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」`); log.push(`　➥影幕翻涌，${count}只影狼加入了战斗。`); continue;
      }
      if (skill?.code === 'necromancer_raise' || skill?.code === 'uzz_revenant_call') {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const count = await summonNecromancerMinions(connection, session.combat_id, monsterTarget, members); log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」`); log.push(`　➥残骸在咒文中起身，${count}名亡灵加入了战斗。`); continue;
      }
      if (skill?.code === 'wolfking_shadow_curse') {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const monster = monsterCombatStats(monsterTarget); const oldHp = Number(monsterTarget.current_hp); const amount = targetHealingAmount(monsterTarget, Math.floor((monster.hpMax - oldHp) * .5)); monsterTarget.current_hp = Math.min(monster.hpMax, oldHp + amount);
        await connection.execute(`INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns) VALUES (?, 'target', ?, (SELECT id FROM effect_definitions WHERE code='shadow_curse'), 1, 100, 3)`, [session.combat_id, monsterTarget.id]);
        log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」`); log.push(`　$影咒$恢复 ${amount} HP(${oldHp}→${monsterTarget.current_hp})`); log.push('　$影咒$命中、闪避+100.0%，双攻双防+25.0%(3)'); continue;
      }
      if (skill?.code === 'necromancer_rebirth') {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const oldHp = Number(monsterTarget.current_hp); const amount = targetHealingAmount(monsterTarget, Math.max(1, Math.floor(Number(monsterTarget.hp_max) * .28))); monsterTarget.current_hp = Math.min(Number(monsterTarget.hp_max), oldHp + amount);
        log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」`); log.push(`&魂匣回响&恢复 ${monsterTarget.current_hp - oldHp} HP(${oldHp}→${monsterTarget.current_hp})`);
        await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', victim, 'member', 'on_cast', log, 0, 1, rules); continue;
      }
      if (skill?.code === 'goblin_sacrificial_return') {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const fallen = targets.filter(target => target.is_defeated && !isSummonedMonster(target)).sort((left, right) => Number(right.level) - Number(left.level))[0];
        log.push('➤【' + targetName(monsterTarget) + '】释放技能「' + skill.name + '」');
        if (fallen) {
          const revived = Math.max(1, Math.floor(Number(fallen.hp_max) * .30)); fallen.current_hp = revived; fallen.is_defeated = 0;
          log.push('　➥血祭黑火拖回【' + targetName(fallen) + '】，恢复 ' + revived + ' HP。');
        } else log.push('　➥祭坛没有回应，血祭只留下刺鼻的烟雾。');
        continue;
      }      // 城镇执法小队的祷告官会真正支援同队执法者，而非把辅助技能误施给通缉目标。
      if (skill && isCityPursuit(monsterTarget) && ['healing_prayer', 'blessing_aegis', 'mana_benediction'].includes(skill.code)) {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const pursuitTargetId = Number(cityPursuitTrait(monsterTarget)?.pursuit_target_id ?? 0);
        const allies = targets.filter(target => !target.is_defeated && isCityPursuit(target) && Number(cityPursuitTrait(target)?.pursuit_target_id ?? 0) === pursuitTargetId);
        log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」`);
        if (skill.code === 'healing_prayer') {
          const ally = [...allies].sort((left, right) => Number(left.current_hp) / Math.max(1, Number(left.hp_max)) - Number(right.current_hp) / Math.max(1, Number(right.hp_max)))[0] ?? monsterTarget;
          const oldHp = Number(ally.current_hp); const amount = targetHealingAmount(ally, Math.max(1, Math.floor(monsterCombatStats(monsterTarget).magicAttack * 1.35))); ally.current_hp = Math.min(Number(ally.hp_max), oldHp + amount);
          log.push(`　➥【${targetName(ally)}】恢复 ${ally.current_hp - oldHp} HP(${oldHp}→${ally.current_hp})`);
          await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', ally, 'target', 'on_cast', [], 0, 1, rules);
        } else {
          for (const ally of allies) await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', ally, 'target', 'on_cast', [], 0, 1, rules);
          log.push(skill.code === 'blessing_aegis' ? '$守护祝福$执法小队获得减伤与再生(3)' : '$灵泉祝祷$执法小队每回合恢复魔力(3)');
        }
        continue;
      }
      if (skill?.code === 'goblin_royal_intercept') {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const core = [...kingbeastCores()].filter(target => !target.is_defeated).sort((left, right) => Number(left.current_hp) / Math.max(1, Number(left.hp_max)) - Number(right.current_hp) / Math.max(1, Number(right.hp_max)))[0];
        if (core) await connection.execute(`INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns) VALUES (?, 'target', ?, (SELECT id FROM effect_definitions WHERE code='royal_intercept'), 1, 25, 9)
          ON DUPLICATE KEY UPDATE value=VALUES(value),remaining_turns=VALUES(remaining_turns)`, [session.combat_id, core.id]);
        await connection.execute(`INSERT INTO combat_status_effects (session_id,target_kind,target_id,effect_id,effect_level,value,remaining_turns) VALUES (?, 'target', ?, (SELECT id FROM effect_definitions WHERE code='barrier'), 1, 25, 2)
          ON DUPLICATE KEY UPDATE value=VALUES(value),remaining_turns=VALUES(remaining_turns)`, [session.combat_id, monsterTarget.id]);
        log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」\n　$王庭拦截$下一次针对【${core ? targetName(core) : '王座'}】的单体伤害降低25%。`); continue;
      }
      if (skill?.code === 'goblin_king_regal_conduct' || skill?.code === 'goblin_royal_signal_flag') {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const groupId = String((kingbeastTrait(monsterTarget) as any)?.groupId ?? '');
        for (const ally of targets.filter(target => !target.is_defeated && String((kingbeastTrait(target) as any)?.groupId ?? '') === groupId)) { const allyCooldowns = jsonObject(ally.cooldowns); allyCooldowns[skill.code === 'goblin_king_regal_conduct' ? 'royal_regal' : 'royal_signal'] = skill.code === 'goblin_king_regal_conduct' ? 3 : 2; ally.cooldowns = allyCooldowns; }
        log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」\n　$${skill.code === 'goblin_king_regal_conduct' ? '王权导律' : '王旗电令'}$在场王庭单位获得强化。`); continue;
      }
      if (skill?.code === 'goblin_king_call_elites') {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; cooldowns.royal_elite_summons = Number(cooldowns.royal_elite_summons ?? 0) + 1; monsterTarget.cooldowns = cooldowns;
        const code = Math.random() < .5 ? 'goblin_royal_guard' : 'goblin_royal_spearman'; const [templates] = await connection.execute<(RowDataPacket & MonsterAttributes & { id: number; level: number; monster_class: string; skill_sequence: unknown })[]>(`SELECT t.id,t.level,t.monster_class,t.skill_sequence,${templateMonsterAttributeColumns} FROM monster_templates t WHERE t.code=?`, [code]); const template = templates[0];
        const groupId = String((kingbeastTrait(monsterTarget) as any)?.groupId ?? '');
        if (template) { const attributes = randomMonsterBaseAttributes(template); const mainQuestTrait = mainQuestGoblinKingTrait(monsterTarget); const summonedLevel = mainQuestTrait ? 18 : 28; const traits = [{ code: 'summoned', name: '召唤的' }, ...(mainQuestTrait ? [mainQuestTrait] : []), { code: 'kingbeast_encounter', name: '', groupId, role: code === 'goblin_royal_guard' ? 'guard' : 'spearman' }]; const spawned = { ...template, ...attributes, level: summonedLevel, traits_json: traits }; const stats = monsterCombatStats(spawned); const [locations] = await connection.execute<(RowDataPacket & { region_id: number; pos_x: number; pos_y: number; pos_z: number })[]>('SELECT region_id,pos_x,pos_y,pos_z FROM monster_spawns WHERE id=?', [monsterTarget.id]); const location = locations[0]; const [created] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [template.id, location.region_id, location.pos_x, location.pos_y, location.pos_z, summonedLevel, attributes.constitution, attributes.spirit, attributes.strength, attributes.intelligence, attributes.agility, attributes.perception, stats.hpMax, JSON.stringify(stringList(template.skill_sequence)), JSON.stringify(traits)]); await connection.execute('INSERT INTO combat_targets (session_id,spawn_id,current_mp,cooldowns) VALUES (?,?,?,JSON_OBJECT())', [session.combat_id, created.insertId, stats.mpMax]); for (const member of members) await connection.execute('INSERT INTO combat_threat (session_id,spawn_id,character_id,threat) VALUES (?,?,?,1)', [session.combat_id, created.insertId, member.id]); }
        log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」\n　$王庭再征$新的王庭精锐踏入战场。`); continue;
      }
      if (skill && ['gruen_stoneward', 'gruen_tectonic_call', 'valk_furnace_stoke', 'threehead_brood_regrow', 'uzz_phylactery_turn'].includes(skill.code)) {
        monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns;
        const bossStats = monsterCombatStats(monsterTarget); const turnNo = Number(session.turn_no);
        log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」`);
        if (skill.code === 'gruen_stoneward') {
          const armorAlive = targets.some(target => !target.is_defeated && bossComponentDefinition(target)?.key === 'gruen_armor' && componentBodyId(target) === Number(monsterTarget.id));
          if (armorAlive) {
            if(talentActor)await rules.remove(talentActor,e=>e.data==='talentSuzaku');
            await connection.execute(`DELETE ce FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id
              WHERE ce.session_id=? AND ce.target_kind='target' AND ce.target_id=? AND e.effect_type IN ('damage_over_time','stat_modifier','control') AND e.code<>'life_shield'`, [session.combat_id, monsterTarget.id]);
            const shield = await grantLifeShield(connection, session.combat_id, 'target', Number(monsterTarget.id), bossStats.hpMax, Math.floor(bossStats.hpMax * .10), 2);
            await applyAdvancedStatus('target', Number(monsterTarget.id), 'barrier', 12, 2);
            log.push(`　$山心护层$净化异常，获得${shield.added}点生命护盾与12%减伤(2)。`);
          } else {
            const shield = await grantLifeShield(connection, session.combat_id, 'target', Number(monsterTarget.id), bossStats.hpMax, Math.floor(bossStats.hpMax * .05), 2);
            log.push(`　$残缺护层$永固之铠已毁；格鲁恩仅获得${shield.added}点生命护盾，无法净化异常。`);
          }
        } else if (skill.code === 'gruen_tectonic_call') {
          cooldowns.regional_gruen_corequake_ready = turnNo + 1; cooldowns.regional_gruen_tremor_ready_at = turnNo + 5;
          const hornAlive = targets.some(target => !target.is_defeated && bossComponentDefinition(target)?.key === 'gruen_horn' && componentBodyId(target) === Number(monsterTarget.id));
          if (hornAlive) { cooldowns.boss_component_gruen_horn_charge = 2; log.push('　$角鸣蓄能$【格鲁恩·镇脉之角】角纹由暗转亮；下个敌方行动前击破可中断强化震荡。'); }
          log.push('　$地脉预震$山腹开始鸣响；格鲁恩下一次行动将发动「山心崩震」。'); monsterTarget.cooldowns = cooldowns;
        } else if (skill.code === 'valk_furnace_stoke') {
          const heat = Math.max(1, Math.min(3, Number(cooldowns.regional_valk_heat ?? 0)));
          cooldowns.regional_valk_overdrive_ready = turnNo + 1; cooldowns.regional_valk_overdrive_heat = heat; cooldowns.regional_valk_heat = 0; delete cooldowns.boss_component_valk_bellows_charge; monsterTarget.cooldowns = cooldowns;
          log.push(`　$炉温加压$消耗炉温${heat}/3；下一次行动将释放「赤炉过载」。`);
        } else if (skill.code === 'threehead_brood_regrow') {
          if(talentActor)await rules.remove(talentActor,e=>e.data==='talentSuzaku');
          const oldHp = Number(monsterTarget.current_hp); const restored = Math.min(bossStats.hpMax - oldHp, Math.max(1, Math.floor(bossStats.hpMax * .12)));
          monsterTarget.current_hp += restored;
          await connection.execute(`DELETE ce FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id
            WHERE ce.session_id=? AND ce.target_kind='target' AND ce.target_id=? AND e.effect_type IN ('damage_over_time','stat_modifier','control') AND e.code<>'life_shield'`, [session.combat_id, monsterTarget.id]);
          await applyAdvancedStatus('target', Number(monsterTarget.id), 'regeneration', 7, 2);
          log.push(`　$蜕茧回生$恢复 ${restored} HP(${oldHp}→${monsterTarget.current_hp})，并净化异常、获得再生(2)。`);
        } else {
          if(talentActor)await rules.remove(talentActor,e=>e.data==='talentSuzaku');
          const oldHp = Number(monsterTarget.current_hp); const restored = Math.min(bossStats.hpMax - oldHp, Math.max(1, Math.floor(bossStats.hpMax * .11)));
          monsterTarget.current_hp += restored;
          await connection.execute(`DELETE ce FROM combat_status_effects ce JOIN effect_definitions e ON e.id=ce.effect_id
            WHERE ce.session_id=? AND ce.target_kind='target' AND ce.target_id=? AND e.effect_type IN ('damage_over_time','stat_modifier','control') AND e.code<>'life_shield'`, [session.combat_id, monsterTarget.id]);
          const shield = await grantLifeShield(connection, session.combat_id, 'target', Number(monsterTarget.id), bossStats.hpMax, Math.floor(bossStats.hpMax * .08), 2);
          log.push(`　$魂匣折返$恢复 ${restored} HP(${oldHp}→${monsterTarget.current_hp})，净化异常并获得${shield.added}点生命护盾(2)。`);
        }
        continue;
      }
      if (skill) { monsterTarget.current_mp -= Number(skill.mana_cost); cooldowns[skill.code] = Number(skill.cooldown_turns) + 1; monsterTarget.cooldowns = cooldowns; }
      const mentorBuild = advancedMentorBuildFor(monsterTarget);
      if (skill && mentorBuild && skill.category === 'utility' && await resolveMentorSupportSkill(monsterTarget, skill, mentorBuild)) {
        log.push(`➤【${targetName(monsterTarget)}】释放技能「${skill.name}」`);
        continue;
      }
      const multiplier = Number(skill?.power ?? 100) / 100 * (skill?.code === 'skeleton_execution' && Number(victim.current_hp) / Math.max(1, Number(victim.hp_max)) < .35 ? 1.45 : 1); const monster = monsterCombatStats(monsterTarget); const bite = skill?.code === 'bite';
      const mentorPassive = jsonObject(jsonObject(mentorBuild?.passive).effect); const mentorProfession = String(mentorBuild?.professionCode ?? ''); const mentorInheritance = jsonObject(mentorBuild?.inheritance); const mentorInheritanceValue = Number(jsonArray(mentorInheritance.values)[0] ?? 0);
      const royalRegal = Number(cooldowns.royal_regal ?? 0) > 0; const royalEnrage = Number(cooldowns.royal_beast_enrage ?? 0) > 0; const mentorHuntBonus = ['nightblade', 'trickster_ranger'].includes(mentorProfession) ? effectValue('member', Number(victim.id), 'advanced_hunt') : 0; const mentorDamageBonus = Number(mentorPassive.damageBonusPct ?? 0) + (skill?.category === 'magic' ? Number(mentorPassive.magicDamagePct ?? 0) : 0) + (skill?.element === '光' ? Number(mentorPassive.lightSkillBonusPct ?? 0) : 0) + mentorHuntBonus + (mentorProfession === 'nightblade' && Number(victim.current_hp) / Math.max(1, Number(victim.hp_max)) <= .35 ? mentorInheritanceValue : 0); const monsterAttack = (skill?.category === 'magic' ? monster.magicAttack * (royalRegal ? 1.35 : 1) : monster.physicalAttack) * (1 + mentorDamageBonus / 100); const victimModifiers = await modifiersFor(connection, Number(victim.id));
      const curse = effectValue('target', Number(monsterTarget.id), 'shadow_curse'); const battleCry = effectValue('target', Number(monsterTarget.id), 'battle_cry'); const mistVeil = effectValue('target', Number(monsterTarget.id), 'mist_veil'); const shadowPierce = effectValue('target', Number(monsterTarget.id), 'shadow_pierce'); const nextActionEffects = effects.filter(effect => effect.target_kind === 'target' && Number(effect.target_id) === Number(monsterTarget.id) && (effect.code === 'mist_veil' || effect.code === 'shadow_pierce')); const fang = skill?.code === 'wolfking_fang_devour'; const pounce = skill?.code === 'wolfking_rending_pounce';
      const regionalComboMultiplier = (defender: CombatMemberRow) => {
        const defenderCooldowns = jsonObject(defender.cooldowns); const marked = (code: string) => Number(defenderCooldowns[code] ?? 0) >= Number(session.turn_no);
        const armAlive = !Number(cooldowns.boss_component_gruen_arm_broken ?? 0);
        if (skill?.code === 'gruen_riftfall') return (armAlive && marked('regional_gruen_fault_until') ? 1.22 : 1) * (marked('boss_component_gruen_arm_press_until') ? 1.15 : 1);
        if (skill?.code === 'gruen_corequake') return (armAlive && marked('regional_gruen_fault_until') ? 1.15 : 1) * (Number(cooldowns.boss_component_gruen_horn_charge ?? 0) > 0 ? 1.45 : 1);
        if (skill?.code === 'valk_anvil_sentence' && marked('regional_valk_slag_until')) return 1.25;
        if (skill?.code === 'valk_furnace_overdrive') return 1 + Math.min(3, Math.max(0, Number(cooldowns.regional_valk_overdrive_heat ?? 0))) * .06;
        if (skill?.code === 'threehead_mist_lash' && marked('regional_mother_venom_until')) return 1.18;
        if (skill?.code === 'threehead_swallow' && marked('regional_mother_swallow_until')) return 1.30;
        if (skill?.code === 'uzz_choir_of_graves' && marked('regional_uzz_gravebrand_until')) return 1.20;
        if (skill?.code === 'uzz_soul_reaping' && marked('regional_uzz_reap_until')) return 1.30;
        return 1;
      };
      const redirectedVictim = rules.redirect(ruleUnit('target', Number(monsterTarget.id)), ruleUnit('member', Number(victim.id)), true);
      if (redirectedVictim.side === 'target') { await rules.strike(ruleUnit('target', Number(monsterTarget.id)), redirectedVictim, multiplier * 100, String(skill?.element ?? '无'), skill?.category === 'magic', false, false, 1, { skill: Boolean(skill), redirected: true }); continue; }
      victim = members.find(item => Number(item.id) === Number(redirectedVictim.key.split(':')[1])) ?? victim;
      const resolveMonsterStrike = async (defender: CombatMemberRow) => {
        const pressuredMonster = monsterCombatStatsForPlayer(monsterTarget, Number(defender.level));
        const defenderModifiers = Number(defender.id) === Number(victim.id) ? victimModifiers : undefined;
        const physicalDefenseReduction = effectValue('member', Number(defender.id), 'vulnerability') + effectValue('member', Number(defender.id), 'sword_break') + effectValue('member', Number(defender.id), 'armor_shatter');
        const magicDefenseReduction = effectValue('member', Number(defender.id), 'magic_shatter');
        const defenderDefenseBase = skill?.category === 'magic'
          ? Number(defender.magic_defense) * (1 + (defenderModifiers?.magicDefensePct ?? (await modifiersFor(connection, Number(defender.id))).magicDefensePct) / 100)
          : Number(defender.physical_defense) * (1 + (defenderModifiers?.physicalDefensePct ?? (await modifiersFor(connection, Number(defender.id))).physicalDefensePct) / 100);
        const defenseReduction = skill?.category === 'magic' ? magicDefenseReduction : physicalDefenseReduction;
        const defenderDefense = defenderDefenseBase * (1 - Math.min(90, defenseReduction) / 100);
        const defenderImbalance = effectValue('member', Number(defender.id), 'imbalance'); const defenderBind = effectValue('member', Number(defender.id), 'bind'); const defenderGuardTonic = effectValue('member', Number(defender.id), 'alchemy_guard'); const defenderEvasionTonic = effectValue('member', Number(defender.id), 'alchemy_evasion');
        const inheritanceCrit = mentorProfession === 'ironbreaker' && (physicalDefenseReduction > 0 || effectValue('member', Number(defender.id), 'exposed') > 0) ? mentorInheritanceValue : mentorProfession === 'venomancer' && (effectValue('member', Number(defender.id), 'poison') > 0 || physicalDefenseReduction > 0 || effectValue('member', Number(defender.id), 'exposed') > 0) ? mentorInheritanceValue : 0;
        const actualHit = Number(mentorPassive.actualHitRatePct ?? 0);
        const setup = await rules.attackSetup(ruleUnit('target', Number(monsterTarget.id)), ruleUnit('member', Number(defender.id)), skill?.category === 'magic', Boolean(skill));
        return resolveStrike(monsterAttack * multiplier * regionalComboMultiplier(defender) * (1 + curse / 400) * (1 + battleCry / 100) * (1 + mistVeil / 100), defenderDefense * (1 + ownRuleValue('member', Number(defender.id), skill?.category === 'magic' ? 'magic_defense' : 'defense') / 100) * (1 - curse / 400) * (1 + defenderGuardTonic / 100), pressuredMonster.accuracy * (1 + curse / 100 + battleCry / 100) * (royalRegal ? 1.2 : 1) * (Number(cooldowns.royal_signal ?? 0) > 0 ? 1.15 : 1) * (royalEnrage ? 3 : 1), Number(defender.evasion) * (1 + defenderEvasionTonic / 100) * (1 - defenderImbalance / 100) * (1 - defenderBind / 100), (pressuredMonster.crit + inheritanceCrit * 100) * (royalEnrage ? 3 : 1), Number(defender.crit_resist_bp), pressuredMonster.critDamage * (royalEnrage ? 3 : 1), Number(defender.crit_damage_reduction_bp), false, fang || shadowPierce > 0, 0, actualHit + setup.hitBonus * 100, setup.hitFactor, strikeCorrections(ruleUnit('target', Number(monsterTarget.id)),ruleUnit('member', Number(defender.id))));
      };
      const shieldCounterDamage = async (defender: CombatMemberRow, rawDamage: number) => {
        const damageReductionPct = Math.min(60, effectValue('member', Number(defender.id), 'shield_counter'));
        if (damageReductionPct <= 0) return { active: false, reflected: 0, damageReductionPct: 0, cooldownReduced: false, reflectedHpBefore: 0, reflectedHpAfter: 0, shield: undefined };
        const defenderCooldowns = jsonObject(defender.cooldowns); const counterCooldown = Number(defenderCooldowns.shield_counter ?? 0);
        const refunded = counterCooldown > 0 && Number(defenderCooldowns.__counterRefundTurn ?? 0) !== Number(session.turn_no);
        if (refunded) { defenderCooldowns.shield_counter = Math.max(0, counterCooldown - 1); defenderCooldowns.__counterRefundTurn = Number(session.turn_no); defender.cooldowns = defenderCooldowns; }
        if (String(skill?.range_type ?? '近战') !== '近战') return { active: true, reflected: 0, damageReductionPct, cooldownReduced: refunded, reflectedHpBefore: 0, reflectedHpAfter: 0, shield: undefined };
        const reflectedHpBefore = Number(monsterTarget.current_hp); const reflected = Math.max(1, Math.floor(rawDamage * .5)); const shield = await absorbRuleShield(connection, session.combat_id, 'target', Number(monsterTarget.id), Number(monsterTarget.hp_max), reflected); const hpDamage = reflected - shield.absorbed;
        monsterTarget.current_hp = Math.max(0, Number(monsterTarget.current_hp) - hpDamage);
        if (!monsterTarget.current_hp) monsterTarget.is_defeated = 1;
        return { active: true, reflected, damageReductionPct, cooldownReduced: refunded, reflectedHpBefore, reflectedHpAfter: Number(monsterTarget.current_hp), shield };
      };
      const shieldCounterLog = (counter: Awaited<ReturnType<typeof shieldCounterDamage>>) => `$盾反$受到的伤害降低${counter.damageReductionPct}%${counter.cooldownReduced ? '，冷却缩短1回合' : ''}${counter.reflected ? `，反弹 ${counter.reflected} 点原始伤害给【${targetName(monsterTarget)}】${counter.shield ? lifeShieldAbsorptionText(counter.shield) : ''}(${counter.reflectedHpBefore}→${counter.reflectedHpAfter})` : ''}`;
      const splitAdvancedGuard = async (recipient: CombatMemberRow, rawDamage: number, allowTransfer: boolean) => {
        const rate = allowTransfer ? effectValue('member', Number(recipient.id), 'advanced_guard') : 0;
        const sourceId = Number(jsonObject(recipient.cooldowns).advanced_guard_source ?? 0); const guardian = rate > 0 ? members.find(member => !member.is_defeated && Number(member.id) === sourceId) : undefined;
        if (!guardian) return { recipientDamage: rawDamage, guardian: undefined, transferred: 0, transferredRaw: 0, guardianShield: undefined, guardianHpBefore: undefined };
        const transferredRaw = Math.max(0, Math.floor(rawDamage * Math.min(80, rate) / 100)); const guardianBarrier = effectValue('member', Number(guardian.id), 'barrier'); const guardianDamage = Math.max(0, Math.floor(transferredRaw * (1 - Math.min(80, guardianBarrier) / 100)));
        const oldGuardianHp = Number(guardian.current_hp); const guardianShield = await absorbRuleShield(connection, session.combat_id, 'member', Number(guardian.id), Number(guardian.hp_max), guardianDamage); const guardianHpDamage = guardianDamage - guardianShield.absorbed; guardian.current_hp = Math.max(0, oldGuardianHp - guardianHpDamage); if (!guardian.current_hp) guardian.is_defeated = 1;talentRecordEnemyDamage(ruleUnit('target',Number(monsterTarget.id)),ruleUnit('member',Number(guardian.id)),Math.max(0,oldGuardianHp-Number(guardian.current_hp)));
        await gainResource(guardian, Math.min(30, transferredRaw), '承接守护转移伤害');
        if (resourceFor(Number(guardian.id))?.profession_code === 'aegis_priest') await gainResource(guardian, 15, '守护转移成功');
        return { recipientDamage: Math.max(0, rawDamage - transferredRaw), guardian, transferred: guardianDamage, transferredRaw, guardianHpBefore: oldGuardianHp, guardianShield };
      };
      const preserveAdvancedUndying = async (recipient: CombatMemberRow) => {
        if (!recipient.is_defeated || effectValue('member', Number(recipient.id), 'advanced_undying') <= 0) return false;
        recipient.current_hp = 1; recipient.is_defeated = 0; await removeAdvancedStatus('member', Number(recipient.id), ['advanced_undying']); log.push(`&濒危不倒&${combatUnitLabel(recipient)}被不灭穹顶托住，生命保留为1。`); return true;
      };
      const rewardDefensiveResource = async (recipient: CombatMemberRow, counterActive: boolean, primaryTarget: boolean) => {
        if (resourceFor(Number(recipient.id))?.profession_code === 'bulwark_guard' && primaryTarget) await gainResource(recipient, 20, '成为敌方主目标');
        if (resourceFor(Number(recipient.id))?.profession_code === 'bulwark_guard' && counterActive) await gainResource(recipient, 20, '成功格挡');
      };
      const rewardAegisBarrierFaith = async (recipient: CombatMemberRow, barrier: number, rawDamage: number) => {
        if (barrier <= 0 || rawDamage <= 0) return;
        const cooldowns = jsonObject(recipient.cooldowns); const sourceId = Number(cooldowns.advanced_aegis_barrier_source ?? 0);
        const priest = sourceId ? members.find(member => Number(member.id) === sourceId && resourceFor(Number(member.id))?.profession_code === 'aegis_priest') : undefined;
        if (!priest || cooldowns.advanced_aegis_barrier_faith) return;
        cooldowns.advanced_aegis_barrier_faith = 1; recipient.cooldowns = cooldowns;
        await gainResource(priest, 10, `${combatUnitLabel(recipient)}的壁垒承伤`);
      };
      const afterAdvancedDamage = async (recipient: CombatMemberRow, rawDamage: number, barrier: number, counterActive: boolean, primaryTarget: boolean, split: Awaited<ReturnType<typeof splitAdvancedGuard>>) => {
        if (split.guardian) {
          await preserveAdvancedUndying(split.guardian);
          await rewardAegisBarrierFaith(split.guardian, effectValue('member', Number(split.guardian.id), 'barrier'), split.transferredRaw);
          log.push(`　&守护分担&${combatUnitLabel(split.guardian)}承受 ${split.transferred} 点转移伤害${split.guardianShield ? lifeShieldAbsorptionText(split.guardianShield) : ''}(${split.guardianHpBefore}→${split.guardian.current_hp})。`);
          await removeAdvancedStatus('member', Number(recipient.id), ['advanced_guard']);
          const recipientCooldowns = jsonObject(recipient.cooldowns); delete recipientCooldowns.advanced_guard_source; recipient.cooldowns = recipientCooldowns;
          effects = await activeCombatEffects(connection, session.combat_id);
        }
        await preserveAdvancedUndying(recipient);
        await rewardDefensiveResource(recipient, counterActive, primaryTarget);
        await rewardAegisBarrierFaith(recipient, barrier, rawDamage);
        const cooldowns = jsonObject(recipient.cooldowns);
        if (barrier > 0 && cooldowns.advanced_aegis_echo && rawDamage > 0) {
          const oldHp = Number(recipient.current_hp); const restored = Math.max(1, Math.floor(Number(recipient.hp_max) * .07)); recipient.current_hp = Math.min(Number(recipient.hp_max), oldHp + restored); delete cooldowns.advanced_aegis_echo; recipient.cooldowns = cooldowns;
          if (recipient.current_hp > oldHp) log.push(`　&光幕回响&${combatUnitLabel(recipient)}的壁垒碎光回流，恢复 ${recipient.current_hp - oldHp} HP(${oldHp}→${recipient.current_hp})。`);
        }
        if (primaryTarget && rawDamage > 0 && cooldowns.advanced_bulwark_mountain && !recipient.is_defeated) {
          const hits = Number(cooldowns.advanced_bulwark_hits ?? 0) + 1; cooldowns.advanced_bulwark_hits = hits;
          if (hits >= 3) { cooldowns.advanced_bulwark_mountain = 0; cooldowns.advanced_bulwark_hits = 0; await applyAdvancedStatus('member', Number(recipient.id), 'advanced_counter_ready', 90, 1); log.push(`　&不动如山&${combatUnitLabel(recipient)}扛住三次攻击，反击架势已就绪。`); }
          recipient.cooldowns = cooldowns;
        }
      };
      const identifiedMonster = Boolean(appraisalForTarget(appraisal, Number(monsterTarget.level)));
      log.push(`➤【${targetName(monsterTarget)}】${skill ? `释放技能「${identifiedMonster ? skill.name : '???'}」` : '普通攻击'}`);
      if (nextActionEffects.length) await connection.execute(`DELETE FROM combat_status_effects WHERE id IN (${nextActionEffects.map(() => '?').join(',')})`, nextActionEffects.map(effect => effect.id));
      const [spiritTargets] = await connection.execute<CombatSpiritRow[]>('SELECT owner_character_id,spirit_code,spirit_name,current_hp,hp_max,stats_json,remaining_turns FROM combat_spirits WHERE session_id=? AND current_hp>0 FOR UPDATE', [session.combat_id]);
      const livingAutomatons = combatAutomatons.filter(pet => !pet.battle.exited && pet.unit.hp > 0 && members.some(owner => Number(owner.id) === pet.ownerId && !owner.is_defeated));
      const [humanThreat] = await connection.execute<RowDataPacket[]>('SELECT COALESCE(SUM(threat),0) total FROM combat_threat WHERE session_id=? AND spawn_id=?', [session.combat_id, monsterTarget.id]);
      const petThreat = livingAutomatons.reduce((sum, pet) => sum + Math.max(1, pet.battle.threat[`target:${monsterTarget.id}`] ?? 1), 0);
      const areaAttack = skill?.target_scope === '全体';
      const choosePet = !areaAttack && livingAutomatons.length > 0 && Math.random() < petThreat / Math.max(1, petThreat + Math.max(members.filter(m=>!m.is_defeated).length,Number(humanThreat[0]?.total ?? 0)));
      let petRoll=Math.random()*petThreat;const chosenPet=livingAutomatons.find(p=>{petRoll-=Math.max(1,p.battle.threat[`target:${monsterTarget.id}`]??1);return petRoll<0;});
      const petVictims = areaAttack ? livingAutomatons : choosePet&&chosenPet ? [chosenPet] : [];
      for (const pet of petVictims) {
        const attacker = ruleUnit('target', Number(monsterTarget.id));
        if(skill)await applyEnemySkillToAutomaton(connection,rules,attacker,pet.unit,Number(skill.id),'on_cast',choosePet);
        if (skill?.category !== 'utility')for(let hit=0;hit<(pounce?3:1)&&pet.unit.hp>0;hit++){const landed=await rules.strike(attacker, pet.unit, multiplier * 100, String(skill?.element ?? '无'), skill?.category === 'magic', false, false, 1, { skill: Boolean(skill), single: !areaAttack });if(landed&&skill)await applyEnemySkillToAutomaton(connection,rules,attacker,pet.unit,Number(skill.id),'on_hit',choosePet);}
      }
      if (choosePet) continue;
      const spiritVictim = !spiritTargets.length || skill?.target_scope === '全体' || Math.random() >= .28 ? undefined : spiritTargets[random(0, spiritTargets.length - 1)];
      if (spiritVictim) {
        const spiritStats = storedSpiritStats(spiritVictim); const pressuredMonster = monsterCombatStatsForPlayer(monsterTarget, lowestAliveMemberLevel);
        const spiritDefense = skill?.category === 'magic' ? spiritStats.magicDefense : spiritStats.physicalDefense;
        const strike = resolveStrike(monsterAttack * multiplier * (1 + curse / 400) * (1 + battleCry / 100), spiritDefense * (1 - curse / 400), pressuredMonster.accuracy, spiritStats.evasion, pressuredMonster.crit, spiritStats.crit, pressuredMonster.critDamage, spiritStats.crit, false, fang || shadowPierce > 0);
        if (!strike.hit) log.push(`　➥〖${spiritVictim.spirit_name}〗闪避了攻击`);
        else {
          const oldHp = Number(spiritVictim.current_hp); const dealt = directDamageVariance(Math.max(1, strike.damage)); const currentHp = Math.max(0, oldHp - dealt);
          await connection.execute('UPDATE combat_spirits SET current_hp=? WHERE session_id=? AND owner_character_id=? AND spirit_code=?', [currentHp, session.combat_id, spiritVictim.owner_character_id, spiritVictim.spirit_code]);
          log.push(`　➥对〖${spiritVictim.spirit_name}〗造成 ${dealt} 点${skill?.category === 'magic' ? '魔法' : '物理'}伤害(${oldHp}→${currentHp})`);
          if (!currentHp) { await connection.execute('DELETE FROM combat_spirits WHERE session_id=? AND owner_character_id=? AND spirit_code=?', [session.combat_id, spiritVictim.owner_character_id, spiritVictim.spirit_code]); log.push(`　&灵兽退场&〖${spiritVictim.spirit_name}〗灵力耗尽，退回灵契。`); }
        }
        continue;
      }
      if (skill) await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', victim, 'member', 'on_cast', log, 0, 1, rules);
      if (skill && (skill as any).category === 'utility') continue;
      if (pounce) log.push('$连击$疾速三连击！');
      if (fang) log.push('$利齿$该攻击必定暴击。');
      if (bite) log.push('　$獠牙$该攻击暴击+25.0%');
      if (pounce) {
        for (let index = 0; index < 3 && !victim.is_defeated; index += 1) {
          await consumePrecisionAim(victim);
          if ((skill?.category ?? 'physical') !== 'magic' && effectValue('member', Number(victim.id), 'device_physical_evade') > 0) { await removeAdvancedStatus('member', Number(victim.id), ['device_physical_evade']); log.push(`　#物理闪避#${combatUnitLabel(victim)}避开了这次物理攻击。`); continue; }
          const strike = await resolveMonsterStrike(victim);
          if (!strike.hit) { const cooldowns = jsonObject(victim.cooldowns); if (cooldowns.advanced_phase_guard) { delete cooldowns.advanced_phase_guard; victim.cooldowns = cooldowns; await gainResource(victim, 30, '相位格挡成功闪避'); } log.push(`　➥${combatUnitLabel(victim)}闪避了攻击`); continue; }
          const barrier = effectValue('member', Number(victim.id), 'barrier'); const guard = effectValue('member', Number(victim.id), 'shield_guard'); const exposed = effectValue('member', Number(victim.id), 'exposed'); const phaseDecoy = effectValue('member', Number(victim.id), 'phase_decoy'); const elemental = elementalMultiplier(monsterTarget.element_mastery_json, victim.element_resistance_json, String(skill?.element ?? '')); const weatherElement = weatherElementMultiplier(String(skill?.element ?? '')); const artifactReduction = skill?.category === 'magic' ? victimModifiers.magicDamageReductionPct : victimModifiers.physicalDamageReductionPct; const damageReduction = Math.min(90, artifactReduction + victimModifiers.damageReductionPct + epicIncomingSkillReduction(victim)); const timeGuarded = effectValue('member', Number(victim.id), 'time_guard') > 0; const counter = await shieldCounterDamage(victim, strike.damage); const damage = timeGuarded ? 0 : directDamageVariance(Math.max(1, Math.floor(strike.damage * elemental * weatherElement * (1 + exposed / 100) * (1 - phaseDecoy / 100) * (1 - counter.damageReductionPct / 100) * (1 - Math.min(80, barrier) / 100) * (1 - Math.min(90, guard) / 100) * (1 - damageReduction / 100))));
          const split = await splitAdvancedGuard(victim, await rules.incoming(ruleUnit('target', Number(monsterTarget.id)), ruleUnit('member', Number(victim.id)), damage, String(skill?.element ?? '无'), skill?.category === 'magic', Boolean(skill), true, true), true); const dealt = split.recipientDamage; const oldHp = Number(victim.current_hp); const shield = await ruleTakeDamage('member', Number(victim.id), dealt,false,ruleUnit('target',Number(monsterTarget.id))); const hpDamage = dealt - shield.absorbed;
          await rules.afterHit(ruleUnit('target', Number(monsterTarget.id)), ruleUnit('member', Number(victim.id)), hpDamage, String(skill?.element ?? '无'), Boolean(skill), shield.absorbed);
          if (phaseDecoy > 0) { await removeAdvancedStatus('member', Number(victim.id), ['phase_decoy']); log.push(`　#相位诱饵#本次直接伤害降低${phaseDecoy}%。`); }
          const furnaceCooldowns = jsonObject(victim.cooldowns); if (shield.broken && Number(furnaceCooldowns.epic_valk_furnace_shield_until ?? 0) >= Number(session.turn_no)) { const relief = Math.floor(hpDamage * .20); if (relief) { victim.current_hp = Math.min(oldHp, Number(victim.current_hp) + relief); victim.is_defeated = victim.current_hp > 0 ? 0 : victim.is_defeated; log.push(`&余烬急锻&炉壁破裂，剩余伤害降低${relief}点；下次技能直击+8%。`); } furnaceCooldowns.epic_valk_furnace_shield_until = 0; furnaceCooldowns.epic_valk_emergency_forge_until = Number(session.turn_no) + 1; victim.cooldowns = furnaceCooldowns; }
          await afterAdvancedDamage(victim, damage, barrier, counter.active, true, split); const timeSaved = await rescueWithTimeGuard(connection, session.combat_id, victim, victimModifiers.timeGuard, log);
          log.push(`　➥${affinityTag(1, elemental)}${strike.crit ? '[暴击!]' : ''}对${combatUnitLabel(victim)}造成 ${dealt} 点${skill?.category === 'magic' ? '魔法' : '物理'}伤害${lifeShieldAbsorptionText(shield)}(${oldHp}→${victim.current_hp})`);
          if (counter.active) log.push(`　${shieldCounterLog(counter)}`);
          await triggerAegisEcho(victim, barrier > 0 || guard > 0 || counter.active);
          await triggerSummonerShelter(victim);
          await triggerInverseBuffer(victim);
          if (skill) await triggerEpicIncomingSkill(victim);
          if (skill) await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', victim, 'member', 'on_hit', log, 0, 1, rules);
          if (timeSaved) break;
        }
        continue;
      }
      const affected = skill?.target_scope === '全体' ? members.filter(member => !member.is_defeated) : [victim];
      await consumePrecisionAim(victim);
      const strike = await resolveMonsterStrike(victim);
      if (!strike.hit && affected.length === 1) { const cooldowns = jsonObject(victim.cooldowns); if (cooldowns.advanced_phase_guard) { delete cooldowns.advanced_phase_guard; victim.cooldowns = cooldowns; await gainResource(victim, 30, '相位格挡成功闪避'); } log.push(`　➥${combatUnitLabel(victim)}闪避了攻击`); continue; }
      for (const affectedVictim of affected) {
        const affectedModifiers = Number(affectedVictim.id) === Number(victim.id) ? victimModifiers : await modifiersFor(connection, Number(affectedVictim.id));
        await consumePrecisionAim(affectedVictim);
        if ((skill?.category ?? 'physical') !== 'magic' && effectValue('member', Number(affectedVictim.id), 'device_physical_evade') > 0) { await removeAdvancedStatus('member', Number(affectedVictim.id), ['device_physical_evade']); log.push(`　#物理闪避#${combatUnitLabel(affectedVictim)}避开了这次物理攻击。`); continue; }
        const affectedStrike = Number(affectedVictim.id) === Number(victim.id) ? strike : await resolveMonsterStrike(affectedVictim);
        if (!affectedStrike.hit) { const cooldowns = jsonObject(affectedVictim.cooldowns); if (cooldowns.advanced_phase_guard) { delete cooldowns.advanced_phase_guard; affectedVictim.cooldowns = cooldowns; await gainResource(affectedVictim, 30, '相位格挡成功闪避'); } log.push(`　➥${combatUnitLabel(affectedVictim)}闪避了攻击`); continue; }
        const elemental = elementalMultiplier(monsterTarget.element_mastery_json, affectedVictim.element_resistance_json, String(skill?.element ?? ''));
        const barrier = effectValue('member', Number(affectedVictim.id), 'barrier'); const guard = effectValue('member', Number(affectedVictim.id), 'shield_guard'); const artifactReduction = skill?.category === 'magic' ? affectedModifiers.magicDamageReductionPct : affectedModifiers.physicalDamageReductionPct; const damageReduction = Math.min(90, artifactReduction + affectedModifiers.damageReductionPct + epicIncomingSkillReduction(affectedVictim));
        const exposed = effectValue('member', Number(affectedVictim.id), 'exposed'); const phaseDecoy = effectValue('member', Number(affectedVictim.id), 'phase_decoy'); const oldHp = Number(affectedVictim.current_hp); const counter = await shieldCounterDamage(affectedVictim, affectedStrike.damage); const dealt = effectValue('member', Number(affectedVictim.id), 'time_guard') > 0 ? 0 : directDamageVariance(Math.max(1, Math.floor(affectedStrike.damage * elemental * weatherElementMultiplier(String(skill?.element ?? '')) * (1 + exposed / 100) * (1 - phaseDecoy / 100) * (1 - counter.damageReductionPct / 100) * (1 - Math.min(80, barrier) / 100) * (1 - Math.min(90, guard) / 100) * (1 - damageReduction / 100))));
        const split = await splitAdvancedGuard(affectedVictim, await rules.incoming(ruleUnit('target', Number(monsterTarget.id)), ruleUnit('member', Number(affectedVictim.id)), dealt, String(skill?.element ?? '无'), skill?.category === 'magic', Boolean(skill), affected.length === 1, true), affected.length === 1); const finalDealt = split.recipientDamage; const shield = await ruleTakeDamage('member', Number(affectedVictim.id), finalDealt,false,ruleUnit('target',Number(monsterTarget.id))); const hpDamage = finalDealt - shield.absorbed;
        await rules.afterHit(ruleUnit('target', Number(monsterTarget.id)), ruleUnit('member', Number(affectedVictim.id)), hpDamage, String(skill?.element ?? '无'), Boolean(skill), shield.absorbed);
        if(skill?.target_scope==='全体'&&session.mode!=='spar'&&character.region_name!=='首领测试场')await(await import('./companion.service')).companionAreaHit(connection,rules,ruleUnit('member',Number(affectedVictim.id)),ruleUnit('target',Number(monsterTarget.id)),skill?.category==='magic');
        if (phaseDecoy > 0) { await removeAdvancedStatus('member', Number(affectedVictim.id), ['phase_decoy']); log.push(`　#相位诱饵#本次直接伤害降低${phaseDecoy}%。`); }
        const furnaceCooldowns = jsonObject(affectedVictim.cooldowns); if (shield.broken && Number(furnaceCooldowns.epic_valk_furnace_shield_until ?? 0) >= Number(session.turn_no)) { const relief = Math.floor(hpDamage * .20); if (relief) { affectedVictim.current_hp = Math.min(oldHp, Number(affectedVictim.current_hp) + relief); affectedVictim.is_defeated = affectedVictim.current_hp > 0 ? 0 : affectedVictim.is_defeated; log.push(`&余烬急锻&炉壁破裂，剩余伤害降低${relief}点；下次技能直击+8%。`); } furnaceCooldowns.epic_valk_furnace_shield_until = 0; furnaceCooldowns.epic_valk_emergency_forge_until = Number(session.turn_no) + 1; affectedVictim.cooldowns = furnaceCooldowns; }
        await afterAdvancedDamage(affectedVictim, dealt, barrier, counter.active, affected.length === 1, split); await rescueWithTimeGuard(connection, session.combat_id, affectedVictim, affectedModifiers.timeGuard, log);
        await triggerInverseBuffer(affectedVictim);
        log.push(`　➥${affinityTag(1, elemental)}${affectedStrike.crit || fang ? '[暴击!]' : ''}对${combatUnitLabel(affectedVictim)}造成 ${finalDealt} 点${skill?.category === 'magic' ? '魔法' : '物理'}伤害${lifeShieldAbsorptionText(shield)}(${oldHp}→${affectedVictim.current_hp})`);
        if (counter.active) log.push(`　${shieldCounterLog(counter)}`);
        await triggerAegisEcho(affectedVictim, barrier > 0 || guard > 0 || counter.active);
        await triggerSummonerShelter(affectedVictim);
        if (skill) await triggerEpicIncomingSkill(affectedVictim);
        if (skill) await applySkillEffects(connection, session.combat_id, Number(skill.id), monsterTarget, 'target', affectedVictim, 'member', 'on_hit', log, 0, 1, rules);
        if (skill && level32BossCodes.has(templateCode)) {
          const targetCooldowns = jsonObject(affectedVictim.cooldowns); const until = Number(session.turn_no) + 2;
          if (skill.code === 'gruen_fault_sunder') {
            targetCooldowns.regional_gruen_fault_until = until;
            log.push(`　$断层裂隙$${combatUnitLabel(affectedVictim)}的裂隙持续至第${until}回合，下一次岩震将更为沉重。`);
          } else if (skill.code === 'gruen_riftfall' || skill.code === 'gruen_corequake') {
            if (Number(targetCooldowns.regional_gruen_fault_until ?? 0) >= Number(session.turn_no)) {
              delete targetCooldowns.regional_gruen_fault_until;
              log.push(`　$裂隙引爆$${combatUnitLabel(affectedVictim)}承受了被放大的岩震。`);
            }
            if (skill.code === 'gruen_riftfall' && Number(targetCooldowns.boss_component_gruen_arm_press_until ?? 0) >= Number(session.turn_no)) {
              delete targetCooldowns.boss_component_gruen_arm_press_until;
              log.push(`　$裂谷擒压$${combatUnitLabel(affectedVictim)}承受了重臂追加的 15% 冲击。`);
            }
            if (skill.code === 'gruen_corequake' && Number(cooldowns.boss_component_gruen_horn_charge ?? 0) > 0) {
              await applyAdvancedStatus('member', Number(affectedVictim.id), 'bind', 18, 2);
              log.push(`　$崩岳角鸣$${combatUnitLabel(affectedVictim)}的束缚延长 1 回合。`);
            }
          } else if (skill.code === 'valk_slag_brand') {
            targetCooldowns.regional_valk_slag_until = until;
            log.push(`　$炉渣烙印$${combatUnitLabel(affectedVictim)}被烙印至第${until}回合，瓦尔克会优先裁决该目标。`);
          } else if (skill.code === 'valk_anvil_sentence') {
            if (Number(targetCooldowns.regional_valk_slag_until ?? 0) >= Number(session.turn_no)) {
              delete targetCooldowns.regional_valk_slag_until;
              log.push(`　$铁砧裁决$炉渣烙印被击碎，裁决伤害已放大。`);
            }
            if (Number(cooldowns.boss_component_valk_chain_execute_target ?? 0) === Number(affectedVictim.id)) delete cooldowns.boss_component_valk_chain_execute_target;
          } else if (skill.code === 'threehead_venom_fang') {
            targetCooldowns.regional_mother_venom_until = until;
            log.push(`　$毒首猎记$${combatUnitLabel(affectedVictim)}成为雾首的追击目标，持续至第${until}回合。`);
          } else if (skill.code === 'threehead_mist_lash') {
            if (Number(targetCooldowns.regional_mother_venom_until ?? 0) >= Number(session.turn_no)) {
              delete targetCooldowns.regional_mother_venom_until;
              log.push(`　$雾首追击$毒首猎记被雾幕撕开，伤害已放大。`);
            }
          } else if (skill.code === 'threehead_rootcoil') {
            targetCooldowns.regional_mother_swallow_until = Number(session.turn_no) + 1;
            log.push(`　$根沼猎杀$${combatUnitLabel(affectedVictim)}被绞缠；蛇母的下一次行动将优先吞噬该目标。`);
          } else if (skill.code === 'threehead_swallow') {
            if (Number(targetCooldowns.regional_mother_swallow_until ?? 0) >= Number(session.turn_no)) {
              delete targetCooldowns.regional_mother_swallow_until;
              log.push(`　$三首吞噬$根沼绞缠被吞噬撕裂，伤害已放大。`);
            }
          } else if (skill.code === 'uzz_gravebrand') {
            targetCooldowns.regional_uzz_gravebrand_until = until;
            log.push(`　$葬印蚀魂$${combatUnitLabel(affectedVictim)}被葬印锁定至第${until}回合，墓群和鸣会优先撕裂该印记。`);
          } else if (skill.code === 'uzz_choir_of_graves') {
            if (Number(targetCooldowns.regional_uzz_gravebrand_until ?? 0) >= Number(session.turn_no)) {
              delete targetCooldowns.regional_uzz_gravebrand_until;
              log.push(`　$墓群和鸣$葬印被群魂撕裂，伤害已放大。`);
            }
          } else if (skill.code === 'uzz_marrow_lash') {
            targetCooldowns.regional_uzz_reap_until = Number(session.turn_no) + 1;
            log.push(`　$髓骨缚鞭$${combatUnitLabel(affectedVictim)}被锁入收割窗口；乌兹下一次行动会优先噬魂。`);
          } else if (skill.code === 'uzz_soul_reaping') {
            if (Number(targetCooldowns.regional_uzz_reap_until ?? 0) >= Number(session.turn_no)) {
              delete targetCooldowns.regional_uzz_reap_until;
              log.push(`　$噬魂收割$收割窗口被撕开，伤害已放大。`);
            }
          }
          affectedVictim.cooldowns = targetCooldowns;
        }
        if (mentorBuild && skill) {
          // 同一套二转机制在导师侧使用“敌方目标”落点：前置状态会真实改变下一次出手，而非仅展示技能名。
          if (skill.code === 'nightblade_shadow_mark') { await applyAdvancedStatus('member', Number(affectedVictim.id), 'advanced_hunt', 20, 3); log.push(`　$追猎$${combatUnitLabel(affectedVictim)}被暗影标定，导师的下一次攻击+20%。`); }
          if (skill.code === 'ranger_grapple_trap') { await applyAdvancedStatus('member', Number(affectedVictim.id), 'advanced_hunt', 15, 2); log.push(`　$追猎$${combatUnitLabel(affectedVictim)}被钩索标定，导师的下一次攻击+15%。`); }
          if (skill.code === 'elementalist_cinderfrost_cycle') {
            const mentorCooldowns = jsonObject(monsterTarget.cooldowns); const ice = Boolean(mentorCooldowns.advanced_mentor_element_cycle); mentorCooldowns.advanced_mentor_element_cycle = ice ? 0 : 1; monsterTarget.cooldowns = mentorCooldowns;
            await applyAdvancedStatus('member', Number(affectedVictim.id), ice ? 'slow' : 'burn', ice ? 25 : 5, ice ? 1 : 2);
            log.push(`　&炽霜交替&${ice ? '冰霜减速25%(1)' : '火焰灼烧5%(2)'}。`);
          }
          if (skill.code === 'elementalist_storm_chain') { await applyAdvancedStatus('member', Number(affectedVictim.id), 'magic_shatter', 8, 2); log.push('　&雷暴导链&魔防降低8%(2)。'); }
          if (skill.code === 'elementalist_fourfold_resonance') { await applyAdvancedStatus('member', Number(affectedVictim.id), 'imbalance', 15, 1); log.push('　&四相共鸣&命中、闪避降低15%(1)。'); }
          if (skill.code === 'warlord_break_formation') { await applyAdvancedStatus('member', Number(affectedVictim.id), 'exposed', 12, 2); log.push('　&破阵军令&受到直击伤害提高12%(2)。'); }
        }
        if (mentorProfession === 'venomancer' && ['venomancer_serpent_kiss', 'venomancer_corrosion_mist', 'venomancer_venom_burst', 'venomancer_thousand_throat'].includes(skill?.code ?? '')) {
          const victimCooldowns = jsonObject(affectedVictim.cooldowns); victimCooldowns.advanced_mentor_venom_bonus = Number(mentorPassive.venomDamagePct ?? 0); affectedVictim.cooldowns = victimCooldowns;
        }
        if ((royalEnrage || skill?.code === 'habadragon_bloodjaw') && finalDealt > 0) { const oldHp = Number(monsterTarget.current_hp); const restored = Math.min(Number(monsterTarget.hp_max) - oldHp, targetHealingAmount(monsterTarget, Math.max(1, Math.floor(finalDealt * (royalEnrage ? .4 : .35))))); monsterTarget.current_hp += restored; if (restored) log.push(`&${royalEnrage ? '狂暴吸血' : '裂颚汲战'}&恢复 ${restored} HP(${oldHp}→${monsterTarget.current_hp})`); }
        if (skill?.code === 'necromancer_soul_drain' && finalDealt > 0) { const oldBossHp = Number(monsterTarget.current_hp); const restored = Math.min(Number(monsterTarget.hp_max) - oldBossHp, targetHealingAmount(monsterTarget, Math.max(1, Math.floor(finalDealt * .55)))); monsterTarget.current_hp += restored; if (restored) log.push(`&灵魂汲取&恢复 ${restored} HP(${oldBossHp}→${monsterTarget.current_hp})`); }
      }
      if (templateCode === 'gruen_mountainheart' && skill?.code === 'gruen_corequake') {
        if (Number(cooldowns.boss_component_gruen_horn_charge ?? 0) > 0) log.push('　$崩岳角鸣$镇脉之角将蓄能尽数灌入山心崩震！');
        delete cooldowns.boss_component_gruen_horn_charge; monsterTarget.cooldowns = cooldowns;
      }
      if (templateCode === 'valk_forge_overseer' && skill) {
        const bellowsAlive = targets.some(target => !target.is_defeated && bossComponentDefinition(target)?.key === 'valk_bellows' && componentBodyId(target) === Number(monsterTarget.id));
        if (bellowsAlive && ['valk_slag_brand', 'valk_anvil_sentence'].includes(skill.code)) {
          cooldowns.regional_valk_heat = Math.min(3, Math.max(0, Number(cooldowns.regional_valk_heat ?? 0)) + 1);
          if (Number(cooldowns.regional_valk_heat) === 2) {
            cooldowns.boss_component_valk_bellows_charge = 2;
            log.push('　$满压鼓风$【瓦尔克·赤炉风箱】节叶完全张开，炉温已达 2；下个敌方行动前击破可引发爆压反冲。');
          }
          monsterTarget.cooldowns = cooldowns;
          log.push(`　$炉温$瓦尔克的炉温升至 ${cooldowns.regional_valk_heat}/3。`);
        }
        if (skill.code === 'valk_furnace_overdrive') {
          delete cooldowns.regional_valk_overdrive_ready;
          delete cooldowns.regional_valk_overdrive_heat;
          monsterTarget.cooldowns = cooldowns;
        }
      }
      // 合体期由哈巴龙完成主技能后，国王在同一行动内追加王令雷击；不额外占用国王回合。
      if (fusedKingbeast && kingbeastRole(monsterTarget) === 'dragon' && skill && ['habadragon_royal_charge', 'habadragon_royal_stomp', 'habadragon_royal_cataclysm_trample'].includes(skill.code)) {
        const king = kingbeastCores().find(target => kingbeastRole(target) === 'king');
        if (king && !king.is_defeated) {
          const kingStats = monsterCombatStats(king); const commandTargets = skill.code === 'habadragon_royal_charge' ? [victim] : affected;
          const basePct = skill.code === 'habadragon_royal_charge' ? ((effectValue('member', Number(victim.id), 'slow') > 0 || effectValue('member', Number(victim.id), 'bind') > 0) ? 65 : 42) : skill.code === 'habadragon_royal_stomp' ? 32 : 58;
          log.push(`　$${skill.code === 'habadragon_royal_charge' ? '破阵王令' : skill.code === 'habadragon_royal_stomp' ? '滞敌王令' : '雷震王令'}$王旗引下追随雷击。`);
          for (const commandVictim of commandTargets.filter(member => !member.is_defeated)) {
            const commandModifiers = Number(commandVictim.id) === Number(victim.id) ? victimModifiers : await modifiersFor(connection, Number(commandVictim.id)); const pressuredKingStats = monsterCombatStatsForPlayer(king, Number(commandVictim.level));
            const magicDefenseReduction = effectValue('member', Number(commandVictim.id), 'magic_shatter');
            const commandStrike = resolveStrike(kingStats.magicAttack * basePct / 100, Number(commandVictim.magic_defense) * (1 + commandModifiers.magicDefensePct / 100) * (1 - Math.min(90, magicDefenseReduction) / 100), pressuredKingStats.accuracy, Number(commandVictim.evasion), pressuredKingStats.crit, Number(commandVictim.crit_resist_bp), pressuredKingStats.critDamage, Number(commandVictim.crit_damage_reduction_bp), false, false, 0, 0, 1, strikeCorrections(undefined,ruleUnit('member', Number(commandVictim.id))));
            if (!commandStrike.hit) { log.push(`　➥${combatUnitLabel(commandVictim)}闪避了王令雷击`); continue; }
            const elemental = elementalMultiplier(king.element_mastery_json, commandVictim.element_resistance_json, '雷'); const damageReduction = Math.min(90, commandModifiers.magicDamageReductionPct + commandModifiers.damageReductionPct); const oldHp = Number(commandVictim.current_hp); const dealt = directDamageVariance(Math.max(1, Math.floor(commandStrike.damage * elemental * weatherElementMultiplier('雷') * (1 - damageReduction / 100)))); const shield = await absorbRuleShield(connection, session.combat_id, 'member', Number(commandVictim.id), Number(commandVictim.hp_max), dealt); const hpDamage = dealt - shield.absorbed; commandVictim.current_hp = Math.max(0, oldHp - hpDamage); if (!commandVictim.current_hp) commandVictim.is_defeated = 1;talentRecordEnemyDamage(ruleUnit('target',Number(king.id)),ruleUnit('member',Number(commandVictim.id)),Math.max(0,oldHp-Number(commandVictim.current_hp)));
            log.push(`　➥${affinityTag(1, elemental)}对${combatUnitLabel(commandVictim)}造成 ${dealt} 点雷属性魔法伤害${lifeShieldAbsorptionText(shield)}(${oldHp}→${commandVictim.current_hp})`);
          }
        }
      }
      if (templateCode === 'goblin_bomber' && skill?.code === 'goblin_volatile_flask' && !monsterTarget.is_defeated) {
        const blastDamage = Math.max(1, Math.floor(Number(monster.hpMax) * .40)); const oldHp = Number(monsterTarget.current_hp); const shield = await absorbRuleShield(connection, session.combat_id, 'target', Number(monsterTarget.id), Number(monsterTarget.hp_max), blastDamage); const hpDamage = blastDamage - shield.absorbed;
        monsterTarget.current_hp = Math.max(0, oldHp - hpDamage); if (!monsterTarget.current_hp) monsterTarget.is_defeated = 1;
        log.push('　➥自爆兵被爆燃反噬，损失 ' + blastDamage + ' HP' + lifeShieldAbsorptionText(shield) + '(' + oldHp + '→' + monsterTarget.current_hp + ')。');
      }
    }
    } finally { if(talentActor){await talentEndAction(rules,talentActor);if(!extraTurn)await talentTransferBuff(rules,talentActor);} }
  }
  const talentBattleEnded = targets.every(target=>target.is_defeated) || members.every(member=>member.is_defeated) || aliveMembers.every(member=>(jsonObject(member.pending_action) as unknown as PendingAction).type==='escape');
  if(talentBattleEnded)for(const unit of rules.units)talentFinishFire(unit);
  for (const pet of combatAutomatons) { const owner = members.find(member => Number(member.id) === pet.ownerId); if (!owner || owner.is_defeated) pet.battle.exited = true; }
  await appendAutomatonBattleQuotes(connection, session.combat_id, combatAutomatons, log, targets.every(target => target.is_defeated));
  const hiddenNames = rules.units.filter(unit => unit.side === 'target' && unit.state.memory.hiddenLogTurn === Number(session.turn_no)).map(unit => unit.name);
  log.splice(0, log.length, ...maskRuleBattleLog(log, hiddenNames, members.map(member => member.name)));
  const awaitingBonus = members.some(member => !member.is_defeated && Number(jsonObject(member.cooldowns).__bonusAction));
  if (!awaitingBonus) { await alchemyEndTurn(rules); await hiddenEndTurn(rules); rules.end(); }
  await persistTalentBattle(connection,rules,members,targets);
  await saveCombatAutomatons(connection, session.combat_id, combatAutomatons);
  const sessionCooldowns = jsonObject(session.cooldowns); if (awaitingBonus) sessionCooldowns.__bonusPhase = true; else delete sessionCooldowns.__bonusPhase;
  await connection.execute('UPDATE combat_sessions SET cooldowns=? WHERE id=?', [JSON.stringify(sessionCooldowns), session.combat_id]);
  for (const target of targets) {
    const cooldowns = jsonObject(target.cooldowns); for (const [code, turns] of Object.entries(cooldowns)) {
      if (awaitingBonus) continue;
      if (code.startsWith('epic_') || code.startsWith('__')) continue;
      if (code.startsWith('regional_')) continue;
      if (code.startsWith('boss_component_')) {
        if (code.endsWith('_broken') || code.endsWith('_at') || code.endsWith('_target') || code.endsWith('_last_active_turn') || code === 'boss_component_break_resolved') continue;
        cooldowns[code] = Math.max(0, Number(turns) - 1); continue;
      }
      if (code.startsWith('heritage_round_')) { delete cooldowns[code]; continue; }
      if (code === alchemyBossResistanceKey || code === 'wolfking_rotation' || code === 'wolfking_shadow_curse_used' || code === 'boss_rotation' || code === 'dungeon_phase_used' || code === 'goblin_colonel_rotation' || code === 'goblin_colonel_combo' || code === 'goblin_colonel_phase_60' || code === 'ga_rotation' || code === 'ga_phase_60' || code === 'ga_phase_30' || code === 'surface_boss_rotation' || code === 'advanced_mentor_resource' || code === 'advanced_mentor_rotation' || code.startsWith('boss_phase_') || code.startsWith('surface_boss_phase_')) continue;
      cooldowns[code] = Math.max(0, Number(turns) - 1);
    }
    await connection.execute('UPDATE monster_spawns SET current_hp=?,defeated_at=IF(?,NOW(),defeated_at) WHERE id=?', [target.current_hp, target.is_defeated ? 1 : 0, target.id]);
    await connection.execute('UPDATE combat_targets SET current_mp=?,cooldowns=?,is_defeated=? WHERE session_id=? AND spawn_id=?', [target.current_mp, JSON.stringify(cooldowns), target.is_defeated ? 1 : 0, session.combat_id, target.id]);
  }
  for (const target of targets) if (session.mode !== 'spar' && !canAppraiseTarget(appraisal, Number(target.level))) for (let index = 0; index < log.length; index += 1) {
    if (!log[index].includes(target.name)) continue;
    log[index] = log[index].replaceAll(target.name, '???').replace(/(损失|恢复) \d+ HP\(\d+→\d+\)/g, '$1 ??? HP(???→???)');
  }
  for (const member of members) {
    const cooldowns = jsonObject(member.cooldowns); for (const [code, turns] of Object.entries(cooldowns)) {
      if (awaitingBonus) continue;
      if (code.startsWith('epic_') || code.startsWith('__')) continue;
      if (code === 'device_rocket_boost' || code === 'device_inverse_buffer_triggered') continue;
      if (code.startsWith('regional_')) continue;
      if (code === 'boss_component_gruen_arm_press_until' || code === 'boss_component_valk_chain_execute_at') continue;
      if (['advanced_elementalist_cycle', 'advanced_spellblade_action', 'advanced_hunt_source', 'advanced_taunt_source', 'advanced_guard_source', 'advanced_aegis_barrier_source', 'advanced_mentor_venom_bonus'].includes(code)) continue;
      if (code === 'advanced_aegis_barrier_turns') { const next = Math.max(0, Number(turns) - 1); if (next) cooldowns[code] = next; else { delete cooldowns[code]; delete cooldowns.advanced_aegis_barrier_source; } continue; }
      if (code === 'advanced_bulwark_hits') { if (!cooldowns.advanced_bulwark_mountain) delete cooldowns[code]; continue; }
      if (code.startsWith('advanced_')) { const next = Math.max(0, Number(turns) - 1); if (next) cooldowns[code] = next; else { delete cooldowns[code]; if (code === 'advanced_bulwark_mountain') delete cooldowns.advanced_bulwark_hits; } continue; }
      if (code.startsWith('heritage_round_')) { delete cooldowns[code]; continue; }
      if (code.startsWith('heritage_once_') || code === 'heritage_spellblade_support' || code === 'heritage_spellblade_damage') continue;
      cooldowns[code] = Math.max(0, Number(turns) - 1);
    }
    await connection.execute('UPDATE combat_members SET current_hp=?,current_mp=?,cooldowns=?,is_defeated=?,pending_action=NULL WHERE session_id=? AND character_id=?', [member.current_hp, member.current_mp, JSON.stringify(cooldowns), member.is_defeated ? 1 : 0, session.combat_id, member.id]);
  }
  if ((session.mode === 'spar' || session.mode === 'story') && (targets.every(target => target.is_defeated) || members.every(member => member.is_defeated) || aliveMembers.every(member => (jsonObject(member.pending_action) as unknown as PendingAction).type === 'escape'))) {
    const result = targets.every(target => target.is_defeated) ? 'victory' : members.every(member => member.is_defeated) ? 'defeat' : 'escaped';
    return { ended: true, waiting: false, log: log.join('\n'), settlement: await finishNpcSparring(connection, session.combat_id, result) };
  }
  if (aliveMembers.every(member => (jsonObject(member.pending_action) as unknown as PendingAction).type === 'escape')) {
    await connection.execute('UPDATE combat_sessions SET state=\'escaped\' WHERE id=?', [session.combat_id]);
    await clearSummonedTargets(connection, session.combat_id);
    await clearCombatSpirits(connection, session.combat_id);
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
    if(targets.every(target=>!isCityPursuit(target)&&!isBossTestMonster(target)&&!isAdvancedProfessionTrialMonster(target)))await achievementBattleOutcome(connection,session.combat_id,'escape',members,targets.filter(target=>!isSummonedMonster(target)&&!isBossComponent(target)));
    return { ended: true, waiting: false, log: `${log.join('\n')}\n\n队伍一同撤离了战斗。` };
  }
  if(targets.length&&targets.every(target=>!isCityPursuit(target)&&!isBossTestMonster(target)&&!isAdvancedProfessionTrialMonster(target)))achievementCombatObserved(connection,session.combat_id,members);
  const victoryTargets = targets.filter(target => !isBossComponent(target));
  if (victoryTargets.length && victoryTargets.every(target => target.is_defeated)) {
    await clearSummonedTargets(connection, session.combat_id);
    const settlement = await finishPartyVictory(connection, session.combat_id, members, targets); await persistBattleMembers(connection, members); const clearedDungeon = await closeDungeonForBossSpawns(connection, victoryTargets.map(target => Number(target.id)),members);
    return { ended: true, waiting: false, log: `${log.join('\n')}${clearedDungeon ? '\n\n地下迷宫的最终 Boss 已被攻略。迷宫将在两小时后重构，探索者已被送回入口。' : ''}`, settlement, ambushSessionId: session.combat_id };
  }
  if (members.every(member => member.is_defeated)) { if(targets.every(target=>!isCityPursuit(target)&&!isBossTestMonster(target)&&!isAdvancedProfessionTrialMonster(target)))await achievementBattleOutcome(connection,session.combat_id,'defeat',members,targets.filter(target=>!isSummonedMonster(target)&&!isBossComponent(target))); await connection.execute('UPDATE combat_sessions SET state=\'defeat\' WHERE id=?', [session.combat_id]); await clearSummonedTargets(connection, session.combat_id); await clearCombatSpirits(connection, session.combat_id); const ambushWaiting = await prepareBossAmbushHandoff(connection, session.combat_id, targets); if (!ambushWaiting) await restoreLivingCombatTargets(connection, session.combat_id, targets); const pursuitIds = targets.filter(target => isCityPursuit(target)).map(target => target.id); const pursuitCharacterIds = [...new Set(targets.filter(target => isCityPursuit(target)).map(target => Number(cityPursuitTrait(target)?.pursuit_target_id ?? 0)).filter(Boolean))]; if (pursuitIds.length) await connection.execute(`UPDATE monster_spawns SET current_hp=0,defeated_at=NOW() WHERE id IN (${pursuitIds.map(() => '?').join(',')})`, pursuitIds); if (pursuitCharacterIds.length) await connection.execute(`DELETE FROM city_pursuit_tracks WHERE city_region_id=? AND character_id IN (${pursuitCharacterIds.map(() => '?').join(',')})`, [Number(members[0]?.current_region_id ?? 0), ...pursuitCharacterIds]); await persistBattleMembers(connection, members, true); const pursuitSettlements = await Promise.all(pursuitCharacterIds.map(characterId => settleCityPursuitDefeat(connection, characterId, Number(members[0]?.current_region_id ?? 0)))); const evacuated = await evacuateDungeonDefeat(connection, members, targets); await consumeBattleBuffs(connection, members); return { ended: true, waiting: false, log: log.join('\n'), settlement: `战败结算\n${pursuitSettlements.map(result => result.text).filter(Boolean).join('\n') || '队伍战败，按各自的天赋与接引记录开始休息；当前生命可在角色状态查看。'}${evacuated ? '\n破魔传送器被强制触发，你们已被送回地下迷宫入口外，并陷入昏迷。' : ''}`, ambushSessionId: ambushWaiting ? session.combat_id : undefined }; }
  if (!awaitingBonus) await connection.execute('UPDATE combat_sessions SET turn_no=turn_no+1 WHERE id=?', [session.combat_id]);
  return { ended: false, waiting: false, log: log.join('\n') };
};
export const combatAction = async (qqUserId: string, action: Exclude<PendingAction['type'], 'device_charge'>, slot?: number, skillId?: number, itemId?: number, deviceSkillCode?: string, targetKind?: 'member' | 'target', targetId?: number, automaticChant = false, hiddenTicket?: HiddenTicket, hiddenAutomatic = false) => withTransaction(connection => combatActionInTransaction(connection, qqUserId, action, slot, skillId, itemId, deviceSkillCode, targetKind, targetId, automaticChant, hiddenTicket, hiddenAutomatic));


/** 吟唱是已确认的行动；此入口从不读取或写入自动战斗设置。 */
export const continueCombatChant = async (qqUserId: string) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { qq_user_id: string; cooldowns: unknown })[]>(`SELECT p.qq_user_id,cm.cooldowns FROM combat_members mine
    JOIN combat_sessions cs ON cs.id=mine.session_id AND cs.state='active'
    JOIN combat_members cm ON cm.session_id=cs.id AND cm.is_defeated=0 AND cm.pending_action IS NULL
    JOIN characters c ON c.id=cm.character_id JOIN players p ON p.id=c.player_id
    WHERE mine.character_id=? AND JSON_EXTRACT(cm.cooldowns,'$.__rules.cast') IS NOT NULL
      AND (JSON_EXTRACT(cs.cooldowns,'$.__bonusPhase') IS NULL OR JSON_EXTRACT(cm.cooldowns,'$.__bonusAction')=1) ORDER BY cm.character_id`, [character.id]);
  const next = rows[0]; const cast = readRuleState(jsonObject(next?.cooldowns).__rules).cast;
  if (!next || !cast) return null;
  const [kind, id] = cast.target.split(':');
  return combatAction(next.qq_user_id, 'skill', undefined, cast.skillId, undefined, undefined, kind === 'member' ? 'member' : 'target', Number(id), true);
};

const settleForcedCombatDefeat = async (connection: PoolConnection, sessionId: string) => {
  const [sessionRows] = await connection.execute<RowDataPacket[]>('SELECT mode FROM combat_sessions WHERE id=? FOR UPDATE', [sessionId]);
  if (sessionRows[0]?.mode === 'spar' || sessionRows[0]?.mode === 'story') return { ambushWaiting: false, settlement: await finishNpcSparring(connection, sessionId, 'timeout') };
  const members = await combatMembers(connection, sessionId); const targets = await combatTargets(connection, sessionId);
  await connection.execute("UPDATE combat_sessions SET state='defeat' WHERE id=? AND state='active'", [sessionId]);
  await clearSummonedTargets(connection, sessionId);
  await clearCombatSpirits(connection, sessionId);
  const ambushWaiting = await prepareBossAmbushHandoff(connection, sessionId, targets);
  if (!ambushWaiting) await restoreLivingCombatTargets(connection, sessionId, targets);
  const pursuitIds = targets.filter(target => isCityPursuit(target)).map(target => target.id);
  if (pursuitIds.length) await connection.execute(`UPDATE monster_spawns SET current_hp=0,defeated_at=NOW() WHERE id IN (${pursuitIds.map(() => '?').join(',')})`, pursuitIds);
  const pursuitCharacterIds = [...new Set(targets.filter(target => isCityPursuit(target)).map(target => Number(cityPursuitTrait(target)?.pursuit_target_id ?? 0)).filter(Boolean))];
  if (pursuitCharacterIds.length) await connection.execute(`DELETE FROM city_pursuit_tracks WHERE city_region_id=? AND character_id IN (${pursuitCharacterIds.map(() => '?').join(',')})`, [Number(members[0]?.current_region_id ?? 0), ...pursuitCharacterIds]);
  await persistBattleMembers(connection, members, true);
  const pursuitSettlements = await Promise.all(pursuitCharacterIds.map(characterId => settleCityPursuitDefeat(connection, characterId, Number(members[0]?.current_region_id ?? 0))));
  const evacuated = await evacuateDungeonDefeat(connection, members, targets);
  await consumeBattleBuffs(connection, members);
  return {
    ambushWaiting,
    settlement: `战败结算\n${pursuitSettlements.map(result => result.text).filter(Boolean).join('\n') || '队伍战败，按各自的天赋与接引记录开始休息；当前生命可在角色状态查看。'}${evacuated ? '\n破魔传送器被强制触发，你们已被送回地下迷宫入口外，并陷入昏迷。' : ''}`
  };
};

/** 自动战斗超过安全回合数时，以普通战败流程收束会话，避免无限计算占用连接池。 */
export const forceAutoBattleDefeat = async (qqUserId: string, reason = '自动战斗已达到 100 回合上限，为避免战斗持续占用系统资源，队伍判定为战败。') => withTransaction(async connection => {
  const character = await characterFor(qqUserId); const session = await activeCombatFor(connection, Number(character.id));
  await assertNoNegotiation(connection, Number(character.id));
  if (!session) throw new Error('当前不在战斗中。');
  const result = await settleForcedCombatDefeat(connection, session.combat_id);
  return {
    ended: true as const,
    waiting: false as const,
    log: reason,
    settlement: result.settlement,
    ambushSessionId: result.ambushWaiting ? session.combat_id : undefined
  };
});

/** 三分钟内没有任何有效战斗回应时，按战败收束以释放怪物占用。 */
export const settleInactiveCombatSessions = async () => withTransaction(async connection => {
  const [expired] = await connection.execute<RowDataPacket[]>("SELECT n.id,n.battle_id,p.qq_user_id FROM negotiation_sessions n JOIN characters c ON c.id=n.owner_id JOIN players p ON p.id=c.player_id WHERE n.state IN ('active','preview') AND n.expires_at<=NOW() ORDER BY n.expires_at LIMIT 50 FOR UPDATE");
  for (const session of expired) {
    await closeNegotiationSession(connection, String(session.id), 'expired');

  }
  const [sessions] = await connection.execute<(RowDataPacket & { id: string })[]>(`SELECT id FROM combat_sessions
    WHERE state='active' AND last_action_at<=DATE_SUB(NOW(),INTERVAL ${combatInactivityMinutes} MINUTE)
      AND NOT EXISTS (SELECT 1 FROM negotiation_sessions n WHERE n.battle_id=combat_sessions.id AND n.state='active')
    ORDER BY last_action_at ASC LIMIT 50 FOR UPDATE`);
  for (const session of sessions) await settleForcedCombatDefeat(connection, session.id);
  return sessions.length;
});

export const createParty = async (qqUserId: string, name?: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId, connection); await assertNoNegotiation(connection, Number(character.id));
  const [existing] = await connection.execute<RowDataPacket[]>('SELECT party_id FROM party_members WHERE character_id=? FOR UPDATE', [character.id]);
  if (existing.length) throw new Error('你已经在一个队伍中。');
  const id = randomUUID();
  await connection.execute('INSERT INTO parties (id,name,leader_character_id) VALUES (?,?,?)', [id, String(name ?? `${character.name}的队伍`).trim().slice(0, 32) || `${character.name}的队伍`, character.id]);
  await connection.execute('INSERT INTO party_members (party_id,character_id) VALUES (?,?)', [id, character.id]); recordAchievement(connection,Number(character.id),['ACH_G01']);
  return id;
});

export const joinParty = async (qqUserId: string, leaderQqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId, connection); await assertNoNegotiation(connection, Number(character.id));
  const [own] = await connection.execute<RowDataPacket[]>('SELECT party_id FROM party_members WHERE character_id=? FOR UPDATE', [character.id]);
  if (own.length) throw new Error('你已经在一个队伍中。');
  const byPartyId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(leaderQqUserId);
  const [leaders] = await connection.execute<(RowDataPacket & { party_id: string; pos_x: number; pos_y: number; pos_z: number })[]>(byPartyId
    ? 'SELECT p.id AS party_id,c.pos_x,c.pos_y,c.pos_z FROM parties p JOIN characters c ON c.id=p.leader_character_id WHERE p.id=? FOR UPDATE'
    : 'SELECT pm.party_id,c.pos_x,c.pos_y,c.pos_z FROM players p JOIN characters c ON c.player_id=p.id JOIN party_members pm ON pm.character_id=c.id JOIN parties pt ON pt.id=pm.party_id AND pt.leader_character_id=c.id WHERE p.qq_user_id=? FOR UPDATE', [leaderQqUserId]);
  if (!leaders[0]) throw new Error('未找到该队长的队伍。');
  const [negotiating] = await connection.execute<RowDataPacket[]>('SELECT n.character_id FROM negotiation_participants n JOIN party_members pm ON pm.character_id=n.character_id WHERE pm.party_id=? LIMIT 1 FOR UPDATE', [leaders[0].party_id]);
  if (negotiating.length) throw new Error('对方队伍正在交涉，请等待交涉结束后加入。');
  const [count] = await connection.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM party_members WHERE party_id=?', [leaders[0].party_id]);
  if (Number(count[0].total) >= 4) throw new Error('队伍已满（最多 4 人）。');
  await connection.execute('INSERT INTO party_members (party_id,character_id) VALUES (?,?)', [leaders[0].party_id, character.id]);
  await connection.execute('UPDATE characters SET pos_x=?,pos_y=?,pos_z=? WHERE id=?', [leaders[0].pos_x, leaders[0].pos_y, leaders[0].pos_z, character.id]);
  recordAchievement(connection,Number(character.id),['ACH_G01']);
  return Number(count[0].total) + 1;
});

export const leaveParty = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId, connection); await assertNoNegotiation(connection, Number(character.id)); const [rows] = await connection.execute<(RowDataPacket & { party_id: string; leader_character_id: number })[]>('SELECT pm.party_id,p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=? FOR UPDATE', [character.id]); const party = rows[0];
  if (!party) throw new Error('你不在任何队伍中。');
  if (Number(party.leader_character_id) === Number(character.id)) { const [members] = await connection.execute<(RowDataPacket & { character_id: number })[]>('SELECT character_id FROM party_members WHERE party_id=? AND character_id<>? ORDER BY joined_at,character_id FOR UPDATE', [party.party_id, character.id]); if (members[0]) await connection.execute('UPDATE parties SET leader_character_id=? WHERE id=?', [members[0].character_id, party.party_id]); }
  await connection.execute('DELETE FROM party_members WHERE party_id=? AND character_id=?', [party.party_id, character.id]);
  await connection.execute('DELETE FROM parties WHERE id=? AND NOT EXISTS (SELECT 1 FROM party_members WHERE party_id=?)', [party.party_id, party.party_id]);
});

export const renameParty = async (qqUserId: string, name: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId, connection); await assertNoNegotiation(connection, Number(character.id)); const [rows] = await connection.execute<(RowDataPacket & { party_id: string; leader_character_id: number })[]>('SELECT pm.party_id,p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=? FOR UPDATE', [character.id]); if (!rows[0]) throw new Error('你不在任何队伍中。'); if (Number(rows[0].leader_character_id) !== Number(character.id)) throw new Error('只有队长可以修改队伍名。'); const value = name.trim().slice(0, 32); if (!value) throw new Error('队伍名不能为空。'); await connection.execute('UPDATE parties SET name=? WHERE id=?', [value, rows[0].party_id]);
});

export const transferPartyLeader = async (qqUserId: string, targetGameId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId, connection); await assertNoNegotiation(connection, Number(character.id)); const [rows] = await connection.execute<(RowDataPacket & { party_id: string; leader_character_id: number })[]>('SELECT pm.party_id,p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=? FOR UPDATE', [character.id]); if (!rows[0]) throw new Error('你不在任何队伍中。'); if (Number(rows[0].leader_character_id) !== Number(character.id)) throw new Error('只有队长可以委任队长。'); const [members] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT c.id FROM party_members pm JOIN characters c ON c.id=pm.character_id WHERE pm.party_id=? AND c.game_id=? FOR UPDATE', [rows[0].party_id, targetGameId]); if (!members[0]) throw new Error('该玩家不在你的队伍中。'); await connection.execute('UPDATE parties SET leader_character_id=? WHERE id=?', [members[0].id, rows[0].party_id]);
});

export const partyList = async () => { const pool = await getPool(); const [rows] = await pool.execute<(RowDataPacket & { id: string; name: string; leader_name: string; count: number })[]>('SELECT p.id,p.name,c.name AS leader_name,COUNT(pm.character_id) AS count FROM parties p JOIN characters c ON c.id=p.leader_character_id JOIN party_members pm ON pm.party_id=p.id GROUP BY p.id,p.name,c.name ORDER BY p.created_at DESC LIMIT 20'); return rows.map(row => ({ id: row.id, name: row.name, leaderName: row.leader_name, count: Number(row.count) })); };
export const partyMemberInfo = async (qqUserId: string, gameId: number) => { const character = await characterFor(qqUserId); const pool = await getPool(); const [rows] = await pool.execute<(RowDataPacket & { name: string; game_id: number; level: number; profession: string | null; advanced_profession_code: string | null })[]>('SELECT c.name,c.game_id,c.level,p.name AS profession,ap.profession_code AS advanced_profession_code FROM party_members own JOIN party_members member ON member.party_id=own.party_id JOIN characters c ON c.id=member.character_id LEFT JOIN profession_definitions p ON p.code=c.profession_code LEFT JOIN player_advanced_professions ap ON ap.character_id=c.id WHERE own.character_id=? AND c.game_id=? LIMIT 1', [character.id, gameId]); if (!rows[0]) throw new Error('该玩家不在你的队伍中。'); return { name: rows[0].name, gameId: Number(rows[0].game_id), level: Number(rows[0].level), profession: advancedProfessionByCode(rows[0].advanced_profession_code ?? '')?.name ?? rows[0].profession ?? '未选择' }; };

/** 交涉与开战共用一条事务，已付体力、玩家记忆与结算均不可拆分提交。 */
export const negotiateEncounter = async (qqUserId: string, requestedSpawnId: number, command: NegotiationCommand = { type: 'view' }): Promise<NegotiationResult> => withTransaction(async connection => {
  let character = await characterFor(qqUserId, connection);
  let members = await partyCombatants(connection, character);
  await connection.execute(`SELECT id FROM characters WHERE id IN (${members.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`, members.map(member => Number(member.id)));
  character = await characterFor(qqUserId, connection);
  // 先于旧结果回放检查，避免开战后旧赠礼按钮再次渲染持续交涉页。
  if (await activeCombatFor(connection, Number(character.id))) throw new NegotiationCombatError();
  const [parties] = await connection.execute<(RowDataPacket & { id: string; leader_character_id: number })[]>('SELECT p.id,p.leader_character_id FROM parties p JOIN party_members pm ON pm.party_id=p.id WHERE pm.character_id=? FOR UPDATE', [character.id]);
  members = await partyCombatants(connection, character);
  if (members.some(member => Number(member.current_region_id) !== Number(character.current_region_id) || Number(member.pos_x) !== Number(character.pos_x) || Number(member.pos_y) !== Number(character.pos_y) || Number(member.pos_z) !== Number(character.pos_z))) throw new Error('请等全体队友到达同一位置后再交涉。');
  const realMembers = members.filter(member => !member.npc_code);
  if (!realMembers.length || realMembers.length > 4) throw new Error('交涉队伍人数无效。');
  const ids = realMembers.map(member => Number(member.id)).sort((a, b) => a - b);
  const leaderId = Number(parties[0]?.leader_character_id ?? character.id);
  const [pvp] = await connection.execute<RowDataPacket[]>(`SELECT id FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id IN (${ids.map(() => '?').join(',')}) OR defender_character_id IN (${ids.map(() => '?').join(',')})) LIMIT 1 FOR UPDATE`, [...ids, ...ids]);
  if (pvp.length) throw new NegotiationCombatError();
  const replay = await readNegotiationReplay(connection, Number(character.id), command); if (replay) return replay;
  ensureActionAvailable(character);
  const [spawns] = await connection.execute<(SpawnRow & { code: string; defeated_at: Date | null })[]>(`SELECT s.id,s.template_id,t.code,t.name,t.monster_class,COALESCE(s.level,t.level) AS level,s.current_hp,s.defeated_at,s.traits_json,COALESCE(s.skill_sequence,t.skill_sequence) AS skill_sequence,${monsterAttributeColumns},t.experience,t.drops_json,t.weakness_json,t.resistance_json,t.element_mastery_json,t.element_resistance_json
    FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND ${visiblePursuitCondition('s')} ORDER BY s.id FOR UPDATE`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z, character.id, character.id, character.id, character.id, character.id]);
  let target = spawns.find(spawn => Number(spawn.id) === requestedSpawnId && !spawn.defeated_at);
  if (!target) throw new Error('目标已离开当前位置或已经结束遭遇。');
  if (isBossComponent(target)) target = spawns.find(spawn => Number(spawn.id) === Number(bossComponentTrait(target!)?.body_spawn_id) && !spawn.defeated_at);
  if (!target || isSummonedMonster(target)) throw new Error('临时召唤物不能独立交涉，请选择召唤它的本体。');
  const groupId = kingbeastTrait(target)?.groupId;
  if (groupId) target = spawns.find(spawn => kingbeastTrait(spawn)?.groupId === groupId && kingbeastRole(spawn) === 'king' && !spawn.defeated_at) ?? target;
  const primary = target;
  const peacefulTargets = spawns.filter(spawn => !spawn.defeated_at && (Number(spawn.id) === Number(primary.id) || Number(bossComponentTrait(spawn)?.body_spawn_id) === Number(primary.id) || Boolean(groupId && kingbeastTrait(spawn)?.groupId === groupId)));
  const [occupants] = await connection.execute<(RowDataPacket & { session_id: string })[]>(`SELECT ct.session_id FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=? AND cs.state='active' FOR UPDATE`, [primary.id]);
  if (occupants.length) throw new NegotiationCombatError();
  const story = await forestGuideStatusFor(connection, Number(character.id));
  if (story && story !== 'completed') throw new Error('请先完成当前初章剧情，剧情战斗需要实际战胜目标。');
  const trial = peacefulTargets.some(spawn => isAdvancedProfessionTrialMonster(spawn) || isBossTestMonster(spawn));
  const noLoot = trial || isCityPursuit(primary);
  const drops: NegotiationDrop[] = [];
  let capacity = 0;
  // 容量按完整表的期望估值；互斥条目保留权重，到结算时再选，翻页不能重掷。
  for (const spawn of peacefulTargets.filter(spawn => !isBossComponent(spawn) && !isSummonedMonster(spawn))) {
    for (const raw of bossSkyDustDrops(jsonArray(spawn.drops_json).map(jsonObject), spawn) as Array<Record<string, unknown> & { code?: string; chance?: number }>) {
      const code = resolvedDropCode(raw, Number(spawn.level)); if (!code) continue;
      const [items] = await connection.execute<(RowDataPacket & { item_category: string; trade_price: number; effect_json: unknown })[]>('SELECT item_category,trade_price,effect_json FROM item_definitions WHERE code=?', [code]);
      const value = items[0] ? negotiationReferenceValue({ code, ...items[0] }) : 0;
      const min = Math.max(1, Math.floor(Number(raw.min_quantity ?? raw.quantity ?? 1))); const max = Math.max(min, Math.floor(Number(raw.max_quantity ?? raw.quantity ?? min)));
      const chance = effectiveGoblinMaterialDropChance(spawn, raw);
      const traitBonus = percentBonus(traitList(spawn.traits_json), 'dropPct') / 100;
      capacity += Math.min(1, chance * (1 + traitBonus)) * (min + max) / 2 * value;
      drops.push({ code, chance: Number(raw.chance ?? 1), min, max, value, traitBonus, group: raw.exclusive_group ? `${spawn.id}:${raw.exclusive_group}` : undefined });
    }
  }
  const completionText = trial ? '和平结束不会完成击杀、转职或测试验收，请重新挑战完成目标。' : isCityPursuit(primary) ? '执法者离开也不会消除通缉、罚款或债务，本次不产生战利品。' : undefined;
  return runNegotiation(connection, { actorId: Number(character.id), leaderId, memberIds: ids, target: { id: Number(primary.id), code: primary.code, name: primary.name }, drops, capacity: Math.max(1, capacity), completionText }, command, {
    activate: async () => {
      for (const member of realMembers) ensureActionAvailable(member);
      const [busy] = await connection.execute<RowDataPacket[]>(`SELECT character_id FROM player_travels WHERE character_id IN (${ids.map(() => '?').join(',')}) UNION ALL SELECT character_id FROM player_resource_mining WHERE character_id IN (${ids.map(() => '?').join(',')})`, [...ids, ...ids]);
      if (busy.length) throw new Error('队伍中有人仍在行进或开采，请先结束当前活动。');
      return Object.fromEntries(await consumeEncounterStamina(connection, realMembers));
    },
    fight: async (eligibility, _sessionId, failed) => {
      await chooseTargetInTransaction(connection, qqUserId, Number(primary.id), false, undefined, eligibility);
      const result = await combatActionInTransaction(connection, qqUserId, 'attack', undefined, undefined, undefined, undefined, undefined, undefined, false, undefined, false, true);
      return `${failed ? '交涉失败！' : '交涉结束。'}全队错失一次行动，敌方先行。\n${result.log}${result.ended ? '\n本场战斗已结束。' : ''}`;
    },
    settle: async (state, eligibility, frozenDrops, sessionId) => {
      const lines: string[] = ['交涉成功！对方收起了敌意。'];
      const recipients = realMembers.filter(member => eligibility[String(member.id)]);
      const luck = new Map<number, number>(); const modifiers = new Map<number, CombatModifiers>(); const gains = new Map<number, string[]>();
      for (const member of recipients) { luck.set(Number(member.id), (await hiddenAttributesFor(connection, Number(member.id))).luck); modifiers.set(Number(member.id), await modifiersFor(connection, Number(member.id))); gains.set(Number(member.id), []); }
      const factor = teamLuckMultiplier([...luck.values()]) * moodDropMultiplier(state.mood);
      const partyDrop = ({ 1: 0, 2: .6, 3: 1, 4: 1.5 } as Record<number, number>)[recipients.length] ?? 0;
      const partyXp = ({ 1: 0, 2: .1, 3: .2, 4: .35 } as Record<number, number>)[recipients.length] ?? 0;
      if (!trial) for (const spawn of peacefulTargets) await connection.execute("INSERT INTO monster_reward_settlements (spawn_id,channel,session_id) VALUES (?,'negotiation',?)", [spawn.id, sessionId]);
      if (!noLoot) {
        const totalXp = peacefulTargets.filter(spawn => !isBossComponent(spawn) && !isSummonedMonster(spawn)).reduce((sum, spawn) => sum + Math.max(1, Math.floor(Number(spawn.experience) * .2)), 0);
        for (const member of recipients) {
          const gain = await awardRealmExperience(connection, member, totalXp * (1 + partyXp) * modifiers.get(Number(member.id))!.experienceMultiplier);
          if (gain.gainedPoints) await recalculateCharacterStats(connection, Number(member.id));
          gains.get(Number(member.id))!.push(gain.realmLocked ? realmEnergyDissipationText : `经验 ${gain.experience}${gain.gainedPoints ? `，升级至 Lv.${gain.level}` : ''}`);
        }
        const generated = recipients.length ? scaledDropEntries(frozenDrops, drop => {
          const reference = recipients[random(0, recipients.length - 1)];
          return drop.chance * .2 * (1 + (drop.traitBonus ?? 0) + partyDrop) + modifiers.get(Number(reference.id))!.dropBonus;
        }, factor) : [];
        for (const drop of generated) {
          const quantity = random(drop.min, drop.max);
          for (let count = 0; count < quantity; count++) {
            const recipient = weightedRecipient(recipients, member => luck.get(Number(member.id)) ?? 0);
            const [items] = await connection.execute<(RowDataPacket & { id: number; name: string; item_type: string })[]>('SELECT id,name,item_type FROM item_definitions WHERE code=?', [drop.code]); const item = items[0]; if (!item) continue;
            const coinValue = ({ copper_coin: 1, silver_coin: 100, gold_coin: 10000 } as Record<string, number>)[drop.code] ?? 0;
            let amount = 1;
            if (coinValue) { amount = 1; await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [coinValue * amount, recipient.id]); }
            else if (['equipment', 'device'].includes(item.item_type)) await connection.execute('INSERT INTO player_item_instances (character_id,item_id) VALUES (?,?)', [recipient.id, item.id]);
            else await grantInventory(connection, Number(recipient.id), Number(item.id), { unbound: 1, trade: 0, personal: 0 });
            await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [recipient.id, item.id]);
            if (amount) gains.get(Number(recipient.id))!.push(`${item.name} ×${amount}`);
          }
        }
      }
      for (const member of realMembers) lines.push(`${member.name}：${noLoot ? '本次不产生奖励' : !eligibility[String(member.id)] ? '体力不足，未获得奖励' : gains.get(Number(member.id))?.join('、') || '未获得物品'}`);
      if (completionText) lines.push(completionText);
      const spawnIds = peacefulTargets.map(spawn => Number(spawn.id));
      if (!trial) await connection.execute(`UPDATE monster_spawns SET current_hp=0,defeated_at=NOW() WHERE id IN (${spawnIds.map(() => '?').join(',')})`, spawnIds);
      if (!trial && peacefulTargets.length > 1) {
        const [current] = await connection.execute<Array<RowDataPacket & Pick<CombatMemberRow, 'id' | 'npc_code' | 'stamina' | 'stamina_eligible'>>>(`SELECT id,npc_code,stamina,0 AS stamina_eligible FROM characters WHERE id IN (${ids.map(() => '?').join(',')}) FOR UPDATE`, ids);
        for (const member of current) member.stamina_eligible = eligibility[String(member.id)] ? 1 : 0;
        await consumeVictoryStamina(connection, current, peacefulTargets.filter(spawn => !isBossComponent(spawn) && !isSummonedMonster(spawn)).length);
      }
      if (trial) for (const member of realMembers) await connection.execute('INSERT INTO encounter_escape_tokens (character_id,region_id,pos_x,pos_y,pos_z) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE region_id=VALUES(region_id),pos_x=VALUES(pos_x),pos_y=VALUES(pos_y),pos_z=VALUES(pos_z)', [member.id, member.current_region_id, member.pos_x, member.pos_y, member.pos_z]);
      return lines.join('\n');
    }
  });
});
