import {itemUsePolicy,combatItemEffect} from '../src/game/item-use-policy';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {openingRoutes,openingRouteByCode} from '../src/game/opening-content';
import {lamplightPrivate,lamplightLegacy,lamplightLocal,lamplightJoin,lamplightWorld} from '../src/game/lamplight-content.generated';
import {lamplightNode,nextLamplightState,lamplightPublicText} from '../src/game/lamplight.config';
import {lamplightWork} from '../src/game/lamplight-work';
import {openingHubs} from '../src/game/opening-world.config';
import type {LamplightState} from '../src/game/lamplight.types';
import {chestTables,rollChest,openingThemeChests,openingChestContents,openingChestName} from '../src/game/opening-chest.config';

const lamplightServiceSource=ts.createSourceFile('src/game/lamplight.service.ts',readFileSync('src/game/lamplight.service.ts','utf8'),ts.ScriptTarget.Latest,true);
const lamplightStepModule={exports:{} as any};
const lamplightStepCode=ts.transpileModule(lamplightServiceSource.statements.filter(statement=>ts.isVariableStatement(statement)&&statement.declarationList.declarations.some(declaration=>declaration.name.getText(lamplightServiceSource)==='lamplightInvestigationStep')).map(statement=>statement.getText(lamplightServiceSource)).join('\n'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','module','exports',lamplightStepCode)(()=>({}),lamplightStepModule,lamplightStepModule.exports);
const {lamplightInvestigationStep}=lamplightStepModule.exports;

test('七图采用21条V4及53分支，旧21条内容仍能按版本读取',()=>{
 const routes=openingRoutes.filter(r=>r.version===4);assert.equal(routes.length,21);assert.equal(routes.flatMap(r=>r.choices).length,53);
 for(const route of routes){assert.ok(!route.person||route.person.description);assert.ok(route.lessonText);assert.ok(route.arrival.length);assert.notEqual(openingRouteByCode(route.code,2),route);
   for(const branch of route.choices){assert.ok(branch.rewardKind);assert.ok(!branch.pack);}
 }
 assert.equal(routes.flatMap(r=>r.choices).filter(c=>c.bonusItem).length,3);
 assert.equal(Object.keys(lamplightLegacy).length,21);
});
test('全部路线最终经过对应安全区、联合调查和同一世界终章，无孤立节点或循环',()=>{
 assert.equal(Object.keys(lamplightPrivate).length,42);assert.equal(Object.values(lamplightLocal).flat().length,48);assert.equal(lamplightJoin.length,6);assert.equal(lamplightWorld.length,40);
 for(const route of openingRoutes)for(const branch of route.choices){
   const state:LamplightState={character_id:1,origin_route:route.code,origin_branch:branch.code,story_version:route.version,local_hub:route.destination,phase:'private',node_index:0,revision:0,flags_json:{},version:1};
   const visited=new Set<string>();
   while(state.phase!=='completed'){
    const node=lamplightNode(state);assert.ok(node,route.code);assert.ok(!visited.has(node.code));visited.add(node.code);
    for(const text of [node.intro,...node.findings,node.conclusion]){const publicText=lamplightPublicText(text,state);assert.ok(publicText.length>4,`${node.code}: ${text}`);assert.doesNotMatch(publicText,/奖励 P|story_version|初行 [ABC]|来时选择 [ABC]|WM\d\d/);}
    const work=lamplightWork(node);assert.ok(work.test[work.answer]);assert.ok(work.units>0);assert.ok(node.choices.every(Boolean));
    Object.assign(state,nextLamplightState(state));assert.ok(visited.size<60);
   }
   assert.equal(visited.size,57);assert.ok(visited.has('JN-6'));assert.ok(visited.has('WM08-5'));assert.ok(openingHubs[state.local_hub]);
 }
});
test('后六章符合现有30级成长上限；不修改原进化数值',()=>{
 assert.ok(lamplightWorld.every(n=>n.minLevel<=30&&n.endLevel<=30));
 assert.equal(lamplightWorld.filter(n=>n.gate==='boss').map(n=>n.code).join(),'WM08-2');
 assert.equal(lamplightWorld.reduce((sum,n)=>sum+n.copper,0),50000);
 assert.match(readFileSync('src/game/evolution.service.ts','utf8'),/clamp\(Number\(profile.unlocked_level\), 20, 30\)/);
});
test('神秘箱独立开奖：20%史诗与80%稀有池，支持100箱，无永久凭证混入',()=>{
 for(const [code] of openingThemeChests){const table=chestTables[code];assert.ok(Math.abs(table.groups[0].entries.reduce((n,e)=>n+e.weight,0)-100)<1e-9);
   assert.notEqual(openingChestName(code),'黄金宝箱');assert.match(openingChestContents(code),/80%/);
   assert.equal(itemUsePolicy({id:1,code,item_type:'consumable',effect_json:{chestTableCode:code}}).command,`/宝箱内容 ${code}`);
   assert.equal(rollChest(table,100,()=>0).filter(r=>r.code==='dawn_sword').length,100);
   assert.equal(rollChest(table,100,()=>.999999).length,100);
   assert.ok(table.groups[0].entries.every(e=>e.rewards.every(r=>r.equipment&&/^(?:dawn_|opening_rare_)/.test(r.code))));
 }
});
test('本人回忆不会同时混入敌对和救援、A/B/C经历',()=>{
 const a=lamplightPublicText(lamplightPrivate.M02[0].findings[0],{origin_route:'M02',origin_branch:'A'});
 assert.match(a,/拒婚见证/);assert.doesNotMatch(a,/伪装撤离|破损礼箱/);
 const b=lamplightPublicText(lamplightPrivate.F02[0].intro,{origin_route:'F02',origin_branch:'B'});
 assert.doesNotMatch(b,/语气冷淡|出手线|救援线/);
});

test('十一条重写路线的当前与兼容后续均不再出现被否决剧情',()=>{
 const titles:Record<string,string[]>={
  R01:['回流上的剪口','两种笔迹','灯回到河上'],R02:['羽毛下的急件','伪印从哪来','让信飞完'],R03:['错声后的车辙','细锉借用簿','把路标改回来'],
  S03:['风羽不归巢','烟草货单','给云巢留风'],D03:['军令少一行','绊索朝向城外','撤离旗再亮'],H01:['第四条矿规','配重离了轨','吊篮再升起'],
  H03:['第四块石片','车轮压住的字','旧路再开吗'],I02:['空白认主纸','工具箱等谁','它自己选择'],I03:['西矿道来信','没有地址的人','警讯先抵达'],
  W03:['缺失的第四灯','黑水的来处','只开一夜的门'],A03:['裂隙里的低语','环纹指向昨夜','坑边采集架']
 };
 const rejected=/不开船的摆渡人|宝箱旅馆|明日退学通知|海盗的鱼汤|谎言蘑菇汤|昨日缆车|山神收路费|机偶的生日|长大的披风|国王的浴缸|工匠的空坟|八婶|匣伯|露涅|泊叔|伊蕾|梅铎|卢安|阿绒|芦荻/;
 for(const [route,expected] of Object.entries(titles)){
  assert.deepEqual(lamplightPrivate[route].map(node=>node.title),expected,route);
  assert.doesNotMatch(JSON.stringify(lamplightPrivate[route]),rejected,route);
  if(lamplightLegacy[route]){
   assert.deepEqual(lamplightLegacy[route].map(node=>node.title),expected,`${route} 兼容进度`);
   assert.doesNotMatch(JSON.stringify(lamplightLegacy[route]),rejected,`${route} 兼容进度`);
  }
 }
});

test('十一条重写路线的后续主线各段均能独立说明行动、依据与结果',()=>{
 const routes=['R01','R02','R03','S03','D03','H01','H03','I02','I03','W03','A03'];
 for(const route of routes)for(const node of lamplightPrivate[route]){
  const segments=[node.intro,...node.findings,node.conclusion];
  for(const text of segments)assert.ok([...text.trim()].length>=50,`${node.code} 存在不足50字的剧情段`);
  assert.equal(node.findings.length,2,`${node.code} 应包含现场发展与明确结果`);
  assert.ok(node.choices.length>=2,`${node.code} 应保留玩家可选的处理方向`);
 }
});

test('灯火玩家可见文案不保留泛称玩家、接收端值守或未消解的路线代号',()=>{
 const arcs=[...Object.entries(lamplightPrivate),...Object.entries(lamplightLegacy)];
 for(const [route,nodes] of arcs){
  const branches=(openingRouteByCode(route)?.choices.map(choice=>choice.code)??['A']);
  for(const branch of branches)for(const node of nodes)for(const text of [node.intro,...node.findings,node.conclusion]){
   const displayed=lamplightPublicText(text,{origin_route:route,origin_branch:branch});
   assert.doesNotMatch(displayed,/玩家|接收端的值守|WM\d{2}|JN-?\d/);
  }
 }
 for(const node of [...Object.values(lamplightLocal).flat(),...lamplightJoin,...lamplightWorld])for(const text of [node.intro,...node.findings,node.conclusion]){
  const displayed=lamplightPublicText(text,{origin_route:'LEGACY',origin_branch:'A'});
  assert.doesNotMatch(displayed,/玩家|接收端的值守|WM\d{2}|JN-?\d/);
 }
});

test('灯火普通节点只显示当前一步，不循环展示已完成的现场与联络动作',()=>{
 assert.deepEqual(lamplightInvestigationStep(0,false),{label:'前往现场',action:'go_scene'});
 assert.deepEqual(lamplightInvestigationStep(0,true),{label:'调查现场',action:'scene'});
 assert.deepEqual(lamplightInvestigationStep(1,false),{label:'前往联络处',action:'go_record'});
 assert.deepEqual(lamplightInvestigationStep(1,true),{label:'询问见证人',action:'record'});
 assert.equal(lamplightInvestigationStep(3,false),null);
});

test('黄昏露有实际战外回复入口，PVE与PVP道具判定均拒绝',()=>{
 const effect={openingSafeRecovery:true,healPct:25,restoreMpPct:25};assert.equal(itemUsePolicy({id:1,code:'opening_twilight_dew',item_type:'consumable',effect_json:effect}).kind,'direct');
 assert.equal(combatItemEffect(effect),false);assert.equal(combatItemEffect(effect,true),false);
});
