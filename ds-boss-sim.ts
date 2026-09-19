// Lv.30 史诗毕业二转 vs Lv.32 Boss 难度模拟
// 复刻项目内派生公式、锻造主副词条、甲类修正、二转被动与主要 Boss 状态机。

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const R = (min: number, max: number) => min + Math.random() * (max - min);
const rint = (min: number, max: number) => Math.floor(R(min, max + 1));

// ---------- 基础派生公式（src/game/constants.ts、growth-rules.ts） ----------
const playerGrowthShares = (level: number) => {
  const normalized = Math.max(1, Math.floor(level));
  const fullStages = Math.floor((normalized - 1) / 10);
  return 5 * fullStages * (fullStages + 1) + (normalized - fullStages * 10) * (fullStages + 1) - 1;
};
const standardPlayerAttribute = (level: number) => (100 + 10 * playerGrowthShares(level)) / 6;

type Stats = Record<string, number>;
const derived = (v: Record<string, number>): Stats => ({
  hpMax: 120 + v.constitution * 19.9 + v.spirit * 3.9 + v.strength * 4.9 + v.intelligence * 1.9 + v.agility * 1.9 + v.perception * 1.9,
  mpMax: 60 + v.constitution * 2.2 + v.spirit * 17.8 + v.strength * 1.1 + v.intelligence * 8.9 + v.agility * 1.1 + v.perception * 3.3,
  physicalAttack: 8 + v.constitution * .5 + v.spirit * .2 + v.strength * 2 + v.intelligence * .2 + v.agility + v.perception * .4,
  magicAttack: 8 + v.constitution * .2 + v.spirit + v.strength * .2 + v.intelligence * 2 + v.agility * .4 + v.perception * .5,
  physicalDefense: 8 + v.constitution * 2 + v.spirit * .25 + v.strength + v.intelligence * .25 + v.agility * .5 + v.perception * .3,
  magicDefense: 8 + v.constitution * .2 + v.spirit * 2 + v.strength * .2 + v.intelligence + v.agility * .4 + v.perception * .5,
  accuracy: 20 + v.constitution * .7 + v.spirit * .7 + v.strength * .7 + v.intelligence * 1.1 + v.agility * 4.4 + v.perception,
  evasion: 20 + v.constitution * .7 + v.spirit * .7 + v.strength * .7 + v.intelligence * 1.1 + v.agility * 4.4 + v.perception,
  critRateBp: 20 + v.constitution * .5 + v.spirit * .5 + v.strength * .5 + v.intelligence * .9 + v.agility * 1.8 + v.perception * 4.4,
  critDamageBp: 20 + v.constitution * .5 + v.spirit * .5 + v.strength * 1.8 + v.intelligence * .9 + v.agility * .5 + v.perception * 4.4,
  critResistBp: 20 + v.constitution * 4.4 + v.spirit * .9 + v.strength * .5 + v.intelligence * .5 + v.agility * .5 + v.perception * 1.8,
  critDamageReductionBp: 20 + v.constitution * .9 + v.spirit * 4.4 + v.strength * .5 + v.intelligence * .5 + v.agility * .5 + v.perception * 1.8,
  tenacity: v.constitution * 4.3 + v.spirit * 3.2 + v.perception * 1.1,
  tenacityPierce: Math.floor(v.perception * 2.5 + v.strength * .9 + v.intelligence * .9),
  speed: 100 + v.agility * 8.6
});

const forgeRarityMultiplier: Record<string, number> = { 普通: 1, 优秀: 1.15, 精良: 1.3, 稀有: 1.5, 传说: 1.7, 史诗: 2 };
const equipmentQualityMultiplier = (quality: number) => .6 + clamp(quality, 0, 100) / 250;
const forgedEquipmentBase = (level: number, category: '武器' | '防具', slot?: string) => {
  const body = 8 + standardPlayerAttribute(level) * 4.3;
  if (category === '武器') return body * .5;
  if (['upper', 'lower', '上装', '下装'].includes(slot ?? '')) return body * .24;
  if (['shoulder', 'waist', 'feet', '头肩', '腰部', '脚部'].includes(slot ?? '')) return body * 13 / 75;
  return body / 5;
};
const legacyForgedEquipmentBase = (level: number, category: '武器' | '防具') => {
  const equalAttribute = 100 / 6 + 10 / 6 * (level - 1);
  const levelMultiplier = Math.pow(1.2, Math.floor(level / 10));
  const attack = 8 + equalAttribute * 4.3;
  const defense = 8 + equalAttribute * 4.3;
  return (category === '武器' ? attack : defense / 2) * levelMultiplier;
};
const affixCapMultiplier: Record<string, number> = {
  physicalAttack: .5, magicAttack: .5, physicalDefense: .5, magicDefense: .5, tenacityPierce: .5,
  accuracy: 1, evasion: 1, critRateBp: 1, critDamageBp: 1, critResistBp: 1, critDamageReductionBp: 1,
  tenacity: 1, speed: 1, hpMax: 2, mpMax: 2
};
const forgedAffixCap = (category: '武器' | '防具', key: string, level: number, rarity: string) => {
  const base = legacyForgedEquipmentBase(level, category) * (forgeRarityMultiplier[rarity] ?? 1);
  if (category === '武器') {
    if (['physicalDefense', 'magicDefense', 'hpMax', 'tenacity'].includes(key)) return 0;
    return base * (affixCapMultiplier[key] ?? 0);
  }
  if (['physicalAttack', 'magicAttack', 'mpMax', 'tenacityPierce'].includes(key)) return 0;
  return base * (affixCapMultiplier[key] ?? 0);
};
const affixKeys = ['hpMax', 'mpMax', 'physicalAttack', 'magicAttack', 'physicalDefense', 'magicDefense', 'accuracy', 'evasion', 'critRateBp', 'critDamageBp', 'critResistBp', 'critDamageReductionBp', 'tenacity', 'tenacityPierce', 'speed'];
const elementNames = ['水', '火', '土', '木', '风', '冰', '雷', '光', '暗'];
const elementAffix = (weapon: boolean, element: string) => weapon ? `elementMastery_${element}` : `elementResistance_${element}`;

