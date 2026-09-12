import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { talentCode } from '../src/game/talent.config';
import { openingFirstMeetingIntroduction, openingFirstMeetingText, openingLessonText, openingNarrativeText, openingNewcomerText, openingRoutes, openingRouteVersions, openingRouteByCode, talentDefinitions } from '../src/game/opening-content';
import { openingHubs, openingSpawnRegions, openingStartRouteCodes } from '../src/game/opening-world.config';
import { goldenChestTable, rollChest } from '../src/game/opening-chest.config';
import { companionChance } from '../src/game/companion.service';
import { keepsakeDefinitions } from '../src/game/opening-keepsakes.config';
import { forestArrivalGuildScenes, forestArrivalTownScenes } from '../src/game/forest-arrival-content';

test('保留八条剧情供旧存档续读，新玩家只开放四条路线与两张出生地图',()=>{
  assert.deepEqual(openingRoutes.map(route=>route.code).sort(),['A01','C02','F01','F02','F03','M01','M02','S03']);
  assert.equal(openingRouteVersions.length,8);
  assert.deepEqual([...openingStartRouteCodes],['F01','F02','F03','M01']);
  assert.deepEqual(Object.keys(openingSpawnRegions),['dark_forest','worldtree_meadow']);
  assert.equal(openingRoutes.reduce((sum,route)=>sum+route.choices.length,0),20);
  for(const route of openingRoutes){
    if(openingStartRouteCodes.has(route.code))assert.ok(route.region in openingSpawnRegions,route.code);
    assert.ok(route.destination in openingHubs,route.code);
    assert.ok(route.pages.length&&route.arrival.length,route.code);assert.ok(route.choices.length>=2&&route.choices.length<=3,route.code);
    for(const choice of route.choices)assert.ok(choice.pages.length&&choice.quest&&choice.rewardCode,`${route.code}-${choice.code}`);
  }
});
test('被删除路线及两个专用地点不再进入运行时目录',()=>{
  for(const code of ['R01','D03','H01','I02','W03','T03','E01','B01','Y01'])assert.equal(openingRouteByCode(code),undefined,code);
  assert.equal('snowlamp_hollow' in openingHubs,false);assert.equal('sleepwhale_market' in openingHubs,false);
  assert.ok(keepsakeDefinitions.every(item=>openingRoutes.some(route=>route.code===item.branch.slice(0,3))));
});
test('保留逃婚、精灵棺箱、女神返还、霜龙与两条森林故事',()=>{
  for(const [code,pattern] of Object.entries({M01:/棺箱|菲萝缇/,M02:/逃婚|艾蕾诺/,A01:/阿库娅|厄里斯/,C02:/霜龙|龙蛋/,F02:/瑟芙菈|魔界邀请函/,F03:/莱昂|伊芙|希娅/}))assert.match(JSON.stringify(openingRouteByCode(code)),pattern,code);
  assert.equal(talentDefinitions.length,100);assert.equal(talentDefinitions.filter(s=>s.code.startsWith('divine_')).length,0);assert.ok(talentDefinitions.every(s=>s.code===talentCode(s.number)));
});
test('黄金兔救助明确使用三类初始补给并由梨子喵带出森林',()=>{
  const route=openingRouteByCode('F01')!,aid=route.choices.find(choice=>choice.code==='A')!;
  assert.equal(route.entryMergedIntoFirstPage,true,'黄金兔触发引子应合并进正式场景，不能额外占一页');
  assert.match(JSON.stringify([route.pages,aid.pages,aid.arrival]),/三只面包.*三瓶矿泉水.*三份草药/);
  assert.match(JSON.stringify([aid.pages,aid.arrival]),/梨子.*百纳镇.*公会/);
  assert.equal(aid.rewardName,'黄金兔');
});
test('云巢路线写明被当作食物、猎魔人救援、破壳认亲与双结局',()=>{
  const route=openingRouteByCode('S03')!;
  assert.equal(route.title,'云巢雏鸟');assert.equal(route.choices.length,2);
  assert.match(JSON.stringify(route.pages),/储备粮.*烬川.*裂.*认成娘/);
  assert.match(JSON.stringify(route.choices[0]),/随从名册|跟随/);
  assert.equal(route.choices[1].rewardCopper,2000);assert.match(route.choices[1].label,/2000铜币/);
});

