import assert from 'node:assert/strict';
import test from 'node:test';
import {achievementBoxes,achievementBoxLoot,achievementBoxRewardForRarity,achievementRewardItems} from '../src/game/achievement-rewards.config';
import {itemUsePolicy} from '../src/game/item-use-policy';

test('成就稀有度严格映射三档道具匣数量',()=>{
  assert.deepEqual(['普通','优秀','精良','稀有','传说','史诗'].map(achievementBoxRewardForRarity),[
    {key:'odd_box',quantity:1},{key:'odd_box',quantity:2},{key:'odd_box',quantity:3},
    {key:'rare_box',quantity:1},{key:'rare_box',quantity:2},{key:'collector_box',quantity:1}
  ]);
  assert.throws(()=>achievementBoxRewardForRarity('神器'),/未知成就稀有度/);
});

test('奇异匣仅包含既有三件道具，奇珍匣秩序碎片概率为15%、4%、1%',()=>{
  assert.deepEqual(achievementBoxLoot.odd_box.map(item=>item.key),['rare_glass','rare_charm','rare_thunder']);
  const rareTotal=achievementBoxLoot.rare_box.reduce((sum,item)=>sum+item.weight,0);
  assert.equal(rareTotal,1000);
  assert.deepEqual(achievementBoxLoot.rare_box.filter(item=>item.key==='order_fragment').map(item=>[item.quantity,item.weight]),[[1,150],[2,40],[3,10]]);
});

test('珍藏匣有多种史诗强力产物，所有消耗品均已有使用入口',()=>{
  assert.ok(achievementBoxLoot.collector_box.length>=5);
  assert.equal(achievementBoxLoot.collector_box.reduce((sum,item)=>sum+item.weight,0),100);
  assert.deepEqual(achievementBoxLoot.collector_box.filter(item=>item.key==='order_fragment').map(item=>[item.quantity,item.weight]),[[1,30],[2,15],[3,3],[4,1],[5,1]]);
  assert.ok(achievementBoxes.collector_box.description.includes('强力'));
  for(const item of achievementRewardItems)assert.equal(item.effect.personalOnly,true,`${item.name}必须个人绑定`);
  for(const item of achievementRewardItems.filter(item=>item.itemType==='consumable'))assert.notEqual(itemUsePolicy({id:1,code:item.key,item_type:'consumable',effect_json:item.effect}).kind,'unsupported',item.name);
  const revival=achievementRewardItems.find(item=>item.key==='rebirth_ember')!;
  assert.equal(itemUsePolicy({id:1,code:revival.key,item_type:'consumable',effect_json:revival.effect}).kind,'direct');
  for(const key of ['rare_thunder','skybreak_seal','heavenly_decree']){
    const item=achievementRewardItems.find(entry=>entry.key===key)!;
    assert.equal(item.effect.trueHit,true,`${item.name}必须必中`);assert.equal(item.effect.noCrit,true,`${item.name}不可暴击`);
  }
});
