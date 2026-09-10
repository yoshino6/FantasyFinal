import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutomaton } from '../src/game/automaton';
import { automatonSkills } from '../src/game/automaton-skill-catalog';
import { CombatRules, emptyRuleState, type RuleUnit } from '../src/game/combat-rule-registry';
import { actAutomaton, chooseAutomatonAction, automatonRuleUnit, installAutomatonRules, type AutomatonBattleState } from '../src/game/automaton-combat';

const fixture=(skills:string[]=[])=>{
  const state=createAutomaton('combat-test');state.level=30;state.stats=[5000,1000,200,160,100,100,100,100,100,0,0,15000,0,20,20];state.hp=5000;state.mp=1000;state.equipped=skills;
  const battle:AutomatonBattleState={pet:state,rule:emptyRuleState(),cooldowns:{},sync:100,ultimateUsed:false,actionCount:0,exited:false,threat:{}};
  const unit=automatonRuleUnit(7,battle),owner:RuleUnit={...unit,key:'member:1',name:'主人',hp:5000,mp:1000,state:emptyRuleState(),cooldowns:{},selected:'target:1'},enemy:RuleUnit={...owner,key:'target:1',name:'敌人',side:'target',hp:100000,hpMax:100000,state:emptyRuleState(),cooldowns:{},selected:owner.key};
  const rules=new CombatRules([owner,enemy],1,[],{absorb:async()=>0,legacyEffects:()=>[],removeLegacy:async()=>{},extraAction:()=>{},swapThreat:async()=>{}},'',undefined,()=>.1);
  const pet={id:7,ownerId:1,battle,unit};installAutomatonRules(rules,[pet]);return{rules,pet,owner,enemy};
};
test('机巧普攻与同面板角色共用完整公式，没有额外伤害折扣',async()=>{
  const a=fixture(),b=fixture();assert.equal(a.pet.unit.name,a.pet.battle.pet.name);a.pet.battle.manual='普攻';await actAutomaton(a.rules,a.pet);assert.equal(a.pet.unit.name,a.pet.battle.pet.name);assert(!a.rules.log.join('\n').includes('（机巧）'));assert(a.rules.log.some(line=>line.includes('➤〖'+a.pet.battle.pet.name+'〗')));await b.rules.strike(b.owner,b.enemy,100,'无',false,false,false,1,{skill:false,single:true});assert.equal(100000-a.enemy.hp,100000-b.enemy.hp);assert(100000-a.enemy.hp>0);
});
test('全部 88 个主动与大招可独立结算，全部被动可装配',async()=>{
  for(const skill of automatonSkills){const {rules,pet,owner,enemy}=fixture([skill.id]);owner.hp=2000;pet.unit.hp=2500;pet.unit.mp=800;
    if(['A','ULT'].includes(skill.kind)){pet.battle.manual=skill.id;await actAutomaton(rules,pet);if(pet.battle.channel){rules.turn++;await actAutomaton(rules,pet);}assert(rules.log.length>0,skill.id);assert(pet.unit.mp>=0,skill.id);if(skill.kind==='ULT')assert(pet.battle.ultimateUsed,skill.id);}
    else await rules.strike(enemy,pet.unit,100,'无',false);
    assert(Number.isFinite(pet.unit.hp)&&Number.isFinite(pet.unit.mp),skill.id);
  }
});
test('持续伤害每轮一次、每具机巧最多两种，不因额外行动重复结算',async()=>{
  const {rules,pet,enemy}=fixture(['N073','N074','N078']);
  for(const id of ['N073','N074','N078']){pet.battle.pet.equipped=[id];await actAutomaton(rules,pet);}
  assert.equal(enemy.state.statuses.filter(e=>e.code.startsWith('automaton_dot_')).length,2);
  const old=enemy.hp;await rules.beforeAction(enemy);assert(enemy.hp<old);const once=enemy.hp;await rules.beforeAction(enemy);assert.equal(enemy.hp,once);
});
test('护主仅直击且每场一次；全额吸收不会把挡刀资格泄漏给 DOT',async()=>{
  const {rules,pet,owner,enemy}=fixture();pet.battle.pet.personality.interceptChance=1;owner.hp=600;
  await rules.shield(owner,owner,1000,2);const hp=pet.unit.hp;await rules.strike(enemy,owner,100,'无',false);await rules.consume(owner,'shield');await rules.secondary(enemy,owner,100,'持续');assert.equal(pet.unit.hp,hp);
  await rules.strike(enemy,owner,100,'无',false);assert(pet.unit.hp<hp);const guarded=pet.unit.hp;await rules.strike(enemy,owner,100,'无',false);assert.equal(pet.unit.hp,guarded);
});
test('主人倒下立即退出、蓄力被沉默打断且不返还同步',async()=>{
  const {rules,pet,owner,enemy}=fixture(['S025']);pet.battle.manual='S025';await actAutomaton(rules,pet);assert.equal(pet.battle.channel,'S025');assert.equal(pet.battle.sync,0);rules.turn++;rules.add(pet.unit,'silence',1,2,enemy,true);await actAutomaton(rules,pet);assert.equal(pet.battle.channel,undefined);assert(pet.battle.ultimateUsed);
  owner.hp=1;pet.battle.pet.personality.interceptChance=0;await rules.strike(enemy,owner,100,'无',false);assert(pet.battle.exited);const hp=enemy.hp;await actAutomaton(rules,pet);assert.equal(enemy.hp,hp);
});

test('裂盾额外伤害只消耗护盾，破盾不额外放大生命伤害',async()=>{
  const a=fixture(),b=fixture();a.rules.add(a.enemy,'shield',120,2,a.enemy);b.rules.add(b.enemy,'shield',120,2,b.enemy);
  await a.rules.take(a.enemy,100,1.4);await b.rules.take(b.enemy,100);assert.equal(a.enemy.hp,b.enemy.hp);assert.equal(a.rules.shieldValue(a.enemy),0);assert.equal(b.rules.shieldValue(b.enemy),20);
  const c=fixture();c.rules.add(c.enemy,'shield',50,2,c.enemy);await c.rules.take(c.enemy,100,1.4);assert.equal(c.enemy.hp,99950);
});
test('净化修护先移除禁疗再回复；退出单位不能被治疗或加盾',async()=>{
  const {rules,pet,owner}=fixture(['N044']);owner.hp=2000;rules.add(owner,'alchemy_antiheal',90,3,pet.unit,true);pet.battle.manual='N044';await actAutomaton(rules,pet);assert.equal(owner.hp,2096);
  pet.battle.exited=true;pet.unit.hp=200;await rules.restore(owner,pet.unit,1000);await rules.shield(owner,pet.unit,1000,3);assert.equal(pet.unit.hp,200);assert.equal(rules.shieldValue(pet.unit),0);
});

test('旧策略、手动指令、挡刀开关不干预性格与危机决策',async()=>{
  const {rules,pet,owner,enemy}=fixture(['N001','N025']);
  owner.hp=5000;pet.unit.hp=5000;
  const expected=chooseAutomatonAction(rules,pet,owner);assert.equal(expected,'N001');
  for(const strategy of ['进攻','守护','节能'] as const){pet.battle.pet.strategy=strategy;pet.battle.manual='待机';assert.equal(chooseAutomatonAction(rules,pet,owner),expected);}
  pet.unit.hp=1;assert.equal(chooseAutomatonAction(rules,pet,owner),'N025');
  pet.unit.hp=5000;owner.hp=600;pet.battle.pet.guard=false;pet.battle.pet.personality.interceptChance=1;
  await rules.strike(enemy,owner,100,'无',false);assert(pet.unit.hp<5000);
});
