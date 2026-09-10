import test from 'node:test';
import assert from 'node:assert/strict';
import {offhandAttributeMultiplier,weaponMasteryBonusesFor} from '../src/game/weapon-mastery.service';
test('副手从未学习/随心1级的50%逐级到6级100%，超限不溢出',()=>{
  for(const [level,expected] of [[0,.5],[1,.5],[2,.6],[3,.7],[4,.8],[5,.9],[6,1],[100,1]])assert.equal(offhandAttributeMultiplier(level),expected);
  assert.equal(offhandAttributeMultiplier(undefined),.5);
});
test('副手按自身武器精通匹配；同类型双持也独立缩放副手属性',async()=>{
  const equipment=[{slot:'weapon',weapon_type:'长剑'},{slot:'offhand',weapon_type:'长剑'}];
  const skills=[{name:'长剑精通',passive_effect_json:{weaponType:'长剑',critRatePct:40,masteryStepPct:10},proficiency:1,focus:3},{name:'法杖精通',passive_effect_json:{weaponType:'法杖',critDamagePct:40},proficiency:1,focus:6}];
  const connection={execute:async(sql:string)=>[sql.includes('FROM player_equipment')?equipment:skills]};
  const result=await weaponMasteryBonusesFor(connection as any,1);
  assert.equal(result.offhandAttributeMultiplier,.7);assert.equal(result.critRatePct,40);
  equipment[1]!.weapon_type='法书';
  assert.equal((await weaponMasteryBonusesFor(connection as any,1)).offhandAttributeMultiplier,.5);
});
