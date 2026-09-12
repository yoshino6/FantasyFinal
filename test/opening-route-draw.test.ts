import test from 'node:test';
import assert from 'node:assert/strict';
import {drawOpeningRoute,openingGoddessChance,openingRouteWeights,type OpeningRouteCandidate} from '../src/game/opening-route-draw';
import {openingSpawnRegions,openingStartRouteCodes,openingTierWeights} from '../src/game/opening-world.config';
import {chooseOpeningSpawn} from '../src/game/opening-state';
import {openingRoutes} from '../src/game/opening-content';

const all:OpeningRouteCandidate[]=openingRoutes.filter(route=>openingStartRouteCodes.has(route.code)).map(route=>({code:route.code,regionCode:route.region,tier:openingSpawnRegions[route.region as keyof typeof openingSpawnRegions].tier}));
const legacy=[...all,{code:'A01',regionCode:'fallenstar_swamp',tier:3}];
const memory=()=>{
  let state={cycle_no:1,used_routes_json:'[]'},writes=0;
  return {get state(){return structuredClone(state);},get writes(){return writes;},
    connection:{execute:async(sql:string,args:any[]=[])=>{
      if(sql.startsWith('SELECT'))return[[structuredClone(state)]];
      if(sql.startsWith('UPDATE')){state={cycle_no:args[0],used_routes_json:args[1]};writes++;}
      return[{affectedRows:1}];
    }}} as any;
};
test('四条开放路线按地图均分与图内均分，旧女神概率逻辑仍可用于旧档',()=>{
  for(const pool of [all,all.filter(c=>c.regionCode!=='worldtree_meadow'),legacy]){
    const weights=openingRouteWeights(pool),tiers=[...new Set(pool.map(c=>c.tier))],total=tiers.reduce((sum,t)=>sum+openingTierWeights[t],0);
    assert.ok(Math.abs(weights.reduce((sum,w)=>sum+w.weight,0)-1)<1e-12);
    for(const tier of tiers){const sum=weights.filter(w=>pool.find(c=>c.code===w.value)!.tier===tier).reduce((sum,w)=>sum+w.weight,0);assert.ok(Math.abs(sum-openingTierWeights[tier]/total)<1e-12);}
  }
  assert.equal(openingGoddessChance,1/120);
});
test('四条开放路线一轮不重样，抽尽才换轮',async()=>{
  const db=memory(),results=[];
  for(let i=0;i<4;i++)results.push(await drawOpeningRoute(db.connection,all,()=>.99));
  assert.deepEqual(new Set(results),new Set(['F01','F02','F03','M01']));assert.equal(db.state.cycle_no,1);
  await drawOpeningRoute(db.connection,all,()=>.99);assert.equal(db.state.cycle_no,2);assert.equal(JSON.parse(db.state.used_routes_json).length,1);
});
test('旧女神概率不随普通剩余池变化；候选池变化不清空已抽记录',async()=>{
  const db=memory();
  const first=await drawOpeningRoute(db.connection,legacy,()=>.5);assert.notEqual(first,'A01');
  const before=db.state;
  assert.equal(await drawOpeningRoute(db.connection,legacy,()=>0),'A01');assert.deepEqual(db.state,before);
  const next=await drawOpeningRoute(db.connection,all,()=>.5);assert.notEqual(next,first);assert.equal(db.state.cycle_no,1);
});

test('完整降临流程使用不放回路线对应的地图，并保留合法坐标和安全终点',async()=>{
  const db=memory();
  const regions=[{id:1,code:'dark_forest',min_x:0,min_y:0,min_z:0},{id:2,code:'fallenstar_swamp',min_x:20,min_y:0,min_z:0},{id:3,code:'gravelwind_shore',min_x:40,min_y:0,min_z:0},{id:4,code:'worldtree_meadow',min_x:60,min_y:0,min_z:0}];
  const hubs=[{id:5,code:'baina_town',guild_code:'guild_counter',pos_x:80,pos_y:0,pos_z:0},{id:6,code:'world_tree',guild_code:'world_tree_adventurer_guild',pos_x:100,pos_y:0,pos_z:0},{id:7,code:'floating_leaf_town',guild_code:'windbranch_guild',pos_x:120,pos_y:0,pos_z:0}];
  const areas=[...regions,...hubs.map(h=>({id:h.id,min_x:h.pos_x,min_y:h.pos_y,min_z:h.pos_z}))].map(r=>({region_id:r.id,min_x:r.min_x,max_x:r.min_x+9,min_y:r.min_y,max_y:r.min_y+9,min_z:r.min_z,max_z:r.min_z,danger_level:1}));
  const connection={execute:async(sql:string,args?:any[])=>{
    if(sql.includes('FROM map_region_areas'))return[areas];
    if(sql.includes('WHERE newbie_spawn_enabled=1'))return[regions];
    if(sql.includes('JOIN map_npcs'))return[hubs];
    return db.connection.execute(sql,args);
  }} as any;
  const drawn=[];
  for(let i=0;i<4;i++){
    const spawn=await chooseOpeningSpawn(connection,()=>.99);drawn.push(spawn.route.code);
    assert.equal(spawn.region.code,spawn.route.region);assert.ok(['floating_leaf_town','baina_town'].includes(spawn.route.destination));
    assert.ok(spawn.x>=spawn.region.min_x&&spawn.x<=spawn.region.min_x+9);assert.ok(spawn.y>=0&&spawn.y<=9);assert.equal(spawn.z,0);
  }
  assert.deepEqual(new Set(drawn),new Set(['F01','F02','F03','M01']));
});
