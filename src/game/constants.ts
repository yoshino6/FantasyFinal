import type { Allocation, DerivedStats } from './types';

export const SESSION_TTL_MINUTES = 30;

export const realmNames = ['初心', '窥尘', '开化', '明道', '破晓', '通灵', '造化', '掌控', '主宰', '通玄'] as const;
export const realmNameForStage = (stage: number) => realmNames[Math.max(0, Math.min(realmNames.length - 1, Math.floor(stage) - 1))];
export const realmLevelCap = (stage: number) => Math.min(100, Math.max(1, Math.floor(stage)) * 10);
export const realmEnergyDissipationText = '精纯的能量冲入你的体壳，然后向外四溢，消散在了空中。。。';

// 索引表示当前等级；例如 Lv.10 升至 Lv.11 需要 1500 点经验。
const levelExperienceRequirements = [
  0,
  25, 50, 100, 200, 300, 450, 600, 800, 1000, 1500,
  1500, 1800, 2200, 2600, 3000, 3500, 4000, 4500, 5000, 6000
] as const;

/** 返回当前等级升至下一等级所需的经验；20 级后的数值待后续境界内容补充。 */
export const experienceRequiredForLevel = (level: number) => levelExperienceRequirements[Math.max(1, Math.min(20, Math.floor(level)))] ?? 6000;

export const attributeNames: Record<keyof Allocation, string> = {
  constitution: '体质', spirit: '精神', strength: '力量',
  intelligence: '智力', agility: '敏捷', perception: '感知'
};

export const attributeAliases: Record<string, keyof Allocation> = {
  体质: 'constitution', 精神: 'spirit', 力量: 'strength',
  智力: 'intelligence', 敏捷: 'agility', 感知: 'perception'
};

export const calculateDerivedStats = (value: Allocation): DerivedStats => ({
  // 主属性系数至少是任一副属性系数的两倍；数值属性会在战斗中按双方对抗结算。
  hpMax: 120 + value.constitution * 20 + value.spirit * 4 + value.strength * 5 + value.intelligence * 2 + value.agility * 2 + value.perception * 2,
  mpMax: 60 + value.spirit * 16 + value.intelligence * 8 + value.perception * 3 + value.constitution * 2 + value.strength + value.agility,
  physicalAttack: 8 + value.strength * 2 + value.agility + value.constitution * 0.5 + value.perception * 0.4 + value.intelligence * 0.2 + value.spirit * 0.2,
  magicAttack: 8 + value.intelligence * 2 + value.spirit + value.perception * 0.5 + value.agility * 0.4 + value.constitution * 0.2 + value.strength * 0.2,
  physicalDefense: 8 + value.constitution * 2 + value.strength + value.agility * 0.5 + value.perception * 0.25 + value.spirit * 0.25 + value.intelligence * 0.25,
  magicDefense: 8 + value.spirit * 2 + value.intelligence + value.perception * 0.5 + value.agility * 0.4 + value.constitution * 0.2 + value.strength * 0.2,
  accuracy: (100 + value.agility * 20 + value.perception * 8 + value.intelligence * 4 + value.strength * 2 + value.constitution * 2 + value.spirit * 2) / 5,
  evasion: (100 + value.agility * 20 + value.perception * 8 + value.intelligence * 4 + value.strength * 2 + value.constitution * 2 + value.spirit * 2) / 5,
  critRateBp: (100 + value.perception * 20 + value.agility * 8 + value.intelligence * 4 + value.strength * 2 + value.constitution * 2 + value.spirit * 2) / 5,
  critDamageBp: (100 + value.perception * 20 + value.strength * 8 + value.intelligence * 4 + value.agility * 2 + value.constitution * 2 + value.spirit * 2) / 5,
  critResistBp: (100 + value.constitution * 20 + value.perception * 8 + value.spirit * 4 + value.strength * 2 + value.intelligence * 2 + value.agility * 2) / 5,
  critDamageReductionBp: (100 + value.spirit * 20 + value.perception * 8 + value.constitution * 4 + value.intelligence * 2 + value.strength * 2 + value.agility * 2) / 5,
  tenacity: value.constitution * 4 + value.spirit * 3 + value.perception,
  speed: 100 + value.agility * 8
});