// ---------- 史诗随机副词条 ----------
// 每件史诗 4 条，数值在 0~上限间按截断正态（62% 中心）掷出；毕业号按输出/生存取向选词。
type AffixRoll = { key: string; value: number };
const normalFactor = () => {
  const left = Math.max(Number.EPSILON, Math.random()), right = Math.max(Number.EPSILON, Math.random());
  return clamp(.62 + Math.sqrt(-2 * Math.log(left)) * Math.cos(2 * Math.PI * right) * .16, .08, 1);
};
const rollEpicAffixes = (category: '武器' | '防具', count: number, preferred: string[]): AffixRoll[] => {
  const available = affixKeys.filter(key => {
    if (category === '武器' && ['physicalDefense', 'magicDefense', 'hpMax', 'tenacity'].includes(key)) return false;
    if (category === '防具' && ['physicalAttack', 'magicAttack', 'mpMax', 'tenacityPierce'].includes(key)) return false;
    return forgedAffixCap(category, key, 30, '史诗') > 0;
  });
  // 毕业按目标词条洗练：取前 count 条，数值按截断正态期望 62% 上限
  return preferred.filter(key => available.includes(key)).slice(0, count).map(key => ({ key, value: forgedAffixCap(category, key, 30, '史诗') * .62 }));
};

// 战旗使毕业词条取向：武器命中/暴击/暴伤/破韧，防具生命/暴抗/暴免/韧性/速度/命中
const epicWeaponAffixes = () => rollEpicAffixes('武器', 4, ['critRateBp', 'critDamageBp', 'accuracy', 'tenacityPierce']);
const epicArmorAffixes = (slot: string) => {
  const preferred = slot === 'upper' || slot === 'lower' ? ['hpMax', 'critResistBp', 'critDamageReductionBp', 'tenacity'] : ['accuracy', 'evasion', 'speed', 'critResistBp', 'tenacity', 'critDamageReductionBp'];
  return rollEpicAffixes('防具', 4, preferred);
};

const armorPiecePercent = (subtype: string, slot: string, quality = 100) => {
  const largePercent: Record<string, readonly number[]> = {
    '布甲': [16, 16, 0, 0, 0, 16], '皮甲': [12, 8, 4, 4, 4, 8], '轻甲': [4, 4, 8, 8, 8, 4],
    '重甲': [-4, -8, 12, 12, 12, -8], '板甲': [-16, -16, 16, 16, 16, -16]
  };
  const keys = ['accuracy', 'evasion', 'critResistBp', 'critDamageReductionBp', 'tenacity', 'speed'];
  const panelKeys = ['accuracyPct', 'evasionPct', 'critResistPct', 'critDamageReductionPct', 'tenacityPct', 'speedPct'];
  const scale = (slot === 'upper' || slot === 'lower' ? 1 : .75) * equipmentQualityMultiplier(quality);
  const values = largePercent[subtype] ?? [0, 0, 0, 0, 0, 0];
  return Object.fromEntries(keys.map((key, index) => [panelKeys[index], values[index] * scale]));
};
const armorSetPanel = (subtype: string, quality = 100) => {
  const slots = ['shoulder', 'upper', 'waist', 'lower', 'feet'];
  const factors: Record<string, number> = {};
  for (const slot of slots) {
    for (const [key, value] of Object.entries(armorPiecePercent(subtype, slot, quality))) factors[key] = (factors[key] ?? 1) * (1 + value / 100);
  }
  return Object.fromEntries(Object.entries(factors).map(([key, value]) => [key, (value - 1) * 100]));
};
const armorSetCorrections = (subtype: string, full: boolean) => {
  if (subtype === '布甲') return { hitCorrectionPct: full ? 33 : 16, evasionCorrectionPct: full ? 33 : 16 };
  if (subtype === '皮甲') return { hitCorrectionPct: full ? 25 : 12 };
  if (subtype === '重甲' && full) return { critAvoidanceCorrectionPct: 16, critDamageCorrectionPct: 16 };
  if (subtype === '板甲' && full) return { critAvoidanceCorrectionPct: 12, critDamageCorrectionPct: 12 };
  return {};
};

// 战旗使 Lv.30 满进化标准属性（项目导师训练值）
const playerAttributes = {
  constitution: 32 + .9 * playerGrowthShares(30), spirit: 22 + .5 * playerGrowthShares(30),
  strength: 48 + 1.3 * playerGrowthShares(30), intelligence: 20 + .4 * playerGrowthShares(30),
  agility: 24 + .6 * playerGrowthShares(30), perception: 30 + .8 * playerGrowthShares(30)
};

