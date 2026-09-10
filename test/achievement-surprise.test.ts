import test from 'node:test';
import assert from 'node:assert/strict';
import {surpriseVictoryFacts,surpriseDefeatFacts} from '../src/game/achievement-surprise';
const member=(id=1):any=>({id,level:10,current_hp:100,hp_max:100,current_mp:20,mp_max:20,stamina_eligible:1,cooldowns:{__rules:{memory:{achievement:{damage:1000,healed:0,elements:[],receivedHits:0,actualHpLost:0}}}}});
const ev=(m:any)=>m.cooldowns.__rules.memory.achievement;
const colors=['火','冰','雷','风','光','暗'];
const cases:Record<number,(m:any,team:any[])=>void>={
 17:m=>{m.current_mp=0;},18:m=>{ev(m).actualHpLost=1000;},19:(m,t)=>{t.push(member(2));ev(m).damage=0;ev(m).healed=2000;},
 20:(m,t)=>{t.push({...member(2),current_hp:0},{...member(3),current_hp:0});},21:(m,t)=>{t.push(member(2),member(3));t.forEach(p=>p.current_mp=0);},
 22:m=>{ev(m).elements=colors;ev(m).receivedHits=30;},23:m=>{m.current_hp=1;m.current_mp=0;},24:m=>{ev(m).receivedHits=100;},
 25:(m,t)=>{t.push(member(2));ev(m).damage=0;ev(m).healed=500;ev(m).lowHeal=true;},26:(m,t)=>{t.push(member(2));m.current_hp=0;},
 27:(m,t)=>{t.push(member(2),member(3));t.forEach(p=>p.current_hp=1);},28:(m,t)=>{t.push(member(2));ev(m).elements=colors;ev(m).healed=500;}
};
for(const [n,prepare]of Object.entries(cases))test('EGG'+n+' 正式胜利快照逐项判定与无效来源排除',()=>{
 const m=member(),team=[m],boss={id:9,level:10,hp_max:1000,current_hp:0};prepare(m,team);const id='ACH_EGG'+n;
 assert.ok(surpriseVictoryFacts(m,team,[boss]).some(f=>f.metric===id));assert.ok(!surpriseVictoryFacts(m,team,[{...boss,level:9}]).some(f=>f.metric===id));assert.equal(surpriseVictoryFacts(m,team,[]).length,0);m.stamina_eligible=0;assert.equal(surpriseVictoryFacts(m,team,[boss]).length,0);
});
for(const n of [29,30,31,32,33,34])test('EGG'+n+' 正式战败快照逐项判定与无效来源排除',()=>{
 const m=member(),team=[m],boss={id:9,level:10,hp_max:1000,current_hp:1};m.current_hp=0;
 if(n===30)ev(m).elements=colors;if(n===31)ev(m).receivedHits=100;if(n===32)ev(m).actualHpLost=1000;if(n===33){team.push(member(2));ev(m).healed=2000;}if(n===34){ev(m).damage=0;ev(m).bossOpeningKnockout='target:9';boss.current_hp=1000;}
 const id='ACH_EGG'+n;assert.ok(surpriseDefeatFacts(m,team,[boss]).includes(id));assert.ok(!surpriseDefeatFacts(m,team,[{...boss,level:9}]).includes(id));m.current_hp=1;assert.equal(surpriseDefeatFacts(m,team,[boss]).length,0);
});
test('特殊组队不能以NPC、零贡献者凑人数；次数/比例差一点不满足',()=>{
 const m=member(),boss={id:9,level:10,hp_max:1000};ev(m).actualHpLost=999;assert.ok(!surpriseVictoryFacts(m,[m],[boss]).some(f=>f.metric==='ACH_EGG18'));
 const t=[m,member(2),member(3)];t.forEach(p=>p.current_hp=1);t[2].npc_code='npc';assert.ok(!surpriseVictoryFacts(m,t,[boss]).some(f=>f.metric==='ACH_EGG27'));delete t[2].npc_code;ev(t[2]).damage=0;assert.ok(!surpriseVictoryFacts(m,t,[boss]).some(f=>f.metric==='ACH_EGG27'));
});
