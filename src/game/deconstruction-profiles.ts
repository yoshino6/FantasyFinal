import { forgeMaterialValue } from './forge-material-values';
import { purifiedCraftMaterialValue } from './monster-crafting-material.service';

export const particleCodes = [
  'blood_residue', 'energy_ember', 'magic_unit',
  'wood_element_dust', 'metal_element_dust', 'water_element_dust', 'ice_element_dust',
  'fire_element_dust', 'thunder_element_dust', 'wind_element_dust', 'light_element_dust', 'dark_element_dust'
] as const;

export type ParticleCode = (typeof particleCodes)[number];
export type DeconstructionItem = {
  code: string;
  name: string;
  description?: string | null;
  item_category: string;
  item_type: string;
  trade_price?: number | string | null;
  rarity?: string | null;
  effect_json?: unknown;
};

type WeightedProfile = { kind: 'weighted'; weights: Partial<Record<ParticleCode, number>>; budget: number; proficiency: number };
type OrdinaryProfile = { kind: 'ordinary'; blood: number; ember: number; proficiency: number };
type MagicalBeastProfile = { kind: 'magical_beast'; proficiency: number };
type ForgeOutput = { code: ParticleCode; decay: number; limit: number };
type ForgeProfile = { kind: 'forge'; outputs: ForgeOutput[]; proficiency: number };
type SlimeProfile = { kind: 'slime'; element: ParticleCode; proficiency: number };
type MonsterProfile = { kind: 'monster'; weights: Partial<Record<ParticleCode, number>>; particleValue: number; magicChance: number; proficiency: number };
type FixedChanceProfile = { kind: 'fixed_chance'; outputs: Array<{ code: ParticleCode; chance: number }>; proficiency: number };
export type DeconstructionProfile = WeightedProfile | OrdinaryProfile | MagicalBeastProfile | ForgeProfile | SlimeProfile | MonsterProfile | FixedChanceProfile;

export type DeconstructionPreview = {
  code: ParticleCode;
  name: string;
  expected: number;
  min: number;
  max: number;
  rare: boolean;
};

export const particleNames: Record<ParticleCode, string> = {
  blood_residue: '血肉残渣', energy_ember: '能量余烬', magic_unit: '魔力微弧',
  wood_element_dust: '木元素微尘', metal_element_dust: '土元素微尘', water_element_dust: '水元素微尘',
  ice_element_dust: '冰元素微尘', fire_element_dust: '火元素微尘', thunder_element_dust: '雷元素微尘',
  wind_element_dust: '风元素微尘', light_element_dust: '光元素微尘', dark_element_dust: '暗元素微尘'
};

export const particleValues: Record<ParticleCode, number> = {
  blood_residue: 2, energy_ember: 2, magic_unit: 10,
  wood_element_dust: 3, metal_element_dust: 3, water_element_dust: 3, ice_element_dust: 3,
  fire_element_dust: 3, thunder_element_dust: 3, wind_element_dust: 3,
  light_element_dust: 5, dark_element_dust: 4
};

const rareParticles = new Set<ParticleCode>(['light_element_dust', 'dark_element_dust']);
const ordinaryElementParticles = new Set<ParticleCode>(['wood_element_dust', 'metal_element_dust', 'water_element_dust', 'ice_element_dust', 'fire_element_dust', 'thunder_element_dust', 'wind_element_dust']);
export const isRareParticle = (code: string): code is ParticleCode => rareParticles.has(code as ParticleCode);

