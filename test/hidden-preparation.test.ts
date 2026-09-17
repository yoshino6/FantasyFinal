import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as alemon from 'alemonjs';
import { hiddenSkills, hiddenProfession } from '../src/game/hidden-profession.config';
import { hiddenResourceShortage, hiddenState } from '../src/game/hidden-combat-state';
import { hiddenMix, hiddenBranchDamage } from '../src/game/hidden-particles';
import { parseHiddenParticleInput } from '../src/game/hidden-particle-input';
import { newHiddenTrial } from '../src/game/hidden-trial';
import { CombatRules } from '../src/game/combat-rule-registry';
import { executeHiddenCombat, hiddenEndTurn } from '../src/game/hidden-combat';
import { calculateDerivedStats, virtualEquipmentStats } from '../src/game/constants';

const fixture=(kind:'pve'|'pvp'|'setup'='pve')=>{
  let draft:any;const cooldowns:any={__hidden:{resource:0}},stocks:Record<string,number>={fire_element_dust:2,dark_element_dust:1,energy_ember:1};let writes=0;
  const c={execute:async(sql:string,args:any[]=[])=>{
    if(sql.startsWith('SELECT s.id FROM player_skills'))return [[{id:1}]];
    if(sql.includes('SELECT cs.id,cs.turn_no'))return [kind==='pve'?[{id:'battle',turn_no:1,cooldowns}]:[]];
    if(sql.includes('SELECT id,turn_no,attacker_character_id'))return [kind==='pvp'?[{id:'battle',turn_no:1,cooldowns,attacker_character_id:1}]:[]];
    if(sql.startsWith('SELECT cm.cooldowns')||sql.startsWith('SELECT attacker_cooldowns AS cooldowns'))return [[{cooldowns}]];
    if(sql.startsWith('SELECT * FROM player_hidden_action_drafts'))return [draft?[structuredClone(draft)]:[]];
    if(sql.startsWith('INSERT INTO player_hidden_action_drafts')){writes++;draft={skill_code:args[3],draft_json:JSON.parse(args[4]),revision:args[5],submitted:0};return [{}];}
    if(sql.startsWith('UPDATE player_hidden_action_drafts')){writes++;draft.submitted=1;return [{}];}
    if(sql.startsWith('SELECT i.code,p.quantity'))return [Object.entries(stocks).map(([code,quantity])=>({code,quantity}))];
    if(sql.startsWith('SELECT'))return [[]];
    throw new Error('未预期的写入：'+sql);
  }};
  const require=createRequire(import.meta.url),cache=new Map<string,any>();
  const load=(relative:string):any=>{
    const path=resolve(relative.endsWith('.ts')?relative:relative+'.ts');if(cache.has(path))return cache.get(path).exports;
    const module={exports:{} as any};cache.set(path,module);
    const local=(name:string):any=>name==='alemonjs'?alemon:name.endsWith('/pool')?{getPool:async()=>c,withTransaction:async(work:any)=>work(c)}:name.endsWith('/hidden-quest.service')?{hiddenQuestCharacter:async()=>({id:1,level:30})}:name.startsWith('.')?load(resolve(dirname(path),name)):require(name);
    const compiled=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    new Function('require','module','exports',compiled)(local,module,module.exports);return module.exports;
  };
  return {service:load('src/game/hidden-battle.service'),c,cooldowns,stocks,draft:()=>draft,writes:()=>writes};
};

test('批量粒子保留顺序与重复，兼容提及、重复按钮命令与十二种名称',()=>{
  assert.deepEqual(parseHiddenParticleInput('暗 @机器人 /隐藏战技 hidden_mix 7 particle 火 <@!123>/隐藏战技 hidden_mix 7 particle 火 [CQ:at,qq=123] /隐藏战技 hidden_mix 7 particle 余烬','hidden_mix',7),['dark_element_dust','fire_element_dust','fire_element_dust','energy_ember']);
  assert.deepEqual(parseHiddenParticleInput('风粒子，魔弧＋<qqbot-at-user id="123" />残渣；水元素微尘','hidden_mix',7),['wind_element_dust','magic_unit','blood_residue','water_element_dust']);
  assert.deepEqual(parseHiddenParticleInput('土 木 冰 雷','hidden_mix',7),['metal_element_dust','wood_element_dust','ice_element_dust','thunder_element_dust']);
  assert.deepEqual(parseHiddenParticleInput('光微尘 能量余烬 魔力微弧 血肉残渣','hidden_mix',7),['light_element_dust','energy_ember','magic_unit','blood_residue']);
  for(const text of ['暗 火 火 火 火','暗 金','暗 /隐藏战技 hidden_mix 6 particle 火','暗 /隐藏战技 hidden_kettle 7 particle 火','暗 /隐藏施放 hidden_mix 7'])assert.throws(()=>parseHiddenParticleInput(text,'hidden_mix',7));
});

