const encounterSummonProfiles = {
    goblin_royal_guard: { hpMax: 1.25, physicalAttack: 1.10, physicalDefense: 1.25, magicDefense: 1.15 },
    goblin_royal_spearman: { hpMax: 1.25, physicalAttack: 1.20, magicAttack: 1.20, accuracy: 1.10 },
    uzz_skeleton_berserker: { hpMax: 1.80, physicalAttack: 1.25, physicalDefense: 1.15, magicDefense: 1.15, accuracy: 1.10 },
    uzz_skeleton_archer: { hpMax: 1.60, physicalAttack: 1.25, magicAttack: 1.25, accuracy: 1.15 },
    uzz_pain_wraith: { hpMax: 1.40, magicAttack: 1.15, physicalDefense: 1.10, magicDefense: 1.10 },
    uzz_skeleton_mage: { hpMax: 1.40, magicAttack: 1.20, accuracy: 1.10 },
    uzz_frost_bone_dragon: { hpMax: 1.25, physicalAttack: 1.10, magicAttack: 1.10 }
};
const applyEncounterSummonBalance = (stats, code, story = false) => {
    const profile = story ? undefined : encounterSummonProfiles[code];
    if (!profile)
        return stats;
    const result = { ...stats };
    for (const [key, factor] of Object.entries(profile)) {
        const stat = key;
        result[stat] = Math.max(0, Math.floor(stats[stat] * factor));
    }
    return result;
};

export { applyEncounterSummonBalance, encounterSummonProfiles };
