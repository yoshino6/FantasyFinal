const panelPercentKeys = {
    hpMax: 'hpPct', mpMax: 'mpPct', physicalAttack: 'physicalAttackPct', magicAttack: 'magicAttackPct',
    physicalDefense: 'physicalDefensePct', magicDefense: 'magicDefensePct', accuracy: 'accuracyPct', evasion: 'evasionPct',
    critRateBp: 'critRatePct', critDamageBp: 'critDamagePct', critResistBp: 'critResistPct', critDamageReductionBp: 'critDamageReductionPct',
    tenacity: 'tenacityPct', tenacityPierce: 'tenacityPiercePct', speed: 'speedPct'
};
const calculatePanelStats = (base, flat, additivePercent, independentPercent = []) => Object.fromEntries(Object.keys(panelPercentKeys).map(key => {
    const percentKey = panelPercentKeys[key];
    const independent = independentPercent.reduce((value, effect) => value * Math.max(0, 1 + Number(effect[percentKey] ?? 0) / 100), 1);
    return [key, Math.max(0, Math.floor((base[key] + Number(flat[key] ?? 0)) * Math.max(0, 1 + Number(additivePercent[percentKey] ?? 0) / 100) * independent))];
}));

export { calculatePanelStats, panelPercentKeys };
