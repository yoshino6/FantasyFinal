const opposedChance = (offense, defense) => {
    const x = Math.max(0, Number(offense));
    const y = Math.max(1, Number(defense));
    return 1 - Math.pow(.5, x / y);
};
const opposedCritBonus = (critDamage, critReduction) => {
    const x = Math.max(0, Number(critDamage));
    const y = Math.max(1, Number(critReduction));
    return 2 * (1 - Math.pow(.5, x / y));
};
const correctionRate = (value = 0) => Math.max(0, Math.min(100, value)) / 100;
const combineCorrectionPct = (...values) => (1 - values.reduce((remaining, value) => remaining * (1 - correctionRate(value)), 1)) * 100;
const correctedHitChance = (chance, correction = {}) => {
    const base = Math.max(0, Math.min(1, chance));
    return (base + (1 - base) * correctionRate(correction.hitCorrectionPct)) * (1 - correctionRate(correction.evasionCorrectionPct));
};
const resolvedHitChance = (chance, actualHitRatePct = 0, hitMultiplier = 1, minimumHitRatePct = 0, correction = {}) => {
    const actual = Number(actualHitRatePct) + Number(correction.actualHitRatePct ?? 0);
    const multiplied = (Number(chance) + actual / 100) * Math.max(0, Number(hitMultiplier));
    const minimum = Math.max(0, Math.min(100, Number(minimumHitRatePct))) / 100;
    return correctedHitChance(Math.min(1, Math.max(multiplied, minimum)), correction);
};
const correctedCritChance = (chance, correction = {}) => {
    const base = Math.max(0, Math.min(1, chance + Math.max(0, Number(correction.actualCritRatePct ?? 0)) / 100));
    return (base + (1 - base) * correctionRate(correction.critRateCorrectionPct)) * (1 - correctionRate(correction.critAvoidanceCorrectionPct));
};
const correctedCritBonus = (bonus, correction = {}) => bonus * (1 - correctionRate(correction.critDamageCorrectionPct));
const strikeCorrections = (source, target) => ({
    hitCorrectionPct: combineCorrectionPct(source?.armorSet?.hitCorrectionPct, source?.hitCorrectionPct, source?.cardEffects?.hitCorrectionPct),
    evasionCorrectionPct: combineCorrectionPct(target?.armorSet?.evasionCorrectionPct, target?.evasionCorrectionPct, target?.cardEffects?.evasionCorrectionPct),
    critRateCorrectionPct: combineCorrectionPct(source?.armorSet?.critRateCorrectionPct, source?.critRateCorrectionPct, source?.cardEffects?.critRateCorrectionPct),
    critAvoidanceCorrectionPct: combineCorrectionPct(target?.armorSet?.critAvoidanceCorrectionPct, target?.critAvoidanceCorrectionPct, target?.cardEffects?.critAvoidanceCorrectionPct),
    critDamageCorrectionPct: combineCorrectionPct(target?.armorSet?.critDamageCorrectionPct, target?.critDamageCorrectionPct, target?.cardEffects?.critDamageCorrectionPct),
    actualHitRatePct: Number(source?.armorSet?.actualHitRatePct ?? 0) + Number(source?.actualHitRatePct ?? 0) + Math.min(12, Math.max(0, Number(source?.cardEffects?.actualHitRatePct ?? 0))),
    actualCritRatePct: Number(source?.armorSet?.actualCritRatePct ?? 0) + Number(source?.actualCritRatePct ?? 0) + Math.min(12, Math.max(0, Number(source?.cardEffects?.actualCritRatePct ?? 0)))
});
const bossControlChanceMultiplier = .4;
const tenacityContest = (tenacityPierce, targetTenacity, levelDifference, baseChancePct, positiveCorrectionPct = 0) => {
    const pierce = Math.max(0, Number(tenacityPierce));
    const tenacity = Math.max(0, Number(targetTenacity));
    const opposedCoefficient = Math.min(1, 2 * pierce / Math.max(1, pierce + tenacity));
    const coefficient = opposedCoefficient + (1 - opposedCoefficient) * correctionRate(positiveCorrectionPct);
    const levelMultiplier = levelDifference >= 0 ? Math.pow(1.1, levelDifference) : Math.pow(.9, -levelDifference);
    return {
        coefficient,
        harmfulMultiplier: .5 + coefficient * .5,
        damageOverTimeMultiplier: Math.min(1, coefficient * levelMultiplier),
        controlChance: Math.min(1, Number(baseChancePct) / 100 * coefficient * levelMultiplier)
    };
};
const directDamageVariance = (damage) => Math.max(1, Math.floor(damage * (.9 + Math.random() * .2)));
const resolveStrike = (attack, defense, accuracy, evasion, crit, critResist, critDamage, critReduction, forceHit = false, forceCrit = false, minimumHitRatePct = 0, actualHitRatePct = 0, hitMultiplier = 1, correction = {}) => {
    const hitChance = resolvedHitChance(opposedChance(accuracy, evasion), actualHitRatePct, hitMultiplier, minimumHitRatePct, correction);
    if (!forceHit && Math.random() >= hitChance)
        return { hit: false, crit: false, damage: 0 };
    let damage = Math.max(1, Math.floor(attack * attack / (attack + Math.max(1, defense))));
    const critical = forceCrit || Math.random() < correctedCritChance(opposedChance(crit, critResist), correction);
    if (critical)
        damage = Math.max(1, Math.floor(damage * (1 + correctedCritBonus(opposedCritBonus(critDamage, critReduction), correction))));
    return { hit: true, crit: critical, damage };
};

export { bossControlChanceMultiplier, correctedCritBonus, correctedCritChance, correctedHitChance, directDamageVariance, opposedChance, opposedCritBonus, resolveStrike, resolvedHitChance, strikeCorrections, tenacityContest };
