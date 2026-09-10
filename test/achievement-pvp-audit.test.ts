import test from 'node:test';
import assert from 'node:assert/strict';
import {recordPvpAchievements} from '../src/game/achievement-pvp';
import {takeAchievementEvents} from '../src/game/achievement-events';
import {pvpAchievementDefinitions} from '../src/game/achievement-pvp.config';
const run=async(options:{winner?:number;level?:number;enemyLevel?:number;hp?:number;turn?:number;state?:string;damage?:number;sameIdentity?:boolean}={})=>{
 const winner=options.winner??1;
 const actors=[{id:1,qq_user_id:'one',level:options.level??10,hp_max:100,current_region_id:7},{id:2,qq_user_id:options.sameIdentity?'one':'two',level:options.enemyLevel??10,hp_max:100,current_region_id:7}];
 const evidence={__rules:{memory:{achievement:{damage:options.damage??10}}}};
 const battle={state:options.state??(winner===1?'attacker_win':'defender_win'),attacker_character_id:1,defender_character_id:2,attacker_cooldowns:evidence,defender_cooldowns:evidence,attacker_hp:options.hp??10,defender_hp:options.hp??10,turn_no:options.turn??11};
 const c={execute:async(sql:string)=>[sql.includes('player_pvp_battle_sessions')?[battle]:actors]};
 await recordPvpAchievements(c as any,'matrix',winner);return takeAchievementEvents(c as any);
};
for(const d of pvpAchievementDefinitions)test(d.id+' 正式PVP结算条件',async()=>{
 const n=Number(d.id.slice(-2)),winner=n>=10&&n<=12?2:1;
 const events=await run({winner,enemyLevel:n===21||n===22?12:10});
 const event=events.find(e=>e.characterId===winner)!;
 const fact=event.facts.find(f=>f.metric===d.id);assert.ok(fact);
 if([7,8,9].includes(n))assert.equal(fact.distinct,'two');
 if([16,17,18].includes(n))assert.match(fact.distinct!,/^\d{4}-\d{2}-\d{2}$/);
 if(n===25)assert.equal(fact.distinct,'7');
 if(n>=2&&![16,17,18].includes(n))assert.ok(!events.find(e=>e.characterId!==winner)?.facts.some(f=>f.metric===d.id));
 assert.match(event.key,/^pvp:[a-f0-9]{64}:\d{4}-\d{2}-\d{2}$/);
});
test('PVP排除未结束、逃跑、零伤害、同身份、过低等级，检查精确边界',async()=>{
 for(const state of ['active','escaped','ambush'])assert.deepEqual(await run({state}),[]);
 assert.deepEqual(await run({damage:0}),[]);assert.deepEqual(await run({sameIdentity:true}),[]);
 assert.ok(!(await run({enemyLevel:7})).some(e=>e.characterId===1));
 const has=async(metric:string,options:any)=>!!(await run(options)).find(e=>e.characterId===1)?.facts.some(f=>f.metric===metric);
 assert.equal(await has('ACH_P23',{hp:10}),true);assert.equal(await has('ACH_P23',{hp:11}),false);assert.equal(await has('ACH_P23',{hp:0}),false);
 assert.equal(await has('ACH_P22',{enemyLevel:11}),false);assert.equal(await has('ACH_P22',{enemyLevel:12}),true);
 assert.equal(await has('ACH_P24',{turn:10}),false);assert.equal(await has('ACH_P24',{turn:11}),true);
});
