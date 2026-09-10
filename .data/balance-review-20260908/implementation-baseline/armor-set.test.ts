import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { armorSetFromRows, armorSetsFor } from '../src/game/armor-set';
import { correctedHitChance, correctedCritChance, correctedCritBonus, resolveStrike, strikeCorrections } from '../src/game/combat-math';
import { equipmentSetSummary } from '../src/game/equipment-set-summary';
import { epicLoadoutFromRows } from '../src/game/epic-equipment.service';
import { panelPercentKeys, calculatePanelStats } from '../src/game/panel-stat-formula';
import { calculateDerivedStats } from '../src/game/constants';
import { newHiddenTrial } from '../src/game/hidden-trial';
import { CombatRules } from '../src/game/combat-rule-registry';

const slots = ['shoulder','upper','waist','lower','feet'];
const rows = (name: string, count: number, epic = '') => slots.slice(0,count).map(slot=>({slot,weapon_type:name,effect_json:{epicSetCode:epic}}));
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);

test('只统计五个防具槽：2件未激活，3/4件低档，5件覆盖低档，混穿及重复槽不凑件',()=>{
  for (const name of ['布甲','皮甲','轻甲','重甲','板甲']) {
    assert.equal(armorSetFromRows(rows(name,2)),null);
    for (const count of [3,4,5]) {
      const set=armorSetFromRows(rows(name,count))!;assert.equal(set.count,count);assert.equal(set.tier,count===5?5:3);
    }
  }
  assert.equal(armorSetFromRows([...rows('布甲',2),{slot:'weapon',weapon_type:'布甲'},{slot:'ring',weapon_type:'布甲'},{slot:'device',weapon_type:'布甲'},{slot:'头肩',weapon_type:'布甲'}]),null);
  assert.equal(armorSetFromRows(slots.map((slot,i)=>({slot,weapon_type:['布甲','布甲','轻甲','轻甲','板甲'][i]}))),null);
  assert.equal(armorSetFromRows(['头肩','上装','腰部','下装','脚部'].map(slot=>({slot,weapon_type:'板甲'})))?.tier,5);
});

test('轻甲覆盖全部15项战斗面板；重甲和板甲生命档位独立于品质',()=>{
  const base=calculateDerivedStats({constitution:100,spirit:100,strength:100,intelligence:100,agility:100,perception:100});
  assert.equal(Object.keys(base).length,15);
  for (const [count,pct] of [[3,3],[5,5]]) {
    const set=armorSetFromRows(rows('轻甲',count))!;
    assert.deepEqual(Object.keys(set.panelPercent).sort(),Object.values(panelPercentKeys).sort());
    const result=calculatePanelStats(base,{}, {},[set.panelPercent]);
    for(const key of Object.keys(base) as Array<keyof typeof base>) assert.equal(result[key],Math.floor(base[key]*(1+pct/100)),key);
  }
  for (const name of ['板甲','重甲']) for(const count of [3,5]) {
    const set=armorSetFromRows(rows(name,count).map(row=>({...row,quality:1,rarity:'普通'})))!;
    assert.equal(set.panelPercent.hpPct,count===5?20:10);
    assert.equal(set.critAvoidanceCorrectionPct,name==='板甲'?(count===5?33:16):0);
  }
});

test('概率按用户例子计算：补足未命中部分、削减最终命中、只削减额外暴伤',()=>{
  for(const [count,rate] of [[3,.16],[5,.33]]) {
    const cloth={armorSet:armorSetFromRows(rows('布甲',count))}, plate={armorSet:armorSetFromRows(rows('板甲',count))};
    close(correctedHitChance(.6,strikeCorrections(cloth)),.6+.4*rate);
    close(correctedHitChance(.6,strikeCorrections(undefined,cloth)),.6*(1-rate));
    close(correctedHitChance(.6,strikeCorrections(cloth,cloth)),(.6+.4*rate)*(1-rate));
    close(correctedCritChance(.5,strikeCorrections(undefined,plate)),.5*(1-rate));
    close(1+correctedCritBonus(.5,strikeCorrections(undefined,plate)),1+.5*(1-rate));
  }
});

test('基础直击真实掷骰：命中补偿、暴免、强制暴击的额外暴伤抗性',()=>{
  const original=Math.random;
  const strike=(values:number[],source?:any,target?:any,forceCrit=false)=>{
    Math.random=()=>values.shift()??.99;
    return resolveStrike(100,100,60,40,50,50,50,50,false,forceCrit,0,0,1,strikeCorrections(source,target));
  };
  try {
    const cloth={armorSet:armorSetFromRows(rows('布甲',3))},plate={armorSet:armorSetFromRows(rows('板甲',3))};
    assert.equal(strike([.65]).hit,false);assert.equal(strike([.65,.99],cloth).hit,true);
    assert.equal(strike([.1,.45]).crit,true);assert.equal(strike([.1,.45],undefined,plate).crit,false);
    assert.equal(strike([.1],undefined,plate,true).damage,71);
    assert.equal(strike([.1],undefined,undefined,true).damage,75);
  } finally {Math.random=original;}
});

