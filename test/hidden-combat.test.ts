import {talentCode} from '../src/game/talent.config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatRules } from '../src/game/combat-rule-registry';
import { executeHiddenCombat, hiddenEndTurn, hiddenReorder } from '../src/game/hidden-combat';
import { newHiddenTrial, advanceHiddenTrial } from '../src/game/hidden-trial';
import { hiddenState } from '../src/game/hidden-combat-state';
import { hiddenProfessions, hiddenSkills } from '../src/game/hidden-profession.config';
import { activeDeviceDefinitionByCode } from '../src/game/device.service';
import { inventorCapability } from '../src/game/hidden-device-protocol';
import { skillSpecialization, specializationOptions } from '../src/game/skill-specialization';
import { assertHiddenInstanceMutable } from '../src/game/combat-loadout-lock.service';

const fixture = (profession: typeof hiddenProfessions[number]['code']) => {
  const trial=newHiddenTrial(profession);trial.units[0].mp=10000;
  const r=new CombatRules(trial.units,1,[],{absorb:async()=>0,legacyEffects:()=>[],removeLegacy:async()=>{},extraAction:()=>{},swapThreat:async()=>{}},'',undefined,()=>.5);
  let particles=0;
  const ctx={weapons:[{id:1,name:'剑',type:'长剑',attack:100,magic:0,element:''},{id:2,name:'刀',type:'匕首',attack:100,magic:0,element:''}],devices:trial.devices,payParticles:async(p:string[])=>{particles+=p.length;},saveDevices:async()=>{}};
  return {r,u:trial.units[0],ally:trial.units[1],enemy:trial.units[2],ctx,particles:()=>particles};
};

test('器阵实例仅在所属职业战斗中锁定，非登记物品与战后仍可操作',async()=>{
  for (const profession of ['weapon_master','inventor']) {
    let fighting=true;
    const connection={execute:async(sql:string)=>[sql.includes('negotiation_participants')||sql.includes('player_opening_stories')?[]:sql.includes('player_advanced_professions')?[{profession_code:profession}]:sql.includes('player_hidden_profession_loadouts')?[{config_json:JSON.stringify({weapons:[7],devices:[7]})}]:fighting?[{found:1}]:[]]};
    await assert.rejects(assertHiddenInstanceMutable(connection as any,1,7),/战斗中不能出售/);
    await assertHiddenInstanceMutable(connection as any,1,8);
    fighting=false;await assertHiddenInstanceMutable(connection as any,1,7);
  }
});