test('实际路由声明和 Alemon 校验器完整保留穿插命令的选材尾部',async()=>{
  const source=ts.createSourceFile('index.ts',readFileSync(resolve('src/index.ts'),'utf8'),ts.ScriptTarget.Latest,true);
  let schema:ts.Expression|undefined;
  const visit=(node:ts.Node)=>{
    if(ts.isObjectLiteralExpression(node)&&node.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(source)==='path'&&p.initializer.getText(source)==="'隐藏战技'")){
      const property=node.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(source)==='schema') as ts.PropertyAssignment;
      schema=property.initializer;
    }
    ts.forEachChild(node,visit);
  };
  visit(source);assert.ok(schema);
  const config=new Function(`return (${schema.getText(source)})`)();
  const validator=await import(pathToFileURL(resolve('node_modules/alemonjs/lib/application/router/validator.js')).href);
  const result=validator.validateRouteArgs(['hidden_mix','7','particle','暗','<@123>/隐藏战技','hidden_mix','7','particle','火'],config);
  assert.equal(result.valid,true);
  assert.deepEqual(parseHiddenParticleInput(result.parsedArgs[3],'hidden_mix',7),['dark_element_dust','fire_element_dust']);
});

for(const kind of ['pve','pvp','setup'] as const)test(`${kind}批量追加及整组替换：一次写入，库存不足/旧面板/超量整批拒绝`,async()=>{
  const f=fixture(kind);let d=await f.service.hiddenDraft('user','hidden_mix');
  const start=f.writes(),version=d.revision;
  d=await f.service.hiddenDraft('user','hidden_mix',version,'particle',`暗 <@123>/隐藏战技 hidden_mix ${version} particle 火 @机器人 /隐藏战技 hidden_mix ${version} particle 火 @机器人 /隐藏战技 hidden_mix ${version} particle 余烬`);
  assert.deepEqual(d.choice.particles,['dark_element_dust','fire_element_dust','fire_element_dust','energy_ember']);
  assert.equal(f.writes(),start+1);assert.equal(d.remainingStocks.fire_element_dust,0);assert.equal(f.stocks.fire_element_dust,2);
  const saved=structuredClone(f.draft()),writes=f.writes();
  for(const [revision,op,text] of [[version,'particles','火 火'],[d.revision,'particles','火 火 火'],[d.revision,'particles','暗'],[d.revision,'particle','火'],[d.revision,'particles',`暗 /隐藏战技 hidden_mix ${version} particle 火`]] as const){
    await assert.rejects(f.service.hiddenDraft('user','hidden_mix',revision,op,text));assert.deepEqual(f.draft(),saved);assert.equal(f.writes(),writes);
  }
  d=await f.service.hiddenDraft('user','hidden_mix',d.revision,'particles','暗 火');
  assert.deepEqual(d.choice.particles,['dark_element_dust','fire_element_dust']);assert.equal(d.remainingStocks.fire_element_dust,1);
  f.stocks.dark_element_dust=0;
  await assert.rejects(f.service.hiddenDraft('user','hidden_mix',d.revision,'particles','暗 火'),/不足/);
  assert.equal(f.draft().revision,d.revision);
});

test('四职业全部有资源消耗的技能：不足立即提示准确名称，零消耗技能不误拦截',()=>{
  for(const skill of hiddenSkills){
    const cooldowns={__hidden:{resource:Math.max(0,skill.resource-1)}};
    const message=hiddenResourceShortage(skill.code,cooldowns);
    if(skill.resource){assert.ok(message?.includes(hiddenProfession(skill.profession)!.resource+'不足'));assert.ok(message?.includes(`需要 ${skill.resource}`));}
    else assert.equal(message,null);
    cooldowns.__hidden.resource=skill.resource;assert.equal(hiddenResourceShortage(skill.code,cooldowns),null);
  }
});

for(const kind of ['pve','pvp'] as const)test(`${kind}准备页及旧票据提交实时校验资源；失败不写草稿或提交状态`,async()=>{
  const f=fixture(kind);
  for(const skill of hiddenSkills.filter(s=>s.resource>0)){
    f.cooldowns.__hidden.resource=skill.resource-1;
    const writes=f.writes();await assert.rejects(f.service.hiddenDraft('user',skill.code),/不足/);assert.equal(f.writes(),writes);
    f.cooldowns.__hidden.resource=skill.resource;const draft=await f.service.hiddenDraft('user',skill.code);
    f.cooldowns.__hidden.resource=skill.resource-1;
    await assert.rejects(f.service.hiddenDraft('user',skill.code,draft.revision,'view'),/不足/);
    await assert.rejects(f.service.submitHiddenDraft(f.c,1,'battle',1,kind,skill.code,{battleKey:draft.battleKey,turn:1,revision:draft.revision}),/不足/);
    assert.equal(f.draft().submitted,0);
  }
});

