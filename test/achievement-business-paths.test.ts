import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {recordAchievement,takeAchievementEvents} from '../src/game/achievement-events';
const extract=(file:string,name:string,bindings:Record<string,unknown>)=>{
 const tree=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 let declaration:ts.VariableStatement|undefined;const visit=(node:ts.Node)=>{if(ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(tree)===name))declaration=node;ts.forEachChild(node,visit);};visit(tree);assert.ok(declaration);
 const code=ts.transpileModule(declaration.getText(tree).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function(...Object.keys(bindings),code+';return '+name)(...Object.values(bindings));
};
test('E22/K19 正式餐厅入口：费用不足和素材不足无事件，效果入库及扣费后才记录',async()=>{
 let copper=20,owned=2;const writes:string[]=[];const c={execute:async(sql:string)=>{if(sql.startsWith('SELECT i.id'))return [[{id:9,name:'餐食',processing_fee:10,ingredients_json:[],buff_json:{attack:1},duration_minutes:30}]];writes.push(sql);return [{affectedRows:1}];}};
 const api=extract('src/game/guild-restaurant.service.ts','enjoyRestaurantMeal',{withTransaction:async(fn:any)=>fn(c),characterFor:async()=>({id:1,copper_coins:copper}),recipeOf:()=>[],inventoryForRecipe:async()=>[{code:'a',name:'a',quantity:2,owned}],activeFoodFor:async()=>null,divineFoodSeconds:async(_:any,_id:number,s:number)=>s,divineFoodValues:async(_:any,_id:number,b:any)=>b,jsonRecord:(v:any)=>v,recalculateCharacterStats:async()=>{},recordAchievement});
 copper=9;await assert.rejects(api('one',9),/铜币不足/);assert.equal(writes.length,0);assert.equal(takeAchievementEvents(c as any).length,0);
 copper=20;owned=1;await assert.rejects(api('one',9),/素材不足/);assert.equal(writes.length,0);
 owned=2;await api('one',9);assert.ok(writes.some(s=>s.includes('INSERT INTO player_food_buffs')));assert.ok(writes.some(s=>s.includes('copper_coins=copper_coins-')));
 assert.deepEqual(takeAchievementEvents(c as any)[0].facts.map(f=>[f.metric,f.distinct]),[['ACH_E22','9'],['ACH_K19','9']]);
});
test('L18/L19 正式NPC切磋：胜利才发奖，已结算与战败不发奖',async()=>{
 for(const result of ['victory','defeat','escaped','timeout'] as const){
 const c={execute:async(sql:string)=>{if(sql.includes('SELECT * FROM player_npc_spar_attempts'))return [[{character_id:1,npc_code:'teacher',id:2,state:'active',profile_json:{name:'导师',band:[1,5]},snapshot_json:{hp:10,mp:5}}]];if(sql.startsWith('SELECT level'))return [[{level:3}]];return [[]];}};
 // 只替换切磋专属查询依赖；执行完整正式结算函数，动态灯火分流通过导入桩截断。
 const file=readFileSync('src/game/npc-sparring.service.ts','utf8');
 const tree=ts.createSourceFile('spar',file,ts.ScriptTarget.Latest,true);const statement=tree.statements.filter(ts.isVariableStatement).find(s=>s.declarationList.declarations.some(d=>d.name.getText(tree)==='finishNpcSparring'))!;
 const source=statement.getText(tree).replace(/^export\s+/,'').replace("await(await import('./lamplight-battle.service')).finishLamplightBattle(connection,sessionId,result)",'null');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const api=new Function('json','carriedSparSkills','recordAchievement',js+';return finishNpcSparring')((v:any)=>v??{},()=>[],recordAchievement);
 await api(c,'session',result);const facts=takeAchievementEvents(c as any).flatMap(e=>e.facts);
 assert.deepEqual(facts.map(f=>f.metric),result==='victory'?['ACH_L18','ACH_L19']:[]);if(result==='victory')assert.equal(facts[1].distinct,'teacher');
 }
});
test('A17 二转正式试炼阶段校验，未完成资格不发奖',async()=>{
 let stage=2;const c={execute:async(sql:string)=>sql.startsWith('SELECT profession_code')?[[{stage}]]:[{affectedRows:1}]};
 const api=extract('src/game/advanced-profession.service.ts','completeAdvancedProfessionTrial',{advancedProfessionByCode:()=>({code:'p',passive:{code:'passive'},mentor:{code:'mentor'}}),resetSkillPointAllocation:async()=>({}),revokeAdvancedProfessionSkills:async()=>{},advancedInheritanceSkillCode:()=>'',activeSkillCodesForAdvancedProfession:()=>[],spiritSummonerActiveSkillCodes:[],recalculateCharacterStats:async()=>{},recordAchievement});
 assert.equal(await api(c,1,'p'),null);assert.equal(takeAchievementEvents(c as any).length,0);stage=3;await api(c,1,'p');assert.deepEqual(takeAchievementEvents(c as any)[0].facts.map(f=>f.metric),['ACH_A17']);
});

