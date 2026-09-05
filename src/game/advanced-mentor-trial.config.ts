import { calculateDerivedStats, equipmentQualityMultiplier, forgedAffixCap, forgedEquipmentBase, forgeRarityMultiplier } from './constants';
import { armorClassDefenseMultiplier, armorClassMobilityModifier } from './character.service';
import { applyEvolutionBaseStats } from './evolution.service';
import { applyWeaponMasteryStats } from './weapon-mastery.service';
import type { Allocation, DerivedStats } from './types';
import type { AdvancedProfession, InheritancePassiveDefinition } from './advanced-profession.config';
import { advancedResourceForProfession } from './advanced-resource.config';

type EvolutionBonus = Record<string, number>;
type WeaponType = '长剑' | '盾牌' | '法杖' | '法书' | '法球' | '匕首' | '拳刃';
type MasteryStatKey = 'physicalAttackPct' | 'magicAttackPct' | 'physicalDefensePct' | 'magicDefensePct' | 'accuracyPct' | 'critRatePct' | 'critDamagePct' | 'critResistPct' | 'critDamageReductionPct' | 'mpPct' | 'chantSpeedPct';
type MentorHand = { type: WeaponType; name: string };

type MentorProfile = {
  attributes: Allocation;
  growth: Allocation;
  mainHand: MentorHand;
  offhand: MentorHand;
  armor: '布甲' | '皮甲' | '轻甲' | '重甲' | '板甲';
  evolution: Array<{ name: string; effect: EvolutionBonus }>;
  rotation: string[];
  lowHealthSkill?: string;
};

export type AdvancedMentorTrialBuild = {
  version: 2;
  professionCode: string;
  equipment: { level: 30; rarity: '传说'; quality: 100; weapon: string; offhand: string; armor: string; secondaryAffixes: string[]; mastery: string[] };
  evolution: Array<{ name: string; effect: EvolutionBonus }>;
  trainedAttributes: Allocation;
  stats: DerivedStats;
  passive: { name: string; effect: Record<string, number> };
  inheritance: { name: string; values: number[] } | null;
  resource: { code: string; name: string } | null;
  rotation: string[];
  lowHealthSkill?: string;
};

