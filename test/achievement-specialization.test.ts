import test from 'node:test';
import assert from 'node:assert/strict';
import {normalSkillSpecializationFacts} from '../src/game/achievement-hooks';

test('A09 仅记录已经投入SP且实际释放的普通技能专精，并按方向去重',()=>{
 const facts=normalSkillSpecializationFacts('magic',[
  {specialization:'overcharge',level:2},{specialization:'instant',level:3},
  {specialization:'efficient',level:2},{specialization:'potent',level:4},
  {specialization:'potent',level:4},{specialization:'unknown',level:9}
 ]);
 assert.deepEqual(facts,[
  {metric:'ACH_A09',distinct:'overcharge',life:true},
  {metric:'ACH_A09',distinct:'instant',life:true},
  {metric:'ACH_A09',distinct:'efficient',life:true},
  {metric:'ACH_A09',distinct:'potent',life:true}
 ]);
 assert.deepEqual(normalSkillSpecializationFacts('physical',[{specialization:'overcharge',level:1}]),[]);
 assert.deepEqual(normalSkillSpecializationFacts('passive',[{specialization:'potent',level:9}]),[]);
});