const ordinaryProfiles: Record<string, { blood: number; ember: number }> = {
  beast_meat: { blood: .8, ember: .2 }, beast_hide: { blood: .6, ember: .4 },
  beast_bone: { blood: .4, ember: .6 }, beast_tendon: { blood: .2, ember: .8 }
};
const magicalBeastMaterials = new Set(['magic_wool', 'magic_tusk', 'magic_scale', 'magic_claw', 'magic_heartcore']);
const forgeProfiles: Record<string, ForgeOutput[]> = {
  living_wood: [{ code: 'wood_element_dust', decay: .5, limit: 3 }],
  meteor_iron: [{ code: 'metal_element_dust', decay: .6, limit: 5 }],
  star_copper: [{ code: 'metal_element_dust', decay: .7, limit: 7 }, { code: 'water_element_dust', decay: .7, limit: 7 }],
  moon_silver: [{ code: 'metal_element_dust', decay: .8, limit: 9 }, { code: 'ice_element_dust', decay: .8, limit: 9 }, { code: 'dark_element_dust', decay: .25, limit: 3 }],
  sun_gold: [{ code: 'metal_element_dust', decay: .9, limit: 11 }, { code: 'fire_element_dust', decay: .9, limit: 11 }, { code: 'thunder_element_dust', decay: .9, limit: 11 }, { code: 'light_element_dust', decay: .3, limit: 5 }],
  root_heart: [{ code: 'wood_element_dust', decay: .65, limit: 5 }],
  river_shell: [{ code: 'water_element_dust', decay: .65, limit: 5 }],
  tide_shell: [{ code: 'water_element_dust', decay: .55, limit: 4 }, { code: 'metal_element_dust', decay: .45, limit: 3 }],
  ridge_core: [{ code: 'metal_element_dust', decay: .7, limit: 6 }],
  fire_crystal: [{ code: 'fire_element_dust', decay: .7, limit: 6 }],
  marsh_heart: [{ code: 'wood_element_dust', decay: .6, limit: 5 }, { code: 'water_element_dust', decay: .5, limit: 4 }],
  star_mud_core: [{ code: 'dark_element_dust', decay: .7, limit: 6 }],
  frost_crystal: [{ code: 'ice_element_dust', decay: .7, limit: 6 }],
  thunder_core: [{ code: 'thunder_element_dust', decay: .7, limit: 6 }],
  eclipse_core: [{ code: 'light_element_dust', decay: .55, limit: 5 }, { code: 'dark_element_dust', decay: .55, limit: 5 }]
};
const coloredSlimes: Record<string, ParticleCode> = {
  red_slime_gel: 'fire_element_dust', orange_slime_gel: 'metal_element_dust', yellow_slime_gel: 'thunder_element_dust',
  green_slime_gel: 'wood_element_dust', cyan_slime_gel: 'water_element_dust', blue_slime_gel: 'ice_element_dust',
  purple_slime_gel: 'dark_element_dust', black_slime_gel: 'dark_element_dust'
};

const explicitWeights: Record<string, Partial<Record<ParticleCode, number>>> = {
  wolf_fang: { blood_residue: .3, energy_ember: .7 },
  beast_core: { energy_ember: .6, magic_unit: .4 },
  meat_chunk: { blood_residue: .85, energy_ember: .15 },
  slime_gel: { water_element_dust: .5, blood_residue: .4, energy_ember: .1 },
  goblin_ear: { blood_residue: .7, energy_ember: .3 },
  magic_blood: { blood_residue: .6, energy_ember: .2, magic_unit: .2 },
  magic_eye: { magic_unit: .4, light_element_dust: .3, energy_ember: .3 },
  magic_horn: { blood_residue: .3, metal_element_dust: .5, magic_unit: .2 },
  herbal_extract: { wood_element_dust: .8, water_element_dust: .2 },
  mana_dust: { energy_ember: .7, magic_unit: .3 },
  magic_branch: { wood_element_dust: .8, magic_unit: .2 },
  goblin_scrap_iron: { metal_element_dust: 1 },
  goblin_whetstone: { metal_element_dust: .9, blood_residue: .1 },
  goblin_bowstring: { blood_residue: .4, energy_ember: .4, wood_element_dust: .2 },
  goblin_blast_core: { fire_element_dust: .7, energy_ember: .3 },
  goblin_drumhide: { blood_residue: .5, wood_element_dust: .3, energy_ember: .2 },
  goblin_shadowcloth: { dark_element_dust: .8, wood_element_dust: .2 },
  goblin_totem_shard: { dark_element_dust: .6, metal_element_dust: .2, magic_unit: .2 },
  goblin_earth_crystal: { metal_element_dust: .8, magic_unit: .2 },
  goblin_command_seal: { metal_element_dust: .6, energy_ember: .2, magic_unit: .2 },
  goblin_colonel_insignia: { metal_element_dust: .6, energy_ember: .2, magic_unit: .2 },
  duskvein_crystal: { dark_element_dust: .7, wood_element_dust: .2, magic_unit: .1 },
  riot_aura: { energy_ember: .5, fire_element_dust: .3, magic_unit: .2 },
  sky_dust: { wind_element_dust: .7, light_element_dust: .2, magic_unit: .1 },
  mountainheart_seal: { metal_element_dust: .7, energy_ember: .2, magic_unit: .1 },
  forge_warden_brand: { fire_element_dust: .6, metal_element_dust: .3, magic_unit: .1 },
  threehead_molt_sigel: { water_element_dust: .4, wood_element_dust: .3, blood_residue: .2, magic_unit: .1 },
  crown_hunt_seal: { dark_element_dust: .4, metal_element_dust: .3, energy_ember: .2, magic_unit: .1 },
  healing_herb: { wood_element_dust: .8, light_element_dust: .2 },
  refined_beast_bone: { blood_residue: .25, energy_ember: .75 },
  refined_beast_hide: { blood_residue: .7, energy_ember: .3 },
  refined_beast_tendon: { blood_residue: .35, energy_ember: .65 },
  refined_beast_core: { blood_residue: .2, energy_ember: .5, magic_unit: .3 },
  refined_magic_wool: { blood_residue: .5, energy_ember: .2, magic_unit: .3 },
  refined_magic_tusk: { blood_residue: .3, energy_ember: .4, magic_unit: .3 },
  refined_magic_scale: { blood_residue: .3, energy_ember: .4, magic_unit: .3 },
  refined_magic_claw: { blood_residue: .3, energy_ember: .4, magic_unit: .3 },
  refined_magic_heartcore: { blood_residue: .3, energy_ember: .4, magic_unit: .3 }
};