const profiles: Record<string, MentorProfile> = {
  bulwark_guard: { attributes: { constitution: 40, spirit: 20, strength: 44, intelligence: 18, agility: 18, perception: 26 }, growth: { constitution: 1.2, spirit: .5, strength: 1.2, intelligence: .3, agility: .3, perception: .6 }, mainHand: { type: '长剑', name: '誓壁长剑' }, offhand: { type: '盾牌', name: '根脉塔盾' }, armor: '板甲', evolution: [{ name: '根脉骨铠', effect: { hpPct: 6, physicalDefensePct: 4, tenacityPct: 4 } }, { name: '守誓心室', effect: { hpPct: 4, critDamageReductionPct: 3 } }], rotation: ['bulwark_shieldwall_advance', 'sweeping_slash', 'bulwark_vicarious_guard', 'bulwark_immovable_mountain', 'bulwark_bastion_judgment'], lowHealthSkill: 'bulwark_immovable_mountain' },
  war_lord: { attributes: { constitution: 32, spirit: 22, strength: 48, intelligence: 20, agility: 24, perception: 30 }, growth: { constitution: .9, spirit: .5, strength: 1.3, intelligence: .4, agility: .6, perception: .8 }, mainHand: { type: '长剑', name: '军旗长剑' }, offhand: { type: '长剑', name: '凯旋副剑' }, armor: '重甲', evolution: [{ name: '战纹脊骨', effect: { physicalAttackPct: 5, hpPct: 3 } }, { name: '旌旗视野', effect: { accuracyPct: 4, speedPct: 3 } }], rotation: ['warlord_quake_command', 'piercing_thrust', 'warlord_break_formation', 'sweeping_slash', 'warlord_triumph_banner', 'warlord_hundred_battle_sweep'], lowHealthSkill: 'warlord_triumph_banner' },
  ironbreaker: { attributes: { constitution: 30, spirit: 18, strength: 52, intelligence: 18, agility: 24, perception: 34 }, growth: { constitution: .8, spirit: .3, strength: 1.4, intelligence: .3, agility: .6, perception: .9 }, mainHand: { type: '长剑', name: '裂隙长剑' }, offhand: { type: '盾牌', name: '断钢圆盾' }, armor: '轻甲', evolution: [{ name: '砺锋骨髓', effect: { physicalAttackPct: 5, critDamagePct: 4 } }, { name: '裂隙瞳孔', effect: { critRatePct: 4, accuracyPct: 3 } }], rotation: ['ironbreaker_armor_rend', 'sweeping_slash', 'ironbreaker_breaking_pursuit', 'piercing_thrust', 'ironbreaker_gap_execution', 'ironbreaker_steel_flash'] },
  elementalist: { attributes: { constitution: 20, spirit: 46, strength: 18, intelligence: 50, agility: 22, perception: 28 }, growth: { constitution: .4, spirit: 1.2, strength: .3, intelligence: 1.35, agility: .5, perception: .7 }, mainHand: { type: '法杖', name: '四相法杖' }, offhand: { type: '法书', name: '风暴法书' }, armor: '布甲', evolution: [{ name: '四相灵核', effect: { magicAttackPct: 6, mpPct: 5 } }, { name: '雷纹神经', effect: { speedPct: 4, tenacityPct: 3 } }], rotation: ['elementalist_cinderfrost_cycle', 'arcane_bolt', 'elementalist_storm_chain', 'elementalist_fourfold_resonance', 'elementalist_sky_sequence'] },
  spirit_summoner: { attributes: { constitution: 26, spirit: 50, strength: 18, intelligence: 46, agility: 20, perception: 28 }, growth: { constitution: .6, spirit: 1.35, strength: .3, intelligence: 1.2, agility: .4, perception: .7 }, mainHand: { type: '法杖', name: '灵巢法杖' }, offhand: { type: '法书', name: '灵契法书' }, armor: '布甲', evolution: [{ name: '共鸣胸腔', effect: { hpPct: 4, mpPct: 6 } }, { name: '灵巢器官', effect: { magicDefensePct: 4, tenacityPct: 4 } }], rotation: ['summoner_contract_spirit', 'arcane_bolt', 'summoner_spirit_tether', 'summoner_returning_veil', 'summoner_star_pact'], lowHealthSkill: 'summoner_returning_veil' },
  spellblade: { attributes: { constitution: 28, spirit: 38, strength: 34, intelligence: 44, agility: 28, perception: 30 }, growth: { constitution: .7, spirit: 1, strength: .9, intelligence: 1.15, agility: .7, perception: .75 }, mainHand: { type: '法杖', name: '相位法杖' }, offhand: { type: '法书', name: '术式法书' }, armor: '轻甲', evolution: [{ name: '咒钢骨板', effect: { physicalAttackPct: 4, magicAttackPct: 4 } }, { name: '相位髓鞘', effect: { speedPct: 4, evasionPct: 3 } }], rotation: ['arcane_bolt', 'spellblade_arcane_thrust', 'spellblade_phase_guard', 'spellblade_spellbreak_whirl', 'spellblade_starfire_duel'], lowHealthSkill: 'spellblade_phase_guard' },
  nightblade: { attributes: { constitution: 22, spirit: 22, strength: 38, intelligence: 20, agility: 52, perception: 44 }, growth: { constitution: .5, spirit: .4, strength: .95, intelligence: .4, agility: 1.35, perception: 1.15 }, mainHand: { type: '匕首', name: '夜痕匕首' }, offhand: { type: '拳刃', name: '黯影拳刃' }, armor: '皮甲', evolution: [{ name: '暮影虹膜', effect: { critRatePct: 5, evasionPct: 4 } }, { name: '静默神经', effect: { speedPct: 5, accuracyPct: 3 } }], rotation: ['nightblade_shadow_mark', 'backstab', 'nightblade_gap_stab', 'nightblade_crescent_throat', 'nightblade_silent_finale'] },
  venomancer: { attributes: { constitution: 24, spirit: 30, strength: 34, intelligence: 36, agility: 44, perception: 44 }, growth: { constitution: .55, spirit: .7, strength: .8, intelligence: .85, agility: 1.1, perception: 1.15 }, mainHand: { type: '匕首', name: '蛇吻匕首' }, offhand: { type: '拳刃', name: '毒腺拳刃' }, armor: '皮甲', evolution: [{ name: '滤毒胆囊', effect: { hpPct: 4, tenacityPct: 4 } }, { name: '蛇行反射', effect: { accuracyPct: 4, critRatePct: 3 } }], rotation: ['venomancer_serpent_kiss', 'toxic_edge', 'venomancer_corrosion_mist', 'venomancer_venom_burst', 'venomancer_thousand_throat'] },
  trickster_ranger: { attributes: { constitution: 24, spirit: 24, strength: 40, intelligence: 24, agility: 50, perception: 46 }, growth: { constitution: .55, spirit: .45, strength: .95, intelligence: .5, agility: 1.25, perception: 1.2 }, mainHand: { type: '匕首', name: '机关匕首' }, offhand: { type: '拳刃', name: '牵线拳刃' }, armor: '皮甲', evolution: [{ name: '风纹角膜', effect: { accuracyPct: 5, evasionPct: 3 } }, { name: '并列突触', effect: { speedPct: 4, tenacityPct: 3 } }], rotation: ['ranger_grapple_trap', 'wind_blade', 'ranger_weakness_survey', 'ranger_guiding_smoke', 'ranger_hundred_hunt'], lowHealthSkill: 'ranger_guiding_smoke' },
  saint_healer: { attributes: { constitution: 34, spirit: 52, strength: 18, intelligence: 42, agility: 20, perception: 28 }, growth: { constitution: .8, spirit: 1.35, strength: .3, intelligence: 1, agility: .4, perception: .65 }, mainHand: { type: '法书', name: '白枝法书' }, offhand: { type: '法球', name: '祈愈法球' }, armor: '布甲', evolution: [{ name: '回春腺', effect: { hpPct: 4, mpPct: 5 } }, { name: '白枝皮层', effect: { magicDefensePct: 5, tenacityPct: 3 } }], rotation: ['saint_healer_mending_prayer', 'sanctified_bolt', 'saint_healer_absolution_hand', 'saint_healer_resonant_mass', 'saint_healer_revival_sanctuary'], lowHealthSkill: 'saint_healer_revival_sanctuary' },
  aegis_priest: { attributes: { constitution: 46, spirit: 42, strength: 24, intelligence: 34, agility: 18, perception: 28 }, growth: { constitution: 1.2, spirit: 1.05, strength: .45, intelligence: .8, agility: .3, perception: .65 }, mainHand: { type: '法书', name: '壁垒法书' }, offhand: { type: '法球', name: '守誓法球' }, armor: '板甲', evolution: [{ name: '岩壳胎衣', effect: { hpPct: 6, physicalDefensePct: 5 } }, { name: '锚定髋骨', effect: { magicDefensePct: 4, critDamageReductionPct: 4 } }], rotation: ['aegis_watch_bastion', 'sanctified_bolt', 'aegis_shared_vow', 'aegis_luminous_echo', 'aegis_undying_dome'], lowHealthSkill: 'aegis_undying_dome' },
  dawn_inquisitor: { attributes: { constitution: 30, spirit: 48, strength: 20, intelligence: 46, agility: 22, perception: 32 }, growth: { constitution: .7, spirit: 1.2, strength: .35, intelligence: 1.2, agility: .45, perception: .8 }, mainHand: { type: '法书', name: '晨星法书' }, offhand: { type: '法球', name: '破晓法球' }, armor: '布甲', evolution: [{ name: '恒星肺叶', effect: { magicAttackPct: 6, mpPct: 4 } }, { name: '晨钟耳蜗', effect: { accuracyPct: 4, critRatePct: 3 } }], rotation: ['dawn_morning_mark', 'sanctified_bolt', 'dawn_exorcism_word', 'dawn_judgment_litany', 'dawn_daybreak_decree'] }
};

