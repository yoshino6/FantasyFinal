import test from 'node:test';
import assert from 'node:assert/strict';
import { playerGrowthShares } from '../src/game/growth-rules';
import { forgedEquipmentBase, forgedAffixCap, forgedPrimaryStats, virtualEquipmentStats } from '../src/game/constants';
import { forgeEquipmentCapsFor } from '../src/game/blacksmith.service';
import { armorSlots, armorPanelPercent } from '../src/game/armor-class';
import { armorSetFromRows } from '../src/game/armor-set';
import { equipmentBalancePreview, resetLegacyEquipmentPrimary } from '../src/game/equipment-balance';
import { createAutomaton, migrateAutomatonGrowth } from '../src/game/automaton';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('成长十级边界及后续等级衔接，没有虚构0升1',()=>{
  for (const [level,shares] of [[0,0],[1,0],[10,9],[11,11],[20,29],[21,32],[30,59],[31,63],[40,99],[41,104],[50,149],[100,549]]) assert.equal(playerGrowthShares(level),shares);
  for(let level=2;level<=100;level++)assert.equal(playerGrowthShares(level)-playerGrowthShares(level-1),Math.ceil(level/10));
});
test('普通满品质标准躯体：武器2比1、整套双防1比1；怪物虚拟套装不翻倍',()=>{
  for(const [level,body]of [[10,144.16666666666666],[20,287.5],[30,502.5],[40,789.1666666666666]]){
    close(forgedEquipmentBase(level,'武器'),body/2);
    close(armorSlots.reduce((sum,slot)=>sum+forgedEquipmentBase(level,'防具',slot),0),body);
    close(forgedEquipmentBase(level,'防具','upper'),body*.24);
    const monster=virtualEquipmentStats(level,'large',100,50);
    assert.equal(monster.physicalDefense,Math.floor(body/2));assert.equal(monster.physicalAttack,Math.floor(body/2));
  }
  close(forgedAffixCap('防具','hpMax',30,'普通'),496.8);
});
test('五件按2大3小连乘，混装和低品质也不会加算扣成负数',()=>{
  const plate=armorSlots.map(slot=>({slot,weapon_type:'板甲',quality:100}));
  const values=armorPanelPercent(plate);close(values.accuracyPct!,-51.91533568);close(values.critResistPct!,89.04711168);
  close(armorPanelPercent([...plate,{slot:'offhand',weapon_type:'板甲',quality:100},plate[0]!]).accuracyPct!,values.accuracyPct!);
  const low=armorPanelPercent(plate.map(row=>({...row,quality:0})));assert.ok(low.accuracyPct!>values.accuracyPct!);assert.ok(low.critResistPct!<values.critResistPct!);
  const mixed=armorPanelPercent([{slot:'upper',weapon_type:'布甲'},{slot:'lower',weapon_type:'板甲'}]);close(mixed.accuracyPct!,-2.56);
});
test('各甲类5件覆盖3件，固定套装数值与品质无关',()=>{
  const expected={布甲:[33,33,0,0,0,0],皮甲:[25,0,0,0,20,0],轻甲:[0,0,0,15,15,0],重甲:[0,0,16,25,0,0],板甲:[0,0,12,25,0,4]};
  for(const[name,values]of Object.entries(expected)){
    const set=armorSetFromRows(armorSlots.map(slot=>({slot,weapon_type:name,quality:0})))!;
    assert.deepEqual([set.hitCorrectionPct,set.evasionCorrectionPct,set.critAvoidanceCorrectionPct,set.panelPercent.hpPct??0,set.panelPercent.mpPct??0,set.damageReductionPct],values);
  }
});
test('装备迁移保留熔铸差额、负词条、标识；未知历史拒绝猜测；重跑不再缩放',()=>{
  const item={code:'epic_test',item_category:'上装',weapon_type:'板甲',required_level:30,rarity:'史诗',effect_json:{physicalDefense:496.8,magicDefense:496.8,hpMax:80,epicSetCode:'test'}};
  const first=equipmentBalancePreview(item,{...item.effect_json,physicalDefense:510,accuracyPct:-5});
  assert.equal(first.blocked,false);close(Number(first.effect.physicalDefense),254.4);close(Number(first.effect.magicDefense),241.2);assert.equal(first.effect.hpMax,80);assert.equal(first.effect.accuracyPct,-5);assert.equal(first.effect.epicSetCode,'test');
  assert.equal(equipmentBalancePreview(item,first.effect).changed,false);
  assert.equal(equipmentBalancePreview({...item,effect_json:{physicalDefense:13,magicDefense:19}}).blocked,true);
  assert.equal(equipmentBalancePreview({...item,rarity:'神器'}).changed,false);
});
test('机巧旧历史迁移保留出生、种子、技能及零生命，不重复迁移',()=>{
  const state=createAutomaton('balance-fixed-seed');delete state.growthBalanceVersion;state.hp=0;
  const next=migrateAutomatonGrowth(state);assert.deepEqual(next.stats,state.stats);assert.equal(next.hp,0);assert.equal(next.seed,state.seed);assert.deepEqual(next.learned,state.learned);assert.strictEqual(migrateAutomatonGrowth(next),next);
});

test('授权重设历史主词条，只保留台账和差额都能证明的增量',()=>{
  const item={code:'crafted_old',item_category:'上装',weapon_type:'板甲',required_level:30,rarity:'普通',effect_json:{physicalDefense:500,magicDefense:510,hpMax:90}};
  const next=resetLegacyEquipmentPrimary(item,{physicalDefense:520,magicDefense:510,hpMax:90,accuracyPct:-5},[{physicalDefense:80}]);
  assert.equal(next.effect.physicalDefense,140.6);assert.equal(next.effect.magicDefense,120.6);assert.equal(next.effect.hpMax,90);assert.equal(next.effect.accuracyPct,-5);
});

test('匕首保留双攻九折，副手盾牌保留武器预算，防具帽衣上限按部位区分',()=>{
  assert.deepEqual(forgedPrimaryStats('武器','匕首',30,'普通'),{physicalAttack:226.125,magicAttack:226.125});
  const shield=forgeEquipmentCapsFor('副手','盾牌',30,'普通',['physicalDefense','magicDefense']);assert.equal(shield.physicalDefense,251.25);assert.equal(shield.magicDefense,125.625);
  const upper=forgeEquipmentCapsFor('上装','板甲',30,'普通',['physicalDefense','magicDefense']);
  const head=forgeEquipmentCapsFor('头肩','布甲',30,'普通',['physicalDefense','magicDefense']);
  close(upper.physicalDefense!,244.8);close(head.physicalDefense!,211.3);
});
