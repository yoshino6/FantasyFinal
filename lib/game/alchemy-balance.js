import { forgeMaterialValue } from './forge-material-values.js';
import { baseMaterialTradeValues, constructionRecipes, constructionSuccessRate, constructionRefundRate } from './deconstructor-catalog.js';
import { purifiedCraftMaterialValue, materialValueMultiplierForLevel } from './monster-crafting-material.service.js';

const alchemyTierIndex = (level) => level <= 10 ? 0 : level <= 25 ? 1 : level <= 45 ? 2 : level <= 70 ? 3 : 4;
const alchemySuccessRate = (makerLevel, stability) => Math.max(45, Math.min(92, 64 + (makerLevel - 1) * 2 + stability));
const alchemyTierValues = {
    life: [22, 30, 40, 50, 60], mana: [20, 28, 36, 44, 52], harmonyHp: [14, 19, 25, 31, 37], harmonyMp: [12, 16, 21, 26, 31],
    regeneration: [10, 13, 16, 19, 22], attack: [20, 25, 30, 35, 40], defense: [25, 30, 35, 40, 45], reduction: [22, 28, 34, 40, 46], speed: [25, 30, 35, 40, 45]
};
const alchemyMaterialValue = (code, level, category, makerLevel = 5) => {
    if (baseMaterialTradeValues[code] !== undefined)
        return baseMaterialTradeValues[code];
    const oldMaterial = code.match(/^(magic_thread|magic_leather|magic_carbon_plate|magic_hard_shell|magic_scale_armor)_lv\d+$/)?.[1];
    if (oldMaterial)
        return forgeMaterialValue[{ magic_thread: 'spellcloth_bolt', magic_leather: 'tanned_spirit_leather', magic_carbon_plate: 'bone_steel_plate', magic_hard_shell: 'cast_shell_plate', magic_scale_armor: 'laminated_scale_plate' }[oldMaterial]];
    if (code === 'magic_branch')
        return 12;
    const purified = purifiedCraftMaterialValue(code);
    if (purified)
        return purified;
    if (forgeMaterialValue[code] !== undefined)
        return forgeMaterialValue[code];
    const recipe = constructionRecipes.find(recipe => recipe.code === code);
    if (recipe) {
        const success = constructionSuccessRate(recipe.recommendedSecondaryLevel, makerLevel) / 100;
        const refund = constructionRefundRate(Math.max(0, recipe.recommendedSecondaryLevel - makerLevel));
        const values = recipe.ingredients.map(part => { const value = alchemyMaterialValue(part.code, 1, '粒子', makerLevel); return value === null ? null : part.quantity * value * (1 - (1 - success) * refund); });
        return values.some(value => value === null) ? null : values.reduce((sum, value) => sum + (value ?? 0), 0) / success;
    }
    if (code === 'mana_dust' || code === 'herbal_extract')
        return ((code === 'mana_dust' ? forgeMaterialValue.beast_core : forgeMaterialValue.living_wood) + 4) / (.91 * (1 + .062));
    const known = { healing_herb: 5, herbal_extract: 10, mana_dust: 18, beast_core: 12, refined_beast_core: 20 };
    if (known[code] !== undefined)
        return known[code];
    if (category === '怪材')
        return 12 * materialValueMultiplierForLevel(level);
    return null;
};
const expectedAlchemyUnitCost = (input, success, great, doubleGreat, quantityBonus = 1) => {
    if (!Number.isFinite(input) || input < 0 || success <= 0 || success > 1 || great < 0 || great > 1)
        throw new Error('炼金成本参数无效。');
    return input / (success * (1 + (doubleGreat ? great : 0)) * quantityBonus);
};
const alchemyCostQualityBudget = (unitCost, level) => unitCost === undefined ? 0 : Math.max(0, Math.min(.4, (unitCost / (40 * materialValueMultiplierForLevel(level)) - 1) * .1));
const alchemyQualityBudget = (craftsmanship, costBudget = 0, supportsQuality = true) => {
    const value = (1 + Math.max(0, Math.min(.4, costBudget))) * (1 + Math.max(0, Math.min(50, craftsmanship)) / 100);
    const potency = supportsQuality ? Math.min(1.4, value) : 1;
    return { potency, quantity: value / potency };
};
const alchemyQualityRoll = (craftsmanship, great, highTier, random = Math.random, costBudget = 0, supportsQuality = true) => {
    const budget = alchemyQualityBudget(craftsmanship, costBudget, supportsQuality);
    const expectedQuality = budget.potency - 1;
    let quality = Math.min(2, Math.floor(expectedQuality / .2 + 1e-8));
    const remainder = expectedQuality - quality * .2;
    if (remainder > 0 && random() < remainder / .2)
        quality++;
    if (great && highTier && supportsQuality)
        quality = Math.min(2, quality + 1);
    const whole = Math.floor(budget.quantity);
    return { quality, quantity: whole + (random() < budget.quantity - whole ? 1 : 0) };
};
const alchemySupportsQuality = (effect) => effect.tactic ? !['quick_chant', 'defer'].includes(effect.tactic) : Boolean(effect.healPct || effect.restoreMpPct || effect.throwable || effect.status && !['stun', 'alchemy_confusion'].includes(effect.status.code));

export { alchemyCostQualityBudget, alchemyMaterialValue, alchemyQualityBudget, alchemyQualityRoll, alchemySuccessRate, alchemySupportsQuality, alchemyTierIndex, alchemyTierValues, expectedAlchemyUnitCost };
