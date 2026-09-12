import test from 'node:test';
import assert from 'node:assert/strict';
import { grantWindbirdChick } from '../src/game/companion.service';
import { grantOpeningAutomaton } from '../src/game/automaton.service';
import { grantOpeningRouteReward } from '../src/game/opening-rewards.service';
import { readFileSync } from 'node:fs';

type Call={sql:string;params:unknown[]};
const fakeConnection=(kind:'bird'|'automaton')=>{
  const calls:Call[]=[];
  const connection={execute:async(sql:string,params:unknown[]=[]):Promise<any>=>{
    calls.push({sql,params});
    if(/SELECT .*player_companions/.test(sql))return[[]];
    if(/COUNT\(\*\).*player_companions/.test(sql))return[[{total:0}]];
    if(/SELECT \* FROM player_automatons/.test(sql))return[[]];
    if(/COUNT\(\*\).*player_automatons/.test(sql))return[[{total:0}]];
    if(/INSERT INTO player_automatons/.test(sql))return[{insertId:17,affectedRows:1}];
    return[{affectedRows:1}];
  }};
  return{connection:connection as any,calls,kind};
};

test('风羽鸟蛋破壳后直接进入随从名册并出战随行',async()=>{
  const {connection,calls}=fakeConnection('bird');
  assert.equal(await grantWindbirdChick(connection,23),'风羽幼鸟');
  const insert=calls.find(call=>/INSERT INTO player_companions/.test(call.sql));
  assert.ok(insert);
  assert.match(insert.sql,/windbird_chick/);
  assert.match(insert.sql,/is_out,intimacy,stability,specialty/);
  assert.deepEqual(insert.params,[23]);
});

test('无主机偶生成既有人格后主动认主，并作为当前随行机巧保存',async()=>{
  const {connection,calls}=fakeConnection('automaton');
  const result=await grantOpeningAutomaton(connection,31);
  assert.equal(result.id,17);
  assert.equal(result.state.origin?.code,'I02');
  assert.equal(result.state.intimacy,10);
  assert.ok(result.state.personality.coreName);
  const insert=calls.find(call=>/INSERT INTO player_automatons/.test(call.sql));
  assert.ok(insert);
  assert.match(insert.sql,/owner_id/);
  assert.match(insert.sql,/following/);
  assert.deepEqual(insert.params.slice(0,3),[31,31,31]);
  assert.ok(calls.some(call=>/automaton_events/.test(call.sql)&&String(call.params[3])==='认主'));
});

test('剧情中的锻材与异械按现有物品和独立装备实例发放',async()=>{
  const calls:Call[]=[],names:Record<string,string>={home_wood:'普通木材',home_stone:'普通石料',home_metal:'普通金属',fire_crystal:'炉心赤晶',auxiliary_aiming_scope:'辅助瞄准镜'};
  const connection={execute:async(sql:string,params:unknown[]=[]):Promise<any>=>{
    calls.push({sql,params});
    if(/SELECT id,name FROM item_definitions/.test(sql)){const code=String(params[0]);return[[{id:99,name:names[code]??code}]];}
    if(/SELECT id FROM item_definitions/.test(sql))return[[{id:11}]];
    if(/SELECT name FROM item_definitions/.test(sql)){const code=String(params[0]);return[[{name:names[code]??code}]];}
    if(/INSERT INTO player_item_instances/.test(sql))return[{insertId:501,affectedRows:1}];
    return[{affectedRows:1}];
  }} as any;
  const reward=await grantOpeningRouteReward(connection,8,{code:'E03',title:'怕血的魔剑',version:3} as any,{code:'B',rewardCode:'opening_e03_b',rewardKind:'工料',rewardItems:[{code:'fire_crystal',quantity:1}],rewardEquipment:'auxiliary_aiming_scope',rewardUse:'实际奖励',future:'炉火线索'} as any);
  assert.match(reward,/普通木材 ×3|home_wood ×3/);
  assert.match(reward,/炉心赤晶 ×1/);
  assert.match(reward,/辅助瞄准镜 ×1/);
  assert.ok(calls.some(call=>/INSERT INTO player_item_instances/.test(call.sql)),'异械必须生成独立实例');
  assert.ok(calls.some(call=>/INSERT INTO player_opening_keepsakes/.test(call.sql)&&/archived/.test(call.sql)),'普通奖励只保存归档记录');
});

test('云巢伙伴奇遇优先于通用礼包结算，继承的旧奖励类型不能吞掉认主结果',()=>{
  const source=readFileSync('src/game/opening.service.ts','utf8');
  const settlement=source.slice(source.indexOf('const settleArrival='),source.indexOf('export const advanceOpening'));
  assert.ok(settlement.indexOf("row.route_code==='S03'")<settlement.indexOf('if(choice.rewardKind)'));
  assert.doesNotMatch(settlement,/row\.route_code==='I02'/);
});
