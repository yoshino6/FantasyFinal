const applyBossSummonTrait = (stats, trait) => {
    if (!trait)
        return stats;
    const multiplier = (stat) => Number((stat ? trait.statMultipliers?.[stat] : undefined) ?? trait.statMultiplier ?? 1);
    const scaled = (value, pctKey, stat) => Math.floor(value * multiplier(stat) * (1 + Number(pctKey ? trait[pctKey] ?? 0 : 0) / 100));
    return {
        ...stats,
        hpMax: stats.hpMax,
        mpMax: scaled(stats.mpMax, 'mpPct'),
        physicalAttack: scaled(stats.physicalAttack, 'physicalAttackPct', 'physicalAttack'),
        magicAttack: scaled(stats.magicAttack, 'magicAttackPct', 'magicAttack'),
        physicalDefense: scaled(stats.physicalDefense, 'physicalDefensePct', 'physicalDefense'),
        magicDefense: scaled(stats.magicDefense, 'magicDefensePct', 'magicDefense'),
        accuracy: scaled(stats.accuracy, 'accuracyPct', 'accuracy'),
        evasion: scaled(stats.evasion, 'evasionPct', 'evasion'),
        crit: scaled(stats.crit, 'critRatePct', 'critRate'),
        critResist: scaled(stats.critResist, 'critResistPct', 'critResist'),
        critDamage: scaled(stats.critDamage, 'critDamagePct', 'critDamage'),
        critReduction: scaled(stats.critReduction, 'critReductionPct', 'critReduction'),
        tenacity: scaled(stats.tenacity, undefined, 'tenacity'),
        tenacityPierce: scaled(stats.tenacityPierce),
        speed: scaled(stats.speed, 'speedPct', 'speed'),
        perception: scaled(stats.perception)
    };
};

export { applyBossSummonTrait };