const addSecondary = (stats: DerivedStats, category: '武器' | '防具', key: keyof DerivedStats, ratio: number, count = 1) => {
  const cap = forgedAffixCap(category, key, 30, '传说');
  stats[key] += Math.floor(cap * equipmentQualityMultiplier(100) * ratio * count);
};

const weaponPrimary = (stats: DerivedStats, type: WeaponType, value: number) => {
  if (type === '盾牌') { stats.physicalDefense += Math.floor(value); stats.magicDefense += Math.floor(value * .5); return; }
  if (type === '法杖' || type === '法书' || type === '法球') { stats.magicAttack += Math.floor(value); return; }
  if (type === '匕首') { stats.physicalAttack += Math.floor(value * .9); stats.magicAttack += Math.floor(value * .9); return; }
  stats.physicalAttack += Math.floor(value);
};

const masteryRules: Record<WeaponType, { effect: Partial<Record<MasteryStatKey, number>>; text: string }> = {
  '长剑': { effect: { critRatePct: 80 }, text: '长剑精通：暴击属性+80%' },
  '盾牌': { effect: { critResistPct: 40, critDamageReductionPct: 40 }, text: '盾牌精通：暴免、暴抗属性各+40%' },
  '法杖': { effect: { critDamagePct: 80 }, text: '法杖精通：暴伤属性+80%' },
  '法书': { effect: { chantSpeedPct: 80 }, text: '法书精通：吟唱速度+80%' },
  '法球': { effect: { mpPct: 80 }, text: '法球精通：最大MP+80%' },
  '匕首': { effect: { accuracyPct: 80 }, text: '匕首精通：命中属性+80%' },
  '拳刃': { effect: { critRatePct: 40, critDamagePct: 40 }, text: '拳刃精通：暴击、暴伤属性各+40%' }
};

