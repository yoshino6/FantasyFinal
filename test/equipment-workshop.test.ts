import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as rules from '../src/game/equipment-workshop-rules';
const nativeRequire=createRequire(import.meta.url);
test('精炼截断正态分布、损耗与材料梯度',()=>{
  let seed=87321;
  const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  const samples=Array.from({length:100000},()=>rules.refinementGain(random));
  assert.ok(samples.every(n=>n>=2&&n<=8));
  assert.ok(Math.abs(samples.reduce((a,b)=>a+b,0)/samples.length-5)<.03);
  assert.ok(samples.filter(n=>n>=4&&n<=6).length>samples.length*.55);
  assert.equal(rules.fusionQualityLoss('精良',100),15);
  assert.equal(rules.fusionQualityLoss('传说',100),17);
  assert.equal(rules.fusionQualityLoss('普通',1),1);
  assert.deepEqual(Object.values(rules.refinementCounts),[1,2,3,4,5,6]);
  assert.equal(rules.breakthroughs['传说'],undefined);
  assert.equal(rules.breakthroughs['史诗'],undefined);
});
test('历史记录仅在定义、实例和台账共同吻合时分离；不补发遗失属性',()=>{
  assert.deepEqual(rules.verifiedLegacyLayers('crafted_1',{physicalAttack:10},{physicalAttack:12},[{physicalAttack:2}]),{base:{physicalAttack:10},frozen:{physicalAttack:2}});
  assert.equal(rules.verifiedLegacyLayers('crafted_1',{physicalAttack:10},{physicalAttack:12},[{physicalAttack:2},{physicalAttack:3}]),null);
  assert.equal(rules.verifiedLegacyLayers('shop_1',{physicalAttack:10},{physicalAttack:12},[{physicalAttack:2}]),null);
});
test('低级主材可指定混合，剩余按稳定顺序补齐，不改变总需求',()=>{
  const stock=[{code:'living_wood',quantity:6},{code:'root_heart',quantity:8,selected:3},{code:'river_shell',quantity:8,selected:2}];
  assert.deepEqual(rules.allocateLowMaterials(stock,10),{result:[{code:'root_heart',quantity:3},{code:'river_shell',quantity:2},{code:'living_wood',quantity:5}],remaining:0});
  assert.throws(()=>rules.allocateLowMaterials([{code:'root_heart',quantity:10,selected:10}],9));
  assert.equal(rules.allocateLowMaterials([{code:'river_shell',quantity:4}],10).remaining,6);
  assert.deepEqual(rules.armorWorkshopNames['布甲'],['兜帽','风衣','束腰','风裤','轻履']);
});
const harness=()=>{
  let shop:any=undefined,owner=1;
  let row:any={id:8,character_id:1,item_id:10,code:'crafted_1',name:'匠制·根灵长剑',item_type:'equipment',item_category:'武器',weapon_type:'长剑',rarity:'精良',required_level:5,quality:100,effect_json:{physicalAttack:30,speed:8,accuracy:9,balanceVersion:3},definition_effect:{physicalAttack:30,speed:8,accuracy:9,balanceVersion:3},bound_kind:'none',durability:42,durability_max:100,budget_level:null,failures:null,revision:null,layers_json:null,equipped:0,legacy:0,market_listing_id:null};
  let coins=1000,stock:any={1:100,2:100,3:100},quotes=new Map<string,any>(),logs:any[]=[],definitions:any[]=[];
  const c={execute:async(sql:string,p:any[]=[])=>{
    if(sql.includes('SELECT ii.*'))return [[row.character_id===p[1]?structuredClone(row):undefined].filter(Boolean)];
    if(sql.startsWith('SELECT i.id'))return [[{id:1,code:'living_wood',name:'活纹木胚',quantity:stock[1]},{id:2,code:'root_heart',name:'根心',quantity:stock[2]},{id:3,code:'bone',name:'骨片',quantity:stock[3]}].filter(r=>p.slice(1).includes(r.code))];
    if(sql.startsWith('INSERT INTO equipment_workshop_quotes')){quotes.set(p[0],{token:p[0],character_id:p[1],instance_id:p[2],source:p[3],mode:p[4],snapshot_json:p[5],costs_json:p[6],fee:p[7],expired:false});return [{}];}
    if(sql.startsWith('SELECT *,expires_at'))return [[quotes.get(p[0])].filter(q=>q?.character_id===p[1])];
    if(sql.startsWith('UPDATE characters SET copper')){if(coins<p[0])return [{affectedRows:0}];coins-=p[0];return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO item_definitions')){definitions.push(p);return [{insertId:100+definitions.length}];}
    if(sql.startsWith('UPDATE player_item_instances SET item_id')){row.item_id=p[0];row.effect_json=JSON.parse(p[1]);const d=definitions.at(-1);row.code=d[0];row.name=d[1];row.rarity=d[2];row.required_level=d[3];row.definition_effect=JSON.parse(d[4]);return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE player_item_instances SET quality')){row.quality=p[0];row.bound_kind=p[1];return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO equipment_workshop_states')){row.budget_level=p[1];row.failures=p[2];row.revision=(row.revision??0)+1;row.layers_json=p[3];return [{}];}
    if(sql.startsWith('UPDATE equipment_workshop_quotes SET result')){quotes.get(p[1]).result_json=p[0];return [{}];}
    throw new Error('Unhandled SQL: '+sql);
  }};
  const caps=(cat:string,type:string,level:number,rarity:string)=>({physicalAttack:level*10*(rarity==='稀有'?1.5:1),speed:level*2,accuracy:level*2,hpMax:level*10});
  const stubs:any={
    '../database/pool':{withTransaction:async(fn:any)=>{const saved=structuredClone({row,coins,stock,quotes,logs,definitions});try{return await fn(c);}catch(e){({row,coins,stock,quotes,logs,definitions}=saved);throw e;}}},
    '../config/epic-forging':{epicForgeRecipes:[]},
    './blacksmith.service':{characterIdFor:async()=>owner,blacksmithProgressFor:async()=>({}),addBlacksmithProficiency:async()=>{},forgeRequirements:()=>[{code:'living_wood',quantity:10},{code:'bone',quantity:3}],forgeFee:()=>2,tierForgeMaterial:()=> 'living_wood',forgePrimaryKeys:()=>['physicalAttack'],forgeEquipmentCapsFor:caps,randomSecondaryAffixPool:()=>[{key:'speed',weight:1},{key:'accuracy',weight:1},{key:'hpMax',weight:1}],pickRandomSecondaryAffix:(pool:any[])=>pool.shift().key,randomForgeValue:(cap:number)=>cap*.5,secondaryAffixCount:(rarity:string)=>rarity==='稀有'?3:2,specialAffixChance:()=>0,forgeName:()=>row.name},
    './achievement-events':{recordAchievement:()=>{}},'./talent-production':{fixedTalentMaterials:async(_:any,__:any,requirements:any[])=>requirements.map(r=>{const id=({living_wood:1,root_heart:2,bone:3} as any)[r.code];if(stock[id]<r.quantity)throw new Error('材料不足');return {item:{id,code:r.code,name:r.code},quantity:r.quantity};}),talentMaterialPayment:async(_:any,__:any,___:any,n:number)=>n,consumeTalentMaterial:async(_:any,__:any,id:number,n:number)=>{if(stock[id]<n)throw new Error('材料不足');stock[id]-=n;return {paid:n,binding:{personal:0,trade:0,unbound:n}};}},
    './equipment-workshop-rules':rules,'./secondary-shop-context':{currentSecondaryShop:()=>shop},
    './combat-loadout-lock.service':{assertCombatLoadoutMutable:async()=>{},assertHiddenInstanceMutable:async()=>{}},
    './inventory-binding':{consumeInventory:async(_:any,__ :any,id:number,n:number)=>{if(stock[id]<n)throw new Error('材料不足');stock[id]-=n;return {personal:0,trade:0,unbound:n};}},
    './character.service':{recalculateCharacterStats:async()=>{}},'./character-operation.service':{recordCharacterOperation:async(_:any,log:any)=>{assert.ok(log.outcome.length<=32);logs.push(log);}}
  };
  const compiled=ts.transpileModule(readFileSync('src/game/equipment-workshop.service.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:any={};new Function('require','exports',compiled)((name:string)=>stubs[name]??nativeRequire(name),exports);
  return {api:exports,state:()=>({row,coins,stock,quotes,logs,definitions}),shop:(value:any)=>shop=value,owner:(value:number)=>owner=value};
};
test('熔铸保留实例、全部词条及耐久；确认只扣一次；后续重铸仍使用原词条等级',async()=>{
  const h=harness(),before=structuredClone(h.state().row);
  const quote=await h.api.workshopPreview('u',8,'fusion');
  const result=await h.api.workshopExecute('u',quote.token,'fusion');
  assert.equal(h.state().row.required_level,10);assert.equal(h.state().row.quality,85);
  assert.equal(h.state().row.budget_level,5);assert.equal(h.state().row.id,8);assert.equal(h.state().row.durability,42);
  assert.deepEqual(h.state().row.effect_json,before.effect_json);
  const coins=h.state().coins;assert.deepEqual(await h.api.workshopExecute('u',quote.token,'fusion'),result);assert.equal(h.state().coins,coins);assert.equal(h.state().logs.length,1);
  const reroll=await h.api.workshopPreview('u',8,'reroll');await h.api.workshopExecute('u',reroll.token,'reroll');
  assert.equal(h.state().row.effect_json.physicalAttack,30);assert.equal(h.state().row.effect_json.speed,5);assert.equal(h.state().row.budget_level,5);
  assert.ok(h.state().row.quality>=87&&h.state().row.quality<=89);
});
test('跨入口、跨玩家、错误操作、过期和装备变动均不能扣料',async()=>{
  for(const change of ['source','owner','mode','expired','state']){
    const h=harness(),q=await h.api.workshopPreview('u',8,'fusion');
    if(change==='source')h.shop({shop:'blacksmith'});if(change==='owner')h.owner(2);if(change==='expired')h.state().quotes.get(q.token).expired=true;if(change==='state')h.state().row.quality=90;
    await assert.rejects(h.api.workshopExecute('u',q.token,change==='mode'?'reroll':'fusion'));
    assert.equal(h.state().coins,1000);assert.equal(h.state().stock[1],100);assert.equal(h.state().logs.length,0);
  }
});
test('材料不足时事务回滚；成功率失败维持圆满；保底随实例保存',async()=>{
  const h=harness(),q=await h.api.workshopPreview('u',8,'fusion');h.state().stock[3]=0;
  await assert.rejects(h.api.workshopExecute('u',q.token,'fusion'));assert.equal(h.state().coins,1000);assert.equal(h.state().stock[1],100);
  const b=harness(),random=Math.random;Math.random=()=>.99;
  try{
    for(let i=0;i<6;i++){
      const q=await b.api.workshopPreview('u',8,'refine');await b.api.workshopExecute('u',q.token,'refine');
      assert.equal(b.state().row.quality,100);
      assert.equal(b.state().row.rarity,i===5?'稀有':'精良');
      assert.equal(b.state().row.failures,i===5?0:i+1);
    }
    assert.equal(b.state().row.effect_json.physicalAttack,45);assert.equal(b.state().coins,1000);
  }finally{Math.random=random;}
});
test('接近圆满时仅补足缺口，不自动突破；传说与史诗圆满不能突破',async()=>{
  const h=harness();h.state().row.quality=99.9;
  const q=await h.api.workshopPreview('u',8,'refine');assert.equal(q.breakthrough,false);
  await h.api.workshopExecute('u',q.token,'refine');assert.equal(h.state().row.quality,100);assert.equal(h.state().row.rarity,'精良');
  const next=await h.api.workshopPreview('u',8,'refine');assert.equal(next.breakthrough,true);
  for(const rarity of ['传说','史诗']){const h=harness();h.state().row.rarity=rarity;await assert.rejects(h.api.workshopPreview('u',8,'refine'),/圆满/);assert.equal(h.state().coins,1000);}
});
