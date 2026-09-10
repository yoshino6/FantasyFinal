import test from 'node:test';
import assert from 'node:assert/strict';
import {CombatRules,emptyRuleState,type RuleUnit} from '../src/game/combat-rule-registry';
import {residentSkillByCode} from '../src/game/resident-skill.config';
import {achievementBattleEvidence,achievementCombatObserved,achievementHit} from '../src/game/achievement-combat';
import {takeAchievementEvents} from '../src/game/achievement-events';
import {forgeAchievementFacts,alchemyUtilityOutput} from '../src/game/achievement-production';
import {alchemyOutputDefinitions} from '../src/game/alchemy-catalog';
const unit=(key:string,side='member'):RuleUnit=>({key,name:key,side,level:30,boss:false,hp:6000,hpMax:10000,mp:2000,mpMax:3000,attack:700,magic:800,defense:400,magicDefense:450,accuracy:100,evasion:30,speed:100,crit:100,critResist:100,critDamage:100,critReduction:100,pierce:100,tenacity:100,state:emptyRuleState(),cooldowns:{},passives:[],resistance:{},mastery:{}});
const fixture=()=>{const source=unit('member:1'),friend=unit('member:2'),target=unit('target:3','target');const rules=new CombatRules([source,friend,target],1,[],{absorb:async()=>0,legacyEffects:()=>[],removeLegacy:async()=>{},extraAction:()=>{},swapThreat:async()=>{}},'',[],()=>.01);return{source,friend,target,rules};};
const emitted=(u:RuleUnit)=>{const c={} as any;achievementCombatObserved(c,'real-actions',[{id:1,cooldowns:{__rules:{memory:u.state.memory}}}]);return takeAchievementEvents(c).flatMap(e=>e.facts.map(f=>f.metric));};
test('C07 实际净化DOT；无状态、普通负面与受保护效果不误计',async()=>{
 const {source,friend,rules}=fixture();await rules.dispel(source,friend,true);assert.ok(!emitted(source).includes('ACH_C07'));
 rules.add(friend,'slow',10,2,source,true);await rules.dispel(source,friend,true);assert.ok(!emitted(source).includes('ACH_C07'));
 rules.add(friend,'poison',10,2,source,true);await rules.dispel(source,friend,true);assert.ok(emitted(source).includes('ACH_C07'));assert.equal(rules.status(friend,'poison'),undefined);
});
test('C08 真实打断吟唱，仅沉默未吟唱目标不计',async()=>{
 const f=fixture(),skill=residentSkillByCode('L04')!;await f.rules.cast(f.source,f.target,skill,skill.mana);assert.ok(!emitted(f.source).includes('ACH_C08'));
 f.target.state.cast={code:'test',paid:20,releaseTurn:3} as any;const mp=f.target.mp;await f.rules.cast(f.source,f.target,skill,skill.mana);assert.ok(emitted(f.source).includes('ACH_C08'));assert.equal(f.target.state.cast,undefined);assert.equal(f.target.mp,mp+10);
});
test('C10 真实护盾归零；未破盾、友方盾与零伤害不计',async()=>{
 const f=fixture();f.rules.add(f.target,'shield',100,2,f.target);await f.rules.takeUnlinked(f.target,99,1,f.source);assert.ok(!emitted(f.source).includes('ACH_C10'));await f.rules.takeUnlinked(f.target,1,1,f.source);assert.ok(emitted(f.source).includes('ACH_C10'));
 const g=fixture();g.rules.add(g.friend,'shield',10,2,g.friend);await g.rules.takeUnlinked(g.friend,10,1,g.source);assert.ok(!emitted(g.source).includes('ACH_C10'));
});
test('G10 敌方三次行动与同一次多段命中分开记录',async()=>{
 const f=fixture();await f.rules.beforeAction(f.target);for(let i=0;i<5;i++)achievementHit(f.target,f.source,1,'无',0);assert.equal(achievementBattleEvidence(f.source).receivedActions?.length,1);
 await f.rules.beforeAction(f.target);achievementHit(f.target,f.source,1,'无',0);await f.rules.beforeAction(f.target);achievementHit(f.target,f.source,1,'无',0);assert.equal(achievementBattleEvidence(f.source).receivedActions?.length,3);
});
test('I18-I20 实际材料分类、正数量、模板签名与稀有图纸统一',()=>{
 const facts=forgeAchievementFacts('forge:test',[{code:'meteor_iron',category:'锻材',quantity:1},{code:'ridge_core',category:'锻材',quantity:1}]);for(const id of ['ACH_I18','ACH_I19','ACH_I20'])assert.ok(facts.some(f=>f.metric===id));
 const rejected=forgeAchievementFacts('forge:test',[{code:'meteor_iron',category:'锻材',quantity:0},{code:'ridge_core',category:'怪材',quantity:1}]);assert.ok(!rejected.some(f=>['ACH_I18','ACH_I19'].includes(f.metric)));assert.equal(facts.find(f=>f.metric==='ACH_E24')?.distinct,'forge:test');
});
test('H18 用真实炼金目录区分直接恢复、持续恢复及战斗增益制品',()=>{
 for(const code of ['alchemy_base_life_draught','alchemy_base_mana_draught','alchemy_base_regrowth_salve','alchemy_base_mana_flow'])assert.equal(alchemyUtilityOutput(alchemyOutputDefinitions.find(d=>d.code===code)!.effect),false);
 assert.equal(alchemyUtilityOutput(alchemyOutputDefinitions.find(d=>d.code==='alchemy_base_ward_tonic')!.effect),true);
 assert.equal(alchemyUtilityOutput({throwable:{damageScale:1,element:'火'}}),true);
});

test('EGG13 Boss第1回合首次行动满血致死：实际伤害与免死边界',async()=>{
 const f=fixture();f.source.hp=f.source.hpMax;f.target.boss=true;await f.rules.beforeAction(f.target);
 await f.rules.takeUnlinked(f.source,20000,1,f.target);await f.rules.afterHit(f.target,f.source,10000,'火',true);assert.equal(achievementBattleEvidence(f.source).bossOpeningKnockout,f.target.key);
 for(const mode of ['hurt','second','feign','shield']){const g=fixture();g.target.boss=true;g.source.hp=mode==='hurt'?g.source.hpMax-1:g.source.hpMax;await g.rules.beforeAction(g.target);if(mode==='second')await g.rules.beforeAction(g.target);if(mode==='feign')g.rules.add(g.source,'feign',1,2,g.source);if(mode==='shield')g.rules.add(g.source,'shield',50000,2,g.source);await g.rules.takeUnlinked(g.source,20000,1,g.target);await g.rules.afterHit(g.target,g.source,mode==='shield'?0:10000,'火',true);assert.equal(achievementBattleEvidence(g.source).bossOpeningKnockout,undefined,mode);}
});
