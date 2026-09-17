import { monsterCardData } from './monster-card-data.generated';

export type MonsterCardTier = 'normal' | 'large' | 'elite' | 'boss';
export type EquipmentSlot = 'weapon' | 'offhand' | 'shoulder' | 'upper' | 'waist' | 'lower' | 'feet' | 'necklace' | 'bracelet' | 'ring';
export type MonsterCardSourcePolicy = 'kill' | 'source_boss' | 'city_pursuit';
export type MonsterCardEffects = Record<string, number | string | boolean>;

export type MonsterCardDefinition = {
  cardCode: string;
  monsterCode: string;
  monsterName: string;
  name: string;
  level: number;
  minimumEquipmentLevel: number;
  tier: MonsterCardTier;
  allowedSlots: EquipmentSlot[];
  effectText: string;
  effects: MonsterCardEffects;
  sourcePolicy: MonsterCardSourcePolicy;
  pursuitRank?: string;
  version: 2;
  baseDropRate: number;
};

const number = String.raw`([+-]?\d+(?:\.\d+)?)`;
const element = String.raw`([金木水火土风雷冰光暗])`;
const statPatterns: Array<[RegExp, string]> = [
  [new RegExp(`^生命上限 \\+${number}$`, 'u'), 'hpMax'],
  [new RegExp(`^魔力上限 \\+${number}$`, 'u'), 'mpMax'],
  [new RegExp(`^物理攻击 \\+${number}$`, 'u'), 'physicalAttack'],
  [new RegExp(`^魔法攻击 \\+${number}$`, 'u'), 'magicAttack'],
  [new RegExp(`^物理防御 \\+${number}$`, 'u'), 'physicalDefense'],
  [new RegExp(`^魔法防御 \\+${number}$`, 'u'), 'magicDefense'],
  [new RegExp(`^命中 \\+${number}$`, 'u'), 'accuracy'],
  [new RegExp(`^闪避 \\+${number}$`, 'u'), 'evasion'],
  [new RegExp(`^速度 \\+${number}$`, 'u'), 'speed'],
  [new RegExp(`^暴击(?:评分)? \\+${number}$`, 'u'), 'critRateBp'],
  [new RegExp(`^暴伤(?:评分)? \\+${number}$`, 'u'), 'critDamageBp'],
  [new RegExp(`^暴免(?:评分)? \\+${number}$`, 'u'), 'critResistBp'],
  [new RegExp(`^暴抗(?:评分)? \\+${number}$`, 'u'), 'critDamageReductionBp'],
  [new RegExp(`^韧性 \\+${number}$`, 'u'), 'tenacity'],
  [new RegExp(`^破韧 \\+${number}$`, 'u'), 'tenacityPierce']
];

const setNumber = (effects: MonsterCardEffects, key: string, value: string | number) => {
  effects[key] = Number(effects[key] ?? 0) + Number(value);
};

