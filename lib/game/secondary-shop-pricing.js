import { constructionRecipes, constructionSuccessRate, constructionRefundRate, baseMaterialTradeValues } from './deconstructor-catalog.js';
import { materialValueMultiplierForLevel } from './monster-crafting-material.service.js';
import { forgeMaterialValue } from './forge-material-values.js';
import { alchemySuccessRate } from './alchemy-balance.js';

const synthesisLossMultiplier = (success, refund = 0) => {
    if (!Number.isFinite(success) || success <= 0 || success > 1 || !Number.isFinite(refund) || refund < 0 || refund > 1)
        throw new Error('无效的制作成功率或返料比例。');
    return (1 - (1 - success) * refund) / success;
};
const basicAlchemySupplySuccess = (makerLevel) => alchemySuccessRate(makerLevel, 4 + 4 + 5 + 5) / 100;
const constructionSupplyCost = (code, makerLevel) => {
    const recipe = constructionRecipes.find(recipe => recipe.code === code);
    if (!recipe) {
        const value = baseMaterialTradeValues[code];
        if (value === undefined)
            throw new Error(`材料【${code}】缺少获取成本，无法为成品定价。`);
        return { materialCost: value * 2, expectedCost: value * 2 };
    }
    let materialCost = 0, expectedCost = 0;
    for (const part of recipe.ingredients) {
        const cost = constructionSupplyCost(part.code, makerLevel);
        materialCost += cost.materialCost * part.quantity;
        expectedCost += cost.expectedCost * part.quantity;
    }
    const success = constructionSuccessRate(recipe.recommendedSecondaryLevel, makerLevel) / 100;
    const refund = constructionRefundRate(Math.max(0, recipe.recommendedSecondaryLevel - makerLevel));
    return { materialCost, expectedCost: expectedCost * synthesisLossMultiplier(success, refund) };
};
const noviceRetail = { glimmer_potion: 6, novice_hp_potion_small: 10, novice_mp_potion_small: 10 };
const standardEquipmentRetail = { 5: 200, 10: 400, 15: 1000, 20: 2000 };
const secondaryFinishedPrice = (shop, item, makerLevel) => {
    if (item.code === 'forge_repair_kit')
        return 160;
    if (shop === 'blacksmith') {
        const retail = Number(item.retail_price) || standardEquipmentRetail[Number(item.required_level)] || 100;
        return Math.ceil(Math.max(100, retail) * 2);
    }
    if (shop === 'oddworkshop') {
        const cost = constructionSupplyCost(item.code, makerLevel);
        const doubledRetail = 2 * Math.max(100, Math.ceil(cost.materialCost / 2 * 2.5));
        return Math.ceil(doubledRetail * cost.expectedCost / cost.materialCost);
    }
    if (shop === 'alchemy_sweetshop') {
        if (item.code === 'demon_breaker_teleporter')
            return 200;
        const loss = synthesisLossMultiplier(basicAlchemySupplySuccess(makerLevel));
        if (item.code === 'alchemy_skill_reset_elixir') {
            const extractSuccess = alchemySuccessRate(makerLevel, 4 + 5 + 5 + 5) / 100;
            const mana = (forgeMaterialValue.beast_core + baseMaterialTradeValues.blood_residue + baseMaterialTradeValues.energy_ember) * 2;
            const herb = (forgeMaterialValue.living_wood + baseMaterialTradeValues.blood_residue + baseMaterialTradeValues.energy_ember) * 2;
            const catalyst = baseMaterialTradeValues.magic_unit * 2;
            const materialCost = 3 * (mana + herb + catalyst);
            const expectedCost = 3 * ((mana + herb) * synthesisLossMultiplier(extractSuccess) + catalyst) * loss;
            return Math.ceil(640 * expectedCost / materialCost);
        }
        const retail = noviceRetail[item.code] ?? Math.ceil(80 * materialValueMultiplierForLevel(Number(item.required_level ?? 1)));
        return Math.ceil(retail * 2 * loss);
    }
    throw new Error('未知成品商店。');
};

export { basicAlchemySupplySuccess, constructionSupplyCost, secondaryFinishedPrice, synthesisLossMultiplier };
