import { CombatRules, emptyRuleState, type RuleUnit } from './combat-rule-registry';
import { executeHiddenCombat, hiddenEndTurn, hiddenReorder } from './hidden-combat';
import { hiddenState, type HiddenDevice, type HiddenWeapon } from './hidden-combat-state';
import { activeDeviceDefinitionByCode } from './device.service';
import type { HiddenProfessionCode } from './hidden-profession.config';

export type HiddenTrial = { units: RuleUnit[]; devices: HiddenDevice[]; turn: number; log: string[]; particles: number; won: boolean; events: string[] };
const unit = (key: string, name: string, side: string, hpMax = 1000): RuleUnit => ({ key,name,side,level:30,boss:false,hp:hpMax,hpMax,mp:600,mpMax:600,attack:100,magic:100,defense:50,magicDefense:50,accuracy:1000,evasion:0,speed:100,crit:0,critResist:1000,critDamage:0,critReduction:1000,pierce:100,tenacity:100,state:emptyRuleState(),cooldowns:{},passives:[],mastery:{},resistance:{} });
const weapons: HiddenWeapon[] = [{id:1,name:'训练长剑',type:'长剑',attack:100,magic:0,element:''},{id:2,name:'训练匕首',type:'匕首',attack:100,magic:0,element:''},{id:3,name:'训练法杖',type:'法杖',attack:0,magic:100,element:'火'}];
export const newHiddenTrial = (profession: HiddenProfessionCode): HiddenTrial => {
  const student=unit('trial:student','你','ally'),dummy=unit('trial:dummy','护送药偶','ally'),foe=unit('trial:foe','耐久试靶','enemy',10000),ally=unit('trial:ally','防护者','ally');
  hiddenState(student).profession=profession;
  if(profession==='inventor') student.mp=student.mpMax=300;
  if(profession==='tactician') student.mp=student.mpMax=700;
  const devices=['emergency_evasion_module','simple_launcher','weave_repair_swarm'].map((code,index)=>({id:index+1,code,name:['回避模组','发射器','修复蜂群'][index],energy:100,max:100,skills:activeDeviceDefinitionByCode.get(code)!.skills}));
  return {units:[student,dummy,foe,ally],devices,turn:1,log:[],particles:0,won:false,events:[]};
};
/** NPC提供独立样本和借用装备；执行真实伤害、资源、护盾、队列规则，不写玩家战斗或背包。 */
export const advanceHiddenTrial = async (profession: HiddenProfessionCode, previous?: HiddenTrial): Promise<HiddenTrial> => {
  const trial:HiddenTrial=previous?structuredClone(previous):newHiddenTrial(profession);
  if(trial.won) throw new Error('个人演练已经验收。');
  const [student,dummy,foe,ally]=trial.units,round=trial.turn,lines:string[]=[];
  const r=new CombatRules(trial.units,round,lines,{absorb:async()=>0,legacyEffects:()=>[],removeLegacy:async()=>{},extraAction:()=>{},swapThreat:async()=>{}},'',undefined,()=>.5);
  const ctx={weapons,devices:trial.devices,payParticles:async(particles:string[])=>{trial.particles+=particles.length;},saveDevices:async()=>{}};
  const skill=async(code:string,choice:Parameters<typeof executeHiddenCombat>[3]={})=>executeHiddenCombat(r,student,code,choice,ctx);
  await r.beforeAction(student);
  if(profession==='magical_scholar') {
    if(round===1) await skill('hidden_mix',{particles:['fire_element_dust','magic_unit'],target:foe.key});
    if(round===2) await r.strike(student,foe,100,'',false,false,true,1,{skill:false});
    if(round===3) { let rolls=0;r.random=()=>rolls++===0?0:.5; await skill('hidden_mix',{particles:['dark_element_dust','wind_element_dust','magic_unit'],target:foe.key}); }
    if(round===4) { await skill('hidden_neutralize'); trial.events.push('完成事故中和'); }
  } else if(profession==='weapon_master') {
    if(round===1||round===3) await skill('hidden_weapon_strike',{weapons:[round===1?1:2],target:foe.key});
    if(round===2) { await skill('hidden_weapon_guard',{target:dummy.key}); await r.beforeAction(foe); await r.strike(foe,dummy,100,'',false,false,true,1,{skill:false}); trial.events.push('护阵实际吸收'); }
    if(round===4) { await skill('hidden_weapon_combo',{weapons:[1,2,3],target:foe.key}); trial.events.push('三器合锋'); }
  } else if(profession==='inventor') {
    // 原生按钮仍支付完整能量；只有第五轮使用职业驱动。
    if(round===1) { trial.devices[0].energy-=30; r.add(student,'hidden_evade',100,1,student); await r.beforeAction(foe); await r.strike(foe,student,100,'',false,false,true,1,{skill:false}); trial.events.push('避开试射'); }
    if(round===2) { trial.devices[1].energy-=60; await r.strike(student,foe,200,'',false,false,true,1,{skill:true}); trial.events.push('清除障碍'); dummy.hp-=300;r.add(dummy,'poison',1,2,foe,true); }
    if(round===3) { trial.devices[2].energy-=55;await r.restore(student,dummy,.18*dummy.hpMax);await r.dispel(student,dummy,true,1);trial.events.push('缝补药偶'); }
    if(round===4) { await r.strike(student,foe,100,'',false,false,true,1,{skill:false});dummy.hp-=200; }
    if(round===5) { await skill('hidden_transfer',{donor:1,devices:[{id:3,skill:'weave_repair'}],target:dummy.key});trial.events.push('转供即刻修复'); }
  } else {
    if(round===1) { await skill('hidden_mark',{target:foe.key});await r.beforeAction(ally);await r.strike(ally,foe,100,'',false,false,true,1,{skill:false}); }
    if(round===2) await skill('hidden_order',{target:ally.key,mode:'advance'});
    if(round===3) {
      const queue=hiddenReorder(r,[foe,dummy,ally,student],u=>u); if(queue[0]!==ally) throw new Error('教学调度未实际改变队列。');trial.events.push('调度实际前移');
      await skill('hidden_plan',{target:dummy.key,mode:'guard'});await r.beforeAction(foe);await r.strike(foe,dummy,100,'',false,false,true,1,{skill:false});trial.events.push('预案实际触发');
    }
    if(round>=4) await r.strike(student,foe,100,'',false,false,true,1,{skill:false});
  }
  await hiddenEndTurn(r);r.end();
  for(const u of trial.units) for(const [key,value] of Object.entries(u.cooldowns)) if(!key.startsWith('__')&&typeof value==='number') u.cooldowns[key]=Math.max(0,value-1);
  const last=profession==='magical_scholar'||profession==='weapon_master'?4:5;
  if(student.hp<=0||dummy.hp<=0) throw new Error('演练未能保护药偶，请重新开始。');
  trial.log=lines;trial.turn++;
  trial.won=round===last;
  if(trial.won) {
    const valid=profession==='magical_scholar'?student.mp===145&&trial.particles===5:profession==='weapon_master'?student.mp===90&&hiddenState(student).resource===20:profession==='inventor'?student.mp===190&&trial.devices.map(d=>d.energy).join(',')==='30,40,20':student.mp===310&&trial.events.includes('调度实际前移')&&trial.events.includes('预案实际触发');
    if(!valid) throw new Error('演练账目与验收条件不一致，尚不能交回记录。');
    trial.log.push(`验收：MP ${student.mp} · ${hiddenState(student).resource}专属资源 · 药偶 ${dummy.hp}/${dummy.hpMax} HP。`);
  }
  return trial;
};
