import type { Allocation, DerivedStats } from './types';

export const INITIAL_ATTRIBUTE_POINTS = 20;
export const ATTRIBUTE_CAP = 20;
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