const explicitValues: Record<string, number> = {
  wolf_fang: 4, beast_core: 25, meat_chunk: 3, slime_gel: 1, goblin_ear: 5,
  magic_blood: 16, magic_eye: 16, magic_horn: 16, healing_herb: 2,
  herbal_extract: 5, mana_dust: 8, magic_branch: 20,
  goblin_scrap_iron: 18, goblin_whetstone: 24, goblin_bowstring: 22, goblin_blast_core: 32,
  goblin_drumhide: 26, goblin_shadowcloth: 35, goblin_totem_shard: 38, goblin_earth_crystal: 42,
  goblin_command_seal: 75, goblin_colonel_insignia: 160, duskvein_crystal: 55, riot_aura: 150, sky_dust: 150,
  refined_beast_bone: 14, refined_beast_hide: 20, refined_beast_tendon: 28, refined_beast_core: 75,
  refined_magic_wool: 36, refined_magic_tusk: 42, refined_magic_scale: 42, refined_magic_claw: 48, refined_magic_heartcore: 60,
  mountainheart_seal: 120, forge_warden_brand: 120, threehead_molt_sigel: 120, crown_hunt_seal: 120
};
const fixedChanceProfiles: Record<string, Array<{ code: ParticleCode; chance: number }>> = {
  home_wood: [{ code: 'wood_element_dust', chance: .12 }],
  home_stone: [{ code: 'metal_element_dust', chance: .04 }],
  home_metal: [{ code: 'metal_element_dust', chance: .2 }]
};
const excludedCodes = new Set([
  'copper_coin', 'silver_coin', 'gold_coin', 'resonance_crystal',
  'evolution_active_sample', 'evolution_stable_medium', 'evolution_catalyst',
  'automaton_body', 'pure_soul_trace', 'xiaowei_gift', 'qinger_gift'
]);
const excludedCategories = new Set(['粒子', '货币', '图纸', '地图', '任务', '剧情', '世界印记', '神材', '怪物卡片', '育成', '礼物']);
const genericProductionCategories = new Set(['素材', '怪材', '食材', '草药', '炼材', '锻材', '稀有锻材', '区域锻材', 'Boss部件', '建材']);


const jsonRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
};

