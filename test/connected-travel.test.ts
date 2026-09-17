import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { parseTravelPlan, travelPlanSignature, saveTravelConfirmation, type TravelPlan } from '../src/game/connected-travel.service';
import { Format } from '../node_modules/alemonjs/lib/application/format/message-format.js';

const load=(path:string,name:string,deps:Record<string,unknown>)=>{
  const file=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
  const statement=file.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(file)===name));assert.ok(statement);
  const code=ts.transpileModule(statement.getText(file).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  return new Function(...Object.keys(deps),`${code};return ${name};`)(...Object.values(deps));
};
const originalPlan=():TravelPlan=>({leaderId:1,start:{regionId:1,x:0,y:0,z:0},target:{regionId:2,x:24,y:4,z:0},members:[{id:1,user:'u'}],seconds:0,destinationKind:'normal',legs:[
  {kind:'walk',from:{regionId:1,x:0,y:0,z:0},to:{regionId:1,x:2,y:2,z:0},distance:4},
  {kind:'portal',from:{regionId:1,x:2,y:2,z:0},to:{regionId:2,x:20,y:0,z:0},distance:1,fromCode:'world_tree_gate',toCode:'world_gate'},
  {kind:'walk',from:{regionId:2,x:20,y:0,z:0},to:{regionId:2,x:24,y:4,z:0},distance:8}
]});
const setup=()=>{
  const state={character:{id:1,current_region_id:1,pos_x:0,pos_y:0,pos_z:0,region_name:'世界树'},saved:null as any,travel:null as any,plan:originalPlan(),blocked:false,arrived:false,transfers:0,moves:0,failTransfer:false,dbFailure:false};
  const connection={execute:async(sql:string,args:any[]=[])=>{
    if(sql.startsWith('SELECT r.id'))return [[{id:2,code:'baina_town',name:'百纳镇',is_enabled:1}]];
    if(sql.startsWith('SELECT plan_json'))return [state.saved&&(!sql.includes("state='pending'")||state.saved.state==='pending'&&state.saved.token===args[1]&&!state.saved.expired)?[{plan_json:state.saved.plan}]:[]];
    if(sql.startsWith('SELECT region_id,target_x'))return [state.travel?[{...state.travel,arrived:state.arrived?1:0}]:[]];
    if(sql.startsWith('SELECT activity_type'))return [state.travel?[state.travel]:[]];
    if(sql.startsWith('SELECT'))return [[]];
    if(sql.startsWith('INSERT INTO player_travel_routes')){state.saved={token:args[1],state:sql.includes("'pending'")?'pending':'active',plan:args[2],expired:false};return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO player_travels')){assert.equal(state.travel,null);state.travel={region_id:args[1],target_x:args[2],target_y:args[3],target_z:args[4],activity_type:'move',destination_kind:args[5],seconds:args[6]};return [{affectedRows:1}];}
    if(sql.startsWith('DELETE FROM player_travels')){state.travel=null;return [{affectedRows:1}];}
    if(sql.startsWith('DELETE FROM player_travel_routes')){state.saved=null;return [{affectedRows:1}];}
    if(sql.startsWith('DELETE FROM encounter_escape_tokens'))return [{affectedRows:1}];
    throw Error(sql);
  }};
  const deps={withTransaction:async(fn:any)=>{const copy=structuredClone(state);try{return await fn(connection);}catch(e){Object.assign(state,copy);throw e;}},characterFor:async()=>({...state.character}),inventory:async()=>({movementSpeed:2}),repairInvalidCombatFor:async()=>{},isInHome:async()=>false,assertNoNegotiation:async()=>{},assertOwnerOnlyRegionAccess:async()=>{},ensureActionAvailable:()=>{},visiblePursuitCondition:()=> '1=1',talentMovementFactor:async()=>1,randomUUID:()=> 'active',recordCharacterOperation:async()=>{},parseTravelPlan,travelPlanSignature,saveTravelConfirmation,
    planConnectedTravel:async(_c:any,_id:number,start:any)=>{if(state.dbFailure)throw Object.assign(Error('连接中断'),{code:'ECONNRESET'});if(state.blocked)throw Error('区域已关闭');return {...structuredClone(state.plan),start};},
    moveToPosition:async(_c:any,_u:string,x:number,y:number)=>{state.moves++;state.character.pos_x=x;state.character.pos_y=y;state.character.current_region_id=2;return {kind:'event',character:state.character};},
    executeTravelTransfers:async()=>{state.transfers++;if(state.failTransfer)throw Error('接驳执行失败');}
  };
  const move=load('src/game/adventure.service.ts','moveTo',deps),complete=load('src/game/adventure.service.ts','completeTravel',deps),cancel=load('src/game/adventure.service.ts','cancelTravel',deps);
  return {state,move,complete,cancel};
};

test('换乘先确认，分段计时，倒计时未到不移动；到达只执行一次',async()=>{
  const s=setup();const result=await s.move('u',24,4,0);
  assert.equal(result.kind,'travel_confirmation');assert.equal(result.plan.seconds,7);assert.equal(s.state.travel,null);assert.equal(s.state.character.pos_x,0);
  const travel=await s.move('u',24,4,0,{confirmationToken:result.token});assert.equal(travel.kind,'travel');assert.equal(travel.seconds,7);
  assert.equal(await s.complete('u'),null);assert.equal(s.state.transfers,0);
  await assert.rejects(s.move('u',24,4,0,{confirmationToken:result.token}),/正在前往/);
  s.state.arrived=true;await s.complete('u');assert.equal(s.state.moves,1);assert.equal(s.state.transfers,1);assert.equal(s.state.character.pos_x,24);
  assert.equal(await s.complete('u'),null);assert.equal(s.state.transfers,1);
});
test('伪造、失效确认被拒绝；起点改变后重新确认，不静默套用旧路线',async()=>{
  const s=setup();const result=await s.move('u',24,4,0);
  await assert.rejects(s.move('u',24,4,0,{confirmationToken:'forged'}),/确认已失效/);
  s.state.saved.expired=true;await assert.rejects(s.move('u',24,4,0,{confirmationToken:result.token}),/确认已失效/);s.state.saved.expired=false;
  s.state.character.pos_x=1;const again=await s.move('u',24,4,0,{confirmationToken:result.token});assert.equal(again.kind,'travel_confirmation');assert.notEqual(again.token,result.token);assert.equal(s.state.travel,null);
});
test('取消移动清理路线，不执行传送；到达前关闭路线则停止并保留起点',async()=>{
  for(const blocked of [false,true]){
    const s=setup();const prompt=await s.move('u',24,4,0);await s.move('u',24,4,0,{confirmationToken:prompt.token});
    if(blocked){s.state.arrived=true;s.state.blocked=true;assert.equal((await s.complete('u')).kind,'route_cancelled');}else await s.cancel('u');
    assert.equal(s.state.travel,null);assert.equal(s.state.saved,null);assert.equal(s.state.transfers,0);assert.equal(s.state.character.pos_x,0);
  }
  const changed=setup();const prompt=await changed.move('u',24,4,0);await changed.move('u',24,4,0,{confirmationToken:prompt.token});changed.state.arrived=true;changed.state.travel.target_z=30;
  assert.equal((await changed.complete('u')).kind,'route_cancelled');assert.equal(changed.state.transfers,0);assert.equal(changed.state.character.pos_x,0);
});
test('直达路线只计步行时间，不显示确认，旧换乘按钮不可套用',async()=>{
  const s=setup();s.state.plan.legs=[{kind:'walk',from:s.state.plan.start,to:s.state.plan.target,distance:12}];
  assert.equal((await s.move('u',24,4,0)).seconds,6);
  await s.cancel('u');await assert.rejects(s.move('u',24,4,0,{confirmationToken:'old'}),/路线已变化/);
});
test('传送执行失败或数据库临时错误保留计时与路线，重试不重复结算',async()=>{
  for(const failure of ['failTransfer','dbFailure'] as const){
    const s=setup();const prompt=await s.move('u',24,4,0);await s.move('u',24,4,0,{confirmationToken:prompt.token});s.state.arrived=true;s.state[failure]=true;
    await assert.rejects(s.complete('u'));
    assert.ok(s.state.travel);assert.equal(s.state.saved.state,'active');assert.equal(s.state.transfers,0);assert.equal(s.state.character.pos_x,0);
    s.state[failure]=false;await s.complete('u');assert.equal(s.state.transfers,1);assert.equal(s.state.character.pos_x,24);
  }
});
test('确认页使用指定文案与不直接发送的按钮，并显示坐标耗时',()=>{
  const format=load('src/response/travel-confirmation.ts','travelConfirmationFormat',{Format,durationText:(s:number)=>`${s}秒`});
  const plan=originalPlan();plan.seconds=7;
  let json=JSON.stringify(format({token:'test',plan}).value);
  assert.match(json,/行动确认/);assert.match(json,/当前路径地图缺失，可通过界门前往目的地/);assert.match(json,/确认前往 test/);assert.match(json,/7秒/);
  plan.legs[1].kind='guild';plan.legs[1].from.z=30;
  json=JSON.stringify(format({token:'test',plan}).value);assert.match(json,/当前需通过公会后勤驳接至地面前往/);
  const source=readFileSync('src/response/travel-confirmation.ts','utf8');assert.match(source,/autoEnter:false/);
});
