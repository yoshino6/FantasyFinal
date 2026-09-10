import test from 'node:test';
import assert from 'node:assert/strict';
import {componentVictoryFacts} from '../src/game/achievement-combat';

test('B22 只认可同一玩家对同一首领两个不同部位的实际扣血',()=>{
 const boss=new Set(['target:100']);
 assert.deepEqual(componentVictoryFacts({componentHits:['target:101|target:100','target:102|target:100']} as any,boss),[{metric:'ACH_B22'}]);
 assert.deepEqual(componentVictoryFacts({componentHits:['target:101|target:100','target:101|target:100']} as any,boss),[]);
 assert.deepEqual(componentVictoryFacts({componentHits:['target:101|target:999','target:102|target:999']} as any,boss),[]);
});

test('B23 需要先由本人击破有效部位，再击杀对应本体',()=>{
 const boss=new Set(['target:100']);
 assert.deepEqual(componentVictoryFacts({defeatSequence:['target:101|target:100','target:100']} as any,boss),[{metric:'ACH_B23'}]);
 assert.deepEqual(componentVictoryFacts({defeatSequence:['target:100','target:101|target:100']} as any,boss),[]);
 assert.deepEqual(componentVictoryFacts({defeatSequence:['target:101|target:999','target:100']} as any,boss),[]);
});