const parseEffectPart = (part: string, effects: MonsterCardEffects) => {
  for (const [pattern, key] of statPatterns) {
    const match = pattern.exec(part);
    if (match) { setNumber(effects, key, match[1]); return true; }
  }
  let match = new RegExp(`^${element}元素精通 \\+${number}$`, 'u').exec(part);
  if (match) { setNumber(effects, `elementMastery_${match[1]}`, match[2]); return true; }
  match = new RegExp(`^${element}元素抗性 \\+${number}$`, 'u').exec(part);
  if (match) { setNumber(effects, `elementResistance_${match[1]}`, match[2]); return true; }
  match = new RegExp(`^木、火、风元素精通各 \\+${number}$`, 'u').exec(part);
  if (match) { for (const value of ['木', '火', '风']) setNumber(effects, `elementMastery_${value}`, match[1]); return true; }
  match = new RegExp(`^命中修正 \\+${number}%$`, 'u').exec(part);
  if (match) { setNumber(effects, 'hitCorrectionPct', match[1]); return true; }
  match = new RegExp(`^闪避修正 \\+${number}%$`, 'u').exec(part);
  if (match) { setNumber(effects, 'evasionCorrectionPct', match[1]); return true; }
  match = new RegExp(`^暴免修正 \\+${number}%$`, 'u').exec(part);
  if (match) { setNumber(effects, 'critAvoidanceCorrectionPct', match[1]); return true; }
  match = new RegExp(`^暴抗修正 \\+${number}%$`, 'u').exec(part);
  if (match) { setNumber(effects, 'critDamageCorrectionPct', match[1]); return true; }
  match = new RegExp(`^实际命中 \\+${number} 个百分点$`, 'u').exec(part);
  if (match) { setNumber(effects, 'actualHitRatePct', match[1]); return true; }
  match = new RegExp(`^实际暴击 \\+${number} 个百分点$`, 'u').exec(part);
  if (match) { setNumber(effects, 'actualCritRatePct', match[1]); return true; }
  match = new RegExp(`^承受伤害降低 ${number}%$`, 'u').exec(part);
  if (match) { setNumber(effects, 'cardDamageReductionPct', match[1]); return true; }
  match = new RegExp(`^承受物理伤害降低 ${number}%$`, 'u').exec(part);
  if (match) { setNumber(effects, 'cardPhysicalDamageReductionPct', match[1]); return true; }
  match = new RegExp(`^承受魔法伤害降低 ${number}%$`, 'u').exec(part);
  if (match) { setNumber(effects, 'cardMagicDamageReductionPct', match[1]); return true; }
  match = new RegExp(`^承受${element}元素伤害降低 ${number}%$`, 'u').exec(part);
  if (match) { setNumber(effects, `elementDamageReductionPct_${match[1]}`, match[2]); return true; }
  match = new RegExp(`^${element}元素伤害提高 ${number}%$`, 'u').exec(part);
  if (match) { setNumber(effects, `elementDamageBonusPct_${match[1]}`, match[2]); return true; }
  match = new RegExp(`^主动治疗量 \\+${number}%$`, 'u').exec(part);
  if (match) { setNumber(effects, 'activeHealingBonusPct', match[1]); return true; }
  match = new RegExp(`^生命上限提高 ${number}%$`, 'u').exec(part);
  if (match) { setNumber(effects, 'hpIndependentPct', match[1]); return true; }
  match = new RegExp(`^攻击赋予${element}属性$`, 'u').exec(part);
  if (match) { effects.attackElement = match[1]; effects.attackElementAll = true; return true; }
  match = new RegExp(`^无元素普通攻击赋予${element}属性$`, 'u').exec(part);
  if (match) { effects.attackElement = match[1]; effects.attackElementOnlyIfNeutral = true; return true; }

  match = /^地图单次移动上限 \+(\d+)格$/u.exec(part);
  if (match) { setNumber(effects, 'mapMoveBonus', match[1]); return true; }
  match = /^负重导致的移动惩罚减少(\d+)%$/u.exec(part);
  if (match) { setNumber(effects, 'mapBurdenPenaltyReductionPct', match[1]); return true; }
  match = /^合法怪物交涉成功率 \+(\d+)个百分点$/u.exec(part);
  if (match) { setNumber(effects, 'negotiationActualBonusPct', match[1]); return true; }
  match = /^普通感知半径 \+(\d+)格$/u.exec(part);
  if (match) { setNumber(effects, 'mapPerceptionBonus', match[1]); return true; }
  if (part === '显示范围内怪物的移动/静止状态') { effects.revealMonsterMovementState = true; return true; }
  if (part === '每个怪物实例首次鉴识额外揭示其最高元素抗性对应元素及数值') { effects.revealHighestElementResistance = true; return true; }
  match = /^中性礼物引发的敌意概率降低(\d+)%$/u.exec(part);
  if (match) { setNumber(effects, 'neutralGiftAggressionReductionPct', match[1]); return true; }
  match = /^普通移动引发的可随机野外遭遇概率降低(\d+)%$/u.exec(part);
  if (match) { setNumber(effects, 'mapRandomEncounterReductionPct', match[1]); return true; }
  match = /^普通随机野外遭遇概率降低(\d+)%$/u.exec(part);
  if (match) { setNumber(effects, 'mapRandomEncounterReductionPct', match[1]); return true; }
  match = /^标记(\d+)只已感知的普通\/大怪，记录其最后确认位置(\d+)次本人移动$/u.exec(part);
  if (match) { effects.trackingMaxTargets = Number(match[1]); effects.trackingMaxTier = 'large'; effects.trackingMoveDuration = Number(match[2]); return true; }
  match = /^标记可包含精英，最后确认位置保留(\d+)次本人移动$/u.exec(part);
  if (match) { effects.trackingMaxTargets = 1; effects.trackingMaxTier = 'elite'; effects.trackingMoveDuration = Number(match[1]); return true; }
  match = /^标记(\d+)只普通\/大怪\/精英，最后确认位置保留(\d+)次本人移动$/u.exec(part);
  if (match) { effects.trackingMaxTargets = Number(match[1]); effects.trackingMaxTier = 'elite'; effects.trackingMoveDuration = Number(match[2]); return true; }
  match = /^可标记(\d+)只普通\/大怪\/精英，最后确认位置保留(\d+)次本人移动$/u.exec(part);
  if (match) { effects.trackingMaxTargets = Number(match[1]); effects.trackingMaxTier = 'elite'; effects.trackingMoveDuration = Number(match[2]); return true; }
  match = /^可标记(\d+)只含BOSS的怪物，最后确认位置保留(\d+)次本人移动$/u.exec(part);
  if (match) { effects.trackingMaxTargets = Number(match[1]); effects.trackingMaxTier = 'boss'; effects.trackingMoveDuration = Number(match[2]); return true; }
  if (part === '交涉页面揭示当前心情所属区间') { effects.revealNegotiationMoodBand = true; return true; }
  if (part === '每场交涉首次试探不因“连续失败计数”额外提高敌意概率') { effects.ignoreFirstProbeFailureEscalation = true; return true; }
  if (part === '每场首次送出非讨厌礼物后揭示一个该怪物的喜好类别' || part === '每场首次非讨厌礼物揭示一个喜好类别') { effects.revealPreferenceCategory = true; return true; }
  if (part === '每场首次中性礼物的敌意判定失败后，允许一次原概率重判，第二次仍失败才开战') { effects.neutralGiftAggressionRetry = true; return true; }
  match = /^中度以下地形额外移动体力消耗降低(\d+)%$/u.exec(part);
  if (match) { setNumber(effects, 'moderateTerrainStaminaReductionPct', match[1]); return true; }
  if (part === '无战斗且本次移动不触发强制事件时，连续3次合法移动后下次移动上限临时 +2格，随后重置') { effects.moveChargeRequired = 3; effects.moveChargeBonus = 2; return true; }
  match = /^与NPC普通交谈距离 \+(\d+)格$/u.exec(part);
  if (match) { setNumber(effects, 'npcTalkRangeBonus', match[1]); return true; }
  if (part === '额外显示一次送礼后心情上升/下降方向') { effects.revealNegotiationMoodDirection = true; return true; }
  if (part === '每场首次因普通交谈触发开战时作一次原敌意概率重判，第二次仍触发才开战') { effects.talkAggressionRetry = true; return true; }
  return false;
};