const buildEpicPlayer = (armorType: string) => {
  const level = 30;
  const base = derived(playerAttributes);
  const weaponPrimary = forgedEquipmentBase(level, '武器') * forgeRarityMultiplier['史诗'] * equipmentQualityMultiplier(100);
  const armorPrimary = ['shoulder', 'upper', 'waist', 'lower', 'feet'].reduce((sum, slot) => sum + forgedEquipmentBase(level, '防具', slot), 0) * forgeRarityMultiplier['史诗'] * equipmentQualityMultiplier(100);
  const flat: Stats = { hpMax: 0, mpMax: 0, physicalAttack: 0, magicAttack: 0, physicalDefense: 0, magicDefense: 0, accuracy: 0, evasion: 0, critRateBp: 0, critDamageBp: 0, critResistBp: 0, critDamageReductionBp: 0, tenacity: 0, tenacityPierce: 0, speed: 0 };
  flat.physicalAttack = weaponPrimary * 2;
  flat.physicalDefense = armorPrimary;
  flat.magicDefense = armorPrimary;
  // 主手史诗武器 4 条 + 副手史诗武器 4 条（副手按 50%）
  for (const affix of [...epicWeaponAffixes(), ...epicWeaponAffixes()]) {
    const scale = flat.physicalAttack ? 1 : .5;
    flat[affix.key] += affix.value * scale;
  }
  for (const slot of ['shoulder', 'upper', 'waist', 'lower', 'feet']) {
    for (const affix of epicArmorAffixes(slot)) flat[affix.key] += affix.value;
  }
  // 满进化、长剑精通（暴击+80%）、重甲/布甲 5 件、战旗使二转被动
  // 满进化、长剑精通、甲类 5 件、战旗使二转被动、公会餐食、附魔卡片级独立乘区
  const percent: Stats = {
    hpPct: 3 + 12 + 25 + 10,
    physicalAttackPct: 5 + 12 + 8,
    accuracyPct: 4 + 10 + 6,
    speedPct: 3 + 8,
    critDamagePct: 4 + 12,
    critRatePct: 80,
    physicalDefensePct: 15,
    magicDefensePct: 12
  };
  if (armorType === '布甲') percent.hpPct = 3 + 12 + 10;
  const armorPercent = armorSetPanel(armorType);
  // 甲类逐件属性并入百分比池（与 calculatePanelStats 的 armorPanelPercent 一致）
  for (const [key, value] of Object.entries(armorPercent)) percent[key] = Number(percent[key] ?? 0) + Number(value);
  const result: Stats = {};
  const panelKey: Record<string, string> = {
    hpMax: 'hpPct', mpMax: 'mpPct', physicalAttack: 'physicalAttackPct', magicAttack: 'magicAttackPct',
    physicalDefense: 'physicalDefensePct', magicDefense: 'magicDefensePct', accuracy: 'accuracyPct',
    evasion: 'evasionPct', critRateBp: 'critRatePct', critDamageBp: 'critDamagePct',
    critResistBp: 'critResistPct', critDamageReductionBp: 'critDamageReductionPct',
    tenacity: 'tenacityPct', tenacityPierce: 'tenacityPiercePct', speed: 'speedPct'
  };
  for (const key of Object.keys(base)) {
    const additive = Number(percent[panelKey[key]] ?? 0);
    result[key] = Math.floor((base[key] + Number(flat[key] ?? 0)) * (1 + additive / 100));
  }
  const corrections = armorSetCorrections(armorType, true);
  // 恩赐与战斗修正：战神眷顾 +16% 最终伤害；先知直觉 战斗中命中、暴击 +16%
  const combat: Partial<Combatant> = {
    damageBonusPct: 16,
    hitCorrectionPct: (corrections.hitCorrectionPct ?? 0),
    critAvoidanceCorrectionPct: corrections.critAvoidanceCorrectionPct ?? 0,
    critDamageCorrectionPct: corrections.critDamageCorrectionPct ?? 0,
    critRateCorrectionPct: 0,
    accuracy: Math.floor(result.accuracy * 1.16),
    crit: Math.floor(result.critRateBp * 1.16)
  };
  return { stats: result, corrections, armorType, combat };
};

// ---------- 怪物六维与虚拟装备 ----------
const bossTemplates: Record<string, { code: string; name: string; level: number; attrs: Record<string, number> }> = {
  gruen_mountainheart: {
    code: 'gruen_mountainheart', name: '山脉心核·格鲁恩', level: 32,
    attrs: { constitution: 96, spirit: 52, strength: 82, intelligence: 42, agility: 46, perception: 57, constitution_growth: 1.0, spirit_growth: .6, strength_growth: 1.0, intelligence_growth: .5, agility_growth: .5, perception_growth: .65 }
  },
  valk_forge_overseer: {
    code: 'valk_forge_overseer', name: '熔炉监工·瓦尔克', level: 32,
    attrs: { constitution: 74, spirit: 70, strength: 70, intelligence: 105, agility: 64, perception: 72, constitution_growth: .8, spirit_growth: .9, strength_growth: .75, intelligence_growth: 1.15, agility_growth: .7, perception_growth: .85 }
  },
  threehead_mother: {
    code: 'threehead_mother', name: '三首雾沼蛇母', level: 32,
    attrs: { constitution: 75, spirit: 88, strength: 56, intelligence: 95, agility: 90, perception: 92, constitution_growth: .75, spirit_growth: 1.0, strength_growth: .6, intelligence_growth: 1.05, agility_growth: 1.0, perception_growth: .9 }
  },
  necromancer_uz: {
    code: 'necromancer_uz', name: '死灵法师·乌兹', level: 32,
    attrs: { constitution: 68, spirit: 82, strength: 32, intelligence: 98, agility: 46, perception: 74, constitution_growth: 1.3, spirit_growth: 2.3, strength_growth: 1.0, intelligence_growth: 2.8, agility_growth: 1.4, perception_growth: 2.0 }
  },
  goblin_king: {
    code: 'goblin_king', name: '哥布林国王&哈巴龙', level: 32,
    attrs: { constitution: 18, spirit: 34, strength: 12, intelligence: 38, agility: 17, perception: 22, constitution_growth: 1.3, spirit_growth: 2.4, strength_growth: .7, intelligence_growth: 2.6, agility_growth: 1.0, perception_growth: 1.6 }
  },
  habadragon: {
    code: 'habadragon', name: '哈巴龙', level: 30,
    attrs: { constitution: 36, spirit: 8, strength: 35, intelligence: 6, agility: 24, perception: 18, constitution_growth: 2.7, spirit_growth: .3, strength_growth: 2.6, intelligence_growth: .4, agility_growth: 1.8, perception_growth: 1.2 }
  }
};

