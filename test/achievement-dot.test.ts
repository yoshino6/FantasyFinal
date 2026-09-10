import test from 'node:test';
import assert from 'node:assert/strict';
import {CombatRules,emptyRuleState,type RuleUnit} from '../src/game/combat-rule-registry';
import {achievementBattleEvidence} from '../src/game/achievement-combat';

const unit=(key:string,side:string,hp=100):RuleUnit=>({key,name:key,side,level:10,boss:false,hp,hpMax:100,mp:0,mpMax:0,attack:10,magic:10,defense:1,magicDefense:1,accuracy:100,evasion:0,crit:0,critResist:0,critDamage:0,critReduction:0,pierce:0,tenacity:0,state:emptyRuleState(),cooldowns:{},passives:[],resistance:{},mastery:{}});
const hooks:any={absorb:async()=>0,legacyEffects:()=>[],removeLegacy:async()=>{},updateLegacy:async()=>{},transferLegacy:async()=>false,extraAction:()=>{}};

test('C11 仅由有来源的DOT直接造成最后实际损血时记录',async()=>{
 const source=unit('member:1','member'),target=unit('target:2','target',1),rules=new CombatRules([source,target],1,[],hooks,'');
 rules.add(target,'burn',5,1,source,true);await rules.beforeAction(target);
 assert.deepEqual(achievementBattleEvidence(source).dotKills,['target:2']);
 const shielded=unit('target:3','target',1),again=new CombatRules([source,shielded],1,[],hooks,'');
 again.add(shielded,'shield',99,1,shielded);again.add(shielded,'burn',5,1,source,true);await again.beforeAction(shielded);
 assert.deepEqual(achievementBattleEvidence(source).dotKills,['target:2']);
});
