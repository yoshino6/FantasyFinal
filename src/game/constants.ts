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
  holy_sword_shirulu: { name: '圣剑·希尔露', description: '物攻 +20、暴击率 +10%，普攻无视目标 25% 防御并回复造成伤害的 10% 生命。' },
  demon_sword_aphia: { name: '魔剑·阿菲娅', description: '魔攻 +25，魔法技能伤害 +30%，每次施放少消耗 2 点魔力。' },
  growth_blessing: { name: '成长祝福', description: '所有战斗经验翻倍。' },
  mana_affinity: { name: '魔力亲和', description: '技能魔力消耗降低 30%（至少 1 点）。' },
  lucky_favor: { name: '幸运眷顾', description: '掉落判定成功率提高 20 个百分点，最高 100%。' }
} as const;

export type GiftCode = keyof typeof gifts;
export const isGiftCode = (value: string): value is GiftCode => value in gifts;