const difficultyTraits: Record<string, { statMultiplier: number; statMultipliers: Record<string, number> }> = {
  infernal: { statMultiplier: 1.60, statMultipliers: { hp: 8, physicalAttack: 1.45, magicAttack: 1.45, physicalDefense: 1.65, magicDefense: 1.65, accuracy: 1.60, evasion: 1.55, critRate: 1.40, critDamage: 1.40, critResist: 2.00, critReduction: 2.00, tenacity: 2.50, speed: 1.45 } },
  abyssal: { statMultiplier: 1.85, statMultipliers: { hp: 12, physicalAttack: 1.55, magicAttack: 1.55, physicalDefense: 1.80, magicDefense: 1.80, accuracy: 1.80, evasion: 1.70, critRate: 1.50, critDamage: 1.50, critResist: 2.50, critReduction: 2.50, tenacity: 3.20, speed: 1.65 } },
  crimson: { statMultiplier: 2.50, statMultipliers: { hp: 14, physicalAttack: 2.00, magicAttack: 2.00, physicalDefense: 2.05, magicDefense: 2.05, accuracy: 2.25, evasion: 2.00, critRate: 1.90, critDamage: 2.00, critResist: 3.00, critReduction: 3.00, tenacity: 4.00, speed: 2.30 } },
  corrupted: { statMultiplier: 2.15, statMultipliers: { hp: 25, physicalAttack: 1.65, magicAttack: 1.65, physicalDefense: 2.45, magicDefense: 2.45, accuracy: 2.10, evasion: 2.00, critRate: 1.55, critDamage: 1.55, critResist: 5.00, critReduction: 5.60, tenacity: 5.50, speed: 1.90 } },
  holy: { statMultiplier: 2.25, statMultipliers: { hp: 20, physicalAttack: 1.70, magicAttack: 1.70, physicalDefense: 2.20, magicDefense: 2.20, accuracy: 2.25, evasion: 2.55, critRate: 1.60, critDamage: 1.60, critResist: 4.30, critReduction: 4.80, tenacity: 5.00, speed: 2.80 } },
  golden: { statMultiplier: 2.70, statMultipliers: { hp: 24, physicalAttack: 1.85, magicAttack: 1.85, physicalDefense: 2.60, magicDefense: 2.60, accuracy: 2.55, evasion: 2.60, critRate: 1.70, critDamage: 1.70, critResist: 5.30, critReduction: 6.00, tenacity: 7.00, speed: 3.00 } },
  brilliant: { statMultiplier: 3.10, statMultipliers: { hp: 30, physicalAttack: 2.00, magicAttack: 2.00, physicalDefense: 3.10, magicDefense: 3.10, accuracy: 3.00, evasion: 3.15, critRate: 1.85, critDamage: 1.85, critResist: 6.50, critReduction: 7.50, tenacity: 12.00, speed: 3.50 } },
  dreamlike: { statMultiplier: 3.60, statMultipliers: { hp: 38, physicalAttack: 2.15, magicAttack: 2.15, physicalDefense: 3.60, magicDefense: 3.60, accuracy: 3.40, evasion: 3.50, critRate: 2.00, critDamage: 2.00, critResist: 8.00, critReduction: 9.50, tenacity: 20.00, speed: 4.20 } }
};

const difficultyNames: Record<string, string> = {
  infernal: '深渊的', abyssal: '地狱的', crimson: '猩红的', corrupted: '腐化的',
  holy: '神圣的', golden: '黄金的', brilliant: '璀璨的', dreamlike: '梦幻的'
};

const hiddenLevelPressure = (monsterLevel: number, playerLevel: number) => Math.pow(1.1, Math.max(0, monsterLevel - playerLevel));

type BossStats = Stats & { hpMax: number; mpMax: number };
const monsterGrowthAnchors: Record<string, number> = {
  gruen_mountainheart: 32, valk_forge_overseer: 35, threehead_mother: 38,
  necromancer_uz: 32, goblin_king: 32, habadragon: 30
};
const monsterGrowthCoefficient = (code: string) => {
  const anchor = monsterGrowthAnchors[code] ?? 32;
  return (anchor - 1) / playerGrowthShares(anchor);
};
const monsterGrowthAllocation = (template: Record<string, number>, code: string, level: number) => {
  const shares = playerGrowthShares(level) * monsterGrowthCoefficient(code);
  return Object.fromEntries(['constitution', 'spirit', 'strength', 'intelligence', 'agility', 'perception'].map(key => [key, Math.floor(template[key] + template[`${key}_growth`] * shares + 1e-9)]));
};
const virtualEquipmentStats = (level: number, tier: 'normal' | 'large' | 'elite' | 'boss', physicalAttack: number, magicAttack: number) => {
  const loadout: Record<string, { rarity: string; quality: number; secondaryAffixes: number }> = {
    normal: { rarity: '普通', quality: 0, secondaryAffixes: 0 },
    large: { rarity: '普通', quality: 100, secondaryAffixes: 0 },
    elite: { rarity: '优秀', quality: 100, secondaryAffixes: 1 },
    boss: { rarity: '精良', quality: 100, secondaryAffixes: 2 }
  }[tier];
  const primaryMultiplier = forgeRarityMultiplier[loadout.rarity] * equipmentQualityMultiplier(loadout.quality);
  const weapon = forgedEquipmentBase(level, '武器') * primaryMultiplier;
  const armor = weapon / 5;
  const bonus: Stats = { hpMax: 0, mpMax: 0, physicalAttack: 0, magicAttack: 0, physicalDefense: 0, magicDefense: 0, accuracy: 0, evasion: 0, critRateBp: 0, critDamageBp: 0, critResistBp: 0, critDamageReductionBp: 0, tenacity: 0, tenacityPierce: 0, speed: 0 };
  bonus[physicalAttack >= magicAttack ? 'physicalAttack' : 'magicAttack'] = weapon;
  bonus.physicalDefense = armor * 5;
  bonus.magicDefense = armor * 5;
  if (loadout.secondaryAffixes) {
    const expect = .62 * equipmentQualityMultiplier(loadout.quality) * loadout.secondaryAffixes;
    const weaponKeys = affixKeys.filter(key => !['physicalDefense', 'magicDefense', 'hpMax', 'tenacity'].includes(key) && !['physicalAttack', 'magicAttack'].includes(key));
    const armorKeys = affixKeys.filter(key => !['physicalAttack', 'magicAttack', 'mpMax', 'tenacityPierce'].includes(key));
    for (const key of weaponKeys) bonus[key] += forgedAffixCap('武器', key, level, loadout.rarity) * expect / (weaponKeys.length + elementNames.length * .5);
    for (const key of armorKeys) bonus[key] += forgedAffixCap('防具', key, level, loadout.rarity) * expect / (armorKeys.length + elementNames.length * .5) * 5;
  }
  for (const key of Object.keys(bonus)) bonus[key] = Math.floor(bonus[key]);
  return bonus;
};
const bossStatsFor = (code: string, difficulty: string): BossStats => {
  const template = bossTemplates[code];
  const allocation = monsterGrowthAllocation(template.attrs, code, template.level);
  const base = derived(allocation);
  const weaponReference = derived(Object.fromEntries(['constitution', 'spirit', 'strength', 'intelligence', 'agility', 'perception'].map(key => [key, template.attrs[key] + template.attrs[`${key}_growth`] * (template.level - 1)])));
  const virtual = virtualEquipmentStats(template.level, 'boss', weaponReference.physicalAttack, weaponReference.magicAttack);
  const raw: Stats = {
    ...base,
    hpMax: base.hpMax + virtual.hpMax,
    mpMax: base.mpMax + virtual.mpMax,
    physicalAttack: base.physicalAttack + virtual.physicalAttack,
    magicAttack: base.magicAttack + virtual.magicAttack,
    physicalDefense: base.physicalDefense + virtual.physicalDefense,
    magicDefense: base.magicDefense + virtual.magicDefense,
    accuracy: base.accuracy + virtual.accuracy,
    evasion: base.evasion + virtual.evasion,
    critRateBp: base.critRateBp + virtual.critRateBp,
    critDamageBp: base.critDamageBp + virtual.critDamageBp,
    critResistBp: base.critResistBp + virtual.critResistBp,
    critDamageReductionBp: base.critDamageReductionBp + virtual.critDamageReductionBp,
    tenacity: base.tenacity + virtual.tenacity,
    tenacityPierce: base.tenacityPierce + virtual.tenacityPierce,
    speed: base.speed + virtual.speed
  };
  const trait = difficultyTraits[difficulty];
  const multiplierFor = (stat?: string) => stat ? (trait.statMultipliers[stat] ?? trait.statMultiplier) : trait.statMultiplier;
  const scaled = (value: number, stat?: string) => Math.floor(value * multiplierFor(stat));
  const pressure = hiddenLevelPressure(template.level, 30);
  const result: BossStats = {
    hpMax: scaled(raw.hpMax, 'hp'),
    mpMax: scaled(raw.mpMax),
    physicalAttack: scaled(raw.physicalAttack, 'physicalAttack'),
    magicAttack: scaled(raw.magicAttack, 'magicAttack'),
    physicalDefense: scaled(raw.physicalDefense, 'physicalDefense'),
    magicDefense: scaled(raw.magicDefense, 'magicDefense'),
    accuracy: scaled(raw.accuracy, 'accuracy') * pressure,
    evasion: scaled(raw.evasion, 'evasion') * pressure,
    critRateBp: scaled(raw.critRateBp, 'critRate') * pressure,
    critDamageBp: scaled(raw.critDamageBp, 'critDamage') * pressure,
    critResistBp: scaled(raw.critResistBp, 'critResist') * pressure,
    critDamageReductionBp: scaled(raw.critDamageReductionBp, 'critReduction') * pressure,
    tenacity: scaled(raw.tenacity, 'tenacity') * pressure,
    tenacityPierce: scaled(raw.tenacityPierce) * pressure,
    speed: scaled(raw.speed, 'speed') * pressure
  };
  for (const key of Object.keys(result)) result[key] = Math.floor(result[key]);
  return result;
};

