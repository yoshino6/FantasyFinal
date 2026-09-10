const achievementRegionalMaterials = ['ridge_core', 'fire_crystal', 'marsh_heart', 'duskvein_crystal', 'star_mud_core', 'frost_crystal', 'thunder_core', 'eclipse_core'];
const forgeMaterialCategories = new Set(['锻材', '稀有锻材', '区域锻材']);
const forgeAchievementFacts = (signature, inputs) => {
    const paid = inputs.filter(i => i.quantity > 0), facts = [{ metric: 'ACH_I02' }, { metric: 'ACH_I03' }, { metric: 'ACH_END07' }, { metric: 'ACH_E24', distinct: signature }];
    if (new Set(paid.filter(i => forgeMaterialCategories.has(i.category)).map(i => i.code)).size >= 2)
        facts.push({ metric: 'ACH_I18' });
    if (paid.some(i => i.code === 'meteor_iron'))
        facts.push({ metric: 'ACH_I19' }, { metric: 'ACH_EGG41' });
    if (paid.some(i => achievementRegionalMaterials.includes(i.code)))
        facts.push({ metric: 'ACH_I20' }, { metric: 'ACH_EGG42' });
    return facts;
};
const alchemyUtilityOutput = (effect) => !!(effect.tactic || effect.throwable || effect.cleanse || effect.experienceBonusPct || effect.partyDropBonusPct || effect.status && !['regeneration', 'mana_regeneration'].includes(String(effect.status.code)));

export { achievementRegionalMaterials, alchemyUtilityOutput, forgeAchievementFacts };
