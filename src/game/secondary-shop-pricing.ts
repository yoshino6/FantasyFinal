import { baseMaterialTradeValues, constructionRecipes, constructionRefundRate, constructionSuccessRate } from './deconstructor-catalog';
import { materialValueMultiplierForLevel } from './monster-crafting-material.service';
import { forgeMaterialValue } from './forge-material-values';
import { alchemySuccessRate } from './alchemy-balance';

/** 每成功一批的材料倍率：失败返料按实际比例抵扣，不能把返料当作额外产出。 */
export const synthesisLossMultiplier = (success: number, refund = 0) => {
  if(!Number.isFinite(success)||success<=0||success>1||!Number.isFinite(refund)||refund<0||refund>1)throw new Error('无效的制作成功率或返料比例。');
  return (1-(1-success)*refund)/success;
};

/** 三份同档低阶材料，主辅无额外同标签加成、粒子催化剂的标准供货预算。 */
export const basicAlchemySupplySuccess = (makerLevel:number) => alchemySuccessRate(makerLevel,4+4+5+5)/100;

export const constructionSupplyCost = (code:string,makerLevel:number):{materialCost:number;expectedCost:number} => {
  const recipe=constructionRecipes.find(recipe=>recipe.code===code);
  if(!recipe){
    const value=baseMaterialTradeValues[code];if(value===undefined)throw new Error(`材料【${code}】缺少获取成本，无法为成品定价。`);
    // 基础粒子的现有锚是半价收购值，供货成本必须先还原为两倍。
    return {materialCost:value*2,expectedCost:value*2};
  }
  let materialCost=0,expectedCost=0;
  for(const part of recipe.ingredients){const cost=constructionSupplyCost(part.code,makerLevel);materialCost+=cost.materialCost*part.quantity;expectedCost+=cost.expectedCost*part.quantity;}
  const success=constructionSuccessRate(recipe.recommendedSecondaryLevel,makerLevel)/100;
  const refund=constructionRefundRate(Math.max(0,recipe.recommendedSecondaryLevel-makerLevel));
  return {materialCost,expectedCost:expectedCost*synthesisLossMultiplier(success,refund)};
};

type RetailItem={code:string;required_level?:number;retail_price?:number|null};
const noviceRetail:Record<string,number>={glimmer_potion:6,novice_hp_potion_small:10,novice_mp_potion_small:10};
const standardEquipmentRetail:Record<number,number>={5:200,10:400,15:1000,20:2000};

export const secondaryFinishedPrice = (shop:string,item:RetailItem,makerLevel:number) => {
  if(item.code==='forge_repair_kit')return 160;
  if(shop==='blacksmith'){
    // 使用独立的制式装备零售价；不读取 item.trade_price 或回收表 sell_price。
    const retail=Number(item.retail_price)||standardEquipmentRetail[Number(item.required_level)]||100;
    return Math.ceil(Math.max(100,retail)*2); // 常规打造成功率为100%。
  }
  if(shop==='oddworkshop'){
    const cost=constructionSupplyCost(item.code,makerLevel);
    const doubledRetail=2*Math.max(100,Math.ceil(cost.materialCost/2*2.5));
    return Math.ceil(doubledRetail*cost.expectedCost/cost.materialCost);
  }
  if(shop==='alchemy_sweetshop'){
    if(item.code==='demon_breaker_teleporter') return 200;
    const loss=synthesisLossMultiplier(basicAlchemySupplySuccess(makerLevel));
    if(item.code==='alchemy_skill_reset_elixir'){
      // 魔力粉尘和草木萃取液也来自概率炼制，先累计前置萃取损耗，再算洗练露本体。
      const extractSuccess=alchemySuccessRate(makerLevel,4+5+5+5)/100;
      const mana=(forgeMaterialValue.beast_core!+baseMaterialTradeValues.blood_residue!+baseMaterialTradeValues.energy_ember!)*2;
      const herb=(forgeMaterialValue.living_wood!+baseMaterialTradeValues.blood_residue!+baseMaterialTradeValues.energy_ember!)*2;
      const catalyst=baseMaterialTradeValues.magic_unit!*2;
      const materialCost=3*(mana+herb+catalyst);
      const expectedCost=3*((mana+herb)*synthesisLossMultiplier(extractSuccess)+catalyst)*loss;
      return Math.ceil(640*expectedCost/materialCost);
    }
    const retail=noviceRetail[item.code]??Math.ceil(80*materialValueMultiplierForLevel(Number(item.required_level??1)));
    return Math.ceil(retail*2*loss);
  }
  throw new Error('未知成品商店。');
};