// ---------- 战斗公式 ----------
const opposedChance = (offense: number, defense: number) => 1 - Math.pow(.5, Math.max(0, offense) / Math.max(1, defense));
const opposedCritBonus = (critDamage: number, critReduction: number) => 2 * (1 - Math.pow(.5, Math.max(0, critDamage) / Math.max(1, critReduction)));

type Combatant = {
  name: string; level: number; hp: number; hpMax: number; mp: number; mpMax: number;
  attack: number; magic: number; defense: number; magicDefense: number; accuracy: number; evasion: number;
  crit: number; critResist: number; critDamage: number; critReduction: number; tenacity: number; speed: number;
  mastery: Record<string, number>; resistance: Record<string, number>;
  hitCorrectionPct: number; evasionCorrectionPct: number; critRateCorrectionPct: number; critAvoidanceCorrectionPct: number; critDamageCorrectionPct: number;
  damageBonusPct: number; magicDamagePct: number; lightSkillBonusPct: number;
  damageReductionPct: number; physicalDamageReductionPct: number; magicDamageReductionPct: number;
  buffs: Record<string, number>; debuffs: Record<string, number>;
  isBoss: boolean;
};

const makePlayer = (armorType = '重甲'): Combatant => {
  const build = buildEpicPlayer(armorType);
  const s = build.stats;
  return {
    name: `Lv.30史诗二转战旗使(${build.armorType})`, level: 30,
    hp: s.hpMax, hpMax: s.hpMax, mp: s.mpMax, mpMax: s.mpMax,
    attack: s.physicalAttack, magic: s.magicAttack,
    defense: s.physicalDefense, magicDefense: s.magicDefense,
    accuracy: build.combat?.accuracy ?? s.accuracy, evasion: s.evasion,
    crit: build.combat?.crit ?? s.critRateBp, critResist: s.critResistBp,
    critDamage: s.critDamageBp, critReduction: s.critDamageReductionBp,
    tenacity: s.tenacity, speed: s.speed,
    mastery: {}, resistance: {},
    hitCorrectionPct: build.combat?.hitCorrectionPct ?? 0,
    evasionCorrectionPct: build.corrections.evasionCorrectionPct ?? 0,
    critRateCorrectionPct: build.combat?.critRateCorrectionPct ?? 0,
    critAvoidanceCorrectionPct: build.combat?.critAvoidanceCorrectionPct ?? 0,
    critDamageCorrectionPct: build.combat?.critDamageCorrectionPct ?? 0,
    damageBonusPct: build.combat?.damageBonusPct ?? 0, magicDamagePct: 0, lightSkillBonusPct: 0,
    damageReductionPct: 0, physicalDamageReductionPct: 0, magicDamageReductionPct: 0,
    buffs: {}, debuffs: {}, isBoss: false
  };
};

const makeBoss = (code: string, difficulty: string): Combatant => {
  const stats = bossStatsFor(code, difficulty);
  return {
    name: `${difficultyNames[difficulty]}${bossTemplates[code].name}`, level: bossTemplates[code].level,
    hp: stats.hpMax, hpMax: stats.hpMax, mp: stats.mpMax, mpMax: stats.mpMax,
    attack: stats.physicalAttack, magic: stats.magicAttack,
    defense: stats.physicalDefense, magicDefense: stats.magicDefense,
    accuracy: stats.accuracy, evasion: stats.evasion,
    crit: stats.critRateBp, critResist: stats.critResistBp,
    critDamage: stats.critDamageBp, critReduction: stats.critDamageReductionBp,
    tenacity: stats.tenacity, speed: stats.speed,
    mastery: {}, resistance: {},
    hitCorrectionPct: 0, evasionCorrectionPct: 0, critRateCorrectionPct: 0, critAvoidanceCorrectionPct: 0, critDamageCorrectionPct: 0,
    damageBonusPct: 0, magicDamagePct: 0, lightSkillBonusPct: 0,
    damageReductionPct: 0, physicalDamageReductionPct: 0, magicDamageReductionPct: 0,
    buffs: {}, debuffs: {}, isBoss: true
  };
};