test('当前开放的四条初行路线每页正文都保留自然段分隔',()=>{
  const active = new Set(['F01','F02','F03','M01']);
  for (const route of openingRoutes.filter(item => active.has(item.code))) {
    const pages = [
      ...route.pages,
      ...route.choices.flatMap(choice => choice.pages),
      ...route.choices.flatMap(choice => choice.arrival ?? []),
      ...route.arrival
    ];
    assert.ok(pages.length > 0, route.code);
    for (const page of pages) {
      assert.match(page.text, /\r?\n\s*\r?\n/, `${route.code}·${page.title} 应分成至少两段`);
    }
  }
  const coffin = openingRouteByCode('M01')!;
  const coffinText = JSON.stringify([coffin.pages, ...coffin.choices.map(choice => [choice.pages, choice.arrival])]);
  assert.doesNotMatch(coffinText, /死亡证明|预约复苏|待复苏长老|死亡登记|长老遗物/);
  assert.match(coffinText, /地面巡游|长老回程|接回古木长老/);
});
test('三人冒险团沿用旧相遇并在真实史莱姆战斗胜利后回城',()=>{
  const route=openingRouteByCode('F03')!;
  const narrative=JSON.stringify([route.moveEntry,route.huntEntry,route.pages,route.choices,route.arrival]);
  assert.equal(route.title,'火星、盾牌与白绷带');assert.equal(route.pages.length,3);assert.equal(route.pages[0].title,'火星、盾牌与白绷带');assert.equal(route.entryMergedIntoFirstPage,true);
  assert.match(narrative,/兵刃碰撞.*莱昂.*伊芙.*希娅.*森林史莱姆/);
  assert.equal(Object.keys(forestArrivalTownScenes).length,6);
  assert.equal(Object.keys(forestArrivalGuildScenes).length,3);
  assert.match(JSON.stringify([forestArrivalTownScenes,forestArrivalGuildScenes]),/史莱姆.*梨子喵.*转生者.*铁匠铺.*阿克谢尔·梨子.*卖水和面包.*冒险者公会/);
  assert.equal(openingFirstMeetingText(route,route.pages[0].text,0),route.pages[0].text,'不能在三人正式自我介绍前自动拼接姓名');
  const openingSource=readFileSync('src/game/opening.service.ts','utf8'),adventureSource=readFileSync('src/game/adventure.service.ts','utf8');
  assert.match(openingSource,/forestBattlePending/);assert.match(openingSource,/completeOpeningForestBattleStart/);
  assert.match(adventureSource,/arrival_story/);
  assert.match(adventureSource,/code='guild_counter'/);
  assert.doesNotMatch(adventureSource,/directGuild:true/);
});
test('幽暗密林每条回城分支都由梨子喵结识并遇见三人冒险团',()=>{
  for(const code of ['F01','F02'])for(const choice of openingRouteByCode(code)!.choices){
    const arrival=(choice.arrival??[]).map(page=>page.text).join('\n');
    for(const name of ['梨子','莱昂','伊芙','希娅','公会'])assert.ok(arrival.includes(name),`${code}-${choice.code}: ${name}`);
    assert.match(arrival,/亲眼|看见|见证/,`${code}-${choice.code}`);
    assert.doesNotMatch(arrival,/猫族少女/,`${code}-${choice.code}`);
  }
  assert.match(forestArrivalTownScenes[2],/长着猫耳和尾巴/);
  assert.match(forestArrivalGuildScenes[1],/母亲是猫族/);
});
test('幽暗密林三条开局在十一级后汇入梨子喵失踪主线',()=>{
  for(const code of ['F01','F02','F03'])assert.ok(openingRouteByCode(code),code);
  const openingSource=readFileSync('src/game/opening.service.ts','utf8');
  const questSource=readFileSync('src/game/main-quest.service.ts','utf8');
  assert.match(openingSource,/INSERT INTO player_story_progress \(character_id,story_code,status,stage\) VALUES \(\?,'forest_guide','completed',0\)/);
  assert.match(questSource,/title: '【主线·失踪的少女】'[\s\S]*梨子喵进森林打猎后也迟迟未归/);
  const start=questSource.slice(questSource.indexOf('export const startGoblinKingQuest'),questSource.indexOf('export const consultVivianForJudicator'));
  assert.match(start,/character\.level\) < 11/);
  assert.doesNotMatch(start,/route_code|F01|F02|F03/,'接取失踪少女不应按幽暗密林开局分流');
});
test('抵达段由路线人物带路或给出明确方向，进入公会后不再追加交接剧情',()=>{
  for(const route of openingRoutes){
    const arrival=[...route.arrival,...route.choices.flatMap(choice=>choice.arrival??[])].map(page=>page.text).join('\n');
    assert.match(arrival,/公会|会馆|驻点/,route.code);
    assert.doesNotMatch(arrival,/接引人|巡路队|值守|完成交接|入门教学/,route.code);
    assert.ok(route.choices.every(choice=>choice.task==='进入当地冒险者公会'&&!choice.farewell),route.code);
  }
  const databaseSource=readFileSync('src/database/opening.ts','utf8');
  assert.match(databaseSource,/SELECT character_id,'forest_guide','completed',0 FROM player_opening_stories WHERE state='lesson'/);
  assert.match(databaseSource,/UPDATE player_opening_stories SET state='completed'.*WHERE state='lesson'/);
});
test('黄金兔三项消耗与云巢两千铜币在结算服务中真实落账',()=>{
  const source=readFileSync('src/game/opening.service.ts','utf8');
  assert.match(source,/row\.route_code==='F01'&&action==='A'[\s\S]*opening_last_ration[\s\S]*opening_mineral_water[\s\S]*healing_herb/);
  assert.match(source,/row\.route_code==='S03'&&row\.branch_code==='B'[\s\S]*copper_coins=copper_coins\+2000/);
});
test('刚出生的armed状态可读取，不会访问尚未选择的分支',()=>{
  const source=ts.createSourceFile('opening.service.ts',readFileSync('src/game/opening.service.ts','utf8'),ts.ScriptTarget.Latest,true);
  const names=['json','selectedChoice','scenePages','view'];
  const declarations=source.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>names.includes(d.name.getText(source))));
  const code=ts.transpileModule(declarations.map(s=>s.getText(source).replace(/^export\s+/,'')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const view=new Function('openingRouteByCode','openingFirstMeetingText','openingNewcomerText','openingNarrativeText','openingHubs','erisPages',`${code}\nreturn view;`)(openingRouteByCode,openingFirstMeetingText,openingNewcomerText,openingNarrativeText,openingHubs,[]);
  for(const route of openingRoutes){const result=view({route_code:route.code,story_version:route.version,state:'armed',branch_code:null,page_index:0,revision:0,entry_kind:'continue',flags_json:{},reward_claimed:0,destination_code:route.destination});assert.equal(result.state,'armed');assert.equal(result.choices.length,0);assert.ok(result.text.length>=20);}
  for(const route of openingRouteVersions){
    const entryOffset=route.entryMergedIntoFirstPage?0:1;
    const lastPageIndex=entryOffset+route.pages.length-1;
    const row={route_code:route.code,story_version:route.version,state:'reading',branch_code:null,page_index:lastPageIndex,revision:4,entry_kind:'move',flags_json:{},reward_claimed:0,destination_code:route.destination};
    const expected=openingFirstMeetingText(route,route.pages.at(-1)!.text,route.pages.length-1);
    const last=view(row);assert.equal(last.state,'choice',route.code);assert.equal(last.text,expected,route.code);assert.equal(last.choices.length,route.choices.length);
    const oldChoice=view({...row,state:'choice',page_index:0});assert.equal(oldChoice.text,expected,`${route.code}: 旧存档选项应显示新版最后一段`);
    if(lastPageIndex>0){const previous=view({...row,page_index:lastPageIndex-1});assert.equal(previous.state,'reading');assert.equal(previous.choices.length,0);}
    const first=view({...row,page_index:entryOffset}),introduction=openingFirstMeetingIntroduction(route);
    if(introduction)assert.ok(first.text.includes(introduction),route.code);
    for(const choice of route.choices){
      const arrival=view({...row,state:'arrival',branch_code:choice.code,page_index:0,reward_claimed:1,flags_json:{rewardName:choice.rewardName}});
      const expectedArrival=(choice.arrival??route.arrival)[0];
      assert.equal(arrival.title,expectedArrival.title,`${route.code}-${choice.code}`);
      assert.equal(arrival.text,openingNarrativeText(openingNewcomerText(expectedArrival.text)),`${route.code}-${choice.code}`);
    }
  }
});