const masteryBonusesFor = (profile: MentorProfile) => {
  const bonus = { physicalAttackPct: 0, magicAttackPct: 0, physicalDefensePct: 0, magicDefensePct: 0, accuracyPct: 0, critRatePct: 0, critDamagePct: 0, critResistPct: 0, critDamageReductionPct: 0, mpPct: 0, chantSpeedPct: 0, details: [] as string[] };
  // 固定熟练 5、专注 6：副手精通无衰减，与玩家装备精通的最终档完全相同。
  for (const hand of [profile.mainHand, profile.offhand]) {
    if (bonus.details.some(detail => detail.startsWith(`${hand.type}精通：`))) continue;
    const rule = masteryRules[hand.type];
    for (const [key, value] of Object.entries(rule.effect) as Array<[MasteryStatKey, number]>) bonus[key] += value;
    bonus.details.push(rule.text);
  }
  return bonus;
};

const withLegendaryEquipment = (base: DerivedStats, profile: MentorProfile): { stats: DerivedStats; mastery: string[] } => {
  const result = { ...base };
  const primaryMultiplier = (forgeRarityMultiplier['传说'] ?? 1) * equipmentQualityMultiplier(100);
  const weaponValue = forgedEquipmentBase(30, '武器') * primaryMultiplier;
  const armorValue = forgedEquipmentBase(30, '防具') * primaryMultiplier;
  weaponPrimary(result, profile.mainHand.type, weaponValue);
  weaponPrimary(result, profile.offhand.type, weaponValue);
  result.physicalDefense += Math.floor(armorValue * 5 * armorClassDefenseMultiplier(profile.armor, 'physicalDefense'));
  result.magicDefense += Math.floor(armorValue * 5 * armorClassDefenseMultiplier(profile.armor, 'magicDefense'));
  // 固定副词条全部按 Lv.30 传说的正式上限与品质 100%计算，取 60%上限，避免试炼出现随机面板。
  addSecondary(result, '武器', 'accuracy', .6);
  addSecondary(result, '武器', 'critRateBp', .6);
  addSecondary(result, '武器', 'critDamageBp', .6);
  addSecondary(result, '防具', 'hpMax', .6, 2);
  addSecondary(result, '防具', 'evasion', .6);
  addSecondary(result, '防具', 'critResistBp', .6);
  addSecondary(result, '防具', 'tenacity', .6);
  addSecondary(result, '防具', 'speed', .6);
  for (const key of ['accuracy', 'evasion', 'speed'] as const) result[key] = Math.max(0, Math.floor(result[key] * (1 + armorClassMobilityModifier(profile.armor, key) * 5 / 100)));
  const mastery = masteryBonusesFor(profile);
  const withMastery = applyWeaponMasteryStats(result, mastery);
  for (const key of Object.keys(withMastery) as Array<keyof DerivedStats>) withMastery[key] = Math.max(0, Math.floor(withMastery[key]));
  return { stats: withMastery, mastery: mastery.details };
};

