const opposedChance = (offense, defense) => {
    const x = Math.max(1, Number(offense));
    const y = Math.max(1, Number(defense));
    return x / (x + y);
};
const tenacityContest = (tenacityPierce, targetTenacity, levelDifference, baseChancePct) => {
    const pierce = Math.max(0, Number(tenacityPierce));
    const tenacity = Math.max(0, Number(targetTenacity));
    const coefficient = Math.min(1, 2 * pierce / Math.max(1, pierce + tenacity));
    const levelMultiplier = levelDifference >= 0 ? Math.pow(1.1, levelDifference) : Math.pow(.9, -levelDifference);
    return {
        coefficient,
        harmfulMultiplier: .5 + coefficient * .5,
        damageOverTimeMultiplier: Math.min(1, coefficient * levelMultiplier),
        controlChance: Math.min(1, Number(baseChancePct) / 100 * coefficient * levelMultiplier)
    };
};
const directDamageVariance = (damage) => Math.max(1, Math.floor(damage * (.9 + Math.random() * .2)));
const resolveStrike = (attack, defense, accuracy, evasion, crit, critResist, critDamage, critReduction, forceHit = false, forceCrit = false, minimumHitRatePct = 0, actualHitRatePct = 0, hitMultiplier = 1) => {
    const hitChance = Math.min(1, Math.max((opposedChance(accuracy, evasion) + actualHitRatePct / 100) * Math.max(0, hitMultiplier), Math.max(0, Math.min(100, minimumHitRatePct)) / 100));
    if (!forceHit && Math.random() >= hitChance)
        return { hit: false, crit: false, damage: 0 };
    let damage = Math.max(1, Math.floor(attack * attack / (attack + Math.max(1, defense))));
    const critical = forceCrit || Math.random() < opposedChance(crit, critResist);
    if (critical)
        damage = Math.max(1, Math.floor(damage * (1 + opposedChance(critDamage, critReduction))));
    return { hit: true, crit: critical, damage };
};

export { directDamageVariance, opposedChance, resolveStrike, tenacityContest };