export const gifts = {
  holy_sword_shirulu: { name: '圣剑·希尔露', category: 'artifact', summary: '由星辉铸成的圣洁长剑。' },
  demon_sword_aphia: { name: '魔剑·阿菲娅', category: 'artifact', summary: '寄宿深渊意志的漆黑魔剑。' },
  saint_staff_istaria: { name: '圣杖·伊斯塔利亚', category: 'artifact', summary: '以晨星为芯的祝圣法杖，令光属性术式更为耀眼。' },
  death_dagger_azra: { name: '死刺·阿兹拉', category: 'artifact', summary: '短刃所向之处，连濒死的命运也会被割开。' },
  godfist_chronos: { name: '天刃·克罗诺斯', category: 'artifact', summary: '铭刻古神战纹的拳刃，令双攻恒取更高的一方。' },
  oracle_grimoire_sophia: { name: '神谕·索芙拉', category: 'artifact', summary: '书页自行翻动，低声诵读尚未发生的咒文。' },
  prayer_orb_lumia: { name: '祈祷法球·露弥娅', category: 'artifact', summary: '凝固的祈愿之光，会将施术者的意志推向远方。' },
  immortal_shield_auges: { name: '不灭圣盾·奥格斯', category: 'artifact', summary: '历经无数冲击仍无裂痕的古老圣盾。' },
  star_crown_selene: { name: '星冠·塞勒涅', category: 'artifact', summary: '繁星垂落于冠冕，守望佩戴者的每一次远行。' },
  sky_robe_asteia: { name: '天穹法衣·阿斯忒雅', category: 'artifact', summary: '如天空般轻盈的法衣，织入了守护的法则。' },
  wind_girdle_hermes: { name: '风行腰封·赫尔墨斯', category: 'artifact', summary: '流风被束进细密的纹路，步伐与咒文都变得轻快。' },
  time_greaves_chronos: { name: '时隙护腿·克罗诺斯', category: 'artifact', summary: '行走时仿佛踩在时间的缝隙之间。' },
  gale_boots_sif: { name: '逐风战靴·西芙', category: 'artifact', summary: '靴底从不沾尘，疾风会替佩戴者踏出下一步。' },
  oath_necklace_norn: { name: '守誓项链·诺恩', category: 'artifact', summary: '承诺会化为温热的光，护住仍愿前行的人。' },
  fate_bracelet_clotho: { name: '命运手镯·克洛托', category: 'artifact', summary: '银线缠绕腕间，仿佛能将断裂的命运重新缝合。' },
  eternal_ring_aurora: { name: '永恒戒指·奥罗拉', category: 'artifact', summary: '黎明色的微光永不熄灭，指向每一场可能的胜利。' },
  growth_blessing: { name: '成长祝福', category: 'ability', summary: '【被动】所有获得的经验值翻倍。' },
  mana_affinity: { name: '魔力亲和', category: 'ability', summary: '【被动】技能魔力消耗降低 30%。' },
  lucky_favor: { name: '幸运眷顾', category: 'ability', summary: '【被动】战利品掉落概率提高 20%。' },
  war_god_favor: { name: '战神眷顾', category: 'ability', summary: '【被动】造成的最终伤害提高 16%。' },
  arcane_revelation: { name: '奥术启示', category: 'ability', summary: '【被动】魔法伤害提高 16%。' },
  crimson_recovery: { name: '猩红复苏', category: 'ability', summary: '【被动】普攻与刺击伤害的 16% 转化为生命。' },
  seer_instinct: { name: '先知直觉', category: 'ability', summary: '【被动】命中与暴击属性在战斗中提高 16%。' },
  hunter_blessing: { name: '猎人恩典', category: 'ability', summary: '【被动】战利品掉落概率提高 35%。' }
} as const;

/** 初始永恒神器会直接穿戴到对应部位；永恒神器之间仍互斥。 */
export const artifactGiftSlots = {
  holy_sword_shirulu: 'weapon', demon_sword_aphia: 'weapon', saint_staff_istaria: 'weapon', death_dagger_azra: 'weapon', godfist_chronos: 'weapon', oracle_grimoire_sophia: 'weapon', prayer_orb_lumia: 'weapon',
  immortal_shield_auges: 'offhand', star_crown_selene: 'shoulder', sky_robe_asteia: 'upper', wind_girdle_hermes: 'waist', time_greaves_chronos: 'lower', gale_boots_sif: 'feet', oath_necklace_norn: 'necklace', fate_bracelet_clotho: 'bracelet', eternal_ring_aurora: 'ring'
} as const;

export type GiftCode = keyof typeof gifts;
export type GiftCategory = (typeof gifts)[GiftCode]['category'];
export const isGiftCode = (value: string): value is GiftCode => value in gifts;
