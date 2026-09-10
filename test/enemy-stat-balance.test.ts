import test from 'node:test';
import assert from 'node:assert/strict';
import {monsterAttributes,monsterCombatStats,regionalBossComponentStats} from '../src/game/adventure.service';
import {monsterGrowthCoefficient} from '../src/game/monster-growth';
import {monsterGrowthAnchors} from '../src/config/monster-growth-anchors';
import {playerGrowthShares} from '../src/game/growth-rules';
import {attributes,type Allocation} from '../src/game/types';
import {calculateDerivedStats,virtualEquipmentStats} from '../src/game/constants';
import {withVirtualNpcEquipment} from '../src/game/character.service';
import {buildNpcSparProfile,recalculateNpcSparProfileStats} from '../src/game/npc-sparring.config';
import {previousMonsterHpMax,migratedEnemyHp} from '../src/game/enemy-stat-balance';
import {regionalBossComponentsFor} from '../src/game/regional-boss-components.config';
const row=(code='goblin',level=20)=>({...Object.fromEntries(attributes.flatMap(k=>[[k,20],[`${k}_growth`,2]])),code,level,monster_class:'normal',traits_json:[]} as any);
test('同一种怪物固定成长基数，十级增量1/2/3/4；新种类也不能每十级换基数',()=>{
  for(const code of ['goblin','forest_slime','new_monster']){
    const coefficient=monsterGrowthCoefficient(code,1);
    for(let level=2;level<=100;level++){
      assert.equal(monsterGrowthCoefficient(code,level),coefficient);
      assert.equal(playerGrowthShares(level)-playerGrowthShares(level-1),Math.ceil(level/10));
      assert.equal(monsterAttributes(row(code,level)).strength,Math.floor(20+2*coefficient*playerGrowthShares(level)+1e-9));
    }
  }
});
test('所有配置种类在校准等级还原旧躯体，以下等级不会变强',()=>{
  for(const [code,anchor] of Object.entries(monsterGrowthAnchors)){
    if(code.startsWith('city_')||code.startsWith('mentor_trial_')||code==='scholar_ga')continue;
    assert.equal(monsterAttributes(row(code,anchor)).strength,20+2*(anchor-1));
    for(let level=1;level<=anchor;level++)assert.ok(monsterAttributes(row(code,level)).strength<=20+2*(level-1));
  }
});
test('出生随机六维不改写，数据库模板别名和种类码使用同一成长',()=>{
  const input=row('goblin',25),saved=structuredClone(input);
  const expected=monsterAttributes(input);delete input.code;input.growth_template_code='goblin';
  assert.deepEqual(monsterAttributes(input),expected);assert.equal(input.constitution,saved.constitution);
});
test('居民型怪物直接使用人物分段成长',()=>{
  for(const code of ['city_patrol','mentor_trial_test','scholar_ga'])assert.equal(monsterAttributes(row(code,40)).strength,218);
});
test('居民整套双防为怪物预算两倍，副词条不再次翻倍',()=>{
  const monster=virtualEquipmentStats(30,'large',100,0),resident=virtualEquipmentStats(30,'large',100,0,undefined,'resident');
  assert.equal(resident.physicalDefense,monster.physicalDefense*2);
  assert.equal(resident.hpMax,monster.hpMax);assert.equal(resident.physicalAttack,monster.physicalAttack);
});
test('队友NPC全部15项虚拟属性均进入面板',()=>{
  const base=calculateDerivedStats(Object.fromEntries(attributes.map(k=>[k,30])) as Allocation);
  const gear=virtualEquipmentStats(10,'elite',base.physicalAttack,base.magicAttack,undefined,'resident');
  const next=withVirtualNpcEquipment(base,10,'npc_forest_mage');
  for(const key of Object.keys(base) as Array<keyof typeof base>)assert.equal(next[key],base[key]+gear[key]);
  assert.deepEqual(withVirtualNpcEquipment(base,10,null),base);
});
test('域民重算保留身份、等级、装备与技能；套装实际交给敌方战斗适配器',()=>{
  const profile=buildNpcSparProfile({code:'alchemy_sweetshop',name:'晴儿',description:'炼金',region_code:'baina_town'},20,0);
  const next={...profile,...recalculateNpcSparProfileStats(profile)};
  assert.deepEqual(next,profile);assert.equal(profile.armorSet?.hitCorrectionPct,33);assert.equal(profile.armorSet?.evasionCorrectionPct,33);
  assert.equal(profile.trainedAttributes.spirit,25+3.7*playerGrowthShares(profile.level));
  assert.deepEqual(next.rotation,profile.rotation);assert.deepEqual(next.equipment,profile.equipment);
  assert.equal(profile.fixedGrowth.intelligence,3.9);
  assert.deepEqual(recalculateNpcSparProfileStats(JSON.parse(JSON.stringify(profile))),recalculateNpcSparProfileStats(profile));
});
test('剧情标记无展示名仍计算三倍生命，迁移保留受伤比例及零生命',()=>{
  const normal=row(),quest={...normal,traits_json:[{code:'main_quest_evolution',name:''}]};
  assert.equal(monsterCombatStats(quest).hpMax,monsterCombatStats(normal).hpMax*3);
  assert.equal(previousMonsterHpMax(quest),previousMonsterHpMax(normal));
  assert.equal(migratedEnemyHp(25,100,200),50);assert.equal(migratedEnemyHp(0,100,200),0);assert.equal(migratedEnemyHp(300,100,200),200);
});
test('切磋与导师鉴识六维读取实际构筑，不能展示占位模板的六维',()=>{
  const six={constitution:123.4,spirit:56,strength:78,intelligence:91,agility:34,perception:88};
  const spar={...row('npc_sparring_dummy',30),traits_json:[{code:'npc_sparring',name:'',profile:{trainedAttributes:six}}]};
  const mentor={...row('mentor_trial_test',30),traits_json:[{code:'advanced_mentor_build',name:'毕业构筑',build:{trainedAttributes:six}}]};
  assert.deepEqual(monsterAttributes(spar),six);assert.deepEqual(monsterAttributes(mentor),six);
});
test('部位从新本体最终数值派生，读入快照不会再叠虚拟装备',()=>{
  const body=monsterCombatStats(row('gruen_mountainheart',32));
  for(const definition of regionalBossComponentsFor('gruen_mountainheart')){
    const stats=regionalBossComponentStats(body,definition);
    assert.equal(stats.hpMax,Math.floor(body.hpMax*definition.hpRatio));
    const part={...row(definition.templateCode,32),traits_json:[{code:'boss_component',name:'',stats}]};
    assert.deepEqual(monsterCombatStats(part),stats);
  }
});
