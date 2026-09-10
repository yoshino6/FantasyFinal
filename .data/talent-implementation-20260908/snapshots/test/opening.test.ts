import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { openingRoutes, openingRouteByCode, divineSkillDefinitions } from '../src/game/opening-content';
import { openingHubs, openingSpawnRegions } from '../src/game/opening-world.config';
import { goldenChestTable, rollChest } from '../src/game/opening-chest.config';
import { companionChance } from '../src/game/companion.service';

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
  assert.equal(openingRouteByCode('M02',2),undefined);assert.equal(divineSkillDefinitions.length,18);
  assert.ok(divineSkillDefinitions.every(s=>s.code.startsWith('divine_g')));
});
test('刚出生的armed状态可读取，不会访问尚未选择的分支',()=>{
  const source=ts.createSourceFile('opening.service.ts',readFileSync('src/game/opening.service.ts','utf8'),ts.ScriptTarget.Latest,true);
  const names=['json','selectedChoice','scenePages','view'];
  const declarations=source.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>names.includes(d.name.getText(source))));
  const code=ts.transpileModule(declarations.map(s=>s.getText(source).replace(/^export\s+/,'')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const view=new Function('openingRouteByCode','openingHubs','erisPages',`${code}\nreturn view;`)(openingRouteByCode,openingHubs,[]);
  for(const route of openingRoutes){const result=view({route_code:route.code,story_version:route.version,state:'armed',branch_code:null,page_index:0,revision:0,entry_kind:'continue',flags_json:{},reward_claimed:0,destination_code:route.destination});assert.equal(result.state,'armed');assert.equal(result.choices.length,0);assert.ok(result.text.length>=20);}
});

test('降临事务直接赠送Lv.1鉴识及基础专精，不占神技名额或初始SP',async()=>{
  const source=ts.createSourceFile('character.service.ts',readFileSync('src/game/character.service.ts','utf8'),ts.ScriptTarget.Latest,true);
  const declaration=source.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(source)==='chooseGift'))!;
  const code=ts.transpileModule(declaration.getText(source).replace(/^export\s+/,'').replace("await import('./hidden-attributes.service')",'hiddenAttributes'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const writes:{sql:string;args:unknown[]}[]=[];const ledger:unknown[][]=[];let registrationPending=true;
  const connection={execute:async(sql:string,args:unknown[]=[])=>{
    if(sql==='SELECT id FROM characters WHERE player_id=?')return[[{id:7}]];
    if(sql==='SELECT id FROM item_definitions WHERE code=?')return[[{id:args[0]==='opening_staff'?10:11}]];
    if(sql.startsWith('INSERT INTO player_equipment')&&sql.includes('FROM player_item_instances'))throw Error('ER_CANT_UPDATE_USED_TABLE_IN_SF_OR_TRG');
    writes.push({sql,args});return[{insertId:90,affectedRows:1}];
  }};
  const dependencies={
    withTransaction:async(work:(c:typeof connection)=>unknown)=>work(connection),
    divineSkillDefinitions,requireChoiceSession:async()=>({player:{id:3},session:registrationPending?{id:4}:null}),
    randomInRange:()=>100,distribute:()=>({}),attributes:[],calculateDerivedStats:()=>({hpMax:100,mpMax:100}),
    randomBalancedElements:()=>({}),chooseOpeningSpawn:async()=>({region:{id:1,name:'幽暗密林'},route:openingRouteByCode('F01'),x:0,y:0,z:0}),
    hiddenAttributes:{hiddenAttributesFor:async()=>({})},recordSkillPointChange:async(...args:unknown[])=>{ledger.push(args);},
    grantOpeningItem:async()=>{},openingWorldFor:async()=>({reception_epoch:1}),recalculateCharacterStats:async()=>{}
  };
  const chooseGift=new Function(...Object.keys(dependencies),`${code}\nreturn chooseGift;`)(...Object.values(dependencies));
  const character=await chooseGift('player','G01');
  const appraisal=writes.filter(w=>w.sql.includes('INSERT INTO player_skills')&&w.sql.includes("code='appraisal'"));
  assert.equal(appraisal.length,1);assert.match(appraisal[0].sql,/character_id,skill_id,level,passive_linked/);assert.match(appraisal[0].sql,/SELECT \?,id,1,0/);assert.deepEqual(appraisal[0].args,[7]);
  const progress=writes.find(w=>w.sql.startsWith('INSERT INTO player_appraisal_progress'))!;
  assert.match(progress.sql,/VALUES \(\?,1,1\)/);assert.deepEqual(progress.args,[7]);
  assert.ok(!writes.some(w=>w.sql.includes('INSERT INTO player_skill_discoveries')));
  assert.deepEqual(ledger.map(row=>[row[2],row[3]]),[[1,'initial_grant']]);
  assert.ok(!writes.some(w=>/skill_points\s*=\s*skill_points\s*-/.test(w.sql)));
  assert.deepEqual(writes.find(w=>w.sql.startsWith('INSERT INTO player_blessings'))?.args,[7,'divine_g01']);
  assert.equal(character.giftName,divineSkillDefinitions[0].name);
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
  assert.equal(companionChance('boss',1,15,true),.0005);assert.equal(companionChance('normal',.6,15,true),.18);assert.equal(companionChance('boss',1,0),0);
});
test('宝箱批量独立开奖，没有空箱，数量与概率边界可审计',()=>{
  for(const quantity of [0,-1,1.5,101,NaN])assert.throws(()=>rollChest(goldenChestTable,quantity));
  const first=rollChest(goldenChestTable,1,()=>0);assert.deepEqual(first.map(x=>x.code),['healing_herb','dawn_sword']);
  assert.equal(rollChest(goldenChestTable,100,()=>.99999).filter(x=>x.code==='opening_trade_coupon').length,100);
  let seed=7361;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};let epic=0;const weapons=new Map<string,number>();
  for(let i=0;i<300;i++)for(const item of rollChest(goldenChestTable,100,random))if(item.code.startsWith('dawn_')){epic++;weapons.set(item.code,(weapons.get(item.code)??0)+1);}
  assert.ok(epic>5700&&epic<6300);assert.equal(weapons.size,6);for(const n of weapons.values())assert.ok(n>850&&n<1150);
});