export const advancedMentorTrialBuild = (profession: AdvancedProfession, inheritance?: InheritancePassiveDefinition): AdvancedMentorTrialBuild => {
  const profile = profiles[profession.code];
  if (!profile) throw new Error(`未配置导师构筑：${profession.code}`);
  const trainedAttributes = Object.fromEntries(Object.entries(profile.attributes).map(([key, value]) => [key, Number(value) + Number(profile.growth[key as keyof Allocation]) * 29])) as Allocation;
  const evolutionBonus = profile.evolution.reduce<EvolutionBonus>((all, entry) => ({ ...all, ...Object.fromEntries(Object.entries(entry.effect).map(([key, value]) => [key, Number(all[key] ?? 0) + Number(value)])) }), {});
  const legendary = withLegendaryEquipment(applyEvolutionBaseStats(calculateDerivedStats(trainedAttributes), evolutionBonus), profile);
  const stats = legendary.stats;
  const passive = profession.passive.effect;
  stats.critRateBp = Math.floor(stats.critRateBp * (1 + Number(passive.critRatePct ?? 0) / 100));
  stats.critDamageBp = Math.floor(stats.critDamageBp * (1 + Number(passive.critDamagePct ?? 0) / 100));
  return {
    version: 2,
    professionCode: profession.code,
    equipment: { level: 30, rarity: '传说', quality: 100, weapon: `${profile.mainHand.name}（${profile.mainHand.type}）`, offhand: `${profile.offhand.name}（${profile.offhand.type}）`, armor: `${profile.armor}毕业套装`, secondaryAffixes: ['命中', '暴击', '暴伤', '生命', '闪避', '暴抗', '韧性', '速度'], mastery: legendary.mastery },
    evolution: profile.evolution,
    trainedAttributes,
    stats,
    passive: { name: profession.passive.name, effect: passive },
    inheritance: inheritance ? { name: inheritance.name, values: inheritance.own } : null,
    resource: advancedResourceForProfession(profession.code) ? { code: advancedResourceForProfession(profession.code)!.code, name: advancedResourceForProfession(profession.code)!.name } : null,
    rotation: profile.rotation,
    lowHealthSkill: profile.lowHealthSkill
  };
};

export const advancedMentorTrialTraits = (build: AdvancedMentorTrialBuild) => [
  { code: 'advanced_mentor_build', name: 'Lv.30传说毕业构筑', profession_code: build.professionCode, build },
  { code: 'advanced_mentor_equipment', name: '传说主副手与毕业套装', equipment: build.equipment },
  ...build.evolution.map(entry => ({ code: 'advanced_mentor_evolution', name: `定型进化·${entry.name}`, evolution: entry }))
];
