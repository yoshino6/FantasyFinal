export const level32DifficultyBossCodes = [
  'goblin_king',
  'gruen_mountainheart',
  'valk_forge_overseer',
  'threehead_mother',
  'necromancer_uz'
] as const;

export type Level32DifficultyBossCode = typeof level32DifficultyBossCodes[number];
export type Level32BossDifficultyCode = 'infernal' | 'abyssal' | 'crimson' | 'corrupted' | 'holy' | 'golden' | 'brilliant' | 'dreamlike';
export type Level32BossDifficultyStat = 'hp' | 'tenacity' | 'physicalAttack' | 'magicAttack' | 'physicalDefense' | 'magicDefense' | 'accuracy' | 'evasion' | 'speed' | 'critRate' | 'critDamage' | 'critResist' | 'critReduction';

export type Level32BossDifficultyTrait = {
  code: Level32BossDifficultyCode;
  name: string;
  referenceEquipment: '稀有' | '传说' | '史诗';
  role: '均衡' | '强攻' | '重防' | '机动';
  /** MP、破韧、感知等未单列属性沿用的基础倍率。 */
  statMultiplier: number;
  statMultipliers: Record<Level32BossDifficultyStat, number>;
  experiencePct: number;
  dropPct: number;
};

const stats = (
  hp: number, attack: number, defense: number, accuracy: number, evasion: number,
  critRate: number, critDamage: number, critResist: number, critReduction: number,
  tenacity: number, speed: number
): Record<Level32BossDifficultyStat, number> => ({
  hp,
  physicalAttack: attack,
  magicAttack: attack,
  physicalDefense: defense,
  magicDefense: defense,
  accuracy,
  evasion,
  critRate,
  critDamage,
  critResist,
  critReduction,
  tenacity,
  speed
});

/**
 * 五只 Lv.32 Boss 的满培养校准表。
 *
 * - 深渊/地狱：Lv.30 满培养、满进化、100% 稀有装备与二转被动。
 * - 猩红/腐化/神圣：同条件的 100% 传说装备。
 * - 黄金/璀璨/梦幻：同条件的 100% 史诗装备。
 *
 * 这里给出最终词条倍率，不与旧的通用难度倍率相乘。这样双防、暴免、暴抗和韧性
 * 都能按档位明确校准，也不会把低等级 Boss 一并抬高。
 */
export const level32BossDifficultyTraits: Record<Level32BossDifficultyCode, Level32BossDifficultyTrait> = {
  infernal: {
    code: 'infernal', name: '深渊的', referenceEquipment: '稀有', role: '均衡',
    statMultiplier: 1.60,
    statMultipliers: stats(8, 1.45, 1.65, 1.60, 1.55, 1.40, 1.40, 2.00, 2.00, 2.50, 1.45),
    experiencePct: 70, dropPct: 200
  },
  abyssal: {
    code: 'abyssal', name: '地狱的', referenceEquipment: '稀有', role: '均衡',
    statMultiplier: 1.85,
    statMultipliers: stats(12, 1.55, 1.80, 1.80, 1.70, 1.50, 1.50, 2.50, 2.50, 3.20, 1.65),
    experiencePct: 110, dropPct: 300
  },
  crimson: {
    code: 'crimson', name: '猩红的', referenceEquipment: '传说', role: '强攻',
    statMultiplier: 2.50,
    statMultipliers: stats(14, 2.00, 2.05, 2.25, 2.00, 1.90, 2.00, 3.00, 3.00, 4.00, 2.30),
    experiencePct: 170, dropPct: 500
  },
  corrupted: {
    code: 'corrupted', name: '腐化的', referenceEquipment: '传说', role: '重防',
    statMultiplier: 2.15,
    statMultipliers: stats(25, 1.65, 2.45, 2.10, 2.00, 1.55, 1.55, 5.00, 5.60, 5.50, 1.90),
    experiencePct: 180, dropPct: 500
  },
  holy: {
    code: 'holy', name: '神圣的', referenceEquipment: '传说', role: '机动',
    statMultiplier: 2.25,
    statMultipliers: stats(20, 1.70, 2.20, 2.25, 2.55, 1.60, 1.60, 4.30, 4.80, 5.00, 2.80),
    experiencePct: 190, dropPct: 500
  },
  golden: {
    code: 'golden', name: '黄金的', referenceEquipment: '史诗', role: '均衡',
    statMultiplier: 2.70,
    statMultipliers: stats(24, 1.85, 2.60, 2.55, 2.60, 1.70, 1.70, 5.30, 6.00, 7.00, 3.00),
    experiencePct: 280, dropPct: 900
  },
  brilliant: {
    code: 'brilliant', name: '璀璨的', referenceEquipment: '史诗', role: '均衡',
    statMultiplier: 3.10,
    statMultipliers: stats(30, 2.00, 3.10, 3.00, 3.15, 1.85, 1.85, 6.50, 7.50, 12.00, 3.50),
    experiencePct: 450, dropPct: 1400
  },
  dreamlike: {
    code: 'dreamlike', name: '梦幻的', referenceEquipment: '史诗', role: '均衡',
    statMultiplier: 3.60,
    statMultipliers: stats(38, 2.15, 3.60, 3.40, 3.50, 2.00, 2.00, 8.00, 9.50, 20.00, 4.20),
    experiencePct: 900, dropPct: 1900
  }
};

const level32DifficultyBossCodeSet = new Set<string>(level32DifficultyBossCodes);
const level32DifficultyCodeSet = new Set<Level32BossDifficultyCode>(Object.keys(level32BossDifficultyTraits) as Level32BossDifficultyCode[]);

export const level32BossDifficultyTraitFor = (bossCode: string, difficultyCode: string) =>
  level32DifficultyBossCodeSet.has(bossCode)
    ? level32BossDifficultyTraits[difficultyCode as Level32BossDifficultyCode]
    : undefined;

export const applyLevel32BossDifficultyTraits = <T extends { code: string }>(bossCode: string, traits: readonly T[]) =>
  traits.map(trait => level32BossDifficultyTraitFor(bossCode, trait.code) ?? trait);

const difficultyTraitValues = (traits: unknown) => {
  if (Array.isArray(traits)) return traits;
  if (typeof traits !== 'string') return [];
  try {
    const parsed = JSON.parse(traits);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const level32BossDifficultyCodeFromTraits = (bossCode: string, traits: unknown): Level32BossDifficultyCode | undefined => {
  if (!level32DifficultyBossCodeSet.has(bossCode)) return undefined;
  return difficultyTraitValues(traits)
    .map(trait => String(trait && typeof trait === 'object' ? (trait as { code?: unknown }).code ?? '' : ''))
    .find((code): code is Level32BossDifficultyCode => level32DifficultyCodeSet.has(code as Level32BossDifficultyCode));
};
