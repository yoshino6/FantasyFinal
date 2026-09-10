import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { talentCode } from '../src/game/talent.config';
import { openingFirstMeetingIntroduction, openingFirstMeetingText, openingLessonText, openingNarrativeText, openingNewcomerText, openingRoutes, openingRouteVersions, openingRouteByCode, talentDefinitions } from '../src/game/opening-content';
import { openingHubs, openingSpawnRegions } from '../src/game/opening-world.config';
import { goldenChestTable, rollChest } from '../src/game/opening-chest.config';
import { companionChance } from '../src/game/companion.service';
import { keepsakeDefinitions } from '../src/game/opening-keepsakes.config';

test('14张出生地图均有三条完整路线，版本唯一，所有分支都有相遇、后果和安全落脚',()=>{
  assert.equal(openingRoutes.length,42);assert.equal(Object.keys(openingSpawnRegions).length,14);
  const identities=new Set<string>();let branches=0;
  for(const[region,config]of Object.entries(openingSpawnRegions)){
    const routes=openingRoutes.filter(r=>r.region===region);assert.equal(routes.length,3,region);
    for(const route of routes){
      assert.match(route.code,new RegExp(`^${config.prefix}0[123]$`));assert.ok(!identities.has(route.code));identities.add(route.code);
      assert.ok(route.moveEntry.length>=20&&route.huntEntry.length>=20,route.code);assert.ok(route.pages.length&&route.arrival.length,route.code);
      assert.ok(route.destination in openingHubs,route.code);assert.ok(route.choices.length>=2&&route.choices.length<=3,route.code);
      for(const p of [...route.pages,...route.arrival])assert.ok(p.text.trim().length>=20,route.code);
      for(const choice of route.choices){branches++;assert.ok(choice.pages.length,route.code+choice.code);assert.ok(choice.pages.every(p=>p.text.trim().length>=20));assert.ok(choice.quest&&choice.task&&choice.rewardCode&&choice.farewell,route.code+choice.code);}
    }
  }
  assert.equal(branches,113);
});
test('采用逃婚新版与保留奇遇，旧版编号不能偷偷换稿',()=>{
  const bride=openingRouteByCode('M02')!;assert.equal(bride.version,3);assert.match(JSON.stringify(bride),/逃婚|婚礼|婚纱/);
  for(const code of ['C01','C02','T02','T03','E01','E03'])assert.equal(openingRouteByCode(code)?.version,3);
  assert.equal(openingRouteByCode('M02',2),undefined);assert.equal(talentDefinitions.length,100);
  assert.equal(talentDefinitions.filter(s=>s.code.startsWith('divine_')).length,0);assert.ok(talentDefinitions.every(s=>s.code===talentCode(s.number)));
});
test('十一条重写路线只读取全新脚本，不回退旧人物或旧事件',()=>{
  const titles:Record<string,string>={R01:'雾河信标',R02:'丝雨木箱',R03:'断桥哨笛',S03:'云巢来客',D03:'树洞战鼓',H01:'倒悬矿灯',H03:'石像的口令',I02:'无主机偶',I03:'熔渣信箱',W03:'雾中石门',A03:'落星坑底'};
  for(const [code,title] of Object.entries(titles)){
    const route=openingRouteByCode(code)!;
    assert.equal(route.title,title,code);
    assert.doesNotMatch(JSON.stringify(route),/八婶|匣伯|露涅|泊叔|白汀|佩洛|浴缸|旅馆/,code);
  }
});
test('被删除路线的旧专属服务不会残留，现有三份线索使用新人物办理',()=>{
  const rewritten=new Set(['R01','R02','R03','S03','D03','H01','H03','I02','I03','W03','A03']);
  const active=keepsakeDefinitions.filter(item=>rewritten.has(item.branch.slice(0,3)));
  assert.deepEqual(active.map(item=>item.branch),['R02-B','R03-C','A03-B']);
  assert.deepEqual(active.map(item=>item.npc),['季白','桐羽','星岚']);
  assert.doesNotMatch(JSON.stringify(active),/八婶|匣伯|露涅|布隆|旅馆|怀表|空坟/);
});
test('云巢与无主机偶以真实羁绊收束，不再把伙伴写成纪念品',()=>{
  const cloud=openingRouteByCode('S03')!,automaton=openingRouteByCode('I02')!;
  const cloudChoice=cloud.choices.find(choice=>choice.code==='A')!;
  assert.match(JSON.stringify(cloudChoice),/破壳|风羽幼鸟选择同行/);
  assert.doesNotMatch(JSON.stringify(cloudChoice),/暂不具备孵化|保温匣|opening_windbird_egg/);
  for(const code of ['A','B']){
    const choice=automaton.choices.find(item=>item.code===code)!;
    assert.equal(choice.rewardName,'无主机偶主动认主');
    assert.match(`${choice.rewardUse}${choice.farewell}`,/永久进入机巧名册|同行对象|同行位置/);
  }
  assert.match(automaton.choices.find(choice=>choice.code==='C')!.pages[0]!.text,/不等于接受下一次归属/);
});
test('每条初行路线最多保留一件实体线索，其余结果使用现有资源或伙伴系统',()=>{
  const direct=new Set(['F01-A','F01-B','F02-A','S03-A','I02-A','I02-B']);
  for(const route of openingRouteVersions){
    const clues=route.choices.filter(choice=>!choice.pack&&!choice.rewardKind&&!direct.has(`${route.code}-${choice.code}`));
    assert.ok(clues.length<=1,`${route.code} v${route.version} 实体线索超过一件：${clues.map(choice=>choice.rewardName).join('、')}`);
  }
  assert.match(openingRouteByCode('T01')!.choices.find(choice=>choice.code==='A')!.rewardName,/辅助瞄准镜/);
  assert.equal(openingRouteByCode('T01')!.choices.find(choice=>choice.code==='A')!.rewardEquipment,'auxiliary_aiming_scope');
  assert.equal(openingRouteByCode('M03')!.choices.find(choice=>choice.code==='C')!.rewardEquipment,'random_weapon');
  assert.equal(openingRouteByCode('T02')!.choices.find(choice=>choice.code==='A')!.rewardEquipment,'random_armor');
  assert.deepEqual(openingRouteByCode('A03')!.choices.find(choice=>choice.code==='A')!.rewardItems,[{code:'meteor_iron',quantity:1}]);
  assert.deepEqual(openingRouteByCode('E02')!.choices.find(choice=>choice.code==='C')!.rewardItems,[{code:'moon_silver',quantity:1}]);
});
test('新旅人先听见符合人物性格的自我介绍，再得知路线人物的姓名',()=>{
  const deferred=new Set(['A01','B01','D01','D03','F01','F02','F03','H01','H03','I02','I03','W03','A03','R01','R02','R03','S03']);
  for(const route of openingRoutes){
    const introduction=openingFirstMeetingIntroduction(route);
    if(deferred.has(route.code)){assert.equal(introduction,'',route.code);continue;}
    assert.ok(introduction.length>=24,route.code);
    assert.doesNotMatch(introduction,/我还在判断该不该靠近/,route.code);
    const text=openingFirstMeetingText(route,route.pages[0].text);
    const introductionIndex=text.indexOf(introduction);
    assert.ok(text.includes(introduction),route.code);assert.ok(!text.startsWith(introduction),route.code);
    assert.doesNotMatch(text.slice(0,introductionIndex),new RegExp(route.person?.name??'(?!)'),route.code);
  }
  assert.match(openingRouteByCode('S01')!.pages[0].text,/贝娅/);
  assert.match(openingRouteByCode('F03')!.pages[0].text,/我叫莱昂/);
  assert.match(openingRouteByCode('A01')!.pages[0].text,/我叫阿库娅/);
});
test('首次自我介绍的句式随人物身份变化，不使用统一报姓名模板',()=>{
  const current=openingRouteVersions.filter(route=>route.version>=3&&openingFirstMeetingIntroduction(route));
  const openings=new Set(current.map(route=>openingFirstMeetingIntroduction(route).match(/^[^：:]*[：:]/)?.[0]??''));
  assert.ok(openings.size>=12,'自我介绍需要保留不同的开场节奏');
  assert.match(openingFirstMeetingIntroduction(openingRouteByCode('W02')!),/药师露缇/);
  assert.match(openingFirstMeetingIntroduction(openingRouteByCode('M02')!),/我叫艾蕾诺/);
});
test('四条重写人物路线先发生事件，再按各自身份自然报出名字',()=>{
  const expected:Record<string,RegExp>={R01:/叫我岚溪，河上的灯归我管/,R02:/季白，上游驿站的见习生/,R03:/我在河务所画图，桐羽/,S03:/叫我烬川——等活着下去/};
  for(const [code,pattern] of Object.entries(expected)){
    const route=openingRouteByCode(code)!;
    assert.equal(openingFirstMeetingIntroduction(route),'',code);
    const story=[route.moveEntry,...route.pages.map(page=>page.text)].join('\n\n');
    const name=route.person!.name,index=story.indexOf(name);
    assert.ok(index>40,`${code} 不能在事件发生前泄露姓名`);
    assert.match(story,pattern,code);
  }
});
test('十一条重写路线沿用黄金兔与受伤魔女的分支结构，选择后才显示独立结果',()=>{
  const codes=['R01','R02','R03','S03','D03','H01','H03','I02','I03','W03','A03'];
  for(const code of codes){
    const route=openingRouteByCode(code)!;
    const segments=[route.moveEntry,route.huntEntry,...route.pages.map(page=>page.text),...route.arrival.map(page=>page.text)];
    for(const choice of route.choices)segments.push(...choice.pages.map(page=>page.text),choice.farewell,openingLessonText(route,choice));
    for(const text of segments)assert.ok([...text.trim()].length>=50,`${code} 存在不足50字的独立剧情段`);
    assert.ok(route.choices.length>=2&&route.choices.length<=3,`${code} 应提供2至3个选项`);
    assert.equal(new Set(route.choices.map(choice=>choice.label)).size,route.choices.length,`${code} 选项不可重复`);
    for(const choice of route.choices){
      assert.ok(choice.pages.length>0,`${code}-${choice.code} 必须在选择后显示结果`);
      assert.doesNotMatch(openingLessonText(route,choice),/本次交接|完成交接|请完成这一份|强制委托/,`${code}-${choice.code}`);
    }
  }
  assert.match(openingLessonText(openingRouteByCode('S03')!,openingRouteByCode('S03')!.choices[0]),/幼鸟|自己决定/);
  assert.match(openingLessonText(openingRouteByCode('I02')!,openingRouteByCode('I02')!.choices[0]),/主动|自己选择|伙伴关系/);
});
test('同场角色的专名也只在介绍对白之后出现',()=>{
  const companions:Record<string,string[]>={D02:['乌禾'],W02:['小苇'],Y03:['萨芙']};
  for(const [code,names] of Object.entries(companions)){
    const route=openingRouteByCode(code)!;
    const introduction=openingFirstMeetingIntroduction(route),text=openingFirstMeetingText(route,route.pages[0].text);
    const before=text.slice(0,text.indexOf(introduction));
    for(const name of names)assert.doesNotMatch(before,new RegExp(name),`${code} ${name}`);
    for(const name of names)assert.match(introduction,new RegExp(name),`${code} ${name}`);
  }
});
test('抵达安全区前不以姓名提前称呼接应人员，姓名留待实际交谈',()=>{
  for(const route of openingRouteVersions)for(const text of [...route.arrival.map(page=>page.text),openingLessonText(route,route.choices[0]),route.choices[0].farewell]){
    assert.doesNotMatch(openingNewcomerText(text),/岑渡|维萝|莫妮卡|菈芮|温棠|澄叶/,route.code);
  }
});
test('七图新路线以同行角色、固定交通或专用法术抵达安全区，不以野外巡守兜底',()=>{
  const current=openingRouteVersions.filter(route=>route.version===4);
  assert.equal(current.length,21);
  for(const route of current){
    const arrival=route.arrival.map(page=>page.text).join('\n');
    assert.doesNotMatch(arrival,/巡路队|巡路车|巡护|巡卫|护林员|值守|救援队/,route.code);
  }
  assert.match(openingRouteByCode('D03')!.arrival[0].text,/根道|固定药阵/);
  assert.match(openingRouteByCode('D02')!.arrival[0].text,/灵车/);
  assert.match(openingRouteByCode('W02')!.arrival[0].text,/固定传送阵/);
  assert.match(openingRouteByCode('W03')!.arrival[0].text,/维护艇|采样艇|传送阵/);
});
test('初行不使用封存记录和值守等内部简称，而是写出可见的人与动作',()=>{
  for(const route of openingRouteVersions)for(const text of [route.moveEntry,route.huntEntry,...route.pages.map(page=>page.text),...route.arrival.map(page=>page.text),...route.choices.flatMap(choice=>[...choice.pages.map(page=>page.text),choice.farewell,openingLessonText(route,choice)])]){
    assert.doesNotMatch(openingNarrativeText(text),/封存记录|值守/,route.code);
  }
});
test('刚出生的armed状态可读取，不会访问尚未选择的分支',()=>{
  const source=ts.createSourceFile('opening.service.ts',readFileSync('src/game/opening.service.ts','utf8'),ts.ScriptTarget.Latest,true);
  const names=['json','selectedChoice','scenePages','view'];
  const declarations=source.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>names.includes(d.name.getText(source))));
  const code=ts.transpileModule(declarations.map(s=>s.getText(source).replace(/^export\s+/,'')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const view=new Function('openingRouteByCode','openingFirstMeetingText','openingNewcomerText','openingNarrativeText','openingHubs','erisPages',`${code}\nreturn view;`)(openingRouteByCode,openingFirstMeetingText,openingNewcomerText,openingNarrativeText,openingHubs,[]);
  for(const route of openingRoutes){const result=view({route_code:route.code,story_version:route.version,state:'armed',branch_code:null,page_index:0,revision:0,entry_kind:'continue',flags_json:{},reward_claimed:0,destination_code:route.destination});assert.equal(result.state,'armed');assert.equal(result.choices.length,0);assert.ok(result.text.length>=20);}
  for(const route of openingRouteVersions){
    const row={route_code:route.code,story_version:route.version,state:'reading',branch_code:null,page_index:route.pages.length,revision:4,entry_kind:'move',flags_json:{},reward_claimed:0,destination_code:route.destination};
    const expected=openingFirstMeetingText(route,route.pages.at(-1)!.text,route.pages.length-1);
    const last=view(row);assert.equal(last.state,'choice',route.code);assert.equal(last.text,expected,route.code);assert.equal(last.choices.length,route.choices.length);
    const previous=view({...row,page_index:row.page_index-1});assert.equal(previous.state,'reading');assert.equal(previous.choices.length,0);
    const first=view({...row,page_index:1}),introduction=openingFirstMeetingIntroduction(route);
    if(introduction)assert.ok(first.text.includes(introduction),route.code);
  }
});

test('降临事务直接赠送Lv.1鉴识及基础专精，不占神技名额或初始SP',async()=>{
  const source=ts.createSourceFile('character.service.ts',readFileSync('src/game/character.service.ts','utf8'),ts.ScriptTarget.Latest,true);
  const declaration=source.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(source)==='chooseGift'))!;
  const code=ts.transpileModule(declaration.getText(source).replace(/^export\s+/,'').replace("await import('./hidden-attributes.service')",'hiddenAttributes'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const writes:{sql:string;args:unknown[]}[]=[];const ledger:unknown[][]=[];let registrationPending=true;
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
    grantOpeningItem:async()=>{},openingWorldFor:async()=>({reception_epoch:1}),recalculateCharacterStats:async()=>{},
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