const exclusionReasonFor = (item: DeconstructionItem, effect: Record<string, unknown>): string | null => {
  if (particleCodes.includes(item.code as ParticleCode) || item.item_category === '粒子') return '粒子是分解产物，不能再次分解。';
  if (['copper_coin', 'silver_coin', 'gold_coin'].includes(item.code) || item.item_category === '货币' || effect.currency) return '货币不能分解。';
  if (item.code.includes('blueprint') || item.item_category === '图纸' || effect.constructionBlueprint) return '图纸不能分解。';
  if (item.code.startsWith('skill_book_') || effect.skillBook) return '技能书不能分解。';
  if (item.item_category === '地图' || effect.map) return '地图不能分解。';
  if (['evolution_active_sample', 'evolution_stable_medium', 'evolution_catalyst'].includes(item.code) || item.item_category === '育成' || effect.evolutionMaterial) return '专用成长资源暂不开放分解。';
  if (item.item_category === '神材' || item.item_category === '世界印记' || effect.artifactMaterial) return '唯一成长材料与世界印记不能分解。';
  if (item.item_category === '怪物卡片' || effect.monsterCard) return '怪物卡片不能分解。';
  if (item.code === 'automaton_body' || item.code === 'pure_soul_trace' || item.code.startsWith('automaton_feed_') || effect.automatonProduct) return '机巧人工材料尚未配置成本回拆。';
  if (item.code === 'resonance_crystal' || ['任务', '剧情', '礼物'].includes(item.item_category) || ['xiaowei_gift', 'qinger_gift'].includes(item.code)) return '任务、纪念或专用资源不能分解。';
  if (excludedCodes.has(item.code) || excludedCategories.has(item.item_category)) return '该物品属于受保护的专用资源。';
  if (item.item_type !== 'material' && item.code !== 'healing_herb') return item.item_type === 'equipment' ? '成品装备不在材料分解范围。' : '成品道具不在材料分解范围。';
  return null;
};

export const deconstructionBudget = (value: number) => {
  const points: Array<[number, number]> = [[1, .3], [2, .6], [5, 1.5], [10, 3], [20, 5], [40, 6], [100, 8], [200, 13], [400, 20], [800, 34]];
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value <= 1) return .3 * value;
  for (let index = 1; index < points.length; index += 1) {
    const [rightValue, rightBudget] = points[index]!; const [leftValue, leftBudget] = points[index - 1]!;
    if (value <= rightValue) return leftBudget + (rightBudget - leftBudget) * (value - leftValue) / (rightValue - leftValue);
  }
  return 34 * Math.sqrt(value / 800);
};

