const level32DifficultyBossCodes = [
    'goblin_king',
    'gruen_mountainheart',
    'valk_forge_overseer',
    'threehead_mother',
    'necromancer_uz'
];
const stats = (hp, attack, defense, accuracy, evasion, critRate, critDamage, critResist, critReduction, tenacity, speed) => ({
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
const level32BossDifficultyTraits = {
    infernal: {
        code: 'infernal', name: '深渊的', referenceEquipment: '稀有', role: '均衡',
        statMultiplier: 1.60,
        statMultipliers: stats(10, 1.45, 1.65, 1.60, 1.55, 1.40, 1.40, 2.40, 2.60, 2.50, 1.45),
        experiencePct: 70, dropPct: 60
    },
    abyssal: {
        code: 'abyssal', name: '地狱的', referenceEquipment: '稀有', role: '均衡',
        statMultiplier: 1.85,
        statMultipliers: stats(13, 1.55, 1.80, 1.80, 1.70, 1.50, 1.50, 3.00, 3.30, 3.20, 1.65),
        experiencePct: 110, dropPct: 90
    },
    crimson: {
        code: 'crimson', name: '猩红的', referenceEquipment: '传说', role: '强攻',
        statMultiplier: 2.50,
        statMultipliers: stats(16, 1.85, 2.05, 2.25, 2.00, 1.90, 2.00, 3.60, 4.00, 4.00, 2.30),
        experiencePct: 170, dropPct: 140
    },
    corrupted: {
        code: 'corrupted', name: '腐化的', referenceEquipment: '传说', role: '重防',
        statMultiplier: 2.15,
        statMultipliers: stats(18, 1.65, 2.45, 2.10, 2.00, 1.55, 1.55, 5.00, 5.60, 5.50, 1.90),
        experiencePct: 180, dropPct: 150
    },
    holy: {
        code: 'holy', name: '神圣的', referenceEquipment: '传说', role: '机动',
        statMultiplier: 2.25,
        statMultipliers: stats(20, 1.70, 2.20, 2.25, 2.55, 1.60, 1.60, 4.30, 4.80, 5.00, 2.80),
        experiencePct: 190, dropPct: 160
    },
    golden: {
        code: 'golden', name: '黄金的', referenceEquipment: '史诗', role: '均衡',
        statMultiplier: 2.70,
        statMultipliers: stats(24, 1.85, 2.60, 2.55, 2.60, 1.70, 1.70, 5.30, 6.00, 7.00, 3.00),
        experiencePct: 280, dropPct: 220
    },
    brilliant: {
        code: 'brilliant', name: '璀璨的', referenceEquipment: '史诗', role: '均衡',
        statMultiplier: 3.10,
        statMultipliers: stats(30, 2.00, 3.10, 3.00, 3.15, 1.85, 1.85, 6.50, 7.50, 12.00, 3.50),
        experiencePct: 450, dropPct: 400
    },
    dreamlike: {
        code: 'dreamlike', name: '梦幻的', referenceEquipment: '史诗', role: '均衡',
        statMultiplier: 3.60,
        statMultipliers: stats(38, 2.15, 3.60, 3.40, 3.50, 2.00, 2.00, 8.00, 9.50, 20.00, 4.20),
        experiencePct: 900, dropPct: 800
    }
};
const level32DifficultyBossCodeSet = new Set(level32DifficultyBossCodes);
const level32DifficultyCodeSet = new Set(Object.keys(level32BossDifficultyTraits));
const level32BossDifficultyTraitFor = (bossCode, difficultyCode) => level32DifficultyBossCodeSet.has(bossCode)
    ? level32BossDifficultyTraits[difficultyCode]
    : undefined;
const applyLevel32BossDifficultyTraits = (bossCode, traits) => traits.map(trait => level32BossDifficultyTraitFor(bossCode, trait.code) ?? trait);
const difficultyTraitValues = (traits) => {
    if (Array.isArray(traits))
        return traits;
    if (typeof traits !== 'string')
        return [];
    try {
        const parsed = JSON.parse(traits);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
const level32BossDifficultyCodeFromTraits = (bossCode, traits) => {
    if (!level32DifficultyBossCodeSet.has(bossCode))
        return undefined;
    return difficultyTraitValues(traits)
        .map(trait => String(trait && typeof trait === 'object' ? trait.code ?? '' : ''))
        .find((code) => level32DifficultyCodeSet.has(code));
};

export { applyLevel32BossDifficultyTraits, level32BossDifficultyCodeFromTraits, level32BossDifficultyTraitFor, level32BossDifficultyTraits, level32DifficultyBossCodes };