const additiveFactor = (bonus: number, reduction: number, min = -80, max = 150) => clamp(1 + (bonus - reduction) / 100, 1 + min / 100, 1 + max / 100);
const value = (unit: Combatant, code: string) => Number(unit.buffs[code] ?? 0) - Number(unit.debuffs[code] ?? 0);

const strike = (source: Combatant, target: Combatant, power: number, element: string, magic: boolean, skill: boolean) => {
  let attack = magic ? source.magic : source.attack;
  attack = Math.floor(attack * power / 100);
  attack = Math.floor(attack * additiveFactor(value(source, magic ? 'magic' : 'attack') + value(source, 'battle_cry'), 0));
  const defenseDown = magic ? value(target, 'magic_shatter') : value(target, 'armor_shatter') + value(target, 'vulnerability');
  const defense = Math.floor((magic ? target.magicDefense : target.defense) * additiveFactor(value(target, magic ? 'magic_defense' : 'defense'), defenseDown, -90, 250));
  const hitChance = opposedChance(source.accuracy + value(source, 'accuracy'), target.evasion * (1 + value(target, 'evasion') / 100) * (1 - clamp(value(target, 'bind') + value(target, 'evasion_down'), 0, 90) / 100));
  const corrected = clamp(hitChance + (1 - hitChance) * source.hitCorrectionPct / 100, 0, 1) * (1 - target.evasionCorrectionPct / 100);
  if (Math.random() >= corrected) return { hit: false, crit: false, damage: 0, raw: 0 };
  const critChance = opposedChance(source.crit + value(source, 'crit_bonus'), target.critResist);
  const critCorrected = (critChance + (1 - critChance) * source.critRateCorrectionPct / 100) * (1 - target.critAvoidanceCorrectionPct / 100);
  const critical = Math.random() < critCorrected;
  const critBonus = opposedCritBonus(source.critDamage, target.critReduction) * (1 - target.critDamageCorrectionPct / 100);
  let raw = attack * attack / (attack + Math.max(1, defense));
  if (critical) raw *= 1 + critBonus;
  raw *= .9 + Math.random() * .2;
  raw *= clamp(1 + ((source.mastery[element] ?? 0) - (target.resistance[element] ?? 0)) / 100, .1, 3);
  const bonus = source.damageBonusPct + (magic ? source.magicDamagePct : 0) + (skill && element === '光' ? source.lightSkillBonusPct : 0);
  const reduction = target.damageReductionPct + (magic ? target.magicDamageReductionPct : target.physicalDamageReductionPct) + value(target, 'reduction');
  raw *= additiveFactor(bonus + value(target, 'exposed'), reduction);
  const damage = Math.max(1, Math.floor(raw));
  target.hp = Math.max(0, target.hp - damage);
  return { hit: true, crit: critical, damage, raw };
};