test('F20/F21/F22 巡查真实终点交接：未抵达、旧实例、中止和准备步骤不算完成',async()=>{
 for(const kind of ['escort','rescue']){
  const location={regionId:1,x:10,y:10,z:0,name:'终点'};let atDestination=false,available=true;
  const active:any={id:'patrol',node_code:'opening',template_code:'patrol_test',context_json:{patrol:{kind,target:location,origin:location}}};
  const c={execute:async()=>[{affectedRows:1}]} as any;
  const api=extract('src/game/world-dynamics.service.ts','resolveDynamicEncounter',{
    withTransaction:async(fn:any)=>fn(c),playerContext:async()=>({id:1,region_id:1,region_name:'测试'}),activeEncounterFor:async()=>available?active:null,
    definitionForInstance:()=>({nodes:{opening:{choices:[{code:'prepare',nextNode:'handoff'}]},handoff:{choices:[{code:'deliver'},{code:'leave'}]}}}),
    json:(v:any,f:any)=>v??f,patrolObjective:()=>({location}),patrolPositionMatches:()=>atDestination,renderEncounter:()=>({}),writeLedger:async()=>{},grantHiddenReward:async()=>null,recordAchievement,achievementActivity:()=>{}
  });
  await assert.rejects(api('one','prepare','old'),/有效的奇遇实例/);await assert.rejects(api('one','prepare','patrol'),/先抵达/);assert.equal(takeAchievementEvents(c).length,0);
  atDestination=true;await api('one','prepare','patrol');assert.equal(takeAchievementEvents(c).length,0);
  active.node_code='handoff';atDestination=false;await assert.rejects(api('one','deliver','patrol'),/先抵达/);await api('one','leave','patrol');assert.equal(takeAchievementEvents(c).length,0);
  atDestination=true;await api('one','deliver','patrol');assert.deepEqual(takeAchievementEvents(c)[0].facts.map(f=>f.metric),['ACH_F20',kind==='escort'?'ACH_F21':'ACH_F22']);
  available=false;await assert.rejects(api('one','deliver','patrol'),/没有可选择/);assert.equal(takeAchievementEvents(c).length,0);
 }
});


test('E12 战利品必须先创建真实实例再观察；零数量和零铜币不算取得',async()=>{
 let item:any={id:9,code:'epic',item_type:'equipment',name:'史诗'},created=false,observed=0;const reward={drops:[] as any[]};
 const c={execute:async(sql:string)=>{if(sql.startsWith('SELECT id,code'))return [[item]];if(sql.startsWith('INSERT INTO player_item_instances'))created=true;return [{insertId:99}];}};
 const api=extract('src/game/adventure.service.ts','grantDrop',{connection:c,rewardByMemberId:new Map([[1,reward]]),globalCopper:0,grantInventory:async()=>{},achievementItem:async()=>{assert.equal(created,true);observed++;}});
 await api({id:1},'epic',0);assert.equal(observed,0);await api({id:1},'epic',1);assert.equal(observed,1);assert.equal(reward.drops[0].instanceId,99);
 created=false;item={...item,code:'copper_coin',item_type:'currency'};await api({id:1},'copper_coin',1);assert.equal(observed,1);
});

test('采集彩蛋按资源出生地区计数，未完成、错资源及重复领取不记录',async()=>{
 let remaining=false,claimed=false;const regions:number[]=[];const c={execute:async(sql:string)=>sql.startsWith('SELECT m.resource_id')?[[{resource_id:7,item_id:8,resource_region_id:3,code:'iron_ore',name:'铁矿',item_category:'锻材',finishes_at:new Date(Date.now()+(remaining?60000:-60000))}]]:[{affectedRows:claimed?0:1}]};
 const api=extract('src/game/adventure.service.ts','mineResource',{withTransaction:async(fn:any)=>fn(c),characterFor:async()=>({id:1,current_region_id:99}),isInHome:async()=>false,ensureForestGuideFreeAction:async()=>{},ensureActionAvailable:()=>{},resourceKindByCode:()=> '矿脉',resourceYield:async()=>1,talentGatherReward:async()=>1,advanceEvolutionObservationMining:async()=>{},achievementGatherSurprises:async(_:any,_id:number,_spawn:number,_item:number,region:number)=>{regions.push(region);},recordAchievement,achievementItem:async()=>{},achievementActivity:()=>{}});
 remaining=true;await api('one',7);assert.equal(regions.length,0);remaining=false;await assert.rejects(api('one',9),/另一处资源/);claimed=true;await assert.rejects(api('one',7),/已经被开采/);assert.equal(regions.length,0);
 claimed=false;await api('one',7);assert.deepEqual(regions,[3]);const facts=takeAchievementEvents(c as any).flatMap(e=>e.facts);assert.ok(facts.some(f=>f.metric==='ACH_END05'&&f.distinct==='7'));assert.ok(facts.some(f=>f.metric==='ACH_H06'&&f.distinct==='3'));
});