test('降临事务直接赠送Lv.1鉴识及基础专精，不占神技名额或初始SP',async()=>{
  const source=ts.createSourceFile('character.service.ts',readFileSync('src/game/character.service.ts','utf8'),ts.ScriptTarget.Latest,true);
  const declaration=source.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(source)==='chooseGift'))!;
  const code=ts.transpileModule(declaration.getText(source).replace(/^export\s+/,'').replace("await import('./hidden-attributes.service')",'hiddenAttributes'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const writes:{sql:string;args:unknown[]}[]=[];const ledger:unknown[][]=[];const openingItems:unknown[][]=[];let registrationPending=true;
  const connection={execute:async(sql:string,args:unknown[]=[])=>{
    if(sql.startsWith('SELECT hp_max AS hpMax'))return[[{hpMax:100,mpMax:100,element_mastery_json:{},element_resistance_json:{}}]];
    if(sql==='SELECT id FROM characters WHERE player_id=?')return[[{id:7}]];
    if(sql==='SELECT id FROM item_definitions WHERE code=?')return[[{id:args[0]==='opening_staff'?10:11}]];
    if(sql.startsWith('INSERT INTO player_equipment')&&sql.includes('FROM player_item_instances'))throw Error('ER_CANT_UPDATE_USED_TABLE_IN_SF_OR_TRG');
    writes.push({sql,args});return[{insertId:90,affectedRows:1}];
  }};
  const dependencies={
    withTransaction:async(work:(c:typeof connection)=>unknown)=>work(connection),
    talentCode,jsonRecord:(value:unknown)=>value??{},talentDefinitions,requireChoiceSession:async()=>({player:{id:3},session:registrationPending?{id:4}:null}),
    randomInRange:()=>100,distribute:()=>({}),attributes:[],calculateDerivedStats:()=>({hpMax:100,mpMax:100}),
    randomBalancedElements:()=>({}),chooseOpeningSpawn:async()=>({region:{id:1,name:'幽暗密林'},route:openingRouteByCode('F01'),x:0,y:0,z:0}),
    hiddenAttributes:{hiddenAttributesFor:async()=>({})},recordSkillPointChange:async(...args:unknown[])=>{ledger.push(args);},
    grantOpeningItem:async(...args:unknown[])=>{openingItems.push(args);},openingWorldFor:async()=>({reception_epoch:1}),recalculateCharacterStats:async()=>{},
    updateAchievementState:async()=>{},recordAchievement:()=>{},flushAchievements:async()=>{},takeAchievementEvents:()=>[],achievementStatBonus:async()=>({})
  };
  const chooseGift=new Function(...Object.keys(dependencies),`${code}\nreturn chooseGift;`)(...Object.values(dependencies));
  await assert.rejects(chooseGift('player','divine_g01'),/当前天赋目录/);
  await assert.rejects(chooseGift('player','J01'),/当前天赋目录/);
  assert.equal(writes.length,0,'退役编号和未开放道路不能创建角色或扣除资源');
  const character=await chooseGift('player','G01');
  const appraisal=writes.filter(w=>w.sql.includes('INSERT INTO player_skills')&&w.sql.includes("code='appraisal'"));
  assert.equal(appraisal.length,1);assert.match(appraisal[0].sql,/character_id,skill_id,level,passive_linked/);assert.match(appraisal[0].sql,/SELECT \?,id,1,0/);assert.deepEqual(appraisal[0].args,[7]);
  const progress=writes.find(w=>w.sql.startsWith('INSERT INTO player_appraisal_progress'))!;
  assert.match(progress.sql,/VALUES \(\?,1,1\)/);assert.deepEqual(progress.args,[7]);
  assert.ok(!writes.some(w=>w.sql.includes('INSERT INTO player_skill_discoveries')));
  assert.deepEqual(ledger.map(row=>[row[2],row[3]]),[[1,'initial_grant']]);
  assert.ok(!writes.some(w=>/skill_points\s*=\s*skill_points\s*-/.test(w.sql)));
  assert.deepEqual(writes.find(w=>w.sql.startsWith('INSERT INTO player_blessings'))?.args,[7,'talent_physique_01']);
  assert.ok(writes.some(w=>w.sql.includes("code='healing_herb'")&&w.sql.includes('SELECT ?, id, 3')));
  assert.deepEqual(openingItems.map(args=>args.slice(1)),[[7,'opening_last_ration',3],[7,'opening_mineral_water',3]]);
  assert.equal(character.giftName,talentDefinitions.find(t=>t.number==='G01')!.name);
  assert.deepEqual(writes.filter(w=>w.sql.startsWith('INSERT INTO player_equipment')).map(w=>w.args),[[7,'weapon',10,90],[7,'upper',11,90]]);
  registrationPending=false;
  const count=writes.length;
  assert.equal(await chooseGift('player','G01'),null);
  assert.equal(await chooseGift('player','G02'),null);
  assert.equal(writes.length,count,'重复选择或点击另一项神技不得再次创建角色、发装备或更换恩赐');
  assert.equal(ledger.length,1);
});
test('随从概率以心情占掉落价值上限的比例计算，Boss不吃神技加成',()=>{
  assert.equal(companionChance('normal',.599,20),0);assert.equal(companionChance('normal',.6,20),.12);assert.equal(companionChance('normal',.6,20000),.12);
  assert.equal(companionChance('elite',.8,15),.02);assert.equal(companionChance('boss',.9999,15),0);
  assert.equal(companionChance('boss',1,15,true),.0005);assert.equal(companionChance('normal',.6,15,true),.36);assert.equal(companionChance('boss',1,0),0);
});
test('宝箱批量独立开奖，没有空箱，数量与概率边界可审计',()=>{
  for(const quantity of [0,-1,1.5,101,NaN])assert.throws(()=>rollChest(goldenChestTable,quantity));
  const first=rollChest(goldenChestTable,1,()=>0);assert.deepEqual(first.map(x=>x.code),['healing_herb','dawn_sword']);
  assert.equal(rollChest(goldenChestTable,100,()=>.99999).filter(x=>x.code==='opening_trade_coupon').length,100);
  let seed=7361;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};let epic=0;const weapons=new Map<string,number>();
  for(let i=0;i<300;i++)for(const item of rollChest(goldenChestTable,100,random))if(item.code.startsWith('dawn_')){epic++;weapons.set(item.code,(weapons.get(item.code)??0)+1);}
  assert.ok(epic>5700&&epic<6300);assert.equal(weapons.size,6);for(const n of weapons.values())assert.ok(n>850&&n<1150);
});