const normalize = (weights: Partial<Record<ParticleCode, number>>) => {
  const entries = Object.entries(weights).filter((entry): entry is [ParticleCode, number] => particleCodes.includes(entry[0] as ParticleCode) && Number(entry[1]) > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  return Object.fromEntries(entries.map(([code, weight]) => [code, weight / total])) as Partial<Record<ParticleCode, number>>;
};

const inferredElements = (text: string) => {
  const scores: Partial<Record<ParticleCode, number>> = {};
  const add = (code: ParticleCode, score = 1) => { scores[code] = (scores[code] ?? 0) + score; };
  if (/木|根|藤|枝|叶|草|苔|藻|芽|花/u.test(text)) add('wood_element_dust');
  if (/土|岩|石|矿|金属|铁|铜|银|合锭|甲|壳/u.test(text)) add('metal_element_dust');
  if (/水|潮|河|海|露|涟|雾|沼|泽/u.test(text)) add('water_element_dust');
  if (/冰|霜|寒|雪/u.test(text)) add('ice_element_dust');
  if (/火|炎|熔|炉|赤|炽/u.test(text)) add('fire_element_dust');
  if (/雷|电|磁/u.test(text)) add('thunder_element_dust');
  if (/风|空鸣|羽|翎/u.test(text)) add('wind_element_dust');
  if (/光|辉|曦|圣/u.test(text)) add('light_element_dust', .5);
  if (/暗|蚀|夜|幽/u.test(text)) add('dark_element_dust', .5);
  return scores;
};

const inferredWeights = (item: DeconstructionItem) => {
  const text = `${item.name} ${item.description ?? ''}`;
  const scores = inferredElements(text);
  const add = (code: ParticleCode, score: number) => { scores[code] = (scores[code] ?? 0) + score; };
  if (/血|肉|皮|革|筋|毛|绒|鬃|膜|胶/u.test(text)) add('blood_residue', 1);
  if (/魔力|灵魂|法力|奥术|回响|共鸣|核心|晶核|残印|军徽/u.test(text)) { add('energy_ember', .7); add('magic_unit', .3); }
  if (Object.keys(scores).length) return normalize(scores);
  if (item.item_category === '食材') return { blood_residue: .85, energy_ember: .15 };
  if (item.item_category === '草药') return { wood_element_dust: .8, water_element_dust: .2 };
  if (['锻材', '稀有锻材', '区域锻材', 'Boss部件', '建材'].includes(item.item_category)) return { metal_element_dust: .7, energy_ember: .3 };
  if (item.item_category === '炼材') return { energy_ember: .6, magic_unit: .4 };
  if (item.item_category === '怪材') return { blood_residue: .5, energy_ember: .5 };
  return { energy_ember: .7, magic_unit: .3 };
};

const dynamicMonsterWeightOverride = (name: string, kind: string): Partial<Record<ParticleCode, number>> | undefined => {
  if (/^(藤心木|蔓节片)$/u.test(name)) return { wood_element_dust: .8, energy_ember: .2 };
  if (/^(露凝胶|晨露核|泡凝胶|涟漪核)$/u.test(name)) return { water_element_dust: .7, energy_ember: .3 };
  if (/^(浮灯胶|微光核)$/u.test(name)) return { water_element_dust: .5, light_element_dust: .3, energy_ember: .2 };
  if (/^(砾岩芯|碎岩片|石脉芯|脉岩片)$/u.test(name)) return { metal_element_dust: .8, energy_ember: .2 };
  if (/^(赤铁灵膜|火晶核|熔岩芯)$/u.test(name)) return { fire_element_dust: .7, metal_element_dust: .2, energy_ember: .1 };
  if (/^(磁石芯|磁甲片)$/u.test(name)) return { metal_element_dust: .6, thunder_element_dust: .3, energy_ember: .1 };
  if (/^(雾藻膜|藻核)$/u.test(name)) return { wood_element_dust: .5, water_element_dust: .4, energy_ember: .1 };
  if (/^(沼火膜|鬼灯核)$/u.test(name)) return { dark_element_dust: .5, fire_element_dust: .3, energy_ember: .2 };
  if (/^(风铃翎|空鸣骨)$/u.test(name)) {
    const blood = ['hair', 'gel_skin'].includes(kind) ? .65 : .35;
    return { wind_element_dust: .6, blood_residue: blood * .4, energy_ember: (1 - blood) * .4 };
  }
  return undefined;
};
const monsterWeights = (name: string, kind: string) => {
  const override = dynamicMonsterWeightOverride(name, kind);
  if (override) return normalize(override);
  const elements = normalize(inferredElements(name));
  const elementEntries = Object.entries(elements) as Array<[ParticleCode, number]>;
  const blood = ['hair', 'gel_skin'].includes(kind) ? .65 : .35;
  if (!elementEntries.length) return { blood_residue: blood, energy_ember: 1 - blood };
  const result: Partial<Record<ParticleCode, number>> = { blood_residue: blood * .3, energy_ember: (1 - blood) * .3 };
  for (const [code, weight] of elementEntries) result[code] = (result[code] ?? 0) + weight * .7;
  return normalize(result);
};

const refinedWeights = (code: string): Partial<Record<ParticleCode, number>> | undefined => {
  if (/^spellcloth_bolt(?:_t[2-5])?$/.test(code)) return { wood_element_dust: .5, blood_residue: .2, magic_unit: .3 };
  if (/^tanned_spirit_leather(?:_t[2-5])?$/.test(code)) return { blood_residue: .5, energy_ember: .3, magic_unit: .2 };
  if (/^bone_steel_plate(?:_t[2-5])?$/.test(code)) return { metal_element_dust: .6, energy_ember: .2, magic_unit: .2 };
  if (/^cast_shell_plate(?:_t[2-5])?$/.test(code)) return { metal_element_dust: .7, energy_ember: .2, magic_unit: .1 };
  if (/^laminated_scale_plate(?:_t[2-5])?$/.test(code)) return { metal_element_dust: .5, blood_residue: .2, magic_unit: .3 };
  if (/^refined_/.test(code)) return undefined;
  return undefined;
};

const materialValue = (item: DeconstructionItem) => {
  const explicit = explicitValues[item.code]; if (explicit) return explicit;
  const forge = forgeMaterialValue[item.code]; if (forge) return forge;
  const purified = purifiedCraftMaterialValue(item.code); if (purified) return purified;
  const trade = Math.max(0, Number(item.trade_price ?? 0)); if (trade) return trade;
  return 0;
};

const profileProficiencyForBudget = (budget: number) => budget < 5 ? 1 : budget < 10 ? 2 : budget < 20 ? 3 : budget < 34 ? 4 : 5;

export const deconstructionProfileFor = (item: DeconstructionItem): DeconstructionProfile | null => {
  const effect = jsonRecord(item.effect_json);
  if (exclusionReasonFor(item, effect)) return null;

  const kind = String(effect.monster_craft_material ?? '');
  if (['hair', 'gel_skin', 'bone', 'shell', 'scale'].includes(kind)) {
    const rawMonsterClass = String(effect.material_monster_class ?? 'normal');
    const monsterClass: 'normal' | 'large' | 'elite' | 'boss' = ['normal', 'large', 'elite', 'boss'].includes(rawMonsterClass)
      ? rawMonsterClass as 'normal' | 'large' | 'elite' | 'boss'
      : 'normal';
    const classValue = ({ normal: 1, large: 2, elite: 3, boss: 4 } as const)[monsterClass] ?? 1;
    const rawLevel = Number(effect.material_monster_level ?? 1);
    const level = Number.isFinite(rawLevel) ? Math.max(1, Math.floor(rawLevel)) : 1;
    const levelMultiplier = Math.pow(1.2, Math.floor((level - 1) / 10));
    return { kind: 'monster', weights: monsterWeights(item.name, kind), particleValue: classValue * levelMultiplier, magicChance: ({ normal: 0, large: 0, elite: .2, boss: .25 } as const)[monsterClass] * levelMultiplier, proficiency: classValue * levelMultiplier };
  }
  if (ordinaryProfiles[item.code]) return { kind: 'ordinary', ...ordinaryProfiles[item.code], proficiency: 1 };
  if (magicalBeastMaterials.has(item.code)) return { kind: 'magical_beast', proficiency: 2 };
  if (forgeProfiles[item.code]) return { kind: 'forge', outputs: forgeProfiles[item.code], proficiency: ({ living_wood: 1, meteor_iron: 2, star_copper: 3, moon_silver: 4, sun_gold: 5 } as Record<string, number>)[item.code] ?? 3 };
  if (coloredSlimes[item.code]) return { kind: 'slime', element: coloredSlimes[item.code], proficiency: 1 };
  if (fixedChanceProfiles[item.code]) return { kind: 'fixed_chance', outputs: fixedChanceProfiles[item.code], proficiency: 1 };

  const explicit = explicitWeights[item.code];
  const refined = refinedWeights(item.code);
  if (!explicit && !refined && !genericProductionCategories.has(item.item_category)) return null;
  const weights = explicit ?? refined ?? inferredWeights(item);
  const budget = deconstructionBudget(materialValue(item));
  return budget > 0 ? { kind: 'weighted', weights: normalize(weights), budget, proficiency: profileProficiencyForBudget(budget) } : null;
};

export const deconstructionBlockReason = (item: DeconstructionItem): string | null => {
  const exclusion = exclusionReasonFor(item, jsonRecord(item.effect_json));
  if (exclusion) return exclusion;
  if (deconstructionProfileFor(item)) return null;
  if (item.item_category === '特殊') return '特殊物品尚未配置安全的分解规则。';
  if (['基材', '构件'].includes(item.item_category)) return '人工构造材料缺少成本账本配置，暂不可分解。';
  if (!genericProductionCategories.has(item.item_category)) return '该类别未纳入普通生产材料分解范围。';
  return '缺少可靠的材料估值，暂不可分解。';
};

export const chainedExpectation = (firstChance: number, decay: number, limit: number) => {
  let expected = 0; let reach = 1; let chance = Math.max(0, Math.min(1, firstChance));
  for (let index = 0; index < limit; index += 1) { const hit = reach * chance; expected += hit; reach = hit; chance *= Math.max(0, Math.min(1, decay)); }
  return expected;
};

export const rareParticleChance = (candidateExpected: number, ordinaryChance: number) => Math.max(0, Math.min(.25 * candidateExpected, .15, .25 * ordinaryChance));

const weightedPreviews = (weights: Partial<Record<ParticleCode, number>>, budget: number, bonusMultiplier: number) => {
  const candidates = (Object.entries(normalize(weights)) as Array<[ParticleCode, number]>).map(([code, weight]) => ({ code, expected: budget * bonusMultiplier * weight / particleValues[code] }));
  const ordinaryChances = candidates.filter(output => ordinaryElementParticles.has(output.code)).map(output => Math.min(1, output.expected)).filter(chance => chance > 0);
  const ordinaryChance = ordinaryChances.length ? Math.min(...ordinaryChances) : Math.min(1, budget * bonusMultiplier / 3);
  return candidates.map(output => {
    const expected = isRareParticle(output.code) ? rareParticleChance(output.expected, ordinaryChance) : output.expected;
    return { code: output.code, name: particleNames[output.code], expected, min: isRareParticle(output.code) ? 0 : Math.floor(expected), max: isRareParticle(output.code) ? 1 : Math.ceil(expected), rare: isRareParticle(output.code) };
  });
};

export const deconstructionPreviewFor = (profile: DeconstructionProfile, bonusMultiplier = 1): DeconstructionPreview[] => {
  if (profile.kind === 'weighted') return weightedPreviews(profile.weights, profile.budget, bonusMultiplier);
  if (profile.kind === 'monster') {
    const outputs = weightedPreviews(profile.weights, profile.particleValue * 2, bonusMultiplier);
    const expected = Math.min(1, profile.magicChance * bonusMultiplier);
    if (expected > 0) outputs.push({ code: 'magic_unit', name: particleNames.magic_unit, expected, min: Math.floor(expected), max: Math.ceil(expected), rare: false });
    return outputs;
  }
  if (profile.kind === 'ordinary') {
    const bloodChance = Math.min(1, profile.blood * bonusMultiplier);
    const emberChance = Math.min(1, profile.ember * bonusMultiplier);
    return [
      { code: 'blood_residue', name: particleNames.blood_residue, expected: chainedExpectation(bloodChance, .5, 3), min: bloodChance >= 1 ? 1 : 0, max: 3, rare: false },
      { code: 'energy_ember', name: particleNames.energy_ember, expected: chainedExpectation(emberChance, .5, 3), min: emberChance >= 1 ? 1 : 0, max: 3, rare: false }
    ];
  }
  if (profile.kind === 'magical_beast') {
    const magicChance = Math.min(1, .8 * bonusMultiplier);
    return [
      { code: 'blood_residue', name: particleNames.blood_residue, expected: chainedExpectation(1, Math.min(1, .6 * bonusMultiplier), 6) * .5, min: 0, max: 6, rare: false },
      { code: 'energy_ember', name: particleNames.energy_ember, expected: chainedExpectation(1, Math.min(1, .6 * bonusMultiplier), 6) * .5, min: 0, max: 6, rare: false },
      { code: 'magic_unit', name: particleNames.magic_unit, expected: chainedExpectation(magicChance, .01, 2), min: magicChance >= 1 ? 1 : 0, max: 2, rare: false }
    ];
  }
  if (profile.kind === 'slime') {
    const rare = isRareParticle(profile.element); const elementExpected = rare ? rareParticleChance(1, 1) : 1;
    return [
      { code: profile.element, name: particleNames[profile.element], expected: elementExpected, min: rare ? 0 : 1, max: 1, rare },
      { code: 'blood_residue', name: particleNames.blood_residue, expected: .8, min: 0, max: 1, rare: false },
      { code: 'energy_ember', name: particleNames.energy_ember, expected: .4, min: 0, max: 1, rare: false }
    ];
  }
  if (profile.kind === 'fixed_chance') return profile.outputs.map(output => {
    const expected = Math.min(1, output.chance * bonusMultiplier);
    return { code: output.code, name: particleNames[output.code], expected, min: expected >= 1 ? 1 : 0, max: 1, rare: isRareParticle(output.code) };
  });
  const candidates = profile.outputs.map(output => ({ output, expected: chainedExpectation(1, Math.min(1, output.decay * bonusMultiplier), output.limit) }));
  const ordinaryOutputs = candidates.filter(candidate => !isRareParticle(candidate.output.code));
  const comparisonChance = ordinaryOutputs.length
    ? 1
    : Math.min(1, candidates.reduce((sum, candidate) => sum + candidate.expected * particleValues[candidate.output.code], 0) / 3);
  return candidates.map(({ output, expected: candidate }) => {
    const expected = isRareParticle(output.code) ? rareParticleChance(candidate, comparisonChance) : candidate;
    return { code: output.code, name: particleNames[output.code], expected, min: isRareParticle(output.code) ? 0 : 1, max: isRareParticle(output.code) ? 1 : output.limit, rare: isRareParticle(output.code) };
  });
};

const chainedRoll = (firstChance: number, decay: number, limit: number, random: () => number) => {
  let count = 0; let chance = firstChance;
  for (let index = 0; index < limit; index += 1) { if (random() >= chance) break; count += 1; chance *= decay; }
  return count;
};
const add = (outputs: Map<ParticleCode, number>, code: ParticleCode, amount: number) => { if (amount > 0) outputs.set(code, (outputs.get(code) ?? 0) + amount); };
const rollExpected = (outputs: Map<ParticleCode, number>, preview: DeconstructionPreview, random: () => number) => {
  const base = Math.floor(preview.expected); add(outputs, preview.code, base + (random() < preview.expected - base ? 1 : 0));
};

export const rollDeconstructionProfile = (profile: DeconstructionProfile, bonusMultiplier = 1, random: () => number = Math.random) => {
  const outputs = new Map<ParticleCode, number>();
  if (profile.kind === 'weighted' || profile.kind === 'monster' || profile.kind === 'fixed_chance') {
    for (const preview of deconstructionPreviewFor(profile, bonusMultiplier)) rollExpected(outputs, preview, random);
    return outputs;
  }
  if (profile.kind === 'ordinary') {
    add(outputs, 'blood_residue', chainedRoll(Math.min(1, profile.blood * bonusMultiplier), .5, 3, random));
    add(outputs, 'energy_ember', chainedRoll(Math.min(1, profile.ember * bonusMultiplier), .5, 3, random));
    return outputs;
  }
  if (profile.kind === 'magical_beast') {
    const count = chainedRoll(1, Math.min(1, .6 * bonusMultiplier), 6, random);
    for (let index = 0; index < count; index += 1) add(outputs, random() < .5 ? 'blood_residue' : 'energy_ember', 1);
    add(outputs, 'magic_unit', chainedRoll(Math.min(1, .8 * bonusMultiplier), .01, 2, random));
    return outputs;
  }
  if (profile.kind === 'slime') {
    const elementChance = isRareParticle(profile.element) ? rareParticleChance(1, 1) : 1;
    if (random() < elementChance) add(outputs, profile.element, 1);
    if (random() < .8) add(outputs, 'blood_residue', 1);
    if (random() < .4) add(outputs, 'energy_ember', 1);
    return outputs;
  }
  const previews = deconstructionPreviewFor(profile, bonusMultiplier);
  for (const output of profile.outputs) {
    if (isRareParticle(output.code)) { const preview = previews.find(entry => entry.code === output.code)!; if (random() < preview.expected) add(outputs, output.code, 1); }
    else add(outputs, output.code, chainedRoll(1, Math.min(1, output.decay * bonusMultiplier), output.limit, random));
  }
  return outputs;
};

export const deconstructionProficiencyFor = (profile: DeconstructionProfile) => profile.proficiency;

const compactNumber = (value: number, digits: number) => {
  const fixed = value.toFixed(digits);
  return fixed.includes('.') ? fixed.replace(/0+$/u, '').replace(/\.$/u, '') : fixed;
};

export const deconstructionPreviewText = (profile: DeconstructionProfile, bonusMultiplier = 1) => deconstructionPreviewFor(profile, bonusMultiplier)
  .filter(output => output.expected > 0)
  .map(output => {
    const range = output.min === output.max ? `×${output.min}` : `×${output.min}～${output.max}`;
    if (output.min === output.max) return `${output.name}${range}`;
    if (output.max === 1) {
      const percent = compactNumber(output.expected * 100, output.expected < .01 ? 2 : output.expected < .1 ? 1 : 0);
      return `${output.name}${range}（约${percent}%）`;
    }
    return `${output.name}${range}（均值约${compactNumber(output.expected, output.expected < 1 ? 3 : 2)}）`;
  })
  .join('；');
