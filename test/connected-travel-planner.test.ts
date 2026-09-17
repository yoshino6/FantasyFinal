import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {connectedTravelPath,samePoint} from '../src/game/travel-path';
import {openingHubs} from '../src/game/opening-world.config';

const setup=()=>{
  const state={leader:1,open:true,permits:new Set([1,2]),maps:new Set([1,2,3]),members:[1,2].map(id=>({id,user:`u${id}`,region_id:1,pos_x:0,pos_y:0,pos_z:0,activity_status:'active',current_hp:10})),idle:[] as number[],forest:[] as number[],failTransfer:false};
  const stations=[{code:'world_tree_gate',name:'树门',region_id:1,region_code:'world_tree',pos_x:5,pos_y:0,pos_z:0},{code:'world_gate',name:'镇门',region_id:2,region_code:'baina_town',pos_x:20,pos_y:0,pos_z:0},
    {code:openingHubs.world_tree.guild,name:'根冠分会',region_id:1,region_code:'world_tree',pos_x:-5,pos_y:-3,pos_z:0},{code:openingHubs.floating_leaf_town.guild,name:'风枝会馆',region_id:3,region_code:'floating_leaf_town',pos_x:12,pos_y:0,pos_z:30}];
  const areas=[{region_id:1,min_x:-10,max_x:9,min_y:-10,max_y:9,min_z:0,max_z:0},{region_id:2,min_x:20,max_x:29,min_y:-10,max_y:9,min_z:0,max_z:0},{region_id:3,min_x:9,max_x:15,min_y:-3,max_y:3,min_z:30,max_z:30}].map(a=>({...a,is_enabled:1,is_owner_only:0,danger_level:1}));
  const c={execute:async(sql:string,args:any[])=>{
    if(sql.startsWith('SELECT c.id,p.qq_user_id')){assert.equal(args[0],'party-uuid');return [state.members];}
    if(sql.startsWith('SELECT leader_character_id'))return [[{leader_character_id:state.leader}]];
    if(sql.includes('FROM player_inventory'))return [state.members.flatMap(m=>[...state.maps].map(region_id=>({character_id:m.id,region_id})))];
    if(sql.includes('FROM player_leaf_route_progress'))return [[]];
    if(sql.includes('FROM map_region_areas'))return [areas];
    if(sql.includes('FROM map_npcs'))return [stations];
    if(sql.includes('FROM opening_world'))return [[{leaf_route_open:state.open?1:0}]];
    throw Error(sql);
  }};
  const file=ts.createSourceFile('planner.ts',readFileSync('src/game/connected-travel.service.ts','utf8'),ts.ScriptTarget.Latest,true);
  const declarations=file.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>['point','planConnectedTravel'].includes(d.name.getText(file))));
  const code=ts.transpileModule(declarations.map(s=>s.getText(file).replace(/^export\s+/, '')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const deps={connectedTravelPath,samePoint,openingHubs,hasLeafPermit:async(_c:any,id:number)=>state.permits.has(id),assertLeafDestination:async(_c:any,_id:number,target:number)=>{if(target===3&&!state.members.every(m=>state.permits.has(m.id)))throw Error('个人浮叶航路许可缺失');},assertLamplightIdle:async(_c:any,id:number)=>state.idle.push(id),assertFloatingTourFreeAction:async()=>{},assertWorldtreeTourFreeAction:async()=>{},require:()=>({ensureForestGuideFreeAction:async(_c:any,id:number)=>state.forest.push(id)})};
  const planner=new Function(...Object.keys(deps),`${code};return planConnectedTravel;`)(...Object.values(deps));
  return {state,run:(regionId:number,x:number,y:number,z:number)=>planner(c,1,{regionId:1,x:0,y:0,z:0},{regionId,x,y,z},'party-uuid')};
};
test('数据库线路规划保留 UUID 队伍编号并检查全员状态，界门两端各有步行段',async()=>{
  const s=setup();const plan=await s.run(2,24,4,0);
  assert.deepEqual(plan.legs.map((l:any)=>l.kind),['walk','portal','walk']);
  assert.deepEqual(s.state.idle,[1,2]);assert.deepEqual(s.state.forest,[1,2]);
  s.state.leader=2;await assert.rejects(s.run(2,24,4,0),/仅队长/);
});
test('浮叶上行同时要求公共航路和每名队员许可；不生成虚假可确认线路',async()=>{
  const s=setup();assert.ok((await s.run(3,15,0,30)).legs.some((l:any)=>l.kind==='guild'));
  s.state.open=false;await assert.rejects(s.run(3,15,0,30),/没有可用/);
  s.state.open=true;s.state.permits.delete(2);await assert.rejects(s.run(3,15,0,30),/个人浮叶航路许可/);
});
test('队员离开出发点或未持有目标地图时拒绝换乘',async()=>{
  const s=setup();s.state.members[1].pos_x=1;await assert.rejects(s.run(2,24,4,0),/同一坐标/);
  s.state.members[1].pos_x=0;s.state.maps.delete(2);await assert.rejects(s.run(2,24,4,0),/尚未持有目标/);
});

test('换乘执行使用事务内的原传送入口，并保留最终步行供落点事件结算',async()=>{
  const file=ts.createSourceFile('planner.ts',readFileSync('src/game/connected-travel.service.ts','utf8'),ts.ScriptTarget.Latest,true);
  const declaration=file.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(file)==='executeTravelTransfers'))!;
  const code=ts.transpileModule(declaration.getText(file).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const operations:any[]=[],cardMovements:any[]=[];
  const c={execute:async(sql:string,args:unknown[])=>{operations.push({sql,args});return [{affectedRows:1}];}};
  const recordCardMovement=async(connection:any,id:number,location:any,options:any)=>{assert.equal(connection,c);cardMovements.push({id,location,options});};
  const transfer=async(connection:any,user:string,destination?:string)=>{assert.equal(connection,c);operations.push({user,destination});};
  const execute=new Function('openingHubs','recordCardMovement','require',`${code};return executeTravelTransfers;`)(openingHubs,recordCardMovement,(name:string)=>name==='./girl-gratitude.service'?{teleportToWorldTreeIn:transfer,returnToBainaTownIn:transfer}:{openingTransportIn:transfer});
  const a={regionId:1,x:0,y:0,z:30},b={regionId:1,x:12,y:0,z:30},d={regionId:2,x:-5,y:-3,z:0},e={regionId:2,x:0,y:0,z:0};
  await execute(c,{members:[{id:1,user:'a'},{id:2,user:'b'}],legs:[{kind:'walk',from:a,to:b},{kind:'guild',from:b,to:d,fromCode:openingHubs.floating_leaf_town.guild,toCode:openingHubs.world_tree.guild},{kind:'walk',from:d,to:e}]});
  assert.deepEqual(operations.filter(o=>o.user),[{user:'a',destination:'world_tree'},{user:'b',destination:'world_tree'}]);
  assert.equal(operations.filter(o=>o.sql?.startsWith('UPDATE characters')).length,1);
  assert.deepEqual(operations[0].args,[1,12,0,30,1,2]);
  assert.deepEqual(cardMovements,[
    {id:1,location:{regionId:2,z:0},options:{teleport:true}},
    {id:2,location:{regionId:2,z:0},options:{teleport:true}}
  ]);
});
