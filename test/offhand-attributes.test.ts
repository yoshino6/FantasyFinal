import test from 'node:test';
import assert from 'node:assert/strict';
import {offhandAttributeMultiplier,weaponMasteryBonusesFor} from '../src/game/weapon-mastery.service';
import {calculateDerivedStats} from '../src/game/constants';
import {calculatePanelStats} from '../src/game/panel-stat-formula';
test('副手从未学习/随心1级的50%逐级到6级100%，超限不溢出',()=>{
  for(const [level,expected] of [[0,.5],[1,.5],[2,.6],[3,.7],[4,.8],[5,.9],[6,1],[100,1]])assert.equal(offhandAttributeMultiplier(level),expected);
  assert.equal(offhandAttributeMultiplier(undefined),.5);
});
test('同类型双持的主副手专精先相加，副手按对应随心等级衰减',async()=>{
  const equipment=[{slot:'weapon',weapon_type:'长剑'},{slot:'offhand',weapon_type:'长剑'}];
  const skills=[{name:'长剑精通',passive_effect_json:{weaponType:'长剑',critRatePct:40,masteryStepPct:10},proficiency:1,focus:3},{name:'法杖精通',passive_effect_json:{weaponType:'法杖',critDamagePct:40},proficiency:1,focus:6}];
  const connection={execute:async(sql:string)=>[sql.includes('FROM player_equipment')?equipment:skills]};
  const result=await weaponMasteryBonusesFor(connection as any,1);
  assert.equal(result.offhandAttributeMultiplier,.7);assert.equal(result.critRatePct,68);
  assert.deepEqual(result.details,['【长剑精通】主手长剑：暴击+40%','【长剑精通】副手长剑：暴击+28%']);
  const base=calculateDerivedStats({constitution:20,spirit:20,strength:20,intelligence:20,agility:20,perception:20});
  assert.equal(calculatePanelStats(base,{}, {},[{critRatePct:result.critRatePct}]).critRateBp,Math.floor(base.critRateBp*1.68));
  skills[0]!.focus=1;assert.equal((await weaponMasteryBonusesFor(connection as any,1)).critRatePct,60);
  skills[0]!.focus=6;assert.equal((await weaponMasteryBonusesFor(connection as any,1)).critRatePct,80);
  equipment[1]!.weapon_type='法书';
  const mixed=await weaponMasteryBonusesFor(connection as any,1);
  assert.equal(mixed.offhandAttributeMultiplier,.5);assert.equal(mixed.critRatePct,40);
});
