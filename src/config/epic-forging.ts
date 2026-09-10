import { purifiedCraftMaterialCode, purifiedMaterialForArmor } from '../game/monster-crafting-material.service';

export type EpicSetCode = 'mountainheart_regalia' | 'valk_forge_regalia' | 'mistmother_cocoon' | 'goblin_court_hunt';
export type EpicArmorSlot = '头肩' | '上装' | '腰部' | '下装' | '脚部';

export type EpicForgeRecipe = {
  code: string;
  blueprintCode: string;
  name: string;
  description: string;
  bossCode: string;
  bossName: string;
  category: '武器' | EpicArmorSlot;
  subtype: string;
  setCode?: EpicSetCode;
  weaponEffect?: string;
  materials: Array<{ code: string; quantity: number }>;
};

type SetProfile = {
  code: EpicSetCode;
  name: string;
  armorType: '布甲' | '皮甲' | '重甲' | '板甲';
  bossCode: string;
  bossName: string;
  regionMaterial: string;
  bossPart: string;
  armorNames: Record<EpicArmorSlot, string>;
  weaponEntries: Array<[string, string, string, string]>;
};

const slots: Array<[EpicArmorSlot, number, number, number]> = [
  ['头肩', 6, 2, 1], ['上装', 12, 4, 2], ['腰部', 5, 2, 1], ['下装', 10, 4, 2], ['脚部', 7, 2, 1]
];

export const rareForgeMaterials = [
  { code: 'meteor_iron', name: '陨铁锻锭', description: '自天外坠落后反复锻净的沉重铁锭，是史诗装备的基础骨架。', hourlyAttempts: 5, attemptChance: 1, perRegionActiveCap: 30, minRegionLevel: 20, miningSeconds: 15 * 60, yields: [1, 2, 3] as const, weights: [.4, .4, .2] as const },
  { code: 'star_copper', name: '星铜锻锭', description: '带有微弱星辉的高导性锻锭，用于固定史诗装备的精炼结构。', hourlyAttempts: 1, attemptChance: 1, perRegionActiveCap: 10, minRegionLevel: 20, miningSeconds: 30 * 60, yields: [1, 2, 3] as const, weights: [.6, .3, .1] as const },
  { code: 'moon_silver', name: '月银锻锭', description: '在月光下仍保持柔韧的银白锻锭，是史诗装备的稀有结合材。', hourlyAttempts: 1, attemptChance: .5, perRegionActiveCap: 3, minRegionLevel: 20, miningSeconds: 60 * 60, yields: [1, 2, 3] as const, weights: [.8, .15, .05] as const },
  { code: 'sun_gold', name: '曜金合锭', description: '以极高温度熔合的金色核心锭，能令史诗装备承受完整的力量回路。', hourlyAttempts: 1, attemptChance: .2, perRegionActiveCap: 1, minRegionLevel: 20, miningSeconds: 120 * 60, yields: [1, 2, 3] as const, weights: [.95, .04, .01] as const }
] as const;

export const regionalForgeMaterials = [
  { regionCode: 'dark_forest_deep', code: 'duskvein_crystal', name: '幽纹黑晶', description: '深根岩层中析出的暗紫晶簇，是王庭遗迹与古木根系共同浸染出的稳定锻材。' },
  { regionCode: 'ridge_foothills', code: 'ridge_core', name: '岩脊核心', description: '山体岩脉中凝出的稳定土性锻材。' },
  { regionCode: 'rediron_pass', code: 'fire_crystal', name: '炉心赤晶', description: '沿熔岩岩脉生长的赤色晶矿，研磨后可作为高温锻造结合剂。' },
  { regionCode: 'mistalgae_marsh', code: 'marsh_heart', name: '雾沼心', description: '含水木活性的湿地锻材。' }
] as const;