test('局外允许保存高消耗技能配置；粒子按钮逐颗检查并显示预扣余量，撤回/清空恢复',async()=>{
  const f=fixture('setup');await f.service.hiddenDraft('user','hidden_kettle');
  let d=await f.service.hiddenDraft('user','hidden_mix');assert.equal(d.remainingStocks.fire_element_dust,2);
  d=await f.service.hiddenDraft('user','hidden_mix',d.revision,'particle','fire_element_dust');assert.equal(d.remainingStocks.fire_element_dust,1);
  d=await f.service.hiddenDraft('user','hidden_mix',d.revision,'particle','fire_element_dust');assert.equal(d.remainingStocks.fire_element_dust,0);assert.equal(f.stocks.fire_element_dust,2);
  const writes=f.writes();await assert.rejects(f.service.hiddenDraft('user','hidden_mix',d.revision,'particle','fire_element_dust'),/火微尘不足/);assert.equal(f.writes(),writes);
  d=await f.service.hiddenDraft('user','hidden_mix',d.revision,'undo');assert.equal(d.remainingStocks.fire_element_dust,1);
  d=await f.service.hiddenDraft('user','hidden_mix',d.revision,'clear');assert.equal(d.remainingStocks.fire_element_dust,2);
  await assert.rejects(f.service.hiddenDraft('user','hidden_mix',d.revision,'particle','blood_residue'),/血肉残渣不足/);
});

test('准备后背包发生变化，再次选材和确认都会拒绝超额，失败不提交行动',async()=>{
  const f=fixture();let d=await f.service.hiddenDraft('user','hidden_mix');
  for(const p of ['dark_element_dust','fire_element_dust'])d=await f.service.hiddenDraft('user','hidden_mix',d.revision,'particle',p);
  f.stocks.dark_element_dust=0;
  await assert.rejects(f.service.hiddenDraft('user','hidden_mix',d.revision,'particle','energy_ember'),/暗微尘不足/);
  await assert.rejects(f.service.submitHiddenDraft(f.c,1,'battle',1,'pve','hidden_mix',{battleKey:d.battleKey,turn:1,revision:d.revision}),/暗微尘不足/);
  assert.equal(f.draft().submitted,0);assert.equal(f.stocks.fire_element_dust,2);
});

test('暗火火余烬在防御之后拆分伤害，后续预算守恒且每路蓄积量写入战报',async()=>{
  const trial=newHiddenTrial('magical_scholar'),[u,,enemy]=trial.units;
  u.magic=248;u.mp=10000;u.crit=0;enemy.critResist=100000;u.accuracy=100000;enemy.evasion=1;
  const attributes={constitution:33,spirit:35,strength:24,intelligence:41,agility:46,perception:58};
  const base=calculateDerivedStats(attributes),gear=virtualEquipmentStats(24,'large',base.physicalAttack,base.magicAttack);enemy.magicDefense=Math.floor(base.magicDefense+gear.magicDefense);
  const r=new CombatRules([u,enemy],1,[],{absorb:async()=>0,legacyEffects:()=>[],removeLegacy:async()=>{},extraAction:()=>{},swapThreat:async()=>{}},'',undefined,()=>.5);
  const mix=hiddenMix(['dark_element_dust','fire_element_dust','fire_element_dust','energy_ember']);
  const before=enemy.hp;
  await r.beforeAction(u);await executeHiddenCombat(r,u,'hidden_mix',{particles:[...mix.particles]}, {weapons:[],devices:[],payParticles:async()=>{},saveDevices:async()=>{}});
  const immediate=before-enemy.hp,ticks=hiddenState(u).ticks.filter(t=>t.kind==='damage');
  assert.equal(ticks.filter(t=>t.label==='余烬反应').length,4);assert.equal(r.log.filter(line=>line.includes('相余烬：另有')).length,2);
  let defense=enemy.magicDefense,expected=0;
  for(const branch of mix.branches){const body=Math.floor(hiddenBranchDamage(mix,branch,u.magic,defense));expected+=Math.floor(body*.6);if(branch.defenseDown)defense=enemy.magicDefense*(1-branch.defenseDown*branch.weight*branch.stateScale/100);}
  assert.equal(immediate,expected);
  const scheduled=ticks.reduce((n,t)=>n+Math.floor(t.amount),0);r.turn=2;await hiddenEndTurn(r);r.turn=3;await hiddenEndTurn(r);
  assert.equal(before-enemy.hp,immediate+scheduled);
});