test('调配治疗含持续回复按最终数值封顶，后续增益不能抬高已预留预算',async()=>{
  for(const roll of [.5,.99]) {
    const {r,u,ally,ctx}=fixture('magical_scholar');r.random=()=>roll;ally.hp=1;r.healingMultiplier=()=>10;
    await r.beforeAction(u);await executeHiddenCombat(r,u,'hidden_mix',{particles:['blood_residue','blood_residue','blood_residue','energy_ember'],target:ally.key},ctx);
    r.healingMultiplier=()=>20;r.add(u,'beat',300,10,u);
    for(let i=0;i<5;i++){r.turn++;await hiddenEndTurn(r);}
    assert.ok(ally.hp-1<=ally.hpMax*(roll===.99?.4:.24)+2);
    assert.ok(ally.hp>1);
  }
});
test('四种个人演练由真实战斗状态验收，账目闭合',async()=>{
  for(const profession of hiddenProfessions) { let trial=newHiddenTrial(profession.code);for(let i=0;i<(profession.code==='magical_scholar'||profession.code==='weapon_master'?4:5);i++)trial=await advanceHiddenTrial(profession.code,trial);assert.equal(trial.won,true,profession.name);assert.ok(trial.units[1].hp>0); }
});
test('全部16个主动技能可执行；材料、资源、MP及冷却只支付一次',async()=>{
  for(const skill of hiddenSkills) {
    const {r,u,ally,enemy,ctx,particles}=fixture(skill.profession);hiddenState(u).resource=100;await r.beforeAction(u);ally.hp=100;
    ctx.devices[2].energy=45;
    const choices:Record<string,any>={hidden_mix:{particles:['fire_element_dust','magic_unit']},hidden_kettle:{particles:['water_element_dust','blood_residue']},hidden_catalyst:{mode:'stable'},hidden_weapon_guard:{target:ally.key},hidden_weapon_strike:{weapons:[1]},hidden_weapon_combo:{weapons:[1,2]},hidden_weapon_finale:{weapons:[1,2]},hidden_overclock:{devices:[{id:2,skill:'simple_launcher_fire'}]},hidden_transfer:{donor:1,devices:[{id:3,skill:'weave_repair'}],target:ally.key},hidden_synergy:{devices:[{id:1,skill:'emergency_evasion'},{id:2,skill:'simple_launcher_fire'}]},hidden_debug:{devices:[{id:2,skill:'simple_launcher_fire'}],donor:3},hidden_order:{mode:'advance',target:ally.key},hidden_plan:{mode:'rescue',target:ally.key}};
    assert.equal(await executeHiddenCombat(r,u,skill.code,{target:enemy.key,...choices[skill.code]},ctx),true,skill.name);
    assert.ok(u.mp<10000);assert.ok(Number(u.cooldowns[skill.code])>0);assert.equal(particles(),['hidden_mix','hidden_kettle'].includes(skill.code)?2:0);
    const mp=u.mp,resource=hiddenState(u).resource;await assert.rejects(executeHiddenCombat(r,u,skill.code,choices[skill.code]??{},ctx));assert.equal(u.mp,mp);assert.equal(hiddenState(u).resource,resource);
  }
});
test('无效资源、器阵、异械、粒子在支付前拒绝',async()=>{
  for(const [profession,code,choice] of [['magical_scholar','hidden_mix',{particles:['fire_element_dust']}],['weapon_master','hidden_weapon_combo',{weapons:[1,1]}],['inventor','hidden_overclock',{devices:[{id:999,skill:'unknown'}]}],['tactician','hidden_order',{mode:'advance'}]] as const) {
    const {r,u,ctx,particles}=fixture(profession);const mp=u.mp;await assert.rejects(executeHiddenCombat(r,u,code,choice as any,ctx));assert.equal(mp,u.mp);assert.equal(particles(),0);
  }
});
test('异械能力协议接受未来设备声明，纯回流与未知机制不会被免费执行',()=>{
  assert.equal(inventorCapability(activeDeviceDefinitionByCode.get('recycling_hammer')!.skills[0]),undefined);
  assert.equal(inventorCapability({code:'future',name:'future',description:'',energyCost:40,cooldownTurns:1,targetScope:'enemy',inventor:{primary:'damage',fragments:[{kind:'damage',power:100}]}})?.primary,'damage');
  assert.equal(inventorCapability({code:'future',name:'future',description:'',energyCost:40,cooldownTurns:1,targetScope:'enemy',inventor:{primary:'damage',windup:2,fragments:[{kind:'damage',power:100}]}}),undefined);
});
test('接应在扣血之前形成护盾，调度不改变位置时只返还筹策',async()=>{
  const {r,u,ally,enemy,ctx}=fixture('tactician');await r.beforeAction(u);ally.hp=100;
  await executeHiddenCombat(r,u,'hidden_plan',{mode:'rescue',target:ally.key},ctx);
  await r.beforeAction(enemy);const damage=await r.incoming(enemy,ally,200,'',false,false);await r.take(ally,damage);
  assert.ok(ally.hp>0);assert.equal(hiddenState(u).resource,20);
  hiddenState(u).resource=30;delete u.cooldowns.hidden_order;await r.beforeAction(u);
  await executeHiddenCombat(r,u,'hidden_order',{mode:'advance',target:u.key},ctx);const mp=u.mp;r.turn++;
  const queue=[u,enemy];hiddenReorder(r,queue,t=>t);assert.equal(hiddenState(u).resource,30);assert.equal(u.mp,mp);assert.deepEqual(queue,[u,enemy]);
});
test('调配事故与后续持续伤害不产生友方攻击资源，中和只能处理自身事故',async()=>{
  const {r,u,ally,enemy,ctx}=fixture('magical_scholar');let calls=0;r.random=()=>calls++===0?0:.5;
  await r.beforeAction(u);await executeHiddenCombat(r,u,'hidden_mix',{particles:['dark_element_dust','wind_element_dust','magic_unit']},ctx);
  assert.ok(u.hp<u.hpMax);assert.equal(enemy.hp,enemy.hpMax);assert.ok(r.status(u,'armor_shatter'));assert.equal(r.status(u,'accuracy_down'),undefined);
  const resource=hiddenState(u).resource;r.turn++;await hiddenEndTurn(r);assert.equal(hiddenState(u).resource,resource);
  await r.beforeAction(u);await executeHiddenCombat(r,u,'hidden_neutralize',{},ctx);assert.ok(r.effects(u).filter(e=>e.debuff).length<=1);assert.ok(ally.hp>0);
});
test('紧急回避只闪避物理攻击；同轮追加驱动在支付前被拒绝',async()=>{
  const {r,u,enemy,ctx}=fixture('inventor');await r.beforeAction(u);
  await executeHiddenCombat(r,u,'hidden_overclock',{devices:[{id:1,skill:'emergency_evasion'}]},ctx);
  await r.beforeAction(enemy);assert.equal(await r.incoming(enemy,u,100,'火',true,true),100);assert.ok(r.status(u,'hidden_evade'));
  assert.equal(await r.incoming(enemy,u,100,'',false,false),0);assert.equal(r.status(u,'hidden_evade'),undefined);
  delete u.cooldowns.hidden_overclock;await r.beforeAction(u);const mp=u.mp,energy=ctx.devices[1].energy;
  await assert.rejects(executeHiddenCombat(r,u,'hidden_overclock',{devices:[{id:2,skill:'simple_launcher_fire'}]},ctx));assert.equal(u.mp,mp);assert.equal(ctx.devices[1].energy,energy);
});
test('落子多段共享单动作上限，消耗筹策后待命预案仍能在敌方行动返筹',async()=>{
  const {r,u,ally,enemy,ctx}=fixture('tactician');await r.beforeAction(u);await executeHiddenCombat(r,u,'hidden_mark',{target:enemy.key},ctx);
  await r.beforeAction(ally);for(let i=0;i<5;i++)await r.strike(ally,enemy,100,'',false,false,true,1,{skill:false});
  const mark=JSON.parse(r.status(enemy,'hidden_mark')!.data!);assert.equal(mark.charges,1);assert.equal(mark.spent,25);assert.equal(hiddenState(u).resource,30);
  await r.beforeAction(u);await executeHiddenCombat(r,u,'hidden_plan',{mode:'guard',target:ally.key},ctx);
  hiddenState(u).consumes=true;await r.beforeAction(enemy);r.turn=2;await r.incoming(enemy,ally,100,'',false,false);
  assert.equal(hiddenState(u).resource,50);
});
test('隐藏职业专精白名单与既有专精一致，协同受最终治疗预算约束',async()=>{
  for(const code of ['hidden_catalyst','hidden_overclock','hidden_transfer','hidden_debug']) {
    const options=specializationOptions({code,power:0,category:'utility',mana_cost:100,cooldown_turns:2});assert.deepEqual(options,['instant','efficient']);
  }
  const {r,u,ally,ctx}=fixture('inventor');hiddenState(u).resource=100;ally.hp=100;ctx.devices[2].energy=100;await r.beforeAction(u);
  u.castSpecialization=skillSpecialization({code:'hidden_synergy',tier:'中位',power:100,category:'magic',mana_cost:220,cooldown_turns:4},{potent:6});
  const before=ally.hp;await executeHiddenCombat(r,u,'hidden_synergy',{devices:[{id:3,skill:'weave_repair'},{id:1,skill:'emergency_evasion'}],target:ally.key},ctx);
  assert.ok(ally.hp-before<=ally.hpMax*.2);assert.ok(ally.hp>before);
});

test('H03 先核验生命再扣粒子，纯治疗调配不收费',async()=>{
  const {r,u,ctx,particles}=fixture('magical_scholar');u.opening={divines:[talentCode('H03')!],pve:true,weapons:[],crimson:0};u.hp=1;
  const mp=u.mp,resource=hiddenState(u).resource;
  await assert.rejects(executeHiddenCombat(r,u,'hidden_mix',{particles:['fire_element_dust','magic_unit']},ctx),/8%/);
  assert.equal(particles(),0);assert.equal(u.mp,mp);assert.equal(hiddenState(u).resource,resource);assert.equal(u.hp,1);
  await executeHiddenCombat(r,u,'hidden_mix',{particles:['water_element_dust','blood_residue'],target:u.key},ctx);
  assert.equal(particles(),2);assert.ok(u.hp>1);
});
