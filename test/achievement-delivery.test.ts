import test from 'node:test';
import assert from 'node:assert/strict';
import {achievementDeliveryOutcome} from '../src/game/achievement-delivery-rules';
test('成功回执标记已发送并保存平台消息编号',()=>{
  assert.deepEqual(achievementDeliveryOutcome([{code:2000,data:{id:'message-one'}}]),{status:'sent',resultCodes:[2000],platformCodes:[],messageIds:['message-one']});
});
test('无权限的主动消息不再进入自动重试队列',()=>{
  assert.equal(achievementDeliveryOutcome([{code:4000,message:{message:'主动消息失败, 无权限',code:40034105}}]).status,'blocked');
  assert.equal(achievementDeliveryOutcome([{code:4002}]).status,'blocked');
});
test('超时或未知失败不重发，部分送达也保留待核查',()=>{
  for(const results of [[],[{code:4000,message:'行为超时'}],[{code:4000,message:'socket hang up'}],[{code:5000}],[{code:2000,data:{id:'accepted'}},{code:4000,message:'行为超时'}]]){
    assert.equal(achievementDeliveryOutcome(results).status,'uncertain');
  }
});
test('审计仅保存状态码和平台消息编号，不保存连接信息',()=>{
  const outcome=achievementDeliveryOutcome([{code:4000,data:{headers:{Authorization:'SECRET'}},message:'unknown'}]);
  assert.ok(!JSON.stringify(outcome).includes('SECRET'));
});