test('共享战斗引擎确实读取攻守双方套装，未命中不扣血，暴抗仅削减暴击奖励',async()=>{
  const trial=newHiddenTrial('tactician'),[source,,target]=trial.units;
  source.attack=100;source.accuracy=60;source.crit=50;source.critDamage=50;source.passives=[];
  target.defense=100;target.evasion=40;target.critResist=50;target.critReduction=50;target.passives=[];
  source.cooldowns={};target.cooldowns={};source.modifiers={};target.modifiers={};
  const r=new CombatRules([source,target],1,[],{absorb:async()=>0,legacyEffects:()=>[],removeLegacy:async()=>{},extraAction:()=>{},swapThreat:async()=>{}},'',undefined,()=>.65);
  const initial=target.hp;
  assert.equal(await r.strike(source,target,100,'',false,false,false,1,{skill:false}),false);assert.equal(target.hp,initial);
  source.armorSet=armorSetFromRows(rows('皮甲',3));
  assert.equal(await r.strike(source,target,100,'',false,false,false,1,{skill:false}),true);assert.ok(target.hp<initial);
  source.armorSet=null;target.armorSet=armorSetFromRows(rows('布甲',3));r.random=()=>.55;
  assert.equal(await r.strike(source,target,100,'',false,false,false,1,{skill:false}),false);
  target.armorSet=armorSetFromRows(rows('板甲',3));let rolls=[.1,.1,.5];r.random=()=>rolls.shift()??.5;
  const before=target.hp;await r.strike(source,target,100,'',false,false,false,1,{skill:false});assert.equal(before-target.hp,71);
});

test('批量装备读取区分角色，空列表不发SQL',async()=>{
  const c={execute:async()=>[[...rows('板甲',5).map(row=>({...row,character_id:1})),...rows('皮甲',2).map(row=>({...row,character_id:2}))]]};
  const sets=await armorSetsFor(c as any,[1,2,3]);assert.equal(sets.get(1)?.tier,5);assert.equal(sets.get(2),null);assert.equal(sets.get(3),null);
  assert.equal((await armorSetsFor({execute:()=>{throw new Error('不应查询');}} as any,[])).size,0);
});

test('装备摘要同时显示甲类与史诗；5件甲类只显示高档，史诗保留两档；未激活不展示',()=>{
  const gear=rows('板甲',5,'mountainheart_regalia');
  assert.equal(epicLoadoutFromRows(gear).setCount,5);
  const summary=equipmentSetSummary(gear);assert.equal(summary.length,2);assert.match(summary[0].title,/5件效果/);assert.equal(summary[0].effects.length,1);assert.equal(summary[1].effects.length,2);
  assert.match(summary[0].effects[0],/33%/);assert.match(summary[0].effects[0],/20%/);
  assert.equal(equipmentSetSummary(rows('板甲',2,'mountainheart_regalia')).length,0);
  assert.equal(epicLoadoutFromRows([...gear.slice(0,2),{...gear[2],slot:'weapon'},{...gear[2],slot:'头肩'}]).setCount,2);
});

test('史诗3件岩压可积累到3层，只有5件才触发断层壁障',async()=>{
  const source=ts.createSourceFile('adventure.ts',readFileSync(new URL('../src/game/adventure.service.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
  let declaration:ts.VariableDeclaration|undefined;
  const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='triggerEpicIncomingSkill')declaration=node;ts.forEachChild(node,visit);};visit(source);assert.ok(declaration?.initializer);
  const compiled=ts.transpileModule(`const trigger=${declaration.initializer.getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  for(const count of [3,5]) {
    let shields=0;const session={turn_no:1,combat_id:'test'},recipient={id:1,hp_max:1000,cooldowns:{} as Record<string,number>};
    const trigger=new Function('jsonObject','session','hasEpicWeaponEffect','epicFor','epicSetActive','grantLifeShield','applyAdvancedStatus','combatUnitLabel','connection','log',`${compiled};return trigger;`)(
      (v:unknown)=>v,session,()=>false,()=>({}),(_:unknown,code:string,pieces:number)=>code==='mountainheart_regalia'&&count>=pieces,
      async()=>{shields++;return {added:120};},async()=>{},()=>'',{},[]
    );
    for(let turn=1;turn<=3;turn++){session.turn_no=turn;await trigger(recipient);await trigger(recipient);}
    assert.equal(shields,count===5?1:0);assert.equal(recipient.cooldowns.epic_mountain_pressure_stacks,count===5?0:3);
  }
});