const setProfiles: SetProfile[] = [
  {
    code: 'mountainheart_regalia', name: '地脉王铸', armorType: '板甲', bossCode: 'gruen_mountainheart', bossName: '山脉心核·格鲁恩', regionMaterial: 'ridge_core', bossPart: 'mountainheart_seal',
    armorNames: { '头肩': '镇岭盔', '上装': '断层铠', '腰部': '裂谷束腰', '下装': '沉岩胫甲', '脚部': '踏岳战靴' },
    weaponEntries: [['镇岭长剑', '长剑', 'zhenling_longsword', '自身持有生命护盾时，造成的技能直击最终伤害提高8%。'], ['断层拳刃', '拳刃', 'faultline_fistblade', '每回合首次以打击类技能直击命中时，使目标物理防御降低8%，持续1回合；每个目标每回合一次。'], ['山门盾牌', '盾牌', 'mountaingate_shield', '自身每2回合首次受到技能直击伤害后，获得最大生命6%的生命护盾，持续1回合。']]
  },
  {
    code: 'valk_forge_regalia', name: '赤炉监令', armorType: '重甲', bossCode: 'valk_forge_overseer', bossName: '熔炉监工·瓦尔克', regionMaterial: 'fire_crystal', bossPart: 'forge_warden_brand',
    armorNames: { '头肩': '炉冠', '上装': '炽铸胸甲', '腰部': '锁炉腰封', '下装': '余烬腿铠', '脚部': '踏火战靴' },
    weaponEntries: [['赤炉长剑', '长剑', 'redfurnace_longsword', '技能直击命中获得炉火，最多2层；满层后下一次技能直击消耗炉火，最终伤害提高12%并无视对应防御8%。'], ['淬焰匕首', '匕首', 'temperedflame_dagger', '对当前生命低于50%的目标造成物理技能直击时，最终伤害提高12%。'], ['熔铆拳刃', '拳刃', 'moltenrivet_fistblade', '物理技能直击同一目标后，下一回合再次以物理技能直击该目标时最终伤害提高8%，命中后消耗。']]
  },
  {
    code: 'mistmother_cocoon', name: '雾母蜕茧', armorType: '布甲', bossCode: 'threehead_mother', bossName: '三首雾沼蛇母', regionMaterial: 'marsh_heart', bossPart: 'threehead_molt_sigel',
    armorNames: { '头肩': '三首雾冠', '上装': '蜕雾长衣', '腰部': '蛇环束腰', '下装': '沼影下装', '脚部': '苇沼轻履' },
    weaponEntries: [['雾冠法杖', '法杖', 'mistcrown_staff', '每回合首次成功施加非持续伤害类减益时，恢复自身最大MP的5%。'], ['三首法书', '法书', 'threehead_grimoire', '每回合首次对队友完成有效治疗时，使其获得6%减伤，持续1回合；每名目标每回合一次。'], ['沼月法球', '法球', 'marshmoon_orb', '自身对生命低于50%的队友完成有效治疗时，额外恢复其最大生命3%；每名目标每回合一次。']]
  },
  {
    code: 'goblin_court_hunt', name: '王庭猎幕', armorType: '皮甲', bossCode: 'goblin_king', bossName: '横冲直撞的哥布林国王', regionMaterial: 'duskvein_crystal', bossPart: 'crown_hunt_seal',
    armorNames: { '头肩': '乌冠兜帽', '上装': '王庭猎衣', '腰部': '战旗束带', '下装': '潜袭护胫', '脚部': '穿根猎靴' },
    weaponEntries: [['王庭猎牙', '匕首', 'court_hunter_dagger', '每回合首次技能直击命中时施加猎牙；自身下一次技能直击该目标最终伤害提高10%，命中后消耗。'], ['陷阵拳刃', '拳刃', 'vanguard_fistblade', '对带有任意非持续伤害类减益的目标造成技能直击时，最终伤害提高8%；每个目标每回合一次。'], ['王旗盾牌', '盾牌', 'royal_banner_shield', '自身回合开始时，若任一存活队友生命低于50%，为生命比例最低者提供最大生命5%的生命护盾，持续1回合；每2回合最多触发一次。']]
  }
];

const commonArmorMaterials = (profile: SetProfile, regionalAmount: number, craftAmount: number, partAmount: number) => [
  { code: 'sun_gold', quantity: 1 }, { code: 'moon_silver', quantity: 1 }, { code: 'star_copper', quantity: 3 }, { code: 'meteor_iron', quantity: 10 },
  { code: profile.regionMaterial, quantity: regionalAmount }, { code: profile.bossPart, quantity: partAmount }, { code: purifiedMaterialForArmor(profile.armorType, 30), quantity: craftAmount }
];

const weaponMaterialFor = (weaponType: string) => weaponType === '匕首' ? purifiedCraftMaterialCode('gel_skin', 30) : weaponType === '法杖' || weaponType === '法书' || weaponType === '法球' ? purifiedCraftMaterialCode('hair', 30) : weaponType === '盾牌' ? purifiedCraftMaterialCode('shell', 30) : purifiedCraftMaterialCode('bone', 30);

export const epicForgeRecipes: EpicForgeRecipe[] = setProfiles.flatMap(profile => [
  ...slots.map(([category, regionalAmount, craftAmount, partAmount]) => ({
    code: `epic_${profile.code}_${category}`, blueprintCode: `blueprint_epic_${profile.code}_${category}`, name: profile.armorNames[category],
    description: `Lv.30 史诗${profile.armorType}${category}。${profile.name}套装部件；图纸为一次性材料，打造时消耗。`, bossCode: profile.bossCode, bossName: profile.bossName,
    category, subtype: profile.armorType, setCode: profile.code, materials: commonArmorMaterials(profile, regionalAmount, craftAmount, partAmount)
  })),
  ...profile.weaponEntries.map(([name, subtype, shortCode, weaponEffect]) => ({
    code: `epic_${shortCode}`, blueprintCode: `blueprint_epic_${shortCode}`, name, description: `Lv.30 史诗${subtype}。${weaponEffect}图纸为一次性材料，打造时消耗。`, bossCode: profile.bossCode, bossName: profile.bossName,
    category: '武器' as const, subtype, weaponEffect, materials: [
      { code: 'sun_gold', quantity: 1 }, { code: 'moon_silver', quantity: 3 }, { code: 'star_copper', quantity: 10 }, { code: 'meteor_iron', quantity: 20 },
      { code: profile.regionMaterial, quantity: 18 }, { code: profile.bossPart, quantity: 3 }, { code: weaponMaterialFor(subtype), quantity: 5 }
    ]
  }))
]);

export const epicSetProfile = (code: string) => setProfiles.find(profile => profile.code === code) ?? null;
export const epicRecipeByBlueprint = (code: string) => epicForgeRecipes.find(recipe => recipe.blueprintCode === code) ?? null;
export const epicRecipesByBoss = (bossCode: string) => epicForgeRecipes.filter(recipe => recipe.bossCode === bossCode);
