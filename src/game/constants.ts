import type { Allocation, DerivedStats } from './types';

export const SESSION_TTL_MINUTES = 30;

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
  accuracy: 100 + value.agility * 20 + value.perception * 8 + value.intelligence * 4 + value.strength * 2 + value.constitution * 2 + value.spirit * 2,
  evasion: 100 + value.agility * 20 + value.perception * 8 + value.intelligence * 4 + value.strength * 2 + value.constitution * 2 + value.spirit * 2,
  critRateBp: 100 + value.perception * 20 + value.agility * 8 + value.intelligence * 4 + value.strength * 2 + value.constitution * 2 + value.spirit * 2,
  critDamageBp: 100 + value.perception * 20 + value.strength * 8 + value.intelligence * 4 + value.agility * 2 + value.constitution * 2 + value.spirit * 2,
  critResistBp: 100 + value.constitution * 20 + value.perception * 8 + value.spirit * 4 + value.strength * 2 + value.intelligence * 2 + value.agility * 2,
  critDamageReductionBp: 100 + value.spirit * 20 + value.perception * 8 + value.constitution * 4 + value.intelligence * 2 + value.strength * 2 + value.agility * 2,
  tenacity: value.constitution * 4 + value.spirit * 3 + value.perception,
  speed: 100 + value.agility * 8
});

export const gifts = {
  holy_sword_shirulu: { name: '圣剑·希尔露', category: 'artifact', summary: '由星辉铸成的圣洁长剑。' },
  demon_sword_aphia: { name: '魔剑·阿菲娅', category: 'artifact', summary: '寄宿深渊意志的漆黑魔剑。' },
  growth_blessing: { name: '成长祝福', category: 'ability', summary: '【被动】所有获得的经验值翻倍。' },
  mana_affinity: { name: '魔力亲和', category: 'ability', summary: '【被动】技能魔力消耗降低 30%。' },
  lucky_favor: { name: '幸运眷顾', category: 'ability', summary: '【被动】战利品掉落概率提高 20%。' }
} as const;

export type GiftCode = keyof typeof gifts;
export type GiftCategory = (typeof gifts)[GiftCode]['category'];
export const isGiftCode = (value: string): value is GiftCode => value in gifts;