export const parseMonsterCardEffects = (effectText: string) => {
  const effects: MonsterCardEffects = {};
  const unknown: string[] = [];
  for (const part of effectText.split('；').map(value => value.trim()).filter(Boolean)) if (!parseEffectPart(part, effects)) unknown.push(part);
  return { effects, unknown };
};

const baseRates: Record<MonsterCardTier, number> = { normal: .03, large: .02, elite: .01, boss: .005 };
const normalizedEffectText = (text: string) => text
  .replaceAll('暴击评分', '暴击')
  .replaceAll('暴伤评分', '暴伤')
  .replaceAll('暴免评分', '暴免')
  .replaceAll('暴抗评分', '暴抗');

export const monsterCards: readonly MonsterCardDefinition[] = monsterCardData.map(raw => {
  const parsed = parseMonsterCardEffects(raw.effectText);
  if (parsed.unknown.length) throw new Error(`卡片效果未结构化：${raw.cardCode} -> ${parsed.unknown.join('；')}`);
  return {
    ...raw,
    allowedSlots: [...raw.allowedSlots] as EquipmentSlot[],
    tier: raw.tier as MonsterCardTier,
    sourcePolicy: raw.sourcePolicy as MonsterCardSourcePolicy,
    effectText: normalizedEffectText(raw.effectText),
    effects: parsed.effects,
    minimumEquipmentLevel: Math.max(1, 5 * Math.floor(raw.level / 5)),
    version: 2 as const,
    baseDropRate: baseRates[raw.tier as MonsterCardTier]
  };
});

