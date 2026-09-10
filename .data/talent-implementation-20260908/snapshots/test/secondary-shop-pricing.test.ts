import assert from 'node:assert/strict';
import test from 'node:test';
import { constructionRecipes, constructionValueByCode } from '../src/game/deconstructor-catalog';
import { alchemyOutputDefinitions } from '../src/game/alchemy-catalog';
import { secondaryFinishedPrice, constructionSupplyCost, synthesisLossMultiplier } from '../src/game/secondary-shop-pricing';

test('失败材料按成功率摊销，失败返料抵扣，不能重复计入',()=>{
  assert.equal(synthesisLossMultiplier(1),1);
  assert.equal(synthesisLossMultiplier(.5),2);
  assert.equal(synthesisLossMultiplier(.5,.8),1.2);
  assert.equal(synthesisLossMultiplier(.5,1),1);
  assert.throws(()=>synthesisLossMultiplier(0));assert.throws(()=>synthesisLossMultiplier(.5,2));
});
test('基础商品至少翻倍，标准炼金额外计失败；维修包确定成功不加失败费',()=>{
  assert.equal(secondaryFinishedPrice('blacksmith',{code:'forge_repair_kit'},3),160);
  assert.equal(secondaryFinishedPrice('alchemy_sweetshop',{code:'glimmer_potion'},3),14);
  assert.equal(secondaryFinishedPrice('alchemy_sweetshop',{code:'novice_hp_potion_small'},3),24);
  assert.equal(secondaryFinishedPrice('alchemy_sweetshop',{code:'alchemy_skill_reset_elixir'},3),838);
  for(const item of alchemyOutputDefinitions.filter(item=>item.code.startsWith('alchemy_base_')&&!/_q[12]$/.test(item.code)))assert.equal(secondaryFinishedPrice('alchemy_sweetshop',{code:item.code,required_level:item.level},3),187,item.code);
  for(const level of [5,10,15]){
    const item={code:`shop_longsword_${level}`,required_level:level,retail_price:({5:200,10:400,15:1000} as Record<number,number>)[level]!,trade_price:999999};
    assert.equal(secondaryFinishedPrice('blacksmith',item,3),item.retail_price*2);
  }
});
test('异械逐层核算构件失败损耗，按半价材料锚还原成本，不漏前置步骤',()=>{
  for(const recipe of constructionRecipes.filter(recipe=>recipe.outputType!=='material')){
    const cost=constructionSupplyCost(recipe.code,3);
    assert.equal(cost.materialCost,constructionValueByCode.get(recipe.code)!*2);
    assert.ok(cost.expectedCost>=cost.materialCost,recipe.code);
    const price=secondaryFinishedPrice('oddworkshop',{code:recipe.code},3);
    assert.ok(price>=2*Math.max(100,Math.ceil(constructionValueByCode.get(recipe.code)!*2.5)),recipe.code);
  }
  const advanced=constructionSupplyCost('rocket_propeller',3);assert.ok(advanced.expectedCost>advanced.materialCost);
  assert.ok(secondaryFinishedPrice('oddworkshop',{code:'muscle_pacer'},1)>secondaryFinishedPrice('oddworkshop',{code:'muscle_pacer'},3));
  assert.throws(()=>constructionSupplyCost('missing_recipe',3),/缺少获取成本/);
});
