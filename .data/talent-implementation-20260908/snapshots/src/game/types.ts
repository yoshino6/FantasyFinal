export const attributes = ['constitution', 'spirit', 'strength', 'intelligence', 'agility', 'perception'] as const;
export type AttributeKey = (typeof attributes)[number];

export type Allocation = Record<AttributeKey, number>;
export type Growth = Record<AttributeKey, number>;
export type DerivedStats = {
  hpMax: number; mpMax: number; physicalAttack: number; magicAttack: number;
  physicalDefense: number; magicDefense: number; accuracy: number; evasion: number;
  critRateBp: number; critDamageBp: number; critResistBp: number;
  critDamageReductionBp: number; tenacity: number; tenacityPierce: number; speed: number;
};

export const emptyAllocation = (): Allocation => ({
  constitution: 0, spirit: 0, strength: 0, intelligence: 0, agility: 0, perception: 0
});

export const emptyGrowth = (): Growth => ({
  constitution: 0, spirit: 0, strength: 0, intelligence: 0, agility: 0, perception: 0
});
