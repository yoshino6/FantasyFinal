const encumbrance = (attributes, weight, ignorePenalty = false, capacityMultiplier = 1) => {
    const capacity = Math.max(1, attributes.constitution + attributes.strength
        + .5 * (attributes.spirit + attributes.intelligence + attributes.agility + attributes.perception)) * Math.max(1, capacityMultiplier);
    const overloadRatio = Math.max(0, (weight - capacity) / capacity);
    const penaltyRatio = ignorePenalty ? 0 : Math.min(1, overloadRatio);
    const effectivePenaltyRatio = (relativeReductionPct = 0) => penaltyRatio * (1 - Math.max(0, Math.min(100, Number(relativeReductionPct))) / 100);
    return { capacity, overloadPct: overloadRatio * 100, speedPenaltyPct: penaltyRatio * 100,
        applySpeed: (speed) => Math.max(1, speed * (1 - penaltyRatio)),
        applyMapSpeed: (speed, relativeReductionPct = 0) => Math.max(1, speed * (1 - effectivePenaltyRatio(relativeReductionPct))),
        mapSpeedPenaltyPct: (relativeReductionPct = 0) => effectivePenaltyRatio(relativeReductionPct) * 100 };
};

export { encumbrance };
