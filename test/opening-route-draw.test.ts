import test from 'node:test';
import assert from 'node:assert/strict';
import {drawOpeningRoute,openingRouteWeights,type OpeningRouteCandidate} from '../src/game/opening-route-draw';
import {openingSpawnRegions,openingTierWeights} from '../src/game/opening-world.config';
import {chooseOpeningSpawn} from '../src/game/opening-state';

const all:OpeningRouteCandidate[]=Object.entries(openingSpawnRegions).flatMap(([regionCode,c])=>[1,2,3].map(i=>({code:`${c.prefix}0${i}`,regionCode,tier:c.tier})));
const memory=()=>{
  let state={cycle_no:1,used_routes_json:'[]'},writes=0;
  return {get state(){return structuredClone(state);},get writes(){return writes;},
    connection:{execute:async(sql:string,args:any[]=[])=>{
      if(sql.startsWith('SELECT'))return[[structuredClone(state)]];
      if(sql.startsWith('UPDATE')){state={cycle_no:args[0],used_routes_json:args[1]};writes++;}
      return[{affectedRows:1}];
    }}} as any;
};
test('路线权重保留原档位、地图和三条路线的完整概率',()=>{
  for(const pool of [all,all.filter(c=>c.tier!==3)]){
    const weights=openingRouteWeights(pool),tiers=[...new Set(pool.map(c=>c.tier))],total=tiers.reduce((sum,t)=>sum+openingTierWeights[t],0);
    assert.ok(Math.abs(weights.reduce((sum,w)=>sum+w.weight,0)-1)<1e-12);
    for(const tier of tiers){const sum=weights.filter(w=>pool.find(c=>c.code===w.value)!.tier===tier).reduce((sum,w)=>sum+w.weight,0);assert.ok(Math.abs(sum-openingTierWeights[tier]/total)<1e-12);}
  }
  assert.ok(Math.abs(openingRouteWeights(all).find(c=>c.value==='A01')!.weight-1/120)<1e-12);
});
test('普通41路线一轮不重样，抽尽才换轮，女神连续命中不消耗轮次',async()=>{
  const db=memory(),results=[];
  // .99 不命中女神；每次从剩余加权池取尾部。
  for(let i=0;i<41;i++)results.push(await drawOpeningRoute(db.connection,all,()=>.99));
  assert.equal(new Set(results).size,41);assert.ok(!results.includes('A01'));assert.equal(db.state.cycle_no,1);
  const before=db.state;
  for(let i=0;i<3;i++)assert.equal(await drawOpeningRoute(db.connection,all,()=>0),'A01');
  assert.deepEqual(db.state,before);assert.equal(db.writes,41);
  await drawOpeningRoute(db.connection,all,()=>.99);assert.equal(db.state.cycle_no,2);assert.equal(JSON.parse(db.state.used_routes_json).length,1);
});
test('女神概率不随普通剩余池变化；新地图加入和关闭不清空已抽记录',async()=>{
  const db=memory(),pool=all.filter(c=>c.regionCode==='fallenstar_swamp');
  assert.equal(await drawOpeningRoute(db.connection,pool,()=>.34),'A02');
  assert.equal(await drawOpeningRoute(db.connection,pool,()=>.34),'A03');
  // 只剩下一轮重置时也仍为1/3，.34不命中女神。
  assert.equal(await drawOpeningRoute(db.connection,pool,()=>.34),'A02');
  const extended=all.filter(c=>['fallenstar_swamp','dark_forest'].includes(c.regionCode));
  const code=await drawOpeningRoute(db.connection,extended,()=>.5);assert.notEqual(code,'A02');assert.equal(db.state.cycle_no,2);
  const withoutGoddess=extended.filter(c=>c.regionCode!=='fallenstar_swamp');
  const next=await drawOpeningRoute(db.connection,withoutGoddess,()=>0);assert.ok(next.startsWith('F'));assert.notEqual(next,code);assert.equal(db.state.cycle_no,2);
});

test('完整降临流程使用不放回路线对应的地图，并保留合法坐标和安全终点',async()=>{
  const db=memory();
  const regions=[{id:1,code:'dark_forest',min_x:0,min_y:0,min_z:0},{id:2,code:'fallenstar_swamp',min_x:20,min_y:0,min_z:0}];
  const areas=[...regions,{id:3,min_x:40,min_y:0,min_z:0}].map(r=>({region_id:r.id,min_x:r.min_x,max_x:r.min_x+9,min_y:0,max_y:9,min_z:0,max_z:0,danger_level:1}));
  const connection={execute:async(sql:string,args?:any[])=>{
    if(sql.includes('FROM map_region_areas'))return[areas];
    if(sql.includes('WHERE newbie_spawn_enabled=1'))return[regions];
    if(sql.includes('JOIN map_npcs'))return[[{id:3,code:'world_tree',guild_code:'world_tree_adventurer_guild',pos_x:40,pos_y:0,pos_z:0}]];
    return db.connection.execute(sql,args);
  }} as any;
  const drawn=[];
  for(let i=0;i<5;i++){
    const spawn=await chooseOpeningSpawn(connection,()=>.99);drawn.push(spawn.route.code);
    assert.equal(spawn.region.code,spawn.route.region);assert.equal(spawn.route.destination,'world_tree');
    assert.ok(spawn.x>=spawn.region.min_x&&spawn.x<=spawn.region.min_x+9);assert.ok(spawn.y>=0&&spawn.y<=9);assert.equal(spawn.z,0);
  }
  assert.equal(new Set(drawn).size,5);assert.ok(!drawn.includes('A01'));
});