type Skill = { code: string; name: string; magic: boolean; element: string; power: number; mana: number; cooldown: number; scope: 'single' | 'all' | 'utility'; debuff?: string; debuffValue?: number; buff?: string; buffValue?: number };
const skills: Record<string, Skill> = {
  warlord_break_formation: { code: 'warlord_break_formation', name: '破阵军令', magic: false, element: '无', power: 130, mana: 190, cooldown: 3, scope: 'single', debuff: 'exposed', debuffValue: 12 },
  warlord_quake_command: { code: 'warlord_quake_command', name: '震地号令', magic: false, element: '无', power: 80, mana: 110, cooldown: 3, scope: 'all', debuff: 'slow', debuffValue: 12 },
  warlord_triumph_banner: { code: 'warlord_triumph_banner', name: '凯旋战旗', magic: false, element: '无', power: 0, mana: 300, cooldown: 4, scope: 'utility', buff: 'battle_cry', buffValue: 25 },
  warlord_hundred_battle_sweep: { code: 'warlord_hundred_battle_sweep', name: '百战横扫', magic: false, element: '无', power: 146, mana: 420, cooldown: 6, scope: 'all' },
  heavy_strike: { code: 'heavy_strike', name: '重斩', magic: false, element: '无', power: 125, mana: 44, cooldown: 2, scope: 'single' },
  gruen_fault_sunder: { code: 'gruen_fault_sunder', name: '断层碎甲', magic: false, element: '土', power: 120, mana: 92, cooldown: 2, scope: 'single', debuff: 'armor_shatter', debuffValue: 16 },
  gruen_riftfall: { code: 'gruen_riftfall', name: '裂谷坠压', magic: false, element: '土', power: 98, mana: 112, cooldown: 3, scope: 'all', debuff: 'slow', debuffValue: 16 },
  gruen_corequake: { code: 'gruen_corequake', name: '山心崩震', magic: false, element: '土', power: 139, mana: 138, cooldown: 5, scope: 'all', debuff: 'bind', debuffValue: 18 },
  gruen_stoneward: { code: 'gruen_stoneward', name: '山心护层', magic: false, element: '土', power: 0, mana: 86, cooldown: 4, scope: 'utility' },
  valk_slag_brand: { code: 'valk_slag_brand', name: '炉渣烙印', magic: true, element: '火', power: 112, mana: 96, cooldown: 2, scope: 'single', debuff: 'burn', debuffValue: 5 },
  valk_chain_draw: { code: 'valk_chain_draw', name: '锁链拖拽', magic: true, element: '火', power: 77, mana: 44, cooldown: 3, scope: 'all', debuff: 'bind', debuffValue: 10 },
  valk_anvil_sentence: { code: 'valk_anvil_sentence', name: '铁砧裁决', magic: false, element: '火', power: 128, mana: 118, cooldown: 3, scope: 'single', debuff: 'armor_shatter', debuffValue: 14 },
  valk_furnace_overdrive: { code: 'valk_furnace_overdrive', name: '赤炉过载', magic: true, element: '火', power: 139, mana: 136, cooldown: 5, scope: 'all', debuff: 'burn', debuffValue: 5 },
  threehead_venom_fang: { code: 'threehead_venom_fang', name: '腐毒獠牙', magic: false, element: '木', power: 130, mana: 36, cooldown: 2, scope: 'single', debuff: 'poison', debuffValue: 3 },
  threehead_mist_lash: { code: 'threehead_mist_lash', name: '雾沼鞭挞', magic: true, element: '风', power: 91, mana: 104, cooldown: 3, scope: 'all', debuff: 'wind', debuffValue: 25 },
  threehead_rootcoil: { code: 'threehead_rootcoil', name: '根沼绞缠', magic: false, element: '木', power: 105, mana: 98, cooldown: 3, scope: 'single', debuff: 'root', debuffValue: 1 },
  threehead_swallow: { code: 'threehead_swallow', name: '三首吞噬', magic: false, element: '木', power: 132, mana: 52, cooldown: 4, scope: 'single' },
  threehead_brood_regrow: { code: 'threehead_brood_regrow', name: '蜕茧回生', magic: false, element: '木', power: 0, mana: 110, cooldown: 5, scope: 'utility' },
  uzz_gravebrand: { code: 'uzz_gravebrand', name: '葬印蚀魂', magic: true, element: '暗', power: 108, mana: 98, cooldown: 2, scope: 'single', debuff: 'magic_shatter', debuffValue: 12 },
  uzz_marrow_lash: { code: 'uzz_marrow_lash', name: '髓骨缚鞭', magic: true, element: '暗', power: 104, mana: 102, cooldown: 3, scope: 'single', debuff: 'root', debuffValue: 1 },
  uzz_choir_of_graves: { code: 'uzz_choir_of_graves', name: '墓群和鸣', magic: true, element: '暗', power: 98, mana: 116, cooldown: 3, scope: 'all', debuff: 'fear', debuffValue: 1 },
  uzz_soul_reaping: { code: 'uzz_soul_reaping', name: '噬魂收割', magic: true, element: '暗', power: 134, mana: 128, cooldown: 4, scope: 'single', debuff: 'exposed', debuffValue: 12 },
  uzz_phylactery_turn: { code: 'uzz_phylactery_turn', name: '魂匣折返', magic: false, element: '暗', power: 0, mana: 116, cooldown: 5, scope: 'utility' },
  habadragon_royal_charge: { code: 'habadragon_royal_charge', name: '横冲冲阵', magic: false, element: '无', power: 132, mana: 29, cooldown: 2, scope: 'single', debuff: 'imbalance', debuffValue: 16 },
  habadragon_royal_stomp: { code: 'habadragon_royal_stomp', name: '王庭践踏', magic: false, element: '无', power: 98, mana: 36, cooldown: 3, scope: 'all', debuff: 'slow', debuffValue: 12 },
  habadragon_royal_tail_sweep: { code: 'habadragon_royal_tail_sweep', name: '横尾追阵', magic: false, element: '无', power: 90, mana: 33, cooldown: 3, scope: 'all' },
  habadragon_royal_cataclysm_trample: { code: 'habadragon_royal_cataclysm_trample', name: '雷震践踏', magic: false, element: '无', power: 139, mana: 52, cooldown: 5, scope: 'all' },
  goblin_king_thunder_edict: { code: 'goblin_king_thunder_edict', name: '王令雷击', magic: true, element: '雷', power: 138, mana: 78, cooldown: 2, scope: 'single', debuff: 'imbalance', debuffValue: 15 },
  goblin_king_stormchain: { code: 'goblin_king_stormchain', name: '王庭连雷', magic: true, element: '雷', power: 111, mana: 110, cooldown: 4, scope: 'all', debuff: 'bind', debuffValue: 18 },
  goblin_king_regal_conduct: { code: 'goblin_king_regal_conduct', name: '王权导律', magic: false, element: '雷', power: 0, mana: 96, cooldown: 5, scope: 'utility', buff: 'attack', buffValue: 20 }
};

const applySkillEffect = (skill: Skill, target: Combatant, source: Combatant) => {
  if (skill.debuff) target.debuffs[skill.debuff] = Math.max(target.debuffs[skill.debuff] ?? 0, skill.debuffValue ?? 1);
  if (skill.buff) source.buffs[skill.buff] = Math.max(source.buffs[skill.buff] ?? 0, skill.buffValue ?? 0);
};
const tickStatus = (unit: Combatant) => {
  for (const key of Object.keys(unit.buffs)) unit.buffs[key] = Math.max(0, Number(unit.buffs[key]) - 1);
  for (const key of Object.keys(unit.debuffs)) unit.debuffs[key] = Math.max(0, Number(unit.debuffs[key]) - 1);
};

const bossRotations: Record<string, string[]> = {
  gruen_mountainheart: ['gruen_fault_sunder', 'gruen_riftfall', 'gruen_fault_sunder', 'gruen_corequake'],
  valk_forge_overseer: ['valk_slag_brand', 'valk_chain_draw', 'valk_slag_brand', 'valk_furnace_overdrive'],
  threehead_mother: ['threehead_venom_fang', 'threehead_mist_lash', 'threehead_rootcoil', 'threehead_swallow'],
  necromancer_uz: ['uzz_gravebrand', 'uzz_marrow_lash', 'uzz_choir_of_graves', 'uzz_soul_reaping'],
  goblin_king: ['habadragon_royal_charge', 'habadragon_royal_stomp', 'habadragon_royal_tail_sweep', 'habadragon_royal_cataclysm_trample', 'goblin_king_thunder_edict', 'goblin_king_stormchain']
};

