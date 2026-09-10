import test from 'node:test';
import assert from 'node:assert/strict';
import {achievementBattleAction,achievementBattleContribution,achievementBattleEvidence,achievementHit} from '../src/game/achievement-combat';

const unit=(key:string,side:string):any=>({key,side,hp:100,hpMax:100,boss:false,state:{memory:{achievementAction:1}},cooldowns:{},passives:[],resistance:{},mastery:{}});

test('C19 与 C25 的动作和贡献按实际行动去重',()=>{
 const actor=unit('member:1','member');
 for(const kind of ['attack','defend','support'] as const)achievementBattleAction(actor,kind);
 achievementBattleContribution(actor,'defend');achievementBattleContribution(actor,'defend');
 actor.state.memory.achievementAction=2;achievementBattleContribution(actor,'support');
 actor.state.memory.achievementAction=3;achievementBattleContribution(actor,'support');
 const evidence=achievementBattleEvidence(actor);
 assert.deepEqual(evidence.actionKinds,['attack','defend','support']);
 assert.deepEqual(evidence.contributionActions,['defend:1','support:2','support:3']);
});

test('C17 的实际损血不把护盾吸收或入射数值写成伤害',()=>{
 const source=unit('target:9','target'),target=unit('member:1','member');
 achievementHit(source,target,100,'火',100,JSON.stringify({source:'target:9',hpBefore:100,hpAfter:100}));
 assert.equal(achievementBattleEvidence(target).actualHpLost,0);
 achievementHit(source,target,100,'火',70,JSON.stringify({source:'target:9',hpBefore:100,hpAfter:70}));
 assert.equal(achievementBattleEvidence(target).actualHpLost,30);
 assert.equal(achievementBattleEvidence(source).damage,30);
});
