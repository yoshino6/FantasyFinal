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
  hpMax: 100 + value.constitution * 25,
  mpMax: 50 + value.spirit * 20,
  physicalAttack: 10 + value.strength * 5,
  magicAttack: 8 + value.intelligence * 5,
  physicalDefense: 5 + value.constitution * 2 + value.strength,
  magicDefense: 3 + value.spirit * 2 + value.intelligence,
  accuracy: 8000 + value.perception * 100 + value.agility * 30,
  evasion: value.agility * 80 + value.perception * 20,
  critRateBp: value.perception * 50,
  critDamageBp: 15000 + value.strength * 100,
  critResistBp: value.intelligence * 40,
  critDamageReductionBp: value.spirit * 40,
  tenacity: value.constitution * 3 + value.spirit * 2,
  speed: 100 + value.agility * 8
});

export const gifts = {
  holy_sword_shirulu: { name: '圣剑·希尔露', category: 'artifact', summary: '由星辉铸成的圣洁长剑。' },
  demon_sword_aphia: { name: '魔剑·阿菲娅', category: 'artifact', summary: '寄宿深渊意志的漆黑魔剑。' },
  growth_blessing: { name: '成长祝福', category: 'ability', summary: '让经验积累更快的祝福。' },
  mana_affinity: { name: '魔力亲和', category: 'ability', summary: '让你更熟悉魔力流动的天赋。' },
  lucky_favor: { name: '幸运眷顾', category: 'ability', summary: '受命运青睐的微小奇迹。' }
} as const;

export type GiftCode = keyof typeof gifts;
export type GiftCategory = (typeof gifts)[GiftCode]['category'];
export const isGiftCode = (value: string): value is GiftCode => value in gifts;