export const monsterCardByCode = new Map(monsterCards.map(card => [card.cardCode, card]));
export const normalMonsterCardByMonster = new Map(monsterCards.filter(card => card.sourcePolicy === 'kill').map(card => [card.monsterCode, card]));
export const pursuitMonsterCardByKey = new Map(monsterCards.filter(card => card.sourcePolicy === 'city_pursuit').map(card => [`${card.monsterCode}:${card.pursuitRank}`, card]));

export const sourceBossMonsterCards: Readonly<Record<string, readonly string[]>> = {
  necromancer_uz: ['uzz_skeleton_berserker', 'uzz_skeleton_archer', 'uzz_pain_wraith', 'uzz_skeleton_mage', 'uzz_frost_bone_dragon'],
  goblin_king: ['habadragon', 'goblin_royal_guard', 'goblin_royal_spearman']
};

export const nonDroppingMonsterTemplates = new Set([
  'gruen_everlasting_armor', 'gruen_resonant_horn', 'gruen_rift_arm',
  'valk_blackiron_plate', 'valk_soul_chain', 'valk_redfurnace_bellows',
  'mentor_trial_bulwark_gareth', 'mentor_trial_warlord_oren', 'mentor_trial_ironbreaker_noll',
  'mentor_trial_elementalist_sen', 'mentor_trial_summoner_mia', 'mentor_trial_spellblade_vane',
  'mentor_trial_nightblade_loke', 'mentor_trial_venomancer_ning', 'mentor_trial_trickster_vera',
  'mentor_trial_saint_mare', 'mentor_trial_aegis_hector', 'mentor_trial_dawn_sola', 'npc_sparring_dummy'
]);

export const pursuitRank = (stars: number, skulls: number) => skulls > 0
  ? `k${Math.max(1, Math.min(5, Math.floor(skulls)))}`
  : `s${Math.max(3, Math.min(5, Math.floor(stars)))}`;

export const itemRarityForCard = (tier: MonsterCardTier) => ({ normal: '优秀', large: '精良', elite: '稀有', boss: '史诗' } as const)[tier];
export const cardEnchantFee = (card: Pick<MonsterCardDefinition, 'level' | 'tier'>) => card.level * ({ normal: 10, large: 20, elite: 40, boss: 80 } as const)[card.tier];

export const equipmentSlotFromCategory = (category: string): EquipmentSlot | null => ({
  '武器': 'weapon', '副手': 'offhand', '头肩': 'shoulder', '头部': 'shoulder', '上装': 'upper', '腰部': 'waist', '下装': 'lower', '脚部': 'feet', '项链': 'necklace', '手镯': 'bracelet', '戒指': 'ring'
} as Record<string, EquipmentSlot>)[category] ?? null;

export const equipmentSlotsFromCategory = (category: string): EquipmentSlot[] => {
  if (category === '武器') return ['weapon', 'offhand'];
  const slot = equipmentSlotFromCategory(category);
  return slot ? [slot] : [];
};

export const equipmentSlotName = (slot: EquipmentSlot) => ({
  weapon: '武器', offhand: '副手', shoulder: '头肩', upper: '上装', waist: '腰带', lower: '下装', feet: '鞋子', necklace: '项链', bracelet: '手镯', ring: '戒指'
} as const)[slot];