const simulate = (bossCode: string, difficulty: string, player: Combatant): { win: boolean; turn: number; playerHpLeft: number; bossHpLeft: number } => {
  const boss = makeBoss(bossCode, difficulty);
  let turn = 0;
  let rotation = 0;
  const playerCooldowns: Record<string, number> = {};
  const bossCooldowns: Record<string, number> = {};
  const statusTick = (cds: Record<string, number>) => { for (const key of Object.keys(cds)) cds[key] = Math.max(0, cds[key] - 1); };
  const canCast = (cds: Record<string, number>, skill: Skill) => (cds[skill.code] ?? 0) <= 0 && player.mp >= skill.mana;
  const playerTurn = () => {
    statusTick(playerCooldowns);
    const rotationSkills = ['warlord_break_formation', 'heavy_strike', 'warlord_break_formation', 'warlord_hundred_battle_sweep'];
    let skill: Skill | undefined;
    for (const code of rotationSkills) {
      const candidate = skills[code];
      if (candidate && canCast(playerCooldowns, candidate)) { skill = candidate; break; }
    }
    if (!skill && canCast(playerCooldowns, skills.warlord_quake_command)) skill = skills.warlord_quake_command;
    if (skill) {
      player.mp -= skill.mana;
      playerCooldowns[skill.code] = skill.cooldown + 1;
      if (skill.scope === 'utility') applySkillEffect(skill, boss, player);
      else {
        const result = strike(player, boss, skill.power, skill.element, skill.magic, true);
        if (result.hit) applySkillEffect(skill, boss, player);
      }
    } else strike(player, boss, 100, '无', false, false);
    tickStatus(player);
    tickStatus(boss);
  };
  const bossTurn = () => {
    statusTick(bossCooldowns);
    const rotationList = bossRotations[bossCode];
    let skill: Skill | undefined;
    const hpRatio = boss.hp / boss.hpMax;
    if (bossCode === 'gruen_mountainheart' && hpRatio <= .68 && !bossCooldowns.stonewardUsed) {
      bossCooldowns.stonewardUsed = 1;
      skill = skills.gruen_stoneward;
    } else if (bossCode === 'threehead_mother' && hpRatio <= .48 && !bossCooldowns.regrowUsed) {
      bossCooldowns.regrowUsed = 1;
      skill = skills.threehead_brood_regrow;
    } else if (bossCode === 'necromancer_uz' && hpRatio <= .55 && !bossCooldowns.phylacteryUsed) {
      bossCooldowns.phylacteryUsed = 1;
      skill = skills.uzz_phylactery_turn;
    }
    if (!skill) {
      for (let i = 0; i < rotationList.length; i++) {
        const candidate = skills[rotationList[(rotation + i) % rotationList.length]];
        if (candidate && (bossCooldowns[candidate.code] ?? 0) <= 0 && boss.mp >= candidate.mana) {
          skill = candidate;
          rotation = (rotation + 1) % rotationList.length;
          break;
        }
      }
    }
    if (skill) {
      boss.mp -= skill.mana;
      bossCooldowns[skill.code] = skill.cooldown + 1;
      if (skill.scope === 'utility') {
        if (skill.code === 'gruen_stoneward') boss.hp = Math.min(boss.hpMax, boss.hp + boss.hpMax * .10);
        if (skill.code === 'threehead_brood_regrow') boss.hp = Math.min(boss.hpMax, boss.hp + boss.hpMax * .12);
        if (skill.code === 'uzz_phylactery_turn') boss.hp = Math.min(boss.hpMax, boss.hp + boss.hpMax * .11);
        applySkillEffect(skill, player, boss);
      } else {
        const result = strike(boss, player, skill.power, skill.element, skill.magic, true);
        if (result.hit) applySkillEffect(skill, player, boss);
      }
    } else strike(boss, player, 100, '无', false, false);
    tickStatus(boss);
    tickStatus(player);
  };
  while (turn < 60) {
    turn++;
    const playerFirst = player.speed >= boss.speed;
    if (playerFirst) { playerTurn(); if (boss.hp <= 0) break; bossTurn(); }
    else { bossTurn(); if (player.hp <= 0) break; playerTurn(); }
    if (boss.hp <= 0 || player.hp <= 0) break;
  }
  return { win: boss.hp <= 0 && player.hp > 0, turn, playerHpLeft: player.hp, bossHpLeft: boss.hp };
};

const label = (key: string) => ({ hpMax: 'HP', mpMax: 'MP', physicalAttack: '物攻', magicAttack: '魔攻', physicalDefense: '物防', magicDefense: '魔防', accuracy: '命中', evasion: '闪避', critRateBp: '暴击', critDamageBp: '暴伤', critResistBp: '暴抗', critDamageReductionBp: '暴免', tenacity: '韧性', tenacityPierce: '破韧', speed: '速度' }[key] ?? key);
const bosses = ['goblin_king', 'gruen_mountainheart', 'valk_forge_overseer', 'threehead_mother', 'necromancer_uz'];
const difficulties = ['infernal', 'abyssal', 'crimson', 'corrupted', 'holy', 'golden', 'brilliant', 'dreamlike'];

const samples = 120;
for (const armorType of ['重甲', '布甲']) {
  const player = makePlayer(armorType);
  console.log(`\n===== 模拟角色：Lv.30 史诗二转战旗使（${armorType}套） =====`);
  console.log(Object.entries(player).filter(([key]) => ['hpMax', 'mpMax', 'attack', 'magic', 'defense', 'magicDefense', 'accuracy', 'evasion', 'crit', 'critDamage', 'critResist', 'critReduction', 'tenacity', 'speed'].includes(key)).map(([key, value]) => `${label(key)} ${value}`).join('｜'));
  console.log(`甲类修正：命中补正+${player.hitCorrectionPct}%｜闪避修正+${player.evasionCorrectionPct}%`);
  for (const bossCode of bosses) {
    console.log(`\n--- ${bossTemplates[bossCode].name} ---`);
    for (const difficulty of difficulties) {
      let wins = 0, turns = 0, hpLeft = 0;
      for (let i = 0; i < samples; i++) {
        const result = simulate(bossCode, difficulty, makePlayer(armorType));
        if (result.win) { wins++; turns += result.turn; hpLeft += result.playerHpLeft; }
      }
      const winRate = Math.round(wins / samples * 100);
      const avgTurn = wins ? Math.round(turns / wins * 10) / 10 : 0;
      const avgHp = wins ? Math.round(hpLeft / wins) : 0;
      const stats = bossStatsFor(bossCode, difficulty);
      console.log(`${difficultyNames[difficulty]}｜胜率 ${winRate}%｜均回合 ${avgTurn}｜余血 ${avgHp}/${player.hpMax}｜BossHP ${stats.hpMax}｜攻 ${stats.physicalAttack}/${stats.magicAttack}｜防 ${stats.physicalDefense}/${stats.magicDefense}｜闪 ${stats.evasion}｜韧 ${stats.tenacity}`);
    }
  }
}
